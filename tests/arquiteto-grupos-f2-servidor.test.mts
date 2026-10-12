import assert from "node:assert/strict";
import test from "node:test";

import { loadCanonicalArquitetoWorkspace } from "../lib/server/arquiteto-workspace.ts";
import type { PipelineContext } from "../lib/server/pipeline-runtime.ts";
import { GroupsFakeDb, type Row } from "./editorial-grupos-fake-db.mts";

/**
 * F2 DOS GRUPOS — A MESA DO ARQUITETO LÊ POR GRUPO (SDD 2026-10-12 §8).
 *
 * Roda com `--conditions=react-server` e o registro de TS, como os outros
 * testes de servidor do Arquiteto (`import "server-only"` e alias `@/`). O
 * banco é a tabela em memória dos testes da F2; nenhuma rede.
 *
 * A leitura do ArticleDNA inteiro (`select("*")`, que exigiria um ArticleDNA
 * completo e válido) devolve vazio de propósito; os caminhos JSON estreitos —
 * os que o recorte por grupo usa — enxergam o artigo. O que se prova aqui é o
 * RECORTE: keywords e itens só do grupo, fechados por artigo, e a leitura sem
 * grupo idêntica à de antes.
 */

const MARCA = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const OUTRA = "4a737e74-e35d-4a49-8284-87b3f964e495";
const ATOR = "11111111-1111-4111-8111-111111111111";
const G = "aaaaaaaa-0000-4000-8000-000000000001";
const H = "aaaaaaaa-0000-4000-8000-000000000002";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [K1, K2, K3, K4, K5, K6] = [1, 2, 3, 4, 5, 6].map(uuid);

const keyword = (id: string, group: string | null, brand = MARCA): Row => ({
  id, keyword: `keyword ${id.slice(-1)}`, location: "Brasil", results_allintitle: 10, volume_search: 100, kgr_score: 0.1,
  intent: "Informativo", status: "aprovado", created_at: "2026-09-20T10:00:00+00:00", lista_id: null,
  analise_semantica: { pesado: true }, volume_source: "google_ads", brand_id: brand, deleted_at: null, purge_after: null, deleted_by: null,
  group_id: group,
});

const item = (n: number, subject: string, brand = MARCA): Row => ({
  id: uuid(500 + n), marca_id: brand, subject_type: "keyword", subject_id: subject, article_id: null, stage: "architect", state: "received",
  source_entity_id: subject, source_version_id: null, source_content_hash: null, payload: {}, lock_version: 1,
  created_at: "2026-09-21T10:00:00+00:00", updated_at: `2026-09-21T10:0${n}:00+00:00`,
});

function banco() {
  const db = new GroupsFakeDb({
    minerador_keywords: [keyword(K1, G), keyword(K2, G), keyword(K3, null), keyword(K4, H), keyword(K5, null), keyword(K6, G, OUTRA)],
    editorial_workflow_items: [item(1, K1), item(2, K2), item(3, K3), item(4, K4), item(5, K5), item(6, K6, OUTRA)],
    // Artigo a1: principal K2 (grupo G) e secundária K5 (sem grupo) — herda G pela principal.
    editorial_artifact_versions: [{
      version_id: "a1:v1", entity_id: "a1", version_number: 1, marca_id: MARCA, artifact_type: "article_dna",
      payload: { articleId: "a1", principalKeywordId: K2, secondaryKeywordIds: [K5], narrativeReinforcementIds: [] },
    }],
    editorial_group_articles: [],
    editorial_groups: [],
    marcas: [{ id: MARCA, silos_existentes: [] }],
  });
  db.hiddenFromStar.add("editorial_artifact_versions");
  return db;
}

function contexto(db: GroupsFakeDb): PipelineContext {
  return {
    actorUserId: ATOR, brandId: MARCA, module: "arquiteto", action: "view", permissions: ["arquiteto:view"],
    authorizationSource: "canonical_actor_rpc", supabase: db as unknown as PipelineContext["supabase"],
  };
}

const ids = (linhas: ReadonlyArray<{ id?: unknown; subjectId?: unknown }>) => linhas.map(linha => String(linha.id ?? linha.subjectId)).sort();

test("sem grupo · a montagem é a mesma de antes e não consulta nenhuma tabela de grupo", async () => {
  const semOpcao = banco();
  const comTodos = banco();
  const antes = await loadCanonicalArquitetoWorkspace(contexto(semOpcao));
  const todos = await loadCanonicalArquitetoWorkspace(contexto(comTodos), { groupFilter: { kind: "all" } });
  assert.deepEqual(todos, antes);
  assert.equal("groupScope" in antes, false);
  assert.deepEqual(semOpcao.log, comTodos.log, "as mesmas consultas, na mesma ordem");
  assert.ok(!semOpcao.log.some(entrada => entrada.table.startsWith("editorial_group")));
  assert.deepEqual(ids(antes.availableKeywords), [K1, K2, K3, K4, K5].sort(), "a marca inteira, sem a outra marca");
});

test("com grupo · só as keywords e os itens do grupo, fechados por artigo (a secundária sem grupo vem junto)", async () => {
  const db = banco();
  const lido = await loadCanonicalArquitetoWorkspace(contexto(db), { groupFilter: { kind: "group", groupId: G } });
  assert.deepEqual(ids(lido.availableKeywords), [K1, K2, K5].sort());
  assert.deepEqual(lido.workflowItems.map(entrada => entrada.subjectId).sort(), [K1, K2, K5].sort());
  assert.deepEqual(ids(lido.keywords), [K1, K2, K5].sort());
  assert.ok(lido.groupScope);
  assert.equal(lido.groupScope!.groupId, G);
  assert.equal(lido.groupScope!.partial, true);
  assert.deepEqual(lido.groupScope!.articleIds, ["a1"]);
  assert.ok(!lido.availableKeywords.some(linha => linha.brand_id !== MARCA), "isolamento: a keyword do grupo G da outra marca não entra");
  const leiturasDeItens = db.log.filter(entrada => entrada.table === "editorial_workflow_items");
  assert.ok(leiturasDeItens.length >= 1);
});

test("Sem grupo · as keywords sem grupo e, junto, o artigo inteiro que tem alguma delas", async () => {
  const lido = await loadCanonicalArquitetoWorkspace(contexto(banco()), { groupFilter: { kind: "none" } });
  assert.deepEqual(ids(lido.availableKeywords), [K2, K3, K5].sort(), "K5 é sem grupo e mora no artigo a1: a principal K2 vem junto");
  assert.deepEqual(lido.groupScope!.articleIds, []);
});

test("grupo sem nada · resposta vazia, sem quebrar a conferência de keywords recebidas", async () => {
  const lido = await loadCanonicalArquitetoWorkspace(contexto(banco()), { groupFilter: { kind: "group", groupId: "aaaaaaaa-0000-4000-8000-00000000ffff" } });
  assert.deepEqual(lido.availableKeywords, []);
  assert.deepEqual(lido.workflowItems, []);
});

test("sem a M1 · a leitura por grupo responde 409 GROUPS_NOT_AVAILABLE; sem grupo continua igual", async () => {
  const db = banco();
  db.failures.editorial_group_articles = { code: "42P01", message: "relation \"public.editorial_group_articles\" does not exist" };
  await assert.rejects(loadCanonicalArquitetoWorkspace(contexto(db), { groupFilter: { kind: "group", groupId: G } }), (erro: { code?: string; status?: number; message?: string }) => erro.status === 409 && /GROUPS_NOT_AVAILABLE/.test(String(erro.message)));
  const semGrupo = await loadCanonicalArquitetoWorkspace(contexto(db));
  assert.equal(semGrupo.availableKeywords.length, 5);
});
