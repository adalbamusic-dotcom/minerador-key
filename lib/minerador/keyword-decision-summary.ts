export type DecisionSummaryMetricKey = "volume" | "cpc" | "allintitle" | "kgr" | "keywordDifficulty" | "intent" | "trend" | "adsCompetition" | "competitionIndex" | "externalIntent" | "referringDomains" | "backlinks" | "niche" | "funnel";
export type DecisionSummaryStateKey = "ai" | "dna" | "kgrApplicability" | "divergences";
export type DecisionSummaryGroupKey = "demand" | "seoCompetition" | "semantic";

export type KeywordDecisionSummaryMetric = {
  key: DecisionSummaryMetricKey;
  label: string;
  value: string;
};

export type KeywordDecisionSummaryState = {
  key: DecisionSummaryStateKey;
  label: string;
  value: string;
};

export type KeywordDecisionSummaryGroup = {
  key: DecisionSummaryGroupKey;
  label: string;
  metrics: KeywordDecisionSummaryMetric[];
};

export type KeywordDecisionSummary = {
  metrics: KeywordDecisionSummaryMetric[];
  states: KeywordDecisionSummaryState[];
  groups?: KeywordDecisionSummaryGroup[];
};

function finiteNonNegative(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dnaMaturityDisplayLabel(value: unknown): string | null {
  const normalized = nonEmptyString(value);
  if (!normalized) return null;
  return ({
    INSUFICIENTE: "Insuficiente",
    PARCIAL: "Parcial",
    "COMPLETA PARA REVISÃO": "Completa para revisão",
    CONFIRMADA: "Confirmada",
  } as Record<string, string>)[normalized.toLocaleUpperCase("pt-BR")] || normalized;
}

function formatInteger(value: unknown): string | null {
  const numeric = finiteNonNegative(value);
  return numeric === null ? null : numeric.toLocaleString("pt-BR");
}

function formatKgr(value: unknown): string | null {
  const numeric = finiteNonNegative(value);
  return numeric === null
    ? null
    : numeric.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function formatDecimal(value: unknown): string | null {
  const numeric = finiteNonNegative(value);
  return numeric === null
    ? null
    : numeric.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Read-only decision cockpit projection. It deliberately accepts already
 * resolved evidence and never derives a workflow decision from metrics.
 */
export function buildKeywordDecisionSummary(input: {
  volume?: unknown;
  cpc?: unknown;
  allintitle?: unknown;
  kgr?: unknown;
  keywordDifficulty?: unknown;
  intent?: unknown;
  trend?: unknown;
  adsCompetition?: unknown;
  competitionIndex?: unknown;
  externalIntent?: unknown;
  referringDomains?: unknown;
  backlinks?: unknown;
  niche?: unknown;
  funnel?: unknown;
  aiExecuted: boolean;
  aiVerdict?: unknown;
  dnaMaturity?: unknown;
  kgrApplicability?: unknown;
  divergenceCount?: unknown;
  includeSections?: boolean;
}): KeywordDecisionSummary {
  const metrics: KeywordDecisionSummaryMetric[] = [];
  const addMetric = (key: DecisionSummaryMetricKey, label: string, value: string | null) => {
    if (value) metrics.push({ key, label, value });
  };

  addMetric("volume", "Volume", formatInteger(input.volume));
  addMetric("cpc", "CPC", nonEmptyString(input.cpc));
  addMetric("allintitle", "Resultado", formatInteger(input.allintitle));
  addMetric("kgr", "KGR", formatKgr(input.kgr));
  addMetric("keywordDifficulty", "KD", formatInteger(input.keywordDifficulty));
  addMetric("intent", "Intenção", nonEmptyString(input.intent));
  addMetric("trend", "Tendência", nonEmptyString(input.trend));
  addMetric("adsCompetition", "Concorrência Ads", nonEmptyString(input.adsCompetition));
  addMetric("competitionIndex", "Índice Ads", formatInteger(input.competitionIndex));
  addMetric("externalIntent", "Sinal DataForSEO Labs", nonEmptyString(input.externalIntent));
  addMetric("referringDomains", "Ref. Domains", formatDecimal(input.referringDomains));
  addMetric("backlinks", "Backlinks", formatDecimal(input.backlinks));
  addMetric("niche", "Nicho", nonEmptyString(input.niche));
  addMetric("funnel", "Funil", nonEmptyString(input.funnel));

  const states: KeywordDecisionSummaryState[] = [
    {
      key: "ai",
      label: "IA",
      // A IA é uma camada opcional: sem execução ela é "Opcional", nunca uma pendência obrigatória.
      value: nonEmptyString(input.aiVerdict) || (input.aiExecuted ? "Executada" : "Opcional"),
    },
    {
      key: "dna",
      label: "DNA",
      value: dnaMaturityDisplayLabel(input.dnaMaturity) || "Pendente",
    },
    {
      key: "kgrApplicability",
      label: "KGR",
      value: nonEmptyString(input.kgrApplicability) || "Pendente",
    },
  ];

  if (input.divergenceCount !== undefined) {
    const count = finiteNonNegative(input.divergenceCount);
    states.splice(2, 0, {
      key: "divergences",
      label: "Divergências",
      value: count === null ? "Pendente" : formatInteger(count) || "0",
    });
  }

  const summary: KeywordDecisionSummary = { metrics, states };
  if (input.includeSections) {
    const grouped: Array<[DecisionSummaryGroupKey, string, DecisionSummaryMetricKey[]]> = [
      ["demand", "DEMANDA", ["volume", "cpc", "trend", "adsCompetition", "competitionIndex"]],
      ["seoCompetition", "COMPETIÇÃO SEO", ["allintitle", "keywordDifficulty", "kgr", "referringDomains", "backlinks"]],
      ["semantic", "SEMÂNTICA", ["intent", "externalIntent", "niche", "funnel"]],
    ];
    const groups = grouped
      .map(([key, label, keys]) => ({
        key,
        label,
        metrics: keys
          .map(metricKey => metrics.find(metric => metric.key === metricKey))
          .filter((metric): metric is KeywordDecisionSummaryMetric => Boolean(metric)),
      }))
      .filter(group => group.metrics.length > 0);
    if (groups.length > 0) summary.groups = groups;
  }

  return summary;
}
