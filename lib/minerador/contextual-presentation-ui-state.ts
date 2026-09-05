import type { MineradorProcessState } from "./process-state.ts";

/**
 * Estado visual único da Apresentação Contextual.
 *
 * A fonte canônica é o artifact persistido `keyword_contextual_presentation`.
 * A working copy da sessão só aparece quando a geração passou mas o write
 * falhou — e nesse caso a UI diz explicitamente que não foi persistida. O
 * `ai_review` R5 permanece histórico e nunca é lido aqui.
 */
export type ContextualPresentationUiState =
  | "not_executed"
  | "running"
  | "success_persisted"
  | "success_session_unpersisted"
  | "failed_without_result"
  | "failed_with_previous_persisted";

export type ContextualPresentationUiInput = {
  /** Apresentação persistida lida do artifact remoto. */
  hasPersistedPresentation?: boolean;
  /** Working copy da sessão para esta keyword, quando existir. */
  hasSessionPresentation: boolean;
  running?: boolean;
  lastAttemptFailed?: boolean;
};

export function deriveContextualPresentationUiState(input: ContextualPresentationUiInput): ContextualPresentationUiState {
  if (input.running) return "running";
  // Artifact remoto vence working copy; working copy vence estado vazio.
  if (input.hasPersistedPresentation) {
    return input.lastAttemptFailed ? "failed_with_previous_persisted" : "success_persisted";
  }
  if (input.hasSessionPresentation) return "success_session_unpersisted";
  return input.lastAttemptFailed ? "failed_without_result" : "not_executed";
}

/** Um resultado disponível mantém o check verde mesmo após uma tentativa falha. */
export function contextualPresentationHasResult(state: ContextualPresentationUiState): boolean {
  return state === "success_persisted" || state === "success_session_unpersisted" || state === "failed_with_previous_persisted";
}

export function contextualPresentationIsPersisted(state: ContextualPresentationUiState): boolean {
  return state === "success_persisted" || state === "failed_with_previous_persisted";
}

export const CONTEXTUAL_PRESENTATION_PERSISTED_HINT = "Apresentação contextual persistida: reidratada do artifact da keyword.";
export const CONTEXTUAL_PRESENTATION_SESSION_HINT = "Gerada nesta sessão · não foi possível persistir. F5 não vai recuperá-la.";
export const CONTEXTUAL_PRESENTATION_OPTIONAL_HINT = "Apresentação contextual não executada. A IA é opcional e não bloqueia nenhuma etapa.";

/** Rótulo curto para o resumo da Decisão; nunca "Pendente" com resultado disponível. */
export function contextualPresentationDecisionLabel(state: ContextualPresentationUiState): string {
  if (state === "running") return "Executando";
  if (contextualPresentationIsPersisted(state)) return "Persistida";
  if (state === "success_session_unpersisted") return "Sessão";
  if (state === "failed_without_result") return "Falhou";
  return "Opcional";
}

/**
 * Projeção para a faixa de processos. O `artifactState` só descreve artefato
 * canônico quando a apresentação está realmente persistida.
 */
export function contextualPresentationProcessState(state: ContextualPresentationUiState): MineradorProcessState {
  if (state === "running") {
    return { attemptState: "running", artifactState: "missing", complete: false, reason: "Apresentação contextual em execução." };
  }
  if (contextualPresentationIsPersisted(state)) {
    return {
      attemptState: state === "failed_with_previous_persisted" ? "failed" : "success",
      artifactState: "current_valid",
      complete: true,
      reason: CONTEXTUAL_PRESENTATION_PERSISTED_HINT,
    };
  }
  if (state === "success_session_unpersisted") {
    return { attemptState: "success", artifactState: "missing", complete: true, reason: CONTEXTUAL_PRESENTATION_SESSION_HINT };
  }
  if (state === "failed_without_result") {
    return { attemptState: "failed", artifactState: "missing", complete: false, reason: "A última tentativa de apresentação contextual falhou. A IA é opcional e não bloqueia nenhuma etapa." };
  }
  return { attemptState: "not_run", artifactState: "missing", complete: false, reason: CONTEXTUAL_PRESENTATION_OPTIONAL_HINT };
}

/** Resumo textual do estado: falhou nunca é apresentado como não executada. */
export function contextualPresentationStateSummary(state: ContextualPresentationUiState, persisted = false, version: number | null = null): string {
  if (state === "running") return "executando apresentação contextual";
  if (state === "success_persisted") return version ? `apresentação contextual persistida · v${version}` : "apresentação contextual persistida";
  if (state === "failed_with_previous_persisted") return version ? `nova tentativa falhou · versão persistida v${version} preservada` : "nova tentativa falhou · versão persistida preservada";
  if (state === "success_session_unpersisted") return "gerada nesta sessão · não persistida";
  if (state === "failed_without_result") return "última tentativa falhou · a IA continua opcional";
  void persisted;
  return "aporte da IA opcional";
}

/** Selo do bloco de Revisão Humana, coerente com o chip do Processador. */
export function contextualPresentationStatePill(state: ContextualPresentationUiState): { label: string; tone: "success" | "warning" | "pending" | "neutral" } {
  if (state === "running") return { label: "IA · Executando", tone: "pending" };
  if (contextualPresentationIsPersisted(state)) return { label: "IA · Apresentação contextual", tone: "success" };
  if (state === "success_session_unpersisted") return { label: "IA · Sessão · não persistida", tone: "warning" };
  if (state === "failed_without_result") return { label: "IA · Falhou", tone: "warning" };
  return { label: "IA · Opcional", tone: "neutral" };
}
