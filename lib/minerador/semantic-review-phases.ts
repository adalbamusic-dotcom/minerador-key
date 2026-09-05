import { z } from "zod";
import {
  isSemanticReviewableField,
  parseSemanticReviewOutput,
  sanitizeSemanticReviewSchemaIssues,
  semanticReviewLogicalFieldKey,
  SemanticReviewOutputError,
  type SemanticReviewContext,
  type SemanticReviewOutput,
} from "./semantic-review.ts";
import { readGoogleAdsCpcMeasurementValue } from "./google-ads-demand.ts";

const shortTextSchema = z.string().trim().max(500);
const shortListSchema = z.array(shortTextSchema).max(12);
// Phase 1 is a compact semantic delta. The final R5 synthesis keeps the
// broader limits below, but the first phase must not spend its budget
// repeating the logical DNA in prose.
const phase1ShortTextSchema = z.string().trim().max(160);
const phase1CompactValueSchema = z.union([
  z.string().trim().max(240),
  z.number().refine(Number.isFinite, "must be finite"),
  z.boolean(),
  z.array(z.string().trim().max(160)).max(6),
  z.null(),
]);
const phase1DivergenceSchema = z.object({
  field: z.string().trim().min(1).max(100),
  suggestion: phase1CompactValueSchema,
  rationale: phase1ShortTextSchema,
  evidenceUsed: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
});
const phase1EnrichmentSchema = z.object({
  type: z.string().trim().min(1).max(100),
  value: z.union([z.string().trim().max(240), z.array(z.string().trim().max(160)).max(6), z.null()]),
  rationale: phase1ShortTextSchema,
});
const phase1AmbiguitySchema = z.union([
  phase1ShortTextSchema,
  z.array(phase1ShortTextSchema).max(3),
  z.null(),
]);
// Phase 2 is an evidence index, not a narrative report. Keep its provider
// contract materially smaller than the semantic/synthesis contracts.
const phase2ShortTextSchema = z.string().trim().max(160);
const phase2ShortListSchema = z.array(phase2ShortTextSchema).max(3);
const compactValueSchema = z.union([
  z.string().trim().max(1200),
  z.number().refine(Number.isFinite, "must be finite"),
  z.boolean(),
  z.array(z.string().trim().max(300)).max(20),
  z.null(),
]);

const phaseDivergenceSchema = z.object({
  field: z.string().trim().min(1).max(100),
  suggestion: compactValueSchema,
  rationale: shortTextSchema,
  evidenceUsed: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
});

const phaseEnrichmentSchema = z.object({
  type: z.string().trim().min(1).max(100),
  value: z.union([z.string().trim().max(1200), z.array(z.string().trim().max(300)).max(20), z.null()]),
  rationale: shortTextSchema,
});

export const SemanticReviewPhase1OutputSchema = z.object({
  agreementFields: z.array(z.string().trim().min(1).max(100)).max(30),
  divergences: z.array(phase1DivergenceSchema).max(3),
  semanticEnrichments: z.array(phase1EnrichmentSchema).max(3),
  remainingAmbiguities: phase1AmbiguitySchema,
}).strict();

export type SemanticReviewPhase1Output = z.infer<typeof SemanticReviewPhase1OutputSchema>;

export const SemanticReviewPhase2OutputSchema = z.object({
  supportingEvidence: phase2ShortListSchema,
  contradictingEvidence: phase2ShortListSchema,
  quantitativeWarnings: phase2ShortListSchema,
  opportunitySignals: phase2ShortListSchema,
  insufficientEvidence: phase2ShortListSchema,
}).strict();

export type SemanticReviewPhase2Output = z.infer<typeof SemanticReviewPhase2OutputSchema>;

export const SemanticReviewPhase3OutputSchema = z.object({
  reviewStatus: z.literal("completed"),
  overallVerdict: z.enum(["CONCORDA", "CONCORDA PARCIALMENTE", "DIVERGE", "EVIDÊNCIA INSUFICIENTE"]),
  divergences: z.array(phaseDivergenceSchema).max(12),
  enrichments: z.array(phaseEnrichmentSchema).max(12),
  remainingAmbiguities: compactValueSchema,
  humanReviewNotes: shortListSchema,
}).strict();

export type SemanticReviewPhase3Output = z.infer<typeof SemanticReviewPhase3OutputSchema>;

/**
 * Example kept next to the Phase 3 schema so the model-facing contract and
 * the validator cannot drift into different divergence/enrichment shapes.
 */
export const SEMANTIC_REVIEW_PHASE3_MINIMAL_EXAMPLE = {
  reviewStatus: "completed",
  overallVerdict: "CONCORDA PARCIALMENTE",
  divergences: [
    {
      field: "intent",
      suggestion: "Comercial investigativa",
      rationale: "A síntese quantitativa reforça uma busca de avaliação.",
      evidenceUsed: ["qual é melhor", "phase2.supportingEvidence"],
    },
  ],
  enrichments: [
    {
      type: "searchNeed",
      value: "Comparar alternativas antes de contratar.",
      rationale: "A síntese identifica uma necessidade implícita útil para revisão.",
    },
  ],
  remainingAmbiguities: [],
  humanReviewNotes: [],
} as const;

export const SEMANTIC_REVIEW_PHASE_RESPONSE_FORMATS = {
  phase1: { name: "minerador_r5_phase_1_semantic", schema: SemanticReviewPhase1OutputSchema },
  phase2: { name: "minerador_r5_phase_2_evidence", schema: SemanticReviewPhase2OutputSchema },
  phase3: { name: "minerador_r5_phase_3_synthesis", schema: SemanticReviewPhase3OutputSchema },
} as const;

type JsonSchemaRecord = Record<string, unknown>;

function responseFormatFor(name: string, schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-07" }) as JsonSchemaRecord;
  delete jsonSchema.$schema;
  return {
    type: "json_schema",
    json_schema: { name, strict: true, schema: jsonSchema },
  };
}

export function buildSemanticReviewPhase1ResponseFormat() {
  return responseFormatFor(SEMANTIC_REVIEW_PHASE_RESPONSE_FORMATS.phase1.name, SEMANTIC_REVIEW_PHASE_RESPONSE_FORMATS.phase1.schema);
}

export function buildSemanticReviewPhase2ResponseFormat() {
  return responseFormatFor(SEMANTIC_REVIEW_PHASE_RESPONSE_FORMATS.phase2.name, SEMANTIC_REVIEW_PHASE_RESPONSE_FORMATS.phase2.schema);
}

export function buildSemanticReviewPhase3ResponseFormat() {
  return responseFormatFor(SEMANTIC_REVIEW_PHASE_RESPONSE_FORMATS.phase3.name, SEMANTIC_REVIEW_PHASE_RESPONSE_FORMATS.phase3.schema);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function compactRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !isEmptyValue(value)));
}

function readRecordValue(record: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!record) return null;
  for (const key of keys) {
    if (!isEmptyValue(record[key])) return record[key];
  }
  return null;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}

function schemaValidationError(issues: unknown[]): SemanticReviewOutputError {
  const schemaIssues = sanitizeSemanticReviewSchemaIssues(issues);
  return new SemanticReviewOutputError(
    "schema_validation",
    [...new Set(schemaIssues.map(issue => issue.path).filter(path => path !== "$"))].slice(0, 20),
    schemaIssues,
  );
}

function parsePhaseOutput<T>(content: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = parseJsonContent(content);
  } catch {
    throw new SemanticReviewOutputError("json_parse");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw schemaValidationError(parsed.error.issues);
  return parsed.data;
}

export function parseSemanticReviewPhase1Output(content: string): SemanticReviewPhase1Output {
  return parsePhaseOutput(content, SemanticReviewPhase1OutputSchema);
}

export function parseSemanticReviewPhase2Output(content: string): SemanticReviewPhase2Output {
  return parsePhaseOutput(content, SemanticReviewPhase2OutputSchema);
}

export function parseSemanticReviewPhase3Output(content: string): SemanticReviewPhase3Output {
  return parsePhaseOutput(content, SemanticReviewPhase3OutputSchema);
}

const semanticPhaseFields = [
  "intent",
  "secondaryIntent",
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
  "ambiguity",
] as const;

type SemanticDeltaDivergence = {
  field: string;
  suggestion: unknown;
  rationale: string;
  evidenceUsed: string[];
};

type SemanticDeltaEnrichment = {
  type: string;
  value: unknown;
  rationale: string;
};

export type SemanticReviewValueTelemetry = {
  rawDivergencesCount: number;
  acceptedDivergencesCount: number;
  droppedNoOpCount: number;
  droppedLowEvidenceCount: number;
  rawEnrichmentsCount: number;
  acceptedEnrichmentsCount: number;
};

function normalizeSemanticText(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map(item => normalizeSemanticText(item)).join(" ")
    : value && typeof value === "object"
      ? Object.values(value as Record<string, unknown>).map(item => normalizeSemanticText(item)).join(" ")
      : value === null || value === undefined ? "" : String(value);
  return text
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

const semanticStopWords = new Set([
  "a", "ao", "aos", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "entre", "junto",
  "na", "nas", "no", "nos", "o", "os", "para", "por", "que", "se", "sem", "sobre", "um", "uma",
  "uns", "umas",
]);

function semanticTokens(value: unknown): string[] {
  return normalizeSemanticText(value).split(" ").filter(token => token && !semanticStopWords.has(token));
}

function semanticTextRedundant(candidate: unknown, reference: unknown): boolean {
  const candidateText = normalizeSemanticText(candidate);
  const referenceText = normalizeSemanticText(reference);
  if (!candidateText || !referenceText) return false;
  if (candidateText === referenceText) return true;
  const candidateTokens = [...new Set(semanticTokens(candidate))];
  const referenceTokens = [...new Set(semanticTokens(reference))];
  if (!candidateTokens.length || !referenceTokens.length) return false;
  const candidateSet = new Set(candidateTokens);
  const referenceSet = new Set(referenceTokens);
  if (candidateTokens.length === 1) return referenceSet.has(candidateTokens[0]);
  if (referenceTokens.length === 1) return candidateSet.has(referenceTokens[0]);
  const overlap = candidateTokens.filter(token => referenceSet.has(token)).length;
  const smallerSize = Math.min(candidateTokens.length, referenceTokens.length);
  return overlap / smallerSize >= 0.85;
}

const semanticUnknownStates = new Set([
  "na",
  "n a",
  "n a o",
  "n/a",
  "nao informado",
  "nao disponivel",
  "nao encontrado",
  "not informed",
  "not available",
  "unknown",
  "desconhecido",
]);

const semanticAmbiguousStates = new Set([
  "ambiguo",
  "ambigua",
  "ambiguous",
]);

function semanticState(value: unknown): "unknown" | "ambiguous" | null {
  if (Array.isArray(value) && value.length === 0) return "unknown";
  if (value === null || value === undefined) return "unknown";
  const normalized = normalizeSemanticText(value);
  if (!normalized) return "unknown";
  if (semanticUnknownStates.has(normalized)) return "unknown";
  if (semanticAmbiguousStates.has(normalized)) return "ambiguous";
  return null;
}

function semanticValuesEqual(left: unknown, right: unknown): boolean {
  const leftState = semanticState(left);
  const rightState = semanticState(right);
  if (leftState || rightState) return leftState !== null && leftState === rightState;
  if (typeof left === "string" || typeof right === "string") return normalizeSemanticText(left) === normalizeSemanticText(right);
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftItems = Array.isArray(left) ? left.map(normalizeSemanticText).sort() : [normalizeSemanticText(left)];
    const rightItems = Array.isArray(right) ? right.map(normalizeSemanticText).sort() : [normalizeSemanticText(right)];
    return JSON.stringify(leftItems) === JSON.stringify(rightItems);
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function meaningfulSemanticValue(value: unknown): boolean {
  return !(value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0));
}

function compactList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map(item => typeof item === "string" ? item.trim() : String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function measuredFactReferences(context: SemanticReviewContext): Array<{ label: string; value: unknown }> {
  const overview = asRecord(context.dataForSeo.measurement.overview);
  const ads = asRecord(context.googleAds.measurement);
  return [
    { label: "volume", value: context.googleAds.volume },
    { label: "cpc", value: readGoogleAdsCpcMeasurementValue(ads) },
    { label: "concorrencia", value: readRecordValue(ads, "competition", "adsCompetition") },
    { label: "tendencia", value: context.googleAds.trend },
    { label: "resultado", value: context.dataForSeo.allintitle },
    { label: "kd", value: context.dataForSeo.keywordDifficulty },
    { label: "kgr", value: context.kgr.score },
    { label: "backlinks", value: readRecordValue(overview, "avgBacklinks", "avg_backlinks", "avgBacklinksTop10", "avg_backlinks_top10") },
    { label: "referring domains", value: readRecordValue(overview, "avgReferringDomains", "avg_referring_domains", "avgReferringDomainsTop10", "avg_referring_domains_top10") },
  ].filter(entry => meaningfulSemanticValue(entry.value));
}

function repeatsMeasuredFact(value: unknown, context: SemanticReviewContext): boolean {
  const text = normalizeSemanticText(value);
  if (!text) return false;
  return measuredFactReferences(context).some(({ label, value: measuredValue }) => {
    const normalizedValue = normalizeSemanticText(measuredValue);
    return Boolean(normalizedValue && text.includes(label) && text.includes(normalizedValue));
  });
}

function isGenericEnrichment(value: unknown): boolean {
  const text = normalizeSemanticText(value);
  return /(?:nicho|termo|keyword|busca) (?:relacionad|associad)|relacionad[oa] ao mercado|(?:tem|possui) relacao com (?:um )?mercado|a keyword e uma/.test(text);
}

function isPendingFunnelSuggestion(field: string, suggestion: unknown, logicalFields: Record<string, unknown>): boolean {
  const key = semanticReviewLogicalFieldKey(field, logicalFields);
  return key === "funnel" && ["pendente", "pending"].includes(normalizeSemanticText(suggestion));
}

function isEvidenceReference(value: string): boolean {
  const normalized = normalizeSemanticText(value).replace(/\s+/g, ".");
  return /^(?:logical|phase1|phase2|googleads|dataforseo|kgr)(?:\.|$)/.test(normalized)
    || /^(?:agreementfields|divergences|supportingevidence|contradictingevidence|quantitativewarnings|opportunitysignals|insufficientevidence)$/.test(normalized);
}

function isGenericEvidenceLabel(value: string): boolean {
  const normalized = normalizeSemanticText(value);
  return !normalized
    || /^(?:keyword|termo|termo especifico|expressao|formulacao|campo|campo logico|leitura logica|intencao|nicho|funil|evidencia|sinal semantico)$/.test(normalized)
    || /^(?:logical|phase|google ads|dataforseo|kgr)(?:\.|\s|$)/.test(normalized);
}

const boFuEvidencePatterns = [
  /perto de mim/,
  /preco/,
  /comprar/,
  /contratar/,
  /agendar/,
  /orcamento/,
  /fornecedor/,
  /cidade/,
  /localidade/,
  /onde fazer/,
  /disponibilidade/,
  /contato/,
  /servico explicito/,
  /profissional explicito/,
  /intencao concreta/,
];

const moFuEvidencePatterns = [
  /qual e melhor/,
  /vale a pena/,
  /compar/,
  /alternativ/,
  /diferenc/,
  /\bvs\b/,
];

const toFuEvidencePatterns = [
  /tema amplo/,
  /busca ampla/,
  /sem acao explicita/,
  /sem comparacao/,
  /sem sinal comercial/,
  /sem localidade/,
];

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function resolvedEvidenceTexts(
  item: SemanticDeltaDivergence,
  phase1: SemanticReviewPhase1Output,
  phase2: SemanticReviewPhase2Output,
): string[] {
  const resolved: string[] = [];
  for (const reference of item.evidenceUsed) {
    const normalized = normalizeSemanticText(reference).replace(/\s+/g, ".");
    if (normalized === "phase1.divergences") {
      for (const divergence of phase1.divergences) resolved.push(...divergence.evidenceUsed);
    } else if (normalized === "phase2.supportingevidence") {
      resolved.push(...phase2.supportingEvidence);
    } else if (normalized === "phase2.contradictingevidence") {
      resolved.push(...phase2.contradictingEvidence);
    } else if (normalized === "phase2.quantitativewarnings") {
      resolved.push(...phase2.quantitativeWarnings);
    } else if (normalized === "phase2.opportunitysignals") {
      resolved.push(...phase2.opportunitySignals);
    } else if (normalized === "phase2.insufficientevidence") {
      resolved.push(...phase2.insufficientEvidence);
    }
  }
  return [...item.evidenceUsed, ...resolved].filter(value => typeof value === "string" && value.trim());
}

function hasConcreteFunnelEvidence(
  suggestion: unknown,
  context: SemanticReviewContext,
  evidenceTexts: string[],
): boolean {
  const suggestionText = normalizeSemanticText(suggestion);
  const keywordText = normalizeSemanticText(context.keyword);
  const evidenceText = normalizeSemanticText(evidenceTexts.join(" "));
  if (/\bbofu\b|fundo do funil/.test(suggestionText)) return hasPattern(keywordText, boFuEvidencePatterns) || hasPattern(evidenceText, boFuEvidencePatterns);
  if (/\bmofu\b|meio do funil/.test(suggestionText)) return hasPattern(keywordText, moFuEvidencePatterns) || hasPattern(evidenceText, moFuEvidencePatterns);
  if (/\btofu\b|topo do funil/.test(suggestionText)) return hasPattern(evidenceText, toFuEvidencePatterns);
  return true;
}

function hasSpecificEvidence(
  item: SemanticDeltaDivergence,
  context: SemanticReviewContext,
  phase1: SemanticReviewPhase1Output,
  phase2: SemanticReviewPhase2Output,
): boolean {
  const evidenceTexts = resolvedEvidenceTexts(item, phase1, phase2);
  const directEvidence = evidenceTexts.filter(value => !isEvidenceReference(value) && !isGenericEvidenceLabel(value));
  const corpus = normalizeSemanticText([context.keyword, ...evidenceTexts, item.rationale].join(" "));
  const genericSpeculation = /pode indicar|pode sugerir|pode representar|poderia significar|termo especifico.*(?:servico|profissional)|sugere busca por servico|sugere busca por profissional/.test(corpus);
  const concreteFunnelSignal = hasPattern(corpus, [...boFuEvidencePatterns, ...moFuEvidencePatterns, ...toFuEvidencePatterns]);
  if (genericSpeculation && !concreteFunnelSignal) return false;
  if (!directEvidence.length && !concreteFunnelSignal) return false;
  return true;
}

function mergeDivergences(
  context: SemanticReviewContext,
  phase1: SemanticReviewPhase1Output,
  phase2: SemanticReviewPhase2Output,
  phase3: SemanticReviewPhase3Output,
): { divergences: SemanticDeltaDivergence[]; droppedNoOpCount: number; droppedLowEvidenceCount: number } {
  const byField = new Map<string, SemanticDeltaDivergence>();
  let droppedNoOpCount = 0;
  let droppedLowEvidenceCount = 0;
  for (const item of [...phase1.divergences, ...phase3.divergences]) {
    if (!isSemanticReviewableField(item.field)) {
      droppedLowEvidenceCount += 1;
      continue;
    }
    const field = semanticReviewLogicalFieldKey(item.field, context.logical.fields);
    if (isPendingFunnelSuggestion(field, item.suggestion, context.logical.fields)) {
      droppedLowEvidenceCount += 1;
      continue;
    }
    if (semanticValuesEqual(context.logical.fields[field], item.suggestion)) {
      droppedNoOpCount += 1;
      continue;
    }
    const normalizedItem = { ...item, field };
    const evidenceTexts = resolvedEvidenceTexts(normalizedItem, phase1, phase2);
    if (field === "funnel" && !hasConcreteFunnelEvidence(item.suggestion, context, evidenceTexts)) {
      droppedLowEvidenceCount += 1;
      continue;
    }
    if (!hasSpecificEvidence(normalizedItem, context, phase1, phase2)) {
      droppedLowEvidenceCount += 1;
      continue;
    }
    byField.set(field, normalizedItem);
  }
  return { divergences: [...byField.values()].slice(0, 20), droppedNoOpCount, droppedLowEvidenceCount };
}

/**
 * Removes low-value AI additions after the provider response. This is a
 * deterministic read-model guard: it does not call another model and it does
 * not change the R5/R6 contract.
 */
export function filterSemanticEnrichments(input: {
  context: SemanticReviewContext;
  candidates: SemanticDeltaEnrichment[];
  divergences: SemanticDeltaDivergence[];
  remainingAmbiguities: unknown;
}): SemanticDeltaEnrichment[] {
  const logicalReferences = Object.entries(input.context.logical.fields)
    .filter(([field, value]) => !["keyword", "logicalConfidence", "logicalEvidence"].includes(field) && meaningfulSemanticValue(value))
    .map(([, value]) => value);
  const existingReferences = [
    ...logicalReferences,
    ...input.divergences.flatMap(item => [item.suggestion, item.rationale]),
    ...compactList(input.remainingAmbiguities),
  ];
  const accepted: SemanticDeltaEnrichment[] = [];
  for (const candidate of input.candidates) {
    if (!meaningfulSemanticValue(candidate.value)) continue;
    const type = normalizeSemanticText(candidate.type);
    if (["ambiguidade", "ambiguity", "remaining ambiguities", "ambiguidades remanescentes"].includes(type)) continue;
    if (isGenericEnrichment(candidate.value) || repeatsMeasuredFact(candidate.value, input.context)) continue;
    if (existingReferences.some(reference => semanticTextRedundant(candidate.value, reference))) continue;
    if (accepted.some(previous => semanticTextRedundant(candidate.value, previous.value))) continue;
    accepted.push(candidate);
    if (accepted.length === 3) break;
  }
  return accepted;
}

function filterRemainingAmbiguities(value: unknown, references: unknown[]): unknown {
  const values = compactList(value).filter(candidate => !references.some(reference => semanticTextRedundant(candidate, reference)));
  return Array.isArray(value) ? values : values[0] || null;
}

export function buildSemanticReviewPhase1Input(context: SemanticReviewContext): Record<string, unknown> {
  const fields = Object.fromEntries(
    semanticPhaseFields
      .map((field) => [field, context.logical.fields[field]])
      .filter(([, value]) => !isEmptyValue(value)),
  );
  return { rawKeyword: context.keyword, logicHypothesis: fields };
}

export function buildSemanticReviewPhase2Input(context: SemanticReviewContext): Record<string, unknown> {
  const adsMeasurement = context.googleAds.measurement;
  const overview = asRecord(context.dataForSeo.measurement.overview);
  const ads = compactRecord({
    volume: context.googleAds.volume,
    trend: context.googleAds.trend,
    cpc: readGoogleAdsCpcMeasurementValue(adsMeasurement),
    currencyCode: readRecordValue(adsMeasurement, "currencyCode", "currency_code"),
    competition: readRecordValue(adsMeasurement, "competition", "adsCompetition"),
    competitionIndex: readRecordValue(adsMeasurement, "competitionIndex", "competition_index"),
    volumeEligibility: context.googleAds.eligibility,
    validated: context.googleAds.valid,
  });
  const dataForSeo = compactRecord({
    result: context.dataForSeo.allintitle,
    kd: context.dataForSeo.keywordDifficulty,
    externalIntent: readRecordValue(overview, "externalIntent", "external_intent", "mainIntent", "main_intent"),
    avgReferringDomainsTop10: readRecordValue(overview, "avgReferringDomains", "avg_referring_domains", "avgReferringDomainsTop10", "avg_referring_domains_top10"),
    avgBacklinksTop10: readRecordValue(overview, "avgBacklinks", "avg_backlinks", "avgBacklinksTop10", "avg_backlinks_top10"),
    avgMainDomainRankTop10: readRecordValue(overview, "avgMainDomainRank", "avg_main_domain_rank", "avgMainDomainRankTop10", "avg_main_domain_rank_top10"),
    coreKeyword: readRecordValue(overview, "coreKeyword", "core_keyword"),
    detectedLanguage: readRecordValue(overview, "detectedLanguage", "detected_language"),
    validated: context.dataForSeo.valid,
  });
  const kgr = compactRecord({
    volume: context.kgr.volumeUsed,
    result: context.kgr.allintitleUsed,
    score: context.kgr.score,
    calculable: context.kgr.calculable,
    applicability: context.kgr.applicability,
    decision: context.kgr.decision,
  });
  return { rawKeyword: context.keyword, googleAds: ads, dataForSeo, kgr };
}

export function buildSemanticReviewPhase3Input(input: {
  context: SemanticReviewContext;
  phase1: SemanticReviewPhase1Output;
  phase2: SemanticReviewPhase2Output;
}): Record<string, unknown> {
  const logicalHypothesis = Object.fromEntries(
    semanticPhaseFields
      .map((field) => [field, input.context.logical.fields[field]])
      .filter(([, value]) => !isEmptyValue(value)),
  );
  return {
    rawKeyword: input.context.keyword,
    logicalHypothesis,
    independentSemanticReview: input.phase1,
    externalEvidence: input.phase2,
    facts: compactRecord({
      volume: input.context.googleAds.volume,
      result: input.context.dataForSeo.allintitle,
      kd: input.context.dataForSeo.keywordDifficulty,
      kgr: input.context.kgr.score,
    }),
  };
}

function valuePresent(value: unknown): boolean {
  return !isEmptyValue(value);
}

export function normalizePhasedSemanticReviewOutput(input: {
  context: SemanticReviewContext;
  phase1: SemanticReviewPhase1Output;
  phase2?: SemanticReviewPhase2Output;
  phase3: SemanticReviewPhase3Output;
}): { output: SemanticReviewOutput; humanReviewNotes: string[]; valueTelemetry: SemanticReviewValueTelemetry } {
  const phase2 = input.phase2 || {
    supportingEvidence: [],
    contradictingEvidence: [],
    quantitativeWarnings: [],
    opportunitySignals: [],
    insufficientEvidence: [],
  } satisfies SemanticReviewPhase2Output;
  const divergenceMerge = mergeDivergences(input.context, input.phase1, phase2, input.phase3);
  const divergences = divergenceMerge.divergences;
  const divergenceFields = new Set(divergences.map((item) => item.field));
  const agreementFields = [...new Set(input.phase1.agreementFields
    .map(field => semanticReviewLogicalFieldKey(field, input.context.logical.fields))
    .filter(field => isSemanticReviewableField(field))
    .filter(field => Object.prototype.hasOwnProperty.call(input.context.logical.fields, field))
    .filter(field => meaningfulSemanticValue(input.context.logical.fields[field]))
    .filter((field) => !divergenceFields.has(field)))].slice(0, 30);
  const candidateEnrichments = [...input.phase1.semanticEnrichments, ...input.phase3.enrichments];
  const rawRemainingAmbiguities = valuePresent(input.phase3.remainingAmbiguities)
    ? input.phase3.remainingAmbiguities
    : input.phase1.remainingAmbiguities;
  const enrichments = filterSemanticEnrichments({
    context: input.context,
    candidates: candidateEnrichments,
    divergences,
    remainingAmbiguities: rawRemainingAmbiguities,
  });
  const remainingAmbiguities = filterRemainingAmbiguities(rawRemainingAmbiguities, [
    ...divergences.flatMap(item => [item.suggestion, item.rationale]),
    ...enrichments.map(item => item.value),
  ]);
  const overallVerdict = divergences.length > 0
    ? input.phase3.overallVerdict
    : valuePresent(remainingAmbiguities)
      ? input.phase3.overallVerdict === "DIVERGE" ? "CONCORDA PARCIALMENTE" : input.phase3.overallVerdict
      : input.phase3.overallVerdict === "DIVERGE" ? "CONCORDA" : input.phase3.overallVerdict;
  const output = parseSemanticReviewOutput({
    reviewStatus: "completed",
    overallVerdict,
    agreementFields,
    divergences,
    enrichments,
    remainingAmbiguities,
  }, { logicalFields: input.context.logical.fields });
  return {
    output,
    humanReviewNotes: input.phase3.humanReviewNotes,
    valueTelemetry: {
      rawDivergencesCount: input.phase1.divergences.length + input.phase3.divergences.length,
      acceptedDivergencesCount: divergences.length,
      droppedNoOpCount: divergenceMerge.droppedNoOpCount,
      droppedLowEvidenceCount: divergenceMerge.droppedLowEvidenceCount,
      rawEnrichmentsCount: candidateEnrichments.length,
      acceptedEnrichmentsCount: enrichments.length,
    },
  };
}

export function semanticReviewPhase1Fields(): readonly string[] {
  return semanticPhaseFields;
}

export function semanticReviewPhaseOutputKeys(phase: 1 | 2 | 3): readonly string[] {
  if (phase === 1) return ["agreementFields", "divergences", "semanticEnrichments", "remainingAmbiguities"];
  if (phase === 2) return ["supportingEvidence", "contradictingEvidence", "quantitativeWarnings", "opportunitySignals", "insufficientEvidence"];
  return ["overallVerdict", "divergences", "enrichments", "remainingAmbiguities", "humanReviewNotes"];
}

// Keep these imports/functions observable to focused contract tests without
// exposing any raw provider data to the phase builders.
export type { SemanticReviewContext, SemanticReviewOutput };
export { SemanticReviewOutputError, asArray, asRecord };
