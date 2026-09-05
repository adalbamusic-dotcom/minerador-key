import { serpEvidenceRationale, type SerpEvidenceStrength, type SerpSemanticEvidence } from "./serp-semantic-evidence.ts";

export type SemanticConsolidationAxis = "intent" | "funnel";
/**
 * Força da evidência no eixo. `null` significa SERP ainda não coletada — nunca
 * confundir com uma coleta real que não concluiu (`weak`/`mixed`/`insufficient`).
 * O vocabulário é o mesmo do read-model da evidência: fonte única.
 */
export type SemanticSerpStrength = SerpEvidenceStrength | null;

export type SemanticConsolidationAxisDraft = {
  logic: string | null;
  ai: string | null;
  serp: string | null;
  serpStrength: SemanticSerpStrength;
  /** Cobertura, dominância e reforços — o porquê da força observada. */
  rationale?: string | null;
};

export type SemanticSerpSnapshotPreview = {
  id: string;
  label: string;
  source: "local_fixture" | "dataforseo_organic";
};

export type SemanticConsolidationDraft = {
  keywordId: string;
  brandId: string | null;
  intent: SemanticConsolidationAxisDraft;
  funnel: SemanticConsolidationAxisDraft;
  serpSnapshotRef: SemanticSerpSnapshotPreview | null;
  /** true enquanto a working copy não tem evidência externa coletada. */
  localOnly: boolean;
};

/**
 * Autoridade semântica: a Lógica é hipótese determinística inicial e a SERP
 * real é evidência externa observada. Evidência conclusiva fecha o eixo
 * automaticamente — não existe confirmação humana, aceitação da IA nem
 * fallback para a Lógica. Evidência não conclusiva simplesmente não consolida.
 */
export type SemanticAxisResolution = {
  value: string | null;
  status: "awaiting_serp" | "serp_inconclusive" | "serp_consolidated";
  /** Motivo curto quando o eixo não consolida. */
  reason: string | null;
};

type AxisInput = Pick<SemanticConsolidationAxisDraft, "logic" | "ai">;

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function blankAxis(input: AxisInput): SemanticConsolidationAxisDraft {
  return { logic: clean(input.logic), ai: clean(input.ai), serp: null, serpStrength: null };
}

export function createSemanticConsolidationDraft(input: { keywordId: string; brandId?: string | null; intent: AxisInput; funnel: AxisInput }): SemanticConsolidationDraft {
  return { keywordId: input.keywordId, brandId: input.brandId || null, intent: blankAxis(input.intent), funnel: blankAxis(input.funnel), serpSnapshotRef: null, localOnly: true };
}

const INCONCLUSIVE_REASON: Record<Exclude<SerpEvidenceStrength, "conclusive">, string> = {
  mixed: "SERP mista: os resultados observados mostram necessidades diferentes.",
  weak: "SERP fraca: há sinal, mas ele não fecha o eixo.",
  insufficient: "SERP insuficiente: resultados observados de menos para concluir.",
};

/**
 * Evidência conclusiva fecha o eixo. Qualquer outra leitura mantém o eixo não
 * consolidado: a Lógica não vira canônica por fallback, a IA não decide e o
 * humano não inventa o valor.
 */
export function resolveSemanticAxis(axis: SemanticConsolidationAxisDraft): SemanticAxisResolution {
  if (!axis.serpStrength) return { value: null, status: "awaiting_serp", reason: "SERP ainda não coletada para esta keyword." };
  if (axis.serpStrength === "conclusive" && clean(axis.serp)) {
    return { value: clean(axis.serp), status: "serp_consolidated", reason: null };
  }
  // Coleta real sem conclusão continua sendo coleta: nunca vira "não coletada".
  return { value: null, status: "serp_inconclusive", reason: INCONCLUSIVE_REASON[axis.serpStrength === "conclusive" ? "insufficient" : axis.serpStrength] };
}

/** Patch da leitura observada. Não existe patch de decisão humana. */
export function updateSemanticConsolidationAxis(draft: SemanticConsolidationDraft, axisName: SemanticConsolidationAxis, patch: Partial<Pick<SemanticConsolidationAxisDraft, "serp" | "serpStrength">>): SemanticConsolidationDraft {
  return { ...draft, [axisName]: { ...draft[axisName], ...patch } };
}

/**
 * Aplica a evidência real da SERP natural coletada pelo processo Resultados.
 * Somente evidência conclusiva fecha valor: mista, fraca ou insuficiente entram
 * como leitura observada sem consolidar Intenção ou Funil.
 */
export function applySerpSemanticEvidence(draft: SemanticConsolidationDraft, evidence: SerpSemanticEvidence): SemanticConsolidationDraft {
  const axis = (current: SemanticConsolidationAxisDraft, signal: SerpSemanticEvidence["intent"]): SemanticConsolidationAxisDraft => ({
    ...current,
    serp: signal.value,
    // A força vem do read-model da evidência, sem tradução paralela.
    serpStrength: signal.strength,
    rationale: serpEvidenceRationale(signal),
  });
  return {
    ...draft,
    intent: axis(draft.intent, evidence.intent),
    funnel: axis(draft.funnel, evidence.funnel),
    serpSnapshotRef: {
      id: evidence.providerRequestId || evidence.operationRequestId,
      label: `SERP DataForSEO · ${evidence.observedResults} resultado(s) observados`,
      source: "dataforseo_organic",
    },
    localOnly: false,
  };
}

/** Working copy consolidada quando pelo menos um eixo fechou pela SERP. */
export function semanticConsolidationBySerp(draft: SemanticConsolidationDraft): boolean {
  return resolveSemanticAxis(draft.intent).status === "serp_consolidated"
    || resolveSemanticAxis(draft.funnel).status === "serp_consolidated";
}
