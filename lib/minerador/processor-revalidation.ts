import { isValidDataForSeoAllintitleMeasurement } from "./dataforseo-competition.ts";
import { calculateKgrFromMetrics } from "./kgr-applicability.ts";
import { isValidGoogleAdsDemandMeasurement } from "./google-ads-demand.ts";

export type ProcessorMetricValidationState = "pending" | "imported" | "validated";
export type ProcessorKgrSource = "none" | "previous" | "imported" | "mixed" | "processor";

export type ProcessorImportedEvidence = {
  present: boolean;
  source: string | null;
  provider: string | null;
  providerVersion: string | null;
  volume: number | null;
  volumeMeasuredAt: string | null;
  resultsAllintitle: number | null;
  resultsMeasuredAt: string | null;
  resultsProvider: string | null;
  resultsProviderVersion: string | null;
  metrics: Record<string, unknown>;
};

export type ProcessorMetricValidation = {
  state: ProcessorMetricValidationState;
  validated: boolean;
  value: number | null;
  measuredAt: string | null;
  provider: string | null;
  measurement: Record<string, unknown> | null;
  importedValue: number | null;
  importedMeasuredAt: string | null;
  importedEvidence: ProcessorImportedEvidence;
};

export type ProcessorRevalidation = {
  discoveryImported: boolean;
  imported: ProcessorImportedEvidence;
  volume: ProcessorMetricValidation;
  results: ProcessorMetricValidation;
  kgr: {
    ready: boolean;
    score: number | null;
    volumeUsed: number | null;
    allintitleUsed: number | null;
    source: ProcessorKgrSource;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = finiteNonNegative(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function firstTimestamp(...values: unknown[]): string | null {
  for (const value of values) {
    const parsed = timestamp(value);
    if (parsed) return parsed;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mergePresentRecords(...records: Array<Record<string, unknown> | null>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const record of records) {
    if (!record) continue;
    for (const [key, value] of Object.entries(record)) {
      if (value !== null && value !== undefined && value !== "") merged[key] = value;
    }
  }
  return merged;
}

/**
 * Reads only evidence copied from the Discovery import. It never promotes
 * that evidence to a Processor validation state.
 */
export function readProcessorImportedEvidence(semantic: Record<string, unknown> | null | undefined): ProcessorImportedEvidence {
  const discoveryImport = asRecord(semantic?.discovery_import);
  if (!discoveryImport) {
    return {
      present: false,
      source: null,
      provider: null,
      providerVersion: null,
      volume: null,
      volumeMeasuredAt: null,
      resultsAllintitle: null,
      resultsMeasuredAt: null,
      resultsProvider: null,
      resultsProviderVersion: null,
      metrics: {},
    };
  }

  const lastMeasurement = asRecord(discoveryImport.lastMeasurement);
  const sourceSnapshot = asRecord(discoveryImport.sourceSnapshot);
  const snapshotMetrics = asRecord(sourceSnapshot?.metrics);
  const sourceData = asRecord(sourceSnapshot?.sourceData);
  const importedMetrics = asRecord(sourceData?.importedMetrics);
  const metrics = mergePresentRecords(snapshotMetrics, importedMetrics);
  const sharedProvider = stringValue(sourceSnapshot?.provider) || stringValue(metrics.provider);
  const sharedProviderVersion = stringValue(sourceSnapshot?.providerVersion) || stringValue(metrics.providerVersion);
  const explicitResultsProvider = stringValue(lastMeasurement?.resultsProvider)
    || stringValue(lastMeasurement?.resultsSource)
    || stringValue(sourceSnapshot?.allintitleProvider)
    || stringValue(sourceSnapshot?.allintitle_provider)
    || stringValue(snapshotMetrics?.allintitleProvider)
    || stringValue(snapshotMetrics?.allintitle_provider)
    || stringValue(importedMetrics?.allintitleProvider)
    || stringValue(importedMetrics?.allintitle_provider);
  const resultsProvider = explicitResultsProvider
    || (sharedProvider?.toLocaleLowerCase("en-US") === "dataforseo" ? sharedProvider : null);
  const resultsProviderVersion = stringValue(lastMeasurement?.resultsProviderVersion)
    || stringValue(lastMeasurement?.resultsProvider_version)
    || (resultsProvider && sharedProvider === resultsProvider ? sharedProviderVersion : null);

  return {
    present: true,
    source: stringValue(discoveryImport.source) || stringValue(sourceSnapshot?.source),
    provider: sharedProvider,
    providerVersion: sharedProviderVersion,
    volume: firstNumber(lastMeasurement?.volume, snapshotMetrics?.averageMonthlySearches, importedMetrics?.averageMonthlySearches),
    volumeMeasuredAt: firstTimestamp(lastMeasurement?.volumeMeasuredAt, snapshotMetrics?.metricsMeasuredAt, sourceSnapshot?.measuredAt),
    resultsAllintitle: firstNumber(lastMeasurement?.resultsAllintitle, snapshotMetrics?.resultsAllintitle, importedMetrics?.resultsAllintitle),
    resultsMeasuredAt: firstTimestamp(lastMeasurement?.resultsMeasuredAt, snapshotMetrics?.allintitleMeasuredAt),
    resultsProvider,
    resultsProviderVersion,
    metrics,
  };
}

function metricState(input: { validated: boolean; importedPresent: boolean }): ProcessorMetricValidationState {
  if (input.validated) return "validated";
  if (input.importedPresent) return "imported";
  return "pending";
}

function processorMeasurementValue(measurement: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!measurement) return null;
  return firstNumber(...keys.map(key => measurement[key]));
}

/**
 * Derives the distinction required by the R6 Discovery addendum from the
 * existing JSONB fields. A valid provider record in the Processor slots is
 * the only source of a completed step; discovery_import remains context.
 */
export function deriveProcessorRevalidation(input: {
  semantic?: Record<string, unknown> | null;
  volumeMeasurement?: unknown;
  dataForSeoMeasurement?: unknown;
  volumeSearch?: unknown;
  resultsAllintitle?: unknown;
}): ProcessorRevalidation {
  const semantic = input.semantic || {};
  const imported = readProcessorImportedEvidence(semantic);
  const volumeMeasurement = asRecord(input.volumeMeasurement) || asRecord(semantic.volume_measurement);
  const dataForSeoMeasurement = asRecord(input.dataForSeoMeasurement) || asRecord(semantic.allintitle_measurement);
  const volumeValidated = isValidGoogleAdsDemandMeasurement(volumeMeasurement);
  const resultsValidated = isValidDataForSeoAllintitleMeasurement(dataForSeoMeasurement);
  const volumeMeasuredValue = processorMeasurementValue(volumeMeasurement, "averageMonthlySearches", "rawVolume");
  const resultsMeasuredValue = processorMeasurementValue(dataForSeoMeasurement, "resultsAllintitle", "results_allintitle");
  const previousVolume = firstNumber(imported.volume, input.volumeSearch);
  const previousResults = firstNumber(imported.resultsAllintitle, input.resultsAllintitle);
  const volumeValue = volumeValidated ? volumeMeasuredValue : previousVolume;
  const resultsValue = resultsValidated ? resultsMeasuredValue : previousResults;
  const volumeImportedValue = volumeValidated ? null : previousVolume;
  const resultsImportedValue = resultsValidated ? null : previousResults;
  const volume: ProcessorMetricValidation = {
    state: metricState({ validated: volumeValidated, importedPresent: imported.present }),
    validated: volumeValidated,
    value: volumeValue,
    measuredAt: volumeValidated ? firstTimestamp(volumeMeasurement?.measuredAt) : imported.volumeMeasuredAt,
    provider: volumeValidated ? stringValue(volumeMeasurement?.provider) || stringValue(volumeMeasurement?.source) : imported.provider,
    measurement: volumeMeasurement,
    importedValue: volumeImportedValue,
    importedMeasuredAt: imported.volumeMeasuredAt,
    importedEvidence: imported,
  };
  const results: ProcessorMetricValidation = {
    state: metricState({ validated: resultsValidated, importedPresent: imported.present }),
    validated: resultsValidated,
    value: resultsValue,
    measuredAt: resultsValidated ? firstTimestamp(dataForSeoMeasurement?.measuredAt, dataForSeoMeasurement?.measured_at) : imported.resultsMeasuredAt,
    provider: resultsValidated ? stringValue(dataForSeoMeasurement?.provider) || stringValue(dataForSeoMeasurement?.source) : imported.provider,
    measurement: dataForSeoMeasurement,
    importedValue: resultsImportedValue,
    importedMeasuredAt: imported.resultsMeasuredAt,
    importedEvidence: imported,
  };

  const processorInputsReady = volumeValidated && resultsValidated && volumeValue !== null && resultsValue !== null;
  // Top-level metric projections are not proof of a current Processor run.
  // They may be historical/manual values from before the validation contract.
  // KGR becomes current only when both provider measurement records are valid.
  const ready = processorInputsReady;
  const source: ProcessorKgrSource = processorInputsReady
    ? "processor"
    : volumeValue === null && resultsValue === null
      ? "none"
      : volumeValidated !== resultsValidated
        ? "mixed"
        : imported.present
          ? "imported"
          : "previous";

  return {
    discoveryImported: imported.present,
    imported,
    volume,
    results,
    kgr: {
      ready,
      score: ready ? calculateKgrFromMetrics(volumeValue, resultsValue) : null,
      volumeUsed: volumeValue,
      allintitleUsed: resultsValue,
      source,
    },
  };
}

export function processorMetricStateLabel(state: ProcessorMetricValidationState, hasPreviousValue = false): string {
  if (state === "validated") return "Validado no Processador";
  if (state === "imported") return "Anterior/importado · aguardando revalidação";
  return hasPreviousValue ? "Dado anterior · aguardando medição no Processador" : "Aguardando medição no Processador";
}

export function processorKgrStateLabel(input: Pick<ProcessorRevalidation["kgr"], "ready" | "source">): string {
  if (input.ready) return "Calculável com medições do Processador";
  if (input.source === "imported") return "Aguardando revalidação dos inputs importados";
  if (input.source === "mixed") return "Aguardando revalidação dos inputs restantes";
  if (input.source === "previous") return "Aguardando medição válida no Processador";
  return "Aguardando volume e resultados válidos";
}

/**
 * Read-only KGR projection for tables and summaries. Persisted kgr_score is
 * intentionally ignored when either current Processor measurement is absent.
 */
export function readCurrentProcessorKgr(input: {
  semantic?: Record<string, unknown> | null;
  volumeSearch?: unknown;
  resultsAllintitle?: unknown;
}): number | null {
  const state = deriveProcessorRevalidation(input);
  return state.kgr.ready ? state.kgr.score : null;
}
