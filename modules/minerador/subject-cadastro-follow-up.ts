import type { DeclaredPlanPreview } from "../../lib/minerador/declared-plan-import-core.ts";

/**
 * O CARD RESOLVE O QUE A PRÉVIA JÁ SABE (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 9, D9).
 *
 * Na prévia do "Cadastrar Assuntos", duas caixas — NUNCA marcadas por padrão —
 * que só valem depois do cadastro gravado e relido:
 *
 *   - "Excluir as k sobras (apaga de vez — decisão sua)": só a sobra NÃO
 *     publicada e NUNCA enviada ao Arquiteto (o servidor diz quais, `deletable`).
 *     Abre a MESMA confirmação de exclusão do Minerador (prévia do servidor +
 *     nome digitado). Keyword não publicada é excluída DEFINITIVAMENTE (C20).
 *   - "Reaprovar as N que voltaram a Em revisão (só a Lógica é exigida)": as
 *     aprovadas que o cadastro devolve a "Em revisão"; a rota
 *     `…/plans/reapprove` roda a Lógica e aprova pelos núcleos do Minerador.
 *
 * Funções puras, mais a chamada da rota.
 */

export const CADASTRO_FOLLOW_UP_TEXTS = {
  title: "Depois de cadastrar",
  deleteLabel: (count: number) => count === 1 ? "Excluir a sobra (apaga de vez — decisão sua)" : `Excluir as ${count} sobras (apaga de vez — decisão sua)`,
  deleteHelp: "Depois do cadastro, abre a confirmação de exclusão do Minerador, com o nome digitado. Keyword não publicada é EXCLUÍDA DEFINITIVAMENTE: não existe lixeira recuperável para ela. Só entram as sobras não publicadas e nunca enviadas ao Arquiteto.",
  deleteBlocked: (count: number) => `${count} sobra(s) não podem sair por aqui (motivo na lista).`,
  reapproveLabel: (count: number) => count === 1 ? "Reaprovar a que voltou a Em revisão (só a Lógica é exigida)" : `Reaprovar as ${count} que voltaram a Em revisão (só a Lógica é exigida)`,
  reapproveHelp: "Depois do cadastro gravado, a Lógica roda (grátis) e a aprovação é refeita pelo mesmo núcleo da planilha. A que não puder ser aprovada volta com o motivo; nada é enviado ao Arquiteto aqui.",
} as const;

/** As aprovadas que o cadastro devolve a "Em revisão": as mesmas que a prévia conta em `approvedToReview`. */
export function cadastroReapprovalIds(preview: Pick<DeclaredPlanPreview, "articles">): string[] {
  const ids = new Set<string>();
  for (const article of preview.articles) {
    if (article.change === "unchanged") continue;
    if (article.subject.keywordId && article.subject.status === "aprovado") ids.add(article.subject.keywordId);
    if (article.principal.keywordId && article.principal.status === "aprovado") ids.add(article.principal.keywordId);
  }
  return [...ids];
}

export type CadastroLeftover = DeclaredPlanPreview["leftovers"][number];

/** As sobras oferecidas (o servidor confirmou `deletable`) e as que ficam, com o motivo. Sem a resposta do servidor, nenhuma é oferecida. */
export function cadastroLeftoversToDelete(preview: Pick<DeclaredPlanPreview, "leftovers">): { deletable: CadastroLeftover[]; blocked: CadastroLeftover[] } {
  const deletable = preview.leftovers.filter(item => item.deletable === true);
  return { deletable, blocked: preview.leftovers.filter(item => item.deletable !== true) };
}

export type CadastroReapprovalResult =
  | { ok: true; approved: number; unchanged: number; refused: Array<{ id: string; keyword: string; reason: string }> }
  | { ok: false; message: string };

/** Chama `…/plans/reapprove` só com as ids da prévia. Falha não desfaz o cadastro (diz o que ficou). */
export async function requestCadastroReapproval(brandId: string, keywordIds: readonly string[]): Promise<CadastroReapprovalResult> {
  try {
    const response = await fetch(`/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/reapprove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ keywordIds: [...new Set(keywordIds)] }),
    });
    const body = await response.json().catch(() => ({})) as { success?: unknown; message?: unknown; results?: unknown };
    if (!response.ok || body.success !== true || !Array.isArray(body.results)) {
      return { ok: false, message: typeof body.message === "string" ? body.message : "A reaprovação não pôde ser feita agora. O cadastro continua gravado; aprove pela planilha." };
    }
    const results = body.results as Array<{ id?: unknown; keyword?: unknown; outcome?: unknown; reason?: unknown }>;
    return {
      ok: true,
      approved: results.filter(item => item.outcome === "applied").length,
      unchanged: results.filter(item => item.outcome === "unchanged").length,
      refused: results
        .filter(item => item.outcome !== "applied" && item.outcome !== "unchanged")
        .map(item => ({ id: String(item.id || ""), keyword: typeof item.keyword === "string" ? item.keyword : "", reason: typeof item.reason === "string" && item.reason ? item.reason : "não pôde ser aprovada agora" })),
    };
  } catch {
    return { ok: false, message: "Sem conexão para reaprovar. O cadastro continua gravado; aprove pela planilha." };
  }
}
