/**
 * LEITURA da formação — este módulo NÃO é o formador.
 *
 * A autoridade da composição é `engine.ts`, que já sabia agrupar keywords,
 * escolher Principal e classificar papéis muito antes da inversão Silo-first.
 * Aqui os grupos chegam prontos e o módulo responde as perguntas da revisão:
 * por que um candidato ficou sozinho, quais se aproximam demais, qual endereço
 * é pobre e o que já existe publicado.
 *
 * `sameArticleAffinity` segue exportado como MEDIDA de comparação para a
 * revisão — nunca como critério de agrupamento. Dois motores decidindo
 * composição foi exatamente o que produziu 13 artigos de uma keyword só.
 *
 * O agrupamento interno só roda para keywords que o formador canônico não
 * cobriu, e é fallback — não autoridade.
 *
 * A pergunta desta fase é diferente da fase Silos. Lá se perguntava quais
 * universos narrativos existem. Aqui, dentro de UM universo:
 *
 *     quais dessas buscas pertencem ao mesmo conteúdo, e qual delas lidera?
 *
 * Por isso o algoritmo NÃO é o do `KeywordUniverse`: aquele procura amplitude
 * (eixos distintos sustentam um universo); este procura convergência (mesma
 * intenção, mesmo problema central) para evitar canibalização.
 *
 * `1 keyword → 1 Article` é justamente o que este módulo existe para impedir.
 *
 * Domínio puro: sem provider, sem storage, sem UI. Não cria ArticleDNA — o
 * resultado é CANDIDATO, para revisão humana.
 */

/** Papel da keyword dentro do Article. Sugestão, não decisão. */
export type ArticleKeywordRole = "principal" | "secundaria" | "reforco";

/**
 * Teto estratégico do Article, não meta.
 *
 * Seis é o limite quando há mesma intenção E coerência semântica. Preencher
 * até seis artificialmente juntaria buscas que pedem conteúdos diferentes.
 */
export const MAX_ARTICLE_KEYWORDS = 6;

export type ArticleFormationKeyword = {
  keywordId: string;
  keyword: string;
  intent: string | null;
  volume: number | null;
  kgr: number | null;
  /** Entidade central declarada pela análise semântica do Minerador. */
  entity: string | null;
  /** Problema/pergunta central observado. */
  problem: string | null;
  isPublished: boolean;
  /**
   * Agrupamento decidido por um humano, lido do payload canônico da keyword.
   *
   * Quando existe, ele MANDA: o algoritmo determinístico não desfaz revisão.
   */
  humanFormationRef?: string | null;
  /** Papel escolhido junto com o agrupamento. */
  humanRole?: ArticleKeywordRole | null;
};

export type ArticleCandidate = {
  /** Identidade DERIVADA da composição. Nunca é um articleId. */
  candidateRef: string;
  siloRef: string;
  /** Keyword que lidera; sugerida até a decisão humana. */
  principalKeywordId: string;
  keywords: { keywordId: string; role: ArticleKeywordRole }[];
  /** Slug proposto para conteúdo novo; publicado nunca passa por aqui. */
  suggestedSlug: string | null;
  /**
   * Keywords que convergiram com este artigo mas passaram do teto de seis.
   *
   * Não formam outro artigo: são excesso do mesmo assunto, esperando decisão
   * editorial sobre o que é núcleo e o que é reforço.
   */
  overflowKeywordIds: string[];
  /**
   * De onde veio esta composição.
   *
   * `human` significa revisão feita: reprocessar não pode desfazê-la em
   * silêncio. `mixed` é o caso em que o humano agrupou e o lote mudou depois.
   */
  origin: "logic" | "human";
  /** A composição humana ainda descreve o lote de agora? */
  stale: boolean;
  scores: {
    coherence: { value: number; reasons: string[] };
    intent: { value: number; reasons: string[] };
    centrality: { value: number; reasons: string[] };
  };
  cannibalizationRisk: "baixa" | "média" | "alta";
  conflicts: string[];
  reason: string;
};

/** Página publicada reconhecida sob o Silo — nunca vira Article novo. */
export type PublishedArticleRef = {
  normalizedUrl: string;
  path: string;
  label: string;
  canonical: string | null;
  /** Keyword equivalente já publicada, quando reconhecida. */
  matchedKeywordId: string | null;
};

export type ArticleFormationUniverse = {
  siloRef: string;
  siloLabel: string;
  siloSlug: string | null;
  keywordIds: string[];
  publishedArticles: PublishedArticleRef[];
  candidates: ArticleCandidate[];
  /** Keywords que não convergiram com ninguém e seguem livres. */
  ungroupedKeywordIds: string[];
  /** Por que cada candidato de uma keyword só ficou sozinho. */
  singletonAudits: SingletonAudit[];
  /** O que ficou separado mas talvez devesse estar junto. */
  relations: ArticleCandidateRelation[];
  /** Keywords equivalentes a conteúdo já publicado. */
  matchedToPublished: { keywordId: string; normalizedUrl: string }[];
  conflicts: string[];
};

/* ------------------------------ comparação ------------------------------- */

const STOPWORDS = new Set(["para", "com", "sem", "por", "que", "dos", "das", "uma", "seu", "sua", "mais", "como"]);

const tokensOf = (value: string) =>
  new Set(
    value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2 && !STOPWORDS.has(token))
      .map(token => token.replace(/s$/, "")),
  );

const overlap = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
};

const normalizedIntent = (value: string | null) => (value || "").trim().toLowerCase() || null;

/**
 * Duas buscas pedem o mesmo conteúdo?
 *
 * Overlap lexical é EVIDÊNCIA, não decisão: `vitamina c para pele` e
 * `vitamina c principia antes e depois` compartilham a expressão e pedem
 * conteúdos diferentes. Por isso intenção divergente derruba o par mesmo com
 * sobreposição alta.
 */
export function sameArticleAffinity(
  left: ArticleFormationKeyword,
  right: ArticleFormationKeyword,
  /**
   * Tokens do tema do próprio Silo. Dentro de um silo de skin care TODAS as
   * keywords contêm "skin care": contá-los como convergência juntaria buscas
   * que só têm o tema do pai em comum. O que distingue é o resto.
   */
  siloTokens: ReadonlySet<string> = new Set(),
): {
  affinity: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  const leftIntent = normalizedIntent(left.intent);
  const rightIntent = normalizedIntent(right.intent);
  if (leftIntent && rightIntent && leftIntent !== rightIntent) {
    return { affinity: 0, reasons: ["intenções principais diferentes"] };
  }

  const semSilo = (value: string) => {
    const tokens = tokensOf(value);
    for (const token of siloTokens) tokens.delete(token);
    return tokens;
  };
  const leftRestante = semSilo(left.keyword);
  const rightRestante = semSilo(right.keyword);
  // Descontar o tema do pai é diferente de apagar a busca. Quando NADA sobra
  // dos dois lados, as duas buscas são o próprio tema do Silo dito de dois
  // jeitos — "skin care pele oleosa" e "skin care para peles oleosas" pedem o
  // mesmo conteúdo. Aí a comparação volta a ser sobre os termos inteiros.
  const lexical = !leftRestante.size && !rightRestante.size
    ? overlap(tokensOf(left.keyword), tokensOf(right.keyword))
    : overlap(leftRestante, rightRestante);
  let affinity = lexical * 0.6;
  if (lexical >= 0.6) reasons.push("as formulações compartilham o núcleo da busca");

  if (leftIntent && rightIntent && leftIntent === rightIntent) {
    affinity += 0.2;
    reasons.push("mesma intenção principal");
  }
  if (left.entity && right.entity && left.entity.trim().toLowerCase() === right.entity.trim().toLowerCase()) {
    affinity += 0.1;
    reasons.push("mesma entidade central");
  }
  if (left.problem && right.problem && left.problem.trim().toLowerCase() === right.problem.trim().toLowerCase()) {
    affinity += 0.15;
    reasons.push("respondem ao mesmo problema central");
  }
  if (!reasons.length) reasons.push("sem convergência suficiente entre as buscas");
  return { affinity: Math.min(affinity, 1), reasons };
}

/**
 * Tokens que o Silo já carrega — vindos do nome e do slug dele.
 *
 * Servem para descontar o tema do pai antes de medir convergência: dentro de
 * um silo de skin care, "skin care" não aproxima nada porque está em todas.
 */
export function siloThemeTokens(input: {
  siloLabel: string;
  siloSlug: string | null;
  /**
   * O DNA do Silo confirmado. O slug é UM sinal do tema do pai — e o mais
   * pobre deles: ele é um endereço, não um assunto. Entidade central, intenção
   * macro e fronteira dizem muito mais sobre o que já pertence ao universo.
   */
  centralEntity?: string | null;
  macroIntent?: string | null;
  boundaryIncludes?: readonly string[];
  narrative?: string | null;
}): ReadonlySet<string> {
  const tokens = tokensOf(input.siloLabel);
  for (const token of tokensOf((input.siloSlug || "").replace(/[/-]+/g, " "))) tokens.add(token);
  for (const token of tokensOf(input.centralEntity || "")) tokens.add(token);
  for (const token of tokensOf(input.macroIntent || "")) tokens.add(token);
  // A fronteira declara o que o Silo já cobre: repetir isso entre keywords não
  // aproxima nada, porque vale para todas elas.
  for (const item of input.boundaryIncludes || []) {
    for (const token of tokensOf(item)) tokens.add(token);
  }
  for (const token of tokensOf(input.narrative || "")) tokens.add(token);
  return tokens;
}

/** Abaixo disso as buscas pedem conteúdos diferentes. */
const AFFINITY_FLOOR = 0.5;
/** Acima disso, separar viraria canibalização. */
const CANNIBAL_FLOOR = 0.75;

/* ------------------------------- principal ------------------------------- */

/**
 * Qual keyword lidera o Article.
 *
 * Volume sozinho escolheria a busca mais popular, não a que melhor representa
 * o conteúdo. Centralidade — quanto a keyword conecta as demais do grupo — vem
 * primeiro; volume e KGR desempatam.
 */
export function suggestPrincipal(input: {
  keywords: readonly ArticleFormationKeyword[];
  siloTokens?: ReadonlySet<string>;
}): { keywordId: string; reasons: string[] } | null {
  if (!input.keywords.length) return null;
  const publicada = input.keywords.find(keyword => keyword.isPublished);
  if (publicada) {
    return { keywordId: publicada.keywordId, reasons: ["a keyword já está publicada e ancora o conteúdo existente"] };
  }

  // Núcleo do grupo: o que a maioria das buscas repete. Tudo além disso é
  // qualificação — `para o rosto` estreita o assunto em vez de nomeá-lo.
  const frequencia = new Map<string, number>();
  for (const keyword of input.keywords) {
    for (const token of tokensOf(keyword.keyword)) {
      frequencia.set(token, (frequencia.get(token) ?? 0) + 1);
    }
  }
  const nucleo = new Set(
    [...frequencia.entries()].filter(([, vezes]) => vezes > input.keywords.length / 2).map(([token]) => token),
  );

  const scored = input.keywords.map(keyword => {
    const centralidade = input.keywords
      .filter(other => other.keywordId !== keyword.keywordId)
      .reduce((total, other) => total + sameArticleAffinity(keyword, other, input.siloTokens).affinity, 0)
      / Math.max(input.keywords.length - 1, 1);
    // Quantos termos a busca acrescenta ao núcleo do grupo.
    const especificidade = [...tokensOf(keyword.keyword)].filter(token => !nucleo.has(token)).length;
    return { keyword, centralidade, especificidade };
  }).sort((left, right) => {
    if (right.centralidade !== left.centralidade) return right.centralidade - left.centralidade;
    // Empatadas em centralidade, a menos específica representa o grupo: uma
    // busca que contém a outra parece central por conter, não por representar.
    if (left.especificidade !== right.especificidade) return left.especificidade - right.especificidade;
    // KGR menor é mais acessível; volume maior desempata por último.
    const kgrLeft = left.keyword.kgr ?? Number.POSITIVE_INFINITY;
    const kgrRight = right.keyword.kgr ?? Number.POSITIVE_INFINITY;
    if (kgrLeft !== kgrRight) return kgrLeft - kgrRight;
    return (right.keyword.volume ?? 0) - (left.keyword.volume ?? 0);
  });

  const escolhida = scored[0];
  const empatouCentralidade = scored.length > 1 && scored[1].centralidade === escolhida.centralidade;
  const reasons = [
    empatouCentralidade && scored[1].especificidade !== escolhida.especificidade
      ? "centralidade equivalente; a formulação menos específica representa o grupo"
      : "maior centralidade dentro do grupo",
  ];
  if (escolhida.keyword.kgr != null) reasons.push(`KGR ${escolhida.keyword.kgr}`);
  if (escolhida.keyword.volume != null) reasons.push(`volume ${escolhida.keyword.volume}`);
  return { keywordId: escolhida.keyword.keywordId, reasons };
}

/* ------------------------------- formação -------------------------------- */

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100)));

const slugify = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Slug do Article novo, relativo ao Silo pai.
 *
 * O pai já carrega o tema: repeti-lo no filho produz `/cremes/creme-para-o-rosto`
 * onde `/cremes/para-o-rosto` diria a mesma coisa. Isso é qualidade
 * arquitetural, não penalidade de buscador.
 */
export function suggestArticleSlug(input: {
  principal: ArticleFormationKeyword;
  siloSlug: string | null;
}): string {
  const base = slugify(input.principal.keyword);
  if (!input.siloSlug) return base;
  // Plural do pai também é o pai:  cobre .
  const semPlural = (token: string) => token.replace(/s$/, "");
  const siloTokens = new Set(slugify(input.siloSlug).split("-").filter(Boolean).map(semPlural));
  const restante = base.split("-").filter(token => token && !siloTokens.has(semPlural(token)));
  // Se sobrar nada, o slug do pai já diz tudo: aí o próprio termo se mantém.
  return restante.length ? restante.join("-") : base;
}

/**
 * Monta o universo de formação de UM Silo.
 *
 * Agrupa por convergência de intenção, sugere a principal, distribui papéis e
 * respeita o teto de seis. Nada aqui vira ArticleDNA.
 */
export function buildArticleFormationUniverse(input: {
  siloRef: string;
  siloLabel: string;
  siloSlug: string | null;
  /**
   * Composição vinda de `engine.ts`. Presente = autoridade externa; a leitura
   * apenas descreve o que o formador canônico decidiu.
   */
  groups?: readonly { principalKeywordId: string; keywordIds: readonly string[] }[];
  /** DNA do Silo confirmado; o tema do pai não sai só do slug. */
  siloContext?: {
    centralEntity?: string | null;
    macroIntent?: string | null;
    boundaryIncludes?: readonly string[];
    narrative?: string | null;
  };
  keywords: readonly ArticleFormationKeyword[];
  publishedArticles?: readonly PublishedArticleRef[];
}): ArticleFormationUniverse {
  const publicados = [...(input.publishedArticles || [])];
  const conflicts: string[] = [];
  const matchedToPublished: { keywordId: string; normalizedUrl: string }[] = [];

  // Keyword equivalente a página já publicada não forma Article novo.
  const disponiveis: ArticleFormationKeyword[] = [];
  for (const keyword of input.keywords) {
    const publicado = publicados.find(item => overlap(tokensOf(keyword.keyword), tokensOf(item.label || item.path)) >= 0.7);
    if (publicado) {
      matchedToPublished.push({ keywordId: keyword.keywordId, normalizedUrl: publicado.normalizedUrl });
      publicado.matchedKeywordId = publicado.matchedKeywordId ?? keyword.keywordId;
      continue;
    }
    disponiveis.push(keyword);
  }

  const siloTokens = siloThemeTokens({
    siloLabel: input.siloLabel,
    siloSlug: input.siloSlug,
    ...(input.siloContext || {}),
  });
  const usadas = new Set<string>();
  const candidates: ArticleCandidate[] = [];

  /**
   * Revisão humana primeiro.
   *
   * Reprocessar reagrupa o que a lógica propôs, nunca o que a pessoa decidiu.
   * As keywords com decisão saem do universo automático antes de qualquer
   * comparação — por isso elas não podem ser "reabsorvidas" por um cluster
   * calculado.
   */
  const revisados = new Map<string, ArticleFormationKeyword[]>();
  for (const keyword of disponiveis) {
    const ref = keyword.humanFormationRef;
    if (!ref) continue;
    revisados.set(ref, [...(revisados.get(ref) || []), keyword]);
    usadas.add(keyword.keywordId);
  }

  for (const [formationRef, grupo] of revisados) {
    const escolhida = grupo.find(keyword => keyword.humanRole === "principal")
      || grupo.find(keyword => keyword.isPublished)
      || grupo[0];
    const principalKeyword = escolhida;
    const cabem = grupo.filter(keyword => keyword.keywordId !== principalKeyword.keywordId)
      .slice(0, MAX_ARTICLE_KEYWORDS - 1);
    const excedentes = grupo.filter(keyword => keyword.keywordId !== principalKeyword.keywordId)
      .slice(MAX_ARTICLE_KEYWORDS - 1);

    const afinidadesHumanas = cabem.map(keyword => sameArticleAffinity(principalKeyword, keyword, siloTokens));
    const coerenciaHumana = afinidadesHumanas.length
      ? afinidadesHumanas.reduce((total, item) => total + item.affinity, 0) / afinidadesHumanas.length
      : 1;
    const mesmaIntencaoHumana = grupo.every(keyword =>
      normalizedIntent(keyword.intent) === normalizedIntent(principalKeyword.intent));

    candidates.push({
      candidateRef: formationRef,
      siloRef: input.siloRef,
      principalKeywordId: principalKeyword.keywordId,
      keywords: [principalKeyword, ...cabem].map(keyword => ({
        keywordId: keyword.keywordId,
        role: keyword.keywordId === principalKeyword.keywordId
          ? "principal" as const
          : keyword.humanRole && keyword.humanRole !== "principal" ? keyword.humanRole : "secundaria" as const,
      })),
      suggestedSlug: principalKeyword.isPublished
        ? null
        : suggestArticleSlug({ principal: principalKeyword, siloSlug: input.siloSlug }),
      scores: {
        coherence: {
          value: pct(coerenciaHumana),
          // A pontuação continua sendo leitura da lógica; ela não desautoriza
          // a decisão, só diz o que a lógica enxerga nela.
          reasons: ["composição definida em revisão humana"],
        },
        intent: {
          value: mesmaIntencaoHumana ? 100 : 60,
          reasons: [mesmaIntencaoHumana
            ? "todas as buscas têm a mesma intenção principal"
            : "a revisão reuniu intenções diferentes"],
        },
        centrality: { value: pct(coerenciaHumana), reasons: ["principal escolhida por decisão humana"] },
      },
      cannibalizationRisk: "baixa",
      overflowKeywordIds: excedentes.map(keyword => keyword.keywordId),
      origin: "human",
      stale: false,
      conflicts: excedentes.length
        ? [`${excedentes.length} busca(s) desta revisão passam do teto de seis e precisam de decisão editorial.`]
        : [],
      reason: `Composição definida em revisão humana, com "${principalKeyword.keyword}" como principal.`,
    });
  }

  /**
   * Grupos do formador canônico entram como estão.
   *
   * Nada é recalculado aqui: reagrupar o que o engine já decidiu criaria uma
   * segunda autoridade capaz de divergir da primeira, sem regra de desempate.
   */
  for (const group of input.groups || []) {
    // Decisão humana tem precedência: keyword já revisada não volta para o
    // grupo calculado, senão ela apareceria em dois artigos ao mesmo tempo.
    const membros = group.keywordIds
      .filter(id => !usadas.has(id))
      .map(id => disponiveis.find(keyword => keyword.keywordId === id))
      .filter((keyword): keyword is ArticleFormationKeyword => Boolean(keyword));
    if (!membros.length) continue;

    const principalKeyword = membros.find(keyword => keyword.keywordId === group.principalKeywordId) || membros[0];
    for (const keyword of membros) usadas.add(keyword.keywordId);

    const outros = membros.filter(keyword => keyword.keywordId !== principalKeyword.keywordId);
    const afinidadesEngine = outros.map(keyword => sameArticleAffinity(principalKeyword, keyword, siloTokens));
    const coerenciaEngine = afinidadesEngine.length
      ? afinidadesEngine.reduce((total, item) => total + item.affinity, 0) / afinidadesEngine.length
      : 1;
    const mesmaIntencaoEngine = membros.every(keyword =>
      normalizedIntent(keyword.intent) === normalizedIntent(principalKeyword.intent));

    candidates.push({
      candidateRef: `article-candidate:${input.siloRef}:${principalKeyword.keywordId}`,
      siloRef: input.siloRef,
      principalKeywordId: principalKeyword.keywordId,
      keywords: membros.map(keyword => ({
        keywordId: keyword.keywordId,
        role: keyword.keywordId === principalKeyword.keywordId
          ? "principal" as const
          : sameArticleAffinity(principalKeyword, keyword, siloTokens).affinity >= CANNIBAL_FLOOR
            ? "secundaria" as const
            : "reforco" as const,
      })),
      suggestedSlug: principalKeyword.isPublished
        ? null
        : suggestArticleSlug({ principal: principalKeyword, siloSlug: input.siloSlug }),
      scores: {
        // Pontuação é LEITURA do que o formador decidiu, não veto sobre ele.
        coherence: {
          value: pct(coerenciaEngine),
          reasons: afinidadesEngine.length
            ? [...new Set(afinidadesEngine.flatMap(item => item.reasons))]
            : ["busca isolada no silo"],
        },
        intent: {
          value: mesmaIntencaoEngine ? 100 : 60,
          reasons: [mesmaIntencaoEngine
            ? "todas as buscas têm a mesma intenção principal"
            : "há intenções mistas no grupo"],
        },
        centrality: { value: pct(coerenciaEngine), reasons: ["principal escolhida pelo formador canônico"] },
      },
      cannibalizationRisk: "baixa",
      overflowKeywordIds: [],
      origin: "logic",
      stale: false,
      conflicts: [],
      reason: membros.length > 1
        ? `${membros.length} buscas agrupadas pelo formador canônico sob "${principalKeyword.keyword}".`
        : `"${principalKeyword.keyword}" formou artigo próprio no formador canônico.`,
    });
  }

  for (const semente of disponiveis) {
    if (usadas.has(semente.keywordId)) continue;

    const convergentes = disponiveis
      .filter(other => other.keywordId !== semente.keywordId && !usadas.has(other.keywordId))
      .map(other => ({ keyword: other, ...sameArticleAffinity(semente, other, siloTokens) }))
      .filter(item => item.affinity >= AFFINITY_FLOOR)
      .sort((left, right) => right.affinity - left.affinity);

    // Teto, não meta: entra quem converge, até o limite.
    const cabem = convergentes.slice(0, MAX_ARTICLE_KEYWORDS - 1);
    /**
     * Convergiu, mas não coube.
     *
     * Deixar o excesso solto faria ele semear um candidato novo — inventando
     * um segundo assunto onde só existe um. Ele fica registrado como excesso
     * do MESMO artigo e a decisão de o que fazer é editorial.
     */
    const excedentes = convergentes.slice(MAX_ARTICLE_KEYWORDS - 1);
    const afinidades = cabem;

    const grupo = [semente, ...afinidades.map(item => item.keyword)];
    for (const keyword of grupo) usadas.add(keyword.keywordId);
    for (const item of excedentes) usadas.add(item.keyword.keywordId);

    const principal = suggestPrincipal({ keywords: grupo, siloTokens });
    if (!principal) continue;
    const principalKeyword = grupo.find(item => item.keywordId === principal.keywordId)!;

    const coerencia = afinidades.length
      ? afinidades.reduce((total, item) => total + item.affinity, 0) / afinidades.length
      : 1;
    const mesmaIntencao = grupo.every(keyword => normalizedIntent(keyword.intent) === normalizedIntent(semente.intent));
    const centralidade = grupo.length > 1
      ? grupo.filter(item => item.keywordId !== principal.keywordId)
        .reduce((total, item) => total + sameArticleAffinity(principalKeyword, item, siloTokens).affinity, 0) / (grupo.length - 1)
      : 1;
    const canibalizacao = afinidades.some(item => item.affinity >= CANNIBAL_FLOOR) && grupo.length > 1
      ? "baixa" as const
      : grupo.length === 1 ? "baixa" as const : "média" as const;

    candidates.push({
      candidateRef: `article-candidate:${input.siloRef}:${principal.keywordId}`,
      siloRef: input.siloRef,
      principalKeywordId: principal.keywordId,
      keywords: grupo.map(keyword => ({
        keywordId: keyword.keywordId,
        role: keyword.keywordId === principal.keywordId
          ? "principal"
          // Reforço amplia linguagem sem redefinir o assunto; secundária cobre
          // a mesma intenção com outra formulação.
          : sameArticleAffinity(principalKeyword, keyword, siloTokens).affinity >= CANNIBAL_FLOOR ? "secundaria" : "reforco",
      })),
      suggestedSlug: principalKeyword.isPublished ? null : suggestArticleSlug({ principal: principalKeyword, siloSlug: input.siloSlug }),
      scores: {
        coherence: {
          value: pct(coerencia),
          reasons: afinidades.length ? [...new Set(afinidades.flatMap(item => item.reasons))] : ["busca isolada no silo"],
        },
        intent: {
          value: mesmaIntencao ? 100 : 60,
          reasons: [mesmaIntencao ? "todas as buscas têm a mesma intenção principal" : "há intenções mistas no grupo"],
        },
        centrality: { value: pct(centralidade), reasons: principal.reasons },
      },
      cannibalizationRisk: canibalizacao,
      overflowKeywordIds: excedentes.map(item => item.keyword.keywordId),
      origin: "logic",
      stale: false,
      conflicts: excedentes.length
        ? [`${excedentes.length} busca(s) convergem com este artigo além do teto de seis e precisam de decisão editorial.`]
        : [],
      reason: grupo.length > 1
        ? `${grupo.length} buscas respondem ao mesmo conteúdo; "${principalKeyword.keyword}" representa melhor o núcleo.`
        : `"${principalKeyword.keyword}" não convergiu com outras buscas deste silo e forma um artigo próprio.`,
    });
  }

  /**
   * O slug proposto já é uma página publicada?
   *
   * A identidade publicada é protegida: o Arquiteto não propõe um endereço que
   * já existe. Quando isso acontece, a sugestão sai e o caso vira revisão —
   * ou o conteúdo novo é outra coisa, ou ele pertence à página que já está no
   * ar. Escolher sozinho seria decidir sobre patrimônio.
   */
  const caminhosPublicados = new Set(publicados.map(item => item.path.toLowerCase()));
  for (const candidate of candidates) {
    if (!candidate.suggestedSlug) continue;
    const base = input.siloSlug || "";
    const raiz = base.endsWith("/") ? base.slice(0, -1) : base;
    const caminho = `${raiz}/${candidate.suggestedSlug}`.toLowerCase();
    if (!caminhosPublicados.has(caminho)) continue;
    candidate.suggestedSlug = null;
    const aviso = `o endereço proposto já existe publicado em ${caminho}`;
    candidate.conflicts.push(aviso);
    conflicts.push(`Um artigo candidato aponta para ${caminho}, que já está publicado.`);
  }

  // Uma keyword plausível em dois candidatos é ambiguidade, não escolha nossa.
  for (const keyword of disponiveis) {
    const donos = candidates.filter(candidate => candidate.keywords.some(item => item.keywordId === keyword.keywordId));
    if (donos.length > 1) {
      conflicts.push(`"${keyword.keyword}" cabe em mais de um artigo deste silo e precisa de revisão.`);
      for (const dono of donos) dono.conflicts.push(`"${keyword.keyword}" também cabe em outro artigo.`);
    }
  }

  // Leitura sobre o resultado: nada aqui reagrupa nada.
  const relations = auditCandidateRelations({ candidates, keywords: input.keywords, siloTokens });
  const singletonAudits = auditSingletons({
    candidates,
    keywords: input.keywords,
    publishedArticles: publicados,
    relations,
  });

  return {
    siloRef: input.siloRef,
    siloLabel: input.siloLabel,
    siloSlug: input.siloSlug,
    keywordIds: input.keywords.map(keyword => keyword.keywordId),
    singletonAudits,
    relations,
    publishedArticles: publicados,
    candidates,
    ungroupedKeywordIds: disponiveis.filter(keyword => !usadas.has(keyword.keywordId)).map(keyword => keyword.keywordId),
    matchedToPublished,
    conflicts,
  };
}

/** Síntese do lote inteiro, para o painel dizer o que aconteceu. */
export function summarizeArticleFormation(universes: readonly ArticleFormationUniverse[]) {
  const candidates = universes.flatMap(universe => universe.candidates);
  const keywordsEmCandidatos = candidates.reduce((total, candidate) => total + candidate.keywords.length, 0);
  const publicados = universes.reduce((total, universe) => total + universe.publishedArticles.length, 0);
  const livres = universes.reduce((total, universe) => total + universe.ungroupedKeywordIds.length, 0);
  const comConflito = candidates.filter(candidate => candidate.conflicts.length).length;
  const relations = universes.flatMap(universe => universe.relations);
  const sobreposicoes = relations.filter(relation => relation.relation !== "distinct").length;
  const singletons = universes.flatMap(universe => universe.singletonAudits);
  // Composição: quantas buscas cada artigo reúne.
  const composicao = { um: 0, dois: 0, tresASeis: 0 };
  for (const candidate of candidates) {
    if (candidate.keywords.length === 1) composicao.um += 1;
    else if (candidate.keywords.length === 2) composicao.dois += 1;
    else composicao.tresASeis += 1;
  }
  return {
    silos: universes.length,
    keywords: universes.reduce((total, universe) => total + universe.keywordIds.length, 0),
    candidates: candidates.length,
    keywordsEmCandidatos,
    publishedArticles: publicados,
    freeKeywords: livres,
    needsReview: comConflito,
    readyToConfirm: candidates.length - comConflito,
    /** Candidatos de uma keyword só — nem todos são problema. */
    singles: composicao.um,
    /** Candidatos que reuniram mais de uma busca. */
    grouped: candidates.length - composicao.um,
    composition: composicao,
    /** Pares de candidatos que talvez devessem ser um só. */
    possibleOverlaps: sobreposicoes,
    /** Singletons que a auditoria mandou olhar. */
    singletonsToReview: singletons.filter(item => item.classification === "POSSIBLE_MERGE" || item.classification === "PUBLISHED_OVERLAP").length,
    /** Buscas que convergiram além do teto e esperam decisão editorial. */
    overflowKeywords: candidates.reduce((total, candidate) => total + candidate.overflowKeywordIds.length, 0),
  };
}

/* --------------------------------- base ---------------------------------- */

/**
 * Cenário de formação que foi processado.
 *
 * Entram só os fatos canônicos que mudam a resposta: quais Silos confirmados
 * participam, quais keywords estão no lote e quais Articles já existem
 * publicados. Seleção, zoom e horário ficam de fora — abrir a página não pode
 * invalidar o que a pessoa mandou processar.
 */
export function articleFormationBaseHash(input: {
  siloRefs: readonly string[];
  keywordIds: readonly string[];
  publishedArticlePaths: readonly string[];
}): string {
  const canonical = JSON.stringify([
    [...input.siloRefs].sort(),
    [...input.keywordIds].sort(),
    [...input.publishedArticlePaths].sort(),
  ]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `artbase:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/* ------------------------ auditoria dos singletons ----------------------- */

/**
 * Por que um candidato ficou com uma keyword só.
 *
 * Singleton NÃO é erro: uma busca com intenção própria merece conteúdo
 * próprio. O que precisa aparecer é a diferença entre "ficou sozinha porque é
 * distinta" e "ficou sozinha porque a evidência não deu para juntar".
 */
export type SingletonClassification =
  | "UNIQUE_INTENT"
  | "LOW_SIMILARITY"
  | "POSSIBLE_MERGE"
  | "PUBLISHED_OVERLAP"
  | "INSUFFICIENT_EVIDENCE";

export type SingletonAudit = {
  candidateRef: string;
  keywordId: string;
  classification: SingletonClassification;
  reasons: string[];
  /** Candidato mais próximo do mesmo Silo, quando houver. */
  nearestCandidateRef: string | null;
  nearestAffinity: number;
};

/**
 * Relação entre DOIS candidatos do mesmo Silo.
 *
 * O agrupamento decide quem entra junto; isto olha o que sobrou separado e
 * pergunta se deveria estar junto. É leitura: nada é reagrupado sozinho.
 */
export type ArticleCandidateRelation = {
  leftCandidateRef: string;
  rightCandidateRef: string;
  relation: "distinct" | "possible_overlap" | "likely_same_intent";
  affinity: number;
  reasons: string[];
};

/** Abaixo do piso de agrupamento, mas perto demais para ignorar. */
const NEAR_FLOOR = 0.3;
/** Sobreposição com página publicada que merece revisão humana. */
const PUBLISHED_REVIEW_FLOOR = 0.45;

/**
 * Compara candidatos do mesmo Silo, dois a dois.
 *
 * A comparação é entre as PRINCIPAIS: elas representam o conteúdo. Comparar
 * todas as keywords cruzadas faria um reforço periférico aproximar dois
 * artigos que respondem perguntas diferentes.
 */
export function auditCandidateRelations(input: {
  candidates: readonly ArticleCandidate[];
  keywords: readonly ArticleFormationKeyword[];
  siloTokens: ReadonlySet<string>;
}): ArticleCandidateRelation[] {
  const porId = new Map(input.keywords.map(keyword => [keyword.keywordId, keyword]));
  const relations: ArticleCandidateRelation[] = [];

  for (let left = 0; left < input.candidates.length; left += 1) {
    for (let right = left + 1; right < input.candidates.length; right += 1) {
      const esquerda = porId.get(input.candidates[left].principalKeywordId);
      const direita = porId.get(input.candidates[right].principalKeywordId);
      if (!esquerda || !direita) continue;

      const { affinity, reasons } = sameArticleAffinity(esquerda, direita, input.siloTokens);
      const mesmaIntencao = normalizedIntent(esquerda.intent) !== null
        && normalizedIntent(esquerda.intent) === normalizedIntent(direita.intent);

      // Acima do piso de agrupamento, só ficaram separados por causa do teto
      // ou de uma decisão humana: é o caso mais forte de sobreposição.
      const relation = affinity >= AFFINITY_FLOOR
        ? "likely_same_intent" as const
        : (affinity >= NEAR_FLOOR && mesmaIntencao) ? "possible_overlap" as const : "distinct" as const;

      relations.push({
        leftCandidateRef: input.candidates[left].candidateRef,
        rightCandidateRef: input.candidates[right].candidateRef,
        relation,
        affinity: pct(affinity),
        reasons: relation === "distinct"
          ? ["as buscas principais respondem a problemas diferentes"]
          : reasons,
      });
    }
  }
  return relations;
}

/**
 * Classifica cada candidato de uma keyword só.
 *
 * A ordem é deliberada: patrimônio publicado vem primeiro porque decide
 * sozinho; depois a proximidade com outro candidato; só então a leitura de
 * intenção, que exige que os fatos do Minerador existam.
 */
export function auditSingletons(input: {
  candidates: readonly ArticleCandidate[];
  keywords: readonly ArticleFormationKeyword[];
  publishedArticles: readonly PublishedArticleRef[];
  relations: readonly ArticleCandidateRelation[];
}): SingletonAudit[] {
  const porId = new Map(input.keywords.map(keyword => [keyword.keywordId, keyword]));
  const audits: SingletonAudit[] = [];

  for (const candidate of input.candidates) {
    if (candidate.keywords.length !== 1) continue;
    const keyword = porId.get(candidate.principalKeywordId);
    if (!keyword) continue;

    // Vizinho mais próximo entre os outros candidatos.
    let nearestCandidateRef: string | null = null;
    let nearestAffinity = 0;
    let nearestRelation: ArticleCandidateRelation["relation"] = "distinct";
    let nearestReasons: string[] = [];
    for (const relation of input.relations) {
      const envolve = relation.leftCandidateRef === candidate.candidateRef
        || relation.rightCandidateRef === candidate.candidateRef;
      if (!envolve || relation.affinity <= nearestAffinity) continue;
      nearestAffinity = relation.affinity;
      nearestCandidateRef = relation.leftCandidateRef === candidate.candidateRef
        ? relation.rightCandidateRef
        : relation.leftCandidateRef;
      nearestRelation = relation.relation;
      nearestReasons = relation.reasons;
    }

    const publicado = input.publishedArticles
      .map(item => ({ item, score: overlap(tokensOf(keyword.keyword), tokensOf(item.label || item.path)) }))
      .sort((left, right) => right.score - left.score)[0];

    const semFatos = !normalizedIntent(keyword.intent) && !keyword.entity && !keyword.problem;
    const intencoesVizinhas = input.candidates
      .filter(other => other.candidateRef !== candidate.candidateRef)
      .map(other => normalizedIntent(porId.get(other.principalKeywordId)?.intent ?? null))
      .filter((intent): intent is string => Boolean(intent));
    const intencao = normalizedIntent(keyword.intent);

    let classification: SingletonClassification;
    let reasons: string[];

    if (publicado && publicado.score >= PUBLISHED_REVIEW_FLOOR) {
      classification = "PUBLISHED_OVERLAP";
      reasons = [`conteúdo publicado em "${publicado.item.label || publicado.item.path}" pode já responder a esta busca`];
    } else if (nearestRelation !== "distinct") {
      classification = "POSSIBLE_MERGE";
      reasons = [`aproxima-se de outro candidato deste Silo`, ...nearestReasons];
    } else if (semFatos) {
      classification = "INSUFFICIENT_EVIDENCE";
      reasons = ["sem intenção, entidade ou problema declarados para comparar com as demais"];
    } else if (intencao && intencoesVizinhas.length && !intencoesVizinhas.includes(intencao)) {
      classification = "UNIQUE_INTENT";
      reasons = [`intenção "${intencao}" não se repete em nenhum outro candidato deste Silo`];
      if (keyword.problem) reasons.push(`o problema central "${keyword.problem}" é próprio desta busca`);
      if (!publicado || publicado.score < NEAR_FLOOR) reasons.push("nenhum artigo publicado cobre claramente esta busca");
    } else {
      classification = "LOW_SIMILARITY";
      reasons = ["nenhuma outra busca deste Silo converge o suficiente para dividir o mesmo conteúdo"];
    }

    audits.push({
      candidateRef: candidate.candidateRef,
      keywordId: keyword.keywordId,
      classification,
      reasons,
      nearestCandidateRef,
      nearestAffinity,
    });
  }
  return audits;
}

export const SINGLETON_CLASSIFICATION_LABELS: Record<SingletonClassification, string> = {
  UNIQUE_INTENT: "Intenção própria",
  LOW_SIMILARITY: "Sem convergência",
  POSSIBLE_MERGE: "Pode juntar",
  PUBLISHED_OVERLAP: "Já publicado",
  INSUFFICIENT_EVIDENCE: "Evidência insuficiente",
};
