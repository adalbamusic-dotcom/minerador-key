import assert from "node:assert/strict";
import test from "node:test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createWriterServer } from "../app/api/mcp/redator/route.ts";

type Principal = Parameters<typeof createWriterServer>[0];

const actorId = "00000000-0000-4000-8000-000000000004";
const brandA = { brandId: "00000000-0000-4000-8000-000000000003", brandName: "Care Glow", agencyId: "00000000-0000-4000-8000-000000000002", scopes: ["writer.read", "writer.draft.write", "writer.media.brief"], grantId: "00000000-0000-4000-8000-000000000011", delegationId: null } as Principal["brands"][number];
const brandB = { ...brandA, brandId: "00000000-0000-4000-8000-000000000005", brandName: "Adalba", grantId: "00000000-0000-4000-8000-000000000012" };

const principal = (brands: Principal["brands"], overrides: Partial<Principal> = {}): Principal => ({
  authMode: "oauth_supabase", actorId, oauthClientId: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d", clientName: "ChatGPT",
  profile: { userId: actorId, role: "cliente", isAdmin: false } as Principal["profile"],
  brands, consentUrl: null, ...overrides,
});

function harness(server: ReturnType<typeof createWriterServer>) {
  const handler = createMcpHandler(() => server);
  return async (id: number, method: string, params: object) => {
    const response = await handler.fetch(new Request("http://localhost:3000/api/mcp/redator", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }));
    assert.equal(response.status, 200);
    const body = await response.text();
    const message = response.headers.get("content-type")?.includes("text/event-stream")
      ? body.split(/\r?\n/).filter(line => line.startsWith("data: ")).at(-1)?.slice(6)
      : body;
    return JSON.parse(message || "null") as { result?: Record<string, unknown>; error?: unknown };
  };
}

const toolText = (message: { result?: Record<string, unknown> }) => {
  const content = message.result?.content as Array<{ text: string }> | undefined;
  return JSON.parse(content?.[0]?.text || "null") as Record<string, unknown>;
};

test("MCP inicializa e anuncia ferramentas com anotações de leitura/escrita", async () => {
  const send = harness(createWriterServer(principal([brandA])));
  const initialized = await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "redator-test", version: "1" } });
  assert.equal(initialized.result?.serverInfo && (initialized.result.serverInfo as { name: string }).name, "minerador-key-redator");
  const listed = await send(2, "tools/list", {});
  const tools = listed.result?.tools as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
  assert.ok(Array.isArray(tools), JSON.stringify(listed));
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  for (const name of ["get_writer_connection_profile", "list_writer_documents", "get_writer_brief", "get_writer_document", "get_writer_guardian", "get_writer_deliverables"])
    assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
  for (const name of ["save_writer_draft", "save_writer_deliverable", "register_media_brief", "attach_media_asset"])
    assert.equal(byName.get(name)?.annotations?.readOnlyHint, false, name);
  for (const name of ["approve_writer_document", "publish_document", "delete_writer_document"])
    assert.equal(byName.has(name), false, name);
});

test("MCP recusa escrita sem lock e não expõe ferramenta de publicação", async () => {
  const send = harness(createWriterServer(principal([brandA])));
  const missingLock = await send(3, "tools/call", { name: "save_writer_draft", arguments: {
    documentId: "writer:article-1", blocks: [],
  } });
  assert.ok(missingLock.error || (missingLock.result as { isError?: boolean } | undefined)?.isError, JSON.stringify(missingLock));
  const publication = await send(4, "tools/call", { name: "publish_document", arguments: {} });
  assert.ok(publication.error || (publication.result as { isError?: boolean } | undefined)?.isError, JSON.stringify(publication));
});

test("o perfil da conexão lista as Marcas autorizadas e seus escopos", async () => {
  const send = harness(createWriterServer(principal([brandA, brandB])));
  const profile = toolText(await send(5, "tools/call", { name: "get_writer_connection_profile", arguments: {} }));
  assert.equal(profile.ok, true);
  assert.equal(profile.authMode, "oauth_supabase");
  assert.equal(profile.grantRequired, false);
  assert.deepEqual((profile.brands as Array<{ brandId: string; brandName: string }>).map(brand => brand.brandName), ["Care Glow", "Adalba"]);
});

test("com mais de uma Marca, listar documentos exige brandId e devolve as opções", async () => {
  const send = harness(createWriterServer(principal([brandA, brandB])));
  const listed = await send(6, "tools/call", { name: "list_writer_documents", arguments: { limit: 5 } });
  assert.equal((listed.result as { isError?: boolean }).isError, true);
  const body = toolText(listed);
  assert.equal(body.code, "brand_required");
  assert.deepEqual((body.brands as Array<{ brandId: string }>).map(brand => brand.brandId), [brandA.brandId, brandB.brandId]);
  const wrong = toolText(await send(7, "tools/call", { name: "list_writer_documents", arguments: { limit: 5, brandId: "00000000-0000-4000-8000-000000000099" } }));
  assert.equal(wrong.code, "brand_not_authorized");
});

test("token válido sem grant devolve grant_required com o link de consentimento", async () => {
  const consentUrl = "https://mcp.example.test/conta?mcp_client=9a8b#conexoes-ia";
  const send = harness(createWriterServer(principal([], { consentUrl })));
  const profile = toolText(await send(8, "tools/call", { name: "get_writer_connection_profile", arguments: {} }));
  assert.equal(profile.grantRequired, true);
  assert.equal(profile.consentUrl, consentUrl);
  const listed = await send(9, "tools/call", { name: "list_writer_documents", arguments: {} });
  assert.equal((listed.result as { isError?: boolean }).isError, true);
  const body = toolText(listed);
  assert.equal(body.code, "grant_required");
  assert.equal(body.consentUrl, consentUrl);
});
