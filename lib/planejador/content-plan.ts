import type { ArticleDNA, ContentPlan, ContentPlanDetails, SiloDNA, SiloPage, VersionEnvelope, VersionReference } from "../arquiteto/contracts.ts";
import { ContentPlanSchema } from "../arquiteto/contracts.ts";
import { createVersionEnvelope, legacyVersionReference, toVersionReference } from "../arquiteto/versioning.ts";
import type { PlannerPublicationIdentity } from "./publication-identity.ts";
import { protectedIdentityIssues, publicationSourceIssues } from "./publication-identity.ts";
import { buildKeywordStrategySnapshot, keywordStrategyIssues } from "./keyword-strategy.ts";

export class ContentPlanProtectionError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`A identidade protegida do conteudo nao pode ser alterada: ${issues.join(" ")}`);
    this.name = "ContentPlanProtectionError";
    this.issues = issues;
  }
}

export type PlannerSource = { id: string; claim: string; entity: string; sourceType: string; candidateUrl?: string | null; title?: string | null; reason: string; evidenceRef?: ContentPlanDetails["evidenceRefs"][number] | null; status?: "suggested" | "approved" | "rejected" | "needs_source"; humanApproved?: boolean };

export interface DefinitiveContentPlanInput {
  brandId: string;
  editorialUnitType: "article" | "silo_page";
  editorialUnitId: string;
  article?: VersionEnvelope<ArticleDNA>;
  siloPage?: VersionEnvelope<SiloPage>;
  silo?: VersionEnvelope<SiloDNA>;
  brandDnaRef?: VersionReference;
  radarResearchLoadId?: string;
  serpEvidenceRefs?: ContentPlanDetails["evidenceRefs"];
  humanNotes?: string[];
  skillIds?: string[];
  promptIds?: string[];
  radarAnalysisPackage?: Partial<ContentPlanDetails["radar"]>;
  previous?: VersionEnvelope<ContentPlan>;
}

function sourceDetails(input: DefinitiveContentPlanInput, article: ArticleDNA | null, evidenceRefs: ContentPlanDetails["evidenceRefs"]): ContentPlanDetails["sources"] {
  const required = article?.sourcesNeeded || [];
  return required.map((claim, index) => ({
    id: `source:${input.editorialUnitId}:${index + 1}`,
    claim,
    entity: article?.entities[index] || "Entidade a confirmar",
    sourceType: "needs_human_source",
    candidateUrl: null,
    title: null,
    reason: "A fonte precisa ser localizada e aprovada por uma pessoa; o Planejador não inventa URL ou estatística.",
    evidenceRef: evidenceRefs[index] || null,
    status: evidenceRefs[index] ? "suggested" : "needs_source",
    humanApproved: false,
  }));
}

function buildDetails(input: DefinitiveContentPlanInput, keywordRefs: VersionReference[], evidenceRefs: ContentPlanDetails["evidenceRefs"]): ContentPlanDetails {
  const article = input.article?.payload || null;
  const page = input.siloPage?.payload || null;
  const headings = article?.requiredTopics.length ? article.requiredTopics : page?.sections.map(section => section.heading) || [article?.promise || page?.h1 || "Estrutura editorial"];
  const sections = headings.map((heading, index) => ({
    id: `section:${index + 1}`,
    level: 2 as 2 | 3,
    heading,
    objective: article ? `Cobrir ${heading} dentro da fronteira: ${article.antiCannibalizationBoundary}.` : page?.sections[index]?.objective || `Organizar a cobertura de ${heading}.`,
    topics: article?.coverage.filter(topic => topic.toLowerCase().includes(heading.toLowerCase())) || [heading],
    questions: article?.questions.slice(index, index + 1) || [],
    entities: article?.entities || [],
    objections: article?.objections || [],
    keywordDnaRefs: keywordRefs,
    evidenceRefs,
    order: index,
    suggestedHeading: heading,
    decidedHeading: null,
    argumentativeFunction: null,
    wordRange: null,
    paragraphRange: null,
    estimatedParagraphs: null,
    excludedTopics: [],
    internalLinks: [],
    externalLinks: [],
    imageId: null,
    ctaId: null,
    instructions: [],
    restrictions: [],
    alerts: [],
    origin: "observed" as const,
    humanDecision: null,
  }));
  const h1 = page?.h1 || article?.promise || "H1 pendente de revisão humana";
  const slug = page?.slug || article?.suggestedSlug || input.editorialUnitId;
  const canonical = page?.canonical ?? article?.canonical ?? null;
  const intent = article?.mainIntent || "navegacional";
  const promise = article?.promise || page?.intro || h1;
  const boundary = article?.antiCannibalizationBoundary || input.silo?.payload.boundary || "Definir a fronteira desta unidade antes da redação.";
  const questions = (article?.questions || []).map((text, index) => ({ id: `question:${input.editorialUnitId}:${index + 1}`, text, origin: "observed" as const, priority: "useful" as const, classification: null, sectionId: sections[index]?.id || null, status: "pending" as const, humanDecision: null }));
  const entities = (article?.entities || []).map((text, index) => ({ id: `entity:${input.editorialUnitId}:${index + 1}`, text, origin: "observed" as const, priority: "useful" as const, classification: null, sectionId: null, status: "pending" as const, humanDecision: null }));
  const objections = (article?.objections || []).map((text, index) => ({ id: `objection:${input.editorialUnitId}:${index + 1}`, text, origin: "observed" as const, priority: "useful" as const, classification: null, sectionId: null, status: "pending" as const, humanDecision: null }));
  const baseDetails: ContentPlanDetails = {
    brandId: input.brandId,
    editorialUnitType: input.editorialUnitType,
    editorialUnitId: input.editorialUnitId,
    articleId: article?.articleId || null,
    siloPageId: page?.siloPageId || null,
    siloId: article?.siloId || page?.siloId || input.silo?.payload.siloId || null,
    strategy: {
      primaryIntent: intent,
      secondaryIntents: article?.auxiliaryIntents || [],
      intentValidation: "validated",
      validationNotes: ["Intenção herdada de uma unidade de origem aprovada; a SERP, quando ausente, continua pendente."],
      angle: article?.angle || "Ângulo pendente de revisão humana.",
      promise,
      differentiation: article?.differentiation || [],
      boundary,
    },
    strategyContext: { sourceRefs: [], applied: false, appliedAt: null, humanDecision: null, conflicts: [] },
    structure: { h1, sections },
    internalLinks: [],
    sources: sourceDetails(input, article, evidenceRefs),
    evidenceRefs,
    cta: { text: article?.cta || page?.cta || "CTA pendente de revisão humana.", objective: "Conduzir o próximo passo coerente com a intenção.", placement: "Após a entrega principal da unidade." },
    images: [{ id: `image:${input.editorialUnitId}:1`, position: "Após a introdução", objective: "Apoiar a compreensão da promessa sem criar evidência fictícia.", subject: h1, visualFunction: "contextual", requiredElements: [], avoid: ["texto ilegível", "estatísticas não verificadas"], aspectRatio: "16:9", prompt: null, altText: null, status: "planned", humanApproved: false }],
    skills: { skillIds: input.skillIds || [], promptIds: input.promptIds || [] },
    metadata: { slug, canonical, principalKeywordId: article?.principalKeywordId || input.editorialUnitId, metaTitle: "", metaDescription: "", socialTitle: "", socialDescription: "", indexationStatus: "noindex" },
    radar: {
      researchLoadId: input.radarResearchLoadId || null,
      serpSnapshotIds: evidenceRefs.map(reference => reference.artifactId),
      analysisVersionId: input.radarAnalysisPackage?.analysisVersionId || null,
      analysisMode: input.radarAnalysisPackage?.analysisMode || null,
      analysisEnforcement: input.radarAnalysisPackage?.analysisEnforcement || null,
      packageHash: input.radarAnalysisPackage?.packageHash || null,
      requirements: input.radarAnalysisPackage?.requirements || [],
      recommendations: input.radarAnalysisPackage?.recommendations || [],
      observedData: input.radarAnalysisPackage?.observedData || [],
      humanDecisions: input.radarAnalysisPackage?.humanDecisions || [],
      evidencePackage: input.radarAnalysisPackage?.evidencePackage || null,
    },
    review: { workflowStatus: "awaiting_review", publicationStatus: "not_started", transferStatus: "not_sent", humanNotes: input.humanNotes || [] },
    gabarito: { globalWords: { min: null, ideal: null, max: null }, paragraphRange: { min: null, max: null }, estimatedParagraphs: null, tone: null, depth: null, detail: null, counts: { h2: sections.filter(section => section.level === 2).length, h3: sections.filter(section => section.level === 3).length, intro: 1, conclusion: 1, faq: 0, tables: 0, comparisons: 0, checklists: 0, lists: 0, quotes: 0, images: 1, internalLinks: 0, externalLinks: 0, cta: 1, specialBlocks: 0 }, alerts: [], humanDecision: null },
    blocks: [{ id: `block:intro:${input.editorialUnitId}`, type: "intro" as const, sectionId: null, order: 0, objective: "Apresentar a promessa da unidade.", instructions: [], origin: "planner" as const, humanDecision: null, alert: null }, { id: `block:conclusion:${input.editorialUnitId}`, type: "conclusion" as const, sectionId: null, order: sections.length + 1, objective: "Concluir sem introduzir novo tema.", instructions: [], origin: "planner" as const, humanDecision: null, alert: null }],
    questions,
    entities,
    objections,
    guardianInstructions: ["Não escrever parágrafos fora da estrutura aprovada.", "Registrar lacunas de fonte como pendência."],
    alerts: [],
  };
  return article ? { ...baseDetails, keywordStrategy: buildKeywordStrategySnapshot({ article, details: baseDetails }) } : baseDetails;
}

export async function createDefinitiveContentPlan(input: DefinitiveContentPlanInput, actorId: string, now = new Date().toISOString()) {
  const article = input.article?.payload || null;
  const keywordRefs = input.article?.payload.keywordReferences.map(reference => ({ entityId: reference.keywordId, versionId: reference.keywordDnaVersionId, contentHash: reference.keywordDnaContentHash })) || [legacyVersionReference(`keyword:${input.editorialUnitId}`, { brandId: input.brandId, editorialUnitId: input.editorialUnitId })];
  const evidenceRefs = input.serpEvidenceRefs || [];
  const planId = input.previous?.payload.planId || `plan:${input.editorialUnitId}`;
  const articleRef = input.article ? toVersionReference(input.article) : legacyVersionReference(`unit:${input.editorialUnitId}`, { brandId: input.brandId });
  const siloRef = input.silo ? toVersionReference(input.silo) : legacyVersionReference(`silo:${input.siloPage?.payload.siloId || input.editorialUnitId}`, { brandId: input.brandId });
  const payload = ContentPlanSchema.parse({
    schemaVersion: 2,
    planId,
    brandDnaRef: input.brandDnaRef || legacyVersionReference(`brand:${input.brandId}`, { brandId: input.brandId }),
    keywordDnaRefs: keywordRefs,
    articleDnaRef: articleRef,
    siloDnaRef: siloRef,
    serpEvidenceRefs: evidenceRefs,
    productEvidenceRefs: [],
    originalityReportRef: null,
    approvedOutline: buildDetails(input, keywordRefs, evidenceRefs).structure.sections.map(section => ({ id: section.id, heading: section.heading, objective: section.objective, keywordDnaRefs: section.keywordDnaRefs })),
    writingInstructions: [article?.angle || input.siloPage?.payload.visualBriefing || "Seguir o plano aprovado e registrar qualquer lacuna como pendência."].filter(Boolean),
    humanPendingDecisions: ["Revisar estrutura, links, fontes, CTA, imagens e metadados antes da aprovação.", ...(evidenceRefs.length ? [] : ["Nenhuma SERP real aprovada foi anexada ao plano."])],
    planning: buildDetails(input, keywordRefs, evidenceRefs),
  });
  return createVersionEnvelope({ entityId: planId, versionNumber: (input.previous?.versionNumber || 0) + 1, previousVersionId: input.previous?.versionId || null, origin: "human", changeReason: input.previous ? "Sucessora editada no Planejador." : "ContentPlan definitivo criado para revisão humana.", createdBy: actorId, createdAt: now, payload });
}

export function contentPlanApprovalIssues(plan: VersionEnvelope<ContentPlan>, expectedBrandId?: string) {
  const issues: string[] = [];
  const details = plan.payload.planning;
  if (!details) return ["O plano ainda usa o contrato v1; prepare uma versão definitiva antes da aprovação."];
  if (expectedBrandId && details.brandId !== expectedBrandId) issues.push("A marca do plano não corresponde à marca ativa.");
  if (!details.editorialUnitId) issues.push("A unidade editorial não foi identificada.");
  if (details.strategy.intentValidation !== "validated") issues.push("A intenção ainda não foi validada.");
  if (!details.structure.h1.trim()) issues.push("O H1 é obrigatório.");
  if (!details.structure.sections.length) issues.push("O plano precisa de pelo menos uma seção.");
  if (details.structure.sections.some(section => !section.heading.trim() || !section.objective.trim())) issues.push("Cada seção precisa de heading e objetivo.");
  if (details.sources.some(source => source.status === "needs_source")) issues.push("Existem claims sem fonte definida.");
  if (details.images.some(image => image.status === "approved" && !image.altText?.trim())) issues.push("Imagens aprovadas precisam de texto alternativo.");
  if (!details.metadata.slug.trim()) issues.push("O slug é obrigatório e deve ser revisado.");
  if (!details.cta.text.trim()) issues.push("O CTA é obrigatório.");
  if (details.keywordStrategy) issues.push(...keywordStrategyIssues(details.keywordStrategy));
  return [...new Set(issues)];
}

export async function createContentPlanSuccessor(previous: VersionEnvelope<ContentPlan>, details: ContentPlanDetails, actorId: string, now = new Date().toISOString(), options?: { publicationIdentity?: PlannerPublicationIdentity | null }) {
  if (options?.publicationIdentity?.protected && previous.payload.planning) {
    const issues = [...publicationSourceIssues(previous.payload.planning, options.publicationIdentity), ...protectedIdentityIssues(previous.payload.planning, details, options.publicationIdentity)];
    if (issues.length) throw new ContentPlanProtectionError(issues);
  }
  const payload = ContentPlanSchema.parse({
    ...previous.payload,
    schemaVersion: 2,
    approvedOutline: details.structure.sections.map(section => ({ id: section.id, heading: section.heading, objective: section.objective, keywordDnaRefs: section.keywordDnaRefs })),
    writingInstructions: [details.strategy.angle, details.strategy.boundary],
    humanPendingDecisions: [...new Set([...previous.payload.humanPendingDecisions, ...details.review.humanNotes])],
    planning: { ...details, review: { ...details.review, workflowStatus: "awaiting_review", transferStatus: "not_sent" } },
  });
  return createVersionEnvelope({ entityId: previous.entityId, versionNumber: previous.versionNumber + 1, previousVersionId: previous.versionId, origin: "human", changeReason: "Edição humana do ContentPlan no Planejador.", createdBy: actorId, createdAt: now, payload });
}

export function isDefinitiveContentPlan(plan: VersionEnvelope<ContentPlan>) {
  return plan.payload.schemaVersion === 2 && Boolean(plan.payload.planning);
}
