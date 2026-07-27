import assert from "node:assert/strict";
import { type ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { createDefinitiveContentPlan } from "../lib/planejador/content-plan.ts";

const ref = (id: string, role: "principal" | "secundaria") => ({
  keywordId: id, keywordDnaVersionId: `fixture:${id}:v1`, keywordDnaContentHash: `legacy:${id}`,
  role, strategicContribution: role === "principal" ? "Núcleo" : "Cobertura semântica", coveredIntentions: ["informacional"], requiredTopics: ["fundamentos"], excludedTopics: [], classificationOrigin: "legacy" as const, confidence: 0.8, humanConfirmed: true,
});

const article: ArticleDNA = {
  schemaVersion: 1, articleId: "manual-keyword-strategy", brandId: "brand-manual", principalKeywordId: "kw-main", secondaryKeywordIds: ["kw-support"], narrativeReinforcementIds: [], keywordReferences: [ref("kw-main", "principal"), ref("kw-support", "secundaria")], siloId: "silo-manual", hierarchy: "Pilar", suggestedSlug: "estrategia-manual", canonical: null, mainIntent: "informacional", auxiliaryIntents: [], audience: "Leitores", problem: "Falta de clareza", desiredResult: "Plano interpretável", journeyStage: "consideracao", brandObjective: "Ensinar", promise: "Explicar a estratégia", angle: "Critérios verificáveis", cta: "Revisar", coverage: ["fundamentos"], excludedSubjects: [], antiCannibalizationBoundary: "Não cobrir outro tema", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: ["Fundamentos"], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.8, humanPendingDecisions: [],
};

const envelope = await createVersionEnvelope({ entityId: article.articleId, versionNumber: 1, origin: "human", changeReason: "Fixture manual", createdBy: "manual", payload: article });
const plan = await createDefinitiveContentPlan({ brandId: article.brandId, editorialUnitType: "article", editorialUnitId: article.articleId, article: envelope }, "manual");
const strategy = plan.payload.planning?.keywordStrategy;
assert.equal(strategy?.keywordCount, 2);
assert.equal(strategy?.maxKeywords, 6);
assert.equal(strategy?.volume.coverage, "unavailable");
assert.equal(strategy?.kgr.status, "unknown");
console.log("manual keyword strategy check: OK");
