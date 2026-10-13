import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { ARTIGO, HOST_DO_BANCO, MARCA, instalarPostgrestSimulado, semearBanco, type Banco, type Linha } from "./radar-export-leitura-fixtures.mts";

/*
 * ===== 2026-10-12 · F2 DOS GRUPOS — A MESA LÊ POR GRUPO, E A PLANILHA MOSTRA A ETIQUETA =====
 *
 * SDD docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md §8 e §9.
 *
 * 1 · GET /api/editorial/workspace com `groupId` (uuid ou "sem-grupo") lê só
 *     os artigos do recorte, pelo grupo EFETIVO (etiqueta gravada ou herança
 *     das keywords); sem `groupId`, a resposta é a de sempre e nenhuma tabela
 *     de grupo é consultada; grupo de outra marca não traz nada.
 * 2 · A planilha (grid compartilhado), a aba Silos do Arquiteto e o seletor
 *     mostram a faixa e a etiqueta (bolinha + nome), e a prévia de
 *     "Etiquetar artigos pelo grupo das keywords" grava só o que mostrou.
 *
 * PROVIDER_CALLS = 0: o `fetch` só fala com o banco simulado.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = `http://${HOST_DO_BANCO}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return globalThis.__perfilDaMesaDeTeste; }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);

const GRUPO_A = "11111111-aaaa-4aaa-8aaa-000000000001";
const GRUPO_B = "11111111-aaaa-4aaa-8aaa-000000000002";
const GRUPO_DA_OUTRA = "11111111-aaaa-4aaa-8aaa-000000000003";
const OUTRA_MARCA = "22222222-bbbb-4bbb-8bbb-000000000001";

/** O índice do ArticleDNA (envelope da fixture): artigo → principal e secundárias. */
function keywordsDosArtigos(banco: Banco) {
  const mapa = new Map<string, string[]>();
  for (const linha of banco.editorial_artifact_versions) {
    if (linha.artifact_type !== "article_dna") continue;
    const dna = ((linha.payload as Linha).payload || {}) as Linha;
    mapa.set(String(linha.entity_id), [String(dna.principalKeywordId), ...((dna.secondaryKeywordIds || []) as string[])]);
  }
  return mapa;
}

/**
 * F, N e V: keywords no grupo A · T: no grupo B · X e Z: sem grupo nas keywords,
 * mas Z tem etiqueta GRAVADA no grupo A (decisão humana vence a herança).
 * A outra marca tem um grupo dela e uma etiqueta dela para o artigo X.
 */
function bancoComGrupos(): Banco {
  const banco = semearBanco();
  const keywords = keywordsDosArtigos(banco);
  const grupoDe: Record<string, string | null> = { [ARTIGO.F]: GRUPO_A, [ARTIGO.N]: GRUPO_A, [ARTIGO.V]: GRUPO_A, [ARTIGO.T]: GRUPO_B, [ARTIGO.X]: null, [ARTIGO.Z]: null };
  const linhas: Linha[] = [];
  for (const [artigo, ids] of keywords) for (const id of ids) linhas.push({ id, brand_id: MARCA, keyword: `kw ${id.slice(-3)}`, group_id: grupoDe[artigo] ?? null, deleted_at: null });
  return {
    ...banco,
    editorial_workflow_items_listagem: banco.editorial_workflow_items,
    minerador_keywords: linhas,
    editorial_groups: [
      { id: GRUPO_A, marca_id: MARCA, name: "laranja", color: "laranja", status: "active" },
      { id: GRUPO_B, marca_id: MARCA, name: "azul", color: "azul", status: "active" },
      { id: GRUPO_DA_OUTRA, marca_id: OUTRA_MARCA, name: "da outra", color: "verde", status: "active" },
    ],
    editorial_group_articles: [
      { marca_id: MARCA, article_id: ARTIGO.Z, group_id: GRUPO_A, origin: "human" },
      { marca_id: OUTRA_MARCA, article_id: ARTIGO.X, group_id: GRUPO_DA_OUTRA, origin: "human" },
    ],
  };
}

let banco: Banco = bancoComGrupos();
const { pedidos, foraDoBanco } = instalarPostgrestSimulado(() => banco);
(globalThis as Record<string, unknown>).__perfilDaMesaDeTeste = { userId: "ator-de-teste" };

const rota = await import("../app/api/editorial/workspace/route.ts");
const { NextRequest } = await import("next/server");

async function lerMesa(consulta: string) {
  const inicio = pedidos.length;
  const resposta = await rota.GET(new NextRequest(`http://localhost/api/editorial/workspace?marcaId=${MARCA}${consulta}`));
  const corpo = resposta.status === 200 ? JSON.parse(await new Response(resposta.body).text()) : await resposta.json();
  return { status: resposta.status, corpo, pedidos: pedidos.slice(inicio) };
}

/** O corpo sem o que muda a cada chamada (id da requisição e hora da leitura). */
const estavel = (corpo: { requestId?: unknown; data?: Record<string, unknown> }) => {
  const { requestId: _id, ...resto } = corpo;
  void _id;
  return { ...resto, data: { ...(resto.data || {}), loadedAt: "—" } };
};

/* ============================== 1 · a mesa por grupo ============================== */

test("sem groupId · a resposta é a mesma de antes (com ou sem tabelas de grupo) e nenhuma tabela de grupo é lida", async () => {
  banco = bancoComGrupos();
  const comGrupos = await lerMesa("");
  const semTabelas = semearBanco();
  banco = { ...semTabelas, editorial_workflow_items_listagem: semTabelas.editorial_workflow_items };
  const semGrupos = await lerMesa("");
  banco = bancoComGrupos();
  assert.equal(comGrupos.status, 200);
  assert.deepEqual(estavel(comGrupos.corpo), estavel(semGrupos.corpo), "corpo idêntico");
  assert.equal("groupScope" in comGrupos.corpo, false);
  assert.ok(!comGrupos.pedidos.some(pedido => ["editorial_group_articles", "editorial_groups", "minerador_keywords"].includes(pedido.tabela)), "sem groupId, nada de grupo é consultado");
  assert.ok(comGrupos.corpo.data.radarItems.length >= 5);
  assert.deepEqual(foraDoBanco, []);
});

test("com groupId · só os artigos do grupo efetivo: herança das keywords + etiqueta gravada; o SiloDNA deles vem junto", async () => {
  banco = bancoComGrupos();
  const inteira = await lerMesa("");
  const doGrupo = new Set<string>([ARTIGO.F, ARTIGO.N, ARTIGO.V, ARTIGO.Z]);
  const esperados = inteira.corpo.data.radarItems.map((item: { articleId: string }) => item.articleId).filter((id: string) => doGrupo.has(id)).sort();
  const { status, corpo, pedidos: feitos } = await lerMesa(`&groupId=${GRUPO_A}`);
  assert.equal(status, 200);
  assert.ok(esperados.length >= 3);
  assert.deepEqual(corpo.data.radarItems.map((item: { articleId: string }) => item.articleId).sort(), esperados, "os itens que a leitura inteira tem, só os do grupo");
  assert.deepEqual(corpo.data.articleVersions.map((versao: { entityId: string }) => versao.entityId).sort(), [ARTIGO.F, ARTIGO.N, ARTIGO.V, ARTIGO.Z].sort());
  assert.equal(corpo.data.siloVersions.length, 1, "o Silo que tem esses artigos");
  assert.deepEqual(corpo.groupScope, { groupId: GRUPO_A, articleIds: corpo.groupScope.articleIds, partial: true });
  assert.deepEqual([...corpo.groupScope.articleIds].sort(), [ARTIGO.F, ARTIGO.N, ARTIGO.V, ARTIGO.Z].sort());
  // O servidor pediu ao banco só os artigos do recorte (a consulta leva o `.in`).
  const leituraDoRadar = feitos.find(pedido => pedido.tabela === "editorial_workflow_items");
  assert.ok(leituraDoRadar && String(leituraDoRadar.params.get("article_id") || "").startsWith("in."), "itens do Radar filtrados no banco");
  const leituraDosArtefatos = feitos.find(pedido => pedido.tabela === "editorial_artifact_versions" && String(pedido.params.get("select") || "").startsWith("artifact_type,payload"));
  assert.ok(leituraDosArtefatos && String(leituraDosArtefatos.params.get("entity_id") || "").startsWith("in."), "artefatos filtrados no banco");
});

test("sem-grupo e o outro grupo · cada artigo aparece num recorte só", async () => {
  banco = bancoComGrupos();
  const semGrupo = await lerMesa("&groupId=sem-grupo");
  assert.deepEqual(semGrupo.corpo.data.radarItems.map((item: { articleId: string }) => item.articleId), [ARTIGO.X]);
  const azul = await lerMesa(`&groupId=${GRUPO_B}`);
  assert.deepEqual(azul.corpo.data.radarItems.map((item: { articleId: string }) => item.articleId), [ARTIGO.T]);
});

test("isolamento · o grupo de outra marca não traz nada desta, e a etiqueta da outra marca não vale aqui", async () => {
  banco = bancoComGrupos();
  const daOutra = await lerMesa(`&groupId=${GRUPO_DA_OUTRA}`);
  assert.equal(daOutra.status, 200);
  assert.deepEqual(daOutra.corpo.data.radarItems, []);
  assert.deepEqual(daOutra.corpo.data.articleVersions, []);
  assert.ok(!daOutra.pedidos.some(pedido => pedido.tabela === "editorial_workflow_items"), "recorte vazio não consulta os itens");
});

test("groupId inválido · 400 com código próprio, nunca leitura da marca inteira", async () => {
  const { status, corpo, pedidos: feitos } = await lerMesa("&groupId=laranja");
  assert.equal(status, 400);
  assert.equal(corpo.code, "invalid_group_id");
  assert.equal(typeof corpo.requestId, "string");
  assert.equal(feitos.length, 0);
});

/* ============================== 2 · a etiqueta na tela ============================== */

const { montarRadar, React } = await import("./radar-dom-harness.mts");
const { OperationalDataGrid } = await import("../components/editorial/operational-data-grid.tsx");
const { ArticleGroupRowTag, ArticleGroupTaggingDialog, editorialGroupStripeClass } = await import("../components/editorial/article-group-controls.tsx");
const { EditorialGroupSelector } = await import("../components/editorial/group-selector.tsx");
const { TerritorialWorkspaceRows } = await import("../modules/arquiteto/territorial-workspace-rows.tsx");

const LARANJA = { id: GRUPO_A, marcaId: MARCA, name: "laranja", color: "laranja" as const, origin: "manual" as const, status: "active" as const, siloId: null, planVersion: 0, lockVersion: 1, updatedAt: "2026-10-12T00:00:00Z", keywordCount: 56, articleCount: 8 };

type Linha2 = { id: string; titulo: string; grupo: typeof LARANJA | null };

test("planilha · faixa de 4 px na primeira célula e etiqueta com bolinha + NOME; linha sem grupo fica como antes", async () => {
  const tela = await montarRadar();
  const linhas: Linha2[] = [{ id: "a", titulo: "Artigo A", grupo: LARANJA }, { id: "b", titulo: "Artigo B", grupo: null }];
  const colunas = [{ id: "titulo", header: "Artigo", value: (linha: Linha2) => linha.titulo, render: (linha: Linha2) => React.createElement("div", null, linha.titulo, React.createElement(ArticleGroupRowTag, { group: linha.grupo })) }];
  await tela.render(React.createElement(OperationalDataGrid<Linha2>, { module: "radar", userId: "dono", brandId: MARCA, rows: linhas, columns: colunas, rowStripeClassName: (linha: Linha2) => editorialGroupStripeClass(linha.grupo) }));
  const corpo = [...tela.container.querySelectorAll("tbody tr")];
  assert.equal(corpo.length, 2);
  const primeiraCelula = (linha: Element) => linha.querySelector("td")!.className;
  assert.match(primeiraCelula(corpo[0]), /border-l-4 border-l-group-laranja/);
  assert.doesNotMatch(primeiraCelula(corpo[1]), /border-l-group/);
  const etiquetas = tela.container.querySelectorAll("[data-editorial-group-tag]");
  assert.equal(etiquetas.length, 1);
  assert.match(etiquetas[0].textContent || "", /laranja/, "o nome sempre aparece");
  assert.doesNotMatch(corpo[0].className, /group-laranja/, "a linha inteira nunca é pintada");
  tela.destroy();
});

test("planilha · o grupo ativo é recorte de TELA: o grid recebe a lista inteira e mostra só o grupo; a lista não muda", async () => {
  const tela = await montarRadar();
  const linhas: Linha2[] = [{ id: "a", titulo: "Artigo A", grupo: LARANJA }, { id: "b", titulo: "Artigo B", grupo: null }, { id: "c", titulo: "Artigo C", grupo: LARANJA }];
  const copia = structuredClone(linhas);
  const colunas = [{ id: "titulo", header: "Artigo", value: (linha: Linha2) => linha.titulo }];
  const grade = (rowFilter?: (linha: Linha2) => boolean) => React.createElement(OperationalDataGrid<Linha2>, { module: "radar", userId: "dono", brandId: MARCA, rows: linhas, columns: colunas, rowFilter });
  await tela.render(grade((linha: Linha2) => linha.grupo?.id === GRUPO_A));
  assert.deepEqual([...tela.container.querySelectorAll("tbody tr")].map(linha => linha.textContent?.includes("Artigo B")), [false, false]);
  assert.equal(tela.container.querySelectorAll("tbody tr").length, 2);
  await tela.render(grade(undefined));
  assert.equal(tela.container.querySelectorAll("tbody tr").length, 3, "Todos os grupos: a lista inteira de volta, sem reler nada");
  assert.deepEqual(linhas, copia);
  tela.destroy();
});

test("aba Silos do Arquiteto · a linha da keyword ganha a mesma faixa e etiqueta", async () => {
  const tela = await montarRadar();
  const superficie = {
    emptyState: { isEmpty: false, message: "" },
    counts: { territories: 0, structures: 0, keywords: 2, unassigned: 2 },
    groups: [{ kind: "unassigned", header: null, rows: [{ keywordId: "k1", territoryRef: null, existingSiloId: null, hypothesis: null }, { keywordId: "k2", territoryRef: null, existingSiloId: null, hypothesis: null }] }],
  };
  await tela.render(React.createElement("table", null, React.createElement("tbody", null, React.createElement(TerritorialWorkspaceRows, {
    surface: superficie as never,
    keywordLabelFor: (id: string) => `keyword ${id}`,
    groupForKeyword: (id: string) => (id === "k1" ? LARANJA : null),
  }))));
  const linhas = [...tela.container.querySelectorAll("[data-testid='architect-territorial-keyword-row']")];
  assert.equal(linhas.length, 2);
  assert.match(linhas[0].querySelector("td")!.className, /border-l-4 border-l-group-laranja/);
  assert.match(linhas[0].querySelector("[data-editorial-group-tag]")?.textContent || "", /laranja/);
  assert.equal(linhas[1].querySelector("[data-editorial-group-tag]"), null);
  tela.destroy();
});

test("seletor · \"Sem grupo\" conta artigos no Radar e o menu traz \"Etiquetar artigos pelo grupo das keywords\"", async () => {
  const tela = await montarRadar();
  let abriu = 0;
  await tela.render(React.createElement(EditorialGroupSelector, {
    choice: "todos", onChoose: () => undefined, groups: [LARANJA], countsReady: true, ungroupedDetail: "2 artigos",
    menuFooter: (fechar: () => void) => React.createElement("button", { type: "button", "data-article-group-tag-open": true, onClick: () => { fechar(); abriu += 1; } }, "Etiquetar artigos pelo grupo das keywords"),
  }));
  await tela.click(tela.container.querySelector("[data-editorial-group-selector]") as HTMLElement);
  const documento = (globalThis as unknown as { document: Document }).document;
  assert.match(documento.body.textContent || "", /2 artigos/);
  assert.match(documento.body.textContent || "", /56 keywords · 8 artigos/);
  await tela.click(documento.querySelector("[data-article-group-tag-open]") as HTMLElement);
  assert.equal(abriu, 1);
  tela.destroy();
});

test("prévia de etiquetar · mostra o que cada artigo recebe e grava só os ids da prévia", async () => {
  const tela = await montarRadar();
  const gravados: string[][] = [];
  let fim = "";
  await tela.render(React.createElement(ArticleGroupTaggingDialog, {
    open: true,
    onClose: () => undefined,
    groupById: new Map([[GRUPO_A, LARANJA]]),
    loadPreview: async () => ({ ok: true as const, willTagCount: 1, entries: [
      { articleId: "a1", status: "will_tag" as const, groupId: GRUPO_A, origin: "subject" as const, inheritedGroupId: GRUPO_A, reason: "subject" as const, label: "melhor plano de internet residencial", statusLabel: "Vai receber o grupo" },
      { articleId: "a2", status: "kept_other" as const, groupId: GRUPO_A, origin: "human" as const, inheritedGroupId: null, reason: "no_group" as const, label: "plano vivo controle", statusLabel: "Já tem outro grupo gravado — fica como está" },
    ] }),
    apply: async (ids: readonly string[]) => { gravados.push([...ids]); return { ok: true as const, tagged: ids.length, notConfirmed: 0, skipped: 0 }; },
    onDone: (mensagem: string) => { fim = mensagem; },
  }));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const documento = (globalThis as unknown as { document: Document }).document;
  assert.match(documento.body.textContent || "", /melhor plano de internet residencial/);
  assert.match(documento.body.textContent || "", /pelo Assunto/);
  assert.match(documento.body.textContent || "", /Ficam como estão \(1\)/);
  await tela.click(documento.querySelector("[data-article-group-tag-apply]") as HTMLElement);
  assert.deepEqual(gravados, [["a1"]]);
  assert.match(fim, /1 artigo\(s\) etiquetado\(s\)/);
  tela.destroy();
});
