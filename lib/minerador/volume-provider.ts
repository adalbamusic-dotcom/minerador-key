import { isValidDataForSeoAllintitleMeasurement } from "./dataforseo-competition.ts";

/*
 * 2026-10-16 · F1 da linha única do Minerador (SDD
 * `sdd-linha-unica-do-minerador-2026-10-16.md`, S-8): saíram os normalizadores
 * da RapidAPI (Google Keyword Insight, Trending Insight, Keyword Magic Tool,
 * SEO Keyword Research e a ferramenta de volume global) e o provider padrão
 * que eles carregavam. O Volume é só do Google Ads (spec §45.1; RapidAPI nunca,
 * SDD de 2026-09-28). Fica o construtor do patch, que a rota do Google Ads
 * chama (`google-ads-volume.ts`).
 */

export type VolumeMetricPatch = {
  volume_search?: number;
  kgr_score?: number | null;
  volume_source?: "real" | "google_ads";
  analise_semantica?: Record<string, unknown>;
};

export type ExistingVolumeMetrics = {
  status?: string;
  volume_search: number | null;
  results_allintitle: number | null;
  kgr_score: number | null;
  volume_source?: string | null;
  analise_semantica?: Record<string, unknown> | null;
};

/** A medição estruturada que a rota do Google Ads entrega ao construtor (com a fonte declarada). */
export type VolumeMeasurementInput = { keyword: string; status: "success"; volume: number; source: string; measuredAt?: string; match?: "exact" };

/**
 * Builds a patch without nulling fields when the provider did not return a
 * valid measurement. An explicit zero is valid and deliberately invalidates
 * the current KGR because division by zero is not a score.
 */
export function buildVolumeMetricPatch(
  existing: ExistingVolumeMetrics,
  measuredVolume: number | VolumeMeasurementInput | undefined,
  options: { requireCurrentResultsMeasurement?: boolean } = {},
): VolumeMetricPatch {
  if (measuredVolume === undefined) return {};

  const isStructuredMeasurement = typeof measuredVolume === "object";
  const volume = isStructuredMeasurement ? measuredVolume.volume : measuredVolume;
  if (!Number.isFinite(volume) || volume < 0) return {};

  const patch: VolumeMetricPatch = {
    volume_search: volume,
    volume_source: "real",
  };

  const rawAllintitleMeasurement = existing.analise_semantica?.allintitle_measurement;
  const existingAllintitleMeasurement = rawAllintitleMeasurement && typeof rawAllintitleMeasurement === "object" && !Array.isArray(rawAllintitleMeasurement)
    ? rawAllintitleMeasurement as Record<string, unknown>
    : null;
  const measuredResults = isValidDataForSeoAllintitleMeasurement(existingAllintitleMeasurement)
    ? typeof existingAllintitleMeasurement?.resultsAllintitle === "number"
      ? existingAllintitleMeasurement.resultsAllintitle
      : typeof existingAllintitleMeasurement?.results_allintitle === "number"
        ? existingAllintitleMeasurement.results_allintitle
        : null
    : null;
  const results = options.requireCurrentResultsMeasurement ? measuredResults : existing.results_allintitle;
  const canCalculateKgr = volume > 0 && results !== null && Number.isFinite(results) && results >= 0;
  patch.kgr_score = canCalculateKgr ? Number((results / volume).toFixed(4)) : null;

  if (isStructuredMeasurement) {
    const measuredAt = measuredVolume.measuredAt || new Date().toISOString();
    const currentSemantic = { ...(existing.analise_semantica || {}) };
    const previousKgrHistory = Array.isArray(currentSemantic.kgr_score_history)
      ? currentSemantic.kgr_score_history.filter(entry => entry && typeof entry === "object")
      : [];
    const kgrChanged = typeof existing.kgr_score === "number" && existing.kgr_score !== patch.kgr_score;
    const kgrHistory = kgrChanged
      ? [...previousKgrHistory, {
          score: existing.kgr_score,
          volume: existing.volume_search,
          results: existing.results_allintitle,
          changedAt: measuredAt,
          reason: volume === 0 ? "zero_confirmed" : "metrics_revalidated",
        }].slice(-10)
      : previousKgrHistory;
    patch.analise_semantica = {
      ...currentSemantic,
      volume_measurement: {
        keyword: measuredVolume.keyword,
        match: measuredVolume.match || "exact",
        rawVolume: volume,
        status: volume === 0 ? "zero_confirmed" : "confirmed",
        source: measuredVolume.source,
        measuredAt,
        previousVolume: existing.volume_search,
        previousResultsAllintitle: existing.results_allintitle,
        previousKgrScore: existing.kgr_score,
      },
      kgr_score_history: kgrHistory,
    };
  }

  return patch;
}
