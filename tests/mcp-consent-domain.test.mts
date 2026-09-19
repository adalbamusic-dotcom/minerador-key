import assert from "node:assert/strict";
import test from "node:test";
import {
  groupWriterMcpGrantsByClient,
  isOAuthClientId,
  normalizeClientName,
  normalizeConsentBrandSelection,
  normalizeWriterMcpScopes,
  WRITER_MCP_OIDC_SCOPES,
  WRITER_MCP_SCOPES,
  writerMcpConsentUrl,
  WriterMcpConsentError,
  writerMcpScopesRequireEdit,
  type WriterMcpGrantRow,
} from "../lib/redator/mcp-consent-domain.ts";

const brandA = { brandId: "00000000-0000-4000-8000-00000000000a", brandName: "Care Glow", agencyId: "00000000-0000-4000-8000-000000000001" };
const brandB = { brandId: "00000000-0000-4000-8000-00000000000b", brandName: "Adalba", agencyId: "00000000-0000-4000-8000-000000000001" };

test("escopos de produto ficam fora do token: só OIDC é anunciado", () => {
  assert.deepEqual([...WRITER_MCP_OIDC_SCOPES], ["openid", "email", "profile"]);
  for (const scope of WRITER_MCP_SCOPES) assert.ok(!(WRITER_MCP_OIDC_SCOPES as readonly string[]).includes(scope));
});

test("normaliza escopos em ordem canônica, sem duplicatas, e recusa desconhecidos ou vazio", () => {
  assert.deepEqual(normalizeWriterMcpScopes(["writer.draft.write", "writer.read", "writer.read"]), ["writer.read", "writer.draft.write"]);
  assert.deepEqual(normalizeWriterMcpScopes("writer.media.brief writer.read"), ["writer.read", "writer.media.brief"]);
  assert.throws(() => normalizeWriterMcpScopes([]), (error: unknown) => error instanceof WriterMcpConsentError && error.code === "scopes_required");
  assert.throws(() => normalizeWriterMcpScopes(["writer.publish"]), (error: unknown) => error instanceof WriterMcpConsentError && error.code === "invalid_scope");
  assert.equal(writerMcpScopesRequireEdit(["writer.read"]), false);
  assert.equal(writerMcpScopesRequireEdit(["writer.read", "writer.media.brief"]), true);
});

test("seleção de Marcas exige ao menos uma e só aceita Marcas elegíveis", () => {
  assert.deepEqual(normalizeConsentBrandSelection([brandA.brandId, brandA.brandId], [brandA, brandB]), [brandA]);
  assert.throws(() => normalizeConsentBrandSelection([], [brandA]), (error: unknown) => error instanceof WriterMcpConsentError && error.code === "brands_required");
  assert.throws(() => normalizeConsentBrandSelection(["not-a-uuid"], [brandA]), (error: unknown) => error instanceof WriterMcpConsentError && error.code === "brands_required");
  assert.throws(() => normalizeConsentBrandSelection([brandB.brandId], [brandA]), (error: unknown) => error instanceof WriterMcpConsentError && error.code === "brand_not_eligible" && error.status === 403);
});

test("client_id aceita UUID ou URL sem espaços; nome é aparado e limitado", () => {
  assert.equal(isOAuthClientId("9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d"), true);
  assert.equal(isOAuthClientId("https://chatgpt.com/connector/oauth/abc"), true);
  assert.equal(isOAuthClientId(""), false);
  assert.equal(isOAuthClientId("has space"), false);
  assert.equal(isOAuthClientId("x".repeat(201)), false);
  assert.equal(normalizeClientName("  Cliente   MCP  "), "Cliente MCP");
  assert.equal(normalizeClientName(""), "Cliente MCP");
  assert.equal(normalizeClientName("a".repeat(200)).length, 120);
});

test("URL de consentimento aponta para /conta com o cliente e sem token", () => {
  assert.equal(writerMcpConsentUrl("https://app.example.test/", "client-1"), "https://app.example.test/conta?mcp_client=client-1#conexoes-ia");
  assert.equal(writerMcpConsentUrl(null, "a/b"), "/conta?mcp_client=a%2Fb#conexoes-ia");
});

test("agrupa grants por cliente com ativos primeiro e último uso consolidado", () => {
  const row = (overrides: Partial<WriterMcpGrantRow>): WriterMcpGrantRow => ({
    id: "g", consentId: "c", agencyId: brandA.agencyId, brandId: brandA.brandId, brandName: brandA.brandName,
    actorUserId: "u", oauthClientId: "client-1", clientName: "ChatGPT", scopes: ["writer.read"], status: "active",
    createdAt: "2026-09-19T10:00:00.000Z", revokedAt: null, lastUsedAt: null, ...overrides,
  });
  const grouped = groupWriterMcpGrantsByClient([
    row({ id: "old", status: "revoked", revokedAt: "2026-09-18T00:00:00.000Z", createdAt: "2026-09-18T00:00:00.000Z", clientName: "Nome antigo", lastUsedAt: "2026-09-18T01:00:00.000Z" }),
    row({ id: "b", brandId: brandB.brandId, brandName: brandB.brandName, lastUsedAt: "2026-09-19T12:00:00.000Z" }),
    row({ id: "a", createdAt: "2026-09-19T11:00:00.000Z" }),
    row({ id: "other", oauthClientId: "client-2", clientName: "Claude" }),
  ]);
  assert.equal(grouped.length, 2);
  const chatgpt = grouped.find((client) => client.oauthClientId === "client-1");
  assert.ok(chatgpt);
  assert.equal(chatgpt.clientName, "ChatGPT");
  assert.deepEqual(chatgpt.grants.map((grant) => grant.id), ["a", "b", "old"]);
  assert.equal(chatgpt.lastUsedAt, "2026-09-19T12:00:00.000Z");
});
