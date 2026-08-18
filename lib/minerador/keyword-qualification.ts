export const FUNNEL_VALUES = ["TOFU", "MOFU", "BOFU"] as const;
export type FunnelValue = (typeof FUNNEL_VALUES)[number];

type SemanticRecord = Record<string, unknown>;

export type FunnelQualification = {
  proposed: FunnelValue;
  hints: FunnelValue[];
  conflict: boolean;
  humanConfirmed: boolean;
  source: "human" | "qualificacao_logica" | "qualificacao_logica_com_hint";
  confidence: number;
  evidence: string[];
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const asRecord = (value: unknown): SemanticRecord | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value as SemanticRecord : null
);

const validFunnel = (value: unknown): FunnelValue | null => {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase() as FunnelValue;
  return FUNNEL_VALUES.includes(normalized) ? normalized : null;
};

const valuesFrom = (value: unknown): FunnelValue[] => {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(validFunnel).filter((item): item is FunnelValue => Boolean(item)))];
};

export function extensionFunnelHints(semantic: SemanticRecord | null | undefined): FunnelValue[] {
  const extensionImport = asRecord(semantic?.extension_import);
  const raw = extensionImport?.funnelHints ?? semantic?.funnelHints ?? semantic?.funnelHint;
  return valuesFrom(raw);
}

function humanConfirmedFunnel(semantic: SemanticRecord | null | undefined): FunnelValue | null {
  const current = validFunnel(semantic?.funnel);
  const confirmed = semantic?.funnel_human_confirmed === true
    || semantic?.funnel_human_confirmed === "true"
    || semantic?.funnelHumanConfirmed === true
    || semantic?.funnelHumanConfirmed === "true"
    || ["human", "manual", "humana"].includes(String(
      semantic?.funnel_source
      || semantic?.funnelSource
      || semantic?.funnel_decision_origin
      || semantic?.funnelDecisionOrigin
      || semantic?.funnel_decision
      || "",
    ).toLowerCase());
  return confirmed ? current : null;
}

function containsAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term));
}

export function classifyKeywordFunnel(input: {
  keyword: string;
  intent?: string | null;
  niche?: string | null;
  location?: string | null;
  semantic?: SemanticRecord | null;
}): FunnelQualification {
  const semantic = input.semantic || {};
  const human = humanConfirmedFunnel(semantic);
  const hints = extensionFunnelHints(semantic);
  if (human) {
    return {
      proposed: human,
      hints,
      conflict: false,
      humanConfirmed: true,
      source: "human",
      confidence: Number(semantic.funnel_confidence || 1),
      evidence: ["decisão humana de Funil preservada"],
    };
  }

  const text = normalize(input.keyword);
  const intent = normalize(input.intent || "");
  const journey = normalize(String(semantic.etapa_jornada || ""));
  const commercialPotential = normalize(String(semantic.potencial_comercial || ""));
  const evidence: string[] = [];
  let proposed: FunnelValue;

  if (intent.includes("venda") || intent.includes("transac") || intent.includes("local") || containsAny(text, ["comprar", "contratar", "preco", "orcamento", "agendar", "consulta", "perto de mim"])) {
    proposed = "BOFU";
    evidence.push("ação, contratação ou proximidade local");
  } else if (intent.includes("comercial") || containsAny(text, ["melhor", "comparar", "comparacao", "versus", "review", "avaliacao", "ranking", "vale a pena"])) {
    proposed = "MOFU";
    evidence.push("comparação ou avaliação de alternativas");
  } else if (journey.includes("decisao") || commercialPotential === "high") {
    proposed = "BOFU";
    evidence.push("KeywordDNA indica proximidade de decisão");
  } else if (journey.includes("consideracao") || commercialPotential === "medium") {
    proposed = "MOFU";
    evidence.push("KeywordDNA indica consideração");
  } else {
    proposed = "TOFU";
    evidence.push("aprendizado, descoberta ou ausência de ação comercial inequívoca");
  }

  if (input.niche?.trim()) evidence.push("nicho de mercado disponível");
  if (input.location?.trim()) evidence.push("localidade disponível");
  if (hints.length > 0) evidence.push(`hint da Extensão: ${hints.join(" / ")}`);

  const conflict = hints.length > 0 && !hints.includes(proposed);
  const confidence = Math.min(0.94, Number((0.58 + Math.min(evidence.length, 4) * 0.08 + (hints.length > 0 && !conflict ? 0.08 : 0)).toFixed(2)));

  return {
    proposed,
    hints,
    conflict,
    humanConfirmed: false,
    source: hints.length > 0 ? "qualificacao_logica_com_hint" : "qualificacao_logica",
    confidence,
    evidence,
  };
}

export function applyFunnelQualification(
  semantic: SemanticRecord | null | undefined,
  qualification: FunnelQualification,
): SemanticRecord {
  const current = { ...(semantic || {}) };
  if (qualification.humanConfirmed) return current;
  return {
    ...current,
    funnel: qualification.proposed,
    funnel_source: qualification.source,
    funnel_confidence: String(qualification.confidence),
    funnel_review_required: qualification.conflict ? "sim" : "não",
    funnel_evidence: qualification.evidence.join("; "),
  };
}
