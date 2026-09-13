/**
 * A FOTOGRAFIA COMPETITIVA — UMA AUTORIDADE, UMA LEITURA.
 *
 * Até aqui cada camada respondia bem à sua própria pergunta e ninguém
 * respondia à pergunta do USER:
 *
 *   "O que caracteriza os conteúdos que realmente competem por este tema, o
 *    que eles cobrem, como estruturam essa cobertura, onde convergem, onde
 *    divergem, e que oportunidades observáveis existem?"
 *
 * O universo sabia quem apareceu. A extração sabia quantas palavras. O modelo
 * semântico sabia o que era o mesmo assunto. A comparação sabia o que o
 * ArticleDNA declarou. Nenhum dos quatro sabia a resposta inteira — e a tela
 * remontava pedaços dela por conta própria, com risco de a aba e o relatório
 * concluírem coisas diferentes sobre a mesma investigação.
 *
 * Este módulo é o lugar único onde as camadas viram UMA leitura. Ele não
 * recalcula o que elas já sabem: recebe cada uma e as confronta.
 *
 * TRÊS FRONTEIRAS QUE ELE NÃO CRUZA:
 *
 *   1. NÃO PRESCREVE O ARTIGO. Sai "mediana 1.976 palavras em 5 páginas
 *      comparáveis", nunca "o artigo deve ter 2.300". Outline, contagem-alvo,
 *      H2 final, CTA e cronograma pertencem ao Planejador.
 *
 *      A LINKAGEM INTERNA É A EXCEÇÃO, e ela mudou de lado no Gate 10.1:
 *      quantidade, contexto, âncora e distribuição dos links internos SÃO
 *      decisão do Radar, porque é o Radar que tem a evidência competitiva
 *      para tomá-la. Ela sai em `internalLinkPlan`, fundamentada, e o
 *      Planejador a compõe com o resto em vez de redescobri-la.
 *   2. NÃO COPIA. O modelo descreve PADRÕES observados. Ele nunca monta um
 *      texto juntando frases dos concorrentes, nem devolve o conjunto de
 *      headings de alguém como se fosse estrutura a seguir.
 *   3. NÃO RESOLVE CONFLITO EM SILÊNCIO. Quando as leituras se contradizem, a
 *      contradição fica escrita, com evidência e impacto, para a decisão
 *      humana acontecer sabendo dela.
 *
 * Domínio puro: sem fetch, sem storage, sem provider. Derivado, não
 * persistido — reconstruído dos mesmos dados gravados a cada leitura, como
 * `deep-research-view`, para que não exista uma segunda cópia da verdade
 * envelhecendo em silêncio.
 */

import { isComparableRadarExtraction, classifyRadarExtractionFormat, extractionFormatLabel, type RadarExtractionFormat } from "./analysis-insights.ts";
import { radarModelMeasureLabel, radarModelPresenceLabel, type RadarCompetitiveModel, type RadarModelMeasure, type RadarModelPresence } from "./competitive-model.ts";
import { radarDeclaredArticleIntent, radarIntentConflict } from "./editorial-identity.ts";
import { radarNormalizedUrl } from "./research-reference.ts";
import { buildRadarExternalSourceResearch, buildRadarInternalLinkResearch, type RadarExternalSourceResearch, type RadarInternalLinkResearch } from "./link-and-source-research.ts";
import { buildRadarInternalLinkPlan, type RadarInternalLinkPlan } from "./internal-link-plan.ts";
import { buildRadarAuthorityEvidence, type RadarAuthorityEvidence } from "./authority-evidence.ts";
import { buildRadarAiDiscoveryContext, radarAiDiscoveryLines, type RadarAiDiscoveryContext, type RadarDiscoveryHeuristicReading } from "./ai-discovery-context.ts";
import type { RadarFactualEvidence, RadarSourceClassification } from "./source-authority.ts";
import { buildRadarEvidenceClaims } from "./claim-evidence.ts";
import { assessRadarYmylRelevance } from "./editorial-policy.ts";
import { RADAR_MIN_COMPARABLE_SUFFICIENT } from "./investigation-sufficiency.ts";

import type { RadarExtractionPage } from "./analysis-contracts.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarCompetitorClass, RadarCompetitorUniverse } from "./competitor-universe.ts";
import type { RadarEditorialComparison, RadarComparisonRow } from "./editorial-comparison.ts";
import type { RadarResearchReference } from "./research-reference.ts";
import { radarSemanticType, type RadarSemanticConcept, type RadarSemanticConceptModel, type RadarQuestionCluster } from "./semantic-concept-model.ts";
import { radarTopicTokens } from "./topic-classification.ts";

/* ============================ identidade ================================= */

/**
 * A QUE FUNDAMENTOS ESTA FOTOGRAFIA PERTENCE.
 *
 * Um modelo sem versão do ArticleDNA é uma foto sem data: parece atual para
 * sempre. Com a versão e o hash gravados, a avaliação de obsolescência que já
 * existe consegue dizer que esta leitura descreve outro artigo.
 */
export type RadarObservedIdentity = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
  principal: string | null;
  hierarchy: string | null;
  observedAt: string;
};

/* ============================== amostra ================================== */

/**
 * A AMOSTRA REAL — E A CANÔNICA SEPARADA DELA.
 *
 * A SERP canônica do artigo tem 7 resultados; a pesquisa multi-query produziu
 * 18 referências. Somar os dois números dava 25 e não descrevia nada. Aqui os
 * dois continuam visíveis, e continuam sendo coisas diferentes: a amostra do
 * modelo é o que foi realmente analisado.
 */
export type RadarObservedSample = {
  queriesExecuted: number;
  canonicalQueries: number;
  auxiliaryQueries: number;
  /** Resultados vistos somando todas as consultas, com repetição. */
  observedResults: number;
  /** O que a SERP canônica devolveu. Contexto, não amostra. */
  canonicalSerpResults: number;
  /** URLs distintas do universo, depois da deduplicação. */
  uniqueReferences: number;
  selectedReferences: number;
  analyzedSuccess: number;
  failedFinal: number;
  comparablePages: number;
  /** Referências vistas em mais de uma consulta — sinal competitivo. */
  recurrentReferences: number;
  /** Descobertas só pela pesquisa auxiliar. Não são cidadãs de segunda. */
  auxiliaryOnlyReferences: number;
};

/* ============================== intenção ================================= */

export type RadarObservedIntent = {
  declared: string | null;
  observedInSerp: string | null;
  /** O formato dominante das páginas realmente lidas. */
  observedInPages: string | null;
  alignment: "ALIGNED" | "COHERENT_COMMERCIAL" | "DIVERGENT" | "NOT_OBSERVED";
  note: string;
};

/* =============================== formatos ================================ */

export type RadarObservedFormat = {
  format: RadarExtractionFormat;
  label: string;
  pages: number;
  sources: Array<{ pageId: string; url: string; title: string }>;
  /** Entra no benchmark estrutural? Só o editorial entra. */
  comparable: boolean;
};

/* ============================== estrutura ================================ */

/** Uma leitura estrutural em linguagem de quem opera, com a evidência atrás. */
export type RadarObservedPattern = {
  key: string;
  label: string;
  present: number;
  sampleSize: number;
  /** `dominant` quando a maioria faz; `mixed` quando a amostra se divide. */
  verdict: "dominant" | "mixed" | "rare" | "not_observed";
  evidence: string;
};

/* ============================== conceitos ================================ */

export type RadarObservedConceptStatus =
  | "RECURRENT"
  | "CONFIRMED_BY_ARTICLE"
  | "UNDERCOVERED"
  | "ISOLATED";

export type RadarObservedConcept = {
  id: string;
  canonicalLabel: string;
  conceptType: RadarSemanticConcept["conceptType"];
  typeLabel: string;
  status: RadarObservedConceptStatus;
  sourceCount: number;
  sampleSize: number;
  queryCoverage: number;
  queries: string[];
  keywordRoles: string[];
  variants: string[];
  supportingPages: Array<{ pageId: string; url: string; title: string; heading: string }>;
  auxiliaryOnly: boolean;
  confidence: RadarSemanticConcept["confidence"];
  evidence: string;
};

/* ============================== perguntas ================================ */

export type RadarObservedQuestionStatus =
  | "RECURRENT_QUESTION"
  | "ARTICLE_QUESTION_CONFIRMED"
  | "MARKET_QUESTION_UNDERCOVERED"
  | "ISOLATED_QUESTION";

export type RadarObservedQuestion = {
  id: string;
  canonicalQuestion: string;
  variants: string[];
  conceptId: string;
  conceptLabel: string;
  pages: number;
  sampleSize: number;
  queryCoverage: number;
  sourceUrls: string[];
  status: RadarObservedQuestionStatus;
  /** O ArticleDNA declarou esta necessidade? */
  declaredByArticle: boolean;
  evidence: string;
};

/* ============================== entidades ================================ */

export type RadarObservedEntities = {
  article: string[];
  shared: Array<{ label: string; pages: number; evidence: string }>;
  related: Array<{ label: string; relatedTo: string | null; pages: number; evidence: string }>;
  marketOnly: Array<{ label: string; pages: number; evidence: string }>;
};

/* ====================== lacuna, diferencial, conflito ==================== */

export type RadarObservedGap = {
  subject: string;
  /** Em relação a quê a falta existe. */
  against: "ARTICLE_DNA" | "MARKET";
  pagesCovering: number;
  sampleSize: number;
  queryCoverage: number;
  queries: string[];
  sources: Array<{ pageId: string; url: string; title: string }>;
  confidence: RadarSemanticConcept["confidence"];
  evidence: string;
};

export type RadarObservedDifferentiation = {
  subject: string;
  /** O que sustenta o diferencial: o artigo declarou, ou a busca evidenciou. */
  basis: "ARTICLE_DECLARES" | "SERP_EVIDENCE";
  pagesCovering: number;
  sampleSize: number;
  sources: Array<{ pageId: string; url: string; title: string }>;
  evidence: string;
};

export type RadarObservedConflict = {
  subject: string;
  dimension: RadarComparisonRow["dimension"];
  articleSide: string | null;
  observedSide: string | null;
  evidence: string;
  /** O que muda para quem for planejar sabendo deste conflito. */
  impact: string;
};

/* ============================ concorrentes =============================== */

export type RadarObservedCompetitor = {
  referenceId: string | null;
  url: string;
  domain: string;
  title: string;
  classification: RadarCompetitorClass | null;
  origin: "CANONICAL" | "AUXILIARY" | "CANONICAL_AND_AUXILIARY" | "UNKNOWN";
  queries: string[];
  queryRecurrence: number;
  ranks: Array<{ keyword: string | null; role: string; rank: number }>;
  extractionStatus: RadarExtractionPage["status"] | "not_extracted";
  format: RadarExtractionFormat | null;
  comparable: boolean;
  structure: { words: number; h2: number; h3: number; paragraphs: number; images: number; lists: number } | null;
  conceptsCovered: string[];
  questionsCovered: string[];
  limitations: string[];
};

/* ============================ suficiência ================================ */

export type RadarObservedSufficiency = {
  level: "GOOD" | "PARTIAL" | "INSUFFICIENT";
  reasons: string[];
  signals: {
    comparablePages: number;
    extractionSuccessRate: number | null;
    queryCoverage: number;
    domainDiversity: number;
    recurrentConcepts: number;
    highConfidenceConcepts: number;
  };
};

/* ============================== o modelo ================================= */

export type RadarCompetitiveObservedModel = {
  identity: RadarObservedIdentity;
  sample: RadarObservedSample;
  intent: RadarObservedIntent;
  formats: { dominant: RadarObservedFormat | null; distribution: RadarObservedFormat[] };
  structure: { measures: RadarModelMeasure[]; presences: RadarModelPresence[]; patterns: RadarObservedPattern[] };
  concepts: {
    recurrent: RadarObservedConcept[];
    confirmed: RadarObservedConcept[];
    undercovered: RadarObservedConcept[];
    isolated: RadarObservedConcept[];
    all: RadarObservedConcept[];
  };
  questions: RadarObservedQuestion[];
  entities: RadarObservedEntities;
  gaps: RadarObservedGap[];
  differentiations: RadarObservedDifferentiation[];
  conflicts: RadarObservedConflict[];
  competitors: RadarObservedCompetitor[];
  /**
   * A ARQUITETURA INTERNA JÁ APROVADA, CRUZADA COM O QUE O MERCADO FAZ.
   *
   * O grafo é do Arquiteto e continua sendo: o Radar lê, cruza e devolve
   * contexto. Quantidade, repetição, âncora final, seção e posição são do
   * Planejador — nada disso sai daqui.
   */
  internalLinks: RadarInternalLinkResearch;
  /**
   * COMO A ARQUITETURA APROVADA SE APLICA DENTRO DESTE CONTEÚDO.
   *
   *  é fundamento e observação: quem se liga a quem, e o que o
   * mercado faz com links. Aqui vem a DECISÃO fundamentada — quantas vezes,
   * em que contexto, com que âncora, como distribuir. É o Radar que tem a
   * SERP na mão; o Planejador recebe isto pronto e compõe com o resto.
   */
  internalLinkPlan: RadarInternalLinkPlan;
  /**
   * O QUE OS CONCORRENTES CITAM — capturado, nunca visitado.
   *
   * Aqui está a diferença entre "4 links externos" e "quatro concorrentes
   * citam a mesma instituição ao explicar as causas". Uso observado, não
   * atestado de autoridade: classificar a fonte é o Gate 12.
   */
  externalSources: RadarExternalSourceResearch;
  /**
   * O QUE O ARTIGO VAI PRECISAR SUSTENTAR — e quem pode sustentar.
   *
   * YMYL por afirmação, natureza das fontes, evidência factual, conflitos
   * entre o que o mercado repete e o que a evidência permite afirmar, sinais
   * de E-E-A-T e os pontos preparados para o especialista. Sem nota: sinais
   * observados, cada um com o que foi visto e onde.
   */
  authorityEvidence: RadarAuthorityEvidence;
  /**
   * O QUE O ARTIGO PRECISA CONSEGUIR RESPONDER — e com que material.
   *
   * Nasce das camadas anteriores: o funil que o fundamento declarou, os
   * conceitos e perguntas do Gate 8, a fotografia do Gate 9 e a sustentação
   * do Gate 12. Um conjunto só de exigências, útil à busca e a quem interpreta
   * pela mesma razão — clareza. Não há nota, não há segundo conteúdo, e nada
   * aqui escreve o artigo.
   */
  aiDiscovery: RadarAiDiscoveryContext;
  sufficiency: RadarObservedSufficiency;
  limitations: string[];
  /** A evidência bruta continua alcançável a partir do modelo, sem recalcular. */
  evidence: {
    semantic: RadarSemanticConceptModel | null;
    comparison: RadarEditorialComparison;
    structural: RadarCompetitiveModel | null;
  };
};

/* ============================== o motor ================================== */

const chave = (url: string) => radarNormalizedUrl(url);

const fonteDaObservacao = (concept: RadarSemanticConcept) =>
  concept.supportingObservations.map(item => ({ pageId: item.pageId, url: item.url, title: item.pageTitle, heading: item.text }));

const paginasDe = (concept: RadarSemanticConcept) =>
  concept.supportingObservations.map(item => ({ pageId: item.pageId, url: item.url, title: item.pageTitle }));

/** Quantas páginas bastam para "a maioria faz". A mesma régua do resto do Radar. */
const maioria = (sampleSize: number) => Math.max(2, Math.ceil(sampleSize / 2));

function padrao(key: string, label: string, presence: RadarModelPresence | undefined): RadarObservedPattern | null {
  if (!presence) return null;
  const { present, sampleSize } = presence;
  const verdict: RadarObservedPattern["verdict"] = !sampleSize
    ? "not_observed"
    : present >= maioria(sampleSize) ? "dominant" : present > 0 ? "mixed" : "rare";
  return {
    key, label, present, sampleSize, verdict,
    evidence: sampleSize ? `${present} de ${sampleSize} página(s) comparável(is).` : "Sem página comparável para observar.",
  };
}

export function buildRadarCompetitiveObservedModel(input: {
  context: RadarArticleResearchContext;
  /** O universo multi-query, quando a pesquisa já rodou. */
  universe?: RadarCompetitorUniverse | null;
  references?: readonly RadarResearchReference[];
  /** As URLs que a curadoria confirmou. Elas definem a amostra. */
  selectedUrls?: readonly string[];
  pages?: readonly RadarExtractionPage[];
  /** URLs cuja extração terminou em falha definitiva nesta versão. */
  failedUrls?: readonly string[];
  /** O modelo estrutural e semântico do Gate 8. */
  structural?: RadarCompetitiveModel | null;
  comparison: RadarEditorialComparison;
  diagnostic?: { dominantIntent: string | null; dominantFormats: readonly string[] } | null;
  /** Quantos resultados a SERP canônica do artigo devolveu. Contexto, não amostra. */
  canonicalSerpResults?: number;
  /**
   * Fontes verificadas e o que elas dizem — quando o USER acionou a análise.
   *
   * Chegam de fora porque verificar é navegação externa, e navegação externa
   * não acontece dentro de um módulo de domínio nem ao abrir uma aba.
   */
  verifiedSources?: readonly RadarSourceClassification[];
  factualEvidence?: readonly RadarFactualEvidence[];
  /** A SERP desta investigação mantém precedência sobre o terreno competitivo? */
  serpStanding?: { current: boolean; sufficient: boolean; valid: boolean };
  /**
   * Leituras interpretativas sobre descoberta, quando existirem.
   *
   * Elas opinam e nunca decidem: contra um requisito sustentado pela amostra,
   * o que sai é conflito registrado — não requisito removido.
   */
  heuristicReadings?: readonly RadarDiscoveryHeuristicReading[];
  observedAt: string;
}): RadarCompetitiveObservedModel {
  const references = [...(input.references || [])];
  const pages = [...(input.pages || [])];
  const comparaveis = pages.filter(isComparableRadarExtraction);
  const semantic = input.structural?.semantic || null;
  const limitations: string[] = [];

  /* ------------------------------ identidade ------------------------------ */

  const principal = input.context.keywords.find(keyword => keyword.identity.role === "principal")?.identity.text || null;
  const identity: RadarObservedIdentity = {
    brandId: input.context.article.brandId,
    articleId: input.context.article.articleId,
    articleDnaVersionId: input.context.article.articleDnaVersionId,
    articleDnaContentHash: input.context.article.articleDnaContentHash,
    principal,
    hierarchy: input.context.article.hierarchy,
    observedAt: input.observedAt,
  };

  /* -------------------------------- amostra ------------------------------- */

  const consultas = input.universe?.queriesUsed || [];
  const canonicas = references.reduce((total, reference) => total + (reference.principalRank !== null ? 1 : 0), 0);
  const selecionadas = new Set((input.selectedUrls || []).map(chave).filter(Boolean));
  const falhas = new Set((input.failedUrls || []).map(chave).filter(Boolean));

  const sample: RadarObservedSample = {
    queriesExecuted: consultas.length,
    canonicalQueries: references.some(reference => reference.principalRank !== null) ? 1 : 0,
    auxiliaryQueries: Math.max(0, consultas.length - (references.some(reference => reference.principalRank !== null) ? 1 : 0)),
    observedResults: references.reduce((total, reference) => total + reference.appearances.length, 0),
    canonicalSerpResults: input.canonicalSerpResults ?? canonicas,
    uniqueReferences: references.length,
    selectedReferences: selecionadas.size,
    analyzedSuccess: pages.filter(page => page.status === "success").length,
    failedFinal: falhas.size,
    comparablePages: comparaveis.length,
    recurrentReferences: references.filter(reference => reference.queryCount > 1).length,
    auxiliaryOnlyReferences: references.filter(reference => reference.principalRank === null && reference.appearances.length > 0).length,
  };

  if (sample.uniqueReferences && sample.uniqueReferences !== sample.canonicalSerpResults) {
    /* Dito em voz alta para ninguém confundir os dois números outra vez. */
    limitations.push(`A SERP canônica devolveu ${sample.canonicalSerpResults} resultado(s); a pesquisa multi-query reuniu ${sample.uniqueReferences} referência(s) distinta(s). A amostra deste modelo é a segunda.`);
  }

  /* ------------------------------- intenção ------------------------------- */

  /*
   * O QUARTO LEITOR CRU — e o que produziu o bloco do smoke final.
   *
   * Esta linha era `input.context.article.mainIntent` direto: com o campo livre
   * trazendo "unknown", a narrativa escrevia "O artigo declara 'unknown' e a
   * busca responde com 'informacional'" — uma frase sobre o Radar não ter lido
   * o fundamento, apresentada como divergência editorial.
   */
  const declarada = radarDeclaredArticleIntent(input.context.article);
  const observada = input.diagnostic?.dominantIntent || input.structural?.identity.observedIntent || null;
  const comerciais = (input.universe?.byClass.COMMERCIAL_COMPETITOR || 0) + (input.universe?.byClass.PRODUCT_REFERENCE || 0);
  const totalCandidatos = input.universe?.candidates.length || 0;
  const dominanciaComercial = totalCandidatos > 0 && comerciais / totalCandidatos >= 0.6;
  const declaradaComercial = /transacional|transactional|comercial|commercial/i.test(declarada || "");

  /*
   * SERP COMERCIAL NÃO É FALHA QUANDO O ARTIGO É COMERCIAL.
   *
   * Foi por não perguntar isso que "cremes skin care" virou "amostra falha" em
   * vez de "consulta comercial, e o artigo também é".
   */
  /*
   * E A COMPARAÇÃO ERA LITERAL, o que é o segundo defeito desta mesma linha.
   *
   * `declarada.toLowerCase() === observada.toLowerCase()` chamaria de DIVERGENTE
   * o par "Informacional" × "informational" — o fundamento em português e o
   * provider em inglês descrevendo a MESMA intenção. A autoridade compara por
   * família, com a tabela que o Arquiteto já usa.
   */
  const leituraDeIntencao = radarIntentConflict({ expected: declarada, observed: observada });
  const alignment: RadarObservedIntent["alignment"] = !declarada || !observada
    ? "NOT_OBSERVED"
    : declaradaComercial && dominanciaComercial
      ? "COHERENT_COMMERCIAL"
      : leituraDeIntencao.conflicting ? "DIVERGENT" : "ALIGNED";

  const intent: RadarObservedIntent = {
    declared: declarada,
    observedInSerp: observada,
    observedInPages: input.structural?.identity.dominantFormat || null,
    alignment,
    note: alignment === "COHERENT_COMMERCIAL"
      ? "A composição declara intenção comercial e a busca responde com comércio: as duas leituras concordam."
      : alignment === "DIVERGENT"
        ? `O artigo declara "${declarada}" e a busca responde com "${observada}"${dominanciaComercial ? `; ${comerciais} de ${totalCandidatos} resultados são comerciais` : ""}.`
        : alignment === "ALIGNED"
          ? "A intenção observada na busca corresponde à declarada pela composição."
          : observada
          /* §5 — ausência não é declaração: "unknown" nunca vira o que o artigo diz. */
          ? `A busca respondeu com "${observada}", e a composição não concluiu a intenção declarada.`
          : "Não houve evidência suficiente para confrontar intenção declarada e observada.",
  };

  /* ------------------------------- formatos ------------------------------- */

  const porFormato = new Map<RadarExtractionFormat, RadarObservedFormat>();
  for (const page of pages) {
    const format = classifyRadarExtractionFormat(page);
    const atual = porFormato.get(format) || { format, label: extractionFormatLabel(format), pages: 0, sources: [], comparable: format === "article_editorial" };
    atual.pages += 1;
    atual.sources.push({ pageId: page.id, url: page.url, title: page.title || page.url });
    porFormato.set(format, atual);
  }
  const distribution = [...porFormato.values()].sort((left, right) => right.pages - left.pages);
  const dominant = distribution.find(item => item.comparable) || distribution[0] || null;

  /*
   * FORMATOS INCOMPARÁVEIS NÃO CONTAMINAM O BENCHMARK.
   *
   * Uma página de categoria com 120 palavras e um artigo de 2.000 na mesma
   * mediana não descrevem mercado nenhum. Elas continuam visíveis — como
   * formato observado, fora das medidas.
   */
  const foraDoBenchmark = distribution.filter(item => !item.comparable).reduce((total, item) => total + item.pages, 0);
  if (foraDoBenchmark) {
    limitations.push(`${foraDoBenchmark} página(s) de formato não editorial permanecem como referência e ficam fora das medidas estruturais.`);
  }

  /* ------------------------------ estrutura ------------------------------- */

  const presences = [
    ...(input.structural?.formatting || []),
    ...(input.structural?.opening.patterns || []),
    ...(input.structural?.closing.patterns || []),
  ];
  const acha = (key: string) => presences.find(item => item.key === key);
  const patterns = [
    padrao("DIRECT_OPENING", "Abertura direta", acha("introShort")),
    padrao("EDITORIAL_CLOSING", "Fechamento editorial", acha("hasClosing")),
    padrao("USES_LISTS", "Usa listas", acha("lists")),
    padrao("USES_TABLES", "Usa tabelas", acha("tables")),
    padrao("USES_IMAGES", "Usa imagens", acha("images")),
    padrao("USES_EMPHASIS", "Usa destaques", acha("bold")),
  ].filter((item): item is RadarObservedPattern => Boolean(item));

  const estruturaH2 = input.structural?.structure.find(item => item.key === "h2");
  if (estruturaH2 && estruturaH2.median !== null && estruturaH2.median >= 6) {
    patterns.push({
      key: "HEAVY_H2_STRUCTURE", label: "Estrutura extensa em H2",
      present: comparaveis.length, sampleSize: comparaveis.length, verdict: "dominant",
      evidence: `Mediana de ${estruturaH2.median} H2 por página comparável.`,
    });
  }

  /*
   * PERGUNTA OBSERVADA NÃO É BLOCO DE FAQ.
   *
   * Se a amostra usa formulação interrogativa, o fato é esse: ela usa. Virar
   * "crie um FAQ" é prescrição, e prescrição é do Planejador.
   */
  const paginasComPergunta = new Set((semantic?.rawObservations || []).filter(item => item.isQuestion && !item.noise).map(item => item.pageId));
  if (paginasComPergunta.size) {
    patterns.push({
      key: "QUESTION_STYLE_HEADINGS", label: "Títulos em forma de pergunta",
      present: paginasComPergunta.size, sampleSize: comparaveis.length,
      verdict: paginasComPergunta.size >= maioria(comparaveis.length) ? "dominant" : "mixed",
      evidence: `${paginasComPergunta.size} de ${comparaveis.length} página(s) formulam seções como pergunta. Padrão observado, não recomendação de bloco.`,
    });
  }

  /* ------------------------------ conceitos ------------------------------- */

  const declarados = input.context.editorialTopics;
  const confirmadosNaComparacao = new Set(
    input.comparison.rows.filter(row => row.dimension === "topic" && row.status === "CONFIRMED").map(row => row.competitorsCover || ""),
  );

  const observedConcept = (concept: RadarSemanticConcept): RadarObservedConcept => {
    const status: RadarObservedConceptStatus = confirmadosNaComparacao.has(concept.canonicalLabel)
      ? "CONFIRMED_BY_ARTICLE"
      : concept.classification === "RECURRENT_TOPIC"
        ? "RECURRENT"
        : concept.anchored ? "UNDERCOVERED" : "ISOLATED";
    return {
      id: concept.id,
      canonicalLabel: concept.canonicalLabel,
      conceptType: concept.conceptType,
      typeLabel: concept.typeLabel,
      status,
      sourceCount: concept.sourceCount,
      sampleSize: concept.sampleSize,
      queryCoverage: concept.queryCoverage,
      queries: concept.queries,
      keywordRoles: concept.keywordRoles,
      variants: concept.variants,
      supportingPages: fonteDaObservacao(concept),
      auxiliaryOnly: concept.auxiliaryOnly,
      confidence: concept.confidence,
      evidence: `${concept.classificationReason} ${concept.confidenceReason}`.trim(),
    };
  };

  const all = (semantic?.concepts || []).map(observedConcept);
  const concepts = {
    all,
    recurrent: all.filter(item => item.status === "RECURRENT" || item.status === "CONFIRMED_BY_ARTICLE").filter(item => item.sourceCount >= maioria(item.sampleSize)),
    confirmed: all.filter(item => item.status === "CONFIRMED_BY_ARTICLE"),
    undercovered: all.filter(item => item.status === "UNDERCOVERED"),
    isolated: all.filter(item => item.status === "ISOLATED"),
  };

  /* ------------------------------- perguntas ------------------------------ */

  /*
   * O ARTIGO DECLAROU ESTA NECESSIDADE?
   *
   * Interseção de tokens sozinha responde errado, e o erro é sempre o mesmo:
   * "identificação da pele oleosa" e "Como montar uma rotina para pele oleosa"
   * compartilham dois terços dos termos significativos e são necessidades
   * diferentes. O tipo é conferido antes das palavras — a mesma regra que o
   * confronto editorial usa, para as duas leituras não discordarem.
   */
  const declaradoCobre = (texto: string) => {
    const daPergunta = radarSemanticType(texto);
    return declarados.some(item => {
      const declaradoTipado = radarSemanticType(item);
      if (declaradoTipado.faceted && daPergunta.faceted && declaradoTipado.type !== daPergunta.type) return false;
      const esquerda = new Set(radarTopicTokens(item));
      const direita = radarTopicTokens(texto);
      if (!esquerda.size || !direita.length) return false;
      return direita.filter(token => esquerda.has(token)).length / Math.min(esquerda.size, direita.length) >= 0.6;
    });
  };

  const questions: RadarObservedQuestion[] = (semantic?.questionClusters || []).map((cluster: RadarQuestionCluster) => {
    const concept = (semantic?.concepts || []).find(item => item.id === cluster.conceptId);
    const declarada = declaradoCobre(cluster.canonicalQuestion);
    const status: RadarObservedQuestionStatus = declarada
      ? "ARTICLE_QUESTION_CONFIRMED"
      : cluster.pages >= maioria(comparaveis.length)
        ? "RECURRENT_QUESTION"
        : concept?.anchored ? "MARKET_QUESTION_UNDERCOVERED" : "ISOLATED_QUESTION";
    return {
      id: cluster.id,
      canonicalQuestion: cluster.canonicalQuestion,
      variants: cluster.variants,
      conceptId: cluster.conceptId,
      conceptLabel: concept?.canonicalLabel || cluster.canonicalQuestion,
      pages: cluster.pages,
      sampleSize: comparaveis.length,
      queryCoverage: cluster.queryCoverage,
      sourceUrls: cluster.sourceUrls,
      status,
      declaredByArticle: declarada,
      evidence: `${cluster.pages} de ${comparaveis.length} página(s) formulam esta necessidade, sob ${cluster.variants.length} formulação(ões).`,
    };
  });

  /* ------------------------------- entidades ------------------------------ */

  const entidadesSemanticas = semantic?.entities || [];
  const entities: RadarObservedEntities = {
    article: entidadesSemanticas.filter(item => item.origin === "article" || item.origin === "both").map(item => item.label),
    shared: entidadesSemanticas.filter(item => item.relation === "same_as" && item.pages > 0)
      .map(item => ({ label: item.label, pages: item.pages, evidence: `Observada em ${item.pages} página(s) e declarada pela composição.` })),
    related: entidadesSemanticas.filter(item => item.relation === "related_to")
      .map(item => ({ label: item.label, relatedTo: item.relatedTo, pages: item.pages, evidence: `Aparece ao lado do assunto em ${item.pages} página(s); entidade distinta, relação preservada.` })),
    marketOnly: entidadesSemanticas.filter(item => item.relation === "distinct" && item.origin === "competitors" && item.pages > 1)
      .map(item => ({ label: item.label, pages: item.pages, evidence: `Recorre em ${item.pages} página(s) da amostra e não consta da composição.` })),
  };

  /* -------------------- lacunas, diferenciais, conflitos ------------------ */

  const conceitoPorRotulo = new Map(all.map(item => [item.canonicalLabel, item]));

  /*
   * LACUNA EXIGE EVIDÊNCIA — E A EVIDÊNCIA JÁ FOI PRODUZIDA ANTES.
   *
   * "Heading raro" nunca foi lacuna; "uma página isolada" nunca foi
   * oportunidade. O que chega aqui já passou pelo agrupamento conceitual e
   * pelo confronto com o ArticleDNA. Este módulo apenas dá nome, procedência e
   * confiança ao que sobreviveu.
   */
  const gaps: RadarObservedGap[] = input.comparison.rows
    .filter(row => row.status === "GAP")
    .map(row => {
      const conceito = conceitoPorRotulo.get(row.competitorsCover || row.subject) || null;
      return {
        subject: row.subject,
        against: "ARTICLE_DNA" as const,
        pagesCovering: conceito?.sourceCount ?? row.sources.length,
        sampleSize: conceito?.sampleSize ?? comparaveis.length,
        queryCoverage: conceito?.queryCoverage ?? 0,
        queries: conceito?.queries || [],
        sources: row.sources,
        confidence: conceito?.confidence || "LOW",
        evidence: row.evidence,
      };
    })
    .filter(gap => gap.sources.length > 0);

  const differentiations: RadarObservedDifferentiation[] = input.comparison.rows
    .filter(row => row.status === "DIFFERENTIATION")
    .map(row => ({
      subject: row.subject,
      basis: row.articleDeclares ? ("ARTICLE_DECLARES" as const) : ("SERP_EVIDENCE" as const),
      pagesCovering: row.sources.length,
      sampleSize: comparaveis.length,
      sources: row.sources,
      evidence: row.evidence,
    }));

  /* Pouco coberto pelo mercado e ancorado ao artigo também é diferencial observável. */
  for (const conceito of concepts.undercovered) {
    if (differentiations.some(item => item.subject === conceito.canonicalLabel)) continue;
    differentiations.push({
      subject: conceito.canonicalLabel,
      basis: "SERP_EVIDENCE",
      pagesCovering: conceito.sourceCount,
      sampleSize: conceito.sampleSize,
      sources: paginasDe((semantic?.concepts || []).find(item => item.id === conceito.id)!),
      evidence: `A busca evidencia a necessidade e apenas ${conceito.sourceCount} de ${conceito.sampleSize} página(s) a cobrem. ${conceito.evidence}`,
    });
  }

  const conflicts: RadarObservedConflict[] = input.comparison.rows
    .filter(row => row.status === "CONFLICT")
    .map(row => ({
      subject: row.subject,
      dimension: row.dimension,
      articleSide: row.articleDeclares,
      observedSide: row.serpShows || row.competitorsCover,
      evidence: row.evidence,
      impact: row.dimension === "intent"
        ? "Planejar como informacional uma busca que responde comércio — ou o contrário — muda o formato inteiro da página."
        : "As duas leituras não podem estar certas ao mesmo tempo; a decisão precisa ser tomada sabendo disso.",
    }));

  if (alignment === "DIVERGENT" && !conflicts.some(item => item.dimension === "intent")) {
    conflicts.push({
      subject: "Intenção de busca",
      dimension: "intent",
      articleSide: declarada,
      observedSide: `${comerciais} de ${totalCandidatos} resultados comerciais`,
      evidence: intent.note,
      impact: "A amostra descreve um mercado comercial para um artigo declarado informacional.",
    });
  }

  /* ----------------------------- concorrentes ----------------------------- */

  const paginaPorUrl = new Map(pages.map(page => [chave(page.url), page]));
  const conceitosPorPagina = new Map<string, string[]>();
  const perguntasPorPagina = new Map<string, string[]>();
  for (const concept of semantic?.concepts || []) {
    for (const observation of concept.supportingObservations) {
      conceitosPorPagina.set(observation.pageId, [...(conceitosPorPagina.get(observation.pageId) || []), concept.canonicalLabel]);
      if (observation.isQuestion) {
        perguntasPorPagina.set(observation.pageId, [...(perguntasPorPagina.get(observation.pageId) || []), observation.text]);
      }
    }
  }

  const competitors: RadarObservedCompetitor[] = references.map(reference => {
    const page = paginaPorUrl.get(reference.normalizedUrl) || null;
    const format = page ? classifyRadarExtractionFormat(page) : null;
    const limitacoes: string[] = [];
    if (!page && selecionadas.has(reference.normalizedUrl)) limitacoes.push("Selecionada, mas sem extração nesta versão.");
    if (falhas.has(reference.normalizedUrl)) limitacoes.push("A extração terminou em falha definitiva; o que esta página cobriria não foi observado.");
    if (page && !isComparableRadarExtraction(page)) limitacoes.push("Formato não editorial: permanece como referência, fora das medidas estruturais.");
    if (reference.entityCompatibility === "unknown") limitacoes.push("A relação com o assunto do artigo não pôde ser observada antes da extração.");

    return {
      referenceId: reference.referenceId,
      url: reference.url,
      domain: reference.domain,
      title: reference.title,
      classification: reference.classification,
      origin: reference.principalRank !== null && reference.appearances.some(item => item.sourceType === "auxiliary")
        ? "CANONICAL_AND_AUXILIARY"
        : reference.principalRank !== null ? "CANONICAL" : reference.appearances.length ? "AUXILIARY" : "UNKNOWN",
      queries: [...new Set(reference.appearances.map(item => item.keyword).filter((value): value is string => Boolean(value)))],
      queryRecurrence: reference.queryCount,
      ranks: reference.appearances.map(item => ({ keyword: item.keyword, role: item.keywordRole, rank: item.rank })),
      extractionStatus: page?.status || "not_extracted",
      format,
      comparable: Boolean(page && isComparableRadarExtraction(page)),
      structure: page
        ? { words: page.wordCount, h2: page.h2.length, h3: page.h3.length, paragraphs: page.paragraphCount, images: page.imageCount, lists: page.listCount }
        : null,
      conceptsCovered: page ? [...new Set(conceitosPorPagina.get(page.id) || [])] : [],
      questionsCovered: page ? [...new Set(perguntasPorPagina.get(page.id) || [])] : [],
      limitations: limitacoes,
    };
  });

  /* ----------------------------- suficiência ------------------------------ */

  const tentadas = sample.analyzedSuccess + sample.failedFinal;
  const signals: RadarObservedSufficiency["signals"] = {
    comparablePages: comparaveis.length,
    extractionSuccessRate: tentadas ? Number((sample.analyzedSuccess / tentadas).toFixed(2)) : null,
    queryCoverage: sample.queriesExecuted,
    domainDiversity: new Set(comparaveis.map(page => { try { return new URL(page.url).hostname; } catch { return page.url; } })).size,
    recurrentConcepts: concepts.recurrent.length,
    highConfidenceConcepts: all.filter(item => item.confidence === "HIGH").length,
  };

  /*
   * O MODELO PRECISA SABER QUANDO A PRÓPRIA CONCLUSÃO É FRACA.
   *
   * Nada de nota arbitrária: cada degrau aqui aponta para um sinal que a
   * pessoa consegue conferir na tela — quantas páginas comparáveis, quantos
   * domínios distintos, quantos conceitos se repetem.
   */
  const razoes: string[] = [];
  let level: RadarObservedSufficiency["level"];
  if (comparaveis.length < RADAR_MIN_COMPARABLE_SUFFICIENT) {
    level = "INSUFFICIENT";
    razoes.push(`${comparaveis.length} página(s) comparável(is): abaixo de ${RADAR_MIN_COMPARABLE_SUFFICIENT} a leitura descreve páginas, não mercado.`);
  } else if (signals.domainDiversity >= 3 && signals.recurrentConcepts >= 2 && (signals.extractionSuccessRate ?? 1) >= 0.6) {
    level = "GOOD";
    razoes.push(`${comparaveis.length} página(s) comparável(is) em ${signals.domainDiversity} domínio(s) distinto(s).`);
    razoes.push(`${signals.recurrentConcepts} conceito(s) recorrente(s) sustentam a leitura de cobertura.`);
  } else {
    level = "PARTIAL";
    if (signals.domainDiversity < 3) razoes.push(`Apenas ${signals.domainDiversity} domínio(s) distinto(s) na amostra comparável.`);
    if (signals.recurrentConcepts < 2) razoes.push("Menos de dois conceitos recorrentes: a convergência do mercado está pouco demonstrada.");
    if ((signals.extractionSuccessRate ?? 1) < 0.6) razoes.push(`Só ${Math.round((signals.extractionSuccessRate || 0) * 100)}% das extrações tentadas foram concluídas.`);
  }
  if (sample.queriesExecuted > 1) razoes.push(`${sample.queriesExecuted} consulta(s) executada(s), com ${sample.recurrentReferences} referência(s) recorrente(s) entre elas.`);

  /* --------------------------- arquitetura interna ------------------------ */

  /*
   * O GRAFO APROVADO ENTRA AQUI, E SÓ COMO LEITURA.
   *
   * Montá-lo dentro do modelo observado é o que evita a terceira cópia: a aba
   * mostrava um cálculo, o modelo mostraria outro. O Arquiteto decidiu quem se
   * liga a quem; o Radar acrescenta o que o mercado faz com esses assuntos.
   */
  const internalLinks = buildRadarInternalLinkResearch({
    context: input.context,
    pages: comparaveis,
    semantic,
  });

  const internalLinkPlan = buildRadarInternalLinkPlan({ research: internalLinks, semantic });

  const provenienciaDasPaginas = references.map(reference => ({
    url: reference.url,
    appearances: reference.appearances.map(item => ({ keyword: item.keyword, keywordRole: item.keywordRole, sourceType: item.sourceType })),
  }));

  const externalSources = buildRadarExternalSourceResearch({
    pages: comparaveis,
    provenance: provenienciaDasPaginas,
    semantic,
    context: input.context,
  });

  /*
   * A CAMADA DE AUTORIDADE E EVIDÊNCIA.
   *
   * Ela nasce das anteriores: os conceitos viram afirmações, as citações
   * observadas viram fontes classificadas, e o confronto entre o que o mercado
   * repete e o que a evidência permite afirmar vira conflito registrado.
   *
   * As fontes verificadas e a evidência factual chegam de fora quando o USER
   * aciona a análise: nada aqui busca nada.
   */
  const dominiosPorPagina = new Map<string, string[]>();
  for (const link of externalSources.observedLinks) {
    if (link.kind !== "EXTERNAL" || link.category !== "CONTENT_REFERENCE") continue;
    dominiosPorPagina.set(link.sourcePageId, [...new Set([...(dominiosPorPagina.get(link.sourcePageId) || []), link.destinationDomain])]);
  }

  const ymyl = assessRadarYmylRelevance(input.context);
  const authorityEvidence = buildRadarAuthorityEvidence({
    ymyl,
    claims: buildRadarEvidenceClaims({ semantic, articleYmyl: ymyl, sourcesByPage: dominiosPorPagina }),
    pages: comparaveis,
    sources: input.verifiedSources,
    factualEvidence: input.factualEvidence,
    serp: input.serpStanding || { current: true, sufficient: comparaveis.length >= RADAR_MIN_COMPARABLE_SUFFICIENT, valid: true },
  });

  /*
   * A CAMADA DE DESCOBERTA E COMPREENSÃO.
   *
   * A última das derivadas, e por isso a que enxerga todas: ela pergunta o que
   * este artigo precisa conseguir responder, e responde com o que as camadas
   * anteriores já provaram. O funil vem do fundamento — o Radar não
   * reclassifica estágio nem com a SERP na mão.
   */
  const aiDiscovery = buildRadarAiDiscoveryContext({
    context: input.context,
    semantic,
    concepts: concepts.all,
    questions,
    entities,
    authority: authorityEvidence,
    presences,
    sampleSize: comparaveis.length,
    observedIntent: intent.observedInSerp || intent.declared,
    heuristicReadings: input.heuristicReadings,
    observedAt: input.observedAt,
  });

  /* ------------------------------ limitações ------------------------------ */

  limitations.push(...internalLinks.limitations);
  limitations.push(...internalLinkPlan.limitations);
  limitations.push(...externalSources.limitations);
  if (sample.failedFinal) limitations.push(`${sample.failedFinal} página(s) selecionada(s) não puderam ser extraídas; o que elas cobririam não foi observado.`);
  const semRelacao = references.filter(reference => reference.entityCompatibility === "unknown").length;
  if (semRelacao) limitations.push(`${semRelacao} referência(s) seguiram para a extração sem relação de entidade observável no título; a leitura delas depende do conteúdo extraído.`);
  if (sample.auxiliaryOnlyReferences) limitations.push(`${sample.auxiliaryOnlyReferences} referência(s) foram descobertas apenas pela pesquisa auxiliar e participam do modelo em pé de igualdade.`);
  limitations.push(...(input.structural?.limitations || []));
  limitations.push(...(input.comparison.limitations || []));
  limitations.push(...(input.universe?.limitations || []));

  return {
    identity,
    sample,
    intent,
    formats: { dominant, distribution },
    structure: { measures: input.structural?.structure || [], presences, patterns },
    concepts,
    questions,
    entities,
    gaps,
    differentiations,
    conflicts,
    competitors,
    internalLinks,
    internalLinkPlan,
    externalSources,
    authorityEvidence,
    aiDiscovery,
    sufficiency: { level, reasons: razoes, signals },
    limitations: [...new Set(limitations)],
    evidence: { semantic, comparison: input.comparison, structural: input.structural || null },
  };
}

/* ==================== a projeção que uma pessoa lê ======================= */

export type RadarObservedNarrativeSection = { title: string; lines: string[] };

/**
 * O MESMO MODELO, EM LINGUAGEM DE QUEM OPERA.
 *
 * Derivada da mesma autoridade, nunca de um segundo cálculo: se a tela e o
 * relatório contarem histórias diferentes sobre a mesma investigação, é porque
 * alguém calculou duas vezes. Aqui não há como.
 *
 * Primeira camada sem detalhe técnico: id de página, hash e fingerprint ficam
 * no modelo, para quem for atrás.
 */
export function radarObservedNarrative(model: RadarCompetitiveObservedModel): RadarObservedNarrativeSection[] {
  const lista = (itens: string[], vazio: string) => (itens.length ? itens : [vazio]);
  const top = <T,>(itens: T[], limite: number) => itens.slice(0, limite);

  const sections: RadarObservedNarrativeSection[] = [
    {
      title: "Amostra",
      lines: [
        `${model.sample.comparablePages} página(s) comparável(is) em ${model.sample.queriesExecuted} consulta(s).`,
        `${model.sample.uniqueReferences} referência(s) distinta(s) no universo · ${model.sample.selectedReferences} selecionada(s) · ${model.sample.analyzedSuccess} analisada(s) · ${model.sample.failedFinal} falha(s) definitiva(s).`,
        model.sample.recurrentReferences
          ? `${model.sample.recurrentReferences} concorrente(s) aparecem em mais de uma consulta.`
          : "Nenhum concorrente se repetiu entre as consultas.",
      ],
    },
    {
      title: "Intenção",
      lines: [model.intent.note].concat(
        model.intent.declared ? [`Declarada pela composição: ${model.intent.declared}.`] : [],
        model.intent.observedInSerp ? [`Observada na busca: ${model.intent.observedInSerp}.`] : [],
      ),
    },
    {
      title: "Formato",
      lines: model.formats.dominant
        ? [`${model.formats.dominant.label} dominante (${model.formats.dominant.pages} página(s)).`]
          .concat(model.formats.distribution.filter(item => item !== model.formats.dominant).map(item => `${item.label}: ${item.pages} página(s)${item.comparable ? "" : " — fora das medidas estruturais"}.`))
        : ["Nenhum formato observado nesta amostra."],
    },
    {
      title: "Estrutura",
      lines: lista(
        model.structure.measures.filter(item => item.kind !== "absent").map(item => `${item.label}: ${radarModelMeasureLabel(item)}`),
        "Sem amostra comparável para observar estrutura.",
      ).concat(top(model.structure.patterns.filter(item => item.verdict === "dominant"), 4).map(item => `${item.label}: ${item.evidence}`)),
    },
    {
      title: "Conceitos recorrentes",
      lines: lista(
        top(model.concepts.recurrent, 6).map((item, index) => `${index + 1}. ${item.canonicalLabel} — ${item.sourceCount} de ${item.sampleSize} página(s), ${item.variants.length} formulação(ões)${item.queryCoverage > 1 ? `, ${item.queryCoverage} consultas` : ""}.`),
        "Nenhum conceito se repetiu o bastante para descrever convergência do mercado.",
      ),
    },
    {
      title: "Perguntas recorrentes",
      lines: lista(
        top(model.questions.filter(item => item.status === "RECURRENT_QUESTION" || item.status === "ARTICLE_QUESTION_CONFIRMED"), 5)
          .map((item, index) => `${index + 1}. ${item.canonicalQuestion} — ${item.pages} de ${item.sampleSize} página(s).`),
        "Nenhuma pergunta recorrente observada na amostra.",
      ),
    },
    {
      title: "O artigo já cobre",
      lines: lista(
        model.concepts.confirmed.map(item => `${item.canonicalLabel} — ${item.sourceCount} de ${item.sampleSize} página(s) cobrem, sob ${item.variants.length} formulação(ões).`),
        "Nenhum assunto declarado pelo ArticleDNA foi confirmado na amostra.",
      ),
    },
    {
      /*
       * DUAS FALTAS DIFERENTES, DUAS SEÇÕES.
       *
       * "O mercado cobre e o artigo não declara" é falta do lado do artigo — e
       * um assunto coberto por 10 de 14 páginas não é "pouco coberto pelo
       * mercado", é o contrário disso. Misturar as duas leituras numa lista só
       * produzia a frase que se lê e não se entende.
       */
      title: "O mercado cobre e o artigo não declara",
      lines: lista(
        top(model.gaps, 6).map(item => `${item.subject} — ${item.pagesCovering} de ${item.sampleSize} página(s) cobrem; confiança ${item.confidence.toLowerCase()}.`),
        "Nenhuma lacuna com evidência suficiente nesta amostra.",
      ),
    },
    {
      title: "Pouco coberto pelo mercado",
      lines: lista(
        top(model.concepts.undercovered, 6).map(item => `${item.canonicalLabel} — apenas ${item.sourceCount} de ${item.sampleSize} página(s) cobrem; confiança ${item.confidence.toLowerCase()}.`),
        "Nenhum assunto relevante ficou pouco coberto nesta amostra.",
      ),
    },
    {
      title: "Diferenciação possível",
      lines: lista(
        top(model.differentiations, 6).map(item => `${item.subject} — ${item.basis === "ARTICLE_DECLARES" ? "o artigo declara" : "a busca evidencia"} e o mercado cobre em ${item.pagesCovering} de ${item.sampleSize} página(s).`),
        "Nenhuma diferenciação observável nesta amostra.",
      ),
    },
    {
      title: "Conflitos",
      lines: lista(
        model.conflicts.map(item => `${item.subject}: ${item.evidence} ${item.impact}`),
        "Nenhuma contradição entre o que o artigo declara e o que a busca mostra.",
      ),
    },
    {
      /*
       * A ARQUITETURA APARECE EM PRIMEIRA CAMADA, SEM ID TÉCNICO.
       *
       * Quem lê precisa saber quantas páginas se relacionam, para que lado, e
       * quais assuntos do mercado já têm casa na arquitetura. `nodeId`,
       * `graphVersionId` e hash ficam no modelo, para quem for atrás.
       */
      title: "Arquitetura interna",
      lines: (() => {
        const arquitetura = model.internalLinks;
        if (!arquitetura.relatedInternalPages.length) {
          return [arquitetura.limitations[0] || "Nenhuma relação interna aprovada chegou a esta investigação."];
        }
        const linhas = [
          `${arquitetura.relatedInternalPages.length} página(s) relacionada(s) no grafo aprovado.`,
          `${arquitetura.outboundCount} relação(ões) de saída · ${arquitetura.inboundCount} de entrada${arquitetura.siloPage ? " · 1 SiloPage relacionada" : ""}.`,
          `${arquitetura.anchorConcepts.length} conceito(s) de âncora disponíveis. Texto final, quantidade e posição são decisão do Planejador.`,
        ];
        if (arquitetura.conceptAlignments.length) {
          linhas.push("Conceitos do mercado que a arquitetura já relaciona:");
          for (const alinhamento of top(arquitetura.conceptAlignments, 5)) {
            /*
             * O grafo não entrega título nem slug dos suportes — só o papel.
             * Nomear o destino pelo CONCEITO DE ÂNCORA aprovado é o mais
             * próximo de "que página é essa" que se pode dizer sem inventar.
             */
            const destino = alinhamento.slug
              || `${alinhamento.role.toLocaleLowerCase("pt-BR")} de "${alinhamento.matchedAnchorConcepts[0]}"`;
            linhas.push(`— ${alinhamento.conceptLabel} → ${destino}${alinhamento.matchKind === "SEMANTICALLY_RELATED" ? " (por proximidade de assunto, não por formulação)" : ""}.`);
          }
        }
        for (const padrao of top(arquitetura.competitorPatterns.filter(item => item.confidence !== "LOW"), 3)) {
          linhas.push(`${padrao.sourceCount}/${padrao.sampleSize} páginas: ${padrao.observation.toLocaleLowerCase("pt-BR")}`);
        }
        if (arquitetura.conceptsWithoutGraphRelation.length) {
          linhas.push(`${arquitetura.conceptsWithoutGraphRelation.length} assunto(s) recorrente(s) do mercado não têm relação aprovada — observação para o Arquiteto, não instrução.`);
        }
        if (arquitetura.graphRelationsWithLowMarketSignal.length) {
          linhas.push(`${arquitetura.graphRelationsWithLowMarketSignal.length} relação(ões) aprovada(s) que a amostra não confirma como assunto recorrente. Elas permanecem.`);
        }
        return linhas;
      })(),
    },
    {
      title: "Entidades",
      lines: lista(
        [
          ...top(model.entities.shared, 4).map(item => `${item.label} — a mesma entidade do artigo, em ${item.pages} página(s).`),
          ...top(model.entities.related, 4).map(item => `${item.label} — relacionada, entidade distinta, em ${item.pages} página(s).`),
          ...top(model.entities.marketOnly, 3).map(item => `${item.label} — só o mercado usa, em ${item.pages} página(s).`),
        ],
        "Nenhuma entidade observável na amostra.",
      ),
    },
    {
      /*
       * O PLANO, NÃO A REDE.
       *
       * A rede o Arquiteto já entregou e ela está na seção acima. Aqui vai o
       * que o Radar decidiu com a SERP na mão: quantas vezes, onde, com que
       * âncora. Cada item diz a evidência que o sustenta — sem isso seria
       * palpite com aparência de plano.
       */
      title: "Plano de links internos",
      lines: (() => {
        const plano = model.internalLinkPlan;
        const aplicaveis = [...(plano.siloPage ? [plano.siloPage] : []), ...plano.outgoing];
        if (!aplicaveis.length) {
          return [plano.limitations[0] || "Nenhuma relação de saída a aplicar neste artigo."];
        }
        const linhas = [`${aplicaveis.length} relação(ões) de saída aplicáveis · ${plano.totalRecommendedLinks} link(s) recomendados no total.`];
        aplicaveis.forEach((item, index) => {
          const destino = item.slug || `${item.targetRole.toLocaleLowerCase("pt-BR")} de "${item.approvedAnchorConcepts[0] || "conceito não informado"}"`;
          linhas.push(`${index + 1}. ${destino} — ${item.relationTypes[0] || "relação aprovada"}`);

          /*
           * A FRASE MUDOU PORQUE A DECISÃO MUDOU.
           *
           * "1 ocorrência estrutural, lugar a definir" era o Radar fingindo
           * ter planejado o que não conseguiu fundamentar. Dizer que a relação
           * é aprovada E que a investigação não achou onde aplicá-la é mais
           * verdadeiro — e mais útil para quem for compor o texto.
           */
          if (item.applicationStatus === "REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT") {
            linhas.push("   Relação estrutural aprovada. A investigação não encontrou nesta rodada um contexto natural suficientemente sustentado para aplicar o link.");
            linhas.push(`   Âncora aprovada, quando houver onde aplicá-la: "${item.anchor.recommendedAnchor}"`);
            return;
          }

          linhas.push(`   Recomendação: ${item.recommendedOccurrences} ocorrência(s). ${item.occurrencesReason}`);
          linhas.push(`   Âncora: "${item.anchor.recommendedAnchor}"${item.anchor.anchorVariants.length ? ` · variantes: ${item.anchor.anchorVariants.map(variante => `"${variante}"`).join(", ")}` : ""}`);
          if (item.preferredContexts.length) linhas.push(`   Contexto: ${item.preferredContexts[0]}`);
          linhas.push(`   Distribuição: ${item.distribution[0]}`);
        });
        if (plano.incoming.length) {
          linhas.push(`${plano.incoming.length} relação(ões) de entrada: o requisito fica pronto para a revisão da página de origem, que este artigo não edita.`);
        }
        if (plano.opportunities.length) {
          linhas.push(`${plano.opportunities.length} oportunidade(s) fora do grafo aprovado — registradas para o Arquiteto decidir, fora do plano.`);
        }
        for (const guarda of plano.guards) linhas.push(guarda);
        return linhas;
      })(),
    },
    {
      /*
       * FONTES SÃO O QUE OS CONCORRENTES CITAM — não o que devemos citar.
       *
       * A frase escolhida importa: "4 concorrentes citam este domínio ao
       * tratar de X" é observação; "use este domínio" seria instrução, e
       * instrução é do Planejador e do Especialista. A lista completa de URLs
       * fica no modelo; aqui vai o que se lê em dez segundos.
       */
      title: "Fontes e referências",
      lines: (() => {
        const fontes = model.externalSources;
        const citam = fontes.patterns.find(item => item.key === "CITES_EXTERNAL_SOURCES");
        if (!citam) {
          return [fontes.limitations.find(item => /CONTAGEM|Nenhuma página/.test(item)) || "Nenhuma citação externa observada nas páginas analisadas."];
        }
        const linhas = [
          `${citam.sourceCount} de ${citam.sampleSize} páginas citam fontes externas.`,
          `${fontes.evidenceCandidates.length} fonte(s) distinta(s) observada(s).`,
        ];
        if (fontes.recurrentDomains.length) {
          linhas.push(`${fontes.recurrentDomains.length} domínio(s) aparecem em mais de um concorrente:`);
          for (const dominio of top(fontes.recurrentDomains, 4)) {
            linhas.push(`— ${dominio.domain} — citado por ${dominio.citedByCompetitors} concorrentes, ${dominio.distinctUrls} URL(s) distinta(s).`);
          }
        }
        const porConceito = [...new Set(fontes.conceptAlignments.map(item => item.conceptLabel))];
        if (porConceito.length) {
          linhas.push(`Conceitos que costumam receber referência externa: ${top(porConceito, 4).join(" · ")}.`);
        }
        const comercial = fontes.patterns.find(item => item.key === "USES_COMMERCIAL_LINKS");
        if (comercial) linhas.push(`${comercial.sourceCount} de ${comercial.sampleSize} páginas apontam para destino comercial ou de afiliado.`);
        linhas.push("Uso observado pelos concorrentes. Nenhum destino foi acessado, e recorrência não é atestado de autoridade.");
        return linhas;
      })(),
    },
    {
      /*
       * O QUE O ARTIGO VAI PRECISAR SUSTENTAR.
       *
       * Nenhuma nota. O que se lê aqui é: quão sensível é o tema, quantas
       * afirmações exigem sustentação, que fontes o mercado usa, onde o
       * mercado e a evidência divergem, e onde um profissional precisa entrar.
       */
      title: "Autoridade e evidência",
      lines: (() => {
        const autoridade = model.authorityEvidence;
        const linhas = [`Relevância YMYL do artigo: ${autoridade.ymylAssessment.relevance.toLowerCase()}. ${autoridade.ymylAssessment.reason}`];

        if (!autoridade.claims.length) {
          linhas.push("Nenhuma afirmação recorrente o bastante para exigir sustentação factual nesta amostra.");
          return linhas;
        }
        linhas.push(`${autoridade.summary.claimsNeedingSupport} afirmação(ões) exigem sustentação factual · ${autoridade.summary.claimsWellSupported} sustentada(s) · ${autoridade.summary.claimsWithEvidenceGap} sem fonte adequada.`);

        if (autoridade.summary.sourcesByType.length) {
          linhas.push("Fontes observadas:");
          for (const tipo of top(autoridade.summary.sourcesByType, 5)) linhas.push(`— ${tipo.count} ${tipo.label.toLowerCase()}`);
        }

        /*
         * O CONFLITO É MOSTRADO INTEIRO — os dois lados.
         *
         * Apagar os nove concorrentes tornaria a leitura mais limpa e menos
         * verdadeira. Eles continuam descrevendo o mercado; o que muda é o que
         * podemos afirmar como fato.
         */
        for (const conflito of top(autoridade.marketVsFactConflicts, 3)) {
          linhas.push(`Conflito — ${conflito.canonicalClaim}:`);
          linhas.push(`   Mercado observado: ${conflito.marketObservation}`);
          linhas.push(`   Evidência factual: ${conflito.factualPosition}`);
          linhas.push(`   ${conflito.impact}`);
        }

        const dominantes = autoridade.eeatSignals.filter(item => item.pages > 0 && item.pages >= maioria(item.sampleSize));
        if (dominantes.length) {
          linhas.push(`Padrão de autoria e fontes na amostra: ${top(dominantes, 3).map(item => item.label.toLowerCase()).join(" · ")}.`);
        }

        linhas.push(autoridade.specialistReviewRequirements.length
          ? `Especialista: ${autoridade.specialistReviewRequirements.length} ponto(s) de revisão preparados, cada um com a pergunta já contextualizada.`
          : "Especialista: nenhum ponto de revisão foi criado — não há dúvida factual nem conflito que justifique.");
        return linhas;
      })(),
    },
    {
      /*
       * O QUE O ARTIGO PRECISA CONSEGUIR RESPONDER.
       *
       * A seção fala de necessidade, definição, entidade e sustentação — o
       * vocabulário de quem edita. Nada de engenharia de modelo: quem opera
       * não precisa saber como um sistema de leitura funciona por dentro para
       * decidir se o artigo responde com clareza.
       */
      title: "Descoberta e compreensão",
      lines: radarAiDiscoveryLines(model.aiDiscovery),
    },
    {
      title: "Confiança desta leitura",
      lines: [`${model.sufficiency.level === "GOOD" ? "Boa" : model.sufficiency.level === "PARTIAL" ? "Parcial" : "Insuficiente"}.`, ...model.sufficiency.reasons],
    },
    {
      title: "Limitações",
      lines: lista(model.limitations, "Nenhuma limitação registrada nesta investigação."),
    },
  ];

  return sections;
}

/** O rótulo curto do nível, para a tela não reinventar o vocabulário. */
export const radarObservedSufficiencyLabel = (level: RadarObservedSufficiency["level"]) =>
  ({ GOOD: "Leitura sustentada pela amostra", PARTIAL: "Leitura parcial", INSUFFICIENT: "Amostra insuficiente" }[level]);

export const radarObservedPresenceLabel = radarModelPresenceLabel;
