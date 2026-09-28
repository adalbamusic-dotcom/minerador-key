import {
  PUBLISHED_REINFORCEMENT_ACTION_LABEL,
  PUBLISHED_REINFORCEMENT_MAX_PAGES,
  type PublishedReinforcementPageOutcome,
  type PublishedReinforcementPagePlan,
} from "../../lib/arquiteto/published-reinforcement.ts";
import {
  REINFORCEMENT_MAX_COST_USD,
  REINFORCEMENT_SEARCH_ACTION_LABEL,
  type ReinforcementPageResult,
  type ReinforcementSearchPlan,
  type ReinforcementSuggestion,
} from "../../lib/arquiteto/published-reinforcement-search.ts";
import { costRangeLabel, formatUsd } from "./published-differentiation-model.ts";
import type { SerpSubjectCardView, SerpSubjectTone } from "./serp-subject-model.ts";

/**
 * REFORÇAR PUBLICADOS — O MODELO DA TELA (SDD docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md).
 *
 * Pedido do dono (2026-09-28): "Como podemos efetivar esse reforço nesses
 * artigos publicados?". Dois atos, com o núcleo pronto no servidor:
 *
 *   "Reforçar publicados"   uma confirmação só grava, por página, o ArticleDNA
 *                           (o primeiro, quando não existe), a troca aceita e
 *                           os reforços marcados — e as keywords novas passam
 *                           pelo Minerador, aprovadas pelo dono no mesmo clique.
 *                           Custo para gravar: zero.
 *   "Buscar keywords para   em lote, para os "Sem par no lote": Google Ads
 *    os publicados sem par" (grátis) e SERP das melhores (paga, até US$ 1,00
 *                           por rodada, uma confirmação). O resultado cai no
 *                           cartão como Forte ou Provável; nada é gravado.
 *
 * Este arquivo monta os pedidos e diz, em frases curtas, o que será gravado e
 * o que foi. Puro: sem React, sem rede, sem storage.
 */

export const PUBLISHED_REINFORCEMENT_COST_LINE = "Custo para gravar: zero (nenhuma chamada paga).";
export const PUBLISHED_SEARCH_ACTION_LABEL = REINFORCEMENT_SEARCH_ACTION_LABEL;
export { PUBLISHED_REINFORCEMENT_ACTION_LABEL };
/** O aceite que acompanha keyword nova: o dono aprova no Minerador. */
export const PUBLISHED_REINFORCEMENT_APPROVAL_CHECKBOX = "Eu aprovo estas keywords novas no Minerador.";

/* ------------------------------ o pedido ------------------------------ */

export type ReinforcementRequestPage = {
  publishedKeywordId: string;
  keywordIds: string[];
  newKeywords: string[];
  swapKeywordId: string | null;
};

/** O limite de keywords por página no pedido (o servidor recusa acima). */
const MAX_POR_LISTA = 10;

export type ReinforcementRequestBuild = {
  pages: ReinforcementRequestPage[];
  /**
   * A mesma keyword marcada em mais de um publicado: ela entra só num (o de
   * mais páginas em comum; empate, o primeiro), sai dos outros, e a frase diz
   * onde entrou e de onde saiu. A confirmação segue com os demais publicados.
   */
  reassigned: string[];
  /** Publicados que ficaram para a próxima confirmação (acima de 30). */
  left: string[];
};

/**
 * O pedido do "Reforçar publicados" a partir dos cartões.
 *
 * Por publicado: as keywords que a formação já pôs no artigo, as sugestões
 * marcadas no cartão, a substituta da troca aceita e as keywords da busca em
 * lote marcadas (texto; o servidor confere no resultado gravado). Entra quem
 * tem algo a gravar: sem ArticleDNA, com proposta não gravada, ou com algo
 * marcado. Uma keyword vai para UM artigo só: repetida, ela fica no publicado
 * com mais páginas em comum (a que já é membro da formação ou a substituta da
 * troca aceita vencem sempre) e sai dos outros, com a frase dizendo isso — a
 * confirmação não trava por causa dela.
 */
export function buildReinforcementRequest(input: {
  cards: readonly SerpSubjectCardView[];
  suggestionPicks: (card: SerpSubjectCardView) => ReadonlySet<string>;
  searchPicks: (publishedKeywordId: string) => readonly string[];
  swapPicks: ReadonlySet<string>;
  /** Só estes publicados (o botão do cartão); `null` = todos. */
  only?: ReadonlySet<string> | null;
}): ReinforcementRequestBuild {
  const publicados = input.cards.filter(card => card.kind === "published" && (!input.only || input.only.has(card.anchorKeywordId)));
  const idsPublicados = new Set(input.cards.filter(card => card.kind === "published").map(card => card.anchorKeywordId));
  const vistos = new Set<string>();
  const pages: ReinforcementRequestPage[] = [];
  /** O peso de cada keyword em cada publicado: membro/troca vencem; depois, páginas em comum. */
  const peso = new Map<string, Map<string, number>>();
  const pesar = (pageId: string, chave: string, valor: number) => {
    const doPublicado = peso.get(pageId) ?? new Map<string, number>();
    doPublicado.set(chave, Math.max(doPublicado.get(chave) ?? -1, valor));
    peso.set(pageId, doPublicado);
  };
  for (const card of publicados) {
    if (vistos.has(card.anchorKeywordId)) continue;
    vistos.add(card.anchorKeywordId);
    const marcadas = input.suggestionPicks(card);
    const sugeridas = card.suggestions.filter(item => marcadas.has(item.keywordId)).map(item => item.keywordId);
    const troca = card.swapSubstitute && input.swapPicks.has(card.anchorKeywordId) ? card.swapSubstitute.keywordId : null;
    const keywordIds = [...new Set([...card.memberKeywordIds, ...sugeridas, ...(troca ? [troca] : [])])]
      .filter(id => id !== card.anchorKeywordId && !idsPublicados.has(id));
    const newKeywords = [...new Set(input.searchPicks(card.anchorKeywordId).map(frase => frase.replace(/\s+/g, " ").trim()).filter(Boolean))];
    for (const id of card.memberKeywordIds) pesar(card.anchorKeywordId, id, Number.MAX_SAFE_INTEGER);
    if (troca) pesar(card.anchorKeywordId, troca, Number.MAX_SAFE_INTEGER);
    for (const item of card.suggestions) pesar(card.anchorKeywordId, item.keywordId, item.sharedPageCount ?? 0);
    const algoMarcado = sugeridas.length > 0 || newKeywords.length > 0 || Boolean(troca);
    if (!algoMarcado && card.recordedInArticle === true) continue;
    if (!algoMarcado && card.recordedInArticle === null && !input.only) continue;
    pages.push({ publishedKeywordId: card.anchorKeywordId, keywordIds: keywordIds.slice(0, MAX_POR_LISTA), newKeywords: newKeywords.slice(0, MAX_POR_LISTA), swapKeywordId: troca });
  }
  const donos = new Map<string, string[]>();
  const nomes = new Map<string, string>();
  for (const card of input.cards) {
    for (const item of card.suggestions) nomes.set(item.keywordId, item.keyword);
    if (card.swapSubstitute) nomes.set(card.swapSubstitute.keywordId, card.swapSubstitute.keyword);
  }
  const rotulo = new Map(input.cards.map(card => [card.anchorKeywordId, card.anchorLabel]));
  for (const page of pages) {
    for (const chave of [...page.keywordIds, ...page.newKeywords.map(frase => `novo:${normalizeKeyword(frase)}`)]) {
      donos.set(chave, [...(donos.get(chave) || []), page.publishedKeywordId]);
      if (chave.startsWith("novo:")) nomes.set(chave, page.newKeywords.find(frase => `novo:${normalizeKeyword(frase)}` === chave) ?? chave);
    }
  }
  const reassigned: string[] = [];
  for (const [chave, lista] of donos) {
    if (lista.length < 2) continue;
    // O de mais páginas em comum fica com ela; empate, o primeiro da lista.
    const vencedor = lista.reduce((melhor, id) => (peso.get(id)?.get(chave) ?? -1) > (peso.get(melhor)?.get(chave) ?? -1) ? id : melhor, lista[0]);
    const perdedores = lista.filter(id => id !== vencedor);
    for (const page of pages) {
      if (!perdedores.includes(page.publishedKeywordId)) continue;
      if (chave.startsWith("novo:")) page.newKeywords = page.newKeywords.filter(frase => `novo:${normalizeKeyword(frase)}` !== chave);
      else {
        page.keywordIds = page.keywordIds.filter(id => id !== chave);
        if (page.swapKeywordId === chave) page.swapKeywordId = null;
      }
    }
    const paginas = peso.get(vencedor)?.get(chave);
    const motivo = paginas === Number.MAX_SAFE_INTEGER ? "já está na formação dele" : paginas && paginas > 0 ? `${paginas} páginas em comum, a maior` : "o primeiro da lista";
    reassigned.push(`"${nomes.get(chave) ?? chave}" entra só em "${rotulo.get(vencedor) ?? vencedor}" (${motivo}) e sai de ${perdedores.map(id => `"${rotulo.get(id) ?? id}"`).join(", ")}: cada keyword vai para um artigo só. Para escolher outro, desmarque no cartão.`);
  }
  // Publicado que ficou sem nada marcado depois da divisão segue a mesma regra de entrada de cima.
  const cardDe = new Map(publicados.map(card => [card.anchorKeywordId, card]));
  const finais = pages.filter(page => {
    const card = cardDe.get(page.publishedKeywordId);
    if (!card) return true;
    const algo = page.newKeywords.length > 0 || Boolean(page.swapKeywordId) || page.keywordIds.some(id => !card.memberKeywordIds.includes(id));
    if (algo) return true;
    if (card.recordedInArticle === true) return false;
    return !(card.recordedInArticle === null && !input.only);
  });
  return {
    pages: finais.slice(0, PUBLISHED_REINFORCEMENT_MAX_PAGES),
    reassigned,
    left: finais.slice(PUBLISHED_REINFORCEMENT_MAX_PAGES).map(page => page.publishedKeywordId),
  };
}

export function reinforcementPreviewRequest(brandId: string, pages: readonly ReinforcementRequestPage[]) {
  return { brandId, mode: "preview" as const, pages: pages.map(page => ({ ...page })) };
}

export function reinforcementApplyRequest(input: {
  brandId: string;
  pages: readonly ReinforcementRequestPage[];
  decisionHash: string;
  operationRequestId: string;
  approveNewKeywords: boolean;
}) {
  return {
    brandId: input.brandId,
    mode: "apply" as const,
    pages: input.pages.map(page => ({ ...page })),
    decisionHash: input.decisionHash,
    operationRequestId: input.operationRequestId,
    ...(input.approveNewKeywords ? { approveNewKeywords: true } : {}),
  };
}

/* ------------------------------ a prévia ------------------------------ */

export type ReinforcementPreviewData = {
  mode: "preview";
  decisionHash: string;
  pages: PublishedReinforcementPagePlan[];
  missingPages?: string[];
  approvalText: string | null;
  written: false;
  message: string;
};

export type ReinforcementPreviewPageView = {
  keywordId: string;
  keyword: string;
  status: PublishedReinforcementPagePlan["status"];
  statusLabel: string;
  tone: SerpSubjectTone;
  lines: string[];
};

export type ReinforcementPreviewView = {
  pages: ReinforcementPreviewPageView[];
  ready: number;
  firstDna: number;
  successors: number;
  newKeywords: number;
  swaps: number;
  headline: string;
  approvalText: string | null;
  confirmLabel: string;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** A mesma normalização do Minerador (`normalizeKeyword`), sem trazer o núcleo de importação para o navegador. */
const normalizeKeyword = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");

function statusDaPagina(plan: PublishedReinforcementPagePlan): { label: string; tone: SerpSubjectTone } {
  if (plan.status === "refused") return { label: "Não será gravado", tone: "warning" };
  if (plan.status === "unchanged") return { label: "Nada muda", tone: "neutral" };
  if (plan.dna.mode === "first") return { label: "Cria o ArticleDNA (v1)", tone: "success" };
  return { label: `Nova versão (v${(plan.dna.fromVersionNumber ?? 0) + 1})`, tone: "success" };
}

/** O que a confirmação diz: por página, as frases do servidor; no topo, a conta. */
export function reinforcementPreviewView(preview: ReinforcementPreviewData): ReinforcementPreviewView {
  const prontas = preview.pages.filter(plan => plan.status === "ready");
  const firstDna = prontas.filter(plan => plan.dna.mode === "first").length;
  const successors = prontas.filter(plan => plan.dna.mode === "successor").length;
  const newKeywords = prontas.reduce((total, plan) => total + plan.create.length, 0);
  const swaps = prontas.filter(plan => plan.swap.state === "apply").length;
  const adicionadas = prontas.reduce((total, plan) => total + plan.add.length, 0);
  const partes = [
    firstDna ? plural(firstDna, "ArticleDNA novo", "ArticleDNAs novos") : "",
    successors ? plural(successors, "versão nova", "versões novas") : "",
    adicionadas ? plural(adicionadas, "keyword do Minerador entra", "keywords do Minerador entram") : "",
    newKeywords ? plural(newKeywords, "keyword nova passa pelo Minerador", "keywords novas passam pelo Minerador") : "",
    swaps ? plural(swaps, "troca de principal", "trocas de principal") : "",
  ].filter(Boolean);
  return {
    pages: preview.pages.map(plan => {
      const status = statusDaPagina(plan);
      return { keywordId: plan.publishedKeywordId, keyword: plan.keyword, status: plan.status, statusLabel: status.label, tone: status.tone, lines: plan.lines };
    }),
    ready: prontas.length,
    firstDna,
    successors,
    newKeywords,
    swaps,
    headline: prontas.length
      ? `${plural(prontas.length, "artigo publicado será gravado", "artigos publicados serão gravados")}: ${partes.join(", ") || "ArticleDNA"}. ${PUBLISHED_REINFORCEMENT_COST_LINE} URL, slug e canonical não mudam.`
      : "Nada a gravar: os publicados escolhidos já têm tudo o que foi marcado, ou foram recusados com o motivo abaixo.",
    approvalText: preview.approvalText,
    confirmLabel: `Gravar e reler (${prontas.length})`,
  };
}

/* ------------------------------ o desfecho ------------------------------ */

export type ReinforcementApplyData = {
  mode: "apply";
  pages: PublishedReinforcementPageOutcome[];
  /** Publicados que a gravação nem tentou (parou antes deles): nada foi gravado neles. */
  notAttempted?: Array<{ publishedKeywordId: string; keyword: string }>;
  written: boolean;
  readbackConfirmed: boolean;
  stopped?: string | null;
  tone: "success" | "info" | "warning";
  message: string;
};

/**
 * Uma linha por página: o que a releitura confirmou, o que já ficou gravado
 * antes de uma parada (Minerador, composição) e o que não foi — inclusive os
 * publicados que a gravação nem tentou.
 */
export function reinforcementOutcomeLines(data: Pick<ReinforcementApplyData, "pages" | "notAttempted">): string[] {
  const jaGravado = (page: PublishedReinforcementPageOutcome) => page.partial?.length ? ` Já ficou gravado: ${page.partial.join("; ")}.` : "";
  const deFora = (page: PublishedReinforcementPageOutcome) => page.leftOut?.length ? ` Ficaram de fora: ${page.leftOut.map(item => `"${item.keyword}" (${item.reason})`).join("; ")}.` : "";
  const linhas = data.pages.map(page => {
    if (page.error) return `"${page.keyword}": ArticleDNA não gravado (${page.error}).${jaGravado(page) || " Nada foi gravado nele."}`;
    if (!page.written) return `"${page.keyword}": o ArticleDNA não mudou.${jaGravado(page)}${deFora(page)}`;
    const partes = [
      page.versionNumber ? `ArticleDNA v${page.versionNumber}` : "ArticleDNA",
      page.added ? plural(page.added, "keyword do Minerador", "keywords do Minerador") : "",
      page.created ? plural(page.created, "keyword nova aprovada", "keywords novas aprovadas") : "",
      page.swapApplied ? "troca da principal" : "",
    ].filter(Boolean);
    return `"${page.keyword}": gravado e relido — ${partes.join(", ")}.${deFora(page)}`;
  });
  for (const item of data.notAttempted || []) linhas.push(`"${item.keyword}": não tentado (a gravação parou antes). Nada foi gravado nele.`);
  return linhas;
}

/* ------------------------------ a barra e os cartões ------------------------------ */

/**
 * O que a barra diz antes de abrir a confirmação: quem tem reforço proposto
 * ainda não gravado e quem só ganha o ArticleDNA (sem reforço ainda). Os "Sem
 * par no lote" não têm proposta: só o ArticleDNA com a keyword publicada.
 */
export function reinforcementBarSummary(cards: readonly SerpSubjectCardView[]): string {
  const semDna = cards.filter(card => card.kind === "published" && card.recordedInArticle === false);
  const comProposta = semDna.filter(card => card.memberKeywordIds.some(id => id !== card.anchorKeywordId) || card.suggestions.length > 0).length;
  const soDna = semDna.length - comProposta;
  return [
    comProposta ? `${plural(comProposta, "publicado com reforço proposto", "publicados com reforço proposto")} ainda não gravado` : "",
    soDna ? `${plural(soDna, "só ganha", "só ganham")} o ArticleDNA (sem reforço ainda)` : "",
  ].filter(Boolean).join("; ");
}

/**
 * O publicado com reforço calculado e ainda não gravado pede decisão: o filtro
 * padrão ("Pedem decisão") o mostra, para o dono ver antes de confirmar.
 */
export function reinforcementNeedsAttention(card: SerpSubjectCardView): boolean {
  return card.kind === "published" && card.state === "reinforced" && card.recordedInArticle === false;
}

/**
 * O cartão do publicado depois da busca em lote: se ela achou keywords, o
 * título diz isso e o "Buscar reforço" (Pesquisa por Assunto, outro caminho
 * pago) sai — as keywords da busca estão logo abaixo, para marcar e gravar.
 */
export function cardWithBatchSearch(card: SerpSubjectCardView, result: Pick<ReinforcementPageResult, "state" | "suggestions"> | null | undefined): SerpSubjectCardView {
  if (card.kind !== "published" || !result || result.state !== "found" || !result.suggestions.length) return card;
  const fortes = result.suggestions.filter(item => item.level === "strong").length;
  const provaveis = result.suggestions.length - fortes;
  return {
    ...card,
    headline: `A busca em lote achou ${plural(result.suggestions.length, "keyword com volume", "keywords com volume")} (${[fortes ? `${fortes} Forte` : "", provaveis ? `${provaveis} Provável` : ""].filter(Boolean).join(", ")}): marque e grave com "${PUBLISHED_REINFORCEMENT_ACTION_LABEL}".`,
    subline: null,
    actions: card.actions.filter(action => action.kind !== "search_reinforcement"),
  };
}

/* ------------------------------ a busca em lote ------------------------------ */

export type ReinforcementSearchRunData = {
  mode: "run";
  searchId: string;
  operationRequestId: string;
  executedAt: string;
  pages: ReinforcementPageResult[];
  costs: { reportedCostUsd: number } & Record<string, unknown>;
  notices?: string[];
  message: string;
  persistWarning?: string | null;
  ledgerWarning?: string | null;
  paid?: boolean;
  replayed?: boolean;
};

export type ReinforcementSearchPlanData = {
  mode: "plan";
  searchId: string | null;
  plan: ReinforcementSearchPlan | null;
  proposal?: { state: string; lockVersion: number } | null;
  run: ReinforcementSearchRunData | null;
  differentiation: Array<{ groupId: string; keywordIds: string[]; keywords: string[]; message: string }>;
  unknown?: string[];
  stale?: boolean;
  resumed?: boolean;
  message?: string;
};

/** O rótulo do botão da busca em lote, com o teto. */
export function searchActionLabel(): string {
  return `${PUBLISHED_SEARCH_ACTION_LABEL} (até US$ ${formatUsd(REINFORCEMENT_MAX_COST_USD)})`;
}

/** A confirmação da rodada paga: publicados, custo, teto e o que NÃO acontece. */
export function searchConfirmLines(data: ReinforcementSearchPlanData): { lines: string[]; confirmLabel: string; blockedReason: string | null } {
  const plan = data.plan;
  if (!plan) return { lines: data.differentiation.map(grupo => grupo.message), confirmLabel: "Confirmar", blockedReason: data.message || "Nenhum publicado para buscar." };
  const naRodada = plan.pages.filter(page => page.inRound);
  const lines = [
    `${plural(naRodada.length, "publicado", "publicados")} nesta rodada: ${naRodada.map(page => `"${page.keyword}"`).join(", ")}.`,
    `Custo: ${costRangeLabel(plan.costRange)} (teto de US$ ${formatUsd(plan.hardCapUsd)} por rodada, conferido no servidor). Cache válido não cobra.`,
    ...plan.notices,
    ...plan.cuts.map(corte => `Corte: ${corte}`),
    ...data.differentiation.map(grupo => grupo.message),
    `Nada é gravado nos artigos: as sugestões caem nos cartões. Para gravar, marque e use "${PUBLISHED_REINFORCEMENT_ACTION_LABEL}".`,
  ];
  const blockedReason = plan.withinCap ? null : `O plano passa do teto de US$ ${formatUsd(REINFORCEMENT_MAX_COST_USD)}. Nada foi pago.`;
  return { lines, confirmLabel: `Confirmar ${costRangeLabel(plan.costRange)}`, blockedReason };
}

export function searchRunRequest(input: { brandId: string; searchId: string; plan: Pick<ReinforcementSearchPlan, "planHash" | "costRange">; operationRequestId: string }) {
  return {
    brandId: input.brandId,
    searchId: input.searchId,
    operationRequestId: input.operationRequestId,
    authorizedPlan: { planHash: input.plan.planHash, maxCostUsd: Math.min(Math.max(input.plan.costRange.maxUsd, 0.001), REINFORCEMENT_MAX_COST_USD) },
  };
}

/** As marcadas de início: as Forte que o servidor já marcou (até as vagas). */
export function defaultSearchPicks(result: Pick<ReinforcementPageResult, "suggestions"> | null | undefined): string[] {
  return (result?.suggestions || []).filter(item => item.preselected).map(item => item.keyword);
}

export type SearchSuggestionView = {
  key: string;
  keyword: string;
  levelLabel: string;
  level: ReinforcementSuggestion["level"];
  detail: string;
  isNew: boolean;
};

export function searchSuggestionViews(result: Pick<ReinforcementPageResult, "suggestions">): SearchSuggestionView[] {
  return result.suggestions.map(item => ({
    key: item.normalizedKeyword,
    keyword: item.keyword,
    level: item.level,
    levelLabel: item.level === "strong" ? "Forte" : "Provável",
    detail: `volume ${Math.round(item.adsVolume).toLocaleString("pt-BR")} (Google Ads) · ${item.reason}${item.existingKeywordId ? "" : " · nova no Minerador"}`,
    isNew: !item.existingKeywordId,
  }));
}

/* ------------------------------ a linha "Sem par no lote" ------------------------------ */

export type NoPairLineView = {
  /** Os publicados sem par que ainda não ganharam sugestão da busca. */
  pageIds: string[];
  headline: string;
  names: string;
  /** Depois da busca: quem ficou sem sugestão, com o motivo. */
  without: Array<{ keyword: string; reason: string }>;
  /** Quem ganhou sugestão (vira cartão). */
  found: string[];
};

/**
 * Os "Sem par no lote" numa linha só (pedido do dono): a lista curta de nomes e
 * o botão da busca em lote. Quem a busca achou volta a ser cartão, com as
 * sugestões; quem ficou sem nada aparece na linha com o motivo.
 */
export function noPairLineView(cards: readonly SerpSubjectCardView[], results: ReadonlyMap<string, ReinforcementPageResult>): NoPairLineView {
  const semPar = cards.filter(card => card.kind === "published" && card.state === "no_pair_in_batch");
  const found = semPar.filter(card => results.get(card.anchorKeywordId)?.state === "found").map(card => card.anchorKeywordId);
  const resto = semPar.filter(card => !found.includes(card.anchorKeywordId));
  const without = resto.flatMap(card => {
    const resultado = results.get(card.anchorKeywordId);
    return resultado && resultado.state !== "found" ? [{ keyword: card.anchorLabel, reason: resultado.reason }] : [];
  });
  const nomes = resto.map(card => `"${card.anchorLabel}"`);
  return {
    pageIds: semPar.map(card => card.anchorKeywordId),
    headline: resto.length
      ? `${plural(resto.length, "publicado sem par no lote", "publicados sem par no lote")}: nenhuma keyword deste lote trata do mesmo assunto no Google.`
      : "",
    names: nomes.length > 8 ? `${nomes.slice(0, 8).join(", ")} e mais ${nomes.length - 8}` : nomes.join(", "),
    without,
    found,
  };
}

/* ------------------------------ erros ------------------------------ */

const MENSAGENS: Record<string, string> = {
  PREVIEW_CHANGED: "O estado mudou desde a prévia: confira a prévia nova antes de gravar. Nada foi gravado.",
  HUMAN_APPROVAL_REQUIRED: "Há keywords novas: marque que você as aprova no Minerador antes de gravar. Nada foi gravado.",
  ARTICLE_WRITER_UNAVAILABLE: "O gravador do Arquiteto não está disponível agora. Nada foi gravado.",
  MINERADOR_UNAVAILABLE: "O Minerador não está disponível para as keywords novas. Nada foi gravado.",
  REINFORCEMENT_RESULT_PENDING: "Esta busca já tem uma rodada paga gravada: o resultado foi reaberto, sem custo.",
  REINFORCEMENT_ALREADY_RUN: "Esta prévia já foi usada numa rodada paga. Nada foi pago de novo; peça uma nova busca se quiser outra rodada.",
  REINFORCEMENT_PLAN_ABOVE_CAP: `O plano passa do teto de US$ ${formatUsd(REINFORCEMENT_MAX_COST_USD)}. Nada foi pago.`,
  REINFORCEMENT_PLAN_REQUIRED: "Monte a prévia da busca antes de rodar. Nada foi pago.",
  PAID_PLAN_CHANGED: "O plano mudou desde a confirmação. Monte a prévia de novo; nada foi pago.",
  PAID_PLAN_REQUIRED: "Confirme o custo antes; nada foi pago.",
  PLAN_STALE: "Os publicados desta busca mudaram desde a prévia. Monte a prévia de novo; nada foi pago.",
  PLAN_TAMPERED: "A prévia não confere. Monte a prévia de novo; nada foi pago.",
  OPERATION_IN_PROGRESS: "Uma busca destes publicados já está rodando. Aguarde; nada foi pago de novo.",
  PROPOSAL_UNAVAILABLE: "A busca não pôde ser reservada antes de pagar. Nada foi pago.",
  DATAFORSEO_UNAVAILABLE: "O DataForSEO não está disponível agora. Nada foi pago.",
  LEDGER_UNAVAILABLE: "O controle de gastos não respondeu. Nada foi pago.",
};

/** A frase do erro: a do código conhecido; senão a do servidor (com o motivo do pedido recusado); senão o HTTP. */
export function reinforcementErrorMessage(status: number, body: unknown): string {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : "";
  if (code && MENSAGENS[code]) return MENSAGENS[code];
  const issues = record.issues && typeof record.issues === "object" ? record.issues as { formErrors?: unknown; fieldErrors?: Record<string, unknown> } : null;
  const detalhe = [
    ...(Array.isArray(issues?.formErrors) ? issues!.formErrors : []),
    ...Object.values(issues?.fieldErrors || {}).flatMap(valor => Array.isArray(valor) ? valor : []),
  ].map(String).find(Boolean);
  const texto = typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : "";
  if (texto) return detalhe ? `${texto} ${detalhe}` : texto;
  return status ? `Falhou (HTTP ${status}). Nada foi gravado.` : "Sem resposta do servidor. Nada foi gravado.";
}
