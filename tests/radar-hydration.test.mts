import assert from "node:assert/strict";
import test from "node:test";
import { ArticleDNASchema, type ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { importArticlesToRadar, RadarItemSchema } from "../lib/editorial/operational-flow.ts";
import { createRadarHydrationSnapshot, reconcileRadarItems } from "../lib/radar/hydration.ts";
import { resolvePrimaryKeyword } from "../lib/radar/keyword-resolver.ts";

const brandId = "11111111-1111-4111-8111-111111111111";
const sourceKeyword = { id: "pub-k-22222222-2222-4222-8222-222222222222", keywordId: "22222222-2222-4222-8222-222222222222", keyword: "captação de pacientes sem tráfego pago", lista_id: "silo-leads", siloName: "LEADS SEM TRÁFEGO PAGO", status: "publicado", isPublished: true };
/**
 * A fixture é PARSEADA pelo schema vigente, não montada com `as any`.
 *
 * A versão anterior declarava cinco campos e confiava no cast. Quando o
 * contrato passou a exigir `confidence` — de onde `fallbackHierarchyStrategy`
 * tira `score` e os `components`, e `fallbackPurpose` tira o propósito —, o
 * import quebrou dentro do código de produção, e a fixture não tinha como
 * acusar que era ela a desatualizada.
 *
 * Parsear aqui inverte isso: uma mudança futura do ArticleDNA falha nesta
 * linha, com o nome do campo, antes de qualquer teste rodar.
 */
const referencia = (keywordId: string, role: "principal" | "secundaria", versionId: string) => ({
  keywordId, keywordDnaVersionId: versionId, keywordDnaContentHash: `sha256:${"0".repeat(64)}`, role,
  strategicContribution: role === "principal" ? "Núcleo do artigo." : "Amplia a cobertura da principal.",
  coveredIntentions: ["informacional"], requiredTopics: [], excludedTopics: [],
  classificationOrigin: "legacy" as const, confidence: 0.7, humanConfirmed: true,
});
const article: ArticleDNA = ArticleDNASchema.parse({
  schemaVersion: 1,
  articleId: "pub-b-33333333-3333-4333-8333-333333333333", brandId,
  principalKeywordId: sourceKeyword.id, secondaryKeywordIds: ["support-1", "support-2"], narrativeReinforcementIds: [],
  keywordReferences: [
    referencia(sourceKeyword.id, "principal", "legacy:keyword-v1"),
    referencia("support-1", "secundaria", "legacy:support-v1"),
    referencia("support-2", "secundaria", "legacy:support-2-v1"),
  ],
  siloId: "silo-leads", hierarchy: "Pilar", suggestedSlug: "captacao-de-pacientes-sem-trafego-pago",
  canonical: null, mainIntent: "informacional", auxiliaryIntents: [],
  audience: "Clínicas que dependem de indicação.", problem: "Captação parada sem verba de anúncio.",
  desiredResult: "Fluxo previsível de pacientes sem tráfego pago.", journeyStage: "consideração",
  brandObjective: "Autoridade em captação orgânica.", promise: "Cobrir captação de pacientes",
  angle: "Prática, com passos verificáveis.", cta: "Fale com a clínica.",
  coverage: ["captação orgânica"], excludedSubjects: [], antiCannibalizationBoundary: "Não cobre mídia paga.",
  nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [], questions: [], objections: [],
  evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [],
  confidence: 0.72, humanPendingDecisions: [],
});
const version = { versionId: "article-v1", entityId: article.articleId, versionNumber: 1, previousVersionId: null, contentHash: "legacy:article-v1", origin: "import", changeReason: "fixture", createdAt: "2026-07-20T00:00:00.000Z", createdBy: "fixture", payload: article } as any;

test("hidrata publicado por alias pub-k e preserva o texto canônico", () => {
  const hydration = createRadarHydrationSnapshot({ brandId, article: version, sourceKeywords: [sourceKeyword, { id: "support-1", keyword: "captação orgânica", lista_id: "silo-leads" }, { id: "support-2", keyword: "pacientes sem anúncios", lista_id: "silo-leads" }], source: "arquiteto_import", capturedAt: "2026-07-20T00:00:00.000Z" });
  assert.ok(hydration);
  assert.equal(hydration.principalKeyword?.keyword, "captação de pacientes sem tráfego pago");
  assert.equal(hydration.principalKeyword?.canonicalKeywordId, sourceKeyword.keywordId);
  assert.ok(hydration.principalKeyword?.aliases.includes(sourceKeyword.id));
  assert.equal(hydration.silo?.name, "LEADS SEM TRÁFEGO PAGO");
  const resolved = resolvePrimaryKeyword({ brandId, article, keywords: [{ id: sourceKeyword.keywordId, keyword: sourceKeyword.keyword, lista_id: sourceKeyword.lista_id, brandId, aliases: [sourceKeyword.id] }], allowedSiloIds: [sourceKeyword.lista_id] });
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.keyword, "captação de pacientes sem tráfego pago");
});

test("reconcilia item antigo do Radar sem duplicar nem alterar identidade", () => {
  const imported = importArticlesToRadar([], [{ ...version, payload: { ...article, promise: "Cobrir captação de pacientes", suggestedSlug: "captacao-de-pacientes-sem-trafego-pago", hierarchy: "Pilar", mainIntent: "informacional" } }], brandId, "2026-07-20T00:00:00.000Z", [sourceKeyword, { id: "support-1", keyword: "captação orgânica", lista_id: "silo-leads" }, { id: "support-2", keyword: "pacientes sem anúncios", lista_id: "silo-leads" }])[0];
  assert.equal(imported.hydration?.principalKeyword?.keyword, "captação de pacientes sem tráfego pago");
  const old = RadarItemSchema.parse({ ...imported, hydration: null });
  const repaired = reconcileRadarItems([old], { [article.articleId]: version }, brandId, [sourceKeyword, { id: "support-1", keyword: "captação orgânica", lista_id: "silo-leads" }, { id: "support-2", keyword: "pacientes sem anúncios", lista_id: "silo-leads" }]);
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].id, old.id);
  assert.equal(repaired[0].articleId, old.articleId);
  assert.equal(repaired[0].hydration?.source, "reconciled");
  assert.equal(repaired[0].hydration?.principalKeyword?.keyword, "captação de pacientes sem tráfego pago");
});
