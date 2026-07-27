import assert from "node:assert/strict";
import test from "node:test";
import { createMockPlanAndDocument } from "../lib/editorial/providers.ts";
import { OperationalPublicationSchema } from "../lib/editorial/operational-flow.ts";
import { PublicationActionRequestSchema } from "../lib/publicacoes/contracts.ts";
import { applyPublicationAction } from "../lib/publicacoes/domain.ts";
import { createPublicationExport, createPublicationsCsv } from "../lib/publicacoes/export.ts";

const now = "2026-07-20T12:00:00.000Z";

function publication(overrides: Record<string, unknown> = {}) {
  return OperationalPublicationSchema.parse({
    id: "publication:article-1", brandId: "brand-1", articleId: "article-1", plannerItemId: "planner:article-1", contentPlanVersionId: "plan:1", documentId: "document:article-1",
    title: "Artigo de teste", slug: "artigo-de-teste", siloId: "silo-1", hierarchy: "suporte", state: "ready_to_export", responsible: null, destination: null,
    createdAt: now, updatedAt: now, origin: "local", lockVersion: 1, unitType: "article", ...overrides,
  });
}

function action(current: ReturnType<typeof publication>, value: Record<string, unknown>) {
  return PublicationActionRequestSchema.parse({ brandId: current.brandId, publicationId: current.id, expectedLockVersion: current.lockVersion, ...value });
}

test("Publicações percorre fila, exportação, publicação e atualização sem desproteger o publicado", async () => {
  let current = publication();
  current = applyPublicationAction(current, action(current, { action: "queue" }), "user-1", "2026-07-20T12:01:00.000Z");
  assert.equal(current.state, "queued");
  current = applyPublicationAction(current, action(current, { action: "record_export", exportFileName: "artigo.md", exportFormat: "markdown", documentHash: "sha256:one" }), "user-1", "2026-07-20T12:02:00.000Z");
  assert.equal(current.state, "exported");
  current = applyPublicationAction(current, action(current, { action: "publish", destination: "CMS manual", destinationUrl: "https://example.com/artigo-de-teste" }), "user-1", "2026-07-20T12:03:00.000Z");
  assert.equal(current.state, "published"); assert.equal(current.destinationUrl, "https://example.com/artigo-de-teste");
  current = applyPublicationAction(current, action(current, { action: "request_update", note: "Atualizar dados" }), "user-1", "2026-07-20T12:04:00.000Z");
  assert.equal(current.state, "published"); assert.equal(current.updateRequested, true);
});

test("reedição e exportação de atualização preservam URL publicada", () => {
  let current = publication({ state: "published", destination: "CMS manual", destinationUrl: "https://example.com/artigo-de-teste", publishedAt: "2026-07-20T12:03:00.000Z", publishedDocumentHash: "sha256:one" });
  current = applyPublicationAction(current, action(current, { action: "request_update" }), "user-1", "2026-07-20T12:04:00.000Z");
  current = applyPublicationAction(current, action(current, { action: "reedit" }), "user-1", "2026-07-20T12:05:00.000Z");
  assert.equal(current.updateRequested, true);
  current = applyPublicationAction(current, action(current, { action: "record_export", exportFileName: "artigo-atualizacao.md", exportFormat: "markdown", documentHash: "sha256:two" }), "user-1", "2026-07-20T12:06:00.000Z");
  assert.equal(current.state, "published"); assert.equal(current.lastExportDocumentHash, "sha256:two");
  current = applyPublicationAction(current, action(current, { action: "publish", destination: "CMS manual", destinationUrl: "https://example.com/artigo-de-teste", documentHash: "sha256:two" }), "user-1", "2026-07-20T12:07:00.000Z");
  assert.equal(current.updateRequested, false); assert.equal(current.publishedDocumentHash, "sha256:two"); assert.equal(current.destinationUrl, "https://example.com/artigo-de-teste");
  current = applyPublicationAction(current, action(current, { action: "request_update" }), "user-1", "2026-07-20T12:08:00.000Z");
  assert.throws(() => applyPublicationAction(current, action(current, { action: "publish", destination: "CMS manual", destinationUrl: "https://example.com/outra-url", documentHash: "sha256:three" }), "user-1", "2026-07-20T12:09:00.000Z"), /URL estrutural/);
});

test("exportação gera arquivo real determinístico e não inventa URL", async () => {
  const { document } = await createMockPlanAndDocument("brand-1");
  const current = publication({ documentId: document.id });
  const markdown = await createPublicationExport(current, document, "markdown");
  assert.match(markdown.fileName, /artigo-de-teste\.md$/); assert.match(markdown.content, /title: "Artigo de teste"/); assert.match(markdown.content, /published_url: ""/);
  const csv = createPublicationsCsv([current]); assert.match(csv, /unitType/); assert.match(csv, /article/);
});

test("registros antigos recebem metadados novos e SiloPage mantém o tipo", () => {
  const old = publication({ unitType: "silo_page" });
  assert.equal(old.destinationUrl, null); assert.equal(old.history.length, 0); assert.equal(old.unitType, "silo_page");
});
