import type {
  ArticleCandidate,
  ArticleFormationUniverse,
  SingletonAudit,
} from "./article-formation.ts";

/**
 * A ABA ARTIGOS VISTA COMO ARQUITETURA, NÃO COMO LISTA.
 *
 * A raiz é a SiloPage. Dentro dela convivem três coisas que NÃO são a mesma:
 *
 *   article   — já existe ArticleDNA canônico
 *   candidate — só read-model, ainda não confirmado
 *   published — patrimônio; canonical protegido, nunca materializado de novo
 *
 * Uma lista plana de 17 artigos esconde exatamente o que precisa ser decidido:
 * quantos assuntos cada Silo realmente tem, e se o que está sendo proposto já
 * existe publicado ao lado.
 *
 * A SiloPage NÃO é um Article: ela é o pai. Contá-la junto inflaria o número
 * de conteúdos e faria a mesa mentir sobre o tamanho do trabalho.
 *
 * Projeção pura: nada aqui persiste, materializa ou reagrupa.
 */

export type ArticleNodeKind = "article" | "candidate" | "published";

export type ArticleViewKeyword = {
  keywordId: string;
  label: string;
  role: "principal" | "secundaria" | "reforco";
  /** A composição veio de decisão humana? */
  humanDecided: boolean;
};

/**
 * Slug que passa na regra mas não informa.
 *
 * `mascara-de` e `da-creamy` são endereços válidos e únicos — e ilegíveis. O
 * desconto do tema do pai pode deixar só a sobra da frase. Isto é OBSERVAÇÃO:
 * nada é reescrito, e publicado nunca entra.
 */
export const SLUG_REVIEW_CODES = [
  "SLUG_TOO_SHORT",
  "SLUG_ENDS_IN_CONNECTOR",
  "SLUG_STARTS_WITH_CONNECTOR",
  "SLUG_SINGLE_TOKEN",
] as const;
export type SlugReviewCode = (typeof SLUG_REVIEW_CODES)[number];

export type ArticleViewNode = {
  kind: ArticleNodeKind;
  /** `articleId`, `candidateRef` ou `published:<path>`. */
  ref: string;
  label: string;
  /** Slug relativo (novo) ou caminho publicado. */
  slug: string | null;
  canonical: string | null;
  keywords: ArticleViewKeyword[];
  /** Presente quando o nó veio da formação. */
  candidate: ArticleCandidate | null;
  /** Por que este candidato tem uma keyword só. */
  singletonAudit: SingletonAudit | null;
  /** Endereço válido mas pobre — só para conteúdo novo. */
  slugReview: SlugReviewCode[];
};

/**
 * A identidade editorial do Silo, como ela REALMENTE está.
 *
 * A aba projeta a unidade "SiloPage" para dar raiz à hierarquia, mas projetar
 * não é materializar: enquanto não existir SiloPage canônica, a tela precisa
 * dizer isso. Alegar um artefato que não existe faria a mesa prometer uma
 * página publicável que ninguém criou.
 */
export type SiloPageIdentity = {
  /** Veio do site publicado ou foi criado à mão pelo estrategista. */
  origin: "site" | "manual" | "unknown";
  /** Existe SiloPage canônica gravada para este Silo? */
  canonical: boolean;
  published: boolean;
  /** Canonical publicado é intocável. */
  protected: boolean;
};

export type ArticleSiloView = {
  siloRef: string;
  siloLabel: string;
  siloSlug: string | null;
  identity: SiloPageIdentity;
  nodes: ArticleViewNode[];
  counts: {
    articles: number;
    candidates: number;
    published: number;
    keywords: number;
    singletons: number;
    grouped: number;
    possibleOverlaps: number;
    slugReview: number;
    /** Páginas publicadas conhecidas pelo Site — evidência, não Article. */
    publishedPages: number;
  };
};

/** Conectores não carregam assunto; um slug que começa ou acaba neles é sobra. */
const CONNECTORS = new Set(["de", "da", "do", "das", "dos", "para", "com", "sem", "por", "em", "no", "na", "e", "ou", "a", "o"]);

export function reviewSlugQuality(slug: string | null): SlugReviewCode[] {
  if (!slug) return [];
  const tokens = slug.split("-").filter(Boolean);
  if (!tokens.length) return ["SLUG_TOO_SHORT"];

  const codes: SlugReviewCode[] = [];
  if (slug.replace(/-/g, "").length < 6) codes.push("SLUG_TOO_SHORT");
  if (CONNECTORS.has(tokens[tokens.length - 1])) codes.push("SLUG_ENDS_IN_CONNECTOR");
  if (CONNECTORS.has(tokens[0])) codes.push("SLUG_STARTS_WITH_CONNECTOR");
  // Um token só costuma ser genérico demais para endereçar um artigo.
  if (tokens.length === 1 && !codes.includes("SLUG_TOO_SHORT")) codes.push("SLUG_SINGLE_TOKEN");
  return codes;
}

export const SLUG_REVIEW_LABELS: Record<SlugReviewCode, string> = {
  SLUG_TOO_SHORT: "endereço curto demais para descrever o conteúdo",
  SLUG_ENDS_IN_CONNECTOR: "o endereço termina numa preposição e ficou pela metade",
  SLUG_STARTS_WITH_CONNECTOR: "o endereço começa numa preposição",
  SLUG_SINGLE_TOKEN: "uma palavra só costuma ser genérica demais para um artigo",
};

export const ARTICLE_NODE_LABELS: Record<ArticleNodeKind, string> = {
  article: "ARTICLE",
  candidate: "CANDIDATO",
  published: "ARTICLE · PUBLICADO",
};

export const SILO_ORIGIN_LABELS: Record<SiloPageIdentity["origin"], string> = {
  site: "Site",
  manual: "Manual",
  unknown: "Origem não declarada",
};

export function buildArticleSiloViews(input: {
  universes: readonly ArticleFormationUniverse[];
  /** Identidade editorial por Silo; ausente resolve como não canônica. */
  siloIdentities?: ReadonlyMap<string, SiloPageIdentity>;
  /** `articleId` dos ArticleDNA já materializados. */
  materializedArticleIds: ReadonlySet<string>;
  /** Keywords que o Minerador entregou como publicadas — a única fonte. */
  publishedKeywordIds?: ReadonlySet<string>;
  keywordLabels: ReadonlyMap<string, string>;
  /** Keywords cuja composição foi decidida por um humano. */
  humanDecidedKeywordIds?: ReadonlySet<string>;
}): ArticleSiloView[] {
  const humanas = input.humanDecidedKeywordIds ?? new Set<string>();

  return input.universes.map(universe => {
    const nodes: ArticleViewNode[] = [];

    /*
     * A folha do sitemap NÃO vira Article aqui.
     *
     * O Site sabe que a URL existe, qual é o canonical e quem é o pai
     * publicado. Ele não sabe a keyword principal, a política dela, o KGR nem
     * a intenção qualificada — nada disso que faz um Article editorial.
     * Promover a URL a `ARTICLE · PUBLICADO` fazia a mesa afirmar um DNA que
     * ninguém tinha.
     *
     * A evidência continua viva em `universe.publishedArticles`, usada para
     * reconciliar: reconhecer keyword equivalente e impedir que um candidato
     * novo proponha um endereço que já está no ar.
     *
     * Article publicado de verdade chega pelo Minerador, como KeywordDNA com
     * identidade publicada — e aí ele é um candidato como outro qualquer,
     * apenas com URL, slug e canonical travados.
     */

    for (const candidate of universe.candidates) {
      const materializado = input.materializedArticleIds.has(candidate.candidateRef);
      // Publicado editorial vem do KeywordDNA publicado do Minerador, nunca da
      // varredura do site.
      const principalPublicada = input.publishedKeywordIds?.has(candidate.principalKeywordId) ?? false;
      const audit = candidate.keywords.length === 1
        ? universe.singletonAudits.find(item => item.candidateRef === candidate.candidateRef) ?? null
        : null;

      nodes.push({
        kind: principalPublicada ? "published" : materializado ? "article" : "candidate",
        ref: candidate.candidateRef,
        label: input.keywordLabels.get(candidate.principalKeywordId) || "artigo sem nome",
        slug: candidate.suggestedSlug,
        canonical: null,
        keywords: [
          ...candidate.keywords.map(item => ({
            keywordId: item.keywordId,
            label: input.keywordLabels.get(item.keywordId) || item.keywordId,
            role: item.role,
            humanDecided: humanas.has(item.keywordId),
          })),
          // O excesso além do teto continua sendo deste artigo.
          ...candidate.overflowKeywordIds.map(keywordId => ({
            keywordId,
            label: input.keywordLabels.get(keywordId) || keywordId,
            role: "reforco" as const,
            humanDecided: humanas.has(keywordId),
          })),
        ],
        candidate,
        singletonAudit: audit,
        slugReview: reviewSlugQuality(candidate.suggestedSlug),
      });
    }

    const candidatos = nodes.filter(node => node.kind !== "published");
    return {
      siloRef: universe.siloRef,
      siloLabel: universe.siloLabel,
      siloSlug: universe.siloSlug,
      // Sem identidade declarada, o Silo NÃO é tratado como canônico: o
      // silêncio não pode virar promessa de artefato.
      identity: input.siloIdentities?.get(universe.siloRef)
        ?? { origin: "unknown", canonical: false, published: false, protected: false },
      nodes,
      counts: {
        articles: nodes.filter(node => node.kind === "article").length,
        candidates: nodes.filter(node => node.kind === "candidate").length,
        published: nodes.filter(node => node.kind === "published").length,
        /** Evidência do site sob este Silo — não são Articles editoriais. */
        publishedPages: universe.publishedArticles.length,
        keywords: universe.keywordIds.length,
        singletons: candidatos.filter(node => node.keywords.length === 1).length,
        grouped: candidatos.filter(node => node.keywords.length > 1).length,
        possibleOverlaps: universe.relations.filter(relation => relation.relation !== "distinct").length,
        slugReview: candidatos.filter(node => node.slugReview.length > 0).length,
      },
    };
  });
}

/** Síntese global — SiloPage nunca entra na conta de Article. */
export function summarizeArticleSiloViews(views: readonly ArticleSiloView[]) {
  const soma = (pick: (view: ArticleSiloView) => number) => views.reduce((total, view) => total + pick(view), 0);
  return {
    siloPages: views.length,
    articles: soma(view => view.counts.articles),
    candidates: soma(view => view.counts.candidates),
    published: soma(view => view.counts.published),
    keywords: soma(view => view.counts.keywords),
    singletons: soma(view => view.counts.singletons),
    grouped: soma(view => view.counts.grouped),
    possibleOverlaps: soma(view => view.counts.possibleOverlaps),
    slugReview: soma(view => view.counts.slugReview),
  };
}

/**
 * A busca alcança os quatro níveis e mantém o pai visível.
 *
 * Filtrar só o nó faria o artigo aparecer solto, sem o Silo a que pertence —
 * e a aba voltaria a ser uma lista plana no exato momento em que a pessoa
 * mais precisa do contexto.
 */
export function filterArticleSiloViews(
  views: readonly ArticleSiloView[],
  search: string,
): ArticleSiloView[] {
  const termo = search.trim().toLowerCase();
  if (!termo) return [...views];

  const casa = (value: string | null | undefined) => Boolean(value && value.toLowerCase().includes(termo));

  return views.flatMap(view => {
    // Silo que casa traz o universo inteiro: o contexto é a resposta.
    if (casa(view.siloLabel) || casa(view.siloSlug)) return [view];

    const nodes = view.nodes.filter(node =>
      casa(node.label)
      || casa(node.slug)
      || casa(node.canonical)
      || node.keywords.some(keyword => casa(keyword.label)));
    return nodes.length ? [{ ...view, nodes }] : [];
  });
}
