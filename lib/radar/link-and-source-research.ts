/**
 * O QUE A INVESTIGAÇÃO OBSERVA SOBRE LINKS E FONTES.
 *
 * O Arquiteto já aprovou o grafo interno: quem se liga a quem, com que
 * `relationType` e sob quais `anchorConcepts`. Isso é FATO da arquitetura, não
 * sugestão — e o Radar precisa lê-lo para pesquisar com contexto. Do outro
 * lado, os concorrentes citam fontes, e essas fontes são candidatas a evidência
 * externa do nosso artigo.
 *
 * A FRONTEIRA — corrigida no Gate 10.1:
 *
 *   O ARQUITETO decide a ARQUITETURA — quais páginas se relacionam, em que
 *   direção, sob que conceito de âncora. Este módulo lê isso e não o altera.
 *
 *   Este módulo FUNDAMENTA: o que o grafo aprovou, o que a amostra faz com
 *   links, quais conceitos do mercado encontram a arquitetura.
 *
 *   A APLICAÇÃO — quantas vezes, em que contexto, com que âncora, como
 *   distribuir — é decisão do Radar e vive em `internal-link-plan.ts`. Durante
 *   os Gates 10 e 11 este comentário dizia que era do Planejador; estava
 *   errado, e a correção importa: o Planejador não tem a SERP na mão.
 *
 * Aqui continua não havendo aplicação: este arquivo é fundamento e observação.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { buildRadarSemanticScope, radarSemanticStems, radarSemanticType, type RadarPageProvenance, type RadarSemanticConceptModel, type RadarSemanticConcept, type RadarSemanticScope } from "./semantic-concept-model.ts";
import { radarTopicTokens } from "./topic-classification.ts";

import { radarNormalizedUrl } from "./research-reference.ts";
import type { RadarExtractionPage, RadarObservedLink } from "./analysis-contracts.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";

/* ------------------------- contexto de links internos -------------------- */

/**
 * O PAPEL DA OUTRA PONTA, LIDO DO PRÓPRIO VOCABULÁRIO DO GRAFO.
 *
 * O handoff do Arquiteto manda `nodeId`, não rótulo nem slug — e inventar
 * título para um nó seria descrever uma arquitetura que não foi entregue. Mas
 * o `relationType` já diz o que a outra ponta é: `ARTICLE_TO_SILO_PAGE` só
 * pode apontar para uma SiloPage, `PILLAR_TO_SUPPORT` recebido só pode vir de
 * um Pilar. Isso é leitura, não dedução.
 */
export type RadarInternalRelationRole = "SILOPAGE" | "PILAR" | "SUPORTE" | "UNKNOWN";

/** A direção importa e não se condensa: receber link não é apontar link. */
export type RadarInternalDirection = "INCOMING" | "OUTGOING" | "BOTH";

export type RadarInternalRelation = {
  nodeId: string;
  direction: "INCOMING" | "OUTGOING";
  relationType: string;
  role: RadarInternalRelationRole;
  anchorConcepts: string[];
  reason: string;
  priority: string;
};

export type RadarRelatedInternalPage = {
  nodeId: string;
  /** O endereço, quando o grafo o conhece. Hoje só a SiloPage o carrega. */
  slug: string | null;
  label: string | null;
  role: RadarInternalRelationRole;
  direction: RadarInternalDirection;
  /** Cada aresta preservada — a página pode receber E apontar. */
  relations: RadarInternalRelation[];
  incoming: number;
  outgoing: number;
  /** O universo permitido de formulação — não a âncora final. */
  anchorConcepts: string[];
  reasons: string[];
  provenance: { graphId: string; graphVersionId: string; graphContentHash: string };
};

/**
 * O conceito do mercado encontrou lugar na arquitetura já aprovada.
 *
 * `SUPPORTED_BY_GRAPH` é uma constatação: existe uma relação aprovada cujo
 * conceito de âncora fala do mesmo assunto. Não é ordem de linkar, não é texto
 * de âncora, não é posição. É contexto para quem for decidir.
 */
export type RadarConceptLinkAlignment = {
  conceptId: string;
  conceptLabel: string;
  conceptType: RadarSemanticConcept["conceptType"];
  conceptConfidence: RadarSemanticConcept["confidence"];
  conceptPages: number;
  nodeId: string;
  slug: string | null;
  role: RadarInternalRelationRole;
  direction: RadarInternalDirection;
  relationship: "SUPPORTED_BY_GRAPH";
  matchedAnchorConcepts: string[];
  /** `LEXICAL` quando as palavras batem; `SEMANTICALLY_RELATED` quando a raiz. */
  matchKind: "LEXICAL" | "SEMANTICALLY_RELATED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string;
  /** De onde o conceito veio: página, heading original. */
  sourcePages: Array<{ pageId: string; url: string; heading: string }>;
};

/** O mercado insiste num assunto que a arquitetura aprovada não cobre. */
export type RadarConceptWithoutGraphRelation = {
  conceptId: string;
  conceptLabel: string;
  conceptType: RadarSemanticConcept["conceptType"];
  pages: number;
  sampleSize: number;
  confidence: RadarSemanticConcept["confidence"];
  evidence: string;
};

/** A arquitetura declara uma relação que a amostra quase não confirma. */
export type RadarGraphRelationWithLowMarketSignal = {
  nodeId: string;
  slug: string | null;
  role: RadarInternalRelationRole;
  direction: RadarInternalDirection;
  anchorConcepts: string[];
  evidence: string;
};

export type RadarCompetitorLinkPattern = {
  key: string;
  observation: string;
  sourceCount: number;
  sampleSize: number;
  competitors: Array<{ pageId: string; url: string; title: string; internalLinks: number }>;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: string;
};

export type RadarInternalLinkResearch = {
  graphVersionId: string | null;
  graphContentHash: string | null;
  articleRole: string | null;
  /** As páginas que devem se relacionar com esta, segundo o grafo aprovado. */
  relatedInternalPages: RadarRelatedInternalPage[];
  /** Relações, não páginas: uma página que recebe e aponta conta nas duas. */
  inboundCount: number;
  outboundCount: number;
  siloPage: RadarRelatedInternalPage | null;
  /** O universo permitido de formulação — não a âncora final. */
  anchorConcepts: string[];
  conceptAlignments: RadarConceptLinkAlignment[];
  conceptsWithoutGraphRelation: RadarConceptWithoutGraphRelation[];
  graphRelationsWithLowMarketSignal: RadarGraphRelationWithLowMarketSignal[];
  competitorPatterns: RadarCompetitorLinkPattern[];
  /** Os links internos dos concorrentes com destino observado, quando houver. */
  observedCompetitorLinks: RadarObservedInternalLink[];
  /** Quantos links internos os concorrentes usam, observado por página. */
  competitorInternalLinkPattern: { pages: number; median: number | null; range: [number, number] | null };
  /** Quantos links externos os concorrentes usam, observado por página. */
  competitorExternalLinkPattern: { pages: number; median: number | null; range: [number, number] | null };
  limitations: string[];
};

const mediana = (valores: number[]) => {
  if (!valores.length) return null;
  const ordenado = [...valores].sort((left, right) => left - right);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 ? ordenado[meio] : Number(((ordenado[meio - 1] + ordenado[meio]) / 2).toFixed(1));
};

const faixa = (valores: number[]): [number, number] | null =>
  valores.length ? [Math.min(...valores), Math.max(...valores)] : null;

/** O caminho do destino, quando ele for legível. Nunca navegado. */
function caminhoDe(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

/** Um link interno de concorrente com destino conhecido — não só contagem. */
export type RadarObservedInternalLink = {
  pageId: string;
  sourceUrl: string;
  destination: string;
  path: string;
  anchorText: string | null;
  sectionHeading: string | null;
  surroundingText: string;
};

/**
 * O papel da OUTRA ponta, deduzido do tipo da relação e de quem é a origem.
 *
 * Nada aqui é palpite: o vocabulário do grafo só admite estas cinco relações,
 * e cada uma diz o que está na outra ponta.
 */
function papelDaOutraPonta(relationType: string, direction: "inbound" | "outbound"): RadarInternalRelationRole {
  if (relationType === "ARTICLE_TO_SILO_PAGE" || relationType === "SILO_PAGE_TO_ARTICLE") return "SILOPAGE";
  if (relationType === "SUPPORT_TO_SUPPORT") return "SUPORTE";
  if (relationType === "PILLAR_TO_SUPPORT") return direction === "outbound" ? "SUPORTE" : "PILAR";
  if (relationType === "SUPPORT_TO_PILLAR") return direction === "outbound" ? "PILAR" : "SUPORTE";
  return "UNKNOWN";
}

/**
 * EVIDÊNCIA CONCEITUAL SUFICIENTE PARA CRIAR UMA RELAÇÃO.
 *
 * Um conceito visto numa página só, com confiança baixa, não sustenta dizer
 * que a arquitetura o cobre nem que falta cobri-lo. A regra é por sinal
 * observável — recorrência e confiança —, nunca por lista de palavras: o dia
 * em que o assunto do artigo mudar, ela continua valendo.
 */
export function radarConceptSupportsLinkRelation(concept: Pick<RadarSemanticConcept, "sourceCount" | "confidence">): boolean {
  return concept.sourceCount >= 2 && concept.confidence !== "LOW";
}

/**
 * NECESSIDADES DIFERENTES NÃO SE ENCONTRAM, POR MAIS PALAVRAS QUE PARTILHEM.
 *
 * "causas da oleosidade" e "Características da pele oleosa" falam da mesma
 * entidade e pedem coisas opostas. É a mesma regra que o confronto editorial e
 * o modelo observado já usam — conferir o tipo antes das palavras.
 */
function necessidadeCompativel(esquerda: string, direita: string): boolean {
  const aqui = radarSemanticType(esquerda);
  const ali = radarSemanticType(direita);
  return !(aqui.faceted && ali.faceted && aqui.type !== ali.type);
}

/** As palavras batem? Interseção de tokens significativos, sem acento nem vazio. */
function mesmaFormulacao(esquerda: string, direita: string): boolean {
  if (!necessidadeCompativel(esquerda, direita)) return false;
  const daEsquerda = new Set(radarTopicTokens(esquerda));
  const daDireita = radarTopicTokens(direita);
  if (!daEsquerda.size || !daDireita.length) return false;
  return daDireita.filter(token => daEsquerda.has(token)).length / Math.min(daEsquerda.size, daDireita.length) >= 0.6;
}

/**
 * As raízes conversam?
 *
 * "controle de oleosidade" e "Como identificar a pele oleosa" partilham
 * `oleos` — que é o assunto declarado do artigo. Isso é relação observada, não
 * igualdade: o alinhamento sai marcado como `SEMANTICALLY_RELATED` e as duas
 * formulações continuam distintas.
 *
 * MAS UMA RAIZ SOLTA NÃO BASTA. "esfoliação facial" e "máscara facial"
 * partilham `facial`, que é modificador genérico e não diz que as duas tratam
 * do mesmo assunto — ligá-las por isso encheria a arquitetura de relações que
 * ninguém consegue defender. Uma raiz só sustenta a ponte quando ELA É o
 * assunto do artigo; fora disso, são precisas duas.
 */
function raizesEmComum(anchor: string, conceito: string, escopo: RadarSemanticScope): boolean {
  if (!necessidadeCompativel(anchor, conceito)) return false;
  const doConceito = new Set(radarSemanticStems(conceito));
  const comuns = radarSemanticStems(anchor).filter(raiz => doConceito.has(raiz));
  if (!comuns.length) return false;
  if (comuns.length >= 2) return true;
  return escopo.stems.has(comuns[0]);
}

export function buildRadarInternalLinkResearch(input: {
  context: RadarArticleResearchContext;
  pages?: readonly RadarExtractionPage[];
  /** A camada conceitual do Gate 8, quando a amostra já foi lida. */
  semantic?: RadarSemanticConceptModel | null;
  /**
   * Links internos com destino conhecido, quando a extração os fornecer.
   *
   * Hoje ela guarda só a CONTAGEM. Enquanto for assim, destino, âncora e
   * contexto ficam declarados como não observados — nunca inventados.
   */
  observedInternalLinks?: readonly { pageId: string; destination: string; anchor?: string | null; context?: string | null }[];
}): RadarInternalLinkResearch {
  const limitations: string[] = [];
  const grafo = input.context.internalLinks;
  const paginas = [...(input.pages || [])];
  const semantic = input.semantic || null;

  if (!grafo) limitations.push("Esta versão do artigo não recebeu o grafo de links internos; não há relação aprovada a observar.");
  if (!paginas.length) limitations.push("Nenhuma página analisada: o padrão de links dos concorrentes não pôde ser observado.");

  /* -------------------- as páginas relacionadas, por nó ------------------- */

  const provenance = grafo
    ? { graphId: grafo.graphId, graphVersionId: grafo.graphVersionId, graphContentHash: grafo.graphContentHash }
    : { graphId: "", graphVersionId: "", graphContentHash: "" };

  const siloPageSlug = input.context.silo?.siloPageSlug || null;
  const porNo = new Map<string, RadarRelatedInternalPage>();

  for (const edge of grafo?.edges || []) {
    const nodeId = edge.direction === "outbound" ? edge.targetNodeId : edge.sourceNodeId;
    const role = papelDaOutraPonta(edge.relationType, edge.direction);
    const relation: RadarInternalRelation = {
      nodeId,
      direction: edge.direction === "outbound" ? "OUTGOING" : "INCOMING",
      relationType: edge.relationType,
      role,
      anchorConcepts: [...edge.anchorConcepts],
      reason: edge.reason,
      priority: edge.priority,
    };
    const atual = porNo.get(nodeId) || {
      nodeId,
      slug: role === "SILOPAGE" ? siloPageSlug : null,
      label: null,
      role,
      direction: relation.direction as RadarInternalDirection,
      relations: [],
      incoming: 0,
      outgoing: 0,
      anchorConcepts: [],
      reasons: [],
      provenance,
    };
    atual.relations.push(relation);
    if (relation.direction === "INCOMING") atual.incoming += 1; else atual.outgoing += 1;
    /* Receber E apontar é BOTH; nenhuma das duas some na soma. */
    atual.direction = atual.incoming && atual.outgoing ? "BOTH" : atual.incoming ? "INCOMING" : "OUTGOING";
    if (atual.role === "UNKNOWN") atual.role = role;
    if (role === "SILOPAGE") { atual.role = "SILOPAGE"; atual.slug = siloPageSlug; }
    atual.anchorConcepts = [...new Set([...atual.anchorConcepts, ...edge.anchorConcepts])];
    if (!atual.reasons.includes(edge.reason)) atual.reasons.push(edge.reason);
    porNo.set(nodeId, atual);
  }

  const relacionadas = [...porNo.values()];
  const anchorConcepts = [...new Set(relacionadas.flatMap(item => item.anchorConcepts))];

  if (relacionadas.some(item => item.role !== "SILOPAGE" && !item.slug)) {
    limitations.push("O grafo entrega o identificador de cada nó, não o endereço nem o título: as páginas relacionadas aparecem pelo papel e pelos conceitos de âncora, sem slug.");
  }

  /* ---------------- o mercado encontra a arquitetura aprovada -------------- */

  /* O assunto do artigo por todos os seus nomes — a régua da relação por raiz. */
  const escopo = buildRadarSemanticScope({
    centralEntities: input.context.keywords
      .map(keyword => (keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null)?.payload?.centralEntity)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    keywordTexts: input.context.resolvedKeywordTexts,
    editorialTopics: input.context.editorialTopics,
  });

  const conceitosComEvidencia = (semantic?.concepts || []).filter(radarConceptSupportsLinkRelation);
  const conceptAlignments: RadarConceptLinkAlignment[] = [];

  for (const concept of conceitosComEvidencia) {
    for (const pagina of relacionadas) {
      const lexicais = pagina.anchorConcepts.filter(anchor => mesmaFormulacao(anchor, concept.canonicalLabel)
        || concept.variants.some(variante => mesmaFormulacao(anchor, variante)));
      const semanticos = pagina.anchorConcepts.filter(anchor => raizesEmComum(anchor, concept.canonicalLabel, escopo)
        || concept.variants.some(variante => raizesEmComum(anchor, variante, escopo)));
      const casados = lexicais.length ? lexicais : semanticos;
      if (!casados.length) continue;

      const matchKind = lexicais.length ? "LEXICAL" as const : "SEMANTICALLY_RELATED" as const;
      conceptAlignments.push({
        conceptId: concept.id,
        conceptLabel: concept.canonicalLabel,
        conceptType: concept.conceptType,
        conceptConfidence: concept.confidence,
        conceptPages: concept.sourceCount,
        nodeId: pagina.nodeId,
        slug: pagina.slug,
        role: pagina.role,
        direction: pagina.direction,
        relationship: "SUPPORTED_BY_GRAPH",
        matchedAnchorConcepts: casados,
        matchKind,
        /* Relação por raiz é observação mais fraca do que por formulação. */
        confidence: matchKind === "LEXICAL" && concept.confidence === "HIGH" ? "HIGH" : matchKind === "LEXICAL" ? "MEDIUM" : "LOW",
        evidence: `${concept.sourceCount} de ${concept.sampleSize} página(s) da amostra cobrem "${concept.canonicalLabel}", e o grafo aprovado já relaciona este nó sob ${casados.map(item => `"${item}"`).join(", ")}.`,
        sourcePages: concept.supportingObservations.map(item => ({ pageId: item.pageId, url: item.url, heading: item.text })),
      });
    }
  }

  /* --------- o que o mercado insiste e a arquitetura não relaciona --------- */

  const alinhados = new Set(conceptAlignments.map(item => item.conceptId));
  const conceptsWithoutGraphRelation: RadarConceptWithoutGraphRelation[] = conceitosComEvidencia
    .filter(concept => !alinhados.has(concept.id))
    .map(concept => ({
      conceptId: concept.id,
      conceptLabel: concept.canonicalLabel,
      conceptType: concept.conceptType,
      pages: concept.sourceCount,
      sampleSize: concept.sampleSize,
      confidence: concept.confidence,
      /* Observação, não ordem: criar artigo é decisão do Arquiteto. */
      evidence: `${concept.sourceCount} de ${concept.sampleSize} página(s) cobrem este assunto e nenhuma relação aprovada o menciona. Observação para o Arquiteto, não instrução de criar página.`,
    }));

  /* --------- e o inverso: relação aprovada com pouco eco no mercado -------- */

  const nosAlinhados = new Set(conceptAlignments.map(item => item.nodeId));
  const graphRelationsWithLowMarketSignal: RadarGraphRelationWithLowMarketSignal[] = relacionadas
    .filter(pagina => !nosAlinhados.has(pagina.nodeId))
    .map(pagina => ({
      nodeId: pagina.nodeId,
      slug: pagina.slug,
      role: pagina.role,
      direction: pagina.direction,
      anchorConcepts: pagina.anchorConcepts,
      /* O Arquiteto aprovou. O Radar só acrescenta que o mercado fala pouco. */
      evidence: semantic
        ? "A arquitetura aprovada declara esta relação e a amostra competitiva não a confirma como assunto recorrente. A relação permanece: quem a aprovou foi o Arquiteto."
        : "Sem camada conceitual nesta investigação, não houve como confrontar esta relação com o mercado.",
    }));

  /* ---------------------- os concorrentes e seus links -------------------- */

  const internos = paginas.map(page => page.internalLinkCount);
  const externos = paginas.map(page => page.externalLinkCount);
  const medianaInterna = mediana(internos);

  const fichaDe = (page: RadarExtractionPage) => ({ pageId: page.id, url: page.url, title: page.title || page.url, internalLinks: page.internalLinkCount });
  const padrao = (key: string, observation: string, quais: RadarExtractionPage[]): RadarCompetitorLinkPattern | null => {
    if (!quais.length) return null;
    const proporcao = quais.length / paginas.length;
    return {
      key, observation,
      sourceCount: quais.length,
      sampleSize: paginas.length,
      competitors: quais.map(fichaDe),
      confidence: proporcao >= 0.6 ? "HIGH" : proporcao >= 0.3 ? "MEDIUM" : "LOW",
      provenance: `Contagem de links internos observada na extração de ${quais.length} de ${paginas.length} página(s).`,
    };
  };

  /*
   * OS DESTINOS REAIS, QUANDO A EXTRAÇÃO OS TROUXER.
   *
   * O Gate 10 nasceu sabendo apenas contar. Com os links observados no HTML já
   * extraído, os mesmos padrões passam a poder dizer PARA ONDE o concorrente
   * aponta — sem refazer nada do que já estava certo.
   */
  const observadosInternos: RadarObservedInternalLink[] = [
    ...paginas.flatMap(page => page.observedLinks
      .filter(link => link.kind === "INTERNAL")
      .map(link => ({
        pageId: page.id,
        sourceUrl: page.url,
        destination: link.destinationUrl,
        path: caminhoDe(link.destinationUrl),
        anchorText: link.anchorText,
        sectionHeading: link.sectionHeading,
        surroundingText: link.surroundingText,
      }))),
    ...(input.observedInternalLinks || []).map(item => ({
      pageId: item.pageId,
      sourceUrl: "",
      destination: item.destination,
      path: caminhoDe(item.destination),
      anchorText: item.anchor ?? null,
      sectionHeading: null,
      surroundingText: item.context ?? "",
    })),
  ];

  const comDestino = (predicado: (link: RadarObservedInternalLink) => boolean) =>
    paginas.filter(page => observadosInternos.some(link => link.pageId === page.id && predicado(link)));

  const competitorPatterns = [
    padrao("USES_CONTEXTUAL_INTERNAL_LINKS", "Usam links internos no corpo do conteúdo.", paginas.filter(page => page.internalLinkCount > 0)),
    padrao("NO_INTERNAL_LINKS_OBSERVED", "Não apresentam nenhum link interno observável.", paginas.filter(page => page.internalLinkCount === 0)),
    medianaInterna !== null
      ? padrao("DENSE_INTERNAL_LINKING", `Ligam acima da mediana observada (${medianaInterna} link(s) internos).`, paginas.filter(page => page.internalLinkCount > medianaInterna))
      : null,
    /* Só existem quando há destino observado — sem isso, não são afirmáveis. */
    padrao("LINKS_TO_RELATED_GUIDES", "Apontam para outros conteúdos editoriais do próprio site.", comDestino(link => /\/(blog|artigo|guia|post|dicas)\//i.test(link.path))),
    padrao("LINKS_TO_HUBS", "Apontam para hubs, categorias ou tags do próprio site.", comDestino(link => /\/(categoria|category|tag|colecao|hub)\//i.test(link.path))),
    padrao("LINKS_TO_PRODUCTS", "Apontam para páginas de produto do próprio site.", comDestino(link => /\/(produto|product|comprar|loja)\//i.test(link.path))),
  ].filter((item): item is RadarCompetitorLinkPattern => Boolean(item));

  if (!observadosInternos.length && paginas.some(page => page.internalLinkCount > 0)) {
    limitations.push("As páginas usam links internos, mas a extração atual guarda apenas a CONTAGEM: destino, âncora e contexto não estão disponíveis nesta versão.");
  }
  const semAncoraInterna = observadosInternos.filter(link => !link.anchorText).length;
  if (semAncoraInterna) limitations.push(`${semAncoraInterna} link(s) interno(s) não tinham texto de âncora; ela ficou ausente em vez de inventada.`);

  return {
    graphVersionId: grafo?.graphVersionId || null,
    graphContentHash: grafo?.graphContentHash || null,
    articleRole: input.context.silo?.articleRole || null,
    relatedInternalPages: relacionadas,
    inboundCount: relacionadas.reduce((total, item) => total + item.incoming, 0),
    outboundCount: relacionadas.reduce((total, item) => total + item.outgoing, 0),
    siloPage: relacionadas.find(item => item.role === "SILOPAGE") || null,
    anchorConcepts,
    conceptAlignments,
    conceptsWithoutGraphRelation,
    graphRelationsWithLowMarketSignal,
    competitorPatterns,
    observedCompetitorLinks: observadosInternos,
    competitorInternalLinkPattern: { pages: paginas.length, median: medianaInterna, range: faixa(internos) },
    competitorExternalLinkPattern: { pages: paginas.length, median: mediana(externos), range: faixa(externos) },
    limitations,
  };
}

/* ------------------------ candidatas a fonte externa --------------------- */

export type RadarExternalSourceType = "official" | "study" | "manufacturer" | "authority" | "media" | "unknown";

export type RadarExternalEvidenceCandidate = {
  /** A URL exata que a página citou. Capturada, nunca visitada. */
  destinationUrl: string | null;
  domain: string;
  sourceType: RadarExternalSourceType;
  category: RadarLinkCategory;
  /** Em quantas páginas comparáveis da amostra este destino foi citado. */
  competitorsUsingIt: number;
  sampleSize: number;
  /** Consultas distintas que trouxeram as páginas citantes. */
  queryCoverage: number;
  /** As âncoras ORIGINAIS, como cada página as escreveu. */
  anchors: string[];
  /** As seções em que a citação apareceu. */
  sections: string[];
  /** O trecho que justifica a citação — compacto, textual. */
  contexts: string[];
  /** Sinais observáveis, não pontuação inventada. */
  authoritySignals: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: Array<{ pageId: string; pageUrl: string; anchorText: string | null; sectionHeading: string | null }>;
  reason: string;
};

const OFICIAL = /((^|\.)gov(\.|$)|anvisa|inmetro|ministerio|ministério)/i;
const ESTUDO = /(pubmed|ncbi\.nlm\.nih\.gov|scielo|doi\.org|nature\.com|sciencedirect|researchgate)/i;
const AUTORIDADE = /((^|\.)edu(\.|$)|(^|\.)org(\.|$)|who\.int|paho\.org)/i;

/*
 * A assinatura específica vence o TLD genérico.
 *
 * `pubmed.ncbi.nlm.nih.gov` é base de estudos, não órgão regulador — perguntar
 * pelo `.gov` primeiro classificaria errado toda a literatura científica.
 */
function classificarFonte(domain: string): { tipo: RadarExternalSourceType; sinais: string[] } {
  const sinais: string[] = [];
  if (ESTUDO.test(domain)) { sinais.push("base de estudos ou publicação científica"); return { tipo: "study", sinais }; }
  if (OFICIAL.test(domain)) { sinais.push("domínio oficial ou regulador"); return { tipo: "official", sinais }; }
  if (AUTORIDADE.test(domain)) { sinais.push("domínio educacional ou institucional"); return { tipo: "authority", sinais }; }
  return { tipo: "unknown", sinais };
}

/**
 * As fontes que os concorrentes citam — candidatas, nunca links inseridos.
 *
 * A extração atual conta links externos por página, mas não guarda as URLs de
 * destino. Enquanto isso não existir no contrato de extração, a candidatura sai
 * do que é observável, e a limitação é declarada em vez de silenciada.
 */
export function buildRadarExternalEvidenceCandidates(input: {
  pages: readonly RadarExtractionPage[];
  /** Domínios externos observados, quando a extração os fornecer. */
  observedDomains?: readonly { domain: string; pageIds: string[] }[];
}): { candidates: RadarExternalEvidenceCandidate[]; limitations: string[] } {
  const limitations: string[] = [];
  const paginas = [...input.pages];
  const observados = input.observedDomains || [];

  if (!observados.length) {
    limitations.push(
      paginas.some(page => page.externalLinkCount > 0)
        ? "As páginas citam fontes externas, mas a extração atual guarda apenas a CONTAGEM de links: os domínios de destino não estão disponíveis nesta versão."
        : "Nenhuma citação externa foi observada nas páginas analisadas.",
    );
    return { candidates: [], limitations };
  }

  const candidates: RadarExternalEvidenceCandidate[] = observados
    .map(item => {
      const { tipo, sinais } = classificarFonte(item.domain);
      return {
        destinationUrl: null,
        domain: item.domain,
        sourceType: tipo,
        category: "CONTENT_REFERENCE" as const,
        competitorsUsingIt: item.pageIds.length,
        sampleSize: paginas.length,
        queryCoverage: 0,
        anchors: [],
        sections: [],
        contexts: [],
        authoritySignals: sinais,
        confidence: item.pageIds.length > 1 ? "MEDIUM" as const : "LOW" as const,
        provenance: item.pageIds.map(pageId => ({ pageId, pageUrl: "", anchorText: null, sectionHeading: null })),
        reason: `Citada por ${item.pageIds.length} de ${paginas.length} página(s) analisada(s).`,
      };
    })
    .sort((left, right) => right.competitorsUsingIt - left.competitorsUsingIt);

  return { candidates, limitations };
}

/* ==================================================================== */
/* ===============  GATE 11 · OS LINKS COMO ELES SÃO  ================= */
/* ==================================================================== */

/**
 * NEM TODO LINK EXTERNO É FONTE.
 *
 * Uma página cita a American Academy of Dermatology, aponta para o Instagram
 * da marca, leva à política de privacidade e vende um sabonete. Contar as
 * quatro como "4 links externos" era inútil; promover as quatro a candidatas a
 * fonte seria pior — o relatório recomendaria "citar o Instagram" com a mesma
 * cara de seriedade com que recomenda a AAD.
 *
 * A classificação é por sinal OBSERVÁVEL: o host, o caminho, o `rel` e a
 * âncora. Nada é apagado — rede social e página legal continuam registradas
 * como o que são, e a leitura comercial vai precisar delas.
 */
export type RadarLinkCategory =
  | "CONTENT_REFERENCE"
  | "COMMERCIAL"
  | "AFFILIATE"
  | "SOCIAL"
  | "NAVIGATION"
  | "LEGAL"
  | "MEDIA"
  | "NON_WEB"
  | "UNKNOWN";

const SOCIAL = /(^|\.)(instagram|facebook|twitter|x|linkedin|pinterest|tiktok|youtube|youtu|whatsapp|telegram|threads)\.(com|be|me|net)$/i;
const MARKETPLACE = /(^|\.)(mercadolivre|mercadolibre|amazon|shopee|magazineluiza|magalu|americanas|shopify|aliexpress)\./i;
/*
 * As páginas legais têm idioma próprio, e é por ele que se reconhecem.
 *
 * Casar por segmento exato deixava `/politica-de-privacidade` de fora — que é
 * exatamente como essas páginas se chamam. Casar por "politica" solto pegaria
 * um artigo sobre política. O meio-termo é o idioma inteiro da página legal.
 */
const LEGAL = /(privacidade|privacy[-_]?policy|termos[-_]de[-_](uso|servi(c|ç)o)|terms[-_]of[-_](use|service)|pol(i|í)tica[-_]de[-_]cookies|cookie[-_]?policy|lgpd|aviso[-_]legal|disclaimer)/i;
const NAVEGACAO_TEXTO = /^(in(í|i)cio|home|contato|sobre( n(ó|o)s)?|quem somos|login|entrar|cadastr\w*|buscar|carrinho|minha conta|menu|voltar ao topo|pr(ó|o)xim\w*|anterior)$/i;
const NAVEGACAO_CAMINHO = /^\/?$|\/(categoria|category|tag|tags|autor|author|pagina|page)\/\d*$/i;
const MIDIA = /\.(jpe?g|png|gif|webp|svg|avif|mp4|webm|mp3|pdf|zip)($|\?)/i;
const AFILIADO = /(\/(go|out|ref|aff|afiliado|redirect|redir)\/|[?&](tag|aff|affiliate|ref|utm_medium=affiliate)=)/i;
const COMERCIAL_CAMINHO = /\/(produto|product|p|comprar|buy|loja|shop|checkout|carrinho|cart|assinar|planos)(\/|$)/i;

/**
 * A classificação, na ordem em que os sinais mandam.
 *
 * A ordem não é estética: `rel="sponsored"` numa URL de marketplace é afiliado
 * antes de ser comercial, e um PDF hospedado num domínio oficial é mídia antes
 * de ser referência. Perguntar na ordem errada dá a resposta errada com a
 * mesma confiança.
 */
export function classifyRadarObservedLink(link: Pick<RadarObservedLink, "kind" | "destinationUrl" | "destinationDomain" | "anchorText" | "rel">): RadarLinkCategory {
  if (link.kind === "NON_WEB") return "NON_WEB";

  let caminho = "";
  try { caminho = new URL(link.destinationUrl).pathname; } catch { caminho = ""; }
  const ancora = (link.anchorText || "").trim();

  if (MIDIA.test(link.destinationUrl)) return "MEDIA";
  if (link.rel.includes("sponsored") || AFILIADO.test(link.destinationUrl)) return "AFFILIATE";
  if (SOCIAL.test(link.destinationDomain)) return "SOCIAL";
  if (LEGAL.test(caminho)) return "LEGAL";
  if (MARKETPLACE.test(link.destinationDomain) || COMERCIAL_CAMINHO.test(caminho)) return "COMMERCIAL";
  if (NAVEGACAO_TEXTO.test(ancora) || NAVEGACAO_CAMINHO.test(caminho)) return "NAVIGATION";
  if (!ancora) return "UNKNOWN";
  return "CONTENT_REFERENCE";
}

/** Um link observado, já ligado à página que o escreveu e à consulta que a trouxe. */
export type RadarLinkObservation = RadarObservedLink & {
  sourcePageId: string;
  sourceUrl: string;
  sourceTitle: string;
  /** As keywords que trouxeram a página de origem, quando conhecidas. */
  queryProvenance: string[];
  category: RadarLinkCategory;
  /** A identidade do destino, pela mesma régua que identifica referências. */
  normalizedDestination: string;
};

export function radarLinkObservations(input: {
  pages: readonly RadarExtractionPage[];
  provenance?: readonly RadarPageProvenance[];
}): RadarLinkObservation[] {
  const porUrl = new Map((input.provenance || []).map(item => [radarNormalizedUrl(item.url), item]));
  return input.pages.flatMap(page => {
    const fonte = porUrl.get(radarNormalizedUrl(page.url));
    const consultas = [...new Set((fonte?.appearances || []).map(item => item.keyword).filter((value): value is string => Boolean(value)))];
    return page.observedLinks.map(link => ({
      ...link,
      sourcePageId: page.id,
      sourceUrl: page.url,
      sourceTitle: page.title || page.url,
      queryProvenance: consultas,
      category: classifyRadarObservedLink(link),
      normalizedDestination: link.kind === "NON_WEB" ? link.destinationUrl : radarNormalizedUrl(link.destinationUrl),
    }));
  });
}

/**
 * O mesmo domínio, citado por vários concorrentes.
 *
 * Isso é sinal COMPETITIVO — e só isso. Dez páginas citarem o mesmo blog não
 * transforma o blog em fonte primária; transforma-o em domínio recorrente na
 * amostra. Classificar autoridade de verdade é trabalho do Gate 12, e dizer
 * isso aqui evita que a recorrência seja lida como aval.
 */
export type RadarRecurrentExternalDomain = {
  domain: string;
  sourceType: RadarExternalSourceType;
  citedByCompetitors: number;
  distinctUrls: number;
  urls: string[];
  note: string;
};

export type RadarSourceConceptAlignment = {
  conceptId: string;
  conceptLabel: string;
  domain: string;
  destinationUrl: string;
  sectionHeading: string | null;
  matchKind: "LEXICAL" | "SEMANTICALLY_RELATED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string;
  provenance: Array<{ pageId: string; pageUrl: string }>;
};

export type RadarExternalSourcePattern = {
  key: string;
  observation: string;
  sourceCount: number;
  sampleSize: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provenance: string;
};

export type RadarExternalSourceResearch = {
  observedLinks: RadarLinkObservation[];
  evidenceCandidates: RadarExternalEvidenceCandidate[];
  recurrentDomains: RadarRecurrentExternalDomain[];
  conceptAlignments: RadarSourceConceptAlignment[];
  patterns: RadarExternalSourcePattern[];
  /** Links comerciais e de afiliado: preservados, fora das candidatas a fonte. */
  commercialLinks: RadarLinkObservation[];
  limitations: string[];
};

/** Só o que pode ser fonte: referência de conteúdo, externa, com destino web. */
const podeSerFonte = (link: RadarLinkObservation) =>
  link.kind === "EXTERNAL" && link.category === "CONTENT_REFERENCE";

export function buildRadarExternalSourceResearch(input: {
  pages: readonly RadarExtractionPage[];
  provenance?: readonly RadarPageProvenance[];
  semantic?: RadarSemanticConceptModel | null;
  context?: RadarArticleResearchContext | null;
}): RadarExternalSourceResearch {
  const paginas = [...input.pages];
  const observedLinks = radarLinkObservations({ pages: paginas, provenance: input.provenance });
  const limitations: string[] = [];

  if (!paginas.length) {
    return { observedLinks: [], evidenceCandidates: [], recurrentDomains: [], conceptAlignments: [], patterns: [], commercialLinks: [], limitations: ["Nenhuma página analisada: não há link a observar."] };
  }
  const semObservacao = paginas.filter(page => !page.observedLinks.length && (page.internalLinkCount > 0 || page.externalLinkCount > 0));
  if (semObservacao.length) {
    limitations.push(`${semObservacao.length} página(s) foram extraídas antes desta versão e só guardam a CONTAGEM de links; os destinos delas não puderam ser observados.`);
  }

  /* --------------------------- as candidatas ----------------------------- */

  const porDestino = new Map<string, RadarLinkObservation[]>();
  for (const link of observedLinks.filter(podeSerFonte)) {
    porDestino.set(link.normalizedDestination, [...(porDestino.get(link.normalizedDestination) || []), link]);
  }

  const evidenceCandidates: RadarExternalEvidenceCandidate[] = [...porDestino.entries()]
    .map(([, ocorrencias]) => {
      const paginasCitantes = [...new Set(ocorrencias.map(item => item.sourcePageId))];
      const consultas = [...new Set(ocorrencias.flatMap(item => item.queryProvenance))];
      const { tipo, sinais } = classificarFonte(ocorrencias[0].destinationDomain);
      const semContexto = ocorrencias.every(item => !item.surroundingText);
      return {
        destinationUrl: ocorrencias[0].destinationUrl,
        domain: ocorrencias[0].destinationDomain,
        sourceType: tipo,
        category: "CONTENT_REFERENCE" as const,
        competitorsUsingIt: paginasCitantes.length,
        sampleSize: paginas.length,
        queryCoverage: consultas.length,
        anchors: [...new Set(ocorrencias.map(item => item.anchorText).filter((value): value is string => Boolean(value)))],
        sections: [...new Set(ocorrencias.map(item => item.sectionHeading).filter((value): value is string => Boolean(value)))],
        contexts: [...new Set(ocorrencias.map(item => item.surroundingText).filter(Boolean))].slice(0, 3),
        authoritySignals: sinais,
        /*
         * Confiança é da OBSERVAÇÃO, não da fonte.
         *
         * Alta quer dizer "vários concorrentes citam e o contexto explica por
         * quê" — nunca "esta fonte é confiável". Isso é o Gate 12.
         */
        confidence: paginasCitantes.length >= 3 && !semContexto
          ? "HIGH" as const
          : paginasCitantes.length >= 2 || (!semContexto && sinais.length) ? "MEDIUM" as const : "LOW" as const,
        provenance: ocorrencias.map(item => ({ pageId: item.sourcePageId, pageUrl: item.sourceUrl, anchorText: item.anchorText, sectionHeading: item.sectionHeading })),
        reason: `Citada por ${paginasCitantes.length} de ${paginas.length} página(s) analisada(s)${consultas.length ? `, encontradas por ${consultas.length} consulta(s)` : ""}. Observação de uso pelos concorrentes, não atestado de autoridade.`,
      };
    })
    .sort((left, right) => right.competitorsUsingIt - left.competitorsUsingIt || left.domain.localeCompare(right.domain));

  /* ------------------------ recorrência por domínio ----------------------- */

  const porDominio = new Map<string, RadarLinkObservation[]>();
  for (const link of observedLinks.filter(podeSerFonte)) {
    porDominio.set(link.destinationDomain, [...(porDominio.get(link.destinationDomain) || []), link]);
  }

  const recurrentDomains: RadarRecurrentExternalDomain[] = [...porDominio.entries()]
    .map(([domain, ocorrencias]) => {
      const paginasCitantes = new Set(ocorrencias.map(item => item.sourcePageId)).size;
      const urls = [...new Set(ocorrencias.map(item => item.destinationUrl))];
      return {
        domain,
        sourceType: classificarFonte(domain).tipo,
        citedByCompetitors: paginasCitantes,
        distinctUrls: urls.length,
        urls,
        note: "Recorrência é sinal competitivo observado. Ela não classifica a fonte como autoridade — as URLs individuais permanecem separadas.",
      };
    })
    .filter(item => item.citedByCompetitors > 1)
    .sort((left, right) => right.citedByCompetitors - left.citedByCompetitors || left.domain.localeCompare(right.domain));

  /* --------------------------- conceito × fonte --------------------------- */

  const escopo = buildRadarSemanticScope({
    centralEntities: (input.context?.keywords || [])
      .map(keyword => (keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null)?.payload?.centralEntity)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    keywordTexts: input.context?.resolvedKeywordTexts,
    editorialTopics: input.context?.editorialTopics,
  });

  const conceptAlignments: RadarSourceConceptAlignment[] = [];
  for (const concept of (input.semantic?.concepts || []).filter(radarConceptSupportsLinkRelation)) {
    for (const [, ocorrencias] of porDestino) {
      const comSecao = ocorrencias.filter(item => item.sectionHeading);
      const lexical = comSecao.find(item => mesmaFormulacao(item.sectionHeading as string, concept.canonicalLabel)
        || concept.variants.some(variante => mesmaFormulacao(item.sectionHeading as string, variante)));
      const semantico = comSecao.find(item => raizesEmComum(item.sectionHeading as string, concept.canonicalLabel, escopo)
        || concept.variants.some(variante => raizesEmComum(item.sectionHeading as string, variante, escopo)));
      const casado = lexical || semantico;
      if (!casado) continue;

      const paginasCitantes = [...new Set(ocorrencias.map(item => item.sourcePageId))];
      conceptAlignments.push({
        conceptId: concept.id,
        conceptLabel: concept.canonicalLabel,
        domain: casado.destinationDomain,
        destinationUrl: casado.destinationUrl,
        sectionHeading: casado.sectionHeading,
        matchKind: lexical ? "LEXICAL" : "SEMANTICALLY_RELATED",
        confidence: lexical && paginasCitantes.length > 1 ? "HIGH" : lexical ? "MEDIUM" : "LOW",
        evidence: `${paginasCitantes.length} concorrente(s) citam ${casado.destinationDomain} na seção "${casado.sectionHeading}", que trata de "${concept.canonicalLabel}".`,
        provenance: ocorrencias.map(item => ({ pageId: item.sourcePageId, pageUrl: item.sourceUrl })),
      });
    }
  }

  /* ------------------------------- padrões -------------------------------- */

  const paginasComFonte = new Set(observedLinks.filter(podeSerFonte).map(item => item.sourcePageId));
  const paginasComInstitucional = new Set(observedLinks.filter(item => podeSerFonte(item) && classificarFonte(item.destinationDomain).tipo !== "unknown").map(item => item.sourcePageId));
  const commercialLinks = observedLinks.filter(item => item.category === "COMMERCIAL" || item.category === "AFFILIATE");
  const paginasComComercial = new Set(commercialLinks.map(item => item.sourcePageId));

  const padrao = (key: string, observation: string, quantas: number): RadarExternalSourcePattern | null => {
    if (!quantas) return null;
    const proporcao = quantas / paginas.length;
    return {
      key, observation, sourceCount: quantas, sampleSize: paginas.length,
      confidence: proporcao >= 0.6 ? "HIGH" : proporcao >= 0.3 ? "MEDIUM" : "LOW",
      provenance: `Links observados no HTML já extraído de ${quantas} de ${paginas.length} página(s).`,
    };
  };

  const patterns = [
    padrao("CITES_EXTERNAL_SOURCES", "Citam fontes externas de conteúdo.", paginasComFonte.size),
    padrao("CITES_INSTITUTIONAL_SOURCES", "Citam fontes institucionais, científicas ou oficiais.", paginasComInstitucional.size),
    padrao("USES_COMMERCIAL_LINKS", "Apontam para destino comercial ou de afiliado.", paginasComComercial.size),
    recurrentDomains.length
      ? { key: "RECURRENT_SOURCE_DOMAINS", observation: `${recurrentDomains.length} domínio(s) aparecem em mais de um concorrente.`, sourceCount: recurrentDomains.length, sampleSize: paginas.length, confidence: "MEDIUM" as const, provenance: "Agregação por domínio das URLs observadas." }
      : null,
  ].filter((item): item is RadarExternalSourcePattern => Boolean(item));

  /* ----------------------------- limitações ------------------------------- */

  const semAncora = observedLinks.filter(item => item.kind === "EXTERNAL" && !item.anchorText).length;
  if (semAncora) limitations.push(`${semAncora} link(s) externo(s) não tinham texto de âncora nem descrição alternativa; a âncora ficou ausente em vez de inventada.`);
  const semSecao = observedLinks.filter(podeSerFonte).filter(item => !item.sectionHeading).length;
  if (semSecao) limitations.push(`${semSecao} citação(ões) não puderam ser associadas a uma seção do documento.`);
  const naoWeb = observedLinks.filter(item => item.kind === "NON_WEB").length;
  if (naoWeb) limitations.push(`${naoWeb} link(s) usam protocolo não navegável (mailto, tel, javascript); ficam registrados e fora das candidatas a fonte.`);
  if (commercialLinks.length) limitations.push(`${commercialLinks.length} link(s) comerciais ou de afiliado ficam preservados como observação de mercado e fora das candidatas a fonte.`);
  limitations.push("Nenhum destino foi acessado: as fontes são as que os concorrentes CITAM, não fontes verificadas.");

  return { observedLinks, evidenceCandidates, recurrentDomains, conceptAlignments, patterns, commercialLinks, limitations };
}
