export type AiReviewFailureStage =
  | "finish_reason_length"
  | "json_invalid_or_truncated"
  | "zod_invalid"
  | "proposal_invalid"
  | "connection_resolution"
  | "request_not_started"
  | "timeout"
  | "transport"
  | "provider_response_invalid"
  | "content_empty"
  | "reasoning_only"
  | "request_validation"
  | "unknown";

export function aiReviewErrorMessage(stage: string | null, fallback: string) {
  if (stage === "finish_reason_length" || stage === "json_invalid_or_truncated") return "Resposta da IA incompleta.";
  if (stage === "zod_invalid" || stage === "proposal_invalid") return "A resposta da IA não corresponde ao formato esperado.";
  if (stage === "connection_resolution" || stage === "request_not_started" || stage === "timeout" || stage === "transport" || stage === "provider_response_invalid" || stage === "content_empty" || stage === "reasoning_only") return "Falha na chamada ao provider.";
  if (stage === "request_validation") return "O contexto da revisão com IA é inválido.";
  return fallback;
}
