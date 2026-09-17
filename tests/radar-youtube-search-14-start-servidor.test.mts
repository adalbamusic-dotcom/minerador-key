import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { OptimisticLockError } from "../lib/server/editorial-db.ts";
import {
  RadarStartError,
  ensureRadarAnalysisContext,
  finishRadarYoutubeRun,
  startRadarYoutubeRun,
  type RadarRadarState,
  type RadarStartPorts,
} from "../lib/server/radar-youtube-start.ts";
import { radarPrimaryModeOfAnalysis } from "../lib/radar/search-mode.ts";
import { createRadarAnalysisSuccessor, type RadarAnalysisVersion } from "../lib/radar/analysis-contracts.ts";
import { RadarPrimaryModeConflictError } from "../lib/radar/search-mode.ts";
import { buildRadarYoutubeSearchRun, type RadarYoutubeSearchRun } from "../lib/radar/youtube-search-run.ts";

/*
 * ========  YOUTUBE_SEARCH_1.4 · O START ATÔMICO NO SERVIDOR  ========
 *
 * O 1.3 fez o contêiner neutro nascer — no CLIENTE. A rota paga continuava
 * podendo coletar num artigo virgem sem garantir o vaso remoto: o POST direto
 * gastava DataForSEO e o resultado não tinha onde pousar.
 *
 * Aqui a ORDEM vira contrato executável:
 *
 *   artigo válido → contexto confirmado → modo confirmado
 *   → corrida COLLECTING confirmada → provider
 *
 * Cada teste quebra uma dessas setas e exige PROVIDER_CALLS = 0. As portas são
 * injetadas, então o que roda é a MESMA função de produção — sem banco e sem
 * rede.
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

/* =============================== a bancada ============================== */

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
    brandId: "marca-1", articleId: "artigo-1", principalKeywordId: "kw-1",
    promise: "Skincare para pele oleosa",
    keywordReferences: [{ keywordId: "kw-1", role: "principal" }],
  },
};

const CONSULTAS = [{
  queryId: "ytq:1", text: "skincare para pele oleosa", origin: "PRIMARY_KEYWORD",
  sourceRef: null, reason: "A keyword principal do artigo, como as pessoas a digitam.",
  resultCount: 0, executed: false, failureReason: null,
  checkUrl: null, seResultsCount: null, itemsCount: null,
}];

const PEDIDO = {
  brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1",
  actorId: "usuario-1", queries: CONSULTAS, runId: "run-1", startedAt: "2026-09-14T10:00:05.000Z",
};

/**
 * A BANCADA REGISTRA A ORDEM REAL DAS OPERAÇÕES.
 *
 * Não basta saber que o provider não foi chamado: é preciso saber que ele viria
 * DEPOIS de contexto, modo e corrida. `trilha` guarda cada passo na sequência em
 * que aconteceu, e é sobre ela que as asserções de ordem se apoiam.
 */
function bancada(inicial: RadarRadarState | null = { lockVersion: 1, analyses: [] }) {
  const trilha: string[] = [];
  let estado = inicial;
  const falhas = { loadArticle: null as Error | null, loadRadarState: null as Error | null, appendAnalysis: null as Error | null };
  /* Quantas leituras devolver antes de passar a devolver o estado gravado. */
  let readbackVazio = 0;

  const ports: RadarStartPorts = {
    loadArticle: async () => {
      trilha.push("loadArticle");
      if (falhas.loadArticle) throw falhas.loadArticle;
      return ARTIGO as never;
    },
    loadRadarState: async () => {
      trilha.push("loadRadarState");
      if (falhas.loadRadarState) throw falhas.loadRadarState;
      if (readbackVazio > 0) { readbackVazio -= 1; return estado ? { ...estado, analyses: [] } : null; }
      return estado;
    },
    appendAnalysis: async ({ expectedLock, analysis }) => {
      trilha.push(`appendAnalysis:${analysis.versionNumber}`);
      if (falhas.appendAnalysis) throw falhas.appendAnalysis;
      if (!estado) throw new RadarStartError("radar_item_not_found", "sem item", 404);
      if (expectedLock !== estado.lockVersion) throw new OptimisticLockError();
      estado = { lockVersion: estado.lockVersion + 1, analyses: [...estado.analyses, analysis] };
    },
  };

  return {
    ports, trilha,
    get estado() { return estado; },
    set estado(valor: RadarRadarState | null) { estado = valor; },
    falhar(porta: keyof typeof falhas, erro: Error) { falhas[porta] = erro; },
    esconderReadback(vezes: number) { readbackVazio = vezes; },
    corrente() { return estado?.analyses[estado.analyses.length - 1] || null; },
  };
}

/** O provider, simulado — e ele só é chamado se o START permitir. */
const provider = { chamadas: 0 };
const coletar = async () => { provider.chamadas += 1; return []; };

/* ============ §10.A · POST virgem cria o contexto antes de gastar ========= */

test("§10.A · artigo VIRGEM: contexto nasce, modo compromete, corrida grava — e só então o provider", async () => {
  provider.chamadas = 0;
  const mesa = bancada();

  const inicio = await startRadarYoutubeRun(PEDIDO, mesa.ports);

  /* SERVER_CAN_BOOTSTRAP_VIRGIN_ARTICLE — nada do cliente participou. */
  assert.equal(mesa.estado?.analyses.length, 2, "contêiner neutro + corrida comprometida");
  assert.equal(radarPrimaryModeOfAnalysis(mesa.estado!.analyses[0].payload), null, "o contêiner não compromete");
  assert.equal(radarPrimaryModeOfAnalysis(mesa.corrente()!.payload), "YOUTUBE", "o START compromete");

  assert.equal(inicio.run.state, "COLLECTING");
  assert.equal(inicio.run.runId, "run-1");
  assert.equal(inicio.currentMode, null, "o artigo era virgem");

  /*
   * §4 · A ORDEM, LIDA DA TRILHA — e não de leitura de código.
   *
   * O provider é chamado por quem recebe o retorno; ele não aparece na trilha
   * porque `startRadarYoutubeRun` termina antes. Isso é o ponto: não existe
   * caminho em que gastar venha primeiro.
   */
  const primeiroAppend = mesa.trilha.indexOf("appendAnalysis:1");
  const segundoAppend = mesa.trilha.indexOf("appendAnalysis:2");
  assert.ok(mesa.trilha.indexOf("loadArticle") < primeiroAppend, "o artigo é validado antes de criar contexto");
  assert.ok(primeiroAppend < segundoAppend, "contexto antes do compromisso");
  assert.ok(mesa.trilha.lastIndexOf("loadRadarState") > segundoAppend, "e há readback depois de gravar a corrida");
  assert.equal(provider.chamadas, 0, "o orquestrador não chama provider");

  /* Só depois de tudo isso quem chama tem permissão de gastar. */
  await coletar();
  assert.equal(provider.chamadas, 1);
});

/* ============== §10.B e §10.C · falhas antes do provider ============== */

test("§10.B · falha ao criar o contexto: PROVIDER_CALLS = 0", async () => {
  provider.chamadas = 0;
  const mesa = bancada();
  mesa.falhar("appendAnalysis", new Error("o banco recusou a escrita"));

  await assert.rejects(() => startRadarYoutubeRun(PEDIDO, mesa.ports), /o banco recusou a escrita/);
  assert.equal(provider.chamadas, 0, "PROVIDER_CALL_ON_CONTEXT_FAILURE = 0");
  assert.equal(mesa.estado?.analyses.length, 0, "nada ficou gravado pela metade");
});

test("§10.C · falha no readback do contexto: PROVIDER_CALLS = 0", async () => {
  provider.chamadas = 0;
  const mesa = bancada();
  /*
   * A ESCRITA FOI ACEITA E A LEITURA NÃO A ENCONTROU.
   *
   * É o caso mais traiçoeiro: sem o readback, a coleta paga aconteceria contra
   * um vaso que ninguém consegue ler — e o resultado não teria onde pousar.
   */
  /* Duas leituras cegas: a inicial (que de fato está vazia) e o readback. */
  mesa.esconderReadback(2);

  await assert.rejects(
    () => startRadarYoutubeRun(PEDIDO, mesa.ports),
    (erro: unknown) => {
      assert.ok(erro instanceof RadarStartError);
      assert.equal(erro.code, "radar_context_readback_failed");
      assert.equal(erro.status, 503);
      return true;
    },
  );
  assert.equal(provider.chamadas, 0);
});

test("§10.C · falha no readback da CORRIDA: PROVIDER_CALLS = 0", async () => {
  provider.chamadas = 0;
  const mesa = bancada();
  /* A primeira leitura passa (contexto), a do compromisso volta sem a corrida. */
  const portas: RadarStartPorts = {
    ...mesa.ports,
    loadRadarState: async (entrada) => {
      const estado = await mesa.ports.loadRadarState(entrada);
      /* Depois do compromisso gravado, devolve o estado ANTERIOR a ele. */
      if (estado && estado.analyses.length === 2) return { ...estado, analyses: [estado.analyses[0]] };
      return estado;
    },
  };

  await assert.rejects(
    () => startRadarYoutubeRun(PEDIDO, portas),
    (erro: unknown) => {
      assert.ok(erro instanceof RadarStartError);
      assert.equal(erro.code, "radar_run_readback_failed");
      return true;
    },
  );
  assert.equal(provider.chamadas, 0, "RUN_BEFORE_PROVIDER: sem corrida confirmada, não se gasta");
});

test("§1 · ArticleDNA ausente ou divergente barra o START antes de tudo", async () => {
  provider.chamadas = 0;

  const semArtigo = bancada();
  semArtigo.falhar("loadArticle", new RadarStartError("article_dna_not_found", "sem ArticleDNA", 404));
  await assert.rejects(() => startRadarYoutubeRun(PEDIDO, semArtigo.ports), /sem ArticleDNA/);
  assert.equal(semArtigo.estado?.analyses.length, 0, "nem contexto foi criado");

  /*
   * E A VERSÃO TEM DE SER A CANÔNICA.
   *
   * Coletar contra um fundamento que o banco não confirma produziria uma
   * corrida cujo fingerprint aponta para uma versão que ninguém tem.
   */
  const outraVersao = bancada();
  await assert.rejects(
    () => startRadarYoutubeRun({ ...PEDIDO, articleDnaVersionId: "dna-9" }, outraVersao.ports),
    (erro: unknown) => {
      assert.ok(erro instanceof RadarStartError);
      assert.equal(erro.code, "radar_article_dna_mismatch");
      return true;
    },
  );
  assert.equal(outraVersao.estado?.analyses.length, 0);
  assert.equal(provider.chamadas, 0);
});

/* ================== §10.D · conflito de modo protegido ================== */

test("2.1 · §7 · artigo de Google ACEITA a SERP do YouTube — e o alvo NÃO muda", async () => {
  provider.chamadas = 0;
  const mesa = bancada();
  const contexto = await ensureRadarAnalysisContext({ brandId: "marca-1", articleId: "artigo-1", actorId: "usuario-1" }, mesa.ports);
  /*
   * O compromisso com WEB é montado à mão: o que a resolução de modo olha é o
   * campo estar PREENCHIDO, e construir um registro completo de investigação
   * do Google aqui só acrescentaria fixture sem acrescentar prova.
   */
  const comGoogle = {
    ...contexto.analysis,
    versionId: "analise-web",
    versionNumber: contexto.analysis.versionNumber + 1,
    previousVersionId: contexto.analysis.versionId,
    payload: {
      ...contexto.analysis.payload,
      /*
       * Um registro de investigação do Google MÍNIMO E VÁLIDO.
       *
       * A versão anterior deste teste usava `{ state: "COMPLETED" }`, que o
       * contrato recusa — e só não quebrava porque nada reparseava o payload.
       * Desde o 2.1 a coleta de apoio SUCEDE a análise, então ele passa pelo
       * schema de verdade.
       */
      deepResearch: {
        startedAt: "2026-09-14T09:00:00.000Z",
        startedBy: "usuario-1",
        primarySearchMode: "WEB",
        fingerprint: {
          articleDnaVersionId: "dna-1", articleDnaContentHash: null, keywordRefs: [],
          siloDnaVersionId: null, siloPageId: null, formationAssessmentId: null,
          formationBaseHash: null, internalLinkGraphVersionId: null, value: "fingerprint-google-1",
        },
        queries: [],
      },
    },
  } as unknown as RadarAnalysisVersion;
  mesa.estado = { lockVersion: 9, analyses: [contexto.analysis, comGoogle] };
  const versoesAntes = mesa.estado.analyses.length;

  /*
   * ============ ESTE COMPORTAMENTO MUDOU NO 2.1, DE PROPÓSITO ============
   *
   * Até o 1.4, esta coleta era recusada com 409. A regra "um alvo = uma SERP"
   * confundia duas perguntas: o que vamos PRODUZIR e de onde vem a LEITURA.
   *
   * Ela impedia o caso legítimo do §6 — usar a outra SERP como apoio. Agora a
   * coleta passa e o ALVO continua sendo o que era: nenhuma fonte converte o
   * destino editorial do artigo.
   */
  const inicio = await startRadarYoutubeRun(PEDIDO, mesa.ports);

  assert.equal(inicio.run.state, "COLLECTING", "a coleta de apoio acontece");
  assert.equal(inicio.currentMode, "WEB", "GOOGLE_SUPPORT_CHANGES_PRIMARY_TARGET = NO");
  assert.ok(mesa.estado.analyses.length > versoesAntes, "a corrida foi gravada");

  /*
   * E O ALVO GRAVADO CONTINUA SENDO WEB.
   *
   * Se a coleta o tivesse redeclarado, o artigo mudaria de produto editorial
   * por efeito colateral de uma pesquisa de apoio — que é exatamente o que o
   * §7 proíbe.
   */
  const corrente = mesa.corrente()!;
  assert.equal(corrente.payload.researchTarget, null, "a coleta de apoio não declara alvo");
  assert.equal(radarPrimaryModeOfAnalysis(corrente.payload), "WEB", "a inferência legada também continua WEB");
  assert.ok(corrente.payload.youtubeSearch, "e a investigação de YouTube existe, como fonte");
  assert.ok(corrente.payload.deepResearch, "sem apagar a do Google");
});

test("2.1 · §7 · o alvo é gravado pela PRIMEIRA coleta, e só por ela", async () => {
  const mesa = bancada();
  const inicio = await startRadarYoutubeRun(PEDIDO, mesa.ports);

  /* Artigo virgem: esta coleta declara o alvo explicitamente. */
  assert.equal(inicio.currentMode, null);
  const primeira = mesa.corrente()!;
  assert.equal(primeira.payload.researchTarget?.primaryTarget, "YOUTUBE");
  assert.ok(primeira.payload.researchTarget?.declaredAt);
  assert.ok((primeira.payload.researchTarget?.reason || "").length > 10, "o alvo diz por que foi declarado");

  /* A segunda coleta do mesmo artigo NÃO redeclara — ela só coleta. */
  const segunda = await startRadarYoutubeRun({ ...PEDIDO, runId: "run-2" }, mesa.ports);
  assert.equal(segunda.currentMode, "YOUTUBE");
  assert.equal(mesa.corrente()!.payload.researchTarget?.declaredAt, primeira.payload.researchTarget?.declaredAt, "o alvo original permanece");
  assert.equal(provider.chamadas, 0);
});

/* ============== §10.E e §10.F · concorrência ============== */

test("§10.E · CONCURRENT_BOOTSTRAP_SAFE — dois bootstraps produzem UMA cadeia", async () => {
  const mesa = bancada();

  /*
   * A SEGUNDA CHAMADA PERDE A TRAVA, RELÊ E REUSA.
   *
   * Criar o vaso duas vezes não é decisão humana nem gasto: é infraestrutura, e
   * retentar é o comportamento certo. Duas cadeias v1 com a mesma entidade
   * fariam "qual é a corrente" virar questão de sorte na ordenação.
   */
  const [primeiro, segundo] = await Promise.all([
    ensureRadarAnalysisContext({ brandId: "marca-1", articleId: "artigo-1", actorId: "usuario-1" }, mesa.ports),
    ensureRadarAnalysisContext({ brandId: "marca-1", articleId: "artigo-1", actorId: "usuario-2" }, mesa.ports),
  ]);

  assert.equal(mesa.estado?.analyses.length, 1, "uma cadeia só");
  assert.equal(primeiro.analysis.versionId, segundo.analysis.versionId, "os dois enxergam o MESMO contêiner");
  assert.equal(primeiro.analysis.versionNumber, 1);
  assert.equal(primeiro.analysis.entityId, segundo.analysis.entityId);
  assert.equal(radarPrimaryModeOfAnalysis(primeiro.analysis.payload), null);

  /* E um bootstrap sobre contêiner existente NÃO grava nada. */
  const trilhaAntes = mesa.trilha.length;
  const terceiro = await ensureRadarAnalysisContext({ brandId: "marca-1", articleId: "artigo-1", actorId: "usuario-3" }, mesa.ports);
  assert.equal(terceiro.created, false);
  assert.equal(mesa.trilha.slice(trilhaAntes).some(passo => passo.startsWith("appendAnalysis")), false, "reusar não escreve");
});

test("§10.F · CONCURRENT_START_SAFE — dois STARTs não viram duas coletas pagas", async () => {
  provider.chamadas = 0;
  const mesa = bancada();

  const resultados = await Promise.allSettled([
    startRadarYoutubeRun({ ...PEDIDO, runId: "run-A" }, mesa.ports),
    startRadarYoutubeRun({ ...PEDIDO, runId: "run-B", actorId: "usuario-2" }, mesa.ports),
  ]);

  const vencedores = resultados.filter(item => item.status === "fulfilled");
  const perdedores = resultados.filter(item => item.status === "rejected");

  /*
   * O COMPROMISSO NÃO É RETENTADO — e é aí que ele difere do bootstrap.
   *
   * Retentar aqui gravaria duas corridas equivalentes, e as DUAS cobrariam.
   * Quem perde a trava para antes de qualquer gasto.
   */
  assert.equal(vencedores.length, 1, "só uma corrida vinga");
  assert.equal(perdedores.length, 1);
  const recusa = (perdedores[0] as PromiseRejectedResult).reason;
  assert.ok(recusa instanceof RadarStartError);
  assert.equal(recusa.code, "radar_start_contended");
  assert.equal(recusa.status, 409);

  const corridas = (mesa.estado?.analyses || []).filter(versao => versao.payload.youtubeSearch);
  assert.equal(corridas.length, 1, "uma corrida gravada, não duas");
  assert.equal(provider.chamadas, 0, "e o perdedor não chegou a gastar");
});

/* ================ §10.G · falha do provider preserva a corrida ============ */

test("§10.G · PROVIDER_FAILURE_PRESERVES_RUN — mesma corrida vira COLLECTION_FAILED", async () => {
  const mesa = bancada();
  const inicio = await startRadarYoutubeRun(PEDIDO, mesa.ports);

  const motivo = "A DataForSEO não respondeu dentro do limite configurado.";
  const falhou = buildRadarYoutubeSearchRun({
    runId: inicio.run.runId, runVersion: inicio.run.runVersion,
    startedAt: inicio.run.startedAt, startedBy: inicio.run.startedBy,
    fingerprint: inicio.run.fingerprint,
    provenance: {
      provider: "dataforseo", endpoint: inicio.run.provenance.endpoint, blockDepth: 20,
      queriesRequested: 1, queriesSucceeded: 0, queriesFailed: 1,
      failures: [{ queryId: "ytq:1", reason: motivo }],
      collectedAt: "2026-09-14T10:00:20.000Z",
    },
    queries: inicio.run.queries.map(item => ({ ...item, executed: false, failureReason: motivo })),
    results: [], universe: [],
  });

  const fechada = await finishRadarYoutubeRun({
    brandId: "marca-1", articleId: "artigo-1", actorId: "usuario-1",
    runId: inicio.run.runId, run: falhou,
  }, mesa.ports);

  assert.equal(fechada.run.state, "COLLECTION_FAILED");
  assert.equal(fechada.run.runId, inicio.run.runId, "MESMO runId");
  assert.equal(fechada.run.runVersion, inicio.run.runVersion);
  assert.equal(fechada.run.provenance.failures[0].reason, motivo, "o erro fica preservado");
  assert.equal(radarPrimaryModeOfAnalysis(fechada.analysis.payload), "YOUTUBE", "o artigo continua de YouTube");

  /* E o retry é possível: mesmo modo nunca é conflito. */
  const retry = await startRadarYoutubeRun({ ...PEDIDO, runId: "run-2" }, mesa.ports);
  assert.equal(retry.currentMode, "YOUTUBE");
  assert.equal(retry.run.state, "COLLECTING");
  assert.equal(retry.run.runVersion, inicio.run.runVersion + 1, "a corrida nova SUCEDE a que falhou");
});

test("§1 · o resultado só é dado por gravado depois de RELIDO", async () => {
  const mesa = bancada();
  const inicio = await startRadarYoutubeRun(PEDIDO, mesa.ports);

  const concluida = buildRadarYoutubeSearchRun({
    runId: inicio.run.runId, runVersion: inicio.run.runVersion,
    startedAt: inicio.run.startedAt, startedBy: inicio.run.startedBy,
    fingerprint: inicio.run.fingerprint,
    provenance: {
      provider: "dataforseo", endpoint: inicio.run.provenance.endpoint, blockDepth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [],
      collectedAt: "2026-09-14T10:00:20.000Z",
    },
    queries: inicio.run.queries.map(item => ({ ...item, executed: true, resultCount: 0 })),
    results: [], universe: [],
  });

  /*
   * A ESCRITA VOLTOU SEM ERRO E A LEITURA NÃO A ENCONTROU.
   *
   * Sem esta conferência, a rota responderia "coleta concluída" para uma coleta
   * PAGA que não está no banco — e a pessoa recarregaria a tela para descobrir
   * que perdeu o dinheiro.
   */
  const portas: RadarStartPorts = {
    ...mesa.ports,
    loadRadarState: async (entrada) => {
      const estado = await mesa.ports.loadRadarState(entrada);
      /* Depois da gravação do resultado, devolve o estado ANTERIOR a ela. */
      if (estado && estado.analyses.length === 3) return { ...estado, analyses: estado.analyses.slice(0, 2) };
      return estado;
    },
  };

  await assert.rejects(
    () => finishRadarYoutubeRun({ brandId: "marca-1", articleId: "artigo-1", actorId: "usuario-1", runId: inicio.run.runId, run: concluida }, portas),
    (erro: unknown) => {
      assert.ok(erro instanceof RadarStartError);
      assert.equal(erro.code, "radar_result_readback_failed");
      assert.equal(erro.status, 503);
      return true;
    },
  );
});

test("§1 · fechar uma corrida com identidade trocada é bug, e para na porta", async () => {
  const mesa = bancada();
  const inicio = await startRadarYoutubeRun(PEDIDO, mesa.ports);

  /*
   * `runId` e `run.runId` discordarem só acontece por defeito de quem chama —
   * e é justamente aí que a guarda importa: gravar assim colocaria uma corrida
   * sob a identidade de outra, e o histórico passaria a mentir.
   */
  const outraCorrida = { ...inicio.run, runId: "run-de-outra-coleta" } as RadarYoutubeSearchRun;
  await assert.rejects(
    () => finishRadarYoutubeRun({ brandId: "marca-1", articleId: "artigo-1", actorId: "usuario-1", runId: inicio.run.runId, run: outraCorrida }, mesa.ports),
    (erro: unknown) => {
      assert.ok(erro instanceof RadarStartError);
      assert.equal(erro.code, "radar_run_identity_mismatch");
      return true;
    },
  );
  assert.equal(mesa.corrente()?.payload.youtubeSearch?.state, "COLLECTING", "nada foi gravado");
});

test("§1 · gravar resultado de uma corrida que outra substituiu é RECUSADO", async () => {
  const mesa = bancada();
  const inicio = await startRadarYoutubeRun(PEDIDO, mesa.ports);

  /* Outro START assumiu o artigo enquanto esta coleta executava. */
  await startRadarYoutubeRun({ ...PEDIDO, runId: "run-outro" }, mesa.ports);

  const tardia = { ...inicio.run, state: "COLLECTED" as const } as RadarYoutubeSearchRun;
  await assert.rejects(
    () => finishRadarYoutubeRun({ brandId: "marca-1", articleId: "artigo-1", actorId: "usuario-1", runId: inicio.run.runId, run: tardia }, mesa.ports),
    (erro: unknown) => {
      assert.ok(erro instanceof RadarStartError);
      assert.equal(erro.code, "radar_run_superseded");
      return true;
    },
  );

  /* O trabalho da corrida vencedora continua de pé. */
  assert.equal(mesa.corrente()?.payload.youtubeSearch?.runId, "run-outro");
});

/* ===================== §10.H · o ArticleDNA não muda ===================== */

test("§10.H · ARTICLE_DNA_MUTATED = NO — o START lê o fundamento e não o toca", async () => {
  const antes = JSON.stringify(ARTIGO);
  const mesa = bancada();
  await startRadarYoutubeRun(PEDIDO, mesa.ports);
  assert.equal(JSON.stringify(ARTIGO), antes, "o ArticleDNA saiu igual como entrou");

  /* E nenhuma versão gravada cria estado do Google. */
  for (const versao of mesa.estado?.analyses || []) {
    assert.equal(versao.payload.deepResearch, null, "GOOGLE_STATE_CREATED_BY_YOUTUBE = NO");
    assert.equal(versao.payload.serpSnapshotId, null);
    assert.deepEqual(versao.payload.serpDecisions, []);
  }
});

/* =============== §8 e §9 · o que este gate NÃO refatorou =============== */

test("§1 · a rota GRAVA a coleta e FECHA a corrida na falha — pelo servidor", async () => {
  const rota = await readFile(new URL("../app/api/editorial/radar-youtube-search/route.ts", import.meta.url), "utf8");
  const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  /*
   * PASSO 11 e 12 · O QUE A ROTA RESPONDE É O QUE ELA RELEU.
   *
   * Devolver a corrida que montamos, e não a que voltou do banco, faria a tela
   * mostrar um resultado que pode não ter sido gravado — o mesmo buraco do
   * cliente-autoridade, só que um andar acima.
   */
  assert.ok(/const gravada = await finishRadarYoutubeRun\(\{/.test(codigo), "a rota grava a coleta e espera");
  assert.ok(codigo.includes("run: gravada.run"), "e responde com a corrida RELIDA");
  assert.ok(codigo.includes("analysisVersionId: gravada.analysis.versionId"));
  assert.equal(codigo.includes("run: corridaFinal,\n      discardedItems"), false, "nunca a corrida local");

  /*
   * §7 · DEPOIS DO START, A CORRIDA SEMPRE FECHA.
   *
   * Cota recusada ou credencial ausente acontecem DEPOIS do compromisso: sem o
   * fechamento, a corrida ficaria em "Coletando…" para sempre e o artigo
   * ficaria de YouTube sem nada para retomar.
   */
  assert.ok(/await fecharCorridaComoFalha\(\{ input, profile, inicio, erro \}\)/.test(codigo), "a rota fecha a corrida quando algo falha depois do START");
  const fechamento = codigo.slice(codigo.indexOf("async function fecharCorridaComoFalha"));
  assert.ok(fechamento.includes("runId: inicio.run.runId"), "com o MESMO runId");
  assert.ok(fechamento.includes("queriesSucceeded: 0"), "e a falha declarada");
  assert.ok(fechamento.includes("await finishRadarYoutubeRun("), "pelo mesmo caminho de gravação");
});

test("§8 · o pipeline do Google não foi alterado além da guarda de modo", async () => {
  const serp = await readFile(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");

  /*
   * O 1.4 deu ao YouTube um orquestrador próprio. O Google NÃO foi migrado
   * para ele: refatorar o caminho já homologado para reusar código novo é
   * exatamente o refactor amplo que o §8 proíbe.
   */
  assert.equal(/startRadarYoutubeRun|ensureRadarAnalysisContext|finishRadarYoutubeRun/.test(serp), false, "o Google não passou a depender do orquestrador novo");
  assert.ok(serp.includes("resolveRadarResearchSource("), "e continua com a autoridade de fonte, agora a do 2.1");
});

test("§9 · o orquestrador nasce reutilizável — e Amazon não foi implementada", async () => {
  const orquestrador = await readFile(new URL("../lib/server/radar-youtube-start.ts", import.meta.url), "utf8");

  /*
   * As portas não sabem de YouTube: ler artigo, ler estado e gravar valem para
   * os três modos. O que é específico é `startRadarYoutubeRun`, e é só ele que
   * um START de Amazon precisaria espelhar.
   */
  const portas = orquestrador.slice(orquestrador.indexOf("export type RadarStartPorts"), orquestrador.indexOf("export class RadarStartError"));
  assert.equal(/youtube/i.test(portas), false, "as portas são neutras de modo");
  assert.ok(orquestrador.includes("export async function ensureRadarAnalysisContext"), "e o bootstrap é compartilhável");

  /* E nada de coleta Amazon neste gate. */
  assert.equal(/amazon/i.test(orquestrador), false, "Amazon não foi implementada aqui");
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
