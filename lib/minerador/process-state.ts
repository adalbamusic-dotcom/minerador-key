import { isValidDataForSeoAllintitleMeasurement } from "./dataforseo-competition.ts";
import { isValidGoogleAdsDemandMeasurement } from "./google-ads-demand.ts";
import { humanReviewRecord } from "./human-review.ts";
import { resolveLogicalProcessReadiness } from "./logical-processor.ts";
import { readSiteOrigin } from "./publication-link.ts";
import { deriveProcessorRevalidation } from "./processor-revalidation.ts";
import { isCompletedSemanticReview } from "./semantic-review.ts";

export type MineradorProcessName = "site" | "logic" | "volume" | "results" | "kgr" | "ai" | "review";
export type MineradorAttemptState = "not_run" | "running" | "success" | "failed";
/** Freshness of this process's own persisted artifact; never an upstream cascade. */
export type MineradorArtifactState = "missing" | "current_valid" | "stale" | "invalid";

export type MineradorProcessAttempt = {
  state: Exclude<MineradorAttemptState, "not_run">;
  startedAt?: string;
  finishedAt?: string;
  operationId?: string;
};

export type MineradorProcessState = {
  attemptState: MineradorAttemptState;
  artifactState: MineradorArtifactState;
  complete: boolean;
  reason: string;
};

export type MineradorProcessStates = Record<MineradorProcessName, MineradorProcessState>;

export type MineradorProcessPresentation = "current" | "stale" | "missing" | "running" | "failed";

export type MineradorProcessStateInput = {
  id?: string;
  keyword?: string;
  location?: string | null;
  intent?: string | null;
  status?: string | null;
  volume_search?: unknown;
  results_allintitle?: unknown;
  analise_semantica?: Record<string, unknown> | null;
  /** Optional local execution state; it is never treated as persisted data. */
  attempts?: Partial<Record<MineradorProcessName, MineradorProcessAttempt>>;
  /** The logical niche used by the processor when a list supplied one. */
  logicalNiche?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attemptState(attempt: MineradorProcessAttempt | undefined): MineradorAttemptState {
  return attempt?.state || "not_run";
}

function currentState(input: {
  current: boolean;
  previous: boolean;
  attempt?: MineradorProcessAttempt;
  currentReason: string;
  notCurrentReason?: string;
  notCurrentArtifactState?: MineradorArtifactState;
}): MineradorProcessState {
  const attempt = attemptState(input.attempt);
  const artifactState: MineradorArtifactState = input.current
    ? "current_valid"
    : input.previous
      ? input.notCurrentArtifactState || "stale"
      : "missing";
  return {
    attemptState: attempt,
    artifactState,
    // The attempt is feedback about the latest execution. It must not
    // invalidate a candidate that was already promoted and read back.
    complete: input.current,
    reason: input.current
      ? input.currentReason
      : input.previous
        ? input.notCurrentReason || "Existe evidência anterior, mas a etapa ainda aguarda uma validação atual no Processador."
        : "Nenhum artefato atual válido foi confirmado.",
  };
}

/**
 * Presentation priority for the Processador strip. Artifact freshness stays
 * independent from the last attempt: a failed retry can be shown alongside
 * the preserved current artifact instead of turning it into "not run".
 */
export function mineradorProcessPresentation(state: MineradorProcessState): MineradorProcessPresentation {
  if (state.attemptState === "running") return "running";
  if (state.attemptState === "failed") return "failed";
  if (state.artifactState === "current_valid") return "current";
  if (state.artifactState === "stale" || state.artifactState === "invalid") return "stale";
  return "missing";
}

function readReview(semantic: Record<string, unknown>): Record<string, unknown> | null {
  return [semantic.ai_review, semantic.ia_revisao, semantic.revisao_ia, semantic.semantic_review]
    .map(asRecord)
    .find(Boolean) || null;
}

function hasPreviousMeasurement(value: unknown, importedValue: unknown): boolean {
  return value !== null && value !== undefined || importedValue !== null && importedValue !== undefined;
}

function siteIsCurrent(semantic: Record<string, unknown>): boolean {
  const origin = readSiteOrigin(semantic);
  const status = text(origin?.urlSituation)?.toLowerCase();
  const checkedAt = text(origin?.lastCheckedAt) || text(origin?.verifiedAt) || text(origin?.lastVerifiedAt);
  if (!status || !checkedAt || !Number.isFinite(Date.parse(checkedAt))) return false;
  return !["unverified", "discovered", "stale", "error"].includes(status);
}

/**
 * Single completion projection for the Processador. It separates the
 * execution attempt from the artifact persisted in the canonical row so a
 * provider failure can preserve old evidence without producing a false green.
 */
export function resolveMineradorProcessState(input: MineradorProcessStateInput): MineradorProcessStates {
  const semantic = input.analise_semantica || {};
  const processor = deriveProcessorRevalidation({
    semantic,
    volumeSearch: input.volume_search,
    resultsAllintitle: input.results_allintitle,
  });
  const volumeMeasurement = asRecord(semantic.volume_measurement);
  const resultsMeasurement = asRecord(semantic.allintitle_measurement);
  const logicReadiness = resolveLogicalProcessReadiness({
    keywordId: input.id || "",
    keyword: input.keyword || "",
    location: input.location ?? null,
    niche: input.logicalNiche
      ?? text(semantic.nicho_override)
      ?? text(semantic.nicho)
      ?? null,
    semantic,
  });
  const logicCurrent = logicReadiness.state === "current_valid";
  const aiReview = readReview(semantic);
  // The AI artifact is valid by its own persisted R5 contract. Its inputHash
  // records the snapshot consumed at execution time; it is provenance, not a
  // cross-process invalidation key.
  const aiCurrent = isCompletedSemanticReview(aiReview);
  const reviewRecord = humanReviewRecord(semantic);
  // Human review is an independent persisted artifact. A new AI, Logic,
  // Volume or Resultados artifact does not erase or stale a completed review.
  const reviewCompleted = reviewRecord.status === "completed";
  const reviewCurrent = reviewCompleted;

  const volumePrevious = hasPreviousMeasurement(processor.volume.importedValue, processor.volume.importedMeasuredAt);
  const resultsPrevious = hasPreviousMeasurement(processor.results.importedValue, processor.results.importedMeasuredAt);
  const volumeCurrent = processor.volume.validated && isValidGoogleAdsDemandMeasurement(volumeMeasurement);
  const resultsCurrent = processor.results.validated && isValidDataForSeoAllintitleMeasurement(resultsMeasurement);
  // KGR depends on promoted/current measurements only. A running or failed
  // retry does not replace those inputs and therefore cannot invalidate a
  // previously current KGR artifact.
  const kgrCurrent = volumeCurrent && resultsCurrent && processor.kgr.ready;

  const logic = currentState({
    current: logicCurrent,
    previous: logicReadiness.state !== "missing",
    attempt: input.attempts?.logic,
    currentReason: logicReadiness.reason,
    notCurrentReason: logicReadiness.reason,
    notCurrentArtifactState: logicReadiness.state === "incomplete" ? "invalid" : "stale",
  });
  const volume = currentState({
    current: volumeCurrent,
    previous: volumePrevious,
    attempt: input.attempts?.volume,
    currentReason: "Medição Google Ads atual confirmada e lida novamente do registro canônico.",
  });
  const results = currentState({
    current: resultsCurrent,
    previous: resultsPrevious,
    attempt: input.attempts?.results,
    currentReason: "Medição DataForSEO atual confirmada e lida novamente do registro canônico.",
  });
  const kgr = currentState({
    current: kgrCurrent,
    previous: processor.kgr.score !== null,
    attempt: input.attempts?.kgr,
    currentReason: "KGR calculado automaticamente com Volume e Resultado atuais do Processador.",
  });
  const site = currentState({
    current: siteIsCurrent(semantic),
    previous: Boolean(readSiteOrigin(semantic)),
    attempt: input.attempts?.site,
    currentReason: "Conferência do site persistida e confirmada no registro canônico.",
  });
  const ai = currentState({
    current: aiCurrent,
    previous: Boolean(aiReview),
    attempt: input.attempts?.ai,
    currentReason: "As três fases da IA foram concluídas, o JSON foi validado e o artefato foi persistido no snapshot consumido.",
  });
  const review = currentState({
    current: reviewCurrent,
    previous: reviewCompleted,
    attempt: input.attempts?.review,
    currentReason: "Revisão humana concluída e persistida para o snapshot revisado.",
  });

  return { site, logic, volume, results, kgr, ai, review };
}
