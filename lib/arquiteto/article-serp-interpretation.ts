/**
 * O QUE A SERP OBSERVADA DIZ SOBRE ESTE AGRUPAMENTO.
 *
 * O parecer anterior perguntava à intenção declarada pelo Minerador se ela
 * batia com a observada. Quando o Minerador devolvia `unknown` — que é um
 * estado válido — a comparação virava "insuficiente" para todo mundo, e a
 * SERP passava a não julgar nada. O mercado ficava calado por uma lacuna
 * nossa.
 *
 * Aqui a intenção observada é inferida DA SERP: dos tipos de resultado, dos
 * títulos, das URLs e dos domínios que realmente voltaram. O que o Minerador
 * declarou entra como contexto anterior, nunca como condição para interpretar.
 *
 * A pergunta central também muda. Não basta olhar a Principal: um Article é
 * uma aposta de que VÁRIAS buscas pedem a MESMA página. Isso só se responde
 * comparando as SERPs entre si, par a par.
 *
 * Duas perguntas diferentes, dois vereditos:
 *
 *   PRINCIPAL  — quem deve encabeçar a página?
 *   GRUPO      — estas buscas cabem em uma página só?
 *
 * Podem divergir: uma Principal bem escolhida para um grupo que precisa ser
 * dividido é um resultado normal, e achatá-los num veredito só esconderia
 * metade do achado.
 *
 * NADA aqui promete ranking, tráfego ou ROI. A leitura é de viabilidade
 * competitiva observada — o que a SERP brasileira mostrou, e só.
 *
 * Domínio puro: sem storage, sem fetch, sem provider.
 */

import {
  SERP_LENS_DATES_DIVERGE_DAYS,
  SERP_LENS_DIGEST_NOTE,
  collectedAtSpreadDays,
  lensAgreementLabel,
  type SerpLensesMarker,
} from "./serp-lens-plan.ts";

export type SerpResultFact = {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  inferredType: string;
};

export type KeywordSerpFacts = {
  keywordId: string;
  keyword: string;
  role: "principal" | "secundaria" | "reforco";
  results: readonly SerpResultFact[];
};

/* ------------------ quem foi observado nesta avaliação ------------------- */

/**
 * Uma keyword do grupo SEM SERP nesta avaliação — não é membro vazio.
 *
 * No perfil KGR leve com Principal clara, só a Principal é consultada. Antes,
 * a secundária não consultada entrava no parecer com `results: []`: o par com
 * a Principal dava sobreposição `nenhuma` e intenção `indefinido`, diferente
 * da dela, e a busca virava "de fora". O parecer recomendava dividir o artigo
 * por FALTA de dado, não por evidência. Ausência de observação não diverge de
 * nada: a busca fica registrada como não observada e sai da conta.
 */
export type UnobservedKeyword = {
  keywordId: string;
  keyword: string;
  role: KeywordSerpFacts["role"];
  reason: string;
};

export const NOT_OBSERVED_REASON = "Sem SERP consultada nesta validação: não conta como convergente nem como de fora.";

/** O recorte de um resultado orgânico que o parecer lê. Estrutural, não o tipo inteiro. */
type ObservedResultLike = {
  position?: unknown;
  title?: unknown;
  url?: unknown;
  domain?: unknown;
  snippet?: unknown;
  inferredType?: unknown;
  manualType?: unknown;
};

type ObservedSnapshotLike = {
  keywordId?: string;
  organicResults?: ReadonlyArray<ObservedResultLike>;
};

/** A mesma leitura de resultado na rota e na reconstrução de um registro antigo. */
const factOf = (result: ObservedResultLike): SerpResultFact => ({
  position: Number(result.position) || 0,
  title: String(result.title || ""),
  url: String(result.url || ""),
  domain: String(result.domain || ""),
  snippet: String(result.snippet || ""),
  inferredType: String(result.manualType || result.inferredType || "other"),
});

/**
 * Separa as keywords do grupo entre OBSERVADAS e NÃO OBSERVADAS.
 *
 * Só é membro quem tem snapshot nesta avaliação. Quem não tem vira
 * `notObserved` com o motivo, e não conta em `total` nem em `outsiders`.
 * Um snapshot presente e sem resultados continua membro: a SERP foi
 * consultada e voltou vazia, e isso é observação.
 */
export function splitArticleSerpMembers(input: {
  keywords: readonly { keywordId: string; keyword: string; role: KeywordSerpFacts["role"] }[];
  snapshots: readonly ObservedSnapshotLike[];
}): { members: KeywordSerpFacts[]; notObserved: UnobservedKeyword[] } {
  const members: KeywordSerpFacts[] = [];
  const notObserved: UnobservedKeyword[] = [];
  for (const item of input.keywords) {
    const snapshot = input.snapshots.find(candidate => candidate.keywordId === item.keywordId);
    if (!snapshot) {
      notObserved.push({ keywordId: item.keywordId, keyword: item.keyword, role: item.role, reason: NOT_OBSERVED_REASON });
      continue;
    }
    members.push({
      keywordId: item.keywordId,
      keyword: item.keyword,
      role: item.role,
      results: (snapshot.organicResults || []).map(factOf),
    });
  }
  return { members, notObserved };
}

const nomesDe = (items: readonly { keyword: string }[]) => items.map(item => `"${item.keyword}"`).join(", ");

/* ----------------------- intenção observada na SERP ---------------------- */

export const OBSERVED_INTENTS = ["informacional", "comercial", "transacional", "navegacional", "misto", "indefinido"] as const;
export type ObservedIntent = (typeof OBSERVED_INTENTS)[number];

const COMERCIAL = ["melhor", "melhores", "review", "resenha", "vale a pena", "comparativo", "vs", "top ", "ranking"];
const TRANSACIONAL = ["comprar", "preço", "preco", "oferta", "desconto", "cupom", "frete", "loja"];
const INFORMACIONAL = ["como", "o que", "porque", "por que", "guia", "passo a passo", "dicas", "tutorial", "significa"];

// Comparativo e listagem pesam pesquisa de compra; página de produto já é
// a compra em si. Contar `product` como comercial empatava com os termos
// transacionais do próprio resultado e devolvia "misto" para SERP de loja.
const TIPOS_COMERCIAIS = new Set(["comparison", "list"]);
const TIPOS_TRANSACIONAIS = new Set(["product"]);
const TIPOS_INFORMACIONAIS = new Set(["article", "video", "faq"]);

const contem = (texto: string, termos: readonly string[]) => termos.some(termo => texto.includes(termo));

/**
 * A intenção que os RESULTADOS mostram.
 *
 * Sem consultar o que o Minerador declarou: se ele disse `unknown`, a SERP
 * continua tendo o que dizer, porque os resultados existem de qualquer jeito.
 */
export function observedIntentOf(results: readonly SerpResultFact[]): ObservedIntent {
  if (!results.length) return "indefinido";
  let comercial = 0;
  let transacional = 0;
  let informacional = 0;

  for (const result of results) {
    const texto = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
    if (contem(texto, TRANSACIONAL)) transacional += 1;
    if (contem(texto, COMERCIAL)) comercial += 1;
    if (contem(texto, INFORMACIONAL)) informacional += 1;
    if (TIPOS_COMERCIAIS.has(result.inferredType)) comercial += 1;
    if (TIPOS_TRANSACIONAIS.has(result.inferredType)) transacional += 1;
    if (TIPOS_INFORMACIONAIS.has(result.inferredType)) informacional += 1;
  }

  const maior = Math.max(comercial, transacional, informacional);
  if (!maior) return "indefinido";
  // Empate real é MISTO, não "o primeiro da lista": a SERP está mesmo dividida.
  const empatados = [comercial, transacional, informacional].filter(valor => valor === maior).length;
  if (empatados > 1) return "misto";
  if (maior === transacional) return "transacional";
  if (maior === comercial) return "comercial";
  return "informacional";
}

/** O tipo de página que domina os resultados. */
export function dominantTypeOf(results: readonly SerpResultFact[]): string {
  const contagem = new Map<string, number>();
  for (const result of results) contagem.set(result.inferredType, (contagem.get(result.inferredType) || 0) + 1);
  const ordenado = [...contagem.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return ordenado[0]?.[0] || "desconhecido";
}

/* -------------------- convergência entre duas buscas --------------------- */

export const OVERLAP_LEVELS = ["forte", "parcial", "baixa", "nenhuma"] as const;
export type OverlapLevel = (typeof OVERLAP_LEVELS)[number];

export type PairwiseOverlap = {
  leftKeywordId: string;
  rightKeywordId: string;
  sharedUrls: number;
  sharedDomains: number;
  level: OverlapLevel;
  sameIntent: boolean;
};

const topN = (results: readonly SerpResultFact[], limite = 10) =>
  [...results].sort((left, right) => left.position - right.position).slice(0, limite);

/**
 * Duas buscas competem pela MESMA página?
 *
 * URL repetida é o sinal forte: o Google devolveu literalmente o mesmo
 * conteúdo para as duas. Domínio repetido é sinal fraco — o mesmo site pode
 * responder duas necessidades com páginas diferentes, e tratar isso como
 * convergência juntaria conteúdos que o mercado separa.
 */
export function pairwiseOverlap(left: KeywordSerpFacts, right: KeywordSerpFacts): PairwiseOverlap {
  const esquerda = topN(left.results);
  const direita = topN(right.results);
  const urlsDireita = new Set(direita.map(item => item.url));
  const dominiosDireita = new Set(direita.map(item => item.domain));

  const sharedUrls = esquerda.filter(item => urlsDireita.has(item.url)).length;
  const sharedDomains = new Set(esquerda.filter(item => dominiosDireita.has(item.domain)).map(item => item.domain)).size;
  const sameIntent = observedIntentOf(left.results) === observedIntentOf(right.results);

  const level: OverlapLevel = sharedUrls >= 3 ? "forte"
    : sharedUrls >= 1 ? "parcial"
      : sharedDomains >= 3 ? "parcial"
        : sharedDomains >= 1 ? "baixa"
          : "nenhuma";

  return { leftKeywordId: left.keywordId, rightKeywordId: right.keywordId, sharedUrls, sharedDomains, level, sameIntent };
}

/* --------------------------- veredito da Principal ----------------------- */

export const PRINCIPAL_VERDICTS = ["PRINCIPAL_SUPPORTED", "PRINCIPAL_ALTERNATIVE_BETTER", "PRINCIPAL_INCONCLUSIVE"] as const;
export type PrincipalVerdictKind = (typeof PRINCIPAL_VERDICTS)[number];

export type PrincipalVerdict = {
  kind: PrincipalVerdictKind;
  principalKeywordId: string;
  /** Só quando outra busca cobre melhor o grupo; a troca continua humana. */
  principalAlternativeKeywordId: string | null;
  reason: string;
  /** Quantas buscas do grupo cada candidata a Principal alcança. */
  coverage: readonly { keywordId: string; reaches: number; total: number }[];
};

/**
 * A Principal escolhida é a melhor cabeceira?
 *
 * O critério é cobertura observada: quantas buscas do grupo compartilham
 * resultados com ela. Amplitude sozinha não basta — uma busca genérica pode
 * alcançar todas e não representar nenhuma —, por isso a alternativa só é
 * apontada quando alcança ESTRITAMENTE mais que a atual.
 *
 * A SERP nunca troca. Ela aponta e explica.
 */
export function resolvePrincipalVerdict(input: {
  members: readonly KeywordSerpFacts[];
  principalKeywordId: string;
  overlaps: readonly PairwiseOverlap[];
  /** Buscas do grupo sem SERP nesta avaliação: não disputam a cabeceira. */
  notObserved?: readonly UnobservedKeyword[];
}): PrincipalVerdict {
  const outros = input.members.filter(item => item.keywordId !== input.principalKeywordId);
  const total = outros.length;
  const naoObservadas = input.notObserved || [];

  const alcance = (keywordId: string) => input.overlaps.filter(item =>
    (item.leftKeywordId === keywordId || item.rightKeywordId === keywordId)
    && (item.level === "forte" || item.level === "parcial")).length;

  const coverage = input.members.map(item => ({
    keywordId: item.keywordId,
    reaches: alcance(item.keywordId),
    total,
  }));

  // Sem a SERP da Principal não há cabeceira a confirmar nem a contestar.
  if (!input.members.some(item => item.keywordId === input.principalKeywordId)) {
    return {
      kind: "PRINCIPAL_INCONCLUSIVE",
      principalKeywordId: input.principalKeywordId,
      principalAlternativeKeywordId: null,
      reason: "A Principal não tem SERP observada nesta validação; não há cabeceira a confirmar.",
      coverage,
    };
  }

  if (!total) {
    return {
      kind: "PRINCIPAL_SUPPORTED",
      principalKeywordId: input.principalKeywordId,
      principalAlternativeKeywordId: null,
      reason: naoObservadas.length
        ? `Só a Principal foi consultada nesta validação; ${nomesDe(naoObservadas)} ${naoObservadas.length > 1 ? "ficaram" : "ficou"} sem SERP, e nenhuma alternativa pode ser apontada.`
        : "O artigo tem uma busca só; ela é a cabeceira por definição.",
      coverage,
    };
  }

  const atual = coverage.find(item => item.keywordId === input.principalKeywordId);
  const melhor = [...coverage].sort((left, right) => right.reaches - left.reaches)[0];

  if (!atual || (!atual.reaches && !melhor.reaches)) {
    return {
      kind: "PRINCIPAL_INCONCLUSIVE",
      principalKeywordId: input.principalKeywordId,
      principalAlternativeKeywordId: null,
      reason: "Nenhuma busca do grupo compartilha resultados suficientes para indicar uma cabeceira.",
      coverage,
    };
  }
  if (melhor.keywordId !== input.principalKeywordId && melhor.reaches > atual.reaches) {
    const nomeAtual = input.members.find(item => item.keywordId === input.principalKeywordId)?.keyword || "a Principal atual";
    const nomeMelhor = input.members.find(item => item.keywordId === melhor.keywordId)?.keyword || "outra busca";
    return {
      kind: "PRINCIPAL_ALTERNATIVE_BETTER",
      principalKeywordId: input.principalKeywordId,
      principalAlternativeKeywordId: melhor.keywordId,
      reason: `"${nomeMelhor}" compartilha resultados com ${melhor.reaches} de ${total} busca(s) do grupo, contra ${atual.reaches} de "${nomeAtual}".`,
      coverage,
    };
  }
  return {
    kind: "PRINCIPAL_SUPPORTED",
    principalKeywordId: input.principalKeywordId,
    principalAlternativeKeywordId: null,
    reason: `A Principal compartilha resultados com ${atual.reaches} de ${total} busca(s) do grupo — nenhuma outra alcança mais.`,
    coverage,
  };
}

/* ----------------------------- veredito do grupo ------------------------- */

export const GROUP_VERDICTS = [
  "SUPPORTED",
  "SPLIT_RECOMMENDED",
  "REMOVE_KEYWORD_RECOMMENDED",
  "INCONCLUSIVE",
] as const;
export type GroupVerdictKind = (typeof GROUP_VERDICTS)[number];

export type GroupVerdict = {
  kind: GroupVerdictKind;
  /** Buscas que a SERP não vê como parte desta página. */
  outsiders: readonly { keywordId: string; keyword: string; reason: string }[];
  converging: number;
  total: number;
  reason: string;
};

/**
 * Estas buscas cabem em uma página só?
 *
 * Uma busca é "de fora" quando não compartilha resultado nenhum com a
 * Principal E a intenção observada dela é outra. Só um dos dois sinais é
 * fraco demais: SERPs sem sobreposição podem ainda ser a mesma necessidade
 * atendida por sites diferentes.
 */
export function resolveGroupVerdict(input: {
  members: readonly KeywordSerpFacts[];
  principalKeywordId: string;
  overlaps: readonly PairwiseOverlap[];
  /** Buscas do grupo sem SERP nesta avaliação: nem convergem, nem são de fora. */
  notObserved?: readonly UnobservedKeyword[];
}): GroupVerdict {
  const outros = input.members.filter(item => item.keywordId !== input.principalKeywordId);
  const total = outros.length;
  const naoObservadas = input.notObserved || [];
  // Dito na explicação, para a tela não mostrar "0 de 0" sem dizer por quê.
  const semSerp = naoObservadas.length
    ? ` ${naoObservadas.length} busca(s) do grupo sem SERP nesta validação (${nomesDe(naoObservadas)}) não entram na conta.`
    : "";

  if (!input.members.some(item => item.keywordId === input.principalKeywordId)) {
    return {
      kind: "INCONCLUSIVE",
      outsiders: [],
      converging: 0,
      total,
      reason: `Sem a SERP da Principal, não há com o que comparar as buscas de apoio.${semSerp}`,
    };
  }
  if (!total) {
    return {
      kind: "INCONCLUSIVE",
      outsiders: [],
      converging: 0,
      total: 0,
      reason: naoObservadas.length
        ? `Só a Principal foi observada nesta validação; sem par observado, a SERP não sustenta nem rejeita o agrupamento.${semSerp}`
        : "Uma busca sozinha não permite dizer se o agrupamento se sustenta; a SERP não tem par para comparar.",
    };
  }

  const comPrincipal = new Map(input.overlaps
    .filter(item => item.leftKeywordId === input.principalKeywordId || item.rightKeywordId === input.principalKeywordId)
    .map(item => [item.leftKeywordId === input.principalKeywordId ? item.rightKeywordId : item.leftKeywordId, item]));

  const outsiders: { keywordId: string; keyword: string; reason: string }[] = [];
  let converging = 0;

  for (const membro of outros) {
    const par = comPrincipal.get(membro.keywordId);
    if (!par) continue;
    if (par.level === "forte" || par.level === "parcial") {
      converging += 1;
      continue;
    }
    if (par.level === "nenhuma" && !par.sameIntent) {
      outsiders.push({
        keywordId: membro.keywordId,
        keyword: membro.keyword,
        reason: `Os resultados desta busca não se repetem com os da Principal e a intenção observada é ${observedIntentOf(membro.results)}.`,
      });
    }
  }

  if (outsiders.length && outsiders.length < total) {
    return {
      kind: outsiders.length === 1 ? "REMOVE_KEYWORD_RECOMMENDED" : "SPLIT_RECOMMENDED",
      outsiders,
      converging,
      total,
      reason: `${converging} de ${total} busca(s) convergem com a Principal; ${outsiders.length} apresentam SERP distinta.${semSerp}`,
    };
  }
  if (outsiders.length >= total) {
    return {
      kind: "SPLIT_RECOMMENDED",
      outsiders,
      converging,
      total,
      reason: `Nenhuma das buscas de apoio compartilha o padrão de resultados da Principal.${semSerp}`,
    };
  }
  if (!converging) {
    return {
      kind: "INCONCLUSIVE",
      outsiders: [],
      converging,
      total,
      reason: `Os resultados variam demais entre as buscas para sustentar ou rejeitar o agrupamento.${semSerp}`,
    };
  }
  return {
    kind: "SUPPORTED",
    outsiders: [],
    converging,
    total,
    reason: `${converging} de ${total} busca(s) de apoio compartilham resultados com a Principal.${semSerp}`,
  };
}

/* ---------------------- viabilidade competitiva observada ---------------- */

export const COMPETITIVE_VIABILITY = ["consistente", "competitivo", "fragmentado", "inconclusivo"] as const;
export type CompetitiveViability = (typeof COMPETITIVE_VIABILITY)[number];

export const COMPETITIVE_VIABILITY_TEXT: Record<CompetitiveViability, string> = {
  consistente: "A SERP brasileira mostra um padrão consistente para uma página com esta combinação.",
  competitivo: "O agrupamento faz sentido, mas o ambiente observado é competitivo.",
  fragmentado: "A SERP divide essas buscas em necessidades diferentes; juntar tudo reduz aderência ao padrão observado.",
  inconclusivo: "Os resultados variam demais para sustentar uma decisão forte.",
};

/**
 * "Vale a pena?" traduzido para o que pode ser observado.
 *
 * Nenhuma destas saídas promete posição, tráfego ou retorno: elas descrevem o
 * padrão que a busca brasileira devolveu, que é a única coisa que temos.
 */
export function resolveCompetitiveViability(input: {
  group: GroupVerdict;
  distinctDomains: number;
  totalResults: number;
}): { level: CompetitiveViability; text: string; distinctDomains: number } {
  const level: CompetitiveViability = input.group.kind === "SPLIT_RECOMMENDED" ? "fragmentado"
    : input.group.kind === "INCONCLUSIVE" ? "inconclusivo"
      : input.distinctDomains >= 8 || input.totalResults >= 25 ? "competitivo"
        : "consistente";
  return { level, text: COMPETITIVE_VIABILITY_TEXT[level], distinctDomains: input.distinctDomains };
}

/* ------------------------------ parecer completo ------------------------- */

export type ArticleSerpInterpretation = {
  candidateRef: string;
  principal: PrincipalVerdict;
  group: GroupVerdict;
  overlaps: readonly PairwiseOverlap[];
  observedIntent: ObservedIntent;
  dominantType: string;
  viability: { level: CompetitiveViability; text: string; distinctDomains: number };
  /** O veredito do gate, derivado das duas perguntas. */
  verdict: "COMPATIBLE" | "INCONCLUSIVE" | "DIVERGENCE";
  recommendation: string;
  reason: string;
  /** Buscas do grupo sem SERP nesta avaliação. Vazio quando todas foram observadas. */
  notObserved: readonly UnobservedKeyword[];
};

export function interpretArticleSerp(input: {
  candidateRef: string;
  /** Só as buscas COM SERP nesta avaliação (`splitArticleSerpMembers`). */
  members: readonly KeywordSerpFacts[];
  principalKeywordId: string;
  /** As do grupo sem SERP: registradas, fora da conta. */
  notObserved?: readonly UnobservedKeyword[];
}): ArticleSerpInterpretation {
  const overlaps: PairwiseOverlap[] = [];
  for (let i = 0; i < input.members.length; i += 1) {
    for (let j = i + 1; j < input.members.length; j += 1) {
      overlaps.push(pairwiseOverlap(input.members[i], input.members[j]));
    }
  }
  return interpretFromOverlaps({ ...input, overlaps });
}

/**
 * O parecer a partir das sobreposições JÁ decididas — de uma lente só, ou do
 * voto agregado das quatro. As duas perguntas, a viabilidade e o mercado
 * observado são sempre os da lente principal: os limiares de viabilidade
 * (≥ 8 domínios, ≥ 25 resultados) foram calibrados em uma lente, e a união das
 * quatro os inflaria.
 */
function interpretFromOverlaps(input: {
  candidateRef: string;
  members: readonly KeywordSerpFacts[];
  principalKeywordId: string;
  notObserved?: readonly UnobservedKeyword[];
  overlaps: readonly PairwiseOverlap[];
}): ArticleSerpInterpretation {
  const notObserved = [...(input.notObserved || [])];
  const overlaps = [...input.overlaps];

  const principal = resolvePrincipalVerdict({ members: input.members, principalKeywordId: input.principalKeywordId, overlaps, notObserved });
  const group = resolveGroupVerdict({ members: input.members, principalKeywordId: input.principalKeywordId, overlaps, notObserved });

  const todos = input.members.flatMap(item => item.results);
  const viability = resolveCompetitiveViability({
    group,
    distinctDomains: new Set(todos.map(item => item.domain)).size,
    totalResults: todos.length,
  });

  // Divergência é quando o mercado aponta algo concreto: separar, remover ou
  // uma cabeceira melhor. Inconclusivo é quando ele não aponta nada.
  const verdict = group.kind === "SPLIT_RECOMMENDED"
    || group.kind === "REMOVE_KEYWORD_RECOMMENDED"
    || principal.kind === "PRINCIPAL_ALTERNATIVE_BETTER"
    ? "DIVERGENCE" as const
    : group.kind === "INCONCLUSIVE" || principal.kind === "PRINCIPAL_INCONCLUSIVE"
      ? "INCONCLUSIVE" as const
      : "COMPATIBLE" as const;

  const recommendation = group.outsiders.length
    ? `Separar ${group.outsiders.map(item => `"${item.keyword}"`).join(" e ")} deste artigo.`
    : principal.kind === "PRINCIPAL_ALTERNATIVE_BETTER"
      ? "Revisar qual busca encabeça o artigo."
      : verdict === "COMPATIBLE"
        ? "Manter a composição como está."
        : "Decidir explicitamente: a evidência não confirma nem rejeita.";

  return {
    candidateRef: input.candidateRef,
    principal,
    group,
    overlaps,
    observedIntent: observedIntentOf(todos),
    dominantType: dominantTypeOf(todos),
    viability,
    verdict,
    recommendation,
    reason: `${group.reason} ${principal.reason}`.trim(),
    notObserved,
  };
}

/* ----------------------------- as quatro lentes --------------------------- */

/**
 * As buscas observadas numa lente. Na principal, os fatos vêm do corpo
 * normalizado; nas extras, do digest orgânico normalizado pela mesma regra.
 * Só entram as buscas que a lente de fato observou.
 */
export type LensKeywordFacts = { lens: string; members: readonly KeywordSerpFacts[] };

const converge = (level: OverlapLevel) => level === "forte" || level === "parcial";

/**
 * O voto de um par de buscas nas lentes em que as DUAS foram observadas
 * (adendo das 4 lentes, A3 item 5). A primeira sobreposição é a da lente
 * principal; os números compartilhados exibidos são os dela.
 *
 *   converge   — sobreposição forte ou parcial em PELO MENOS DUAS lentes;
 *   de fora    — sobreposição nenhuma em TODAS as lentes observadas e intenção
 *                observada diferente na MAIORIA (mais da metade) delas;
 *   nenhum dos dois — o par não converge nem é de fora ("baixa"), e a
 *                divergência entre lentes fica registrada no marcador.
 *
 * Com UMA lente observada, o voto é exatamente o de hoje. A concordância entre
 * lentes não é reforço: as lentes compartilham a maior parte do top 10
 * (divergência medida 0,061 e 0,174) e não são amostras independentes.
 */
export function aggregatePairAcrossLenses(votes: readonly PairwiseOverlap[]): PairwiseOverlap {
  if (!votes.length) throw new Error("Par sem lente observada.");
  if (votes.length === 1) return votes[0];
  const [principal] = votes;
  const n = votes.length;
  const mesmaIntencao = votes.filter(vote => vote.sameIntent).length;
  const intencaoDaMaioria = mesmaIntencao > n / 2;
  const convergentes = votes.filter(vote => converge(vote.level));
  const base = { leftKeywordId: principal.leftKeywordId, rightKeywordId: principal.rightKeywordId, sharedUrls: principal.sharedUrls, sharedDomains: principal.sharedDomains };
  if (convergentes.length >= 2) {
    const fortes = votes.filter(vote => vote.level === "forte").length;
    return { ...base, level: fortes >= 2 ? "forte" : "parcial", sameIntent: intencaoDaMaioria };
  }
  if (votes.every(vote => vote.level === "nenhuma")) {
    const intencaoDiferente = n - mesmaIntencao;
    return { ...base, level: "nenhuma", sameIntent: !(intencaoDiferente > n / 2) };
  }
  return { ...base, level: "baixa", sameIntent: intencaoDaMaioria };
}

export type ArticleSerpLensReading = {
  lens: string;
  observedKeywords: number;
  /** O veredito que esta lente sozinha daria; `null` quando a Principal não foi observada nela. */
  verdict: ArticleSerpInterpretation["verdict"] | null;
  pairs: { left: string; right: string; level: OverlapLevel }[];
};

export type ArticleSerpLensesInterpretation = ArticleSerpInterpretation & {
  lensReadings: ArticleSerpLensReading[];
  /** Lentes em que a Principal foi observada. */
  observedLenses: string[];
  /** Das observadas, quantas dão sozinhas o mesmo veredito do agregado. */
  agreeingLenses: number;
};

/**
 * O parecer de formação nas quatro lentes.
 *
 * Os membros, a viabilidade, a intenção e o tipo dominante continuam os da
 * lente principal — o snapshot do ArticleDNA sai dela, como antes. O que muda
 * é o voto de cada par: agregado pelas lentes em que as duas buscas foram
 * observadas. Lente faltante nunca vira "de fora": ela só não vota.
 */
export function interpretArticleSerpAcrossLenses(input: {
  candidateRef: string;
  primary: LensKeywordFacts;
  extras: readonly LensKeywordFacts[];
  principalKeywordId: string;
  notObserved?: readonly UnobservedKeyword[];
}): ArticleSerpLensesInterpretation {
  const members = input.primary.members;
  const lentes = [input.primary, ...input.extras];
  const porLente = lentes.map(lente => ({ lente, porId: new Map(lente.members.map(member => [member.keywordId, member])) }));
  const pares = new Map(lentes.map(lente => [lente.lens, [] as { left: string; right: string; level: OverlapLevel }[]]));

  const overlaps: PairwiseOverlap[] = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const votos: PairwiseOverlap[] = [];
      for (const { lente, porId } of porLente) {
        const esquerda = porId.get(members[i].keywordId);
        const direita = porId.get(members[j].keywordId);
        if (!esquerda || !direita) continue;
        const voto = pairwiseOverlap(esquerda, direita);
        votos.push(voto);
        pares.get(lente.lens)?.push({ left: voto.leftKeywordId, right: voto.rightKeywordId, level: voto.level });
      }
      overlaps.push(aggregatePairAcrossLenses(votos));
    }
  }

  const parecer = interpretFromOverlaps({
    candidateRef: input.candidateRef,
    members,
    principalKeywordId: input.principalKeywordId,
    notObserved: input.notObserved,
    overlaps,
  });

  const lensReadings: ArticleSerpLensReading[] = porLente.map(({ lente, porId }) => {
    const observada = porId.has(input.principalKeywordId);
    return {
      lens: lente.lens,
      observedKeywords: lente.members.length,
      verdict: observada
        ? interpretArticleSerp({ candidateRef: input.candidateRef, members: lente.members, principalKeywordId: input.principalKeywordId }).verdict
        : null,
      pairs: pares.get(lente.lens) || [],
    };
  });
  const observadas = lensReadings.filter(reading => reading.verdict !== null);
  return {
    ...parecer,
    lensReadings,
    observedLenses: observadas.map(reading => reading.lens),
    agreeingLenses: observadas.filter(reading => reading.verdict === parecer.verdict).length,
  };
}

/** Os fatos que o parecer lê de um snapshot normalizado — a mesma leitura da rota. */
export const serpResultFactsOf = (snapshot: ObservedSnapshotLike): SerpResultFact[] =>
  (snapshot.organicResults || []).map(factOf);

/**
 * O marcador de lentes do parecer de formação (A5), a partir do parecer nas
 * quatro lentes e das datas de cada leitura usada.
 *
 * `collectedAtByKeyword`: por keyword, a data de cada lente lida. O portão de
 * datas é POR KEYWORD (a diferença entre as lentes da mesma busca); o parecer
 * marca a maior delas.
 */
export function formationLensesMarkerOf(input: {
  requested: readonly string[];
  interpretation: Pick<ArticleSerpLensesInterpretation, "lensReadings" | "observedLenses" | "agreeingLenses">;
  collectedAtByLens: ReadonlyMap<string, readonly string[]>;
  collectedAtByKeyword: ReadonlyMap<string, readonly string[]>;
  missing: SerpLensesMarker["missing"];
  withExtras: boolean;
}): SerpLensesMarker {
  const perLens = input.interpretation.lensReadings.map(reading => {
    const datas = [...(input.collectedAtByLens.get(reading.lens) || [])].sort();
    return {
      lens: reading.lens,
      observedQueries: reading.observedKeywords,
      oldestCollectedAt: datas[0] ?? null,
      newestCollectedAt: datas.at(-1) ?? null,
      verdict: reading.verdict,
      pairs: reading.pairs.map(pair => ({ ...pair })),
    };
  });
  let spread = 0;
  for (const datas of input.collectedAtByKeyword.values()) spread = Math.max(spread, collectedAtSpreadDays(datas));
  return {
    requested: [...input.requested],
    observed: [...input.interpretation.observedLenses],
    missing: input.missing.map(item => ({ ...item })),
    perLens,
    agreement: lensAgreementLabel(input.interpretation.agreeingLenses, input.interpretation.observedLenses.length),
    collectedAtSpreadDays: spread,
    datesDiverge: spread > SERP_LENS_DATES_DIVERGE_DAYS,
    ...(input.withExtras ? { note: SERP_LENS_DIGEST_NOTE } : {}),
  };
}

/* ---------------- leitura de um parecer já gravado no remoto -------------- */

/**
 * Deriva o parecer legível de um registro que ainda não o carrega.
 *
 * O campo legível nasceu depois dos primeiros registros. Em vez de cobrar do
 * provider uma coleta que não traria nada novo, o parecer é reconstruído dos
 * MESMOS snapshots que já vieram do remoto — os resultados observados estão
 * todos lá. Registros novos trazem o parecer gravado e não passam por aqui.
 */
export function articleSerpParecerFromAssessment(
  registro: {
    candidateRef: string;
    assessment: { snapshots?: readonly unknown[] };
  },
  candidate: {
    principalKeywordId: string;
    keywords?: readonly { keywordId: string; role: string }[];
    /**
     * Só os ids, sem papel: um chamador da mesa passa a composição aprovada
     * assim. Sem esta leitura, `keywords` ausente derrubava a reconstrução.
     */
    keywordIds?: readonly string[];
  },
  labelOf?: (keywordId: string) => string,
) {
  const snapshots = (registro.assessment.snapshots || []) as ReadonlyArray<ObservedSnapshotLike>;
  if (!snapshots.length) return null;

  const composicao = candidate.keywords
    || (candidate.keywordIds || []).map(keywordId => ({ keywordId, role: keywordId === candidate.principalKeywordId ? "principal" : "secundaria" }));
  // A mesma regra da rota: keyword sem snapshot no registro não vira membro vazio.
  const { members, notObserved } = splitArticleSerpMembers({
    keywords: composicao.map(item => ({
      keywordId: item.keywordId,
      keyword: labelOf?.(item.keywordId) || item.keywordId,
      role: item.role === "principal" ? "principal" as const : item.role === "reforco" ? "reforco" as const : "secundaria" as const,
    })),
    snapshots,
  });
  if (!members.length) return null;

  const parecer = interpretArticleSerp({
    candidateRef: registro.candidateRef,
    members,
    principalKeywordId: candidate.principalKeywordId,
    notObserved,
  });

  return {
    principalVerdict: parecer.principal.kind,
    principalAlternativeKeywordId: parecer.principal.principalAlternativeKeywordId,
    principalReason: parecer.principal.reason,
    groupVerdict: parecer.group.kind,
    groupReason: parecer.group.reason,
    outsiders: parecer.group.outsiders.map(item => ({ ...item })),
    observedIntent: parecer.observedIntent,
    dominantType: parecer.dominantType,
    viability: parecer.viability.level,
    viabilityText: parecer.viability.text,
    distinctDomains: parecer.viability.distinctDomains,
    converging: parecer.group.converging,
    total: parecer.group.total,
    recommendation: parecer.recommendation,
    ...(parecer.notObserved.length ? { notObserved: notObservedRecordOf(parecer.notObserved) } : {}),
  };
}

/** O que o registro guarda de cada busca não observada: identidade e motivo. */
export function notObservedRecordOf(items: readonly UnobservedKeyword[]) {
  return items.map(item => ({ keywordId: item.keywordId, keyword: item.keyword || item.keywordId, reason: item.reason }));
}
