import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RadarPlannerSendError,
  sendRadarToPlanner,
  type RadarPlannerHandoffPorts,
} from "../lib/server/radar-planner-send.ts";
import { RADAR_PLANNER_MAY_NOT } from "../lib/radar/planner-handoff.ts";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint } from "../lib/radar/amazon-search-run.ts";
import { amazonCompetitiveBlueprintOfAnalysis } from "../lib/radar/amazon-editorial.ts";
import { freezeRadarAmazonInvestigation } from "../lib/radar/amazon-evidence.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarYoutubeSearchRunSchema, type RadarYoutubeSearchRun } from "../lib/radar/youtube-search-run.ts";
import { buildRadarYoutubeBlueprint } from "../lib/radar/youtube-blueprint.ts";

/*
 * ===== RADAR_FINAL_1.1 · A AUTORIDADE ÚNICA DO HANDOFF =====
 *
 * Toda a suíte roda contra PORTAS, e é isso que torna as falhas parciais
 * testáveis: "gravou o dossiê e a transição falhou" é o caso que este gate
 * existe para fechar, e ele não acontece sozinho contra um banco real.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const payloadAmazon = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"),
);

const fonteDoEnvio = await readFile(new URL("../lib/server/radar-planner-send.ts", import.meta.url), "utf8");
const fonteDaRota = await readFile(new URL("../app/api/editorial/radar-planner-handoff/route.ts", import.meta.url), "utf8");
const fonteDaPagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const fonteDoEnvelope = await readFile(new URL("../lib/radar/planner-handoff.ts", import.meta.url), "utf8");

/* ============================ as investigações ============================ */

const corridaAmazon = () => {
  const normalizada = normalizeDataForSeoAmazonResponse(payloadAmazon, "amzq:1");
  return buildRadarAmazonSearchRun({
    runId: "run-amz-1", runVersion: 1,
    startedAt: "2026-09-15T12:00:00.000Z", startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-v3", queryIds: ["amzq:1"] }),
    provenance: {
      provider: "dataforseo", endpoint: "/v3/merchant/amazon/products/live/advanced",
      collectedAt: "2026-09-15T12:00:05.000Z", languageCode: "pt_BR", depth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0,
    },
    queries: [{ queryId: "amzq:1", text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true }],
    results: normalizada.results,
    universe: buildRadarAmazonUniverse(normalizada.results),
    relatedSearches: normalizada.relatedSearches,
  });
};

const congeladaAmazon = () => freezeRadarAmazonInvestigation({
  run: corridaAmazon(),
  blueprint: amazonCompetitiveBlueprintOfAnalysis({
    articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
    run: corridaAmazon(), support: null,
    primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
    researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null,
  }),
  finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
});

/**
 * A CORRIDA DE YOUTUBE MÍNIMA — com universo vazio, de propósito.
 *
 * Este gate exercita a FRONTEIRA, não a leitura de vídeo. O que precisa ser
 * real é o BLUEPRINT: ele é montado pelo builder de verdade, e é ele que a
 * autoridade de leitura vai reconstruir no caminho do handoff.
 */
const corridaYoutube = (): RadarYoutubeSearchRun => RadarYoutubeSearchRunSchema.parse({
  researchMode: "YOUTUBE", runId: "run-yt-1", runVersion: 1,
  startedAt: "2026-09-14T09:00:00.000Z", startedBy: "user-1", state: "COLLECTED",
  fingerprint: {
    articleId: "artigo-1", articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
    queryIds: ["ytq:1"], signature: "assinatura-yt",
  },
  provenance: {
    provider: "dataforseo", endpoint: "/v3/serp/youtube/organic/live/advanced",
    queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0,
    collectedAt: "2026-09-14T09:00:00.000Z",
  },
  queries: [], results: [], universe: [],
  limitations: ["O gancho interno dos vídeos não foi observado: a SERP mostra título, não conteúdo."],
});

const congeladaYoutube = () => ({
  frozenVersion: 1, finalizedAt: "2026-09-14T10:00:00.000Z", finalizedBy: "user-1",
  runRef: {
    runId: "run-yt-1", runVersion: 1, runFingerprint: "assinatura-yt",
    collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo",
    endpoint: "/v3/serp/youtube/organic/live/advanced",
    queriesExecuted: 3, universeSize: 38, selectedVideoIds: [],
  },
  run: null,
  blueprint: buildRadarYoutubeBlueprint({
    run: corridaYoutube(), declaredIntent: "informacional",
    editorialTopics: [], generatedAt: "2026-09-14T10:00:00.000Z",
  }),
  multimodal: null,
  limitations: ["O gancho interno dos vídeos não foi observado: a SERP mostra título, não conteúdo."],
});

/* ============================== o mundo falso ============================== */

/**
 * O MUNDO MÍNIMO EM QUE O HANDOFF ACONTECE.
 *
 * Uma análise, um item de Radar aprovado e um destino que começa ausente. Cada
 * porta registra o que foi chamada para que a ORDEM dos passos seja verificável
 * — é a ordem, e não a existência das chamadas, que este gate protege.
 */
function mundo(opcoes: {
  investigacao?: "AMAZON" | "YOUTUBE" | "GOOGLE";
  plannerBundle?: unknown;
  destinoExiste?: boolean;
  radarState?: string;
  falhar?: "APPEND" | "READBACK" | "IMPORT" | "TRANSITION" | "DESTINATION";
  /** §14 · o fundamento muda entre a montagem e a transição. */
  dnaMudaNaSegundaLeitura?: boolean;
} = {}) {
  const investigacao = opcoes.investigacao || "AMAZON";
  const pesquisa = investigacao === "AMAZON"
    ? { amazonSearch: corridaAmazon(), amazonFrozenInvestigation: congeladaAmazon() }
    : investigacao === "YOUTUBE"
      ? { youtubeFrozenInvestigation: congeladaYoutube() }
      : { finalizedBundle: null };

  const payloadBase = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v3",
    serpSnapshotId: null, serpSnapshotVersion: null, serpSnapshotHash: null,
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: null, amazonBlueprint: null,
    amazonFrozenInvestigation: null, youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: opcoes.plannerBundle ?? null,
    /* A fixtura é a AUTORIDADE: é sobre ela que as escrituras do handoff acontecem. */
    researchTransport: "FULL",
    mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "approved", humanNotes: [], approvedAt: null, approvedBy: null,
  });

  /*
   * ============ A INVESTIGAÇÃO É ANEXADA DEPOIS DO PARSE ============
   *
   * A base passa pelo contrato — é ela que prova que a fixtura é uma análise
   * legítima. A fotografia do YouTube fica de fora porque o schema dela exige
   * um `blueprint` completo, e este gate não exercita blueprint de vídeo: ele
   * exercita a FRONTEIRA.
   *
   * E o resolvedor do dossiê lê a fotografia estruturalmente, não pelo schema
   * — é assim que ele mantém legível a fotografia antiga que não tem camada
   * multiformato.
   */
  const payload = { ...payloadBase, ...pesquisa } as typeof payloadBase;

  const analises = [{
    versionId: "analysis-1", entityId: "radar-analysis:artigo-1", versionNumber: 1,
    previousVersionId: null, contentHash: "sha256:analysis", origin: "human" as const,
    changeReason: "fixture", createdAt: "2026-09-15T12:00:00.000Z", createdBy: "user-1",
    payload,
  }];

  const itemRadar = {
    id: "wf-radar-1", marca_id: "marca-1", article_id: "artigo-1", stage: "radar",
    state: opcoes.radarState || "approved", lock_version: 1,
    /*
     * O PAYLOAD DO ITEM É O QUE `RadarItemSchema` EXIGE.
     *
     * Silo é obrigatório no Radar: o handoff é posterior a Silos e Links
     * Internos, e um item sem ele descreveria um artigo estruturalmente
     * incompleto entrando no Planejador.
     */
    payload: {
      title: "Artigo", slug: "artigo", siloId: "silo-1", hierarchy: "pilar",
      principalKeywordId: "kw-1", format: "artigo", intent: "comercial", unitType: "article",
      articleDnaVersionId: "dna-v3", articleDnaContentHash: "sha256:abc",
    },
    source_version_id: "dna-v3", source_content_hash: "sha256:abc",
    created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z",
  };

  const destino = opcoes.destinoExiste
    ? { ...itemRadar, id: "wf-planner-1", stage: "planner", state: "draft" }
    : null;

  const chamadas: string[] = [];
  let leiturasDoDna = 0;
  let destinoAtual = destino;

  const portas: RadarPlannerHandoffPorts = {
    /*
     * PARITY_1 · §2 · As autoridades entram por porta, como todas as outras.
     *
     * Esta bancada exercita a ORDEM dos passos e a falha parcial; ela não tem
     * banco atrás. Ausência de camada é resposta legítima (§14), e é o que a
     * porta devolve aqui.
     */
    loadCanonicalAuthorities: async () => {
      chamadas.push("loadCanonicalAuthorities");
      return { google: null, video: null, specialist: null, researchContext: null };
    },
    loadRadarState: async () => {
      chamadas.push("loadRadarState");
      if (opcoes.falhar === "READBACK" && chamadas.filter(item => item === "loadRadarState").length > 1) {
        /* O readback devolve a análise SEM o dossiê: a gravação não pegou. */
        return { lockVersion: 1, analyses: [analises[0]] } as never;
      }
      return { lockVersion: 1, analyses: [...analises] } as never;
    },
    appendAnalysis: async ({ analysis }) => {
      chamadas.push("appendAnalysis");
      if (opcoes.falhar === "APPEND") throw new Error("ESCRITA_DO_DOSSIE_FALHOU");
      analises.push(analysis as never);
      return undefined as never;
    },
    loadArticleFoundation: async () => {
      leiturasDoDna += 1;
      chamadas.push("loadArticleFoundation");
      const mudou = opcoes.dnaMudaNaSegundaLeitura && leiturasDoDna > 1;
      return {
        brandId: "marca-1", articleId: "artigo-1",
        articleDnaVersionId: mudou ? "dna-v4" : "dna-v3",
        articleDnaContentHash: mudou ? "sha256:mudou" : "sha256:abc",
      };
    },
    findWorkflowItem: async ({ stage }) => {
      chamadas.push(`findWorkflowItem:${stage}`);
      if (stage === "radar") return itemRadar as never;
      if (opcoes.falhar === "DESTINATION") return null;
      return destinoAtual as never;
    },
    importPlannerItem: async () => {
      chamadas.push("importPlannerItem");
      if (opcoes.falhar === "IMPORT") throw new Error("IMPORTACAO_FALHOU");
      destinoAtual = { ...itemRadar, id: "wf-planner-1", stage: "planner", state: "draft" };
      return { id: "wf-planner-1" };
    },
    transitionRadar: async () => {
      chamadas.push("transitionRadar");
      if (opcoes.falhar === "TRANSITION") throw new Error("TRANSICAO_FALHOU");
    },
    appendDecision: async () => { chamadas.push("appendDecision"); },
  };

  return { portas, chamadas, analises };
}

const enviar = (m: ReturnType<typeof mundo>) => sendRadarToPlanner(
  { brandId: "marca-1", articleId: "artigo-1", actorId: "user-1", sentAt: "2026-09-15T16:00:00.000Z" },
  m.portas,
);

/* ================================ A ================================ */

test("A · gravar, reler, transicionar e reler o destino — nesta ordem", async () => {
  const m = mundo();
  const resultado = await enviar(m);

  assert.equal(resultado.change, "CREATED");
  assert.equal(resultado.plannerItemId, "wf-planner-1");
  assert.match(resultado.headline, /enviado ao Planejador/i);

  /*
   * ============ §4 · A ORDEM É A GARANTIA ============
   *
   * A esteira só se move sobre evidência que o servidor confirmou ter gravado.
   * Invertê-la moveria o artigo apostando numa escrita que pode não ter
   * acontecido.
   */
  const escrita = m.chamadas.indexOf("appendAnalysis");
  const releituraDoDossie = m.chamadas.indexOf("loadRadarState", escrita);
  const importacao = m.chamadas.indexOf("importPlannerItem");
  const releituraDoDestino = m.chamadas.lastIndexOf("findWorkflowItem:planner");

  assert.ok(escrita >= 0 && releituraDoDossie > escrita, "o readback do dossiê vem depois da escrita");
  assert.ok(importacao > releituraDoDossie, "a transição vem depois do readback do dossiê");
  assert.ok(releituraDoDestino > importacao, "o readback do destino vem por último");

  /* §8 · as invariantes chegam ao Planejador junto da evidência. */
  assert.deepEqual(resultado.record.plannerMayNot, [...RADAR_PLANNER_MAY_NOT]);
  assert.ok(resultado.record.plannerMayNot.length > 0);
});

/* ================================ B ================================ */

test("B · dossiê já gravado com destino ausente completa sem duplicar", async () => {
  const primeiro = mundo();
  const inicial = await enviar(primeiro);

  /*
   * O ESTADO QUE UMA TRANSIÇÃO FALHA DEIXA: dossiê válido, esteira parada.
   *
   * Regravar aqui criaria uma versão de análise por tentativa. O que falta é só
   * completar a esteira.
   */
  const retomada = mundo({ plannerBundle: inicial.record, destinoExiste: false });
  const resultado = await enviar(retomada);

  assert.equal(resultado.change, "TRANSITION_COMPLETED");
  assert.equal(resultado.record.handoffVersion, 1, "a versão não anda numa retomada");
  assert.equal(resultado.record.bundleHash, inicial.record.bundleHash);
  assert.equal(retomada.chamadas.includes("appendAnalysis"), false, "nada é regravado");
  assert.ok(retomada.chamadas.includes("importPlannerItem"), "e a transição acontece");
  assert.match(resultado.headline, /dossiê já estava gravado/);
});

/* ================================ C ================================ */

test("C · dossiê e destino existentes é sucesso idempotente, sem escrita nenhuma", async () => {
  const primeiro = mundo();
  const inicial = await enviar(primeiro);

  const repetido = mundo({ plannerBundle: inicial.record, destinoExiste: true });
  const resultado = await enviar(repetido);

  assert.equal(resultado.change, "ALREADY_IMPORTED");
  assert.equal(resultado.headline, "Pacote já estava disponível no Planejador.");
  assert.equal(repetido.chamadas.includes("appendAnalysis"), false);
  assert.equal(repetido.chamadas.includes("importPlannerItem"), false);
  assert.equal(repetido.chamadas.includes("transitionRadar"), false);
});

test("C · destino sem dossiê é inconsistência declarada, nunca sucesso", async () => {
  /*
   * ============ §5 · O TERCEIRO QUADRANTE DA MATRIZ ============
   *
   * Workflow no Planejador sem dossiê gravado significa que a esteira foi
   * movida por fora desta autoridade — pela operação em lote da planilha, por
   * exemplo. Responder sucesso aqui esconderia um artigo que o Planejador tem
   * em mãos sem evidência nenhuma atrás dele.
   */
  const m = mundo({ plannerBundle: null, destinoExiste: true });

  await assert.rejects(
    () => enviar(m),
    (erro: unknown) => (erro as RadarPlannerSendError).code === "radar_handoff_inconsistent",
  );

  /* E nada é escrito sobre um estado que ninguém entende. */
  assert.equal(m.chamadas.includes("appendAnalysis"), false);
  assert.equal(m.chamadas.includes("importPlannerItem"), false);
});

/* ================================ D ================================ */

test("D · falha ao gravar o dossiê não executa transição nenhuma", async () => {
  const m = mundo({ falhar: "APPEND" });
  await assert.rejects(() => enviar(m), /ESCRITA_DO_DOSSIE_FALHOU/);

  assert.equal(m.chamadas.includes("importPlannerItem"), false);
  assert.equal(m.chamadas.includes("transitionRadar"), false);
});

/* ================================ E ================================ */

test("E · readback do dossiê que não confirma impede a transição", async () => {
  const m = mundo({ falhar: "READBACK" });
  await assert.rejects(
    () => enviar(m),
    (erro: unknown) => (erro as RadarPlannerSendError).code === "radar_handoff_readback_failed",
  );

  /*
   * A ESTEIRA NÃO SE MOVE SOBRE UMA ESCRITA NÃO CONFIRMADA.
   *
   * "O append não lançou" não é o mesmo que "o banco tem": é a diferença entre
   * acreditar na própria chamada e conferir o resultado dela.
   */
  assert.equal(m.chamadas.includes("importPlannerItem"), false);
  assert.equal(m.chamadas.includes("transitionRadar"), false);
});

/* ================================ F ================================ */

test("F · transição que falha não vira sucesso, e o dossiê continua válido", async () => {
  const m = mundo({ falhar: "TRANSITION" });
  await assert.rejects(() => enviar(m), /TRANSICAO_FALHOU/);

  /* O dossiê foi gravado — e é justamente isso que a retomada de B aproveita. */
  const gravado = m.analises.at(-1)?.payload.plannerBundle;
  assert.ok(gravado, "o dossiê permanece gravado");

  const retomada = mundo({ plannerBundle: gravado, destinoExiste: false });
  const resultado = await enviar(retomada);
  assert.equal(resultado.change, "TRANSITION_COMPLETED");
  assert.equal(retomada.chamadas.includes("appendAnalysis"), false, "a retomada não duplica o dossiê");
});

/* ================================ G ================================ */

test("G · destino que não confirma não declara sucesso", async () => {
  const m = mundo({ falhar: "DESTINATION" });
  await assert.rejects(
    () => enviar(m),
    (erro: unknown) => (erro as RadarPlannerSendError).code === "radar_handoff_destination_readback_failed",
  );

  /*
   * A MENSAGEM PRECISA DIZER O QUE FAZER.
   *
   * "Falhou" sozinho faria a pessoa recomeçar do zero; o dossiê está gravado e
   * a repetição completa só o que falta.
   */
  await assert.rejects(() => enviar(mundo({ falhar: "DESTINATION" })), /repita o envio para completar/);
});

/* ================================ H ================================ */

test("H · ArticleDNA que muda no meio do handoff bloqueia a transição", async () => {
  const m = mundo({ dnaMudaNaSegundaLeitura: true });

  await assert.rejects(
    () => enviar(m),
    (erro: unknown) => (erro as RadarPlannerSendError).code === "radar_handoff_blocked_stale",
  );

  /*
   * §14 · SÃO DUAS IDAS AO BANCO COM UMA ESCRITA NO MEIO.
   *
   * Mover um pacote stale faria o Planejador receber evidência de uma
   * investigação para um artigo que já é outro.
   */
  assert.equal(m.chamadas.includes("importPlannerItem"), false);
  assert.equal(m.chamadas.includes("transitionRadar"), false);
});

/* ============================== I, J e K ============================== */

test("I, J e K · os três perfis atravessam a mesma fronteira", async () => {
  const amazon = await enviar(mundo({ investigacao: "AMAZON" }));
  assert.equal(amazon.record.primaryResearchProfile, "AMAZON");
  /* §15 · as limitações de review e PDP continuam no pacote entregue. */
  const dossieAmazon = amazon.record.bundle as { limitations: string[] };
  assert.ok(dossieAmazon.limitations.includes("Esta investigação não analisou textos de avaliações."));
  assert.ok(dossieAmazon.limitations.includes("Esta investigação não abriu páginas individuais dos produtos."));

  const youtube = await enviar(mundo({ investigacao: "YOUTUBE" }));
  assert.equal(youtube.record.primaryResearchProfile, "YOUTUBE");
  /* §15 · e nenhum snapshot primário do Google foi exigido para isso. */
  const dossieYoutube = youtube.record.bundle as { research: { google: { role: string } | null } };
  assert.equal(dossieYoutube.research.google, null);

  /* Sem investigação finalizada, a fronteira recusa antes de qualquer escrita. */
  const semPesquisa = mundo({ investigacao: "GOOGLE" });
  await assert.rejects(
    () => enviar(semPesquisa),
    (erro: unknown) => (erro as RadarPlannerSendError).code === "radar_research_not_finalized",
  );
  assert.equal(semPesquisa.chamadas.includes("appendAnalysis"), false);
});

/* ============================== L e M ============================== */

test("L e M · o estado entregue vive no servidor, não no navegador", () => {
  const pagina = semComentarios(fonteDaPagina);

  /*
   * §12 · DUAS PROVAS REMOTAS, E AS DUAS PRECISAM BATER.
   *
   * `plannerBundle` é a análise gravada; `sent_planner` é o item na esteira. O
   * dossiê sozinho não prova importação — foi exatamente esse o estado que a
   * transição falha deixava.
   */
  assert.match(pagina, /const noPlanejador = row \? row\.state === "sent_planner" : false;/);
  assert.match(pagina, /sent: Boolean\(entregue\) && noPlanejador,/);

  const fatia = pagina.slice(pagina.indexOf("const fronteiraDoPlanejador"), pagina.indexOf("const enviarAoPlanejador"));
  assert.equal(/localStorage|sessionStorage/.test(fatia), false);

  /* §4 · o estado intermediário é dito, não escondido. */
  assert.match(fatia, /a transferência ao Planejador não foi concluída/);
});

/* ================================ N ================================ */

test("N · a UI chama UMA autoridade, e não a esteira por fora", () => {
  const pagina = semComentarios(fonteDaPagina);

  /*
   * §2 e §3 · UMA AÇÃO, UM SERVIÇO.
   *
   * O RADAR_FINAL_1.2 levou a URL para um módulo compartilhado: a tela chama
   * `postRadarPlannerHandoff` e não conhece mais o endereço da fronteira. A
   * garantia ficou mais forte — não existe onde escrever um segundo caminho.
   */
  const fatia = pagina.slice(pagina.indexOf("const enviarAoPlanejador"), pagina.indexOf("const startYoutubeSearch"));
  assert.match(fatia, /postRadarPlannerHandoff\(\{/);
  assert.equal(/importApprovedToPlanner/.test(fatia), false, "o envio não duplica a esteira por fora");
  assert.equal(/"\/api\/editorial\//.test(fatia), false, "a tela não conhece o endereço: quem o conhece é a porta única");

  /* E a rota tem uma porta só para dentro. */
  const rota = semComentarios(fonteDaRota);
  assert.equal((rota.match(/sendRadarToPlanner\(/g) || []).length, 1);
  assert.equal(/importRadarToPlanner|WorkflowRepository/.test(rota), false, "a rota não conhece a esteira: quem a move é o serviço");
});

/* ======================= §6 · a decisão canônica ======================= */

test("§6 · o envelope V3 está depreciado, e o que valia nele foi conectado", () => {
  const envelope = fonteDoEnvelope;

  /*
   * A DECISÃO: `RadarEvidenceBundleV3 + identidade do ArticleDNA` é o contrato
   * runtime. O envelope exigia o congelado do Google e carregava dossiê E
   * congelado — reintroduziria a exigência que o 1.1 removeu e duplicaria os
   * bytes.
   */
  assert.match(envelope, /@deprecated Use `RadarEvidenceBundle` \(V3\)/);
  assert.match(envelope, /@deprecated §6 · Use `sendRadarToPlanner`/);

  /* E `plannerMayNot` deixou de ser governança declarada e nunca entregue. */
  const envio = semComentarios(fonteDoEnvio);
  assert.match(envio, /plannerMayNot: \[\.\.\.RADAR_PLANNER_MAY_NOT\]/);

  /* Nenhuma chamada runtime monta o envelope. */
  for (const fonte of [semComentarios(fonteDoEnvio), semComentarios(fonteDaRota), semComentarios(fonteDaPagina)]) {
    assert.equal(/buildRadarPlannerEvidenceHandoff/.test(fonte), false);
  }
});

/* ======================= §17 · o tamanho do handoff ======================= */

test("§17 · o envelope não multiplica o dossiê", async () => {
  const resultado = await enviar(mundo());

  /*
   * O REGISTRO É O DOSSIÊ MAIS METADADOS — não o dossiê duas vezes.
   *
   * Era assim que o envelope antigo crescia: ele carregava `frozen` e
   * `dossier`, as duas camadas descrevendo a mesma rodada.
   */
  assert.ok(
    resultado.handoffBytes < resultado.bundleBytes * 1.2,
    `o handoff (${resultado.handoffBytes}) inflou sobre o dossiê (${resultado.bundleBytes})`,
  );
  assert.ok(resultado.bundleBytes > 0);
});

test("sentinela · PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
