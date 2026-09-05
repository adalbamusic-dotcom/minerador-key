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
}): PrincipalVerdict {
  const outros = input.members.filter(item => item.keywordId !== input.principalKeywordId);
  const total = outros.length;

  const alcance = (keywordId: string) => input.overlaps.filter(item =>
    (item.leftKeywordId === keywordId || item.rightKeywordId === keywordId)
    && (item.level === "forte" || item.level === "parcial")).length;

  const coverage = input.members.map(item => ({
    keywordId: item.keywordId,
    reaches: alcance(item.keywordId),
    total,
  }));

  if (!total) {
    return {
      kind: "PRINCIPAL_SUPPORTED",
      principalKeywordId: input.principalKeywordId,
      principalAlternativeKeywordId: null,
      reason: "O artigo tem uma busca só; ela é a cabeceira por definição.",
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
}): GroupVerdict {
  const outros = input.members.filter(item => item.keywordId !== input.principalKeywordId);
  const total = outros.length;
  if (!total) {
    return {
      kind: "INCONCLUSIVE",
      outsiders: [],
      converging: 0,
      total: 0,
      reason: "Uma busca sozinha não permite dizer se o agrupamento se sustenta; a SERP não tem par para comparar.",
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
      reason: `${converging} de ${total} busca(s) convergem com a Principal; ${outsiders.length} apresentam SERP distinta.`,
    };
  }
  if (outsiders.length >= total) {
    return {
      kind: "SPLIT_RECOMMENDED",
      outsiders,
      converging,
      total,
      reason: "Nenhuma das buscas de apoio compartilha o padrão de resultados da Principal.",
    };
  }
  if (!converging) {
    return {
      kind: "INCONCLUSIVE",
      outsiders: [],
      converging,
      total,
      reason: "Os resultados variam demais entre as buscas para sustentar ou rejeitar o agrupamento.",
    };
  }
  return {
    kind: "SUPPORTED",
    outsiders: [],
    converging,
    total,
    reason: `${converging} de ${total} busca(s) de apoio compartilham resultados com a Principal.`,
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
};

export function interpretArticleSerp(input: {
  candidateRef: string;
  members: readonly KeywordSerpFacts[];
  principalKeywordId: string;
}): ArticleSerpInterpretation {
  const overlaps: PairwiseOverlap[] = [];
  for (let i = 0; i < input.members.length; i += 1) {
    for (let j = i + 1; j < input.members.length; j += 1) {
      overlaps.push(pairwiseOverlap(input.members[i], input.members[j]));
    }
  }

  const principal = resolvePrincipalVerdict({ members: input.members, principalKeywordId: input.principalKeywordId, overlaps });
  const group = resolveGroupVerdict({ members: input.members, principalKeywordId: input.principalKeywordId, overlaps });

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
    keywords: readonly { keywordId: string; role: string }[];
  },
  labelOf?: (keywordId: string) => string,
) {
  const snapshots = (registro.assessment.snapshots || []) as ReadonlyArray<{
    keywordId?: string;
    organicResults?: ReadonlyArray<Record<string, unknown>>;
  }>;
  if (!snapshots.length) return null;

  const members: KeywordSerpFacts[] = candidate.keywords.map(item => ({
    keywordId: item.keywordId,
    keyword: labelOf?.(item.keywordId) || item.keywordId,
    role: item.role === "principal" ? "principal" : item.role === "reforco" ? "reforco" : "secundaria",
    results: (snapshots.find(snapshot => snapshot.keywordId === item.keywordId)?.organicResults || []).map(result => ({
      position: Number(result.position) || 0,
      title: String(result.title || ""),
      url: String(result.url || ""),
      domain: String(result.domain || ""),
      snippet: String(result.snippet || ""),
      inferredType: String(result.manualType || result.inferredType || "other"),
    })),
  }));
  if (!members.length) return null;

  const parecer = interpretArticleSerp({
    candidateRef: registro.candidateRef,
    members,
    principalKeywordId: candidate.principalKeywordId,
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
  };
}
