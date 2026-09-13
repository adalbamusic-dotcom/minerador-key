/**
 * O CONTEXTO QUE O RADAR SEMPRE RECEBEU E NUNCA LEU.
 *
 * A auditoria R10 provou duas coisas incômodas. A primeira: o contexto
 * estratégico de cada keyword — volume, resultados, KGR, intenção normalizada,
 * contribuição, e até o KeywordDNA inteiro em `keywordDnaSnapshot` — atravessa
 * o handoff e está persistido em `arquitetoKeywordDnaReferences`. A segunda: o
 * único leitor disso no Radar era o painel de diagnóstico.
 *
 * E as duas fontes de keyword eram complementares e incompletas: a referência
 * do Arquiteto tem os NÚMEROS e não tem o TEXTO; a hidratação tem o texto e não
 * tem os números. Ninguém as juntava.
 *
 * Esta é a junção. Não é DNA novo, não é entidade nova, não persiste nada: é
 * uma projeção pura do RadarItem + ArticleDNA já recebidos, feita para o motor
 * de pesquisa poder ler o que o Arquiteto já entregou.
 *
 * DUAS REGRAS QUE NÃO SE NEGOCIAM:
 *
 *   1. keyword não some. Cinco referências entram, cinco keywords saem — com
 *      `resolution` dizendo o que faltou em cada uma. O descarte silencioso da
 *      hidratação (`if (!source || !keyword) return null`) morre aqui.
 *   2. id não é texto. Quando o texto não resolve, o campo fica nulo e vira
 *      limitação — nunca um UUID disfarçado de keyword.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { ARTICLE_FUNNEL_LABELS, ARTICLE_INTENT_LABELS } from "../arquiteto/article-classification-closure.ts";
import type { ArticleDNA, ArticleKeywordReference, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { RadarItem } from "../editorial/operational-flow.ts";

export type RadarKeywordResolution = "FULL" | "PARTIAL" | "UNRESOLVED";

export type RadarResearchKeywordIdentity = {
  keywordId: string;
  canonicalKeywordId: string | null;
  sourceKeywordId: string | null;
  keywordDnaVersionId: string | null;
  /** O texto real da keyword. `null` quando não resolveu — nunca o id. */
  text: string | null;
  role: "principal" | "secundaria" | "reforco_narrativo";
};

/** O envelope estratégico. O mesmo para principal, secundária e reforço. */
export type RadarResearchKeywordStrategy = {
  volume: number | null;
  resultCount: number | null;
  kgrScore: number | null;
  incrementalVolume: number | null;
  contribution: string | null;
  normalizedIntent: string | null;
  coveredIntentions: string[];
  strategicContribution: string | null;
  purpose: string | null;
  overlapRisk: string | null;
  keywordUrlRelation: unknown | null;
  demandEvidence: unknown | null;
  keywordDnaSnapshot: unknown | null;
  /** A qualificação semântica versionada usada na formação, quando existe. */
  semanticQualification: {
    versionId: string;
    contentHash: string;
    intent: string | null;
    funnel: string | null;
    semanticState: string;
    collectedAt: string;
  } | null;
};

export type RadarResearchKeyword = {
  identity: RadarResearchKeywordIdentity;
  strategy: RadarResearchKeywordStrategy;
  resolution: RadarKeywordResolution;
  provenance: {
    textSource: "hydration" | "none";
    strategySource: "article_reference" | "none";
    keywordDnaVersionId: string | null;
    keywordDnaContentHash: string | null;
  };
};

export type RadarResearchSilo = {
  siloId: string | null;
  siloName: string | null;
  siloDnaVersionId: string | null;
  siloDnaContentHash: string | null;
  siloPageId: string | null;
  siloPageSlug: string | null;
  siloPageCanonical: string | null;
  siloPagePublicationStatus: string | null;
  articleRole: string | null;
  hierarchy: string | null;
};

export type RadarResearchFormationSerp = {
  assessmentId: string | null;
  formationBaseHash: string | null;
  verdict: string | null;
  humanResolution: { decision: string; reason: string; decidedBy: string; decidedAt: string } | null;
  /** URLs que a SERP da FORMAÇÃO já mostrou, por keyword. Contexto, não amostra. */
  keywordUrls: Array<{ keywordId: string; relation: unknown }>;
  hasAssessment: boolean;
};

export type RadarResearchInternalLinks = {
  graphId: string;
  graphVersionId: string;
  graphContentHash: string;
  edges: Array<{
    sourceNodeId: string;
    targetNodeId: string;
    relationType: string;
    anchorConcepts: string[];
    reason: string;
    priority: string;
    direction: "outbound" | "inbound";
  }>;
};

export type RadarArticleResearchContext = {
  state: "COMPLETE" | "PARTIAL";
  article: {
    brandId: string;
    articleId: string;
    articleDnaVersionId: string;
    articleDnaContentHash: string | null;
    promise: string | null;
    mainIntent: string | null;
    hierarchy: string | null;
    /*
     * A CLASSIFICAÇÃO TERMINAL FECHADA PELO ARQUITETO.
     *
     * O SMOKE MOSTROU "unknown" na faixa do Article enquanto o Arquiteto exibia
     * Informacional / Topo para o mesmo artigo. Os dois estavam lendo lugares
     * diferentes: o Arquiteto lê `ArticleDNA.classification`, que é onde a
     * decisão terminal fica gravada com valor, motivo e origem — e o Radar não
     * lia esse campo em lugar nenhum.
     *
     * Não é inferência a partir da SERP: é o fundamento aprovado, lido de onde
     * ele já estava. A intenção OBSERVADA na SERP continua sendo outra coisa, em
     * outro lugar (§2).
     */
    classification: {
      /** Terminal do Arquiteto: INFORMATIONAL, COMMERCIAL_INVESTIGATION, … */
      intent: string | null;
      intentLabel: string | null;
      /** Terminal do Arquiteto: TOP, MIDDLE, BOTTOM, MIXED, INDETERMINATE. */
      funnel: string | null;
      funnelLabel: string | null;
      /** Por que o Arquiteto concluiu assim. Nunca um carimbo sem motivo. */
      reason: string | null;
    } | null;
  };
  keywords: RadarResearchKeyword[];
  /** Tópicos editoriais declarados. Alimenta a classificação de lacuna. */
  editorialTopics: string[];
  /** Os textos resolvidos — a única fonte válida para análise textual. */
  resolvedKeywordTexts: string[];
  silo: RadarResearchSilo | null;
  formationSerp: RadarResearchFormationSerp | null;
  internalLinks: RadarResearchInternalLinks | null;
  limitations: string[];
};

const texto = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const numero = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

/** Todo identificador conhecido de uma referência ou de um snapshot. */
const idsDaReferencia = (reference: ArticleKeywordReference) => new Set([reference.keywordId].filter(Boolean));

function idsDoSnapshot(snapshot: NonNullable<RadarItem["hydration"]>["keywordSnapshots"][number]) {
  return new Set([
    snapshot.referenceKeywordId, snapshot.canonicalKeywordId, snapshot.sourceKeywordId,
    snapshot.originalKeywordId, ...snapshot.aliases,
  ].filter((value): value is string => Boolean(value)));
}

const compartilhaIdentidade = (esquerda: Set<string>, direita: Set<string>) =>
  [...esquerda].some(id => direita.has(id));

/*
 * Os rótulos são os MESMOS do Arquiteto — importados de lá, não recriados.
 * Uma segunda tabela de tradução envelheceria sozinha e faria as duas telas
 * discordarem sobre o nome do mesmo estágio.
 */
const INTENCAO_TERMINAL: Record<string, string> = ARTICLE_INTENT_LABELS;
const FUNIL_TERMINAL: Record<string, string> = ARTICLE_FUNNEL_LABELS;

/**
 * A CLASSIFICAÇÃO TERMINAL, LIDA — E AUSENTE QUANDO AUSENTE.
 *
 * `INDETERMINATE` e `AMBIGUOUS` NÃO viram valor: eles são a forma de o
 * Arquiteto dizer que não concluiu. Tratá-los como resposta encheria a faixa do
 * Article com uma palavra que não informa nada — que é exatamente o defeito de
 * `"unknown"` que este gate corrige.
 */
function classificacaoTerminal(dna: ArticleDNA | null) {
  const bruto = (dna as (ArticleDNA & Record<string, unknown>) | null)?.classification as
    | { intent?: { value?: string; reason?: string }; funnel?: { value?: string; reason?: string } }
    | undefined;
  if (!bruto) return null;

  const conclusivo = (valor: string | undefined, indeterminado: string) =>
    valor && valor !== indeterminado ? valor : null;
  const intent = conclusivo(bruto.intent?.value, "AMBIGUOUS");
  const funnel = conclusivo(bruto.funnel?.value, "INDETERMINATE");
  if (!intent && !funnel) return null;

  return {
    intent,
    intentLabel: intent ? INTENCAO_TERMINAL[intent] || intent : null,
    funnel,
    funnelLabel: funnel ? FUNIL_TERMINAL[funnel] || funnel : null,
    reason: texto(bruto.funnel?.reason) || texto(bruto.intent?.reason),
  };
}

function estrategiaDe(reference: ArticleKeywordReference | null): RadarResearchKeywordStrategy {
  const item = reference as (ArticleKeywordReference & Record<string, unknown>) | null;
  return {
    volume: numero(item?.volume),
    resultCount: numero(item?.resultCount),
    kgrScore: numero(item?.kgrScore),
    incrementalVolume: numero(item?.incrementalVolume),
    contribution: texto(item?.contribution),
    normalizedIntent: texto(item?.normalizedIntent),
    coveredIntentions: Array.isArray(item?.coveredIntentions) ? item.coveredIntentions.filter((value): value is string => typeof value === "string") : [],
    strategicContribution: texto(item?.strategicContribution),
    purpose: texto(item?.purpose),
    overlapRisk: texto(item?.overlapRisk),
    keywordUrlRelation: item?.keywordUrlRelation ?? null,
    demandEvidence: item?.demandEvidence ?? null,
    keywordDnaSnapshot: item?.keywordDnaSnapshot ?? null,
    semanticQualification: item?.semanticQualificationRef
      ? {
        versionId: String((item.semanticQualificationRef as Record<string, unknown>).versionId),
        contentHash: String((item.semanticQualificationRef as Record<string, unknown>).contentHash),
        intent: texto((item.semanticQualificationRef as Record<string, unknown>).intent),
        funnel: texto((item.semanticQualificationRef as Record<string, unknown>).funnel),
        semanticState: String((item.semanticQualificationRef as Record<string, unknown>).semanticState),
        collectedAt: String((item.semanticQualificationRef as Record<string, unknown>).collectedAt),
      }
      : null,
  };
}

/** Uma estratégia "existe" quando traz pelo menos um fato utilizável. */
function temEstrategia(strategy: RadarResearchKeywordStrategy) {
  return strategy.volume !== null || strategy.resultCount !== null || strategy.kgrScore !== null
    || strategy.semanticQualification !== null
    || strategy.normalizedIntent !== null || strategy.coveredIntentions.length > 0
    || strategy.strategicContribution !== null || strategy.keywordDnaSnapshot !== null;
}

export function buildRadarArticleResearchContext(input: {
  item: RadarItem;
  article?: VersionEnvelope<ArticleDNA> | null;
}): RadarArticleResearchContext {
  const item = input.item;
  const dna = input.article?.payload || null;
  const limitations: string[] = [];

  const referencias: ArticleKeywordReference[] = item.arquitetoKeywordDnaReferences
    || (dna?.keywordReferences as ArticleKeywordReference[] | undefined)
    || [];
  const snapshots = item.hydration?.keywordSnapshots || [];

  if (!item.arquitetoKeywordDnaReferences?.length && dna?.keywordReferences?.length) {
    limitations.push("Esta linha é anterior ao transporte das referências de KeywordDNA; o contexto foi resolvido a partir do ArticleDNA carregado.");
  }
  if (!referencias.length) {
    limitations.push("Nenhuma referência de keyword disponível nesta linha nem no ArticleDNA.");
  }

  /*
   * O JOIN É POR IDENTIDADE, NUNCA POR TEXTO.
   *
   * Casar por texto reintroduziria exatamente o que a auditoria condenou:
   * inferir identidade a partir de string parecida.
   */
  const disponiveis = [...snapshots];
  const keywords: RadarResearchKeyword[] = referencias.map(reference => {
    const idsRef = idsDaReferencia(reference);
    const indice = disponiveis.findIndex(snapshot => compartilhaIdentidade(idsRef, idsDoSnapshot(snapshot)));
    const snapshot = indice >= 0 ? disponiveis.splice(indice, 1)[0] : null;

    const strategy = estrategiaDe(reference);
    const textoResolvido = texto(snapshot?.keyword);
    const comEstrategia = temEstrategia(strategy);
    const resolution: RadarKeywordResolution = textoResolvido && comEstrategia ? "FULL"
      : textoResolvido || comEstrategia ? "PARTIAL"
        : "UNRESOLVED";

    /*
     * Sem texto resolvido, o campo fica nulo. O id NÃO vira fallback textual:
     * era assim que UUID acabava tratado como keyword na análise.
     */
    if (!textoResolvido) {
      limitations.push(`A keyword ${reference.keywordId} (${reference.role}) não teve o texto resolvido; ela permanece na composição, fora da análise textual.`);
    }

    return {
      identity: {
        keywordId: reference.keywordId,
        canonicalKeywordId: texto(snapshot?.canonicalKeywordId),
        sourceKeywordId: texto(snapshot?.sourceKeywordId),
        keywordDnaVersionId: texto(reference.keywordDnaVersionId),
        text: textoResolvido,
        role: reference.role,
      },
      strategy,
      resolution,
      provenance: {
        textSource: textoResolvido ? "hydration" : "none",
        strategySource: comEstrategia ? "article_reference" : "none",
        keywordDnaVersionId: texto(reference.keywordDnaVersionId),
        keywordDnaContentHash: texto((reference as Record<string, unknown>).keywordDnaContentHash),
      },
    };
  });

  /*
   * A PRINCIPAL É ÚNICA, E O RADAR NÃO ESCOLHE OUTRA.
   *
   * Zero ou duas principais é problema estrutural da composição: declarar é a
   * resposta certa; inferir seria assumir uma decisão do Arquiteto.
   */
  const principais = keywords.filter(keyword => keyword.identity.role === "principal");
  if (principais.length === 0) limitations.push("A composição não declara nenhuma keyword principal. O Radar não escolhe uma.");
  if (principais.length > 1) limitations.push(`A composição declara ${principais.length} keywords principais. O Radar não desempata.`);

  if (snapshots.length && keywords.some(keyword => keyword.provenance.textSource === "none")) {
    limitations.push("A hidratação não cobriu todas as referências; as keywords sem texto continuam contadas, com resolução parcial.");
  }

  /* --------------------------- contexto editorial -------------------------- */

  const editorialTopics = [...new Set([
    ...(dna?.requiredTopics || []),
    ...(dna?.coverage || []),
  ].map(item => item.trim()).filter(Boolean))];

  const resolvedKeywordTexts = [...new Set(keywords.flatMap(keyword => keyword.identity.text ? [keyword.identity.text] : []))];

  /* ------------------------------- silo ----------------------------------- */

  const hydrationSilo = item.hydration?.silo || null;
  const silo: RadarResearchSilo | null = hydrationSilo || item.siloId ? {
    siloId: hydrationSilo?.id || item.siloId || null,
    siloName: hydrationSilo?.name || null,
    siloDnaVersionId: hydrationSilo?.siloDnaVersionId || null,
    siloDnaContentHash: hydrationSilo?.siloDnaContentHash || null,
    siloPageId: hydrationSilo?.siloPageId || null,
    siloPageSlug: hydrationSilo?.siloPageSlug || null,
    siloPageCanonical: hydrationSilo?.siloPageCanonical || null,
    siloPagePublicationStatus: hydrationSilo?.siloPagePublicationStatus || null,
    articleRole: hydrationSilo?.articleRole || null,
    hierarchy: item.hierarchy || dna?.hierarchy || null,
  } : null;
  if (!silo) limitations.push("Nenhum contexto de Silo foi resolvido para esta linha.");

  /* -------------------------- SERP de formação ---------------------------- */

  const provenance = item.arquitetoSerpProvenance || null;
  const assessment = item.arquitetoSerpAssessment || null;
  const relations = item.arquitetoKeywordUrlRelations || {};
  const formationSerp: RadarResearchFormationSerp | null = provenance || assessment || Object.keys(relations).length ? {
    assessmentId: provenance?.assessmentId || null,
    formationBaseHash: provenance?.formationBaseHash || null,
    verdict: provenance?.verdict || null,
    humanResolution: provenance?.humanResolution || null,
    keywordUrls: Object.entries(relations).map(([keywordId, relation]) => ({ keywordId, relation })),
    hasAssessment: Boolean(assessment),
  } : null;
  if (!formationSerp) limitations.push("Esta linha não recebeu a SERP de formação do Arquiteto.");

  /* ---------------------------- links internos ---------------------------- */

  const links = item.arquitetoInternalLinks || null;
  const internalLinks: RadarResearchInternalLinks | null = links ? {
    graphId: links.graphId, graphVersionId: links.graphVersionId, graphContentHash: links.graphContentHash,
    edges: links.edges.map(edge => ({ ...edge, anchorConcepts: [...edge.anchorConcepts] })),
  } : null;
  if (!internalLinks) limitations.push("Esta linha não recebeu o grafo de links internos do Arquiteto.");

  const completo = keywords.length > 0
    && keywords.every(keyword => keyword.resolution === "FULL")
    && principais.length === 1
    && Boolean(silo) && Boolean(formationSerp) && Boolean(internalLinks);

  return {
    state: completo ? "COMPLETE" : "PARTIAL",
    article: {
      brandId: item.brandId,
      articleId: item.articleId,
      articleDnaVersionId: item.articleDnaVersionId,
      articleDnaContentHash: texto(item.articleDnaContentHash),
      promise: texto(dna?.promise) || texto(item.title),
      mainIntent: texto(dna?.mainIntent) || texto(item.intent),
      hierarchy: texto(item.hierarchy) || texto(dna?.hierarchy),
      classification: classificacaoTerminal(dna),
    },
    keywords,
    editorialTopics,
    resolvedKeywordTexts,
    silo,
    formationSerp,
    internalLinks,
    limitations,
  };
}

/** As keywords por papel, para o motor não ter que filtrar em cada chamada. */
export const radarKeywordsByRole = (context: RadarArticleResearchContext, role: RadarResearchKeywordIdentity["role"]) =>
  context.keywords.filter(keyword => keyword.identity.role === role);

/**
 * Esta URL já apareceu na formação deste artigo?
 *
 * O Radar não substitui a SERP corrente pela da formação — mas saber que uma
 * página já foi vista, e que alguém já decidiu algo sobre ela, evita
 * redescobrir uma divergência que uma pessoa resolveu.
 */
export function radarFormationKnowsUrl(context: RadarArticleResearchContext, url: string): boolean {
  const alvo = url.trim().toLowerCase();
  if (!alvo || !context.formationSerp) return false;
  return context.formationSerp.keywordUrls.some(item => JSON.stringify(item.relation ?? "").toLowerCase().includes(alvo));
}
