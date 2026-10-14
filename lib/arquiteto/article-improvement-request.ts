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
  /**
   * F3 · LER ANTES DE BUSCAR (SDD 2026-10-13, item 3; D4). Ausente = o prepare
   * só LÊ o que já temos (DNA, volume medido, "sem média" < 30 dias, SERP em
   * cache, Assunto, plano, trava, lista da Pesquisa por Assunto) e devolve o
   * plano "já temos · falta · custa" em `reading`, sem chamar IA nem Google
   * Ads. Com o aceite desse plano: `ai` chama a leitura da IA (OpenRouter) e
   * `measure` mede no Google Ads (cota, sem custo em dólar) só o que falta.
   */
  authorizeReading: z.object({ ai: z.boolean().optional(), measure: z.boolean().optional() }).strict().optional(),
  /**
   * F5 · PLANILHA PRIMEIRO (SDD 2026-10-13 `sdd-arquiteto-so-le-e-listas-leves`,
   * item 5). Aditivos; ausentes = o contrato de sempre.
   * - `origin: "plan_sheet"`: a execução nasce da planilha "Artigos do plano"
   *   (o painel da melhoria não a retoma) e o prepare recusa POR ITEM o alvo
   *   que não é Assunto do plano recebido (em vez de recusar o lote inteiro);
   * - `principalChoice` (alvo → keyword): "Trocar principal" do artigo do plano
   *   com trava LIVRE, escolhida pelo humano entre as candidatas da regra única
   *   (`planPrincipalSwapCandidates`); travada ou fora da regra = recusa da linha;
   * - `excludePlanArticles`: o painel de texto da melhoria fica para publicados
   *   (o recorte do plano sai dele; a porta do plano é a planilha).
   */
  origin: z.literal("plan_sheet").optional(),
  principalChoice: z.record(z.string().min(1), z.string().min(1)).refine(value => Object.keys(value).length <= 200, "Até 200 escolhas.").optional(),
  excludePlanArticles: z.boolean().optional(),
}).strict().superRefine((v, c) => {
  if (v.action !== "prepare" && !v.runId) c.addIssue({ code: "custom", message: "runId é obrigatório." });
  if ((v.action === "apply" || v.action === "collect") && !v.decisionHash) c.addIssue({ code: "custom", message: "Use o hash da prévia vigente." });
});
export type ArticleImprovementRequest = z.infer<typeof ArticleImprovementRequestSchema>;
