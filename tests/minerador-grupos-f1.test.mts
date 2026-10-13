import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import {
  EDITORIAL_GROUP_COLOR_CLASSES,
  EDITORIAL_GROUP_COLORS,
  editorialGroupCountLabel,
  editorialGroupFilterMatches,
  editorialGroupLastUsedStorageKey,
  isEditorialGroupsSchemaMissing,
  keywordGroupPlanAnchor,
  parseEditorialGroupFilter,
  parseEditorialGroupSummaryRow,
  planEditorialGroupUpdate,
  planKeywordGroupAssignment,
  resolveEditorialGroupFilter,
  serializeEditorialGroupFilter,
  validateNewEditorialGroup,
} from "../lib/editorial/editorial-groups.ts";
import { createEditorialGroup, ensureEditorialGroupForColor, listEditorialGroupSummaries, readEditorialGroup, updateEditorialGroup } from "../lib/editorial/editorial-groups-store.ts";
import { assignKeywordGroupWithCore, KEYWORD_GROUP_ID_CHUNK } from "../lib/minerador/keyword-group-core.ts";

/**
 * F1 DA SDD DE 2026-10-12 — GRUPOS POR COR NO MINERADOR.
 *
 * Domínio, repositório e núcleo com um banco de mentira (fixture em memória,
 * sem Supabase, sem rede, sem custo), mais as provas estruturais da
 * migration, da tela e da paleta. O isolamento entre marcas é testado nas três
 * camadas: grupo de outra marca não é lido, não etiqueta e não conta.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ============================ banco de mentira ============================ */

type Row = Record<string, unknown>;

class FakeDb {
  editorial_groups: Row[] = [];
  editorial_group_events: Row[] = [];
  minerador_keywords: Row[] = [];
  /** Tabela → erro devolvido em qualquer operação (ex.: migration não aplicada). */
  failures: Record<string, { code: string; message: string }> = {};
  /** Ids que a RLS do usuário esconde do UPDATE (a linha não volta). */
  rlsHidden = new Set<string>();
  updates: Array<{ table: string; patch: Row; ids: string[] }> = [];
  failEventsInsert = false;

  // `any`: o repositório e o núcleo pedem só o `from` do cliente do Supabase.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any {
    return new FakeQuery(this, table);
  }

  summaryRows(): Row[] {
    return this.editorial_groups.map(group => ({
      ...group,
      keyword_count: String(this.minerador_keywords.filter(k => k.group_id === group.id && k.brand_id === group.marca_id && !k.deleted_at).length),
      article_count: "0",
    }));
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: unknown = null;
  private returning = false;
  private head = false;
  private singleMode: "maybe" | "one" | null = null;
  private db: FakeDb;
  private table: string;
  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }
  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.head = Boolean(options?.head);
    else this.returning = true;
    return this;
  }
  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this; }
  is(column: string, value: unknown) { this.filters.push(row => (row[column] ?? null) === value); return this; }
  in(column: string, values: readonly unknown[]) { this.filters.push(row => values.includes(row[column])); return this; }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }
  then<A = { data: unknown; error: unknown }, B = never>(onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }
  private source(): Row[] {
    if (this.table === "editorial_group_summary") return this.db.summaryRows();
    if (this.table === "minerador_keywords") {
      return this.db.minerador_keywords.map(row => {
        const semantica = (row.analise_semantica || {}) as Record<string, any>;
        return { ...row, subject_plan: semantica.keyword_subject?.plan ?? null, declared_principal: semantica.keyword_declared_principal ?? null };
      });
    }
    return (this.db as unknown as Record<string, Row[]>)[this.table];
  }
  private finish(rows: Row[]) {
    if (this.singleMode === "maybe") return { data: rows[0] ?? null, error: null };
    if (this.singleMode === "one") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "not one row" } };
    return { data: rows, error: null };
  }
  private exec() {
    const failure = this.db.failures[this.table];
    if (failure) return { data: null, error: failure, count: null };
    const match = (row: Row) => this.filters.every(filter => filter(row));
    if (this.op === "select") {
      const rows = this.source().filter(match);
      if (this.head) return { data: null, error: null, count: rows.length };
      return this.finish(rows);
    }
    if (this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      if (this.table === "editorial_group_events") {
        if (this.db.failEventsInsert) return { data: null, error: { code: "42501", message: "denied" } };
        for (const row of rows) this.db.editorial_group_events.push({ id: randomUUID(), occurred_at: new Date().toISOString(), ...row });
        return this.finish(rows);
      }
      if (this.table === "editorial_groups") {
        const criados: Row[] = [];
        for (const row of rows) {
          const nomeRepetido = this.db.editorial_groups.some(group => group.marca_id === row.marca_id && group.status === "active" && String(group.name).trim().toLowerCase() === String(row.name).trim().toLowerCase());
          if (nomeRepetido) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"uq_editorial_groups_active_name\"" } };
          const novo = { id: randomUUID(), status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
          this.db.editorial_groups.push(novo);
          criados.push(novo);
        }
        return this.finish(criados);
      }
      throw new Error(`insert inesperado em ${this.table}`);
    }
    const alvo = (this.db as unknown as Record<string, Row[]>)[this.table];
    const atualizados: Row[] = [];
    for (const row of alvo) {
      if (!match(row)) continue;
      if (this.table === "minerador_keywords" && this.db.rlsHidden.has(String(row.id))) continue;
      Object.assign(row, this.payload as Row);
      atualizados.push(row);
    }
    this.db.updates.push({ table: this.table, patch: { ...(this.payload as Row) }, ids: atualizados.map(row => String(row.id)) });
    return this.finish(this.returning ? atualizados : []);
  }
}

const MARCA_A = randomUUID();
const MARCA_B = randomUUID();
const ATOR = randomUUID();

function keyword(brandId: string, extra: Row = {}): Row {
  return { id: randomUUID(), brand_id: brandId, keyword: `kw ${randomUUID().slice(0, 6)}`, group_id: null, deleted_at: null, status: "bruto", analise_semantica: {}, ...extra };
}

function grupo(db: FakeDb, brandId: string, extra: Row = {}): Row {
  const row = { id: randomUUID(), marca_id: brandId, name: `Grupo ${db.editorial_groups.length + 1}`, color: "amarelo", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, created_by: ATOR, updated_by: ATOR, updated_at: new Date().toISOString(), ...extra };
  db.editorial_groups.push(row);
  return row;
}

/* ================================ domínio ================================ */

test("F1-01 · paleta: 5 cores com nome e classes literais de tokens de grupo", () => {
  assert.deepEqual([...EDITORIAL_GROUP_COLORS], ["amarelo", "azul", "verde", "lima", "laranja"]);
  for (const cor of EDITORIAL_GROUP_COLORS) {
    const classes = EDITORIAL_GROUP_COLOR_CLASSES[cor];
    assert.equal(classes.stripe, `border-l-4 border-l-group-${cor}`);
    assert.equal(classes.dot, `bg-group-${cor}`);
    assert.match(classes.chip, new RegExp(`bg-group-${cor}-soft`));
  }
});

test("F1-02 · grupo novo: nome limpo, cor da paleta e nome único entre os ativos (sem caixa)", () => {
  assert.deepEqual(validateNewEditorialGroup({ name: "  Planos   e contratação ", color: "azul" }, []), { ok: true, name: "Planos e contratação", color: "azul" });
  assert.equal((validateNewEditorialGroup({ name: "   ", color: "azul" }, []) as { code: string }).code, "GROUP_NAME_INVALID");
  assert.equal((validateNewEditorialGroup({ name: "x".repeat(81), color: "azul" }, []) as { code: string }).code, "GROUP_NAME_INVALID");
  assert.equal((validateNewEditorialGroup({ name: "Planos", color: "roxo" }, []) as { code: string }).code, "GROUP_COLOR_INVALID");
  assert.equal((validateNewEditorialGroup({ name: "PLANOS e contratação", color: "verde" }, [{ name: "planos e contratação" }]) as { code: string }).code, "GROUP_NAME_TAKEN");
});

test("F1-03 · editar grupo: renomear, recolorir, arquivar e reativar com eventos; nada a mudar é recusado", () => {
  const atual = { name: "Planos", color: "amarelo" as const, status: "active" as const };
  const plano = planEditorialGroupUpdate(atual, { name: "Planos e contratação", color: "azul" }, [], "g1");
  assert.ok(plano.ok);
  assert.deepEqual(plano.ok && plano.patch, { name: "Planos e contratação", color: "azul" });
  assert.deepEqual(plano.ok && plano.events.map(event => event.eventType), ["renamed", "recolored"]);
  const arquivar = planEditorialGroupUpdate(atual, { status: "archived" }, [], "g1");
  assert.deepEqual(arquivar.ok && arquivar.events.map(event => event.eventType), ["archived"]);
  const reativarComNomeTomado = planEditorialGroupUpdate({ ...atual, status: "archived" }, { status: "active" }, [{ id: "g2", name: "planos" }], "g1");
  assert.equal((reativarComNomeTomado as { code: string }).code, "GROUP_NAME_TAKEN");
  assert.equal((planEditorialGroupUpdate(atual, { name: "Planos" }, [], "g1") as { code: string }).code, "GROUP_NOTHING_TO_CHANGE");
});

test("F1-04 · filtro: URL manda; sem URL, o último usado; grupo sumido ou arquivado volta a Todos (D12)", () => {
  const g1 = randomUUID();
  const g2 = randomUUID();
  const groups = [{ id: g1, status: "active" as const }, { id: g2, status: "archived" as const }];
  assert.deepEqual(resolveEditorialGroupFilter({ fromUrl: g1, remembered: "sem-grupo", groups }), { filter: { kind: "group", groupId: g1 }, source: "url" });
  assert.deepEqual(resolveEditorialGroupFilter({ fromUrl: null, remembered: "sem-grupo", groups }), { filter: { kind: "none" }, source: "remembered" });
  assert.deepEqual(resolveEditorialGroupFilter({ fromUrl: null, remembered: g1, groups }).filter, { kind: "group", groupId: g1 });
  assert.deepEqual(resolveEditorialGroupFilter({ fromUrl: g2, remembered: null, groups }).filter, { kind: "all" }, "arquivado não vira filtro");
  assert.deepEqual(resolveEditorialGroupFilter({ fromUrl: randomUUID(), remembered: g1, groups }).filter, { kind: "group", groupId: g1 }, "URL velha cai na lembrança");
  assert.deepEqual(resolveEditorialGroupFilter({ fromUrl: "todos", remembered: g1, groups }).filter, { kind: "all" }, "'todos' na URL é escolha explícita");
  assert.deepEqual(resolveEditorialGroupFilter({ fromUrl: null, remembered: null, groups }).filter, { kind: "all" });
  assert.equal(serializeEditorialGroupFilter({ kind: "all" }), null);
  assert.equal(serializeEditorialGroupFilter({ kind: "none" }), "sem-grupo");
  assert.deepEqual(parseEditorialGroupFilter("lixo"), { kind: "all" });
  assert.equal(editorialGroupLastUsedStorageKey(MARCA_A), `minerador-key:grupo-ativo:${MARCA_A}`);
  assert.equal(editorialGroupFilterMatches({ kind: "none" }, null), true);
  assert.equal(editorialGroupFilterMatches({ kind: "none" }, g1), false);
  assert.equal(editorialGroupFilterMatches({ kind: "group", groupId: g1 }, g1), true);
  assert.equal(editorialGroupFilterMatches({ kind: "all" }, g2), true);
});

test("F1-05 · sem a migration: erros de tabela/coluna de grupo viram 'indisponível'; outros erros não", () => {
  assert.equal(isEditorialGroupsSchemaMissing({ code: "42P01", message: "relation \"public.editorial_group_summary\" does not exist" }), true);
  assert.equal(isEditorialGroupsSchemaMissing({ code: "PGRST205", message: "Could not find the table 'public.editorial_group_summary' in the schema cache" }), true);
  assert.equal(isEditorialGroupsSchemaMissing({ code: "42703", message: "column minerador_keywords_listagem.group_id does not exist" }), true);
  assert.equal(isEditorialGroupsSchemaMissing({ code: "42703", message: "column foo does not exist" }), false);
  assert.equal(isEditorialGroupsSchemaMissing({ code: "42501", message: "permission denied" }), false);
  assert.equal(isEditorialGroupsSchemaMissing(null), false);
});

test("F1-06 · linha da view: contagem bigint em texto, cor fora da paleta descarta a linha", () => {
  const base = { id: randomUUID(), marca_id: MARCA_A, name: "Planos", color: "lima", origin: "manual", status: "active", silo_id: null, plan_version: 0, lock_version: 3, updated_at: "2026-10-12T10:00:00+00:00", keyword_count: "54", article_count: 8 };
  const lido = parseEditorialGroupSummaryRow(base);
  assert.equal(lido?.keywordCount, 54);
  assert.equal(lido?.lockVersion, 3);
  assert.equal(editorialGroupCountLabel(lido!), "54 keywords · 8 artigos");
  assert.equal(parseEditorialGroupSummaryRow({ ...base, color: "roxo" }), null);
});

test("F1-07 · etiquetar: outra marca e lixeira são 'não encontrada'; Assunto/principal com plano (F4) ficam presos", () => {
  const destino = randomUUID();
  const minha = keyword(MARCA_A);
  const daOutra = keyword(MARCA_B);
  const naLixeira = keyword(MARCA_A, { deleted_at: "2026-10-12T00:00:00Z" });
  const jaNoGrupo = keyword(MARCA_A, { group_id: destino });
  const comPlano: Row = { ...keyword(MARCA_A), subject_plan: { order: 1 } };
  const plano = planKeywordGroupAssignment({
    brandId: MARCA_A,
    keywordIds: [minha.id, daOutra.id, naLixeira.id, jaNoGrupo.id, comPlano.id, minha.id] as string[],
    targetGroupId: destino,
    rows: [minha, daOutra, naLixeira, jaNoGrupo, comPlano] as never,
  });
  assert.deepEqual(plano.toMove, [{ id: minha.id, fromGroupId: null }]);
  assert.deepEqual(plano.unchanged, [jaNoGrupo.id]);
  assert.deepEqual(plano.refused.map(item => [item.id, item.code]), [[daOutra.id, "KEYWORD_NOT_FOUND"], [naLixeira.id, "KEYWORD_NOT_FOUND"], [comPlano.id, "KEYWORD_PLAN_ANCHORED"]]);
  assert.equal(keywordGroupPlanAnchor({ subject_plan: null, declared_principal: null }), false);
  assert.equal(keywordGroupPlanAnchor({ declared_principal: { subjectKeywordId: "x" } }), true);
});

/* ============================== repositório ============================== */

test("F1-08 · listar: só os grupos da marca, com contagens e o 'Sem grupo' da marca", async () => {
  const db = new FakeDb();
  const a1 = grupo(db, MARCA_A, { name: "Planos", color: "azul" });
  grupo(db, MARCA_B, { name: "Da outra marca" });
  db.minerador_keywords.push(keyword(MARCA_A, { group_id: a1.id }), keyword(MARCA_A, { group_id: a1.id }), keyword(MARCA_A), keyword(MARCA_B), keyword(MARCA_A, { group_id: a1.id, deleted_at: "2026-10-01T00:00:00Z" }));
  const listing = await listEditorialGroupSummaries(db, MARCA_A);
  assert.ok(listing.ok);
  assert.deepEqual(listing.ok && listing.groups.map(group => [group.name, group.keywordCount]), [["Planos", 2]]);
  assert.equal(listing.ok && listing.ungroupedKeywordCount, 1);
  const deB = await readEditorialGroup(db, MARCA_B, a1.id as string);
  assert.deepEqual(deB, { ok: true, group: null }, "grupo da marca A não existe para a marca B");
});

test("F1-09 · sem a migration o repositório responde GROUPS_NOT_AVAILABLE, sem lançar", async () => {
  const db = new FakeDb();
  db.failures.editorial_group_summary = { code: "PGRST205", message: "Could not find the table 'public.editorial_group_summary' in the schema cache" };
  assert.deepEqual((await listEditorialGroupSummaries(db, MARCA_A)).ok, false);
  assert.equal((await listEditorialGroupSummaries(db, MARCA_A) as { code: string }).code, "GROUPS_NOT_AVAILABLE");
  const criar = await createEditorialGroup(db, { brandId: MARCA_A, actorUserId: ATOR, name: "Planos", color: "azul" });
  assert.equal((criar as { code: string }).code, "GROUPS_NOT_AVAILABLE");
  assert.equal(db.editorial_groups.length, 0);
});

test("F1-10 · criar: grava na marca, relê, registra o evento; nome repetido é recusado nas duas camadas", async () => {
  const db = new FakeDb();
  const criado = await createEditorialGroup(db, { brandId: MARCA_A, actorUserId: ATOR, name: " Planos e contratação ", color: "amarelo" });
  assert.ok(criado.ok);
  assert.equal(criado.ok && criado.group.name, "Planos e contratação");
  assert.equal(criado.ok && criado.group.marcaId, MARCA_A);
  assert.equal(db.editorial_groups[0].origin, "manual");
  assert.equal(db.editorial_groups[0].created_by, ATOR);
  assert.deepEqual(db.editorial_group_events.map(event => [event.event_type, event.marca_id, event.actor_id]), [["created", MARCA_A, ATOR]]);
  const repetido = await createEditorialGroup(db, { brandId: MARCA_A, actorUserId: ATOR, name: "PLANOS E CONTRATAÇÃO", color: "azul" });
  assert.equal((repetido as { code: string }).code, "GROUP_NAME_TAKEN");
  const outraMarca = await createEditorialGroup(db, { brandId: MARCA_B, actorUserId: ATOR, name: "Planos e contratação", color: "azul" });
  assert.ok(outraMarca.ok, "o mesmo nome vale noutra marca");
});

test("F1-11 · editar: trava otimista; versão velha é GROUP_STALE e nada muda", async () => {
  const db = new FakeDb();
  const g = grupo(db, MARCA_A, { name: "Planos", lock_version: 2 });
  const velho = await updateEditorialGroup(db, { brandId: MARCA_A, actorUserId: ATOR, groupId: g.id as string, lockVersion: 1, name: "Outro" });
  assert.equal((velho as { code: string }).code, "GROUP_STALE");
  assert.equal(g.name, "Planos");
  const certo = await updateEditorialGroup(db, { brandId: MARCA_A, actorUserId: ATOR, groupId: g.id as string, lockVersion: 2, color: "laranja" });
  assert.ok(certo.ok);
  assert.equal(g.color, "laranja");
  assert.equal(g.lock_version, 3);
  assert.deepEqual(db.editorial_group_events.map(event => event.event_type), ["recolored"]);
  const deOutraMarca = await updateEditorialGroup(db, { brandId: MARCA_B, actorUserId: ATOR, groupId: g.id as string, lockVersion: 3, color: "azul" });
  assert.equal((deOutraMarca as { code: string }).code, "GROUP_NOT_FOUND");
  assert.equal(g.color, "laranja");
});

/* ================================= núcleo ================================ */

test("F1-12 · mover: grava só group_id, relê, e registra entrada no destino e saída na origem", async () => {
  const db = new FakeDb();
  const origem = grupo(db, MARCA_A, { name: "Origem" });
  const destino = grupo(db, MARCA_A, { name: "Destino", color: "verde" });
  const k1 = keyword(MARCA_A, { group_id: origem.id, analise_semantica: { approved_package: { hash: "h1" } }, status: "aprovado" });
  const k2 = keyword(MARCA_A);
  db.minerador_keywords.push(k1, k2);
  const resultado = await assignKeywordGroupWithCore({ brandId: MARCA_A, actorUserId: ATOR, keywordIds: [k1.id as string, k2.id as string], groupId: destino.id as string, keywordsClient: db, groupsClient: db });
  assert.ok(resultado.ok);
  assert.deepEqual(resultado.ok && [...resultado.moved].sort(), [k1.id, k2.id].sort());
  assert.deepEqual(db.updates.filter(update => update.table === "minerador_keywords").map(update => Object.keys(update.patch)), [["group_id"]], "só a coluna do grupo");
  assert.equal(k1.status, "aprovado");
  assert.deepEqual(k1.analise_semantica, { approved_package: { hash: "h1" } }, "pacote aprovado intocado");
  const eventos = db.editorial_group_events.map(event => [event.event_type, event.group_id, (event.payload as { count: number }).count]);
  assert.deepEqual(eventos, [["keywords_assigned", destino.id, 2], ["keywords_unassigned", origem.id, 1]]);
});

test("F1-13 · isolamento: grupo da marca B não etiqueta keyword da marca A; keyword da B nunca é escrita pela rota da A", async () => {
  const db = new FakeDb();
  const grupoB = grupo(db, MARCA_B, { name: "Da B" });
  const grupoA = grupo(db, MARCA_A, { name: "Da A" });
  const kA = keyword(MARCA_A);
  const kB = keyword(MARCA_B);
  db.minerador_keywords.push(kA, kB);
  const cruzado = await assignKeywordGroupWithCore({ brandId: MARCA_A, actorUserId: ATOR, keywordIds: [kA.id as string], groupId: grupoB.id as string, keywordsClient: db, groupsClient: db });
  assert.equal((cruzado as { code: string }).code, "GROUP_NOT_FOUND");
  assert.equal(kA.group_id, null);
  const misturado = await assignKeywordGroupWithCore({ brandId: MARCA_A, actorUserId: ATOR, keywordIds: [kA.id as string, kB.id as string], groupId: grupoA.id as string, keywordsClient: db, groupsClient: db });
  assert.ok(misturado.ok);
  assert.deepEqual(misturado.ok && misturado.moved, [kA.id]);
  assert.deepEqual(misturado.ok && misturado.refused.map(item => [item.id, item.code]), [[kB.id, "KEYWORD_NOT_FOUND"]]);
  assert.equal(kB.group_id, null, "a keyword da marca B não foi tocada");
  assert.ok(db.updates.every(update => !update.ids.includes(kB.id as string)));
});

test("F1-14 · tirar do grupo, grupo arquivado, linha escondida pela RLS e histórico que falha", async () => {
  const db = new FakeDb();
  const g = grupo(db, MARCA_A, { name: "Planos" });
  const arquivado = grupo(db, MARCA_A, { name: "Velho", status: "archived" });
  const k1 = keyword(MARCA_A, { group_id: g.id });
  const k2 = keyword(MARCA_A, { group_id: g.id });
  db.minerador_keywords.push(k1, k2);
  const noArquivado = await assignKeywordGroupWithCore({ brandId: MARCA_A, actorUserId: ATOR, keywordIds: [k1.id as string], groupId: arquivado.id as string, keywordsClient: db, groupsClient: db });
  assert.equal((noArquivado as { code: string }).code, "GROUP_ARCHIVED");
  db.rlsHidden.add(k2.id as string);
  db.failEventsInsert = true;
  const tirar = await assignKeywordGroupWithCore({ brandId: MARCA_A, actorUserId: ATOR, keywordIds: [k1.id as string, k2.id as string], groupId: null, keywordsClient: db, groupsClient: db });
  assert.ok(tirar.ok);
  assert.deepEqual(tirar.ok && tirar.moved, [k1.id]);
  assert.deepEqual(tirar.ok && tirar.notConfirmed, [k2.id], "sem releitura não conta como movida");
  assert.equal(tirar.ok && tirar.eventsRecorded, false, "a falha do histórico é dita, não esconde a mudança confirmada");
  assert.equal(k1.group_id, null);
  assert.equal(k2.group_id, g.id);
});

test("F1-15 · lote grande em blocos de 200; sem a coluna, GROUPS_NOT_AVAILABLE", async () => {
  const db = new FakeDb();
  const g = grupo(db, MARCA_A, { name: "Lote" });
  for (let i = 0; i < 450; i += 1) db.minerador_keywords.push(keyword(MARCA_A));
  const ids = db.minerador_keywords.map(row => row.id as string);
  const resultado = await assignKeywordGroupWithCore({ brandId: MARCA_A, actorUserId: ATOR, keywordIds: ids, groupId: g.id as string, keywordsClient: db, groupsClient: db });
  assert.equal(resultado.ok && resultado.moved.length, 450);
  assert.deepEqual(db.updates.map(update => update.ids.length), [KEYWORD_GROUP_ID_CHUNK, KEYWORD_GROUP_ID_CHUNK, 50]);
  const semColuna = new FakeDb();
  grupo(semColuna, MARCA_A, { name: "X" });
  semColuna.failures.minerador_keywords = { code: "42703", message: "column minerador_keywords.group_id does not exist" };
  semColuna.minerador_keywords.push(keyword(MARCA_A));
  const r = await assignKeywordGroupWithCore({ brandId: MARCA_A, actorUserId: ATOR, keywordIds: [semColuna.minerador_keywords[0].id as string], groupId: semColuna.editorial_groups[0].id as string, keywordsClient: semColuna, groupsClient: semColuna });
  assert.equal((r as { code: string }).code, "GROUPS_NOT_AVAILABLE");
});

/* ============================== estrutura ================================ */

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(ROOT, dir))) {
    const caminho = join(ROOT, dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(relative(ROOT, caminho)));
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(relative(ROOT, caminho).split(sep).join("/"));
  }
  return saida;
}

test("F1-16 · escritor único de minerador_keywords.group_id: keyword-group-core; a rota usa o núcleo", () => {
  const escritores = ["lib", "app", "modules", "components"].flatMap(arquivos).filter(path => {
    const codigo = semComentarios(read(path));
    return /\.update\(\{\s*group_id\b/.test(codigo) || /from\("minerador_keywords"\)[\s\S]{0,400}?\.(update|upsert|insert)\(\{[^}]*\bgroup_id\s*:/.test(codigo);
  });
  assert.deepEqual(escritores, ["lib/minerador/keyword-group-core.ts"]);
  const rota = semComentarios(read("app/api/minerador/marcas/[brandId]/keywords/group/route.ts"));
  assert.match(rota, /assignKeywordGroupWithCore\(/);
  assert.match(rota, /requireTenantPermission\(\{ brandId, actorUserId: profile\.userId, module: "minerador", action: "edit", profile \}\)/);
  assert.match(rota, /keywordsClient: profile\.supabase/);
});

test("F1-17 · rota de grupos: leitura por quem vê a marca, escrita com minerador:edit, 409 sem a migration", () => {
  const rota = semComentarios(read("app/api/editorial/groups/route.ts"));
  assert.match(rota, /export async function GET/);
  assert.match(rota, /assertCanReadEditorialGroups\(profile, brandId\)/);
  // 2026-10-12 · "Gerenciar" a cor: o PATCH passou a exigir edição no Minerador, no Arquiteto OU no Radar
  // (as três áreas mostram a etiqueta); o POST com nome continua com minerador:edit.
  assert.equal((rota.match(/module: "minerador", action: "edit"/g) || []).length, 1, "POST com nome");
  assert.match(rota.slice(rota.indexOf("export async function PATCH")), /assertCanEnsureEditorialGroupColor\(profile, input\.marcaId\)/, "PATCH = Gerenciar");
  const servidor = read("lib/server/editorial-groups.ts");
  assert.match(servidor, /GROUPS_NOT_AVAILABLE: 409/);
  assert.match(servidor, /import "server-only"/);
});

test("F1-18 · migration M1: nome da SDD, transação, guardas, view com group_id no fim e rollback", () => {
  const sql = read("supabase/migrations/20261013120000_grupos_editoriais.sql");
  const corpo = sql.replace(/--[^\n]*/g, "");
  assert.match(corpo, /^\s*BEGIN;/m);
  assert.match(corpo, /^COMMIT;\s*$/m);
  assert.match(corpo, /GRUPOS_PRE: editorial_groups já existe/);
  assert.match(corpo, /GRUPOS_PRE: colunas de minerador_keywords_listagem divergem/);
  assert.match(corpo, /GRUPOS_POS: privilégios fora do contrato/);
  assert.match(corpo, /FOREIGN KEY \(group_id, brand_id\) REFERENCES public\.editorial_groups\(id, marca_id\) ON DELETE RESTRICT/);
  assert.match(corpo, /CREATE OR REPLACE VIEW public\.minerador_keywords_listagem WITH \(security_invoker = true\)/);
  assert.match(corpo, /k\.deleted_by,\s*k\.group_id\s*FROM public\.minerador_keywords k/);
  assert.match(corpo, /color IN \('amarelo', 'azul', 'verde', 'lima', 'laranja'\)/);
  assert.doesNotMatch(corpo, /UPDATE public\.minerador_keywords|INSERT INTO|DELETE FROM/i, "a M1 não mexe em dado");
  const rollback = read("supabase/rollback/20261013120000_grupos_editoriais.rollback.sql").replace(/--[^\n]*/g, "");
  assert.match(rollback, /^\s*BEGIN;/m);
  assert.match(rollback, /^COMMIT;\s*$/m);
  assert.match(rollback, /DROP COLUMN IF EXISTS group_id/);
  assert.match(rollback, /k\.deleted_by\s*FROM public\.minerador_keywords k/);
  assert.match(rollback, /GRUPOS_ROLLBACK: já existe plano declarado/);
});

test("F1-19 · tela do Minerador: recorte por grupo só quando há filtro, chave da carga com o grupo e poda local preservada", () => {
  const tela = semComentarios(read("modules/minerador/minerador-workspace.tsx"));
  assert.match(tela, /if \(comGrupo && filtroDeGrupo\.kind === "group"\) query = query\.eq\("group_id", filtroDeGrupo\.groupId\)/);
  assert.match(tela, /else if \(comGrupo && filtroDeGrupo\.kind === "none"\) query = query\.is\("group_id", null\)/);
  // 2026-10-12 · cores fixas: a cor lê todos os grupos ativos dela; cor sem grupo não consulta nada.
  assert.match(tela, /else if \(comGrupo && filtroDeGrupo\.kind === "groups"\) query = query\.in\("group_id", \[\.\.\.filtroDeGrupo\.groupIds\]\)/);
  assert.match(tela, /if \(filtroDeGrupo\.kind === "groups" && filtroDeGrupo\.groupIds\.length === 0\) return \[\];/);
  assert.match(tela, /\|grupo:\$\{keywordGroups\.filterKey\}/);
  assert.match(tela, /if \(!keywordGroups\.ready\) \{[\s\S]{0,400}fetchDataActiveKeyRef\.current = null;[\s\S]{0,300}setKeywords\(\[\]\)/, "troca de marca não deixa linha da outra marca na tela");
  assert.match(tela, /keywordGroups\.filter\.kind === "all" \? qualificationVersionCachePruneForListing\(loadedKeywords\.length\) : "loaded-entities"/, "carga recortada não poda o cache das outras keywords");
  assert.match(tela, /isEditorialGroupsSchemaMissing\(keywordsError\)[\s\S]{0,200}keywordGroups\.markUnavailable\(\)/);
  // 2026-10-12 · a etiqueta é da topbar global (fixa, na hora): o Minerador não registra nada para ela.
  assert.doesNotMatch(tela, /<EditorialGroupSelector|groupTag/, "o Minerador não monta mais o seletor");
  assert.match(tela, /const continuaNaVisao = keywordGroups\.keepsInView\(targetColor\);/);
  assert.match(tela, /const garantido = await keywordGroups\.ensureColorGroup\(targetColor\);[\s\S]{0,400}targetGroupId = garantido\.group\.id;[\s\S]{0,200}await keywordGroups\.assignKeywords\(ids, targetGroupId\)/, "mover por cor garante o grupo da cor antes de etiquetar");
  assert.equal((tela.match(/EDITORIAL_GROUP_COLORS\.map\(color => \{ const nome = editorialGroupCustomName\(color, keywordGroups\.groups\); return <option key=\{color\} value=\{color\}>Mover para \{EDITORIAL_GROUP_COLOR_LABELS\[color\]\}/g) || []).length, 2, "os dois selects do rodapé listam as 5 cores");
  assert.doesNotMatch(tela, /Crie um grupo no seletor do topo/);
  assert.match(tela, /EDITORIAL_GROUP_COLOR_CLASSES\[rowGroup\.color\]\.stripe/);
  assert.match(tela, /<EditorialGroupTag name=\{rowGroup\.name\} color=\{rowGroup\.color\}/);
  assert.doesNotMatch(tela, /border-l-group-\$\{|bg-group-\$\{/, "classe de cor nunca por interpolação");
  const hook = semComentarios(read("modules/minerador/use-minerador-groups.ts"));
  assert.match(hook, /useAreaGroupFilter\(alvo, "minerador"\)/);
  assert.match(hook, /ready: !alvo \|\| !recorte\.pending/, "só uma cor sem cache espera a lista de grupos");
  const estado = semComentarios(read("components/editorial/editorial-group-area-store.ts"));
  assert.match(estado, /window\.history\.replaceState/);
  assert.match(estado, /try \{\s*if \(typeof window !== "undefined"\) window\.localStorage\.setItem/);
  assert.match(estado, /try \{\s*return typeof window === "undefined" \? null : window\.localStorage\.getItem/);
  assert.doesNotMatch(hook + estado, /localStorage\.(removeItem|clear)\(/, "nunca limpa o armazenamento local");
});

test("F1-20 · paleta registrada: aliases de tokens em globals.css (sem valor bruto) e §5.0.2 no sistema visual", () => {
  const css = read("app/globals.css");
  const base: Record<string, string> = { amarelo: "pending", azul: "context-accent", verde: "positive-soft", lima: "highlight", laranja: "warning" };
  for (const [cor, token] of Object.entries(base)) {
    assert.match(css, new RegExp(`--group-${cor}: var\\(--${token}\\);`));
    assert.match(css, new RegExp(`--color-group-${cor}: var\\(--group-${cor}\\);`));
    assert.match(css, new RegExp(`--color-group-${cor}-soft: var\\(--group-${cor}-soft\\);`));
  }
  assert.doesNotMatch(css.match(/--group-[a-z-]+:[^;]+;/g)!.join("\n"), /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|oklch/i);
  const doc = read("docs/compartilhado/sistema-visual.md");
  assert.match(doc, /### 5\.0\.2 Cores de grupo/);
  const seletor = read("components/editorial/group-selector.tsx");
  assert.doesNotMatch(seletor, /text-xs|text-\[1[0-3]px\]/, "texto essencial com 14 px ou mais");
});

/* ================= 2026-10-12 · cores fixas: garantir o grupo da cor ================= */

test("F1-21 · garantir a cor: grupo ativo da cor volta como está (vários = o mais antigo); nada é escrito", async () => {
  const db = new FakeDb();
  const novo = grupo(db, MARCA_A, { name: "Plano B", color: "laranja", created_at: "2026-10-12T12:00:00+00:00" });
  const antigo = grupo(db, MARCA_A, { name: "laranja", color: "laranja", created_at: "2026-10-01T12:00:00+00:00" });
  grupo(db, MARCA_B, { name: "da outra", color: "azul", created_at: "2026-09-01T12:00:00+00:00" });
  const garantido = await ensureEditorialGroupForColor(db, { brandId: MARCA_A, actorUserId: ATOR, color: "laranja" });
  assert.ok(garantido.ok);
  assert.equal(garantido.ok && garantido.group.id, antigo.id, "o mais antigo da cor");
  assert.equal(garantido.ok && garantido.outcome, "existing");
  assert.notEqual(garantido.ok && garantido.group.id, novo.id);
  assert.equal(db.updates.length, 0);
  assert.equal(db.editorial_groups.length, 3, "nenhum grupo novo");
  assert.equal(db.editorial_group_events.length, 0, "nenhum evento");
});

test("F1-22 · garantir a cor: só arquivado da cor → reativa (evento); nome tomado por outro ativo → reativa com o nome da cor", async () => {
  const db = new FakeDb();
  const arquivado = grupo(db, MARCA_A, { name: "laranja", color: "laranja", status: "archived", created_at: "2026-10-01T00:00:00+00:00" });
  const garantido = await ensureEditorialGroupForColor(db, { brandId: MARCA_A, actorUserId: ATOR, color: "laranja" });
  assert.ok(garantido.ok);
  assert.equal(garantido.ok && garantido.outcome, "reactivated");
  assert.equal(garantido.ok && garantido.group.id, arquivado.id);
  assert.equal(arquivado.status, "active");
  assert.deepEqual(db.editorial_group_events.map(event => event.event_type), ["reactivated"]);

  const db2 = new FakeDb();
  const velho = grupo(db2, MARCA_A, { name: "Planos", color: "verde", status: "archived", created_at: "2026-10-01T00:00:00+00:00" });
  grupo(db2, MARCA_A, { name: "Planos", color: "azul", created_at: "2026-10-02T00:00:00+00:00" });
  const reativado = await ensureEditorialGroupForColor(db2, { brandId: MARCA_A, actorUserId: ATOR, color: "verde" });
  assert.ok(reativado.ok, reativado.ok ? "" : reativado.message);
  assert.equal(reativado.ok && reativado.group.id, velho.id);
  assert.equal(velho.status, "active");
  assert.equal(velho.name, "Verde", "o nome que colidia vira o nome da cor");
});

test("F1-23 · garantir a cor: sem grupo da cor → cria com o nome da cor (\"Laranja 2\" se o nome já é de outra cor); outra marca não conta", async () => {
  const db = new FakeDb();
  grupo(db, MARCA_B, { name: "Laranja", color: "laranja", created_at: "2026-10-01T00:00:00+00:00" });
  const criado = await ensureEditorialGroupForColor(db, { brandId: MARCA_A, actorUserId: ATOR, color: "laranja" });
  assert.ok(criado.ok);
  assert.equal(criado.ok && criado.outcome, "created");
  assert.equal(criado.ok && criado.group.name, "Laranja");
  assert.equal(criado.ok && criado.group.marcaId, MARCA_A);
  assert.deepEqual(db.editorial_group_events.map(event => [event.event_type, event.marca_id]), [["created", MARCA_A]]);
  const deNovo = await ensureEditorialGroupForColor(db, { brandId: MARCA_A, actorUserId: ATOR, color: "laranja" });
  assert.equal(deNovo.ok && deNovo.group.id, criado.ok && criado.group.id, "idempotente: a segunda vez devolve o mesmo");

  const db2 = new FakeDb();
  grupo(db2, MARCA_A, { name: "Laranja", color: "azul", created_at: "2026-10-01T00:00:00+00:00" });
  const segundo = await ensureEditorialGroupForColor(db2, { brandId: MARCA_A, actorUserId: ATOR, color: "laranja" });
  assert.equal(segundo.ok && segundo.group.name, "Laranja 2");
  assert.equal(segundo.ok && segundo.group.color, "laranja");

  const invalida = await ensureEditorialGroupForColor(db, { brandId: MARCA_A, actorUserId: ATOR, color: "roxo" });
  assert.equal((invalida as { code: string }).code, "GROUP_COLOR_INVALID");
});

test("F1-24 · garantir a cor: duas abas ao mesmo tempo — a segunda relê e devolve o grupo da primeira", async () => {
  const db = new FakeDb();
  const original = db.from.bind(db);
  let leiturasDeGrupos = 0;
  db.from = (table: string) => {
    if (table === "editorial_groups" && ++leiturasDeGrupos === 2) {
      // Entre a leitura e o insert, a outra aba cria o grupo da mesma cor.
      grupo(db, MARCA_A, { name: "Laranja", color: "laranja", created_at: "2026-10-12T00:00:00+00:00" });
    }
    return original(table);
  };
  const garantido = await ensureEditorialGroupForColor(db, { brandId: MARCA_A, actorUserId: ATOR, color: "laranja" });
  assert.ok(garantido.ok, garantido.ok ? "" : garantido.message);
  assert.equal(garantido.ok && garantido.outcome, "existing");
  assert.equal(db.editorial_groups.filter(row => row.color === "laranja").length, 1, "nenhum grupo duplicado");
});

test("F1-25 · rota: POST sem nome garante a cor com permissão de edição no Minerador, no Arquiteto ou no Radar; com nome segue como antes", () => {
  const rota = semComentarios(read("app/api/editorial/groups/route.ts"));
  assert.match(rota, /name: z\.string\(\)\.max\(400\)\.optional\(\),/);
  assert.match(rota, /if \(input\.name === undefined\) \{\s*const permitido = await assertCanEnsureEditorialGroupColor\(profile, input\.marcaId\);\s*const garantido = await ensureEditorialGroupForColor\(editorialGroupsClient\(\), \{ brandId: permitido\.brandId, actorUserId: permitido\.actorUserId, color: input\.color \}\);/);
  const servidor = semComentarios(read("lib/server/editorial-groups.ts"));
  assert.match(servidor, /export async function assertCanEnsureEditorialGroupColor[\s\S]{0,200}if \(!canEnsureEditorialGroupColor\(context\)\) \{\s*throw new AuthzError\(403,/);
  const tela = semComentarios(read("components/editorial/editorial-group-area-store.ts"));
  assert.match(tela, /body: JSON\.stringify\(\{ marcaId: brandId, color \}\)/, "a tela pede só a cor");
});
