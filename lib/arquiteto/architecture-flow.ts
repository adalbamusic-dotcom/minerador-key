/**
 * PROJEÇÃO DO MAPA DE ARQUITETURA — um Silo no centro, keywords ao redor.
 *
 * Cada grupo da análise vira um conjunto visual independente:
 *
 *                      KW
 *                       \
 *                KW — [SILO] — KW
 *                      /   \
 *                    KW     KW
 *
 * Quando o grupo ainda NÃO tem destino de Silo, o centro é `[CLUSTER]`. Essa é
 * a distinção que o mapa precisa carregar: cluster é hipótese analítica, Silo é
 * decisão arquitetural. Desenhar `[SILO] Vitamina C` antes da decisão humana
 * anunciaria uma entidade que não existe.
 *
 * Quando o destino JÁ foi resolvido, não há nó de cluster entre o Silo e as
 * keywords: o próprio agrupamento visual é o cluster.
 *
 * O mapa é PROJEÇÃO. Nada aqui é persistido — nem posição, nem aresta, nem
 * zoom. Domínio puro: sem React, sem storage, sem UI.
 */

import type { ArchitectureAnalysis, ClusterAnalysis } from "./architecture-analysis.ts";

export type ArchitectureFlowNodeKind = "silo_site" | "silo_manual" | "cluster" | "keyword";

export type ArchitectureFlowNode = {
  id: string;
  kind: ArchitectureFlowNodeKind;
  label: string;
  /** Linha secundária curta: slug, estado ou volume. Nunca o DNA inteiro. */
  meta: string | null;
  position: { x: number; y: number };
  /** Grupo a que este nó pertence; sustenta a sincronia com o painel. */
  clusterRef: string;
  /** Só em nós de keyword. */
  keywordId: string | null;
};

export type ArchitectureFlowEdge = {
  id: string;
  source: string;
  target: string;
  /** Sugestão da análise (tracejada) vs. membership já confirmada (sólida). */
  relation: "suggested" | "confirmed";
};

export type ArchitectureFlowProjection = {
  nodes: ArchitectureFlowNode[];
  edges: ArchitectureFlowEdge[];
  /** Keywords não desenhadas por limite visual, por grupo. */
  hiddenByCluster: Record<string, number>;
};

/** Grade de grupos e órbita das keywords. Layout, não autoridade. */
const CELL_WIDTH = 420;
const CELL_HEIGHT = 360;
const COLUMNS = 3;
const ORBIT_X = 150;
const ORBIT_Y = 110;
/** Acima disso o grupo mostra "+ N keywords" em vez de virar hairball. */
const MAX_VISIBLE_KEYWORDS = 8;

const centerKindOf = (cluster: ClusterAnalysis, publishedRefs: ReadonlySet<string>): ArchitectureFlowNodeKind => {
  // Sem destino resolvido, o centro é o grupo analítico — nunca um Silo.
  if (cluster.destination !== "strengthen_existing_silo" || !cluster.suggestedTerritoryRef) return "cluster";
  return publishedRefs.has(cluster.suggestedTerritoryRef) ? "silo_site" : "silo_manual";
};

const centerMetaOf = (cluster: ClusterAnalysis, slug: string | null, kind: ArchitectureFlowNodeKind) => {
  if (kind === "cluster") {
    return cluster.destination === "new_silo_candidate"
      ? "Destino sugerido: novo Silo"
      : cluster.destination === "ambiguous"
        ? "Dois destinos plausíveis"
        : "Sem profundidade para Silo";
  }
  const procedencia = kind === "silo_site" ? "Publicado" : "Proposto";
  return slug ? `${slug} · ${procedencia}` : procedencia;
};

/**
 * Monta o mapa a partir da análise vigente.
 *
 * A relação vem da ANÁLISE, não da membership: antes da confirmação a maioria
 * das keywords ainda não tem vínculo persistido, e o mapa precisa mostrar o
 * destino sugerido. Depois da confirmação, a mesma aresta passa a sólida.
 */
export function buildArchitectureFlowProjection(input: {
  analysis: ArchitectureAnalysis;
  /** Texto por keywordId; o nó mostra a keyword, não o identificador. */
  keywordTexts: ReadonlyMap<string, string>;
  /** Nome e slug por territoryRef, para o nó central. */
  territoryLabels: ReadonlyMap<string, { label: string; slug: string | null }>;
  /** Territórios com página publicada — muda o badge do centro. */
  publishedTerritoryRefs: ReadonlySet<string>;
  /** Membership já confirmada: `keywordId → territoryRef`. */
  confirmedMembership?: ReadonlyMap<string, string>;
  /** Grupos expandidos; fora deles vale o limite visual. */
  expandedClusterRefs?: ReadonlySet<string>;
}): ArchitectureFlowProjection {
  const nodes: ArchitectureFlowNode[] = [];
  const edges: ArchitectureFlowEdge[] = [];
  const hiddenByCluster: Record<string, number> = {};

  // Dois grupos que vão para o MESMO Silo compartilham o centro: o Silo é um
  // só, e duplicá-lo criaria dois nós com a mesma identidade. As keywords dos
  // dois grupos orbitam o mesmo centro, e nenhuma some.
  const centerSlot = new Map<string, number>();
  let nextSlot = 0;

  input.analysis.clusters.forEach(cluster => {
    const kindPrevia = centerKindOf(cluster, input.publishedTerritoryRefs);
    const centerKey = kindPrevia === "cluster" ? `cluster:${cluster.clusterRef}` : `silo:${cluster.suggestedTerritoryRef}`;
    if (!centerSlot.has(centerKey)) centerSlot.set(centerKey, nextSlot++);
    const index = centerSlot.get(centerKey)!;
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const centerX = column * CELL_WIDTH + CELL_WIDTH / 2;
    const centerY = row * CELL_HEIGHT + CELL_HEIGHT / 2;

    const kind = centerKindOf(cluster, input.publishedTerritoryRefs);
    const territory = cluster.suggestedTerritoryRef ? input.territoryLabels.get(cluster.suggestedTerritoryRef) ?? null : null;
    const centerId = kind === "cluster" ? `cluster:${cluster.clusterRef}` : `silo:${cluster.suggestedTerritoryRef}`;

    if (!nodes.some(node => node.id === centerId)) nodes.push({
      id: centerId,
      kind,
      label: kind === "cluster" ? cluster.label : territory?.label || cluster.label,
      meta: centerMetaOf(cluster, territory?.slug ?? null, kind),
      position: { x: centerX, y: centerY },
      clusterRef: cluster.clusterRef,
      keywordId: null,
    });

    const expandido = input.expandedClusterRefs?.has(cluster.clusterRef) ?? false;
    const visiveis = expandido ? cluster.memberKeywordIds : cluster.memberKeywordIds.slice(0, MAX_VISIBLE_KEYWORDS);
    const escondidas = cluster.memberKeywordIds.length - visiveis.length;
    if (escondidas > 0) hiddenByCluster[cluster.clusterRef] = escondidas;

    // Órbita: as keywords cercam o centro em vez de empilharem numa coluna.
    const jaOrbitando = nodes.filter(node => node.kind === "keyword" && edges.some(edge => edge.source === node.id && edge.target === centerId)).length;
    visiveis.forEach((keywordId, orbitIndex) => {
      const total = visiveis.length + jaOrbitando;
      const angle = ((orbitIndex + jaOrbitando) / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
      const nodeId = `kw:${cluster.clusterRef}:${keywordId}`;
      nodes.push({
        id: nodeId,
        kind: "keyword",
        label: input.keywordTexts.get(keywordId) || keywordId,
        meta: cluster.headKeywordId === keywordId ? "cabeceira provável" : null,
        position: {
          x: Math.round(centerX + Math.cos(angle) * ORBIT_X),
          y: Math.round(centerY + Math.sin(angle) * ORBIT_Y),
        },
        clusterRef: cluster.clusterRef,
        keywordId,
      });
      const confirmada = Boolean(
        cluster.suggestedTerritoryRef
        && input.confirmedMembership?.get(keywordId) === cluster.suggestedTerritoryRef,
      );
      edges.push({
        id: `edge:${nodeId}`,
        source: nodeId,
        target: centerId,
        relation: confirmada ? "confirmed" : "suggested",
      });
    });
  });

  return { nodes, edges, hiddenByCluster };
}

/** Grupo dono de um nó do mapa — é o que sincroniza mapa e painel. */
export function clusterRefOfFlowNode(
  projection: ArchitectureFlowProjection,
  nodeId: string | null,
): string | null {
  if (!nodeId) return null;
  return projection.nodes.find(node => node.id === nodeId)?.clusterRef ?? null;
}

/**
 * Confere que nenhuma keyword analisada sumiu do mapa.
 *
 * Some por limite visual é aceitável — e aí aparece como "+ N keywords".
 * Sumir sem contagem não é.
 */
export function accountedKeywords(input: {
  analysis: ArchitectureAnalysis;
  projection: ArchitectureFlowProjection;
}): { analyzed: number; drawn: number; hidden: number; missing: number } {
  const analyzed = input.analysis.clusters.reduce((total, cluster) => total + cluster.memberKeywordIds.length, 0);
  const drawn = input.projection.nodes.filter(node => node.kind === "keyword").length;
  const hidden = Object.values(input.projection.hiddenByCluster).reduce((total, value) => total + value, 0);
  return { analyzed, drawn, hidden, missing: analyzed - drawn - hidden };
}
