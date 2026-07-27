import assert from "node:assert/strict";
import test from "node:test";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { createDefinitiveContentPlan } from "../lib/planejador/content-plan.ts";
import { applyStrategicContext, buildPlannerStrategicContext, selectApprovedBrandDna } from "../lib/planejador/strategic-context.ts";

const reference = (id: string, role: "principal" | "secundaria") => ({ keywordId: id, keywordDnaVersionId: `legacy:${id}:v1`, keywordDnaContentHash: `legacy:${id}`, role, strategicContribution: "Cobertura", coveredIntentions: ["informacional"], requiredTopics: ["tema"], excludedTopics: [], classificationOrigin: "legacy" as const, confidence: 0.8, humanConfirmed: true });
const article = {
  schemaVersion: 1 as const, articleId: "article-context", brandId: "brand-1", principalKeywordId: "kw-1", secondaryKeywordIds: ["kw-2"], narrativeReinforcementIds: [], keywordReferences: [reference("kw-1", "principal"), reference("kw-2", "secundaria")], siloId: "silo-1", hierarchy: "Suporte" as const, suggestedSlug: "artigo-contexto", canonical: null,
  mainIntent: "informacional", auxiliaryIntents: [], audience: "Gestores", problem: "Problema", desiredResult: "Resultado", journeyStage: "consideracao", brandObjective: "Crescer", promise: "Promessa", angle: "Angulo", cta: "Fale com a equipe", coverage: ["tema"], excludedSubjects: [], antiCannibalizationBoundary: "Fronteira humana", nearbyArticleIds: [], differentiation: [], entities: ["Entidade"], requiredTopics: ["Tema"], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.8, humanPendingDecisions: [],
};

test("contexto estratégico filtra por marca e seleciona somente fontes disponíveis", async () => {
  const version = await createVersionEnvelope({ entityId: "brand-1", versionNumber: 3, origin: "human", changeReason: "Fixture", createdBy: "human", payload: { schemaVersion: 1 as const, brandId: "brand-1", positioning: "Posicionamento", audience: ["Clínicas"], voice: ["Clara"], businessObjectives: ["Crescer"], differentiators: ["Experiência"], prohibitedClaims: ["Promessa absoluta"], editorialPrinciples: ["Explicar antes de vender"] } });
  const context = buildPlannerStrategicContext({ brandId: "brand-1", brand: { id: "brand-1", nome: "Marca 1", nicho: "Estética", dna_diretrizes: null }, brandDna: version, skills: [{ id: "skill-1", brandId: "brand-1", name: "Clareza", description: "Escrever com clareza", rules: ["Regra"], status: "approved", origin: "local" }], prompts: [{ id: "prompt-other", brandId: "brand-2", name: "Outra marca", purpose: "Não deve aparecer", content: "não usar", scope: "brand", status: "approved", origin: "local", skillId: null }], materials: [{ id: "material-1", brandId: "brand-1", name: "Guia", type: "voice_guide", origin: "real", status: "available" }] });
  assert.equal(context.brandDnaStatus, "approved");
  assert.deepEqual(context.skills.map(item => item.id), ["skill-1"]);
  assert.deepEqual(context.prompts, []);
  assert.equal(context.materials[0]?.label, "Guia");
  const approved = selectApprovedBrandDna({ versions: [version], events: [{ versionId: version.versionId, status: "approved" }], activeVersionId: version.versionId, brandId: "brand-1" });
  assert.equal(approved?.versionId, version.versionId);
});

test("aplicar contexto é idempotente e preserva decisão humana", async () => {
  const articleVersion = await createVersionEnvelope({ entityId: article.articleId, versionNumber: 1, origin: "human", changeReason: "Fixture", createdBy: "human", payload: article });
  const plan = await createDefinitiveContentPlan({ brandId: "brand-1", editorialUnitType: "article", editorialUnitId: article.articleId, article: articleVersion }, "human");
  const context = buildPlannerStrategicContext({ brandId: "brand-1", brand: { id: "brand-1", nome: "Marca 1", nicho: null, dna_diretrizes: null }, brandDna: await createVersionEnvelope({ entityId: "brand-1", versionNumber: 1, origin: "human", changeReason: "Fixture", createdBy: "human", payload: { schemaVersion: 1 as const, brandId: "brand-1", positioning: "Posicionamento", audience: ["Clínicas"], voice: ["Clara"], businessObjectives: ["Crescer"], differentiators: ["Diferencial da marca"], prohibitedClaims: ["Não prometer resultado"], editorialPrinciples: ["Ser claro"] } }), skills: [{ id: "skill-1", brandId: "brand-1", name: "Clareza", description: "Regra", rules: [], status: "approved", origin: "local" }] });
  const human = structuredClone(plan.payload.planning!); human.strategy.differentiation = ["Decisão humana"];
  const applied = applyStrategicContext({ details: human, context, selectedSourceIds: ["skill-1"] });
  const appliedAgain = applyStrategicContext({ details: applied, context, selectedSourceIds: ["skill-1"] });
  assert.deepEqual(applied.strategy.differentiation, ["Decisão humana"]);
  assert.deepEqual(applied.skills.skillIds, ["skill-1"]);
  assert.equal(applied.strategyContext?.sourceRefs.length, appliedAgain.strategyContext?.sourceRefs.length);
  assert.ok(applied.strategyContext?.conflicts.some(item => /preservados/.test(item)));
});
