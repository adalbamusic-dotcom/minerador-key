import { isValidDataForSeoAllintitleMeasurement } from "./dataforseo-competition.ts";

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

export type GoogleKeywordInsightMetrics = {
  competitionLevel?: string;
  competitionIndex?: number;
  lowBid?: number;
  highBid?: number;
  trend?: number;
};

export type VolumeLookupResult =
  | { keyword: string; status: "success"; volume: number; metrics?: GoogleKeywordInsightMetrics; source?: string; measuredAt?: string; match?: "exact" }
  | { keyword: string; status: "not_found"; source?: string; measuredAt?: string; match?: "not_found" }
  | { keyword: string; status: "error"; error: string; errorCode?: string; source?: string; measuredAt?: string; match?: "none" }
  | { keyword: string; status: "not_processed"; error: string; errorCode: "not_processed_quota_exceeded"; source?: string; measuredAt?: string; match?: "none" };

const VOLUME_FIELDS = ["volume"] as const;

export function normalizeVolumeKeyword(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    : "";
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function readSuggestionArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: unknown[] }).data;
  }
  return null;
}

function readMetrics(value: Record<string, unknown>): GoogleKeywordInsightMetrics | undefined {
  const metrics: GoogleKeywordInsightMetrics = {};
  if (typeof value.competition_level === "string") metrics.competitionLevel = value.competition_level;
  const competitionIndex = finiteNumber(value.competition_index);
  const lowBid = finiteNumber(value.low_bid);
  const highBid = finiteNumber(value.high_bid);
  const trend = finiteNumber(value.trend);
  if (competitionIndex !== null) metrics.competitionIndex = competitionIndex;
  if (lowBid !== null) metrics.lowBid = lowBid;
  if (highBid !== null) metrics.highBid = highBid;
  if (trend !== null) metrics.trend = trend;
  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

/**
 * Google Keyword Insight currently returns an array of suggestion objects.
 * The exact match is authoritative for Minerador; suggestions are never
 * assigned to another requested keyword.
 */
export function normalizeGoogleKeywordInsightResponse(
  payload: unknown,
  requestedKeyword: string,
): VolumeLookupResult {
  const suggestions = readSuggestionArray(payload);
  if (!suggestions) {
    return { keyword: requestedKeyword, status: "error", error: "Resposta do provedor não possui uma lista de sugestões válida." };
  }

  const requestedKey = normalizeVolumeKeyword(requestedKeyword);
  const exact = suggestions.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const text = (entry as { text?: unknown }).text;
    return normalizeVolumeKeyword(text) === requestedKey;
  });

  if (!exact) return { keyword: requestedKeyword, status: "not_found" };

  const exactObject = exact as Record<string, unknown>;
  const volume = VOLUME_FIELDS.map((field) => finiteNumber(exactObject[field])).find((value): value is number => value !== null);
  if (volume === undefined || volume < 0) {
    return { keyword: requestedKeyword, status: "error", error: "A sugestão exata não possui volume numérico válido." };
  }

  return {
    keyword: requestedKeyword,
    status: "success",
    volume,
    metrics: readMetrics(exactObject),
  };
}

/**
 * Google Keyword Trending Insight returns related-query trend scores, not a
 * monthly search-volume field for the requested keyword. The `value` fields
 * must never be persisted as `volume_search`.
 */
export function normalizeGoogleKeywordTrendingInsightResponse(
  payload: unknown,
  requestedKeyword: string,
): VolumeLookupResult {
  if (!Array.isArray(payload) || payload.length === 0 || !payload[0] || typeof payload[0] !== "object") {
    return { keyword: requestedKeyword, status: "error", error: "Resposta Trending Insight não possui o envelope esperado." };
  }

  const envelope = payload[0] as { success?: unknown; meta?: { keyword?: unknown }; data?: { top?: unknown; rising?: unknown } };
  if (envelope.success !== true) {
    return { keyword: requestedKeyword, status: "error", error: "Trending Insight não confirmou sucesso para a consulta." };
  }

  const returnedKeyword = normalizeVolumeKeyword(envelope.meta?.keyword);
  if (!returnedKeyword) {
    return { keyword: requestedKeyword, status: "error", error: "Trending Insight não retornou meta.keyword." };
  }
  if (returnedKeyword !== normalizeVolumeKeyword(requestedKeyword)) {
    return { keyword: requestedKeyword, status: "not_found" };
  }

  if (!Array.isArray(envelope.data?.top) || !Array.isArray(envelope.data?.rising)) {
    return { keyword: requestedKeyword, status: "error", error: "Trending Insight não retornou listas top e rising válidas." };
  }

  return {
    keyword: requestedKeyword,
    status: "error",
    error: "Trending Insight retorna índices de tendência de consultas relacionadas, não volume mensal da keyword.",
  };
}

/**
 * Keyword Magic Tool returns keyword ideas in a single object. Only the
 * exact `keyword` match can provide its `search volume`; related ideas must
 * never be assigned to the requested keyword.
 */
export function normalizeKeywordMagicToolResponse(
  payload: unknown,
  requestedKeyword: string,
): VolumeLookupResult {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { keyword_ideas?: unknown }).keyword_ideas)) {
    return { keyword: requestedKeyword, status: "error", error: "Resposta Keyword Magic Tool não possui keyword_ideas válido." };
  }

  const requestedKey = normalizeVolumeKeyword(requestedKeyword);
  const exact = (payload as { keyword_ideas: unknown[] }).keyword_ideas.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return normalizeVolumeKeyword((entry as { keyword?: unknown }).keyword) === requestedKey;
  });

  if (!exact) return { keyword: requestedKeyword, status: "not_found" };

  const volume = finiteNumber((exact as Record<string, unknown>)["search volume"]);
  if (volume === null || volume < 0) {
    return { keyword: requestedKeyword, status: "error", error: "A keyword exata não possui search volume numérico válido." };
  }

  return { keyword: requestedKeyword, status: "success", volume };
}

/**
 * SEO Keyword Research returns the requested keyword plus related ideas in
 * `result`. The exact match is the only item that can qualify the request.
 */
export function normalizeSeoKeywordResearchResponse(
  payload: unknown,
  requestedKeyword: string,
): VolumeLookupResult {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { result?: unknown }).result)) {
    return { keyword: requestedKeyword, status: "error", error: "Resposta SEO Keyword Research não possui result válido." };
  }

  const requestedKey = normalizeVolumeKeyword(requestedKeyword);
  const exact = (payload as { result: unknown[] }).result.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return normalizeVolumeKeyword((entry as { keyword?: unknown }).keyword) === requestedKey;
  });

  if (!exact) return { keyword: requestedKeyword, status: "not_found" };

  const rawVolume = (exact as Record<string, unknown>).avg_monthly_searches;
  // The confirmed provider contract returns this metric as a JSON number. In
  // particular, `0` is valid only when the exact item explicitly contains 0;
  // absent values and strings must never silently become a zero measurement.
  const volume = typeof rawVolume === "number" && Number.isFinite(rawVolume) ? rawVolume : null;
  if (volume === null || volume < 0) {
    return { keyword: requestedKeyword, status: "error", error: "A keyword exata não possui avg_monthly_searches numérico válido." };
  }

  return { keyword: requestedKeyword, status: "success", volume };
}

function parseAbbreviatedVolume(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;

  const match = value.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([km]?)$/);
  if (!match) return null;

  const numeric = Number(match[1].replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  return numeric * multiplier;
}

/**
 * SEO Keyword Research Tool's global-volume endpoint groups results by
 * country under `Keyword Overview`. The Brazil group is the only eligible
 * source for the Minerador's Brazilian volume measurement; global and other
 * countries must never be used as a fallback for a missing BR result.
 */
export function normalizeSeoKeywordResearchToolResponse(
  payload: unknown,
  requestedKeyword: string,
): VolumeLookupResult {
  if (!payload || typeof payload !== "object") {
    return { keyword: requestedKeyword, status: "error", error: "Resposta SEO Keyword Research Tool não possui Keyword Overview válido." };
  }

  const overview = (payload as { "Keyword Overview"?: unknown })["Keyword Overview"];
  if (!overview || typeof overview !== "object" || !Array.isArray((overview as { BR?: unknown }).BR)) {
    return { keyword: requestedKeyword, status: "not_found" };
  }

  const requestedKey = normalizeVolumeKeyword(requestedKeyword);
  const exact = (overview as { BR: unknown[] }).BR.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return normalizeVolumeKeyword((entry as { keyword?: unknown }).keyword) === requestedKey;
  });
  if (!exact) return { keyword: requestedKeyword, status: "not_found" };

  const volume = parseAbbreviatedVolume((exact as Record<string, unknown>)["searche volume"]);
  if (volume === null) {
    return { keyword: requestedKeyword, status: "error", error: "A keyword exata não possui searche volume brasileiro válido." };
  }

  return { keyword: requestedKeyword, status: "success", volume };
}

/**
 * Builds a patch without nulling fields when the provider did not return a
 * valid measurement. An explicit zero is valid and deliberately invalidates
 * the current KGR because division by zero is not a score.
 */
export function buildVolumeMetricPatch(
  existing: ExistingVolumeMetrics,
  measuredVolume: number | Extract<VolumeLookupResult, { status: "success" }> | undefined,
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
        source: measuredVolume.source || "seo-keyword-research8",
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
