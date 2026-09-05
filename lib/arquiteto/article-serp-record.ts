import { z } from "zod";
import type { SerpFormationAssessment } from "./serp-formation.ts";

/**
 * A EVIDÊNCIA SERP DA FORMAÇÃO VIRA ARTEFATO REMOTO.
 *
 * Enquanto o parecer vivia só em IndexedDB, ele era um cache com aparência de
 * contrato: outro navegador, outro ator ou uma limpeza de dados do site e a
 * evidência simplesmente não existia — mas a tela continuaria capaz de dizer
 * "SERP atual" porque o estado estava na memória da aba.
 *
 * O caminho é o mesmo já provado por `territory`, `silo_working_copy` e
 * `territorial_serp_assessment`: `editorial_workflow_items` com `subject_type`
 * próprio. Sem DDL, sem enum novo, sem tocar RLS — a policy da tabela já
 * autoriza por marca.
 *
 * A identidade é a FORMAÇÃO, não o Article: `subject_id` é o `candidateRef` e
 * `article_id` fica nulo, porque o ArticleDNA ainda não existe quando a
 * evidência é coletada. Fabricar um só para caber na coluna seria inverter a
 * ordem que este gate existe para proteger.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export const ARTICLE_FORMATION_SERP_SUBJECT_TYPE = "article_formation_serp_assessment" as const;
export const ARTICLE_FORMATION_SERP_WORKFLOW_STAGE = "architect" as const;
export const ARTICLE_FORMATION_SERP_CONTRACT_VERSION = "article-formation-serp-record-v1" as const;

export const ARTICLE_SERP_VERDICTS = ["COMPATIBLE", "INCONCLUSIVE", "DIVERGENCE"] as const;
export type ArticleSerpVerdict = (typeof ARTICLE_SERP_VERDICTS)[number];

/**
 * As decisões humanas que resolvem um parecer.
 *
 * Não existe "ignorar a SERP": o humano decide a questão editorial concreta —
 * aceitar a composição como está, ou mudá-la. Um botão genérico de dispensa
 * transformaria o gate em formalidade.
 */
export const ARTICLE_SERP_HUMAN_DECISIONS = [
  "accept_current_composition",
  "change_composition",
  "change_principal",
  "split",
  "merge",
] as const;
export type ArticleSerpHumanDecision = (typeof ARTICLE_SERP_HUMAN_DECISIONS)[number];

export const ArticleSerpHumanResolutionSchema = z.object({
  decision: z.enum(ARTICLE_SERP_HUMAN_DECISIONS),
  reason: z.string().trim().min(1),
  source: z.literal("human"),
  decidedAt: z.string().min(1),
  decidedBy: z.string().min(1),
  /** Contra QUAL evidência a decisão foi tomada. */
  assessmentId: z.string().min(1),
  formationBaseHash: z.string().min(1),
}).strict();
export type ArticleSerpHumanResolution = z.infer<typeof ArticleSerpHumanResolutionSchema>;

export const ArticleFormationSerpPayloadSchema = z.object({
  contractVersion: z.literal(ARTICLE_FORMATION_SERP_CONTRACT_VERSION),
  candidateRef: z.string().min(1),
  territoryRef: z.string().min(1),
  /** Composição observada; é o que prova que a evidência ainda é vigente. */
  formationBaseHash: z.string().min(1),
  verdict: z.enum(ARTICLE_SERP_VERDICTS),
  /**
   * O parecer inteiro, preservado como veio.
   *
   * A validação aqui cobre o que ESTE registro responde por — identidade,
   * base, veredito e decisão humana. O assessment já foi validado pelo seu
   * próprio schema quando nasceu, e revalidar o agregado inteiro na leitura
   * transformaria qualquer evolução do contrato da SERP em linha remota
   * ilegível. `passthrough` mantém os demais campos intactos na volta.
   */
  assessment: z.object({
    id: z.string().min(1),
    contentHash: z.string().min(1),
    createdAt: z.string().min(1),
    snapshots: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1),
  }).passthrough(),
  snapshotIds: z.array(z.string().min(1)).min(1),
  /**
   * O parecer legível: as duas perguntas, o mercado observado e o porquê.
   *
   * Guardado junto porque é o que a tela mostra. Recalcular na leitura faria
   * a explicação exibida hoje poder divergir da que foi gravada ontem, sem
   * que nada tivesse mudado no mercado.
   */
  interpretation: z.object({
    principalVerdict: z.string().min(1),
    principalAlternativeKeywordId: z.string().min(1).nullable(),
    principalReason: z.string().min(1),
    groupVerdict: z.string().min(1),
    groupReason: z.string().min(1),
    outsiders: z.array(z.object({ keywordId: z.string().min(1), keyword: z.string().min(1), reason: z.string().min(1) })),
    observedIntent: z.string().min(1),
    dominantType: z.string().min(1),
    viability: z.string().min(1),
    viabilityText: z.string().min(1),
    distinctDomains: z.number().int().nonnegative(),
    converging: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    recommendation: z.string().min(1),
  }).nullable().default(null),
  /** Resolução humana registrada CONTRA esta base; nunca genérica. */
  humanResolution: ArticleSerpHumanResolutionSchema.nullable().default(null),
  provenance: z.object({
    operationRequestId: z.string().min(1),
    collectedAt: z.string().min(1),
  }).strict(),
}).strict();
export type ArticleFormationSerpPayload = z.infer<typeof ArticleFormationSerpPayloadSchema>;

/**
 * O estado do item traduz o parecer, e é lido de volta na conferência.
 *
 * Guardar um estado que não corresponde ao veredito deixaria a listagem
 * remota mentindo sem que o payload nunca fosse aberto.
 */
export function articleFormationSerpWorkflowState(payload: {
  verdict: ArticleSerpVerdict;
  humanResolution: ArticleSerpHumanResolution | null;
}): string {
  if (payload.humanResolution) return "resolved";
  return payload.verdict === "COMPATIBLE" ? "supported"
    : payload.verdict === "DIVERGENCE" ? "divergent"
      : "inconclusive";
}

export type ArticleFormationSerpRecordIssue =
  | "SUBJECT_TYPE_MISMATCH"
  | "STAGE_MISMATCH"
  | "ARTICLE_ID_PRESENT"
  | "PAYLOAD_INVALID"
  | "SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD"
  | "STATE_DOES_NOT_MATCH_VERDICT"
  | "RESOLUTION_BASE_MISMATCH";

export type ArticleFormationSerpReadResult =
  | { ok: true; payload: ArticleFormationSerpPayload; issues: [] }
  | { ok: false; payload: null; issues: ArticleFormationSerpRecordIssue[] };

export type ArticleFormationSerpRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

export function buildArticleFormationSerpRow(input: {
  candidateRef: string;
  territoryRef: string;
  formationBaseHash: string;
  verdict: ArticleSerpVerdict;
  assessment: SerpFormationAssessment;
  operationRequestId: string;
  interpretation?: ArticleFormationSerpPayload["interpretation"];
  humanResolution?: ArticleSerpHumanResolution | null;
}): ArticleFormationSerpRowInput {
  const payload: ArticleFormationSerpPayload = ArticleFormationSerpPayloadSchema.parse({
    contractVersion: ARTICLE_FORMATION_SERP_CONTRACT_VERSION,
    candidateRef: input.candidateRef,
    territoryRef: input.territoryRef,
    formationBaseHash: input.formationBaseHash,
    verdict: input.verdict,
    assessment: input.assessment,
    interpretation: input.interpretation ?? null,
    snapshotIds: input.assessment.snapshots.map(snapshot => snapshot.id),
    humanResolution: input.humanResolution ?? null,
    provenance: {
      operationRequestId: input.operationRequestId,
      collectedAt: input.assessment.createdAt,
    },
  });
  return {
    subjectType: ARTICLE_FORMATION_SERP_SUBJECT_TYPE,
    subjectId: input.candidateRef,
    stage: ARTICLE_FORMATION_SERP_WORKFLOW_STAGE,
    state: articleFormationSerpWorkflowState(payload),
    // O candidato é a origem de si mesmo: não há artefato anterior a citar.
    sourceEntityId: input.candidateRef,
    // A evidência é da FORMAÇÃO. O ArticleDNA ainda não existe.
    articleId: null,
    payload,
  };
}

/** Lê a linha remota recusando incoerência em vez de reconciliar em silêncio. */
export function parseArticleFormationSerpRow(row: ArticleFormationSerpRowInput): ArticleFormationSerpReadResult {
  const issues: ArticleFormationSerpRecordIssue[] = [];
  if (row.subjectType !== ARTICLE_FORMATION_SERP_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== ARTICLE_FORMATION_SERP_WORKFLOW_STAGE) issues.push("STAGE_MISMATCH");
  if (row.articleId) issues.push("ARTICLE_ID_PRESENT");

  const parsed = ArticleFormationSerpPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, payload: null, issues };
  }
  if (parsed.data.candidateRef !== row.subjectId) issues.push("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD");
  if (row.state !== articleFormationSerpWorkflowState(parsed.data)) issues.push("STATE_DOES_NOT_MATCH_VERDICT");
  // Resolução humana de outra composição não vale para esta: aceitá-la seria
  // deixar uma decisão antiga liberar uma gravação que ninguém aprovou.
  if (parsed.data.humanResolution
    && parsed.data.humanResolution.formationBaseHash !== parsed.data.formationBaseHash) {
    issues.push("RESOLUTION_BASE_MISMATCH");
  }

  return issues.length ? { ok: false, payload: null, issues } : { ok: true, payload: parsed.data, issues: [] };
}
