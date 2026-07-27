import assert from "node:assert/strict";
import test from "node:test";
import { collectSerperSnapshot, SerperProviderError } from "../lib/radar/serper-provider-core.ts";
import { isTechnicalKeyword, resolvePrimaryKeyword } from "../lib/radar/keyword-resolver.ts";

const originalEnv = { ...process.env };
const input = { brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "article-1-v1", keywordId: "kw-1", keywordDnaVersionId: "kw-1-v1", keyword: "captação de pacientes sem tráfego pago", location: "São Paulo, Brasil", language: "pt-BR", device: "desktop" as const, expectedIntent: "informational", expectedFormat: "Pilar", requiredTopics: ["captação de pacientes"], articleEntities: ["pacientes"], resultLimit: 10, version: 1, previousSnapshotId: null };
const fixture = { organic: [
  { position: 1, title: "Como captar pacientes sem tráfego pago", link: "https://example.com/blog/captar-pacientes", snippet: "Guia prático para clínicas." },
  { position: 2, title: "Agência para clínicas", link: "https://example.org/servicos/clinicas", snippet: "Serviços de aquisição." },
], peopleAlsoAsk: [{ question: "Como captar pacientes?", snippet: "Resposta resumida." }], relatedSearches: [{ query: "captação de pacientes clínica" }], knowledgeGraph: { title: "Captação de pacientes", type: "Topic", description: "Tema", website: "https://example.com", attributes: { idioma: "pt-BR" }, sources: [{ title: "Fonte", link: "https://example.com/fonte" }] } };

function configure() { process.env.SERP_PROVIDER = "serper"; process.env.SERPER_API_KEY = "test-key-never-real"; process.env.SERPER_API_BASE_URL = "https://google.serper.dev"; process.env.SERP_DEFAULT_COUNTRY = "br"; process.env.SERP_DEFAULT_LANGUAGE = "pt-br"; process.env.SERP_DEFAULT_RESULTS = "10"; process.env.SERP_TIMEOUT_MS = "30000"; }
function restore() { for (const key of ["SERP_PROVIDER", "SERPER_API_KEY", "SERPER_API_BASE_URL", "SERP_DEFAULT_COUNTRY", "SERP_DEFAULT_LANGUAGE", "SERP_DEFAULT_RESULTS", "SERP_TIMEOUT_MS"]) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; } }

test.afterEach(restore);

test("normaliza Serper, gera diagnóstico e hash sem expor a chave", async () => {
  configure(); let request: Request | null = null;
  const snapshot = await collectSerperSnapshot(input, async (url, init) => { request = new Request(url, init); return new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } }); });
  assert.equal(snapshot.origin, "real"); assert.equal(snapshot.isMock, false); assert.equal(snapshot.status, "needs_review"); assert.equal(snapshot.diagnostic.dominantFormats.length > 0, true); assert.equal(snapshot.peopleAlsoAsk[0]?.question, "Como captar pacientes?"); assert.equal(snapshot.relatedSearches[0]?.term, "captação de pacientes clínica"); assert.match(snapshot.contentHash, /^[a-f0-9]{64}$/); const capturedRequest = request as unknown as Request; assert.equal(capturedRequest.headers.get("X-API-KEY"), "test-key-never-real"); assert.equal(JSON.stringify(snapshot).includes("test-key-never-real"), false);
  const second = await collectSerperSnapshot({ ...input, version: 2, previousSnapshotId: snapshot.id }, async () => new Response(JSON.stringify(fixture), { status: 200 })); assert.equal(second.contentHash, snapshot.contentHash); assert.notEqual(second.id, snapshot.id); assert.equal(second.previousSnapshotId, snapshot.id);
});

test("bloqueia configuração ausente, URL inválida e timeout", async () => {
  configure(); delete process.env.SERPER_API_KEY; await assert.rejects(() => collectSerperSnapshot(input, async () => new Response("{}")), (error: unknown) => error instanceof SerperProviderError && error.code === "not_configured");
  configure(); await assert.rejects(() => collectSerperSnapshot(input, async () => new Response(JSON.stringify({ organic: [{ title: "inválido", link: "não-é-url" }] }), { status: 200 })), (error: unknown) => error instanceof SerperProviderError && error.code === "invalid_response");
  configure(); process.env.SERP_TIMEOUT_MS = "1000"; await assert.rejects(() => collectSerperSnapshot(input, async (_url, init) => new Promise((_, reject) => { init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); })), (error: unknown) => error instanceof SerperProviderError && error.code === "timeout");
});

test("resolve a keyword textual e bloqueia identificadores técnicos", async () => {
  assert.equal(isTechnicalKeyword("pub-k-123"), true); assert.equal(isTechnicalKeyword("550e8400-e29b-41d4-a716-446655440000"), true); assert.equal(isTechnicalKeyword("captação de pacientes"), false);
  const article = { brandId: "brand-1", principalKeywordId: "kw-1", keywordReferences: [{ keywordId: "kw-1", role: "principal", keywordDnaVersionId: "kw-v1" }] } as never;
  const resolved = resolvePrimaryKeyword({ brandId: "brand-1", article, keywords: [{ id: "kw-1", keyword: "captação de pacientes", lista_id: "silo-1" }], allowedSiloIds: ["silo-1"] }); assert.equal(resolved.ok, true); if (resolved.ok) assert.equal(resolved.keyword, "captação de pacientes");
  const blocked = resolvePrimaryKeyword({ brandId: "brand-1", article, keywords: [{ id: "kw-1", keyword: "pub-k-123", lista_id: "silo-1" }], allowedSiloIds: ["silo-1"] }); assert.equal(blocked.ok, false);
});
