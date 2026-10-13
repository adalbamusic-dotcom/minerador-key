import { z } from "zod";
export const ArticleImprovementRequestSchema = z.object({
  brandId: z.string().uuid(), action: z.enum(["prepare", "status", "collect", "apply"]),
  runId: z.string().uuid().optional(), targetIds: z.array(z.string().min(1)).max(200).optional(),
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  authorizedCostUsd: z.number().positive().max(1).optional(), approveNewKeywords: z.boolean().optional(),
  /** Busca nova no Google Ads no prepare: só quando o dono pede (2026-10-12). Ausente = não busca. */
  discover: z.boolean().optional(),
  /**
   * F5 — "Refazer mesmo assim" (D11): com os mesmos insumos, o prepare chama a
   * IA, as medições e (se pedida) a busca de novo, em vez de reaproveitar a
   * execução anterior. Só com o motivo dito pelo humano.
   */
  reworkOverride: z.object({ reason: z.string().trim().min(5).max(500) }).strict().optional(),
  /**
   * SDD acelerar 2026-10-13, item 4 — "Formar os artigos do plano · <cor>": o
   * prepare lê só o recorte do grupo (cor, uuid ou "sem-grupo"). Ausente = a
   * leitura de sempre (mesma impressão digital da guarda).
   */
  group: z.string().trim().min(1).max(60).optional(),
}).strict().superRefine((v, c) => {
  if (v.action !== "prepare" && !v.runId) c.addIssue({ code: "custom", message: "runId é obrigatório." });
  if ((v.action === "apply" || v.action === "collect") && !v.decisionHash) c.addIssue({ code: "custom", message: "Use o hash da prévia vigente." });
});
export type ArticleImprovementRequest = z.infer<typeof ArticleImprovementRequestSchema>;
