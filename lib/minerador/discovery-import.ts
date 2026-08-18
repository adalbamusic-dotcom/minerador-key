import { z } from "zod";

const UuidSchema = z.string().uuid();

export const DiscoveryImportRequestSchema = z.object({
  importRequestId: UuidSchema,
  candidateIds: z.array(UuidSchema).min(1).max(1000),
}).superRefine((value, context) => {
  if (new Set(value.candidateIds).size !== value.candidateIds.length) {
    context.addIssue({ code: "custom", path: ["candidateIds"], message: "candidateIds não pode conter duplicatas." });
  }
});

export const DiscoveryImportResultItemSchema = z.object({
  candidateId: UuidSchema,
  keyword: z.string().trim().min(1).optional(),
  source: z.enum(["google_ads", "manual", "csv"]).optional(),
  keywordId: UuidSchema.nullable().optional(),
  outcome: z.enum(["created", "already_existing", "failed"]),
  reason: z.string().trim().min(1).optional(),
  errorCode: z.string().trim().min(1).max(80).optional(),
});

export const DiscoveryImportResponseSchema = z.object({
  batchId: UuidSchema,
  status: z.enum(["completed", "partial", "failed"]),
  selected: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  alreadyExisting: z.number().int().nonnegative(),
  linked: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  failureReasons: z.array(z.object({ candidateId: UuidSchema, keyword: z.string().trim().min(1).optional(), source: z.enum(["google_ads", "manual", "csv"]).optional(), reason: z.string().trim().min(1), errorCode: z.string().trim().min(1).max(80).optional() })).default([]),
  resultItems: z.array(DiscoveryImportResultItemSchema).default([]),
  idempotent: z.boolean().default(false),
});

export type DiscoveryImportRequest = z.infer<typeof DiscoveryImportRequestSchema>;
export type DiscoveryImportResponse = z.infer<typeof DiscoveryImportResponseSchema>;
export type DiscoveryImportOutcome = z.infer<typeof DiscoveryImportResultItemSchema>["outcome"];

export function discoveryImportOutcomeLabel(outcome: DiscoveryImportOutcome) {
  return outcome === "created" ? "Enviada ao Processador" : outcome === "already_existing" ? "Já existe no Processador" : "Falha na importação";
}
