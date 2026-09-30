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
import { PLATFORM_CATALOG_HASH } from "../lib/agent/catalog-hash.ts";
import { compactSubjectCandidate } from "../lib/server/platform-mcp-tools.ts";

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
  brands,
  consentUrl: brands.length ? null : "https://mcp.example.test/conta?mcp_client=9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d#conexoes-ia",
  reconsentUrl: "https://mcp.example.test/conta?mcp_client=9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d#conexoes-ia",
  ...overrides,
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

test("04 · decisão humana só vira ferramenta quando exige aceite explícito no chat", () => {
  for (const operation of PLATFORM_OPERATIONS) {
    if (operation.decision === "human" && operation.access === "tool") {
      assert.equal(operation.chatConfirmationRequired, true, `${operation.id}: ferramenta de decisão sem prévia e aceite obrigatório`);
    }
    if (operation.chatConfirmationRequired) {
      assert.equal(operation.decision, "human", `${operation.id}: aceite de chat só pertence a uma decisão humana`);
      assert.equal(operation.access, "tool", `${operation.id}: confirmação de chat sem ferramenta`);
    }
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

test("08 · a migration m8 aceita os escopos anteriores e m9 acrescenta platform.decide", () => {
  const sql = read("supabase/migrations/20260926120000_m8_platform_mcp_scopes.sql");
  const arrays = [...sql.matchAll(/scopes <@ ARRAY\[([^\]]+)\]/g)].map(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]).sort());
  assert.equal(arrays.length, 2, "grants e delegações");
  const m8Scopes = WRITER_MCP_SCOPES.filter(scope => scope !== "platform.decide").sort();
  for (const lista of arrays) assert.deepEqual(lista, m8Scopes);
  const m9 = read("supabase/migrations/20260926140000_m9_platform_decide_scope.sql");
  const m9Arrays = [...m9.matchAll(/scopes <@ ARRAY\[([^\]]+)\]/g)].map(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]).sort());
  assert.equal(m9Arrays.length, 2, "grants e delegações");
  for (const lista of m9Arrays) assert.deepEqual(lista, [...WRITER_MCP_SCOPES].sort());
  assert.ok(!WRITER_MCP_DEFAULT_SCOPES.includes("platform.decide"), "delegação de decisões deve ser opt-in");
});

test("09 · gastar com provider nunca vem marcado por padrão", () => {
  assert.ok(!WRITER_MCP_DEFAULT_SCOPES.includes("provider.spend"));
  assert.match(read("modules/conta/oauth-consent-form.tsx"), /defaultScopes : WRITER_MCP_DEFAULT_SCOPES/);
  assert.match(read("modules/conta/agency-mcp-panel.tsx"), /useState<AgencyMcpScope\[\]>\(\[\.\.\.WRITER_MCP_DEFAULT_SCOPES\]\)/);
});

test("09b · as duas rotas aceitam a quantidade inteira de escopos anunciados", () => {
  assert.ok(WRITER_MCP_SCOPES.length > 3);
  for (const route of ["app/api/oauth/consent/route.ts", "app/api/oauth/grants/route.ts"]) {
    assert.match(read(route), /scopes: z\.array\(z\.string\(\)\.max\(40\)\).*\.max\(WRITER_MCP_SCOPES\.length\)/, route);
  }
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
  assert.match(String(body.guide), /Formar artigos automaticamente/);
  assert.match(String(body.guide), /ainda não dispara essa operação por ferramenta/);
  assert.equal(body.catalogHash, PLATFORM_CATALOG_HASH);
  assert.match(PLATFORM_CATALOG_HASH, /^[0-9a-f]{64}$/);
});

test("13 · ler a marca exige platform.read — conexão só do Redator recebe o link para reconsentir", async () => {
  const send = harness(createWriterServer(principal([brand(["writer.read", "writer.draft.write"])])));
  const answer = await send(4, "tools/call", { name: "get_platform_state", arguments: {} });
  assert.equal((answer.result as { isError?: boolean }).isError, true);
  const body = toolText(answer);
  assert.equal(body.code, "scope_denied");
  assert.equal(body.scope, "platform.read");
  // Com grant, o link vem do reconsentUrl — e leva o id do cliente para a Conta abrir no lugar certo.
  assert.ok(String(body.consentUrl).includes("mcp_client="), JSON.stringify(body));
});

test("13b · ferramentas de decisão recusam apply sem hash e aceite antes de consultar estado", async () => {
  const send = harness(createWriterServer(principal([brand(["writer.read"])])));
  const cases = [
    ["decide_keywords", { brandId: brand([]).brandId, mode: "apply", action: "approve", keywordIds: ["00000000-0000-4000-8000-000000000001"] }],
    ["set_kgr_applicability", { brandId: brand([]).brandId, mode: "apply", applicability: "applicable", keywordIds: ["00000000-0000-4000-8000-000000000001"] }],
    ["set_keyword_vinculo", { brandId: brand([]).brandId, mode: "apply", action: { kind: "page_type", pageType: "article", stance: "potential" }, keywordIds: ["00000000-0000-4000-8000-000000000001"] }],
    ["finalize_writer_document", { brandId: brand([]).brandId, documentId: "doc-1", mode: "apply" }],
    ["send_writer_to_publications", { brandId: brand([]).brandId, documentId: "doc-1", mode: "apply" }],
  ] as const;
  for (const [name, args] of cases) {
    const answer = await send(40, "tools/call", { name, arguments: args });
    assert.equal(toolText(answer).code, "human_confirmation_required", name);
  }
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

test("melhoria unificada não usa Google Ads sem aceite específico nem provider.spend", async () => {
  const argumentsBase = { brandId: brand([]).brandId, action: "prepare" };
  const send = harness(createWriterServer(principal([brand(["platform.read", "arquiteto.write"])])));
  assert.equal(toolText(await send(80, "tools/call", { name: "improve_articles", arguments: argumentsBase })).code, "human_confirmation_required");
  const refused = toolText(await send(81, "tools/call", { name: "improve_articles", arguments: { ...argumentsBase, userConfirmation: "Aceito usar a quota gratuita para preparar" } }));
  assert.equal(refused.code, "scope_denied"); assert.equal(refused.scope, "provider.spend");
});

test("melhoria unificada não aplica aceite editorial sem platform.decide", async () => {
  const send = harness(createWriterServer(principal([brand(["platform.read", "arquiteto.write", "minerador.write"])])));
  const refused = toolText(await send(82, "tools/call", { name: "improve_articles", arguments: { brandId: brand([]).brandId, action: "apply", runId: "00000000-0000-4000-8000-0000000000aa", decisionHash: "a".repeat(64), userConfirmation: "Aceito estas melhorias da prévia" } }));
  assert.equal(refused.code, "scope_denied"); assert.equal(refused.scope, "platform.decide");
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


/* ============ conexão: regressões da auditoria de 2026-09-26 ============ */

test("28 · Conta → Conexões de IA oferece tudo, mas marca só o padrão (J3/R7)", () => {
  const painel = read("modules/conta/ai-connections-panel.tsx");
  assert.match(painel, /initial\.scopes\.filter\(\(scope\) => WRITER_MCP_DEFAULT_SCOPES\.includes\(scope\)\)/);
  assert.doesNotMatch(painel, /useState<WriterMcpScope\[\]>\(\(\) => \[\.\.\.initial\.scopes\]\)/);
  for (const optIn of ["provider.spend", "platform.decide"]) {
    assert.ok(!(WRITER_MCP_DEFAULT_SCOPES as readonly string[]).includes(optIn), optIn);
  }
});

test("29 · sugestão da Agência nunca pré-marca opt-in, e sugestão legada só-Redator cai no padrão", () => {
  const grants = read("lib/server/writer-mcp-grants.ts");
  assert.match(grants, /match\.scopes\.filter\(\(scope\) => WRITER_MCP_DEFAULT_SCOPES\.includes\(scope\)\)/);
  assert.match(grants, /legada \? \[\.\.\.WRITER_MCP_DEFAULT_SCOPES\]/);
});

test("30 · o link de reconsentimento sobrevive ao login (J4)", () => {
  const pagina = read("app/(personal)/conta/page.tsx");
  assert.match(pagina, /redirect\(loginRedirectFor\(\(await searchParams\)\.mcp_client\)\)/);
  assert.match(pagina, /\/conta\?mcp_client=\$\{encodeURIComponent\(id\)\}/);
  assert.doesNotMatch(pagina, /redirect\("\/login\?callbackUrl=%2Fconta"\)/, "o redirect fixo perdia o mcp_client");
});

test("31 · o principal OAuth sempre traz o reconsentUrl, mesmo com grant (J5)", () => {
  const principalSrc = read("lib/server/writer-mcp-principal.ts");
  assert.match(principalSrc, /reconsentUrl: writerMcpConsentUrl\(runtime\.publicBaseUrl, identity\.oauthClientId\)/);
});

test("32 · D2.3: a candidata da Pesquisa por Assunto diz à IA se tem volume (Ads ou estimativa) e a estimativa nunca vira volume", () => {
  const base = { normalizedKeyword: "x", origins: ["ads_keyword_seed"], evidence: [], ranked: [], bestRankGroup: null, isSubjectPhrase: false, existingKeywordId: null } as const;
  const ads = (media: number | null) => ({ averageMonthlySearches: media, competition: null, competitionIndex: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null });
  const estimativa = (volume: number | null) => ({ searchVolume: volume, label: "Estimativa DataForSEO" });
  type Candidata = Parameters<typeof compactSubjectCandidate>[0];
  const comAds = compactSubjectCandidate({ ...base, keyword: "agência de marketing", googleAds: ads(18100), dataForSeoEstimate: null } as unknown as Candidata);
  assert.equal(comAds.volume, 18100);
  assert.equal(comAds.hasVolume, true);
  assert.equal("estimate" in comAds, false);
  const soEstimativa = compactSubjectCandidate({ ...base, keyword: "só estimativa", googleAds: null, dataForSeoEstimate: estimativa(90) } as unknown as Candidata);
  assert.equal(soEstimativa.volume, null, "a estimativa nunca vira volume");
  assert.equal(soEstimativa.hasVolume, true);
  assert.equal(soEstimativa.estimate, 90);
  for (const semVolume of [
    compactSubjectCandidate({ ...base, keyword: "zerada", googleAds: ads(0), dataForSeoEstimate: estimativa(0) } as unknown as Candidata),
    compactSubjectCandidate({ ...base, keyword: "vazia", googleAds: ads(null), dataForSeoEstimate: null } as unknown as Candidata),
  ]) {
    assert.equal(semVolume.hasVolume, false, semVolume.keyword);
    assert.equal("estimate" in semVolume, false);
  }
});

test("33 · diferenciação de publicados: detectar pede platform.read, a prévia pede arquiteto.write e o grupo; pagar e aplicar não são ferramenta", async () => {
  const semEscopo = harness(createWriterServer(principal([brand(["writer.read"])])));
  const detectar = toolText(await semEscopo(50, "tools/call", { name: "plan_published_differentiation", arguments: { mode: "detect" } }));
  assert.equal(detectar.code, "scope_denied");
  assert.equal(detectar.scope, "platform.read");
  const semGrupo = toolText(await semEscopo(51, "tools/call", { name: "plan_published_differentiation", arguments: { mode: "preview" } }));
  assert.equal(semGrupo.code, "group_required");
  const soLeitura = harness(createWriterServer(principal([brand(["platform.read"])])));
  const previa = toolText(await soLeitura(52, "tools/call", { name: "plan_published_differentiation", arguments: { mode: "preview", groupId: "dg-0123456789abcdef" } }));
  assert.equal(previa.code, "scope_denied");
  assert.equal(previa.scope, "arquiteto.write");
  const pagar = PLATFORM_OPERATIONS.find(operation => operation.id === "arquiteto.published_differentiation")!;
  assert.equal(pagar.access, "ui");
  assert.equal(pagar.decision, "human");
  assert.deepEqual([...pagar.routes].sort(), ["/api/arquiteto/cannibalization/apply", "/api/arquiteto/cannibalization/run"]);
  assert.deepEqual(PLATFORM_OPERATIONS.find(operation => operation.id === "arquiteto.published_differentiation_detect")?.tools, ["plan_published_differentiation"]);
});

/* ============ SDD MCP ponta a ponta · F1 (2026-09-30) ============ */

test("F1 · medir Volume: sem aceite, sem planHash ou sem provider.spend é recusado antes de ler", async () => {
  const ids = ["00000000-0000-4000-8000-0000000000c1"];
  const cheio = harness(createWriterServer(principal([brand(["platform.read", "minerador.write", "provider.spend"])])));
  assert.equal(toolText(await cheio(90, "tools/call", { name: "measure_keywords", arguments: { mode: "execute", keywordIds: ids } })).code, "human_confirmation_required");
  assert.equal(toolText(await cheio(91, "tools/call", { name: "measure_keywords", arguments: { mode: "execute", keywordIds: ids, userConfirmation: "Pode medir o volume" } })).code, "plan_hash_required");
  const semGasto = harness(createWriterServer(principal([brand(["platform.read", "minerador.write"])])));
  const recusa = toolText(await semGasto(92, "tools/call", { name: "measure_keywords", arguments: { mode: "execute", keywordIds: ids, planHash: "a".repeat(64), userConfirmation: "Pode medir o volume" } }));
  assert.equal(recusa.code, "scope_denied"); assert.equal(recusa.scope, "provider.spend");
  const semLeitura = harness(createWriterServer(principal([brand(["minerador.write"])])));
  const plano = toolText(await semLeitura(93, "tools/call", { name: "measure_keywords", arguments: { mode: "plan", keywordIds: ids } }));
  assert.equal(plano.code, "scope_denied"); assert.equal(plano.scope, "platform.read");
});

test("F1 · 'Para escrever' pelo MCP é leitura: pede platform.read e usa o mesmo núcleo da rota da tela", async () => {
  const semLeitura = harness(createWriterServer(principal([brand(["radar.write"])])));
  const recusa = toolText(await semLeitura(94, "tools/call", { name: "get_article_for_writing", arguments: { articleId: "artigo-1" } }));
  assert.equal(recusa.code, "scope_denied"); assert.equal(recusa.scope, "platform.read");
  const ferramentas = read("lib/server/platform-mcp-tools.ts");
  assert.match(ferramentas, /radarWritingExportForArticle\(/);
  const rota = read("app/api/editorial/radar-export/route.ts");
  assert.match(rota, /assembleRadarPortableExport\(\{/, "a tela e o MCP montam pelo mesmo núcleo");
  const nucleo = read("lib/server/radar-portable-export-core.ts");
  assert.doesNotMatch(nucleo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " "), /collectRadarSerp|fetch\(|recordIntegrationUsage/, "exportar nunca chama provider");
});
