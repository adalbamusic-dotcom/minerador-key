import { canonicalJson, contentHash } from "../arquiteto/versioning.ts";
import { normalizeSerpCacheKeyword } from "../editorial/serp-cache.ts";
import {
  SERP_DERIVATION_VERSION,
  SERP_LENS_EVIDENCE_VERSION,
  SERP_LENS_MISSING_REASONS,
  type SerpEvidenceStrength,
  type SerpLensAgreement,
  type SerpLensAxisReading,
  type SerpLensDeviceSplit,
  type SerpLensEvidence,
  type SerpLensMissingReason,
  type SerpLensReading,
  type SerpSemanticEvidence,
  type SerpSemanticSignal,
  type SerpTextScore,
} from "./serp-semantic-evidence.ts";
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
    /** A lente canônica. Continua `desktop` também na leitura das quatro lentes. */
    device: "desktop" | "mobile";
    /** 4 lentes · A matriz pedida, na ordem das máscaras da amostra. Ausente = legada de uma lente. */
    lenses?: string[];
  };
  evidence: {
    observedResults: number;
    serpFeatures: Array<{ type: string; count: number }>;
    /**
     * Desde a derivação v4, todos os orgânicos distintos, cada um com `urlKey`,
     * `duplicates` (quando houve) e o `score` que decidiu. Campos aditivos:
     * amostras gravadas até a v3 não os têm e continuam válidas. Nas quatro
     * lentes, cada orgânico leva ainda a máscara `lenses`.
     */
    sample: Array<{ position: number; domain: string; intent: string; funnel: string; signals?: string[]; urlKey?: string; duplicates?: number; score?: SerpTextScore; lenses?: number }>;
    evidenceHash: string;
  };
  intent: KeywordSemanticQualificationAxis;
  funnel: KeywordSemanticQualificationAxis;
  /**
   * 4 lentes (adendo `docs/03-minerador/propostas/adendo-derivacao-v4-quatro-
   * lentes-2026-09-23.md`, §4) · Bloco ADITIVO: leitura por lente, concordância,
   * `deviceSplit`, lentes faltantes e datas. Ausente = Qualificação legada de
   * uma lente, que continua válida.
   */
  lensEvidence?: SerpLensEvidence;
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
  const lensEvidence = input.evidence.lensEvidence;
  const evidenceHash = await contentHash({
    query: input.evidence.query,
    observedResults: input.evidence.observedResults,
    sample: input.evidence.sample,
    intent: input.evidence.intent,
    funnel: input.evidence.funnel,
    // Só quando há: a evidência de uma lente mantém o hash de antes.
    ...(lensEvidence ? { lensEvidence } : {}),
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
      ...(lensEvidence && input.evidence.lenses?.length ? { lenses: [...input.evidence.lenses] } : {}),
    },
    evidence: {
      observedResults: input.evidence.observedResults,
      serpFeatures: input.evidence.serpFeatures,
      sample: input.evidence.sample,
      evidenceHash,
    },
    intent: axisFrom(input.evidence.intent),
    funnel: axisFrom(input.evidence.funnel),
    ...(lensEvidence ? { lensEvidence } : {}),
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

/** O que a Qualificação grava e o produto lê — é aqui que "mudança real" se mede. */
const leituraGravada = (qualification: KeywordSemanticQualification) => canonicalJson({
  observedResults: qualification.evidence.observedResults,
  serpFeatures: qualification.evidence.serpFeatures,
  sample: qualification.evidence.sample,
  intent: qualification.intent,
  funnel: qualification.funnel,
  // Ausente na legada: `canonicalJson` descarta a chave, e a régua de antes não muda.
  // Das lentes faltantes conta o CONJUNTO, não o motivo: `collection_failed` numa
  // execução e `not_collected` na seguinte é a mesma leitura (AGENTS §9).
  lensEvidence: qualification.lensEvidence
    ? { ...qualification.lensEvidence, lensesMissing: qualification.lensEvidence.lensesMissing.map(item => item.lens) }
    : undefined,
});

/** Mesma consulta ao provider: a caixa do texto não muda a SERP nem a chave do cache. */
const mesmaConsulta = (a: KeywordSemanticQualification["query"], b: KeywordSemanticQualification["query"]) =>
  normalizeSerpCacheKeyword(a.keyword) === normalizeSerpCacheKeyword(b.keyword)
  && a.locationCode === b.locationCode
  && a.languageCode.trim().toLowerCase() === b.languageCode.trim().toLowerCase()
  && a.device === b.device
  && canonicalJson(a.lenses ?? []) === canonicalJson(b.lenses ?? []);

/**
 * O CONJUNTO de fontes da leitura: uma por lente — pedido do provider e data
 * da observação. Na legada é só a canônica, que `source` já descreve.
 */
function lensSources(qualification: KeywordSemanticQualification): string {
  return canonicalJson((qualification.lensEvidence?.readings || [])
    .map(reading => [reading.lens, reading.providerRequestId, reading.collectedAt])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
}

/**
 * A próxima versão só repetiria a vigente? Mesma coleta (pedido do provider e
 * data de observação), mesma consulta, mesma derivação e o MESMO conteúdo
 * gravado. É o que acontece quando a SERP vem do cache da marca e a versão
 * vigente já registrou essa coleta: não há mudança real, então não há versão
 * nova (AGENTS §9).
 *
 * Nem o `contentHash` (cobre versão e operação) nem o `evidenceHash` (cobre o
 * texto da consulta com a caixa de quem chamou — keyword e candidata dividem a
 * entrada do cache com caixas diferentes) servem para isso. O conteúdo vai em
 * JSON canônico porque a versão vigente volta do jsonb com as chaves
 * reordenadas.
 *
 * Nas quatro lentes, "mesma coleta" é o mesmo CONJUNTO de fontes por lente:
 * uma lente paga de novo, recém-chegada ou que deixou de estar é mudança real.
 */
export function repeatsCurrentSemanticQualification(current: KeywordSemanticQualification, next: KeywordSemanticQualification): boolean {
  return current.source.providerRequestId === next.source.providerRequestId
    && current.source.collectedAt === next.source.collectedAt
    && lensSources(current) === lensSources(next)
    && mesmaConsulta(current.query, next.query)
    && current.derivation.derivationVersion === next.derivation.derivationVersion
    && current.derivation.thresholdsVersion === next.derivation.thresholdsVersion
    && leituraGravada(current) === leituraGravada(next);
}

/**
 * A SERP da próxima versão foi observada ANTES da vigente? Um acerto de cache
 * pode ser mais velho que a versão vigente (duas execuções em paralelo, ou uma
 * gravação no cache que falhou). Gravá-lo faria o tempo andar para trás — e
 * poderia trazer de volta uma SERP que um humano recusou. A vigente fica.
 *
 * Nas quatro lentes, a vigente fica quando alguma lente presente nas duas
 * ficou mais velha E nenhuma ficou mais nova: a próxima não traz nada novo, só
 * tempo andando para trás. Se ela traz uma lente mais nova (a canônica
 * recolhida, por exemplo), é progresso real e grava — senão uma extra velha
 * (corrida `concurrent`, escrita que falhou) bloquearia a coleta nova até a
 * entrada velha vencer no cache.
 */
export function predatesCurrentSemanticQualification(current: KeywordSemanticQualification, next: KeywordSemanticQualification): boolean {
  const vigente = Date.parse(current.source.collectedAt);
  const proxima = Date.parse(next.source.collectedAt);
  if (Number.isFinite(vigente) && Number.isFinite(proxima) && proxima < vigente) return true;
  const vigentes = new Map((current.lensEvidence?.readings || []).map(reading => [reading.lens, Date.parse(reading.collectedAt)]));
  let maisVelha = false;
  let maisNova = false;
  for (const reading of next.lensEvidence?.readings || []) {
    const antes = vigentes.get(reading.lens);
    const agora = Date.parse(reading.collectedAt);
    if (antes === undefined || !Number.isFinite(antes) || !Number.isFinite(agora)) continue;
    if (agora < antes) maisVelha = true;
    if (agora > antes) maisNova = true;
  }
  return maisVelha && !maisNova;
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

function scoreAxis(value: unknown): Record<string, number> {
  const points: Record<string, number> = {};
  for (const [label, count] of Object.entries(asRecord(value) || {})) {
    if (label.trim() && typeof count === "number" && Number.isFinite(count)) points[label] = count;
  }
  return points;
}

/**
 * Campos que a derivação v4 grava em cada item da amostra. Só entram quando
 * estavam gravados: uma amostra v3 relida continua byte a byte a mesma, e uma
 * v4 relida continua igual à que foi montada — senão `repeatsCurrent…` veria
 * mudança onde não há e um acerto de cache viraria versão nova.
 */
function sampleV4Fields(entry: Record<string, unknown>): { urlKey?: string; duplicates?: number; score?: SerpTextScore; lenses?: number } {
  const urlKey = text(entry.urlKey);
  const duplicates = typeof entry.duplicates === "number" && Number.isInteger(entry.duplicates) && entry.duplicates > 0 ? entry.duplicates : 0;
  const score = asRecord(entry.score);
  // A máscara das quatro lentes: inteiro positivo de 4 bits.
  const lenses = typeof entry.lenses === "number" && Number.isInteger(entry.lenses) && entry.lenses > 0 && entry.lenses < 16 ? entry.lenses : 0;
  return {
    ...(urlKey ? { urlKey } : {}),
    ...(duplicates ? { duplicates } : {}),
    ...(score ? { score: { intent: scoreAxis(score.intent), funnel: scoreAxis(score.funnel) } } : {}),
    ...(lenses ? { lenses } : {}),
  };
}

/* ---------------------------- leitura das lentes ---------------------------- */

const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nullableText = (value: unknown) => text(value) || null;

function lensAxisReading(value: unknown): SerpLensAxisReading | null {
  const item = asRecord(value);
  const parsedStrength = strength(item?.strength);
  if (!item || !parsedStrength || !finiteNumber(item.coverage) || !finiteNumber(item.dominance)) return null;
  return { value: nullableText(item.value), strength: parsedStrength, leading: nullableText(item.leading), coverage: item.coverage, dominance: item.dominance };
}

function lensReading(value: unknown): SerpLensReading | null {
  const item = asRecord(value);
  const intent = lensAxisReading(item?.intent);
  const funnel = lensAxisReading(item?.funnel);
  if (!item || !text(item.lens) || !text(item.collectedAt) || !intent || !funnel || !finiteNumber(item.observed)) return null;
  return {
    lens: text(item.lens),
    collectedAt: text(item.collectedAt),
    providerRequestId: nullableText(item.providerRequestId),
    collectedBy: nullableText(item.collectedBy),
    observed: item.observed,
    intent,
    funnel,
  };
}

function lensAgreement(value: unknown): SerpLensAgreement | null {
  const item = asRecord(value);
  if (!item || !finiteNumber(item.agreeing) || !finiteNumber(item.of)) return null;
  return { label: nullableText(item.label), agreeing: item.agreeing, of: item.of };
}

function lensDeviceSplit(value: unknown): SerpLensDeviceSplit | null {
  const item = asRecord(value);
  return item && text(item.desktop) && text(item.mobile) ? { desktop: text(item.desktop), mobile: text(item.mobile) } : null;
}

/**
 * O bloco `lensEvidence` relido campo a campo. Precisa devolver EXATAMENTE o
 * que foi montado — senão `repeatsCurrent…` veria mudança onde não há. Forma
 * essencial inválida (versão, leituras, concordância, datas) descarta o bloco
 * inteiro: a Qualificação passa a ser lida como legada de uma lente, nunca
 * com meia leitura das lentes.
 */
function parseLensEvidence(value: unknown): SerpLensEvidence | null {
  const item = asRecord(value);
  if (!item || item.version !== SERP_LENS_EVIDENCE_VERSION || !Array.isArray(item.readings)) return null;
  const readings = item.readings.map(lensReading).filter((reading): reading is SerpLensReading => Boolean(reading));
  // Uma leitura inválida derruba o bloco: descartar só ela deixaria meia leitura (readings < agreement.of).
  if (readings.length !== item.readings.length) return null;
  const agreement = asRecord(item.agreement);
  const intentAgreement = lensAgreement(agreement?.intent);
  const funnelAgreement = lensAgreement(agreement?.funnel);
  const dates = asRecord(item.dates);
  if (!readings.length || !intentAgreement || !funnelAgreement || !dates || !text(dates.oldest) || !text(dates.newest)) return null;
  const deviceSplit = asRecord(item.deviceSplit);
  const conflicts = asRecord(item.labelConflicts);
  return {
    version: SERP_LENS_EVIDENCE_VERSION,
    readings,
    lensesMissing: (Array.isArray(item.lensesMissing) ? item.lensesMissing : [])
      .map(asRecord)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && text(entry.lens) && SERP_LENS_MISSING_REASONS.includes(entry.reason as SerpLensMissingReason)))
      .map(entry => ({ lens: text(entry.lens), reason: entry.reason as SerpLensMissingReason })),
    agreement: { intent: intentAgreement, funnel: funnelAgreement },
    deviceSplit: { intent: lensDeviceSplit(deviceSplit?.intent), funnel: lensDeviceSplit(deviceSplit?.funnel) },
    blocks: (Array.isArray(item.blocks) ? item.blocks : [])
      .map(asRecord)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && text(entry.type) && Number.isInteger(entry.lenses) && (entry.lenses as number) > 0))
      .map(entry => ({ type: text(entry.type), lenses: entry.lenses as number })),
    labelConflicts: {
      intent: conflicts && finiteNumber(conflicts.intent) ? conflicts.intent : 0,
      funnel: conflicts && finiteNumber(conflicts.funnel) ? conflicts.funnel : 0,
    },
    dates: { oldest: text(dates.oldest), newest: text(dates.newest), divergent: dates.divergent === true },
  };
}

/** A matriz das lentes pedida: lista não vazia de rótulos. */
function queryLenses(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const lenses = value.filter((lens): lens is string => typeof lens === "string" && Boolean(lens.trim())).map(lens => lens.trim());
  return lenses.length ? lenses : null;
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
  const lensEvidence = parseLensEvidence(item.lensEvidence);
  const lenses = queryLenses(query.lenses);
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
      ...(lenses ? { lenses } : {}),
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
          ...sampleV4Fields(entry!),
        }))
        : [],
      evidenceHash: text(evidence.evidenceHash),
    },
    intent,
    funnel,
    ...(lensEvidence ? { lensEvidence } : {}),
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
    intent: { ...base.intent, serp: qualification.intent.observedValue, serpStrength: qualification.intent.strength, rationale: axisRationale(qualification.intent), serpLabelCount: qualification.intent.distribution.length },
    funnel: { ...base.funnel, serp: qualification.funnel.observedValue, serpStrength: qualification.funnel.strength, rationale: axisRationale(qualification.funnel), serpLabelCount: qualification.funnel.distribution.length },
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

/**
 * O resumo das lentes que viaja para fora da Qualificação — a linha
 * (`evidencia_serp.lentes`) e o handoff ao Arquiteto: quantas lentes foram
 * lidas e quantas concordam, por eixo, com o rótulo que lidera o agregado.
 * `null` na Qualificação legada de uma lente.
 */
export function qualificationLensSummary(qualification: KeywordSemanticQualification | null | undefined): { observadas: number; concordancia: { intent: number; funnel: number } } | null {
  const lenses = qualification?.lensEvidence;
  if (!lenses) return null;
  return { observadas: lenses.readings.length, concordancia: { intent: lenses.agreement.intent.agreeing, funnel: lenses.agreement.funnel.agreeing } };
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
