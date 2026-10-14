import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

register(`data:text/javascript,${encodeURIComponent(
  "export async function resolve(especificador, contexto, proximo) {"
  + " if (especificador === 'next/server') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent("
  + "\"export const NextResponse = { json: (corpo, opcoes) => new Response(JSON.stringify(corpo), { status: (opcoes && opcoes.status) || 200, headers: { 'Content-Type': 'application/json' } }) };\") };"
  + " return proximo(especificador, contexto); }",
)}`);

/**
 * F6 · LISTAS LEVES NO SERVIDOR DO ARQUITETO (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 4; migration M-L `20261016120000_listas_leves.sql`).
 *
 * Os pareceres de SERP da formação passam a vir PROJETADOS DO BANCO (view
 * `arquiteto_formation_serp_lista_leve`). Prova, com o banco de mentira:
 * 1. com a view, o corpo do GET e a releitura do que mudou são IGUAIS aos de
 *    sem ela (a projeção do Node), com menos bytes tirados do banco;
 * 2. sem a view (PGRST205) — e só então —, a leitura de antes; outro erro LANÇA
 *    (nunca vira lista vazia);
 * 3. as operações que precisam do parecer inteiro ou da marca inteira continuam
 *    lendo inteiro (exportação `serpDetail=full`, melhoria por `candidateRef`,
 *    Reforçar publicados, ponto de recuperação), e o que a canibalização e o
 *    portão leem do parecer sobrevive à projeção.
 */

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { readArchitectWorkspaceBody } = await import("../lib/server/arquiteto-workspace-http.ts");
const { loadArchitectWorkspaceDelta } = await import("../lib/server/arquiteto-workspace-sync.ts");
const { listArticleFormationSerpForList } = await import("../lib/server/arquiteto-article-serp-store.ts");
const { projectArticleFormationSerpPayload } = await import("../lib/arquiteto/article-serp-projection.ts");
const { ListasLevesFakeDb } = await import("./listas-leves-fake-db.mts");
const { artigo, linhaDeVersao, linhaDoParecer, parecerDaFormacao, versao } = await import("./listas-leves-fixtures.mts");
import type { PipelineContext } from "../lib/server/pipeline-runtime.ts";

const MARCA = "61d2e019-0000-4000-8000-000000000001";
const ATOR = "11111111-1111-4111-8111-111111111111";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [K1, K2, K3] = [1, 2, 3].map(uuid);
type Row = Record<string, unknown>;

const keyword = (id: string, texto: string): Row => ({
  id, keyword: texto, location: "Brasil", results_allintitle: 10, volume_search: 100, kgr_score: 0.1, intent: "Informativo", status: "aprovado",
  created_at: "2026-09-20T10:00:00+00:00", lista_id: null, volume_source: "google_ads", brand_id: MARCA, deleted_at: null, purge_after: null, deleted_by: null,
  group_id: null, analise_semantica: { entidade_central: "internet" },
});
const item = (n: number, subject: string): Row => ({
  id: uuid(500 + n), marca_id: MARCA, subject_type: "keyword", subject_id: subject, article_id: null, stage: "architect", state: "received",
  source_entity_id: subject, source_version_id: null, source_content_hash: null, payload: { approvedDna: {} }, lock_version: 1,
  created_at: "2026-10-01T10:00:00.000000+00:00", updated_at: `2026-10-14T10:00:0${n}.000000+00:00`,
});

/** A view da M-L no banco de mentira: as mesmas linhas, com o payload pela projeção (igual à SQL: 61/61 nas linhas reais). */
function comView(linhas: Row[]): Row[] {
  return linhas.filter(row => row.subject_type === "article_formation_serp_assessment" && row.stage === "architect").map(row => {
    const { payload, projected } = projectArticleFormationSerpPayload(row.payload);
    return { ...row, payload, projetado: projected };
  });
}

async function banco(view: boolean) {
  const a1 = artigo(MARCA, K1, "internet fibra residencial");
  const v1 = await versao(a1, a1.articleId, 1, ATOR);
  const itens = [
    item(1, K1), item(2, K2), item(3, K3),
    linhaDoParecer(MARCA, uuid(901), parecerDaFormacao(K1, [K1, K2])),
    linhaDoParecer(MARCA, uuid(902), parecerDaFormacao(K3, [K3]), 1, "2026-10-11T10:00:00.000000+00:00"),
    // Legado: sem `interpretation` vai INTEIRO (a tela o reconstrói dos orgânicos completos).
    linhaDoParecer(MARCA, uuid(903), parecerDaFormacao(K2, [K2], { interpretation: false }), 1, "2026-10-09T10:00:00.000000+00:00"),
  ];
  const tabelas: Record<string, Row[]> = {
    minerador_keywords: [keyword(K1, "internet fibra residencial"), keyword(K2, "wifi lento"), keyword(K3, "plano de internet barato")],
    editorial_workflow_items: itens,
    editorial_artifact_versions: [linhaDeVersao(MARCA, "article_dna", v1, "approved")],
    editorial_version_status_events: [],
    marcas: [{ id: MARCA, silos_existentes: [] }],
  };
  if (view) tabelas.arquiteto_formation_serp_lista_leve = comView(itens);
  return new ListasLevesFakeDb(tabelas);
}

const contexto = (db: unknown): PipelineContext => ({
  actorUserId: ATOR, brandId: MARCA, module: "arquiteto", action: "view", permissions: ["arquiteto:view"],
  authorizationSource: "canonical_actor_rpc", supabase: db as PipelineContext["supabase"],
});
const semMarcas = (corpo: Record<string, unknown>) => { const { sync: _s, ...resto } = corpo; void _s; return JSON.parse(JSON.stringify(resto)); };

test("view · o GET devolve os MESMOS pareceres (projetados no banco) que a projeção do Node, com menos bytes do banco", async () => {
  const semView = await banco(false);
  const comAView = await banco(true);
  const a = await readArchitectWorkspaceBody(contexto(semView), { groupFilter: { kind: "all" } }) as Record<string, unknown>;
  const b = await readArchitectWorkspaceBody(contexto(comAView), { groupFilter: { kind: "all" } }) as Record<string, unknown>;
  assert.deepEqual(semMarcas(b), semMarcas(a), "o corpo inteiro é igual com e sem a view");
  const pareceres = b.articleFormationSerp as Array<Record<string, unknown>>;
  assert.equal(pareceres.length, 3, "nenhum parecer some");
  assert.deepEqual(pareceres.map(p => p.detail ?? null), ["list", "list", null], "o legado vai inteiro");
  const bytes = (db: InstanceType<typeof ListasLevesFakeDb>, tabela: string) => db.log.filter(l => l.table === tabela && /payload/.test(l.select)).reduce((n, l) => n + l.bytes, 0);
  const serpSem = semView.log.filter(l => l.table === "editorial_workflow_items" && l.filters.includes("subject_type=article_formation_serp_assessment")).reduce((n, l) => n + l.bytes, 0);
  const serpCom = bytes(comAView, "arquiteto_formation_serp_lista_leve");
  assert.ok(serpCom > 0 && serpCom < serpSem * 0.6, `banco: ${serpCom} B pela view < 60% de ${serpSem} B`);
  assert.ok(semView.log.some(l => l.table === "arquiteto_formation_serp_lista_leve" && l.rows === 0), "sem a view, a tentativa foi feita e caiu para a leitura de antes");
  assert.ok(!comAView.log.some(l => l.table === "editorial_workflow_items" && l.filters.includes("subject_type=article_formation_serp_assessment")), "com a view, o parecer inteiro não sai do banco");
});

test("view · o que o portão, o veredito e a canibalização leem do parecer sobrevive à projeção", async () => {
  const db = await banco(true);
  const { records, source } = await listArticleFormationSerpForList(contexto(db));
  assert.equal(source, "view");
  const p = records.find(r => r.candidateRef === K1)!.payload as unknown as Record<string, any>;
  assert.equal(p.formationBaseHash, `base-${K1}`);
  assert.ok(p.interpretation, "interpretação inteira (lentes do portão)");
  assert.equal(p.assessment.intentCompatibility, "coerente");
  assert.equal(p.assessment.evaluationStatus, "active");
  const organico = p.assessment.snapshots[0].organicResults[0];
  assert.deepEqual(Object.keys(organico).sort(), ["domain", "position", "url"], "canibalização: URL, domínio e posição");
  assert.equal(p.assessment.snapshots[0].organicResults.length, 10, "a contagem de orgânicos (prioridade da evidência) não muda");
  assert.equal(p.assessment.snapshots[0].snippet, undefined);
  assert.equal(p.assessment.keywordDnaReferences[0].sourceKeywordSnapshot, undefined, "sem a cópia do KeywordDNA");
});

test("recuo · só a view AUSENTE cai para a leitura de antes; outro erro lança (nunca lista vazia)", async () => {
  const db = await banco(false);
  const { records, source } = await listArticleFormationSerpForList(contexto(db));
  assert.equal(source, "node");
  assert.equal(records.length, 3);
  const quebrado = await banco(true);
  const original = quebrado.from.bind(quebrado);
  (quebrado as unknown as { from: (t: string) => unknown }).from = (tabela: string) => tabela === "arquiteto_formation_serp_lista_leve"
    ? { select: () => ({ eq() { return this; }, in() { return this; }, order() { return this; }, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }).then(ok) }) }
    : original(tabela);
  await assert.rejects(listArticleFormationSerpForList(contexto(quebrado)), "timeout não vira 'sem pareceres'");
});

test("releitura do que mudou · com a view, o parecer novo chega projetado pelo banco e a fusão fecha igual à leitura inteira", async () => {
  const db = await banco(true);
  const antes = await readArchitectWorkspaceBody(contexto(db), { groupFilter: { kind: "all" } }) as Record<string, unknown> & { sync: Record<string, unknown> };
  const novo = linhaDoParecer(MARCA, uuid(904), parecerDaFormacao(uuid(9), [K3]), 1, "2026-10-14T12:00:00.000000+00:00");
  db.tables.editorial_workflow_items.push(novo);
  db.tables.arquiteto_formation_serp_lista_leve = comView(db.tables.editorial_workflow_items);
  db.reset();
  const delta = await loadArchitectWorkspaceDelta(contexto(db), antes.sync as never);
  const upsert = (delta.changes.articleFormationSerp as { upsert: Array<Record<string, unknown>> }).upsert;
  assert.equal(upsert.length, 1);
  assert.equal(upsert[0].detail, "list");
  assert.ok(db.log.some(l => l.table === "arquiteto_formation_serp_lista_leve" && l.filters.includes("subject_id in (1)")), "relê só o que mudou, pela view");
  const inteira = await readArchitectWorkspaceBody(contexto(db), { groupFilter: { kind: "all" } }) as Record<string, unknown>;
  const doGet = (inteira.articleFormationSerp as Array<Record<string, unknown>>).find(r => r.candidateRef === uuid(9));
  assert.deepEqual(JSON.parse(JSON.stringify(upsert[0])), JSON.parse(JSON.stringify(doGet)), "o mesmo registro do GET");
});

test("inteiro quando precisa · exportação (serpDetail=full) lê o parecer inteiro da tabela mesmo com a view", async () => {
  const db = await banco(true);
  const corpo = await readArchitectWorkspaceBody(contexto(db), { groupFilter: { kind: "all" }, serpDetail: "full" }) as Record<string, unknown>;
  const p = (corpo.articleFormationSerp as Array<Record<string, any>>).find(r => r.candidateRef === K1)!;
  assert.equal(p.detail, undefined);
  assert.ok(typeof p.payload.assessment.snapshots[0].organicResults[0].snippet === "string", "SERP bruta presente");
  assert.ok(!db.log.some(l => l.table === "arquiteto_formation_serp_lista_leve"), "a exportação não toca a view");
});

const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ler = (caminho: string) => semComentarios(readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8"));

test("operações de marca inteira · nenhuma lê a lista leve (nenhuma fica parcial em silêncio)", () => {
  const leve = /listArticleFormationSerpForList|_lista_leve|keyword-light-list|lightKeywordRowFromView/;
  // Reforçar publicados (servidor), melhoria (UM parecer inteiro), conversão, Silo do plano, backup/restauração.
  for (const arquivo of [
    "lib/server/arquiteto-published-reinforcement-deps.ts", "lib/server/arquiteto-published-reinforcement.ts", "lib/server/arquiteto-article-improvement.ts",
    "lib/server/arquiteto-subject-conversion.ts", "lib/server/arquiteto-backup-restore.ts", "lib/server/arquiteto-differentiation.ts",
    "lib/server/internal-link-graph-persistence.ts",
  ]) assert.doesNotMatch(ler(arquivo), leve, arquivo);
  assert.match(ler("lib/server/arquiteto-article-improvement.ts"), /findArticleFormationSerpAssessment\(/, "a melhoria lê o parecer inteiro pelo candidateRef");
  // Só o GET (lista) e a releitura (delta) leem a view; o detalhe completo e as escritas, a tabela.
  const http = ler("lib/server/arquiteto-workspace-http.ts");
  assert.match(http, /serpCheio \? listArticleFormationSerpAssessments\(context\) : listArticleFormationSerpForList\(context\)/);
  const sync = ler("lib/server/arquiteto-workspace-sync.ts");
  assert.match(sync, /listArticleFormationSerpForList\(context, serp\.changed\)/);
  assert.doesNotMatch(sync, /\.(insert|update|upsert|delete)\(/);
  // Processar arquitetura, canibalização da formação, "mesmo assunto", links entre Silos e ponto de recuperação
  // rodam na tela sobre a mesa do Arquiteto, cujas keywords e ArticleDNA a F6 NÃO projeta (continuam inteiros).
  const workspace = ler("lib/server/arquiteto-workspace.ts");
  assert.doesNotMatch(workspace, leve);
  assert.doesNotMatch(ler("lib/arquiteto/canonical-workspace.ts"), leve);
  assert.doesNotMatch(ler("modules/arquiteto/arquiteto-workspace.tsx"), leve);
});
