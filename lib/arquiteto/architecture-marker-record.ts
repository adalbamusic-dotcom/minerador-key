import { z } from "zod";

/**
 * MARCADOR DO CENÁRIO DE ARQUITETURA.
 *
 * A análise inteira — clusters, pontuações, razões, mapa — é reconstruída
 * deterministicamente do read-model a cada boot. O que NÃO é reconstruível é o
 * fato humano:
 *
 *     "este cenário foi processado"
 *     "esta parte dele foi confirmada"
 *
 * Só isso é persistido. Guardar uma cópia do cálculo criaria uma segunda
 * autoridade capaz de divergir da análise vigente, sem regra de desempate.
 *
 * Mesmo caminho já provado por `territory`, `territorial_serp_assessment` e
 * `territorial_ai_review`: um item de `editorial_workflow_items`, sem DDL, sem
 * artifact_type novo, sem tocar RLS.
 *
 * Domínio puro: sem storage, sem fetch.
 */

export const ARCHITECTURE_MARKER_SUBJECT_TYPE = "architecture_analysis" as const;
export const ARCHITECTURE_MARKER_WORKFLOW_STAGE = "architect" as const;
export const ARCHITECTURE_MARKER_CONTRACT_VERSION = "architecture-marker-v1" as const;
/** Um cenário vigente por marca; a UNIQUE da tabela garante isso. */
export const ARCHITECTURE_MARKER_SUBJECT_ID = "current" as const;

/**
 * Resultado da confirmação, como o readback observou.
 *
 * `partial` não é falha: significa que o que estava pronto foi aplicado e o
 * bloqueado continua pendente, sem rollback do que já valeu.
 */
export const ArchitectureConfirmationStatusSchema = z.enum(["none", "confirmed", "partial", "refused"]);
export type ArchitectureConfirmationStatus = z.infer<typeof ArchitectureConfirmationStatusSchema>;

export const ArchitectureMarkerPayloadSchema = z.object({
  contractVersion: z.literal(ARCHITECTURE_MARKER_CONTRACT_VERSION),
  /** Cenário que foi processado. Muda quando o lote muda. */
  baseHash: z.string().min(1),
  processedAt: z.string().min(1),
  confirmation: z.object({
    status: ArchitectureConfirmationStatusSchema,
    confirmedAt: z.string().nullable(),
    appliedMembershipCount: z.number().int().nonnegative(),
    confirmedSiloCount: z.number().int().nonnegative(),
    /** Silos que ficaram de fora por bloqueio próprio — pendentes, não erro. */
    pendingSiloCount: z.number().int().nonnegative(),
    /** Falhas reais de escrita: writer recusou, stale ou readback divergiu. */
    failedCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type ArchitectureMarkerPayload = z.infer<typeof ArchitectureMarkerPayloadSchema>;

/**
 * `state` da linha espelha o estágio do cenário para servir ao índice
 * (marca_id, stage, state, updated_at). É projeção: a autoridade continua no
 * payload versionado.
 */
export function architectureMarkerState(payload: ArchitectureMarkerPayload): string {
  return payload.confirmation.status === "none" ? "processed" : payload.confirmation.status;
}

/**
 * O cenário gravado ainda descreve o lote de agora?
 *
 * Muda quando entram keywords, nascem silos ou o site é ressincronizado — nunca
 * por abrir a página. `stale` não apaga: o marcador continua legível.
 */
export function architectureMarkerIsStale(input: {
  storedBaseHash: string;
  currentBaseHash: string;
}): boolean {
  return input.storedBaseHash !== input.currentBaseHash;
}

/** Estágio do cenário, para a UI dizer a verdade em uma palavra. */
export type ArchitectureScenarioState =
  | "not_processed"
  | "processed"
  | "confirmed"
  | "partially_confirmed"
  | "stale";

export function resolveArchitectureScenarioState(input: {
  marker: ArchitectureMarkerPayload | null;
  currentBaseHash: string;
}): ArchitectureScenarioState {
  if (!input.marker) return "not_processed";
  if (architectureMarkerIsStale({ storedBaseHash: input.marker.baseHash, currentBaseHash: input.currentBaseHash })) {
    return "stale";
  }
  if (input.marker.confirmation.status === "confirmed") return "confirmed";
  if (input.marker.confirmation.status === "partial") return "partially_confirmed";
  return "processed";
}

export const ARCHITECTURE_SCENARIO_LABELS: Record<ArchitectureScenarioState, string> = {
  not_processed: "Não processada",
  processed: "Processada",
  confirmed: "Confirmada",
  partially_confirmed: "Parcialmente confirmada",
  stale: "Desatualizada",
};

export type ArchitectureMarkerRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

export function buildArchitectureMarkerRow(payload: ArchitectureMarkerPayload): ArchitectureMarkerRowInput {
  const parsed = ArchitectureMarkerPayloadSchema.parse(payload);
  return {
    subjectType: ARCHITECTURE_MARKER_SUBJECT_TYPE,
    subjectId: ARCHITECTURE_MARKER_SUBJECT_ID,
    stage: ARCHITECTURE_MARKER_WORKFLOW_STAGE,
    state: architectureMarkerState(parsed),
    sourceEntityId: parsed.baseHash,
    // O cenário do lote não pertence a um Article.
    articleId: null,
    payload: parsed,
  };
}

export type ArchitectureMarkerIssue =
  | "SUBJECT_TYPE_MISMATCH"
  | "STAGE_MISMATCH"
  | "PAYLOAD_INVALID"
  | "STATE_DOES_NOT_MATCH_PAYLOAD"
  | "ARTICLE_ID_PRESENT";

export type ArchitectureMarkerReadResult =
  | { ok: true; payload: ArchitectureMarkerPayload; issues: [] }
  | { ok: false; payload: null; issues: ArchitectureMarkerIssue[] };

export function parseArchitectureMarkerRow(row: ArchitectureMarkerRowInput): ArchitectureMarkerReadResult {
  const issues: ArchitectureMarkerIssue[] = [];
  if (row.subjectType !== ARCHITECTURE_MARKER_SUBJECT_TYPE) issues.push("SUBJECT_TYPE_MISMATCH");
  if (row.stage !== ARCHITECTURE_MARKER_WORKFLOW_STAGE) issues.push("STAGE_MISMATCH");
  if (row.articleId) issues.push("ARTICLE_ID_PRESENT");

  const parsed = ArchitectureMarkerPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    issues.push("PAYLOAD_INVALID");
    return { ok: false, payload: null, issues };
  }
  if (row.state !== architectureMarkerState(parsed.data)) issues.push("STATE_DOES_NOT_MATCH_PAYLOAD");

  return issues.length ? { ok: false, payload: null, issues } : { ok: true, payload: parsed.data, issues: [] };
}
