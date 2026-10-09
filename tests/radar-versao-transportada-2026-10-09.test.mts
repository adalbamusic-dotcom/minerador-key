import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { ARTIGO, HOST_DO_BANCO, MARCA, instalarPostgrestSimulado, semearBanco, type Banco, type Linha } from "./radar-export-leitura-fixtures.mts";
import { comArtigosModeloConcluidos } from "./radar-piloto-artigo-modelo-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-09 (correção) · NO RADAR, A VERSÃO DO ARTICLEDNA É A TRANSPORTADA PELO ITEM =====
 *
 * O defeito: nesta rodada, sete leitores do Radar passaram a escolher a versão
 * do ArticleDNA pela regra da mesa (a última APROVADA). "Gravar melhorias" grava
 * a sucessora já aprovada, mas nada atualiza o item que já está no Radar — ele
 * continua transportando a versão que o Arquiteto enviou, e a investigação, o
 * congelamento e a planta foram feitos sobre ela. Resultado: a coleta recusava
 * ("radar_article_dna_mismatch"), o export e a organização do artigo-modelo
 * davam ARTICLE_VERSION_MISMATCH, e o envio ao Redator não casava.
 *
 * A regra: com a versão transportada pelo item (RadarItem.articleDnaVersionId,
 * `source_version_id`, a versão que a análise carrega), ela vale — mesmo com uma
 * aprovada mais nova. Sem ela, a regra da mesa.
 *
 * A bancada é a do export (PostgREST simulado, cliente Supabase real, só o
 * `fetch` trocado), com uma v2 APROVADA do ArticleDNA de F gravada depois do
 * envio ao Radar. PROVIDER_CALLS = 0 e AI_CALLS = 0: o `fetch` recusa qualquer
 * host que não seja o do banco, e o banco simulado recusa escrita.
 */

/* ======================= ambiente sem rede ======================= */

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
    "export async function requireCanonicalSessionProfile() { return globalThis.__perfilDaVersaoTransportada; }",
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

let banco: Banco = semearBanco();
const { foraDoBanco } = instalarPostgrestSimulado(() => banco);

const { createCanonicalServiceClient } = await import("../lib/server/canonical-authorization.ts");
(globalThis as Record<string, unknown>).__perfilDaVersaoTransportada = { userId: "ator-de-teste", supabase: createCanonicalServiceClient() };

const rota = await import("../app/api/editorial/radar-export/route.ts");
const { radarCurrentArticleDnaVersion, radarTransportedArticleDnaVersionIdOf } = await import("../lib/radar/article-dna-current.ts");
const { radarArticleBlueprintPick } = await import("../lib/radar/article-blueprint-freeze.ts");
const { radarArticleBlueprintCurrentInvestigationOf } = await import("../lib/server/radar-article-blueprint-read.ts");
const { radarFrozenObservedAtOfAnalysis } = await import("../lib/radar/evidence-bundle-runtime.ts");
const { radarFrozenBundleHash } = await import("../lib/radar/investigation-finalization.ts");
const { radarExportArticleReads } = await import("../app/api/editorial/radar-export/_leitura-do-artigo.ts");
const { RadarStartError, radarStartPorts, startRadarYoutubeRun } = await import("../lib/server/radar-youtube-start.ts");
const { startRadarAmazonRun } = await import("../lib/server/radar-amazon-start.ts");
const { radarWriterHandoffPorts, sendRadarToWriter } = await import("../lib/server/radar-writer-send.ts");
type RadarStartPorts = import("../lib/server/radar-youtube-start.ts").RadarStartPorts;
type RadarRadarState = import("../lib/server/radar-youtube-start.ts").RadarRadarState;
type RadarWriterHandoffPorts = import("../lib/server/radar-writer-send.ts").RadarWriterHandoffPorts;
type ContentDocument = import("../lib/arquiteto/contracts.ts").ContentDocument;

/* ======================= a v2 aprovada, gravada depois do envio ======================= */

const V2 = "6b1e0999-2c3d-4e5f-8a9b-000000000999";
const HASH_V2 = `sha256:${"9".repeat(64)}`;
const ATOR = "6b1e0099-2c3d-4e5f-8a9b-000000000099";

const linhaDoDnaDe = (semeado: Banco, articleId: string) => semeado.editorial_artifact_versions
  .find(linha => linha.artifact_type === "article_dna" && ((linha.payload as Linha).payload as Linha).articleId === articleId)!;

/**
 * "Gravar melhorias" sobre F, que já está no Radar: a sucessora nasce APROVADA
 * (v2), com os eventos em ordem. O item do Radar continua na v1.
 */
function comVersaoNovaAprovada(semeado: Banco): { v1: string; v2: string } {
  const linhaV1 = linhaDoDnaDe(semeado, ARTIGO.F);
  const envelope = linhaV1.payload as Linha;
  const v1 = String(linhaV1.version_id);
  const criadaEm = "2026-10-09T08:00:00.000Z";
  semeado.editorial_artifact_versions.push({
    ...linhaV1,
    payload: {
      ...envelope, versionId: V2, versionNumber: 2, previousVersionId: v1, contentHash: HASH_V2,
      changeReason: "Melhoria gravada", createdAt: criadaEm,
      payload: { ...(envelope.payload as Linha), promise: "Skincare facial: a rotina da manhã em quatro passos" },
    },
    version_id: V2, version_number: 2, previous_version_id: v1, content_hash: HASH_V2,
    change_reason: "Melhoria gravada", created_at: criadaEm,
  });
  semeado.editorial_version_status_events.push(
    { id: "evento-v1-aprovada", version_id: v1, status: "approved", reason: "Aprovado no Arquiteto", actor_id: ATOR, occurred_at: "2026-09-10T09:00:00.000Z" },
    { id: "evento-v2-aprovada", version_id: V2, status: "approved", reason: "Gravar melhorias", actor_id: ATOR, occurred_at: criadaEm },
  );
  return { v1, v2: V2 };
}

/**
 * O congelamento de F como o FINALIZE o grava. A fotografia da bancada leva um
 * `bundleHash` de mentira (o E4 do export não o confere), e a prontidão parava
 * ali (BUNDLE_MUTATED) antes de conferir a versão. Aqui o hash é recalculado
 * sobre o mesmo conteúdo (vínculo na v1), e a versão corrente vai para o fim do
 * array, onde a leitura do item repõe a corrida dela — como no banco real.
 */
function comCongelamentoIntegro(semeado: Banco) {
  const item = semeado.editorial_workflow_items.find(linha => linha.article_id === ARTIGO.F)!;
  const payload = item.payload as { analysisVersions: Linha[] };
  const ordenadas = [...payload.analysisVersions]
    .sort((a, b) => Number(a.versionNumber) - Number(b.versionNumber))
    .map(versao => {
      const analise = versao.payload as Linha;
      const congelado = analise.finalizedBundle as Linha | null;
      if (!congelado) return versao;
      const { bundleHash: _antigo, ...conteudo } = congelado;
      void _antigo;
      return { ...versao, payload: { ...analise, finalizedBundle: { ...conteudo, bundleHash: radarFrozenBundleHash(conteudo as never) } } };
    });
  item.payload = { ...payload, analysisVersions: ordenadas };
}

/** O banco do cenário: a bancada do export, a v2 aprovada de F, o congelamento íntegro e os artigos-modelo concluídos (sobre a v1 E sobre a v2). */
function cenario(): { v1: string; v2: string } {
  const semeado = semearBanco();
  const versoes = comVersaoNovaAprovada(semeado);
  comCongelamentoIntegro(semeado);
  banco = comArtigosModeloConcluidos(semeado);
  return versoes;
}

/* ======================= 1 · a regra pura ======================= */

const versao = (versionId: string, versionNumber: number, patch: { articleId?: string; brandId?: string } = {}) => ({
  versionId, versionNumber, payload: { articleId: patch.articleId ?? "a1", brandId: patch.brandId ?? "m1" },
});
const evento = (versionId: string, status: string) => ({ versionId, status });
const escolher = (versoes: ReturnType<typeof versao>[], eventos: ReturnType<typeof evento>[], transportedVersionId?: string | null) =>
  radarCurrentArticleDnaVersion({ versions: versoes, events: eventos, brandId: "m1", articleId: "a1", transportedVersionId })?.versionId ?? null;

test("regra · v1 transportada e v2 aprovada mais nova: vale a v1, nas duas ordens de leitura", () => {
  const v1 = versao("dna-v1", 1), v2 = versao("dna-v2", 2);
  const aprovadas = [evento("dna-v1", "approved"), evento("dna-v2", "approved")];
  assert.equal(escolher([v1, v2], aprovadas, "dna-v1"), "dna-v1");
  assert.equal(escolher([v2, v1], aprovadas, "dna-v1"), "dna-v1");
  /* A v1 substituída pela v2 continua sendo a que o item transporta. */
  assert.equal(escolher([v2, v1], [...aprovadas, evento("dna-v1", "superseded")], "dna-v1"), "dna-v1");
  /* Sem a transportada, a regra da mesa (a última aprovada). */
  assert.equal(escolher([v1, v2], aprovadas), "dna-v2");
  assert.equal(escolher([v1, v2], aprovadas, null), "dna-v2");
  assert.equal(escolher([v1, v2], aprovadas, "  "), "dna-v2");
});

test("regra · transportada inexistente, de outro artigo ou de outra marca: vale a regra atual", () => {
  const v1 = versao("dna-v1", 1), v2 = versao("dna-v2", 2);
  const aprovadas = [evento("dna-v1", "approved"), evento("dna-v2", "approved")];
  assert.equal(escolher([v1, v2], aprovadas, "dna-apagada"), "dna-v2");
  assert.equal(escolher([v1, v2, versao("dna-alheia", 9, { articleId: "a2" })], aprovadas, "dna-alheia"), "dna-v2", "a versão de outro artigo nunca vale");
  assert.equal(escolher([v1, v2, versao("dna-outra-marca", 9, { brandId: "m2" })], aprovadas, "dna-outra-marca"), "dna-v2", "a versão de outra marca nunca vale");
  /* Sem nenhuma versão do artigo, nada — com ou sem transportada. */
  assert.equal(escolher([versao("dna-alheia", 1, { articleId: "a2" })], [], "dna-alheia"), null);
});

test("regra · a versão transportada é lida do item: RadarItem gravado no payload, item parseado e a coluna source_version_id", () => {
  assert.equal(radarTransportedArticleDnaVersionIdOf({ payload: { articleDnaVersionId: "dna-v1" }, source_version_id: "dna-v1" }), "dna-v1");
  assert.equal(radarTransportedArticleDnaVersionIdOf({ payload: { articleDnaVersionId: "dna-v1" }, source_version_id: "dna-velha" }), "dna-v1", "o RadarItem vem primeiro");
  assert.equal(radarTransportedArticleDnaVersionIdOf({ payload: {}, source_version_id: "dna-v1" }), "dna-v1");
  assert.equal(radarTransportedArticleDnaVersionIdOf({ articleDnaVersionId: "dna-v1" }), "dna-v1");
  for (const vazio of [null, undefined, "texto", [], {}, { payload: { articleDnaVersionId: "" }, source_version_id: null }]) {
    assert.equal(radarTransportedArticleDnaVersionIdOf(vazio), null, JSON.stringify(vazio));
  }
});

/* ======================= 2 · P0-A: a planta da v1 continua escolhida ======================= */

test("P0-A · a planta APPROVED organizada sobre a v1 continua escolhida por radarArticleBlueprintPick; a da v2, não", () => {
  const congeladoEm = "2026-10-05T12:00:00.000Z";
  const analise = { finalizedBundle: { frozenAt: congeladoEm, bundleId: "bundle-1", bundleHash: "hash-congelado" }, researchTarget: null };
  const v1 = { versionId: "dna-v1", contentHash: "h-v1", createdAt: "2026-10-01T09:00:00.000Z", versionNumber: 1 };
  const v2 = { versionId: "dna-v2", contentHash: "h-v2", createdAt: "2026-10-09T08:00:00.000Z", versionNumber: 2 };
  const investigacao = radarArticleBlueprintCurrentInvestigationOf({ analysisPayload: analise, article: v1, articleVersions: [v1, v2] });
  assert.ok(investigacao, "a investigação congelada sobre a v1 não foi reconhecida");
  assert.equal(investigacao!.articleDnaVersionId, "dna-v1");
  const planta = (id: string, numero: number, dna: { versionId: string; contentHash: string }) => ({
    id, bundleHash: `hash-da-organizacao-${id}`, versionNumber: numero, state: "APPROVED", createdAt: "2026-10-09T09:00:00.000Z",
    investigationRef: { frozenAt: investigacao!.frozenAt, frozenBundleId: investigacao!.frozenBundleId, frozenBundleHash: null, articleDnaVersionId: dna.versionId, articleDnaContentHash: dna.contentHash },
  });
  /* A da v2 é mais nova (número maior): mesmo assim, a da v1 é a do item. */
  const escolhida = radarArticleBlueprintPick([planta("planta-v1", 1, v1), planta("planta-v2", 2, v2)], { bundleHash: "hash-do-dossie-de-hoje", investigation: investigacao });
  assert.deepEqual(escolhida, { id: "planta-v1", approval: "APPROVED", basis: "investigation" });
});

/* ======================= 3 · o export, de ponta a ponta ======================= */

type Resposta = { status: number; corpo: { exported?: number; refused?: Array<{ articleId: string; code: string; reason?: string }>; csv?: string; files?: Array<{ csv: string }>; code?: string } };

async function exportar(corpo: unknown): Promise<Resposta> {
  const resposta = await rota.POST(new Request("http://localhost/api/editorial/radar-export", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
  }));
  return { status: resposta.status, corpo: JSON.parse(await resposta.text()) };
}

/** Os títulos (H1) das plantas da bancada de F, por versão do ArticleDNA. */
function plantasDeF(articleDnaVersionId: string): string[] {
  return (banco.radar_article_blueprints || [])
    .filter(linha => linha.article_id === ARTIGO.F && ((linha.payload as Linha).investigationRef as Linha).articleDnaVersionId === articleDnaVersionId)
    .map(linha => String((((linha.payload as Linha).blueprint as Linha).title as Linha).h1));
}
const citado = (csv: string, h1: string) => new RegExp(`${h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d)`).test(csv);

test("export · F no Radar na v1, v2 aprovada depois: o CSV sai sobre a v1, com a planta organizada sobre a v1", async () => {
  const { v1, v2 } = cenario();
  /* O cenário é o do defeito: pela regra da mesa, a vigente é a v2. */
  const vigente = await radarStartPorts.loadArticle({ brandId: MARCA, articleId: ARTIGO.F });
  assert.equal(vigente?.versionId, v2);
  const corrente = await radarExportArticleReads.currentAnalysis({ brandId: MARCA, articleId: ARTIGO.F });
  assert.equal(corrente?.payload.articleDnaVersionId, v1, "a análise corrente carrega a versão do item");

  for (const mode of ["writing", "full"] as const) {
    const { status, corpo } = await exportar({ brandId: MARCA, articleIds: [ARTIGO.F], mode });
    assert.equal(status, 200, `${mode}: ${JSON.stringify(corpo).slice(0, 400)}`);
    assert.equal(corpo.exported, 1, mode);
    assert.deepEqual(corpo.refused, [], mode);
    const csv = [corpo.csv ?? "", ...(corpo.files ?? []).map(arquivo => arquivo.csv)].join("\n");
    assert.ok(csv.trim(), `${mode}: a resposta saiu sem CSV (${Object.keys(corpo).join(", ")})`);
    /* Com o congelamento íntegro, a prontidão chega à conferência da versão — e ela passa. */
    assert.doesNotMatch(csv, /ARTICLE_VERSION_MISMATCH|não corresponde mais à versão atual do Article|verificação de integridade/, mode);
    /* A v2 mudou a promessa: o dossiê descreve a versão que o Radar investigou (a v1), nunca a da v2. */
    assert.doesNotMatch(csv, /a rotina da manhã em quatro passos/, mode);
    if (mode === "full") assert.match(csv, /Skincare facial: a rotina que cabe na manhã/, mode);
    if (mode === "writing") {
      const daV1 = plantasDeF(v1), daV2 = plantasDeF(v2);
      assert.ok(daV1.length > 0 && daV2.length > 0, "a bancada semeou plantas sobre as duas versões");
      assert.ok(daV1.some(h1 => citado(csv, h1)), "a planta organizada sobre a v1 sumiu do CSV");
      for (const h1 of daV2) assert.equal(citado(csv, h1), false, `a planta da v2 (${h1}) entrou no CSV`);
    }
  }
});

test("export · controle: sem versão transportada conhecida, vale a regra da mesa (v2) e o export falha — o artigo travado de antes da correção", async () => {
  cenario();
  /* A análise passa a carregar uma versão que o acervo não tem: a escolha cai na regra da mesa. */
  const item = banco.editorial_workflow_items.find(linha => linha.article_id === ARTIGO.F)!;
  const payload = item.payload as { analysisVersions: Linha[] };
  item.payload = { ...payload, analysisVersions: payload.analysisVersions.map(versao => ({ ...versao, payload: { ...(versao.payload as Linha), articleDnaVersionId: "dna-apagada" } })) };
  for (const corrida of banco.radar_analysis_runs) {
    if (corrida.article_id === ARTIGO.F) corrida.payload = { ...(corrida.payload as Linha), articleDnaVersionId: "dna-apagada" };
  }
  const { status, corpo } = await exportar({ brandId: MARCA, articleIds: [ARTIGO.F], mode: "full" });
  /* O dossiê da v2 sobre o congelamento da v1 não monta: o export inteiro falha, como no artigo travado. */
  assert.equal(status, 500, JSON.stringify(corpo).slice(0, 300));
  assert.match(String((corpo as { error?: string }).error), /ARTICLE_DNA_MISMATCH/);
  assert.equal(corpo.exported ?? 0, 0);
});

test("export · a investigação vigente do artigo-modelo é a da v1 (a organização usa a mesma montagem)", async () => {
  const { v1 } = cenario();
  const corrente = await radarExportArticleReads.currentAnalysis({ brandId: MARCA, articleId: ARTIGO.F });
  const congeladoEm = radarFrozenObservedAtOfAnalysis(corrente!.payload);
  assert.ok(congeladoEm, "F está finalizado na bancada");
  const { assembleRadarPortableExport } = await import("../lib/server/radar-portable-export-core.ts");
  const montagem = await assembleRadarPortableExport({
    brandId: MARCA, articleIds: [ARTIGO.F], supabase: createCanonicalServiceClient() as never, actorUserId: "ator-de-teste",
  });
  assert.deepEqual(montagem.recusados, []);
  assert.equal(montagem.congelamentos.get(ARTIGO.F)?.articleDnaVersionId, v1);
  assert.equal(montagem.montadas[0]?.entrada.article.promise, "Skincare facial: a rotina que cabe na manhã");
});

/* ======================= 4 · o START do YouTube e da Amazon ======================= */

const CONSULTAS = [{
  queryId: "ytq:1", text: "skincare facial", origin: "PRIMARY_KEYWORD",
  sourceRef: null, reason: "A keyword principal do artigo, como as pessoas a digitam.",
  resultCount: 0, executed: false, failureReason: null, checkUrl: null, seResultsCount: null, itemsCount: null,
}];

/** As portas do START: a leitura do ArticleDNA é a REAL (o acervo simulado); estado e escrita, em memória. */
function portasDoStart(inicial: RadarRadarState | null) {
  let estado = inicial;
  const pedidosDoArtigo: Array<Parameters<RadarStartPorts["loadArticle"]>[0]> = [];
  const ports: RadarStartPorts = {
    loadArticle: async pedido => { pedidosDoArtigo.push(pedido); return radarStartPorts.loadArticle(pedido); },
    loadRadarState: async () => estado,
    appendAnalysis: async ({ analysis }) => {
      if (!estado) throw new RadarStartError("radar_item_not_found", "sem item", 404);
      estado = { lockVersion: estado.lockVersion + 1, analyses: [...estado.analyses, analysis] };
    },
  };
  return { ports, pedidosDoArtigo, get estado() { return estado; } };
}

test("START do YouTube · item na v1 e v2 aprovada: não recusa, e o contêiner e a corrida nascem sobre a v1", async () => {
  const { v1 } = cenario();
  const mesa = portasDoStart({ lockVersion: 1, analyses: [] });
  const inicio = await startRadarYoutubeRun({
    brandId: MARCA, articleId: ARTIGO.F, articleDnaVersionId: v1, actorId: "ator-de-teste",
    queries: CONSULTAS, runId: "run-yt-1", startedAt: "2026-10-09T10:00:00.000Z",
  }, mesa.ports);
  assert.equal(inicio.run.state, "COLLECTING");
  assert.equal(inicio.run.fingerprint.articleDnaVersionId, v1);
  /* As duas leituras do ArticleDNA (o START e o contêiner) levam a versão do item. */
  assert.deepEqual(mesa.pedidosDoArtigo.map(pedido => pedido.transportedVersionId), [v1, v1]);
  assert.equal(mesa.estado!.analyses[0].payload.articleDnaVersionId, v1, "o contêiner nasceu sobre a sucessora aprovada");
});

test("START do YouTube · a versão que não é deste artigo continua recusada", async () => {
  cenario();
  const mesa = portasDoStart({ lockVersion: 1, analyses: [] });
  await assert.rejects(
    () => startRadarYoutubeRun({
      brandId: MARCA, articleId: ARTIGO.F, articleDnaVersionId: "dna-de-outro-artigo", actorId: "ator-de-teste",
      queries: CONSULTAS, runId: "run-yt-2", startedAt: "2026-10-09T10:00:00.000Z",
    }, mesa.ports),
    (erro: unknown) => erro instanceof RadarStartError && erro.code === "radar_article_dna_mismatch",
  );
  assert.equal(mesa.estado!.analyses.length, 0, "nada foi gravado");
});

test("START da Amazon · a mesma porta: a v1 do item passa da conferência da versão", async () => {
  const { v1 } = cenario();
  /* Sem item, a recusa é a da etapa SEGUINTE à conferência da versão: ela passou. */
  const mesa = portasDoStart(null);
  await assert.rejects(
    () => startRadarAmazonRun({
      brandId: MARCA, articleId: ARTIGO.F, articleDnaVersionId: v1, actorId: "ator-de-teste",
      queries: [], runId: "run-amz-1", startedAt: "2026-10-09T10:00:00.000Z",
    }, mesa.ports),
    (erro: unknown) => erro instanceof RadarStartError && erro.code === "radar_item_not_found",
  );
  assert.deepEqual(mesa.pedidosDoArtigo.map(pedido => pedido.transportedVersionId), [v1]);
});

/* ======================= 5 · o envio ao Redator ======================= */

/** O envio com as portas REAIS de leitura (acervo, item, análise, autoridades e planta, todas no banco simulado) e a escrita em memória. */
async function enviar() {
  let documento: ContentDocument | null = null;
  const criados: Array<{ articleDnaVersionId: string }> = [];
  const portas: RadarWriterHandoffPorts = {
    ...radarWriterHandoffPorts,
    findDocument: async () => documento,
    createDocument: async ({ document, articleDnaVersionId }) => { criados.push({ articleDnaVersionId }); documento = document; },
    transitionRadar: async () => {},
    appendDecision: async () => {},
  };
  const resultado = await sendRadarToWriter({ brandId: MARCA, articleId: ARTIGO.F, actorId: "ator-de-teste", sentAt: "2026-10-09T11:00:00.000Z" }, portas);
  return { resultado, criados };
}

test("envio ao Redator · item na v1 e v2 aprovada: a prontidão não dá ARTICLE_VERSION_MISMATCH e o documento nasce sobre a v1", async () => {
  const { v1 } = cenario();
  const item = await radarWriterHandoffPorts.findWorkflowItem({ brandId: MARCA, articleId: ARTIGO.F, stage: "radar" });
  assert.equal(radarTransportedArticleDnaVersionIdOf(item), v1);
  const fundamento = await radarWriterHandoffPorts.loadArticleFoundation({ brandId: MARCA, articleId: ARTIGO.F, transportedVersionId: v1 });
  assert.equal(fundamento?.articleDnaVersionId, v1);

  let resultado: Awaited<ReturnType<typeof enviar>>;
  try {
    resultado = await enviar();
  } catch (erro) {
    const prontidao = (erro as { readiness?: { blocks?: Array<{ code: string }> } }).readiness;
    assert.fail(`o envio recusou: ${(erro as Error & { code?: string }).code} · ${(erro as Error).message} · ${JSON.stringify(prontidao?.blocks?.map(bloco => bloco.code) ?? [])}`);
  }
  assert.equal(resultado.resultado.change, "CREATED");
  assert.equal(resultado.resultado.record.binding.articleDnaVersionId, v1);
  assert.deepEqual(resultado.criados, [{ articleDnaVersionId: v1 }]);
});

test("envio ao Redator · sem a versão transportada (a regra da mesa), o mesmo cenário recusava: é o defeito que a correção fecha", async () => {
  cenario();
  /* A porta como era nesta rodada: ignora a versão do item. */
  const portas: RadarWriterHandoffPorts = {
    ...radarWriterHandoffPorts,
    loadArticleFoundation: ({ brandId, articleId }) => radarWriterHandoffPorts.loadArticleFoundation({ brandId, articleId }),
    loadArticleIdentity: ({ brandId, articleId, siloId }) => radarWriterHandoffPorts.loadArticleIdentity({ brandId, articleId, siloId }),
    loadCanonicalAuthorities: ({ brandId, articleId, analysis }) => radarWriterHandoffPorts.loadCanonicalAuthorities({ brandId, articleId, analysis }),
    findDocument: async () => null,
    createDocument: async () => { throw new Error("não devia criar"); },
    transitionRadar: async () => {},
    appendDecision: async () => {},
  };
  await assert.rejects(
    () => sendRadarToWriter({ brandId: MARCA, articleId: ARTIGO.F, actorId: "ator-de-teste", sentAt: "2026-10-09T11:00:00.000Z" }, portas),
    (erro: unknown) => {
      const comCodigo = erro as Error & { code?: string; readiness?: { blocks?: Array<{ code: string }> } | null };
      const blocos = comCodigo.readiness?.blocks?.map(bloco => bloco.code) ?? [];
      /* A recusa pela versão, seja na prontidão, no vínculo do pacote ou na montagem do dossiê sobre o congelamento da v1. */
      assert.ok(
        blocos.includes("ARTICLE_VERSION_MISMATCH") || comCodigo.code === "radar_handoff_binding_mismatch" || /ARTICLE_DNA_MISMATCH/.test(comCodigo.message),
        `${comCodigo.code} · ${JSON.stringify(blocos)} · ${comCodigo.message}`,
      );
      return true;
    },
  );
});

/* ======================= 6 · os sete leitores, no código ======================= */

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const ler = async (caminho: string) => semComentarios(await readFile(new URL(`../${caminho}`, import.meta.url), "utf8"));

test("os leitores do Radar passam a versão transportada, cada um com o dado que já tem (nenhuma leitura nova)", async () => {
  const nucleo = await ler("lib/server/radar-portable-export-core.ts");
  assert.match(nucleo, /transportedVersionId: corrente\.payload\.articleDnaVersionId,/);

  const envio = await ler("lib/server/radar-writer-send.ts");
  assert.match(envio, /const transportada = radarTransportedArticleDnaVersionIdOf\(radarItem\);/);
  assert.ok(envio.indexOf("const radarItem = await portas.findWorkflowItem(") < envio.indexOf("await portas.loadArticleFoundation({"), "o item é lido antes do fundamento");
  assert.equal((envio.match(/transportedVersionId: transportada/g) || []).length, 4, "fundamento, autoridades, identidade e a releitura do fundamento");
  assert.match(envio, /if \(radarTransportedArticleDnaVersionIdOf\(radarAtual\) !== transportada\)/);

  const youtube = await ler("lib/server/radar-youtube-start.ts");
  assert.match(youtube, /ports\.loadArticle\(\{ brandId: input\.brandId, articleId: input\.articleId, transportedVersionId: input\.articleDnaVersionId \}\)/);
  assert.match(youtube, /ensureRadarAnalysisContext\(\{ brandId: input\.brandId, articleId: input\.articleId, actorId: input\.actorId, articleDnaVersionId: input\.articleDnaVersionId \}, ports\)/);
  assert.match(youtube, /transportedVersionId: input\.articleDnaVersionId \?\? null/);
  assert.match(youtube, /radarCurrentArticleDnaVersion\(\{ versions: artefatos\.articles, events: artefatos\.events, brandId, articleId, transportedVersionId \}\)/);

  const amazonStart = await ler("lib/server/radar-amazon-start.ts");
  assert.match(amazonStart, /ports\.loadArticle\(\{ brandId: input\.brandId, articleId: input\.articleId, transportedVersionId: input\.articleDnaVersionId \}\)/);
  assert.match(amazonStart, /articleDnaVersionId: input\.articleDnaVersionId \}, ports\)/);

  const amazon = await ler("lib/server/radar-amazon-analyze.ts");
  assert.match(amazon, /transportedVersionId: payload\.articleDnaVersionId/);

  const apoio = await ler("lib/server/radar-support-research.ts");
  assert.match(apoio, /transportedVersionId: input\.articleDnaVersionId \?\? null/);
  const rotaDaAmazon = await ler("app/api/editorial/radar-amazon-search/route.ts");
  const chamadasDoApoio = rotaDaAmazon.split("collectRadarGoogleSupport({").slice(1).map(trecho => trecho.slice(0, trecho.indexOf("});")));
  assert.equal(chamadasDoApoio.length, 2);
  assert.match(chamadasDoApoio[0], /articleDnaVersionId: input\.articleDnaVersionId,/, "o START passa ao apoio a versão conferida");
  assert.match(chamadasDoApoio[1], /articleDnaVersionId: corrente\?\.payload\.articleDnaVersionId \?\? entrada\.input\.articleDnaVersionId,/, "o retry passa a versão da análise gravada");

  for (const fonte of [nucleo, envio, youtube, amazon, apoio]) assert.doesNotMatch(fonte, /artefatos\.articles\.find\(/);
});

test("PROVIDER_CALLS = 0 · nenhum host fora do banco simulado", () => {
  assert.deepEqual(foraDoBanco, []);
});
