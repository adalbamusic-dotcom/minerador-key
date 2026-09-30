import { z } from "zod";
import { shortSeedsOf } from "./short-seeds.ts";
/** Só frases longas (5+ palavras) ganham núcleos curtos: numa frase curta eles ficariam largos demais ("seo"). */
const seedKeywordsOf = (phrase: string) => phrase.trim().split(/\s+/).length >= 5 ? [...new Set([phrase, ...shortSeedsOf(phrase)])].slice(0, 6) : [phrase];
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
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
  type DataForSeoLabsEstimate,
} from "./dataforseo-labs-keyword-research-core.ts";
import { compareSubjectDiscoveryByVolume } from "./subject-discovery-volume.ts";
import {
  SUBJECT_DISCOVERY_ACTIVE_SOURCES,
  SUBJECT_DISCOVERY_CAPS,
  SUBJECT_DISCOVERY_NOTICES,
  SUBJECT_DISCOVERY_SOURCES,
  SUBJECT_DISCOVERY_SOURCE_LABELS,
  authorizeSubjectDiscoveryPlan,
  buildSubjectDiscoveryPlan,
  type SubjectDiscoveryActiveSource,
  type SubjectDiscoveryAdsTargeting,
  type SubjectDiscoveryPlan,
  type SubjectDiscoverySource,
} from "./subject-discovery-plan.ts";

/**
 * PESQUISA POR ASSUNTO — orquestração do plano e da execução
 * (SDD `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F1b.1 a F1b.8;
 * SDD `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`, §3.2).
 *
 * Desde 2026-09-28 a pesquisa usa SÓ o Google Ads (frase e frase + página de
 * destino aceita). `mode: "plan"` não consulta nada e não materializa
 * credencial: lê a declaração do Assunto (se houver) e o site da marca, e
 * devolve o plano com o `planHash`. `mode: "execute"` recalcula o plano,
 * confere a confirmação (o mesmo `planHash`), abre só o Google Ads e roda as
 * duas sementes. Nada é pago ao DataForSEO: nem Labs, nem SERP da frase — a
 * primeira coleta da SERP acontece no Arquiteto.
 *
 * Regras que este arquivo sustenta:
 *   - candidata só vem de provider (Google Ads). O Minerador não fabrica
 *     termos, e nenhum caminho de IA monta candidata;
 *   - candidatas NÃO vão ao banco: a resposta volta ao navegador;
 *   - a frase só usa o destino ACEITO no domínio ATUAL da marca;
 *   - dedupe e "já existe" pela `normalizeKeyword` do import, a autoridade;
 *   - buscas antigas (com `labs_*`, estimativa e SERP da frase) continuam
 *     legíveis: a junção nunca descarta uma origem legível.
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
 * está em `googleAds`. A estimativa do Labs, rotulada, em `dataForSeoEstimate`,
 * só existe em buscas antigas (antes de 2026-09-28); nas novas vem `null`.
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
  | "GOOGLE_ADS_UNAVAILABLE"
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

/**
 * O sufixo da chave do Google Ads no ledger. Sem página, o de sempre; com
 * página (`:p2`), uma chave por página da MESMA operação — a diferenciação de
 * publicados faz duas chamadas por página.
 */
export type SubjectDiscoveryAdsUsageSuffix = "keyword_seed" | "url_seed" | `${"keyword_seed" | "url_seed"}:p${number}`;

/**
 * Portas do EXECUTE: são as únicas que tocam credencial e provider. As do
 * DataForSEO (`ledgerCapability`, `findUsage`, `collectSerp`,
 * `recordDataForSeoUsage`) servem à diferenciação de publicados, que paga a
 * SERP; a Pesquisa por Assunto abre a execução sem o DataForSEO.
 */
export type SubjectDiscoveryExecutionPorts = {
  /** A capability do ledger existe (depois da migration). Sem o DataForSEO aberto, `false`. */
  ledgerCapability: boolean;
  /** O evento com esta chave já está no ledger. */
  findUsage: (idempotencyKey: string) => Promise<boolean>;
  collectSerp: (request: SubjectDiscoverySerpRequest, options: { storeBody: boolean; operationRequestId: string; onRequestStarted: () => void }) => Promise<SubjectDiscoverySerpCollection>;
  /** `skipped`: sem capability, o uso não é gravado. Lança em falha de gravação. */
  recordDataForSeoUsage: (event: SubjectDiscoveryUsageEvent) => Promise<"recorded" | "skipped">;
  googleAdsIdeas: (seed: SubjectDiscoveryAdsSeed, targeting: SubjectDiscoveryAdsTargeting, pageSize: number) => Promise<{ ideas: SubjectDiscoveryAdsIdea[]; requestId: string | null }>;
  recordGoogleAdsUsage: (event: { suffix: SubjectDiscoveryAdsUsageSuffix; resultStatus: "succeeded" | "failed"; providerReference: string | null; errorCode: string | null; receivedCount: number | null }) => Promise<void>;
};

/** `dataForSeo: false` abre só o Google Ads: nenhuma Connection DataForSEO é resolvida. */
export type SubjectDiscoveryOpenExecutionOptions = { dataForSeo?: boolean };

export type SubjectDiscoveryPorts = {
  now: () => Date;
  /** `marcas.site_url` da marca da rota. */
  readBrandSiteUrl: () => Promise<string | null>;
  /** Keyword viva da marca da rota, com `analise_semantica->keyword_subject`. Outra marca ou inexistente: `null`. */
  readSubjectKeyword: (keywordId: string) => Promise<{ id: string; keyword: string; keywordSubject: unknown } | null>;
  /**
   * Cache de SERP da marca. Lança quando o banco não responde. A pesquisa v2
   * não lê a SERP (a 1ª coleta é no Arquiteto); a porta fica para quem monta
   * as mesmas portas.
   */
  lookupSerp: (requests: SubjectDiscoverySerpRequest[], mode: "meta" | "digest" | "body") => Promise<Array<SubjectDiscoverySerpHit | null>>;
  /** Só a linha do catálogo, sem Connection nem Secret Store. A pesquisa v2 não a lê. */
  findLedgerCapability: () => Promise<boolean>;
  /** `id,keyword` das vivas da marca da rota, paginado. */
  readExistingKeywords: () => Promise<Array<{ id: string; keyword: string }>>;
  /** Abre as credenciais. Só o execute chama; a pesquisa pede `{ dataForSeo: false }`. */
  openExecution: (options?: SubjectDiscoveryOpenExecutionOptions) => Promise<SubjectDiscoveryExecutionPorts>;
};

/* -------------------------------- auxiliares ------------------------------- */

const SERP_CANONICAL_DEPTH = 20;
const SERP_OTHER_LENS_DEPTH = 10;
const EVIDENCE_MAX = 3;
const EVIDENCE_TEXT_MAX = 160;

/**
 * O pedido de SERP nas 4 lentes, com a chave de local do cache (2076 + "pt").
 * A pesquisa v2 não o usa; a diferenciação de publicados coleta a SERP das
 * candidatas por ele, na MESMA chave do Resultados do Processador.
 */
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
 * Lente sem digest (entrada extra antiga) fica fora da união. Era a entrada da
 * fonte `labs_ranked` (plano v1); a pesquisa v2 não a chama.
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
 * candidata que veio de várias fontes guarda TODAS as origens. Ordem (D2.3):
 * volume primeiro (com volume antes; média do Google Ads, depois estimativa
 * DataForSEO); no empate, mais origens, com métrica do Google Ads e a melhor
 * posição no ranked. Corte em 600, com o total antes do corte.
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
  // D2.3: volume primeiro. Com volume antes, a média do Google Ads maior
  // primeiro, depois a estimativa DataForSEO; o corte das 600 cai nas sem volume.
  all.sort((a, b) =>
    compareSubjectDiscoveryByVolume(a, b)
    || b.origins.length - a.origins.length
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

/** Trava da instância: a mesma operação não roda duas vezes ao mesmo tempo aqui. */
const inFlight = new Set<string>();

/* ------------------------------- preparação ------------------------------- */

type Prepared = {
  subject: SubjectDiscoverySubject;
  plan: SubjectDiscoveryPlan;
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

  // Plano v2: só o Google Ads. Nem o cache de SERP nem o ledger DataForSEO são
  // lidos aqui — nada é pago ao DataForSEO nesta pesquisa.
  const plan = await buildSubjectDiscoveryPlan({
    brandId,
    phrase,
    normalizedPhrase,
    subjectKeywordId,
    destination: { acceptedUrl: destination.url, reason: destination.reason },
    adsTargeting,
  });

  return { ok: true, value: { subject: { phrase, normalizedPhrase, note, subjectKeywordId, destination }, plan } };
}

/* -------------------------------- execução -------------------------------- */

function emptyOutcome(source: SubjectDiscoverySource): SubjectDiscoverySourceOutcome {
  return { source, label: SUBJECT_DISCOVERY_SOURCE_LABELS[source], status: "not_applicable", calls: 0, skippedByBudget: 0, received: 0, costUsd: null, reason: null, errorCode: null };
}

export async function runSubjectDiscoverySearch(input: { brandId: string; request: SubjectDiscoverySearchRequest }, ports: SubjectDiscoveryPorts): Promise<SubjectDiscoverySearchOutcome> {
  const { brandId, request } = input;
  const prepared = await prepare(brandId, request, ports);
  if (!prepared.ok) return prepared.outcome;
  const { subject, plan } = prepared.value;

  if (request.mode === "plan") {
    const authorization = authorizeSubjectDiscoveryPlan(plan, { planHash: plan.planHash, maxCostUsd: plan.maxCostUsd });
    if (!authorization.ok && authorization.code === "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP") return failure(422, authorization.code, "plan", authorization.message, { plan });
    return { status: 200, body: { success: true, mode: "plan", subject, plan } };
  }

  const operationRequestId = request.operationRequestId as string;
  const authorization = authorizeSubjectDiscoveryPlan(plan, request.authorizedPlan ?? null);
  if (!authorization.ok) return failure(authorization.code === "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP" ? 422 : 409, authorization.code, "authorization", authorization.message, { plan });

  const lockKey = `${brandId}:${operationRequestId}`;
  if (inFlight.has(lockKey)) return failure(409, "OPERATION_IN_PROGRESS", "idempotency", "Esta pesquisa já está em execução. Aguarde o resultado; nada foi consultado de novo.");
  inFlight.add(lockKey);
  try {
    return await execute({ operationRequestId, subject, plan }, ports);
  } finally {
    inFlight.delete(lockKey);
  }
}

/**
 * As duas sementes do Google Ads, grátis, só depois da confirmação.
 *
 * Repetição: sem chamada DataForSEO, não há chave DataForSEO a conferir no
 * ledger antes de consultar. A trava da instância barra a mesma operação em
 * curso; repetir o MESMO `operationRequestId` depois consulta o Google Ads de
 * novo (sem custo, gasta cota) e o uso cai na mesma chave do ledger, que não
 * duplica. A tela e o MCP geram um id novo por plano.
 */
async function execute(context: {
  operationRequestId: string;
  subject: SubjectDiscoverySubject;
  plan: SubjectDiscoveryPlan;
}, ports: SubjectDiscoveryPorts): Promise<SubjectDiscoverySearchOutcome> {
  const { operationRequestId, subject, plan } = context;
  let exec: SubjectDiscoveryExecutionPorts;
  try {
    exec = await ports.openExecution({ dataForSeo: false });
  } catch (error) {
    return failure(503, "GOOGLE_ADS_UNAVAILABLE", "credential_resolution", "O Google Ads não está disponível para esta pesquisa. Nada foi consultado.", { diagnostic: { causeCode: safeCode(error, "unknown") } });
  }

  const outcomes = new Map<SubjectDiscoveryActiveSource, SubjectDiscoverySourceOutcome>(SUBJECT_DISCOVERY_ACTIVE_SOURCES.map(source => [source, emptyOutcome(source)]));
  const contributions: SubjectDiscoveryContribution[] = [];
  const ledgerWarnings: string[] = [];

  /* 1–2. Google Ads: grátis, mas só no execute. */
  const adsSources: Array<{ source: SubjectDiscoveryActiveSource; seed: SubjectDiscoveryAdsSeed | null }> = [
    // A frase longa sozinha volta só com ela mesma no Google Ads; os núcleos curtos trazem as buscas relacionadas.
    { source: "ads_keyword_seed", seed: { kind: "keyword", keywords: seedKeywordsOf(subject.phrase) } },
    { source: "ads_url_seed", seed: plan.destinationUrl ? { kind: "keyword_and_url", keywords: seedKeywordsOf(subject.phrase), url: plan.destinationUrl } : null },
  ];
  for (const { source, seed } of adsSources) {
    const outcome = outcomes.get(source) as SubjectDiscoverySourceOutcome;
    if (!seed || !plan.lines.some(line => line.kind === source)) {
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
      outcome.reason = "O Google Ads não respondeu a esta semente; a outra seguiu.";
      try {
        await exec.recordGoogleAdsUsage({ suffix, resultStatus: "failed", providerReference: null, errorCode: outcome.errorCode, receivedCount: null });
      } catch (usageError) {
        ledgerWarnings.push(`google_ads:${suffix}: ${safeCode(usageError, "GOOGLE_ADS_USAGE_RECORDING_FAILED")}`);
      }
    }
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
      sources: SUBJECT_DISCOVERY_ACTIVE_SOURCES.map(source => outcomes.get(source) as SubjectDiscoverySourceOutcome),
      // Sem SERP da frase desde o plano v2: a 1ª coleta da SERP é no Arquiteto.
      serp: { lenses: [], topUrls: [], readFailed: null },
      candidates: merged.candidates,
      totalCandidates: merged.total,
      returnedCandidates: merged.candidates.length,
      truncated: merged.truncated,
      reportedCostUsd: 0,
      budgetSpentUsd: 0,
      // O uso desta pesquisa é o do Google Ads: registrado, salvo o que caiu no aviso.
      ledgerRecording: ledgerWarnings.length === 0,
      ledgerWarning: ledgerWarnings.length ? `O uso de ${ledgerWarnings.length} consulta(s) ao Google Ads não foi gravado no controle de gastos; o resultado foi mantido (${ledgerWarnings.slice(0, 3).join("; ")}).` : null,
      existingCheckFailed: existingByNormalized === null,
      notices,
    },
  };
}
