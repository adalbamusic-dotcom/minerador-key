import { contentHash } from "../arquiteto/versioning.ts";
import { SERP_PAID_QUERY_COST_USD } from "../arquiteto/serp-lens-plan.ts";
import {
  DATAFORSEO_LABS_LANGUAGE_CODE,
  DATAFORSEO_LABS_LOCATION_CODE,
  DATAFORSEO_LABS_RANKED_MAX_RANK_GROUP,
  DATAFORSEO_LABS_RELATED_DEPTH,
  DATAFORSEO_LABS_RESEARCH_LIMIT,
} from "./dataforseo-labs-keyword-research-core.ts";

/**
 * PLANO POR FONTE — Pesquisa por Assunto
 * (SDD `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`, F1b.4 e F1b.10;
 * SDD `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`, §3.2).
 *
 * Desde 2026-09-28 (plano v2, decisão do dono) a pesquisa usa SÓ o Google Ads:
 * a semente frase (`ads_keyword_seed`) e a semente frase + página de destino
 * aceita (`ads_url_seed`). Saíram as três fontes do DataForSEO Labs e a linha
 * `serp_phrase`, que só existia para alimentar a fonte do topo da SERP. O plano
 * continua existindo e continua sendo confirmado INTEIRO: o `planHash` amarra a
 * frase, o Assunto, o destino e o targeting do Google Ads que o humano viu.
 * Custo no DataForSEO: zero. O Google Ads não cobra; usa a cota da conta.
 *
 * As cinco origens continuam LEGÍVEIS (`SUBJECT_DISCOVERY_SOURCES`): buscas
 * antigas da lista local e blocos gravados trazem `labs_*`, e nada disso é
 * apagado nem deixa de ser importável. As fontes que a pesquisa EXECUTA hoje
 * são `SUBJECT_DISCOVERY_ACTIVE_SOURCES`.
 *
 * O orçamento em dólares (`createSubjectDiscoveryBudget`), os preços e a chave
 * do ledger DataForSEO continuam aqui porque a diferenciação de publicados paga
 * a SERP por eles. Contas em micro-dólares inteiros.
 *
 * Domínio puro. Não lê banco, não chama provider, não conhece credencial.
 */

export const SUBJECT_DISCOVERY_PLAN_VERSION = "subject-discovery-plan-v2" as const;
/** Planos gravados antes de 2026-09-28 (com Labs e SERP da frase): só leitura, na lista local. */
export const SUBJECT_DISCOVERY_LEGACY_PLAN_VERSION = "subject-discovery-plan-v1" as const;

/** Teto rígido por pesquisa, aceito pelo dono (F1b.4). Plano acima dele é recusado. */
export const SUBJECT_DISCOVERY_MAX_COST_USD = 0.2;

/**
 * Preços do DataForSEO Labs consultados em dataforseo.com em 2026-09-24
 * (fonte externa, não medida). A SERP usa a constante que já existe, só lida.
 * O plano v2 não paga nada disso; os preços ficam para a leitura de planos
 * antigos e para a diferenciação de publicados, que paga a SERP.
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

/**
 * As cinco origens LEGÍVEIS, na ordem em que a tela as lista. As três `labs_*`
 * só aparecem em buscas antigas (antes de 2026-09-28): continuam aqui para a
 * lista local, o envio ao Processador e os blocos gravados nas keywords.
 */
export const SUBJECT_DISCOVERY_SOURCES = ["ads_keyword_seed", "ads_url_seed", "labs_related", "labs_category", "labs_ranked"] as const;
export type SubjectDiscoverySource = typeof SUBJECT_DISCOVERY_SOURCES[number];

/** As fontes que a pesquisa EXECUTA hoje: só o Google Ads (frase e frase + página). */
export const SUBJECT_DISCOVERY_ACTIVE_SOURCES = ["ads_keyword_seed", "ads_url_seed"] as const satisfies readonly SubjectDiscoverySource[];
export type SubjectDiscoveryActiveSource = typeof SUBJECT_DISCOVERY_ACTIVE_SOURCES[number];

/** Cada origem tem rótulo próprio. Nenhuma cai em "Google Ads" por padrão. */
export const SUBJECT_DISCOVERY_SOURCE_LABELS: Record<SubjectDiscoverySource, string> = {
  ads_keyword_seed: "Google Ads · frase",
  ads_url_seed: "Google Ads · frase + página",
  labs_related: "DataForSEO Labs · pesquisas relacionadas (fonte antiga)",
  labs_category: "DataForSEO Labs · mesma categoria (fonte antiga)",
  labs_ranked: "DataForSEO Labs · o que o topo da SERP ranqueia (fonte antiga)",
};

export type SubjectDiscoveryPlanLineKind = SubjectDiscoverySource | "serp_phrase";

/** Rótulo da linha `serp_phrase` de planos antigos (v1). O plano v2 não tem SERP. */
export const SUBJECT_DISCOVERY_SERP_LABEL = "Resultados do Google para a frase (4 lentes)" as const;

/** Os textos fixos do diálogo e do resultado. A tela não escreve estes avisos por conta própria. */
export const SUBJECT_DISCOVERY_NOTICES = {
  /** Aviso de planos v1, que pagavam o Labs. Fica para a leitura de buscas antigas. */
  longPhrase: "Frases longas ou sem busca podem não ter pesquisas relacionadas; cada fonte cobra a consulta mesmo sem resultado.",
  free: "Sem custo no DataForSEO: a pesquisa consulta só o Google Ads, que não cobra e usa a cota da conta.",
  locale: "O idioma e as UFs escolhidos valem para o Google Ads, a única fonte desta pesquisa.",
  sourceRule: "O Google Ads devolve as candidatas, pela frase e pela página de destino; o Minerador não fabrica termos.",
  /** Aviso de planos v1 sem a capability do ledger DataForSEO. O plano v2 não paga o DataForSEO. */
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
  /** v2 nas pesquisas novas; v1 só em buscas antigas da lista local. */
  version: typeof SUBJECT_DISCOVERY_PLAN_VERSION | typeof SUBJECT_DISCOVERY_LEGACY_PLAN_VERSION;
  brandId: string;
  phrase: string;
  normalizedPhrase: string;
  subjectKeywordId: string | null;
  /** Só a página ACEITA no domínio da marca; qualquer outro caso é nulo. */
  destinationUrl: string | null;
  adsTargeting: SubjectDiscoveryAdsTargeting;
  /** Legado (v1): o local do Labs. No v2 fica com as constantes de sempre, fora do hash. */
  labsLocale: { locationCode: number; languageCode: string };
  /** Legado (v1): a SERP da frase. No v2 vem vazio — a 1ª coleta da SERP é no Arquiteto. */
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
  /** Chamadas pagas ao DataForSEO. No v2, sempre 0. */
  paidCalls: number;
  /** Custo máximo no DataForSEO. No v2, sempre 0: o Google Ads não cobra. */
  maxCostUsd: number;
  /** v1: `false` antes da migration da capability DataForSEO. v2: `true` (nada é pago ao DataForSEO). */
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
};

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

/**
 * O que o `planHash` cobre: marca, frase normalizada, Assunto, destino,
 * targeting do Google Ads e as linhas (endpoint e `pageSize`). A versão entra:
 * um plano v1 nunca confere com um v2. Avisos ficam fora.
 */
function hashMaterial(plan: Omit<SubjectDiscoveryPlan, "planHash">) {
  return {
    version: plan.version,
    brandId: plan.brandId,
    normalizedPhrase: plan.normalizedPhrase,
    subjectKeywordId: plan.subjectKeywordId,
    destinationUrl: plan.destinationUrl,
    adsTargeting: plan.adsTargeting,
    lines: plan.lines.map(line => ({ kind: line.kind, endpoint: line.endpoint, calls: line.calls, maxItemsPerCall: line.maxItemsPerCall, params: line.params })),
  };
}

export async function computeSubjectDiscoveryPlanHash(plan: Omit<SubjectDiscoveryPlan, "planHash">): Promise<string> {
  return contentHash(hashMaterial(plan));
}

/** O plano v2: só as linhas do Google Ads. A de página só com destino aceito. */
export async function buildSubjectDiscoveryPlan(input: BuildSubjectDiscoveryPlanInput): Promise<SubjectDiscoveryPlan> {
  const lines: SubjectDiscoveryPlanLine[] = [];
  const notApplicable: SubjectDiscoveryNotApplicable[] = [];

  lines.push(adsLine("ads_keyword_seed"));
  if (input.destination.acceptedUrl) lines.push(adsLine("ads_url_seed"));
  else notApplicable.push({ kind: "ads_url_seed", reason: input.destination.reason || "Sem página de destino aceita no site da marca: o Google Ads não recebe a página." });

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
    serp: { lenses: [], missingLenses: [], cachedLenses: [], readFailed: null },
    lines,
    notApplicable,
    prices: SUBJECT_DISCOVERY_PRICES,
    caps: SUBJECT_DISCOVERY_CAPS,
    hardCapUsd: SUBJECT_DISCOVERY_MAX_COST_USD,
    paidCalls: 0,
    maxCostUsd: 0,
    ledgerRecording: true,
    notices: [SUBJECT_DISCOVERY_NOTICES.free, SUBJECT_DISCOVERY_NOTICES.locale],
  };
  return { ...draft, planHash: await computeSubjectDiscoveryPlanHash(draft) };
}

/* ------------------------------ autorização ------------------------------- */

export type SubjectDiscoveryAuthorizedPlan = { planHash: string; maxCostUsd: number };

export type SubjectDiscoveryAuthorization =
  | { ok: true; budgetUsd: number }
  | { ok: false; code: "PAID_PLAN_REQUIRED" | "PAID_PLAN_CHANGED" | "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP"; message: string };

/**
 * A execução só roda o plano confirmado inteiro. Sem confirmação → nada é
 * consultado (`PAID_PLAN_REQUIRED`). Hash diferente, ou custo máximo acima do
 * autorizado → nada é consultado (`PAID_PLAN_CHANGED`). Com chamada paga, o
 * orçamento é o autorizado, nunca acima do teto rígido.
 *
 * Plano sem chamada paga (o v2, só Google Ads): continua exigindo o MESMO
 * `planHash` — ele amarra a frase, a página de destino e o targeting que o
 * humano confirmou —, com orçamento 0. Os códigos ficam os de sempre, porque a
 * tela e o MCP já os tratam.
 */
export function authorizeSubjectDiscoveryPlan(plan: Pick<SubjectDiscoveryPlan, "planHash" | "maxCostUsd" | "paidCalls">, authorized: SubjectDiscoveryAuthorizedPlan | null | undefined): SubjectDiscoveryAuthorization {
  if (toMicros(plan.maxCostUsd) > toMicros(SUBJECT_DISCOVERY_MAX_COST_USD)) {
    return { ok: false, code: "SUBJECT_DISCOVERY_PLAN_ABOVE_CAP", message: `O plano custaria até US$ ${plan.maxCostUsd.toFixed(3)}, acima do teto de US$ ${SUBJECT_DISCOVERY_MAX_COST_USD.toFixed(2)} por pesquisa. Nada foi pago.` };
  }
  if (plan.paidCalls <= 0) {
    if (!authorized || typeof authorized.planHash !== "string" || !authorized.planHash) {
      return { ok: false, code: "PAID_PLAN_REQUIRED", message: "Confirme o plano (frase, página de destino e segmentação do Google Ads) antes de pesquisar. Nada foi consultado." };
    }
    if (authorized.planHash !== plan.planHash) {
      return { ok: false, code: "PAID_PLAN_CHANGED", message: "O plano mudou desde a confirmação (frase, página de destino ou segmentação). Nada foi consultado; confira o plano novo." };
    }
    return { ok: true, budgetUsd: 0 };
  }
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
