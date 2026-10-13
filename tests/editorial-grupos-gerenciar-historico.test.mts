import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { editorialGroupReleaseBlockers, isColorDefaultGroupName, planEditorialGroupManage, type EditorialGroupOccupancy } from "../lib/editorial/editorial-group-manage.ts";
import { manageEditorialGroup } from "../lib/editorial/editorial-group-manage-store.ts";
import { formatHistoryCost, groupEventHistoryEntry, mergeGroupHistory, operationLedgerHistoryEntries, safeInternalHref } from "../lib/editorial/group-history.ts";
import { readEditorialGroupHistory } from "../lib/editorial/group-history-store.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * 2026-10-12 · "GERENCIAR A COR" E "HISTÓRICO DO GRUPO" (SDD do plano declarado
 * e grupos, §9.1-A e §10.4). Domínio, repositório com banco de mentira (sem
 * Supabase, sem rede, sem custo) e as provas estruturais das rotas.
 *
 *   · Nome (opcional): rótulo livre; vazio = o nome da cor.
 *   · Trocar a cor: só para cor LIVRE; cor ocupada = recusa explicada (nunca funde).
 *   · Liberar a cor: só sem keywords (nem na lixeira), artigos, plano ou Silo.
 *   · Histórico: eventos do grupo + registro do guarda (operation_ledger),
 *     tolerando que o registro ainda não exista. REAL_PROVIDER_CALLS = 0.
 */

const ROOT = process.cwd();
const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ler = (path: string) => semComentarios(readFileSync(join(ROOT, path), "utf8"));

const MARCA = "aaaaaaaa-0000-4000-8000-000000000001";
const OUTRA = "bbbbbbbb-0000-4000-8000-000000000002";
const ATOR = "cccccccc-0000-4000-8000-000000000003";
const LARANJA = "11111111-0000-4000-8000-000000000001";
const AZUL = "11111111-0000-4000-8000-000000000002";
const VERDE_VAZIO = "11111111-0000-4000-8000-000000000003";
const DE_OUTRA = "11111111-0000-4000-8000-000000000009";

const grupo = (id: string, marca: string, name: string, color: string, extra: Row = {}): Row => ({ id, marca_id: marca, name, color, origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, created_at: "2026-10-12T10:00:00Z", updated_at: "2026-10-12T10:00:00Z", ...extra });
const kw = (id: string, groupId: string | null, extra: Row = {}): Row => ({ id, keyword: id, brand_id: MARCA, group_id: groupId, deleted_at: null, status: "bruto", analise_semantica: {}, ...extra });

function banco(): PlanFakeDb {
  return new PlanFakeDb({
    editorial_groups: [
      grupo(LARANJA, MARCA, "Laranja", "laranja"),
      grupo(AZUL, MARCA, "Planos e contratação", "azul"),
      grupo(VERDE_VAZIO, MARCA, "Verde", "verde"),
      grupo(DE_OUTRA, OUTRA, "Lima", "lima"),
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    minerador_keywords: [kw("k1", LARANJA), kw("k2", LARANJA), kw("k3", AZUL), kw("k4", null)],
  });
}

const vazio: EditorialGroupOccupancy = { keywordCount: 0, trashedKeywordCount: 0, articleCount: 0, hasPlan: false, planVersion: 0, siloId: null };
const ativo = (id: string, name: string, color: "laranja" | "azul" | "verde" | "lima" | "amarelo", keywordCount = 0) => ({ id, name, color, status: "active" as const, keywordCount });

/* ================================ domínio ================================ */

test("domínio · nome opcional: rótulo livre; vazio volta ao nome da cor", () => {
  const atual = ativo(LARANJA, "Laranja", "laranja");
  const outros = [atual, ativo(AZUL, "Planos", "azul", 3)];
  const renomeado = planEditorialGroupManage({ group: atual, request: { name: "  Planos   residenciais " }, activeGroups: outros });
  assert.ok(renomeado.ok);
  if (renomeado.ok) assert.deepEqual(renomeado.change, { name: "Planos residenciais" });
  const comNome = ativo(LARANJA, "Planos residenciais", "laranja");
  const limpo = planEditorialGroupManage({ group: comNome, request: { name: "" }, activeGroups: [comNome] });
  assert.ok(limpo.ok);
  if (limpo.ok) assert.deepEqual(limpo.change, { name: "Laranja" });
  const igual = planEditorialGroupManage({ group: atual, request: { name: null }, activeGroups: [atual] });
  assert.equal(igual.ok, false);
  if (!igual.ok) assert.equal(igual.code, "GROUP_NOTHING_TO_CHANGE");
  const repetido = planEditorialGroupManage({ group: atual, request: { name: "planos" }, activeGroups: outros });
  assert.ok(!repetido.ok && repetido.code === "GROUP_NAME_TAKEN");
  const longo = planEditorialGroupManage({ group: atual, request: { name: "x".repeat(81) }, activeGroups: outros });
  assert.ok(!longo.ok && longo.code === "GROUP_NAME_INVALID");
  assert.equal(isColorDefaultGroupName("Laranja 2", "laranja"), true);
  assert.equal(isColorDefaultGroupName("Laranjas", "laranja"), false);
});

test("domínio · trocar a cor: só para cor livre; ocupada recusa explicando, nunca funde", () => {
  const atual = ativo(LARANJA, "Laranja", "laranja", 2);
  const ocupado = ativo(AZUL, "Planos e contratação", "azul", 12);
  const recusa = planEditorialGroupManage({ group: atual, request: { color: "azul" }, activeGroups: [atual, ocupado] });
  assert.equal(recusa.ok, false);
  if (!recusa.ok) {
    assert.equal(recusa.code, "GROUP_COLOR_TAKEN");
    assert.match(recusa.message, /Azul já tem um grupo ativo \(“Planos e contratação”\), com 12 keywords/);
    assert.match(recusa.message, /juntaria dois grupos — isso nunca é feito/);
  }
  const livre = planEditorialGroupManage({ group: atual, request: { color: "verde" }, activeGroups: [atual, ocupado] });
  assert.ok(livre.ok);
  if (livre.ok) assert.deepEqual(livre.change, { name: "Verde", color: "verde" }, "o nome que era só a cor acompanha a cor nova");
  const comNome = ativo(LARANJA, "Planos residenciais", "laranja", 2);
  const mantemNome = planEditorialGroupManage({ group: comNome, request: { color: "verde" }, activeGroups: [comNome] });
  assert.ok(mantemNome.ok);
  if (mantemNome.ok) assert.deepEqual(mantemNome.change, { color: "verde" }, "nome próprio fica");
  const invalida = planEditorialGroupManage({ group: atual, request: { color: "roxo" }, activeGroups: [atual] });
  assert.ok(!invalida.ok && invalida.code === "GROUP_COLOR_INVALID");
});

test("domínio · liberar a cor: só sem itens; a recusa diz quantos e o quê", () => {
  const atual = ativo(LARANJA, "Planos", "laranja", 56);
  const cheio = planEditorialGroupManage({ group: atual, request: { release: true }, activeGroups: [atual], occupancy: { keywordCount: 56, trashedKeywordCount: 2, articleCount: 8, hasPlan: true, planVersion: 1, siloId: "territory:x" } });
  assert.equal(cheio.ok, false);
  if (!cheio.ok) {
    assert.equal(cheio.code, "GROUP_NOT_EMPTY");
    assert.match(cheio.message, /56 keywords, 2 keywords na lixeira \(restauráveis\), 8 artigos etiquetados, plano declarado do Silo \(v1\), Silo consolidado ligado ao grupo/);
    assert.match(cheio.message, /Nada foi apagado/);
  }
  assert.deepEqual(editorialGroupReleaseBlockers(vazio), []);
  const livre = planEditorialGroupManage({ group: atual, request: { release: true }, activeGroups: [atual], occupancy: vazio });
  assert.ok(livre.ok);
  if (livre.ok) assert.deepEqual(livre.change, { status: "archived" });
  const misturado = planEditorialGroupManage({ group: atual, request: { release: true, name: "x" }, activeGroups: [atual], occupancy: vazio });
  assert.ok(!misturado.ok && misturado.code === "GROUP_MANAGE_CONFLICT");
  const arquivado = planEditorialGroupManage({ group: { ...atual, status: "archived" }, request: { name: "x" }, activeGroups: [] });
  assert.ok(!arquivado.ok && arquivado.code === "GROUP_ARCHIVED");
});

/* ============================== repositório ============================== */

test("repositório · renomear e trocar para cor livre: trava otimista, releitura e evento", async () => {
  const db = banco();
  const renomeado = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: LARANJA, lockVersion: 1, name: "Internet residencial" });
  assert.ok(renomeado.ok, JSON.stringify(renomeado));
  if (renomeado.ok) assert.equal(renomeado.group.name, "Internet residencial");
  const velho = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: LARANJA, lockVersion: 1, color: "lima" });
  assert.ok(!velho.ok && velho.code === "GROUP_STALE", "lockVersion velho não grava");
  const trocado = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: LARANJA, lockVersion: 2, color: "lima" });
  assert.ok(trocado.ok, JSON.stringify(trocado));
  if (trocado.ok) assert.equal(trocado.group.color, "lima", "lima está livre NESTA marca (o lima da outra marca não conta)");
  const tipos = db.rows("editorial_group_events").map(evento => evento.event_type);
  assert.deepEqual(tipos, ["renamed", "recolored"]);
  assert.ok(db.rows("editorial_group_events").every(evento => evento.marca_id === MARCA && evento.actor_id === ATOR));
  assert.deepEqual(db.rows("minerador_keywords").filter(row => row.group_id === LARANJA).map(row => row.id), ["k1", "k2"], "as keywords vão junto (mesmo grupo)");
});

test("repositório · cor ocupada e grupo de outra marca: recusa sem gravar nada", async () => {
  const db = banco();
  const antes = JSON.stringify(db.tables);
  const ocupada = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: LARANJA, lockVersion: 1, color: "azul" });
  assert.ok(!ocupada.ok && ocupada.code === "GROUP_COLOR_TAKEN");
  const deOutra = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: DE_OUTRA, lockVersion: 1, name: "x" });
  assert.ok(!deOutra.ok && deOutra.code === "GROUP_NOT_FOUND");
  assert.equal(JSON.stringify(db.tables), antes, "nada foi gravado");
});

test("repositório · liberar: recusa com keywords (inclusive na lixeira) e com plano; libera o vazio (arquiva, nada apagado)", async () => {
  const db = banco();
  const comKeywords = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: LARANJA, lockVersion: 1, release: true });
  assert.ok(!comKeywords.ok && comKeywords.code === "GROUP_NOT_EMPTY");
  if (!comKeywords.ok) assert.match(comKeywords.message, /2 keywords/);
  db.rows("minerador_keywords").push(kw("k-lixo", VERDE_VAZIO, { deleted_at: "2026-10-12T11:00:00Z" }));
  const naLixeira = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: VERDE_VAZIO, lockVersion: 1, release: true });
  assert.ok(!naLixeira.ok && naLixeira.code === "GROUP_NOT_EMPTY");
  if (!naLixeira.ok) assert.match(naLixeira.message, /1 keyword na lixeira \(restauráveis\)/);
  db.rows("minerador_keywords").splice(db.rows("minerador_keywords").findIndex(row => row.id === "k-lixo"), 1);
  db.rows("editorial_groups").find(row => row.id === VERDE_VAZIO)!.plan = { siloName: "x" };
  db.rows("editorial_groups").find(row => row.id === VERDE_VAZIO)!.plan_version = 1;
  const comPlano = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: VERDE_VAZIO, lockVersion: 1, release: true });
  assert.ok(!comPlano.ok && comPlano.code === "GROUP_NOT_EMPTY");
  if (!comPlano.ok) assert.match(comPlano.message, /plano declarado do Silo \(v1\)/);
  db.rows("editorial_groups").find(row => row.id === VERDE_VAZIO)!.plan = null;
  const livre = await manageEditorialGroup(db, { brandId: MARCA, actorUserId: ATOR, groupId: VERDE_VAZIO, lockVersion: 1, release: true });
  assert.ok(livre.ok, JSON.stringify(livre));
  if (livre.ok) {
    assert.equal(livre.action, "release");
    assert.equal(livre.group.status, "archived");
  }
  assert.equal(db.rows("editorial_groups").length, 4, "nenhum grupo apagado");
  assert.deepEqual(db.rows("editorial_group_events").map(evento => evento.event_type), ["archived"]);
});

/* ================================ histórico ================================ */

const evento = (id: string, groupId: string, tipo: string, quando: string, payload: Row = {}, marca = MARCA): Row => ({ id, marca_id: marca, group_id: groupId, event_type: tipo, payload, actor_id: ATOR, occurred_at: quando });
const registro = (subjectId: string, payload: Row, marca = MARCA): Row => ({ marca_id: marca, subject_type: "operation_ledger", subject_id: subjectId, stage: "architect", state: "recorded", payload, updated_at: "2026-10-12T18:00:00Z" });

test("histórico · domínio tolerante: evento, tentativas do registro do guarda, link só interno, custo", () => {
  const e = groupEventHistoryEntry(evento("e1", LARANJA, "recolored", "2026-10-12T17:30:00Z", { from: "laranja", to: "verde" }));
  assert.ok(e);
  assert.equal(e!.label, "Cor trocada");
  assert.equal(e!.detail, "Laranja → Verde");
  assert.equal(groupEventHistoryEntry({ group_id: LARANJA, event_type: "renamed" }), null, "sem data, descartado");
  const linhas = operationLedgerHistoryEntries(registro("article_improvement:abc", {
    kind: "article_improvement", fingerprint: "abc", groupId: LARANJA, inputsSummary: { alvos: 8 },
    attempts: [
      { at: "2026-10-12T16:31:00Z", actorId: ATOR, outcome: "success", outcomeCode: null, resultRef: "/wifi--x/arquiteto?execucao=1", costUsd: 0.224 },
      { at: "2026-10-12T16:40:00Z", actorId: ATOR, outcome: "refused", outcomeCode: "REWORK_SAME_INPUTS", resultRef: "https://fora.example/x", costUsd: "0" },
      { at: "não é data", outcome: "success" },
      "lixo",
    ],
  }), new Set([LARANJA]));
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].label, "Melhorar publicados e formar Assuntos");
  assert.equal(linhas[0].resultHref, "/wifi--x/arquiteto?execucao=1");
  assert.equal(linhas[0].costUsd, 0.224);
  assert.equal(linhas[1].outcome, "Recusado (REWORK_SAME_INPUTS)");
  assert.equal(linhas[1].resultHref, null, "link externo vindo do banco nunca vira link");
  assert.equal(linhas[1].resultRef, "https://fora.example/x");
  assert.deepEqual(operationLedgerHistoryEntries(registro("x:1", { kind: "x", groupId: AZUL, attempts: [{ at: "2026-10-12T10:00:00Z" }] }), new Set([LARANJA])), [], "registro de outro grupo não entra");
  assert.deepEqual(operationLedgerHistoryEntries({ subject_type: "article", payload: { groupId: LARANJA, attempts: [{ at: "2026-10-12T10:00:00Z" }] } }, new Set([LARANJA])), []);
  assert.deepEqual(operationLedgerHistoryEntries({ payload: "não é objeto" }, new Set([LARANJA])), []);
  assert.equal(safeInternalHref("//evil.example"), null);
  assert.equal(safeInternalHref("/a b"), null);
  assert.equal(formatHistoryCost(0.224), "US$ 0,224");
  assert.equal(formatHistoryCost(null), null);
  const juntos = mergeGroupHistory([evento("e2", LARANJA, "created", "2026-10-12T10:00:00Z", { name: "Laranja", color: "laranja" })], [registro("article_improvement:abc", { kind: "article_improvement", groupId: LARANJA, attempts: [{ at: "2026-10-12T16:31:00Z", outcome: "success" }] })], [LARANJA]);
  assert.deepEqual(juntos.map(entry => entry.source), ["operation_ledger", "group_event"], "do mais novo para o mais antigo");
});

test("histórico · leitura: só grupos desta marca; eventos + registro; registro ausente ou ilegível não derruba", async () => {
  const db = banco();
  db.tables.editorial_group_events = [
    evento("e1", LARANJA, "created", "2026-10-12T10:00:00Z", { name: "Laranja", color: "laranja" }),
    evento("e2", LARANJA, "keywords_assigned", "2026-10-12T11:00:00Z", { keywordIds: ["k1", "k2"] }),
    evento("e3", AZUL, "renamed", "2026-10-12T12:00:00Z", { from: "Azul", to: "Planos" }),
    evento("e4", DE_OUTRA, "created", "2026-10-12T12:30:00Z", {}, OUTRA),
  ];
  db.tables.editorial_workflow_items = [
    registro("article_improvement:abc", { kind: "article_improvement", groupId: LARANJA, attempts: [{ at: "2026-10-12T16:31:00Z", actorId: ATOR, outcome: "success", costUsd: 0.014 }] }),
    registro("article_improvement:zzz", { kind: "article_improvement", groupId: DE_OUTRA, attempts: [{ at: "2026-10-12T16:31:00Z", outcome: "success" }] }, OUTRA),
    { marca_id: MARCA, subject_type: "article", subject_id: "a1", stage: "radar", payload: { groupId: LARANJA }, updated_at: "2026-10-12T18:00:00Z" },
  ];
  const lido = await readEditorialGroupHistory(db, MARCA, [LARANJA, DE_OUTRA]);
  assert.ok(lido.ok);
  if (!lido.ok) return;
  assert.deepEqual(lido.groupIds, [LARANJA], "o grupo de outra marca é ignorado");
  assert.deepEqual(lido.entries.map(entry => entry.kind), ["article_improvement", "keywords_assigned", "created"]);
  assert.equal(lido.ledgerRead, true);
  assert.equal(lido.entries[1].detail, "2 item(ns)");

  // Nenhum registro do guarda ainda (F5 sem linhas): só os eventos.
  db.tables.editorial_workflow_items = [];
  const semRegistro = await readEditorialGroupHistory(db, MARCA, [LARANJA]);
  assert.ok(semRegistro.ok && semRegistro.entries.length === 2 && semRegistro.ledgerRead);

  // O registro falha na leitura: os eventos continuam, e a resposta diz.
  const quebrado = {
    from(tabela: string) {
      if (tabela !== "editorial_workflow_items") return db.from(tabela);
      const falha: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "in", "order", "limit"]) falha[metodo] = () => falha;
      falha.then = (ok: (valor: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "42703", message: "column does not exist" } }).then(ok);
      return falha;
    },
  };
  const comFalha = await readEditorialGroupHistory(quebrado as never, MARCA, [LARANJA]);
  assert.ok(comFalha.ok && comFalha.entries.length === 2 && comFalha.ledgerRead === false);
  const nada = await readEditorialGroupHistory(db, MARCA, []);
  assert.ok(nada.ok && nada.entries.length === 0);
});

/* ============================== rotas (estrutura) ============================== */

test("rotas · PATCH dos grupos = Gerenciar (edição em Minerador/Arquiteto/Radar); histórico só lê", () => {
  const grupos = ler("app/api/editorial/groups/route.ts");
  const patch = grupos.slice(grupos.indexOf("export async function PATCH"));
  assert.match(patch, /assertCanEnsureEditorialGroupColor\(profile, input\.marcaId\)/);
  assert.match(patch, /manageEditorialGroup\(editorialGroupsClient\(\)/);
  assert.doesNotMatch(patch, /updateEditorialGroup\(/, "nenhum caminho paralelo ao Gerenciar");
  const historico = ler("app/api/editorial/groups/history/route.ts");
  assert.match(historico, /export async function GET/);
  assert.doesNotMatch(historico, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.match(historico, /assertCanReadEditorialGroups\(profile, brandId\)/);
  assert.match(historico, /readEditorialGroupHistory\(/);
  for (const arquivo of ["app/api/editorial/groups/history/route.ts", "lib/editorial/group-history-store.ts", "lib/editorial/group-history.ts"]) {
    assert.doesNotMatch(ler(arquivo), /\.(insert|update|upsert|delete)\(/, `${arquivo} não escreve`);
  }
  const gerenciar = ler("lib/editorial/editorial-group-manage-store.ts");
  assert.match(gerenciar, /updateEditorialGroup\(client/, "grava pelo repositório de sempre (trava, releitura, evento)");
  assert.doesNotMatch(gerenciar, /\.(insert|upsert|delete)\(/);
});

test("tela · o histórico só é lido quando o dono abre (nunca no carregamento da área)", () => {
  const seletor = ler("components/editorial/group-selector.tsx");
  assert.doesNotMatch(seletor, /loadEditorialGroupHistory|groups\/history/, "o seletor não lê o histórico");
  const dialogos = ler("components/editorial/group-manage-dialogs.tsx");
  assert.match(dialogos, /export function EditorialGroupHistoryDialog/);
  assert.match(dialogos, /loadEditorialGroupHistory\(brandId/);
  assert.match(seletor, /\{historico \? <EditorialGroupHistoryDialog/, "o diálogo (e a leitura) só existe depois do clique");
});
