import { readPublicationLink, readSiteOrigin } from "./publication-link.ts";
import { isPostLockedToSlug, primaryPostLabel, readPrimaryKeywordPolicy, type PrimaryKeywordPolicy } from "./primary-keyword-policy.ts";
import { keywordPageTypeStanding, resolveKeywordPageType, type KeywordPageTypeResolution } from "./keyword-page-type.ts";

/**
 * O VÍNCULO, RESOLVIDO UMA VEZ SÓ.
 *
 * As duas declarações do vínculo — o posto e o tipo de página — apareciam em
 * três telas, e cada uma as derivava por conta própria: a coluna, o cabeçalho
 * do Perfil e a Revisão Humana. Três derivações do mesmo fato é a receita da
 * divergência, e ela apareceu: a Revisão dizia "Livre" para uma keyword
 * publicada enquanto a coluna já dizia "Travado ao slug".
 *
 * A **Revisão Humana é onde se decide**; coluna e cabeçalho apenas refletem.
 * Para que reflitam a mesma coisa, todas leem daqui — inclusive os defaults,
 * que também são resposta e por isso também moram num lugar só.
 *
 * Domínio puro.
 */

export type KeywordVinculo = {
  /** Há publicação declarada por um humano. */
  publicationDeclared: boolean;
  /** Estado do vínculo: `free` · `candidate` · `verified` · `published` · `legacy_unverified`. */
  publicationState: string;
  /** Endereço da página, quando existe. */
  url: string | null;
  /** Canônico congelado na declaração; `null` enquanto não há publicação. */
  canonicalUrl: string | null;

  /** Posto resolvido, já com o default que a publicação impõe. */
  post: PrimaryKeywordPolicy;
  /** `Livre` ou `Travado ao slug` — as duas respostas visíveis. */
  postLabel: string;
  postLockedToSlug: boolean;
  /** Valor do `<select>`: o posto tem dois itens, não três. */
  postSelectValue: "locked" | "reviewable";

  /** Tipo de página resolvido, com origem e se já é declaração. */
  pageType: KeywordPageTypeResolution;
  /** `Artigo · potencial` ou `Silo · declarado`. */
  pageTypeLabel: string;
};

export type KeywordVinculoInput = {
  status?: string | null;
  semantic?: Record<string, unknown> | null;
};

export function resolveKeywordVinculo(input: KeywordVinculoInput): KeywordVinculo {
  const evidence = readSiteOrigin(input.semantic);
  const link = readPublicationLink({ status: input.status, evidence });
  const publicationDeclared = link.state === "published";

  const post = readPrimaryKeywordPolicy({ status: input.status, semantic: input.semantic, publicationDeclared });
  const pageType = resolveKeywordPageType({ semantic: input.semantic, siteRole: link.siteRole, published: publicationDeclared });

  return {
    publicationDeclared,
    publicationState: link.state,
    url: link.url,
    canonicalUrl: link.canonicalUrl,

    post,
    postLabel: primaryPostLabel(post),
    postLockedToSlug: isPostLockedToSlug(post),
    // `free` e `reviewable` são a mesma resposta na tela; o `<select>` só
    // precisa saber se está travado — soltar grava `reviewable`.
    postSelectValue: post === "locked" ? "locked" : "reviewable",

    pageType,
    pageTypeLabel: keywordPageTypeStanding(pageType.type, { declared: pageType.declared }),
  };
}

/** A frase que a Revisão Humana, o cabeçalho e a coluna repetem sem recalcular. */
export function keywordVinculoSummary(vinculo: KeywordVinculo): string {
  return `${vinculo.postLabel} · ${vinculo.pageTypeLabel}`;
}
