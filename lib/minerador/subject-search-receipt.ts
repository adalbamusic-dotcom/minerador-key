import { buildGoogleAdsVolumeMetricPatch, type GoogleAdsVolumeMeasurement } from "./google-ads-volume.ts";
import { isValidGoogleAdsDemandMeasurement } from "./google-ads-demand.ts";
import { isKeywordPublished } from "./keyword-lifecycle.ts";
import { resolveDeclaredPrincipal, resolveKeywordSubject } from "./keyword-subject.ts";

/**
 * RECIBO DA PESQUISA POR ASSUNTO (SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`,
 * itens 7 e 8; migration M-A; ADR-020, adendo 2026-10-13).
 *
 * O que o Google Ads devolveu numa execução da Pesquisa por Assunto fica num
 * recibo do SERVIDOR (`minerador_subject_search_receipts`, só inclusões). O
 * import das sustentações lê esse recibo pelo `searchId` (= o
 * `operationRequestId` da pesquisa) e, para a keyword NOVA — ou existente sem
 * medição válida, não publicada e fora do plano —, grava a média mensal como
 * Volume validado, no formato de sempre (`buildGoogleAdsVolumeMetricPatch`) e
 * com proveniência (`origin: subject_search`, `measurementKind:
 * keyword_ideas`, `receiptRef`). O navegador nunca é fonte de volume (Q11).
 *
 * Regras (ADR-020, adendo 2026-10-13):
 *   - média ausente = nada é gravado (ausência continua ausência, item 6);
 *   - medição válida existente nunca é sobrescrita;
 *   - keyword publicada não recebe volume pelo import;
 *   - keyword que carrega Assunto ou marca de principal do plano não recebe
 *     volume pelo import (a trava D1-ter só muda por medição explícita).
 *
 * Domínio puro: sem banco, sem rede, sem credencial.
 */

export const SUBJECT_SEARCH_RECEIPT_TABLE = "minerador_subject_search_receipts" as const;
/** Colunas estreitas da leitura do import. */
export const SUBJECT_SEARCH_RECEIPT_COLUMNS = "marca_id,operation_request_id,batch_id,actor_id,subject_keyword_id,phrase,provider,provider_version,targeting,google_ads_request_ids,executed_at,candidates,candidate_count" as const;
export const SUBJECT_SEARCH_RECEIPT_MAX_CANDIDATES = 600;

export const SUBJECT_SEARCH_VOLUME_ORIGIN = "subject_search" as const;
export const SUBJECT_SEARCH_VOLUME_MEASUREMENT_KIND = "keyword_ideas" as const;

export type SubjectSearchReceiptCandidate = {
  keyword: string;
  averageMonthlySearches: number | null;
  competition: string | null;
  competitionIndex: number | null;
  averageCpcMicros: string | null;
  lowTopOfPageBidMicros: string | null;
  highTopOfPageBidMicros: string | null;
  currencyCode: string | null;
};

export type SubjectSearchReceiptTargeting = {
  language: string;
  geoTargetConstants: string[];
  keywordPlanNetwork: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS";
  includeAdultKeywords: boolean;
};

/** O que a execução sabe; a marca e o ator entram no servidor. */
export type SubjectSearchReceiptDraft = {
  operationRequestId: string;
  batchId: string | null;
  subjectKeywordId: string | null;
  phrase: string;
  providerVersion: string;
  targeting: SubjectSearchReceiptTargeting;
  googleAdsRequestIds: string[];
  executedAt: string;
  /** Pela keyword normalizada do import (`normalizeKeyword`). */
  candidates: Record<string, SubjectSearchReceiptCandidate>;
};

export type SubjectSearchReceipt = SubjectSearchReceiptDraft & {
  brandId: string;
  actorId: string;
  candidateCount: number;
};

/** O desfecho da gravação, devolvido à tela e ao MCP (aditivo na resposta da execução). */
export type SubjectSearchReceiptOutcome =
  | { status: "recorded" }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; reason: string };

export const SUBJECT_SEARCH_RECEIPT_TEXTS = {
  unavailable: "Recibo da pesquisa indisponível (a atualização do banco M-A ainda não foi aplicada): as sustentações entram sem volume e o Volume é medido pelo botão \"Volume\" do Processador, como antes.",
  failed: "O recibo desta pesquisa não pôde ser gravado: as sustentações entram sem volume e o Volume é medido pelo botão \"Volume\" do Processador.",
} as const;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown, max = 40): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function readCandidate(value: unknown): SubjectSearchReceiptCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keyword = text(item.keyword, 400);
  if (!keyword) return null;
  const average = finiteOrNull(item.averageMonthlySearches);
  return {
    keyword,
    averageMonthlySearches: average !== null && average >= 0 ? average : null,
    competition: stringOrNull(item.competition),
    competitionIndex: finiteOrNull(item.competitionIndex),
    averageCpcMicros: stringOrNull(item.averageCpcMicros),
    lowTopOfPageBidMicros: stringOrNull(item.lowTopOfPageBidMicros),
    highTopOfPageBidMicros: stringOrNull(item.highTopOfPageBidMicros),
    currencyCode: stringOrNull(item.currencyCode, 8),
  };
}

/**
 * O rascunho do recibo a partir da execução. Entram só as candidatas que o
 * Google Ads mediu (`googleAds` presente), pela chave normalizada, até 600.
 */
export function buildSubjectSearchReceiptDraft(input: {
  operationRequestId: string;
  batchId?: string | null;
  subjectKeywordId: string | null;
  phrase: string;
  providerVersion: string | null;
  targeting: SubjectSearchReceiptTargeting;
  googleAdsRequestIds: ReadonlyArray<string | null>;
  executedAt: string;
  candidates: ReadonlyArray<{ keyword: string; normalizedKeyword: string; googleAds: Omit<SubjectSearchReceiptCandidate, "keyword"> | null }>;
}): SubjectSearchReceiptDraft {
  const candidates: Record<string, SubjectSearchReceiptCandidate> = {};
  for (const candidate of input.candidates) {
    if (Object.keys(candidates).length >= SUBJECT_SEARCH_RECEIPT_MAX_CANDIDATES) break;
    if (!candidate.googleAds || !candidate.normalizedKeyword || candidates[candidate.normalizedKeyword]) continue;
    const read = readCandidate({ ...candidate.googleAds, keyword: candidate.keyword });
    if (read) candidates[candidate.normalizedKeyword] = read;
  }
  return {
    operationRequestId: input.operationRequestId,
    batchId: input.batchId || null,
    subjectKeywordId: input.subjectKeywordId,
    phrase: text(input.phrase, 200),
    providerVersion: text(input.providerVersion, 20) || "desconhecida",
    targeting: {
      language: input.targeting.language,
      geoTargetConstants: [...input.targeting.geoTargetConstants],
      keywordPlanNetwork: input.targeting.keywordPlanNetwork,
      includeAdultKeywords: input.targeting.includeAdultKeywords,
    },
    googleAdsRequestIds: [...new Set(input.googleAdsRequestIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map(id => id.trim().slice(0, 200)))],
    executedAt: input.executedAt,
    candidates,
  };
}

/** A linha do INSERT (só o servidor inclui; a marca e o ator são os da rota e da sessão). */
export function subjectSearchReceiptInsertRow(receipt: SubjectSearchReceipt) {
  return {
    marca_id: receipt.brandId,
    operation_request_id: receipt.operationRequestId,
    batch_id: receipt.batchId,
    actor_id: receipt.actorId,
    subject_keyword_id: receipt.subjectKeywordId,
    phrase: receipt.phrase,
    provider: "google_ads",
    provider_version: receipt.providerVersion,
    targeting: receipt.targeting,
    google_ads_request_ids: receipt.googleAdsRequestIds,
    executed_at: receipt.executedAt,
    candidates: receipt.candidates,
    candidate_count: Object.keys(receipt.candidates).length,
  };
}

/** Leitura defensiva da linha. Linha malformada = sem recibo (nada é gravado como volume). */
export function readSubjectSearchReceiptRow(row: unknown): SubjectSearchReceipt | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  if (typeof value.marca_id !== "string" || typeof value.operation_request_id !== "string") return null;
  if (value.provider !== "google_ads") return null;
  const executedAt = typeof value.executed_at === "string" && Number.isFinite(Date.parse(value.executed_at)) ? new Date(Date.parse(value.executed_at)).toISOString() : null;
  if (!executedAt) return null;
  const rawCandidates = value.candidates && typeof value.candidates === "object" && !Array.isArray(value.candidates) ? value.candidates as Record<string, unknown> : null;
  if (!rawCandidates) return null;
  const candidates: Record<string, SubjectSearchReceiptCandidate> = {};
  for (const [key, candidate] of Object.entries(rawCandidates)) {
    const read = readCandidate(candidate);
    if (key && read) candidates[key] = read;
  }
  const targeting = value.targeting && typeof value.targeting === "object" && !Array.isArray(value.targeting) ? value.targeting as Record<string, unknown> : {};
  return {
    brandId: value.marca_id,
    operationRequestId: value.operation_request_id,
    batchId: typeof value.batch_id === "string" ? value.batch_id : null,
    actorId: typeof value.actor_id === "string" ? value.actor_id : "",
    subjectKeywordId: typeof value.subject_keyword_id === "string" ? value.subject_keyword_id : null,
    phrase: text(value.phrase, 200),
    providerVersion: text(value.provider_version, 20) || "desconhecida",
    targeting: {
      language: typeof targeting.language === "string" ? targeting.language : "",
      geoTargetConstants: Array.isArray(targeting.geoTargetConstants) ? targeting.geoTargetConstants.filter((item): item is string => typeof item === "string") : [],
      keywordPlanNetwork: targeting.keywordPlanNetwork === "GOOGLE_SEARCH_AND_PARTNERS" ? "GOOGLE_SEARCH_AND_PARTNERS" : "GOOGLE_SEARCH",
      includeAdultKeywords: targeting.includeAdultKeywords === true,
    },
    googleAdsRequestIds: Array.isArray(value.google_ads_request_ids) ? value.google_ads_request_ids.filter((item): item is string => typeof item === "string") : [],
    executedAt,
    candidates,
    candidateCount: Object.keys(candidates).length,
  };
}

/**
 * A tabela ainda não existe (M-A não aplicada): Postgres `42P01` ou PostgREST
 * `PGRST205` (tabela fora do cache do esquema). É o caso "sem recibo", não falha.
 */
export function isSubjectSearchReceiptTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  const code = typeof value.code === "string" ? value.code : "";
  if (code === "42P01" || code === "PGRST205") return true;
  const message = typeof value.message === "string" ? value.message : "";
  return /minerador_subject_search_receipts/.test(message) && /(does not exist|could not find|schema cache)/i.test(message);
}

/* ------------------------------ volume no import ------------------------------ */

export type SubjectSearchVolumeExisting = {
  status: string | null;
  volume_search: number | null;
  results_allintitle: number | null;
  kgr_score: number | null;
  volume_source: string | null;
  analise_semantica: Record<string, unknown> | null;
};

export type SubjectSearchVolumePatch = {
  volume_search: number;
  volume_source: "google_ads";
  kgr_score: number | null;
  analise_semantica: Record<string, unknown>;
};

export type SubjectSearchVolumeSkipCode = "no_candidate" | "no_average" | "published" | "plan_keyword" | "already_measured";

export const SUBJECT_SEARCH_VOLUME_SKIP_REASONS: Record<SubjectSearchVolumeSkipCode, string> = {
  no_candidate: "A pesquisa não trouxe a média desta keyword: o Volume é medido pelo botão \"Volume\".",
  no_average: "O Google Ads devolveu a keyword sem média mensal: nada foi gravado como volume (ausência não vira zero).",
  published: "Keyword publicada: o volume não muda pelo import.",
  plan_keyword: "Keyword do plano (carrega Assunto ou é principal declarada): meça pelo botão \"Volume\" — a trava só muda por medição explícita.",
  already_measured: "Já tem Volume medido: a medição existente não é sobrescrita.",
};

export type SubjectSearchVolumeDecision =
  | { ok: true; patch: SubjectSearchVolumePatch; value: number; measuredAt: string }
  | { ok: false; code: SubjectSearchVolumeSkipCode; reason: string };

function skip(code: SubjectSearchVolumeSkipCode): SubjectSearchVolumeDecision {
  return { ok: false, code, reason: SUBJECT_SEARCH_VOLUME_SKIP_REASONS[code] };
}

/** A linha nova do import: nada medido antes. */
export const SUBJECT_SEARCH_VOLUME_FRESH: SubjectSearchVolumeExisting = {
  status: "bruto",
  volume_search: null,
  results_allintitle: null,
  kgr_score: null,
  volume_source: null,
  analise_semantica: {},
};

/**
 * O volume que o recibo dá a uma keyword, ou o motivo de não dar. O patch é o
 * de `buildGoogleAdsVolumeMetricPatch` (o predicado do Volume validado lê como
 * sempre), com a proveniência da pesquisa em `volume_measurement`.
 */
export function subjectSearchVolumeDecision(receipt: SubjectSearchReceipt, normalizedKeyword: string, existing: SubjectSearchVolumeExisting): SubjectSearchVolumeDecision {
  const candidate = receipt.candidates[normalizedKeyword];
  if (!candidate) return skip("no_candidate");
  if (candidate.averageMonthlySearches === null || candidate.averageMonthlySearches < 0) return skip("no_average");
  const semantic = existing.analise_semantica || {};
  if (existing.status === "publicado" || isKeywordPublished({ status: existing.status, semantic })) return skip("published");
  if (resolveKeywordSubject(semantic).declared || resolveDeclaredPrincipal(semantic).mark) return skip("plan_keyword");
  if (isValidGoogleAdsDemandMeasurement(semantic.volume_measurement)) return skip("already_measured");

  const measurement: GoogleAdsVolumeMeasurement = {
    keyword: candidate.keyword,
    normalizedKeyword,
    canonicalKeyword: candidate.keyword,
    closeVariants: [],
    normalizedCloseVariants: [],
    matchedRequestedKeywords: [],
    averageMonthlySearches: candidate.averageMonthlySearches,
    monthlySearchVolumes: [],
    competition: candidate.competition,
    competitionIndex: candidate.competitionIndex,
    lowTopOfPageBidMicros: candidate.lowTopOfPageBidMicros,
    highTopOfPageBidMicros: candidate.highTopOfPageBidMicros,
    averageCpcMicros: candidate.averageCpcMicros,
    currencyCode: candidate.currencyCode,
    timeZone: null,
    targeting: receipt.targeting,
    customerId: "",
    provider: "google_ads",
    providerVersion: receipt.providerVersion as GoogleAdsVolumeMeasurement["providerVersion"],
    measuredAt: receipt.executedAt,
    keywordId: "",
    operationRequestId: receipt.operationRequestId,
    googleAdsRequestId: receipt.googleAdsRequestIds[0] ?? null,
  };
  const base = buildGoogleAdsVolumeMetricPatch({
    status: existing.status ?? undefined,
    volume_search: existing.volume_search,
    results_allintitle: existing.results_allintitle,
    kgr_score: existing.kgr_score,
    volume_source: existing.volume_source,
    analise_semantica: { ...semantic },
  }, measurement);
  if (!base || typeof base.volume_search !== "number" || !base.analise_semantica) return skip("no_average");
  const volumeMeasurement = { ...(base.analise_semantica.volume_measurement as Record<string, unknown> || {}) };
  const analise = {
    ...base.analise_semantica,
    volume_measurement: {
      ...volumeMeasurement,
      // Sem conta exposta: o recibo não guarda o customer id.
      accountRef: null,
      origin: SUBJECT_SEARCH_VOLUME_ORIGIN,
      measurementKind: SUBJECT_SEARCH_VOLUME_MEASUREMENT_KIND,
      receiptRef: { operationRequestId: receipt.operationRequestId, ...(receipt.batchId ? { batchId: receipt.batchId } : {}) },
    },
  };
  return {
    ok: true,
    value: base.volume_search,
    measuredAt: receipt.executedAt,
    patch: { volume_search: base.volume_search, volume_source: "google_ads", kgr_score: base.kgr_score ?? null, analise_semantica: analise },
  };
}

/** A medição gravada veio da Pesquisa por Assunto? (para a tela dizer a origem e o recibo). */
export function readSubjectSearchVolumeProvenance(measurement: unknown): { operationRequestId: string; batchId: string | null } | null {
  if (!measurement || typeof measurement !== "object" || Array.isArray(measurement)) return null;
  const value = measurement as Record<string, unknown>;
  if (value.origin !== SUBJECT_SEARCH_VOLUME_ORIGIN) return null;
  const ref = value.receiptRef && typeof value.receiptRef === "object" && !Array.isArray(value.receiptRef) ? value.receiptRef as Record<string, unknown> : null;
  if (!ref || typeof ref.operationRequestId !== "string") return null;
  return { operationRequestId: ref.operationRequestId, batchId: typeof ref.batchId === "string" ? ref.batchId : null };
}
