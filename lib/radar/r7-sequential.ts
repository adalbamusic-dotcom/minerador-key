import { z } from "zod";
import type { RadarR4AmazonState, RadarR4LocalArticleState, RadarR4TopicSource } from "./r4-queue.ts";
import {
  RadarR6TopicSuggestionSchema,
  validateRadarR6TopicSuggestions,
  type RadarR6ConsolidatedReport,
  type RadarR6ExpertTopicContext,
} from "./r6-sequential.ts";

export const RADAR_R7_VALIDATION_CLASSIFICATIONS = [
  "REAL_VALIDATED",
  "IMPLEMENTED_NOT_SMOKED",
  "LOCAL_VALIDATED",
  "BLOCKED_BY_DATABASE",
  "BLOCKED_BY_PLANNER_GERAL",
  "AWAITING_AUTHORIZATION",
  "AWAITING_MANUAL_TEST",
] as const;
export type RadarR7ValidationClassification = typeof RADAR_R7_VALIDATION_CLASSIFICATIONS[number];

export const RADAR_R7_STATE_CLASSIFICATIONS = [
  "DERIVED_FROM_REAL_DATA",
  "PERSISTED",
  "RECONSTRUCTIBLE",
  "LOCAL_ONLY",
  "FIXTURE",
] as const;
export type RadarR7StateClassification = typeof RADAR_R7_STATE_CLASSIFICATIONS[number];

export type RadarR7StateArea = "SERP" | "AMAZON" | "CONTEUDO" | "ESPECIALISTA" | "RELATORIO";

export type RadarR7StateMatrixEntry = {
  area: RadarR7StateArea;
  state: string;
  classifications: RadarR7StateClassification[];
  userFacingLabel: string;
};

export type RadarR7StateMatrixInput = {
  serp: {
    hasRealSnapshot: boolean;
    reviewed: boolean;
    persisted: boolean;
  };
  amazon: {
    state: RadarR4AmazonState;
    hasEvidence: boolean;
    persisted: boolean;
  };
  content: {
    hasArticleDna: boolean;
    hasLocalRows: boolean;
    persisted: boolean;
  };
  specialist: {
    hasLocalTopics: boolean;
    hasRemoteContribution: boolean;
    fixtureMode: boolean;
  };
  report: {
    state: string;
    generatedLocally: boolean;
    approvedLocally: boolean;
    stale: boolean;
  };
};

function stateClassifications(input: {
  derived: boolean;
  persisted?: boolean;
  reconstructible?: boolean;
  localOnly?: boolean;
  fixture?: boolean;
}) {
  const classifications: RadarR7StateClassification[] = [];
  if (input.derived) classifications.push("DERIVED_FROM_REAL_DATA");
  if (input.persisted) classifications.push("PERSISTED");
  if (input.reconstructible) classifications.push("RECONSTRUCTIBLE");
  if (input.localOnly) classifications.push("LOCAL_ONLY");
  if (input.fixture) classifications.push("FIXTURE");
  return classifications;
}

/**
 * R7 keeps provenance visible in the model without pretending that local
 * session state is a durable remote readback.
 */
export function buildRadarR7StateMatrix(input: RadarR7StateMatrixInput): RadarR7StateMatrixEntry[] {
  return [
    {
      area: "SERP",
      state: input.serp.hasRealSnapshot ? (input.serp.reviewed ? "COMPLETED" : "WAITING_REVIEW") : "NOT_COLLECTED",
      classifications: stateClassifications({
        derived: input.serp.hasRealSnapshot,
        persisted: input.serp.persisted,
        reconstructible: input.serp.hasRealSnapshot,
      }),
      userFacingLabel: input.serp.hasRealSnapshot ? "Dados reais do snapshot SERP" : "Aguardando coleta real",
    },
    {
      area: "AMAZON",
      state: input.amazon.state,
      classifications: stateClassifications({
        derived: input.amazon.hasEvidence,
        persisted: input.amazon.persisted,
        reconstructible: input.amazon.hasEvidence,
        localOnly: !input.amazon.hasEvidence,
      }),
      userFacingLabel: input.amazon.hasEvidence ? "Evidência Amazon recebida" : "Estado local; evidência Amazon não verificada",
    },
    {
      area: "CONTEUDO",
      state: input.content.hasArticleDna ? (input.content.hasLocalRows ? "CONSOLIDATED_LOCAL" : "ARTICLE_DNA_RECEIVED") : "NOT_HYDRATED",
      classifications: stateClassifications({
        derived: input.content.hasArticleDna,
        persisted: input.content.persisted,
        reconstructible: input.content.hasArticleDna,
        localOnly: input.content.hasLocalRows,
      }),
      userFacingLabel: input.content.hasArticleDna ? "ArticleDNA preservado; complementos locais identificados" : "ArticleDNA não hidratado",
    },
    {
      area: "ESPECIALISTA",
      state: input.specialist.fixtureMode ? "FIXTURE" : input.specialist.hasRemoteContribution ? "CONTRIBUTION_RECEIVED" : input.specialist.hasLocalTopics ? "TOPICS_LOCAL_ONLY" : "NOT_STARTED",
      classifications: stateClassifications({
        derived: input.specialist.hasRemoteContribution,
        reconstructible: input.specialist.hasRemoteContribution,
        localOnly: input.specialist.hasLocalTopics && !input.specialist.hasRemoteContribution,
        fixture: input.specialist.fixtureMode,
      }),
      userFacingLabel: input.specialist.fixtureMode
        ? "Fixture visível somente em modo de teste"
        : input.specialist.hasRemoteContribution
          ? "Contribuição remota recebida; revisão humana pendente"
          : "Pautas locais não são contribuição persistida",
    },
    {
      area: "RELATORIO",
      state: input.report.state,
      classifications: stateClassifications({
        derived: input.report.generatedLocally,
        reconstructible: input.report.generatedLocally,
        localOnly: input.report.generatedLocally,
      }),
      userFacingLabel: input.report.stale
        ? "Relatório aprovado ficou desatualizado por nova evidência"
        : input.report.approvedLocally
          ? "Aprovado localmente; não é persistência remota"
          : input.report.generatedLocally
            ? "Prévia local revisável"
            : "Aguardando geração explícita",
    },
  ];
}

const TopicResponseSchema = z.object({
  topics: z.array(RadarR6TopicSuggestionSchema).min(3).max(5),
}).strict();

export const RadarR7TopicResponseSchema = TopicResponseSchema;
export type RadarR7TopicSuggestion = z.infer<typeof RadarR6TopicSuggestionSchema>;

function normalized(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulTokens(values: string[]) {
  const ignored = new Set(["a", "ao", "aos", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "entre", "na", "nas", "no", "nos", "o", "os", "para", "por", "que", "se", "sem", "um", "uma", "como", "qual", "quais"]);
  return new Set(values.flatMap(value => normalized(value).split(" ")).filter(token => token.length >= 4 && !ignored.has(token)));
}

function hasRelatedNeed(context: RadarR6ExpertTopicContext, suggestion: RadarR7TopicSuggestion) {
  const contextValues = [
    context.articleDna.principal,
    context.articleDna.intent,
    context.articleDna.audience,
    context.articleDna.problem,
    context.articleDna.desiredResult,
    ...context.articleDna.requiredTopics,
    ...context.articleDna.knownQuestions,
    ...context.serpNeeds,
    ...context.openGaps,
    ...context.conflicts,
    ...context.knownQuestions,
    ...(context.siloDna ? [context.siloDna.objective, context.siloDna.boundary, ...context.siloDna.includedTopics, ...context.siloDna.gaps] : []),
    ...context.amazonCriteria,
  ];
  const contextTokens = meaningfulTokens(contextValues);
  const needTokens = [...meaningfulTokens([suggestion.need])];
  return needTokens.some(needToken => [...contextTokens].some(contextToken => contextToken === needToken || (needToken.length >= 5 && contextToken.startsWith(needToken.slice(0, 5))) || (contextToken.length >= 5 && needToken.startsWith(contextToken.slice(0, 5)))));
}

/**
 * Parses both the canonical API envelope and a direct array for unit fixtures.
 * It deliberately fails closed: invalid output never replaces a valid local
 * topic queue in the page state.
 */
export function parseRadarR7TopicResponse(context: RadarR6ExpertTopicContext, raw: unknown): RadarR7TopicSuggestion[] {
  const envelope = Array.isArray(raw) ? { topics: raw } : raw;
  const parsed = TopicResponseSchema.parse(envelope);
  const allowedOrigins = new Set(context.provenance.map(source => source.sourceType));
  for (const suggestion of parsed.topics) {
    if (!allowedOrigins.has(suggestion.origin) || suggestion.origins.some(origin => !allowedOrigins.has(origin))) {
      throw new Error("A pauta declarou uma origem fora do contexto recebido.");
    }
    if (!hasRelatedNeed(context, suggestion)) {
      throw new Error("A necessidade da pauta não está relacionada ao contexto do artigo.");
    }
  }
  return validateRadarR6TopicSuggestions(context, parsed.topics);
}

export function preserveRadarR7TopicsOnFailure(
  current: RadarR4LocalArticleState["topics"],
  context: RadarR6ExpertTopicContext | null,
): RadarR4LocalArticleState["topics"] {
  return {
    ...current,
    state: "FAILED_RETRYABLE",
    context: context || current.context,
  };
}

export function radarR7ReportEvidenceFingerprint(report: RadarR6ConsolidatedReport | null | undefined) {
  if (!report) return null;
  return JSON.stringify({
    articleDnaVersionId: report.provenance.articleDnaVersionId,
    siloDnaVersionId: report.provenance.siloDnaVersionId,
    serpSnapshotId: report.provenance.serpSnapshotId,
    analysisVersionId: report.provenance.analysisVersionId,
    serpReferences: [...report.evidence.serp.references].sort(),
    amazonEvidenceIds: [...report.provenance.amazonEvidenceIds].sort(),
    expertContributionIds: [...report.provenance.expertContributionIds].sort(),
    expertEvidence: [...report.evidence.expert.summaries].sort(),
  });
}

export type RadarR7SourceRange = {
  label: string;
  start: string;
  end: string;
};

export type RadarR7ImmutableTranscriptLayers = {
  original: { text: string; immutable: true };
  transcript: { text: string | null; immutable: true; sourceRange?: RadarR7SourceRange };
  organized: { text: string | null; immutable: false; sourceRange?: RadarR7SourceRange };
};

export function buildRadarR7LocalTextPipeline(input: {
  updateId: string;
  bindingId: string;
  briefId: string;
  articleId: string;
  originalText: string;
}) {
  const text = input.originalText.trim();
  if (!text) throw new Error("A fixture textual precisa conter a contribuição original.");
  return {
    update: { updateId: input.updateId, classification: "LOCAL_ONLY" as const },
    binding: { bindingId: input.bindingId, classification: "LOCAL_ONLY" as const },
    brief: { briefId: input.briefId, articleId: input.articleId, classification: "LOCAL_ONLY" as const },
    contribution: {
      articleId: input.articleId,
      sourceType: "TEXT" as const,
      originalText: text,
      transcriptText: null,
      organizationPayload: null,
      classification: "LOCAL_ONLY" as const,
    },
    radar: { articleId: input.articleId, evidenceState: "NOT_AVAILABLE" as const, classification: "LOCAL_ONLY" as const },
  };
}

export function buildRadarR7LocalAudioPipeline(input: {
  updateId: string;
  bindingId: string;
  briefId: string;
  articleId: string;
  originalAssetUri: string;
  checksum: string;
  transcriptText: string;
  organizedText: string;
  sourceRange: RadarR7SourceRange;
}) {
  const layers: RadarR7ImmutableTranscriptLayers = {
    original: { text: input.originalAssetUri, immutable: true },
    transcript: { text: input.transcriptText.trim() || null, immutable: true, sourceRange: input.sourceRange },
    organized: { text: input.organizedText.trim() || null, immutable: false, sourceRange: input.sourceRange },
  };
  return {
    update: { updateId: input.updateId, classification: "LOCAL_ONLY" as const },
    binding: { bindingId: input.bindingId, classification: "LOCAL_ONLY" as const },
    brief: { briefId: input.briefId, articleId: input.articleId, classification: "LOCAL_ONLY" as const },
    contribution: {
      articleId: input.articleId,
      sourceType: "AUDIO" as const,
      originalAssetUri: input.originalAssetUri,
      checksum: input.checksum,
      transcriptText: layers.transcript.text,
      organizationPayload: layers.organized.text ? { text: layers.organized.text, sourceRange: input.sourceRange } : null,
      layers,
      classification: "LOCAL_ONLY" as const,
    },
    expertEvidence: {
      articleId: input.articleId,
      source: input.sourceRange,
      summary: layers.organized.text || layers.transcript.text || "Evidência de áudio sem texto organizado.",
      classification: "LOCAL_ONLY" as const,
    },
  };
}

export const RADAR_R7_DEEPSEEK_REAL_SMOKE = "AWAITING_AUTHORIZATION" as const;
export const RADAR_R7_PLANNER_CONTRACT_AUDIT = "STRUCTURAL_CHANGE_REQUIRED" as const;
export const RADAR_R7_PLANNER_ADAPTER = "BLOCKED_BY_PLANNER_GERAL" as const;
export const RADAR_R7_TELEGRAM_REMOTE_FOUNDATION = "BLOCKED_BY_DATABASE" as const;
export const RADAR_R7_LOCAL_WORKER_READINESS = "IMPLEMENTED_NOT_SMOKED" as const;
export const RADAR_R7_TEXT_PIPELINE_READINESS = "LOCAL_VALIDATED" as const;
export const RADAR_R7_AUDIO_PIPELINE_READINESS = "LOCAL_VALIDATED" as const;
export const RADAR_R7_TRANSCRIPT_IMMUTABILITY = "LOCAL_VALIDATED" as const;

export function radarR7TopicOriginLabel(origins: RadarR4TopicSource[]) {
  return [...new Set(origins)].join(" + ");
}
