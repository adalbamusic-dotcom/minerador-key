import type { ArticleSiloView, ArticleViewNode } from "./article-silo-view.ts";

/**
 * MAPA DA ABA ARTIGOS: SiloPage → Article → Keyword.
 *
 * Cada SiloPage é um cluster visual FECHADO. Misturar Articles de Silos
 * diferentes num mesmo grupo desfaria justamente a hierarquia que este corte
 * existe para tornar visível.
 *
 * O mapa é PROJEÇÃO. Posição, zoom, arrasto e seleção não são autoridade e
 * não entram em hash nenhum — a composição vem do read-model, e mover um nó
 * na tela não move keyword nenhuma.
 *
 * O nó carrega o mínimo para reconhecer o assunto: nome, papel e quantidade.
 * Despejar o DNA inteiro faria o mapa competir com o painel em vez de guiar
 * até ele.
 *
 * Domínio puro: sem storage, sem fetch, sem React.
 */

export type ArticleFlowNodeKind = "silo_page" | "article" | "candidate" | "published" | "keyword";

export type ArticleFlowNode = {
  id: string;
  kind: ArticleFlowNodeKind;
  label: string;
  /** Linha secundária curta: slug, papel ou quantidade. Nunca o DNA inteiro. */
  meta: string | null;
  position: { x: number; y: number };
  /** Silo a que o nó pertence; sustenta a sincronia com o painel. */
  siloRef: string;
  /** Article/candidato a que o nó pertence; `null` na SiloPage. */
  articleRef: string | null;
  /** Só em nós de keyword. */
  keywordId: string | null;
};

export type ArticleFlowEdge = {
  id: string;
  source: string;
  target: string;
  /**
   * Antes da confirmação a composição é sugestão; depois é composição
   * confirmada. Tracejado e sólido dizem isso sem texto, como em Silos.
   */
  suggested: boolean;
};

export type ArticleFlowProjection = {
  nodes: ArticleFlowNode[];
  edges: ArticleFlowEdge[];
  /** Keywords desenhadas e escondidas — a conta precisa fechar na tela. */
  visibleKeywords: number;
  hiddenKeywords: number;
};

/** Um Silo por faixa horizontal: clusters não se encostam. */
const SILO_BAND_HEIGHT = 460;
const ARTICLE_SPACING_X = 300;
const ARTICLE_ROW_Y = 170;
const KEYWORD_ROW_Y = 320;
const KEYWORD_SPACING_X = 130;
/** Além disso o cluster vira mancha; o painel mostra o resto. */
const MAX_VISIBLE_KEYWORDS_PER_ARTICLE = 5;

const ROLE_SHORT: Record<string, string> = {
  principal: "P",
  secundaria: "S",
  reforco: "R",
};

export function buildArticleFlowProjection(input: {
  views: readonly ArticleSiloView[];
  /** Articles já materializados desenham aresta sólida. */
  materializedArticleIds?: ReadonlySet<string>;
}): ArticleFlowProjection {
  const nodes: ArticleFlowNode[] = [];
  const edges: ArticleFlowEdge[] = [];
  const materializados = input.materializedArticleIds ?? new Set<string>();
  let visibleKeywords = 0;
  let hiddenKeywords = 0;

  input.views.forEach((view, siloIndex) => {
    const bandaY = siloIndex * SILO_BAND_HEIGHT;
    const largura = Math.max(view.nodes.length - 1, 0) * ARTICLE_SPACING_X;
    const siloId = `silo:${view.siloRef}`;

    nodes.push({
      id: siloId,
      kind: "silo_page",
      label: view.siloLabel,
      meta: view.siloSlug,
      // Centralizada sobre os filhos: a raiz precisa parecer raiz.
      position: { x: largura / 2, y: bandaY },
      siloRef: view.siloRef,
      articleRef: null,
      keywordId: null,
    });

    view.nodes.forEach((article, articleIndex) => {
      const articleId = `article:${article.ref}`;
      const x = articleIndex * ARTICLE_SPACING_X;

      nodes.push({
        id: articleId,
        kind: nodeKindOf(article),
        label: article.label,
        meta: metaOf(article),
        position: { x, y: bandaY + ARTICLE_ROW_Y },
        siloRef: view.siloRef,
        articleRef: article.ref,
        keywordId: null,
      });
      edges.push({
        id: `${siloId}->${articleId}`,
        source: siloId,
        target: articleId,
        // A SiloPage já é confirmada; o vínculo com ela não é sugestão.
        suggested: false,
      });

      // Publicado não pendura keywords novas: fazer isso sugeriria que a
      // página no ar passou a responder por buscas que ninguém decidiu.
      if (article.kind === "published") return;

      const visiveis = article.keywords.slice(0, MAX_VISIBLE_KEYWORDS_PER_ARTICLE);
      hiddenKeywords += article.keywords.length - visiveis.length;
      visibleKeywords += visiveis.length;

      const larguraKw = Math.max(visiveis.length - 1, 0) * KEYWORD_SPACING_X;
      visiveis.forEach((keyword, keywordIndex) => {
        const keywordNodeId = `keyword:${article.ref}:${keyword.keywordId}`;
        nodes.push({
          id: keywordNodeId,
          kind: "keyword",
          label: keyword.label,
          meta: ROLE_SHORT[keyword.role] ?? null,
          position: {
            x: x - larguraKw / 2 + keywordIndex * KEYWORD_SPACING_X,
            y: bandaY + KEYWORD_ROW_Y,
          },
          siloRef: view.siloRef,
          articleRef: article.ref,
          keywordId: keyword.keywordId,
        });
        edges.push({
          id: `${articleId}->${keywordNodeId}`,
          source: articleId,
          target: keywordNodeId,
          // Antes do ArticleDNA a composição é proposta; depois, confirmada.
          suggested: !materializados.has(article.ref),
        });
      });
    });
  });

  return { nodes, edges, visibleKeywords, hiddenKeywords };
}

function nodeKindOf(article: ArticleViewNode): ArticleFlowNodeKind {
  if (article.kind === "published") return "published";
  return article.kind === "article" ? "article" : "candidate";
}

function metaOf(article: ArticleViewNode): string | null {
  if (article.kind === "published") return "canonical protegido";
  const total = article.keywords.length;
  return `${total} keyword${total === 1 ? "" : "s"}`;
}

/** Do nó clicado para o que o painel deve abrir. */
export function articleFlowSelection(node: ArticleFlowNode): {
  kind: "silo" | "article" | "keyword";
  siloRef: string;
  articleRef: string | null;
  keywordId: string | null;
} {
  if (node.kind === "silo_page") {
    return { kind: "silo", siloRef: node.siloRef, articleRef: null, keywordId: null };
  }
  if (node.kind === "keyword") {
    return { kind: "keyword", siloRef: node.siloRef, articleRef: node.articleRef, keywordId: node.keywordId };
  }
  return { kind: "article", siloRef: node.siloRef, articleRef: node.articleRef, keywordId: null };
}
