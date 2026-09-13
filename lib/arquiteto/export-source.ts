/**
 * A FONTE DAS DUAS EXPORTAÇÕES — read-models canônicos, nunca o HTML da mesa.
 *
 * O backup restaurável e o export editorial leem os MESMOS artefatos:
 * SiloDNA/SiloPage, ArticleDNA e InternalLinkGraph. O que muda é a finalidade,
 * não a fonte — e é por isso que os dois compartilham este módulo em vez de
 * cada um reconstruir a leitura do seu jeito.
 *
 * Somente leitura. Nada aqui persiste, chama provider ou cria versão.
 */

import type {
  ArticleDNA,
  InternalLinkGraph,
  InternalLinkGraphEdge,
  InternalLinkGraphNode,
  InternalLinkGraphWorkingCopy,
  SiloDNA,
  SiloPage,
  VersionEnvelope,
} from "./contracts.ts";
import { resolveSiloHierarchyView, type SiloHierarchyRole } from "./internal-link-projection.ts";

export type ArquitetoExportGraphSource = "working_copy" | "approved";
export type ArquitetoExportGraph = { source: ArquitetoExportGraphSource; graph: InternalLinkGraph | InternalLinkGraphWorkingCopy };

export type ArquitetoExportTerritory = {
  lifecycleStatus: string | null;
  state: string | null;
  consolidated: boolean;
};

export type ArquitetoExportSilo = {
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage> | null;
  territory?: ArquitetoExportTerritory | null;
  /** O grafo que a aba Links mostraria: working copy antes da aprovada. */
  graph?: ArquitetoExportGraph | null;
  /** A versão aprovada, preservada mesmo quando existe cópia em edição. */
  approvedGraph?: InternalLinkGraph | null;
};

export type ArquitetoExportArticleReadModel = {
  serpVerdict?: string | null;
  serpImpact?: string | null;
  kgrDecision?: string | null;
  kgrDecisionSource?: string | null;
  kgrApplicability?: string | null;
  intent?: string | null;
  funnel?: string | null;
};

export type ArquitetoExportInput = {
  brandId: string;
  /** Nome da Brand; usado no nome do arquivo e no cabeçalho do backup. */
  brandLabel?: string | null;
  silos: readonly ArquitetoExportSilo[];
  articles: readonly VersionEnvelope<ArticleDNA>[];
  /** Revisões arquiteturais de IA vigentes, para o backup não perdê-las. */
  aiReviews?: readonly VersionEnvelope<Record<string, unknown>>[];
  /*
   * O ESTADO OPERACIONAL DA MESA — só o backup consome.
   *
   * Território, working copy de Silo, pareceres de SERP, proposta de IA,
   * marcadores e membership de keyword não são "extras": sem eles o
   * read-model pós-restauração não é equivalente ao anterior, e a mesa
   * voltaria vazia com os artefatos certos. O export editorial os ignora.
   */
  territories?: readonly { territoryRef: string; territory: Record<string, unknown> }[];
  siloWorkingCopies?: readonly { workingCopyRef: string; workingCopy: Record<string, unknown> }[];
  territorialSerp?: readonly { questionId: string; payload: Record<string, unknown> }[];
  articleFormationSerp?: readonly { candidateRef: string; payload: Record<string, unknown> }[];
  territorialAi?: readonly { questionId: string; payload: Record<string, unknown> }[];
  architectureMarker?: Record<string, unknown> | null;
  articleFormationMarker?: Record<string, unknown> | null;
  keywordAssignments?: readonly { keywordId: string; payload: Record<string, unknown> }[];
  keywordLabelById?: ReadonlyMap<string, string>;
  versionStatusOf?: (versionId: string) => string | null;
  workflowStatusOf?: (articleId: string) => string | null;
  articleReadModelOf?: (articleId: string) => ArquitetoExportArticleReadModel | null;
  now?: Date;
};

export class ArquitetoExportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ArquitetoExportError";
    this.code = code;
  }
}

/* -------------------------------- leitura -------------------------------- */

export type KeywordReference = ArticleDNA["keywordReferences"][number];

export function principalReference(article: ArticleDNA): KeywordReference | null {
  return article.keywordReferences.find(reference => reference.keywordId === article.principalKeywordId) ?? null;
}

export function snapshotKeyword(reference: KeywordReference | null | undefined): string | null {
  const keyword = reference?.keywordDnaSnapshot?.sourceKeywordSnapshot?.keyword;
  return typeof keyword === "string" && keyword.trim() ? keyword.trim() : null;
}

/** Rótulo humano do artigo: keyword da Principal, depois catálogo, depois slug. */
export function articleExportLabel(version: VersionEnvelope<ArticleDNA>, keywordLabelById?: ReadonlyMap<string, string>): string {
  const article = version.payload;
  return snapshotKeyword(principalReference(article))
    || keywordLabelById?.get(article.principalKeywordId)
    || article.suggestedSlug
    || article.articleId;
}

export function keywordLabel(reference: KeywordReference, keywordLabelById?: ReadonlyMap<string, string>): string {
  return snapshotKeyword(reference) || keywordLabelById?.get(reference.keywordId) || reference.keywordId;
}

export function keywordMetric(reference: KeywordReference | null, field: "volume" | "resultCount" | "kgrScore"): number | null {
  if (!reference) return null;
  const direct = reference[field];
  if (typeof direct === "number") return direct;
  const snapshot = reference.keywordDnaSnapshot?.payload;
  const fromSnapshot = field === "volume" ? snapshot?.volumeSearch : field === "resultCount" ? snapshot?.resultCount : snapshot?.kgrScore;
  return typeof fromSnapshot === "number" ? fromSnapshot : null;
}

export function siloLabel(silo: ArquitetoExportSilo): string {
  return silo.siloDna.payload.name?.trim()
    || silo.siloPage?.payload.h1?.trim()
    || silo.siloDna.payload.centralEntity?.trim()
    || silo.siloDna.payload.siloId;
}

/**
 * A hierarquia do Silo, lida do SiloDNA canônico.
 *
 * LINK_HIERARCHY_AUTHORITY = SILODNA: quem é Pilar e quem é Suporte foi
 * decidido na fase Silos. A exportação projeta essa decisão e nunca a refaz.
 */
export function hierarchyFor(
  silo: ArquitetoExportSilo,
  articles: ReadonlyMap<string, VersionEnvelope<ArticleDNA>>,
  keywordLabelById?: ReadonlyMap<string, string>,
) {
  const identity = new Map((silo.siloDna.payload.articleReferences || []).map(reference => {
    const version = articles.get(reference.articleId);
    return [reference.articleId, {
      label: version ? articleExportLabel(version, keywordLabelById) : reference.articleId,
      slug: version?.payload.suggestedSlug ?? null,
    }] as const;
  }));
  return resolveSiloHierarchyView({
    siloDna: silo.siloDna.payload,
    siloPage: silo.siloPage ? silo.siloPage.payload : null,
    articleIdentity: identity,
  });
}

export type GraphFacts = {
  source: string;
  graphId: string;
  version: number | string;
  versionId: string;
  hash: string;
  status: string;
  base: string;
  previous: string;
  edges: readonly InternalLinkGraphEdge[];
  nodes: readonly InternalLinkGraphNode[];
};

export function graphFacts(entry: ArquitetoExportGraph | null | undefined): GraphFacts {
  if (!entry) {
    return { source: "", graphId: "", version: "", versionId: "", hash: "", status: "", base: "", previous: "", edges: [], nodes: [] };
  }
  const graph = entry.graph;
  if ("graphVersionId" in graph) {
    return {
      source: entry.source,
      graphId: graph.graphId,
      version: graph.versionNumber,
      versionId: graph.graphVersionId,
      hash: graph.contentHash,
      status: graph.workflowStatus,
      base: graph.basisHash,
      previous: graph.previousVersionId ?? "",
      edges: graph.edges,
      nodes: graph.nodes,
    };
  }
  return {
    source: entry.source,
    graphId: graph.graphId,
    version: graph.lockVersion,
    versionId: graph.workingCopyId,
    hash: graph.contentHash,
    status: "working_copy",
    base: graph.basisHash,
    previous: graph.baseGraphVersionId ?? "",
    edges: graph.edges,
    nodes: graph.nodes,
  };
}

export type SiloRoleOf = (article: ArticleDNA) => { siloId: string; role: SiloHierarchyRole | "" };

/** O papel de cada Article no seu Silo, sempre a partir do SiloDNA. */
export function buildSiloRoleResolver(
  silos: readonly ArquitetoExportSilo[],
  articlesById: ReadonlyMap<string, VersionEnvelope<ArticleDNA>>,
  keywordLabelById?: ReadonlyMap<string, string>,
): SiloRoleOf {
  const roleBySilo = new Map(silos.map(silo => [silo.siloDna.payload.siloId, hierarchyFor(silo, articlesById, keywordLabelById).roleByArticleId]));
  return article => {
    const declared = article.siloId ? roleBySilo.get(article.siloId) : undefined;
    if (article.siloId && declared) return { siloId: article.siloId, role: declared.get(article.articleId) ?? "" };
    for (const [siloId, roles] of roleBySilo) {
      const role = roles.get(article.articleId);
      if (role) return { siloId, role };
    }
    return { siloId: article.siloId ?? "", role: "" };
  };
}
