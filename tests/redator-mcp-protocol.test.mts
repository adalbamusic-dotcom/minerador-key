import assert from "node:assert/strict";
import test from "node:test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createWriterServer } from "../app/api/mcp/redator/route.ts";

const delegation = {
  id: "00000000-0000-4000-8000-000000000001",
  agencyId: "00000000-0000-4000-8000-000000000002",
  brandId: "00000000-0000-4000-8000-000000000003",
  actorId: "00000000-0000-4000-8000-000000000004",
  scopes: ["writer.read", "writer.draft.write", "writer.media.brief"],
  profile: { userId: "00000000-0000-4000-8000-000000000004", role: "cliente", isAdmin: false },
} as Parameters<typeof createWriterServer>[0];

const handler = createMcpHandler(() => createWriterServer(delegation));
const send = async (id: number, method: string, params: object) => {
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

test("MCP inicializa e anuncia ferramentas com anotações de leitura/escrita", async () => {
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
  const missingLock = await send(3, "tools/call", { name: "save_writer_draft", arguments: {
    documentId: "writer:article-1", blocks: [],
  } });
  assert.ok(missingLock.error || (missingLock.result as { isError?: boolean } | undefined)?.isError, JSON.stringify(missingLock));
  const publication = await send(4, "tools/call", { name: "publish_document", arguments: {} });
  assert.ok(publication.error || (publication.result as { isError?: boolean } | undefined)?.isError, JSON.stringify(publication));
});
