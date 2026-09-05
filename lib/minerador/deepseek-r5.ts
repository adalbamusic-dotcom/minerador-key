import { ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { extractDeepSeekTextContent, requestDeepSeekChatCompletion } from "@/lib/server/deepseek-provider";
import {
  parseSemanticReviewOutput,
  SemanticReviewOutputError,
  type SemanticReviewSchemaIssue,
  type SemanticReviewOutput,
} from "./semantic-review.ts";

export type DeepSeekR5FailureCode =
  | "AI_PROVIDER_AUTHENTICATION"
  | "AI_PROVIDER_RATE_LIMIT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_ERROR"
  | "AI_PROVIDER_INVALID_RESPONSE"
  | "AI_PROVIDER_EMPTY_CONTENT"
  | "AI_PROVIDER_JSON_PARSE_FAILED"
  | "AI_PROVIDER_SCHEMA_INVALID"
  | "AI_PROVIDER_RESPONSE_TRUNCATED"
  | "AI_MODEL_STRUCTURED_OUTPUT_UNSUPPORTED";

export type DeepSeekR5ReasoningMode = "enabled" | "disabled" | "provider_default";
export type DeepSeekR5PhaseNumber = 1 | 2 | 3;
export type DeepSeekResponseFormatMode = "json_object";

export type DeepSeekProviderMetadata = {
  provider: string | null;
  route: string | null;
  upstreamModel: string | null;
  systemFingerprint: string | null;
};

export type DeepSeekR5ResponseShape = {
  topLevelKeys: string[];
  divergencesType: string | null;
  divergenceKeys: string[][];
  enrichmentsType: string | null;
  enrichmentItemTypes: string[];
};

export type DeepSeekR5Diagnostic = {
  provider: "deepseek";
  requestedModel: string;
  returnedModel: string | null;
  httpStatus: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  choicesCount: number | null;
  messagePresent: boolean;
  contentPresent: boolean;
  contentType: string | null;
  contentLength: number;
  reasoningPresent: boolean;
  maxTokensSent: number | null;
  maxCompletionTokensSent: number | null;
  outputTokenParameter: "max_tokens" | "none";
  outputTokenLimit: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  reasoningEffort: string | null;
  cost: number | null;
  providerRequireParameters: boolean;
  providerErrorCode: string | null;
  providerErrorType: string | null;
  providerErrorMessage: string | null;
  providerErrorCategory: null;
  responseFormatRequested: "json_object" | "none";
  resolvedOutputFormatMode: "json_object" | "unknown";
  schemaMode: "json_object" | "unknown";
  structuredOutputRequested: false;
  providerMetadata: DeepSeekProviderMetadata;
  envelopeJsonParse: "not_run" | "pass" | "fail";
  jsonParse: "not_run" | "pass" | "fail";
  schemaValidation: "not_run" | "pass" | "fail";
  schemaIssuePaths: string[];
  schemaIssues: SemanticReviewSchemaIssue[];
  responseShape: DeepSeekR5ResponseShape | null;
  requestId: string | null;
  failureStage: "capability_check" | "http_request" | "http_response" | "envelope" | "choices" | "message" | "content" | "json_parse" | "schema_validation" | "truncated" | "completed";
};

export type DeepSeekR5PhaseDiagnostic = DeepSeekR5Diagnostic & {
  phase: DeepSeekR5PhaseNumber;
  reasoningMode: DeepSeekR5ReasoningMode;
  phaseMaxCompletionTokens: number;
  requestedMaxTokens: number;
  thinkingExplicitlyConfigured: boolean;
};

export class DeepSeekR5ResponseError extends Error {
  readonly status: number;
  readonly code: DeepSeekR5FailureCode;
  readonly diagnostic: DeepSeekR5Diagnostic;
  /** Kept out of diagnostics/logs; used only by the single schema-repair prompt. */
  readonly repairContent: string | null;

  constructor(message: string, status: number, code: DeepSeekR5FailureCode, diagnostic: DeepSeekR5Diagnostic, repairContent: string | null = null) {
    super(message);
    this.name = "DeepSeekR5ResponseError";
    this.status = status;
    this.code = code;
    this.diagnostic = diagnostic;
    this.repairContent = typeof repairContent === "string" ? repairContent.slice(0, 12000) : null;
  }
}

function marker(value: unknown, maxLength = 160): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return normalized ? normalized.slice(0, maxLength) : null;
}

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function shapeType(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function parseJsonForShape(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}

function responseShapeFromContent(content: string): DeepSeekR5ResponseShape | null {
  let raw: unknown;
  try {
    raw = parseJsonForShape(content);
  } catch {
    return null;
  }
  const record = asRecord(raw);
  if (!record) {
    return {
      topLevelKeys: [],
      divergencesType: shapeType(raw),
      divergenceKeys: [],
      enrichmentsType: null,
      enrichmentItemTypes: [],
    };
  }
  const divergences = record.divergences;
  const enrichments = record.enrichments;
  return {
    topLevelKeys: Object.keys(record).slice(0, 30),
    divergencesType: shapeType(divergences),
    divergenceKeys: Array.isArray(divergences)
      ? divergences.slice(0, 8).map((item) => {
          const itemRecord = asRecord(item);
          return itemRecord ? Object.keys(itemRecord).slice(0, 20) : [];
        })
      : [],
    enrichmentsType: shapeType(enrichments),
    enrichmentItemTypes: Array.isArray(enrichments)
      ? [...new Set(enrichments.slice(0, 8).map((item) => shapeType(item) || "unknown"))]
      : [],
  };
}

function baseDiagnostic(model: string, maxTokens: number | null, requestId: string | null = null): DeepSeekR5Diagnostic {
  return {
    provider: "deepseek",
    requestedModel: model,
    returnedModel: null,
    httpStatus: null,
    finishReason: null,
    nativeFinishReason: null,
    choicesCount: null,
    messagePresent: false,
    contentPresent: false,
    contentType: null,
    contentLength: 0,
    reasoningPresent: false,
    maxTokensSent: maxTokens,
    maxCompletionTokensSent: null,
    outputTokenParameter: maxTokens === null ? "none" : "max_tokens",
    outputTokenLimit: maxTokens,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    reasoningTokens: null,
    reasoningEffort: null,
    cost: null,
    providerRequireParameters: false,
    providerErrorCode: null,
    providerErrorType: null,
    providerErrorMessage: null,
    providerErrorCategory: null,
    responseFormatRequested: maxTokens === null ? "none" : "json_object",
    resolvedOutputFormatMode: maxTokens === null ? "unknown" : "json_object",
    schemaMode: maxTokens === null ? "unknown" : "json_object",
    structuredOutputRequested: false,
    providerMetadata: { provider: null, route: null, upstreamModel: null, systemFingerprint: null },
    envelopeJsonParse: "not_run",
    jsonParse: "not_run",
    schemaValidation: "not_run",
    schemaIssuePaths: [],
    schemaIssues: [],
    responseShape: null,
    requestId,
    failureStage: "http_request",
  };
}

function diagnosticFromEnvelope(model: string, envelope: Record<string, unknown>, response: Response, maxTokens: number): DeepSeekR5Diagnostic {
  const choices = Array.isArray(envelope.choices) ? envelope.choices : null;
  const choice = choices?.[0] ? asRecord(choices[0]) : null;
  const message = asRecord(choice?.message);
  const rawContent = message?.content;
  const content = extractDeepSeekTextContent(rawContent);
  const usage = asRecord(envelope.usage);
  const completionDetails = asRecord(usage?.completion_tokens_details);
  const requestId = marker(envelope.id) || marker(response.headers.get("x-request-id"));
  return {
    ...baseDiagnostic(model, maxTokens, requestId),
    returnedModel: marker(envelope.model),
    httpStatus: response.status,
    finishReason: marker(choice?.finish_reason),
    nativeFinishReason: marker(choice?.native_finish_reason ?? envelope.native_finish_reason),
    choicesCount: choices?.length ?? null,
    messagePresent: Boolean(message),
    contentPresent: Boolean(content),
    contentType: rawContent === null ? "null" : Array.isArray(rawContent) ? "array" : typeof rawContent === "string" ? "string" : rawContent === undefined ? null : typeof rawContent,
    contentLength: content?.length || 0,
    reasoningPresent: Boolean(message && (message.reasoning !== undefined || message.reasoning_content !== undefined)),
    promptTokens: finite(usage?.prompt_tokens),
     completionTokens: finite(usage?.completion_tokens),
     totalTokens: finite(usage?.total_tokens),
     reasoningTokens: finite(usage?.reasoning_tokens ?? completionDetails?.reasoning_tokens),
     reasoningEffort: marker(choice?.reasoning_effort ?? message?.reasoning_effort ?? envelope.reasoning_effort ?? usage?.reasoning_effort),
     cost: finite(usage?.cost),
    providerMetadata: {
      provider: marker(envelope.provider),
      route: marker(envelope.route),
      upstreamModel: marker(envelope.upstream_model),
      systemFingerprint: marker(envelope.system_fingerprint),
    },
    envelopeJsonParse: "pass",
    failureStage: "choices",
  };
}

function schemaIssuePaths(error: SemanticReviewOutputError): string[] {
  return Array.isArray(error.issuePaths) ? error.issuePaths.slice(0, 20) : [];
}

function schemaIssues(error: SemanticReviewOutputError): SemanticReviewSchemaIssue[] {
  return Array.isArray(error.schemaIssues) ? error.schemaIssues.slice(0, 20) : [];
}

function phaseDiagnostic(diagnostic: DeepSeekR5Diagnostic, phase: DeepSeekR5PhaseNumber, reasoningMode: DeepSeekR5ReasoningMode, phaseMaxCompletionTokens: number): DeepSeekR5PhaseDiagnostic {
  return {
    ...diagnostic,
    phase,
    reasoningMode,
    phaseMaxCompletionTokens,
    requestedMaxTokens: phaseMaxCompletionTokens,
    thinkingExplicitlyConfigured: reasoningMode !== "provider_default",
  };
}

function finishIsTruncated(value: string | null) {
  return value === "length" || value === "max_tokens" || value === "incomplete";
}

function resolveThinkingMode(value: DeepSeekR5ReasoningMode | undefined): DeepSeekR5ReasoningMode {
  return value === "enabled" || value === "disabled" ? value : "provider_default";
}

export async function requestDeepSeekR5Phase<T>({
  apiUrl,
  apiKey,
  model,
  system,
  user,
  phase,
  maxCompletionTokens,
  thinkingMode = "provider_default",
  extraHeaders = {},
  signal,
  fetchImpl = fetch,
  onRequestStarted,
  parseOutput,
}: {
  apiUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  phase: DeepSeekR5PhaseNumber;
  maxCompletionTokens: number;
  thinkingMode?: DeepSeekR5ReasoningMode;
  extraHeaders?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onRequestStarted?: () => void;
  responseFormatBuilder?: () => Record<string, unknown>;
  parseOutput: (content: string) => T;
}): Promise<{ output: T; diagnostic: DeepSeekR5PhaseDiagnostic }> {
  const resolvedThinkingMode = resolveThinkingMode(thinkingMode);
  const initial = phaseDiagnostic(baseDiagnostic(model, maxCompletionTokens), phase, resolvedThinkingMode, maxCompletionTokens);
  onRequestStarted?.();

  let response: Response;
  let envelope: Record<string, unknown>;
  let content: string | null;
  try {
    const result = await requestDeepSeekChatCompletion({
      apiUrl,
      apiKey,
      model,
      system,
      user,
      maxTokens: maxCompletionTokens,
      thinkingMode: resolvedThinkingMode,
      extraHeaders,
      signal,
      fetchImpl,
    });
    response = result.response;
    envelope = result.envelope;
    content = result.content;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      const envelopeFailure = error.code === "AI_PROVIDER_INVALID_RESPONSE";
      throw new DeepSeekR5ResponseError(
        error.message,
        error.status,
        error.code,
        {
          ...initial,
          httpStatus: error.status,
          envelopeJsonParse: envelopeFailure ? "fail" : "not_run",
          failureStage: envelopeFailure ? "envelope" : "http_response",
        },
      );
    }
    throw new DeepSeekR5ResponseError("O provider DeepSeek está indisponível.", 503, "AI_PROVIDER_UNAVAILABLE", initial);
  }

  let diagnostic: DeepSeekR5PhaseDiagnostic = diagnosticFromEnvelope(model, envelope, response, maxCompletionTokens) as DeepSeekR5PhaseDiagnostic;
  diagnostic = phaseDiagnostic(diagnostic, phase, resolvedThinkingMode, maxCompletionTokens);
  const choices = Array.isArray(envelope.choices) ? envelope.choices : [];
  if (!choices.length) throw new DeepSeekR5ResponseError("O provider DeepSeek não retornou choices.", 502, "AI_PROVIDER_INVALID_RESPONSE", { ...diagnostic, choicesCount: 0, failureStage: "choices" });
  const message = asRecord(asRecord(choices[0])?.message);
  if (!message) throw new DeepSeekR5ResponseError("O provider DeepSeek não retornou message na primeira choice.", 502, "AI_PROVIDER_INVALID_RESPONSE", { ...diagnostic, failureStage: "message" });
  if (finishIsTruncated(diagnostic.finishReason) || finishIsTruncated(diagnostic.nativeFinishReason)) {
    throw new DeepSeekR5ResponseError(`A resposta da IA foi interrompida antes de completar a fase ${phase} da revisão R5.`, 502, "AI_PROVIDER_RESPONSE_TRUNCATED", { ...diagnostic, jsonParse: "not_run", schemaValidation: "not_run", failureStage: "truncated" });
  }
  if (!content) throw new DeepSeekR5ResponseError("O provider DeepSeek não retornou message.content utilizável.", 502, "AI_PROVIDER_EMPTY_CONTENT", { ...diagnostic, failureStage: "content" });

  let output: T;
  try {
    output = parseOutput(content);
  } catch (error) {
    if (error instanceof SemanticReviewOutputError) {
      const isJson = error.stage === "json_parse";
      throw new DeepSeekR5ResponseError(
        isJson ? "A resposta DeepSeek não contém JSON válido." : "A resposta DeepSeek não respeita o schema da operação.",
        502,
        isJson ? "AI_PROVIDER_JSON_PARSE_FAILED" : "AI_PROVIDER_SCHEMA_INVALID",
        {
          ...diagnostic,
          jsonParse: isJson ? "fail" : "pass",
          schemaValidation: isJson ? "not_run" : "fail",
          schemaIssuePaths: schemaIssuePaths(error),
          schemaIssues: isJson ? [] : schemaIssues(error),
          responseShape: isJson ? null : responseShapeFromContent(content),
          failureStage: isJson ? "json_parse" : "schema_validation",
        },
        isJson ? null : content,
      );
    }
    throw new DeepSeekR5ResponseError("O provider DeepSeek retornou uma fase inválida.", 502, "AI_PROVIDER_INVALID_RESPONSE", { ...diagnostic, failureStage: "schema_validation" });
  }

  return { output, diagnostic: { ...diagnostic, jsonParse: "pass", schemaValidation: "pass", failureStage: "completed" } };
}

export async function requestDeepSeekR5Review({
  apiUrl,
  apiKey,
  model,
  system,
  user,
  fetchImpl = fetch,
  maxTokens = 4000,
  thinkingMode = "provider_default",
  logicalFields = {},
}: {
  apiUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  fetchImpl?: typeof fetch;
  maxTokens?: number;
  thinkingMode?: DeepSeekR5ReasoningMode;
  logicalFields?: Record<string, unknown>;
}): Promise<{ output: SemanticReviewOutput; diagnostic: DeepSeekR5Diagnostic }> {
  const result = await requestDeepSeekR5Phase({
    apiUrl,
    apiKey,
    model,
    system,
    user,
    fetchImpl,
    phase: 1,
    maxCompletionTokens: maxTokens,
    thinkingMode,
    parseOutput: (content) => parseSemanticReviewOutput(content, { logicalFields }),
  });
  return result;
}
