import { readPublicationLink, readSiteOrigin } from "./publication-link.ts";
import { isPostLockedToSlug, primaryPostLabel, readPrimaryKeywordPolicy, type PrimaryKeywordPolicy } from "./primary-keyword-policy.ts";
import { keywordPageTypeStance, keywordPageTypeStanding, resolveKeywordPageType, type KeywordPageTypeResolution } from "./keyword-page-type.ts";
import { keywordSubjectLabel, resolveKeywordSubject, type KeywordSubjectResolution } from "./keyword-subject.ts";

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

  /** Tipo de página resolvido, com origem, peso (potencial/declarado) e se já é declaração. */
  pageType: KeywordPageTypeResolution;
  /** `Artigo · potencial` ou `Silo · declarado`. */
  pageTypeLabel: string;

  /**
   * A terceira declaração (SDD 2026-09-24, F1.1): o Assunto. Aditiva e
   * **presente só quando declarada** — sem Assunto, o objeto é byte a byte o
   * de antes, e quem não conhece o campo não vê diferença.
   */
  subject?: KeywordSubjectResolution;
  /** `Assunto · declarado` ou `Assunto sem nota`; ausente sem declaração. */
  subjectLabel?: string;
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
    // O peso vem da publicação OU da declaração humana (potencial/declarado).
    pageTypeLabel: keywordPageTypeStanding(pageType.type, { declared: keywordPageTypeStance(pageType) === "declared" }),
    ...subjectFields(input.semantic),
  };
}

function subjectFields(semantic: Record<string, unknown> | null | undefined): Pick<KeywordVinculo, "subject" | "subjectLabel"> {
  const subject = resolveKeywordSubject(semantic);
  const subjectLabel = keywordSubjectLabel(subject);
  return subject.declared && subjectLabel ? { subject, subjectLabel } : {};
}

/** A frase que a Revisão Humana, o cabeçalho e a coluna repetem sem recalcular. */
export function keywordVinculoSummary(vinculo: KeywordVinculo): string {
  const base = `${vinculo.postLabel} · ${vinculo.pageTypeLabel}`;
  return vinculo.subjectLabel ? `${base} · ${vinculo.subjectLabel}` : base;
}

/**
 * A terceira escolha quando não há Assunto declarado. A coluna mostra o
 * default do Assunto como já mostra "Livre" e "Artigo · potencial": as três
 * escolhas aparecem sempre, venham do padrão ou do usuário (pedido do dono,
 * 2026-09-24). Mesma palavra do select: "Não".
 */
export const KEYWORD_VINCULO_NO_SUBJECT_LABEL = "Assunto: Não" as const;
/** Com Assunto declarado, a mesma palavra do select: "Declarado". */
export const KEYWORD_VINCULO_SUBJECT_DECLARED_LABEL = "Assunto: Declarado" as const;
/** Declarado sem nota: a coluna avisa que falta completar na Revisão Humana. */
export const KEYWORD_VINCULO_SUBJECT_DECLARED_WITHOUT_NOTE_LABEL = "Assunto: Declarado, sem nota" as const;

/** As três escolhas do Vínculo, na ordem dos selects: Posto, Potencial e Assunto. */
export function keywordVinculoChoiceLabels(vinculo: KeywordVinculo): { post: string; pageType: string; subject: string } {
  const subject = !vinculo.subject?.declared
    ? KEYWORD_VINCULO_NO_SUBJECT_LABEL
    : vinculo.subject.noteMissing
      ? KEYWORD_VINCULO_SUBJECT_DECLARED_WITHOUT_NOTE_LABEL
      : KEYWORD_VINCULO_SUBJECT_DECLARED_LABEL;
  return { post: vinculo.postLabel, pageType: vinculo.pageTypeLabel, subject };
}

/** `Livre · Artigo · potencial · Assunto: Não`: as três escolhas numa frase. */
export function keywordVinculoChoicesSummary(vinculo: KeywordVinculo): string {
  const labels = keywordVinculoChoiceLabels(vinculo);
  return `${labels.post} · ${labels.pageType} · ${labels.subject}`;
}
