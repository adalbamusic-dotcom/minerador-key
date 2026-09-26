import assert from "node:assert/strict";
import test from "node:test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createWriterServer } from "../app/api/mcp/redator/route.ts";
import { catalogToolNames } from "../lib/agent/platform-catalog.ts";

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
  // Desde a SDD da plataforma para agentes (2026-09-26) o servidor cobre a plataforma inteira, na mesma URL.
  assert.equal(initialized.result?.serverInfo && (initialized.result.serverInfo as { name: string }).name, "minerador-key");
  const listed = await send(2, "tools/list", {});
  const tools = listed.result?.tools as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
  assert.ok(Array.isArray(tools), JSON.stringify(listed));
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  for (const name of ["get_writer_connection_profile", "list_writer_documents", "get_writer_brief", "get_writer_document", "get_writer_guardian", "get_writer_deliverables",
    "get_writer_evidence_manifest", "get_writer_foundations", "read_writer_evidence"])
    assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
  for (const name of ["save_writer_draft", "save_writer_deliverable", "register_media_brief", "attach_media_asset", "record_writer_divergence"])
    assert.equal(byName.get(name)?.annotations?.readOnlyHint, false, name);
  // As da plataforma: leitura é leitura; as que escrevem se anunciam como escrita.
  for (const name of ["get_platform_guide", "get_platform_state", "find_topic_in_platform", "list_platform_keywords", "get_next_actions", "validate_silo_plan"])
    assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
  for (const name of ["declare_subjects", "search_subject_keywords", "import_subject_keywords", "send_keywords_to_arquiteto", "send_radar_to_writer"])
    assert.equal(byName.get(name)?.annotations?.readOnlyHint, false, name);
  // Aprovar, excluir e publicar continuam fora — no Redator e na plataforma inteira (AGENTS.md §9).
  for (const name of ["approve_writer_document", "publish_document", "delete_writer_document", "update_article_dna", "resolve_writer_divergence",
    "approve_keywords", "delete_keywords", "purge_keywords", "approve_article_dna", "approve_silo", "approve_silo_page", "finalize_radar", "publish_article"])
    assert.equal(byName.has(name), false, name);
  for (const name of catalogToolNames()) assert.ok(byName.has(name), `ferramenta ausente no servidor: ${name}`);
  assert.equal(tools.length, catalogToolNames().length, "o servidor anuncia exatamente todas as ferramentas do catálogo");
});

test("a instrução do servidor ensina manifesto → fundamentos → fatias e leva as guardas (sem FAQ, terceiros, DNA)", async () => {
  const send = harness(createWriterServer(principal([brandA])));
  const initialized = await send(10, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "redator-test", version: "1" } });
  const instructions = String(initialized.result?.instructions || "");
  const ordem = ["get_writer_evidence_manifest", "get_writer_foundations", "read_writer_evidence"].map(name => instructions.indexOf(name));
  assert.ok(ordem.every(posicao => posicao >= 0) && ordem[0] < ordem[1] && ordem[1] < ordem[2], instructions);
  assert.match(instructions, /Não gere nem sugira FAQ/);
  assert.match(instructions, /terceiros/);
  assert.match(instructions, /record_writer_divergence/);
  assert.match(instructions, /dos dois lados/);
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
