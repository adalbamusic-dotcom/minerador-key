import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createWriterServer } from "../app/api/mcp/redator/route.ts";
import { PLATFORM_OPERATIONS, renderPlatformGuide } from "../lib/agent/platform-catalog.ts";
import { importDeclaredPlanWithCore } from "../lib/minerador/declared-plan-import-core.ts";
import { setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { editorialGroupLabelOf, resolveEditorialGroupMcpScope } from "../lib/editorial/editorial-group-scope.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * ===== 2026-10-12 · F6 · GRUPO NO MCP (SDD do plano declarado e grupos, §6.5) =====
 *
 * Decisão do dono: `declare_silo_plan` é POR COR — a cor que já tem grupo leva
 * o plano para ele; a sem grupo ganha o grupo pelo mesmo caminho do mover por
 * cor (`ensureEditorialGroupForColor`), com o nome do Silo; nunca dois grupos da
 * mesma cor. `get_platform_state` e `list_platform_keywords` aceitam `group`
 * (a cor, "sem-grupo" ou o uuid de antes).
 *
 * Banco de mentira em memória, sem rede. PROVIDER_CALLS = 0.
 */

const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OTHER_BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const G_LARANJA = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const G_VERDE_ARQUIVADO = "33333333-4444-4555-8666-777777777777";
const G_OUTRA_MARCA = "11111111-2222-4333-8444-555555555555";
const AT = "2026-10-12T20:00:00.000Z";

const PLANO = `Nome: Velocidade
Slug: velocidade
1. Quantos mega preciso
Artigo pilar • Palavra-chave: quantos mega preciso em casa
Explicar perfis de uso.
2. Fibra ou rádio
Palavra-chave: fibra ou radio internet
Comparar tecnologias.
3. Teste de velocidade
Palavra-chave: teste de velocidade internet
Como medir.
4. Wi-Fi em casa
Palavra-chave: wifi em casa cobertura
Cobertura.`;

const assunto = (): Row => {
  const declarado = setKeywordSubject({ dna_origem: "logico_deterministico" }, { note: null, actorId: ACTOR, changedAt: "2026-10-12T16:00:00.000Z", origin: "import" });
  assert.ok(declarado.ok);
  return declarado.semantic;
};

/** Os padrões do banco (status, origem, plano, datas) que o banco de mentira do plano não aplica no insert de editorial_groups. */
class BancoComPadroes extends PlanFakeDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any {
    const consulta = super.from(table);
    if (table !== "editorial_groups") return consulta;
    const inserir = consulta.insert.bind(consulta);
    consulta.insert = (linhas: Row | Row[]) => inserir((Array.isArray(linhas) ? linhas : [linhas]).map(linha => ({ status: "active", origin: "manual", plan: null, plan_version: 0, plan_hash: null, silo_id: null, created_at: AT, updated_at: AT, ...linha })));
    return consulta;
  }
}

function banco(grupos: Row[] = []): PlanFakeDb {
  const kw = (id: string, keyword: string, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "bruto", group_id: null, deleted_at: null, volume_search: null, results_allintitle: null, analise_semantica: { dna_origem: "logico_deterministico" }, ...extra });
  return new BancoComPadroes({
    editorial_groups: [
      ...grupos,
      { id: G_OUTRA_MARCA, marca_id: OTHER_BRAND, name: "Verde", color: "verde", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [
      kw("00000000-0000-4000-8000-000000000001", "Quantos mega preciso", { analise_semantica: assunto() }),
      kw("00000000-0000-4000-8000-000000000002", "Fibra ou rádio", { analise_semantica: assunto() }),
      kw("00000000-0000-4000-8000-000000000003", "Teste de velocidade", { analise_semantica: assunto() }),
      kw("00000000-0000-4000-8000-000000000004", "Wi-Fi em casa", { analise_semantica: assunto() }),
      kw("10000000-0000-4000-8000-000000000001", "quantos mega preciso em casa", { volume_search: 320 }),
      kw("10000000-0000-4000-8000-000000000002", "fibra ou radio internet", { volume_search: 90 }),
      kw("10000000-0000-4000-8000-000000000003", "teste de velocidade internet", { volume_search: 1900 }),
      kw("10000000-0000-4000-8000-000000000004", "wifi em casa cobertura"),
    ],
  });
}

const laranja: Row = { id: G_LARANJA, marca_id: BRAND, name: "laranja", color: "laranja", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT };
const verdeArquivado: Row = { id: G_VERDE_ARQUIVADO, marca_id: BRAND, name: "verde antigo", color: "verde", origin: "manual", status: "archived", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT };

const nucleo = (db: PlanFakeDb, extra: Partial<Parameters<typeof importDeclaredPlanWithCore>[0]>) => importDeclaredPlanWithCore({
  brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", text: PLANO,
  group: { mode: "color", color: "laranja" }, now: AT, ...extra,
});

const gruposDaCor = (db: PlanFakeDb, color: string) => db.tables.editorial_groups.filter(row => row.marca_id === BRAND && row.color === color);

/* ============================ declare_silo_plan pela cor ============================ */

test("F6 · cor que já tem grupo: a prévia aponta o grupo da cor e o apply grava o plano NELE (nenhum grupo novo)", async () => {
  const db = banco([laranja]);
  const previa = await nucleo(db, {});
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") return;
  assert.equal(previa.group.mode, "existing");
  assert.equal(previa.group.mode === "existing" ? previa.group.groupId : null, G_LARANJA);
  assert.ok(previa.notices.some(aviso => /A cor Laranja já tem grupo nesta marca: o plano vai para ele/.test(aviso)));
  assert.equal(previa.canApply, true, previa.blockers.join(" | "));
  const gravado = await nucleo(db, { mode: "apply", importRequestId: "6a1c0d2e-1111-4222-8333-444455556661" });
  assert.ok(gravado.ok && gravado.mode === "apply", JSON.stringify(gravado));
  if (!gravado.ok || gravado.mode !== "apply") return;
  assert.equal(gravado.groupId, G_LARANJA);
  assert.equal(gruposDaCor(db, "laranja").length, 1, "nunca dois grupos da mesma cor");
  const grupo = gruposDaCor(db, "laranja")[0];
  assert.equal(grupo.origin, "declared_plan");
  assert.equal((grupo.plan as Row).siloName, "Velocidade");
  assert.equal(grupo.name, "laranja", "o grupo que já existia mantém o nome");
});

test("F6 · `new` com uma cor que já tem grupo segue a mesma regra (o diálogo de antes não cria o segundo laranja)", async () => {
  const db = banco([laranja]);
  const previa = await nucleo(db, { group: { mode: "new", name: null, color: "laranja" } });
  assert.ok(previa.ok && previa.mode === "preview");
  if (previa.ok && previa.mode === "preview") assert.equal(previa.group.mode === "existing" ? previa.group.groupId : null, G_LARANJA);
  const gravado = await nucleo(db, { mode: "apply", importRequestId: "6a1c0d2e-1111-4222-8333-444455556662", group: { mode: "new", name: null, color: "laranja" } });
  assert.ok(gravado.ok && gravado.mode === "apply", JSON.stringify(gravado));
  assert.equal(gruposDaCor(db, "laranja").length, 1);
});

test("F6 · cor sem grupo: o grupo nasce pelo caminho do mover por cor, com o nome do Silo; repetir não cria outro", async () => {
  const db = banco([laranja]);
  const previa = await nucleo(db, { group: { mode: "color", color: "verde" } });
  assert.ok(previa.ok && previa.mode === "preview");
  if (!previa.ok || previa.mode !== "preview") return;
  assert.deepEqual(previa.group, { mode: "new", name: "Velocidade", color: "verde" });
  assert.equal(gruposDaCor(db, "verde").length, 0, "a prévia não escreve");
  const gravado = await nucleo(db, { mode: "apply", importRequestId: "6a1c0d2e-1111-4222-8333-444455556663", group: { mode: "color", color: "verde" } });
  assert.ok(gravado.ok && gravado.mode === "apply", JSON.stringify(gravado));
  if (!gravado.ok || gravado.mode !== "apply") return;
  const verdes = gruposDaCor(db, "verde");
  assert.equal(verdes.length, 1);
  assert.equal(verdes[0].id, gravado.groupId);
  assert.equal(verdes[0].status, "active");
  assert.equal(verdes[0].origin, "declared_plan");
  assert.equal(verdes[0].name, "Velocidade", "o nome padrão é o do Silo");
  assert.equal(gravado.planVersion, 1);
  assert.ok(db.tables.editorial_group_events.some(evento => evento.group_id === gravado.groupId && evento.event_type === "plan_declared"));
  // Os Assuntos e as principais foram etiquetados com o grupo da cor.
  assert.ok(db.tables.minerador_keywords.filter(row => row.brand_id === BRAND).every(row => row.group_id === gravado.groupId));

  const deNovo = await nucleo(db, { mode: "apply", importRequestId: "6a1c0d2e-1111-4222-8333-444455556664", group: { mode: "color", color: "verde" } });
  assert.ok(deNovo.ok && deNovo.mode === "apply", JSON.stringify(deNovo));
  if (deNovo.ok && deNovo.mode === "apply") {
    assert.equal(deNovo.groupId, gravado.groupId);
    assert.equal(deNovo.planVersion, 1, "mesmo plano = mesma versão");
  }
  assert.equal(gruposDaCor(db, "verde").length, 1);
  // A outra marca, com um verde próprio, nunca é tocada.
  assert.equal(db.tables.editorial_groups.find(row => row.id === G_OUTRA_MARCA)?.plan, null);
});

test("F6 · cor com só um grupo ARQUIVADO: ele é reativado (o mesmo id), nunca um segundo da cor", async () => {
  const db = banco([laranja, verdeArquivado]);
  const gravado = await nucleo(db, { mode: "apply", importRequestId: "6a1c0d2e-1111-4222-8333-444455556665", group: { mode: "color", color: "verde", name: "Velocidade e Wi-Fi" } });
  assert.ok(gravado.ok && gravado.mode === "apply", JSON.stringify(gravado));
  if (!gravado.ok || gravado.mode !== "apply") return;
  assert.equal(gravado.groupId, G_VERDE_ARQUIVADO);
  const verdes = gruposDaCor(db, "verde");
  assert.equal(verdes.length, 1);
  assert.equal(verdes[0].status, "active");
  assert.equal(verdes[0].name, "Velocidade e Wi-Fi", "o name dado vale");
});

/* ============================ o recorte das leituras ============================ */

const resumo = (id: string, color: "laranja" | "azul" | "verde", name: string, status: "active" | "archived" = "active", origin: "manual" | "declared_plan" = "manual") =>
  ({ id, marcaId: BRAND, name, color, origin, status, siloId: null, planVersion: 0, lockVersion: 1, updatedAt: AT, keywordCount: 1, articleCount: 0 });

test("F6 · o parâmetro group: cor (qualquer caixa), sem-grupo, todos, uuid desta marca; inválido e uuid de fora recusam", () => {
  const grupos = [resumo(G_LARANJA, "laranja", "Planos e contratação", "active", "declared_plan"), resumo(G_VERDE_ARQUIVADO, "verde", "verde antigo", "archived")];
  const cor = resolveEditorialGroupMcpScope("  Laranja ", grupos);
  assert.ok(cor.ok);
  if (cor.ok) {
    assert.deepEqual(cor.filter, { kind: "groups", color: "laranja", groupIds: [G_LARANJA] });
    assert.equal(cor.scope.kind === "groups" ? cor.scope.groups[0].text : null, "Laranja · Planos e contratação");
  }
  const semGrupo = resolveEditorialGroupMcpScope("Sem grupo", grupos);
  assert.ok(semGrupo.ok && semGrupo.filter.kind === "none");
  const todos = resolveEditorialGroupMcpScope("todos", grupos);
  assert.ok(todos.ok && todos.scope.kind === "all");
  assert.ok(resolveEditorialGroupMcpScope(undefined, grupos).ok);
  const corSemGrupo = resolveEditorialGroupMcpScope("verde", grupos);
  assert.ok(corSemGrupo.ok);
  if (corSemGrupo.ok) {
    assert.deepEqual(corSemGrupo.filter, { kind: "groups", color: "verde", groupIds: [] }, "o arquivado não entra; cor sem grupo ativo = recorte vazio");
    assert.match(corSemGrupo.scope.kind === "groups" ? corSemGrupo.scope.description : "", /A cor Verde ainda não tem grupo nesta marca/);
  }
  const uuid = resolveEditorialGroupMcpScope(G_VERDE_ARQUIVADO, grupos);
  assert.ok(uuid.ok && uuid.filter.kind === "groups" && uuid.filter.groupIds[0] === G_VERDE_ARQUIVADO, "o uuid de antes continua valendo");
  const invalido = resolveEditorialGroupMcpScope("roxo", grupos);
  assert.equal(invalido.ok, false);
  if (!invalido.ok) assert.equal(invalido.code, "group_invalid");
  const deFora = resolveEditorialGroupMcpScope(G_OUTRA_MARCA, grupos);
  assert.equal(deFora.ok, false);
  if (!deFora.ok) assert.equal(deFora.code, "group_not_found");
});

test("F6 · o rótulo nunca é só a cor escondida: a cor sempre escrita, o nome próprio ao lado", () => {
  assert.equal(editorialGroupLabelOf({ id: G_LARANJA, color: "laranja", name: "Laranja", origin: "manual" }).text, "Laranja");
  assert.equal(editorialGroupLabelOf({ id: G_LARANJA, color: "laranja", name: "laranja", origin: "manual" }).customName, null);
  const plano = editorialGroupLabelOf({ id: G_LARANJA, color: "azul", name: "  Planos   e contratação ", origin: "declared_plan" });
  assert.equal(plano.text, "Azul · Planos e contratação");
  assert.equal(plano.origin, "declared_plan");
});

/* ============================ servidor MCP e catálogo ============================ */

const actorId = "00000000-0000-4000-8000-000000000004";
type Principal = Parameters<typeof createWriterServer>[0];
type Brand = Principal["brands"][number];
const marca = (scopes: string[]): Brand => ({
  brandId: "00000000-0000-4000-8000-000000000003", brandName: "Care Glow", agencyId: "00000000-0000-4000-8000-000000000002",
  scopes, grantId: "00000000-0000-4000-8000-000000000011", delegationId: null,
} as Brand);
const principal = (brands: Brand[]): Principal => ({
  authMode: "oauth_supabase", actorId, oauthClientId: "9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d", clientName: "Claude",
  profile: { userId: actorId, role: "cliente", isAdmin: false } as Principal["profile"],
  brands, consentUrl: null,
  reconsentUrl: "https://mcp.example.test/conta?mcp_client=9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d#conexoes-ia",
});

async function listarFerramentas() {
  const handler = createMcpHandler(() => createWriterServer(principal([marca(["platform.read", "minerador.write"])])));
  const enviar = async (id: number, method: string, params: object) => {
    const resposta = await handler.fetch(new Request("http://localhost:3000/api/mcp/redator", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }));
    const corpo = await resposta.text();
    const mensagem = resposta.headers.get("content-type")?.includes("text/event-stream") ? corpo.split(/\r?\n/).filter(linha => linha.startsWith("data: ")).at(-1)?.slice(6) : corpo;
    return JSON.parse(mensagem || "null") as { result?: Record<string, unknown> };
  };
  await enviar(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  return (await enviar(2, "tools/list", {})).result?.tools as Array<{ name: string; description?: string; inputSchema?: { properties?: Record<string, { description?: string; anyOf?: unknown[]; oneOf?: unknown[] }> } }>;
}

test("F6 · get_platform_state e list_platform_keywords anunciam `group`; declare_silo_plan aceita a cor", async () => {
  const ferramentas = await listarFerramentas();
  for (const nome of ["get_platform_state", "list_platform_keywords"]) {
    const ferramenta = ferramentas.find(item => item.name === nome);
    assert.ok(ferramenta?.inputSchema?.properties?.group, `${nome} tem group`);
    assert.match(String(ferramenta?.inputSchema?.properties?.group?.description), /a cor \(amarelo, azul, verde, lima, laranja\), "sem-grupo" ou o id \(uuid\) de um grupo/);
    assert.match(String(ferramenta?.description), /group/);
  }
  const plano = ferramentas.find(item => item.name === "declare_silo_plan");
  assert.match(JSON.stringify(plano?.inputSchema?.properties?.group), /"color"/);
  assert.match(String(plano?.description), /grupo pela COR/);
  assert.match(JSON.stringify(ferramentas.find(item => item.name === "get_article_for_writing")), /'Grupo: Laranja · Planos e contratação'/);
});

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("F6 · as leituras do MCP usam o MESMO recorte e o mesmo grupo efetivo da tela; sem group, as consultas de antes", () => {
  const ferramentas = semComentarios(readFileSync(new URL("../lib/server/platform-mcp-tools.ts", import.meta.url), "utf8"));
  assert.match(ferramentas, /const recorte = await resolvePlatformGroupScope\(access\.brandId, group\);\s*return recorte \? readPlatformState\(access\.brandId, \{ group: recorte \}\) : readPlatformState\(access\.brandId\);/);
  assert.match(ferramentas, /if \(recorte\?\.kind === "none"\) query = query\.is\("group_id", null\);/);
  assert.match(ferramentas, /if \(recorte\?\.kind === "groups"\) query = query\.in\("group_id", recorte\.groupIds\);/);
  assert.match(ferramentas, /resolveEditorialGroupMcpScope\(raw, lista\.groups\)/);
  assert.match(ferramentas, /listEditorialGroupSummaries\(getOperationalClient\(\), brandId\)/, "a lista é a da marca autorizada");
  const retrato = semComentarios(readFileSync(new URL("../lib/server/agent-platform-state.ts", import.meta.url), "utf8"));
  assert.match(retrato, /readArticleGroupMemberships\(db, brandId, \{ articleIds: faltam \}\)/, "o grupo do artigo é o efetivo (gravado ou herdado)");
  assert.match(retrato, /if \(!recorte \|\| !faltam\.length\) return;/, "sem recorte, nada de grupo é lido");
  assert.match(retrato, /\.select\(recorte \? "id,status,group_id" : "id,status"\)/);
  // declare_silo_plan continua uma chamada só ao núcleo.
  const inicio = ferramentas.indexOf('server.registerTool("declare_silo_plan"');
  const trecho = ferramentas.slice(inicio, ferramentas.indexOf("server.registerTool(", inicio + 30));
  assert.equal((trecho.match(/importDeclaredPlanWithCore\(/g) || []).length, 1);
  assert.doesNotMatch(trecho, /ensureEditorialGroupForColor|createDeclaredPlanGroup|from\("editorial_groups"\)/, "o grupo da cor é do núcleo, não da ferramenta");
  const nucleoFonte = semComentarios(readFileSync(new URL("../lib/minerador/declared-plan-import-core.ts", import.meta.url), "utf8"));
  assert.match(nucleoFonte, /ensureEditorialGroupForColor\(groupsClient, \{ brandId, actorUserId, color: escolha\.color \}\)/);
  assert.doesNotMatch(nucleoFonte, /createDeclaredPlanGroup\(/, "um caminho só para criar o grupo da cor");
});

const D10 = /pend[eê]ncia|aguardando aprova|rascunho|fonte a obter|preencher|peça ao Arquiteto/i;

test("F6 · catálogo: grupo no MCP, plano pela cor, Redator e Publicações com a etiqueta (concluído, D10)", () => {
  const grupos = PLATFORM_OPERATIONS.find(item => item.id === "minerador.keyword_groups")!;
  const notas = (grupos.notes ?? []).join(" ");
  assert.match(notas, /get_platform_state e list_platform_keywords aceitam group/);
  assert.doesNotMatch(notas, /Redator e Publicações ainda não filtram/);
  const artigos = PLATFORM_OPERATIONS.find(item => item.id === "arquiteto.article_groups")!;
  assert.match(artigos.title, /Redator e em Publicações/);
  assert.match(artigos.howOnScreen, /no Redator, a lista de documentos \(coluna da esquerda\) mostra só os do grupo escolhido/);
  assert.match(artigos.howOnScreen, /em Publicações, a Biblioteca, a Fila, os Publicados e as Atualizações mostram só os do grupo/);
  const plano = PLATFORM_OPERATIONS.find(item => item.id === "minerador.declare_silo_plan")!;
  assert.match((plano.notes ?? []).join(" "), /O grupo do plano é a COR[\s\S]*Nunca nascem dois grupos da mesma cor/);
  const escrever = PLATFORM_OPERATIONS.find(item => item.id === "radar.export_for_writing")!;
  const nota = (escrever.notes ?? []).find(item => /Grupo por cor no entregável/.test(item)) || "";
  assert.match(nota, /'Grupo: <cor> · <nome do grupo>'/);
  assert.match(nota, /'Promessa declarada no plano do Silo: …'/);
  for (const texto of [nota, artigos.howOnScreen, (plano.notes ?? []).at(-1) || "", notas]) assert.doesNotMatch(texto, D10, texto.slice(0, 80));
  assert.match(renderPlatformGuide("minerador"), /O grupo do plano é a COR/);
});
