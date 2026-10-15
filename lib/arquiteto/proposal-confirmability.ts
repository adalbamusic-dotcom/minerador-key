/**
 * A PROPOSTA DA ARQUITETURA, POR KEYWORD: O QUE A TELA MOSTRA É O QUE
 * "CONFIRMAR PROPOSTAS NOVAS" CONFIRMA (2026-10-14, caso WifiConecta, azul).
 *
 * A tabela de Silos marcava "Aguardando confirmação" para toda atribuição da
 * proposta que diferia do gravado — inclusive as que apontam para um Silo que
 * a pessoa DESFEZ (o clique as conta como "já estavam") e as de keyword presa
 * a um artigo (o clique as deixa onde estão). E o clique respondia "Nada a
 * confirmar no cenário atual" olhando OUTRO plano (o do analisador), enquanto
 * a tela mostrava três "Aguardando confirmação".
 *
 * Uma leitura só, usada pela tabela, pela contagem e pelo clique:
 *
 *   confirmed         já está no destino da proposta;
 *   confirmable       o clique grava (destino existe e a keyword pode ir);
 *   fixed_in_article  difere, mas a keyword está num artigo / Silo fechado:
 *                     fica onde está (mexer é revisão do artigo);
 *   rejected_silo     o destino é um Silo desfeito: não é recriado;
 *   missing_silo      o destino é um Silo proposto que ainda não existe:
 *                     "Processar arquitetura" o cria.
 *
 * Domínio puro.
 */

export type ProposalAssignmentState = "confirmed" | "confirmable" | "fixed_in_article" | "rejected_silo" | "missing_silo";

export function classifyProposalAssignment(input: {
  /** O `territoryRef` real do destino (`null` = proposto que não existe ou desfeito). */
  destination: string | null;
  /** O destino é um Silo que a pessoa desfez. */
  destinationRejected: boolean;
  currentTerritoryRef: string | null;
  /** Keyword que não sai do Silo atual pela proposta (artigo, formação, Silo fechado). */
  fixed: boolean;
}): ProposalAssignmentState {
  if (!input.destination) return input.destinationRejected ? "rejected_silo" : "missing_silo";
  if (input.currentTerritoryRef === input.destination) return "confirmed";
  if (input.currentTerritoryRef && input.fixed) return "fixed_in_article";
  return "confirmable";
}

/** O rótulo da coluna "Proposto" na tabela de Silos. */
export function proposalAssignmentStatusLabel(state: ProposalAssignmentState, options: { declaredPlanSilo?: boolean } = {}): string {
  switch (state) {
    case "confirmed": return "Confirmada";
    case "confirmable": return "Aguardando confirmação";
    case "fixed_in_article": return "Fica no Silo atual · keyword em artigo (mexer é revisão do artigo)";
    case "rejected_silo": return options.declaredPlanSilo
      ? "Silo do plano desfeito · use “Recriar o Silo do plano”"
      : "Silo desfeito · não será recriado";
    case "missing_silo": return "Silo ainda não criado · “Processar arquitetura” cria";
  }
}

/** A frase do clique quando não há o que gravar — dizendo o que a tela mostra e por quê. */
export function nothingToConfirmMessage(counts: Partial<Record<ProposalAssignmentState, number>>, options: { declaredPlanSilo?: boolean } = {}): string {
  const partes: string[] = [];
  if (counts.rejected_silo) partes.push(`${counts.rejected_silo} apontam para Silo desfeito${options.declaredPlanSilo ? " (o Silo do plano: use “Recriar o Silo do plano”)" : " (não é recriado)"}`);
  if (counts.fixed_in_article) partes.push(`${counts.fixed_in_article} estão em artigo e ficam no Silo atual`);
  if (counts.missing_silo) partes.push(`${counts.missing_silo} esperam o Silo proposto ser criado (“Processar arquitetura”)`);
  return partes.length ? `Nada a confirmar: ${partes.join("; ")}.` : "Nada a confirmar no cenário atual.";
}

/**
 * 2026-10-15 (noite) · readback da WifiConecta azul: depois de "Processar
 * arquitetura" com tudo reusado (SILOS_REUSED = 1, nada novo), o clique em
 * "Confirmar propostas novas" disparava "Nada a confirmar no cenário atual."
 * como notificação de ERRO. Não há erro: não há o que confirmar.
 *
 * Uma leitura só para o botão e para o clique: `null` = há o que gravar;
 * senão, o motivo — o botão fica DESABILITADO com ele no `title`, e o clique
 * (se chegar) avisa como informação (Silo ainda não pronto = aviso), nunca erro.
 */
export type ArchitectureConfirmBlocker = { tone: "info" | "warning"; message: string };

export function architectureConfirmBlocker(input: {
  confirmTerritoryCount: number;
  assignmentCount: number;
  /** O que a tabela marca como "Aguardando confirmação" (o que o clique grava). */
  confirmableCount: number;
  skipped: readonly { label: string; blockers: readonly string[] }[];
  counts: Partial<Record<ProposalAssignmentState, number>>;
  declaredPlanSilo?: boolean;
}): ArchitectureConfirmBlocker | null {
  if (input.confirmTerritoryCount > 0 || input.assignmentCount > 0 || input.confirmableCount > 0) return null;
  if (input.skipped.length) return { tone: "warning", message: `Nenhum silo está pronto. ${input.skipped[0].label}: ${input.skipped[0].blockers.join(" ")}` };
  return { tone: "info", message: nothingToConfirmMessage(input.counts, { declaredPlanSilo: input.declaredPlanSilo }) };
}
