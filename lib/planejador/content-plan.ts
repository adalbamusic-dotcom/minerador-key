import type { ArticleDNA, ContentPlan, ContentPlanDetails, SiloDNA, SiloPage, VersionEnvelope, VersionReference } from "../arquiteto/contracts.ts";
import { ContentPlanSchema } from "../arquiteto/contracts.ts";
import { createVersionEnvelope, legacyVersionReference, toVersionReference } from "../arquiteto/versioning.ts";
import type { PlannerPublicationIdentity } from "./publication-identity.ts";
import { protectedIdentityIssues, publicationSourceIssues } from "./publication-identity.ts";
import { buildKeywordStrategySnapshot, keywordStrategyIssues } from "./keyword-strategy.ts";
import {
  assignPlannerTextToSections,
  defaultPlannerImagePlan,
  estimatedParagraphsForWords,
  paragraphRangeForWords,
  plannerParagraphGuidance,
  readPlannerRadarEvidence,
  sectionKeywordRefs,
  splitPlannerWordRange,
} from "./deterministic-plan.ts";

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
  const required = [
    ...(article?.sourcesNeeded || []).map(claim => ({ claim, sourceType: "needs_human_source", reason: "A fonte precisa ser localizada e aprovada por uma pessoa; o Planejador não inventa URL ou estatística." })),
    ...(article?.evidenceNeeded || []).map(claim => ({ claim: `Evidência necessária: ${claim}`, sourceType: "needs_human_evidence", reason: "A evidência precisa ser localizada e aprovada por uma pessoa; o Planejador não converte lacunas em fatos." })),
  ];
  return required.map((requirement, index) => ({
    id: `source:${input.editorialUnitId}:${index + 1}`,
    claim: requirement.claim,
    entity: article?.entities[index] || "Entidade a confirmar",
    sourceType: requirement.sourceType,
    candidateUrl: null,
    title: null,
    reason: requirement.reason,
    evidenceRef: evidenceRefs[index] || null,
    status: evidenceRefs[index] ? "suggested" : "needs_source",
    humanApproved: false,
  }));
}

function unique(items: string[]) {
  return [...new Set(items.map(item => item.trim()).filter(Boolean))];
}

function buildDetails(input: DefinitiveContentPlanInput, keywordRefs: VersionReference[], evidenceRefs: ContentPlanDetails["evidenceRefs"]): ContentPlanDetails {
  const article = input.article?.payload || null;
  const page = input.siloPage?.payload || null;
  const radarEvidence = readPlannerRadarEvidence(input.radarAnalysisPackage);
  const sourceHeadings = article?.requiredTopics.length ? article.requiredTopics : page?.sections.map(section => section.heading) || [];
  const headings = unique(sourceHeadings.length ? sourceHeadings : [article?.promise || page?.h1 || "Estrutura editorial"]);
  const sectionQuestions = assignPlannerTextToSections(unique([...(article?.questions || []), ...radarEvidence.questions]), headings);
  const sectionEntities = assignPlannerTextToSections(unique([...(article?.entities || []), ...radarEvidence.entities]), headings);
  const sectionObjections = assignPlannerTextToSections(article?.objections || [], headings);
  const sections = headings.map((heading, index) => {
    const matchingTopics = unique([
      heading,
      ...(article?.coverage || []).filter(topic => topic.toLowerCase().includes(heading.toLowerCase()) || heading.toLowerCase().includes(topic.toLowerCase())),
      ...radarEvidence.topics.filter(topic => topic.toLowerCase().includes(heading.toLowerCase()) || heading.toLowerCase().includes(topic.toLowerCase())),
    ]);
    const assignedQuestions = sectionQuestions.filter(item => item.index === index).map(item => item.item);
    const assignedEntities = sectionEntities.filter(item => item.index === index).map(item => item.item);
    const assignedObjections = sectionObjections.filter(item => item.index === index).map(item => item.item);
    const wordRange = splitPlannerWordRange(radarEvidence.wordRange, headings.length, index);
    const paragraphRange = paragraphRangeForWords(wordRange);
    return {
    id: `section:${index + 1}`,
    level: 2 as 2 | 3,
    heading,
    objective: article ? `Cobrir ${heading} dentro da fronteira: ${article.antiCannibalizationBoundary}.` : page?.sections[index]?.objective || `Organizar a cobertura de ${heading}.`,
    topics: matchingTopics,
    questions: assignedQuestions,
    entities: assignedEntities,
    objections: assignedObjections,
    keywordDnaRefs: sectionKeywordRefs(keywordRefs, headings.length, index),
    evidenceRefs: evidenceRefs.length ? [evidenceRefs[index % evidenceRefs.length]] : [],
    order: index,
    suggestedHeading: heading,
    decidedHeading: null,
    argumentativeFunction: `Responder ao recorte “${heading}” sem sair da fronteira editorial.`,
    wordRange,
    paragraphRange,
    estimatedParagraphs: estimatedParagraphsForWords(wordRange),
    excludedTopics: article?.excludedSubjects || [],
    internalLinks: index === 0 ? article?.internalLinks || [] : [],
    externalLinks: [],
    imageId: null,
    ctaId: null,
    instructions: unique([
      ...plannerParagraphGuidance(wordRange),
      ...(index === 0 ? radarEvidence.requirements : []),
    ]),
    restrictions: unique([
      ...(article?.excludedSubjects || []).map(subject => `Não abordar: ${subject}.`),
      `Respeitar a fronteira: ${article?.antiCannibalizationBoundary || input.silo?.payload.boundary || "definida no plano"}.`,
    ]),
    alerts: [],
    origin: "observed" as const,
    humanDecision: null,
    };
  });
  const h1 = page?.h1 || article?.promise || "H1 pendente de revisão humana";
  const slug = page?.slug || article?.suggestedSlug || input.editorialUnitId;
  const canonical = page?.canonical ?? article?.canonical ?? null;
  const intent = article?.mainIntent || "navegacional";
  const promise = article?.promise || page?.intro || h1;
  const boundary = article?.antiCannibalizationBoundary || input.silo?.payload.boundary || "Definir a fronteira desta unidade antes da redação.";
  const allQuestions = unique([...(article?.questions || []), ...radarEvidence.questions]);
  const allEntities = unique([...(article?.entities || []), ...radarEvidence.entities]);
  const questions = allQuestions.map((text, index) => ({ id: `question:${input.editorialUnitId}:${index + 1}`, text, origin: "observed" as const, priority: "useful" as const, classification: null, sectionId: sections[sectionQuestions.find(item => item.item === text)?.index ?? index % sections.length]?.id || null, status: "pending" as const, humanDecision: null }));
  const entities = allEntities.map((text, index) => ({ id: `entity:${input.editorialUnitId}:${index + 1}`, text, origin: "observed" as const, priority: "useful" as const, classification: null, sectionId: sections[sectionEntities.find(item => item.item === text)?.index ?? index % sections.length]?.id || null, status: "pending" as const, humanDecision: null }));
  const objections = (article?.objections || []).map((text, index) => ({ id: `objection:${input.editorialUnitId}:${index + 1}`, text, origin: "observed" as const, priority: "useful" as const, classification: null, sectionId: sections[sectionObjections.find(item => item.item === text)?.index ?? index % sections.length]?.id || null, status: "pending" as const, humanDecision: null }));
  const images = defaultPlannerImagePlan({ unitId: input.editorialUnitId, subject: h1 });
  const paragraphRange = paragraphRangeForWords(radarEvidence.wordRange);
  const estimatedParagraphs = estimatedParagraphsForWords(radarEvidence.wordRange);
  const gabaritoHumanDecision = radarEvidence.wordRange ? `Faixa global derivada de ${radarEvidence.wordRangeSource}; revisar humanamente antes da aprovação.` : null;
  const imageBlocks = images.map((image, index) => ({ id: `block:image:${input.editorialUnitId}:${index + 1}`, type: "image" as const, sectionId: index === 0 ? null : sections[Math.min(index - 1, sections.length - 1)]?.id || null, order: index + 1, objective: image.objective, instructions: image.requiredElements, origin: "planner" as const, humanDecision: null, alert: null }));
  const radarRequirements = unique([...(input.radarAnalysisPackage?.requirements || []), ...radarEvidence.requirements]);
  const radarRecommendations = unique([...(input.radarAnalysisPackage?.recommendations || []), ...radarEvidence.recommendations]);
  const radarObservedData = unique([...(input.radarAnalysisPackage?.observedData || []), ...radarEvidence.observedData]);
  const radarHumanDecisions = unique([...(input.radarAnalysisPackage?.humanDecisions || []), ...radarEvidence.humanDecisions]);
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
      validationNotes: ["Intenção herdada de uma unidade de origem aprovada; a SERP, quando ausente, continua pendente.", ...(radarEvidence.isApprovedHandoff ? ["Pacote Radar aprovado preservado como evidência de entrada; não substitui a decisão humana do Planejador."] : [])],
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
    images,
    skills: { skillIds: input.skillIds || [], promptIds: input.promptIds || [] },
    metadata: { slug, canonical, principalKeywordId: article?.principalKeywordId || input.editorialUnitId, metaTitle: "", metaDescription: "", socialTitle: "", socialDescription: "", indexationStatus: "noindex" },
    radar: {
      researchLoadId: input.radarResearchLoadId || null,
      serpSnapshotIds: evidenceRefs.map(reference => reference.artifactId),
      analysisVersionId: input.radarAnalysisPackage?.analysisVersionId || null,
      analysisMode: input.radarAnalysisPackage?.analysisMode || null,
      analysisEnforcement: input.radarAnalysisPackage?.analysisEnforcement || null,
      packageHash: input.radarAnalysisPackage?.packageHash || null,
      requirements: radarRequirements,
      recommendations: radarRecommendations,
      observedData: radarObservedData,
      humanDecisions: radarHumanDecisions,
      evidencePackage: input.radarAnalysisPackage?.evidencePackage || null,
    },
    review: { workflowStatus: "awaiting_review", publicationStatus: "not_started", transferStatus: "not_sent", humanNotes: input.humanNotes || [] },
    gabarito: { globalWords: radarEvidence.wordRange || { min: null, ideal: null, max: null }, paragraphRange: paragraphRange || { min: null, max: null }, estimatedParagraphs, tone: null, depth: null, detail: null, counts: { h2: sections.filter(section => section.level === 2).length, h3: sections.filter(section => section.level === 3).length, intro: 1, conclusion: 1, faq: 0, tables: 0, comparisons: 0, checklists: 0, lists: 0, quotes: 0, images: images.length, internalLinks: 0, externalLinks: 0, cta: 1, specialBlocks: 0 }, alerts: [...(radarEvidence.wordRange ? [] : ["Amostra de extensão recebida ainda não disponível; a faixa deve ser definida por uma pessoa."]), ...(article?.internalLinks?.length ? ["Há referências de links internos recebidas do ArticleDNA que ainda precisam ser hidratadas em destinos estruturados."] : [])], humanDecision: gabaritoHumanDecision },
    blocks: [{ id: `block:intro:${input.editorialUnitId}`, type: "intro" as const, sectionId: null, order: 0, objective: "Apresentar a promessa da unidade.", instructions: [], origin: "planner" as const, humanDecision: null, alert: null }, ...imageBlocks, { id: `block:conclusion:${input.editorialUnitId}`, type: "conclusion" as const, sectionId: null, order: images.length + 1, objective: "Concluir sem introduzir novo tema.", instructions: [], origin: "planner" as const, humanDecision: null, alert: null }],
    questions,
    entities,
    objections,
    guardianInstructions: ["Não escrever parágrafos fora da estrutura aprovada.", "Registrar lacunas de fonte e evidência como pendência.", "Não gerar FAQ automaticamente; perguntas recebidas devem ser associadas às seções aprovadas.", "Prompts de imagem permanecem pendentes nesta etapa; não executar geração automaticamente.", ...(article?.internalLinks?.length ? ["Não inventar destinos de links internos; hidratar cada referência antes de aprovar."] : []), ...(article?.evidenceNeeded?.length ? [`Evidências requeridas pelo ArticleDNA: ${article.evidenceNeeded.join(" · ")}`] : []), ...(radarRequirements.length ? [`Requisitos recebidos do Radar: ${radarRequirements.join(" · ")}`] : [])],
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
  const details = buildDetails(input, keywordRefs, evidenceRefs);
  const radarEvidence = readPlannerRadarEvidence(input.radarAnalysisPackage);
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
    approvedOutline: details.structure.sections.map(section => ({ id: section.id, heading: section.heading, objective: section.objective, keywordDnaRefs: section.keywordDnaRefs })),
    writingInstructions: [article?.angle || input.siloPage?.payload.visualBriefing || "Seguir o plano aprovado e registrar qualquer lacuna como pendência."].filter(Boolean),
    humanPendingDecisions: ["Revisar estrutura, links, fontes, CTA, imagens e metadados antes da aprovação.", ...(radarEvidence.isApprovedHandoff ? [] : ["Nenhum pacote Radar aprovado foi anexado ao plano."])],
    planning: details,
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
