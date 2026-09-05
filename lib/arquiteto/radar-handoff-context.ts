/**
 * O CONTEXTO QUE VIAJA COM O ARTICLE ATÉ O RADAR.
 *
 * O Radar investiga uma arquitetura deliberada. Para isso ele precisa receber a
 * arquitetura, não só o artigo: a que Silo ele pertence, qual é a página-raiz
 * desse Silo, que relações internas foram aprovadas e com quais conceitos de
 * âncora, e o que a SERP da formação já disse.
 *
 * O `siloId` canônico é RESOLVIDO aqui, não lido do ArticleDNA.
 *
 * O ArticleDNA declara `territoryRef` desde a formação; o SiloDNA consolidado
 * declara o mesmo `territoryRef`. O vínculo existe — o que faltava era alguém
 * segui-lo. Preencher `siloId` no ArticleDNA resolveria em uma linha e estaria
 * errado: sucessão de artefato é decisão editorial, e o handoff não decide nada
 * sobre o Article. Ele hidrata.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

import type {
  ArticleDNA,
  InternalLinkGraph,
  InternalLinkGraphEdge,
  SiloDNA,
  SiloPage,
  VersionEnvelope,
} from "./contracts.ts";
import { resolveCanonicalSiloIdForTerritory } from "./article-silo-materialization.ts";

export type ResolvedSiloContext = {
  siloId: string;
  siloName: string | null;
  territoryRef: string;
  siloDnaVersionId: string;
  siloDnaContentHash: string;
  siloPageId: string | null;
  siloPageVersionId: string | null;
  siloPageSlug: string | null;
  siloPageCanonical: string | null;
  siloPagePublicationStatus: string | null;
  /** O papel do Article dentro do Silo, lido do SiloDNA consolidado. */
  articleRole: "pillar" | "support";
  /**
   * COMO o Silo foi resolvido — e por isso nunca é silencioso.
   *
   * `DECLARED`: o ArticleDNA trouxe `siloId` materializado. É o contrato.
   * `LEGACY_TERRITORY_HYDRATION`: o artefato não trouxe, e o pai foi lido
   * pelo território. Continua sendo LEITURA — nada é gravado de volta no
   * artefato —, mas fica contável: sem este campo, um lote inteiro rodando
   * pelo caminho legado passava por contrato cumprido, e a dívida ficava
   * invisível justamente para quem precisa decidir quitá-la.
   */
  siloIdProvenance: "DECLARED" | "LEGACY_TERRITORY_HYDRATION";
};

export type SiloResolution =
  | { ok: true; context: ResolvedSiloContext }
  | { ok: false; reason: string };

/**
 * O Silo canônico deste Article.
 *
 * A correspondência é 1:1 por `territoryRef`. Zero Silos e mais de um Silo são
 * ambos recusa: escolher "o mais parecido" por nome ou slug faria o Radar
 * investigar uma arquitetura que ninguém montou.
 */
export function resolveCanonicalSiloForArticle(input: {
  article: ArticleDNA;
  siloVersions: readonly VersionEnvelope<SiloDNA>[];
  siloPageVersions: readonly VersionEnvelope<SiloPage>[];
}): SiloResolution {
  const declarado = typeof input.article.siloId === "string" && input.article.siloId.trim()
    ? input.article.siloId
    : null;

  // 1 · o que o próprio artigo declara, se apontar para Silo canônico vigente.
  const porDeclaracao = declarado
    ? input.siloVersions.find(version => version.payload.siloId === declarado) || null
    : null;

  /*
   * 2 · senão, pelo território — HIDRATAÇÃO DE LEGADO, não contrato.
   *
   * A partir do fechamento da fase Artigos o `siloId` chega materializado no
   * próprio artefato, e o caminho (1) resolve. Este ramo continua existindo
   * para os ArticleDNA emitidos ANTES desse contrato, que declaram território
   * e não declaram Silo. Ele lê, não conserta: quem completa o artefato é a
   * sucessora criada na fase Artigos, nunca o consumidor a jusante.
   *
   * A correspondência 1:1 é resolvida pela autoridade única do território —
   * refazer o `find` aqui era a segunda leitura da mesma pergunta.
   */
  const territoryRef = input.article.territoryRef || null;
  const binding = resolveCanonicalSiloIdForTerritory({ territoryRef, siloVersions: input.siloVersions });

  if (!porDeclaracao && binding.state === "NO_TERRITORY") {
    return { ok: false, reason: "O artigo não declara Silo nem território: não há pai canônico a resolver." };
  }
  if (!porDeclaracao && binding.state !== "BOUND") {
    return { ok: false, reason: binding.reason };
  }

  const silo = porDeclaracao
    || input.siloVersions.find(version => binding.state === "BOUND" && version.payload.siloId === binding.siloId)!;
  const pagina = input.siloPageVersions.find(version => version.payload.siloId === silo.payload.siloId) || null;

  return {
    ok: true,
    context: {
      siloId: silo.payload.siloId,
      siloName: silo.payload.name ?? null,
      territoryRef: silo.payload.territoryRef || territoryRef || "",
      siloDnaVersionId: silo.versionId,
      siloDnaContentHash: silo.contentHash,
      siloPageId: pagina?.payload.siloPageId ?? null,
      siloPageVersionId: pagina?.versionId ?? null,
      siloPageSlug: pagina?.payload.slug ?? null,
      siloPageCanonical: pagina?.payload.canonical ?? null,
      siloPagePublicationStatus: pagina?.payload.publicationStatus ?? null,
      articleRole: silo.payload.pillarArticleId === input.article.articleId ? "pillar" : "support",
      siloIdProvenance: porDeclaracao ? "DECLARED" : "LEGACY_TERRITORY_HYDRATION",
    },
  };
}

/* ------------------------- as relações deste Article ---------------------- */

export type ArticleInternalLinks = {
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
    /** O Article é a origem ou o destino desta relação? */
    direction: "outbound" | "inbound";
  }>;
};

/**
 * O grafo aprovado que descreve ESTE Silo, nesta versão.
 *
 * Grafo proposto, de outro Silo ou construído sobre outra versão do par
 * SiloDNA/SiloPage não serve: ele descreveria uma arquitetura que não é a que
 * está sendo entregue, e o Radar não teria como saber disso.
 */
export function findApprovedGraphForSilo(input: {
  silo: ResolvedSiloContext;
  graphs: readonly InternalLinkGraph[];
}): InternalLinkGraph | null {
  return input.graphs.find(graph =>
    graph.workflowStatus === "approved"
    && graph.siloId === input.silo.siloId
    && graph.baseSiloDnaVersionRef?.versionId === input.silo.siloDnaVersionId
    && (!input.silo.siloPageVersionId || graph.baseSiloPageVersionRef?.versionId === input.silo.siloPageVersionId)) || null;
}

/**
 * Só as relações que envolvem este Article.
 *
 * Mandar o grafo inteiro para cada item faria N cópias da mesma coisa e
 * obrigaria o Radar a filtrar o que o Arquiteto já sabe. A referência do grafo
 * viaja junto para rastreabilidade — quem quiser o todo vai à fonte.
 */
export function relevantEdgesForArticle(input: {
  graph: InternalLinkGraph | null;
  articleDnaVersionId: string;
}): ArticleInternalLinks | null {
  const graph = input.graph;
  if (!graph) return null;

  const meus = new Set(graph.nodes
    .filter(node => node.articleDnaVersionRef?.versionId === input.articleDnaVersionId)
    .map(node => node.nodeId));
  if (!meus.size) return null;

  const relevantes = graph.edges.filter(edge => meus.has(edge.sourceNodeId) || meus.has(edge.targetNodeId));
  return {
    graphId: graph.graphId,
    graphVersionId: graph.graphVersionId,
    graphContentHash: graph.contentHash,
    edges: relevantes.map((edge: InternalLinkGraphEdge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      relationType: edge.relationType,
      anchorConcepts: [...edge.anchorConcepts],
      reason: edge.reason,
      priority: edge.priority,
      direction: meus.has(edge.sourceNodeId) ? "outbound" : "inbound",
    })),
  };
}

/**
 * A evidência de links continua descrevendo este Article?
 *
 * Uma sucessora do ArticleDNA ou uma nova versão do grafo não invalidam o que
 * foi pesquisado — mas também não herdam. Tratar o contexto antigo como atual é
 * a mesma classe de erro que tratar SERP de outra composição como vigente.
 */
export function radarLinkContextIsStale(input: {
  carried: { articleDnaVersionId: string; articleDnaContentHash: string | null; graphVersionId: string | null };
  current: { articleDnaVersionId: string; articleDnaContentHash: string | null; graphVersionId: string | null };
}): boolean {
  if (input.carried.articleDnaVersionId !== input.current.articleDnaVersionId) return true;
  if (input.carried.articleDnaContentHash && input.current.articleDnaContentHash
    && input.carried.articleDnaContentHash !== input.current.articleDnaContentHash) return true;
  if (input.carried.graphVersionId !== input.current.graphVersionId) return true;
  return false;
}

/* --------------------- o builder único do handoff ------------------------ */

export type RadarHandoffContextEntry = {
  articleId: string;
  label: string;
  silo: ResolvedSiloContext;
  internalLinks: ArticleInternalLinks | null;
};

export type RadarHandoffBlocked = {
  articleId: string;
  label: string;
  reasons: string[];
};

/**
 * A ÚNICA autoridade que resolve o contexto de handoff de um lote.
 *
 * Três telas precisavam da mesma resposta — o Arquiteto ao enviar, o Radar ao
 * importar e o servidor ao gravar — e cada uma resolvia por conta própria.
 * Duas nem resolviam: caíam em `payload.siloId`, que é `null` por desenho, e
 * descartavam o artigo em silêncio.
 *
 * Quem não passa NÃO some: volta em `blocked`, com o motivo em português. "0
 * enviados · 8 ignorados" é a pior saída possível, porque não diz o que fazer.
 */
export function buildRadarHandoffContexts(input: {
  articles: readonly VersionEnvelope<ArticleDNA>[];
  siloVersions: readonly VersionEnvelope<SiloDNA>[];
  siloPageVersions: readonly VersionEnvelope<SiloPage>[];
  graphs: readonly InternalLinkGraph[];
  /** Rótulo legível por artigo; sem ele o motivo mostraria identificador cru. */
  labels?: ReadonlyMap<string, string>;
  /** Exige SiloPage consolidada além do SiloDNA. */
  requireSiloPage?: boolean;
  /** Exige grafo de links aprovado cobrindo o artigo. */
  requireApprovedGraph?: boolean;
}): { eligible: RadarHandoffContextEntry[]; blocked: RadarHandoffBlocked[] } {
  const eligible: RadarHandoffContextEntry[] = [];
  const blocked: RadarHandoffBlocked[] = [];

  for (const article of input.articles) {
    const articleId = article.payload.articleId;
    const label = input.labels?.get(articleId) || article.payload.promise || articleId;
    const reasons: string[] = [];

    const resolucao = resolveCanonicalSiloForArticle({
      article: article.payload,
      siloVersions: input.siloVersions,
      siloPageVersions: input.siloPageVersions,
    });
    if (!resolucao.ok) {
      blocked.push({ articleId, label, reasons: [resolucao.reason] });
      continue;
    }

    const silo = resolucao.context;
    if (input.requireSiloPage && !silo.siloPageVersionId) {
      reasons.push("O Silo não tem SiloPage canônica: falta consolidar o par.");
    }

    const grafo = findApprovedGraphForSilo({ silo, graphs: input.graphs });
    const internalLinks = relevantEdgesForArticle({ graph: grafo, articleDnaVersionId: article.versionId });
    if (input.requireApprovedGraph && !internalLinks) {
      reasons.push(grafo
        ? "O grafo aprovado deste Silo não cobre esta versão do ArticleDNA."
        : "Não há InternalLinkGraph aprovado para este Silo nesta versão do par.");
    }

    if (reasons.length) { blocked.push({ articleId, label, reasons }); continue; }
    eligible.push({ articleId, label, silo, internalLinks });
  }

  return { eligible, blocked };
}

/**
 * Quais artigos do lote foram resolvidos pelo caminho LEGADO.
 *
 * §5 proíbe o handoff consertar o artefato, e ele não conserta — a resolução
 * por território é leitura. O que faltava era tornar essa leitura contável:
 * enquanto o número não aparece, um lote inteiro rodando pelo caminho legado
 * é indistinguível de um lote em conformidade, e ninguém sabe que há dívida.
 *
 * Quem quita é a sucessora criada no fechamento da fase Artigos, que
 * materializa `siloId` no próprio ArticleDNA. Depois disso esta lista fica
 * vazia para artefatos novos, e o que sobra é legado de verdade.
 */
export const legacyHydratedHandoffArticleIds = (
  entries: readonly RadarHandoffContextEntry[],
): string[] => entries
  .filter(entry => entry.silo.siloIdProvenance === "LEGACY_TERRITORY_HYDRATION")
  .map(entry => entry.articleId)
  .sort();
