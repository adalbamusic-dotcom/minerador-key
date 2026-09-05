import { readDataForSeoKeywordDifficultyEvidence, type DataForSeoKeywordDifficultyEvidence } from "./dataforseo-keyword-overview-core.ts";
import { resolveEditorialKeywordStatus } from "./editorial-status.ts";
import { canCompleteHumanReview, humanReviewRecord, type HumanReviewRecord } from "./human-review.ts";
import { kgrApplicabilityLabel, readKgrApplicability, type KgrApplicability } from "./kgr-applicability.ts";
import { readCanonicalKeywordDna, type CanonicalFieldResolution, type CanonicalKeywordReadModel, type LogicalReadItem } from "./logical-read-model.ts";
import { deriveDnaMaturity, type DnaMaturity } from "./semantic-review.ts";
import { deriveProcessorRevalidation, type ProcessorRevalidation } from "./processor-revalidation.ts";
import { readPublicationLink, readSiteOrigin, type PublicationLinkView } from "./publication-link.ts";
import { readGoogleAdsCpcEvidence, type GoogleAdsCpcEvidence } from "./google-ads-demand.ts";
import { resolveMineradorProcessState, type MineradorProcessAttempt, type MineradorProcessName, type MineradorProcessStates } from "./process-state.ts";

export type CanonicalKeywordSnapshotInput = LogicalReadItem & {
  id?: string;
  keyword?: string;
  brand_id?: string;
  status?: string | null;
  volume_search?: unknown;
  results_allintitle?: unknown;
  kgr_score?: unknown;
  volume_source?: string | null;
  attempts?: Partial<Record<MineradorProcessName, MineradorProcessAttempt>>;
};

export type CanonicalFieldSnapshot = {
  value: string | null;
  label: string;
  state: CanonicalFieldResolution;
};

export type CanonicalMetricSnapshot = {
  value: number | null;
  validated: boolean;
  state: string;
  measuredAt: string | null;
  provider: string | null;
};

export type CanonicalKeywordSnapshot = {
  identity: {
    id: string | null;
    keyword: string | null;
    brandId: string | null;
  };
  semantic: CanonicalKeywordReadModel & {
    intentField: CanonicalFieldSnapshot;
    nicheField: CanonicalFieldSnapshot;
    funnelField: CanonicalFieldSnapshot;
  };
  metrics: {
    volume: CanonicalMetricSnapshot;
    result: CanonicalMetricSnapshot;
    kgr: {
      score: number | null;
      ready: boolean;
      volumeUsed: number | null;
      allintitleUsed: number | null;
      applicability: KgrApplicability;
      applicabilityLabel: string;
      source: ProcessorRevalidation["kgr"]["source"];
    };
    cpc: GoogleAdsCpcEvidence;
    kd: DataForSeoKeywordDifficultyEvidence;
  };
  humanReview: {
    record: HumanReviewRecord;
    completed: boolean;
    confirmationValid: boolean;
    canComplete: ReturnType<typeof canCompleteHumanReview>;
    pendingFields: string[];
    pendingEnrichments: string[];
  };
  maturity: DnaMaturity;
  status: ReturnType<typeof resolveEditorialKeywordStatus>;
  vinculo: PublicationLinkView;
  processor: ProcessorRevalidation;
  process: MineradorProcessStates;
};

function fieldSnapshot(value: string | null, label: string, state: CanonicalFieldResolution): CanonicalFieldSnapshot {
  return { value, label, state };
}

/**
 * Single read-model boundary for Processor consumers.
 *
 * This function is deliberately read-only: it never promotes imported
 * Discovery values, mutates KeywordDNA, calls a provider, or changes the KGR
 * formula. Table, profile, review and decision cards should all consume this
 * projection for the facts they have in common.
 */
export function resolveCanonicalKeywordSnapshot(input: CanonicalKeywordSnapshotInput): CanonicalKeywordSnapshot {
  const semantic = input.analise_semantica || {};
  const logical = readCanonicalKeywordDna(input);
  const processor = deriveProcessorRevalidation({
    semantic,
    volumeSearch: input.volume_search,
    resultsAllintitle: input.results_allintitle,
  });
  const cpc = readGoogleAdsCpcEvidence(semantic);
  const kd = readDataForSeoKeywordDifficultyEvidence(semantic);
  const kgrApplicability = readKgrApplicability(semantic);
  const review = humanReviewRecord(semantic);
  const canComplete = canCompleteHumanReview(semantic, { intent: input.intent });
  const humanFields = [
    { label: "Intenção", state: logical.intentState },
    { label: "Nicho", state: logical.nicheState },
    { label: "Funil", state: logical.funnelState },
  ];
  const pendingStrategicFields = humanFields
    .filter(field => field.state === "unresolved")
    .map(field => field.label);
  const pendingFields = [...new Set([...(canComplete.pendingFields || []), ...pendingStrategicFields])];
  const pendingEnrichments = canComplete.pendingEnrichments || [];
  const process = resolveMineradorProcessState(input);
  // The review artifact has its own validity. Its provenance points to the
  // snapshot that was reviewed, but a later AI or provider run does not make
  // the completed human decision stale automatically.
  const confirmationValid = process.review.complete;
  const logicalProcessed = process.logic.complete;
  const humanCompleted = confirmationValid;
  const maturity = deriveDnaMaturity({
    logicalProcessed,
    googleAdsValid: processor.volume.validated,
    dataForSeoValid: processor.results.validated,
    kgrTreated: !processor.kgr.ready || kgrApplicability !== "pending" || review.kgrDecisionReviewed === true,
    aiReviewCompleted: process.ai.complete,
    humanConfirmed: humanCompleted,
    humanReviewCompleted: process.review.complete && canComplete.ok,
  });
  const siteOrigin = readSiteOrigin(semantic);

  return {
    identity: {
      id: typeof input.id === "string" ? input.id : null,
      keyword: typeof input.keyword === "string" ? input.keyword : null,
      brandId: typeof input.brand_id === "string" ? input.brand_id : null,
    },
    semantic: {
      ...logical,
      intentField: fieldSnapshot(logical.intent, logical.intentLabel, logical.intentState),
      nicheField: fieldSnapshot(logical.niche, logical.nicheLabel, logical.nicheState),
      funnelField: fieldSnapshot(logical.funnel, logical.funnelLabel, logical.funnelState),
    },
    metrics: {
      volume: {
        value: processor.volume.value,
        validated: processor.volume.validated,
        state: processor.volume.state,
        measuredAt: processor.volume.measuredAt,
        provider: processor.volume.provider,
      },
      result: {
        value: processor.results.value,
        validated: processor.results.validated,
        state: processor.results.state,
        measuredAt: processor.results.measuredAt,
        provider: processor.results.provider,
      },
      kgr: {
        score: processor.kgr.score,
        ready: processor.kgr.ready,
        volumeUsed: processor.kgr.volumeUsed,
        allintitleUsed: processor.kgr.allintitleUsed,
        applicability: kgrApplicability,
        applicabilityLabel: kgrApplicabilityLabel(kgrApplicability),
        source: processor.kgr.source,
      },
      cpc,
      kd,
    },
    humanReview: {
      record: review,
      completed: review.status === "completed",
      confirmationValid,
      canComplete,
      pendingFields,
      pendingEnrichments,
    },
    maturity,
    status: resolveEditorialKeywordStatus(input.status),
    vinculo: readPublicationLink({ status: input.status, evidence: siteOrigin }),
    processor,
    process,
  };
}
