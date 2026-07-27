import { contentHash } from "../arquiteto/versioning.ts";
import type { RadarAnalysisPayload, RadarEvidencePackage } from "./analysis-contracts.ts";
import { RadarEvidencePackageSchema } from "./analysis-contracts.ts";
import type { SerpResearchSnapshot } from "./serp/contracts.ts";
import { isPrimaryRadarSemanticTerm } from "./analysis-insights.ts";
import type { RadarKgrStrategy } from "./strategy-context.ts";

export async function buildRadarEvidencePackage(payload: RadarAnalysisPayload, input: {
  radarItemId: string;
  analysisVersionId: string;
  analysisVersionNumber: number;
  selectedBy: string;
  selectedAt?: string;
  research: SerpResearchSnapshot;
  kgrStrategy?: RadarKgrStrategy | null;
}): Promise<RadarEvidencePackage> {
  const selectedAt = input.selectedAt || new Date().toISOString();
  const includedOrganicResults = payload.serpDecisions.filter(decision => decision.itemType === "organic" && decision.decision === "included").map(({ key, reason, note, ownDomain }) => ({ key, reason, note, ownDomain }));
  const excludedOrganicResults = payload.serpDecisions.filter(decision => decision.itemType === "organic" && decision.decision === "excluded").map(({ key, reason, note, ownDomain }) => ({ key, reason, note, ownDomain }));
  const relevantQuestions = payload.serpDecisions.filter(decision => decision.itemType === "people_also_ask" && decision.decision === "included").map(decision => {
    const position = Number(decision.key.split(":")[1]);
    return { key: decision.key, text: input.research.peopleAlsoAsk.find(item => item.position === position)?.question || decision.key, note: decision.note };
  });
  const relevantRelatedSearches = payload.serpDecisions.filter(decision => decision.itemType === "related_search" && decision.decision === "included").map(decision => {
    const index = Number(decision.key.split(":")[1]) - 1;
    return { key: decision.key, text: input.research.relatedSearches[index]?.term || decision.key, note: decision.note };
  });
  const relevantEntities = payload.serpDecisions.filter(decision => ["knowledge_graph", "entity"].includes(decision.itemType) && decision.decision === "included").map(decision => ({ text: input.research.knowledgeGraph?.title || decision.key, source: decision.itemType, note: decision.note }));
  const metrics = payload.benchmark?.metrics || {};
  const base = {
    schemaVersion: 1 as const,
    packageType: "radar_evidence" as const,
    id: "radar-evidence:" + input.analysisVersionId,
    brandId: payload.brandId,
    radarItemId: input.radarItemId,
    articleId: payload.articleId,
    articleDnaId: input.research.articleDnaVersionId,
    serp: { snapshotId: input.research.id, version: input.research.version, hash: input.research.contentHash, provider: "serper" as const, query: input.research.query, capturedAt: input.research.collectedAt },
    analysisMode: { mode: payload.mode, selectedBy: input.selectedBy, selectedAt, ...(payload.modeHumanReason ? { reason: payload.modeHumanReason } : {}) },
    includedOrganicResults,
    excludedOrganicResults,
    relevantQuestions,
    relevantRelatedSearches,
    relevantEntities,
    observedStructure: {
      sampleSize: payload.benchmark?.validPageCount || 0,
      wordCounts: metrics.words || null,
      headings: { h2: metrics.h2 || null, h3: metrics.h3 || null },
      links: { internal: metrics.internalLinks || null, external: metrics.externalLinks || null },
      formatting: {},
      contentElements: { lists: metrics.lists || null, tables: metrics.tables || null, faq: metrics.faq || null },
    },
    observedSemantics: { recurringTerms: payload.semanticTerms.filter(isPrimaryRadarSemanticTerm), entities: input.research.diagnostic.frequentEntities, recurringTopics: input.research.diagnostic.questions },
    observedCompetitiveness: payload.competitiveness ? { level: payload.competitiveness.classification, dimensions: payload.competitiveness.dimensions, reasons: payload.competitiveness.reasons } : { level: "insufficient_evidence" as const, dimensions: {}, reasons: ["Nenhuma extração de concorrente foi concluída."] },
    ...(input.kgrStrategy ? { kgrStrategy: input.kgrStrategy } : {}),
    keywordObservations: payload.keywordDecisions.map(decision => ({ keywordId: decision.keywordId, observation: decision.note || "Referência de keyword revisada no Radar; a decisão editorial pertence ao Planejador.", confidence: decision.note ? "medium" as const : "low" as const })),
    conflicts: input.research.diagnostic.possibleConflicts.map(message => ({ kind: "serp", message, source: input.research.id })),
    humanNotes: payload.humanNotes.length ? payload.humanNotes.join("\n") : null,
    version: input.analysisVersionNumber,
    provenance: { source: "radar" as const, analysisVersionId: input.analysisVersionId, serpSnapshotHash: input.research.contentHash },
  };
  const hash = await contentHash(base);
  return RadarEvidencePackageSchema.parse({ ...base, hash });
}
