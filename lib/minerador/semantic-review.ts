import { z } from "zod";
import { kgrApplicabilityLabel, kgrDecisionLabel, readKgrApplicability, type KgrApplicability } from "./kgr-applicability.ts";
import { deriveGoogleAdsDemandTrend, googleAdsDemandTrendLabel } from "./google-ads-demand.ts";
import { dataForSeoRecordValue } from "./dataforseo-competition.ts";
import { readDataForSeoKeywordDifficultyEvidence } from "./dataforseo-keyword-overview-core.ts";
import { readCanonicalKeywordDna } from "./logical-read-model.ts";
import { hasCompletedLogicalOutputContract } from "./logical-processor.ts";
import { deriveProcessorRevalidation, type ProcessorKgrSource, type ProcessorMetricValidationState } from "./processor-revalidation.ts";

const semanticReviewValueSchema = z.union([
  z.string().trim().max(2000),
  z.number().refine(Number.isFinite, "must be finite"),
  z.boolean(),
  z.array(z.string().trim().max(500)).max(30),
  z.null(),
]);

export const SemanticReviewVerdictSchema = z.enum([
  "CONCORDA",
  "CONCORDA PARCIALMENTE",
  "DIVERGE",
  "EVIDÊNCIA INSUFICIENTE",
]);
export type SemanticReviewVerdict = z.infer<typeof SemanticReviewVerdictSchema>;

export const SemanticReviewFieldSchema = z.object({
  field: z.string().trim().min(1).max(100),
  logicalValue: semanticReviewValueSchema,
  aiSuggestion: semanticReviewValueSchema,
  verdict: SemanticReviewVerdictSchema,
  rationale: z.string().trim().max(2000),
  evidenceUsed: z.array(z.string().trim().min(1).max(240)).max(20),
});

const semanticEnrichmentFieldSchema = z.union([
  z.string().trim().max(2000),
  z.array(z.string().trim().max(500)).max(30),
  z.null(),
]);

export const SemanticReviewEnrichmentDetailSchema = z.object({
  type: z.string().trim().min(1).max(100),
  value: semanticEnrichmentFieldSchema,
  rationale: z.string().trim().max(2000),
});

export const SemanticReviewEnrichmentSchema = z.object({
  searchNeed: semanticEnrichmentFieldSchema,
  probableObjective: semanticEnrichmentFieldSchema,
  semanticContext: semanticEnrichmentFieldSchema,
  userExpectation: semanticEnrichmentFieldSchema,
  entityModifierRelation: semanticEnrichmentFieldSchema,
  remainingAmbiguities: semanticEnrichmentFieldSchema,
  suitability: semanticEnrichmentFieldSchema,
  observations: semanticEnrichmentFieldSchema,
  gaps: semanticEnrichmentFieldSchema,
});

export const SemanticReviewOutputSchema = z.object({
  reviewStatus: z.literal("completed"),
  overallVerdict: SemanticReviewVerdictSchema,
  fieldReviews: z.array(SemanticReviewFieldSchema).max(30),
  semanticEnrichment: SemanticReviewEnrichmentSchema,
  /** Optional additive detail; existing R6/R6.1 consumers ignore it safely. */
  enrichmentDetails: z.array(SemanticReviewEnrichmentDetailSchema).max(12).optional(),
});

export type SemanticReviewOutput = z.infer<typeof SemanticReviewOutputSchema>;

const compactAgreementFieldSchema = z.string().trim().min(1).max(100);

const compactDivergenceSchema = z.object({
  field: compactAgreementFieldSchema,
  suggestion: semanticReviewValueSchema,
  rationale: z.string().trim().max(2000),
  evidenceUsed: z.array(z.string().trim().min(1).max(240)).min(1).max(20),
});

const compactEnrichmentSchema = SemanticReviewEnrichmentDetailSchema;

/**
 * Provider-facing R5 contract. It deliberately contains only deltas from the
 * logical DNA. The server expands it back into SemanticReviewOutput before a
 * record is built or persisted.
 */
export const SemanticReviewCompactOutputSchema = z.object({
  reviewStatus: z.literal("completed"),
  overallVerdict: SemanticReviewVerdictSchema,
  agreementFields: z.array(compactAgreementFieldSchema).max(30),
  divergences: z.array(compactDivergenceSchema).max(20),
  enrichments: z.array(compactEnrichmentSchema).max(12),
  remainingAmbiguities: semanticEnrichmentFieldSchema,
});

export type SemanticReviewCompactOutput = z.infer<typeof SemanticReviewCompactOutputSchema>;

export const SEMANTIC_REVIEW_RESPONSE_FORMAT_NAME = "minerador_r5_semantic_review" as const;

type JsonSchemaRecord = Record<string, unknown>;

/**
 * The compact R5 Zod contract remains the source for server-side validation.
 * DeepSeek receives JSON mode; the provider does not replace local validation,
 * so it is intentionally removed from the payload. The internal full contract
 * remains independently validated by parseSemanticReviewOutput().
 */
export function buildSemanticReviewResponseFormat() {
  const schema = z.toJSONSchema(SemanticReviewCompactOutputSchema, { target: "draft-07" }) as JsonSchemaRecord;
  delete schema.$schema;
  return {
    type: "json_schema" as const,
    json_schema: {
      name: SEMANTIC_REVIEW_RESPONSE_FORMAT_NAME,
      strict: true,
      schema,
    },
  };
}

export type SemanticReviewOutputFailureStage = "json_parse" | "schema_validation";

export type SemanticReviewSchemaIssue = {
  path: string;
  code: string;
  expected: string | null;
  received: string | null;
};

function sanitizedType(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function safeIssuePath(value: unknown): string {
  if (!Array.isArray(value) || !value.length) return "$";
  const path = value.map(part => String(part)).join(".");
  return path.replace(/[^A-Za-z0-9_.\[\]-]/g, "").slice(0, 120) || "$";
}

/** Preserve only safe type-level information from provider schema failures. */
export function sanitizeSemanticReviewSchemaIssues(issues: unknown[]): SemanticReviewSchemaIssue[] {
  return issues
    .filter(issue => issue && typeof issue === "object" && !Array.isArray(issue))
    .map(issue => {
      const item = issue as Record<string, unknown>;
      const hasInput = Object.prototype.hasOwnProperty.call(item, "input");
      const receivedValue = item.received ?? item.type;
      const messageReceived = typeof item.message === "string"
        ? item.message.match(/received\s+([A-Za-z]+)/i)?.[1]
        : undefined;
      return {
        path: safeIssuePath(item.path),
        code: typeof item.code === "string" ? item.code.slice(0, 80) : "unknown",
        expected: typeof item.expected === "string" ? item.expected.slice(0, 80) : null,
        received: typeof receivedValue === "string"
          ? receivedValue.slice(0, 80)
          : hasInput
            ? sanitizedType(item.input)
            : messageReceived || null,
      };
    })
    .slice(0, 20);
}

export class SemanticReviewOutputError extends Error {
  readonly code = "AI_PROVIDER_INVALID_RESPONSE" as const;
  readonly stage: SemanticReviewOutputFailureStage;
  readonly issuePaths: string[];
  readonly schemaIssues: SemanticReviewSchemaIssue[];

  constructor(stage: SemanticReviewOutputFailureStage = "schema_validation", issuePaths: string[] = [], schemaIssues: SemanticReviewSchemaIssue[] = []) {
    super("O provider de IA retornou uma revisão sem o formato esperado.");
    this.name = "SemanticReviewOutputError";
    this.stage = stage;
    this.issuePaths = issuePaths;
    this.schemaIssues = schemaIssues;
  }
}

export class SemanticReviewPreconditionError extends Error {
  readonly status = 409;
  readonly code: "AI_REVIEW_LOGIC_REQUIRED" | "AI_REVIEW_QUANTITATIVE_EVIDENCE_REQUIRED";
  readonly diagnostic?: Record<string, unknown>;

  constructor(
    code: "AI_REVIEW_LOGIC_REQUIRED" | "AI_REVIEW_QUANTITATIVE_EVIDENCE_REQUIRED" = "AI_REVIEW_LOGIC_REQUIRED",
    message = code === "AI_REVIEW_LOGIC_REQUIRED"
      ? "IA não iniciada: atualize a Lógica desta keyword antes da revisão."
      : "Conclua as medições válidas do Google Ads e do DataForSEO antes de revisar a keyword com IA.",
    diagnostic?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.diagnostic = diagnostic;
    this.name = "SemanticReviewPreconditionError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function valueOrNull(value: unknown): unknown {
  return value === undefined ? null : value;
}

function normalizeVerdict(value: unknown): SemanticReviewVerdict | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleUpperCase("pt-BR");
  const aliases: Record<string, SemanticReviewVerdict> = {
    CONCORDA: "CONCORDA",
    AGREES: "CONCORDA",
    "CONCORDA PARCIALMENTE": "CONCORDA PARCIALMENTE",
    PARTIALLY_AGREES: "CONCORDA PARCIALMENTE",
    "PARTIALLY AGREES": "CONCORDA PARCIALMENTE",
    DIVERGE: "DIVERGE",
    DIVERGES: "DIVERGE",
    "EVIDÊNCIA INSUFICIENTE": "EVIDÊNCIA INSUFICIENTE",
    "EVIDENCIA INSUFICIENTE": "EVIDÊNCIA INSUFICIENTE",
    INSUFFICIENT_EVIDENCE: "EVIDÊNCIA INSUFICIENTE",
    "INSUFFICIENT EVIDENCE": "EVIDÊNCIA INSUFICIENTE",
  };
  return aliases[normalized] || null;
}

function normalizeFieldReview(value: unknown): Record<string, unknown> {
  const item = asRecord(value) || {};
  return {
    field: item.field ?? item.campo,
    logicalValue: item.logicalValue ?? item.logical_value ?? item.valorLogico ?? item.valor_logico ?? null,
    aiSuggestion: item.aiSuggestion ?? item.ai_suggestion ?? item.sugestaoIA ?? item.sugestao_ia ?? null,
    verdict: normalizeVerdict(item.verdict ?? item.result ?? item.status),
    rationale: item.rationale ?? item.reason ?? item.motivo ?? item.justification ?? "",
    evidenceUsed: item.evidenceUsed ?? item.evidence_used ?? item.evidencias ?? item.evidencias_utilizadas ?? [],
  };
}

function normalizeEnrichment(value: unknown): Record<string, unknown> {
  const item = asRecord(value) || {};
  return {
    searchNeed: item.searchNeed ?? item.search_need ?? item.necessidade_implicita ?? null,
    probableObjective: item.probableObjective ?? item.probable_objective ?? item.objetivo_provavel ?? null,
    semanticContext: item.semanticContext ?? item.semantic_context ?? item.contexto_semantico ?? null,
    userExpectation: item.userExpectation ?? item.user_expectation ?? item.expectativa_usuario ?? null,
    entityModifierRelation: item.entityModifierRelation ?? item.entity_modifier_relation ?? item.relacao_entidade_modificador ?? null,
    remainingAmbiguities: item.remainingAmbiguities ?? item.remaining_ambiguities ?? item.ambiguidades_remanescentes ?? null,
    suitability: item.suitability ?? item.adequacao ?? item.interpretacao_adequacao ?? null,
    observations: item.observations ?? item.observacoes ?? null,
    gaps: item.gaps ?? item.lacunas ?? null,
  };
}

type SemanticLogicalFields = Record<string, unknown>;
type SemanticEnrichmentKey = keyof z.infer<typeof SemanticReviewEnrichmentSchema>;

const logicalFieldAliases: Record<string, string> = {
  intent: "intent",
  intencao: "intent",
  "intencao principal": "intent",
  secondaryintent: "secondaryIntent",
  "secondary intent": "secondaryIntent",
  "intencao secundaria": "secondaryIntent",
  ambiguity: "ambiguity",
  ambiguidade: "ambiguity",
  niche: "niche",
  nicho: "niche",
  funnel: "funnel",
  funil: "funnel",
  centralentity: "centralEntity",
  "central entity": "centralEntity",
  "entidade central": "centralEntity",
  modifiers: "modifiers",
  modificadores: "modifiers",
  audience: "audience",
  audiencia: "audience",
  publico: "audience",
  perceivedproblem: "perceivedProblem",
  "perceived problem": "perceivedProblem",
  "problema percebido": "perceivedProblem",
  desiredresult: "desiredResult",
  "desired result": "desiredResult",
  "resultado desejado": "desiredResult",
  jobtobedone: "jobToBeDone",
  "job to be done": "jobToBeDone",
  journey: "journey",
  jornada: "journey",
  awareness: "awareness",
  consciencia: "awareness",
  editorialtype: "editorialType",
  "editorial type": "editorialType",
  "tipo editorial": "editorialType",
  expectedformat: "expectedFormat",
  "expected format": "expectedFormat",
  "formato esperado": "expectedFormat",
  logicalcommercialpotential: "logicalCommercialPotential",
  "logical commercial potential": "logicalCommercialPotential",
  "potencial comercial": "logicalCommercialPotential",
  localintent: "localIntent",
  "local intent": "localIntent",
  "intencao local": "localIntent",
  implicitobjection: "implicitObjection",
  "implicit objection": "implicitObjection",
  "objecao implicita": "implicitObjection",
  urgency: "urgency",
  urgencia: "urgency",
  dominantemotion: "dominantEmotion",
  "dominant emotion": "dominantEmotion",
  "emocao dominante": "dominantEmotion",
  logicalconfidence: "logicalConfidence",
  "logical confidence": "logicalConfidence",
  "confianca logica": "logicalConfidence",
  logicalevidence: "logicalEvidence",
  "logical evidence": "logicalEvidence",
  "evidencias logicas": "logicalEvidence",
};

const enrichmentFieldAliases: Record<string, SemanticEnrichmentKey> = {
  searchneed: "searchNeed",
  "search need": "searchNeed",
  necessidade: "searchNeed",
  "necessidade implicita": "searchNeed",
  probableobjective: "probableObjective",
  "probable objective": "probableObjective",
  objetivo: "probableObjective",
  "objetivo provavel": "probableObjective",
  semanticcontext: "semanticContext",
  "semantic context": "semanticContext",
  contexto: "semanticContext",
  "contexto semantico": "semanticContext",
  userexpectation: "userExpectation",
  "user expectation": "userExpectation",
  expectativa: "userExpectation",
  "expectativa do usuario": "userExpectation",
  entitymodifierrelation: "entityModifierRelation",
  "entity modifier relation": "entityModifierRelation",
  "relacao entidade modificador": "entityModifierRelation",
  remainingambiguities: "remainingAmbiguities",
  "remaining ambiguities": "remainingAmbiguities",
  ambiguidades: "remainingAmbiguities",
  "ambiguidades remanescentes": "remainingAmbiguities",
  suitability: "suitability",
  adequacao: "suitability",
  observations: "observations",
  observacoes: "observations",
  gaps: "gaps",
  lacunas: "gaps",
};

function normalizeFieldToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ");
}

function resolveLogicalFieldKey(field: string, logicalFields: SemanticLogicalFields): string {
  if (Object.prototype.hasOwnProperty.call(logicalFields, field)) return field;
  const normalized = normalizeFieldToken(field);
  const canonical = logicalFieldAliases[normalized.replace(/\s/g, "")] || logicalFieldAliases[normalized] || field.trim();
  if (Object.prototype.hasOwnProperty.call(logicalFields, canonical)) return canonical;
  const matchingKey = Object.keys(logicalFields).find((key) => normalizeFieldToken(key) === normalized);
  return matchingKey || canonical;
}

const semanticReviewableFieldKeys = new Set([
  "intent",
  "secondaryIntent",
  "ambiguity",
  "niche",
  "funnel",
  "centralEntity",
  "modifiers",
  "audience",
  "perceivedProblem",
  "desiredResult",
  "jobToBeDone",
  "journey",
  "awareness",
  "editorialType",
  "expectedFormat",
  "logicalCommercialPotential",
  "localIntent",
  "implicitObjection",
  "urgency",
  "dominantEmotion",
  "logicalConfidence",
  "logicalEvidence",
]);

/** Canonical field key used by the R5/R6 semantic review read-model. */
export function semanticReviewLogicalFieldKey(field: string, logicalFields: SemanticLogicalFields = {}): string {
  return resolveLogicalFieldKey(field, logicalFields);
}

/**
 * R5 may question semantic DNA fields only. Provider facts such as volume,
 * CPC, KD, Result and KGR are deliberately outside this allowlist.
 */
export function isSemanticReviewableField(field: string): boolean {
  const normalized = normalizeFieldToken(field);
  const canonical = logicalFieldAliases[normalized.replace(/\s/g, "")] || logicalFieldAliases[normalized] || normalized.replace(/\s/g, "");
  return semanticReviewableFieldKeys.has(canonical);
}

function readLogicalField(field: string, logicalFields: SemanticLogicalFields): unknown {
  const key = resolveLogicalFieldKey(field, logicalFields);
  return Object.prototype.hasOwnProperty.call(logicalFields, key) ? logicalFields[key] : null;
}

function compactEvidenceFor(field: string, logicalFields: SemanticLogicalFields): string[] {
  const key = resolveLogicalFieldKey(field, logicalFields);
  return Object.prototype.hasOwnProperty.call(logicalFields, key) ? [`logical.fields.${key}`] : [];
}

function normalizeCompactDivergence(value: unknown): Record<string, unknown> {
  const item = asRecord(value) || {};
  return {
    field: item.field ?? item.campo,
    suggestion: item.suggestion ?? item.aiSuggestion ?? item.ai_suggestion ?? item.sugestaoIA ?? item.sugestao_ia ?? null,
    rationale: item.rationale ?? item.reason ?? item.motivo ?? item.justification ?? "",
    evidenceUsed: item.evidenceUsed ?? item.evidence_used ?? item.evidencias ?? item.evidencias_utilizadas ?? [],
  };
}

function normalizeCompactEnrichment(value: unknown): Record<string, unknown> {
  const item = asRecord(value) || {};
  return {
    type: item.type ?? item.tipo ?? item.field ?? item.campo,
    value: item.value ?? item.valor ?? item.suggestion ?? item.sugestao ?? null,
    rationale: item.rationale ?? item.reason ?? item.motivo ?? item.justification ?? "",
  };
}

function emptySemanticEnrichment(): Record<SemanticEnrichmentKey, unknown> {
  return {
    searchNeed: null,
    probableObjective: null,
    semanticContext: null,
    userExpectation: null,
    entityModifierRelation: null,
    remainingAmbiguities: null,
    suitability: null,
    observations: null,
    gaps: null,
  };
}

function mergeEnrichmentValue(current: unknown, next: unknown): unknown {
  if (next === null || next === undefined || next === "" || (Array.isArray(next) && next.length === 0)) return current;
  if (current === null || current === undefined || current === "" || (Array.isArray(current) && current.length === 0)) return next;
  if (Array.isArray(current) || Array.isArray(next)) {
    const currentValues = Array.isArray(current) ? current : [String(current)];
    const nextValues = Array.isArray(next) ? next : [String(next)];
    return [...currentValues, ...nextValues].slice(0, 30);
  }
  return `${String(current)}\n${String(next)}`.slice(0, 2000);
}

function resolveEnrichmentKey(type: string): SemanticEnrichmentKey {
  const normalized = normalizeFieldToken(type);
  return enrichmentFieldAliases[normalized.replace(/\s/g, "")] || enrichmentFieldAliases[normalized] || "observations";
}

function expandCompactSemanticReviewOutput(
  compact: SemanticReviewCompactOutput,
  logicalFields: SemanticLogicalFields = {},
): SemanticReviewOutput {
  const fieldReviews: Array<Record<string, unknown>> = [];
  for (const field of compact.agreementFields) {
    const key = resolveLogicalFieldKey(field, logicalFields);
    const logicalValue = readLogicalField(field, logicalFields);
    fieldReviews.push({
      field: key,
      logicalValue,
      aiSuggestion: logicalValue,
      verdict: "CONCORDA",
      rationale: "",
      evidenceUsed: compactEvidenceFor(field, logicalFields),
    });
  }
  for (const divergence of compact.divergences) {
    const key = resolveLogicalFieldKey(divergence.field, logicalFields);
    fieldReviews.push({
      field: key,
      logicalValue: readLogicalField(divergence.field, logicalFields),
      aiSuggestion: divergence.suggestion,
      verdict: "DIVERGE",
      rationale: divergence.rationale,
      evidenceUsed: divergence.evidenceUsed,
    });
  }

  const semanticEnrichment = emptySemanticEnrichment();
  semanticEnrichment.remainingAmbiguities = compact.remainingAmbiguities;
  for (const enrichment of compact.enrichments) {
    const key = resolveEnrichmentKey(enrichment.type);
    semanticEnrichment[key] = mergeEnrichmentValue(semanticEnrichment[key], enrichment.value);
  }

  const parsed = SemanticReviewOutputSchema.safeParse({
    reviewStatus: compact.reviewStatus,
    overallVerdict: compact.overallVerdict,
    fieldReviews,
    semanticEnrichment,
    enrichmentDetails: compact.enrichments,
  });
  if (!parsed.success) throw schemaValidationError(parsed.error.issues);
  return parsed.data;
}

function schemaValidationError(issues: unknown[]): SemanticReviewOutputError {
  const schemaIssues = sanitizeSemanticReviewSchemaIssues(issues);
  return new SemanticReviewOutputError(
    "schema_validation",
    [...new Set(schemaIssues.map(issue => issue.path).filter(path => path !== "$"))].slice(0, 20),
    schemaIssues,
  );
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}

/** Accepts the compact provider contract and the existing full R5 contract. */
export function parseSemanticReviewOutput(
  content: string | unknown,
  options: { logicalFields?: SemanticLogicalFields } = {},
): SemanticReviewOutput {
  let raw: unknown;
  try {
    raw = typeof content === "string" ? parseJsonContent(content) : content;
  } catch {
    throw new SemanticReviewOutputError("json_parse");
  }
  const item = asRecord(raw);
  if (!item) throw new SemanticReviewOutputError("schema_validation", ["$"]);
  const hasCompactContract = ["agreementFields", "agreement_fields", "divergences", "enrichments", "remainingAmbiguities", "remaining_ambiguities"]
    .some((key) => Object.prototype.hasOwnProperty.call(item, key));
  if (hasCompactContract) {
    const compactCandidate = {
      reviewStatus: item.reviewStatus ?? item.review_status ?? "completed",
      overallVerdict: normalizeVerdict(item.overallVerdict ?? item.overall_verdict ?? item.result ?? item.verdict),
      agreementFields: asArray(item.agreementFields ?? item.agreement_fields ?? item.agreements),
      divergences: asArray(item.divergences ?? item.divergences_fields ?? item.divergencias).map(normalizeCompactDivergence),
      enrichments: asArray(item.enrichments ?? item.enrichment ?? item.enriquecimentos).map(normalizeCompactEnrichment),
      remainingAmbiguities: item.remainingAmbiguities ?? item.remaining_ambiguities ?? item.ambiguidades_remanescentes ?? null,
    };
    const compactParsed = SemanticReviewCompactOutputSchema.safeParse(compactCandidate);
    if (!compactParsed.success) throw schemaValidationError(compactParsed.error.issues);
    return expandCompactSemanticReviewOutput(compactParsed.data, options.logicalFields);
  }
  const enrichmentDetails = item.enrichmentDetails ?? item.enrichment_details;
  const candidate = {
    reviewStatus: item.reviewStatus ?? item.review_status ?? "completed",
    overallVerdict: normalizeVerdict(item.overallVerdict ?? item.overall_verdict ?? item.result ?? item.verdict),
    fieldReviews: asArray(item.fieldReviews ?? item.field_reviews ?? item.reviews).map(normalizeFieldReview),
    semanticEnrichment: normalizeEnrichment(item.semanticEnrichment ?? item.semantic_enrichment ?? item.enrichment ?? item.enriquecimentos),
    ...(enrichmentDetails !== undefined ? { enrichmentDetails: asArray(enrichmentDetails).map(normalizeCompactEnrichment) } : {}),
  };
  const parsed = SemanticReviewOutputSchema.safeParse(candidate);
  if (!parsed.success) throw schemaValidationError(parsed.error.issues);
  return parsed.data;
}

type SemanticReviewSemantic = Record<string, unknown>;

export type SemanticReviewKeywordRow = {
  keyword: string;
  intent: string | null;
  volume_search: number | null;
  results_allintitle: number | null;
  kgr_score: number | null;
  analise_semantica: SemanticReviewSemantic | null;
};

export type SemanticReviewContext = {
  keyword: string;
  logical: {
    processed: boolean;
    dnaOrigin: unknown;
    fields: Record<string, unknown>;
  };
  googleAds: {
    valid: boolean;
    validationState: ProcessorMetricValidationState;
    source: "processor" | "discovery" | "previous" | "none";
    volume: number | null;
    history: unknown[];
    trend: string;
    measurement: Record<string, unknown>;
    eligibility: unknown;
    measuredAt: unknown;
    targeting: unknown;
  };
  dataForSeo: {
    valid: boolean;
    validationState: ProcessorMetricValidationState;
    source: "processor" | "discovery" | "previous" | "none";
    allintitle: number | null;
    keywordDifficulty: number | null;
    measurement: Record<string, unknown>;
    query: unknown;
    measuredAt: unknown;
    targeting: unknown;
  };
  kgr: {
    volumeUsed: number | null;
    allintitleUsed: number | null;
    score: number | null;
    persistedScore: number | null;
    calculable: boolean;
    calculationState: "calculable" | "not_calculable";
    inputSource: ProcessorKgrSource;
    applicability: KgrApplicability;
    applicabilityLabel: string;
    decision: string;
    treated: boolean;
  };
  evidenceReferences: {
    logical: string[];
    googleAds: string[];
    dataForSeo: string[];
    kgr: string[];
  };
};

function compactGoogleAdsMeasurement(value: Record<string, unknown> | null): Record<string, unknown> {
  return {
    provider: value?.provider ?? value?.source ?? null,
    providerVersion: value?.providerVersion ?? value?.version ?? null,
    averageMonthlySearches: finiteNumber(value?.averageMonthlySearches ?? value?.rawVolume),
    monthlySearchVolumes: Array.isArray(value?.monthlySearchVolumes) ? value.monthlySearchVolumes : [],
    averageCpcMicros: value?.averageCpcMicros ?? null,
    currencyCode: value?.currencyCode ?? null,
    competition: value?.competition ?? null,
    competitionIndex: finiteNumber(value?.competitionIndex),
    lowTopOfPageBidMicros: value?.lowTopOfPageBidMicros ?? null,
    highTopOfPageBidMicros: value?.highTopOfPageBidMicros ?? null,
  };
}

function compactDataForSeoMeasurement(value: Record<string, unknown> | null, allintitle: number | null, overview: Record<string, unknown> | null, keywordDifficulty: number | null): Record<string, unknown> {
  return {
    provider: value?.provider ?? value?.source ?? null,
    providerVersion: value?.providerVersion ?? null,
    status: value?.status ?? null,
    resultsAllintitle: allintitle,
    query: value?.query ?? null,
    measuredAt: value?.measuredAt ?? value?.measured_at ?? null,
    targeting: value?.targeting ?? null,
    keywordDifficulty,
    overview: overview
      ? {
          provider: overview.provider ?? overview.source ?? null,
          providerVersion: overview.providerVersion ?? null,
          endpoint: overview.endpoint ?? null,
          providerRequestId: overview.providerRequestId ?? null,
          keywordDifficulty,
          coreKeyword: overview.coreKeyword ?? overview.core_keyword ?? null,
          detectedLanguage: overview.detectedLanguage ?? overview.detected_language ?? null,
          externalIntent: overview.externalIntent ?? overview.external_intent ?? overview.mainIntent ?? overview.main_intent ?? null,
          externalForeignIntents: Array.isArray(overview.externalForeignIntents)
            ? overview.externalForeignIntents
            : Array.isArray(overview.foreignIntent)
              ? overview.foreignIntent
              : Array.isArray(overview.foreign_intent)
                ? overview.foreign_intent
                : [],
          avgBacklinks: overview.avgBacklinks ?? overview.avg_backlinks ?? null,
          avgReferringDomains: overview.avgReferringDomains ?? overview.avg_referring_domains ?? null,
          avgMainDomainRank: overview.avgMainDomainRank ?? overview.avg_main_domain_rank ?? null,
          keywordInfoUpdatedAt: overview.keywordInfoUpdatedAt ?? overview.keyword_info_updated_at ?? null,
          backlinksInfoUpdatedAt: overview.backlinksInfoUpdatedAt ?? overview.backlinks_info_updated_at ?? null,
          searchIntentUpdatedAt: overview.searchIntentUpdatedAt ?? overview.search_intent_updated_at ?? null,
        }
      : null,
  };
}

function evidenceSource(input: {
  state: ProcessorMetricValidationState;
  value: number | null;
  discoveryImported: boolean;
}): "processor" | "discovery" | "previous" | "none" {
  if (input.state === "validated") return "processor";
  if (input.discoveryImported && input.value !== null) return "discovery";
  if (input.value !== null) return "previous";
  return "none";
}

export function buildSemanticReviewContext(row: SemanticReviewKeywordRow): SemanticReviewContext {
  const semantic = row.analise_semantica || {};
  // R5 reviews the deterministic logical artifact and measured evidence. A
  // human decision belongs to the downstream R6 consolidation and must not
  // silently become a new AI input or make an existing AI artifact stale.
  const keywordReadModel = readCanonicalKeywordDna(
    { intent: null, analise_semantica: semantic },
    { includeHumanDecisions: false },
  );
  const googleAdsMeasurement = asRecord(semantic.volume_measurement) || asRecord(semantic.google_ads_measurement) || asRecord(semantic.googleAdsMeasurement);
  const googleAdsEligibility = asRecord(semantic.volume_eligibility) || asRecord(semantic.google_ads_eligibility);
  const dataForSeoMeasurement = dataForSeoRecordValue(semantic.allintitle_measurement);
  const processorRevalidation = deriveProcessorRevalidation({
    semantic,
    volumeMeasurement: googleAdsMeasurement,
    dataForSeoMeasurement,
    volumeSearch: row.volume_search,
    resultsAllintitle: row.results_allintitle,
  });
  const googleAdsValid = processorRevalidation.volume.validated;
  const dataForSeoValid = processorRevalidation.results.validated;
  const importedDataForSeoMeasurement: Record<string, unknown> | null = processorRevalidation.imported.present
    ? {
        ...processorRevalidation.imported.metrics,
        provider: processorRevalidation.imported.resultsProvider,
        providerVersion: processorRevalidation.imported.resultsProviderVersion,
        source: processorRevalidation.imported.resultsProvider || "discovery_import",
      }
    : null;
  const googleAdsMeasurementForContext = googleAdsValid
    ? googleAdsMeasurement
    : processorRevalidation.imported.present
      ? processorRevalidation.imported.metrics
      : googleAdsMeasurement;
  const dataForSeoMeasurementForContext = dataForSeoValid
    ? dataForSeoMeasurement
    : processorRevalidation.imported.present
      ? importedDataForSeoMeasurement
      : dataForSeoMeasurement;
  const googleAdsHistory = Array.isArray(googleAdsMeasurementForContext?.monthlySearchVolumes) ? googleAdsMeasurementForContext.monthlySearchVolumes : [];
  const allintitle = processorRevalidation.results.value;
  const volume = processorRevalidation.volume.value;
  const keywordDifficultyEvidence = readDataForSeoKeywordDifficultyEvidence(semantic);
  const keywordOverview = keywordDifficultyEvidence.measurement;
  const persistedScore = finiteNumber(row.kgr_score);
  const score = processorRevalidation.kgr.score;
  const applicability = readKgrApplicability(semantic);
  const logicalProcessed = semantic.dna_origem === "logico_deterministico"
    && hasCompletedLogicalOutputContract({ semantic, intent: row.intent });
  const targeting = googleAdsMeasurementForContext?.targeting ?? googleAdsEligibility?.targeting ?? null;
  const dataForSeoTargeting = dataForSeoMeasurementForContext?.targeting ?? null;
  const googleAdsSource = evidenceSource({ state: processorRevalidation.volume.state, value: volume, discoveryImported: processorRevalidation.discoveryImported });
  const dataForSeoSource = evidenceSource({ state: processorRevalidation.results.state, value: allintitle, discoveryImported: processorRevalidation.discoveryImported });
  const discoveryEvidenceReference = processorRevalidation.discoveryImported ? ["analise_semantica.discovery_import"] : [];

  return {
    keyword: row.keyword,
    logical: {
      processed: logicalProcessed,
      dnaOrigin: valueOrNull(semantic.dna_origem),
      fields: {
        keyword: row.keyword,
        intent: valueOrNull(keywordReadModel.intent),
        secondaryIntent: valueOrNull(semantic.intencao_secundaria),
        ambiguity: valueOrNull(semantic.intencao_ambigua),
        niche: valueOrNull(keywordReadModel.niche),
        funnel: valueOrNull(keywordReadModel.funnel),
        centralEntity: valueOrNull(semantic.entidade_central),
        modifiers: valueOrNull(semantic.modificadores),
        audience: valueOrNull(semantic.publico ?? semantic.perfil_b2b),
        perceivedProblem: valueOrNull(semantic.problema_percebido),
        desiredResult: valueOrNull(semantic.resultado_desejado),
        jobToBeDone: valueOrNull(semantic.job_to_be_done),
        journey: valueOrNull(semantic.etapa_jornada),
        awareness: valueOrNull(semantic.nivel_consciencia),
        editorialType: valueOrNull(semantic.tipo_editorial),
        expectedFormat: valueOrNull(semantic.formato_esperado),
        logicalCommercialPotential: valueOrNull(semantic.potencial_comercial),
        localIntent: valueOrNull(semantic.intencao_local),
        implicitObjection: valueOrNull(semantic.objecao_implicita),
        urgency: valueOrNull(semantic.urgencia_tempo),
        dominantEmotion: valueOrNull(semantic.emocao_dominante),
        logicalConfidence: valueOrNull(semantic.dna_confianca),
        logicalEvidence: valueOrNull(semantic.evidencias_logicas),
      },
    },
    googleAds: {
      valid: googleAdsValid,
      validationState: processorRevalidation.volume.state,
      source: googleAdsSource,
      volume,
      history: googleAdsHistory,
      trend: googleAdsDemandTrendLabel(deriveGoogleAdsDemandTrend(googleAdsHistory)),
      measurement: compactGoogleAdsMeasurement(googleAdsMeasurementForContext),
      eligibility: googleAdsEligibility?.status ?? null,
      measuredAt: processorRevalidation.volume.measuredAt ?? googleAdsEligibility?.measuredAt ?? null,
      targeting,
    },
    dataForSeo: {
      valid: dataForSeoValid,
      validationState: processorRevalidation.results.state,
      source: dataForSeoSource,
      allintitle,
      keywordDifficulty: keywordDifficultyEvidence.value,
      measurement: compactDataForSeoMeasurement(dataForSeoMeasurementForContext, allintitle, keywordOverview, keywordDifficultyEvidence.value),
      query: dataForSeoMeasurementForContext?.query ?? null,
      measuredAt: processorRevalidation.results.measuredAt ?? null,
      targeting: dataForSeoTargeting,
    },
    kgr: {
      volumeUsed: volume,
      allintitleUsed: allintitle,
      score,
      persistedScore,
      calculable: score !== null,
      calculationState: score === null ? "not_calculable" : "calculable",
      inputSource: processorRevalidation.kgr.source,
      applicability,
      applicabilityLabel: kgrApplicabilityLabel(applicability),
      decision: kgrDecisionLabel(applicability),
      treated: applicability !== "pending",
    },
    evidenceReferences: {
      logical: logicalProcessed ? ["analise_semantica.dna_origem", "analise_semantica.dna_campos_logicos"] : [],
      googleAds: googleAdsMeasurement || googleAdsEligibility || processorRevalidation.imported.present ? ["minerador_keywords.volume_search", "analise_semantica.volume_measurement", "analise_semantica.volume_eligibility", ...discoveryEvidenceReference] : [],
      dataForSeo: dataForSeoMeasurement || processorRevalidation.imported.present || keywordOverview ? ["minerador_keywords.results_allintitle", "analise_semantica.allintitle_measurement", ...(keywordOverview ? ["analise_semantica.dataforseo_keyword_overview"] : []), ...discoveryEvidenceReference] : [],
      kgr: volume !== null || allintitle !== null ? ["minerador_keywords.volume_search", "minerador_keywords.results_allintitle", "calculateKgrFromMetrics", "analise_semantica.kgr_aplicabilidade", ...discoveryEvidenceReference] : [],
    },
  };
}

export function buildSemanticReviewRecord(input: {
  output: SemanticReviewOutput;
  context: SemanticReviewContext;
  generatedAt: string;
  model: string;
  operationRequestId: string;
}): Record<string, unknown> {
  return {
    schemaVersion: "r5",
    status: "completed",
    reviewStatus: "completed",
    overallVerdict: input.output.overallVerdict,
    fieldReviews: input.output.fieldReviews,
    semanticEnrichment: input.output.semanticEnrichment,
    ...(input.output.enrichmentDetails?.length ? { enrichmentDetails: input.output.enrichmentDetails } : {}),
    evidenceReferences: input.context.evidenceReferences,
    inputHash: semanticReviewInputHash(input.context),
    generatedAt: input.generatedAt,
    provider: "deepseek",
    model: input.model,
    operationRequestId: input.operationRequestId,
  };
}

function stableReviewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableReviewValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableReviewValue(item)]));
  }
  return value;
}

/**
 * Freshness marker for the complete R5 input. It intentionally contains only
 * the current logical/quantitative facts, not raw payloads or full histories.
 * This lets the Processador distinguish a current IA artifact from a review
 * generated before the latest logical or provider revalidation.
 */
export function semanticReviewInputHash(context: SemanticReviewContext): string {
  const payload = stableReviewValue({
    keyword: context.keyword,
    logical: {
      processed: context.logical.processed,
      dnaOrigin: context.logical.dnaOrigin,
      fields: context.logical.fields,
    },
    googleAds: {
      valid: context.googleAds.valid,
      volume: context.googleAds.volume,
      trend: context.googleAds.trend,
      measurement: {
        averageMonthlySearches: context.googleAds.measurement.averageMonthlySearches,
        competition: context.googleAds.measurement.competition,
        competitionIndex: context.googleAds.measurement.competitionIndex,
        averageCpcMicros: context.googleAds.measurement.averageCpcMicros,
        currencyCode: context.googleAds.measurement.currencyCode,
      },
      eligibility: context.googleAds.eligibility,
      measuredAt: context.googleAds.measuredAt,
      targeting: context.googleAds.targeting,
    },
    dataForSeo: {
      valid: context.dataForSeo.valid,
      allintitle: context.dataForSeo.allintitle,
      keywordDifficulty: context.dataForSeo.keywordDifficulty,
      measurement: {
        provider: context.dataForSeo.measurement.provider,
        resultsAllintitle: context.dataForSeo.measurement.resultsAllintitle,
        query: context.dataForSeo.measurement.query,
        measuredAt: context.dataForSeo.measurement.measuredAt,
        overview: context.dataForSeo.measurement.overview,
      },
      measuredAt: context.dataForSeo.measuredAt,
      targeting: context.dataForSeo.targeting,
    },
    kgr: {
      volumeUsed: context.kgr.volumeUsed,
      allintitleUsed: context.kgr.allintitleUsed,
      score: context.kgr.score,
      calculable: context.kgr.calculable,
      applicability: context.kgr.applicability,
      decision: context.kgr.decision,
    },
  });
  const serialized = JSON.stringify(payload);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `r5-fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isCompletedSemanticReview(value: unknown): value is Record<string, unknown> {
  const item = asRecord(value);
  if (!item || item.schemaVersion !== "r5" || item.status !== "completed" || item.reviewStatus !== "completed") return false;
  if (!normalizeVerdict(item.overallVerdict)) return false;
  return Array.isArray(item.fieldReviews) && Boolean(asRecord(item.semanticEnrichment));
}

export function semanticReviewVerdictLabel(value: unknown): string {
  const verdict = normalizeVerdict(value);
  return verdict || "Evidência insuficiente";
}

export function semanticReviewDivergenceCount(value: unknown): number {
  const item = asRecord(value);
  const reviews = Array.isArray(item?.fieldReviews) ? item.fieldReviews : [];
  return reviews.filter(review => normalizeVerdict(asRecord(review)?.verdict) === "DIVERGE").length;
}

export function semanticReviewEnrichmentCount(value: unknown): number {
  const item = asRecord(value);
  const enrichment = asRecord(item?.semanticEnrichment);
  if (!enrichment) return 0;
  return Object.values(enrichment).filter(entry => {
    if (entry === null || entry === undefined || entry === "") return false;
    return !Array.isArray(entry) || entry.length > 0;
  }).length;
}

export type DnaMaturity = "INSUFICIENTE" | "PARCIAL" | "COMPLETA PARA REVISÃO" | "CONFIRMADA";

export function deriveDnaMaturity(input: {
  logicalProcessed: boolean;
  googleAdsValid: boolean;
  dataForSeoValid: boolean;
  kgrTreated: boolean;
  aiReviewCompleted: boolean;
  humanConfirmed: boolean;
  /** R6 may explicitly keep KGR pending while still completing the review. */
  humanReviewCompleted?: boolean;
}): DnaMaturity {
  if (!input.logicalProcessed) return "INSUFICIENTE";
  const completeForReview = input.googleAdsValid && input.dataForSeoValid && input.kgrTreated && input.aiReviewCompleted;
  if (completeForReview && (input.humanConfirmed || input.humanReviewCompleted)) return "CONFIRMADA";
  if (completeForReview) return "COMPLETA PARA REVISÃO";
  return "PARCIAL";
}

export function dnaMaturityLabel(value: DnaMaturity): string {
  return value;
}

export function reviewFields(value: unknown): Array<Record<string, unknown>> {
  const item = asRecord(value);
  return Array.isArray(item?.fieldReviews) ? item.fieldReviews.map(entry => asRecord(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry)) : [];
}

export function reviewEnrichment(value: unknown): Record<string, unknown> {
  return asRecord(asRecord(value)?.semanticEnrichment) || {};
}

export function reviewEvidenceReferences(value: unknown): Record<string, unknown> {
  return asRecord(asRecord(value)?.evidenceReferences) || {};
}
