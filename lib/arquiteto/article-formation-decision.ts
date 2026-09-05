import { z } from "zod";

/**
 * DECISÃO HUMANA SOBRE A FORMAÇÃO DE UM ARTIGO.
 *
 * O agrupamento automático é PROPOSTA. Quando a pessoa move uma keyword, junta
 * dois candidatos, separa um ou troca a principal, essa decisão precisa
 * sobreviver ao reprocessamento — senão "Reprocessar artigos" apagaria em
 * silêncio o trabalho de revisão.
 *
 * Mesma forma já provada pela membership territorial:
 *
 *   `articleFormationRef`      — o ÚNICO ponteiro mutável
 *   `articleFormationDecision` — a decisão, SEM repetir o ponteiro dentro
 *
 * Guardar a referência dentro da decisão criaria uma segunda fonte capaz de
 * divergir da primeira, sem regra de desempate.
 *
 * Mora no payload jsonb do item de workflow da PRÓPRIA keyword — onde a
 * membership já mora. Sem coluna nova, sem subject_type novo, sem migration,
 * sem tocar RLS.
 *
 * NÃO é ArticleDNA: é working state. A materialização continua sendo um passo
 * humano separado.
 *
 * Domínio puro: sem storage, sem fetch.
 */

/**
 * Como a keyword foi parar neste artigo — e em que papel.
 *
 * `role` não move nada: a busca continua no mesmo artigo, mudando de
 * secundária para reforço narrativo ou o contrário. Sem essa operação a
 * decisão não tinha onde ser gravada, e o ArticleDNA nascia sempre com tudo
 * como secundária — apagando na escrita a única coisa que a pessoa decidiu.
 */
export const ARTICLE_FORMATION_OPERATIONS = ["move", "merge", "split", "principal", "role"] as const;
export const ArticleFormationOperationSchema = z.enum(ARTICLE_FORMATION_OPERATIONS);
export type ArticleFormationOperation = z.infer<typeof ArticleFormationOperationSchema>;

export const ArticleFormationRoleSchema = z.enum(["principal", "secundaria", "reforco"]);
export type ArticleFormationRole = z.infer<typeof ArticleFormationRoleSchema>;

export const ArticleFormationDecisionSchema = z.object({
  operation: ArticleFormationOperationSchema,
  role: ArticleFormationRoleSchema,
  reason: z.string().min(1),
  /** Só `human` por enquanto: SERP e IA não decidem formação neste corte. */
  source: z.enum(["human"]),
  decidedAt: z.string().min(1),
}).strict();
export type ArticleFormationDecision = z.infer<typeof ArticleFormationDecisionSchema>;

/**
 * `article-formation:<uuid>` — identidade do agrupamento revisado.
 *
 * Deliberadamente NÃO é um `articleId`: nenhum ArticleDNA existe ainda. É um
 * ponteiro de working state, e confundi-lo com identidade de artigo faria a
 * revisão parecer materialização.
 */
export const ARTICLE_FORMATION_REF_PREFIX = "article-formation:" as const;
export const ArticleFormationRefSchema = z.string()
  .min(ARTICLE_FORMATION_REF_PREFIX.length + 1)
  .refine(value => value.startsWith(ARTICLE_FORMATION_REF_PREFIX), {
    message: "A referência de formação precisa começar com article-formation:.",
  });

export function isArticleFormationRef(value: unknown): value is string {
  return typeof value === "string" && ArticleFormationRefSchema.safeParse(value).success;
}

/**
 * Três estados de endereçamento. `unaddressed` NÃO é decisão: é a ausência
 * dela — a keyword segue com o agrupamento automático. Colapsá-lo em
 * "sem artigo" faria uma keyword nunca revisada parecer uma que alguém
 * decidiu deixar de fora.
 */
export const ARTICLE_FORMATION_STATES = ["decided", "unaddressed"] as const;
export type ArticleFormationState = (typeof ARTICLE_FORMATION_STATES)[number];

export const ARTICLE_FORMATION_ISSUE_CODES = [
  "REF_WITHOUT_DECISION",
  "DECISION_WITHOUT_REF",
  "REF_INVALID",
  "DECISION_INVALID",
] as const;
export type ArticleFormationIssue = (typeof ARTICLE_FORMATION_ISSUE_CODES)[number];

export type ArticleFormationResolution =
  | { state: ArticleFormationState; formationRef: string | null; decision: ArticleFormationDecision | null; issues: [] }
  | { state: "incoherent"; formationRef: null; decision: null; issues: ArticleFormationIssue[] };

/**
 * Lê o par (`articleFormationRef`, `articleFormationDecision`) de um payload.
 *
 * Estado incoerente é RECUSADO, nunca normalizado: silenciar a incoerência
 * escolheria um dos dois lados sem autoridade para isso. Payload legado — sem
 * nenhum dos dois campos — resolve `unaddressed`, que é o caso de toda keyword
 * antes da primeira revisão.
 */
export function resolveArticleFormationState(payload: unknown): ArticleFormationResolution {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const rawRef = record.articleFormationRef;
  const rawDecision = record.articleFormationDecision;

  const temRef = rawRef !== undefined && rawRef !== null;
  const temDecisao = rawDecision !== undefined && rawDecision !== null;

  if (!temRef && !temDecisao) {
    return { state: "unaddressed", formationRef: null, decision: null, issues: [] };
  }

  const issues: ArticleFormationIssue[] = [];
  if (temRef && !temDecisao) issues.push("REF_WITHOUT_DECISION");
  if (!temRef && temDecisao) issues.push("DECISION_WITHOUT_REF");

  const refOk = temRef ? ArticleFormationRefSchema.safeParse(rawRef) : null;
  if (temRef && refOk && !refOk.success) issues.push("REF_INVALID");

  const decisionOk = temDecisao ? ArticleFormationDecisionSchema.safeParse(rawDecision) : null;
  if (temDecisao && decisionOk && !decisionOk.success) issues.push("DECISION_INVALID");

  if (issues.length) return { state: "incoherent", formationRef: null, decision: null, issues };

  return {
    state: "decided",
    formationRef: refOk && refOk.success ? refOk.data : null,
    decision: decisionOk && decisionOk.success ? decisionOk.data : null,
    issues: [],
  };
}

/**
 * O agrupamento revisado ainda descreve o mesmo conjunto de keywords?
 *
 * Serve para o reprocessamento marcar STALE em vez de sobrescrever: se a
 * keyword saiu do lote ou mudou de Silo, a decisão continua legível mas
 * precisa de nova revisão.
 */
export function articleFormationDecisionIsStale(input: {
  decidedKeywordIds: readonly string[];
  currentKeywordIds: ReadonlySet<string>;
}): boolean {
  return input.decidedKeywordIds.some(keywordId => !input.currentKeywordIds.has(keywordId));
}
