import type { InternalLinkGraphEdge, InternalLinkGraphNode, VersionReference } from "./contracts.ts";
import { isInternalLinkGraphRelationCompatible } from "./internal-link-graph.ts";

/**
 * A SUCESSORA DO GRAFO FALA DA COMPOSIÇÃO ATUAL — NÃO DA APROVADA.
 *
 * A sucessora copiava o grafo aprovado inteiro: nós, versões dos artigos,
 * SiloDNA e SiloPage de base. Quando a fase Artigos tinha gerado versões novas
 * (troca de principal, membro que entrou ou saiu), "processar links" refazia o
 * trabalho sobre a composição ANTIGA, a aprovação gerava uma versão nova que
 * continuava descrevendo as versões anteriores, e o portão do Radar seguia
 * recusando os mesmos artigos. Nenhum deles "ganhava" links.
 *
 * Aqui a base vira a vigente e as arestas são levadas junto só quando ainda
 * fazem sentido: as duas pontas existem e o tipo de relação continua
 * compatível com os papéis atuais (Pilar/Suporte). O resto é descartado com
 * nome; a derivação estrutural recompõe o que faltar e a IA refaz as âncoras.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export type InternalLinkGraphBasis = {
  baseSiloDnaVersionRef: VersionReference;
  baseSiloPageVersionRef: VersionReference;
  participatingArticleDnaVersionRefs: readonly VersionReference[];
};

const versoes = (refs: readonly VersionReference[]) => refs.map(ref => ref.versionId).sort().join("|");

/** A cópia (ou o grafo) descreve exatamente a composição vigente? */
export function internalLinkGraphBasisIsCurrent(copy: InternalLinkGraphBasis, current: InternalLinkGraphBasis): boolean {
  return copy.baseSiloDnaVersionRef.versionId === current.baseSiloDnaVersionRef.versionId
    && copy.baseSiloPageVersionRef.versionId === current.baseSiloPageVersionRef.versionId
    && versoes(copy.participatingArticleDnaVersionRefs) === versoes(current.participatingArticleDnaVersionRefs);
}

export type RebasedInternalLinkGraph = {
  nodes: InternalLinkGraphNode[];
  edges: InternalLinkGraphEdge[];
  /** Arestas que não cabem na composição atual, com o motivo. */
  dropped: { edge: InternalLinkGraphEdge; reason: string }[];
};

export function rebaseInternalLinkGraph(input: {
  previousEdges: readonly InternalLinkGraphEdge[];
  currentNodes: readonly InternalLinkGraphNode[];
}): RebasedInternalLinkGraph {
  const nos = new Map(input.currentNodes.map(node => [node.nodeId, node]));
  const edges: InternalLinkGraphEdge[] = [];
  const dropped: RebasedInternalLinkGraph["dropped"] = [];
  const pares = new Set<string>();
  for (const edge of input.previousEdges) {
    const origem = nos.get(edge.sourceNodeId);
    const destino = nos.get(edge.targetNodeId);
    if (!origem || !destino) {
      dropped.push({ edge, reason: "uma das pontas saiu da composição atual do Silo." });
      continue;
    }
    if (!isInternalLinkGraphRelationCompatible(origem, destino, edge.relationType)) {
      dropped.push({ edge, reason: "o tipo de relação não combina mais com os papéis atuais (Pilar/Suporte)." });
      continue;
    }
    const par = `${edge.sourceNodeId}->${edge.targetNodeId}`;
    if (pares.has(par)) continue;
    pares.add(par);
    edges.push(edge);
  }
  return { nodes: [...input.currentNodes], edges, dropped };
}
