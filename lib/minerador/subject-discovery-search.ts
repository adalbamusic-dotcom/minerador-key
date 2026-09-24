import { z } from "zod";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  buildSerpOrganicDigest,
  sameSerpCacheLens,
  serpCacheLensLabel,
  type SerpCacheLens,
  type SerpCacheQuery,
  type SerpOrganicDigest,
} from "../editorial/serp-cache.ts";
import { GOOGLE_ADS_DISCOVERY_LANGUAGES, resolveDiscoveryTargeting } from "./google-ads-discovery-catalog.ts";
import { normalizeKeyword } from "./keyword-import-core.ts";
import { normalizeKeywordSubjectNote, resolveKeywordSubject } from "./keyword-subject.ts";
import { validateSubjectDestination, SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE, type SubjectDestinationAcceptedCode, type SubjectDestinationRefusedCode } from "./subject-destination.ts";
import {
  DATAFORSEO_LABS_LANGUAGE_CODE,
  DATAFORSEO_LABS_LOCATION_CODE,
  DATAFORSEO_LABS_RESEARCH_ENDPOINTS,
  DataForSeoLabsResearchError,
  type DataForSeoLabsEstimate,
  type DataForSeoLabsResearchRequest,
  type DataForSeoLabsResearchResult,
} from "./dataforseo-labs-keyword-research-core.ts";
import {
  SUBJECT_DISCOVERY_CAPS,
  SUBJECT_DISCOVERY_NOTICES,
  SUBJECT_DISCOVERY_SOURCES,
  SUBJECT_DISCOVERY_SOURCE_LABELS,
  authorizeSubjectDiscoveryPlan,
  buildSubjectDiscoveryPlan,
  createSubjectDiscoveryBudget,
  listSubjectDiscoveryPaidCalls,
  subjectDiscoveryCallId,
  subjectDiscoveryLedgerKey,
  type SubjectDiscoveryAdsTargeting,
  type SubjectDiscoveryBudget,
  type SubjectDiscoveryLedgerEndpoint,
  type SubjectDiscoveryPlan,
  type SubjectDiscoverySource,
} from "./subject-discovery-plan.ts";

/**
 * PESQUISA POR ASSUNTO — orquestração do plano e da execução
 * (SDD `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F1b.1 a F1b.8).
 *
 * `mode: "plan"` não paga nada e não materializa credencial: lê a declaração
 * do Assunto (se houver), o site da marca, o cache de SERP da frase em modo
 * `meta` e a linha do catálogo do ledger. `mode: "execute"` recalcula o plano
 * pela mesma leitura `meta`, confere a autorização, abre as credenciais (só
 * aqui), lê o ledger antes de pagar, só então lê corpo e digest do cache, e
 * executa as cinco fontes com orçamento em dólares.
 *
 * Regras que este arquivo sustenta:
 *   - candidata só vem de provider: Google Ads e DataForSEO Labs. O Minerador
 *     não fabrica termos, e nenhum caminho de IA monta candidata;
 *   - a estimativa do Labs sai rotulada e nunca vira Volume;
 *   - candidatas NÃO vão ao banco: a resposta volta ao navegador;
 *   - a frase só usa o destino ACEITO no domínio ATUAL da marca;
 *   - dedupe e "já existe" pela `normalizeKeyword` do import, a autoridade.
 *
 * Toda leitura, escrita e chamada chega por portas: a rota as monta com a
 * marca da rota e o cliente do servidor. Aqui não há banco nem credencial.
 */

/* --------------------------------- pedido --------------------------------- */

const GOOGLE_ADS_LANGUAGE_VALUES = Object.values(GOOGLE_ADS_DISCOVERY_LANGUAGES) as string[];

export const SubjectDiscoverySearchRequestSchema = z.object({
  mode: z.enum(["plan", "execute"]),
  /** A frase digitada. Ignorada quando `subjectKeywordId` vem: o servidor relê a declaração. */
  phrase: z.string().trim().max(200).optional().default(""),
  note: z.string().max(2000).nullable().optional(),
  destinationUrl: z.string().max(2048).nullable().optional(),
  subjectKeywordId: z.string().uuid().nullable().optional(),
  /** Obrigatório no execute. As chaves do ledger nascem dele. */
  operationRequestId: z.string().uuid().optional(),
  targeting: z.object({
    language: z.string().refine(value => GOOGLE_ADS_LANGUAGE_VALUES.includes(value), "Idioma Google Ads inválido"),
    selectedStates: z.array(z.string()).max(28),
    keywordPlanNetwork: z.enum(["GOOGLE_SEARCH", "GOOGLE_SEARCH_AND_PARTNERS"]),
    includeAdultKeywords: z.boolean(),
  }),
  authorizedPlan: z.object({
    planHash: z.string().min(1).max(200),
    maxCostUsd: z.number().nonnegative(),
  }).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (!value.subjectKeywordId && !value.phrase) context.addIssue({ code: "custom", path: ["phrase"], message: "Escreva o Assunto ou escolha um Assunto declarado." });
  if (value.mode === "execute" && !value.operationRequestId) context.addIssue({ code: "custom", path: ["operationRequestId"], message: "A execução precisa do identificador da operação." });
});

export type SubjectDiscoverySearchRequest = z.infer<typeof SubjectDiscoverySearchRequestSchema>;

/* -------------------------------- contrato -------------------------------- */

export type SubjectDiscoveryDestinationStatus = SubjectDestinationAcceptedCode | SubjectDestinationRefusedCode | "NO_LONGER_ON_BRAND_SITE";

export type SubjectDiscoverySubject = {
  phrase: string;
  normalizedPhrase: string;
  note: string | null;
  subjectKeywordId: string | null;
  destination: {
    status: SubjectDiscoveryDestinationStatus;
    /** Só a URL aceita no domínio atual da marca; qualquer outro caso é nulo. */
    url: string | null;
    reason: string | null;
  };
};

export type SubjectDiscoveryGoogleAdsMetrics = {
  averageMonthlySearches: number | null;
  competition: string | null;
  competitionIndex: number | null;
  averageCpcMicros: string | null;
  lowTopOfPageBidMicros: string | null;
  highTopOfPageBidMicros: string | null;
  currencyCode: string | null;
};

/**
 * Uma candidata da lista local. Não tem campo `volume`: o volume do Google Ads
 * está em `googleAds`, e a estimativa do Labs, rotulada, em `dataForSeoEstimate`.
 */
export type SubjectDiscoveryCandidate = {
  keyword: string;
  normalizedKeyword: string;
  /** Todas as fontes que a trouxeram, na ordem das fontes. */
  origins: SubjectDiscoverySource[];
  /** Até 3 textos de até 160 caracteres. */
  evidence: string[];
  googleAds: SubjectDiscoveryGoogleAdsMetrics | null;
  dataForSeoEstimate: DataForSeoLabsEstimate | null;
  /** As páginas do topo da SERP da frase que ranqueiam por ela, até 5. */
  ranked: Array<{ url: string; rankGroup: number }>;
  bestRankGroup: number | null;
  /** Selo "é o Assunto": a própria frase apareceu entre as candidatas. */
  isSubjectPhrase: boolean;
  /** Indicativo: a autoridade é o import. */
  existingKeywordId: string | null;
};

export type SubjectDiscoverySourceStatus = "ok" | "empty" | "failed" | "skipped_budget" | "not_applicable";

export type SubjectDiscoverySourceOutcome = {
  source: SubjectDiscoverySource;
  label: string;
  status: SubjectDiscoverySourceStatus;
  calls: number;
  /** Chamadas planejadas que o orçamento não deixou fazer (ranked). */
  skippedByBudget: number;
  received: number;
  costUsd: number | null;
  reason: string | null;
  errorCode: string | null;
};

export type SubjectDiscoverySerpLensOutcome = {
  lens: string;
  source: "cache" | "collected" | "failed" | "skipped_budget" | "skipped_read_failed";
  costUsd: number | null;
  stored: boolean;
  /** Quantas URLs orgânicas a lente trouxe para a união. */
  urls: number;
  reason: string | null;
};

export type SubjectDiscoveryTopUrl = { url: string; bestRankGroup: number; lensCount: number };

export type SubjectDiscoveryPlanResponse = {
  success: true;
  mode: "plan";
  subject: SubjectDiscoverySubject;
  plan: SubjectDiscoveryPlan;
};

export type SubjectDiscoveryExecuteResponse = {
  success: true;
  mode: "execute";
  operationRequestId: string;
  executedAt: string;
  subject: SubjectDiscoverySubject & { phraseExistingKeywordId: string | null };
  plan: SubjectDiscoveryPlan;
  sources: SubjectDiscoverySourceOutcome[];
  serp: { lenses: SubjectDiscoverySerpLensOutcome[]; topUrls: SubjectDiscoveryTopUrl[]; readFailed: string | null };
  candidates: SubjectDiscoveryCandidate[];
  /** Candidatas distintas antes do teto de 600. */
  totalCandidates: number;
  returnedCandidates: number;
  truncated: boolean;
  /** Soma do custo informado pelas tasks pagas nesta execução, em US$. */
  reportedCostUsd: number;
  /** Custo contado pelo orçamento (custo não informado conta o máximo). */
  budgetSpentUsd: number;
  ledgerRecording: boolean;
  /** Falha ao gravar uso DEPOIS de pagar. O resultado nunca é descartado por ela. */
  ledgerWarning: string | null;
  /** "Já existe" não pôde ser conferido: a lista vem sem a marca. */
  existingCheckFailed: boolean;
  notices: string[];
};

export type SubjectDiscoveryErrorCode =
  | "INVALID_SUBJECT_DISCOVERY_REQUEST"
  | "SUBJECT_NOTE_INVALID"
  | "SUBJECT_PHRASE_INVALID"
  | "GOOGLE_ADS_TARGETING_INVALID"
  | "SUBJECT_NOT_FOUND"
  | "SUBJECT_NOT_DECLARED"
  | "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP"
  | "PAID_PLAN_REQUIRED"
  | "PAID_PLAN_CHANGED"
  | "OPERATION_IN_PROGRESS"
  | "OPERATION_ALREADY_EXECUTED"
  | "LEDGER_UNAVAILABLE"
  | "DATAFORSEO_UNAVAILABLE"
  | "SUBJECT_DISCOVERY_READ_FAILED";

export type SubjectDiscoveryErrorResponse = {
  success: false;
  code: SubjectDiscoveryErrorCode;
  stage: string;
  message: string;
  /** Nos recusos de plano (`PAID_PLAN_*`, teto), o plano novo, para o diálogo. */
  plan?: SubjectDiscoveryPlan;
  diagnostic?: Record<string, string | number | boolean | null>;
};

export type SubjectDiscoverySearchResponse = SubjectDiscoveryPlanResponse | SubjectDiscoveryExecuteResponse | SubjectDiscoveryErrorResponse;
export type SubjectDiscoverySearchOutcome = { status: number; body: SubjectDiscoverySearchResponse };

/* --------------------------------- portas --------------------------------- */

/** Estruturalmente igual ao `SerpCacheRequest` do servidor. */
export type SubjectDiscoverySerpRequest = { query: SerpCacheQuery; depth: number; keywordId: string | null };

export type SubjectDiscoverySerpHit = { body?: Record<string, unknown>; digest?: SerpOrganicDigest | null };

export type SubjectDiscoverySerpCollection = {
  providerRequestId: string | null;
  costUsd: number | null;
  /** Digest orgânico do corpo pago; nulo quando o corpo não virou SERP. */
  digest: SerpOrganicDigest | null;
  organicCount: number | null;
  stored: boolean;
  error: string | null;
};

export type SubjectDiscoveryUsageEvent = {
  idempotencyKey: string;
  callId: string;
  endpoint: string;
  resultStatus: "succeeded" | "failed";
  costUsd: number | null;
  providerRequestId: string | null;
  errorCode: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type SubjectDiscoveryAdsSeed = { kind: "keyword"; keywords: string[] } | { kind: "keyword_and_url"; keywords: string[]; url: string };

/** O mínimo de uma ideia do Google Ads que a pesquisa usa. */
export type SubjectDiscoveryAdsIdea = {
  keyword: string;
  averageMonthlySearches: number | null;
  competition: string | null;
  competitionIndex: number | null;
  averageCpcMicros: string | null;
  lowTopOfPageBidMicros: string | null;
  highTopOfPageBidMicros: string | null;
  currencyCode: string | null;
};

/** Portas do EXECUTE: são as únicas que tocam credencial e provider. */
export type SubjectDiscoveryExecutionPorts = {
  /** A capability do ledger existe (depois da migration). */
  ledgerCapability: boolean;
  /** O evento com esta chave já está no ledger. */
  findUsage: (idempotencyKey: string) => Promise<boolean>;
  collectSerp: (request: SubjectDiscoverySerpRequest, options: { storeBody: boolean; operationRequestId: string; onRequestStarted: () => void }) => Promise<SubjectDiscoverySerpCollection>;
  runLabs: (request: DataForSeoLabsResearchRequest, hooks: { onRequestStarted: () => void }) => Promise<DataForSeoLabsResearchResult>;
  /** `skipped`: sem capability, o uso não é gravado. Lança em falha de gravação. */
  recordDataForSeoUsage: (event: SubjectDiscoveryUsageEvent) => Promise<"recorded" | "skipped">;
  googleAdsIdeas: (seed: SubjectDiscoveryAdsSeed, targeting: SubjectDiscoveryAdsTargeting, pageSize: number) => Promise<{ ideas: SubjectDiscoveryAdsIdea[]; requestId: string | null }>;
  recordGoogleAdsUsage: (event: { suffix: "keyword_seed" | "url_seed"; resultStatus: "succeeded" | "failed"; providerReference: string | null; errorCode: string | null; receivedCount: number | null }) => Promise<void>;
};

export type SubjectDiscoveryPorts = {
  now: () => Date;
  /** `marcas.site_url` da marca da rota. */
  readBrandSiteUrl: () => Promise<string | null>;
  /** Keyword viva da marca da rota, com `analise_semantica->keyword_subject`. Outra marca ou inexistente: `null`. */
  readSubjectKeyword: (keywordId: string) => Promise<{ id: string; keyword: string; keywordSubject: unknown } | null>;
  /** Cache de SERP da marca. Lança quando o banco não responde. */
  lookupSerp: (requests: SubjectDiscoverySerpRequest[], mode: "meta" | "digest" | "body") => Promise<Array<SubjectDiscoverySerpHit | null>>;
  /** Só a linha do catálogo, sem Connection nem Secret Store. */
  findLedgerCapability: () => Promise<boolean>;
  /** `id,keyword` das vivas da marca da rota, paginado. */
  readExistingKeywords: () => Promise<Array<{ id: string; keyword: string }>>;
  /** Abre as credenciais. Só o execute chama. */
  openExecution: () => Promise<SubjectDiscoveryExecutionPorts>;
};

/* -------------------------------- auxiliares ------------------------------- */

const SERP_CANONICAL_DEPTH = 20;
const SERP_OTHER_LENS_DEPTH = 10;
const EVIDENCE_MAX = 3;
const EVIDENCE_TEXT_MAX = 160;

export function subjectDiscoverySerpRequests(phrase: string, subjectKeywordId: string | null): Array<{ lens: SerpCacheLens; label: string; canonical: boolean; request: SubjectDiscoverySerpRequest }> {
  return SERP_CACHE_LENSES.map(lens => {
    const canonical = sameSerpCacheLens(lens, SERP_CACHE_CANONICAL_LENS);
    return {
      lens,
      label: serpCacheLensLabel(lens),
      canonical,
      // Os mesmos parâmetros do Resultados do Processador: o cache serve aos dois.
      request: {
        query: { keyword: phrase, locationCode: DATAFORSEO_LABS_LOCATION_CODE, languageCode: DATAFORSEO_LABS_LANGUAGE_CODE, lens, endpoint: "advanced" },
        depth: canonical ? SERP_CANONICAL_DEPTH : SERP_OTHER_LENS_DEPTH,
        keywordId: subjectKeywordId,
      },
    };
  });
}

/**
 * Até 5 URLs do topo: união das lentes, só orgânicos, sem URL repetida. Ordem:
 * melhor posição entre as lentes; no empate, a que aparece em mais lentes.
 * Lente sem digest (entrada extra antiga) fica fora da união.
 */
export function selectSubjectDiscoveryTopUrls(lenses: ReadonlyArray<{ lens: string; digest: SerpOrganicDigest | null | undefined }>, max: number = SUBJECT_DISCOVERY_CAPS.rankedMaxUrls): SubjectDiscoveryTopUrl[] {
  const byUrl = new Map<string, { best: number; lenses: Set<string> }>();
  for (const { lens, digest } of lenses) {
    if (!digest) continue;
    digest.organic.forEach((item, index) => {
      const url = typeof item.url === "string" ? item.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) return;
      const position = typeof item.rank_group === "number" && item.rank_group > 0 ? item.rank_group : index + 1;
      const current = byUrl.get(url) || { best: Number.POSITIVE_INFINITY, lenses: new Set<string>() };
      current.best = Math.min(current.best, position);
      current.lenses.add(lens);
      byUrl.set(url, current);
    });
  }
  return [...byUrl.entries()]
    .map(([url, value]) => ({ url, bestRankGroup: value.best, lensCount: value.lenses.size }))
    .sort((a, b) => a.bestRankGroup - b.bestRankGroup || b.lensCount - a.lensCount || a.url.localeCompare(b.url))
    .slice(0, Math.max(0, max));
}

function clip(value: string) {
  return value.length > EVIDENCE_TEXT_MAX ? `${value.slice(0, EVIDENCE_TEXT_MAX - 1)}…` : value;
}

function shortUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./i, "")}${path}`;
  } catch {
    return url;
  }
}

export type SubjectDiscoveryContribution = {
  source: SubjectDiscoverySource;
  keyword: string;
  googleAds?: SubjectDiscoveryGoogleAdsMetrics | null;
  estimate?: DataForSeoLabsEstimate | null;
  ranked?: { url: string; rankGroup: number } | null;
  relatedDepth?: number | null;
};

function evidenceFor(contribution: SubjectDiscoveryContribution): string {
  if (contribution.source === "ads_keyword_seed") return "Ideia do Google Ads para a frase";
  if (contribution.source === "ads_url_seed") return "Ideia do Google Ads para a frase e a página";
  if (contribution.source === "labs_related") return typeof contribution.relatedDepth === "number" ? `Pesquisa relacionada, nível ${contribution.relatedDepth}` : "Pesquisa relacionada";
  if (contribution.source === "labs_category") return "Mesma categoria no DataForSEO Labs";
  return contribution.ranked ? clip(`ranqueia em #${contribution.ranked.rankGroup} em ${shortUrl(contribution.ranked.url)}`) : "Ranqueada por uma página do topo";
}

/**
 * Junta as contribuições das fontes pela `normalizeKeyword` do import. Uma
 * candidata que veio de várias fontes guarda TODAS as origens. Ordem: mais
 * origens, depois com métrica do Google Ads, depois a melhor posição no
 * ranked. Corte em 600, com o total antes do corte.
 */
export function mergeSubjectDiscoveryCandidates(input: {
  contributions: readonly SubjectDiscoveryContribution[];
  normalizedPhrase: string;
  existingByNormalized?: ReadonlyMap<string, string> | null;
  cap?: number;
}): { candidates: SubjectDiscoveryCandidate[]; total: number; truncated: boolean } {
  const byKey = new Map<string, SubjectDiscoveryCandidate & { originSet: Set<SubjectDiscoverySource>; evidenceAll: Array<{ ranked: boolean; text: string }> }>();
  for (const contribution of input.contributions) {
    const keyword = typeof contribution.keyword === "string" ? contribution.keyword.replace(/\s+/g, " ").trim() : "";
    const normalized = normalizeKeyword(keyword);
    if (!normalized) continue;
    let candidate = byKey.get(normalized);
    if (!candidate) {
      candidate = {
        keyword,
        normalizedKeyword: normalized,
        origins: [],
        originSet: new Set(),
        evidenceAll: [],
        evidence: [],
        googleAds: null,
        dataForSeoEstimate: null,
        ranked: [],
        bestRankGroup: null,
        isSubjectPhrase: normalized === input.normalizedPhrase,
        existingKeywordId: input.existingByNormalized?.get(normalized) ?? null,
      };
      byKey.set(normalized, candidate);
    }
    candidate.originSet.add(contribution.source);
    if (contribution.googleAds && !candidate.googleAds) candidate.googleAds = contribution.googleAds;
    if (contribution.estimate && (!candidate.dataForSeoEstimate || (candidate.dataForSeoEstimate.searchVolume === null && contribution.estimate.searchVolume !== null))) {
      candidate.dataForSeoEstimate = contribution.estimate;
    }
    if (contribution.ranked && candidate.ranked.length < SUBJECT_DISCOVERY_CAPS.rankedMaxUrls && !candidate.ranked.some(item => item.url === contribution.ranked?.url)) {
      candidate.ranked.push({ url: contribution.ranked.url, rankGroup: contribution.ranked.rankGroup });
      candidate.bestRankGroup = candidate.bestRankGroup === null ? contribution.ranked.rankGroup : Math.min(candidate.bestRankGroup, contribution.ranked.rankGroup);
    }
    const evidence = evidenceFor(contribution);
    if (!candidate.evidenceAll.some(item => item.text === evidence)) candidate.evidenceAll.push({ ranked: contribution.source === "labs_ranked", text: evidence });
  }
  // A evidência do ranked ("ranqueia em #N em página") é a que diz por que a
  // keyword sustenta o Assunto: vem primeiro e nunca é cortada pelas outras.
  const all = [...byKey.values()].map(({ originSet, evidenceAll, ...candidate }) => ({
    ...candidate,
    origins: SUBJECT_DISCOVERY_SOURCES.filter(source => originSet.has(source)),
    evidence: [...evidenceAll.filter(item => item.ranked), ...evidenceAll.filter(item => !item.ranked)].slice(0, EVIDENCE_MAX).map(item => item.text),
  }));
  all.sort((a, b) =>
    b.origins.length - a.origins.length
    || Number(Boolean(b.googleAds)) - Number(Boolean(a.googleAds))
    || (a.bestRankGroup ?? Number.POSITIVE_INFINITY) - (b.bestRankGroup ?? Number.POSITIVE_INFINITY)
    || a.normalizedKeyword.localeCompare(b.normalizedKeyword, "pt-BR"));
  const cap = input.cap ?? SUBJECT_DISCOVERY_CAPS.totalCandidates;
  return { candidates: all.slice(0, cap), total: all.length, truncated: all.length > cap };
}

function failure(status: number, code: SubjectDiscoveryErrorCode, stage: string, message: string, extra: Partial<Pick<SubjectDiscoveryErrorResponse, "plan" | "diagnostic">> = {}): SubjectDiscoverySearchOutcome {
  return { status, body: { success: false, code, stage, message, ...extra } };
}

function adsMetrics(idea: SubjectDiscoveryAdsIdea): SubjectDiscoveryGoogleAdsMetrics {
  return {
    averageMonthlySearches: idea.averageMonthlySearches,
    competition: idea.competition,
    competitionIndex: idea.competitionIndex,
    averageCpcMicros: idea.averageCpcMicros,
    lowTopOfPageBidMicros: idea.lowTopOfPageBidMicros,
    highTopOfPageBidMicros: idea.highTopOfPageBidMicros,
    currencyCode: idea.currencyCode,
  };
}

function safeCode(error: unknown, fallback: string) {
  const value = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  return /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : fallback;
}

function safeMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return message ? message.replace(/(token|secret|password|authorization|login)\s*[:=]?\s*[^\s,;]+/gi, "$1=[redacted]").slice(0, 240) : fallback;
}

/** Trava da instância: a mesma operação não roda duas vezes ao mesmo tempo aqui. */
const inFlight = new Set<string>();

/* ------------------------------- preparação ------------------------------- */

type Prepared = {
  subject: SubjectDiscoverySubject;
  plan: SubjectDiscoveryPlan;
  serpSlots: ReturnType<typeof subjectDiscoverySerpRequests>;
  /**
   * Hit ou miss por lente, SEMPRE lido em `meta` — no plan e no execute. Assim o
   * `planHash` do execute é o mesmo do plan (uma canônica sem corpo não vira
   * "falta" só no execute), e o corpo nunca é lido antes de autorizar.
   */
  serpHits: Array<SubjectDiscoverySerpHit | null>;
};

async function prepare(brandId: string, request: SubjectDiscoverySearchRequest, ports: SubjectDiscoveryPorts): Promise<{ ok: true; value: Prepared } | { ok: false; outcome: SubjectDiscoverySearchOutcome }> {
  const now = ports.now();
  let phrase: string;
  let note: string | null;
  let rawDestination: string | null;
  const subjectKeywordId = request.subjectKeywordId || null;

  if (subjectKeywordId) {
    // A declaração é relida pelo id, na marca da rota. O texto da tela não vale.
    let row: Awaited<ReturnType<SubjectDiscoveryPorts["readSubjectKeyword"]>>;
    try {
      row = await ports.readSubjectKeyword(subjectKeywordId);
    } catch {
      return { ok: false, outcome: failure(503, "SUBJECT_DISCOVERY_READ_FAILED", "subject_read", "Não foi possível ler o Assunto declarado.") };
    }
    // Outra marca e inexistente respondem igual: nada revela que o id existe em outro lugar.
    if (!row) return { ok: false, outcome: failure(404, "SUBJECT_NOT_FOUND", "subject_read", "Assunto não encontrado nesta marca.") };
    const resolution = resolveKeywordSubject({ keyword_subject: row.keywordSubject });
    if (!resolution.declared) return { ok: false, outcome: failure(409, "SUBJECT_NOT_DECLARED", "subject_read", "Esta keyword não é mais um Assunto declarado: a declaração foi retirada. Nada foi pago.") };
    phrase = String(row.keyword || "").replace(/\s+/g, " ").trim();
    note = resolution.note;
    rawDestination = resolution.destinationUrl;
  } else {
    phrase = request.phrase.replace(/\s+/g, " ").trim();
    const normalizedNote = normalizeKeywordSubjectNote(request.note);
    if (!normalizedNote.ok) return { ok: false, outcome: failure(400, "SUBJECT_NOTE_INVALID", "request_validation", normalizedNote.reason) };
    note = normalizedNote.note;
    rawDestination = typeof request.destinationUrl === "string" ? request.destinationUrl : null;
  }
  const normalizedPhrase = normalizeKeyword(phrase);
  if (!normalizedPhrase || phrase.length > 200) return { ok: false, outcome: failure(400, "SUBJECT_PHRASE_INVALID", "request_validation", "O Assunto precisa ter de 1 a 200 caracteres.") };

  let brandSiteUrl: string | null;
  try {
    brandSiteUrl = await ports.readBrandSiteUrl();
  } catch {
    return { ok: false, outcome: failure(503, "SUBJECT_DISCOVERY_READ_FAILED", "brand_read", "Não foi possível ler o site da marca.") };
  }
  // O destino é conferido contra o site ATUAL da marca, também o de um Assunto declarado.
  const validation = validateSubjectDestination({ rawUrl: rawDestination, brandSiteUrl, checkedAt: now.toISOString() });
  let destination: SubjectDiscoverySubject["destination"];
  if (validation.ok && validation.code === "ACCEPTED" && validation.destinationUrl) {
    destination = { status: "ACCEPTED", url: validation.destinationUrl, reason: null };
  } else if (validation.ok) {
    destination = {
      status: validation.code,
      url: null,
      reason: validation.code === "NO_BRAND_SITE" ? SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE : "Sem página de destino: o Google Ads recebe só a frase.",
    };
  } else if (subjectKeywordId) {
    destination = { status: "NO_LONGER_ON_BRAND_SITE", url: null, reason: `A página de destino do Assunto deixou de casar com o site atual da marca: ${validation.reason}` };
  } else {
    destination = { status: validation.code, url: null, reason: validation.reason };
  }

  let adsTargeting: SubjectDiscoveryAdsTargeting;
  try {
    const resolved = resolveDiscoveryTargeting(request.targeting.selectedStates);
    adsTargeting = {
      language: request.targeting.language,
      geoTargetConstants: resolved.geoTargetConstants,
      keywordPlanNetwork: request.targeting.keywordPlanNetwork,
      includeAdultKeywords: request.targeting.includeAdultKeywords,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, outcome: failure(400, "GOOGLE_ADS_TARGETING_INVALID", "request_validation", message === "GOOGLE_ADS_TOO_MANY_GEO_TARGETS" ? "Selecione no máximo 10 estados ou use Todos os estados." : "As UFs selecionadas não são válidas para o Google Ads.") };
  }

  const serpSlots = subjectDiscoverySerpRequests(phrase, subjectKeywordId);
  let serpHits: Array<SubjectDiscoverySerpHit | null> = serpSlots.map(() => null);
  let serpReadFailed: string | null = null;
  try {
    // Plan e execute decidem o que está em cache do mesmo jeito: `meta`, nunca
    // corpo nem digest. O corpo e o digest só são lidos no execute, depois de
    // autorizar, travar, abrir a execução e conferir o ledger.
    serpHits = await ports.lookupSerp(serpSlots.map(slot => slot.request), "meta");
  } catch (error) {
    serpReadFailed = safeMessage(error, "cache de SERP ilegível");
    serpHits = serpSlots.map(() => null);
  }

  let ledgerRecording = false;
  try {
    ledgerRecording = await ports.findLedgerCapability();
  } catch {
    ledgerRecording = false;
  }

  const plan = await buildSubjectDiscoveryPlan({
    brandId,
    phrase,
    normalizedPhrase,
    subjectKeywordId,
    destination: { acceptedUrl: destination.url, reason: destination.reason },
    adsTargeting,
    serpLenses: serpSlots.map((slot, index) => ({ lens: slot.label, cached: Boolean(serpHits[index]) })),
    serpReadFailed,
    ledgerRecording,
  });

  return { ok: true, value: { subject: { phrase, normalizedPhrase, note, subjectKeywordId, destination }, plan, serpSlots, serpHits } };
}

/* -------------------------------- execução -------------------------------- */

const LABS_ENDPOINT_BY_SOURCE: Record<"labs_related" | "labs_category" | "labs_ranked", SubjectDiscoveryLedgerEndpoint> = {
  labs_related: "related_keywords",
  labs_category: "keyword_ideas",
  labs_ranked: "ranked_keywords",
};

function emptyOutcome(source: SubjectDiscoverySource): SubjectDiscoverySourceOutcome {
  return { source, label: SUBJECT_DISCOVERY_SOURCE_LABELS[source], status: "not_applicable", calls: 0, skippedByBudget: 0, received: 0, costUsd: null, reason: null, errorCode: null };
}

const BUDGET_REASON = "Não executada por orçamento: a próxima chamada passaria do custo máximo autorizado.";

/**
 * As URLs guardadas das lentes que o `meta` deu como hit: corpo da canônica
 * (é o que ela guarda) e digest das extras. Falha de leitura aqui não paga a
 * lente de novo: ela fica em cache, fora da união.
 */
async function readCachedSerpDigests(
  slots: Prepared["serpSlots"],
  metaHits: Prepared["serpHits"],
  ports: SubjectDiscoveryPorts,
): Promise<Array<{ digest: SerpOrganicDigest | null; readFailed: boolean }>> {
  const result = slots.map(() => ({ digest: null as SerpOrganicDigest | null, readFailed: false }));
  const canonicalIndexes = slots.map((slot, index) => index).filter(index => slots[index].canonical && metaHits[index]);
  const otherIndexes = slots.map((slot, index) => index).filter(index => !slots[index].canonical && metaHits[index]);
  if (canonicalIndexes.length) {
    try {
      const hits = await ports.lookupSerp(canonicalIndexes.map(index => slots[index].request), "body");
      canonicalIndexes.forEach((index, position) => {
        const body = hits[position]?.body;
        result[index].digest = body ? buildSerpOrganicDigest(body) : null;
      });
    } catch {
      for (const index of canonicalIndexes) result[index].readFailed = true;
    }
  }
  if (otherIndexes.length) {
    try {
      const hits = await ports.lookupSerp(otherIndexes.map(index => slots[index].request), "digest");
      otherIndexes.forEach((index, position) => { result[index].digest = hits[position]?.digest ?? null; });
    } catch {
      for (const index of otherIndexes) result[index].readFailed = true;
    }
  }
  return result;
}

export async function runSubjectDiscoverySearch(input: { brandId: string; request: SubjectDiscoverySearchRequest }, ports: SubjectDiscoveryPorts): Promise<SubjectDiscoverySearchOutcome> {
  const { brandId, request } = input;
  const prepared = await prepare(brandId, request, ports);
  if (!prepared.ok) return prepared.outcome;
  const { subject, plan, serpSlots, serpHits } = prepared.value;

  if (request.mode === "plan") {
    const authorization = authorizeSubjectDiscoveryPlan(plan, { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd });
    if (!authorization.ok && authorization.code === "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP") return failure(422, authorization.code, "plan", authorization.message, { plan });
    return { status: 200, body: { success: true, mode: "plan", subject, plan } };
  }

  const operationRequestId = request.operationRequestId as string;
  const authorization = authorizeSubjectDiscoveryPlan(plan, request.authorizedPlan ?? null);
  if (!authorization.ok) return failure(authorization.code === "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP" ? 422 : 409, authorization.code, "authorization", authorization.message, { plan });

  const lockKey = `${brandId}:${operationRequestId}`;
  if (inFlight.has(lockKey)) return failure(409, "OPERATION_IN_PROGRESS", "idempotency", "Esta pesquisa já está em execução. Aguarde o resultado; nada foi pago de novo.");
  inFlight.add(lockKey);
  try {
    return await execute({ brandId, operationRequestId, subject, plan, serpSlots, serpHits, budgetUsd: authorization.budgetUsd }, ports);
  } finally {
    inFlight.delete(lockKey);
  }
}

async function execute(context: {
  brandId: string;
  operationRequestId: string;
  subject: SubjectDiscoverySubject;
  plan: SubjectDiscoveryPlan;
  serpSlots: Prepared["serpSlots"];
  serpHits: Prepared["serpHits"];
  budgetUsd: number;
}, ports: SubjectDiscoveryPorts): Promise<SubjectDiscoverySearchOutcome> {
  const { operationRequestId, subject, plan } = context;
  let exec: SubjectDiscoveryExecutionPorts;
  try {
    exec = await ports.openExecution();
  } catch (error) {
    return failure(503, "DATAFORSEO_UNAVAILABLE", "credential_resolution", "O DataForSEO não está disponível para esta pesquisa. Nada foi pago.", { diagnostic: { causeCode: safeCode(error, "unknown") } });
  }

  const paidCalls = listSubjectDiscoveryPaidCalls(plan);
  /*
   * REPETIÇÃO, PELO LEDGER, ANTES DE PAGAR (F1b.4): as chaves de TODAS as
   * chamadas DataForSEO planejadas (até 11 leituras pequenas), não só a da
   * primeira. A primeira pode não ter sido gravada (pedido que não saiu, ou
   * gravação que virou `ledgerWarning`) enquanto as seguintes foram pagas.
   * Qualquer uma existindo, a operação já rodou — em qualquer instância — e
   * nada é pago. Sem capability (antes da migration) nenhum evento é gravado,
   * e só a trava da instância protege.
   */
  if (exec.ledgerCapability && paidCalls.length) {
    let exists: boolean;
    try {
      const found = await Promise.all(paidCalls.map(call => exec.findUsage(subjectDiscoveryLedgerKey(operationRequestId, call.callId))));
      exists = found.some(Boolean);
    } catch {
      return failure(503, "LEDGER_UNAVAILABLE", "ledger_read", "O controle de gastos não pôde ser consultado antes de pagar. Nada foi pago.");
    }
    if (exists) return failure(409, "OPERATION_ALREADY_EXECUTED", "idempotency", "Esta pesquisa já foi executada. Monte um plano novo para pesquisar de novo; nada foi pago.");
  }

  /*
   * Corpo da canônica e digest das extras: só agora, e só das lentes que o
   * `meta` deu como hit — e só quando a fonte 5 existe, porque é dela que as
   * URLs do topo servem. Uma entrada em cache sem corpo (ou sem digest) conta
   * como cache, sem URL e sem pagamento.
   */
  const rankedLine = plan.lines.find(line => line.kind === "labs_ranked");
  const cachedDigests = rankedLine && !plan.serp.readFailed
    ? await readCachedSerpDigests(context.serpSlots, context.serpHits, ports)
    : context.serpSlots.map(() => ({ digest: null as SerpOrganicDigest | null, readFailed: false }));

  const budget: SubjectDiscoveryBudget = createSubjectDiscoveryBudget({ maxCostUsd: context.budgetUsd, plannedCalls: paidCalls });
  const outcomes = new Map<SubjectDiscoverySource, SubjectDiscoverySourceOutcome>(SUBJECT_DISCOVERY_SOURCES.map(source => [source, emptyOutcome(source)]));
  const contributions: SubjectDiscoveryContribution[] = [];
  const ledgerWarnings: string[] = [];
  let reportedCostMicros = 0;
  let ledgerRecording = exec.ledgerCapability;
  const addCost = (cost: number | null) => {
    if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) reportedCostMicros += Math.round(cost * 1_000_000);
  };

  const recordDataForSeo = async (event: Omit<SubjectDiscoveryUsageEvent, "idempotencyKey" | "metadata"> & { metadata?: SubjectDiscoveryUsageEvent["metadata"] }) => {
    try {
      const recorded = await exec.recordDataForSeoUsage({
        ...event,
        idempotencyKey: subjectDiscoveryLedgerKey(operationRequestId, event.callId),
        metadata: { operationRequestId, operationKind: "subject_discovery", callId: event.callId, endpoint: event.endpoint, ...(event.metadata || {}) },
      });
      if (recorded === "skipped") ledgerRecording = false;
    } catch (error) {
      // Depois de pagar, falha do ledger nunca descarta o resultado.
      ledgerWarnings.push(`${event.callId}: ${safeCode(error, "LEDGER_WRITE_FAILED")}`);
    }
  };

  /* 1–2. Google Ads: grátis, mas só no execute. */
  const adsSources: Array<{ source: "ads_keyword_seed" | "ads_url_seed"; seed: SubjectDiscoveryAdsSeed | null }> = [
    { source: "ads_keyword_seed", seed: { kind: "keyword", keywords: [subject.phrase] } },
    { source: "ads_url_seed", seed: plan.destinationUrl ? { kind: "keyword_and_url", keywords: [subject.phrase], url: plan.destinationUrl } : null },
  ];
  for (const { source, seed } of adsSources) {
    const outcome = outcomes.get(source) as SubjectDiscoverySourceOutcome;
    if (!seed) {
      outcome.reason = plan.notApplicable.find(item => item.kind === source)?.reason ?? null;
      continue;
    }
    const suffix = source === "ads_keyword_seed" ? "keyword_seed" as const : "url_seed" as const;
    try {
      const page = await exec.googleAdsIdeas(seed, plan.adsTargeting, SUBJECT_DISCOVERY_CAPS.googleAdsPageSize);
      const ideas = page.ideas.slice(0, SUBJECT_DISCOVERY_CAPS.googleAdsPageSize);
      outcome.calls = 1;
      outcome.received = ideas.length;
      outcome.costUsd = 0;
      outcome.status = ideas.length ? "ok" : "empty";
      for (const idea of ideas) contributions.push({ source, keyword: idea.keyword, googleAds: adsMetrics(idea) });
      try {
        await exec.recordGoogleAdsUsage({ suffix, resultStatus: "succeeded", providerReference: page.requestId, errorCode: null, receivedCount: ideas.length });
      } catch (error) {
        ledgerWarnings.push(`google_ads:${suffix}: ${safeCode(error, "GOOGLE_ADS_USAGE_RECORDING_FAILED")}`);
      }
    } catch (error) {
      outcome.calls = 1;
      outcome.status = "failed";
      outcome.errorCode = safeCode(error, "GOOGLE_ADS_DISCOVERY_ERROR");
      outcome.reason = "O Google Ads não respondeu a esta fonte; as outras seguiram.";
      try {
        await exec.recordGoogleAdsUsage({ suffix, resultStatus: "failed", providerReference: null, errorCode: outcome.errorCode, receivedCount: null });
      } catch (usageError) {
        ledgerWarnings.push(`google_ads:${suffix}: ${safeCode(usageError, "GOOGLE_ADS_USAGE_RECORDING_FAILED")}`);
      }
    }
  }

  /* 3. SERP da frase: cache primeiro; as lentes que faltam, como unidade. */
  const serpLenses: SubjectDiscoverySerpLensOutcome[] = [];
  const lensDigests: Array<{ lens: string; digest: SerpOrganicDigest | null }> = [];
  const serpPaidCalls = paidCalls.filter(call => call.endpoint === "serp");
  let serpBudgetOk = true;
  if (serpPaidCalls.length) {
    const reservation = budget.reserveAll(serpPaidCalls.map(call => call.callId));
    serpBudgetOk = reservation.ok;
  }
  for (const [index, slot] of context.serpSlots.entries()) {
    if (plan.serp.readFailed) {
      serpLenses.push({ lens: slot.label, source: "skipped_read_failed", costUsd: null, stored: false, urls: 0, reason: "Cache de SERP ilegível; a lente não foi paga." });
      continue;
    }
    const hit = context.serpHits[index];
    if (hit) {
      const { digest, readFailed } = cachedDigests[index];
      lensDigests.push({ lens: slot.label, digest });
      const reason = digest
        ? null
        : readFailed
          ? "Os resultados guardados não puderam ser lidos agora: a lente fica fora da união e não é paga."
          : rankedLine
            ? "Entrada antiga sem resultados legíveis: fica fora da união."
            : null;
      serpLenses.push({ lens: slot.label, source: "cache", costUsd: 0, stored: true, urls: digest?.organic.length ?? 0, reason });
      continue;
    }
    const call = serpPaidCalls.find(item => item.lens === slot.label);
    if (!call || !serpBudgetOk) {
      serpLenses.push({ lens: slot.label, source: "skipped_budget", costUsd: null, stored: false, urls: 0, reason: BUDGET_REASON });
      continue;
    }
    let started = false;
    try {
      const collection = await exec.collectSerp(slot.request, { storeBody: slot.canonical, operationRequestId, onRequestStarted: () => { started = true; } });
      budget.settle(call.callId, collection.costUsd, started);
      addCost(collection.costUsd);
      const usable = collection.digest && (collection.organicCount ?? collection.digest.organic.length) > 0 ? collection.digest : null;
      lensDigests.push({ lens: slot.label, digest: usable });
      serpLenses.push({ lens: slot.label, source: collection.error && !usable ? "failed" : "collected", costUsd: collection.costUsd, stored: collection.stored, urls: usable?.organic.length ?? 0, reason: collection.error });
      await recordDataForSeo({ callId: call.callId, endpoint: "/v3/serp/google/organic/live/advanced", resultStatus: usable ? "succeeded" : "failed", costUsd: collection.costUsd, providerRequestId: collection.providerRequestId, errorCode: usable ? null : "SERP_UNUSABLE", metadata: { lens: slot.label } });
    } catch (error) {
      budget.settle(call.callId, null, started);
      serpLenses.push({ lens: slot.label, source: "failed", costUsd: null, stored: false, urls: 0, reason: safeMessage(error, "A SERP da lente não foi coletada.") });
      if (started) await recordDataForSeo({ callId: call.callId, endpoint: "/v3/serp/google/organic/live/advanced", resultStatus: "failed", costUsd: null, providerRequestId: null, errorCode: safeCode(error, "SERP_COLLECTION_FAILED"), metadata: { lens: slot.label } });
    }
  }
  const topUrls = selectSubjectDiscoveryTopUrls(lensDigests);

  /* 4–6. DataForSEO Labs, com orçamento em dólares antes de cada chamada. */
  let budgetStopped = false;
  const runLabs = async (source: "labs_related" | "labs_category" | "labs_ranked", n: number, request: DataForSeoLabsResearchRequest, extraMetadata: SubjectDiscoveryUsageEvent["metadata"] = {}) => {
    const outcome = outcomes.get(source) as SubjectDiscoverySourceOutcome;
    const callId = subjectDiscoveryCallId(LABS_ENDPOINT_BY_SOURCE[source], n);
    if (budgetStopped || !budget.reserve(callId).ok) {
      budgetStopped = true;
      outcome.skippedByBudget += 1;
      return;
    }
    let started = false;
    outcome.calls += 1;
    try {
      const result = await exec.runLabs(request, { onRequestStarted: () => { started = true; } });
      budget.settle(callId, result.cost, started);
      addCost(result.cost);
      outcome.costUsd = (outcome.costUsd ?? 0) + (result.cost ?? 0);
      outcome.received += result.keywords.length;
      for (const keyword of result.keywords) {
        contributions.push({ source, keyword: keyword.keyword, estimate: keyword.estimate, ranked: keyword.ranked, relatedDepth: keyword.relatedDepth });
      }
      await recordDataForSeo({ callId, endpoint: DATAFORSEO_LABS_RESEARCH_ENDPOINTS[request.kind], resultStatus: "succeeded", costUsd: result.cost, providerRequestId: result.providerRequestId, errorCode: null, metadata: extraMetadata });
    } catch (error) {
      const cost = error instanceof DataForSeoLabsResearchError ? error.cost : null;
      budget.settle(callId, cost, started);
      addCost(cost);
      outcome.errorCode = safeCode(error, "dataforseo_labs_failed");
      outcome.reason = safeMessage(error, "A chamada do DataForSEO Labs falhou; as outras fontes seguiram.");
      if (started) {
        await recordDataForSeo({ callId, endpoint: DATAFORSEO_LABS_RESEARCH_ENDPOINTS[request.kind], resultStatus: "failed", costUsd: cost, providerRequestId: error instanceof DataForSeoLabsResearchError ? error.providerRequestId : null, errorCode: outcome.errorCode, metadata: extraMetadata });
      }
    }
  };

  const locale = { locationCode: DATAFORSEO_LABS_LOCATION_CODE, languageCode: DATAFORSEO_LABS_LANGUAGE_CODE };
  await runLabs("labs_related", 1, { kind: "related_keywords", keyword: subject.phrase, tag: operationRequestId, ...locale });
  await runLabs("labs_category", 1, { kind: "keyword_ideas", keyword: subject.phrase, tag: operationRequestId, ...locale });
  if (rankedLine) {
    for (const [index, top] of topUrls.slice(0, rankedLine.calls).entries()) {
      await runLabs("labs_ranked", index + 1, { kind: "ranked_keywords", targetUrl: top.url, tag: operationRequestId, ...locale }, { targetRank: top.bestRankGroup });
    }
  }

  for (const source of ["labs_related", "labs_category", "labs_ranked"] as const) {
    const outcome = outcomes.get(source) as SubjectDiscoverySourceOutcome;
    if (source === "labs_ranked" && !rankedLine) {
      outcome.status = "not_applicable";
      outcome.reason = plan.notApplicable.find(item => item.kind === "labs_ranked")?.reason ?? null;
      continue;
    }
    if (source === "labs_ranked" && !topUrls.length && !outcome.skippedByBudget) {
      outcome.status = "not_applicable";
      outcome.reason = "Sem resultados do Google para a frase, não há páginas do topo para consultar.";
      continue;
    }
    if (outcome.calls === 0 && outcome.skippedByBudget) {
      outcome.status = "skipped_budget";
      outcome.reason = BUDGET_REASON;
      continue;
    }
    if (outcome.errorCode && outcome.received === 0) outcome.status = "failed";
    else outcome.status = outcome.received ? "ok" : "empty";
    if (outcome.skippedByBudget) outcome.reason = `${outcome.skippedByBudget} chamada(s) não executada(s) por orçamento.`;
  }

  /* "Já existe": id,keyword das vivas da marca, pela mesma chave do import. */
  let existingByNormalized: Map<string, string> | null = null;
  try {
    const rows = await ports.readExistingKeywords();
    existingByNormalized = new Map();
    for (const row of rows) {
      const key = normalizeKeyword(row.keyword);
      if (key && !existingByNormalized.has(key)) existingByNormalized.set(key, String(row.id));
    }
  } catch {
    existingByNormalized = null;
  }

  const merged = mergeSubjectDiscoveryCandidates({ contributions, normalizedPhrase: subject.normalizedPhrase, existingByNormalized });
  const notices = [...plan.notices];
  if (merged.truncated) notices.push(`${merged.candidates.length} de ${merged.total} candidatas exibidas.`);
  notices.push(SUBJECT_DISCOVERY_NOTICES.sourceRule);

  return {
    status: 200,
    body: {
      success: true,
      mode: "execute",
      operationRequestId,
      executedAt: ports.now().toISOString(),
      subject: { ...subject, phraseExistingKeywordId: existingByNormalized?.get(subject.normalizedPhrase) ?? null },
      plan,
      sources: SUBJECT_DISCOVERY_SOURCES.map(source => outcomes.get(source) as SubjectDiscoverySourceOutcome),
      serp: { lenses: serpLenses, topUrls, readFailed: plan.serp.readFailed },
      candidates: merged.candidates,
      totalCandidates: merged.total,
      returnedCandidates: merged.candidates.length,
      truncated: merged.truncated,
      reportedCostUsd: reportedCostMicros / 1_000_000,
      budgetSpentUsd: budget.spentUsd,
      ledgerRecording,
      ledgerWarning: ledgerWarnings.length ? `O uso de ${ledgerWarnings.length} chamada(s) não foi gravado no controle de gastos; o resultado foi mantido (${ledgerWarnings.slice(0, 3).join("; ")}).` : null,
      existingCheckFailed: existingByNormalized === null,
      notices,
    },
  };
}
