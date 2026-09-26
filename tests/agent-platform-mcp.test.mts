import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createWriterServer } from "../app/api/mcp/redator/route.ts";
import {
  catalogRoutes,
  catalogToolNames,
  PLATFORM_OPERATIONS,
  PLATFORM_PLAYBOOKS,
  PLATFORM_STAGE_LABELS,
  PLATFORM_STAGES,
  platformServerInstructions,
  renderPlatformGuide,
} from "../lib/agent/platform-catalog.ts";
import { WRITER_MCP_DEFAULT_SCOPES, WRITER_MCP_SCOPES } from "../lib/redator/mcp-consent-domain.ts";

/**
 * O QUE AS IAS SABEM PRECISA ACOMPANHAR A PLATAFORMA.
 *
 * O dono pediu que toda mudança futura nos processos chegue também às IAs.
 * A garantia é esta suíte: rota nova sem lugar no catálogo, ferramenta sem
 * operação, guia escrito à mão ou escopo fora da migration derrubam o teste.
 *
 * SDD: docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md §3.6.
 */

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

type Principal = Parameters<typeof createWriterServer>[0];
type Brand = Principal["brands"][number];

const actorId = "00000000-0000-4000-8000-000000000004";
const brand = (scopes: string[], overrides: Partial<Brand> = {}): Brand => ({
  brandId: "00000000-0000-4000-8000-000000000003", brandName: "Care Glow", agencyId: "00000000-0000-4000-8000-000000000002",
  scopes, grantId: "00000000-0000-4000-8000-000000000011", delegationId: null, ...overrides,
} as Brand);
const principal = (brands: Brand[], overrides: Partial<Principal> = {}): Principal => ({
  authMode: "oauth_supabase", actorId, oauthClientId: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d", clientName: "Claude",
  profile: { userId: actorId, role: "cliente", isAdmin: false } as Principal["profile"],
  brands, consentUrl: "https://mcp.example.test/conta#conexoes-ia", ...overrides,
});

function harness(server: ReturnType<typeof createWriterServer>) {
  const handler = createMcpHandler(() => server);
  return async (id: number, method: string, params: object) => {
    const response = await handler.fetch(new Request("http://localhost:3000/api/mcp/redator", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }));
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

/* ======================= 1 · rotas × catálogo ======================= */

function routesOnDisk(): string[] {
  const base = new URL("app/api/", root);
  const baseDir = decodeURIComponent(base.pathname).replace(/^\/([A-Za-z]:)/, "$1");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "route.ts") found.push(`/api/${relative(baseDir, dir).split(sep).join("/")}`.replace(/\/$/, ""));
    }
  };
  walk(baseDir);
  return found.sort();
}

test("01 · toda rota de API está no catálogo — numa operação ou fora do pipeline com motivo", () => {
  const catalogo = new Set(catalogRoutes());
  const faltando = routesOnDisk().filter(route => !catalogo.has(route));
  assert.deepEqual(faltando, [],
    `Rota nova sem lugar no catálogo do agente. Acrescente-a a uma operação ou a ROUTES_OUTSIDE_AGENT_PIPELINE em lib/agent/platform-catalog.ts:\n${faltando.join("\n")}`);
});

test("02 · o catálogo não aponta rota que não existe", () => {
  const disco = new Set(routesOnDisk());
  const fantasmas = catalogRoutes().filter(route => !disco.has(route));
  assert.deepEqual(fantasmas, [], `Rota no catálogo que não existe mais:\n${fantasmas.join("\n")}`);
});

/* ==================== 2 · ferramentas × catálogo ==================== */

test("03 · as ferramentas do servidor são exatamente as do catálogo", async () => {
  const send = harness(createWriterServer(principal([brand(["writer.read"])])));
  await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  const tools = ((await send(2, "tools/list", {})).result?.tools as Array<{ name: string }>).map(tool => tool.name).sort();
  assert.deepEqual(tools, catalogToolNames(), "servidor e catálogo divergem: registre a ferramenta no catálogo (ou remova do catálogo)");
});

test("04 · decisão humana nunca vira ferramenta; ferramenta é sempre operação da IA", () => {
  for (const operation of PLATFORM_OPERATIONS) {
    if (operation.decision === "human") assert.equal(operation.access, "ui", `${operation.id}: aprovação é humana e fica na tela`);
    if (operation.access === "tool") assert.ok(operation.tools?.length, `${operation.id}: acesso por ferramenta sem ferramenta`);
    if (operation.access === "ui") assert.equal(operation.tools?.length ?? 0, 0, `${operation.id}: operação de tela não anuncia ferramenta`);
  }
});

test("05 · ids de operação são únicos", () => {
  const ids = PLATFORM_OPERATIONS.map(operation => operation.id);
  assert.equal(new Set(ids).size, ids.length);
});

/* ======================== 3 · o guia é o catálogo ======================== */

test("06 · o guia sai do catálogo: toda etapa, operação e playbook aparece", () => {
  const overview = renderPlatformGuide("overview");
  for (const stage of PLATFORM_STAGES) {
    assert.ok(overview.includes(PLATFORM_STAGE_LABELS[stage]), stage);
    const guia = renderPlatformGuide(stage);
    for (const operation of PLATFORM_OPERATIONS.filter(item => item.stage === stage)) {
      assert.ok(guia.includes(operation.title) && guia.includes(operation.howOnScreen), operation.id);
    }
  }
  const playbooks = renderPlatformGuide("playbooks");
  for (const playbook of PLATFORM_PLAYBOOKS) assert.ok(playbooks.includes(playbook.title), playbook.id);
  assert.match(renderPlatformGuide("seo"), /KGR/);
});

test("07 · a instrução do servidor começa pela plataforma, vinda do catálogo", async () => {
  const send = harness(createWriterServer(principal([brand(["writer.read"])])));
  const init = await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  const instructions = String(init.result?.instructions ?? "");
  assert.ok(instructions.startsWith(platformServerInstructions()), instructions.slice(0, 200));
  assert.match(instructions, /manifesto/, "as regras do Redator continuam lá");
});

/* =========================== 4 · escopos =========================== */

test("08 · a migration m8 aceita exatamente os escopos do código, nas duas tabelas", () => {
  const sql = read("supabase/migrations/20260926120000_m8_platform_mcp_scopes.sql");
  const arrays = [...sql.matchAll(/scopes <@ ARRAY\[([^\]]+)\]/g)].map(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]).sort());
  assert.equal(arrays.length, 2, "grants e delegações");
  for (const lista of arrays) assert.deepEqual(lista, [...WRITER_MCP_SCOPES].sort());
});

test("09 · gastar com provider nunca vem marcado por padrão", () => {
  assert.ok(!WRITER_MCP_DEFAULT_SCOPES.includes("provider.spend"));
  assert.match(read("modules/conta/oauth-consent-form.tsx"), /defaultScopes : WRITER_MCP_DEFAULT_SCOPES/);
  assert.match(read("modules/conta/agency-mcp-panel.tsx"), /useState<AgencyMcpScope\[\]>\(\[\.\.\.WRITER_MCP_DEFAULT_SCOPES\]\)/);
});

test("10 · a lista de escopos da Agência não é mais uma cópia à mão", () => {
  assert.match(read("lib/server/integration-governance.ts"), /export const AGENCY_MCP_SCOPES = WRITER_MCP_SCOPES;/);
});

test("11 · o AGENTS.md obriga a atualizar o catálogo junto com o processo", () => {
  assert.match(read("AGENTS.md"), /lib\/agent\/platform-catalog\.ts/);
});

/* ================== 5 · as ferramentas se comportam ================== */

test("12 · o guia funciona sem Marca autorizada: é conteúdo da plataforma, não da marca", async () => {
  const send = harness(createWriterServer(principal([])));
  const body = toolText(await send(3, "tools/call", { name: "get_platform_guide", arguments: { topic: "playbooks" } }));
  assert.equal(body.ok, true);
  assert.match(String(body.guide), /silo/i);
});

test("13 · ler a marca exige platform.read — conexão só do Redator recebe o link para reconsentir", async () => {
  const send = harness(createWriterServer(principal([brand(["writer.read", "writer.draft.write"])])));
  const answer = await send(4, "tools/call", { name: "get_platform_state", arguments: {} });
  assert.equal((answer.result as { isError?: boolean }).isError, true);
  const body = toolText(answer);
  assert.equal(body.code, "scope_denied");
  assert.equal(body.scope, "platform.read");
  assert.ok(String(body.consentUrl).includes("conexoes-ia"));
});

test("14 · com mais de uma Marca, a leitura exige brandId", async () => {
  const a = brand(["platform.read"]);
  const b = brand(["platform.read"], { brandId: "00000000-0000-4000-8000-000000000005", brandName: "Adalba", grantId: "00000000-0000-4000-8000-000000000012" });
  const send = harness(createWriterServer(principal([a, b])));
  const body = toolText(await send(5, "tools/call", { name: "get_next_actions", arguments: {} }));
  assert.equal(body.code, "brand_required");
});

test("15 · declarar Assunto sem o aceite do usuário é recusado antes de qualquer escrita (ADR-022)", async () => {
  const send = harness(createWriterServer(principal([brand(["platform.read", "minerador.write"])])));
  const body = toolText(await send(6, "tools/call", { name: "declare_subjects", arguments: { mode: "apply", entries: [{ keyword: "seo para clínicas" }] } }));
  assert.equal(body.code, "human_confirmation_required");
});

const pedidoPago = {
  mode: "execute", phrase: "seo para clínicas", operationRequestId: "00000000-0000-4000-8000-0000000000aa",
  targeting: { language: "languageConstants/1014", selectedStates: ["Todos os estados"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
  authorizedPlan: { planHash: "plan-1", maxCostUsd: 0.2 },
};

test("16 · pesquisa paga sem o aceite do custo é recusada", async () => {
  const send = harness(createWriterServer(principal([brand(["minerador.write", "provider.spend"])])));
  const body = toolText(await send(7, "tools/call", { name: "search_subject_keywords", arguments: { request: pedidoPago } }));
  assert.equal(body.code, "human_confirmation_required");
});

test("17 · pesquisa paga sem provider.spend é recusada antes de ler qualquer coisa", async () => {
  const send = harness(createWriterServer(principal([brand(["platform.read", "minerador.write"])])));
  const body = toolText(await send(8, "tools/call", { name: "search_subject_keywords", arguments: { request: pedidoPago, userConfirmation: "pode pagar, aceito o custo" } }));
  assert.equal(body.code, "scope_denied");
  assert.equal(body.scope, "provider.spend");
});

test("18 · cada escrita pede o próprio escopo", async () => {
  const send = harness(createWriterServer(principal([brand(["platform.read"])])));
  const casos: Array<[string, Record<string, unknown>, string]> = [
    ["send_keywords_to_arquiteto", { keywordIds: ["00000000-0000-4000-8000-0000000000bb"] }, "arquiteto.write"],
    ["send_radar_to_writer", { articleIds: ["artigo-1"] }, "radar.write"],
    ["import_subject_keywords", { request: { subjectPhrase: "seo", items: [{ keyword: "seo local", origins: ["ads_keyword_seed"] }] } }, "minerador.write"],
  ];
  for (const [name, args, scope] of casos) {
    const body = toolText(await send(9, "tools/call", { name, arguments: args }));
    assert.equal(body.code, "scope_denied", `${name}: ${JSON.stringify(body)}`);
    assert.equal(body.scope, scope, name);
  }
});
