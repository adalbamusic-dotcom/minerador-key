export type ArchitectDeepSeekFailureInput = {
  providerResolved: boolean;
  requestStarted: boolean;
  httpStatus: number | null;
  finishReason: string | null;
  nativeFinishReason?: string | null;
  contentPresent: boolean;
  reasoningPresent: boolean;
  jsonParsed: boolean;
  zodPassed: boolean;
  proposalValidated: boolean;
  errorCode?: string | null;
};

export type ArchitectDeepSeekFailureStage =
  | "connection_resolution"
  | "request_validation"
  | "request_not_started"
  | "timeout"
  | "transport"
  | "provider_response_invalid"
  | "content_empty"
  | "reasoning_only"
  | "finish_reason_length"
  | "json_invalid_or_truncated"
  | "zod_invalid"
  | "proposal_invalid"
  | "unknown";

/**
 * Classifica somente sinais sanitizados do pipeline. Conteúdo e reasoning
 * nunca entram nesta função, no log ou no contrato enviado ao navegador.
 */
export function classifyArchitectDeepSeekFailure(input: ArchitectDeepSeekFailureInput): ArchitectDeepSeekFailureStage | null {
  if (!input.providerResolved) return "connection_resolution";
  if (input.errorCode === "AI_REQUEST_INVALID") return "request_validation";
  if (input.errorCode === "AI_TIMEOUT") return "timeout";
  if (!input.requestStarted) return "request_not_started";
  if (input.httpStatus !== null && (input.httpStatus < 200 || input.httpStatus >= 300)) {
    if (input.errorCode === "AI_PROVIDER_INVALID_RESPONSE") return "provider_response_invalid";
    return "transport";
  }
  const finishReason = `${input.finishReason || ""} ${input.nativeFinishReason || ""}`.toLowerCase();
  if (finishReason.includes("length") || finishReason.includes("max_tokens") || finishReason.includes("max tokens")) {
    return "finish_reason_length";
  }
  if (!input.contentPresent) return input.reasoningPresent ? "reasoning_only" : "content_empty";
  if (!input.jsonParsed) return "json_invalid_or_truncated";
  if (!input.zodPassed) return "zod_invalid";
  if (!input.proposalValidated) return "proposal_invalid";
  return "unknown";
}
