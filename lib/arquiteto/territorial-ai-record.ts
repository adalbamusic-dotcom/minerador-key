import { z } from "zod";
import { TerritorialAiProposalSchema, type TerritorialAiProposal } from "./territorial-ai.ts";

/**
 * REGISTRO CANÔNICO REMOTO DA PROPOSTA DE IA TERRITORIAL.
 *
 * Mesmo molde já provado por `territorial_serp_assessment`: um item de
 * `editorial_workflow_items` por pergunta, `subject_id = questionId`,
 * `article_id = null`. Sem DDL, sem artifact_type novo, sem tocar RLS.
 *
 * Escrito como par do record de SERP, e não como abstração genérica dos dois:
 * eles se parecem hoje, mas a IA carrega referência à evidência e postura
 * diante do publicado, que a SERP não tem. Generalizar antes de os dois
 * estarem provados esconderia a diferença.
 */

export const TERRITORIAL_AI_SUBJECT_TYPE = "territorial_ai_review" as const;
export const TERRITORIAL_AI_WORKFLOW_STAGE = "architect" as const;
export const TERRITORIAL_AI_CONTRACT_VERSION = "territorial-ai-record-v1" as const;

/**
 * Referência inequívoca à evidência usada.
 *
 * Guardar só a frase da recomendação impediria provar DE QUAL versão da SERP a
 * proposta saiu. Aqui ficam a pergunta, o hash da base validada e os snapshots.
 */
export const TerritorialAiSerpRefSchema = z.object({
  questionId: z.string().min(1),
  assessmentBaseHash: z.string().min(1),
  recommendation: z.string().min(1),
  snapshotIds: z.array(z.string()),
}).strict();
export type TerritorialAiSerpRef = z.infer<typeof TerritorialAiSerpRefSchema>;

/**
 * O que a IA analisou.
 *
 * Muda quando muda a arquitetura observada ou a evidência usada. Não entra
 * seleção de UI, zoom, coordenada de canvas nem timestamp arbitrário.
 */
export const TerritorialAiBaseSchema = z.object({
  questionId: z.string().min(1),
  kind: z.string().min(1),
  /** Fatos arquiteturais: entidade, intenção, fronteira, membership, publicado. */
  architectureFacts: z.array(z.string()),
  /** Hipótese determinística vigente quando a IA rodou. */
  logicFacts: z.array(z.string()),
  /** Hash da base do parecer SERP usado; `null` quando SERP não era exigida. */
  serpBaseHash: z.string().nullable(),
}).strict();
export type TerritorialAiBase = z.infer<typeof TerritorialAiBaseSchema>;

export const TerritorialAiPayloadSchema = z.object({
  contractVersion: z.literal(TERRITORIAL_AI_CONTRACT_VERSION),
  proposal: TerritorialAiProposalSchema,
  base: TerritorialAiBaseSchema,
  baseHash: z.string().min(1),
  /** `null` quando a dúvida não exigia SERP. */
  serpRef: TerritorialAiSerpRefSchema.nullable(),
  provenance: z.object({
    operationRequestId: z.string().min(1),
    generatedAt: z.string().min(1),
  }).strict(),
}).strict();
export type TerritorialAiPayload = z.infer<typeof TerritorialAiPayloadSchema>;

/**
 * `state` espelha a recomendação para servir ao índice
 * (marca_id, stage, state, updated_at). É PROJEÇÃO operacional: a autoridade do
 * processo continua inteira no payload versionado, nunca neste campo.
 */
export function territorialAiWorkflowState(proposal: TerritorialAiProposal): string {
  return proposal.recommendation;
}

const stable = (values: readonly string[]) => [...values].map(value => value.trim()).filter(Boolean).sort();

export function buildTerritorialAiBase(input: {
  questionId: string;
  kind: string;
  architectureFacts: readonly string[];
  logicFacts: readonly string[];
  serpBaseHash: string | null;
}): TerritorialAiBase {
  return TerritorialAiBaseSchema.parse({
    questionId: input.questionId,
    kind: input.kind,
    architectureFacts: stable(input.architectureFacts),
    logicFacts: stable(input.logicFacts),
    serpBaseHash: input.serpBaseHash,
  });
}

/** Hash determinístico: mesma base, mesmo hash, no servidor e no navegador. */
export function territorialAiBaseHash(base: TerritorialAiBase): string {
  const canonical = JSON.stringify([
    base.questionId, base.kind, base.architectureFacts, base.logicFacts, base.serpBaseHash,
  ]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `aibase:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/**
 * A proposta ainda vale para a arquitetura de agora?
 *
 * Fica desatualizada quando muda o que ela analisou — inclusive quando a SERP
 * que a sustentou mudou. NÃO fica desatualizada porque outra pergunta rodou.
 * `stale` não apaga: a proposta continua legível.
 */
export function territorialAiIsStale(input: {
  storedBaseHash: string;
  currentBase: TerritorialAiBase;
}): boolean {
  return input.storedBaseHash !== territorialAiBaseHash(input.currentBase);
}

export type TerritorialAiRecordIssue =
  | "SUBJECT_TYPE_MISMATCH"
  | "STAGE_MISMATCH"
  | "SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD"
  | "STATE_DOES_NOT_MATCH_RECOMMENDATION"
  | "PAYLOAD_INVALID"
  | "ARTICLE_ID_PRESENT";

export type TerritorialAiRecordReadResult =
  | { ok: true; payload: TerritorialAiPayload; issues: [] }
  | { ok: false; payload: null; issues: TerritorialAiRecordIssue[] };

export type TerritorialAiRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

export function buildTerritorialAiWorkflowRow(input: {
  proposal: TerritorialAiProposal;
  base: TerritorialAiBase;
  serpRef: TerritorialAiSerpRef | null;
  operationRequestId: string;
  generatedAt: string;
}): TerritorialAiRowInput {
  const payload: TerritorialAiPayload = TerritorialAiPayloadSchema.parse({
    contractVersion: TERRITORIAL_AI_CONTRACT_VERSION,
    proposal: input.proposal,
    base: input.base,
    baseHash: territorialAiBaseHash(input.base),
    serpRef: input.serpRef,
    provenance: { operationRequestId: input.operationRequestId, generatedAt: input.generatedAt },
  });
  return {
    subjectType: TERRITORIAL_AI_SUBJECT_TYPE,
    subjectId: input.proposal.questionId,
    stage: TERRITORIAL_AI_WORKFLOW_STAGE,
    state: territorialAiWorkflowState(input.proposal),
    sourceEntityId: input.proposal.questionId,
    // Pergunta arquitetural não pertence a um Article.
    articleId: null,
    payload,
  };
}

export function parseTerritorialAiWorkflowRow(row: TerritorialAiRowInput): TerritorialAiRecordReadResult {
  const issues: TerritorialAiRecordIssue[] = [];
  if (row.subjectType !== TERRITORIAL_AI_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== TERRITORIAL_AI_WORKFLOW_STAGE) issues.push("STAGE_MISMATCH");
  if (row.articleId) issues.push("ARTICLE_ID_PRESENT");

  const parsed = TerritorialAiPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, payload: null, issues };
  }
  if (parsed.data.proposal.questionId !== row.subjectId) issues.push("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD");
  if (row.state !== territorialAiWorkflowState(parsed.data.proposal)) issues.push("STATE_DOES_NOT_MATCH_RECOMMENDATION");

  return issues.length ? { ok: false, payload: null, issues } : { ok: true, payload: parsed.data, issues: [] };
}
