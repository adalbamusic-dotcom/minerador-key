import { calculateKgrFromMetrics, readKgrApplicability } from "./kgr-applicability.ts";
import { isValidGoogleAdsDemandMeasurement } from "./google-ads-demand.ts";
import type { DataForSeoAllintitleMeasurement } from "./dataforseo-serp-core.ts";
import type { DataForSeoKeywordOverviewMeasurement } from "./dataforseo-keyword-overview-core.ts";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asMeasurement(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

export type DataForSeoKeywordMeasurementPatch = {
  results_allintitle: number;
  analise_semantica: JsonObject;
  kgr_score?: number | null;
};

export type DataForSeoKeywordOverviewErrorInput = {
  code: string;
  message: string;
  providerRequestId?: string | null;
} | null;

export function buildDataForSeoKeywordMeasurementPatch(input: {
  existing: {
    results_allintitle: number | null;
    volume_search: number | null;
    kgr_score: number | null;
    analise_semantica?: JsonObject | null;
  };
  measurement: DataForSeoAllintitleMeasurement;
  overview?: DataForSeoKeywordOverviewMeasurement | null;
  overviewError?: DataForSeoKeywordOverviewErrorInput;
  operationRequestId: string;
  targeting: JsonObject;
  requireCurrentVolumeMeasurement?: boolean;
}): DataForSeoKeywordMeasurementPatch {
  const previous = asMeasurement(input.existing.analise_semantica?.allintitle_measurement);
  const history = Array.isArray(input.existing.analise_semantica?.allintitle_measurement_history)
    ? input.existing.analise_semantica.allintitle_measurement_history.filter(value => asMeasurement(value)) as JsonObject[]
    : [];
  const previousOverview = asMeasurement(input.existing.analise_semantica?.dataforseo_keyword_overview);
  const overviewHistory = Array.isArray(input.existing.analise_semantica?.dataforseo_keyword_overview_history)
    ? input.existing.analise_semantica.dataforseo_keyword_overview_history.filter(value => asMeasurement(value)) as JsonObject[]
    : [];
  const currentMeasurement: JsonObject = {
    provider: input.measurement.provider,
    providerVersion: input.measurement.providerVersion,
    executor: "minerador_server",
    endpoint: input.measurement.endpoint,
    method: "POST",
    query: input.measurement.query,
    resultsAllintitle: input.measurement.resultsAllintitle,
    measuredAt: input.measurement.measuredAt,
    operationRequestId: input.operationRequestId,
    locationCode: input.measurement.locationCode,
    languageCode: input.measurement.languageCode,
    targeting: input.targeting,
    providerRequestId: input.measurement.providerRequestId,
    cost: input.measurement.cost,
    checkUrl: input.measurement.checkUrl,
  };
  const currentOverview: JsonObject | null = input.overview
    ? {
        ...input.overview,
        executor: "minerador_server",
        operationRequestId: input.operationRequestId,
        targeting: input.targeting,
      }
    : null;
  const nextSemantic: JsonObject = {
    ...asObject(input.existing.analise_semantica),
    allintitle_measurement: currentMeasurement,
    allintitle_measurement_history: previous
      ? [...history, { ...previous, preservedAt: new Date().toISOString() }].slice(-25)
      : history,
    allintitle_last_error: null,
    ...(currentOverview
      ? {
          dataforseo_keyword_overview: currentOverview,
          dataforseo_keyword_overview_history: previousOverview
            ? [...overviewHistory, { ...previousOverview, preservedAt: new Date().toISOString() }].slice(-25)
            : overviewHistory,
          dataforseo_keyword_overview_last_error: null,
        }
      : input.overviewError
        ? {
            ...(previousOverview ? { dataforseo_keyword_overview: previousOverview, dataforseo_keyword_overview_history: overviewHistory } : {}),
            dataforseo_keyword_overview_last_error: {
              provider: "dataforseo",
              providerVersion: "v3",
              executor: "minerador_server",
              errorCode: input.overviewError.code,
              message: input.overviewError.message.slice(0, 240),
              operationRequestId: input.operationRequestId,
              providerRequestId: input.overviewError.providerRequestId || null,
              failedAt: new Date().toISOString(),
            },
          }
        : {}),
  };
  const patch: DataForSeoKeywordMeasurementPatch = {
    results_allintitle: input.measurement.resultsAllintitle,
    analise_semantica: nextSemantic,
  };
  if (readKgrApplicability(input.existing.analise_semantica) !== "not_applicable") {
    const rawVolumeMeasurement = input.existing.analise_semantica?.volume_measurement;
    const volumeMeasurement = rawVolumeMeasurement && typeof rawVolumeMeasurement === "object" && !Array.isArray(rawVolumeMeasurement)
      ? rawVolumeMeasurement as JsonObject
      : null;
    const currentVolume = input.requireCurrentVolumeMeasurement
      ? isValidGoogleAdsDemandMeasurement(volumeMeasurement)
        ? typeof volumeMeasurement?.averageMonthlySearches === "number"
          ? volumeMeasurement.averageMonthlySearches
          : typeof volumeMeasurement?.rawVolume === "number" ? volumeMeasurement.rawVolume : null
        : null
      : input.existing.volume_search;
    patch.kgr_score = calculateKgrFromMetrics(currentVolume, input.measurement.resultsAllintitle);
  }
  return patch;
}

export function buildDataForSeoKeywordFailureSemantic(input: {
  semantic?: JsonObject | null;
  errorCode: string;
  message: string;
  operationRequestId: string;
  failedAt: string;
}): JsonObject {
  return {
    ...asObject(input.semantic),
    allintitle_last_error: {
      provider: "dataforseo",
      providerVersion: "v3",
      executor: "minerador_server",
      errorCode: input.errorCode,
      message: input.message.slice(0, 240),
      operationRequestId: input.operationRequestId,
      failedAt: input.failedAt,
    },
  };
}
