import { contentHash } from "../arquiteto/versioning.ts";
import { SERP_PAID_QUERY_COST_USD } from "../arquiteto/serp-lens-plan.ts";
import {
  DATAFORSEO_LABS_LANGUAGE_CODE,
  DATAFORSEO_LABS_LOCATION_CODE,
  DATAFORSEO_LABS_RANKED_MAX_RANK_GROUP,
  DATAFORSEO_LABS_RELATED_DEPTH,
  DATAFORSEO_LABS_RESEARCH_ENDPOINTS,
  DATAFORSEO_LABS_RESEARCH_LIMIT,
} from "./dataforseo-labs-keyword-research-core.ts";

/**
 * PLANO PAGO GENÉRICO POR FONTE — Pesquisa por Assunto
 * (SDD `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F1b.4 e F1b.10).
 *
 * O plano do Arquiteto é por lente (`SerpPaidPlan`) e não serve para cinco
 * fontes. Aqui cada linha é uma fonte: endpoint, número de chamadas, preço por
 * task e por item, itens máximos e custo máximo. O plano é autorizado INTEIRO
 * pelo humano; não há autorização fonte a fonte nem lente a lente.
 *
 * Três travas, todas no servidor:
 *   1. `planHash` cobre marca, frase normalizada, Assunto, destino, targeting,
 *      fontes com endpoint, chamadas, limit e depth, lentes a pagar, preços e
 *      tetos. Autorização de outro plano → `PAID_PLAN_CHANGED`, nada é pago.
 *   2. Orçamento em DÓLARES: antes de cada chamada paga, gasto acumulado (custo
 *      real informado pela task) + custo máximo da próxima > autorizado → a
 *      chamada não é feita.
 *   3. Teto rígido de US$ 0,20 por pesquisa, o valor que o dono aceitou.
 *
 * Contas em micro-dólares inteiros: 0,012 + 100 × 0,00012 dá 0,024 exato.
 *
 * Domínio puro. Não lê banco, não chama provider, não conhece credencial.
 */

export const SUBJECT_DISCOVERY_PLAN_VERSION = "subject-discovery-plan-v1" as const;

/** Teto rígido por pesquisa, aceito pelo dono (F1b.4). Plano acima dele é recusado. */
export const SUBJECT_DISCOVERY_MAX_COST_USD = 0.2;

/**
 * Preços do DataForSEO Labs consultados em dataforseo.com em 2026-09-24
 * (fonte externa, não medida). A SERP usa a constante que já existe, só lida.
 */
export const SUBJECT_DISCOVERY_PRICES = {
  labsTaskUsd: 0.012,
  labsItemUsd: 0.00012,
  serpLensMaxUsd: SERP_PAID_QUERY_COST_USD.canonicalDepth20,
  consultedAt: "2026-09-24",
  source: "dataforseo.com",
} as const;

/** Tetos de cada fonte. Mudar qualquer um exige adendo com o custo novo (SDD §7). */
export const SUBJECT_DISCOVERY_CAPS = {
  googleAdsPageSize: 300,
  labsLimit: DATAFORSEO_LABS_RESEARCH_LIMIT,
  relatedDepth: DATAFORSEO_LABS_RELATED_DEPTH,
  rankedMaxUrls: 5,
  rankedMaxRankGroup: DATAFORSEO_LABS_RANKED_MAX_RANK_GROUP,
  totalCandidates: 600,
} as const;

/** As cinco fontes, na ordem em que a pesquisa as executa e a tela as lista. */
export const SUBJECT_DISCOVERY_SOURCES = ["ads_keyword_seed", "ads_url_seed", "labs_related", "labs_category", "labs_ranked"] as const;
export type SubjectDiscoverySource = typeof SUBJECT_DISCOVERY_SOURCES[number];

/** Cada origem tem rótulo próprio. Nenhuma cai em "Google Ads" por padrão. */
export const SUBJECT_DISCOVERY_SOURCE_LABELS: Record<SubjectDiscoverySource, string> = {
  ads_keyword_seed: "Google Ads · frase",
  ads_url_seed: "Google Ads · frase + página",
  labs_related: "DataForSEO Labs · pesquisas relacionadas",
  labs_category: "DataForSEO Labs · mesma categoria",
  labs_ranked: "DataForSEO Labs · o que o topo da SERP ranqueia",
};

export type SubjectDiscoveryPlanLineKind = SubjectDiscoverySource | "serp_phrase";

export const SUBJECT_DISCOVERY_SERP_LABEL = "Resultados do Google para a frase (4 lentes)" as const;

/** Os textos fixos do diálogo de custo. A tela não escreve estes avisos por conta própria. */
export const SUBJECT_DISCOVERY_NOTICES = {
  longPhrase: "Frases longas ou sem busca podem não ter pesquisas relacionadas; cada fonte cobra a consulta mesmo sem resultado.",
  locale: "Pesquisas do DataForSEO e resultados do Google: Brasil inteiro. A UF vale só para o Google Ads.",
  sourceRule: "O Google Ads e o DataForSEO Labs devolvem as candidatas; o Minerador não fabrica termos.",
  ledgerMissing: (migration: string) => `Este custo não será registrado no controle de gastos até aplicar a atualização do banco ${migration}.`,
} as const;

/** A migration de catálogo desta fatia. É o nome que o aviso do diálogo cita. */
export const SUBJECT_DISCOVERY_LEDGER_MIGRATION = "20260924120000_dataforseo_keyword_research_operation.sql" as const;

export type SubjectDiscoveryPlanLine = {
  kind: SubjectDiscoveryPlanLineKind;
  label: string;
  provider: "google_ads" | "dataforseo";
  endpoint: string;
  /** Chamadas máximas desta fonte. No ranked, até uma por URL do topo. */
  calls: number;
  pricePerTaskUsd: number;
  pricePerItemUsd: number;
  maxItemsPerCall: number;
  maxCostUsd: number;
  /** Os parâmetros que entram no hash: limit, depth, pageSize, lentes. */
  params: Record<string, string | number | boolean | null>;
  /** Google Ads: custo 0, e mesmo assim só roda no execute. */
  free: boolean;
};

export type SubjectDiscoveryNotApplicable = { kind: SubjectDiscoveryPlanLineKind; reason: string };

export type SubjectDiscoveryAdsTargeting = {
  language: string;
  geoTargetConstants: string[];
  keywordPlanNetwork: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS";
  includeAdultKeywords: boolean;
};

export type SubjectDiscoverySerpLensState = { lens: string; cached: boolean };

export type SubjectDiscoveryPlan = {
  version: typeof SUBJECT_DISCOVERY_PLAN_VERSION;
  brandId: string;
  phrase: string;
  normalizedPhrase: string;
  subjectKeywordId: string | null;
  /** Só a página ACEITA no domínio da marca; qualquer outro caso é nulo. */
  destinationUrl: string | null;
  adsTargeting: SubjectDiscoveryAdsTargeting;
  labsLocale: { locationCode: number; languageCode: string };
  serp: {
    lenses: SubjectDiscoverySerpLensState[];
    missingLenses: string[];
    cachedLenses: string[];
    /** A leitura do cache falhou: nada da SERP é pago e não há fonte 5. */
    readFailed: string | null;
  };
  lines: SubjectDiscoveryPlanLine[];
  notApplicable: SubjectDiscoveryNotApplicable[];
  prices: typeof SUBJECT_DISCOVERY_PRICES;
  caps: typeof SUBJECT_DISCOVERY_CAPS;
  hardCapUsd: number;
  paidCalls: number;
  maxCostUsd: number;
  /** `false` antes da migration: a capability do ledger não existe, o custo fica fora do ledger. */
  ledgerRecording: boolean;
  notices: string[];
  planHash: string;
};

const MICROS = 1_000_000;
const toMicros = (usd: number) => Math.round(usd * MICROS);
const fromMicros = (micros: number) => micros / MICROS;

/** Custo máximo de uma task Labs com o teto de itens: 0,012 + 100 × 0,00012 = 0,024. */
export const SUBJECT_DISCOVERY_LABS_CALL_MAX_USD = fromMicros(toMicros(SUBJECT_DISCOVERY_PRICES.labsTaskUsd) + SUBJECT_DISCOVERY_CAPS.labsLimit * toMicros(SUBJECT_DISCOVERY_PRICES.labsItemUsd));

export type BuildSubjectDiscoveryPlanInput = {
  brandId: string;
  phrase: string;
  normalizedPhrase: string;
  subjectKeywordId: string | null;
  destination: { acceptedUrl: string | null; reason: string | null };
  adsTargeting: SubjectDiscoveryAdsTargeting;
  /** As quatro lentes, na ordem do produto, com o estado do cache. */
  serpLenses: SubjectDiscoverySerpLensState[];
  serpReadFailed: string | null;
  ledgerRecording: boolean;
};

function labsLine(kind: "labs_related" | "labs_category" | "labs_ranked", calls: number, params: SubjectDiscoveryPlanLine["params"]): SubjectDiscoveryPlanLine {
  const endpoint = kind === "labs_related"
    ? DATAFORSEO_LABS_RESEARCH_ENDPOINTS.related_keywords
    : kind === "labs_category" ? DATAFORSEO_LABS_RESEARCH_ENDPOINTS.keyword_ideas : DATAFORSEO_LABS_RESEARCH_ENDPOINTS.ranked_keywords;
  return {
    kind,
    label: SUBJECT_DISCOVERY_SOURCE_LABELS[kind],
    provider: "dataforseo",
    endpoint,
    calls,
    pricePerTaskUsd: SUBJECT_DISCOVERY_PRICES.labsTaskUsd,
    pricePerItemUsd: SUBJECT_DISCOVERY_PRICES.labsItemUsd,
    maxItemsPerCall: SUBJECT_DISCOVERY_CAPS.labsLimit,
    maxCostUsd: fromMicros(calls * toMicros(SUBJECT_DISCOVERY_LABS_CALL_MAX_USD)),
    params,
    free: false,
  };
}

function adsLine(kind: "ads_keyword_seed" | "ads_url_seed"): SubjectDiscoveryPlanLine {
  return {
    kind,
    label: SUBJECT_DISCOVERY_SOURCE_LABELS[kind],
    provider: "google_ads",
    endpoint: kind === "ads_keyword_seed" ? "generateKeywordIdeas:keywordSeed" : "generateKeywordIdeas:keywordAndUrlSeed",
    calls: 1,
    pricePerTaskUsd: 0,
    pricePerItemUsd: 0,
    maxItemsPerCall: SUBJECT_DISCOVERY_CAPS.googleAdsPageSize,
    maxCostUsd: 0,
    params: { pageSize: SUBJECT_DISCOVERY_CAPS.googleAdsPageSize },
    free: true,
  };
}

/** O que o `planHash` cobre. Avisos e o estado do ledger ficam fora: não mudam o que se paga. */
function hashMaterial(plan: Omit<SubjectDiscoveryPlan, "planHash">) {
  return {
    version: plan.version,
    brandId: plan.brandId,
    normalizedPhrase: plan.normalizedPhrase,
    subjectKeywordId: plan.subjectKeywordId,
    destinationUrl: plan.destinationUrl,
    adsTargeting: plan.adsTargeting,
    labsLocale: plan.labsLocale,
    missingLenses: plan.serp.missingLenses,
    serpReadFailed: plan.serp.readFailed !== null,
    lines: plan.lines.map(line => ({ kind: line.kind, endpoint: line.endpoint, calls: line.calls, pricePerTaskUsd: line.pricePerTaskUsd, pricePerItemUsd: line.pricePerItemUsd, maxItemsPerCall: line.maxItemsPerCall, params: line.params })),
    prices: plan.prices,
    caps: plan.caps,
    hardCapUsd: plan.hardCapUsd,
  };
}

export async function computeSubjectDiscoveryPlanHash(plan: Omit<SubjectDiscoveryPlan, "planHash">): Promise<string> {
  return contentHash(hashMaterial(plan));
}

export async function buildSubjectDiscoveryPlan(input: BuildSubjectDiscoveryPlanInput): Promise<SubjectDiscoveryPlan> {
  const lines: SubjectDiscoveryPlanLine[] = [];
  const notApplicable: SubjectDiscoveryNotApplicable[] = [];

  lines.push(adsLine("ads_keyword_seed"));
  if (input.destination.acceptedUrl) lines.push(adsLine("ads_url_seed"));
  else notApplicable.push({ kind: "ads_url_seed", reason: input.destination.reason || "Sem página de destino aceita no site da marca: o Google Ads não recebe a página." });

  const lenses = input.serpLenses.map(lens => ({ lens: lens.lens, cached: input.serpReadFailed ? false : lens.cached }));
  const missingLenses = input.serpReadFailed ? [] : lenses.filter(lens => !lens.cached).map(lens => lens.lens);
  const cachedLenses = input.serpReadFailed ? [] : lenses.filter(lens => lens.cached).map(lens => lens.lens);
  if (input.serpReadFailed) {
    notApplicable.push({ kind: "serp_phrase", reason: "O cache de resultados do Google não pôde ser lido: a SERP da frase não é paga e não há fonte 5." });
  } else if (missingLenses.length) {
    // A SERP da frase é uma unidade: as lentes que faltam, todas, ou nenhuma.
    lines.push({
      kind: "serp_phrase",
      label: SUBJECT_DISCOVERY_SERP_LABEL,
      provider: "dataforseo",
      endpoint: "/v3/serp/google/organic/live/advanced",
      calls: missingLenses.length,
      pricePerTaskUsd: SUBJECT_DISCOVERY_PRICES.serpLensMaxUsd,
      pricePerItemUsd: 0,
      maxItemsPerCall: 20,
      maxCostUsd: fromMicros(missingLenses.length * toMicros(SUBJECT_DISCOVERY_PRICES.serpLensMaxUsd)),
      params: { lenses: missingLenses.join(","), canonicalDepth: 20, otherDepth: 10 },
      free: false,
    });
  }

  lines.push(labsLine("labs_related", 1, { limit: SUBJECT_DISCOVERY_CAPS.labsLimit, depth: SUBJECT_DISCOVERY_CAPS.relatedDepth }));
  lines.push(labsLine("labs_category", 1, { limit: SUBJECT_DISCOVERY_CAPS.labsLimit }));
  if (input.serpReadFailed) notApplicable.push({ kind: "labs_ranked", reason: "Sem resultados do Google para a frase, não há páginas do topo para consultar." });
  else lines.push(labsLine("labs_ranked", SUBJECT_DISCOVERY_CAPS.rankedMaxUrls, { limit: SUBJECT_DISCOVERY_CAPS.labsLimit, maxRankGroup: SUBJECT_DISCOVERY_CAPS.rankedMaxRankGroup, maxUrls: SUBJECT_DISCOVERY_CAPS.rankedMaxUrls }));

  const paidLines = lines.filter(line => !line.free);
  const maxCostMicros = paidLines.reduce((total, line) => total + toMicros(line.maxCostUsd), 0);
  const notices: string[] = [SUBJECT_DISCOVERY_NOTICES.longPhrase, SUBJECT_DISCOVERY_NOTICES.locale];
  if (!input.ledgerRecording) notices.push(SUBJECT_DISCOVERY_NOTICES.ledgerMissing(SUBJECT_DISCOVERY_LEDGER_MIGRATION));

  const draft: Omit<SubjectDiscoveryPlan, "planHash"> = {
    version: SUBJECT_DISCOVERY_PLAN_VERSION,
    brandId: input.brandId,
    phrase: input.phrase,
    normalizedPhrase: input.normalizedPhrase,
    subjectKeywordId: input.subjectKeywordId,
    destinationUrl: input.destination.acceptedUrl,
    adsTargeting: {
      language: input.adsTargeting.language,
      geoTargetConstants: [...input.adsTargeting.geoTargetConstants],
      keywordPlanNetwork: input.adsTargeting.keywordPlanNetwork,
      includeAdultKeywords: input.adsTargeting.includeAdultKeywords,
    },
    labsLocale: { locationCode: DATAFORSEO_LABS_LOCATION_CODE, languageCode: DATAFORSEO_LABS_LANGUAGE_CODE },
    serp: { lenses, missingLenses, cachedLenses, readFailed: input.serpReadFailed },
    lines,
    notApplicable,
    prices: SUBJECT_DISCOVERY_PRICES,
    caps: SUBJECT_DISCOVERY_CAPS,
    hardCapUsd: SUBJECT_DISCOVERY_MAX_COST_USD,
    paidCalls: paidLines.reduce((total, line) => total + line.calls, 0),
    maxCostUsd: fromMicros(maxCostMicros),
    ledgerRecording: input.ledgerRecording,
    notices,
  };
  return { ...draft, planHash: await computeSubjectDiscoveryPlanHash(draft) };
}

/* ------------------------------ autorização ------------------------------- */

export type SubjectDiscoveryAuthorizedPlan = { planHash: string; maxCostUsd: number };

export type SubjectDiscoveryAuthorization =
  | { ok: true; budgetUsd: number }
  | { ok: false; code: "PAID_PLAN_REQUIRED" | "PAID_PLAN_CHANGED" | "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP"; message: string };

/**
 * A execução só paga o plano autorizado inteiro. Sem autorização → nada é pago
 * (`PAID_PLAN_REQUIRED`). Hash diferente, ou custo máximo acima do autorizado
 * → nada é pago (`PAID_PLAN_CHANGED`). O orçamento é o autorizado, nunca acima
 * do teto rígido.
 */
export function authorizeSubjectDiscoveryPlan(plan: Pick<SubjectDiscoveryPlan, "planHash" | "maxCostUsd" | "paidCalls">, authorized: SubjectDiscoveryAuthorizedPlan | null | undefined): SubjectDiscoveryAuthorization {
  if (toMicros(plan.maxCostUsd) > toMicros(SUBJECT_DISCOVERY_MAX_COST_USD)) {
    return { ok: false, code: "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP", message: `O plano custaria até US$ ${plan.maxCostUsd.toFixed(3)}, acima do teto de US$ ${SUBJECT_DISCOVERY_MAX_COST_USD.toFixed(2)} por pesquisa. Nada foi pago.` };
  }
  if (plan.paidCalls <= 0) return { ok: true, budgetUsd: 0 };
  if (!authorized || typeof authorized.planHash !== "string" || !Number.isFinite(authorized.maxCostUsd) || authorized.maxCostUsd <= 0) {
    return { ok: false, code: "PAID_PLAN_REQUIRED", message: `Esta pesquisa faria até ${plan.paidCalls} chamada(s) paga(s), até US$ ${plan.maxCostUsd.toFixed(3)}. Confirme o custo antes de pesquisar; nada foi pago.` };
  }
  if (authorized.planHash !== plan.planHash || toMicros(plan.maxCostUsd) > toMicros(authorized.maxCostUsd)) {
    return { ok: false, code: "PAID_PLAN_CHANGED", message: "O plano mudou desde a confirmação (frase, destino, lentes em cache ou tetos). Nada foi pago; confira o plano novo." };
  }
  return { ok: true, budgetUsd: fromMicros(Math.min(toMicros(authorized.maxCostUsd), toMicros(SUBJECT_DISCOVERY_MAX_COST_USD))) };
}

/* ------------------------------ chamadas pagas ----------------------------- */

export type SubjectDiscoveryLedgerEndpoint = "serp" | "related_keywords" | "keyword_ideas" | "ranked_keywords";

export type SubjectDiscoveryPaidCall = {
  /** `{endpoint}:{n}` — a vaga no orçamento e o fim da chave do ledger. */
  callId: string;
  endpoint: SubjectDiscoveryLedgerEndpoint;
  n: number;
  maxCostUsd: number;
  /** Só na SERP: a lente desta chamada. */
  lens: string | null;
};

export function subjectDiscoveryCallId(endpoint: SubjectDiscoveryLedgerEndpoint, n: number) {
  return `${endpoint}:${n}`;
}

/** Uma chave de idempotência por chamada DataForSEO (F1b.8). */
export function subjectDiscoveryLedgerKey(operationRequestId: string, callId: string) {
  return `dataforseo:${operationRequestId}:keyword_research:${callId}`;
}

/**
 * As chamadas pagas do plano, NA ORDEM de execução: SERP da frase (as lentes
 * que faltam, numeradas pela posição da lente entre as quatro), depois
 * `related_keywords`, `keyword_ideas` e até 5 `ranked_keywords`.
 */
export function listSubjectDiscoveryPaidCalls(plan: Pick<SubjectDiscoveryPlan, "lines" | "serp">): SubjectDiscoveryPaidCall[] {
  const calls: SubjectDiscoveryPaidCall[] = [];
  const serpLine = plan.lines.find(line => line.kind === "serp_phrase");
  if (serpLine) {
    plan.serp.lenses.forEach((lens, index) => {
      if (!plan.serp.missingLenses.includes(lens.lens)) return;
      calls.push({ callId: subjectDiscoveryCallId("serp", index + 1), endpoint: "serp", n: index + 1, maxCostUsd: SUBJECT_DISCOVERY_PRICES.serpLensMaxUsd, lens: lens.lens });
    });
  }
  if (plan.lines.some(line => line.kind === "labs_related")) calls.push({ callId: subjectDiscoveryCallId("related_keywords", 1), endpoint: "related_keywords", n: 1, maxCostUsd: SUBJECT_DISCOVERY_LABS_CALL_MAX_USD, lens: null });
  if (plan.lines.some(line => line.kind === "labs_category")) calls.push({ callId: subjectDiscoveryCallId("keyword_ideas", 1), endpoint: "keyword_ideas", n: 1, maxCostUsd: SUBJECT_DISCOVERY_LABS_CALL_MAX_USD, lens: null });
  const ranked = plan.lines.find(line => line.kind === "labs_ranked");
  for (let n = 1; ranked && n <= ranked.calls; n += 1) calls.push({ callId: subjectDiscoveryCallId("ranked_keywords", n), endpoint: "ranked_keywords", n, maxCostUsd: SUBJECT_DISCOVERY_LABS_CALL_MAX_USD, lens: null });
  return calls;
}

/* -------------------------------- orçamento -------------------------------- */

export type SubjectDiscoveryBudgetRefusal = "not_planned" | "already_used" | "over_budget";

/**
 * Orçamento da execução, em chamadas E em dólares.
 *
 * - Cada chamada paga consome a vaga planejada dela; fora do plano, recusa.
 * - Antes de cada chamada: gasto (real, informado pela task) + custo máximo das
 *   chamadas reservadas e ainda não liquidadas + custo máximo da próxima >
 *   autorizado → recusa, e a chamada não é feita.
 * - Custo não informado pela task liquida pelo máximo planejado (conservador).
 */
export function createSubjectDiscoveryBudget(input: { maxCostUsd: number; plannedCalls: readonly SubjectDiscoveryPaidCall[] }) {
  const limit = Math.max(0, toMicros(input.maxCostUsd));
  const planned = new Map(input.plannedCalls.map(call => [call.callId, toMicros(call.maxCostUsd)]));
  const pending = new Map<string, number>();
  const used = new Set<string>();
  let spent = 0;
  const committed = () => spent + [...pending.values()].reduce((total, value) => total + value, 0);

  const check = (callIds: readonly string[]): SubjectDiscoveryBudgetRefusal | null => {
    let next = 0;
    for (const callId of callIds) {
      if (!planned.has(callId)) return "not_planned";
      if (used.has(callId)) return "already_used";
      next += planned.get(callId) as number;
    }
    return committed() + next > limit ? "over_budget" : null;
  };

  const reserveAll = (callIds: readonly string[]): { ok: true } | { ok: false; reason: SubjectDiscoveryBudgetRefusal } => {
    const refusal = check(callIds);
    if (refusal) return { ok: false, reason: refusal };
    for (const callId of callIds) {
      used.add(callId);
      pending.set(callId, planned.get(callId) as number);
    }
    return { ok: true };
  };

  return {
    get spentUsd() { return fromMicros(spent); },
    get remainingUsd() { return fromMicros(Math.max(0, limit - committed())); },
    /** Reserva todas ou nenhuma: é a SERP da frase como unidade. */
    reserveAll,
    reserve: (callId: string) => reserveAll([callId]),
    /**
     * Liquida uma chamada reservada. `costUsd` nulo: a task não disse quanto
     * cobrou, e conta o máximo. `requestStarted: false`: o pedido nunca saiu, e
     * não conta nada.
     */
    settle(callId: string, costUsd: number | null, requestStarted = true) {
      const reserved = pending.get(callId);
      if (reserved === undefined) return;
      pending.delete(callId);
      if (!requestStarted) return;
      spent += typeof costUsd === "number" && Number.isFinite(costUsd) && costUsd >= 0 ? toMicros(costUsd) : reserved;
    },
  };
}

export type SubjectDiscoveryBudget = ReturnType<typeof createSubjectDiscoveryBudget>;
