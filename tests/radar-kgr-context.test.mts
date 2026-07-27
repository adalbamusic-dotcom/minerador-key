import assert from "node:assert/strict";
import test from "node:test";
import { analysisApprovalIssues, suggestRadarAnalysisMode } from "../lib/radar/analysis-contracts.ts";
import { buildRadarEvidencePackage } from "../lib/radar/evidence-package.ts";
import { buildRadarKgrStrategy } from "../lib/radar/strategy-context.ts";

const reference = (id: string, role: "principal" | "secundaria" | "reforco_narrativo", volume: number) => ({
  keywordId: id, keywordDnaVersionId: `kw-${id}-v1`, keywordDnaContentHash: `legacy:${id}`, role,
  strategicContribution: role === "principal" ? "Núcleo" : role === "secundaria" ? "Cobertura de demanda" : "Cobertura semântica",
  coveredIntentions: ["informational"], requiredTopics: [], excludedTopics: [], classificationOrigin: "import" as const,
  confidence: 0.9, humanConfirmed: true, volume, contribution: role === "principal" ? "central" as const : role === "secundaria" ? "incremental_volume" as const : "semantic_coverage" as const,
  purpose: role === "principal" ? "Núcleo do artigo." : role === "secundaria" ? "Ampliar cobertura." : "Reforçar entidades.",
});
type FixtureReference = ReturnType<typeof reference>;

const article = (refs: FixtureReference[] = [reference("principal", "principal", 480), reference("sec-1", "secundaria", 320), reference("sec-2", "secundaria", 600), reference("ref-1", "reforco_narrativo", 0)]) => ({
  schemaVersion: 1, articleId: "article-kgr", brandId: "brand-1", principalKeywordId: "principal", secondaryKeywordIds: refs.filter(ref => ref.role === "secundaria").map(ref => ref.keywordId), narrativeReinforcementIds: refs.filter(ref => ref.role === "reforco_narrativo").map(ref => ref.keywordId),
  keywordReferences: refs.map(ref => ref.keywordId === "principal" ? { ...ref, keywordDnaSnapshot: { sourceKeywordSnapshot: { keyword: "tráfego pago vs orgânico para clínica de estética" } } } : ref), siloId: "silo-1", hierarchy: "Suporte", suggestedSlug: "trafego-pago-vs-organico-para-clinica-de-estetica", canonical: null, mainIntent: "informational", auxiliaryIntents: [], audience: "Gestores de clínicas", problem: "Baixa demanda própria", desiredResult: "Captação orgânica", journeyStage: "consideração", brandObjective: "Crescer", promise: "Tráfego pago vs orgânico para clínica de estética", angle: "Comparação estratégica", cta: "Conheça a metodologia", coverage: ["tráfego", "captação"], excludedSubjects: [], antiCannibalizationBoundary: "Não cobrir mídia paga isoladamente", nearbyArticleIds: [], differentiation: ["Estratégia própria"], entities: ["clínica"], requiredTopics: ["Comparação"], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.9, humanPendingDecisions: [],
  kgrIdentity: { isKgrArticle: true, source: "minerador", principalKeywordDnaId: "dna-principal", boundSlug: "trafego-pago-vs-organico-para-clinica-de-estetica", bindingStatus: "confirmed", status: "confirmed", primaryKeywordId: "principal", primaryVolume: 480, kgrValue: 0.8 },
  volumeStrategy: { primaryKeywordVolume: 480, secondaryKeywordVolumeSum: 920, reinforcementKeywordVolumeSum: 0, grossCombinedVolume: 1400, adjustedCombinedVolume: 1050, overlapRisk: "medium", volumePurpose: "expand_reach", contributions: refs.map(ref => ({ keywordId: ref.keywordId, keywordDnaId: ref.keywordDnaVersionId, role: ref.role, volume: ref.volume, incrementalVolume: null, contribution: ref.contribution, rationale: ref.purpose })), calculationVersion: "fixture" },
  hierarchyStrategy: { role: "Suporte", status: "human_confirmed", score: 0.8, rank: 2, components: { volume: 0.8, semanticCentrality: 0.8, topicalBreadth: 0.8, siloLinkCapacity: 0.8, businessPriority: 0.8 }, rationale: ["Fixture recebido"], calculationVersion: "fixture" },
}) as never;

test("preserva KGR recebido, composição, volumes, slug e hierarquia sem recalcular", () => {
  const strategy = buildRadarKgrStrategy({ article: article(), published: false, slug: "trafego-pago-vs-organico-para-clinica-de-estetica", siloName: "Leads sem Tráfego Pago", pillarArticleId: "pillar-1" });
  assert.equal(strategy?.classification, "confirmed_kgr");
  assert.equal(strategy?.source, "minerador");
  assert.equal(strategy?.kgrScore, 0.8);
  assert.equal(strategy?.slugAlignment, "aligned");
  assert.deepEqual(strategy?.keywordComposition, { principalCount: 1, secondaryCount: 2, reinforcementCount: 1, totalCount: 4, strategicLimit: 6 });
  assert.equal(strategy?.declaredVolumes.grossCombinedTotal, 1400);
  assert.equal(strategy?.declaredVolumes.overlapWarning, true);
  assert.equal(strategy?.hierarchy.role, "support");
  assert.equal(strategy?.hierarchy.supportOrder, 2);
});

test("publicado permanece protegido mesmo com identidade historicamente desalinhada", () => {
  const publishedArticle = article() as unknown as Record<string, unknown>;
  const strategy = buildRadarKgrStrategy({ article: { ...publishedArticle, suggestedSlug: "slug-historico" } as never, published: true, slug: "slug-historico" });
  assert.equal(strategy?.slugAlignment, "protected_published_identity");
  assert.deepEqual(strategy?.publicationProtection.protectedFields, ["principalKeyword", "slug", "canonical", "brand", "publishedUrl", "structuralUrl"]);
});

test("classificação KGR recebida controla a sugestão sem recalcular por score atual", () => {
  const recommendation = suggestRadarAnalysisMode({ kgr: 0.8, volume: 480, resultCount: 10, keywordDnaConfidence: null, format: "article", intent: "informational", kgrClassification: "confirmed_kgr" });
  assert.equal(recommendation.suggestedMode, "kgr_light");
  assert.match(recommendation.reasons[0] || "", /recebida/);
});

test("classificação recebida como não-KGR sugere competitivo sem inventar KGR", () => {
  const recommendation = suggestRadarAnalysisMode({ kgr: 0.01, volume: 50, resultCount: 10, keywordDnaConfidence: null, format: "article", intent: "informational", kgrClassification: "not_kgr" });
  assert.equal(recommendation.suggestedMode, "competitive_full");
  assert.match(recommendation.reasons[0] || "", /não é KGR/);
});

test("overflow legado fica visível e bloqueia apenas a consolidação", () => {
  const refs = [...((article() as unknown as { keywordReferences: FixtureReference[] }).keywordReferences), reference("extra-1", "secundaria", 10), reference("extra-2", "secundaria", 10), reference("extra-3", "secundaria", 10)];
  const strategy = buildRadarKgrStrategy({ article: article(refs), published: false, slug: "slug-historico" });
  assert.equal(strategy?.keywordComposition.totalCount, 7);
  const issues = analysisApprovalIssues({ payload: { mode: "kgr_light", extractions: [], serpDecisions: [], selectedCompetitorIds: [], keywordDecisions: [] } } as never, strategy);
  assert.match(issues.join(" "), /acima do limite estratégico de 6/);
});

test("pacote aprovado transporta kgrStrategy de forma aditiva", async () => {
  const strategy = buildRadarKgrStrategy({ article: article(), published: false, slug: "trafego-pago-vs-organico-para-clinica-de-estetica" });
  const pkg = await buildRadarEvidencePackage({ brandId: "brand-1", articleId: "article-kgr", mode: "kgr_light", modeHumanReason: "fixture", serpSnapshotId: "serp-1", serpSnapshotVersion: 1, serpSnapshotHash: "hash", benchmark: null, serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [], humanNotes: [] } as never, { radarItemId: "radar:article-kgr", analysisVersionId: "analysis-1", analysisVersionNumber: 1, selectedBy: "human", kgrStrategy: strategy, research: { id: "serp-1", articleDnaVersionId: "article-dna-1", version: 1, contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", provider: "serper", query: "keyword", collectedAt: "2026-07-21T12:00:00.000Z", peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, diagnostic: { frequentEntities: [], questions: [], possibleConflicts: [] } } as never });
  assert.equal(pkg.kgrStrategy?.keywordComposition.totalCount, 4);
  assert.equal(pkg.kgrStrategy?.declaredVolumes.overlapWarning, true);
  assert.match(pkg.hash, /^sha256:/);
});
