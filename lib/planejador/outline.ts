import type { ContentPlanDetails } from "../arquiteto/contracts.ts";

export type OutlineMetrics = {
  h2: number; h3: number; wordMin: number | null; wordIdeal: number | null; wordMax: number | null;
  estimatedParagraphs: number | null; orphanH3: string[]; emptyH2: string[]; uncoveredRequiredTopics: string[]; alerts: string[];
};

export function clonePlanDetails(details: ContentPlanDetails): ContentPlanDetails {
  return structuredClone(details);
}

export function addOutlineSection(details: ContentPlanDetails, level: 2 | 3 = 2): ContentPlanDetails {
  const sections = details.structure.sections;
  const section = { id: `section:${Date.now()}`, level, heading: level === 2 ? "Novo H2" : "Novo H3", objective: "Definir objetivo editorial.", topics: [], questions: [], entities: [], objections: [], keywordDnaRefs: sections[0]?.keywordDnaRefs || [], evidenceRefs: [], order: sections.length, origin: "human" as const, suggestedHeading: null, decidedHeading: null, argumentativeFunction: null, wordRange: null, paragraphRange: null, estimatedParagraphs: null, excludedTopics: [], internalLinks: [], externalLinks: [], imageId: null, ctaId: null, instructions: [], restrictions: [], alerts: [], humanDecision: "Adicionado no cockpit." };
  return { ...clonePlanDetails(details), structure: { ...details.structure, sections: [...sections, section] } };
}

export function updateOutlineSection(details: ContentPlanDetails, id: string, patch: Partial<ContentPlanDetails["structure"]["sections"][number]>): ContentPlanDetails {
  return { ...clonePlanDetails(details), structure: { ...details.structure, sections: details.structure.sections.map(section => section.id === id ? { ...section, ...patch, origin: "human" as const } : section) } };
}

export function removeOutlineSection(details: ContentPlanDetails, id: string): ContentPlanDetails {
  const remaining = details.structure.sections.filter(section => section.id !== id);
  const removedH2 = details.structure.sections.find(section => section.id === id)?.level === 2;
  const next = removedH2 ? remaining.map(section => section.level === 3 && section.id !== id ? { ...section, alerts: [...(section.alerts || []), "H3 sem H2 após remoção." ] } : section) : remaining;
  return { ...clonePlanDetails(details), structure: { ...details.structure, sections: next } };
}

export function moveOutlineSection(details: ContentPlanDetails, id: string, direction: -1 | 1): ContentPlanDetails {
  const sections = [...details.structure.sections]; const index = sections.findIndex(section => section.id === id); const target = index + direction;
  if (index < 0 || target < 0 || target >= sections.length) return details;
  [sections[index], sections[target]] = [sections[target], sections[index]];
  return { ...clonePlanDetails(details), structure: { ...details.structure, sections: sections.map((section, order) => ({ ...section, order, origin: "human" as const })) } };
}

export function validateOutline(details: ContentPlanDetails) {
  const orphanH3 = details.structure.sections.filter((section, index) => section.level === 3 && !details.structure.sections.slice(0, index).some(previous => previous.level === 2)).map(section => section.id);
  const emptyH2 = details.structure.sections.filter(section => section.level === 2 && !section.heading.trim()).map(section => section.id);
  const required = new Set(details.structure.sections.flatMap(section => section.topics));
  const covered = new Set(details.structure.sections.flatMap(section => [...section.topics, ...section.entities]));
  const uncoveredRequiredTopics = [...required].filter(topic => !covered.has(topic));
  return { orphanH3, emptyH2, uncoveredRequiredTopics };
}

export function calculateOutlineMetrics(details: ContentPlanDetails): OutlineMetrics {
  const sections = details.structure.sections;
  const gabarito = details.gabarito;
  const validation = validateOutline(details);
  const wordMin = sections.reduce((sum, section) => sum === null || !section.wordRange?.min ? sum : sum + section.wordRange.min, 0) || gabarito?.globalWords.min || null;
  const wordIdeal = sections.reduce((sum, section) => sum === null || !section.wordRange?.ideal ? sum : sum + section.wordRange.ideal, 0) || gabarito?.globalWords.ideal || null;
  const wordMax = sections.reduce((sum, section) => sum === null || !section.wordRange?.max ? sum : sum + section.wordRange.max, 0) || gabarito?.globalWords.max || null;
  const estimatedParagraphs = sections.reduce((sum, section) => sum === null || section.estimatedParagraphs === null || section.estimatedParagraphs === undefined ? sum : sum + section.estimatedParagraphs, 0) || gabarito?.estimatedParagraphs || null;
  const alerts = [...validation.orphanH3.map(id => `H3 órfão: ${id}`), ...validation.emptyH2.map(id => `H2 vazio: ${id}`), ...validation.uncoveredRequiredTopics.map(topic => `Tópico obrigatório sem cobertura: ${topic}`)];
  return { h2: sections.filter(section => section.level === 2).length, h3: sections.filter(section => section.level === 3).length, wordMin, wordIdeal, wordMax, estimatedParagraphs, ...validation, alerts };
}

function comparable(details: ContentPlanDetails) {
  const copy = clonePlanDetails(details);
  copy.review = { ...copy.review, workflowStatus: "", publicationStatus: "", transferStatus: "" };
  return copy;
}

export function hasMaterialPlanChange(previous: ContentPlanDetails, next: ContentPlanDetails) {
  return JSON.stringify(comparable(previous)) !== JSON.stringify(comparable(next));
}
