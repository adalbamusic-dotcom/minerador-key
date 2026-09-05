export type GoogleAdsDemandTrend = "crescente" | "estável" | "decrescente" | "dados_insuficientes";

export type GoogleAdsCpcEvidenceSource = "processor" | "imported" | "none";

export type GoogleAdsCpcEvidence = {
  source: GoogleAdsCpcEvidenceSource;
  rawValue: unknown;
  currencyCode: string | null;
  targeting: unknown;
  sortValue: number | null;
};

type DemandRecord = Record<string, unknown>;

function record(value: unknown): DemandRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DemandRecord : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function isBrazilTargeting(value: unknown): boolean {
  const item = record(value);
  if (!item) return false;
  const geoTargetConstants = Array.isArray(item.geoTargetConstants)
    ? item.geoTargetConstants
    : Array.isArray(item.geo_target_constants)
      ? item.geo_target_constants
      : [];
  const locationValue = item.countryCode || item.country_code || item.country || item.locationCode || item.location_code || geoTargetConstants[0];
  const locationMarker = typeof locationValue === "string" ? locationValue.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, "") : String(locationValue || "");
  return ["br", "brasil", "2076", "geotargetconstants/2076"].includes(locationMarker);
}

export function googleAdsDisplayCurrencyCode(currencyCode: unknown, targeting?: unknown): string | null {
  const rawCurrency = typeof currencyCode === "string" ? currencyCode.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : isBrazilTargeting(targeting) ? "BRL" : null;
}

export function formatGoogleAdsCpcMicros(value: unknown, currencyCode: unknown, targeting?: unknown): string | null {
  const numeric = finiteNumber(value);
  if (numeric === null) return null;
  const currency = googleAdsDisplayCurrencyCode(currencyCode, targeting);
  if (!currency) return "Moeda não informada";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(numeric / 1_000_000);
}

function firstPresentValue(records: Array<DemandRecord | null>, keys: string[]): { present: boolean; value: unknown; key: string | null } {
  for (const item of records) {
    if (!item) continue;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key)) return { present: true, value: item[key], key };
    }
  }
  return { present: false, value: null, key: null };
}

function firstStringValue(records: Array<DemandRecord | null>, keys: string[]): string | null {
  for (const item of records) {
    if (!item) continue;
    for (const key of keys) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function parseImportedCpc(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim().replace(/[^0-9,.-]/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "")
    : raw.includes(",")
      ? raw.replace(",", ".")
      : /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Numeric CPC projection shared by tables, decision summaries and AI facts. */
export function readGoogleAdsCpcMeasurementValue(value: unknown): number | null {
  const item = record(value);
  if (!item) return null;
  const micros = firstPresentValue([item], ["averageCpcMicros", "average_cpc_micros"]);
  if (micros.present) {
    const parsed = finiteNumber(micros.value);
    return parsed === null || parsed < 0 ? null : parsed / 1_000_000;
  }
  const cpc = firstPresentValue([item], ["cpc", "averageCpc", "average_cpc"]);
  return cpc.present ? parseImportedCpc(cpc.value) : null;
}

function cpcHasExplicitCurrency(value: unknown): boolean {
  return typeof value === "string" && /R\$|[$€£¥]|\b[A-Z]{3}\b/i.test(value);
}

function buildCpcEvidence(source: Exclude<GoogleAdsCpcEvidenceSource, "none">, rawValue: unknown, currencyCode: unknown, targeting: unknown, micros: boolean): GoogleAdsCpcEvidence {
  const parsed = micros ? finiteNumber(rawValue) : parseImportedCpc(rawValue);
  const numeric = parsed !== null && parsed >= 0 ? parsed : null;
  return {
    source,
    rawValue,
    currencyCode: typeof currencyCode === "string" && currencyCode.trim() ? currencyCode.trim().toUpperCase() : null,
    targeting,
    sortValue: numeric === null ? null : micros ? numeric / 1_000_000 : numeric,
  };
}

/**
 * Reads the latest CPC evidence without promoting Discovery data to a
 * Processor validation. A valid current volume measurement wins; otherwise
 * the value remains explicitly marked as imported context.
 */
export function readGoogleAdsCpcEvidence(semantic: unknown): GoogleAdsCpcEvidence {
  const semanticRecord = record(semantic);
  const currentMeasurement = record(semanticRecord?.volume_measurement);
  if (currentMeasurement && isValidGoogleAdsDemandMeasurement(currentMeasurement)) {
    const cpc = firstPresentValue([currentMeasurement], ["averageCpcMicros", "average_cpc_micros", "cpc"]);
    return buildCpcEvidence("processor", cpc.value, currentMeasurement.currencyCode ?? currentMeasurement.currency_code, currentMeasurement.targeting, true);
  }

  const discoveryImport = record(semanticRecord?.discovery_import);
  const sourceSnapshot = record(discoveryImport?.sourceSnapshot);
  const lastMeasurement = record(discoveryImport?.lastMeasurement);
  const snapshotMetrics = record(sourceSnapshot?.metrics);
  const sourceData = record(sourceSnapshot?.sourceData);
  const importedMetrics = record(sourceData?.importedMetrics);
  const cpc = firstPresentValue([lastMeasurement, snapshotMetrics, importedMetrics], ["averageCpcMicros", "average_cpc_micros", "cpc"]);
  if (!cpc.present) return { source: "none", rawValue: null, currencyCode: null, targeting: null, sortValue: null };

  const currencyCode = firstStringValue([lastMeasurement, snapshotMetrics, sourceSnapshot], ["currencyCode", "currency_code"]);
  const targeting = sourceSnapshot?.targeting || snapshotMetrics?.targeting || lastMeasurement?.targeting || null;
  const importedMicros = cpc.key === "averageCpcMicros" || cpc.key === "average_cpc_micros";
  return buildCpcEvidence("imported", cpc.value, currencyCode, targeting, importedMicros);
}

function formatPlainCpc(value: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Compact table presentation; never exposes the diagnostic "Moeda não informada" label. */
export function formatGoogleAdsCpcTableValue(evidence: GoogleAdsCpcEvidence): string {
  if (evidence.rawValue === null || evidence.rawValue === undefined || evidence.sortValue === null) return "—";
  if (evidence.source === "processor") {
    const formatted = formatGoogleAdsCpcMicros(evidence.rawValue, evidence.currencyCode, evidence.targeting);
    if (formatted && formatted !== "Moeda não informada") return formatted;
    return formatPlainCpc(evidence.sortValue);
  }
  if (cpcHasExplicitCurrency(evidence.rawValue)) return String(evidence.rawValue).trim();
  const currency = googleAdsDisplayCurrencyCode(evidence.currencyCode, evidence.targeting);
  if (currency) return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(evidence.sortValue);
  return formatPlainCpc(evidence.sortValue);
}

function validTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function providerIsGoogleAds(value: unknown): boolean {
  const item = record(value);
  return item?.provider === "google_ads" || item?.source === "google_ads";
}

function monthIndex(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const months: Record<string, number> = {
    january: 1, janeiro: 1,
    february: 2, fevereiro: 2,
    march: 3, marco: 3, março: 3,
    april: 4, abril: 4,
    may: 5, maio: 5,
    june: 6, junho: 6,
    july: 7, julho: 7,
    august: 8, agosto: 8,
    september: 9, setembro: 9,
    october: 10, outubro: 10,
    november: 11, novembro: 11,
    december: 12, dezembro: 12,
  };
  return months[normalized] || null;
}

function historyPoints(history: unknown) {
  if (!Array.isArray(history)) return [] as Array<{ value: number; order: number; index: number }>;
  return history.flatMap((entry, index) => {
    const item = record(entry);
    if (!item) return [];
    const value = finiteNumber(item.searches ?? item.monthlySearches ?? item.volume ?? item.value);
    if (value === null || value < 0) return [];
    const year = finiteNumber(item.year);
    const month = monthIndex(item.month ?? item.monthLabel);
    const order = year !== null && month !== null ? year * 100 + month : index;
    return [{ value, order, index }];
  }).sort((left, right) => left.order - right.order || left.index - right.index);
}

/**
 * Derives a deliberately simple, reproducible trend from monthly history.
 * It does not infer seasonality: insufficient or mixed evidence remains stable
 * rather than being promoted to a stronger conclusion.
 */
export function deriveGoogleAdsDemandTrend(history: unknown): GoogleAdsDemandTrend {
  const points = historyPoints(history);
  if (points.length < 3) return "dados_insuficientes";

  const deltas = points.slice(1).map((point, index) => point.value - points[index].value).filter(delta => delta !== 0);
  if (deltas.length === 0) return "estável";

  const first = points[0].value;
  const last = points.at(-1)!.value;
  const relativeChange = (last - first) / Math.max(Math.abs(first), 1);
  const positiveDeltas = deltas.filter(delta => delta > 0).length;
  const negativeDeltas = deltas.filter(delta => delta < 0).length;
  const directionalThreshold = Math.ceil(deltas.length * 0.6);

  if (relativeChange >= 0.1 && positiveDeltas >= directionalThreshold) return "crescente";
  if (relativeChange <= -0.1 && negativeDeltas >= directionalThreshold) return "decrescente";
  return "estável";
}

export function googleAdsDemandTrendLabel(value: GoogleAdsDemandTrend): string {
  return ({
    crescente: "Crescente",
    estável: "Estável",
    decrescente: "Decrescente",
    dados_insuficientes: "Dados insuficientes",
  } as const)[value];
}

export function isValidGoogleAdsDemandMeasurement(value: unknown): boolean {
  const item = record(value);
  const volume = finiteNumber(item?.averageMonthlySearches ?? item?.rawVolume);
  return providerIsGoogleAds(item) && volume !== null && volume >= 0 && validTimestamp(item?.measuredAt);
}

/**
 * A card may expose a recorded attempt or a preserved projection, but the
 * progress strip only uses isValidGoogleAdsDemandMeasurement for ✓.
 */
export function hasGoogleAdsDemandEvidence(input: {
  measurement?: unknown;
  eligibility?: unknown;
  volumeSource?: unknown;
  volumeSearch?: unknown;
}): boolean {
  const measurement = record(input.measurement);
  const eligibility = record(input.eligibility);
  const measurementEvidence = measurement !== null && providerIsGoogleAds(measurement) && (
    validTimestamp(measurement?.measuredAt)
    || "averageMonthlySearches" in measurement
    || "monthlySearchVolumes" in measurement
  );
  const eligibilityEvidence = providerIsGoogleAds(eligibility) && validTimestamp(eligibility?.measuredAt);
  const projectionEvidence = input.volumeSource === "google_ads" && finiteNumber(input.volumeSearch) !== null;
  return measurementEvidence || eligibilityEvidence || projectionEvidence;
}
