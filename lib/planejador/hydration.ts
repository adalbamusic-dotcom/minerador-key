import type { ArticleDNA, ContentPlan, SiloDNA, SiloPage, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { EditorialSnapshot, SerpCollectionRecord, SerpReviewRecord } from "../editorial/contracts.ts";
import type { PlannerItem } from "../editorial/operational-flow.ts";
import type { RadarHydrationSnapshot } from "../radar/hydration.ts";
import type { PlannerPublicationIdentity } from "./publication-identity.ts";

export const UNHYDRATED_REFERENCE = "Referência não hidratada";

export type HydratedReference = {
  label: string;
  hydrated: boolean;
  technical: { id: string; type: string; origin: string; expectedVersion: string | null; reason: string };
};

export type PlannerHydrationInput = {
  brandId: string;
  snapshot: EditorialSnapshot | null;
  item: PlannerItem;
  plan: VersionEnvelope<ContentPlan> | null;
  article: VersionEnvelope<ArticleDNA> | null;
  silo: VersionEnvelope<SiloDNA> | null;
  siloPage: VersionEnvelope<SiloPage> | null;
  serpRecords: SerpCollectionRecord[];
  serpReviews: SerpReviewRecord[];
  document: { id: string; contentPlanRef: { versionId: string }; articleDnaRef: { entityId: string } } | null;
  radarHydration?: RadarHydrationSnapshot | null;
  publicationIdentity?: PlannerPublicationIdentity | null;
};

export type PlannerHydration = {
  item: PlannerItem;
  unitLabel: string;
  primaryKeyword: HydratedReference;
  secondaryKeywords: HydratedReference[];
  reinforcementKeywords: HydratedReference[];
  silo: HydratedReference;
  hierarchy: HydratedReference;
  articleDna: HydratedReference;
  siloDna: HydratedReference;
  siloPage: HydratedReference;
  plan: HydratedReference;
  document: HydratedReference;
  radar: {
    status: string;
    version: number | null;
    origin: "real" | "mock" | "absent";
    observedIntent: string | null;
    pageTypes: string[];
    results: Array<{ position: number; title: string; url: string; type: string }>;
    questions: string[];
    relatedSearches: string[];
    entities: string[];
    gaps: string[];
    conflicts: string[];
    review: string | null;
    updateAvailable: boolean;
  };
  observed: { intent: string | null; format: string | null; topics: string[] };
  recommendation: { intent: string | null; format: string | null; topics: string[] };
  humanDecision: { intent: string | null; notes: string[] };
  conflicts: string[];
  pending: string[];
  publicationStatus: string;
  transferStatus: string;
};

function reference(input: { id: string; type: string; origin?: string; expectedVersion?: string | null; label?: string | null; reason?: string }, hydrated: boolean): HydratedReference {
  return {
    label: hydrated && input.label?.trim() ? input.label : UNHYDRATED_REFERENCE,
    hydrated,
    technical: { id: input.id, type: input.type, origin: input.origin || "workspace", expectedVersion: input.expectedVersion || null, reason: hydrated ? "Resolvido no snapshot da marca." : input.reason || "A referência não está carregada ou não pertence à marca ativa." },
  };
}

function keywordReference(id: string, snapshot: EditorialSnapshot | null, expectedVersion: string | null, brandId: string, radarHydration: RadarHydrationSnapshot | null | undefined) {
  const snapshotBrandMatches = !snapshot || snapshot.brand.id === brandId;
  const keyword = snapshotBrandMatches ? snapshot?.keywords.find(candidate => candidate.id === id) : null;
  const radarKeyword = radarHydration?.keywordSnapshots.find(candidate => [candidate.referenceKeywordId, candidate.canonicalKeywordId, candidate.sourceKeywordId, candidate.originalKeywordId, ...candidate.aliases].includes(id)) || (radarHydration?.principalKeyword && [radarHydration.principalKeyword.referenceKeywordId, radarHydration.principalKeyword.canonicalKeywordId, radarHydration.principalKeyword.sourceKeywordId, radarHydration.principalKeyword.originalKeywordId, ...radarHydration.principalKeyword.aliases].includes(id) ? radarHydration.principalKeyword : null);
  const label = keyword?.keyword || radarKeyword?.keyword;
  const hydrated = Boolean(snapshotBrandMatches && label && (!radarKeyword || radarKeyword.brandId === brandId));
  return reference({ id, type: "KeywordDNA", origin: radarKeyword ? "radar_hydration" : keyword ? "legacy_snapshot" : "workspace", expectedVersion: expectedVersion || radarKeyword?.keywordDnaVersionId || null, label, reason: label ? radarKeyword ? "Keyword resolvida pela hidratação versionada transportada pelo Radar." : "Keyword encontrada no snapshot legado; versão KeywordDNA referenciada pelo ArticleDNA." : snapshot && !snapshotBrandMatches ? "Snapshot de keyword pertence a outra marca." : "Keyword não encontrada no snapshot da marca nem na hidratação do Radar." }, hydrated);
}

function absent(id: string, type: string, reason: string, expectedVersion: string | null = null) {
  return reference({ id, type, expectedVersion, reason }, false);
}

function latestSerp(input: PlannerHydrationInput) {
  return input.serpRecords.filter(record => record.input.articleId === input.item.articleId).sort((a, b) => (b.research?.version || 0) - (a.research?.version || 0))[0] || null;
}

export function hydratePlanner(input: PlannerHydrationInput): PlannerHydration {
  const details = input.plan?.payload.planning || null;
  const article = input.article?.payload || null;
  const page = input.siloPage?.payload || null;
  const principalId = article?.principalKeywordId || details?.metadata.principalKeywordId || input.item.articleId;
  const primaryKeyword = keywordReference(principalId, input.snapshot, article?.keywordReferences.find(ref => ref.keywordId === principalId)?.keywordDnaVersionId || null, input.brandId, input.radarHydration);
  const keywordRefs = article?.keywordReferences || [];
  const secondaryKeywords = keywordRefs.filter(ref => ref.role === "secundaria").map(ref => keywordReference(ref.keywordId, input.snapshot, ref.keywordDnaVersionId, input.brandId, input.radarHydration));
  const reinforcementKeywords = keywordRefs.filter(ref => ref.role === "reforco_narrativo").map(ref => keywordReference(ref.keywordId, input.snapshot, ref.keywordDnaVersionId, input.brandId, input.radarHydration));
  // Silo é etapa posterior a Artigos: a ausência é estado válido e vira referência ausente.
  const siloId = article?.siloId || page?.siloId || details?.siloId || input.item.siloId || "";
  const siloDto = input.snapshot?.silos.find(candidate => candidate.id === siloId && candidate.marca_id === input.brandId);
  const siloLabel = input.silo?.payload.centralEntity || input.radarHydration?.silo?.name || siloDto?.nome || null;
  const siloRef = siloLabel ? reference({ id: siloId, type: "Silo", origin: input.silo ? input.silo.origin : "legacy_snapshot", expectedVersion: input.silo?.versionId || input.radarHydration?.silo?.siloDnaVersionId || null, label: siloLabel }, true) : absent(siloId, "Silo", "Nome do silo não foi hidratado para a marca ativa.");
  const siloDnaRef = input.silo ? reference({ id: siloId, type: "SiloDNA", origin: input.silo.origin, expectedVersion: input.silo.versionId, label: input.silo.payload.centralEntity }, true) : absent(siloId, "SiloDNA", input.radarHydration?.silo?.siloDnaVersionId ? "A versão do SiloDNA está referenciada, mas seu payload não está carregado." : "SiloDNA não foi hidratado para a marca ativa.", input.radarHydration?.silo?.siloDnaVersionId || null);
  const hierarchyValue = article?.hierarchy || page ? (article?.hierarchy || "SiloPage") : input.item.format;
  const articleRef = input.article ? reference({ id: input.article.entityId, type: "ArticleDNA", origin: input.article.origin, expectedVersion: input.article.versionId, label: article?.promise || input.item.title }, true) : absent(input.item.articleId, "ArticleDNA", "ArticleDNA ausente no workspace da marca.");
  const pageRef = input.siloPage ? reference({ id: input.siloPage.entityId, type: "SiloPage", origin: input.siloPage.origin, expectedVersion: input.siloPage.versionId, label: page?.h1 || input.item.title }, true) : absent(input.item.articleId, "SiloPage", "Esta unidade não possui SiloPage hidratada.");
  const planRef = input.plan ? reference({ id: input.plan.entityId, type: "ContentPlan", origin: input.plan.origin, expectedVersion: input.plan.versionId, label: `ID · v${input.plan.versionNumber}` }, true) : absent(`plan:${input.item.articleId}`, "ContentPlan", "ContentPlan ainda não foi preparado.");
  const documentRef = input.document ? reference({ id: input.document.id, type: "ContentDocument", expectedVersion: input.document.contentPlanRef.versionId, label: "Documento associado" }, true) : absent(`document:${input.item.articleId}`, "ContentDocument", "Nenhum ContentDocument associado.");
  const serp = latestSerp(input);
  const research = serp?.research || null;
  const review = serp ? input.serpReviews.find(candidate => candidate.snapshotId === serp.id)?.status || null : null;
  const planRadarVersion = details?.radar.analysisVersionId || null;
  const updateAvailable = Boolean(research && planRadarVersion && research.id !== planRadarVersion && research.status !== "rejected");
  const conflicts = [...(research?.diagnostic.possibleConflicts || []), ...(details?.strategy.intentValidation === "conflict" ? ["Conflito de intenção entre origem, SERP e plano."] : [])];
  const pending = [...(input.plan?.payload.humanPendingDecisions || []), ...(details?.alerts || [])];
  return {
    item: input.item,
    unitLabel: input.item.unitType === "silo_page" ? "SiloPage" : "Artigo",
    primaryKeyword,
    secondaryKeywords,
    reinforcementKeywords,
    silo: siloRef,
    hierarchy: reference({ id: input.item.articleId, type: "EditorialUnit", label: hierarchyValue, reason: "Hierarquia não foi resolvida a partir da unidade editorial." }, Boolean(hierarchyValue)),
    articleDna: articleRef,
    siloDna: siloDnaRef,
    siloPage: pageRef,
    plan: planRef,
    document: documentRef,
    radar: {
      status: serp?.status || "not_requested", version: research?.version || null, origin: research ? (research.isMock ? "mock" : "real") : "absent",
      observedIntent: research?.diagnostic.dominantIntent || serp?.dnaIntent || null, pageTypes: research?.diagnostic.pageTypes || [],
      results: research?.organicResults.map(result => ({ position: result.position, title: result.title, url: result.url, type: result.manualType || result.inferredType })) || [],
      questions: research?.peopleAlsoAsk.map(item => item.question) || research?.diagnostic.questions || [], relatedSearches: research?.relatedSearches.map(item => item.term) || [],
      entities: research?.diagnostic.frequentEntities || [], gaps: research?.diagnostic.opportunities || [], conflicts, review, updateAvailable,
    },
    observed: { intent: research?.diagnostic.dominantIntent || null, format: research?.diagnostic.dominantFormats[0] || null, topics: research?.diagnostic.frequentEntities || [] },
    recommendation: { intent: details?.strategy.primaryIntent || null, format: input.item.format || null, topics: details?.structure.sections.flatMap(section => section.topics) || [] },
    humanDecision: { intent: details?.strategy.intentValidation === "validated" ? details.strategy.primaryIntent : null, notes: details?.review.humanNotes || [] },
    conflicts,
    pending,
    publicationStatus: input.publicationIdentity?.label || (details?.review.publicationStatus && details.review.publicationStatus !== "not_started" ? details.review.publicationStatus : "Situação de publicação não confirmada"),
    transferStatus: details?.review.transferStatus || "not_sent",
  };
}
