import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRemoteKeywordMatchesEnvelope,
  assertRadarWorkflowIdentityMatchesEnvelope,
  createRadarSerpResolutionEnvelope,
  hashRadarSerpResolutionEnvelope,
  validateRadarSerpResolutionEnvelope,
} from "../lib/radar/resolution-envelope.ts";
import { CollectRequestSchema } from "../lib/radar/serp/request.ts";

const brandId = "11111111-1111-4111-8111-111111111111";
const sourceKeyword = {
  id: "pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc",
  keywordId: "ddf1581f-60d6-4131-a8a6-90c6365f5acc",
  keyword: "captação de pacientes sem tráfego pago",
  lista_id: "22222222-2222-4222-8222-222222222222",
  siloName: "Captação sem tráfego pago",
  status: "publicado",
  isPublished: true,
};
const article = {
  articleId: "pub-b-33333333-3333-4333-8333-333333333333",
  brandId,
  principalKeywordId: sourceKeyword.id,
  siloId: sourceKeyword.lista_id,
  keywordReferences: [
    { keywordId: sourceKeyword.id, keywordDnaVersionId: "legacy:keyword-v1", role: "principal" },
    { keywordId: "support-1", keywordDnaVersionId: "legacy:support-v1", role: "secundaria" },
  ],
} as any;
const version = {
  versionId: "article-v1",
  entityId: article.articleId,
  versionNumber: 1,
  contentHash: "legacy:article-v1",
  origin: "import",
  changeReason: "fixture",
  createdAt: "2026-07-20T00:00:00.000Z",
  createdBy: "fixture",
  payload: article,
} as any;
const radarItem = { id: "radar:pub-b-33333333-3333-4333-8333-333333333333", articleId: article.articleId, articleDnaVersionId: version.versionId } as any;

test("a fronteira cliente -> rota preserva a keyword textual e o alias publicado", async () => {
  const envelope = await createRadarSerpResolutionEnvelope({ brandId, radarItem, article: version, articleDnaVersionId: radarItem.articleDnaVersionId, sourceKeywords: [sourceKeyword] });
  const requestBody = JSON.parse(JSON.stringify({ action: "collect", brandId, articleId: article.articleId, articleDnaVersionId: radarItem.articleDnaVersionId, location: "Brasil", language: "pt-BR", device: "desktop", resolutionEnvelope: envelope }));
  const receivedRequest = CollectRequestSchema.parse(requestBody);
  const received = await validateRadarSerpResolutionEnvelope(receivedRequest.resolutionEnvelope);

  assert.equal(received.principalKeyword.referenceKeywordId, sourceKeyword.id);
  assert.equal(received.principalKeyword.canonicalKeywordId, sourceKeyword.keywordId);
  assert.equal(received.principalKeyword.keyword, sourceKeyword.keyword);
  assert.equal(received.transfer.sourceModule, "arquiteto");
  assert.equal(received.transfer.targetModule, "radar");
  assert.match(received.snapshotHash, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotThrow(() => assertRemoteKeywordMatchesEnvelope(received, sourceKeyword.keyword));
});

test("hash adulterado e texto técnico bloqueiam a recuperação local", async () => {
  const envelope = await createRadarSerpResolutionEnvelope({ brandId, radarItem, article: version, articleDnaVersionId: radarItem.articleDnaVersionId, sourceKeywords: [sourceKeyword] });
  await assert.rejects(() => validateRadarSerpResolutionEnvelope({ ...envelope, principalKeyword: { ...envelope.principalKeyword, keyword: "outra keyword" } }), /hash inválido|alterada/);
  await assert.rejects(() => validateRadarSerpResolutionEnvelope({ ...envelope, principalKeyword: { ...envelope.principalKeyword, keyword: sourceKeyword.keyword }, snapshotHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" }), /hash inválido|alterada/);
  const technical = { ...envelope, principalKeyword: { ...envelope.principalKeyword, keyword: envelope.principalKeyword.canonicalKeywordId || "pub-k-technical" } };
  const { snapshotHash: _ignored, ...unsigned } = technical;
  const technicalHash = await hashRadarSerpResolutionEnvelope(unsigned);
  await assert.rejects(() => validateRadarSerpResolutionEnvelope({ ...technical, snapshotHash: technicalHash }), /texto da keyword/);
});

test("keyword remota divergente vira conflito antes do provedor", async () => {
  const envelope = await createRadarSerpResolutionEnvelope({ brandId, radarItem, article: version, articleDnaVersionId: radarItem.articleDnaVersionId, sourceKeywords: [sourceKeyword] });
  assert.throws(() => assertRemoteKeywordMatchesEnvelope(envelope, "captação de pacientes com anúncios"), /diverge/);
});

test("separa o RadarItem técnico do articleId canônico na resolução do workflow", async () => {
  const envelope = await createRadarSerpResolutionEnvelope({ brandId, radarItem, article: version, articleDnaVersionId: radarItem.articleDnaVersionId, sourceKeywords: [sourceKeyword] });
  const workflowId = "44444444-4444-4444-8444-444444444444";
  const base = {
    workflowId,
    workflowBrandId: brandId,
    workflowArticleId: article.articleId,
    workflowSourceVersionId: version.versionId,
    workflowPayload: { ...radarItem, brandId, articleId: article.articleId, articleDnaVersionId: version.versionId },
    brandId,
    articleId: article.articleId,
    articleDnaVersionId: version.versionId,
  };

  assert.notEqual(radarItem.id, radarItem.articleId);
  assert.doesNotThrow(() => assertRadarWorkflowIdentityMatchesEnvelope({ ...base, resolutionEnvelope: envelope }));
  assert.doesNotThrow(() => assertRadarWorkflowIdentityMatchesEnvelope({ ...base, resolutionEnvelope: { ...envelope, radarItemId: workflowId } }));
  assert.throws(() => assertRadarWorkflowIdentityMatchesEnvelope({ ...base, resolutionEnvelope: { ...envelope, radarItemId: "radar:other-article" } }), /não corresponde/);
  assert.throws(() => assertRadarWorkflowIdentityMatchesEnvelope({ ...base, workflowPayload: { ...base.workflowPayload, articleId: "other-article" }, resolutionEnvelope: envelope }), /não corresponde/);
  assert.throws(() => assertRadarWorkflowIdentityMatchesEnvelope({ ...base, workflowSourceVersionId: "article-v-other", resolutionEnvelope: { ...envelope, radarItemId: workflowId } }), /não corresponde/);
});
