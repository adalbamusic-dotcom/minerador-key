import type { ContentPlanDetails, VersionReference } from "../arquiteto/contracts.ts";

type UnknownRecord = Record<string, unknown>;

export type PlannerWordRange = {
  min: number;
  ideal: number;
  max: number;
};

export type PlannerRadarEvidence = {
  hasPackage: boolean;
  isApprovedHandoff: boolean;
  packageType: string | null;
  provider: string | null;
  query: string | null;
  sampleSize: number | null;
  questions: string[];
  entities: string[];
  topics: string[];
  requirements: string[];
  recommendations: string[];
  observedData: string[];
  humanDecisions: string[];
  limitations: string[];
  expertEvidenceCount: number;
  productEvidenceCount: number;
  wordRange: PlannerWordRange | null;
  wordRangeSource: string | null;
};

const asRecord = (value: unknown): UnknownRecord | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asText = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const asNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

function unique(items: string[]) {
  return [...new Set(items.map(item => item.trim()).filter(Boolean))];
}

function textItems(value: unknown, fields: string[] = ["text", "term", "title", "label"]) {
  return asArray(value).flatMap(item => {
    const record = asRecord(item);
    if (!record) return asText(item) ? [asText(item)!] : [];
    for (const field of fields) {
      const text = asText(record[field]);
      if (text) return [text];
    }
    return [];
  });
}

function decisionText(value: unknown) {
  return asArray(value).flatMap(item => {
    const decision = asRecord(item);
    if (!decision) return asText(item) ? [asText(item)!] : [];
    const target = asText(decision.target);
    const outcome = asText(decision.decision);
    const note = asText(decision.note);
    const result = [target, outcome].filter(Boolean).join(": ");
    return result ? [note ? `${result} — ${note}` : result] : [];
  });
}

function reportNeedTexts(value: unknown, wantedDecisions?: string[]) {
  return asArray(value).flatMap(item => {
    const need = asRecord(item);
    if (!need) return [];
    const title = asText(need.title);
    const decision = asText(need.decision);
    if (!title || (wantedDecisions && (!decision || !wantedDecisions.includes(decision)))) return [];
    return [title];
  });
}

function readWordRange(evidencePackage: UnknownRecord | null): { range: PlannerWordRange; sampleSize: number | null } | null {
  const structure = asRecord(evidencePackage?.observedStructure);
  const metric = asRecord(structure?.wordCounts);
  const sampleSize = asNumber(structure?.sampleSize);
  const median = asNumber(metric?.median);
  const typicalRange = asArray(metric?.typicalRange).map(asNumber);
  const low = typicalRange[0] ?? null;
  const high = typicalRange[1] ?? null;
  if (median === null || low === null || high === null || sampleSize === null || sampleSize <= 0) return null;
  const min = Math.round(Math.min(low, median, high));
  const max = Math.round(Math.max(low, median, high));
  return { range: { min, ideal: Math.round(median), max }, sampleSize: Math.round(sampleSize) };
}

/**
 * Reads the approved Radar package without making it a second source of truth.
 * Unknown or incomplete provider data remains absent instead of being guessed.
 */
export function readPlannerRadarEvidence(value: unknown): PlannerRadarEvidence {
  const radar = asRecord(value);
  const packageValue = asRecord(radar?.evidencePackage) || (radar?.packageType ? radar : null);
  const handoff = packageValue?.packageType === "radar_planner_handoff" ? packageValue : null;
  const evidencePackage = handoff ? asRecord(handoff.evidencePackage) : packageValue;
  const report = asRecord(handoff?.approvedReport);
  const evidenceSerp = asRecord(evidencePackage?.serp);
  const handoffSerp = asRecord(handoff?.serp);
  const observedSemantics = asRecord(evidencePackage?.observedSemantics);
  const wordMetric = readWordRange(evidencePackage);
  const topRequirements = textItems(radar?.requirements);
  const handoffRequirements = report ? reportNeedTexts(report.needs, ["send_planner", "required"]) : [];
  const topRecommendations = textItems(radar?.recommendations);
  const handoffRecommendations = report ? [...textItems(report.recommendations), ...reportNeedTexts(report.needs, ["recommended", "opportunity"])] : [];
  const reportSummary = asText(report?.summary);
  const reportLimitations = textItems(report?.limitations);
  const limitations = unique([...reportLimitations, ...textItems(evidencePackage?.limitations)]);
  const provider = asText(handoffSerp?.provider) || asText(evidenceSerp?.provider) || null;
  const query = asText(handoffSerp?.query) || asText(evidenceSerp?.query) || null;
  const packageSampleSize = asNumber(asRecord(evidencePackage?.observedStructure)?.sampleSize);
  const questions = unique([
    ...textItems(evidencePackage?.relevantQuestions),
    ...textItems(evidencePackage?.relevantRelatedSearches),
  ]);
  const entities = unique([
    ...textItems(evidencePackage?.relevantEntities),
    ...textItems(observedSemantics?.entities),
  ]);
  const topics = unique([
    ...textItems(observedSemantics?.recurringTopics),
    ...textItems(evidencePackage?.semanticTerms),
  ]);
  const observedData = unique([
    ...textItems(radar?.observedData),
    ...(reportSummary ? [reportSummary] : []),
    ...limitations,
  ]);
  const humanDecisions = unique([
    ...textItems(radar?.humanDecisions),
    ...decisionText(report?.humanDecisions),
    ...decisionText(handoff?.humanDecisions),
  ]);
  const expertEvidenceCount = asArray(handoff?.expertEvidence).length;
  const productEvidenceCount = asArray(handoff?.productEvidence).length;
  return {
    hasPackage: Boolean(evidencePackage),
    isApprovedHandoff: Boolean(handoff && handoff.status === "APPROVED" && report?.status === "APPROVED"),
    packageType: asText(packageValue?.packageType),
    provider,
    query,
    sampleSize: packageSampleSize === null ? null : Math.round(packageSampleSize),
    questions,
    entities,
    topics,
    requirements: unique([...topRequirements, ...handoffRequirements]),
    recommendations: unique([...topRecommendations, ...handoffRecommendations]),
    observedData,
    humanDecisions,
    limitations,
    expertEvidenceCount,
    productEvidenceCount,
    wordRange: wordMetric?.range || null,
    wordRangeSource: wordMetric ? `Radar.observedStructure.wordCounts · mediana e faixa típica${handoff && handoff.status === "APPROVED" && report?.status === "APPROVED" ? " · handoff aprovado" : " · pacote recebido, sem handoff aprovado"}` : null,
  };
}

function splitTotal(total: number, count: number, index: number) {
  const base = Math.floor(total / Math.max(count, 1));
  return base + (index < total % Math.max(count, 1) ? 1 : 0);
}

export function splitPlannerWordRange(range: PlannerWordRange | null, count: number, index: number): PlannerWordRange | null {
  if (!range || count < 1) return null;
  return {
    min: splitTotal(range.min, count, index),
    ideal: splitTotal(range.ideal, count, index),
    max: splitTotal(range.max, count, index),
  };
}

export function paragraphRangeForWords(range: PlannerWordRange | null) {
  if (!range) return null;
  const min = range.min === 0 ? 0 : Math.max(1, Math.ceil(range.min / 180));
  const max = range.max === 0 ? 0 : Math.max(min, Math.ceil(range.max / 90));
  return { min, max };
}

export function estimatedParagraphsForWords(range: PlannerWordRange | null) {
  if (!range || range.ideal === 0) return range ? 0 : null;
  return Math.max(1, Math.ceil(range.ideal / 120));
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function sectionIndexForText(text: string, headings: string[], fallback: number) {
  const tokens = new Set(normalized(text).split(" ").filter(token => token.length > 2));
  if (!tokens.size) return fallback % Math.max(headings.length, 1);
  let bestIndex = fallback % Math.max(headings.length, 1);
  let bestScore = 0;
  headings.forEach((heading, index) => {
    const headingTokens = new Set(normalized(heading).split(" ").filter(token => token.length > 2));
    const score = [...tokens].filter(token => headingTokens.has(token)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function assignPlannerTextToSections(items: string[], headings: string[]) {
  return items.map((item, index) => ({ item, index: sectionIndexForText(item, headings, index) }));
}

export function sectionKeywordRefs(keywordRefs: VersionReference[], count: number, index: number) {
  if (!keywordRefs.length || count < 1) return [];
  if (keywordRefs.length === 1) return [keywordRefs[0]];
  const selected = index === 0 ? [keywordRefs[0]] : [keywordRefs[index % keywordRefs.length]];
  return selected;
}

export function plannerParagraphGuidance(range: PlannerWordRange | null) {
  if (!range) return [];
  return [
    `Faixa global recomendada: ${range.min}–${range.max} palavras; alvo ${range.ideal}.`,
    "A faixa é uma interpretação inicial da amostra Radar e precisa de revisão humana antes da aprovação.",
  ];
}

export function defaultPlannerImagePlan(input: { unitId: string; subject: string }): ContentPlanDetails["images"] {
  return [
    {
      id: `image:${input.unitId}:cover`, position: "Capa · antes da introdução", objective: "Apresentar a promessa editorial da unidade.", subject: input.subject,
      visualFunction: "cover", requiredElements: ["composição coerente com a identidade da marca"], avoid: ["texto ilegível", "estatísticas não verificadas"], aspectRatio: "16:9", prompt: null, altText: null, status: "planned", humanApproved: false,
    },
    {
      id: `image:${input.unitId}:breathing-1`, position: "Respiro · após a primeira seção", objective: "Criar uma pausa visual sem substituir a explicação.", subject: input.subject,
      visualFunction: "breathing", requiredElements: ["relação visual com o argumento da seção"], avoid: ["clichês visuais", "texto dentro da imagem"], aspectRatio: "16:9", prompt: null, altText: null, status: "planned", humanApproved: false,
    },
    {
      id: `image:${input.unitId}:breathing-2`, position: "Respiro · antes da conclusão", objective: "Reforçar a transição para a síntese final.", subject: input.subject,
      visualFunction: "breathing", requiredElements: ["continuidade visual com a capa"], avoid: ["promessas não comprovadas", "texto ilegível"], aspectRatio: "16:9", prompt: null, altText: null, status: "planned", humanApproved: false,
    },
  ] as ContentPlanDetails["images"];
}
