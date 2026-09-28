import {
  DIFFERENTIATION_ANGLE_SOURCE_LABELS,
  type CompactDifferentiationGroup,
  type DifferentiationAngle,
  type DifferentiationAiRejection,
  type DifferentiationRowState,
} from "../../lib/arquiteto/published-differentiation.ts";
import {
  DIFFERENTIATION_MAX_COST_USD,
  DIFFERENTIATION_STATE_LABELS,
  type DifferentiationChoice,
  type DifferentiationEvaluation,
  type DifferentiationPageCost,
  type DifferentiationPlan,
  type DifferentiationSerpOutcome,
  type DifferentiationState,
} from "../../lib/arquiteto/published-differentiation-run.ts";
import type { DifferentiationIngestItem } from "../../lib/arquiteto/published-differentiation-apply.ts";
import { PUBLISHED_PRIMARY_POST_LABELS, type PublishedPrimaryPost } from "../../lib/arquiteto/published-primary-swap.ts";

/**
 * PUBLICADOS QUE DISPUTAM O MESMO ASSUNTO — O MODELO DA TELA.
 *
 * SDD aprovada: docs/04-arquiteto/sdd-diferenciacao-publicados-canibalizados-2026-09-27.md
 * (Q1 IA com a menor autoridade; Q2 teto de US$ 0,50 por grupo e uma
 * confirmação por rodada; Q3 página que ranqueia não troca a principal).
 *
 * O domínio e o servidor decidem tudo (grupos, ângulos, plano, avaliação,
 * gravação). Este arquivo só diz COMO a tela fala: frases curtas, faixa de
 * custo, estado de cada página, o que o aceite gravou e o que falta. Puro:
 * sem React, sem rede, sem provider.
 */

/* --------------------------------- rótulos --------------------------------- */

export const DIFFERENTIATION_PANEL_TITLE = "Publicados que disputam o mesmo assunto";
export const DIFFERENTIATION_PLAN_ACTION = "Planejar diferenciação";
export const DIFFERENTIATION_RUN_ACTION = "Buscar e validar";
export const DIFFERENTIATION_ACCEPT_ACTION = "Aceitar grupo";
export const DIFFERENTIATION_KEEP_ACTION = "Manter como está";
export const DIFFERENTIATION_AI_OPTION = "Pedir ângulos à IA (menor autoridade)";
export const DIFFERENTIATION_REPLAN_ACTION = "Planejar nova rodada";
export const DIFFERENTIATION_REACCEPT_ACTION = "Aceitar de novo";
export const DIFFERENTIATION_INCLUDE_OPTION = "Incluir no aceite";

export type DifferentiationTone = "success" | "info" | "warning" | "neutral";

export const DIFFERENTIATION_STATE_TONES: Readonly<Record<DifferentiationState, DifferentiationTone>> = Object.freeze({
  differentiated: "success",
  weak: "warning",
  no_way_out: "neutral",
});

/* ------------------------------- respostas ------------------------------- */

/** `POST /api/arquiteto/cannibalization/plan` sem `groupId`. */
export type DifferentiationDetectData = {
  mode: "detect";
  groups: CompactDifferentiationGroup[];
  withoutSerp: Array<{ keywordId: string; keyword: string }>;
  pagesMeasured: number;
  publishedCount: number;
  egress?: { queries: number; entriesRead: number; approxBytes: number; keywordRows: number } | null;
  paid: false;
};

/** `POST /api/arquiteto/cannibalization/plan` com `groupId`. */
export type DifferentiationPlanData = {
  mode: "plan";
  group: CompactDifferentiationGroup;
  angles: DifferentiationAngle[];
  aiRejected: DifferentiationAiRejection[];
  plan: DifferentiationPlan;
  proposal: { state: DifferentiationRowState; lockVersion: number };
  /** A avaliação gravada, quando a prévia foi relida (`resume`). */
  run?: DifferentiationRunData | null;
  /** A SERP do grupo mudou desde a prévia relida: rodar exige nova prévia. */
  stale?: boolean;
  resumed?: boolean;
  paid: false;
};

/** `POST /api/arquiteto/cannibalization/run`. */
export type DifferentiationRunData = {
  mode: "run";
  groupId: string;
  operationRequestId: string;
  executedAt: string;
  evaluation: DifferentiationEvaluation;
  evaluationHash: string;
  costs: { reportedCostUsd: number; budgetSpentUsd: number; authorizedUsd: number; byPage: DifferentiationPageCost[] };
  serp: DifferentiationSerpOutcome;
  /** Rodadas antigas (com Labs). Nas de hoje, vazio. */
  labsFailures: Array<{ keywordId: string; endpoint: string; reason: string }>;
  /** Rodadas de hoje (Google Ads): as sementes que falharam. Ausente nas antigas. */
  adsFailures?: Array<{ keywordId: string; kind: string; reason: string }>;
  adsVolumeFailed: boolean;
  refusedCount: Record<string, number>;
  ledgerRecording: boolean;
  ledgerWarning: string | null;
  notices: string[];
  proposal: { state: DifferentiationRowState; lockVersion: number } | null;
  persistWarning: string | null;
  /** `false` quando é a avaliação gravada relida (nada foi pago agora). */
  paid: boolean;
  replayed?: boolean;
};

export type DifferentiationApplyPageData = {
  keywordId: string;
  keyword: string;
  articleId: string | null;
  written: boolean;
  versionId: string | null;
  /** `null` = nada a gravar nesta página. */
  readbackConfirmed: boolean | null;
  error: string | null;
  swap: { applied: boolean; keyword: string | null; reason: string };
  formation: Array<{ keywordId: string; keyword: string; role: "principal" | "secundaria" }>;
  ingest: DifferentiationIngestItem[];
  refusal: string | null;
};

export type DifferentiationIngestBatch = {
  pageKeywordId: string;
  subjectPhrase: string;
  items: DifferentiationIngestItem[];
  searchId: string;
  subjectKeywordId: null;
};

/** `POST /api/arquiteto/cannibalization/apply`. */
export type DifferentiationApplyData =
  | {
    mode: "apply";
    decision: "keep";
    groupId: string;
    kept: { serpFingerprint: string; actorId: string; decidedAt: string };
    proposal: { state: DifferentiationRowState; lockVersion: number };
    readbackConfirmed: boolean;
  }
  | {
    mode: "apply";
    decision: "accept";
    groupId: string;
    pages: DifferentiationApplyPageData[];
    ingestBatches: DifferentiationIngestBatch[];
    proposal: { state: DifferentiationRowState; lockVersion: number } | null;
    persistWarning: string | null;
    readbackConfirmed: boolean;
  };

export type DifferentiationAcceptData = Extract<DifferentiationApplyData, { decision: "accept" }>;

/* ---------------------------------- números ---------------------------------- */

const CENT = 100;

/** Dólar em pt-BR, com duas casas. O mínimo arredonda para baixo e o máximo para cima: a tela nunca promete menos do que pode custar. */
export function formatUsd(value: number, mode: "floor" | "ceil" | "round" = "round"): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const cents = mode === "floor" ? Math.floor(safe * CENT + 1e-9) : mode === "ceil" ? Math.ceil(safe * CENT - 1e-9) : Math.round(safe * CENT);
  return (cents / CENT).toFixed(2).replace(".", ",");
}

export function costRangeLabel(range: { minUsd: number; maxUsd: number }): string {
  const min = formatUsd(range.minUsd, "floor");
  const max = formatUsd(range.maxUsd, "ceil");
  return min === max ? `US$ ${max}` : `US$ ${min} a ${max}`;
}

const inteiro = (value: number) => Math.round(value).toLocaleString("pt-BR");

export function choiceVolumeLabel(choice: Pick<DifferentiationChoice, "adsVolume" | "estimate">): string {
  if (typeof choice.adsVolume === "number" && choice.adsVolume > 0) return `volume ${inteiro(choice.adsVolume)}`;
  if (typeof choice.estimate === "number" && choice.estimate > 0) return `estimativa ${inteiro(choice.estimate)}`;
  return "sem volume";
}

/* --------------------------------- detecção --------------------------------- */

type CompactMember = CompactDifferentiationGroup["members"][number];

export function differentiationRankingLabel(ranking: CompactMember["ranking"]): string {
  if (ranking.ranks) return ranking.bestPosition ? `Ranqueia em ${ranking.bestPosition}º` : "Ranqueia";
  if (ranking.possiblyRanks) return "Pode ranquear (posição não lida)";
  return "Não ranqueia";
}

export type DifferentiationMemberView = {
  keywordId: string;
  keyword: string;
  postLabel: string;
  post: PublishedPrimaryPost;
  rankingLabel: string;
  ranks: boolean;
  volumeLabel: string;
  hasArticle: boolean;
};

export type DifferentiationGroupRowView = {
  groupId: string;
  title: string;
  sharedLabel: string;
  members: DifferentiationMemberView[];
  pairs: string[];
  note: string | null;
};

const nomeCurto = (texto: string, max = 60) => texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;

/** Uma linha por grupo: os publicados, as páginas em comum, o Posto e quem ranqueia. */
export function differentiationGroupRowView(group: CompactDifferentiationGroup): DifferentiationGroupRowView {
  const nomes = new Map(group.members.map(member => [member.keywordId, member.keyword]));
  const [primeiro, ...resto] = group.members;
  const title = primeiro ? `${nomeCurto(primeiro.keyword)}${resto.length ? ` e mais ${resto.length}` : ""}` : "Grupo";
  const muitos = group.strongPairs.length > 1;
  const sharedLabel = `${muitos ? "até " : ""}${group.maxSharedPages} páginas em comum no top 10`;
  const note = group.members.some(member => member.ranking.ranks || member.ranking.possiblyRanks)
    ? "Quem já aparece no Google não troca a principal: recebe só secundárias."
    : null;
  return {
    groupId: group.groupId,
    title,
    sharedLabel,
    members: group.members.map(member => ({
      keywordId: member.keywordId,
      keyword: member.keyword,
      post: member.post,
      postLabel: PUBLISHED_PRIMARY_POST_LABELS[member.post] ?? PUBLISHED_PRIMARY_POST_LABELS.unknown,
      rankingLabel: differentiationRankingLabel(member.ranking),
      ranks: member.ranking.ranks || member.ranking.possiblyRanks,
      volumeLabel: typeof member.volume === "number" && member.volume > 0 ? `volume ${inteiro(member.volume)}` : "sem volume",
      hasArticle: Boolean(member.articleId),
    })),
    pairs: group.strongPairs.map(pair => `"${nomeCurto(nomes.get(pair.leftKeywordId) || pair.leftKeywordId, 40)}" × "${nomeCurto(nomes.get(pair.rightKeywordId) || pair.rightKeywordId, 40)}": ${pair.sharedPageCount} páginas`),
    note,
  };
}

/** Os grupos que o painel mostra: "Manter como está" some até a SERP mudar. */
export function visibleDifferentiationGroups(data: Pick<DifferentiationDetectData, "groups"> | null | undefined): CompactDifferentiationGroup[] {
  return (data?.groups || []).filter(group => !group.kept);
}

export function differentiationHeadline(data: DifferentiationDetectData): string {
  const grupos = visibleDifferentiationGroups(data);
  const paginas = new Set(grupos.flatMap(group => group.members.map(member => member.keywordId))).size;
  const mantidos = data.groups.length - grupos.length;
  const base = grupos.length
    ? `${grupos.length} grupo(s), ${paginas} publicados. O Google mostra as mesmas páginas para eles: cada um precisa de um ângulo próprio. O endereço não muda.`
    : "Nenhum publicado disputa o mesmo assunto no cache de SERP.";
  const extras = [
    mantidos ? `${mantidos} mantido(s) como está, até a SERP mudar.` : null,
    data.withoutSerp.length ? `${data.withoutSerp.length} publicado(s) sem SERP no cache: não dá para medir.` : null,
  ].filter(Boolean);
  return [base, ...extras].join(" ");
}

/* ----------------------------------- plano ----------------------------------- */

export type DifferentiationAngleView = {
  keywordId: string;
  keyword: string;
  angle: string;
  sources: string;
  seeds: string[];
  inRound: boolean;
  note: string | null;
};

export type DifferentiationPlanView = {
  costLabel: string;
  withinCap: boolean;
  capLabel: string;
  cuts: string[];
  notices: string[];
  angles: DifferentiationAngleView[];
  aiNotes: string[];
};

export function differentiationPlanView(data: Pick<DifferentiationPlanData, "angles" | "plan" | "aiRejected" | "group">): DifferentiationPlanView {
  const nomes = new Map(data.group.members.map(member => [member.keywordId, member.keyword]));
  const porPagina = new Map(data.plan.pages.map(page => [page.keywordId, page]));
  return {
    costLabel: costRangeLabel(data.plan.costRange),
    withinCap: data.plan.withinCap,
    capLabel: `Teto de US$ ${formatUsd(data.plan.hardCapUsd || DIFFERENTIATION_MAX_COST_USD)} por grupo.`,
    cuts: data.plan.cuts,
    notices: data.plan.notices,
    angles: data.angles.map(angle => {
      const page = porPagina.get(angle.keywordId);
      return {
        keywordId: angle.keywordId,
        keyword: nomes.get(angle.keywordId) || angle.keywordId,
        angle: angle.aiLabel && !angle.distinctTokens.length ? angle.aiLabel : angle.label,
        sources: [...new Set(angle.sources.map(source => DIFFERENTIATION_ANGLE_SOURCE_LABELS[source]))].join(", "),
        seeds: angle.seeds.map(seed => seed.phrase),
        inRound: page ? page.inRound : true,
        note: page?.note ?? null,
      };
    }),
    aiNotes: data.aiRejected.map(item => item.reason),
  };
}

/** A soma das faixas dos grupos marcados: é o número do botão e da confirmação. */
export function sumDifferentiationCost(plans: ReadonlyArray<Pick<DifferentiationPlan, "costRange">>): { minUsd: number; maxUsd: number } {
  return plans.reduce((total, plan) => ({ minUsd: total.minUsd + plan.costRange.minUsd, maxUsd: total.maxUsd + plan.costRange.maxUsd }), { minUsd: 0, maxUsd: 0 });
}

export function runActionLabel(range: { minUsd: number; maxUsd: number } | null): string {
  return range && range.maxUsd > 0 ? `${DIFFERENTIATION_RUN_ACTION} (${costRangeLabel(range)})` : DIFFERENTIATION_RUN_ACTION;
}

/** Pode confirmar a rodada? Todos os marcados precisam de plano dentro do teto. */
export function runReadiness(input: {
  selected: readonly string[];
  plans: ReadonlyMap<string, Pick<DifferentiationPlan, "withinCap" | "costRange"> | null | undefined>;
  busy: boolean;
  /** Grupos cuja prévia já foi usada numa rodada (ou está rodando): a prévia vale UMA rodada. */
  used?: ReadonlySet<string>;
}): { ready: boolean; reason: string | null } {
  if (input.busy) return { ready: false, reason: "Aguarde o passo em andamento." };
  if (!input.selected.length) return { ready: false, reason: "Marque ao menos um grupo." };
  const semPlano = input.selected.filter(id => !input.plans.get(id));
  if (semPlano.length) return { ready: false, reason: `Planeje antes: ${semPlano.length} grupo(s) marcado(s) sem plano.` };
  const usados = input.selected.filter(id => input.used?.has(id));
  if (usados.length) return { ready: false, reason: `${usados.length} grupo(s) já buscado(s): aceite, mantenha ou use "${DIFFERENTIATION_REPLAN_ACTION}".` };
  const acima = input.selected.filter(id => {
    const plan = input.plans.get(id);
    return !plan || !plan.withinCap || plan.costRange.maxUsd > DIFFERENTIATION_MAX_COST_USD + 1e-9;
  });
  if (acima.length) return { ready: false, reason: `${acima.length} grupo(s) acima do teto de US$ ${formatUsd(DIFFERENTIATION_MAX_COST_USD)}.` };
  return { ready: true, reason: null };
}

/** O corpo da rodada: o hash e o custo que a pessoa confirmou. O teto é conferido de novo no servidor. */
export function differentiationRunRequest(input: { brandId: string; plan: Pick<DifferentiationPlan, "groupId" | "planHash" | "costRange">; operationRequestId: string }) {
  return {
    brandId: input.brandId,
    groupId: input.plan.groupId,
    operationRequestId: input.operationRequestId,
    authorizedPlan: { planHash: input.plan.planHash, maxCostUsd: Math.min(input.plan.costRange.maxUsd, DIFFERENTIATION_MAX_COST_USD) },
  };
}

/* --------------------------------- avaliação --------------------------------- */

export type DifferentiationChoiceView = { keyword: string; volumeLabel: string };

export type DifferentiationSiblingMeasure = { keyword: string; before: string; after: number | null };

export type DifferentiationPageView = {
  keywordId: string;
  keyword: string;
  angle: string;
  /** Entra no aceite (padrão: só as "Diferenciado"). */
  included: boolean;
  /** Fraca ou sem saída: entra só com a marca da pessoa, e só com a nota. */
  noteOnly: boolean;
  /** A melhor possível de uma página fraca: evidência, nunca proposta. */
  bestEffort: DifferentiationChoiceView | null;
  state: DifferentiationState;
  stateLabel: string;
  tone: DifferentiationTone;
  reason: string;
  newPrincipal: DifferentiationChoiceView | null;
  principalNote: string | null;
  secondaries: DifferentiationChoiceView[];
  siblings: DifferentiationSiblingMeasure[];
  warning: string | null;
};

export type DifferentiationEvaluationView = {
  state: DifferentiationState;
  stateLabel: string;
  tone: DifferentiationTone;
  reason: string;
  costLabel: string;
  pages: DifferentiationPageView[];
  notices: string[];
  canAccept: boolean;
  acceptBlockedReason: string | null;
};

const parChave = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
const escolhaVista = (choice: DifferentiationChoice): DifferentiationChoiceView => ({ keyword: choice.keyword, volumeLabel: choiceVolumeLabel(choice) });

/** As páginas que o aceite leva sem a pessoa marcar: só as "Diferenciado". */
export function defaultAcceptPageIds(run: Pick<DifferentiationRunData, "evaluation">): string[] {
  return run.evaluation.pages.filter(page => page.state === "differentiated" && page.inRound !== false).map(page => page.keywordId);
}

export function differentiationEvaluationView(run: DifferentiationRunData, group: Pick<CompactDifferentiationGroup, "members" | "probablePairs">, includedIds?: readonly string[] | null): DifferentiationEvaluationView {
  const incluidas = new Set(includedIds ?? defaultAcceptPageIds(run));
  const nomes = new Map(group.members.map(member => [member.keywordId, member.keyword]));
  const antes = new Map(run.evaluation.before.map(pair => [parChave(pair.leftKeywordId, pair.rightKeywordId), pair.sharedPageCount]));
  const provaveis = new Set(group.probablePairs.map(pair => parChave(pair.leftKeywordId, pair.rightKeywordId)));
  const depois = new Map(run.evaluation.after.map(pair => [parChave(pair.leftKeywordId, pair.rightKeywordId), pair.sharedPageCount]));
  const pages = run.evaluation.pages.map((page): DifferentiationPageView => ({
    keywordId: page.keywordId,
    keyword: page.keyword,
    angle: page.angle,
    included: incluidas.has(page.keywordId),
    noteOnly: page.state !== "differentiated",
    bestEffort: page.bestEffort ? escolhaVista(page.bestEffort) : null,
    state: page.state,
    stateLabel: DIFFERENTIATION_STATE_LABELS[page.state],
    tone: DIFFERENTIATION_STATE_TONES[page.state],
    reason: page.reason,
    // Avaliação antiga podia trazer a melhor possível em secundárias: só "Diferenciado" propõe.
    newPrincipal: page.state === "differentiated" && page.newPrincipal ? escolhaVista(page.newPrincipal) : null,
    principalNote: page.principalNote,
    secondaries: page.state === "differentiated" ? page.secondaries.map(escolhaVista) : [],
    siblings: run.evaluation.pages.filter(other => other.keywordId !== page.keywordId).map(other => {
      const chave = parChave(page.keywordId, other.keywordId);
      const anterior = antes.get(chave);
      return {
        keyword: nomes.get(other.keywordId) || other.keyword,
        before: typeof anterior === "number" ? String(anterior) : provaveis.has(chave) ? "2" : "até 2",
        after: depois.get(chave) ?? null,
      };
    }),
    warning: page.warning,
  }));
  const temProposta = pages.some(page => page.included);
  const notices = [
    ...run.notices,
    // Rodada de hoje: as falhas do Google Ads já vêm nos avisos do servidor. As
    // duas frases abaixo são das rodadas antigas (com Labs), relidas como foram.
    run.adsVolumeFailed && !run.adsFailures ? "O volume do Google Ads não respondeu: só entrou quem tinha estimativa do DataForSEO." : null,
    run.labsFailures.length ? `${run.labsFailures.length} busca(s) no DataForSEO Labs falharam; as outras seguiram.` : null,
    run.ledgerWarning,
    run.persistWarning,
  ].filter((item): item is string => Boolean(item));
  const serp = run.serp;
  const serpNota = `SERP: ${serp.cached} do cache, ${serp.collected} coletada(s)${serp.failed ? `, ${serp.failed} falha(s)` : ""}${serp.skippedBudget ? `, ${serp.skippedBudget} fora pelo teto` : ""}.`;
  return {
    state: run.evaluation.state,
    stateLabel: DIFFERENTIATION_STATE_LABELS[run.evaluation.state],
    tone: DIFFERENTIATION_STATE_TONES[run.evaluation.state],
    reason: run.evaluation.reason,
    costLabel: `Gasto: US$ ${formatUsd(run.costs.reportedCostUsd, "ceil")} (autorizado até US$ ${formatUsd(run.costs.authorizedUsd, "ceil")}). ${serpNota}`,
    pages,
    notices,
    canAccept: temProposta && Boolean(run.proposal),
    acceptBlockedReason: !temProposta
      ? (pages.some(page => page.state === "differentiated")
        ? `Marque ao menos uma página em "${DIFFERENTIATION_INCLUDE_OPTION}".`
        : "Nenhuma página ficou Diferenciada. Marque uma página só para gravar a nota do ângulo, ou mantenha o grupo.")
      : !run.proposal
        ? "A avaliação não foi gravada: aceite depende dela. Rode de novo quando der."
        : null,
  };
}

/** O que a confirmação do aceite diz, antes de gravar. */
export function acceptPreviewLines(view: Pick<DifferentiationEvaluationView, "pages">): string[] {
  const linhas = view.pages
    .filter(page => page.included)
    .map(page => {
      if (page.noteOnly || (!page.newPrincipal && !page.secondaries.length)) return `"${page.keyword}": só a nota do ângulo, sem keyword nova.`;
      const partes = [
        page.newPrincipal ? `principal nova "${page.newPrincipal.keyword}"` : null,
        page.secondaries.length ? `secundária(s) ${page.secondaries.map(item => `"${item.keyword}"`).join(", ")}` : null,
      ].filter(Boolean);
      return `"${page.keyword}": ${partes.join(" e ")}.`;
    });
  const fora = view.pages.filter(page => !page.included).length;
  return [
    ...linhas,
    "Cada artigo ganha uma versão nova do DNA, em revisão, com a nota do ângulo e o link para as irmãs.",
    "URL, slug, canonical e marca não mudam. Nada é apagado.",
    "Keyword que ainda não está no Minerador vai para lá antes de entrar no artigo.",
    ...(fora ? [`${fora} página(s) fora deste aceite: nada muda nelas.`] : []),
  ];
}

/** O que a confirmação de "Manter como está" diz: é decisão humana, registrada. */
export function keepPreviewLines(group: Pick<CompactDifferentiationGroup, "members">): string[] {
  return [
    `Os ${group.members.length} publicados ficam como estão: nenhuma versão nova, nenhuma keyword.`,
    "O grupo sai do painel até a SERP dele mudar. A decisão fica registrada com o seu nome.",
  ];
}

/* ---------------------------------- aceite ---------------------------------- */

export type DifferentiationFormationStep = { pageKeywordId: string; pageKeyword: string; keywordIds: string[]; keywords: string[] };

export type DifferentiationApplyView = {
  tone: DifferentiationTone;
  headline: string;
  lines: string[];
  formation: DifferentiationFormationStep[];
  ingestCount: number;
  needsSecondAccept: boolean;
};

/** O desfecho do aceite. Sucesso só com a releitura confirmando cada versão gravada. */
export function differentiationApplyView(data: DifferentiationAcceptData): DifferentiationApplyView {
  const gravadas = data.pages.filter(page => page.written && page.readbackConfirmed === true);
  const falhas = data.pages.filter(page => page.error || page.readbackConfirmed === false);
  const lines = data.pages.map(page => {
    if (page.error || page.readbackConfirmed === false) return `"${page.keyword}": não confirmado — ${page.error || "a releitura não trouxe a versão nova"}.`;
    if (page.refusal) return `"${page.keyword}": ${page.refusal}`;
    if (page.written) return `"${page.keyword}": versão nova gravada e relida.${page.swap.applied && page.swap.keyword ? ` Principal agora: "${page.swap.keyword}".` : ""}`;
    return `"${page.keyword}": nada a gravar agora.`;
  });
  const formation = data.pages
    .filter(page => page.formation.length)
    .map(page => ({ pageKeywordId: page.keywordId, pageKeyword: page.keyword, keywordIds: page.formation.map(item => item.keywordId), keywords: page.formation.map(item => item.keyword) }));
  const ingestCount = data.ingestBatches.reduce((total, batch) => total + batch.items.length, 0);
  // Só o que um novo aceite da MESMA avaliação resolve (sem rodada paga): keyword a trazer ou troca à espera dela.
  const trocaPendente = data.pages.some(page => page.swap.keyword && !page.swap.applied && /ainda não está|aceite de novo/i.test(page.swap.reason));
  const needsSecondAccept = trocaPendente || formation.length > 0 || ingestCount > 0;
  const tone: DifferentiationTone = falhas.length || data.persistWarning ? "warning" : gravadas.length && data.readbackConfirmed ? "success" : "info";
  const headline = falhas.length
    ? `${falhas.length} página(s) não confirmada(s) na releitura. Nada foi dado como gravado nelas.`
    : gravadas.length && data.readbackConfirmed
      ? `${gravadas.length} página(s) gravada(s) e confirmada(s) na releitura.`
      : "Nada foi gravado agora: veja os passos abaixo.";
  return {
    tone,
    headline: data.persistWarning ? `${headline} ${data.persistWarning}` : headline,
    lines,
    formation,
    ingestCount,
    needsSecondAccept,
  };
}

/** O envio ao Processador do Minerador: o mesmo import da Pesquisa por Assunto. */
export function differentiationIngestRequest(batch: DifferentiationIngestBatch, importRequestId: string) {
  return {
    importRequestId,
    searchId: batch.searchId,
    subjectKeywordId: null,
    subjectPhrase: batch.subjectPhrase,
    items: batch.items.map(item => ({ keyword: item.keyword, origins: item.origins, evidence: item.evidence })),
  };
}

/* ---------------------------------- erros ---------------------------------- */

const MENSAGENS: Record<string, string> = {
  PLAN_STALE: "A SERP do grupo mudou desde o plano. Planeje de novo; nada foi pago.",
  PAID_PLAN_CHANGED: "O plano mudou desde a confirmação. Planeje de novo; nada foi pago.",
  PAID_PLAN_REQUIRED: "Confirme o custo antes; nada foi pago.",
  PLAN_TAMPERED: "O plano não é deste grupo. Planeje de novo; nada foi pago.",
  DIFFERENTIATION_PLAN_ABOVE_CAP: "O plano passa do teto de US$ 0,50. Nada foi pago.",
  OPERATION_IN_PROGRESS: "Uma busca deste grupo já está rodando. Aguarde; nada foi pago de novo.",
  OPERATION_ALREADY_EXECUTED: "Esta busca já rodou; nada foi pago de novo. Releia o painel para ver o resultado.",
  DIFFERENTIATION_ALREADY_RUN: `Esta prévia já foi usada numa busca paga; nada foi pago de novo. Reabra o resultado ou use "${DIFFERENTIATION_REPLAN_ACTION}".`,
  DIFFERENTIATION_EVALUATION_PENDING: `Este grupo já tem uma busca paga gravada. Reabra o resultado ou use "${DIFFERENTIATION_REPLAN_ACTION}"; nada foi apagado.`,
  DIFFERENTIATION_GROUP_KEPT: "Este grupo foi mantido como está. Ele volta quando a SERP mudar.",
  NOTHING_TO_APPLY: "Nenhuma página ficou Diferenciada. Marque uma página para gravar só a nota, ou mantenha o grupo.",
  PROPOSAL_UNAVAILABLE: "A proposta não pôde ser reservada antes de pagar. Nada foi pago.",
  DATAFORSEO_UNAVAILABLE: "O DataForSEO não está disponível agora. Nada foi pago.",
  LEDGER_UNAVAILABLE: "O controle de gastos não respondeu. Nada foi pago.",
  DIFFERENTIATION_PLAN_REQUIRED: "Planeje o grupo antes de buscar. Nada foi pago.",
  DIFFERENTIATION_PLAN_OUTDATED: "Esta prévia é de antes da troca para o Google Ads. Planeje o grupo de novo; nada foi pago.",
  DIFFERENTIATION_GROUP_NOT_FOUND: "Este grupo não aparece mais na SERP do cache. Releia o painel.",
  DIFFERENTIATION_EVALUATION_REQUIRED: "Busque e valide o grupo antes de aceitar.",
  PREVIEW_CHANGED: "A proposta mudou desde que você a viu. Nada foi gravado; busque de novo.",
};

/** A frase do erro: a do código conhecido, senão a do servidor, senão o HTTP. */
export function differentiationErrorMessage(status: number, body: unknown): string {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : "";
  if (code && MENSAGENS[code]) return MENSAGENS[code];
  const texto = typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : "";
  return texto || (status ? `Falhou (HTTP ${status}).` : "Sem resposta do servidor.");
}

/* ------------------------------ progresso ------------------------------ */

export type DifferentiationRunStatus = "idle" | "queued" | "running" | "done" | "failed";

export const DIFFERENTIATION_RUN_STATUS_LABELS: Readonly<Record<DifferentiationRunStatus, string>> = Object.freeze({
  idle: "",
  queued: "Na fila",
  running: "Buscando e validando…",
  done: "Pronto",
  failed: "Falhou",
});
