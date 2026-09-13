import type { VersionReference } from "./contracts.ts";

/**
 * O GRAFO APROVADO DESCREVE UMA COMPOSIÇÃO — E ELA PODE TER MUDADO.
 *
 * Cada nó do InternalLinkGraph guarda a referência exata do ArticleDNA que
 * participou dele: entidade, versão e hash. Quando a fase Artigos gera uma
 * sucessora, o grafo aprovado continua íntegro, mas passa a falar de uma
 * composição anterior — âncoras podem apontar para uma keyword que saiu, e a
 * relação pode ter sido desenhada sobre um recorte que não existe mais.
 *
 * O grafo histórico NÃO é reescrito nem invalidado: ele permanece como o que
 * foi aprovado, sobre o que existia então. O que muda é a leitura da fase, que
 * passa a dizer que há revisão pendente — e o handoff ao Radar, que já compara
 * `articleDnaVersionRef.versionId` e por isso recusa a base nova sozinho.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export type StaleGraphArticle = {
  entityId: string;
  label: string;
  /** Versão que o grafo aprovado descreve. */
  approvedVersionId: string;
  /** Versão vigente do artigo; `null` quando ele saiu do acervo. */
  currentVersionId: string | null;
};

export type ApprovedGraphStaleness = {
  stale: boolean;
  staleArticles: StaleGraphArticle[];
  /** Frase pronta para a tela; `null` quando não há defasagem. */
  reason: string | null;
};

type GraphNodeLike = {
  articleDnaVersionRef?: VersionReference | null;
  /** O nó pode não ter rótulo; a identidade da entidade o substitui. */
  snapshot: { label: string | null };
};

/**
 * O grafo aprovado ainda descreve os artigos vigentes?
 *
 * A comparação é por VERSÃO, não por conteúdo: duas versões com o mesmo texto
 * ainda são decisões diferentes, e é a identidade da versão que o handoff
 * exige. Artigo sumido do acervo conta como defasagem — não como ausência de
 * problema.
 */
export function resolveApprovedGraphStaleness(input: {
  graph: { versionNumber: number; nodes: readonly GraphNodeLike[] } | null | undefined;
  currentArticleVersionByEntityId: ReadonlyMap<string, { versionId: string }>;
}): ApprovedGraphStaleness {
  if (!input.graph) return { stale: false, staleArticles: [], reason: null };

  const staleArticles: StaleGraphArticle[] = [];
  const vistos = new Set<string>();

  for (const node of input.graph.nodes) {
    const referencia = node.articleDnaVersionRef;
    if (!referencia || vistos.has(referencia.entityId)) continue;
    vistos.add(referencia.entityId);

    const vigente = input.currentArticleVersionByEntityId.get(referencia.entityId);
    if (vigente && vigente.versionId === referencia.versionId) continue;

    staleArticles.push({
      entityId: referencia.entityId,
      // Sem rótulo o artigo ainda precisa ser localizável na tela.
      label: node.snapshot.label || referencia.entityId,
      approvedVersionId: referencia.versionId,
      currentVersionId: vigente?.versionId ?? null,
    });
  }

  if (!staleArticles.length) return { stale: false, staleArticles: [], reason: null };

  const nomes = staleArticles.map(item => item.label).join(", ");
  return {
    stale: true,
    staleArticles,
    reason: `O grafo aprovado v${input.graph.versionNumber} descreve versões anteriores de ${staleArticles.length} artigo(s): ${nomes}. `
      + "O grafo aprovado é preservado; processe uma sucessora para revisar as relações e âncoras sobre a composição atual. "
      + "Enquanto isso, estes artigos não passam no gate de envio ao Radar.",
  };
}
