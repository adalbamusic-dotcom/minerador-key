/**
 * A LEITURA HUMANA DO GRAFO — SEM SEGUNDA AUTORIDADE.
 *
 * A homologação chegou a 14 arestas persistidas e ainda assim ninguém
 * conseguia responder as perguntas que importam: qual é o Pilar, quais são os
 * suportes, para onde cada artigo aponta, de onde recebe, por que aquela
 * relação existe. Tudo isso já estava gravado — só não estava projetado.
 *
 * DUAS AUTORIDADES, CADA UMA NA SUA PERGUNTA:
 *
 *   LINK_HIERARCHY_AUTHORITY = SILODNA
 *     Quem é a SiloPage, quem é o Pilar, quem são os Suportes e em que ordem
 *     se lê. Isso foi decidido na fase Silos; a aba Links NÃO reescolhe Pilar.
 *
 *   LINK_TOPOLOGY_AUTHORITY = INTERNAL_LINK_GRAPH
 *     Quem aponta para quem, com que conceito e por quê. Isso é a working copy
 *     remota — e é dela que a lista, o mapa e o painel do Article leem.
 *
 * Este módulo NÃO decide nada: ele lê as duas e organiza. Nenhum papel é
 * recalculado, nenhuma relação é inventada, e nada daqui é gravado dentro do
 * ArticleDNA — a identidade do artigo e a topologia do Silo são artefatos
 * diferentes, e misturá-los faria a fase seguinte ler links de dentro de um
 * DNA que não é dono deles.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import type { InternalLinkGraphEdge, InternalLinkGraphNode, InternalLinkGraphRelationType } from "./contracts.ts";

/* ------------------------------- hierarquia ------------------------------- */

export type SiloHierarchyRole = "SILOPAGE" | "PILAR" | "SUPORTE" | "OUTRO";

export type SiloHierarchyUnit = {
  role: SiloHierarchyRole;
  /** `articleId` ou `siloPageId`. */
  id: string;
  /** Como o grafo chama esta unidade. */
  nodeId: string;
  label: string;
  slug: string | null;
};

export type SiloHierarchyView = {
  siloPage: SiloHierarchyUnit | null;
  pillar: SiloHierarchyUnit | null;
  supports: SiloHierarchyUnit[];
  /** Ordem de leitura declarada pelo SiloDNA. */
  narrativeOrder: string[];
  /** O papel de cada artigo, para a tabela ler sem refazer a conta. */
  roleByArticleId: Map<string, SiloHierarchyRole>;
  /** O que falta para a hierarquia estar completa. Nunca um palpite. */
  issues: string[];
};

export function resolveSiloHierarchyView(input: {
  siloDna: {
    siloId: string;
    name?: string | null;
    centralEntity?: string | null;
    pillarArticleId?: string | null;
    supportArticleIds?: readonly string[];
    articleReferences?: readonly { articleId: string }[];
    narrativeOrder?: readonly string[];
  };
  siloPage: { siloPageId: string; h1?: string | null; slug?: string | null } | null;
  /** Rótulo e endereço de cada artigo, lidos do ArticleDNA canônico. */
  articleIdentity: ReadonlyMap<string, { label: string; slug: string | null }>;
}): SiloHierarchyView {
  const issues: string[] = [];
  const identidade = (articleId: string) =>
    input.articleIdentity.get(articleId) || { label: articleId, slug: null };

  const siloPage: SiloHierarchyUnit | null = input.siloPage
    ? {
      role: "SILOPAGE",
      id: input.siloPage.siloPageId,
      nodeId: `silo-page:${input.siloDna.siloId}`,
      label: input.siloPage.h1?.trim()
        || input.siloDna.name?.trim()
        || input.siloDna.centralEntity?.trim()
        || input.siloDna.siloId,
      slug: input.siloPage.slug ?? null,
    }
    : null;
  if (!siloPage) issues.push("O Silo não tem SiloPage canônica: falta a raiz do universo.");

  const pillarArticleId = input.siloDna.pillarArticleId?.trim() || null;
  const pillar: SiloHierarchyUnit | null = pillarArticleId
    ? { role: "PILAR", id: pillarArticleId, nodeId: `article:${pillarArticleId}`, ...identidade(pillarArticleId) }
    : null;
  if (!pillar) issues.push("O SiloDNA não declara Pilar: a verticalização parte dele, e ele é decisão da fase Silos.");

  const declarados = [...(input.siloDna.supportArticleIds || [])];
  /*
   * A composição do Silo é a de `articleReferences`. Um artigo que está lá e
   * não aparece em `supportArticleIds` nem como Pilar não é escondido: ele
   * entra como OUTRO, e a hierarquia diz que ele existe sem papel declarado.
   */
  const daComposicao = (input.siloDna.articleReferences || []).map(item => item.articleId);
  const semPapel = daComposicao.filter(articleId => articleId !== pillarArticleId && !declarados.includes(articleId));

  const supports: SiloHierarchyUnit[] = declarados.map(articleId => ({
    role: "SUPORTE" as const,
    id: articleId,
    nodeId: `article:${articleId}`,
    ...identidade(articleId),
  }));
  const outros: SiloHierarchyUnit[] = semPapel.map(articleId => ({
    role: "OUTRO" as const,
    id: articleId,
    nodeId: `article:${articleId}`,
    ...identidade(articleId),
  }));
  if (outros.length) {
    issues.push(`${outros.length} artigo(s) da composição sem papel declarado no SiloDNA: ${outros.map(item => item.label).join(", ")}.`);
  }

  const roleByArticleId = new Map<string, SiloHierarchyRole>();
  if (pillarArticleId) roleByArticleId.set(pillarArticleId, "PILAR");
  for (const item of supports) roleByArticleId.set(item.id, "SUPORTE");
  for (const item of outros) roleByArticleId.set(item.id, "OUTRO");

  return {
    siloPage,
    pillar,
    supports: [...supports, ...outros],
    narrativeOrder: [...(input.siloDna.narrativeOrder || [])],
    roleByArticleId,
    issues,
  };
}

/* ------------------------------- classificação ---------------------------- */

export const LINK_RELATION_LABELS: Record<InternalLinkGraphRelationType, string> = {
  SILO_PAGE_TO_ARTICLE: "SiloPage → Article",
  ARTICLE_TO_SILO_PAGE: "Article → SiloPage",
  PILLAR_TO_SUPPORT: "Pilar → Suporte",
  SUPPORT_TO_PILLAR: "Suporte → Pilar",
  SUPPORT_TO_SUPPORT: "Suporte → Suporte",
};

export type LinkRelationTally = {
  byType: { relationType: InternalLinkGraphRelationType; label: string; count: number }[];
  total: number;
  /**
   * Malha entre suportes.
   *
   * Contada à parte porque é a única do conjunto que NÃO é consequência do
   * organograma: suporte só aponta para suporte quando o assunto pede. Um
   * número alto aqui é o primeiro sinal de grafo denso demais.
   */
  supportToSupport: number;
};

export function tallyLinkRelations(edges: readonly InternalLinkGraphEdge[]): LinkRelationTally {
  const ordem: InternalLinkGraphRelationType[] = [
    "SILO_PAGE_TO_ARTICLE", "ARTICLE_TO_SILO_PAGE", "PILLAR_TO_SUPPORT", "SUPPORT_TO_PILLAR", "SUPPORT_TO_SUPPORT",
  ];
  const contagem = new Map<InternalLinkGraphRelationType, number>();
  for (const edge of edges) contagem.set(edge.relationType, (contagem.get(edge.relationType) || 0) + 1);
  return {
    // Todos os tipos aparecem, inclusive com zero: omitir zero esconde que a
    // malha entre suportes não existe, que é informação.
    byType: ordem.map(relationType => ({
      relationType,
      label: LINK_RELATION_LABELS[relationType],
      count: contagem.get(relationType) || 0,
    })),
    total: edges.length,
    supportToSupport: contagem.get("SUPPORT_TO_SUPPORT") || 0,
  };
}

/* --------------------------- a lista auditável ---------------------------- */

export type LinkRelationEndpoint = {
  nodeId: string;
  role: SiloHierarchyRole;
  label: string;
  slug: string | null;
};

export type LinkRelationRow = {
  edgeId: string;
  source: LinkRelationEndpoint;
  target: LinkRelationEndpoint;
  relationType: InternalLinkGraphRelationType;
  relationLabel: string;
  /** O conceito da ligação — não é o texto final da âncora. */
  anchorConcept: string | null;
  anchorConcepts: string[];
  /** Por que esta direção existe, em linguagem de arquitetura. */
  reason: string;
  priority: string;
  origin: string;
};

const roleOfNode = (node: InternalLinkGraphNode | undefined): SiloHierarchyRole => {
  if (!node) return "OUTRO";
  if (node.nodeType === "SILO_PAGE") return "SILOPAGE";
  if (node.architecturalRole === "PILAR") return "PILAR";
  if (node.architecturalRole === "SUPORTE") return "SUPORTE";
  return "OUTRO";
};

export function buildLinkRelationRows(input: {
  nodes: readonly InternalLinkGraphNode[];
  edges: readonly InternalLinkGraphEdge[];
  /** Endereço de cada nó, quando conhecido. O grafo não guarda slug. */
  slugByNodeId?: ReadonlyMap<string, string | null>;
}): LinkRelationRow[] {
  const porId = new Map(input.nodes.map(node => [node.nodeId, node]));
  const ponta = (nodeId: string): LinkRelationEndpoint => {
    const node = porId.get(nodeId);
    return {
      nodeId,
      role: roleOfNode(node),
      label: node?.snapshot.label || nodeId,
      slug: input.slugByNodeId?.get(nodeId) ?? null,
    };
  };
  return input.edges.map(edge => ({
    edgeId: edge.edgeId,
    source: ponta(edge.sourceNodeId),
    target: ponta(edge.targetNodeId),
    relationType: edge.relationType,
    relationLabel: LINK_RELATION_LABELS[edge.relationType],
    anchorConcept: edge.anchorConcepts[0] ?? null,
    anchorConcepts: [...edge.anchorConcepts],
    reason: edge.reason,
    priority: edge.priority,
    origin: edge.origin,
  }));
}

/* ------------------------ o painel de cada Article ------------------------ */

export type ArticleLinkProjection = {
  nodeId: string;
  role: SiloHierarchyRole;
  inboundCount: number;
  outboundCount: number;
  /** Quem aponta para este artigo. */
  inbound: LinkRelationRow[];
  /** Para onde este artigo aponta. */
  outbound: LinkRelationRow[];
};

/**
 * A projeção do Article, lida do GRAFO.
 *
 * Nada disto vira campo de ArticleDNA. O artigo continua sendo identidade e
 * composição; a topologia é do InternalLinkGraph, e gravá-la nos dois lugares
 * criaria duas respostas para "para onde este artigo aponta" — com uma delas
 * envelhecendo em silêncio a cada sucessora do grafo.
 */
export function resolveArticleLinkProjection(input: {
  articleId: string;
  nodes: readonly InternalLinkGraphNode[];
  edges: readonly InternalLinkGraphEdge[];
  slugByNodeId?: ReadonlyMap<string, string | null>;
}): ArticleLinkProjection {
  const nodeId = `article:${input.articleId}`;
  const linhas = buildLinkRelationRows({ nodes: input.nodes, edges: input.edges, slugByNodeId: input.slugByNodeId });
  const inbound = linhas.filter(row => row.target.nodeId === nodeId);
  const outbound = linhas.filter(row => row.source.nodeId === nodeId);
  return {
    nodeId,
    role: roleOfNode(input.nodes.find(node => node.nodeId === nodeId)),
    inboundCount: inbound.length,
    outboundCount: outbound.length,
    inbound,
    outbound,
  };
}

/**
 * §7 — MAPA, LISTA E PAINEL PRECISAM CONTAR A MESMA COISA.
 *
 * Três projeções da mesma working copy não podem divergir. Esta função existe
 * para o teste — e para a tela, se um dia elas divergirem em produção: a
 * resposta é o número da AUTORIDADE, e a divergência é dita, não escondida.
 */
export function linkProjectionsAgree(input: {
  authorityEdgeCount: number;
  mapEdgeCount: number;
  listEdgeCount: number;
}): { agree: boolean; detail: string } {
  const agree = input.authorityEdgeCount === input.mapEdgeCount
    && input.authorityEdgeCount === input.listEdgeCount;
  return {
    agree,
    detail: agree
      ? `Mapa, lista e working copy contam ${input.authorityEdgeCount} relação(ões).`
      : `Divergência de projeção: working copy ${input.authorityEdgeCount} · mapa ${input.mapEdgeCount} · lista ${input.listEdgeCount}.`,
  };
}
