import { z } from "zod";
import type { ArticleDNA, ProductEvidenceDNA, SiloDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import { RADAR_INTENT_NOT_CONCLUDED, radarDeclaredArticleIntent } from "./editorial-identity.ts";
import type { RadarCompetitiveReport } from "./competitive-report.ts";
import type {
  RadarR4AmazonState,
  RadarR4ExistingContentRecord,
  RadarR4ReportState,
  RadarR4TopicSource,
} from "./r4-queue.ts";

export const RADAR_R6_REPORT_STATES = ["NOT_STARTED", "REPORT_GENERATED", "REPORT_REVIEWED", "REPORT_APPROVED"] as const;
export type RadarR6ReportState = typeof RADAR_R6_REPORT_STATES[number];

export const RADAR_R6_PLANNER_HANDOFF_CONTRACT = "STRUCTURAL_CHANGE_REQUIRED" as const;
export const RADAR_R6_TELEGRAM_REMOTE_FOUNDATION = "PARTIAL" as const;
export const RADAR_R6_AUDIO_CONTRACT_READINESS = "IMPLEMENTED_NOT_SMOKED" as const;

const TopicOriginSchema = z.enum(["SERP", "AMAZON", "ArticleDNA", "SiloDNA", "Conteúdo existente"]);

export const RadarR6TopicSuggestionSchema = z.object({
  text: z.string().trim().min(1).max(500),
  origin: TopicOriginSchema,
  origins: z.array(TopicOriginSchema).min(1).max(4),
  justification: z.string().trim().min(1).max(1000),
  need: z.string().trim().min(1).max(500),
  reference: z.string().trim().min(1).max(800),
  complementaryExistingContent: z.string().trim().min(1).max(500).optional(),
}).strict();

const ApprovedReferenceSchema = z.object({
  position: z.number().int().positive(),
  title: z.string().trim().min(1),
  url: z.string().url(),
  role: z.enum(["primary", "support"]),
}).strict();

const ExistingContentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["YOUTUBE", "PODCAST", "VIDEO", "AUDIO", "DOCUMENT"]),
  label: z.string().trim().min(1),
  reference: z.string().trim().min(1),
  state: z.enum(["LINK_REGISTERED", "AWAITING_FILE", "IGNORED_FOR_ARTICLE"]),
}).strict();

export const RadarR6ExpertTopicContextSchema = z.object({
  articleId: z.string().min(1),
  brandId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  articleDnaContentHash: z.string().nullable(),
  articleDna: z.object({
    principal: z.string().min(1),
    intent: z.string().min(1),
    silo: z.string().min(1),
    audience: z.string().min(1),
    problem: z.string().min(1),
    desiredResult: z.string().min(1),
    requiredTopics: z.array(z.string()),
    knownQuestions: z.array(z.string()),
  }).strict(),
  keywordDnas: z.array(z.object({
    keywordId: z.string().min(1),
    keywordDnaVersionId: z.string().min(1),
    keyword: z.string().nullable(),
    role: z.enum(["principal", "secundaria", "reforco_narrativo"]),
  }).strict()).max(10),
  siloDna: z.object({
    siloId: z.string().min(1),
    versionId: z.string().min(1),
    name: z.string().nullable(),
    objective: z.string(),
    boundary: z.string(),
    includedTopics: z.array(z.string()),
    gaps: z.array(z.string()),
  }).strict().nullable(),
  serpNeeds: z.array(z.string()).max(40),
  openGaps: z.array(z.string()).max(40),
  conflicts: z.array(z.string()).max(40),
  knownQuestions: z.array(z.string()).max(60),
  approvedReferences: z.array(ApprovedReferenceSchema).max(20),
  serpSnapshotId: z.string().nullable(),
  serpSnapshotVersion: z.number().int().positive().nullable(),
  serpReviewed: z.boolean(),
  analysisVersionId: z.string().nullable(),
  amazonCriteria: z.array(z.string()).max(30),
  amazonEvidence: z.array(z.object({
    evidenceId: z.string().min(1),
    summary: z.string().min(1),
    sourceUrl: z.string().url(),
  }).strict()).max(20),
  amazonState: z.enum(["AMAZON_APPLICABLE", "AMAZON_NOT_APPLICABLE", "AMAZON_PENDING", "AMAZON_REVIEWED"]),
  existingContent: z.string().max(8000),
  existingContentItems: z.array(ExistingContentSchema).max(20),
  provenance: z.array(z.object({
    sourceType: TopicOriginSchema,
    label: z.string().min(1),
    referenceId: z.string().nullable(),
    url: z.string().url().nullable(),
  }).strict()).max(60),
}).strict();

export type RadarR6ExpertTopicContext = z.infer<typeof RadarR6ExpertTopicContextSchema>;

export type RadarR6TopicContextInput = {
  brandId: string;
  article: VersionEnvelope<ArticleDNA>;
  articleDnaVersionId?: string | null;
  keywordDnas?: Array<{
    keywordId: string;
    keywordDnaVersionId: string;
    keyword?: string | null;
    role: "principal" | "secundaria" | "reforco_narrativo";
  }>;
  siloDna?: VersionEnvelope<SiloDNA> | null;
  serp?: {
    reviewed?: boolean;
    snapshotId?: string | null;
    snapshotVersion?: number | null;
    analysisVersionId?: string | null;
    needs?: string[];
    openGaps?: string[];
    conflicts?: string[];
    knownQuestions?: string[];
    approvedReferences?: Array<z.infer<typeof ApprovedReferenceSchema>>;
  };
  amazon?: {
    state?: RadarR6ExpertTopicContext["amazonState"];
    criteria?: string[];
    evidence?: ProductEvidenceDNA[];
  };
  existingContent?: RadarR4ExistingContentRecord[];
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map(value => value?.replace(/\s+/g, " ").trim()).filter((value): value is string => Boolean(value)))];
}

function sourceLabel(sourceType: z.infer<typeof TopicOriginSchema>, label: string, referenceId: string | null, url: string | null = null) {
  return { sourceType, label, referenceId, url };
}

function existingContentSummary(items: RadarR4ExistingContentRecord[]) {
  const active = items.filter(item => item.state !== "IGNORED_FOR_ARTICLE");
  if (!active.length) return "Nenhum material existente do especialista associado.";
  return active.map(item => `${item.label} (${item.state})`).join(" · ");
}

function amazonEvidenceSummary(evidence: ProductEvidenceDNA[]) {
  return evidence.map(item => ({
    evidenceId: item.evidenceId,
    summary: unique([
      ...item.recurringPraise.slice(0, 3).map(value => `Elogio: ${value.pattern}`),
      ...item.recurringComplaints.slice(0, 3).map(value => `Queixa: ${value.pattern}`),
      ...item.expectations.slice(0, 2).map(value => `Expectativa: ${value}`),
    ]).join(" · ") || `Evidência de produto ${item.product.name}`,
    sourceUrl: item.product.sourceUrl,
  }));
}

/**
 * Canonical local context for the specialist-topic consumer. It only carries
 * IDs already present in the received envelopes/snapshots; topic IDs are
 * generated after the provider response and never sent as source identity.
 */
export function buildExpertTopicContext(articleId: string, input: RadarR6TopicContextInput): RadarR6ExpertTopicContext {
  const article = input.article.payload;
  if (article.articleId !== articleId) throw new Error("O ArticleDNA recebido não corresponde ao artigo focado no Radar.");
  if (article.brandId !== input.brandId) throw new Error("O ArticleDNA recebido não pertence à marca ativa.");

  const refs = input.serp?.approvedReferences || [];
  const serpNeeds = unique(input.serp?.needs || []);
  const openGaps = unique(input.serp?.openGaps || []);
  const conflicts = unique(input.serp?.conflicts || []);
  const articleQuestions = unique([...article.questions, ...article.evidenceNeeded, ...article.sourcesNeeded]);
  const existing = input.existingContent || [];
  const articleDnaVersionId = input.articleDnaVersionId || input.article.versionId;
  const keywordDnas = input.keywordDnas || article.keywordReferences.map(reference => ({
    keywordId: reference.keywordId,
    keywordDnaVersionId: reference.keywordDnaVersionId,
    keyword: reference.keywordId === article.principalKeywordId ? article.promise : null,
    role: reference.role,
  }));
  const silo = input.siloDna;
  const amazonEvidence = amazonEvidenceSummary(input.amazon?.evidence || []);
  const knownQuestions = unique([...articleQuestions, ...(input.serp?.knownQuestions || []), ...refs.map(reference => reference.title)]);
  const provenance = [
    sourceLabel("ArticleDNA", `ArticleDNA ${input.article.versionNumber}`, input.article.versionId),
    ...keywordDnas.map(reference => sourceLabel("ArticleDNA", `KeywordDNA ${reference.keywordId}`, reference.keywordDnaVersionId)),
    ...(silo ? [sourceLabel("SiloDNA", `SiloDNA ${silo.versionNumber}`, silo.versionId)] : []),
    ...(input.serp?.snapshotId ? [sourceLabel("SERP", `Snapshot SERP v${input.serp.snapshotVersion || 1} / análise Radar`, input.serp.snapshotId)] : []),
    ...refs.map(reference => sourceLabel("SERP", reference.title, null, reference.url)),
    ...amazonEvidence.map(evidence => sourceLabel("AMAZON", `Evidência Amazon ${evidence.evidenceId}`, evidence.evidenceId, evidence.sourceUrl)),
    ...existing.filter(item => item.state !== "IGNORED_FOR_ARTICLE").map(item => sourceLabel("Conteúdo existente", item.label, item.id)),
  ];

  return RadarR6ExpertTopicContextSchema.parse({
    articleId,
    brandId: input.brandId,
    articleDnaVersionId,
    articleDnaContentHash: input.article.contentHash,
    articleDna: {
      principal: article.promise,
      /* `z.string().min(1)`: a ausência é declarada, não disfarçada de intenção. */
      intent: radarDeclaredArticleIntent(article) || RADAR_INTENT_NOT_CONCLUDED,
      silo: silo?.payload.name || silo?.payload.centralEntity || article.siloId || "Silo não vinculado",
      audience: article.audience,
      problem: article.problem,
      desiredResult: article.desiredResult,
      requiredTopics: unique([...article.requiredTopics, ...article.coverage]),
      knownQuestions: articleQuestions,
    },
    keywordDnas,
    siloDna: silo ? {
      siloId: silo.payload.siloId,
      versionId: silo.versionId,
      name: silo.payload.name || null,
      objective: silo.payload.objective,
      boundary: silo.payload.boundary,
      includedTopics: silo.payload.includedTopics,
      gaps: silo.payload.gaps,
    } : null,
    serpNeeds,
    openGaps,
    conflicts,
    knownQuestions,
    approvedReferences: refs,
    serpSnapshotId: input.serp?.snapshotId || null,
    serpSnapshotVersion: input.serp?.snapshotVersion || null,
    serpReviewed: Boolean(input.serp?.reviewed),
    analysisVersionId: input.serp?.analysisVersionId || null,
    amazonCriteria: unique(input.amazon?.criteria || []),
    amazonEvidence,
    amazonState: input.amazon?.state || "AMAZON_NOT_APPLICABLE",
    existingContent: existingContentSummary(existing),
    existingContentItems: existing,
    provenance,
  });
}

export function normalizeRadarR6ReportState(input: {
  localState: RadarR4ReportState;
  legacyGenerated?: boolean;
  legacyApproved?: boolean;
}): RadarR6ReportState {
  if (input.localState === "REPORT_APPROVED") return "REPORT_APPROVED";
  if (input.localState === "REPORT_REVIEWED") return "REPORT_REVIEWED";
  if (input.localState === "REPORT_GENERATED" || input.localState === "READY_FOR_REVIEW") return "REPORT_GENERATED";
  if (input.legacyApproved) return "REPORT_APPROVED";
  if (input.legacyGenerated) return "REPORT_GENERATED";
  return "NOT_STARTED";
}

export function radarR6ReportStateLabel(state: RadarR6ReportState) {
  return ({
    NOT_STARTED: "Aguardando geração",
    REPORT_GENERATED: "Prévia gerada",
    REPORT_REVIEWED: "Relatório revisado",
    REPORT_APPROVED: "Relatório aprovado",
  } as Record<RadarR6ReportState, string>)[state];
}

export type RadarR6ConsolidatedReport = {
  id: string;
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  siloDnaVersionId: string | null;
  state: RadarR6ReportState;
  final: boolean;
  stale: boolean;
  summary: string;
  needs: string[];
  gaps: string[];
  conflicts: string[];
  recommendations: string[];
  pendingContributions: string[];
  evidence: {
    articleDna: { versionId: string; principal: string };
    serp: { snapshotId: string | null; analysisVersionId: string | null; references: string[]; reviewed: boolean };
    amazon: { state: RadarR4AmazonState; evidenceIds: string[]; summaries: string[]; reviewed: boolean };
    expert: { contributionIds: string[]; summaries: string[]; reviewed: boolean };
  };
  provenance: {
    articleDnaVersionId: string;
    siloDnaVersionId: string | null;
    serpSnapshotId: string | null;
    analysisVersionId: string | null;
    amazonEvidenceIds: string[];
    expertContributionIds: string[];
  };
};

export type RadarR6ExpertEvidenceInput = {
  id: string;
  summary: string;
  reviewed: boolean;
  contributionId?: string;
  decision?: "pending" | "accepted" | "support" | "quote" | "rejected";
  classification?: string | null;
  need?: string | null;
  sourceType?: "TEXT" | "VOICE" | "AUDIO" | "DOCUMENT";
};

export function buildRadarR6ConsolidatedReport(input: {
  brandId: string;
  articleId: string;
  article: VersionEnvelope<ArticleDNA> | null;
  siloDnaVersionId?: string | null;
  state: RadarR6ReportState;
  serp: {
    reviewed: boolean;
    snapshotId?: string | null;
    analysisVersionId?: string | null;
    report?: RadarCompetitiveReport | null;
    references?: string[];
    needs?: string[];
    gaps?: string[];
    conflicts?: string[];
  };
  amazon?: {
    state?: RadarR4AmazonState;
    evidenceIds?: string[];
    summaries?: string[];
    reviewed?: boolean;
  };
  expert?: {
    required?: boolean;
    evidence?: RadarR6ExpertEvidenceInput[];
    contentBlocked?: number;
  };
  /** Fingerprint recorded by the local approval gate, when available. */
  approvedEvidenceFingerprint?: string | null;
}): RadarR6ConsolidatedReport | null {
  if (!input.article) return null;
  const article = input.article.payload;
  const serpReport = input.serp.report || null;
  const needs = unique([...(serpReport?.needs || []).flatMap(need => [need.title, ...need.topics]), ...(input.serp.needs || [])]);
  const gaps = unique([...(input.serp.gaps || []), ...(serpReport?.profile.limitations || [])]);
  const conflicts = unique([...(input.serp.conflicts || []), ...(serpReport?.dnaComparison.intentStatus === "conflict" ? ["Intenção observada em conflito com o ArticleDNA."] : [])]);
  const references = unique([...(input.serp.references || []), ...(serpReport?.competitors.filter(item => item.includedInBenchmark).map(item => item.url) || [])]);
  const amazonEvidenceIds = unique(input.amazon?.evidenceIds || []);
  const amazonState = input.amazon?.state || "AMAZON_NOT_APPLICABLE";
  const expertEvidence = input.expert?.evidence || [];
  const expertContributionIds = unique(expertEvidence.map(evidence => evidence.contributionId || evidence.id));
  const expertReviewed = expertEvidence.length > 0 && expertEvidence.every(evidence => evidence.reviewed);
  const acceptedExpertEvidence = expertEvidence.filter(evidence => evidence.decision !== "rejected");
  const amazonPending = (amazonState === "AMAZON_PENDING" || amazonState === "AMAZON_APPLICABLE") && !input.amazon?.reviewed;
  const pendingContributions = [
    ...(amazonPending ? ["Evidências Amazon ainda não revisadas."] : []),
    ...((input.expert?.required || expertEvidence.length > 0) && !expertReviewed ? ["Contribuição do especialista ainda não consolidada."] : []),
    ...((input.expert?.contentBlocked || 0) > 0 ? ["Há contribuição revisada sem conteúdo legível preservado; o Radar não a promove a evidência."] : []),
  ];
  const summary = serpReport?.summary.text || (input.serp.reviewed
    ? `Prévia consolidada para “${article.promise}” a partir da SERP revisada.`
    : "A prévia será formada depois da revisão humana da SERP.");

  const report = {
    id: `radar-r6-report:${input.articleId}:${input.article.versionId}`,
    brandId: input.brandId,
    articleId: input.articleId,
    articleDnaVersionId: input.article.versionId,
    siloDnaVersionId: input.siloDnaVersionId || null,
    state: input.state,
    stale: false,
    final: false,
    summary,
    needs,
    gaps,
    conflicts,
    recommendations: unique([
      ...(serpReport?.needs || []).map(need => need.note),
      ...(input.expert?.required ? ["Conferir a contribuição do especialista antes de considerar o relatório final."] : []),
    ]),
    pendingContributions,
    evidence: {
      articleDna: { versionId: input.article.versionId, principal: article.promise },
      serp: { snapshotId: input.serp.snapshotId || serpReport?.serp.snapshotId || null, analysisVersionId: input.serp.analysisVersionId || serpReport?.analysis.versionId || null, references, reviewed: input.serp.reviewed },
      amazon: { state: amazonState, evidenceIds: amazonEvidenceIds, summaries: unique(input.amazon?.summaries || []), reviewed: Boolean(input.amazon?.reviewed) },
      expert: { contributionIds: expertContributionIds, summaries: unique(acceptedExpertEvidence.map(evidence => evidence.summary)), reviewed: expertReviewed },
    },
    provenance: {
      articleDnaVersionId: input.article.versionId,
      siloDnaVersionId: input.siloDnaVersionId || null,
      serpSnapshotId: input.serp.snapshotId || serpReport?.serp.snapshotId || null,
      analysisVersionId: input.serp.analysisVersionId || serpReport?.analysis.versionId || null,
      amazonEvidenceIds,
      expertContributionIds,
    },
  };
  const currentEvidenceFingerprint = JSON.stringify({
    articleDnaVersionId: report.provenance.articleDnaVersionId,
    siloDnaVersionId: report.provenance.siloDnaVersionId,
    serpSnapshotId: report.provenance.serpSnapshotId,
    analysisVersionId: report.provenance.analysisVersionId,
    serpReferences: [...report.evidence.serp.references].sort(),
    amazonEvidenceIds: [...report.provenance.amazonEvidenceIds].sort(),
    expertContributionIds: [...report.provenance.expertContributionIds].sort(),
    expertEvidence: [...report.evidence.expert.summaries].sort(),
  });
  const stale = Boolean(input.approvedEvidenceFingerprint && input.approvedEvidenceFingerprint !== currentEvidenceFingerprint);
  const effectiveState = stale ? "REPORT_GENERATED" as const : input.state;
  return {
    ...report,
    state: effectiveState,
    stale,
    final: effectiveState === "REPORT_APPROVED" && pendingContributions.length === 0 && input.serp.reviewed && !stale,
    pendingContributions: [
      ...pendingContributions,
      ...(stale ? ["Novas evidências foram encontradas; a aprovação anterior precisa ser revisada novamente."] : []),
    ],
  };
}

export function classifyRadarR6PlannerHandoff(input: { includesAmazonOrExpertEvidence: boolean; existingPackageSupportsSupplement: boolean }) {
  if (!input.includesAmazonOrExpertEvidence) return "COMPATIBLE" as const;
  return input.existingPackageSupportsSupplement ? "NEEDS_ADDITIVE_ADAPTER" as const : "STRUCTURAL_CHANGE_REQUIRED" as const;
}

export function radarR6TopicOriginLabel(origins: RadarR4TopicSource[] | undefined, fallback: RadarR4TopicSource) {
  const values = origins?.length ? origins : [fallback];
  return [...new Set(values)].join(" + ");
}

export function radarR6CanApproveReport(report: RadarR6ConsolidatedReport | null | undefined) {
  return Boolean(report && report.state === "REPORT_REVIEWED" && !report.stale && report.pendingContributions.length === 0 && report.evidence.serp.reviewed && (report.evidence.amazon.state === "AMAZON_NOT_APPLICABLE" || report.evidence.amazon.reviewed));
}

function normalizedTopicText(value: string) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export function validateRadarR6TopicSuggestions(context: RadarR6ExpertTopicContext, suggestions: Array<z.infer<typeof RadarR6TopicSuggestionSchema>>) {
  const allowedOrigins = new Set(context.provenance.map(source => source.sourceType));
  const allowedReferences = new Set(context.provenance.flatMap(source => [source.label, source.url].filter((value): value is string => Boolean(value))));
  const known = new Set([...context.knownQuestions, ...context.articleDna.requiredTopics, ...context.existingContentItems.filter(item => item.state !== "IGNORED_FOR_ARTICLE").map(item => item.label)].map(normalizedTopicText));
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    const normalized = normalizedTopicText(suggestion.text);
    if (seen.has(normalized) || known.has(normalized)) throw new Error("A pauta repete uma pergunta ou informação já conhecida no contexto.");
    seen.add(normalized);
    if (suggestion.origins.some(origin => !allowedOrigins.has(origin))) throw new Error("A pauta declarou uma origem que não existe na proveniência recebida.");
    if (!allowedReferences.has(suggestion.reference)) throw new Error("A pauta declarou uma referência ausente na proveniência recebida.");
    if (suggestion.complementaryExistingContent && context.existingContentItems.every(item => item.state === "IGNORED_FOR_ARTICLE")) throw new Error("A pauta declarou material complementar inexistente para este artigo.");
  }
  return suggestions;
}

export function radarR6TopicReviewCounts(items: Array<{ id: string }>, reviewedIds: string[]) {
  const reviewed = items.filter(item => reviewedIds.includes(item.id)).length;
  return { total: items.length, reviewed, pending: Math.max(items.length - reviewed, 0) };
}
