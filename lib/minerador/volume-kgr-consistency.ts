export type VolumeKgrConsistency =
  | "coherent"
  | "measurement_pending"
  | "zero_unconfirmed"
  | "zero_confirmed"
  | "not_applicable"
  | "inconsistent";

export type VolumeKgrConsistencyInput = {
  volume: unknown;
  results: unknown;
  kgrScore: unknown;
  semantic?: Record<string, unknown> | null;
  kgrApplicability?: unknown;
};

export type VolumeKgrDiagnosticCategory = Exclude<VolumeKgrConsistency, "coherent" | "zero_confirmed">;

export type VolumeKgrDiagnosticCounts = Record<VolumeKgrDiagnosticCategory, number>;

export type VolumeKgrDiagnosticItem<T> = {
  item: T;
  status: VolumeKgrDiagnosticCategory;
};

export type VolumeKgrDiagnostics<T> = {
  counts: VolumeKgrDiagnosticCounts;
  items: Array<VolumeKgrDiagnosticItem<T>>;
  total: number;
};

export function hasExplicitZeroMeasurement(semantic: Record<string, unknown> | null | undefined): boolean {
  const measurement = semantic?.volume_measurement;
  return Boolean(measurement && typeof measurement === "object" && !Array.isArray(measurement)
    && (measurement as Record<string, unknown>).status === "zero_confirmed"
    && (measurement as Record<string, unknown>).rawVolume === 0
    && (measurement as Record<string, unknown>).match === "exact");
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function resolvedApplicability(input: VolumeKgrConsistencyInput): string {
  const origin = String(input.semantic?.kgr_decisao_origem ?? "").trim().toLowerCase();
  if (["ai", "ia", "automatic", "automatico", "automático", "provider"].includes(origin)) return "pending";
  const value = input.kgrApplicability
    ?? input.semantic?.kgr_aplicabilidade
    ?? input.semantic?.kgr_decisao
    ?? input.semantic?.kgr_applicability
    ?? input.semantic?.kgrApplicability
    ?? input.semantic?.kgr_aplicavel;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  return normalized === "not_applicable" || normalized === "não" || normalized === "nao" || normalized === "nãƒo" || normalized === "nã£o" || normalized === false
    ? "not_applicable"
    : "pending";
}

export function assessVolumeKgrConsistency(input: VolumeKgrConsistencyInput): VolumeKgrConsistency {
  const { volume, results, kgrScore } = input;
  const applicability = resolvedApplicability(input);

  // Applicability is a strategic dimension. It never suppresses metric collection
  // and its display must not turn missing metrics into an inconsistency.
  if (applicability === "not_applicable") return "not_applicable";

  if (!finiteNonNegative(volume)) return "measurement_pending";

  if (volume === 0) {
    if (hasExplicitZeroMeasurement(input.semantic)) {
      return finiteNonNegative(kgrScore) ? "inconsistent" : "zero_confirmed";
    }
    return "zero_unconfirmed";
  }

  // A mismatch is proven only when both current metrics and the persisted score
  // are numeric. Missing results or score remain a measurement gap.
  if (!finiteNonNegative(results) || !finiteNonNegative(kgrScore)) return "measurement_pending";

  const expected = results / volume;
  const tolerance = Math.max(0.0001, Math.abs(expected) * 0.00005);
  return Math.abs(kgrScore - expected) <= tolerance ? "coherent" : "inconsistent";
}

export function volumeKgrConsistencyLabel(status: VolumeKgrConsistency): string {
  return ({
    coherent: "Coerente",
    measurement_pending: "Medição pendente",
    zero_unconfirmed: "Volume zero sem confirmação",
    zero_confirmed: "0 confirmado",
    not_applicable: "Não aplicável",
    inconsistent: "Incompatibilidade comprovada",
  } as const)[status];
}

const diagnosticCategories: VolumeKgrDiagnosticCategory[] = [
  "measurement_pending",
  "zero_unconfirmed",
  "not_applicable",
  "inconsistent",
];

export function classifyVolumeKgrDiagnostics<
  T extends { volume_search: number | null; results_allintitle: number | null; kgr_score: number | null; analise_semantica?: Record<string, unknown> | null },
>(items: T[]): VolumeKgrDiagnostics<T> {
  const counts = Object.fromEntries(diagnosticCategories.map(category => [category, 0])) as VolumeKgrDiagnosticCounts;
  const diagnosticItems: Array<VolumeKgrDiagnosticItem<T>> = [];

  for (const item of items) {
    const status = assessVolumeKgrConsistency({
      volume: item.volume_search,
      results: item.results_allintitle,
      kgrScore: item.kgr_score,
      semantic: item.analise_semantica,
    });
    if (!diagnosticCategories.includes(status as VolumeKgrDiagnosticCategory)) continue;
    const category = status as VolumeKgrDiagnosticCategory;
    counts[category] += 1;
    diagnosticItems.push({ item, status: category });
  }

  return { counts, items: diagnosticItems, total: diagnosticItems.length };
}

export function findVolumeKgrInconsistencies<T extends { volume_search: number | null; results_allintitle: number | null; kgr_score: number | null; analise_semantica?: Record<string, unknown> | null }>(items: T[]) {
  return items.filter(item => assessVolumeKgrConsistency({
    volume: item.volume_search,
    results: item.results_allintitle,
    kgrScore: item.kgr_score,
    semantic: item.analise_semantica,
  }) === "inconsistent");
}
