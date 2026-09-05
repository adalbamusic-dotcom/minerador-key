import { z } from "zod";
import { TerritorialSerpAssessmentSchema, type TerritorialSerpAssessment, type TerritorialSerpQuestion } from "./territorial-serp.ts";

/**
 * REGISTRO CANÔNICO REMOTO DO PARECER DE SERP TERRITORIAL.
 *
 * Mesma escolha já provada pelo `territory` e pelo `silo_working_copy`: um item
 * de `editorial_workflow_items` por pergunta, na tabela genérica e no mesmo
 * `stage`. `subject_type` e `state` são texto livre (CHECK só de comprimento),
 * `article_id` é anulável, `payload` é jsonb de objeto e `lock_version` já dá
 * concorrência otimista. NENHUMA migration, nenhum artifact_type novo, nenhuma
 * mudança de RLS — a policy da tabela filtra por marca, não por subject_type.
 *
 * A alternativa recusada foi `editorial_serp_snapshots`: aquela tabela é
 * indexada por `article_id`, e a pergunta arquitetural não pertence a um
 * Article. Forçá-la ali exigiria fabricar um Article que não existe.
 *
 * Domínio puro: sem storage, sem fetch. Este módulo só define o contrato.
 */

export const TERRITORIAL_SERP_SUBJECT_TYPE = "territorial_serp_assessment" as const;
export const TERRITORIAL_SERP_WORKFLOW_STAGE = "architect" as const;
export const TERRITORIAL_SERP_CONTRACT_VERSION = "territorial-serp-record-v1" as const;

/**
 * Hash da arquitetura que a pergunta estava validando.
 *
 * Muda quando muda algo que ALTERA A PERGUNTA — cabeceira, conjunto de
 * keywords relevante, silo alvo, estrutura publicada alvo, contexto. Não entra
 * aqui nada de seleção visual, zoom, posição de canvas ou timestamp: isso
 * invalidaria evidência boa por motivo nenhum.
 */
export const TerritorialSerpBaseSchema = z.object({
  kind: z.string().min(1),
  territoryRef: z.string().nullable(),
  comparedTerritoryRef: z.string().nullable(),
  /** As consultas que definem a pergunta, em ordem estável. */
  queries: z.array(z.string().min(1)),
  /** Identidade arquitetural do alvo: entidade, intenção, fronteira, página. */
  subjectFacts: z.array(z.string()),
}).strict();
export type TerritorialSerpBase = z.infer<typeof TerritorialSerpBaseSchema>;

export const TerritorialSerpPayloadSchema = z.object({
  contractVersion: z.literal(TERRITORIAL_SERP_CONTRACT_VERSION),
  assessment: TerritorialSerpAssessmentSchema,
  /** O que estava sendo validado; sustenta a detecção de desatualização. */
  base: TerritorialSerpBaseSchema,
  baseHash: z.string().min(1),
  /** Proveniência da evidência. `provider` é interno e não vai para a UI. */
  provenance: z.object({
    operationRequestId: z.string().min(1),
    collectedAt: z.string().min(1),
  }).strict(),
}).strict();
export type TerritorialSerpPayload = z.infer<typeof TerritorialSerpPayloadSchema>;

/**
 * Estado da linha, espelhando a recomendação do parecer.
 *
 * Espelho é projeção, não segunda fonte: serve ao índice
 * (marca_id, stage, state, updated_at) e é RECUSADO na leitura quando diverge.
 */
export function territorialSerpWorkflowState(assessment: TerritorialSerpAssessment): string {
  return assessment.recommendation;
}

/** Ordem estável: hash não pode depender da ordem em que a UI montou a lista. */
const stable = (values: readonly string[]) => [...values].map(value => value.trim()).filter(Boolean).sort();

/**
 * Descreve o que a pergunta estava validando.
 *
 * Recebe os fatos arquiteturais de fora — o módulo não vai buscar nada. Quem
 * chama decide o que é relevante; aqui só se garante ordem e limpeza.
 */
export function buildTerritorialSerpBase(input: {
  question: Pick<TerritorialSerpQuestion, "kind" | "territoryRef" | "comparedTerritoryRef" | "queries">;
  /** `centralEntity`, `macroIntent`, fronteira, slug publicado, cabeceira… */
  subjectFacts: readonly string[];
}): TerritorialSerpBase {
  return TerritorialSerpBaseSchema.parse({
    kind: input.question.kind,
    territoryRef: input.question.territoryRef,
    comparedTerritoryRef: input.question.comparedTerritoryRef,
    queries: input.question.queries.map(query => query.keyword.trim().toLowerCase()),
    subjectFacts: stable(input.subjectFacts),
  });
}

/**
 * Hash determinístico da base. Mesma base, mesmo hash, em qualquer máquina.
 *
 * Deliberadamente síncrono e sem crypto: precisa rodar igual no servidor e no
 * navegador, e o objetivo é detectar mudança, não resistir a adversário.
 */
export function territorialSerpBaseHash(base: TerritorialSerpBase): string {
  const canonical = JSON.stringify([
    base.kind, base.territoryRef, base.comparedTerritoryRef, base.queries, base.subjectFacts,
  ]);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `base:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/**
 * O parecer ainda vale para a arquitetura de agora?
 *
 * `stale` NÃO apaga: o parecer continua legível, marcado como desatualizado.
 * Histórico de evidência é patrimônio, não lixo.
 */
export function territorialSerpIsStale(input: {
  storedBaseHash: string;
  currentBase: TerritorialSerpBase;
}): boolean {
  return input.storedBaseHash !== territorialSerpBaseHash(input.currentBase);
}

export type TerritorialSerpRecordIssue =
  | "SUBJECT_TYPE_MISMATCH"
  | "STAGE_MISMATCH"
  | "SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD"
  | "STATE_DOES_NOT_MATCH_RECOMMENDATION"
  | "PAYLOAD_INVALID"
  | "ARTICLE_ID_PRESENT";

export type TerritorialSerpRecordReadResult =
  | { ok: true; payload: TerritorialSerpPayload; issues: [] }
  | { ok: false; payload: null; issues: TerritorialSerpRecordIssue[] };

export type TerritorialSerpRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

/** Monta a linha remota. `subject_id` É o `questionId`. */
export function buildTerritorialSerpWorkflowRow(input: {
  assessment: TerritorialSerpAssessment;
  base: TerritorialSerpBase;
  operationRequestId: string;
}): TerritorialSerpRowInput {
  const payload: TerritorialSerpPayload = TerritorialSerpPayloadSchema.parse({
    contractVersion: TERRITORIAL_SERP_CONTRACT_VERSION,
    assessment: input.assessment,
    base: input.base,
    baseHash: territorialSerpBaseHash(input.base),
    provenance: {
      operationRequestId: input.operationRequestId,
      collectedAt: input.assessment.collectedAt,
    },
  });
  return {
    subjectType: TERRITORIAL_SERP_SUBJECT_TYPE,
    subjectId: input.assessment.questionId,
    stage: TERRITORIAL_SERP_WORKFLOW_STAGE,
    state: territorialSerpWorkflowState(input.assessment),
    // A pergunta é a origem de si mesma; não há artefato anterior a citar.
    sourceEntityId: input.assessment.questionId,
    // Pergunta arquitetural NÃO pertence a um Article.
    articleId: null,
    payload,
  };
}

/** Lê a linha remota recusando incoerência em vez de reconciliar em silêncio. */
export function parseTerritorialSerpWorkflowRow(row: TerritorialSerpRowInput): TerritorialSerpRecordReadResult {
  const issues: TerritorialSerpRecordIssue[] = [];
  if (row.subjectType !== TERRITORIAL_SERP_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== TERRITORIAL_SERP_WORKFLOW_STAGE) issues.push("STAGE_MISMATCH");
  if (row.articleId) issues.push("ARTICLE_ID_PRESENT");

  const parsed = TerritorialSerpPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, payload: null, issues };
  }
  if (parsed.data.assessment.questionId !== row.subjectId) issues.push("SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD");
  if (row.state !== territorialSerpWorkflowState(parsed.data.assessment)) issues.push("STATE_DOES_NOT_MATCH_RECOMMENDATION");

  return issues.length ? { ok: false, payload: null, issues } : { ok: true, payload: parsed.data, issues: [] };
}
