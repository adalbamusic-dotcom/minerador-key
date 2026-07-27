import { z } from "zod";
import { VersionMetadataSchema } from "../arquiteto/contracts.ts";
import type { ArticleDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import { createVersionEnvelope } from "../arquiteto/versioning.ts";
import type { SerpResearchSnapshot } from "./serp/contracts.ts";
import { isComparableRadarExtraction } from "./analysis-insights.ts";
import { RadarKgrStrategySchema, type RadarKgrStrategy } from "./strategy-context.ts";

export const RadarAnalysisModeSchema = z.enum(["kgr_light", "competitive_full"]);
export type RadarAnalysisMode = z.infer<typeof RadarAnalysisModeSchema>;

export const RadarAnalysisStatusSchema = z.enum(["draft", "approved", "rejected", "superseded"]);
export const RadarSerpItemDecisionSchema = z.enum(["pending", "included", "excluded"]);
export const RadarRequirementLevelSchema = z.enum(["required", "recommended", "optional", "discarded"]);
export const RadarEnforcementSchema = z.enum(["advisory", "required"]);
export const RadarKeywordDecisionTypeSchema = z.enum(["keep", "reinforcement", "exclude_from_plan", "propose_separate_article", "return_to_architect_review"]);
export const RadarAnalysisConfidenceSchema = z.enum(["low", "medium", "high"]);

export const RadarModeRecommendationSchema = z.object({
  suggestedMode: RadarAnalysisModeSchema,
  reasons: z.array(z.string().min(1)).min(1),
  confidence: RadarAnalysisConfidenceSchema,
  ruleSource: z.literal("minerador_kgr_strict"),
}).strict();

export const RadarSerpDecisionSchema = z.object({
  key: z.string().min(1),
  itemType: z.enum(["organic", "people_also_ask", "related_search", "knowledge_graph", "entity"]),
  decision: RadarSerpItemDecisionSchema,
  reason: z.string().max(1000),
  note: z.string().max(4000),
  ownDomain: z.boolean(),
}).strict();

export const RadarRecurringTermSchema = z.object({
  term: z.string().min(1),
  frequency: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  sources: z.array(z.enum(["title", "meta", "canonical", "h1", "h2", "h3", "body", "structured_data"])),
  pageIds: z.array(z.string().min(1)),
}).strict();

export const RadarExtractionPageSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  status: z.enum(["pending", "success", "partial", "blocked", "timeout", "invalid_html", "unsupported", "failed"]),
  fetchedAt: z.string().datetime(),
  title: z.string(),
  metaDescription: z.string(),
  canonical: z.string().url().nullable(),
  h1: z.array(z.string()),
  h2: z.array(z.string()),
  h3: z.array(z.string()),
  wordCount: z.number().int().nonnegative(),
  internalLinkCount: z.number().int().nonnegative(),
  externalLinkCount: z.number().int().nonnegative(),
  listCount: z.number().int().nonnegative(),
  tableCount: z.number().int().nonnegative(),
  faqCount: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative(),
  blockquoteCount: z.number().int().nonnegative(),
  comparisonCount: z.number().int().nonnegative(),
  hasDates: z.boolean(),
  author: z.string().nullable(),
  structuredDataTypes: z.array(z.string()),
  recurringTerms: z.array(RadarRecurringTermSchema),
  boldCount: z.number().int().nonnegative(),
  italicCount: z.number().int().nonnegative(),
  error: z.string().nullable(),
}).strict();
export type RadarExtractionPage = z.infer<typeof RadarExtractionPageSchema>;

export const RadarBenchmarkMetricSchema = z.object({
  label: z.string().min(1),
  unit: z.enum(["count", "words", "ratio"]),
  mean: z.number().nonnegative(),
  median: z.number().nonnegative(),
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  typicalRange: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  sampleSize: z.number().int().nonnegative(),
}).strict();

export const RadarBenchmarkSchema = z.object({
  mode: RadarAnalysisModeSchema,
  analyzedPageCount: z.number().int().nonnegative(),
  validPageCount: z.number().int().nonnegative(),
  metrics: z.record(z.string(), RadarBenchmarkMetricSchema),
  distributions: z.record(z.string(), z.record(z.string(), z.number().nonnegative())),
  outliers: z.array(z.object({ pageId: z.string().min(1), metric: z.string().min(1), value: z.number().nonnegative(), reason: z.string().min(1) }).strict()),
  recommendations: z.array(z.string().min(1)),
}).strict();

export const RadarSemanticDecisionSchema = z.enum(["include_topic", "support_term", "reference_only", "ignore", "propose_article", "pending"]);
export const RadarSemanticTermSchema = z.object({
  term: z.string().min(1),
  frequency: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  pageIds: z.array(z.string().min(1)),
  sources: z.array(z.enum(["title", "h1", "h2", "h3", "body"])),
  relation: z.string().min(1),
  decision: RadarSemanticDecisionSchema,
  note: z.string().max(1000),
}).strict();
export type RadarSemanticTerm = z.infer<typeof RadarSemanticTermSchema>;

export const RadarPlannerTransferSchema = z.object({
  sourceAnalysisVersionId: z.string().min(1),
  sourceAnalysisVersionNumber: z.number().int().positive(),
  sentAt: z.string().datetime(),
  sentBy: z.string().min(1),
}).strict();
export type RadarPlannerTransfer = z.infer<typeof RadarPlannerTransferSchema>;

export const RadarStructuralDecisionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  observedCount: z.number().int().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  observedText: z.string().min(1),
  level: RadarRequirementLevelSchema,
  enforcement: RadarEnforcementSchema,
  humanNote: z.string().max(2000),
}).strict();

export const RadarCompetitivenessSchema = z.object({
  classification: z.enum(["low", "medium", "high", "insufficient_evidence"]),
  dimensions: z.record(z.string(), z.number().min(0).max(1)),
  reasons: z.array(z.string().min(1)).min(1),
  score: z.number().min(0).max(1).nullable(),
}).strict();

export const RadarKeywordDecisionSchema = z.object({
  keywordId: z.string().min(1),
  decision: RadarKeywordDecisionTypeSchema,
  note: z.string().max(2000),
}).strict();

const RadarEvidenceCuratedItemSchema = z.object({ key: z.string().min(1), reason: z.string(), note: z.string(), ownDomain: z.boolean() }).strict();
const RadarEvidenceTermSchema = z.object({ term: z.string().min(1), frequency: z.number().int().nonnegative(), pageCount: z.number().int().nonnegative(), sources: z.array(z.string()), relation: z.string(), decision: RadarSemanticDecisionSchema, note: z.string() }).strict();
const RadarEvidenceQuestionSchema = z.object({ key: z.string().min(1), text: z.string().min(1), note: z.string() }).strict();
const RadarEvidenceEntitySchema = z.object({ text: z.string().min(1), source: z.string(), note: z.string() }).strict();
const RadarEvidenceMetricSchema = RadarBenchmarkMetricSchema.nullable();

export const RadarEvidencePackageSchema = z.object({
  schemaVersion: z.literal(1), packageType: z.literal("radar_evidence"), id: z.string().min(1), brandId: z.string().min(1), radarItemId: z.string().min(1), articleId: z.string().min(1), articleDnaId: z.string().min(1),
  serp: z.object({ snapshotId: z.string().min(1), version: z.number().int().positive(), hash: z.string().min(1), provider: z.literal("serper"), query: z.string().min(1), capturedAt: z.string().datetime() }).strict(),
  analysisMode: z.object({ mode: RadarAnalysisModeSchema, selectedBy: z.string().min(1), selectedAt: z.string().datetime(), reason: z.string().optional() }).strict(),
  includedOrganicResults: z.array(RadarEvidenceCuratedItemSchema), excludedOrganicResults: z.array(RadarEvidenceCuratedItemSchema),
  relevantQuestions: z.array(RadarEvidenceQuestionSchema), relevantRelatedSearches: z.array(RadarEvidenceQuestionSchema), relevantEntities: z.array(RadarEvidenceEntitySchema),
  observedStructure: z.object({ sampleSize: z.number().int().nonnegative(), wordCounts: RadarEvidenceMetricSchema, headings: z.record(z.string(), RadarEvidenceMetricSchema), links: z.record(z.string(), RadarEvidenceMetricSchema), formatting: z.record(z.string(), RadarEvidenceMetricSchema), contentElements: z.record(z.string(), RadarEvidenceMetricSchema) }).strict(),
  observedSemantics: z.object({ recurringTerms: z.array(RadarEvidenceTermSchema), entities: z.array(z.string()), recurringTopics: z.array(z.string()) }).strict(),
  observedCompetitiveness: z.object({ level: z.enum(["low", "medium", "high", "insufficient_evidence"]), dimensions: z.record(z.string(), z.number().min(0).max(1)), reasons: z.array(z.string()) }).strict(),
  kgrStrategy: RadarKgrStrategySchema.nullable().optional(),
  keywordObservations: z.array(z.object({ keywordId: z.string().min(1), observation: z.string().min(1), confidence: RadarAnalysisConfidenceSchema }).strict()),
  conflicts: z.array(z.object({ kind: z.string().min(1), message: z.string().min(1), source: z.string().min(1) }).strict()), humanNotes: z.string().nullable(),
  version: z.number().int().positive(), hash: z.string().regex(/^sha256:[a-f0-9]{64}$/), provenance: z.object({ source: z.literal("radar"), analysisVersionId: z.string().min(1), serpSnapshotHash: z.string().min(1) }).strict(),
}).strict();
export type RadarEvidencePackage = z.infer<typeof RadarEvidencePackageSchema>;
export const LegacyRadarPlannerPackageSchema = z.object({
  mode: RadarAnalysisModeSchema, enforcement: RadarEnforcementSchema, serpSnapshotId: z.string().min(1), serpSnapshotVersion: z.number().int().positive(), serpSnapshotHash: z.string().min(1), includedSerpKeys: z.array(z.string()), selectedCompetitorIds: z.array(z.string()), extractionIds: z.array(z.string()), requirements: z.array(z.string()), recommendations: z.array(z.string()), observedData: z.array(z.string()).default([]), semanticTerms: z.array(z.string()), keywordDecisions: z.array(RadarKeywordDecisionSchema), competitiveness: RadarCompetitivenessSchema.nullable(),
  futureGuardian: z.object({ wordRange: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).nullable(), requiredTopics: z.array(z.string()), recommendedTopics: z.array(z.string()), requiredStructure: z.array(z.string()) }).strict(),
}).strict();
export const RadarPlannerPackageSchema = RadarEvidencePackageSchema;

export const RadarAnalysisPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  serpSnapshotId: z.string().min(1),
  serpSnapshotVersion: z.number().int().positive(),
  serpSnapshotHash: z.string().min(1),
  mode: RadarAnalysisModeSchema,
  modeRecommendation: RadarModeRecommendationSchema,
  modeHumanReason: z.string().max(2000),
  serpDecisions: z.array(RadarSerpDecisionSchema),
  selectedCompetitorIds: z.array(z.string()),
  extractionIds: z.array(z.string()),
  extractions: z.array(RadarExtractionPageSchema),
  benchmark: RadarBenchmarkSchema.nullable(),
  semanticTerms: z.array(RadarSemanticTermSchema),
  structuralDecisions: z.array(RadarStructuralDecisionSchema),
  competitiveness: RadarCompetitivenessSchema.nullable(),
  keywordDecisions: z.array(RadarKeywordDecisionSchema),
  plannerPackage: z.union([RadarEvidencePackageSchema, LegacyRadarPlannerPackageSchema]).nullable(),
  plannerTransfer: RadarPlannerTransferSchema.nullable().default(null),
  status: RadarAnalysisStatusSchema,
  humanNotes: z.array(z.string()),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
}).strict();

export const VersionedRadarAnalysisSchema = VersionMetadataSchema.extend({ payload: RadarAnalysisPayloadSchema });
export type RadarAnalysisPayload = z.infer<typeof RadarAnalysisPayloadSchema>;
export type RadarAnalysisVersion = z.infer<typeof VersionedRadarAnalysisSchema>;

export function suggestRadarAnalysisMode(input: { kgr: number | null; volume: number | null; resultCount: number; keywordDnaConfidence: number | null; format: string; intent: string; kgrClassification?: RadarKgrStrategy["classification"] }) {
  const reasons: string[] = [];
  const strictKgr = input.kgr !== null && input.volume !== null && input.kgr < 0.25 && input.volume <= 250;
  const receivedKgr = input.kgrClassification === "confirmed_kgr";
  const receivedNotKgr = input.kgrClassification === "not_kgr";
  if (receivedKgr) reasons.push("A classificação KGR foi recebida do Minerador/KeywordDNA; o Radar sugere KGR leve sem recalcular a classificação.");
  else if (receivedNotKgr) reasons.push("A classificação recebida não é KGR; o Radar sugere Competitivo completo sem inventar uma classificação diferente.");
  else if (strictKgr) reasons.push("A keyword atende à regra canônica de KGR estrito: KGR abaixo de 0,25 e volume até 250.");
  else if (input.kgr === null || input.volume === null) reasons.push("KGR ou volume não estão disponíveis; o Radar não inventa um threshold de substituição.");
  else reasons.push("A keyword não atende simultaneamente à regra canônica de KGR estrito.");
  if (input.resultCount >= 8) reasons.push("A SERP oferece amostra suficiente para observar formatos e concorrência.");
  if (input.keywordDnaConfidence !== null && input.keywordDnaConfidence < 0.6) reasons.push("A confiança do KeywordDNA pede validação humana adicional.");
  if (input.intent) reasons.push(`Intenção observada: ${input.intent}.`);
  if (input.format) reasons.push(`Formato editorial: ${input.format}.`);
  return { suggestedMode: receivedKgr || (!receivedNotKgr && (strictKgr || input.kgr === null || input.volume === null)) ? "kgr_light" as const : "competitive_full" as const, reasons, confidence: receivedKgr ? "high" as const : input.kgr === null || input.volume === null ? "low" as const : input.keywordDnaConfidence !== null && input.keywordDnaConfidence >= 0.75 ? "high" as const : "medium" as const, ruleSource: "minerador_kgr_strict" as const };
}

function numericStats(values: number[]) {
  if (!values.length) return { mean: 0, median: 0, min: 0, max: 0, typicalRange: [0, 0] as [number, number], sampleSize: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { mean: Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2)), median: sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2)), min: sorted[0], max: sorted.at(-1) || 0, typicalRange: [sorted[Math.max(0, Math.floor(sorted.length * 0.25))], sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)]] as [number, number], sampleSize: values.length };
}

export function buildRadarBenchmark(mode: RadarAnalysisMode, pages: Array<z.infer<typeof RadarExtractionPageSchema>>) {
  const valid = pages.filter(isComparableRadarExtraction);
  const raw: Record<string, { label: string; unit: "count" | "words"; values: number[] }> = {
    words: { label: "Palavras", unit: "words", values: valid.map(page => page.wordCount) },
    internalLinks: { label: "Links internos", unit: "count", values: valid.map(page => page.internalLinkCount) },
    externalLinks: { label: "Links externos", unit: "count", values: valid.map(page => page.externalLinkCount) },
    h2: { label: "H2", unit: "count", values: valid.map(page => page.h2.length) },
    h3: { label: "H3", unit: "count", values: valid.map(page => page.h3.length) },
    lists: { label: "Listas", unit: "count", values: valid.map(page => page.listCount) },
    tables: { label: "Tabelas", unit: "count", values: valid.map(page => page.tableCount) },
    faq: { label: "FAQ", unit: "count", values: valid.map(page => page.faqCount) },
  };
  const metrics = Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, { label: item.label, unit: item.unit, ...numericStats(item.values) } ]));
  const recommendations = mode === "kgr_light" ? ["Use as médias apenas como evidência observada; o Planejador decide a estrutura.", "Priorize intenção, clareza e cobertura essencial."] : ["Compare mediana, faixa típica e outliers como evidência observada.", "O Planejador transforma observações em decisões editoriais após revisão humana."];
  return { mode, analyzedPageCount: pages.length, validPageCount: valid.length, metrics, distributions: {}, outliers: [], recommendations };
}

export function analysisApprovalIssues(analysis: RadarAnalysisVersion, kgrStrategy?: RadarKgrStrategy | null) {
  const payload = analysis.payload;
  const issues: string[] = [];
  if (payload.mode === "competitive_full" && payload.extractions.filter(extraction => ["success", "partial"].includes(extraction.status)).length < 3) issues.push("O modo competitivo exige extração de pelo menos três concorrentes.");
  if (payload.serpDecisions.some(decision => decision.decision === "pending")) issues.push("Existem itens da SERP sem decisão.");
  if (payload.mode === "competitive_full" && payload.selectedCompetitorIds.length < 3) issues.push("O modo competitivo exige pelo menos três concorrentes selecionados.");
  if (payload.mode === "competitive_full" && payload.extractions.some(extraction => extraction.status === "pending")) issues.push("Há extrações pendentes no modo competitivo.");
  if (payload.keywordDecisions.some(decision => decision.decision === "return_to_architect_review" && !decision.note.trim())) issues.push("A revisão de uma keyword no Arquiteto precisa de uma justificativa.");
  if ((kgrStrategy?.keywordComposition.totalCount || 0) > (kgrStrategy?.keywordComposition.strategicLimit || 6)) issues.push(`Este artigo possui ${kgrStrategy!.keywordComposition.totalCount} keywords, acima do limite estratégico de 6. Revise a composição no Arquiteto antes de consolidar novas evidências.`);
  return [...new Set(issues)];
}

export async function createRadarAnalysisVersion(input: {
  brandId: string;
  article: VersionEnvelope<ArticleDNA>;
  research: SerpResearchSnapshot;
  mode: RadarAnalysisMode;
  modeRecommendation: z.input<typeof RadarModeRecommendationSchema>;
  actorId: string;
  humanReason?: string;
  ownDomainHost?: string | null;
  previous?: RadarAnalysisVersion;
  now?: string;
}) {
  const now = input.now || new Date().toISOString();
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1,
    brandId: input.brandId,
    articleId: input.article.payload.articleId,
    articleDnaVersionId: input.article.versionId,
    serpSnapshotId: input.research.id,
    serpSnapshotVersion: input.research.version,
    serpSnapshotHash: input.research.contentHash,
    mode: input.mode,
    modeRecommendation: input.modeRecommendation,
    modeHumanReason: input.humanReason || "",
    serpDecisions: [
       ...input.research.organicResults.map(result => ({ key: `organic:${result.position}`, itemType: "organic", decision: "pending", reason: "", note: "", ownDomain: Boolean(input.ownDomainHost && (() => { try { return new URL(result.url).hostname.toLowerCase().replace(/^www\\./, "") === input.ownDomainHost!.toLowerCase().replace(/^www\\./, ""); } catch { return false; } })()) })),
      ...input.research.peopleAlsoAsk.map(result => ({ key: `paa:${result.position}`, itemType: "people_also_ask", decision: "pending", reason: "", note: "", ownDomain: false })),
      ...input.research.relatedSearches.map((result, index) => ({ key: `related:${index + 1}`, itemType: "related_search", decision: "pending", reason: "", note: "", ownDomain: false })),
      ...(input.research.knowledgeGraph ? [{ key: "knowledge_graph:1", itemType: "knowledge_graph", decision: "pending", reason: "", note: "", ownDomain: false }] : []),
    ],
    selectedCompetitorIds: [], extractionIds: [], extractions: [], benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null,
    keywordDecisions: input.article.payload.keywordReferences.map(reference => ({ keywordId: reference.keywordId, decision: "keep", note: "" })),
    plannerPackage: null, plannerTransfer: null, status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });
  const entityId = input.previous?.entityId || `radar-analysis:${input.article.payload.articleId}`;
  const version = await createVersionEnvelope({ entityId, versionNumber: (input.previous?.versionNumber || 0) + 1, previousVersionId: input.previous?.versionId || null, origin: "human", changeReason: input.previous ? "Nova decisão humana na análise do Radar." : "Análise Radar criada após SERP real.", createdBy: input.actorId, createdAt: now, payload });
  return VersionedRadarAnalysisSchema.parse(version);
}

export async function createRadarAnalysisSuccessor(previous: RadarAnalysisVersion, payloadPatch: Partial<RadarAnalysisPayload>, actorId: string, now = new Date().toISOString()) {
  const targetStatus = payloadPatch.status || "draft";
  const payload = RadarAnalysisPayloadSchema.parse({ ...previous.payload, ...payloadPatch, status: targetStatus, approvedAt: targetStatus === "approved" ? payloadPatch.approvedAt || now : null, approvedBy: targetStatus === "approved" ? payloadPatch.approvedBy || actorId : null, plannerPackage: targetStatus === "approved" ? payloadPatch.plannerPackage ?? previous.payload.plannerPackage : null, plannerTransfer: payloadPatch.plannerTransfer ?? previous.payload.plannerTransfer });
  const version = await createVersionEnvelope({ entityId: previous.entityId, versionNumber: previous.versionNumber + 1, previousVersionId: previous.versionId, origin: "human", changeReason: "Atualização humana da curadoria/análise do Radar.", createdBy: actorId, createdAt: now, payload });
  return VersionedRadarAnalysisSchema.parse(version);
}

export function buildRadarPlannerPackage(payload: RadarAnalysisPayload): RadarAnalysisPayload["plannerPackage"] {
  if (!payload.benchmark && !payload.serpDecisions.length) return null;
  const included = payload.serpDecisions.filter(decision => decision.decision === "included").map(decision => decision.key);
  const requirements = payload.structuralDecisions.filter(decision => decision.level === "required").map(decision => decision.label);
  const recommendations = payload.structuralDecisions.filter(decision => decision.level === "recommended" || decision.level === "optional").map(decision => decision.label);
  return { mode: payload.mode, enforcement: payload.mode === "competitive_full" ? "required" : "advisory", serpSnapshotId: payload.serpSnapshotId, serpSnapshotVersion: payload.serpSnapshotVersion, serpSnapshotHash: payload.serpSnapshotHash, includedSerpKeys: included, selectedCompetitorIds: payload.selectedCompetitorIds, extractionIds: payload.extractionIds, requirements, recommendations, observedData: Object.entries(payload.benchmark?.metrics || {}).map(([key, metric]) => `${key}: ${metric.mean}`), semanticTerms: payload.semanticTerms.filter(term => ["include_topic", "support_term"].includes(term.decision)).map(term => term.term), keywordDecisions: payload.keywordDecisions, competitiveness: payload.competitiveness, futureGuardian: { wordRange: payload.benchmark?.metrics.words ? [Math.round(payload.benchmark.metrics.words.typicalRange[0]), Math.round(payload.benchmark.metrics.words.typicalRange[1])] : null, requiredTopics: payload.semanticTerms.filter(term => term.decision === "include_topic").map(term => term.term), recommendedTopics: payload.semanticTerms.filter(term => term.decision === "support_term").map(term => term.term), requiredStructure: requirements } };
}
