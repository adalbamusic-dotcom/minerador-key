/**
 * REFORÇAR PUBLICADOS — A BUSCA EM LOTE PARA OS PUBLICADOS SEM PAR (2026-09-28).
 *
 * SDD: `docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md` (aprovada pelo
 * dono em 2026-09-28, "Sim, teto US$ 1,00").
 *
 * Os publicados que não têm keyword do mesmo assunto no lote ganham, numa
 * rodada só, keywords novas do Google Ads — com a URL e o tema da página como
 * semente (grátis) — e só as que têm volume do Google Ads. As melhores
 * candidatas de cada página vão à SERP nas 4 lentes (a parte paga, cache
 * primeiro), e a SERP diz o nível:
 *
 *   Forte     3 ou mais páginas em comum no top 10 com a página publicada;
 *   Provável  2 páginas em comum, confirmadas pelas palavras.
 *
 * Teto de US$ 1,00 POR RODADA, conferido no servidor (plano acima do teto é
 * cortado aqui: candidatas 5 → 3 → 2 e, por fim, páginas do fim da lista).
 * 14 páginas × 5 candidatas × US$ 0,014 = US$ 0,98: cabem sem corte.
 *
 * DOIS MODOS, POR GRUPO. Publicados que disputam o mesmo assunto entre si
 * (3+ páginas em comum, `detectPublishedCannibalization`) seguem a regra da
 * diferenciação — já existe, com painel próprio — e saem desta busca. Os
 * demais seguem a regra de reforço, aqui.
 *
 * O MESMO NÚCLEO DA DIFERENCIAÇÃO: plano com as mesmas páginas pagas
 * (`DifferentiationPlanPage`), o mesmo corte (`fitPublishedSearchPagesToCap`),
 * a mesma autorização (`authorizePublishedSearchPlan`), a mesma rodada
 * (`executePublishedSearchRound`: Google Ads, orçamento, ledger, SERP com
 * cache) e a mesma trava por operação. Só o filtro e a avaliação são daqui.
 *
 * Nada aqui grava: as sugestões vão ao cartão, e entrar no artigo é o
 * "Reforçar publicados", com a confirmação humana.
 *
 * Domínio puro, com portas. Testes usam fixtures: nenhuma chamada paga.
 */
import { contentHash } from "./versioning.ts";
import { MAX_ARTICLE_KEYWORDS, type ArticleFormationKeyword } from "./article-formation.ts";
import { measureAnchorConvergence } from "./serp-subject-convergence.ts";
import type { KeywordSerpFootprint, SerpSubjectIndex } from "./serp-subject-overlap.ts";
import {
  differentiationFingerprint,
  differentiationTokens,
  formationKeywordOfPage,
  type DifferentiationPage,
} from "./published-differentiation.ts";
import {
  DIFFERENTIATION_ADS_TARGETING,
  DIFFERENTIATION_PRICES,
  DIFFERENTIATION_SERP_CANDIDATES_MAX,
  acquirePublishedSearchLock,
  authorizePublishedSearchPlan,
  executePublishedSearchRound,
  fitPublishedSearchPagesToCap,
  publishedSearchPlanCost,
  type DifferentiationCandidate,
  type DifferentiationCandidateRefusal,
  type DifferentiationPlanPage,
  type DifferentiationRunErrorCode,
  type DifferentiationRunPorts,
  type DifferentiationRunResult,
  type DifferentiationSerpOutcome,
} from "./published-differentiation-run.ts";
import type { SubjectDiscoveryAdsTargeting, SubjectDiscoverySource } from "../minerador/subject-discovery-plan.ts";
import { normalizeKeyword } from "../minerador/keyword-import-core.ts";
import type { SerpSuggestionLevel } from "./serp-subject-suggestions.ts";

/* -------------------------------- constantes -------------------------------- */

/** A proposta da busca mora em `editorial_workflow_items`, como a da diferenciação. */
export const REINFORCEMENT_SEARCH_SUBJECT_TYPE = "published_reinforcement_search" as const;
export const REINFORCEMENT_SEARCH_STAGE = "architect" as const;
export const REINFORCEMENT_SEARCH_CONTRACT_VERSION = "published-reinforcement-search-v1" as const;
export const REINFORCEMENT_SEARCH_PLAN_VERSION = "published-reinforcement-plan-v1" as const;

/** Teto aceito pelo dono em 2026-09-28 ("Sim, teto US$ 1,00"). O servidor nunca paga acima dele. */
export const REINFORCEMENT_MAX_COST_USD = 1.0;
/** Páginas por rodada: acima disso o corte já tiraria páginas de qualquer jeito. */
export const REINFORCEMENT_SEARCH_MAX_PAGES = 30;

export const REINFORCEMENT_SEARCH_ACTION_LABEL = "Buscar keywords para os publicados sem par";

/** `rs-<16 hex>`: o conjunto de páginas, em ordem. Muda se o conjunto muda. */
export function reinforcementSearchId(pageKeywordIds: readonly string[]): string {
  return `rs-${differentiationFingerprint([...new Set(pageKeywordIds)].sort().join("|"))}`;
}

/* ---------------------------------- modos ---------------------------------- */

export type ReinforcementSearchPartition = {
  /** Seguem a regra de reforço, nesta busca. */
  reinforcement: DifferentiationPage[];
  /** Disputam o mesmo assunto com outro publicado: vão ao painel da diferenciação. */
  differentiation: Array<{ groupId: string; keywordIds: string[]; keywords: string[] }>;
  /** Pedidas mas não são publicados desta marca. */
  unknown: string[];
};

/**
 * Separa as páginas pedidas pelos dois modos. `groups` são os grupos da
 * detecção de canibalização (cache, grátis); quem está num deles sai daqui.
 */
export function partitionReinforcementPages(input: {
  requestedKeywordIds: readonly string[];
  pages: readonly DifferentiationPage[];
  groups: ReadonlyArray<{ groupId: string; members: ReadonlyArray<{ page: Pick<DifferentiationPage, "keywordId" | "keyword"> }> }>;
}): ReinforcementSearchPartition {
  const porId = new Map(input.pages.map(page => [page.keywordId, page]));
  const grupoDe = new Map<string, (typeof input.groups)[number]>();
  for (const grupo of input.groups) for (const membro of grupo.members) grupoDe.set(membro.page.keywordId, grupo);
  const reinforcement: DifferentiationPage[] = [];
  const differentiation = new Map<string, ReinforcementSearchPartition["differentiation"][number]>();
  const unknown: string[] = [];
  for (const id of [...new Set(input.requestedKeywordIds)]) {
    const page = porId.get(id);
    if (!page) { unknown.push(id); continue; }
    const grupo = grupoDe.get(id);
    if (grupo) {
      differentiation.set(grupo.groupId, {
        groupId: grupo.groupId,
        keywordIds: grupo.members.map(member => member.page.keywordId),
        keywords: grupo.members.map(member => member.page.keyword),
      });
      continue;
    }
    reinforcement.push(page);
  }
  return { reinforcement, differentiation: [...differentiation.values()], unknown };
}

/* ---------------------------------- plano ---------------------------------- */

export type ReinforcementSearchPlan = {
  version: typeof REINFORCEMENT_SEARCH_PLAN_VERSION;
  brandId: string;
  searchId: string;
  /** As páginas da rodada (id, keyword e URL): muda → plano novo. */
  pagesFingerprint: string;
  pages: DifferentiationPlanPage[];
  prices: typeof DIFFERENTIATION_PRICES;
  adsTargeting: SubjectDiscoveryAdsTargeting;
  hardCapUsd: number;
  costRange: { minUsd: number; maxUsd: number };
  paidCallsMax: number;
  withinCap: boolean;
  cuts: string[];
  notices: string[];
  planHash: string;
};

export function reinforcementPagesFingerprint(pages: ReadonlyArray<Pick<DifferentiationPage, "keywordId" | "keyword" | "url">>): string {
  return differentiationFingerprint(JSON.stringify([...pages].map(page => [page.keywordId, page.keyword, page.url ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
}

function hashMaterial(plan: Omit<ReinforcementSearchPlan, "planHash">) {
  return {
    version: plan.version,
    brandId: plan.brandId,
    searchId: plan.searchId,
    pagesFingerprint: plan.pagesFingerprint,
    pages: plan.pages.map(page => ({ keywordId: page.keywordId, url: page.url, ads: page.ads ?? [], serpCandidates: page.serpCandidates, inRound: page.inRound })),
    prices: plan.prices,
    adsTargeting: plan.adsTargeting,
    hardCapUsd: plan.hardCapUsd,
  };
}

export async function computeReinforcementSearchPlanHash(plan: Omit<ReinforcementSearchPlan, "planHash">): Promise<string> {
  return contentHash(hashMaterial(plan));
}

export async function verifyReinforcementSearchPlanHash(plan: ReinforcementSearchPlan): Promise<boolean> {
  const { planHash, ...resto } = plan;
  return planHash === await computeReinforcementSearchPlanHash(resto);
}

/**
 * O plano de UMA rodada. Por página: o Google Ads com o tema (a keyword
 * publicada) como semente e, com a URL no Vínculo, o tema + a URL — grátis;
 * e a SERP de até 5 candidatas nas 4 lentes — a única parte paga.
 */
export async function buildReinforcementSearchPlan(input: {
  brandId: string;
  searchId: string;
  pages: readonly DifferentiationPage[];
  hardCapUsd?: number;
}): Promise<ReinforcementSearchPlan> {
  const teto = Math.min(input.hardCapUsd ?? REINFORCEMENT_MAX_COST_USD, REINFORCEMENT_MAX_COST_USD);
  const pages: DifferentiationPlanPage[] = input.pages.map((page, indice) => {
    const tema = page.keyword.replace(/\s+/g, " ").trim();
    return {
      keywordId: page.keywordId,
      keyword: page.keyword,
      url: page.url,
      labs: [],
      ads: [
        { callId: `p${indice + 1}:ads:keyword_seed`, kind: "keyword_seed" as const, keywords: [tema], url: null },
        ...(page.url ? [{ callId: `p${indice + 1}:ads:url_seed`, kind: "url_seed" as const, keywords: [tema], url: page.url }] : []),
      ],
      serpCandidates: DIFFERENTIATION_SERP_CANDIDATES_MAX,
      inRound: true,
      note: page.url ? null : "Sem a URL no Vínculo: o Google Ads recebe só o tema, sem a página.",
    };
  });
  const cuts = fitPublishedSearchPagesToCap(pages, teto, "Fora desta rodada pelo teto de US$ 1,00: rode de novo depois, com as outras já reforçadas.");
  const custo = publishedSearchPlanCost(pages);
  const notices = [
    "As keywords novas vêm do Google Ads (o tema e a URL de cada página), sem custo. O custo é só a SERP das candidatas.",
    "Só entram keywords com volume do Google Ads.",
    "Cache de SERP válido não cobra: o custo real costuma ficar abaixo do máximo.",
  ];
  const draft: Omit<ReinforcementSearchPlan, "planHash"> = {
    version: REINFORCEMENT_SEARCH_PLAN_VERSION,
    brandId: input.brandId,
    searchId: input.searchId,
    pagesFingerprint: reinforcementPagesFingerprint(input.pages),
    pages,
    prices: DIFFERENTIATION_PRICES,
    adsTargeting: { ...DIFFERENTIATION_ADS_TARGETING, geoTargetConstants: [...DIFFERENTIATION_ADS_TARGETING.geoTargetConstants] },
    hardCapUsd: teto,
    costRange: custo.costRange,
    paidCallsMax: custo.paidCallsMax,
    withinCap: custo.withinCap(teto),
    cuts,
    notices,
  };
  return { ...draft, planHash: await computeReinforcementSearchPlanHash(draft) };
}

export function authorizeReinforcementSearchPlan(plan: ReinforcementSearchPlan, authorized: { planHash: string; maxCostUsd: number } | null | undefined) {
  return authorizePublishedSearchPlan(plan, authorized, { capUsd: REINFORCEMENT_MAX_COST_USD, capLabel: "por rodada" });
}

/* -------------------------------- candidatas -------------------------------- */

/**
 * O filtro antes da SERP (regra de reforço): só com volume do Google Ads
 * (estimativa não vale); nunca uma publicada da marca nem a própria página.
 * Na ordem de ida à SERP: primeiro as que dividem palavra com o tema da
 * página, depois volume do Google Ads.
 */
export function filterReinforcementCandidates(input: {
  page: Pick<DifferentiationPage, "keyword">;
  candidates: readonly DifferentiationCandidate[];
  blockedNormalized: ReadonlySet<string>;
}): { kept: DifferentiationCandidate[]; refused: DifferentiationCandidateRefusal[] } {
  const tema = new Set(differentiationTokens(input.page.keyword));
  const kept: DifferentiationCandidate[] = [];
  const refused: DifferentiationCandidateRefusal[] = [];
  for (const candidata of input.candidates) {
    if (input.blockedNormalized.has(candidata.normalizedKeyword)) { refused.push({ keyword: candidata.keyword, reason: "É uma keyword publicada da marca: publicadas nunca se fundem." }); continue; }
    const ads = candidata.adsVolume;
    if (!(typeof ads === "number" && Number.isFinite(ads) && ads > 0)) { refused.push({ keyword: candidata.keyword, reason: "Sem volume do Google Ads: não reforça nada." }); continue; }
    const cabe = differentiationTokens(candidata.keyword).some(token => tema.has(token));
    kept.push({ ...candidata, hasVolume: true, entityFit: cabe, tier: cabe ? "entity" : "volume_only" });
  }
  kept.sort((left, right) => Number(right.entityFit) - Number(left.entityFit)
    || (right.adsVolume ?? -1) - (left.adsVolume ?? -1)
    || left.normalizedKeyword.localeCompare(right.normalizedKeyword, "pt-BR"));
  return { kept, refused };
}

/* --------------------------------- avaliação --------------------------------- */

export type ReinforcementSuggestion = {
  /** Id na medida (`cand:<normalizada>`); nunca é id do Minerador. */
  candidateId: string;
  keyword: string;
  normalizedKeyword: string;
  adsVolume: number;
  level: SerpSuggestionLevel;
  sharedPageCount: number;
  /** Curto: "4 páginas em comum no top 10". */
  reason: string;
  /** Já existe no Minerador desta marca (id), ou `null`: keyword nova. */
  existingKeywordId: string | null;
  origins: SubjectDiscoverySource[];
  evidence: string[];
  /** Forte vem marcada (até as vagas do artigo); Provável, desmarcada. */
  preselected: boolean;
};

export type ReinforcementPageState = "found" | "none" | "not_in_round";

export type ReinforcementPageResult = {
  keywordId: string;
  keyword: string;
  url: string | null;
  state: ReinforcementPageState;
  reason: string;
  /** Vagas do artigo (teto de 6). */
  slotsLeft: number;
  suggestions: ReinforcementSuggestion[];
  /** Quantas candidatas com volume foram medidas na SERP. */
  measured: number;
};

const vagasDe = (page: Pick<DifferentiationPage, "articleKeywordCount">) => {
  const atual = typeof page.articleKeywordCount === "number" && page.articleKeywordCount > 0 ? page.articleKeywordCount : 1;
  return Math.max(0, MAX_ARTICLE_KEYWORDS - atual);
};

const comoKeyword = (candidata: DifferentiationCandidate): ArticleFormationKeyword => ({
  keywordId: candidata.candidateId, keyword: candidata.keyword, intent: null, volume: candidata.adsVolume, kgr: null, entity: null, problem: null, isPublished: false,
});

/**
 * O nível de cada candidata medida, pela SERP (D2.2): cada candidata vai para
 * UMA página só — a que divide mais páginas com ela (nenhuma keyword é
 * sugerida a dois publicados). Forte: 3+ páginas. Provável: 2 páginas com
 * palavras (a régua `measureAnchorConvergence`, sem a Lógica). Menos que isso
 * não é sugestão: o Google diz que é outro assunto.
 */
export function evaluateReinforcementSearch(input: {
  pages: readonly DifferentiationPage[];
  inRound: ReadonlySet<string>;
  candidates: Readonly<Record<string, readonly DifferentiationCandidate[]>>;
  serp: SerpSubjectIndex;
}): ReinforcementPageResult[] {
  const paginasNaRodada = input.pages.filter(page => input.inRound.has(page.keywordId));
  // Todas as candidatas medidas, uma vez cada.
  const medidas = new Map<string, DifferentiationCandidate>();
  for (const page of paginasNaRodada) {
    for (const candidata of input.candidates[page.keywordId] || []) {
      if (candidata.serpMeasured && !medidas.has(candidata.candidateId)) medidas.set(candidata.candidateId, candidata);
    }
  }
  const destino = new Map<string, { pageId: string; shared: number }>();
  for (const candidata of medidas.values()) {
    for (const page of paginasNaRodada) {
      const medida = input.serp.overlap(page.keywordId, candidata.candidateId);
      const paginas = medida.strength === "unknown" ? 0 : medida.sharedPageCount;
      const atual = destino.get(candidata.candidateId);
      if (paginas > (atual?.shared ?? 0)) destino.set(candidata.candidateId, { pageId: page.keywordId, shared: paginas });
    }
  }
  return input.pages.map(page => {
    const base = { keywordId: page.keywordId, keyword: page.keyword, url: page.url, slotsLeft: vagasDe(page) };
    if (!input.inRound.has(page.keywordId)) {
      return { ...base, state: "not_in_round" as const, reason: "Fora desta rodada pelo teto de custo.", suggestions: [], measured: 0 };
    }
    const ancora = formationKeywordOfPage(page);
    const sugestoes: ReinforcementSuggestion[] = [];
    for (const candidata of medidas.values()) {
      if (destino.get(candidata.candidateId)?.pageId !== page.keywordId) continue;
      const convergencia = measureAnchorConvergence({ ...ancora, intent: null }, comoKeyword(candidata), { serp: input.serp });
      const level: SerpSuggestionLevel | null = convergencia.basis === "serp" ? "strong" : convergencia.basis === "serp_and_words" ? "probable" : null;
      if (!level || !convergencia.overlap) continue;
      const paginas = convergencia.overlap.sharedPageCount;
      sugestoes.push({
        candidateId: candidata.candidateId,
        keyword: candidata.keyword,
        normalizedKeyword: candidata.normalizedKeyword,
        adsVolume: candidata.adsVolume as number,
        level,
        sharedPageCount: paginas,
        reason: level === "strong" ? `${paginas} páginas em comum no top 10` : `${paginas} páginas e palavras em comum no top 10`,
        existingKeywordId: candidata.existingKeywordId,
        origins: candidata.origins,
        evidence: candidata.evidence.slice(0, 3),
        preselected: false,
      });
    }
    sugestoes.sort((left, right) => (left.level === right.level ? 0 : left.level === "strong" ? -1 : 1)
      || right.adsVolume - left.adsVolume
      || right.sharedPageCount - left.sharedPageCount
      || left.normalizedKeyword.localeCompare(right.normalizedKeyword, "pt-BR"));
    let vagas = base.slotsLeft;
    for (const item of sugestoes) {
      if (vagas <= 0) break;
      if (item.level === "strong") { item.preselected = true; vagas -= 1; }
    }
    const medidasDaPagina = (input.candidates[page.keywordId] || []).filter(item => item.serpMeasured).length;
    if (!sugestoes.length) {
      return {
        ...base,
        state: "none" as const,
        reason: medidasDaPagina
          ? `${medidasDaPagina} candidata(s) com volume foram medidas na SERP, e nenhuma divide 2 ou mais páginas com o artigo: o Google trata como outro assunto.`
          : "O Google Ads não trouxe keyword com volume que chegasse à SERP para este tema.",
        suggestions: [],
        measured: medidasDaPagina,
      };
    }
    const fortes = sugestoes.filter(item => item.level === "strong").length;
    return {
      ...base,
      state: "found" as const,
      reason: `${sugestoes.length} sugestão(ões) com volume do Google Ads: ${fortes} Forte, ${sugestoes.length - fortes} Provável.`,
      suggestions: sugestoes,
      measured: medidasDaPagina,
    };
  });
}

/* ---------------------------------- rodada ---------------------------------- */

export type ReinforcementSearchResult = {
  searchId: string;
  operationRequestId: string;
  executedAt: string;
  pages: ReinforcementPageResult[];
  refusedCount: Record<string, number>;
  /** Pegadas das páginas e das candidatas medidas: o Reforçar confere de novo. */
  footprints: KeywordSerpFootprint[];
  costs: DifferentiationRunResult["costs"];
  serp: DifferentiationSerpOutcome;
  adsFailures: NonNullable<DifferentiationRunResult["adsFailures"]>;
  adsVolumeFailed: boolean;
  ledgerRecording: boolean;
  ledgerWarning: string | null;
  notices: string[];
};

export type ReinforcementSearchOutcome =
  | { ok: true; result: ReinforcementSearchResult }
  | { ok: false; status: number; code: DifferentiationRunErrorCode | "PLAN_ABOVE_CAP"; message: string };

/**
 * A rodada paga, pelo plano autorizado: versão e hash, autorização até
 * US$ 1,00, trava da operação, e o núcleo comum da rodada com o filtro de
 * reforço; depois, a avaliação pela SERP.
 */
export async function runReinforcementSearch(input: {
  brandId: string;
  plan: ReinforcementSearchPlan;
  /** As páginas da rodada, relidas (identidade e vagas do artigo). */
  pages: readonly DifferentiationPage[];
  pageFootprints: readonly KeywordSerpFootprint[];
  publishedNormalized: ReadonlySet<string>;
  existingByNormalized?: ReadonlyMap<string, string> | null;
  operationRequestId: string;
  authorizedPlan: { planHash: string; maxCostUsd: number } | null | undefined;
}, ports: DifferentiationRunPorts): Promise<ReinforcementSearchOutcome> {
  const { plan } = input;
  if (plan.version !== REINFORCEMENT_SEARCH_PLAN_VERSION || !await verifyReinforcementSearchPlanHash(plan)) {
    return { ok: false, status: 409, code: "PLAN_TAMPERED", message: "O plano gravado não confere com o hash dele. Monte um plano novo; nada foi pago." };
  }
  const autorizacao = authorizeReinforcementSearchPlan(plan, input.authorizedPlan);
  if (!autorizacao.ok) return { ok: false, status: autorizacao.code === "PLAN_ABOVE_CAP" ? 422 : 409, code: autorizacao.code, message: autorizacao.message };
  const liberar = acquirePublishedSearchLock(input.brandId, input.operationRequestId);
  if (!liberar) return { ok: false, status: 409, code: "OPERATION_IN_PROGRESS", message: "Esta rodada já está em execução. Aguarde; nada foi pago de novo." };
  try {
    const porId = new Map(input.pages.map(page => [page.keywordId, page]));
    const rodada = await executePublishedSearchRound({
      brandId: input.brandId,
      operationRequestId: input.operationRequestId,
      pages: plan.pages,
      adsTargeting: plan.adsTargeting,
      ledgerMetadata: { operationKind: "published_reinforcement_search", searchId: plan.searchId },
      blockedNormalized: new Set<string>([...input.publishedNormalized, ...plan.pages.map(page => normalizeKeyword(page.keyword))]),
      existingByNormalized: input.existingByNormalized ?? null,
      pageFootprints: input.pageFootprints,
      filter: (page, comVolume, bloqueadas) => filterReinforcementCandidates({ page: porId.get(page.keywordId) ?? page, candidates: comVolume, blockedNormalized: bloqueadas }),
    }, autorizacao.budgetUsd, ports);
    if (!rodada.ok) return rodada;
    const { round } = rodada;
    const naRodada = new Set(plan.pages.filter(page => page.inRound).map(page => page.keywordId));
    const paginas = plan.pages.map(page => porId.get(page.keywordId) ?? { keywordId: page.keywordId, keyword: page.keyword, url: page.url, canonical: null, slug: null, post: "unknown" as const, volume: null, volumeValidated: false, intent: null, entity: null, problem: null, articleId: null, articleKeywordCount: null });
    const avaliacao = evaluateReinforcementSearch({ pages: paginas, inRound: naRodada, candidates: round.candidates, serp: round.index });
    return {
      ok: true,
      result: {
        searchId: plan.searchId,
        operationRequestId: input.operationRequestId,
        executedAt: ports.now().toISOString(),
        pages: avaliacao,
        refusedCount: Object.fromEntries(Object.entries(round.refused).map(([id, lista]) => [id, lista.length])),
        footprints: round.footprints,
        costs: round.costs,
        serp: round.serp,
        adsFailures: round.adsFailures,
        adsVolumeFailed: round.adsVolumeFailed,
        ledgerRecording: round.ledgerRecording,
        ledgerWarning: round.ledgerWarning,
        notices: round.notices,
      },
    };
  } finally {
    liberar();
  }
}

/** A frase do resultado, em português simples: o que foi achado e que nada foi gravado. */
export function describeReinforcementSearchResult(result: Pick<ReinforcementSearchResult, "pages" | "costs">): string {
  const achados = result.pages.filter(page => page.state === "found");
  const sugestoes = achados.reduce((total, page) => total + page.suggestions.length, 0);
  const custo = `US$ ${result.costs.reportedCostUsd.toFixed(3)}`;
  if (!achados.length) return `Busca feita (${custo}). Nenhum publicado ganhou sugestão: o Google trata as keywords com volume como outro assunto. Nada foi gravado.`;
  return `Busca feita (${custo}). ${achados.length} publicado(s) ganharam ${sugestoes} sugestão(ões) com volume. Nada foi gravado ainda. Para gravar: marque e use "Reforçar publicados".`;
}
