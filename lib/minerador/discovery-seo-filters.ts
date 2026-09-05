import type { DiscoveryCandidate } from "./discovery-keywords.ts";

export type DiscoverySeoRange = {
  min: number | null;
  max: number | null;
  /** A preset can explicitly include only measured or only unmeasured values. */
  mode?: "all" | "present" | "missing";
};

export type DiscoverySeoPresetOption<Key extends string> = {
  key: Key;
  label: string;
};

export const DISCOVERY_RESULT_PRESETS = [
  { key: "all", label: "Todos" },
  { key: "present", label: "Com resultado" },
  { key: "missing", label: "Sem medição" },
  { key: "0_99", label: "0–99" },
  { key: "100_499", label: "100–499" },
  { key: "500_999", label: "500–999" },
  { key: "1000_4999", label: "1.000–4.999" },
  { key: "5000_9999", label: "5.000–9.999" },
  { key: "10000_plus", label: "10.000+" },
  { key: "custom", label: "Intervalo personalizado" },
] as const satisfies readonly DiscoverySeoPresetOption<string>[];

export type DiscoveryResultPreset = typeof DISCOVERY_RESULT_PRESETS[number]["key"];

export const DISCOVERY_KEYWORD_DIFFICULTY_PRESETS = [
  { key: "all", label: "Todos" },
  { key: "present", label: "Com KD" },
  { key: "missing", label: "Sem medição" },
  { key: "0_20", label: "0–20" },
  { key: "21_40", label: "21–40" },
  { key: "41_60", label: "41–60" },
  { key: "61_80", label: "61–80" },
  { key: "81_100", label: "81–100" },
  { key: "custom", label: "Intervalo personalizado" },
] as const satisfies readonly DiscoverySeoPresetOption<string>[];

export type DiscoveryKeywordDifficultyPreset = typeof DISCOVERY_KEYWORD_DIFFICULTY_PRESETS[number]["key"];

export type DiscoverySeoFilters = {
  result: DiscoverySeoRange;
  keywordDifficulty: DiscoverySeoRange;
};

export const EMPTY_DISCOVERY_SEO_FILTERS: DiscoverySeoFilters = {
  result: { min: null, max: null },
  keywordDifficulty: { min: null, max: null },
};

export type DiscoverySeoFilterSummary = {
  result: number;
  keywordDifficulty: number;
};

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseDiscoverySeoBound(value: string): number | null {
  return finiteNonNegative(value);
}

export function discoverySeoPresetRange(
  preset: DiscoveryResultPreset | DiscoveryKeywordDifficultyPreset,
  customMin: number | null = null,
  customMax: number | null = null,
): DiscoverySeoRange {
  if (preset === "present") return { min: null, max: null, mode: "present" };
  if (preset === "missing") return { min: null, max: null, mode: "missing" };
  if (preset === "0_99") return { min: 0, max: 99 };
  if (preset === "100_499") return { min: 100, max: 499 };
  if (preset === "500_999") return { min: 500, max: 999 };
  if (preset === "1000_4999") return { min: 1000, max: 4999 };
  if (preset === "5000_9999") return { min: 5000, max: 9999 };
  if (preset === "10000_plus") return { min: 10000, max: null };
  if (preset === "0_20") return { min: 0, max: 20 };
  if (preset === "21_40") return { min: 21, max: 40 };
  if (preset === "41_60") return { min: 41, max: 60 };
  if (preset === "61_80") return { min: 61, max: 80 };
  if (preset === "81_100") return { min: 81, max: 100 };
  if (preset === "custom") return { min: customMin, max: customMax };
  return { min: null, max: null };
}

export function readDiscoveryResult(candidate: DiscoveryCandidate): number | null {
  const current = candidate.currentMetrics;
  if (current && Object.prototype.hasOwnProperty.call(current, "resultsAllintitle")) return finiteNonNegative(current.resultsAllintitle);
  return finiteNonNegative(candidate.sourceData?.importedMetrics?.resultsAllintitle);
}

export function readDiscoveryKeywordDifficulty(candidate: DiscoveryCandidate): number | null {
  const current = candidate.currentMetrics as (DiscoveryCandidate["currentMetrics"] & { keywordDifficulty?: unknown }) | null | undefined;
  if (current && Object.prototype.hasOwnProperty.call(current, "keywordDifficulty")) {
    const currentValue = finiteNonNegative(current.keywordDifficulty);
    return currentValue !== null && currentValue <= 100 ? currentValue : null;
  }

  const imported = candidate.sourceData?.importedMetrics as ({ keywordDifficulty?: unknown } | null | undefined);
  const importedValue = finiteNonNegative(imported?.keywordDifficulty);
  return importedValue !== null && importedValue <= 100 ? importedValue : null;
}

export function isDiscoverySeoRangeActive(range: DiscoverySeoRange): boolean {
  return range.mode === "present" || range.mode === "missing" || range.min !== null || range.max !== null;
}

function matchesRange(value: number | null, range: DiscoverySeoRange): boolean {
  if (range.mode === "all") return true;
  if (range.mode === "present") return value !== null;
  if (range.mode === "missing") return value === null;
  if (!isDiscoverySeoRangeActive(range)) return true;
  if (value === null) return false;
  if (range.min !== null && value < range.min) return false;
  if (range.max !== null && value > range.max) return false;
  return true;
}

export function candidateMatchesDiscoverySeoFilters(candidate: DiscoveryCandidate, filters: DiscoverySeoFilters): boolean {
  return matchesRange(readDiscoveryResult(candidate), filters.result)
    && matchesRange(readDiscoveryKeywordDifficulty(candidate), filters.keywordDifficulty);
}

export function applyDiscoverySeoFilters(candidates: DiscoveryCandidate[], filters: DiscoverySeoFilters) {
  const summary: DiscoverySeoFilterSummary = { result: 0, keywordDifficulty: 0 };
  const acceptedCandidates: DiscoveryCandidate[] = [];

  for (const candidate of candidates) {
    const resultMatches = matchesRange(readDiscoveryResult(candidate), filters.result);
    if (!resultMatches) {
      summary.result += 1;
      continue;
    }
    const keywordDifficultyMatches = matchesRange(readDiscoveryKeywordDifficulty(candidate), filters.keywordDifficulty);
    if (!keywordDifficultyMatches) {
      summary.keywordDifficulty += 1;
      continue;
    }
    acceptedCandidates.push(candidate);
  }

  return { acceptedCandidates, summary };
}
