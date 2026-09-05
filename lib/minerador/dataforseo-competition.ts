export type DataForSeoCompetitionState =
  | "not_measured"
  | "valid"
  | "last_attempt_failed_preserving_previous"
  | "unavailable";

export type DataForSeoCompetitionRecord = Record<string, unknown>;

function record(value: unknown): DataForSeoCompetitionRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DataForSeoCompetitionRecord : null;
}

function parseRecord(value: unknown): DataForSeoCompetitionRecord | null {
  const objectValue = record(value);
  if (objectValue) return objectValue;
  if (typeof value !== "string" || !value.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return record(parsed);
  } catch {
    return null;
  }
}

function finiteNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function providerIsDataForSeo(value: DataForSeoCompetitionRecord | null): boolean {
  const provider = value?.provider ?? value?.source;
  return typeof provider === "string" && provider.trim().toLocaleLowerCase() === "dataforseo";
}

function measurementResult(value: DataForSeoCompetitionRecord | null): number | null {
  return finiteNonNegativeInteger(value?.resultsAllintitle ?? value?.results_allintitle);
}

function measurementTimestamp(value: DataForSeoCompetitionRecord | null): unknown {
  return value?.measuredAt ?? value?.measured_at;
}

function hasFailureStatus(value: DataForSeoCompetitionRecord | null): boolean {
  const status = typeof value?.status === "string" ? value.status.trim().toLocaleLowerCase() : "";
  return ["error", "failed", "failure", "timeout", "unavailable", "captcha", "blocked", "cancelled", "measurement_failed"].includes(status);
}

function hasErrorEvidence(value: unknown): boolean {
  const item = parseRecord(value);
  return Boolean(item && ["errorCode", "code", "message", "failedAt"].some(key => item[key] !== null && item[key] !== undefined && item[key] !== ""));
}

export function dataForSeoRecordValue(value: unknown): DataForSeoCompetitionRecord | null {
  return parseRecord(value);
}

export function dataForSeoHistoryValue(value: unknown): DataForSeoCompetitionRecord[] {
  if (Array.isArray(value)) return value.filter((item): item is DataForSeoCompetitionRecord => Boolean(record(item)));
  if (typeof value !== "string" || !value.trim().startsWith("[")) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is DataForSeoCompetitionRecord => Boolean(record(item))) : [];
  } catch {
    return [];
  }
}

export function readDataForSeoAllintitleResult(value: unknown): number | null {
  return measurementResult(parseRecord(value));
}

/**
 * Allintitle is considered a completed R3 measurement only when the
 * DataForSEO record contains a non-negative result and a valid measurement
 * timestamp. It is intentionally not a KD or generic SEO difficulty score.
 */
export function isValidDataForSeoAllintitleMeasurement(value: unknown): boolean {
  const item = parseRecord(value);
  return providerIsDataForSeo(item) && !hasFailureStatus(item) && measurementResult(item) !== null && validTimestamp(measurementTimestamp(item));
}

/**
 * A persisted numeric projection can remain visible even when an older
 * record has incomplete provenance. The progress strip uses the stricter
 * isValidDataForSeoAllintitleMeasurement check above.
 */
export function hasDataForSeoAllintitleEvidence(input: { measurement?: unknown; result?: unknown }): boolean {
  return isValidDataForSeoAllintitleMeasurement(input.measurement) || finiteNonNegativeInteger(input.result) !== null || readDataForSeoAllintitleResult(input.measurement) !== null;
}

export function deriveDataForSeoCompetitionState(input: { measurement?: unknown; result?: unknown; lastError?: unknown }): DataForSeoCompetitionState {
  const valid = isValidDataForSeoAllintitleMeasurement(input.measurement);
  if (valid && hasErrorEvidence(input.lastError)) return "last_attempt_failed_preserving_previous";
  if (valid) return "valid";
  if (finiteNonNegativeInteger(input.result) !== null || readDataForSeoAllintitleResult(input.measurement) !== null) return "unavailable";
  return "not_measured";
}

export function dataForSeoCompetitionStateLabel(state: DataForSeoCompetitionState): string {
  return ({
    not_measured: "Não medido",
    valid: "Medição válida",
    last_attempt_failed_preserving_previous: "Medição válida · última atualização falhou",
    unavailable: "Resultado indisponível",
  } as const)[state];
}
