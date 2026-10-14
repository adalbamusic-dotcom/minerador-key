import { readPublicationLink, readSiteOrigin } from "./publication-link.ts";
import { isPostLockedToSlug, primaryPostLabel, readPrimaryKeywordPolicy, type PrimaryKeywordPolicy } from "./primary-keyword-policy.ts";
import { keywordPageTypeStance, keywordPageTypeStanding, resolveKeywordPageType, type KeywordPageTypeResolution } from "./keyword-page-type.ts";
import { keywordSubjectLabel, resolveKeywordSubject, type KeywordSubjectResolution } from "./keyword-subject.ts";
import { resolveKeywordPlanLock, type KeywordPlanLock, type KeywordPlanLockInput } from "./keyword-plan-lock.ts";

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

  /**
   * 2026-10-13 · A TRAVA DO CADASTRO no lugar do posto (pedido do dono: "no
   * minerador eu coloco como [Travado ao slug] e ele não aceita"). Presente só
   * quando quem chama passa `plan` (a tela do Minerador) e a keyword NÃO é
   * publicada: aí o select "Posto de principal" é a trava (Travada · Livre ·
   * Automática) e `postLabel` diz "Travada"/"Livre". Sem `plan`, o objeto é o
   * de antes (o Arquiteto e os demais leitores não mudam).
   */
  planLock?: KeywordPlanLock;
  /** Travada ao slug (publicada) ou travada no artigo (keyword do plano). Presente junto de `planLock`. */
  postLocked?: boolean;
};

export type KeywordVinculoInput = {
  status?: string | null;
  semantic?: Record<string, unknown> | null;
  /** 2026-10-13 · o contexto da trava do cadastro (id, volume e as outras linhas da marca). */
  plan?: Omit<KeywordPlanLockInput, "status" | "semantic">;
};

export function resolveKeywordVinculo(input: KeywordVinculoInput): KeywordVinculo {
  const evidence = readSiteOrigin(input.semantic);
  const link = readPublicationLink({ status: input.status, evidence });
  const publicationDeclared = link.state === "published";

  const post = readPrimaryKeywordPolicy({ status: input.status, semantic: input.semantic, publicationDeclared });
  const pageType = resolveKeywordPageType({ semantic: input.semantic, siteRole: link.siteRole, published: publicationDeclared });
  // A trava só existe na keyword não publicada (`resolveKeywordPlanLock` devolve `null` na publicada).
  const planLock = input.plan ? resolveKeywordPlanLock({ ...input.plan, status: input.status, semantic: input.semantic }) : null;
  const postLabel = planLock ? (planLock.kind === "plan" ? planLock.shortLabel : "Livre") : primaryPostLabel(post);

  return {
    publicationDeclared,
    publicationState: link.state,
    url: link.url,
    canonicalUrl: link.canonicalUrl,

    post,
    postLabel,
    postLockedToSlug: isPostLockedToSlug(post),
    // `free` e `reviewable` são a mesma resposta na tela; o `<select>` só
    // precisa saber se está travado — soltar grava `reviewable`.
    postSelectValue: post === "locked" ? "locked" : "reviewable",

    pageType,
    // O peso vem da publicação OU da declaração humana (potencial/declarado).
    pageTypeLabel: keywordPageTypeStanding(pageType.type, { declared: keywordPageTypeStance(pageType) === "declared" }),
    ...subjectFields(input.semantic),
    ...(input.plan ? { postLocked: planLock ? planLock.kind === "plan" && planLock.state === "locked" : isPostLockedToSlug(post) } : {}),
    ...(planLock ? { planLock } : {}),
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
 * As escolhas do Vínculo, na ordem dos selects: Posto e Potencial. Desde
 * 2026-10-13 o Assunto não é escolha do Vínculo (pedido do dono: "na planilha
 * já não vai mais existir assuntos, só keywords e dentro dessas keywords estão
 * os assuntos"): ele entra pelo card "Cadastrar Assuntos" e o painel da
 * keyword o mostra só leitura. A coluna e o resumo ficam "Livre · Artigo ·
 * potencial".
 */
export function keywordVinculoChoiceLabels(vinculo: KeywordVinculo): { post: string; pageType: string } {
  return { post: vinculo.postLabel, pageType: vinculo.pageTypeLabel };
}

/** `Livre · Artigo · potencial`: as escolhas do Vínculo numa frase. */
export function keywordVinculoChoicesSummary(vinculo: KeywordVinculo): string {
  const labels = keywordVinculoChoiceLabels(vinculo);
  return `${labels.post} · ${labels.pageType}`;
}
