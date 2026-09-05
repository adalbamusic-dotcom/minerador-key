import { z } from "zod";

/**
 * MARCADOR DO CENÁRIO DE FORMAÇÃO DE ARTIGOS.
 *
 * Os candidatos — agrupamento, principal, papéis, pontuações, slug sugerido —
 * são reconstruídos deterministicamente do read-model a cada boot. O que NÃO é
 * reconstruível é o fato humano:
 *
 *     "este lote foi processado"
 *     "esta formação foi confirmada"
 *
 * Só isso é persistido. Guardar uma cópia dos candidatos criaria uma segunda
 * autoridade capaz de divergir da formação vigente, sem regra de desempate.
 *
 * Confirmar formação NÃO cria ArticleDNA: o marcador registra que a revisão
 * humana aconteceu, e a materialização continua sendo ação explícita depois.
 *
 * Mesmo caminho de `architecture_analysis`: um item de
 * `editorial_workflow_items`, sem DDL, sem artifact_type novo, sem tocar RLS.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export const ARTICLE_FORMATION_MARKER_SUBJECT_TYPE = "article_formation_analysis" as const;
export const ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE = "architect" as const;
export const ARTICLE_FORMATION_MARKER_CONTRACT_VERSION = "article-formation-marker-v1" as const;
/** Um cenário vigente por marca; a UNIQUE da tabela garante isso. */
export const ARTICLE_FORMATION_MARKER_SUBJECT_ID = "current" as const;

export const ArticleFormationConfirmationStatusSchema = z.enum(["none", "confirmed", "partial", "refused"]);
export type ArticleFormationConfirmationStatus = z.infer<typeof ArticleFormationConfirmationStatusSchema>;

export const ArticleFormationMarkerPayloadSchema = z.object({
  contractVersion: z.literal(ARTICLE_FORMATION_MARKER_CONTRACT_VERSION),
  /** Cenário processado. Muda quando entram keywords, Silos ou páginas. */
  baseHash: z.string().min(1),
  processedAt: z.string().min(1),
  confirmation: z.object({
    status: ArticleFormationConfirmationStatusSchema,
    confirmedAt: z.string().nullable(),
    /** Candidatos que a pessoa aceitou como formação válida. */
    confirmedArticleCount: z.number().int().nonnegative(),
    /** Keywords cobertas por esses candidatos. */
    coveredKeywordCount: z.number().int().nonnegative(),
    /** Silos que ficaram de fora por bloqueio próprio — pendentes, não erro. */
    pendingSiloCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type ArticleFormationMarkerPayload = z.infer<typeof ArticleFormationMarkerPayloadSchema>;

export function articleFormationMarkerState(payload: ArticleFormationMarkerPayload): string {
  return payload.confirmation.status === "none" ? "processed" : payload.confirmation.status;
}

/**
 * O cenário gravado ainda descreve o lote de agora?
 *
 * `stale` não apaga: o marcador continua legível e diz o que foi confirmado
 * antes da mudança.
 */
export function articleFormationMarkerIsStale(input: {
  storedBaseHash: string;
  currentBaseHash: string;
}): boolean {
  return input.storedBaseHash !== input.currentBaseHash;
}

export type ArticleFormationScenarioState =
  | "not_processed"
  | "processed"
  | "confirmed"
  | "partially_confirmed"
  | "stale";

export function resolveArticleFormationScenarioState(input: {
  marker: ArticleFormationMarkerPayload | null;
  currentBaseHash: string;
}): ArticleFormationScenarioState {
  if (!input.marker) return "not_processed";
  if (articleFormationMarkerIsStale({ storedBaseHash: input.marker.baseHash, currentBaseHash: input.currentBaseHash })) {
    return "stale";
  }
  if (input.marker.confirmation.status === "confirmed") return "confirmed";
  if (input.marker.confirmation.status === "partial") return "partially_confirmed";
  return "processed";
}

export const ARTICLE_FORMATION_SCENARIO_LABELS: Record<ArticleFormationScenarioState, string> = {
  not_processed: "Não processada",
  processed: "Processada",
  confirmed: "Confirmada",
  partially_confirmed: "Parcialmente confirmada",
  stale: "Desatualizada",
};

export type ArticleFormationMarkerRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

export function buildArticleFormationMarkerRow(payload: ArticleFormationMarkerPayload): ArticleFormationMarkerRowInput {
  const parsed = ArticleFormationMarkerPayloadSchema.parse(payload);
  return {
    subjectType: ARTICLE_FORMATION_MARKER_SUBJECT_TYPE,
    subjectId: ARTICLE_FORMATION_MARKER_SUBJECT_ID,
    stage: ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE,
    state: articleFormationMarkerState(parsed),
    sourceEntityId: parsed.baseHash,
    // O cenário do lote não pertence a um Article — e confirmar formação não
    // materializa nenhum. Amarrar a linha a um articleId inventaria a
    // entidade que este corte justamente adia.
    articleId: null,
    payload: parsed,
  };
}

export type ArticleFormationMarkerIssue =
  | "SUBJECT_TYPE_MISMATCH"
  | "STAGE_MISMATCH"
  | "PAYLOAD_INVALID"
  | "STATE_DOES_NOT_MATCH_PAYLOAD"
  | "ARTICLE_ID_PRESENT";

export type ArticleFormationMarkerReadResult =
  | { ok: true; payload: ArticleFormationMarkerPayload; issues: [] }
  | { ok: false; payload: null; issues: ArticleFormationMarkerIssue[] };

export function parseArticleFormationMarkerRow(row: ArticleFormationMarkerRowInput): ArticleFormationMarkerReadResult {
  const issues: ArticleFormationMarkerIssue[] = [];
  if (row.subjectType !== ARTICLE_FORMATION_MARKER_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== ARTICLE_FORMATION_MARKER_WORKFLOW_STAGE) issues.push("STAGE_MISMATCH");
  if (row.articleId) issues.push("ARTICLE_ID_PRESENT");

  const parsed = ArticleFormationMarkerPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, payload: null, issues };
  }
  if (row.state !== articleFormationMarkerState(parsed.data)) issues.push("STATE_DOES_NOT_MATCH_PAYLOAD");

  return issues.length ? { ok: false, payload: null, issues } : { ok: true, payload: parsed.data, issues: [] };
}
