import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRadarSerpCollectPayload, RequestSchema } from "../lib/radar/serp/request.ts";
import { buildDataForSeoSerpOperationRequest, collectDataForSeoSerpSnapshot } from "../lib/server/dataforseo-serp-operation.ts";
import { DataForSeoSerpError } from "../lib/minerador/dataforseo-serp-core.ts";

const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const config = { login: "login", password: "password", baseUrl: "https://example.test", timeoutMs: 1_000, locationCode: 2076, languageCode: "pt" };
const input = {
  brandId,
  articleId: "article-1",
  articleDnaVersionId: "article-v1",
  keywordId: "keyword-1",
  keywordDnaVersionId: "keyword-v1",
  keyword: "marketing para clínicas",
  location: "Brasil",
  language: "pt-BR",
  device: "desktop" as const,
  expectedIntent: "informational",
  expectedFormat: "Pilar",
  requiredTopics: ["marketing"],
  articleEntities: ["clínicas"],
  resultLimit: 10,
  version: 1,
  previousSnapshotId: null,
};

const responseFixture = {
  status_code: 20000,
  tasks: [{
    id: "10000000-0000-4000-8000-000000000001",
    status_code: 20000,
    result: [{
      keyword: input.keyword,
      location_code: 2076,
      language_code: "pt",
      items: [
        { type: "organic", rank_absolute: 3, title: "Guia de marketing", url: "https://example.com/guia", description: "Estratégia para clínicas", sitelinks: [{ title: "Serviços", url: "https://example.com/servicos" }] },
        { type: "video", rank_absolute: 4, title: "Marketing para clínicas", url: "https://www.youtube.com/watch?v=abc", description: "Vídeo explicativo" },
        { type: "people_also_ask", items: [{ type: "question", question: "Como fazer marketing para clínicas?", description: "Resposta observada", title: "Fonte observada", url: "https://example.com/resposta" }] },
        { type: "related_searches", title: "marketing digital para clínicas" },
        { type: "knowledge_graph", title: "Marketing", entity_type: "Topic", description: "Descrição observada", url: "https://example.com/marketing", sources: [{ title: "Fonte", url: "https://example.com/fonte" }] },
      ],
    }],
  }],
};

test("a rota SERP do Radar usa apenas o DataForSEO canônico", async () => {
  const route = await readFile(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");
  assert.match(route, /resolveDataForSeoCanonicalSerpCompatibilityConfig/);
  assert.match(route, /collectDataForSeoSerpSnapshot/);
  assert.doesNotMatch(route, /collectSerperSnapshot|\bSerper\b|\bRapidAPI\b/i);
  assert.match(route, /RadarItemSchema\.safeParse\(\{ \.\.\.\(workflow\.payload as object\), id: workflow\.id \}\)/);
});

test("monta SERP orgânica DataForSEO com a keyword principal, sem allintitle", () => {
  const request = buildDataForSeoSerpOperationRequest({ keyword: input.keyword, locationCode: 2076, languageCode: "pt", device: "desktop", resultLimit: 10, operationRequestId: "operation-1" });
  assert.equal(request.query, input.keyword);
  assert.equal(request.body[0].keyword, input.keyword);
  assert.equal(request.body[0].location_code, 2076);
  assert.equal(request.body[0].language_code, "pt");
  assert.equal(request.body[0].device, "desktop");
  assert.doesNotMatch(request.body[0].keyword, /^allintitle:/);
});

test("normaliza orgânicos, vídeo, PAA, related e knowledge graph para o contrato Radar", async () => {
  let calledUrl = "";
  let calledBody = "";
  const snapshot = await collectDataForSeoSerpSnapshot(input, {
    config,
    operationRequestId: "10000000-0000-4000-8000-000000000010",
    fetchImpl: async (url, init) => {
      calledUrl = String(url);
      calledBody = String(init?.body || "");
      return new Response(JSON.stringify(responseFixture), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.match(calledUrl, /\/v3\/serp\/google\/organic\/live\/regular$/);
  assert.match(calledBody, /marketing para clínicas/);
  assert.equal(snapshot.provider, "dataforseo");
  assert.equal(snapshot.brandId, brandId);
  assert.equal(snapshot.query, input.keyword);
  assert.equal(snapshot.organicResults[0]?.position, 3);
  assert.equal(snapshot.organicResults[0]?.title, "Guia de marketing");
  assert.equal(snapshot.organicResults[0]?.url, "https://example.com/guia");
  assert.equal(snapshot.organicResults[0]?.snippet, "Estratégia para clínicas");
  assert.equal(snapshot.organicResults[0]?.sitelinks.length, 1);
  assert.equal(snapshot.organicResults[1]?.inferredType, "video");
  assert.equal(snapshot.peopleAlsoAsk[0]?.question, "Como fazer marketing para clínicas?");
  assert.equal(snapshot.relatedSearches[0]?.term, "marketing digital para clínicas");
  assert.equal(snapshot.knowledgeGraph?.title, "Marketing");
  assert.equal(JSON.stringify(snapshot).includes("password"), false);
});

test("SERP vazia continua válida e ausência de PAA/related não quebra", async () => {
  const empty = { ...responseFixture, tasks: [{ ...responseFixture.tasks[0], result: [{ ...responseFixture.tasks[0].result[0], items: [] }] }] };
  const snapshot = await collectDataForSeoSerpSnapshot(input, {
    config,
    operationRequestId: "10000000-0000-4000-8000-000000000011",
    fetchImpl: async () => new Response(JSON.stringify(empty), { status: 200 }),
  });
  assert.deepEqual(snapshot.organicResults, []);
  assert.deepEqual(snapshot.peopleAlsoAsk, []);
  assert.deepEqual(snapshot.relatedSearches, []);
  assert.equal(snapshot.diagnostic.verdict, "informacao_insuficiente");
});

test("erro de request DataForSEO é específico antes de iniciar fetch", () => {
  assert.throws(() => buildDataForSeoSerpOperationRequest({ keyword: "", locationCode: 2076, languageCode: "pt", device: "desktop", resultLimit: 10, operationRequestId: "operation-1" }), (error: unknown) => error instanceof DataForSeoSerpError && error.status === 400 && error.code === "dataforseo_invalid_response");
});

test("request do Radar não rejeita contexto local legado antes do fallback canônico", () => {
  const parsed = RequestSchema.parse({
    action: "collect",
    brandId,
    articleId: "article-1",
    articleDnaVersionId: "article-v1",
    location: "Brasil",
    language: "pt-BR",
    device: "desktop",
    articleVersion: { payload: { legacyField: true } },
    resolutionEnvelope: {
      schemaVersion: 1,
      brandId,
      radarItemId: "radar-1",
      articleId: "article-1",
      articleDna: { versionId: "article-v1", versionNumber: 1, contentHash: "legacy:article", publicationState: "approved" },
      principalKeyword: { referenceKeywordId: "keyword-1", canonicalKeywordId: null, sourceKeywordId: null, originalKeywordId: null, aliases: ["keyword-1"], keywordDnaVersionId: "keyword-v1", keyword: input.keyword, role: "principal", brandId, siloId: null, siloName: null, isPublished: false },
      silo: null,
      transfer: { sourceModule: "arquiteto", targetModule: "radar", source: "browser_hydration", transferredAt: "2026-08-25T12:00:00.000Z", importKey: "radar:article-1:article-v1:radar-1" },
      snapshotHash: `sha256:${"a".repeat(64)}`,
    },
  });
  assert.equal(parsed.action, "collect");
  assert.equal(parsed.articleDnaVersionId, "article-v1");
});

test("coleta individual e coletiva transportam o articleDnaVersionId do Radar sem confundir com articleId", () => {
  const makePayload = (articleId: string, articleDnaVersionId: string) => buildRadarSerpCollectPayload({
    brandId,
    articleId,
    articleDnaVersionId,
    location: "Brasil",
    language: "pt-BR",
    device: "desktop",
    resolutionEnvelope: {
      schemaVersion: 1,
      brandId,
      radarItemId: `radar:${articleId}`,
      articleId,
      articleDna: { versionId: articleDnaVersionId, versionNumber: 1, contentHash: "legacy:article", publicationState: "approved" },
      principalKeyword: { referenceKeywordId: "keyword-1", canonicalKeywordId: null, sourceKeywordId: null, originalKeywordId: null, aliases: ["keyword-1"], keywordDnaVersionId: "keyword-v1", keyword: input.keyword, role: "principal", brandId, siloId: null, siloName: null, isPublished: false },
      silo: null,
      transfer: { sourceModule: "arquiteto", targetModule: "radar", source: "browser_hydration", transferredAt: "2026-08-25T12:00:00.000Z", importKey: `radar:${articleId}:${articleDnaVersionId}:item` },
      snapshotHash: `sha256:${"a".repeat(64)}`,
    },
  });
  const individual = makePayload("article-individual", "article-v-individual");
  const collective = [makePayload("article-1", "article-v1"), makePayload("article-2", "article-v2")];
  assert.equal(individual.articleDnaVersionId, "article-v-individual");
  assert.equal(individual.articleId, "article-individual");
  assert.deepEqual(collective.map(payload => payload.articleDnaVersionId), ["article-v1", "article-v2"]);
  assert.ok(collective.every(payload => payload.articleDnaVersionId !== undefined));
  assert.doesNotThrow(() => RequestSchema.parse(individual));
  collective.forEach(payload => assert.doesNotThrow(() => RequestSchema.parse(payload)));
});

test("coleta bloqueia version do ArticleDNA ausente antes do fetch", () => {
  assert.throws(() => buildRadarSerpCollectPayload({
    brandId,
    articleId: "article-1",
    articleDnaVersionId: "   ",
    location: "Brasil",
    language: "pt-BR",
    device: "desktop",
    resolutionEnvelope: {} as never,
  }), /versão do ArticleDNA/);
});
