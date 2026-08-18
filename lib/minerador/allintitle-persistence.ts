import { z } from "zod";

export const ALLINTITLE_PERSISTENCE_STATUSES = [
  "success",
  "zero_results",
  "unavailable",
  "captcha",
  "blocked",
  "error",
  "timeout",
  "cancelled",
] as const;

const AllintitlePersistenceCommonSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(ALLINTITLE_PERSISTENCE_STATUSES),
  resultsAllintitle: z.number().int().min(0).nullable().optional(),
  measuredAt: z.string().datetime(),
  errorCode: z.string().trim().min(1).max(120).nullable().optional(),
  message: z.string().trim().min(1).max(500).nullable().optional(),
}).strict();

export const AllintitlePersistenceItemSchema = z.union([
  AllintitlePersistenceCommonSchema.extend({ targetKind: z.literal("keyword").optional(), keywordId: z.string().uuid(), candidateId: z.never().optional() }).strict(),
  AllintitlePersistenceCommonSchema.extend({ targetKind: z.literal("discovery_candidate"), candidateId: z.string().uuid(), keywordId: z.never().optional() }).strict(),
]);

export const AllintitlePersistenceRequestSchema = z.object({
  operationRequestId: z.string().uuid(),
  batchId: z.string().uuid(),
  results: z.array(AllintitlePersistenceItemSchema).min(1).max(10),
}).strict();

export type AllintitlePersistenceItem = z.infer<typeof AllintitlePersistenceItemSchema>;
export type AllintitlePersistenceRequest = z.infer<typeof AllintitlePersistenceRequestSchema>;
export type AllintitlePersistenceOutcome = "persisted" | "preserved" | "rejected" | "failed";

export function allintitlePersistenceDecision(item: AllintitlePersistenceItem):
  | { outcome: "persisted"; value: number }
  | { outcome: "preserved"; reason: string }
  | { outcome: "rejected"; reason: string } {
  if (item.status === "success") {
    if (typeof item.resultsAllintitle !== "number" || !Number.isSafeInteger(item.resultsAllintitle) || item.resultsAllintitle < 0) {
      return { outcome: "rejected", reason: "confirmed_value_required" };
    }
    return { outcome: "persisted", value: item.resultsAllintitle };
  }
  if (item.status === "zero_results") {
    if (item.resultsAllintitle !== 0) return { outcome: "rejected", reason: "zero_value_required" };
    return { outcome: "persisted", value: 0 };
  }
  return { outcome: "preserved", reason: "measurement_not_confirmed" };
}

export type AllintitlePersistenceResponseItem = {
  requestId: string;
  targetKind: "keyword" | "discovery_candidate";
  keywordId: string | null;
  candidateId: string | null;
  outcome: AllintitlePersistenceOutcome;
  resultsAllintitle: number | null;
  reason: string | null;
};
