import { calculateKgrFromMetrics, readKgrApplicability } from "./kgr-applicability.ts";
import type { DataForSeoAllintitleMeasurement } from "./dataforseo-serp-core.ts";

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

export function buildDataForSeoKeywordMeasurementPatch(input: {
  existing: {
    results_allintitle: number | null;
    volume_search: number | null;
    kgr_score: number | null;
    analise_semantica?: JsonObject | null;
  };
  measurement: DataForSeoAllintitleMeasurement;
  operationRequestId: string;
  targeting: JsonObject;
}): DataForSeoKeywordMeasurementPatch {
  const previous = asMeasurement(input.existing.analise_semantica?.allintitle_measurement);
  const history = Array.isArray(input.existing.analise_semantica?.allintitle_measurement_history)
    ? input.existing.analise_semantica.allintitle_measurement_history.filter(value => asMeasurement(value)) as JsonObject[]
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
  const nextSemantic = {
    ...asObject(input.existing.analise_semantica),
    allintitle_measurement: currentMeasurement,
    allintitle_measurement_history: previous
      ? [...history, { ...previous, preservedAt: new Date().toISOString() }].slice(-25)
      : history,
    allintitle_last_error: null,
  } satisfies JsonObject;
  const patch: DataForSeoKeywordMeasurementPatch = {
    results_allintitle: input.measurement.resultsAllintitle,
    analise_semantica: nextSemantic,
  };
  if (readKgrApplicability(input.existing.analise_semantica) !== "not_applicable") {
    patch.kgr_score = calculateKgrFromMetrics(input.existing.volume_search, input.measurement.resultsAllintitle);
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
