import { canonicalJson, contentHash } from "../arquiteto/versioning.ts";
import { SERP_DERIVATION_VERSION, type SerpEvidenceStrength, type SerpSemanticEvidence, type SerpSemanticSignal } from "./serp-semantic-evidence.ts";
import { createSemanticConsolidationDraft, type SemanticConsolidationDraft } from "./semantic-consolidation-draft.ts";

/**
 * Qualificação Semântica persistida da keyword.
 *
 * Artifact keyword-scoped gravado em `editorial_artifact_versions` com
 * `artifact_type = keyword_semantic_qualification` e `entity_id = keywordId`.
 * É o único contrato canônico da SERP do Minerador: a working copy da sessão
 * existe apenas enquanto uma execução acontece.
 *
 * Não contém `main_intent` do DataForSEO Labs, não é `ai_review` R5 e não é o
 * `SerpResearchSnapshot` article-scoped do Arquiteto/Radar.
 */

export const KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE = "keyword_semantic_qualification";
/** Versão do classificador que derivou intenção e funil da SERP observada. */
export const SEMANTIC_DERIVATION_VERSION = SERP_DERIVATION_VERSION;
/** Versão dos thresholds provisórios (0.6 / 0.4 / 5) usados na derivação. */
export const SEMANTIC_THRESHOLDS_VERSION = "provisional-heuristic-2026-08-28";

export type KeywordSemanticQualificationAxis = {
  observedValue: string | null;
  strength: SerpEvidenceStrength;
  supporting: number;
  observed: number;
  /** Explicabilidade: o quanto foi interpretado e o quanto o topo domina. */
  classified: number;
  coverage: number;
  dominance: number;
  distribution: Array<{ label: string; count: number }>;
  structuralSignals: Array<{ signal: string; label: string; weight: number }>;
};

export type KeywordSemanticQualification = {
  schemaVersion: "v1";
  id: string;
  brandId: string;
  keywordId: string;
  source: {
    provider: "dataforseo";
    operationRequestId: string;
    providerRequestId: string | null;
    collectedAt: string;
  };
  query: {
    keyword: string;
    locationCode: number;
    languageCode: string;
    device: "desktop" | "mobile";
  };
  evidence: {
    observedResults: number;
    serpFeatures: Array<{ type: string; count: number }>;
    sample: Array<{ position: number; domain: string; intent: string; funnel: string; signals?: string[] }>;
    evidenceHash: string;
  };
  intent: KeywordSemanticQualificationAxis;
  funnel: KeywordSemanticQualificationAxis;
  derivation: {
    derivationVersion: string;
    thresholdsVersion: string;
    thresholdsStatus: "provisional_heuristic";
  };
  lifecycle: {
    version: number;
    contentHash: string;
    createdAt: string;
    createdBy: string;
    supersedesVersionId: string | null;
  };
};

function axisFrom(signal: SerpSemanticSignal): KeywordSemanticQualificationAxis {
  return {
    observedValue: signal.value,
    strength: signal.strength,
    supporting: signal.supporting,
    observed: signal.observed,
    classified: signal.classified,
    coverage: signal.coverage,
    dominance: signal.dominance,
    distribution: signal.distribution.map(item => ({ label: item.label, count: item.count })),
    structuralSignals: signal.structuralSignals.map(item => ({ signal: item.signal, label: item.label, weight: item.weight })),
  };
}

export function keywordSemanticQualificationVersionId(brandId: string, keywordId: string, version: number): string {
  return `${KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE}:${brandId}:${keywordId}:v${version}`;
}

/**
 * Monta a próxima versão do artifact. Evidência conclusiva **e** não conclusiva
 * são persistidas: coleta real sem consolidação continua sendo evidência.
 */
export async function buildKeywordSemanticQualification(input: {
  brandId: string;
  keywordId: string;
  evidence: SerpSemanticEvidence;
  createdBy: string;
  previous?: KeywordSemanticQualification | null;
}): Promise<KeywordSemanticQualification> {
  const version = (input.previous?.lifecycle.version || 0) + 1;
  const evidenceHash = await contentHash({
    query: input.evidence.query,
    observedResults: input.evidence.observedResults,
    sample: input.evidence.sample,
    intent: input.evidence.intent,
    funnel: input.evidence.funnel,
  });
  const draft: Omit<KeywordSemanticQualification, "lifecycle"> & { lifecycle: Omit<KeywordSemanticQualification["lifecycle"], "contentHash"> } = {
    schemaVersion: "v1",
    id: keywordSemanticQualificationVersionId(input.brandId, input.keywordId, version),
    brandId: input.brandId,
    keywordId: input.keywordId,
    source: {
      provider: "dataforseo",
      operationRequestId: input.evidence.operationRequestId,
      providerRequestId: input.evidence.providerRequestId,
      collectedAt: input.evidence.collectedAt,
    },
    query: {
      keyword: input.evidence.query,
      locationCode: input.evidence.locationCode,
      languageCode: input.evidence.languageCode,
      device: input.evidence.device,
    },
    evidence: {
      observedResults: input.evidence.observedResults,
      serpFeatures: input.evidence.serpFeatures,
      sample: input.evidence.sample,
      evidenceHash,
    },
    intent: axisFrom(input.evidence.intent),
    funnel: axisFrom(input.evidence.funnel),
    derivation: {
      derivationVersion: SEMANTIC_DERIVATION_VERSION,
      thresholdsVersion: SEMANTIC_THRESHOLDS_VERSION,
      thresholdsStatus: "provisional_heuristic",
    },
    lifecycle: {
      version,
      createdAt: input.evidence.collectedAt,
      createdBy: input.createdBy,
      supersedesVersionId: input.previous?.id || null,
    },
  };
  return { ...draft, lifecycle: { ...draft.lifecycle, contentHash: await contentHash(draft) } };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strength(value: unknown): SerpEvidenceStrength | null {
  return value === "conclusive" || value === "mixed" || value === "weak" || value === "insufficient" ? value : null;
}

function parseAxis(value: unknown): KeywordSemanticQualificationAxis | null {
  const item = asRecord(value);
  const parsedStrength = strength(item?.strength);
  if (!item || !parsedStrength) return null;
  const numberOr = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    observedValue: text(item.observedValue) || null,
    strength: parsedStrength,
    supporting: numberOr(item.supporting, 0),
    observed: numberOr(item.observed, 0),
    classified: numberOr(item.classified, 0),
    coverage: numberOr(item.coverage, 0),
    dominance: numberOr(item.dominance, 0),
    distribution: Array.isArray(item.distribution)
      ? item.distribution.map(asRecord).filter(Boolean).map(entry => ({ label: text(entry!.label), count: numberOr(entry!.count, 0) }))
      : [],
    structuralSignals: Array.isArray(item.structuralSignals)
      ? item.structuralSignals.map(asRecord).filter(Boolean).map(entry => ({ signal: text(entry!.signal), label: text(entry!.label), weight: numberOr(entry!.weight, 0) }))
      : [],
  };
}

/** Leitura defensiva do payload persistido: nunca confia na forma gravada. */
export function parseKeywordSemanticQualification(value: unknown): KeywordSemanticQualification | null {
  const item = asRecord(value);
  if (!item || item.schemaVersion !== "v1") return null;
  const source = asRecord(item.source);
  const query = asRecord(item.query);
  const evidence = asRecord(item.evidence);
  const lifecycle = asRecord(item.lifecycle);
  const intent = parseAxis(item.intent);
  const funnel = parseAxis(item.funnel);
  const derivation = asRecord(item.derivation);
  if (!source || !query || !evidence || !lifecycle || !intent || !funnel || !derivation) return null;
  if (!text(item.brandId) || !text(item.keywordId) || !text(query.keyword)) return null;
  if (text(source.provider) !== "dataforseo" || !text(source.collectedAt)) return null;
  return {
    schemaVersion: "v1",
    id: text(item.id),
    brandId: text(item.brandId),
    keywordId: text(item.keywordId),
    source: {
      provider: "dataforseo",
      operationRequestId: text(source.operationRequestId),
      providerRequestId: text(source.providerRequestId) || null,
      collectedAt: text(source.collectedAt),
    },
    query: {
      keyword: text(query.keyword),
      locationCode: typeof query.locationCode === "number" ? query.locationCode : 0,
      languageCode: text(query.languageCode),
      device: query.device === "mobile" ? "mobile" : "desktop",
    },
    evidence: {
      observedResults: typeof evidence.observedResults === "number" ? evidence.observedResults : 0,
      serpFeatures: Array.isArray(evidence.serpFeatures)
        ? evidence.serpFeatures.map(asRecord).filter(Boolean).map(entry => ({ type: text(entry!.type), count: typeof entry!.count === "number" ? entry!.count : 0 }))
        : [],
      sample: Array.isArray(evidence.sample)
        ? evidence.sample.map(asRecord).filter(Boolean).map(entry => ({
          position: typeof entry!.position === "number" ? entry!.position : 0,
          domain: text(entry!.domain),
          intent: text(entry!.intent) || "indefinido",
          funnel: text(entry!.funnel) || "indefinido",
          signals: Array.isArray(entry!.signals) ? entry!.signals.filter((value): value is string => typeof value === "string") : [],
        }))
        : [],
      evidenceHash: text(evidence.evidenceHash),
    },
    intent,
    funnel,
    derivation: {
      derivationVersion: text(derivation.derivationVersion) || SEMANTIC_DERIVATION_VERSION,
      thresholdsVersion: text(derivation.thresholdsVersion) || SEMANTIC_THRESHOLDS_VERSION,
      thresholdsStatus: "provisional_heuristic",
    },
    lifecycle: {
      version: typeof lifecycle.version === "number" && lifecycle.version > 0 ? lifecycle.version : 1,
      contentHash: text(lifecycle.contentHash),
      createdAt: text(lifecycle.createdAt) || text(source.collectedAt),
      createdBy: text(lifecycle.createdBy),
      supersedesVersionId: text(lifecycle.supersedesVersionId) || null,
    },
  };
}

/** Explicabilidade do eixo persistido, no mesmo formato do read-model vivo. */
function axisRationale(axis: KeywordSemanticQualificationAxis): string {
  const percent = (value: number) => Math.round(value * 100);
  const coverage = `${percent(axis.coverage)}% de cobertura (${axis.classified}/${axis.observed})`;
  const dominance = axis.classified > 0 ? `${percent(axis.dominance)}% de dominância` : "sem leitura dominante";
  const structural = axis.structuralSignals.filter(item => item.weight > 0).map(item => item.label);
  const reinforcement = structural.length ? ` · reforço: ${structural.join(", ")}` : "";
  return `${coverage} · ${dominance}${reinforcement}`;
}

/** Reidrata o read-model visual a partir do artifact persistido. */
export function semanticDraftFromQualification(qualification: KeywordSemanticQualification, logic?: { intent?: string | null; funnel?: string | null }): SemanticConsolidationDraft {
  const base = createSemanticConsolidationDraft({
    keywordId: qualification.keywordId,
    brandId: qualification.brandId,
    intent: { logic: logic?.intent ?? null, ai: null },
    funnel: { logic: logic?.funnel ?? null, ai: null },
  });
  return {
    ...base,
    intent: { ...base.intent, serp: qualification.intent.observedValue, serpStrength: qualification.intent.strength, rationale: axisRationale(qualification.intent) },
    funnel: { ...base.funnel, serp: qualification.funnel.observedValue, serpStrength: qualification.funnel.strength, rationale: axisRationale(qualification.funnel) },
    serpSnapshotRef: {
      id: qualification.source.providerRequestId || qualification.source.operationRequestId,
      label: `SERP DataForSEO · ${qualification.evidence.observedResults} resultado(s) observados`,
      source: "dataforseo_organic",
    },
    localOnly: false,
  };
}

/** Eixos consolidados: somente evidência conclusiva fecha valor canônico. */
export function qualificationConsolidatedAxes(qualification: KeywordSemanticQualification | null | undefined): { intent: string | null; funnel: string | null } {
  return {
    intent: qualification?.intent.strength === "conclusive" ? qualification.intent.observedValue : null,
    funnel: qualification?.funnel.strength === "conclusive" ? qualification.funnel.observedValue : null,
  };
}

export function isFullyConsolidatedQualification(qualification: KeywordSemanticQualification | null | undefined): boolean {
  const axes = qualificationConsolidatedAxes(qualification);
  return Boolean(axes.intent && axes.funnel);
}

/** Rótulo de proveniência para a UI: versão persistida, nunca "prévia local". */
export function qualificationVersionLabel(qualification: KeywordSemanticQualification): string {
  return `Qualificação persistida · v${qualification.lifecycle.version}`;
}

export function keywordSemanticQualificationCanonicalJson(qualification: KeywordSemanticQualification): string {
  return canonicalJson(qualification);
}
