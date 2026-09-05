import { z } from "zod";

export const KgrApplicabilitySchema = z.enum(["pending", "applicable", "not_applicable"]);
export type KgrApplicability = z.infer<typeof KgrApplicabilitySchema>;

export const KgrMeasurementSchema = z.enum(["without_data", "partial", "complete", "invalid"]);
export type KgrMeasurement = z.infer<typeof KgrMeasurementSchema>;

export type KgrTechnicalTone = "success" | "warning" | "danger" | "neutral";

export type KgrSemantic = Record<string, unknown>;

export type KgrDecisionHistoryEntry = {
  applicability: KgrApplicability;
  decision: "SIM" | "NÃO" | "PENDENTE";
  changedAt: string;
  actorId: string;
  justification?: string;
};

export type KgrRowForSort = {
  kgr_score: number | null;
  volume_search: number | null;
  results_allintitle: number | null;
  analise_semantica?: KgrSemantic | null;
  currentKgrReady?: boolean;
};

export function kgrDecisionLabel(applicability: KgrApplicability): "SIM" | "NÃO" | "PENDENTE" {
  if (applicability === "applicable") return "SIM";
  if (applicability === "not_applicable") return "NÃO";
  return "PENDENTE";
}

function fromExplicitDecision(value: unknown): KgrApplicability | null {
  if (value === "applicable" || value === "SIM" || value === "sim" || value === true) return "applicable";
  if (value === "not_applicable" || value === "NÃO" || value === "NAO" || value === "não" || value === "nao" || value === false) return "not_applicable";
  if (value === "pending" || value === "PENDENTE" || value === "pendente") return "pending";
  return null;
}

/** Reads only an explicit decision. Metrics, intent and commercial status never decide applicability. */
export function readKgrApplicability(semantic: KgrSemantic | null | undefined): KgrApplicability {
  if (!semantic) return "pending";
  const origin = String(semantic.kgr_decisao_origem ?? "").toLowerCase();
  if (["ai", "ia", "automatic", "automatico", "automático", "provider"].includes(origin)) return "pending";

  const direct = fromExplicitDecision(semantic.kgr_aplicabilidade);
  if (direct) return direct;
  const decision = fromExplicitDecision(semantic.kgr_decisao);
  if (decision) return decision;
  const legacy = fromExplicitDecision(semantic.kgr_applicability ?? semantic.kgrApplicability ?? semantic.kgr_aplicavel);
  return legacy ?? "pending";
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function hasUsableKgrScore(value: unknown): value is number {
  return finiteNonNegative(value);
}

export function calculateKgrFromMetrics(volume: unknown, results: unknown): number | null {
  if (!finiteNonNegative(volume) || volume <= 0 || !finiteNonNegative(results)) return null;
  return Number((results / volume).toFixed(4));
}

/** Limite canônico da faixa plenamente KGR: o score precisa ser estritamente menor. */
export const KGR_FULL_RANGE_LIMIT = 0.25;

export type KgrVisualRange = "full_kgr" | "other" | "unavailable";
export type KgrVisualState = { range: KgrVisualRange; favorable: boolean };

/**
 * Regra visual única do score KGR, consumida por toda a UI do Minerador.
 * Deriva exclusivamente do valor numérico real — nunca de status editorial,
 * aplicabilidade humana, revisão ou aprovação — e nunca da string formatada.
 */
export function deriveKgrVisualState(score: unknown): KgrVisualState {
  if (!finiteNonNegative(score)) return { range: "unavailable", favorable: false };
  return score < KGR_FULL_RANGE_LIMIT
    ? { range: "full_kgr", favorable: true }
    : { range: "other", favorable: false };
}

/**
 * Tom técnico do score. `success` significa somente "score na faixa plenamente
 * KGR"; nunca keyword aprovada, KGR aplicável ou revisão concluída.
 */
export function kgrTechnicalTone(score: unknown, volume?: unknown): KgrTechnicalTone {
  // O volume permanece na assinatura pelos consumidores existentes, mas a cor
  // do score não depende dele.
  void volume;
  const visual = deriveKgrVisualState(score);
  if (visual.range === "unavailable") return "neutral";
  if (visual.favorable) return "success";
  return (score as number) <= 1 ? "warning" : "danger";
}

export function classifyKgrMeasurement(input: {
  kgrScore: unknown;
  volume: unknown;
  results: unknown;
}): KgrMeasurement {
  const metricValues = [input.volume, input.results];
  const values = [input.kgrScore, ...metricValues];
  if (values.some(value => value !== null && value !== undefined && !finiteNonNegative(value))) return "invalid";
  const metricCount = metricValues.filter(finiteNonNegative).length;
  if (metricCount === 2) return "complete";
  if (metricCount === 1) return "partial";
  return "without_data";
}

export function kgrMeasurementLabel(measurement: KgrMeasurement): string {
  return ({ without_data: "Sem medição", partial: "Parcial", complete: "Completa", invalid: "Inválida" } as const)[measurement];
}

export function kgrApplicabilityLabel(applicability: KgrApplicability): string {
  return ({ pending: "Pendente", applicable: "Aplicável", not_applicable: "Não aplicável" } as const)[applicability];
}

function parseHistory(value: unknown): KgrDecisionHistoryEntry[] {
  if (Array.isArray(value)) return value.filter(entry => entry && typeof entry === "object") as KgrDecisionHistoryEntry[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === "object") as KgrDecisionHistoryEntry[] : [];
  } catch {
    return [];
  }
}

export function setKgrApplicability(
  semantic: KgrSemantic | null | undefined,
  applicability: KgrApplicability,
  context: { actorId: string; decidedAt: string; justification?: string },
): KgrSemantic {
  const current = { ...(semantic ?? {}) };
  const previous = readKgrApplicability(current);
  const history = parseHistory(current.kgr_decisao_historico);
  const changed = previous !== applicability;
  if (changed && previous !== "pending") {
    history.push({
      applicability: previous,
      decision: kgrDecisionLabel(previous),
      changedAt: context.decidedAt,
      actorId: context.actorId,
      ...(typeof current.kgr_justificativa === "string" ? { justification: current.kgr_justificativa } : {}),
    });
  }

  const currentVersion = Number.isFinite(Number(current.kgr_decisao_versao)) ? Number(current.kgr_decisao_versao) : 0;
  return {
    ...current,
    kgr_aplicabilidade: applicability,
    kgr_decisao: kgrDecisionLabel(applicability),
    kgr_decisao_origem: "human",
    kgr_decidido_por: context.actorId,
    kgr_decidido_em: context.decidedAt,
    kgr_decisao_versao: changed ? currentVersion + 1 : currentVersion,
    kgr_decisao_historico: JSON.stringify(history),
    ...(context.justification !== undefined ? { kgr_justificativa: context.justification } : {}),
  };
}

const applicabilityRank: Record<KgrApplicability, number> = { applicable: 0, pending: 1, not_applicable: 2 };
const measurementRank: Record<KgrMeasurement, number> = { complete: 0, partial: 1, without_data: 2, invalid: 3 };

export function compareKgrRows(a: KgrRowForSort, b: KgrRowForSort, direction: "asc" | "desc" = "asc"): number {
  const aApplicability = readKgrApplicability(a.analise_semantica);
  const bApplicability = readKgrApplicability(b.analise_semantica);
  const aMeasurement = a.currentKgrReady === false ? "without_data" : classifyKgrMeasurement({ kgrScore: a.kgr_score, volume: a.volume_search, results: a.results_allintitle });
  const bMeasurement = b.currentKgrReady === false ? "without_data" : classifyKgrMeasurement({ kgrScore: b.kgr_score, volume: b.volume_search, results: b.results_allintitle });
  const group = (applicabilityRank[aApplicability] * 3) + measurementRank[aMeasurement];
  const otherGroup = (applicabilityRank[bApplicability] * 3) + measurementRank[bMeasurement];
  if (group !== otherGroup) return direction === "asc" ? group - otherGroup : otherGroup - group;
  const aScore = a.currentKgrReady === false ? Number.POSITIVE_INFINITY : finiteNonNegative(a.kgr_score) ? a.kgr_score : Number.POSITIVE_INFINITY;
  const bScore = b.currentKgrReady === false ? Number.POSITIVE_INFINITY : finiteNonNegative(b.kgr_score) ? b.kgr_score : Number.POSITIVE_INFINITY;
  if (aScore !== bScore) return direction === "asc" ? aScore - bScore : bScore - aScore;
  return 0;
}
