import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RadarAnalysisPayloadSchema,
  buildRadarPlannerPackage,
  createRadarAnalysisContext,
  createRadarAnalysisSuccessor,
} from "../lib/radar/analysis-contracts.ts";
import {
  radarPrimaryModeCommitment,
  radarPrimaryModeOfAnalysis,
} from "../lib/radar/search-mode.ts";
import { assertRadarPrimaryModeForRequest } from "../lib/server/radar-primary-mode.ts";
import {
  RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
  RADAR_YOUTUBE_PROVIDER_ENDPOINT,
  buildRadarYoutubeRunFingerprint,
  buildRadarYoutubeSearchRun,
  buildRadarYoutubeStartedRun,
  radarYoutubeRunSummary,
} from "../lib/radar/youtube-search-run.ts";

/*
 * ==========  YOUTUBE_SEARCH_1.3 · BOOTSTRAP NEUTRO DO RADAR  ==========
 *
 * O DEFEITO ERA DE CONTRATO, NÃO DE MENSAGEM.
 *
 * Em artigo novo, a aba de YouTube dizia "colete a SERP uma vez antes de
 * pesquisar no YouTube". Seguir essa instrução tornava a pesquisa de YouTube
 * IMPOSSÍVEL: a coleta do Google comprometeria o artigo com WEB, e o YouTube
 * passaria a ser bloqueado pela própria trava de modo único.
 *
 * A causa: `createRadarAnalysisVersion` exigia `research: SerpResearchSnapshot`.
 * O vaso da persistência do Radar estava amarrado a UMA das três investigações.
 *
 * PROVIDER_CALLS_IN_TESTS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* =============================== a fixture ============================== */

const ARTIGO = {
  versionId: "dna-1",
  entityId: "article:artigo-1",
  versionNumber: 3,
  previousVersionId: null,
  contentHash: "hash-dna-1",
  origin: "human" as const,
  changeReason: "fixture",
  createdAt: "2026-09-14T10:00:00.000Z",
  createdBy: "usuario-1",
  payload: {
    brandId: "marca-1",
    articleId: "artigo-1",
    principalKeywordId: "kw-1",
    promise: "Skincare para pele oleosa",
    keywordReferences: [
      { keywordId: "kw-1", role: "principal" },
      { keywordId: "kw-2", role: "secundaria" },
    ],
  },
} as unknown as Parameters<typeof createRadarAnalysisContext>[0]["article"];

const contexto = () => createRadarAnalysisContext({ brandId: "marca-1", article: ARTIGO, actorId: "usuario-1", now: "2026-09-14T10:00:00.000Z" });

const corridaDeYoutube = (patch: { state?: "COLLECTING" } = {}) => {
  const fingerprint = buildRadarYoutubeRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["ytq:1"] });
  const consultas = [{ queryId: "ytq:1", text: "skincare para pele oleosa", origin: "PRIMARY_KEYWORD", reason: "A keyword principal do artigo." }];
  if (patch.state === "COLLECTING") {
    return buildRadarYoutubeStartedRun({
      runId: "run-1", runVersion: 1, startedAt: "2026-09-14T10:00:05.000Z", startedBy: "usuario-1",
      fingerprint, queries: consultas,
    });
  }
  return buildRadarYoutubeSearchRun({
    runId: "run-1", runVersion: 1, startedAt: "2026-09-14T10:00:05.000Z", startedBy: "usuario-1",
    fingerprint,
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [], collectedAt: "2026-09-14T10:00:09.000Z",
    },
    queries: consultas.map(item => ({ ...item, resultCount: 0, executed: true })),
    results: [], universe: [],
  });
};

/* ============ §11.C · o bootstrap sozinho não compromete nada ============ */

test("§11.C · BOOTSTRAP_SETS_PRIMARY_MODE = NO — o contêiner nasce sem modo", async () => {
  const container = await contexto();

  assert.equal(radarPrimaryModeOfAnalysis(container.payload), null, "o contêiner não escolhe universo nenhum");
  assert.equal(container.payload.deepResearch, null);
  assert.equal(container.payload.youtubeSearch, null);

  /*
   * GOOGLE_STATE_CREATED_BY_YOUTUBE = NO — e a prova é campo a campo.
   *
   * Um contêiner que já trouxesse decisões de SERP, concorrentes ou relatório
   * faria a tela do Google mostrar trabalho que ninguém fez — e, pior, faria
   * `radarPrimaryModeOfAnalysis` um dia concluir WEB por acidente.
   */
  assert.deepEqual(container.payload.serpDecisions, []);
  assert.deepEqual(container.payload.selectedCompetitorIds, []);
  assert.deepEqual(container.payload.extractions, []);
  assert.equal(container.payload.benchmark, null);
  assert.equal(container.payload.competitiveReport, null);
  assert.equal(container.payload.competitiveness, null);
  assert.equal(container.payload.finalizedBundle, null);
  assert.equal(container.payload.plannerPackage, null);

  /*
   * E A IDENTIDADE DA SERP É NULA, não inventada.
   *
   * Um id sintético aqui seria pior que o campo vazio: todo leitor que compara
   * `serpSnapshotId === record.id` passaria a comparar contra uma mentira.
   */
  assert.equal(container.payload.serpSnapshotId, null);
  assert.equal(container.payload.serpSnapshotVersion, null);
  assert.equal(container.payload.serpSnapshotHash, null);

  /* Sem snapshot não há pacote para o Planejador — nem com benchmark nenhum. */
  assert.equal(buildRadarPlannerPackage(container.payload), null);

  /*
   * E CONTINUA NÃO HAVENDO mesmo que apareça decisão de SERP sem snapshot.
   *
   * O pacote carrega a proveniência da investigação que o originou. Montá-lo
   * com `serpSnapshotId: null` entregaria ao Planejador uma origem que não
   * aponta para lugar nenhum — pior que não entregar pacote.
   */
  const comDecisaoSemSnapshot = { ...container.payload, serpDecisions: [
    { key: "organic:1", itemType: "organic" as const, decision: "included" as const, reason: "", note: "", ownDomain: false },
  ] };
  assert.equal(buildRadarPlannerPackage(comDecisaoSemSnapshot), null, "decisão sem snapshot não vira pacote");

  /* É a PRIMEIRA versão, e ela não sucede coisa alguma. */
  assert.equal(container.versionNumber, 1);
  assert.equal(container.previousVersionId, null);
});

test("§11.G · ARTICLE_DNA_MUTATED = NO — o contêiner lê o ArticleDNA e não o toca", async () => {
  const antes = JSON.stringify(ARTIGO);
  const container = await contexto();
  assert.equal(JSON.stringify(ARTIGO), antes, "o ArticleDNA saiu igual como entrou");

  /* Ele apenas REFERENCIA a versão do ArticleDNA que o originou. */
  assert.equal(container.payload.articleDnaVersionId, "dna-1");
  assert.equal(container.payload.articleId, "artigo-1");
  assert.equal(container.payload.brandId, "marca-1");

  /* E copia as keywords como "manter" — decisão neutra, não revisão. */
  assert.deepEqual(container.payload.keywordDecisions, [
    { keywordId: "kw-1", decision: "keep", note: "" },
    { keywordId: "kw-2", decision: "keep", note: "" },
  ]);
});

/* ======== §11.A e §11.B · os dois modos podem ser o primeiro ======== */

test("§11.A · sobre o contêiner neutro, o START de YOUTUBE é permitido", async () => {
  const container = await contexto();

  /* A autoridade remota resolve `null` e libera — ARTICLE_DNA_IS_ENTRY_AUTHORITY. */
  const decisao = await assertRadarPrimaryModeForRequest(
    { brandId: "marca-1", articleId: "artigo-1", requestedMode: "YOUTUBE" },
    { loadAnalysisPayload: async () => container.payload },
  );
  assert.deepEqual(decisao, { currentMode: null, requestedMode: "YOUTUBE" });

  /* E a tela concorda: nenhum motivo de bloqueio. */
  assert.deepEqual(
    radarPrimaryModeCommitment({ mode: "YOUTUBE", currentMode: radarPrimaryModeOfAnalysis(container.payload) }),
    { committedTo: null, canStart: true, reason: null },
  );
});

test("§11.B · GOOGLE_CAN_BE_FIRST_MODE — o mesmo contêiner libera o Google", async () => {
  const container = await contexto();

  const decisao = await assertRadarPrimaryModeForRequest(
    { brandId: "marca-1", articleId: "artigo-1", requestedMode: "WEB" },
    { loadAnalysisPayload: async () => container.payload },
  );
  assert.equal(decisao.currentMode, null);

  /*
   * §8 · AMAZON_ARCHITECTURALLY_CAN_BE_FIRST_MODE — o caminho já está pronto.
   *
   * A coleta de Amazon não existe neste gate, e a ENTRADA não é o que falta
   * para ela: um artigo sem investigação libera os três modos hoje.
   */
  const amazon = await assertRadarPrimaryModeForRequest(
    { brandId: "marca-1", articleId: "artigo-1", requestedMode: "AMAZON" },
    { loadAnalysisPayload: async () => container.payload },
  );
  assert.equal(amazon.currentMode, null);

  /* §7 · NENHUM MODO É BOOTSTRAP DE OUTRO: os três partem do mesmo lugar. */
  for (const modo of ["WEB", "YOUTUBE", "AMAZON"] as const) {
    assert.equal(radarPrimaryModeCommitment({ mode: modo, currentMode: null }).canStart, true, `${modo} não pode ser o primeiro`);
  }
});

test("§7 · o Google que começa sobre o contêiner neutro SUCEDE — não bifurca a cadeia", async () => {
  const container = await contexto();

  /*
   * O RISCO REAL DESTE GATE.
   *
   * Se o START do Google criasse a própria versão 1 ignorando o contêiner já
   * gravado, o artigo passaria a ter duas cadeias de análise com a mesma
   * identidade — e qual delas é a corrente viraria questão de sorte na
   * ordenação.
   */
  assert.equal(container.entityId, "radar-analysis:artigo-1");

  const contratos = await readFile(new URL("../lib/radar/analysis-contracts.ts", import.meta.url), "utf8");
  const fabrica = contratos.slice(contratos.indexOf("export async function createRadarAnalysisVersion"));
  assert.ok(fabrica.includes("input.previous?.entityId || `radar-analysis:${input.article.payload.articleId}`"), "a fábrica do Google reusa a entidade do contêiner");
  assert.ok(fabrica.includes("versionNumber: (input.previous?.versionNumber || 0) + 1"), "e sucede a versão existente");

  /* E a tela entrega o contêiner como `previous`, em vez de ignorá-lo. */
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const curadoria = pagina.slice(pagina.indexOf("const curationVersionFor"), pagina.indexOf("const startSerpAnalysis"));
  assert.ok(curadoria.includes("const previous = target.analysisVersions"), "o Google parte da versão corrente, seja ela qual for");
  assert.ok(curadoria.includes("previous,"), "e a passa para a fábrica");

  /* O sucessor confirma a cadeia: mesma entidade, versão seguinte, elo anterior. */
  const sucessor = await createRadarAnalysisSuccessor(container, { deepResearch: null }, "usuario-1");
  assert.equal(sucessor.entityId, container.entityId);
  assert.equal(sucessor.versionNumber, container.versionNumber + 1);
  assert.equal(sucessor.previousVersionId, container.versionId);
});

/* ============ §11.D e §11.E · o START é que compromete ============ */

test("§11.D · YOUTUBE_START_SETS_PRIMARY_MODE = YES — e o COLLECTING já compromete", async () => {
  const container = await contexto();

  /*
   * §4 · O COMPROMISSO É ANTERIOR À RESPOSTA DO PROVIDER.
   *
   * A corrida é gravada em `COLLECTING` antes da chamada. É isso que faz o §10
   * ser possível: se o provider morrer, o artigo JÁ é de YouTube e a corrida
   * existe para ser fechada como falha — em vez de sumir.
   */
  const comComecoDeCorrida = await createRadarAnalysisSuccessor(container, { youtubeSearch: corridaDeYoutube({ state: "COLLECTING" }) }, "usuario-1");
  assert.equal(comComecoDeCorrida.payload.youtubeSearch?.state, "COLLECTING");
  assert.equal(radarPrimaryModeOfAnalysis(comComecoDeCorrida.payload), "YOUTUBE");

  /* E a coleta concluída mantém o mesmo compromisso. */
  const concluida = await createRadarAnalysisSuccessor(container, { youtubeSearch: corridaDeYoutube() }, "usuario-1");
  assert.equal(radarPrimaryModeOfAnalysis(concluida.payload), "YOUTUBE");

  /* GOOGLE_STATE_CREATED_BY_YOUTUBE = NO, também depois do START. */
  assert.equal(concluida.payload.deepResearch, null);
  assert.equal(concluida.payload.serpSnapshotId, null);
  assert.deepEqual(concluida.payload.serpDecisions, []);
});

test("§11.E · depois do YOUTUBE, o START do Google é 409 — e não chama provider", async () => {
  const container = await contexto();
  const comYoutube = await createRadarAnalysisSuccessor(container, { youtubeSearch: corridaDeYoutube() }, "usuario-1");

  await assert.rejects(
    () => assertRadarPrimaryModeForRequest(
      { brandId: "marca-1", articleId: "artigo-1", requestedMode: "WEB" },
      { loadAnalysisPayload: async () => comYoutube.payload },
    ),
    (erro: unknown) => {
      const conflito = erro as { code?: string; status?: number; currentMode?: string; requestedMode?: string };
      assert.equal(conflito.code, "RADAR_PRIMARY_MODE_CONFLICT");
      assert.equal(conflito.status, 409);
      assert.equal(conflito.currentMode, "YOUTUBE");
      assert.equal(conflito.requestedMode, "WEB");
      return true;
    },
  );

  /* §9 · e Amazon também fica bloqueada — o compromisso vale contra os dois. */
  await assert.rejects(() => assertRadarPrimaryModeForRequest(
    { brandId: "marca-1", articleId: "artigo-1", requestedMode: "AMAZON" },
    { loadAnalysisPayload: async () => comYoutube.payload },
  ));

  assert.deepEqual(tentativasDeRede, [], "nenhuma chamada saiu");
});

/* ================== §10 · a falha não converte nem apaga ================== */

test("§10 · corrida que falha continua de YOUTUBE, com motivo e retry", () => {
  const comecou = corridaDeYoutube({ state: "COLLECTING" });
  assert.equal(comecou.state, "COLLECTING");
  assert.equal(comecou.provenance.queriesSucceeded, 0, "nada respondeu ainda — e zero é honesto, não é falha");
  assert.deepEqual(comecou.results, []);
  assert.equal(radarYoutubeRunSummary(comecou)?.stateLabel, "Coletando…");

  /*
   * A corrida fecha como FALHA, preservando identidade: mesmo `runId`, mesma
   * versão, mesmo fingerprint. Gerar outra faria a corrida que a pessoa viu
   * começar desaparecer, que é justamente o "apagar silenciosamente" do §10.
   */
  const falhou = buildRadarYoutubeSearchRun({
    runId: comecou.runId, runVersion: comecou.runVersion, startedAt: comecou.startedAt, startedBy: comecou.startedBy,
    fingerprint: comecou.fingerprint,
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
      queriesRequested: 1, queriesSucceeded: 0, queriesFailed: 1,
      failures: [{ queryId: "ytq:1", reason: "A DataForSEO não respondeu dentro do limite configurado." }],
      collectedAt: "2026-09-14T10:00:20.000Z",
    },
    queries: comecou.queries.map(item => ({ ...item, executed: false, failureReason: "A DataForSEO não respondeu dentro do limite configurado." })),
    results: [], universe: [],
  });

  assert.equal(falhou.state, "COLLECTION_FAILED");
  assert.equal(falhou.runId, comecou.runId, "é a MESMA corrida, fechada");
  assert.equal(falhou.runVersion, comecou.runVersion);
  assert.equal(falhou.researchMode, "YOUTUBE", "não converteu para WEB");
  assert.ok(falhou.provenance.failures[0].reason.length > 10, "o motivo fica gravado");

  /* E o artigo continua de YouTube: o retry é uma nova coleta no mesmo modo. */
  assert.equal(radarPrimaryModeOfAnalysis({ deepResearch: null, youtubeSearch: falhou }), "YOUTUBE");
  assert.equal(radarPrimaryModeCommitment({ mode: "YOUTUBE", currentMode: "YOUTUBE" }).canStart, true, "retry permitido");
  assert.equal(radarPrimaryModeCommitment({ mode: "WEB", currentMode: "YOUTUBE" }).canStart, false, "e Google continua recusado");
});

/* =============== §12 · a regra errada saiu, sem substituto =============== */

test("§12 · GOOGLE_PREREQUISITE_REMOVED — a mensagem não existe em lugar nenhum", async () => {
  const fontes = await Promise.all([
    readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8"),
  ]);

  /*
   * A AUDITORIA É DO CÓDIGO, não do comentário que explica a remoção.
   *
   * O comentário no lugar da regra CITA a frase antiga de propósito — é ele que
   * conta a quem ler por que o bloqueio deixou de existir. Uma auditoria que o
   * acusasse levaria alguém a apagar justamente a explicação.
   */
  for (const fonte of fontes.map(item => item.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1"))) {
    /*
     * A frase auditada é a QUE FOI REMOVIDA, não qualquer menção a coletar
     * SERP: o relatório competitivo do Google tem a sua própria pré-condição
     * ("colete a SERP e inicie a análise antes de gerar o relatório"), que é
     * legítima e não foi tocada por este gate.
     */
    assert.equal(/colete a SERP uma vez/i.test(fonte), false, "a regra errada voltou");
    /*
     * E NÃO FOI SUBSTITUÍDA POR WORKAROUND — nenhuma variação que continue
     * exigindo contêiner ou Google como pré-requisito da pesquisa de YouTube.
     */
    assert.equal(/ainda não tem versão de análise/i.test(fonte), false, "sobrou uma pré-condição de contêiner");
    assert.equal(/SERP uma vez antes/i.test(fonte), false, "sobrou uma pré-condição de Google");
  }

  /*
   * E O BLOQUEIO QUE RESTOU É SÓ O LEGÍTIMO: sem artigo selecionado, ou artigo
   * já comprometido com outro universo.
   */
  const pagina = fontes[0];
  /* A fatia é do BLOQUEIO. O `frozen:` logo abaixo lê a análise por outro motivo. */
  /*
   * A FATIA PROCURA O FIM A PARTIR DO INÍCIO.
   *
   * `frozen: activeRadarItem` passou a existir também na aba da Amazon, que
   * vem antes — e um `indexOf` do zero devolvia uma fatia vazia, fazendo
   * este teste falhar por ordem de props e não por regressão.
   */
  const inicioDoBloqueio = pagina.indexOf("blockedReason: !activeRadarItem");
  const bloqueio = pagina.slice(inicioDoBloqueio, pagina.indexOf("frozen: activeRadarItem", inicioDoBloqueio));
  assert.ok(bloqueio.length > 0, "a fatia do bloqueio existe");
  assert.ok(bloqueio.includes("compromissoDeModo(activeRadarItem, \"YOUTUBE\").reason"));
  assert.equal(/analiseCorrenteDe|versão de análise/.test(bloqueio), false, "o contêiner deixou de ser pré-condição da tela");
});

test("§3 · o contêiner é garantido — e desde o 1.4 quem garante é o SERVIDOR", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const codigo = pagina.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  /*
   * A TELA MANTÉM O BOOTSTRAP ANTECIPADO para o caminho de gravação que ela
   * ainda governa — a curadoria e o reset. Ele nunca recusa o clique por falta
   * de contêiner: quando falta, nasce.
   */
  const gravacao = codigo.slice(codigo.indexOf("const gravarYoutube"), codigo.indexOf("const reloadVideoLibrary"));
  assert.ok(gravacao.includes("garantirContextoDoRadar(row)"));
  assert.equal(/throw new Error\("Este artigo ainda não tem/.test(gravacao), false, "a recusa por falta de contêiner saiu");

  /* E o contêiner neutro NÃO chama provider nem cria estado do Google. */
  const bootstrap = codigo.slice(codigo.indexOf("const garantirContextoDoRadar"), codigo.indexOf("const gravarYoutube"));
  assert.equal(/fetch\(|collectSerp|dataforseo|deepResearch/i.test(bootstrap), false, "o bootstrap é neutro");
  assert.ok(bootstrap.includes("createRadarAnalysisContext("));

  /*
   * ======== §1 e §3 do 1.4 · CLIENT_BOOTSTRAP_REQUIRED = NO ========
   *
   * O START virou UMA chamada. A tela não grava mais contêiner, compromisso
   * nem resultado — ela pede e relê. Enquanto ela gravava, dado PAGO dependia
   * de a aba continuar viva entre a resposta e a gravação.
   */
  const start = codigo.slice(codigo.indexOf("const startYoutubeSearch"), codigo.indexOf("const toggleYoutubeVideo"));
  assert.equal((start.match(/await fetch\(/g) || []).length, 1, "o START é uma chamada só");
  assert.equal(/gravarYoutube\(|buildRadarYoutubeStartedRun\(|createRadarAnalysisSuccessor\(/.test(start), false, "a tela não grava no caminho do START");
  assert.ok(start.includes("pipeline.reloadRadarAnalysis(target.articleId)"), "ela relê o que o banco confirmou");
  assert.ok(start.includes("RadarYoutubeSearchRunSchema.parse(corpo.run)"), "e lê a corrida que o servidor devolveu relida");
});

/* ================= §11.F · nenhum teste precisa do Google ================= */

test("§11.F · nenhum teste de YouTube executa Google antes — nem o do bootstrap", async () => {
  const arquivos = await Promise.all([
    readFile(new URL("./radar-youtube-search-1.test.mts", import.meta.url), "utf8"),
    readFile(new URL("./radar-youtube-search-11-payload-real.test.mts", import.meta.url), "utf8"),
    readFile(new URL("./radar-youtube-search-12-autoridade-de-modo.test.mts", import.meta.url), "utf8"),
    readFile(new URL("./radar-youtube-search-13-bootstrap-neutro.test.mts", import.meta.url), "utf8"),
  ]);

  /*
   * Se algum teste de YouTube precisasse montar uma investigação do Google para
   * chegar ao ponto de partida, o pré-requisito teria voltado pela porta dos
   * fundos — e a suíte estaria validando o defeito em vez do conserto.
   */
  /*
   * A prova é o que os testes IMPORTAM. Um deles cita
   * `collectDataForSeoSerpSnapshot(` dentro de uma string — para auditar a
   * ORDEM da guarda na rota do Google — e isso não é executar coleta nenhuma.
   * Procurar a ocorrência crua confundiria auditar com executar.
   */
  for (const arquivo of arquivos) {
    const importacoes = arquivo.match(/^import[\s\S]*?from\s+"[^"]+";$/gm) || [];
    const importado = importacoes.join("\n");
    assert.equal(/createRadarAnalysisVersion|collectDataForSeoSerpSnapshot|dataforseo-serp-operation/.test(importado), false, "um teste de YouTube importa a coleta do Google");
  }

  /* O contêiner deste arquivo nasce do ArticleDNA e de mais nada. */
  const container = await contexto();
  assert.equal(container.payload.serpSnapshotId, null);
  assert.equal(radarPrimaryModeOfAnalysis(container.payload), null);
});

/* ============ o contrato aditivo: análise antiga continua legível ========== */

test("§3 · análise gravada antes deste gate continua legível — o campo é aditivo", () => {
  /*
   * As três identidades de snapshot viraram nuláveis. Uma análise do Google já
   * gravada traz os três preenchidos, e continua parseando igual — senão todo
   * histórico do Radar viraria erro na primeira leitura.
   */
  const antiga = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1",
    serpSnapshotId: "serp-9", serpSnapshotVersion: 4, serpSnapshotHash: "hash-serp",
    mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture"], confidence: "high", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [],
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null,
    keywordDecisions: [], plannerPackage: null, status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });

  assert.equal(antiga.serpSnapshotId, "serp-9");
  assert.equal(antiga.serpSnapshotVersion, 4);
  assert.equal(antiga.serpSnapshotHash, "hash-serp");
  assert.equal(radarPrimaryModeOfAnalysis(antiga), null, "sem deepResearch ainda não há compromisso — o snapshot sozinho não é investigação");
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
