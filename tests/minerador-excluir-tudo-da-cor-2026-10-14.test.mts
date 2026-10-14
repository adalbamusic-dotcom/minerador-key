import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importDeclaredPlanWithCore } from "../lib/minerador/declared-plan-import-core.ts";
import { ensureEditorialGroupForColor, readEditorialGroupPlan } from "../lib/editorial/editorial-groups-store.ts";
import { groupEventHistoryEntry } from "../lib/editorial/group-history.ts";
import { keywordSubjectBlocksDeletion, resolveDeclaredPrincipal, resolveKeywordSubject, setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import {
  buildGroupDeleteAllPreview,
  checkGroupDeleteAllConfirmation,
  GROUP_DELETE_ALL_BLOCK_SIZE,
  GROUP_DELETE_ALL_HARD_PHRASE,
  GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE,
  GROUP_DELETE_ALL_RELEASE_VIA,
  type GroupDeleteAllKeyword,
} from "../lib/minerador/group-delete-all.ts";
import { applyGroupDeleteAllWithCore, previewGroupDeleteAllWithCore } from "../lib/minerador/group-delete-all-core.ts";
import { CorFakeDb, liberacaoDaCor, type Row } from "./excluir-cor-fake-db.mts";

/*
 * ===== F7 · EXCLUIR TUDO DA COR X (2026-10-14) =====
 *
 * SDD docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md,
 * item 6 (§10.2), D6/D7/D8; migration M-E 20261016130000_excluir_tudo_da_cor.
 * Pedido do dono: "se quero apagar toda a lista de uma tag tem que ter essa
 * opção", "de acordo aos contratos que já temos a nível global".
 *
 * Tudo em banco de mentira (`tests/excluir-cor-fake-db.mts`): NENHUMA exclusão
 * é chamada contra banco real; nada pago.
 */

const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OUTRA_MARCA = "61d2e019-0000-4000-8000-0000000000aa";
const ACTOR = "8f0c2a4e-1111-4222-8333-444455556666";
const G = "a9d5c87b-0000-4000-8000-000000000001";
const G_AZUL = "a9d5c87b-0000-4000-8000-000000000002";
const G_OUTRA = "a9d5c87b-0000-4000-8000-0000000000ff";
const AT = "2026-10-12T16:00:00.000Z";

const cabecalho = "Nome: Planos e contratação\nSlug: /planos-de-internet/\nObjetivo: Ajudar a escolher e contratar internet residencial.";
const artigos = [
  "1. Como escolher o melhor plano de internet residencial\nArtigo pilar • Palavra-chave: melhor plano de internet residencial\nComo comparar planos.",
  "2. Internet residencial barata: onde achar\nPalavra-chave: internet residencial barata\nOnde achar planos baratos.",
  "3. Claro, Vivo ou TIM: qual escolher\nPalavra-chave: Claro Vivo ou TIM internet\nComparação das três operadoras.",
  "4. Internet sem fidelidade\nPalavra-chave: internet residencial sem fidelidade\nPlanos sem multa.",
];
const PLANO = [cabecalho, ...artigos].join("\n");

const S = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"];
const P = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004"];
const X = {
  solta: "20000000-0000-4000-8000-000000000001",
  publicada: "20000000-0000-4000-8000-000000000002",
  redator: "20000000-0000-4000-8000-000000000003",
  noArtigo: "20000000-0000-4000-8000-000000000004",
  azul: "20000000-0000-4000-8000-000000000005",
  outraMarca: "20000000-0000-4000-8000-000000000006",
};

const assunto = (): Row => {
  const result = setKeywordSubject({ dna_origem: "logico_deterministico" }, { note: "Para quem quer trocar de plano", actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(result.ok);
  return result.semantic;
};
const kw = (id: string, keyword: string, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "aprovado", group_id: G, deleted_at: null, volume_search: 260, results_allintitle: null, analise_semantica: { dna_origem: "logico_deterministico" }, ...extra });
const grupo = (id: string, color: string, name: string, marca = BRAND): Row => ({ id, marca_id: marca, name, color, origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT });
const artigoDna = (versionId: string, entityId: string, versionNumber: number, articleId: string, principal: string, phrase: string): Row => ({
  version_id: versionId, entity_id: entityId, version_number: versionNumber, status: "approved", marca_id: BRAND, artifact_type: "article_dna",
  payload: { articleId, principalKeywordId: principal, secondaryKeywordIds: [], narrativeReinforcementIds: [], subject: { keywordId: principal, phrase }, suggestedSlug: phrase.toLowerCase().replace(/\s+/g, "-") },
});

function marca(extras: { soPlano?: boolean } = {}): CorFakeDb {
  return new CorFakeDb({
    editorial_groups: [grupo(G, "laranja", "Laranja"), grupo(G_AZUL, "azul", "Azul"), grupo(G_OUTRA, "verde", "Verde", OUTRA_MARCA)],
    editorial_group_events: [],
    editorial_group_articles: [],
    editorial_artifact_versions: [],
    editorial_version_status_events: [],
    editorial_workflow_items: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [
      kw(S[0], "Como escolher o melhor plano de internet residencial", { analise_semantica: assunto() }),
      kw(S[1], "Internet residencial barata: onde achar", { analise_semantica: assunto() }),
      kw(S[2], "Claro, Vivo ou TIM: qual escolher", { analise_semantica: assunto() }),
      kw(S[3], "Internet sem fidelidade", { analise_semantica: assunto() }),
      kw(P[0], "melhor plano de internet residencial"),
      kw(P[1], "internet residencial barata"),
      kw(P[2], "Claro Vivo ou TIM internet", { status: "bruto", volume_search: null }),
      kw(P[3], "internet residencial sem fidelidade"),
      ...(extras.soPlano ? [] : [
        kw(X.solta, "internet fibra barata"),
        kw(X.publicada, "plano de internet residencial"),
        kw(X.redator, "internet para home office"),
        kw(X.noArtigo, "wifi 6 vale a pena"),
      ]),
      kw(X.azul, "roteador wifi", { group_id: G_AZUL }),
      { ...kw(X.outraMarca, "internet fibra barata"), brand_id: OUTRA_MARCA, group_id: G_OUTRA },
    ],
  });
}

async function comPlano(extras: { soPlano?: boolean } = {}): Promise<CorFakeDb> {
  const db = marca(extras);
  const gravado = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", text: PLANO, group: { mode: "existing", groupId: G }, importRequestId: "6a1c0d2e-1111-4222-8333-444455556666", now: AT });
  assert.ok(gravado.ok && gravado.mode === "apply" && gravado.failed === 0, JSON.stringify(gravado));
  return db;
}

/** A cena "de verdade": publicada, documento no Redator, keyword no ArticleDNA vigente, principal de um artigo do plano num ArticleDNA vigente e um artigo retirado. */
function cena(db: CorFakeDb) {
  db.publicadas.add(X.publicada);
  db.bloqueadas.add(X.redator);
  db.tables.editorial_artifact_versions.push(
    artigoDna("v-wifi-1", "art-wifi", 1, "art-wifi", X.solta, "Wifi antigo"),
    artigoDna("v-wifi-2", "art-wifi", 2, "art-wifi", X.noArtigo, "Wifi 6 vale a pena"),
    artigoDna("v-barata-1", "art-barata", 1, "art-barata", P[1], "Internet barata"),
    artigoDna("v-retirado-1", "art-retirado", 1, "art-retirado", X.solta, "Artigo retirado"),
  );
  // O artigo retirado do Silo ("Retirar artigo do Silo" = evento rejected na vigente): não cita mais.
  db.tables.editorial_version_status_events.push({ version_id: "v-retirado-1", status: "rejected", occurred_at: "2026-10-13T10:00:00.000Z" });
  db.tables.editorial_workflow_items.push({ marca_id: BRAND, article_id: "art-wifi", stage: "radar" }, { marca_id: BRAND, article_id: "art-barata", stage: "writer" });
}

const previa = (db: CorFakeDb, includePublished = false, groupId = G) => previewGroupDeleteAllWithCore({ client: db as never, brandId: BRAND, actorUserId: ACTOR, groupId, includePublished });
const aplicar = (db: CorFakeDb, input: { decisionHash: string | null; includePublished?: boolean; typed: Record<string, unknown> }) => {
  let n = 0;
  return applyGroupDeleteAllWithCore({ client: db as never, brandId: BRAND, actorUserId: ACTOR, groupId: G, includePublished: input.includePublished ?? false, decisionHash: input.decisionHash, typed: input.typed, requestId: () => `7b000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
};
const exclusoesChamadas = (db: CorFakeDb) => db.rpcLog.filter(item => item.name === "lifecycle_delete_group_keywords").length;
const viva = (db: CorFakeDb, id: string) => db.rows("minerador_keywords").find(row => row.id === id) ?? null;
const ids = (itens: ReadonlyArray<{ id: string }>) => itens.map(item => item.id).sort();

test("prévia: o que sai de vez, o que fica fora (com motivo e caminho), Assuntos liberados, plano depois, cor no fim e outras áreas — sem escrever nada", async () => {
  const db = await comPlano();
  cena(db);
  const antes = JSON.stringify(db.tables);
  const r = await previa(db);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const p = r.preview;
  assert.equal(p.available, true);
  // O artigo 2 (S1 + P1) fica INTEIRO fora: P1 está no ArticleDNA vigente de "Internet barata".
  assert.deepEqual(ids(p.hard), [S[0], S[2], S[3], P[0], P[2], P[3], X.solta].sort());
  assert.deepEqual(p.recoverable, [], "publicada só com a marcação (D6)");
  const motivo = (id: string) => p.out.find(item => item.id === id);
  assert.equal(motivo(X.publicada)?.reason, "published_not_included");
  assert.equal(motivo(X.redator)?.reason, "blocked_descendant");
  assert.equal(motivo(X.noArtigo)?.reason, "architect_reference");
  assert.match(motivo(X.noArtigo)!.message, /ArticleDNA vigente de 1 artigo do Arquiteto \(“Wifi 6 vale a pena”\)/);
  assert.match(motivo(X.noArtigo)!.path || "", /Retirar artigo do Silo/);
  assert.equal(motivo(P[1])?.reason, "architect_reference");
  assert.equal(motivo(S[1])?.reason, "same_article", "o Assunto do artigo fica com a principal");
  assert.equal(motivo(X.solta), undefined, "a versão ANTIGA do ArticleDNA e o artigo retirado (rejected) não prendem a keyword");
  assert.ok(!p.out.some(item => item.id === X.azul || item.id === X.outraMarca), "outra cor e outra marca nem aparecem");
  assert.deepEqual(p.releasedSubjects.map(item => item.order), [1, 3, 4]);
  assert.equal(p.releasedSubjects[0].role, "Pilar");
  assert.deepEqual(p.plan, { hasPlan: true, articlesNow: 4, articlesLeaving: 3, articlesStaying: 1, after: "reduced", nextPlanVersion: 2 });
  assert.equal(p.color.freedAtEnd, false);
  assert.ok(p.color.keptBecause.some(item => /5 keywords ficam fora/.test(item)));
  const areas = Object.fromEntries(p.areas.map(area => [area.area, area]));
  assert.equal(areas.minerador.executable, true);
  for (const area of ["arquiteto", "radar", "redator", "publicacoes"]) assert.equal(areas[area].executable, false, area);
  assert.match(areas.arquiteto.reason || "", /O Arquiteto não exclui keyword \(F4\)/);
  assert.match(areas.radar.reason || "", /Sem contrato de exclusão no Radar \(D8/);
  assert.deepEqual(areas.radar.items.map(item => item.id), ["art-wifi"]);
  assert.deepEqual(areas.redator.items.map(item => item.id), ["art-barata"]);
  assert.deepEqual(p.confirmation, { colorWord: "laranja", hardPhrase: GROUP_DELETE_ALL_HARD_PHRASE, publishedNames: [] });
  assert.equal(p.blocks.length, 1);
  assert.match(r.decisionHash, /^sha256:/);
  assert.equal(JSON.stringify(db.tables), antes, "a prévia não escreve");
  assert.equal(exclusoesChamadas(db), 0, "a prévia não exclui");
});

test("D6 · publicada só com a marcação, na lixeira de 24 h, com o nome digitado; o hash muda com a marcação", async () => {
  const db = await comPlano();
  cena(db);
  const sem = await previa(db);
  const com = await previa(db, true);
  assert.ok(sem.ok && com.ok);
  if (!sem.ok || !com.ok) return;
  assert.notEqual(sem.decisionHash, com.decisionHash);
  assert.deepEqual(ids(com.preview.recoverable), [X.publicada]);
  assert.deepEqual(com.preview.confirmation.publishedNames, [{ id: X.publicada, keyword: "plano de internet residencial" }]);
  assert.equal(com.preview.blocks[0].allowRecoverable, true);
  assert.ok(com.preview.color.keptBecause.some(item => /lixeira de 24 h e prendem a cor/.test(item)));
  const semNome = await aplicar(db, { decisionHash: com.decisionHash, includePublished: true, typed: { color: "Laranja", phrase: "apaga de vez" } });
  assert.ok(!semNome.ok && semNome.code === "CONFIRMATION_REQUIRED" && /o nome da publicada “plano de internet residencial”/.test(semNome.message));
  assert.equal(exclusoesChamadas(db), 0);
  const feito = await aplicar(db, { decisionHash: com.decisionHash, includePublished: true, typed: { color: "laranja", phrase: "APAGA DE VEZ", publishedNames: { [X.publicada]: " Plano de internet residencial " } } });
  assert.ok(feito.ok, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual(feito.recoverableIds, [X.publicada]);
  assert.ok(viva(db, X.publicada)?.deleted_at, "a publicada foi para a lixeira, não sumiu");
  assert.equal(feito.color.freed, false, "a publicada na lixeira prende a cor (D7)");
});

test("confirmação forte: sem o nome da cor ou sem \"apaga de vez\" nada é excluído; a regra é a mesma na tela e no servidor", async () => {
  const db = await comPlano();
  cena(db);
  const r = await previa(db);
  assert.ok(r.ok);
  if (!r.ok) return;
  for (const typed of [{}, { color: "azul", phrase: "apaga de vez" }, { color: "laranja" }, { color: "laranja", phrase: "apagar" }]) {
    const recusa = await aplicar(db, { decisionHash: r.decisionHash, typed });
    assert.ok(!recusa.ok && recusa.code === "CONFIRMATION_REQUIRED", JSON.stringify(typed));
  }
  assert.equal(exclusoesChamadas(db), 0);
  assert.equal(viva(db, S[0])?.id, S[0]);
  // Domínio: maiúsculas e espaços nas pontas não importam (como o nome digitado da exclusão comum).
  assert.deepEqual(checkGroupDeleteAllConfirmation(r.preview, { color: "  LARANJA ", phrase: "Apaga de Vez" }), { ok: true });
  const soLixeira = { confirmation: { colorWord: "azul", hardPhrase: null, publishedNames: [] } };
  assert.deepEqual(checkGroupDeleteAllConfirmation(soLixeira, { color: "azul" }), { ok: true }, "sem exclusão definitiva, \"apaga de vez\" não é pedido");
  // Decisão velha ou ausente.
  const semHash = await aplicar(db, { decisionHash: null, typed: { color: "laranja", phrase: "apaga de vez" } });
  assert.ok(!semHash.ok && semHash.code === "DECISION_REQUIRED");
  const velha = await aplicar(db, { decisionHash: "sha256:outra", typed: { color: "laranja", phrase: "apaga de vez" } });
  assert.ok(!velha.ok && velha.code === "DECISION_STALE" && velha.preview && velha.decisionHash === r.decisionHash, "a recusa devolve a prévia nova");
  assert.equal(exclusoesChamadas(db), 0);
});

test("Assunto: liberado com a via da exclusão da cor e excluído NA MESMA transação; sem a liberação o gatilho recusaria", async () => {
  const db = await comPlano();
  cena(db);
  // Sem a liberação: a exclusão comum recusa a keyword que carrega o Assunto do plano (o gatilho do banco).
  const comum = await db.exclusaoComum(BRAND, [S[0]]);
  assert.match(String(comum.error?.message), /^KEYWORD_DELETE_SUBJECT_PROTECTED/);
  assert.ok(viva(db, S[0]) && resolveKeywordSubject(viva(db, S[0])!.analise_semantica as Row).plan, "nada mudou");
  assert.equal(keywordSubjectBlocksDeletion(viva(db, S[0])!.analise_semantica as Row), true);
  assert.equal(keywordSubjectBlocksDeletion(liberacaoDaCor(viva(db, S[0])!.analise_semantica as Row, { actorId: ACTOR, requestId: "r", at: AT })), false, "com o marcador da exclusão da cor, o gatilho deixa passar");

  const r = await previa(db);
  assert.ok(r.ok);
  if (!r.ok) return;
  const feito = await aplicar(db, { decisionHash: r.decisionHash, typed: { color: "laranja", phrase: "apaga de vez" } });
  assert.ok(feito.ok, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.equal(db.transacoes.length, 1, "um bloco = uma chamada = uma transação");
  const passos = db.transacoes[0].passos;
  for (const id of [S[0], S[2], S[3]]) {
    assert.ok(passos.indexOf(`libera:${id}`) >= 0 && passos.indexOf(`libera:${id}`) < passos.indexOf(`apaga:${id}`), `${id}: libera antes de apagar, na mesma chamada`);
    assert.equal(viva(db, id), null);
  }
  assert.deepEqual(feito.hardDeletedIds.sort(), [S[0], S[2], S[3], P[0], P[2], P[3], X.solta].sort());
  assert.deepEqual(feito.releasedSubjectIds.sort(), [S[0], S[2], S[3], P[0], P[2], P[3]].sort(), "Assuntos e marcas de principal saem com o marcador");
  assert.equal(feito.readback.confirmed, true);
  // O que ficou fora não mudou: o artigo 2 (S1 + P1) continua no plano, com a marca recíproca.
  assert.ok(resolveKeywordSubject(viva(db, S[1])!.analise_semantica as Row).plan);
  assert.equal(resolveDeclaredPrincipal(viva(db, P[1])!.analise_semantica as Row).mark?.subjectKeywordId, S[1]);
  for (const id of [X.publicada, X.redator, X.noArtigo, X.azul, X.outraMarca]) assert.ok(viva(db, id) && !viva(db, id)!.deleted_at, id);
  // O plano do grupo acompanha: v2 com 1 artigo.
  const g = db.rows("editorial_groups").find(row => row.id === G)!;
  assert.equal(g.plan_version, 2);
  assert.equal((g.plan as Row).articleCount, 1);
  assert.equal(g.status, "active", "sobrou coisa: a cor continua ocupada");
  assert.equal(feito.plan && feito.plan.ok && feito.plan.outcome, "reduced");
  // O histórico do grupo: keywords_unassigned (com a via, as contagens e os Assuntos) e plan_changed.
  const eventos = db.rows("editorial_group_events").filter(row => row.group_id === G);
  const saida = eventos.find(row => row.event_type === "keywords_unassigned")!;
  const payload = saida.payload as Row;
  assert.equal(payload.via, GROUP_DELETE_ALL_RELEASE_VIA);
  assert.equal(payload.decisionHash, r.decisionHash);
  assert.deepEqual((payload.counts as Row), { hardDeleted: 7, recoverable: 0, out: 5, refusedBlocks: 0, refusedKeywords: 0 });
  assert.deepEqual(((payload.releasedSubjects as Row[]) ?? []).map(item => item.order), [1, 3, 4]);
  assert.ok((payload.keywords as string[]).includes("internet fibra barata"), "os textos das apagadas sobrevivem no histórico");
  const plano = eventos.find(row => row.event_type === "plan_changed" && (row.payload as Row).via === GROUP_DELETE_ALL_RELEASE_VIA)!;
  assert.equal((plano.payload as Row).planVersion, 2);
  const linha = groupEventHistoryEntry({ ...saida, occurred_at: "2026-10-14T12:00:00.000Z" });
  assert.match(linha?.detail || "", /Excluir tudo da cor · 7 apagada\(s\) de vez · 0 na lixeira de 24 h · 5 ficaram fora/);
});

test("D7 · nada ficou: plano limpo, Silo não consolidado desligado, cor liberada; reativar a cor começa SEM plano", async () => {
  const db = await comPlano({ soPlano: true });
  const g = db.rows("editorial_groups").find(row => row.id === G)!;
  g.silo_id = "silo-planos-nunca-consolidado";
  const r = await previa(db);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.preview.out.length, 0);
  assert.equal(r.preview.plan.after, "cleared");
  assert.deepEqual(r.preview.color, { freedAtEnd: true, keptBecause: [], siloUnlinkAtEnd: true });
  const feito = await aplicar(db, { decisionHash: r.decisionHash, typed: { color: "laranja", phrase: "apaga de vez" } });
  assert.ok(feito.ok && feito.complete, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual(feito.color, { freed: true, archived: true, siloUnlinked: true, keptBecause: [] });
  assert.equal(feito.plan && feito.plan.ok && feito.plan.outcome, "cleared");
  assert.equal(g.status, "archived");
  assert.equal(g.plan, null);
  assert.equal(g.plan_hash, null);
  assert.equal(g.origin, "manual");
  assert.equal(g.silo_id, null);
  assert.equal(g.plan_version, 2);
  const tipos = db.rows("editorial_group_events").filter(row => row.group_id === G).map(row => row.event_type);
  assert.deepEqual(tipos.slice(-3), ["plan_changed", "keywords_unassigned", "archived"]);
  const arquivado = db.rows("editorial_group_events").filter(row => row.event_type === "archived").at(-1)!;
  assert.equal((arquivado.payload as Row).via, GROUP_DELETE_ALL_RELEASE_VIA);
  assert.equal((arquivado.payload as Row).siloUnlinked, true);
  // Reativar a cor (mover algo para ela): o grupo volta, sem plano, com o histórico.
  const reativado = await ensureEditorialGroupForColor(db as never, { brandId: BRAND, actorUserId: ACTOR, color: "laranja" });
  assert.ok(reativado.ok && reativado.outcome === "reactivated" && reativado.group.id === G, JSON.stringify(reativado));
  const plano = await readEditorialGroupPlan(db as never, BRAND, G);
  assert.ok(plano.ok && plano.group && plano.group.plan === null && plano.group.status === "active");
});

test("D7 · Silo CONSOLIDADO (tem SiloDNA) prende a cor: não é desligado nem desfeito por aqui", async () => {
  const db = await comPlano({ soPlano: true });
  const g = db.rows("editorial_groups").find(row => row.id === G)!;
  g.silo_id = "silo-planos";
  db.tables.editorial_artifact_versions.push({ version_id: "sd-1", entity_id: "silo-planos", version_number: 1, status: "approved", marca_id: BRAND, artifact_type: "silo_dna", payload: { siloId: "silo-planos" } });
  const r = await previa(db);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.preview.color.freedAtEnd, false);
  assert.ok(r.preview.color.keptBecause.some(item => /Silo consolidado/.test(item)));
  const feito = await aplicar(db, { decisionHash: r.decisionHash, typed: { color: "laranja", phrase: "apaga de vez" } });
  assert.ok(feito.ok);
  assert.equal(g.status, "active");
  assert.equal(g.silo_id, "silo-planos");
  assert.equal(g.plan, null, "o plano sem artigos é limpo mesmo assim");
});

test("blocos de até 100: cada bloco tudo-ou-nada; um recusado não desfaz os anteriores e o relatório diz o que ficou", async () => {
  const db = new CorFakeDb({
    editorial_groups: [grupo(G, "laranja", "Laranja")],
    editorial_group_events: [], editorial_group_articles: [], editorial_artifact_versions: [], editorial_version_status_events: [], editorial_workflow_items: [],
    minerador_keywords: Array.from({ length: 230 }, (_, i) => kw(`30000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `keyword ${i}`)),
  });
  db.recusarChamada = { n: 2, code: "GROUP_DELETE_OUTSIDE_GROUP" };
  const r = await previa(db);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.preview.blocks.map(bloco => bloco.ids.length), [100, 100, 30]);
  assert.ok(r.preview.effects.some(efeito => /3 blocos de até 100/.test(efeito)));
  const feito = await aplicar(db, { decisionHash: r.decisionHash, typed: { color: "laranja", phrase: "apaga de vez" } });
  assert.ok(feito.ok, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual(feito.blocks.map(bloco => bloco.outcome), ["done", "refused", "done"]);
  assert.match(feito.blocks[1].message || "", /não está mais viva nesta cor/);
  assert.equal(feito.hardDeletedIds.length, 130);
  assert.equal(db.rows("minerador_keywords").length, 100, "o bloco recusado ficou inteiro");
  assert.equal(feito.complete, false);
  assert.equal(feito.color.freed, false);
  assert.equal(db.rows("editorial_groups")[0].status, "active");
  const payload = db.rows("editorial_group_events").find(row => row.event_type === "keywords_unassigned")!.payload as Row;
  assert.deepEqual(payload.counts, { hardDeleted: 130, recoverable: 0, out: 0, refusedBlocks: 1, refusedKeywords: 100 });
  // Retomar = prévia nova (o que já saiu não volta) e confirmação nova.
  db.recusarChamada = null;
  const de_novo = await previa(db);
  assert.ok(de_novo.ok && de_novo.preview.totals.hard === 100);
});

test("o artigo do plano nunca é partido entre dois blocos; fora do grupo/marca e grupo de outra marca recusam", async () => {
  const linhas: GroupDeleteAllKeyword[] = Array.from({ length: 99 }, (_, i) => ({ id: `a${String(i).padStart(3, "0")}`, keyword: `k${i}`, status: null, subjectDeclared: false, plan: null, entryTitle: null, principalMark: null, lifecycle: "hard", architectRefs: [] }));
  linhas.push(
    { id: "b-assunto", keyword: "assunto", status: null, subjectDeclared: true, plan: { groupId: G, planVersion: 1, order: 1, role: "Pilar", scope: "x", declaredPrincipal: { keywordId: "b-principal", phrase: "principal" } }, entryTitle: "Assunto", principalMark: null, lifecycle: "hard", architectRefs: [] },
    { id: "b-principal", keyword: "principal", status: null, subjectDeclared: false, plan: null, entryTitle: null, principalMark: { subjectKeywordId: "b-assunto", groupId: G, planVersion: 1 }, lifecycle: "hard", architectRefs: [] },
  );
  const p = buildGroupDeleteAllPreview({ group: { id: G, name: "Laranja", color: "laranja", planVersion: 1, lockVersion: 1, siloId: null, hasPlan: true }, keywords: linhas, trashedCount: 0, taggedArticles: [], siloConsolidated: false, includePublished: false, available: true });
  assert.ok(p.blocks.every(bloco => bloco.ids.length <= GROUP_DELETE_ALL_BLOCK_SIZE));
  const comAssunto = p.blocks.find(bloco => bloco.ids.includes("b-assunto"))!;
  assert.ok(comAssunto.ids.includes("b-principal"), "Assunto e principal no mesmo bloco");
  // Assunto do plano de OUTRA cor e principal de Assunto de outra cor ficam fora.
  const outra = buildGroupDeleteAllPreview({ group: { id: G, name: "Laranja", color: "laranja", planVersion: 1, lockVersion: 1, siloId: null, hasPlan: false }, keywords: [
    { ...linhas[0], id: "c1", subjectDeclared: true, plan: { groupId: G_AZUL, planVersion: 1, order: 1, role: "Pilar", scope: "x", declaredPrincipal: null } },
    { ...linhas[0], id: "c2", principalMark: { subjectKeywordId: "fora-daqui", groupId: G_AZUL, planVersion: 1 } },
  ], trashedCount: 0, taggedArticles: [], siloConsolidated: false, includePublished: false, available: true });
  assert.deepEqual(outra.out.map(item => item.reason).sort(), ["principal_of_other_color", "subject_of_other_color"]);

  const db = await comPlano();
  const deOutraMarca = await previa(db, false, G_OUTRA);
  assert.ok(!deOutraMarca.ok && deOutraMarca.code === "GROUP_NOT_FOUND", "o grupo de outra marca não existe nesta");
  // A RPC recusa o bloco com id de outra cor (a conferência é do banco, abaixo do núcleo).
  const fora = await db.rpc("lifecycle_delete_group_keywords", { p_brand_id: BRAND, p_group_id: G, p_keyword_ids: [S[0], X.azul], p_actor_user_id: ACTOR, p_request_id: "r-1", p_allow_recoverable: false });
  assert.equal(fora.error?.message, "GROUP_DELETE_OUTSIDE_GROUP");
  assert.ok(viva(db, S[0]) && resolveKeywordSubject(viva(db, S[0])!.analise_semantica as Row).plan, "a recusa desfaz também a liberação");
});

test("sem a M-E aplicada: a prévia aparece com a explicação e o apply recusa sem chamar a exclusão (o deploy não quebra)", async () => {
  const db = await comPlano();
  db.meAplicada = false;
  const total = db.rows("minerador_keywords").length;
  const r = await previa(db);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.preview.available, false);
  assert.equal(r.preview.unavailableMessage, GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE);
  assert.match(GROUP_DELETE_ALL_NOT_AVAILABLE_MESSAGE, /20261016130000_excluir_tudo_da_cor não foi aplicada/);
  const recusa = await aplicar(db, { decisionHash: r.decisionHash, typed: { color: "laranja", phrase: "apaga de vez" } });
  assert.ok(!recusa.ok && recusa.code === "GROUP_DELETE_NOT_AVAILABLE");
  assert.equal(exclusoesChamadas(db), 0);
  assert.equal(db.rows("minerador_keywords").length, total, "nada saiu");
});

/* ------------------------------------------------------------- estrutura */

const limpa = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
const limpaSql = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8").replace(/--.*$/gm, "");

test("M-E: libera e chama a exclusão de sempre na MESMA função; até 100 ids, todos do grupo; só service_role; ensaio e pós-checagem", () => {
  const sql = limpaSql("../supabase/migrations/20261016130000_excluir_tudo_da_cor.sql");
  const corpo = sql.slice(sql.indexOf("CREATE FUNCTION public.lifecycle_delete_group_keywords("), sql.indexOf("COMMENT ON FUNCTION public.lifecycle_delete_group_keywords("));
  assert.match(corpo, /SECURITY DEFINER\s+SET search_path = pg_catalog, public, pg_temp/);
  assert.match(corpo, /total = 0 OR total > 100/);
  assert.match(corpo, /canonical_actor_can_use_brand_action\(p_brand_id, p_actor_user_id, 'minerador', 'manage'\)/);
  assert.match(corpo, /k\.group_id = p_group_id AND k\.deleted_at IS NULL\) <> total/);
  assert.match(corpo, /auth\.uid\(\) IS DISTINCT FROM p_actor_user_id/);
  const liberacao = corpo.indexOf("UPDATE public.minerador_keywords k");
  const exclusao = corpo.indexOf("public.lifecycle_delete_minerador_keywords(p_brand_id, alvo, p_actor_user_id");
  assert.ok(liberacao > 0 && exclusao > liberacao, "a liberação vem antes da exclusão de sempre, na mesma função (uma transação)");
  assert.match(corpo, /'via', 'excluir_cor'/);
  assert.match(corpo, /#- '\{keyword_subject,plan\}'\) - 'keyword_declared_principal'/);
  assert.doesNotMatch(corpo, /DELETE FROM public\.minerador_keywords/, "nenhum DELETE próprio: só o ciclo de vida de sempre");
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.lifecycle_delete_group_keywords\(uuid, uuid, uuid\[\], uuid, uuid, boolean\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.lifecycle_delete_group_keywords\(uuid, uuid, uuid\[\], uuid, uuid, boolean\) TO service_role;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.lifecycle_delete_group_keywords_contract\(\) TO service_role;/);
  assert.match(sql, /COR_PRE: aplique 20261015120000_assunto_nunca_se_perde antes\./);
  assert.match(sql, /COR_POS: % executável por anon\/authenticated\./);
  assert.match(sql, /RAISE EXCEPTION 'COR_ENSAIO_OK'/);
  assert.match(sql, /IF SQLERRM NOT LIKE 'KEYWORD_DELETE_SUBJECT_PROTECTED:%' THEN RAISE; END IF;/, "o ensaio prova que, sem a liberação, o gatilho recusa");
  assert.match(sql.trimEnd(), /COMMIT;$/);
  const original = readFileSync(new URL("../supabase/migrations/20261016130000_excluir_tudo_da_cor.sql", import.meta.url), "utf8");
  assert.match(original, /DO \$\$ BEGIN RAISE EXCEPTION 'ENSAIO'; END \$\$;/, "o cabeçalho ensina o ensaio");
  assert.match(original, /migration repair --status applied 20261016130000 --linked/);
  const rollback = limpaSql("../supabase/rollback/20261016130000_excluir_tudo_da_cor.rollback.sql");
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.lifecycle_delete_group_keywords\(uuid, uuid, uuid\[\], uuid, uuid, boolean\);/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.lifecycle_delete_group_keywords_contract\(\);/);
  // Sem os textos entre aspas (o verificador PROCURA "UPDATE …" dentro do corpo da função, como texto).
  const verificador = limpaSql("../supabase/scripts/20261016130000-excluir-tudo-da-cor-post-verifier-read-only.sql").replace(/'(?:[^']|'')*'/g, "''");
  assert.match(verificador, /^SELECT jsonb_build_object\(/m);
  assert.doesNotMatch(verificador,/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|GRANT|REVOKE)\b/i, "a conferência é só leitura");
});

test("tela, rota e MCP: só o Minerador executa; o Arquiteto só leva ao Minerador; nenhuma ferramenta MCP exclui", () => {
  const rota = limpa("../app/api/minerador/marcas/[brandId]/keywords/delete-group/route.ts");
  assert.match(rota, /requireMineradorLifecyclePermission\(profile, brandId, "manage"\)/);
  assert.match(rota, /previewGroupDeleteAllWithCore\(base\)/);
  assert.match(rota, /applyGroupDeleteAllWithCore\(\{ \.\.\.base, decisionHash/);
  const mcp = limpa("../lib/server/platform-mcp-tools.ts");
  assert.doesNotMatch(mcp, /delete-group|group-delete-all|lifecycle_delete_group_keywords|applyGroupDeleteAllWithCore/);
  const catalogo = readFileSync(new URL("../lib/agent/platform-catalog.ts", import.meta.url), "utf8");
  const operacao = catalogo.slice(catalogo.indexOf('id: "minerador.delete_group_keywords"'), catalogo.indexOf('id: "minerador.send_to_arquiteto"'));
  assert.match(operacao, /access: "ui"/);
  assert.match(operacao, /A IA nunca exclui/);
  assert.doesNotMatch(operacao, /tools:/);
  const dialogo = limpa("../components/editorial/group-delete-all-dialog.tsx");
  assert.match(dialogo, /preview && preview\.available && total > 0 && conferida\?\.ok/, "o botão só habilita com a M-E, algo a excluir e a confirmação conferida");
  assert.match(dialogo, /disabled=\{!podeExecutar\}/);
  const gerenciar = limpa("../components/editorial/group-manage-dialogs.tsx");
  assert.match(gerenciar, /area === "minerador" \? \(/, "só o Minerador abre a exclusão; as outras áreas ganham o link");
  assert.match(gerenciar, /Abrir no Minerador para excluir/);
  for (const arquivo of ["../modules/arquiteto/arquiteto-workspace.tsx"]) {
    assert.doesNotMatch(limpa(arquivo), /delete-group|applyGroupDeleteAll|EditorialGroupDeleteAllDialog/, `${arquivo}: o Arquiteto não exclui keyword (F4)`);
  }
  const nucleo = limpa("../lib/minerador/group-delete-all-core.ts");
  assert.doesNotMatch(nucleo, /\.delete\(\s*\)/, "o núcleo não apaga direto: só a RPC do ciclo de vida");
  assert.match(nucleo, /client\.rpc\(GROUP_DELETE_ALL_RPC/);
  const planilha = limpa("../modules/minerador/minerador-workspace.tsx");
  assert.match(planilha, /window\.addEventListener\(GROUP_DELETE_ALL_DONE_EVENT, aoExcluirCor\)/, "a planilha tira as linhas que o servidor confirmou");
});

test("defeito achado (SDD §10.2): a exclusão comum do Minerador fatia seleções acima de 100 (prévia e execução), bloco a bloco", () => {
  const planilha = limpa("../modules/minerador/minerador-workspace.tsx");
  assert.match(planilha, /keywordIds: unicos\.slice\(inicio, inicio \+ 100\)/, "a prévia vai em blocos de 100 e é somada");
  assert.match(planilha, /const bloco = review\.ids\.slice\(inicio, inicio \+ 100\);/, "a execução vai em blocos de 100");
  assert.match(planilha, /allowRecoverable: review\.publishedIds\.length > 0 && bloco\.some\(id => publicadasDaPrevia\.has\(id\)\)/, "a declaração da publicada só no bloco que tem publicada da prévia");
  assert.match(planilha, /O bloco seguinte foi recusado e nada dele saiu/, "o bloco recusado para a sequência e a tela diz o que saiu");
});
