import { contentHash } from "../arquiteto/versioning.ts";
import type { RadarCompetitiveReport } from "./competitive-report.ts";
import { RadarPlannerHandoffSchema, type RadarAnalysisPayload, type RadarEvidencePackage, type RadarExpertEvidence, type RadarPlannerHandoff, type RadarPlannerHandoffDecision, type RadarProductEvidence } from "./analysis-contracts.ts";
import type { InternalLinkGraphRef } from "../arquiteto/contracts.ts";

type HandoffInput = {
  packageData: RadarEvidencePackage;
  approvedReport: RadarCompetitiveReport;
  brandId: string;
  radarItemId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash?: string | null;
  siloDnaVersionId?: string | null;
  sourceAnalysisVersionId: string;
  sourceAnalysisVersionNumber: number;
  selectedBy: string;
  humanDecisions?: RadarPlannerHandoffDecision[];
  expertEvidence?: RadarExpertEvidence[];
  productEvidence?: RadarProductEvidence[];
  internalLinkGraphRef?: InternalLinkGraphRef | null;
  previousHandoffId?: string | null;
  now?: string;
};

function assertIdentity(input: HandoffInput) {
  if (input.packageData.brandId !== input.brandId || input.approvedReport.brandId !== input.brandId) throw new Error("RADAR_HANDOFF_BRAND_MISMATCH");
  if (input.packageData.radarItemId !== input.radarItemId || input.approvedReport.radarItemId !== input.radarItemId) throw new Error("RADAR_HANDOFF_ITEM_MISMATCH");
  if (input.packageData.articleId !== input.articleId || input.approvedReport.articleId !== input.articleId) throw new Error("RADAR_HANDOFF_ARTICLE_MISMATCH");
  if (input.packageData.articleDnaId !== input.articleDnaVersionId || input.approvedReport.articleDnaVersionId !== input.articleDnaVersionId) throw new Error("RADAR_HANDOFF_ARTICLE_DNA_MISMATCH");
  if (input.approvedReport.status !== "approved") throw new Error("RADAR_HANDOFF_REPORT_NOT_APPROVED");
  if (input.internalLinkGraphRef && (input.internalLinkGraphRef.brandId !== input.brandId || input.internalLinkGraphRef.workflowStatus !== "approved")) throw new Error("RADAR_HANDOFF_GRAPH_REF_NOT_APPROVED");
}

function decisionsForReport(input: HandoffInput) {
  return input.humanDecisions || [
    {
      id: `report:${input.approvedReport.id}`,
      target: "radar_report",
      decision: "approved",
      actorId: input.approvedReport.approvedBy || input.selectedBy,
      decidedAt: input.approvedReport.approvedAt || input.now || new Date().toISOString(),
      note: input.approvedReport.summary.text,
    },
  ];
}

function serpReferences(input: HandoffInput) {
  const included = new Map(input.packageData.includedOrganicResults.map(item => [item.key, item]));
  return input.approvedReport.competitors.map(competitor => {
    const key = `organic:${competitor.serpPosition}`;
    const decision = included.get(key);
    const role = !decision ? "excluded" as const : /formato|video|vídeo/i.test(decision.reason) ? "format" as const : /apoio|support|complementar/i.test(decision.reason) ? "support" as const : "primary" as const;
    return { position: competitor.serpPosition, title: competitor.title, url: competitor.url, role };
  });
}

export async function buildRadarPlannerHandoff(input: HandoffInput): Promise<RadarPlannerHandoff> {
  assertIdentity(input);
  const now = input.now || new Date().toISOString();
  const humanDecisions = decisionsForReport(input);
  const base = {
    schemaVersion: 2 as const,
    packageType: "radar_planner_handoff" as const,
    id: `radar-planner-handoff:${input.sourceAnalysisVersionId}`,
    brandId: input.brandId,
    radarItemId: input.radarItemId,
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    siloDnaVersionId: input.siloDnaVersionId || null,
    status: "APPROVED" as const,
    sourceAnalysisVersionId: input.sourceAnalysisVersionId,
    sourceAnalysisVersionNumber: input.sourceAnalysisVersionNumber,
    approvedReport: {
      reportId: input.approvedReport.id,
      version: input.approvedReport.version,
      hash: input.approvedReport.contentHash,
      status: "APPROVED" as const,
      summary: input.approvedReport.summary.text,
      limitations: input.approvedReport.summary.limitations,
      needs: input.approvedReport.needs.map(need => ({ id: need.id, title: need.title, decision: need.humanDecision, note: need.note })),
      recommendations: input.approvedReport.needs.filter(need => ["send_planner", "opportunity"].includes(need.humanDecision)).map(need => need.title),
      humanDecisions,
    },
    evidencePackage: input.packageData,
    serp: { ...input.packageData.serp, provider: input.packageData.serp.provider, references: serpReferences(input) },
    expertEvidence: input.expertEvidence || [],
    productEvidence: input.productEvidence || [],
    humanDecisions,
    internalLinkGraphRef: input.internalLinkGraphRef || null,
    provenance: {
      source: "radar" as const,
      provider: input.packageData.serp.provider,
      articleDnaVersionId: input.articleDnaVersionId,
      articleDnaContentHash: input.articleDnaContentHash || null,
      siloDnaVersionId: input.siloDnaVersionId || null,
      analysisVersionId: input.sourceAnalysisVersionId,
      serpSnapshotId: input.packageData.serp.snapshotId,
      serpSnapshotVersion: input.packageData.serp.version,
      serpSnapshotHash: input.packageData.serp.hash,
      expertContributionIds: (input.expertEvidence || []).map(evidence => evidence.contributionId),
      productEvidenceIds: (input.productEvidence || []).map(evidence => evidence.id),
      capturedAt: now,
    },
    version: input.sourceAnalysisVersionNumber,
    previousHandoffId: input.previousHandoffId || null,
  };
  return RadarPlannerHandoffSchema.parse({ ...base, hash: await contentHash(base) });
}

export function isRadarPlannerHandoff(value: unknown): value is RadarPlannerHandoff {
  return RadarPlannerHandoffSchema.safeParse(value).success;
}

export function radarHandoffToContentPlanInput(handoff: RadarPlannerHandoff) {
  const packageData = handoff.evidencePackage;
  return {
    analysisMode: packageData.analysisMode.mode,
    analysisEnforcement: packageData.analysisMode.mode === "competitive_full" ? "required" as const : "advisory" as const,
    requirements: handoff.approvedReport.needs.filter(need => need.decision === "send_planner").map(need => need.title),
    recommendations: handoff.approvedReport.recommendations,
    observedData: [handoff.approvedReport.summary, ...handoff.approvedReport.limitations],
    humanDecisions: handoff.humanDecisions.map(decision => `${decision.target}: ${decision.decision}${decision.note ? ` — ${decision.note}` : ""}`),
    evidencePackage: handoff,
  };
}

export function radarPlannerPackageToContentPlanInput(value: RadarAnalysisPayload["plannerPackage"]) {
  if (!value) return null;
  if (isRadarPlannerHandoff(value)) return radarHandoffToContentPlanInput(value);
  if ("packageType" in value && value.packageType === "radar_evidence") {
    return {
      analysisMode: value.analysisMode.mode,
      analysisEnforcement: "advisory" as const,
      requirements: [],
      recommendations: [],
      observedData: [`SERP: ${value.serp.query}`, `Resultados incluídos: ${value.includedOrganicResults.length}`, `Amostra estrutural: ${value.observedStructure.sampleSize}`],
      humanDecisions: [],
      evidencePackage: value,
    };
  }
  return {
    analysisMode: value.mode,
    analysisEnforcement: value.enforcement,
    requirements: value.requirements,
    recommendations: value.recommendations,
    observedData: value.observedData,
    humanDecisions: value.keywordDecisions.map(decision => `${decision.keywordId}: ${decision.decision}${decision.note ? ` — ${decision.note}` : ""}`),
    evidencePackage: null,
  };
}
