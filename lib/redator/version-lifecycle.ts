/**
 * ===== CORTE 3 · AS REGRAS DA SUCESSÃO DE VERSÕES, SEM I/O =====
 *
 * Separado de `lib/server/writer-retention.ts` de propósito: o que decide
 * QUANDO marcar uma versão como substituída é regra de produto, e regra de
 * produto precisa ser testável sem banco, sem `server-only` e sem mock.
 *
 * O módulo do servidor lê, chama a RPC e trata falha. Ele não decide nada que
 * não esteja aqui.
 *
 * Invariantes que estas funções sustentam (docs/00-produto/invariantes.md §65-69):
 *
 *   PURGE_BY_AGE_ONLY = NO
 *   ONLY_AFTER_CONFIRMED_REPLACEMENT = YES
 *   RECOVERY_WINDOW_AFTER_REPLACEMENT = 48H
 */

/** A janela conta de `superseded_at`, nunca de `created_at`. */
export const RECOVERY_WINDOW_HOURS = 48;

/**
 * O fim da janela, calculado do mesmo jeito que o CHECK da M2:
 *   purge_after = superseded_at + interval '48 hours'
 *
 * Existe dos dois lados de propósito. O banco é quem GARANTE; este cálculo é o
 * que permite à interface dizer até quando dá para recuperar sem ir perguntar.
 * Se um dia divergirem, o teste que compara os dois falha antes do usuário.
 */
export function recoveryWindowEnd(supersededAt: string | Date): string {
  const inicio = supersededAt instanceof Date ? supersededAt : new Date(supersededAt);
  if (Number.isNaN(inicio.getTime())) throw new Error("retention_invalid_superseded_at");
  return new Date(inicio.getTime() + RECOVERY_WINDOW_HOURS * 3600_000).toISOString();
}

export type SupersedeSkipReason =
  /** Gravação idempotente: nenhuma versão nova nasceu, então nada foi substituído. */
  | "unchanged_save"
  /** Primeira versão do documento ou entregável: não há predecessor. */
  | "no_predecessor"
  /** O predecessor É a corrente. Marcá-lo abriria janela sobre a única cópia viva. */
  | "predecessor_is_current"
  /** O readback não confirmou o sucessor como corrente. Sem confirmação, não se marca. */
  | "successor_not_current";

export type SupersedeDecision =
  | { action: "mark"; predecessorVersionId: string; successorVersionId: string }
  | { action: "skip"; reason: SupersedeSkipReason };

/**
 * A REGRA.
 *
 * A ordem das recusas importa. `successor_not_current` vem primeiro porque um
 * sucessor não confirmado torna irrelevante qualquer coisa sobre o predecessor:
 * se o readback divergiu, a gravação não é confiável, e abrir janela sobre a
 * versão anterior nessa situação é exatamente o erro que a ordem em duas fases
 * existe para impedir.
 *
 * `predecessor_is_current` parece impossível e não é: basta a leitura do
 * predecessor vir de uma consulta defasada. A recusa é barata; a alternativa
 * seria marcar a única cópia viva para eliminação.
 */
export function planSupersede(input: {
  unchanged: boolean;
  successorVersionId: string | null | undefined;
  currentVersionId: string | null | undefined;
  predecessorVersionId: string | null | undefined;
}): SupersedeDecision {
  if (input.unchanged) return { action: "skip", reason: "unchanged_save" };
  if (!input.successorVersionId || input.currentVersionId !== input.successorVersionId) {
    return { action: "skip", reason: "successor_not_current" };
  }
  if (!input.predecessorVersionId) return { action: "skip", reason: "no_predecessor" };
  if (input.predecessorVersionId === input.currentVersionId) {
    return { action: "skip", reason: "predecessor_is_current" };
  }
  return { action: "mark", predecessorVersionId: input.predecessorVersionId, successorVersionId: input.successorVersionId };
}

export type SupersedeOutcome =
  | { status: "marked"; predecessorVersionId: string; supersededAt: string | null; purgeAfter: string | null }
  | { status: "already_marked"; predecessorVersionId: string }
  | { status: "skipped"; reason: SupersedeSkipReason }
  /** A M2 ainda não foi aplicada. Estado esperado, não é falha. */
  | { status: "unavailable" }
  /** A RPC recusou. O sucessor continua corrente; o predecessor fica retido. */
  | { status: "failed"; code: string };

/** Autoridade da versão corrente de um entregável. `column` só existe depois da M2. */
export type CurrentVersionAuthority = "column" | "max_version_number";

/**
 * Marcar exige autoridade EXPLÍCITA.
 *
 * Antes da M2, a corrente de roteiro/carrossel é deduzida por
 * `max(version_number)` — e deduzir a corrente é exatamente o que não pode
 * governar a operação que apaga as outras. Uma leitura defasada apagaria a
 * versão viva. Enquanto a autoridade for deduzida, não se marca nada.
 */
export function canMarkWithAuthority(authority: CurrentVersionAuthority): boolean {
  return authority === "column";
}
