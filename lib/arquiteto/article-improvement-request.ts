import { z } from "zod";
export const ArticleImprovementRequestSchema = z.object({
  brandId: z.string().uuid(), action: z.enum(["prepare", "status", "collect", "apply"]),
  runId: z.string().uuid().optional(), targetIds: z.array(z.string().min(1)).max(200).optional(),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  authorizedCostUsd: z.number().positive().max(1).optional(), approveNewKeywords: z.boolean().optional(),
}).strict().superRefine((v, c) => {
  if (v.action !== "prepare" && !v.runId) c.addIssue({ code: "custom", message: "runId é obrigatório." });
  if ((v.action === "apply" || v.action === "collect") && !v.decisionHash) c.addIssue({ code: "custom", message: "Use o hash da prévia vigente." });
});
export type ArticleImprovementRequest = z.infer<typeof ArticleImprovementRequestSchema>;
