/**
 * NENHUM FUNDAMENTO PODE SUMIR DE NOVO SEM ALGUÉM SABER.
 *
 * A auditoria R10 encontrou volume, KGR, intenção, SERP de formação, Silo e
 * grafo de links atravessando o handoff, persistidos na linha do Radar — e sem
 * um único leitor no motor. O problema não foi transporte: foi ninguém ter
 * declarado o que cada dado deveria fazer.
 *
 * Este mapa é a declaração. Para CADA campo do contexto existe uma categoria de
 * uso explícita e um consumidor nomeado. `CONTEXT_ONLY` é uma resposta legítima
 * — "isto informa a leitura sem entrar em cálculo" — mas
 * `AVAILABLE_BUT_SILENTLY_IGNORED` não é uma categoria: um campo sem categoria
 * quebra o teste de contrato.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export type RadarFoundationUsage =
  | "RESEARCH_QUERY_INPUT"
  | "COMPETITOR_DISCOVERY_INPUT"
  | "COMPETITOR_CLASSIFICATION_INPUT"
  | "CONTENT_COMPARISON_INPUT"
  | "LINK_RESEARCH_INPUT"
  | "REPORT_CONTEXT"
  | "CONTEXT_ONLY"
  | "NOT_APPLICABLE_TO_STEP";

export type RadarFoundationEntry = {
  /** O caminho no `RadarArticleResearchContext`. */
  field: string;
  usage: RadarFoundationUsage[];
  /** Quem lê, de verdade. Módulo ou superfície. */
  consumers: string[];
  note: string;
};

/**
 * O mapa. Cada linha é uma promessa verificável: existe consumidor, e ele é
 * nomeado. Quando um fundamento novo chegar, ele entra aqui — ou o teste falha.
 */
export const RADAR_FOUNDATION_USAGE_MAP: RadarFoundationEntry[] = [
  {
    field: "article.articleDnaVersionId",
    usage: ["REPORT_CONTEXT", "CONTEXT_ONLY"],
    consumers: ["research-query-plan", "deep-research (fingerprint)", "foundation-profiles"],
    note: "Congela a versão que originou a investigação; é o que torna uma pesquisa anterior stale quando o fundamento muda.",
  },
  {
    field: "article.mainIntent",
    usage: ["RESEARCH_QUERY_INPUT", "COMPETITOR_CLASSIFICATION_INPUT"],
    consumers: ["app/api/editorial/serp (expectedIntent)", "competitor-universe"],
    note: "Vai ao provider como intenção esperada e ao diagnóstico de conflito da SERP.",
  },
  {
    field: "article.promise",
    usage: ["CONTENT_COMPARISON_INPUT", "REPORT_CONTEXT"],
    consumers: ["editorial-comparison", "foundation-profiles"],
    note: "A promessa declarada é o que a comparação confronta com o que o mercado cobre.",
  },
  {
    field: "article.hierarchy",
    usage: ["CONTEXT_ONLY"],
    consumers: ["foundation-profiles", "link-and-source-research"],
    note: "Pilar e Suporte mudam o que se espera das relações internas, não a consulta.",
  },
  {
    field: "editorialTopics",
    usage: ["CONTENT_COMPARISON_INPUT"],
    consumers: ["competitive-model (editorialTopics)", "topic-classification"],
    note: "Separa lacuna competitiva de tópico isolado; vem de requiredTopics e coverage.",
  },
  {
    field: "resolvedKeywordTexts",
    usage: ["CONTENT_COMPARISON_INPUT", "REPORT_CONTEXT"],
    consumers: ["competitive-report (keywordTerms)"],
    note: "Os textos reais — nunca os ids — alimentam a observação por keyword.",
  },
  {
    field: "keywords[].identity.text",
    usage: ["RESEARCH_QUERY_INPUT"],
    consumers: ["research-query-plan"],
    note: "Sem texto resolvido não existe consulta; o id não vira consulta.",
  },
  {
    field: "keywords[].identity.role",
    usage: ["RESEARCH_QUERY_INPUT", "COMPETITOR_CLASSIFICATION_INPUT"],
    consumers: ["research-query-plan (rolePriority)", "competitor-universe (rolesSeen)"],
    note: "O papel é o primeiro sinal de importância, acima de qualquer métrica.",
  },
  {
    field: "keywords[].strategy.volume",
    usage: ["RESEARCH_QUERY_INPUT", "REPORT_CONTEXT"],
    consumers: ["research-query-plan (dimensionamento)", "foundation-profiles"],
    note: "Dimensiona demanda relativa. Não promove papel nem decide relevância sozinho.",
  },
  {
    field: "keywords[].strategy.resultCount",
    usage: ["RESEARCH_QUERY_INPUT", "REPORT_CONTEXT"],
    consumers: ["research-query-plan", "foundation-profiles"],
    note: "Sinaliza o ambiente competitivo da busca.",
  },
  {
    field: "keywords[].strategy.kgrScore",
    usage: ["RESEARCH_QUERY_INPUT", "REPORT_CONTEXT"],
    consumers: ["research-query-plan", "foundation-profiles"],
    note: "Contextualiza oportunidade. Nunca decide relevância competitiva sozinho.",
  },
  {
    field: "keywords[].strategy.incrementalVolume",
    usage: ["CONTEXT_ONLY"],
    consumers: ["foundation-profiles"],
    note: "Leitura de contribuição da secundária; não entra em consulta nem em classificação.",
  },
  {
    field: "keywords[].strategy.contribution",
    usage: ["CONTEXT_ONLY", "REPORT_CONTEXT"],
    consumers: ["foundation-profiles"],
    note: "Central, incremental ou de cobertura: explica por que a keyword está na composição.",
  },
  {
    field: "keywords[].strategy.strategicContribution",
    usage: ["CONTEXT_ONLY", "REPORT_CONTEXT"],
    consumers: ["foundation-profiles"],
    note: "A justificativa editorial que o Arquiteto escreveu para esta keyword; leitura humana, não entrada de cálculo.",
  },
  {
    field: "keywords[].strategy.purpose",
    usage: ["CONTEXT_ONLY"],
    consumers: ["foundation-profiles"],
    note: "Para que a keyword entrou na composição. Explica a consulta sem alterá-la.",
  },
  {
    field: "keywords[].strategy.overlapRisk",
    usage: ["CONTEXT_ONLY", "RESEARCH_QUERY_INPUT"],
    consumers: ["foundation-profiles", "research-query-plan (sobreposição observada)"],
    note: "Risco de sobreposição declarado na formação; conversa com a checagem de consulta redundante.",
  },
  {
    field: "keywords[].strategy.normalizedIntent",
    usage: ["RESEARCH_QUERY_INPUT", "COMPETITOR_CLASSIFICATION_INPUT"],
    consumers: ["research-query-plan", "competitor-universe", "foundation-profiles"],
    note: "Diz que tipo de concorrente a consulta deve trazer.",
  },
  {
    field: "keywords[].strategy.coveredIntentions",
    usage: ["COMPETITOR_CLASSIFICATION_INPUT"],
    consumers: ["foundation-profiles", "competitor-universe"],
    note: "Amplia a leitura de intenção quando a qualificação não é conclusiva.",
  },
  {
    field: "keywords[].strategy.semanticQualification",
    usage: ["RESEARCH_QUERY_INPUT", "COMPETITOR_CLASSIFICATION_INPUT"],
    consumers: ["research-query-plan (intent/funnel)", "competitor-universe", "investigation-sufficiency"],
    note: "Intenção e funil consolidados do Minerador: separam SERP comercial coerente de amostra falha.",
  },
  {
    field: "keywords[].strategy.keywordDnaSnapshot",
    usage: ["RESEARCH_QUERY_INPUT", "COMPETITOR_CLASSIFICATION_INPUT", "CONTEXT_ONLY"],
    consumers: ["research-query-plan (entidade, modificadores)", "competitor-universe (entityCompatibility)", "foundation-profiles"],
    note: "Entidade central e modificadores preservam coerência temática entre consultas.",
  },
  {
    field: "keywords[].strategy.demandEvidence",
    usage: ["CONTEXT_ONLY"],
    consumers: ["foundation-profiles"],
    note: "Evidência de demanda do Minerador, exibida como fundamento; não entra em cálculo nesta etapa.",
  },
  {
    field: "keywords[].strategy.keywordUrlRelation",
    usage: ["COMPETITOR_DISCOVERY_INPUT"],
    consumers: ["research-query-plan (formationSerpContext)", "foundation-profiles"],
    note: "Relação keyword para URL observada na formação: URL já vista antes da coleta corrente.",
  },
  {
    field: "keywords[].resolution",
    usage: ["CONTEXT_ONLY"],
    consumers: ["research-query-plan (NOT_EXECUTABLE)", "foundation-profiles"],
    note: "Keyword sem texto continua contada e declarada, fora das consultas.",
  },
  {
    field: "silo.siloDnaVersionId",
    usage: ["CONTEXT_ONLY", "REPORT_CONTEXT"],
    consumers: ["foundation-profiles", "current-state-chain"],
    note: "Identifica a arquitetura vigente; o Radar não a altera.",
  },
  {
    field: "silo.siloPageCanonical",
    usage: ["COMPETITOR_CLASSIFICATION_INPUT"],
    consumers: ["competitor-universe (siloCompatibility)"],
    note: "Separa o próprio domínio dos concorrentes.",
  },
  {
    field: "silo.articleRole",
    usage: ["LINK_RESEARCH_INPUT", "CONTEXT_ONLY"],
    consumers: ["link-and-source-research", "foundation-profiles"],
    note: "Pilar e Suporte mudam a leitura esperada de entradas e saídas de links.",
  },
  {
    field: "formationSerp.verdict",
    usage: ["COMPETITOR_DISCOVERY_INPUT", "REPORT_CONTEXT"],
    consumers: ["research-query-plan", "competitor-universe"],
    note: "Contexto histórico da formação. Nunca substitui a SERP corrente.",
  },
  {
    field: "formationSerp.humanResolution",
    usage: ["COMPETITOR_DISCOVERY_INPUT", "REPORT_CONTEXT"],
    consumers: ["research-query-plan (REUSE_FORMATION_EVIDENCE)"],
    note: "Impede redescobrir uma divergência que uma pessoa já resolveu.",
  },
  {
    field: "formationSerp.keywordUrls",
    usage: ["COMPETITOR_DISCOVERY_INPUT"],
    consumers: ["competitor-universe (formationSerpSeen)"],
    note: "URLs já observadas na formação, marcadas no universo corrente.",
  },
  {
    field: "internalLinks.edges",
    usage: ["LINK_RESEARCH_INPUT"],
    consumers: ["link-and-source-research"],
    note: "Relações aprovadas: o Radar as lê como fato, não as reescreve.",
  },
  {
    field: "internalLinks.edges[].anchorConcepts",
    usage: ["LINK_RESEARCH_INPUT"],
    consumers: ["link-and-source-research"],
    note: "Universo permitido de formulação. Âncora final, quantidade e posição são do Planejador.",
  },
  {
    field: "limitations",
    usage: ["REPORT_CONTEXT"],
    consumers: ["foundation-profiles", "deep-research (resumo)"],
    note: "O que a versão não permitiu afirmar, dito em vez de escondido.",
  },
];

/** Os caminhos que o mapa declara. Serve ao teste de contrato. */
export const radarMappedFoundationFields = () => RADAR_FOUNDATION_USAGE_MAP.map(entry => entry.field);

/**
 * Existe algum fundamento sem categoria declarada?
 *
 * Recebe os caminhos observados no contexto real e devolve o que ficou de fora.
 * Vazio é a única resposta aceitável.
 */
export function radarUnmappedFoundationFields(observedFields: readonly string[]): string[] {
  const declarados = new Set(radarMappedFoundationFields());
  return observedFields.filter(field => !declarados.has(field));
}

export const radarFoundationUsageFor = (field: string) =>
  RADAR_FOUNDATION_USAGE_MAP.find(entry => entry.field === field) || null;
