import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

/*
 * `next/server` não resolve no ESM do Node sem extensão; o corpo do GET só usa
 * `NextResponse.json` nas rotas. Mesmo dublê dos outros testes de servidor.
 */
register(`data:text/javascript,${encodeURIComponent(
  "export async function resolve(especificador, contexto, proximo) {"
  + " if (especificador === 'next/server') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent("
  + "\"export const NextResponse = { json: (corpo, opcoes) => new Response(JSON.stringify(corpo), { status: (opcoes && opcoes.status) || 200, headers: { 'Content-Type': 'application/json' } }) };\") };"
  + " return proximo(especificador, contexto); }",
)}`);

/**
 * F2 · LISTAS LEVES, NO SERVIDOR DO ARQUITETO (SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 4).
 *
 * Banco em memória com a forma do `postgrest-js` (`tests/listas-leves-fake-db.mts`:
 * apelidos, caminhos JSON, ordem e faixa de verdade, e a conta dos bytes que
 * cada consulta devolve). Nenhuma rede, nenhum banco remoto, nenhum provider.
 *
 * Prova:
 * 1. a tela lê do banco só as versões VIGENTES e recebe exatamente o que a
 *    leitura de todas as versões entregava (inclusive a elegibilidade que olha
 *    keyword de versão antiga), com menos bytes;
 * 2. o corpo do GET leva as marcas e o parecer em projeção; com `serpDetail=full`
 *    ou `keywordDetail=full`, a leitura inteira de sempre, sem marcas;
 * 3. a releitura do que mudou: para cada tipo de ação (item, versão nova,
 *    rejeição, Assunto, keyword nova recebida, execução que escreve no
 *    Minerador, parecer de SERP), a mesa fundida é IGUAL à leitura inteira
 *    depois da ação, com uma fração dos bytes; o limite (DNA mudado fora das
 *    marcas, em outra aba) é declarado aqui também.
 */

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { loadCanonicalArquitetoWorkspace } = await import("../lib/server/arquiteto-workspace.ts");
const { readArchitectWorkspaceBody } = await import("../lib/server/arquiteto-workspace-http.ts");
const { loadArchitectWorkspaceDelta, readArchitectSyncState } = await import("../lib/server/arquiteto-workspace-sync.ts");
const { applySyncPatch, mergeArchitectWorkspaceDelta } = await import("../lib/arquiteto/workspace-delta.ts");
const { ListasLevesFakeDb } = await import("./listas-leves-fake-db.mts");
const { artigo, linhaDeVersao, linhaDoParecer, parecerDaFormacao, versao } = await import("./listas-leves-fixtures.mts");
import type { PipelineContext } from "../lib/server/pipeline-runtime.ts";
import type { ArchitectWorkspaceData } from "../lib/arquiteto/workspace-delta.ts";

const MARCA = "61d2e019-0000-4000-8000-000000000001";
const OUTRA = "d4fa133a-0000-4000-8000-000000000002";
const ATOR = "11111111-1111-4111-8111-111111111111";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [K1, K2, K3, K4, K5, K6, K7] = [1, 2, 3, 4, 5, 6, 7].map(uuid);

type Row = Record<string, unknown>;

const keyword = (id: string, texto: string, extra: Row = {}, brand = MARCA): Row => ({
  id, keyword: texto, location: "Brasil", results_allintitle: 10, volume_search: 100, kgr_score: 0.1, intent: "Informativo", status: "aprovado",
  created_at: "2026-09-20T10:00:00+00:00", lista_id: null, volume_source: "google_ads", brand_id: brand, deleted_at: null, purge_after: null, deleted_by: null,
  group_id: null,
  analise_semantica: { entidade_central: "internet", logical_output_contract: { bloco: "L".repeat(4000) }, discovery_import: { bloco: "D".repeat(3000) }, aprovacao: { assinatura: `ap-${id}` } },
  ...extra,
});

let relogio = 0;
const agora = () => `2026-10-14T10:${String(Math.floor(relogio / 60)).padStart(2, "0")}:${String(relogio++ % 60).padStart(2, "0")}.000000+00:00`;

const item = (n: number, subject: string, state = "received", brand = MARCA): Row => ({
  id: uuid(500 + n), marca_id: brand, subject_type: "keyword", subject_id: subject, article_id: null, stage: "architect", state,
  source_entity_id: subject, source_version_id: null, source_content_hash: null, payload: { approvedDna: { pesado: "P".repeat(2500) } }, lock_version: 1,
  created_at: "2026-10-01T10:00:00.000000+00:00", updated_at: agora(),
});

async function banco() {
  relogio = 0;
  const a1 = artigo(MARCA, K1, "internet fibra residencial");
  const a2 = artigo(MARCA, K3, "plano de internet barato");
  const a3v1 = artigo(MARCA, K6, "roteador wifi potente");
  const a3v2 = artigo(MARCA, K4, "melhor roteador wifi", a3v1.articleId);
  const outra = artigo(OUTRA, K7, "internet de outra marca");
  const [a1v1, a1v2, a2v1, va3v1, va3v2, voutra] = await Promise.all([
    versao(a1, a1.articleId, 1, ATOR), versao({ ...a1, promise: "Promessa nova." }, a1.articleId, 2, ATOR),
    versao(a2, a2.articleId, 1, ATOR), versao(a3v1, a3v1.articleId, 1, ATOR), versao(a3v2, a3v1.articleId, 2, ATOR), versao(outra, outra.articleId, 1, ATOR),
  ]);
  const db = new ListasLevesFakeDb({
    minerador_keywords: [keyword(K1, "internet fibra residencial"), keyword(K2, "wifi lento"), keyword(K3, "plano de internet barato"), keyword(K4, "melhor roteador wifi"),
      keyword(K5, "internet rural"), keyword(K6, "roteador wifi potente", { status: "bruto" }), keyword(K7, "internet de outra marca", {}, OUTRA)],
    editorial_workflow_items: [item(1, K1), item(2, K2), item(3, K3), item(4, K4), item(5, K5, "returned"), item(7, K7, "received", OUTRA),
      linhaDoParecer(MARCA, uuid(901), parecerDaFormacao(K1, [K1])), linhaDoParecer(MARCA, uuid(902), parecerDaFormacao(K3, [K3]), 1, "2026-10-11T10:00:00.000000+00:00")],
    editorial_artifact_versions: [
      linhaDeVersao(MARCA, "article_dna", a1v1, "approved"), linhaDeVersao(MARCA, "article_dna", a1v2, "proposed"),
      linhaDeVersao(MARCA, "article_dna", a2v1, "approved"), linhaDeVersao(MARCA, "article_dna", va3v1, "approved"),
      linhaDeVersao(MARCA, "article_dna", va3v2, "proposed"), linhaDeVersao(OUTRA, "article_dna", voutra, "approved"),
    ],
    editorial_version_status_events: [],
    marcas: [{ id: MARCA, silos_existentes: [] }, { id: OUTRA, silos_existentes: [] }],
  });
  return { db, artigos: { a1, a2, a3v1, a1v2, a2v1 } };
}

const contexto = (db: InstanceType<typeof ListasLevesFakeDb>): PipelineContext => ({
  actorUserId: ATOR, brandId: MARCA, module: "arquiteto", action: "view", permissions: ["arquiteto:view"],
  authorizationSource: "canonical_actor_rpc", supabase: db as unknown as PipelineContext["supabase"],
});

const porId = (lista: ReadonlyArray<Record<string, unknown>>, chave = "id") => [...lista].sort((a, b) => String(a[chave]).localeCompare(String(b[chave])));
function normaliza(dados: Record<string, unknown>) {
  const { sync: _sync, rejectedArticles: _rejeitados, ...resto } = dados as Record<string, unknown> & { sync?: unknown; rejectedArticles?: unknown };
  void _sync; void _rejeitados;
  const copia = JSON.parse(JSON.stringify(resto)) as Record<string, Array<Record<string, unknown>>>;
  copia.keywords = porId(copia.keywords);
  copia.availableKeywords = porId(copia.availableKeywords);
  copia.importEligibility = porId(copia.importEligibility, "keywordId");
  return copia;
}
const bytesDe = (valor: unknown) => JSON.stringify(valor).length;
const corpo = (db: InstanceType<typeof ListasLevesFakeDb>) => readArchitectWorkspaceBody(contexto(db), { groupFilter: { kind: "all" } }) as Promise<Record<string, unknown> & { sync: Parameters<typeof applySyncPatch>[0] }>;

/** A releitura do que mudou, conferida contra a leitura inteira depois da ação. */
async function confere(db: InstanceType<typeof ListasLevesFakeDb>, acao: () => void | Promise<void>) {
  const antes = await corpo(db);
  await acao();
  const depois = await corpo(db);
  db.reset();
  const delta = await loadArchitectWorkspaceDelta(contexto(db), antes.sync);
  const bytesDoBanco = db.bytes();
  const { sync: marcasAntes, ...dadosAntes } = antes;
  const fundida = mergeArchitectWorkspaceDelta(dadosAntes as unknown as ArchitectWorkspaceData, delta.changes);
  assert.ok(fundida.ok, `a fusão fecha (${fundida.ok ? "" : fundida.reason})`);
  assert.deepEqual(normaliza(fundida.data as Record<string, unknown>), normaliza(depois), "a mesa fundida é a leitura inteira depois da ação");
  assert.deepEqual(applySyncPatch(marcasAntes, delta.sync), depois.sync, "as marcas fundidas são as do servidor");
  return { delta, resposta: bytesDe({ changes: delta.changes, sync: delta.sync }), inteira: bytesDe(depois), bytesDoBanco };
}

/* ============================ 1. só as vigentes ============================ */

test("vigentes · a tela lê do banco só a versão vigente e recebe o MESMO que a leitura de todas as versões", async () => {
  const { db: todas } = await banco();
  const { db: vigentes } = await banco();
  const inteira = await loadCanonicalArquitetoWorkspace(contexto(todas));
  const leve = await loadCanonicalArquitetoWorkspace(contexto(vigentes), { artifactRead: "vigente" });
  const comparavel = (lido: Record<string, unknown>) => ({ ...normaliza(lido), statuses: porId(lido.statuses as Array<Record<string, unknown>>, "versionId") });
  assert.deepEqual(comparavel(leve as never), comparavel(inteira as never));
  // A keyword que só esteve numa versão ANTIGA de um artigo continua "incorporada" (a pergunta da elegibilidade).
  assert.equal(leve.importEligibility.find(entrada => entrada.keywordId === K6)?.importability, "ARTICLE_DNA_INCORPORATED");
  assert.equal(leve.importEligibility.find(entrada => entrada.keywordId === K5)?.importability, "REMOTE_WORKFLOW_BLOCKED");
  assert.ok(!leve.articleDnas.some(versaoLida => versaoLida.payload.brandId !== MARCA), "isolamento por marca");
  const bytesArtefatos = (db: InstanceType<typeof ListasLevesFakeDb>) => db.log.filter(entrada => entrada.table === "editorial_artifact_versions").reduce((total, entrada) => total + entrada.bytes, 0);
  assert.ok(bytesArtefatos(vigentes) < bytesArtefatos(todas), `menos bytes de artefato (${bytesArtefatos(todas)} → ${bytesArtefatos(vigentes)})`);
  assert.ok(!vigentes.log.some(entrada => entrada.table === "editorial_artifact_versions" && entrada.select === "*" && entrada.filters.every(filtro => !filtro.startsWith("version_id in"))), "nenhum select(*) de todas as versões");
});

/* ============================ 2. o corpo do GET ============================ */

test("GET · a leitura-base leva as marcas e o parecer em projeção; serpDetail/keywordDetail=full são a leitura inteira, sem marcas", async () => {
  const { db } = await banco();
  const base = await corpo(db);
  assert.ok(base.sync && base.sync.v === 1, "as marcas vêm junto");
  const pareceres = base.articleFormationSerp as Array<{ detail?: string; payload: { assessment: { keywordDnaReferences: Array<Record<string, unknown>> } } }>;
  assert.ok(pareceres.length === 2 && pareceres.every(parecer => parecer.detail === "list"));
  assert.ok(pareceres.every(parecer => parecer.payload.assessment.keywordDnaReferences.every(referencia => !("sourceKeywordSnapshot" in referencia))));
  const cheio = await readArchitectWorkspaceBody(contexto(db), { groupFilter: { kind: "all" }, serpDetail: "full" }) as Record<string, unknown>;
  assert.equal("sync" in cheio, false);
  const pareceresCheios = cheio.articleFormationSerp as Array<{ detail?: string; payload: { assessment: { keywordDnaReferences: Array<Record<string, unknown>> } } }>;
  assert.ok(pareceresCheios.every(parecer => !parecer.detail && parecer.payload.assessment.keywordDnaReferences.every(referencia => "sourceKeywordSnapshot" in referencia)), "a exportação recebe o parecer inteiro");
  assert.ok(bytesDe(base.articleFormationSerp) < bytesDe(cheio.articleFormationSerp) / 3, "a projeção corta o grosso");
  const recuperacao = await readArchitectWorkspaceBody(contexto(db), { groupFilter: { kind: "all" }, keywordDetail: "full" }) as Record<string, unknown>;
  assert.equal("sync" in recuperacao, false, "o ponto de recuperação nunca vira base da releitura");
});

/* ============================ 3. a releitura do que mudou ============================ */

test("releitura · sem mudança: nenhuma seção, só as marcas", async () => {
  const { db } = await banco();
  const medida = await confere(db, () => {});
  assert.deepEqual(Object.keys(medida.delta.changes), []);
  assert.ok(medida.resposta < 2000, `resposta mínima (${medida.resposta} bytes)`);
});

test("releitura · item da keyword gravado (lock novo): só o item, a linha da keyword e a ordem", async () => {
  const { db } = await banco();
  const medida = await confere(db, () => {
    const linha = db.tables.editorial_workflow_items.find(row => row.id === uuid(502))!;
    Object.assign(linha, { payload: { ...(linha.payload as Row), clusterId: "grupo-x" }, lock_version: 2, updated_at: agora() });
  });
  assert.deepEqual(medida.delta.changes.workflowItems?.upsert.map(entrada => entrada.subjectId), [K2]);
  assert.deepEqual(medida.delta.changes.keywords?.upsert.map(entrada => entrada.id), [K2]);
  assert.equal(medida.delta.changes.articleDnas, undefined);
  assert.ok(medida.resposta * 5 < medida.inteira, `fração da leitura inteira (${medida.resposta} de ${medida.inteira} bytes)`);
});

test("releitura · versão nova do ArticleDNA: só aquele artigo (e os status)", async () => {
  const { db, artigos } = await banco();
  const medida = await confere(db, async () => {
    const v3 = await versao({ ...artigos.a1, promise: "Terceira promessa." }, artigos.a1.articleId, 3, ATOR);
    db.tables.editorial_artifact_versions.push(linhaDeVersao(MARCA, "article_dna", v3, "proposed"));
  });
  assert.deepEqual(medida.delta.changes.articleDnas?.upsert.map(entrada => (entrada as { versionNumber: number }).versionNumber), [3]);
  assert.ok(medida.delta.changes.statuses, "os status relidos (a versão nova tem o dela)");
  assert.equal(medida.delta.changes.workflowItems, undefined);
});

test("releitura · rejeição (Retirar artigo do Silo): o artigo sai e a keyword liberada volta pela mesma regra", async () => {
  const { db, artigos } = await banco();
  const medida = await confere(db, async () => {
    const vigente = db.tables.editorial_artifact_versions.find(row => row.entity_id === artigos.a2.articleId)!;
    db.tables.editorial_version_status_events.push({ id: uuid(800), version_id: vigente.version_id, status: "rejected", reason: "retirado do Silo", actor_id: ATOR, occurred_at: "2026-10-14T11:00:00.000000+00:00" });
  });
  assert.deepEqual(medida.delta.changes.articleDnas?.remove, [artigos.a2.articleId]);
  const liberado = medida.delta.changes.workflowItems?.upsert.find(entrada => entrada.subjectId === K3) as { payload: Record<string, unknown> } | undefined;
  assert.ok(liberado && "rejectedArticleRelease" in liberado.payload, "a marca de liberação vem no item");
});

test("releitura · Assunto/plano gravado só no DNA da keyword (keyword_subject): a linha dela é relida", async () => {
  const { db } = await banco();
  const medida = await confere(db, () => {
    const linha = db.tables.minerador_keywords.find(row => row.id === K2)!;
    linha.analise_semantica = { ...(linha.analise_semantica as Row), keyword_subject: { declared: { phrase: "Wi-Fi lento em casa" } } };
  });
  assert.deepEqual(medida.delta.changes.keywords?.upsert.map(entrada => entrada.id), [K2]);
  assert.deepEqual(medida.delta.changes.availableKeywords?.upsert.map(entrada => entrada.id), [K2]);
});

test("releitura · keyword nova recebida (envio do Minerador): item, linha, ordem e elegibilidade", async () => {
  const { db } = await banco();
  const medida = await confere(db, () => {
    db.tables.editorial_workflow_items.push(item(6, K6));
  });
  assert.deepEqual(medida.delta.changes.workflowItems?.upsert.map(entrada => entrada.subjectId), [K6]);
  assert.ok(medida.delta.changes.workflowItems?.order?.includes(uuid(506)));
  assert.deepEqual(medida.delta.changes.keywords?.upsert.map(entrada => entrada.id), [K6]);
  assert.ok(medida.delta.changes.importEligibility, "a elegibilidade mudou");
});

test("releitura · parecer de SERP gravado e um novo: só eles, em projeção, com a ordem", async () => {
  const { db } = await banco();
  const medida = await confere(db, () => {
    const linha = db.tables.editorial_workflow_items.find(row => row.id === uuid(901))!;
    const novo = parecerDaFormacao(K1, [K1], { verdict: "DIVERGENCE" });
    Object.assign(linha, { payload: novo, state: "divergent", lock_version: 2, updated_at: agora() });
    db.tables.editorial_workflow_items.push(linhaDoParecer(MARCA, uuid(903), parecerDaFormacao(K4, [K4]), 1, agora()));
  });
  const pareceres = medida.delta.changes.articleFormationSerp!;
  assert.deepEqual(pareceres.upsert.map(entrada => entrada.candidateRef).sort(), [K1, K4].sort());
  assert.ok(pareceres.upsert.every(entrada => entrada.detail === "list"));
  assert.ok(pareceres.order);
});

test("releitura · execução que escreve no Minerador (melhoria) mudou: TODAS as recebidas são relidas", async () => {
  const { db } = await banco();
  const medida = await confere(db, () => {
    const linha = db.tables.minerador_keywords.find(row => row.id === K1)!;
    linha.analise_semantica = { ...(linha.analise_semantica as Row), logical_output_contract: { bloco: "mudou pela melhoria" } };
    db.tables.editorial_workflow_items.push({ id: uuid(950), marca_id: MARCA, subject_type: "article_improvement_run", subject_id: "run-1", article_id: null, stage: "architect", state: "applied", source_entity_id: "run-1", source_version_id: null, source_content_hash: null, payload: {}, lock_version: 1, created_at: agora(), updated_at: agora() });
  });
  assert.deepEqual(medida.delta.changes.keywords?.upsert.map(entrada => entrada.id).sort(), [K1, K2, K3, K4].sort());
});

test("releitura · LIMITE declarado: DNA mudado fora das marcas, por outra aba, sem execução do Arquiteto, não é visto até reabrir", async () => {
  const { db } = await banco();
  const antes = await corpo(db);
  const linha = db.tables.minerador_keywords.find(row => row.id === K1)!;
  linha.analise_semantica = { ...(linha.analise_semantica as Row), logical_output_contract: { bloco: "mudou em outra aba" } };
  const delta = await loadArchitectWorkspaceDelta(contexto(db), antes.sync);
  assert.equal(delta.changes.keywords, undefined, "a releitura não vê — a 1ª leitura de cada abertura (fresh) vê");
  const depois = await corpo(db);
  assert.deepEqual((depois.keywords as Array<{ id: string; analise_semantica: Row }>).find(entrada => entrada.id === K1)?.analise_semantica.logical_output_contract, { bloco: "mudou em outra aba" });
});

test("releitura · keyword recebida apagada: a mesma recusa 409 da leitura inteira", async () => {
  const { db } = await banco();
  const antes = await corpo(db);
  db.tables.minerador_keywords.find(row => row.id === K4)!.deleted_at = "2026-10-14T12:00:00+00:00";
  await assert.rejects(corpo(db), (erro: { status?: number }) => erro.status === 409);
  await assert.rejects(loadArchitectWorkspaceDelta(contexto(db), antes.sync), (erro: { status?: number }) => erro.status === 409);
});

test("releitura · as marcas só leem metadados: nenhum payload de item, de artefato nem o DNA inteiro", async () => {
  const { db } = await banco();
  db.reset();
  await readArchitectSyncState(contexto(db));
  for (const entrada of db.log) {
    assert.doesNotMatch(entrada.select, /(^|,)payload(,|$)|\*|(^|,)analise_semantica(,|$)/, `${entrada.table}: ${entrada.select}`);
  }
});

test("cliente · a 1ª leitura é a inteira (base); depois de uma ação a tela relê pelo delta e monta o MESMO snapshot", async () => {
  const cliente = await import("../lib/arquiteto/canonical-workspace.ts");
  const { db, artigos } = await banco();
  const chamadas: Array<{ metodo: string; url: string; bytes: number }> = [];
  let deltaFalha = false;
  let deltasRecusados = 0;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada), "http://tela.local");
    const metodo = String(init?.method || "GET").toUpperCase();
    let corpoResposta: unknown;
    if (metodo === "GET" && url.pathname === "/api/arquiteto/workspace") {
      corpoResposta = { success: true, data: await readArchitectWorkspaceBody(contexto(db), { groupFilter: { kind: "all" }, keywordDetail: url.searchParams.get("keywordDetail") === "full" ? "full" : undefined, serpDetail: url.searchParams.get("serpDetail") === "full" ? "full" : undefined }) };
    } else if (metodo === "POST" && url.pathname === "/api/arquiteto/workspace/delta") {
      if (deltaFalha) { deltasRecusados += 1; return new Response(JSON.stringify({ success: false, error: "falhou", code: "QUERY_FAILURE" }), { status: 503 }); }
      const pedido = JSON.parse(String(init?.body)) as { sync: Parameters<typeof loadArchitectWorkspaceDelta>[1] };
      const delta = await loadArchitectWorkspaceDelta(contexto(db), pedido.sync);
      corpoResposta = { success: true, data: { source: "CANONICAL_REMOTE", mode: "delta", changes: delta.changes, sync: delta.sync, stats: delta.stats } };
    } else {
      throw new Error(`chamada inesperada ${metodo} ${url.pathname}`);
    }
    const texto = JSON.stringify(corpoResposta);
    chamadas.push({ metodo, url: url.pathname + url.search, bytes: texto.length });
    return new Response(texto, { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const primeira = await cliente.loadCanonicalArquitetoWorkspace(MARCA, { fresh: true });
    assert.equal(chamadas.at(-1)?.metodo, "GET");
    // Uma ação: versão nova do artigo e um item gravado.
    const v3 = await versao({ ...artigos.a1, promise: "Pela tela." }, artigos.a1.articleId, 3, ATOR);
    db.tables.editorial_artifact_versions.push(linhaDeVersao(MARCA, "article_dna", v3, "proposed"));
    const linha = db.tables.editorial_workflow_items.find(row => row.id === uuid(501))!;
    Object.assign(linha, { payload: { ...(linha.payload as Row), clusterId: "z" }, lock_version: 2, updated_at: agora() });
    const relida = await cliente.loadCanonicalArquitetoWorkspace(MARCA);
    assert.equal(chamadas.at(-1)?.metodo, "POST", "a releitura é pelo delta");
    const inteira = await cliente.loadCanonicalArquitetoWorkspace(MARCA, { fresh: true });
    assert.equal(chamadas.at(-1)?.metodo, "GET");
    const comparavel = (snapshot: Awaited<ReturnType<typeof cliente.loadCanonicalArquitetoWorkspace>>) => ({ ...snapshot, keywords: porId(snapshot.keywords), availableKeywords: porId(snapshot.availableKeywords), importEligibility: porId(snapshot.importEligibility as never, "keywordId") });
    assert.deepEqual(comparavel(relida), comparavel(inteira), "o snapshot montado pelo delta é o da leitura inteira");
    assert.notDeepEqual(relida.articleDnas.map(item => item.versionNumber), primeira.articleDnas.map(item => item.versionNumber));
    const [respostaInteira, respostaDelta] = [chamadas.find(chamada => chamada.metodo === "GET")!.bytes, chamadas.find(chamada => chamada.metodo === "POST")!.bytes];
    assert.ok(respostaDelta * 3 < respostaInteira, `a releitura baixa uma fração (${respostaDelta} de ${respostaInteira} bytes)`);

    // Detalhe completo é sempre a leitura inteira e não mexe na base.
    await cliente.loadCanonicalArquitetoWorkspace(MARCA, { serpDetail: "full" });
    assert.match(chamadas.at(-1)!.url, /serpDetail=full/);
    await cliente.loadCanonicalArquitetoWorkspace(MARCA);
    assert.equal(chamadas.at(-1)?.metodo, "POST", "a base continua a da leitura-base");

    // Delta que falha: a tela relê tudo (nunca uma mesa pela metade).
    deltaFalha = true;
    const depoisDaFalha = await cliente.loadCanonicalArquitetoWorkspace(MARCA);
    assert.equal(deltasRecusados, 1, "tentou o delta");
    assert.equal(chamadas.at(-1)?.metodo, "GET", "e caiu para a leitura inteira");
    assert.deepEqual(comparavel(depoisDaFalha), comparavel(inteira));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("medida · fixture: leitura inteira x releitura por ação (bytes da resposta e do banco)", async (t) => {
  const { db } = await banco();
  db.reset();
  const inteira = await corpo(db);
  const bancoInteira = db.bytes();
  const medida = await confere(db, () => {
    const linha = db.tables.editorial_workflow_items.find(row => row.id === uuid(501))!;
    Object.assign(linha, { payload: { ...(linha.payload as Row), clusterId: "y" }, lock_version: 2, updated_at: agora() });
  });
  t.diagnostic(`fixture · leitura inteira: ${bytesDe(inteira)} B de resposta, ${bancoInteira} B do banco · releitura de 1 item: ${medida.resposta} B de resposta, ${medida.bytesDoBanco} B do banco`);
  assert.ok(medida.resposta < bytesDe(inteira) / 5);
});
