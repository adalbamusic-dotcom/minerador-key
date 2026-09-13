import { autoDetectNiche } from "../arquiteto/keyword-dna-engine.ts";

export const FUNNEL_VALUES = ["TOFU", "MOFU", "BOFU"] as const;
export type FunnelValue = (typeof FUNNEL_VALUES)[number];
export type FunnelResolution = "value" | "explicit_unknown";

type SemanticRecord = Record<string, unknown>;

export type FunnelQualification = {
  proposed: FunnelValue | null;
  resolution: FunnelResolution;
  hints: FunnelValue[];
  conflict: boolean;
  humanConfirmed: boolean;
  determinable: boolean;
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

const BOFU_SIGNALS = [
  "preco", "valor", "orcamento", "comprar", "contratar", "agendar", "fornecedor",
  "servico", "perto de mim", "contato", "telefone", "disponivel", "disponibilidade",
  "onde encontrar", "loja", "reservar", "pedido",
];

const MOFU_SIGNALS = [
  "melhor", "comparar", "comparacao", "versus", " vs ", "review", "avaliacao",
  "ranking", "vale a pena", "qual escolher", "diferenca", "alternativa", "beneficio",
];

const TOFU_SIGNALS = ["como", "o que", "porque", "por que", "funciona", "significado", "guia", "tutorial"];

/**
 * A small recognition vocabulary keeps an ambiguous, but meaningful, query
 * from falling into the unresolved bucket. It is only a funnel signal; it
 * does not invent a niche or replace the logical DNA engine.
 */
const RECOGNIZED_ENTITY_TERMS = [
  "acrilico", "academia", "advogado", "cabelo", "clinica", "condominio", "dentista",
  "dieta", "energia", "estetica", "gel", "manicure", "marketing", "pedicure", "portaria",
  "remota", "seo", "seguro", "software", "unha", "unhas",
];

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

function hasMeaningfulNiche(value: unknown): boolean {
  const normalized = normalize(String(value || ""));
  return Boolean(normalized && normalized !== "geral" && normalized !== "nao informado");
}

function hasRecognizableBroadQuery(input: {
  keyword: string;
  niche?: string | null;
  semantic: SemanticRecord;
}): boolean {
  const text = normalize(input.keyword);
  const detectedNiche = autoDetectNiche(input.keyword);
  const entity = normalize(String(input.semantic.entidade_central || ""));
  const modifiers = normalize(String(input.semantic.modificadores || ""));
  const hasStructuredEntity = Boolean(
    entity
      && entity !== text
      && modifiers
      && !["nenhum modificador explicito", "nenhum modificador explícito"].includes(modifiers),
  );

  return hasMeaningfulNiche(input.niche)
    || detectedNiche !== "Geral"
    || containsAny(text, RECOGNIZED_ENTITY_TERMS)
    || containsAny(entity, RECOGNIZED_ENTITY_TERMS)
    || hasStructuredEntity;
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
      resolution: "value",
      hints,
      conflict: false,
      humanConfirmed: true,
      determinable: true,
      source: "human",
      confidence: Number(semantic.funnel_confidence || 1),
      evidence: ["decisão humana de Funil preservada"],
    };
  }

  const text = normalize(input.keyword);
  const intent = normalize(input.intent || "");
  const journey = normalize(String(semantic.etapa_jornada || ""));
  const commercialPotential = normalize(String(semantic.potencial_comercial || ""));
  const explicitBofuIntent = ["venda", "transac", "local", "naveg"].some(signal => intent.includes(signal));
  const explicitMofuIntent = intent.includes("comercial");
  const explicitTofuIntent = intent.includes("inform");
  const explicitTextBofu = containsAny(text, BOFU_SIGNALS);
  const explicitTextMofu = containsAny(text, MOFU_SIGNALS);
  const explicitTextTofu = containsAny(text, TOFU_SIGNALS);
  const recognizedBroadQuery = hasRecognizableBroadQuery({
  keyword: input.keyword,
  niche: input.niche,
  semantic,
  });
  const evidence: string[] = [];
  let proposed: FunnelValue | null = null;
  let resolution: FunnelResolution = "explicit_unknown";

  if (explicitBofuIntent || explicitTextBofu) {
    proposed = "BOFU";
    resolution = "value";
    evidence.push("ação, contratação ou proximidade local");
  } else if (explicitMofuIntent || explicitTextMofu) {
    proposed = "MOFU";
    resolution = "value";
    evidence.push("comparação ou avaliação de alternativas");
  } else if (journey.includes("decisao") || commercialPotential === "high") {
    proposed = "BOFU";
    resolution = "value";
    evidence.push("KeywordDNA indica proximidade de decisão");
  } else if (journey.includes("consideracao") || commercialPotential === "medium") {
    proposed = "MOFU";
    resolution = "value";
    evidence.push("KeywordDNA indica consideração");
  } else if (explicitTofuIntent || explicitTextTofu) {
    proposed = "TOFU";
    resolution = "value";
    evidence.push("busca informativa, de descoberta ou aprendizado");
  } else if (recognizedBroadQuery) {
    proposed = "TOFU";
    resolution = "value";
    evidence.push("tema amplo ou categoria reconhecível sem sinal mais forte de consideração ou ação");
  } else if (hints.length > 0) {
    proposed = hints[0];
    resolution = "value";
    evidence.push("hint de etapa da jornada importado da Extensão");
  } else {
    evidence.push("nenhuma entidade ou sinal semântico reconhecível para classificar a jornada");
  }

  if (input.niche?.trim()) evidence.push("nicho de mercado disponível");
  if (input.location?.trim()) evidence.push("localidade disponível");
  if (hints.length > 0) evidence.push(`hint da Extensão: ${hints.join(" / ")}`);

  const conflict = proposed !== null && hints.length > 0 && !hints.includes(proposed);
  const confidence = resolution === "explicit_unknown"
    ? 0.2
    : Math.min(0.94, Number((0.58 + Math.min(evidence.length, 4) * 0.08 + (hints.length > 0 && !conflict ? 0.08 : 0)).toFixed(2)));

  return {
    proposed,
    resolution,
    hints,
    conflict,
    humanConfirmed: false,
    // A completed logical run always resolves the field, including the
    // explicit-unknown outcome. `pending` belongs to the processing state,
    // not to the final semantic classification.
    determinable: true,
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
  if (qualification.resolution === "explicit_unknown" || !qualification.proposed) {
    delete current.funnel;
    delete current.funnel_source;
    delete current.funnel_confidence;
    delete current.funnel_review_required;
    return {
      ...current,
      funnel_review_required: "não",
      funnel_evidence: qualification.evidence.concat("Funil resolvido explicitamente como Não classificável").join("; "),
    };
  }
  return {
    ...current,
    funnel: qualification.proposed,
    funnel_source: qualification.source,
    funnel_confidence: String(qualification.confidence),
    funnel_review_required: qualification.conflict ? "sim" : "não",
    funnel_evidence: qualification.evidence.join("; "),
  };
}
