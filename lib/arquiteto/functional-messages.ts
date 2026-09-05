export type ArchitectFunctionalOperation = "serp" | "ai";

export const ARCHITECT_FUNCTIONAL_ERROR_MESSAGES: Record<ArchitectFunctionalOperation, string> = {
  serp: "Validação SERP indisponível no momento.",
  ai: "Não foi possível concluir a revisão com IA.",
};

export function architectFunctionalErrorMessage(operation: ArchitectFunctionalOperation): string {
  return ARCHITECT_FUNCTIONAL_ERROR_MESSAGES[operation];
}
