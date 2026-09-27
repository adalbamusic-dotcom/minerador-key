/**
 * DIFERENCIAR PUBLICADOS — plano pago, rodada e avaliação (SDD 3.3 a 3.5 e §4).
 *
 * O plano mostra a faixa de custo antes de qualquer chamada, com os preços que
 * já estão no código (Pesquisa por Assunto e SERP do Arquiteto). Teto rígido de
 * US$ 0,50 POR GRUPO (Q2): plano acima do teto é cortado aqui, e cada corte vira
 * uma frase para a tela. O `planHash` (SHA-256) cobre tudo o que decide o que se
 * paga; a rodada só paga o plano autorizado, com orçamento em dólares.
 *
 * A rodada usa o MESMO núcleo da Pesquisa por Assunto — as portas
 * `SubjectDiscoveryExecutionPorts` (Labs, SERP com cache e ledger), o
 * orçamento `createSubjectDiscoveryBudget`, a junção
 * `mergeSubjectDiscoveryCandidates`, o pedido de SERP nas 4 lentes
 * `subjectDiscoverySerpRequests` e a chave de idempotência do ledger. Nada
 * paralelo. Só DataForSEO (Serper e RapidAPI nunca). O volume do Google Ads é
 * grátis e vem por uma porta própria (métricas históricas, a mesma do Minerador).
 *
 * A avaliação decide pela SERP (A2): separação (a keyword proposta para uma
 * página divide no máximo 1 página do top 10 com as propostas das irmãs) e
 * encaixe (divide 2 ou mais com a própria página). A IA não decide nada aqui.
 *
 * Domínio puro, com portas. Testes usam fixtures: nenhuma chamada paga.
 */
import { contentHash } from "./versioning.ts";
import { SERP_PAID_QUERY_COST_USD } from "./serp-lens-plan.ts";
import {
  buildSerpSubjectIndex,
  normalizeSerpPageUrl,
  type KeywordSerpFootprint,
  type SerpSubjectIndex,
  type SerpSubjectLensReading,
} from "./serp-subject-overlap.ts";
import { proposePublishedPrimarySwap, type PublishedPrimarySwapCandidate } from "./published-primary-swap.ts";
import {
  differentiationPostNote,
  differentiationSlotsLeft,
  differentiationTokens,
  fitsSlugEntity,
  formationKeywordOfPage,
  rankingBlocksSwap,
  type DifferentiationAngle,
  type DifferentiationGroup,
  type DifferentiationGroupMember,
} from "./published-differentiation.ts";
import {
  DATAFORSEO_LABS_LANGUAGE_CODE,
  DATAFORSEO_LABS_LOCATION_CODE,
  DATAFORSEO_LABS_RESEARCH_ENDPOINTS,
  DataForSeoLabsResearchError,
  type DataForSeoLabsResearchRequest,
} from "../minerador/dataforseo-labs-keyword-research-core.ts";
import {
  SUBJECT_DISCOVERY_LABS_CALL_MAX_USD,
  SUBJECT_DISCOVERY_PRICES,
  createSubjectDiscoveryBudget,
  subjectDiscoveryLedgerKey,
  type SubjectDiscoveryPaidCall,
} from "../minerador/subject-discovery-plan.ts";
import {
  mergeSubjectDiscoveryCandidates,
  subjectDiscoverySerpRequests,
  type SubjectDiscoveryContribution,
  type SubjectDiscoveryExecutionPorts,
} from "../minerador/subject-discovery-search.ts";
import type { SubjectDiscoverySource } from "../minerador/subject-discovery-plan.ts";
import { subjectDiscoveryHasVolume } from "../minerador/subject-discovery-volume.ts";
import { normalizeKeyword } from "../minerador/keyword-import-core.ts";

/* ---------------------------------- preços ---------------------------------- */

export const DIFFERENTIATION_PLAN_VERSION = "published-differentiation-plan-v1" as const;

/** Teto por grupo aceito pelo dono (Q2). O servidor nunca paga acima dele. */
export const DIFFERENTIATION_MAX_COST_USD = 0.5;
/** Até 5 candidatas por página vão à SERP, ordenadas por volume (SDD 3.4). */
export const DIFFERENTIATION_SERP_CANDIDATES_MAX = 5;
/** Piso do corte: menos que 2 candidatas não compara nada. */
export const DIFFERENTIATION_SERP_CANDIDATES_MIN = 2;
/** Candidatas por página que vão ao Google Ads (grátis) depois do filtro. */
export const DIFFERENTIATION_ADS_CANDIDATES_PER_PAGE = 60;

/** Os preços que já estão no código, só lidos. */
export const DIFFERENTIATION_PRICES = Object.freeze({
  labsTaskUsd: SUBJECT_DISCOVERY_PRICES.labsTaskUsd,
  labsItemUsd: SUBJECT_DISCOVERY_PRICES.labsItemUsd,
  labsCallMaxUsd: SUBJECT_DISCOVERY_LABS_CALL_MAX_USD,
  serpCanonicalUsd: SERP_PAID_QUERY_COST_USD.canonicalDepth20,
  serpOtherLensMinUsd: SERP_PAID_QUERY_COST_USD.otherLensMin,
  serpOtherLensMaxUsd: SERP_PAID_QUERY_COST_USD.otherLensMax,
  consultedAt: SUBJECT_DISCOVERY_PRICES.consultedAt,
  source: SUBJECT_DISCOVERY_PRICES.source,
});

const MICROS = 1_000_000;
const toMicros = (usd: number) => Math.round(usd * MICROS);
const fromMicros = (micros: number) => micros / MICROS;

/** As 4 lentes na ordem do produto; a primeira é a canônica. */
const LENS_COUNT = 4;
const lensMaxMicros = (lensIndex: number) => toMicros(lensIndex === 0 ? DIFFERENTIATION_PRICES.serpCanonicalUsd : DIFFERENTIATION_PRICES.serpOtherLensMaxUsd);
/** Uma keyword nas 4 lentes, no máximo: 0,0035 + 3 × 0,0035 = 0,014. */
export const DIFFERENTIATION_SERP_KEYWORD_MAX_USD = fromMicros(Array.from({ length: LENS_COUNT }, (_, indice) => lensMaxMicros(indice)).reduce((total, valor) => total + valor, 0));

/* ---------------------------------- plano ---------------------------------- */

export type DifferentiationLabsEndpoint = "ranked_keywords" | "keyword_ideas" | "related_keywords";

export type DifferentiationLabsCall = {
  callId: string;
  endpoint: DifferentiationLabsEndpoint;
  /** A URL (ranked) ou a semente (ideas, related). */
  input: string;
};

export type DifferentiationPlanPage = {
  keywordId: string;
  keyword: string;
  url: string | null;
  labs: DifferentiationLabsCall[];
  /** Quantas candidatas desta página vão à SERP (4 lentes cada). */
  serpCandidates: number;
  /** Fora desta rodada pelo teto: nada é pago para ela. */
  inRound: boolean;
  note: string | null;
};

export type DifferentiationPlan = {
  version: typeof DIFFERENTIATION_PLAN_VERSION;
  brandId: string;
  groupId: string;
  serpFingerprint: string;
  pages: DifferentiationPlanPage[];
  aiUsed: boolean;
  prices: typeof DIFFERENTIATION_PRICES;
  hardCapUsd: number;
  /** Mínimo: só as tarefas Labs, sem item e com a SERP toda no cache. Máximo: tudo pago. */
  costRange: { minUsd: number; maxUsd: number };
  paidCallsMax: number;
  withinCap: boolean;
  /** O que o teto cortou, em frases curtas. */
  cuts: string[];
  notices: string[];
  planHash: string;
};

const serpSlotId = (pageIndex: number, candidate: number, lensIndex: number) => `p${pageIndex + 1}:serp:${candidate}:${lensIndex + 1}`;
const labsCallId = (pageIndex: number, endpoint: DifferentiationLabsEndpoint) => `p${pageIndex + 1}:${endpoint}`;

function planCostMicros(pages: readonly DifferentiationPlanPage[]) {
  let min = 0;
  let max = 0;
  let calls = 0;
  for (const page of pages) {
    if (!page.inRound) continue;
    for (let indice = 0; indice < page.labs.length; indice += 1) {
      min += toMicros(DIFFERENTIATION_PRICES.labsTaskUsd);
      max += toMicros(DIFFERENTIATION_PRICES.labsCallMaxUsd);
      calls += 1;
    }
    for (let candidata = 0; candidata < page.serpCandidates; candidata += 1) {
      for (let lente = 0; lente < LENS_COUNT; lente += 1) { max += lensMaxMicros(lente); calls += 1; }
    }
  }
  return { min, max, calls };
}

function hashMaterial(plan: Omit<DifferentiationPlan, "planHash">) {
  return {
    version: plan.version,
    brandId: plan.brandId,
    groupId: plan.groupId,
    serpFingerprint: plan.serpFingerprint,
    pages: plan.pages.map(page => ({ keywordId: page.keywordId, url: page.url, labs: page.labs, serpCandidates: page.serpCandidates, inRound: page.inRound })),
    prices: plan.prices,
    hardCapUsd: plan.hardCapUsd,
  };
}

export async function computeDifferentiationPlanHash(plan: Omit<DifferentiationPlan, "planHash">): Promise<string> {
  return contentHash(hashMaterial(plan));
}

/** O plano relido do banco é o mesmo que o humano viu? */
export async function verifyDifferentiationPlanHash(plan: DifferentiationPlan): Promise<boolean> {
  const { planHash, ...resto } = plan;
  return planHash === await computeDifferentiationPlanHash(resto);
}

/**
 * O plano pago de UM grupo. Por página: `ranked_keywords` da URL (se houver),
 * `keyword_ideas` com a semente do ângulo, `related_keywords` com a semente da
 * IA ou a própria keyword, e a SERP de até 5 candidatas nas 4 lentes.
 *
 * Acima de US$ 0,50, corta nesta ordem, até caber: candidatas na SERP (5 → 3),
 * pesquisas relacionadas (da última página para a primeira), candidatas (3 → 2)
 * e, por fim, páginas do fim do grupo (ficam para outra rodada; sempre sobram 2).
 */
export async function buildDifferentiationPlan(input: {
  brandId: string;
  group: Pick<DifferentiationGroup, "groupId" | "serpFingerprint" | "members">;
  angles: readonly DifferentiationAngle[];
  aiUsed: boolean;
  hardCapUsd?: number;
}): Promise<DifferentiationPlan> {
  const teto = Math.min(input.hardCapUsd ?? DIFFERENTIATION_MAX_COST_USD, DIFFERENTIATION_MAX_COST_USD);
  const angulos = new Map(input.angles.map(angle => [angle.keywordId, angle]));
  const notices: string[] = [];
  const pages: DifferentiationPlanPage[] = input.group.members.map((member, indice) => {
    const angulo = angulos.get(member.page.keywordId);
    const labs: DifferentiationLabsCall[] = [];
    if (member.page.url) labs.push({ callId: labsCallId(indice, "ranked_keywords"), endpoint: "ranked_keywords", input: member.page.url });
    labs.push({ callId: labsCallId(indice, "keyword_ideas"), endpoint: "keyword_ideas", input: angulo?.ideasSeed || member.page.keyword });
    labs.push({ callId: labsCallId(indice, "related_keywords"), endpoint: "related_keywords", input: angulo?.relatedSeed || member.page.keyword });
    return {
      keywordId: member.page.keywordId,
      keyword: member.page.keyword,
      url: member.page.url,
      labs,
      serpCandidates: DIFFERENTIATION_SERP_CANDIDATES_MAX,
      inRound: true,
      note: member.page.url ? null : "Sem a URL no Vínculo: o que o Google associa à página (ranked_keywords) fica de fora.",
    };
  });

  const acima = () => planCostMicros(pages).max > toMicros(teto);
  let candidatasCortadas = false;
  const semRelacionadas: string[] = [];
  const foraDaRodada: string[] = [];
  const reduzirCandidatas = (piso: number) => {
    while (acima()) {
      const alvo = [...pages].reverse().find(page => page.inRound && page.serpCandidates > piso);
      if (!alvo) return;
      alvo.serpCandidates -= 1;
      candidatasCortadas = true;
    }
  };
  reduzirCandidatas(3);
  while (acima()) {
    const alvo = [...pages].reverse().find(page => page.inRound && page.labs.some(call => call.endpoint === "related_keywords"));
    if (!alvo) break;
    alvo.labs = alvo.labs.filter(call => call.endpoint !== "related_keywords");
    semRelacionadas.push(alvo.keyword);
  }
  reduzirCandidatas(DIFFERENTIATION_SERP_CANDIDATES_MIN);
  while (acima() && pages.filter(page => page.inRound).length > 2) {
    const alvo = [...pages].reverse().find(page => page.inRound)!;
    alvo.inRound = false;
    alvo.note = "Fora desta rodada pelo teto de US$ 0,50 por grupo: rode de novo depois, com as outras já diferenciadas.";
    foraDaRodada.push(alvo.keyword);
  }

  const cuts: string[] = [];
  if (candidatasCortadas) {
    const faixas = pages.filter(page => page.inRound).map(page => page.serpCandidates);
    const menor = Math.min(...faixas);
    const maior = Math.max(...faixas);
    cuts.push(`SERP de ${menor === maior ? menor : `${menor} a ${maior}`} candidatas por página, em vez de ${DIFFERENTIATION_SERP_CANDIDATES_MAX}.`);
  }
  if (semRelacionadas.length) cuts.push(`Sem pesquisas relacionadas em ${semRelacionadas.length} página(s): ${semRelacionadas.map(nome => `"${nome}"`).join(", ")}.`);
  if (foraDaRodada.length) cuts.push(`Fora desta rodada: ${foraDaRodada.map(nome => `"${nome}"`).join(", ")}.`);
  if (input.aiUsed) notices.push("A IA sugeriu sementes: são a autoridade mais baixa. Volume e SERP decidem.");
  notices.push("Cache de SERP válido não cobra: o custo real costuma ficar abaixo do máximo.");
  notices.push("O volume do Google Ads não custa nada.");

  const custo = planCostMicros(pages);
  const draft: Omit<DifferentiationPlan, "planHash"> = {
    version: DIFFERENTIATION_PLAN_VERSION,
    brandId: input.brandId,
    groupId: input.group.groupId,
    serpFingerprint: input.group.serpFingerprint,
    pages,
    aiUsed: input.aiUsed,
    prices: DIFFERENTIATION_PRICES,
    hardCapUsd: teto,
    costRange: { minUsd: fromMicros(custo.min), maxUsd: fromMicros(custo.max) },
    paidCallsMax: custo.calls,
    withinCap: custo.max <= toMicros(teto),
    cuts,
    notices,
  };
  return { ...draft, planHash: await computeDifferentiationPlanHash(draft) };
}

/** As chamadas pagas planejadas, com o custo máximo de cada vaga (o orçamento as consome). */
export function listDifferentiationPaidCalls(plan: Pick<DifferentiationPlan, "pages">): SubjectDiscoveryPaidCall[] {
  const calls: SubjectDiscoveryPaidCall[] = [];
  plan.pages.forEach((page, pageIndex) => {
    if (!page.inRound) return;
    for (const call of page.labs) calls.push({ callId: call.callId, endpoint: call.endpoint, n: pageIndex + 1, maxCostUsd: DIFFERENTIATION_PRICES.labsCallMaxUsd, lens: null });
    for (let candidata = 1; candidata <= page.serpCandidates; candidata += 1) {
      for (let lente = 0; lente < LENS_COUNT; lente += 1) {
        calls.push({ callId: serpSlotId(pageIndex, candidata, lente), endpoint: "serp", n: pageIndex + 1, maxCostUsd: fromMicros(lensMaxMicros(lente)), lens: String(lente + 1) });
      }
    }
  });
  return calls;
}

export type DifferentiationAuthorization =
  | { ok: true; budgetUsd: number }
  | { ok: false; code: "PAID_PLAN_REQUIRED" | "PAID_PLAN_CHANGED" | "DIFFERENTIATION_PLAN_ABOVE_CAP"; message: string };

/** A rodada só paga o plano autorizado inteiro, até o teto do grupo. */
export function authorizeDifferentiationPlan(
  plan: Pick<DifferentiationPlan, "planHash" | "costRange" | "hardCapUsd" | "withinCap">,
  authorized: { planHash: string; maxCostUsd: number } | null | undefined,
): DifferentiationAuthorization {
  if (!plan.withinCap || toMicros(plan.costRange.maxUsd) > toMicros(DIFFERENTIATION_MAX_COST_USD)) {
    return { ok: false, code: "DIFFERENTIATION_PLAN_ABOVE_CAP", message: `O plano custaria até US$ ${plan.costRange.maxUsd.toFixed(3)}, acima do teto de US$ ${DIFFERENTIATION_MAX_COST_USD.toFixed(2)} por grupo. Nada foi pago.` };
  }
  if (!authorized || typeof authorized.planHash !== "string" || !Number.isFinite(authorized.maxCostUsd) || authorized.maxCostUsd <= 0) {
    return { ok: false, code: "PAID_PLAN_REQUIRED", message: `A rodada custa até US$ ${plan.costRange.maxUsd.toFixed(3)}. Confirme o custo antes; nada foi pago.` };
  }
  if (authorized.planHash !== plan.planHash || toMicros(plan.costRange.maxUsd) > toMicros(authorized.maxCostUsd)) {
    return { ok: false, code: "PAID_PLAN_CHANGED", message: "O plano mudou desde a confirmação. Nada foi pago; confira o plano novo." };
  }
  return { ok: true, budgetUsd: fromMicros(Math.min(toMicros(authorized.maxCostUsd), toMicros(plan.hardCapUsd), toMicros(DIFFERENTIATION_MAX_COST_USD))) };
}

/* -------------------------------- candidatas -------------------------------- */

/** Faixa de prioridade para ir à SERP: cabe pela entidade, o Google associa à URL, ou só volume. */
export type DifferentiationCandidateTier = "entity" | "ranked" | "volume_only";

export type DifferentiationCandidate = {
  /** Id na medida (`cand:<keyword normalizada>`); nunca é id de keyword do Minerador. */
  candidateId: string;
  keyword: string;
  normalizedKeyword: string;
  origins: SubjectDiscoverySource[];
  evidence: string[];
  /** Média mensal do Google Ads. É o único volume que vale para principal nova. */
  adsVolume: number | null;
  /** Estimativa DataForSEO, rotulada; nunca vira Volume. */
  estimate: number | null;
  hasVolume: boolean;
  entityFit: boolean;
  /** Veio do `ranked_keywords` da URL: o Google já associa a keyword à página. */
  rankedByUrl: boolean;
  tier: DifferentiationCandidateTier;
  /** A keyword já existe no Minerador desta marca (indicativo). */
  existingKeywordId: string | null;
  /** Tem páginas da SERP (cache ou coletada) para medir. */
  serpMeasured: boolean;
};

export type DifferentiationCandidateRefusal = { keyword: string; reason: string };

export const differentiationCandidateId = (normalized: string) => `cand:${normalized}`;

const ORDEM_DA_FAIXA: Record<DifferentiationCandidateTier, number> = { entity: 0, ranked: 1, volume_only: 2 };

/** Ordem de ida à SERP: faixa, volume do Google Ads, estimativa, palavra. */
export function compareDifferentiationCandidates(left: DifferentiationCandidate, right: DifferentiationCandidate): number {
  return ORDEM_DA_FAIXA[left.tier] - ORDEM_DA_FAIXA[right.tier]
    || (right.adsVolume ?? -1) - (left.adsVolume ?? -1)
    || (right.estimate ?? -1) - (left.estimate ?? -1)
    || left.normalizedKeyword.localeCompare(right.normalizedKeyword, "pt-BR");
}

/**
 * O filtro da SDD 3.3, antes da SERP: só com volume (D2.3); nunca a própria
 * keyword, outra publicada da marca ou o ângulo de uma irmã (tem palavra só
 * dela e nenhuma desta página). Cabe pela entidade do slug; se não couber, só
 * vale se o Google a associar à URL ou, depois, se a SERP provar 2 páginas em
 * comum com a principal atual.
 */
export function filterDifferentiationCandidates(input: {
  candidates: readonly DifferentiationCandidate[];
  angle: Pick<DifferentiationAngle, "entityTokens" | "distinctTokens">;
  siblingDistinctTokens: readonly string[];
  blockedNormalized: ReadonlySet<string>;
  /** As palavras da keyword publicada: entidade de uma palavra só precisa de mais uma delas. */
  pageTokens?: readonly string[] | null;
}): { kept: DifferentiationCandidate[]; refused: DifferentiationCandidateRefusal[] } {
  const kept: DifferentiationCandidate[] = [];
  const refused: DifferentiationCandidateRefusal[] = [];
  const proprias = new Set(input.angle.distinctTokens);
  const dasIrmas = new Set(input.siblingDistinctTokens.filter(token => !proprias.has(token)));
  for (const candidata of input.candidates) {
    if (input.blockedNormalized.has(candidata.normalizedKeyword)) { refused.push({ keyword: candidata.keyword, reason: "É uma keyword publicada da marca: publicadas nunca se fundem." }); continue; }
    if (!candidata.hasVolume) { refused.push({ keyword: candidata.keyword, reason: "Sem volume: não reforça nada (D2.3)." }); continue; }
    const tokens = differentiationTokens(candidata.keyword);
    const daIrma = tokens.some(token => dasIrmas.has(token)) && !tokens.some(token => proprias.has(token));
    if (daIrma) { refused.push({ keyword: candidata.keyword, reason: "É o ângulo de uma página irmã." }); continue; }
    const entityFit = fitsSlugEntity(candidata.keyword, input.angle.entityTokens, input.pageTokens);
    kept.push({ ...candidata, entityFit, tier: entityFit ? "entity" : candidata.rankedByUrl ? "ranked" : "volume_only" });
  }
  kept.sort(compareDifferentiationCandidates);
  return { kept, refused };
}

/* --------------------------------- avaliação --------------------------------- */

export type DifferentiationState = "differentiated" | "weak" | "no_way_out";

export const DIFFERENTIATION_STATE_LABELS: Readonly<Record<DifferentiationState, string>> = Object.freeze({
  differentiated: "Diferenciado",
  weak: "Diferenciação fraca",
  no_way_out: "Sem saída pelo provider",
});

export type DifferentiationChoice = {
  candidateId: string;
  keyword: string;
  adsVolume: number | null;
  estimate: number | null;
  origins: SubjectDiscoverySource[];
  evidence: string[];
  existingKeywordId: string | null;
  /** Páginas em comum com a própria página (principal atual, keywords da URL ou as outras escolhidas). */
  sharedWithPage: number;
  /** O pior caso contra as propostas de cada irmã. */
  sharedWithSiblings: number;
  separationOk: boolean;
  fitOk: boolean;
};

export type DifferentiationPageResult = {
  keywordId: string;
  keyword: string;
  url: string | null;
  post: DifferentiationGroupMember["page"]["post"];
  ranking: DifferentiationGroupMember["ranking"];
  angle: string;
  state: DifferentiationState;
  reason: string;
  /** Só com Posto Livre, sem ranquear e com volume do Google Ads maior que o da atual. */
  newPrincipal: DifferentiationChoice | null;
  /** Por que não há principal nova (ou `null` quando há). */
  principalNote: string | null;
  secondaries: DifferentiationChoice[];
  /** Posto Travado, ranqueando ou teto: a diferenciação fica mais fraca. */
  warning: string | null;
  /**
   * "Diferenciação fraca": a melhor candidata que cabe no slug, SÓ como
   * evidência — ela falha a separação ou o encaixe, então nunca entra no
   * aceite (`secondaries` fica vazia). Ausente em avaliações antigas.
   */
  bestEffort?: DifferentiationChoice | null;
  /** As candidatas medidas, para a tela mostrar a evidência. */
  measured: DifferentiationChoice[];
  inRound: boolean;
};

export type DifferentiationPairMeasure = { leftKeywordId: string; rightKeywordId: string; sharedPageCount: number };

export type DifferentiationEvaluation = {
  state: DifferentiationState;
  reason: string;
  pages: DifferentiationPageResult[];
  before: DifferentiationPairMeasure[];
  after: DifferentiationPairMeasure[];
};

const paginasDaPegada = (serp: SerpSubjectIndex, id: string): Set<string> => {
  const paginas = new Set<string>();
  for (const leitura of serp.footprint(id)?.lenses || []) {
    for (const url of leitura.urls || []) { const normal = normalizeSerpPageUrl(url); if (normal) paginas.add(normal); }
  }
  return paginas;
};

const uniao = (serp: SerpSubjectIndex, ids: readonly string[]) => {
  const todas = new Set<string>();
  for (const id of ids) for (const pagina of paginasDaPegada(serp, id)) todas.add(pagina);
  return todas;
};

const emComum = (a: ReadonlySet<string>, b: ReadonlySet<string>) => { let total = 0; for (const item of a) if (b.has(item)) total += 1; return total; };

/**
 * A avaliação de um grupo depois da rodada (SDD 3.4 e 3.5).
 *
 * Por página, na ordem do volume, escolhe até 3 (Posto Livre sem ranquear:
 * principal nova + 2 secundárias) ou 2 (Travado, ranqueando ou Posto não
 * declarado: só secundárias), dentro do teto de 6. Uma candidata entra quando
 * divide no máximo 1 página com cada irmã — a principal que a irmã MANTÉM
 * (Travado, ranqueando, sem Posto ou Livre sem troca) mais as propostas dela —
 * e 2 ou mais com a própria página. "Fraca" mostra a melhor que cabe no slug
 * só como evidência: nada dela entra no aceite. A
 * principal nova passa pela MESMA régua da troca (`proposePublishedPrimarySwap`,
 * D2.1): volume do Google Ads maior, mesma intenção e SERP em comum.
 */
export function evaluateDifferentiation(input: {
  group: Pick<DifferentiationGroup, "members" | "strongPairs">;
  angles: readonly DifferentiationAngle[];
  candidates: ReadonlyMap<string, readonly DifferentiationCandidate[]>;
  serp: SerpSubjectIndex;
  inRound?: ReadonlySet<string>;
}): DifferentiationEvaluation {
  const { serp } = input;
  const membros = input.group.members;
  const angulos = new Map(input.angles.map(angle => [angle.keywordId, angle]));
  const naRodada = (member: DifferentiationGroupMember) => !input.inRound || input.inRound.has(member.page.keywordId);
  const trocaPermitida = (member: DifferentiationGroupMember) => member.page.post === "free" && !rankingBlocksSwap(member.ranking);
  const vagas = (member: DifferentiationGroupMember) => Math.min(differentiationSlotsLeft(member.page), trocaPermitida(member) ? 3 : 2);
  const ordenadas = (keywordId: string) => [...(input.candidates.get(keywordId) || [])].filter(item => item.hasVolume && item.serpMeasured).sort(compareDifferentiationCandidates);

  /*
   * QUEM MANTÉM A PRINCIPAL continua sendo medido por ela: Travado, ranqueando,
   * Posto não declarado, fora da rodada e — depois de cada passada — a Livre
   * que não ganhou principal nova pela régua da troca. A separação de uma
   * candidata é medida contra a principal MANTIDA de cada irmã mais as
   * propostas dela. A antiga principal de uma página que troca vira secundária
   * (nenhuma keyword some), mas deixa de ser o alvo da página: não entra.
   * O conjunto só cresce, então as passadas terminam.
   */
  const mantem = new Set(membros.filter(member => !trocaPermitida(member) || !naRodada(member)).map(member => member.page.keywordId));
  const semTroca = new Map<string, string>();
  let propostas = new Map<string, DifferentiationCandidate[]>();
  let principais = new Map<string, DifferentiationCandidate | null>();

  const referencia = (keywordId: string, atuais: ReadonlyMap<string, readonly DifferentiationCandidate[]>) => {
    const lista = atuais.get(keywordId) || [];
    return [...(mantem.has(keywordId) || !lista.length ? [keywordId] : []), ...lista.map(item => item.candidateId)];
  };
  const medidas = (member: DifferentiationGroupMember, candidata: DifferentiationCandidate, atuais: ReadonlyMap<string, readonly DifferentiationCandidate[]>) => {
    const paginas = paginasDaPegada(serp, candidata.candidateId);
    const irmas = membros.filter(outro => outro.page.keywordId !== member.page.keywordId);
    const sharedWithSiblings = irmas.reduce((pior, irma) => Math.max(pior, emComum(paginas, uniao(serp, referencia(irma.page.keywordId, atuais)))), 0);
    const daUrl = (input.candidates.get(member.page.keywordId) || []).filter(item => item.rankedByUrl && item.serpMeasured).map(item => item.candidateId);
    const refs = [member.page.keywordId, ...daUrl, ...(atuais.get(member.page.keywordId) || []).map(item => item.candidateId)].filter(id => id !== candidata.candidateId);
    const sharedWithPage = refs.reduce((melhor, id) => Math.max(melhor, emComum(paginas, paginasDaPegada(serp, id))), 0);
    return { sharedWithSiblings, sharedWithPage };
  };
  const selecionar = () => {
    const escolhidas = new Set<string>();
    const atuais = new Map<string, DifferentiationCandidate[]>(membros.map(member => [member.page.keywordId, []]));
    for (let rodada = 0; rodada < 3; rodada += 1) {
      for (const member of membros) {
        if (!naRodada(member)) continue;
        const lista = atuais.get(member.page.keywordId)!;
        if (lista.length >= vagas(member)) continue;
        for (const candidata of ordenadas(member.page.keywordId)) {
          if (escolhidas.has(candidata.candidateId)) continue;
          const medida = medidas(member, candidata, atuais);
          if (medida.sharedWithSiblings <= 1 && medida.sharedWithPage >= 2) {
            lista.push(candidata);
            escolhidas.add(candidata.candidateId);
            break;
          }
        }
      }
    }
    return atuais;
  };
  // Principal nova só pela régua da troca (D2.1) e só no Posto Livre sem ranquear (Q3).
  const principalDe = (member: DifferentiationGroupMember, lista: readonly DifferentiationCandidate[]): DifferentiationCandidate | null => {
    if (mantem.has(member.page.keywordId) || !lista.length) return null;
    const page = member.page;
    const troca = proposePublishedPrimarySwap({
      published: formationKeywordOfPage(page),
      post: "free",
      identity: { url: page.url, canonical: page.canonical, slug: page.slug },
      candidates: lista.map((item): PublishedPrimarySwapCandidate => ({
        keywordId: item.candidateId, keyword: item.keyword, intent: null, volume: item.adsVolume, kgr: null,
        entity: null, problem: null, isPublished: false, volumeValidated: typeof item.adsVolume === "number" && item.adsVolume > 0,
      })),
      serp,
    });
    return troca.state === "proposed" && troca.substitute ? lista.find(item => item.candidateId === troca.substitute!.keywordId) || null : null;
  };
  for (let passada = 0; passada <= membros.length; passada += 1) {
    propostas = selecionar();
    principais = new Map(membros.map(member => [member.page.keywordId, principalDe(member, propostas.get(member.page.keywordId) || [])]));
    const novas = membros.filter(member => !mantem.has(member.page.keywordId) && !principais.get(member.page.keywordId));
    if (!novas.length) break;
    for (const member of novas) {
      mantem.add(member.page.keywordId);
      semTroca.set(member.page.keywordId, (propostas.get(member.page.keywordId) || []).length
        ? "Nenhuma candidata tem volume do Google Ads maior que o da principal atual e SERP em comum com ela (a régua da troca): a principal atual fica."
        : "Nenhuma candidata passou na separação e no encaixe: a principal atual fica.");
    }
  }

  const escolha = (member: DifferentiationGroupMember, candidata: DifferentiationCandidate): DifferentiationChoice => {
    const medida = medidas(member, candidata, propostas);
    return {
      candidateId: candidata.candidateId,
      keyword: candidata.keyword,
      adsVolume: candidata.adsVolume,
      estimate: candidata.estimate,
      origins: candidata.origins,
      evidence: candidata.evidence,
      existingKeywordId: candidata.existingKeywordId,
      sharedWithPage: medida.sharedWithPage,
      sharedWithSiblings: medida.sharedWithSiblings,
      separationOk: medida.sharedWithSiblings <= 1,
      fitOk: medida.sharedWithPage >= 2,
    };
  };

  const pages: DifferentiationPageResult[] = membros.map(member => {
    const page = member.page;
    const angulo = angulos.get(page.keywordId);
    const todas = input.candidates.get(page.keywordId) || [];
    const medidasTodas = ordenadas(page.keywordId).map(item => ({ candidata: item, choice: escolha(member, item) }));
    const base = {
      keywordId: page.keywordId, keyword: page.keyword, url: page.url, post: page.post, ranking: member.ranking,
      angle: angulo?.aiLabel && !angulo.distinctTokens.length ? angulo.aiLabel : angulo?.label || page.keyword,
      measured: medidasTodas.slice(0, 12).map(item => item.choice), inRound: naRodada(member),
    };
    if (!naRodada(member)) {
      return { ...base, state: "weak" as const, reason: "Fora desta rodada pelo teto de custo.", newPrincipal: null, principalNote: null, secondaries: [], warning: null, bestEffort: null };
    }

    // Guarda: só entra o que passa nos DOIS critérios, medido com as escolhas finais.
    const lista = (propostas.get(page.keywordId) || []).map(item => escolha(member, item)).filter(item => item.separationOk && item.fitOk);
    const principal = principais.get(page.keywordId) || null;
    const newPrincipal = principal ? lista.find(item => item.candidateId === principal.candidateId) || null : null;
    const principalNote = newPrincipal
      ? null
      : !trocaPermitida(member)
        ? differentiationPostNote(page, member.ranking)
        : semTroca.get(page.keywordId) || "Nenhuma candidata passou na separação e no encaixe: a principal atual fica.";
    const secondaries = lista.filter(item => item.candidateId !== newPrincipal?.candidateId).slice(0, 2);
    const warning = trocaPermitida(member)
      ? (differentiationSlotsLeft(page) < 3 ? `O artigo já tem ${page.articleKeywordCount} keywords: cabem só ${differentiationSlotsLeft(page)} (teto de 6).` : null)
      : differentiationPostNote(page, member.ranking);

    if (newPrincipal || secondaries.length) {
      return { ...base, state: "differentiated" as const, reason: newPrincipal ? `Principal nova "${newPrincipal.keyword}" e ${secondaries.length} secundária(s), sem dividir mais de 1 página com as irmãs.` : `${secondaries.length} secundária(s) com volume, sem dividir mais de 1 página com as irmãs.`, newPrincipal, principalNote, secondaries, warning, bestEffort: null };
    }
    // Sem escolha limpa: a melhor possível QUE CABE NO SLUG, só como evidência (fraca), ou sem saída.
    const comVolume = todas.filter(item => item.hasVolume);
    const cabem = comVolume.filter(item => item.entityFit || item.rankedByUrl || item.serpMeasured);
    if (!cabem.length) {
      return { ...base, state: "no_way_out" as const, reason: comVolume.length ? "Nenhuma keyword com volume cabe no slug." : "O provider não trouxe keyword com volume para este ângulo.", newPrincipal: null, principalNote, secondaries: [], warning, bestEffort: null };
    }
    const melhor = medidasTodas
      .filter(item => item.candidata.entityFit || item.candidata.rankedByUrl || item.choice.fitOk)
      .map(item => item.choice)
      .sort((left, right) => left.sharedWithSiblings - right.sharedWithSiblings || right.sharedWithPage - left.sharedWithPage || (right.adsVolume ?? -1) - (left.adsVolume ?? -1))[0] || null;
    if (!melhor) {
      const semSerp = cabem.every(item => !item.serpMeasured);
      return { ...base, state: semSerp ? "weak" as const : "no_way_out" as const, reason: semSerp ? "As candidatas ficaram sem SERP para medir (cache ilegível, coleta falhou ou orçamento)." : "Nenhuma keyword com volume cabe no slug pela SERP.", newPrincipal: null, principalNote, secondaries: [], warning, bestEffort: null };
    }
    const motivo = !melhor.separationOk
      ? `O Google ainda junta ${melhor.sharedWithSiblings} páginas com uma irmã.`
      : `Divide só ${melhor.sharedWithPage} página(s) com o próprio artigo.`;
    return { ...base, state: "weak" as const, reason: `A melhor possível: "${melhor.keyword}". ${motivo} Ela não entra no aceite.`, newPrincipal: null, principalNote, secondaries: [], warning, bestEffort: melhor };
  });

  // Antes e depois, por par do grupo: a principal que fica (ou a nova) e as secundárias aceitáveis.
  const before: DifferentiationPairMeasure[] = input.group.strongPairs.map(par => ({ leftKeywordId: par.leftKeywordId, rightKeywordId: par.rightKeywordId, sharedPageCount: par.sharedPageCount }));
  const refFinal = (keywordId: string) => {
    const resultado = pages.find(item => item.keywordId === keywordId);
    const ids = resultado && resultado.state === "differentiated" ? [resultado.newPrincipal, ...resultado.secondaries].filter((item): item is DifferentiationChoice => Boolean(item)).map(item => item.candidateId) : [];
    return [...(resultado?.newPrincipal ? [] : [keywordId]), ...ids];
  };
  const after: DifferentiationPairMeasure[] = [];
  for (let i = 0; i < membros.length; i += 1) {
    for (let j = i + 1; j < membros.length; j += 1) {
      const a = membros[i].page.keywordId;
      const b = membros[j].page.keywordId;
      after.push({ leftKeywordId: a, rightKeywordId: b, sharedPageCount: emComum(uniao(serp, refFinal(a)), uniao(serp, refFinal(b))) });
    }
  }
  const nomes = new Map(membros.map(member => [member.page.keywordId, member.page.keyword]));
  const algumaProposta = pages.some(page => page.state === "differentiated");
  const pior = after.reduce<DifferentiationPairMeasure | null>((maior, par) => !maior || par.sharedPageCount > maior.sharedPageCount ? par : maior, null);
  let state: DifferentiationState;
  let reason: string;
  if (!algumaProposta && pages.every(page => page.state === "no_way_out")) {
    state = "no_way_out";
    reason = "Nenhuma keyword com volume cabe no slug destas páginas. A decisão fica com você.";
  } else if (algumaProposta && (!pior || pior.sharedPageCount <= 1)) {
    state = "differentiated";
    reason = "As propostas separam as páginas: nenhum par divide mais de 1 página no top 10.";
  } else {
    state = "weak";
    reason = pior
      ? `O Google ainda junta ${pior.sharedPageCount} páginas entre "${nomes.get(pior.leftKeywordId)}" e "${nomes.get(pior.rightKeywordId)}"${pior.sharedPageCount > 1 ? " (a principal que fica também conta)" : ""}.`
      : "A separação não pôde ser medida.";
  }
  return { state, reason, pages, before, after };
}

/* ----------------------------------- rodada ----------------------------------- */

export type DifferentiationRunPorts = {
  now: () => Date;
  /** As MESMAS portas pagas da Pesquisa por Assunto (credencial só aqui). */
  openExecution: () => Promise<Pick<SubjectDiscoveryExecutionPorts, "ledgerCapability" | "findUsage" | "collectSerp" | "runLabs" | "recordDataForSeoUsage">>;
  /** Média mensal do Google Ads por keyword normalizada (`normalizeKeyword`). Grátis. */
  googleAdsVolumes: (keywords: readonly string[]) => Promise<ReadonlyMap<string, number | null>>;
  /** Pegada das candidatas no cache (4 lentes), lida como a medida lê. */
  readFootprints: (targets: ReadonlyArray<{ keywordId: string; keyword: string }>) => Promise<{ footprints: KeywordSerpFootprint[]; missingLenses: Array<{ keywordId: string; lens: string; reason: string }> }>;
};

export type DifferentiationRunErrorCode =
  | "PAID_PLAN_REQUIRED"
  | "PAID_PLAN_CHANGED"
  | "DIFFERENTIATION_PLAN_ABOVE_CAP"
  | "PLAN_TAMPERED"
  | "OPERATION_IN_PROGRESS"
  | "OPERATION_ALREADY_EXECUTED"
  | "LEDGER_UNAVAILABLE"
  | "DATAFORSEO_UNAVAILABLE";

export type DifferentiationSerpOutcome = { cached: number; collected: number; failed: number; skippedBudget: number; readFailed: boolean };

export type DifferentiationPageCost = { keywordId: string; labsCalls: number; serpCalls: number; costUsd: number };

export type DifferentiationRunResult = {
  groupId: string;
  operationRequestId: string;
  executedAt: string;
  evaluation: DifferentiationEvaluation;
  /** As candidatas de cada página com a origem de cada uma (para o payload). */
  candidates: Record<string, DifferentiationCandidate[]>;
  refused: Record<string, DifferentiationCandidateRefusal[]>;
  /** As pegadas das páginas e das candidatas medidas: a medida é refeita no Aplicar. */
  footprints: KeywordSerpFootprint[];
  costs: { reportedCostUsd: number; budgetSpentUsd: number; authorizedUsd: number; byPage: DifferentiationPageCost[] };
  serp: DifferentiationSerpOutcome;
  labsFailures: Array<{ keywordId: string; endpoint: DifferentiationLabsEndpoint; reason: string }>;
  adsVolumeFailed: boolean;
  ledgerRecording: boolean;
  ledgerWarning: string | null;
  notices: string[];
};

export type DifferentiationRunOutcome =
  | { ok: true; result: DifferentiationRunResult }
  | { ok: false; status: number; code: DifferentiationRunErrorCode; message: string };

const LABS_SOURCE: Record<DifferentiationLabsEndpoint, SubjectDiscoverySource> = {
  ranked_keywords: "labs_ranked",
  keyword_ideas: "labs_category",
  related_keywords: "labs_related",
};

function mensagemSegura(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return message ? message.replace(/(token|secret|password|authorization|login)\s*[:=]?\s*[^\s,;]+/gi, "$1=[redacted]").slice(0, 200) : fallback;
}

function codigoSeguro(error: unknown, fallback: string) {
  const value = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  return /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : fallback;
}

const emExecucao = new Set<string>();

/**
 * A rodada paga de UM grupo, pelo plano autorizado. Ordem:
 *   1. confere o hash do plano relido e a autorização (nada é pago sem ela);
 *   2. trava a operação na instância e confere o ledger (repetição não paga);
 *   3. Labs de cada página (ranked da URL, ideias e relacionadas);
 *   4. junta, filtra (volume, publicada, ângulo da irmã) e mede o Google Ads;
 *   5. SERP das melhores (até N por página) — cache primeiro, só as lentes que faltam;
 *   6. avalia pela SERP.
 * Falha no meio conta e segue (A8); o que foi pago fica registrado.
 */
export async function runPublishedDifferentiation(input: {
  brandId: string;
  plan: DifferentiationPlan;
  group: DifferentiationGroup;
  angles: readonly DifferentiationAngle[];
  /** As pegadas atuais dos publicados do grupo (lidas do cache). */
  pageFootprints: readonly KeywordSerpFootprint[];
  /** Keywords publicadas da marca, normalizadas: nunca viram candidata. */
  publishedNormalized: ReadonlySet<string>;
  /** Keywords vivas da marca: normalizada → id (indicativo "já existe"). */
  existingByNormalized?: ReadonlyMap<string, string> | null;
  operationRequestId: string;
  authorizedPlan: { planHash: string; maxCostUsd: number } | null | undefined;
}, ports: DifferentiationRunPorts): Promise<DifferentiationRunOutcome> {
  const { plan } = input;
  if (!await verifyDifferentiationPlanHash(plan)) {
    return { ok: false, status: 409, code: "PLAN_TAMPERED", message: "O plano gravado não confere com o hash dele. Monte um plano novo; nada foi pago." };
  }
  const autorizacao = authorizeDifferentiationPlan(plan, input.authorizedPlan);
  if (!autorizacao.ok) return { ok: false, status: autorizacao.code === "DIFFERENTIATION_PLAN_ABOVE_CAP" ? 422 : 409, code: autorizacao.code, message: autorizacao.message };

  const trava = `${input.brandId}:${input.operationRequestId}`;
  if (emExecucao.has(trava)) return { ok: false, status: 409, code: "OPERATION_IN_PROGRESS", message: "Esta rodada já está em execução. Aguarde; nada foi pago de novo." };
  emExecucao.add(trava);
  try {
    return await executar(input, autorizacao.budgetUsd, ports);
  } finally {
    emExecucao.delete(trava);
  }
}

async function executar(input: Parameters<typeof runPublishedDifferentiation>[0], budgetUsd: number, ports: DifferentiationRunPorts): Promise<DifferentiationRunOutcome> {
  const { plan, group, operationRequestId } = input;
  let exec: Awaited<ReturnType<DifferentiationRunPorts["openExecution"]>>;
  try {
    exec = await ports.openExecution();
  } catch {
    return { ok: false, status: 503, code: "DATAFORSEO_UNAVAILABLE", message: "O DataForSEO não está disponível para esta rodada. Nada foi pago." };
  }
  const planejadas = listDifferentiationPaidCalls(plan);
  if (exec.ledgerCapability && planejadas.length) {
    try {
      const achadas = await Promise.all(planejadas.map(call => exec.findUsage(subjectDiscoveryLedgerKey(operationRequestId, call.callId))));
      if (achadas.some(Boolean)) return { ok: false, status: 409, code: "OPERATION_ALREADY_EXECUTED", message: "Esta rodada já foi executada. Monte um plano novo para rodar de novo; nada foi pago." };
    } catch {
      return { ok: false, status: 503, code: "LEDGER_UNAVAILABLE", message: "O controle de gastos não pôde ser consultado antes de pagar. Nada foi pago." };
    }
  }

  const budget = createSubjectDiscoveryBudget({ maxCostUsd: budgetUsd, plannedCalls: planejadas });
  const custoPorPagina = new Map<string, DifferentiationPageCost>(plan.pages.map(page => [page.keywordId, { keywordId: page.keywordId, labsCalls: 0, serpCalls: 0, costUsd: 0 }]));
  const maximoPorVaga = new Map(planejadas.map(call => [call.callId, call.maxCostUsd]));
  let reportado = 0;
  const avisosLedger: string[] = [];
  let ledgerRecording = exec.ledgerCapability;
  const somar = (keywordId: string, callId: string, cost: number | null, kind: "labs" | "serp") => {
    const linha = custoPorPagina.get(keywordId);
    const valor = typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : maximoPorVaga.get(callId) ?? 0;
    if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) reportado += toMicros(cost);
    if (!linha) return;
    linha.costUsd = fromMicros(toMicros(linha.costUsd) + toMicros(valor));
    if (kind === "labs") linha.labsCalls += 1; else linha.serpCalls += 1;
  };
  const registrar = async (event: { callId: string; endpoint: string; resultStatus: "succeeded" | "failed"; costUsd: number | null; providerRequestId: string | null; errorCode: string | null; metadata?: Record<string, string | number | boolean | null> }) => {
    try {
      const gravado = await exec.recordDataForSeoUsage({
        ...event,
        idempotencyKey: subjectDiscoveryLedgerKey(operationRequestId, event.callId),
        metadata: { operationRequestId, operationKind: "published_differentiation", groupId: plan.groupId, callId: event.callId, endpoint: event.endpoint, ...(event.metadata || {}) },
      });
      if (gravado === "skipped") ledgerRecording = false;
    } catch (error) {
      avisosLedger.push(`${event.callId}: ${codigoSeguro(error, "LEDGER_WRITE_FAILED")}`);
    }
  };

  /* 3. Labs por página. */
  const locale = { locationCode: DATAFORSEO_LABS_LOCATION_CODE, languageCode: DATAFORSEO_LABS_LANGUAGE_CODE };
  const contribuicoes = new Map<string, SubjectDiscoveryContribution[]>(plan.pages.map(page => [page.keywordId, []]));
  const labsFailures: DifferentiationRunResult["labsFailures"] = [];
  let orcamentoEsgotado = false;
  for (const page of plan.pages) {
    if (!page.inRound) continue;
    for (const call of page.labs) {
      if (orcamentoEsgotado || !budget.reserve(call.callId).ok) {
        orcamentoEsgotado = true;
        labsFailures.push({ keywordId: page.keywordId, endpoint: call.endpoint, reason: "Não executada por orçamento." });
        continue;
      }
      const pedido: DataForSeoLabsResearchRequest = call.endpoint === "ranked_keywords"
        ? { kind: "ranked_keywords", targetUrl: call.input, tag: operationRequestId, ...locale }
        : { kind: call.endpoint, keyword: call.input, tag: operationRequestId, ...locale };
      let saiu = false;
      try {
        const resultado = await exec.runLabs(pedido, { onRequestStarted: () => { saiu = true; } });
        budget.settle(call.callId, resultado.cost, saiu);
        somar(page.keywordId, call.callId, resultado.cost, "labs");
        const lista = contribuicoes.get(page.keywordId)!;
        for (const item of resultado.keywords) lista.push({ source: LABS_SOURCE[call.endpoint], keyword: item.keyword, estimate: item.estimate, ranked: item.ranked, relatedDepth: item.relatedDepth });
        await registrar({ callId: call.callId, endpoint: DATAFORSEO_LABS_RESEARCH_ENDPOINTS[call.endpoint], resultStatus: "succeeded", costUsd: resultado.cost, providerRequestId: resultado.providerRequestId, errorCode: null, metadata: { pageKeywordId: page.keywordId } });
      } catch (error) {
        const custo = error instanceof DataForSeoLabsResearchError ? error.cost : null;
        budget.settle(call.callId, custo, saiu);
        if (saiu) somar(page.keywordId, call.callId, custo, "labs");
        labsFailures.push({ keywordId: page.keywordId, endpoint: call.endpoint, reason: mensagemSegura(error, "A chamada do DataForSEO Labs falhou; as outras seguiram.") });
        if (saiu) await registrar({ callId: call.callId, endpoint: DATAFORSEO_LABS_RESEARCH_ENDPOINTS[call.endpoint], resultStatus: "failed", costUsd: custo, providerRequestId: error instanceof DataForSeoLabsResearchError ? error.providerRequestId : null, errorCode: codigoSeguro(error, "dataforseo_labs_failed"), metadata: { pageKeywordId: page.keywordId } });
      }
    }
  }

  /* 4. Junta, filtra e mede o Google Ads (grátis). */
  const angulos = new Map(input.angles.map(angle => [angle.keywordId, angle]));
  const bloqueadas = new Set<string>([...input.publishedNormalized, ...group.members.map(member => normalizeKeyword(member.page.keyword))]);
  const unidas = new Map<string, DifferentiationCandidate[]>();
  for (const page of plan.pages) {
    if (!page.inRound) { unidas.set(page.keywordId, []); continue; }
    const juntas = mergeSubjectDiscoveryCandidates({ contributions: contribuicoes.get(page.keywordId) || [], normalizedPhrase: normalizeKeyword(page.keyword), existingByNormalized: input.existingByNormalized ?? null });
    unidas.set(page.keywordId, juntas.candidates.map(candidata => ({
      candidateId: differentiationCandidateId(candidata.normalizedKeyword),
      keyword: candidata.keyword,
      normalizedKeyword: candidata.normalizedKeyword,
      origins: candidata.origins,
      evidence: candidata.evidence,
      adsVolume: null,
      estimate: candidata.dataForSeoEstimate?.searchVolume ?? null,
      hasVolume: false,
      entityFit: false,
      rankedByUrl: candidata.origins.includes("labs_ranked"),
      tier: "volume_only" as const,
      existingKeywordId: candidata.existingKeywordId,
      serpMeasured: false,
    })).filter(candidata => candidata.normalizedKeyword !== normalizeKeyword(page.keyword)));
  }
  const paraOAds = new Set<string>();
  for (const lista of unidas.values()) {
    for (const candidata of [...lista].sort((a, b) => (b.estimate ?? -1) - (a.estimate ?? -1)).slice(0, DIFFERENTIATION_ADS_CANDIDATES_PER_PAGE)) {
      if (!bloqueadas.has(candidata.normalizedKeyword)) paraOAds.add(candidata.keyword);
    }
  }
  let volumes: ReadonlyMap<string, number | null> = new Map();
  let adsVolumeFailed = false;
  if (paraOAds.size) {
    try {
      volumes = await ports.googleAdsVolumes([...paraOAds]);
    } catch {
      adsVolumeFailed = true;
    }
  }
  const candidates: Record<string, DifferentiationCandidate[]> = {};
  const refused: Record<string, DifferentiationCandidateRefusal[]> = {};
  for (const page of plan.pages) {
    const angulo = angulos.get(page.keywordId);
    const irmas = input.angles.filter(angle => angle.keywordId !== page.keywordId).flatMap(angle => angle.distinctTokens);
    const comVolume = (unidas.get(page.keywordId) || []).map(candidata => {
      const ads = volumes.get(candidata.normalizedKeyword);
      const adsVolume = typeof ads === "number" && Number.isFinite(ads) && ads >= 0 ? ads : null;
      return { ...candidata, adsVolume, hasVolume: subjectDiscoveryHasVolume({ googleAds: { averageMonthlySearches: adsVolume }, dataForSeoEstimate: { searchVolume: candidata.estimate } }) };
    });
    const filtro = filterDifferentiationCandidates({
      candidates: comVolume,
      angle: angulo || { entityTokens: [], distinctTokens: [] },
      siblingDistinctTokens: irmas,
      blockedNormalized: bloqueadas,
      pageTokens: differentiationTokens(page.keyword),
    });
    candidates[page.keywordId] = filtro.kept;
    refused[page.keywordId] = filtro.refused.slice(0, 30);
  }

  /* 5. SERP das melhores: cache primeiro; só as lentes que faltam. */
  const selecionadas: Array<{ pageIndex: number; pageKeywordId: string; slot: number; candidate: DifferentiationCandidate }> = [];
  const jaNaSerp = new Set<string>();
  plan.pages.forEach((page, pageIndex) => {
    if (!page.inRound) return;
    let slot = 0;
    for (const candidata of candidates[page.keywordId] || []) {
      if (slot >= page.serpCandidates) break;
      if (jaNaSerp.has(candidata.candidateId)) continue;
      jaNaSerp.add(candidata.candidateId);
      slot += 1;
      selecionadas.push({ pageIndex, pageKeywordId: page.keywordId, slot, candidate: candidata });
    }
  });
  const serpOutcome: DifferentiationSerpOutcome = { cached: 0, collected: 0, failed: 0, skippedBudget: 0, readFailed: false };
  const pegadas = new Map<string, SerpSubjectLensReading[]>();
  let faltando: Array<{ keywordId: string; lens: string }> = [];
  if (selecionadas.length) {
    try {
      const leitura = await ports.readFootprints(selecionadas.map(item => ({ keywordId: item.candidate.candidateId, keyword: item.candidate.keyword })));
      for (const pegada of leitura.footprints) pegadas.set(pegada.keywordId, [...pegada.lenses]);
      faltando = leitura.missingLenses.map(item => ({ keywordId: item.keywordId, lens: item.lens }));
      serpOutcome.cached = leitura.footprints.reduce((total, pegada) => total + pegada.lenses.length, 0);
    } catch {
      // D6: cache ilegível não proíbe a coleta — o plano já cobre todas as lentes.
      serpOutcome.readFailed = true;
      faltando = selecionadas.flatMap(item => subjectDiscoverySerpRequests(item.candidate.keyword, null).map(slot => ({ keywordId: item.candidate.candidateId, lens: slot.label })));
    }
  }
  for (const item of selecionadas) {
    const slots = subjectDiscoverySerpRequests(item.candidate.keyword, null);
    for (const [lensIndex, slot] of slots.entries()) {
      if (!faltando.some(falta => falta.keywordId === item.candidate.candidateId && falta.lens === slot.label)) continue;
      const callId = serpSlotId(item.pageIndex, item.slot, lensIndex);
      if (!budget.reserve(callId).ok) { serpOutcome.skippedBudget += 1; continue; }
      let saiu = false;
      try {
        const coleta = await exec.collectSerp(slot.request, { storeBody: slot.canonical, operationRequestId, onRequestStarted: () => { saiu = true; } });
        budget.settle(callId, coleta.costUsd, saiu);
        somar(item.pageKeywordId, callId, coleta.costUsd, "serp");
        const urls = (coleta.digest?.organic || []).map(organico => organico.url).filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)).slice(0, 10);
        if (urls.length) {
          pegadas.set(item.candidate.candidateId, [...(pegadas.get(item.candidate.candidateId) || []), { lens: slot.label, urls, domains: null, collectedAt: ports.now().toISOString() }]);
          serpOutcome.collected += 1;
        } else {
          serpOutcome.failed += 1;
        }
        await registrar({ callId, endpoint: "/v3/serp/google/organic/live/advanced", resultStatus: urls.length ? "succeeded" : "failed", costUsd: coleta.costUsd, providerRequestId: coleta.providerRequestId, errorCode: urls.length ? null : "SERP_UNUSABLE", metadata: { lens: slot.label, pageKeywordId: item.pageKeywordId } });
      } catch (error) {
        budget.settle(callId, null, saiu);
        if (saiu) somar(item.pageKeywordId, callId, null, "serp");
        serpOutcome.failed += 1;
        if (saiu) await registrar({ callId, endpoint: "/v3/serp/google/organic/live/advanced", resultStatus: "failed", costUsd: null, providerRequestId: null, errorCode: codigoSeguro(error, "SERP_COLLECTION_FAILED"), metadata: { lens: slot.label, pageKeywordId: item.pageKeywordId } });
      }
    }
  }

  /* 6. Avalia pela SERP. */
  const candidatasPegadas: KeywordSerpFootprint[] = selecionadas.map(item => ({ keywordId: item.candidate.candidateId, keyword: item.candidate.keyword, lenses: pegadas.get(item.candidate.candidateId) || [] }));
  const footprints = [...input.pageFootprints, ...candidatasPegadas];
  const indice = buildSerpSubjectIndex(footprints);
  for (const lista of Object.values(candidates)) {
    for (const candidata of lista) candidata.serpMeasured = indice.hasPages(candidata.candidateId);
  }
  const mapa = new Map(Object.entries(candidates));
  const naRodada = new Set(plan.pages.filter(page => page.inRound).map(page => page.keywordId));
  const evaluation = evaluateDifferentiation({ group, angles: input.angles, candidates: mapa, serp: indice, inRound: naRodada });

  const notices: string[] = [];
  if (adsVolumeFailed) notices.push("O Google Ads não respondeu: sem a média mensal, nenhuma principal nova é proposta.");
  if (serpOutcome.readFailed) notices.push("O cache de SERP não pôde ser lido: as lentes das candidatas foram coletadas dentro do orçamento.");
  if (serpOutcome.skippedBudget) notices.push(`${serpOutcome.skippedBudget} lente(s) não coletada(s) por orçamento.`);
  if (labsFailures.length) notices.push(`${labsFailures.length} chamada(s) do Labs falharam ou ficaram fora do orçamento; as outras seguiram.`);

  return {
    ok: true,
    result: {
      groupId: plan.groupId,
      operationRequestId,
      executedAt: ports.now().toISOString(),
      evaluation,
      candidates: Object.fromEntries(Object.entries(candidates).map(([id, lista]) => [id, lista.slice(0, 40)])),
      refused,
      footprints: footprints.filter(pegada => pegada.lenses.length),
      costs: {
        reportedCostUsd: fromMicros(reportado),
        budgetSpentUsd: budget.spentUsd,
        authorizedUsd: budgetUsd,
        byPage: [...custoPorPagina.values()],
      },
      serp: serpOutcome,
      labsFailures,
      adsVolumeFailed,
      ledgerRecording,
      ledgerWarning: avisosLedger.length ? `O uso de ${avisosLedger.length} chamada(s) não foi gravado no controle de gastos; o resultado foi mantido (${avisosLedger.slice(0, 3).join("; ")}).` : null,
      notices,
    },
  };
}
