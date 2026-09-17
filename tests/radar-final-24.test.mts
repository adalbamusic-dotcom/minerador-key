import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { comProductShell, montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { RadarR3Workbench } from "../modules/radar/radar-r3-workbench.tsx";
import { SupabaseSessionProvider } from "../components/auth/supabase-session-context.tsx";
import { GlobalNoticeProvider } from "../components/global-notice-center.tsx";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import {
  compactRadarResearchForRead,
  radarResearchProvenanceOfAnalysis,
  radarResearchProvenanceSummary,
  radarResearchSampleOfAnalysis,
  radarResearchSampleSummary,
} from "../lib/radar/research-read-model.ts";
import { radarGoogleResearchWriteLock } from "../lib/radar/google-research-write-lock.ts";
import { buildRadarResetPayload } from "../lib/radar/radar-reset.ts";
import { RadarCompactBaseError, createRadarAnalysisSuccessor } from "../lib/radar/analysis-contracts.ts";
import type { RadarAnalysisPayload } from "../lib/radar/analysis-contracts.ts";
import { loadRadarResearchProvenance, loadRadarResearchSample } from "../lib/radar/research-part-client.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarR3Model } from "../lib/radar/r3-workbench.ts";

/*
 * ====== RADAR_FINAL_2.4 · A ÁREA GOOGLE LIGADA ÀS AUTORIDADES LAZY ======
 *
 * O backend deste assunto fechou no 2.3: trava de escrita, DTO compacto,
 * amostra por `finalizedBundle.sample.extractionIds`, integridade declarada.
 * O que faltava era a tela — e a tela é onde "lazy" deixa de ser promessa.
 *
 * A ESTRATÉGIA: PROVAR NO DOM, NÃO NA STRING.
 *
 * Um `onToggle` ligado ao handler errado renderiza igual e passa em qualquer
 * varredura de markup. Por isso a maior parte deste arquivo monta a bancada de
 * verdade e clica — é a única forma de "fechado não busca" significar algo.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* =============================== a fixture ============================== */

const link = (): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org", kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link()], error: null,
});

/*
 * §3 · DEZOITO CORRENTES, OITO CONGELADAS.
 *
 * A fixture é deliberadamente assimétrica: com 8 e 8 um mutante que devolvesse
 * as correntes passaria em tudo.
 */
const PAGINAS = Array.from({ length: 18 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  return pagina(`A${index}`, headings);
});
/*
 * A FOTOGRAFIA APONTA PARA URLs, e não para `page.id`.
 *
 * `freezeRadarEvidenceBundle` grava `observed.competitors[].url`. Uma fixture
 * que congelasse `page.id` provaria o contrário do runtime — e foi exatamente
 * por isso que este gate encontrou o defeito que o 2.3 deixou passar.
 */
const IDS_CONGELADOS = PAGINAS.slice(0, 8).map(item => item.url);

const ARTIGO = { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v17", articleDnaContentHash: "hash-dna-v17" };

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { ...ARTIGO, promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v17", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["skincare para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) };

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

/*
 * A FOTOGRAFIA MÍNIMA QUE A TELA PRECISA — e ela congela 8, não 18.
 *
 * Não é o bundle inteiro de propósito: o que a área lê dele são o instante, a
 * amostra, os links e a autoridade. Um bundle completo aqui esconderia qual
 * parte a tela realmente consulta.
 */
/**
 * A VISTA COM CURADORIA — sem ela a investigação não tem amostra.
 *
 * As referências entram no universo pela pesquisa e só viram amostra depois de
 * uma decisão. Montar a vista sem esse passo produz uma investigação que o
 * congelamento recusa com "Investigação sem amostra", e o teste mediria o
 * vazio.
 */
function vistaCurada(patch: Record<string, unknown> = {}) {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never,
    extractions: PAGINAS, observedAt: "2026-09-11T12:00:00.000Z",
    ...patch,
  } as Parameters<typeof buildRadarDeepResearchView>[0];

  const universo = buildRadarDeepResearchView(base);
  const curadoria = {
    universeFingerprint: radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
    references: universo.references.map(reference => ({
      referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
      decision: autoDecideRadarReference(reference).decision, reason: "",
    })),
  };
  const recordBase = base.record as ReturnType<typeof registro>;
  return buildRadarDeepResearchView({
    ...base,
    record: { ...recordBase, researchCuration: curadoria },
    selectedReferences: curadoria.references.filter(item => item.decision !== "excluded" && item.decision !== "pending").length,
  } as Parameters<typeof buildRadarDeepResearchView>[0]);
}

const fotografia = () => {
  const viva = vistaCurada();

  const resultado = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: viva.observed.sample.analyzedSuccess,
      failed: viva.observed.sample.failedFinal, sufficiency: viva.sufficiency,
    }),
    observed: viva.observed, record: registro(), mode: "WEB", sufficiency: viva.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-11T08:00:00.000Z",
  });
  if (!resultado.ok) throw new Error(`a fixture não congelou: ${resultado.reason}`);

  /*
   * A fotografia deste caso cobre 8 das 18 — é a assimetria que o §3 exige, e
   * ela vem do congelamento REAL, com as chaves que o runtime grava.
   */
  return {
    ...resultado.bundle,
    bundleId: "bundle:2f9c1a77",
    bundleHash: "bundle-hash:2f9c1a77",
    foundationFingerprint: "fundamento:v17",
    sample: { ...resultado.bundle.sample, comparablePages: 8, analyzedSuccess: 8, extractionIds: IDS_CONGELADOS },
    limitations: ["Duas consultas auxiliares não retornaram resultado."],
  };
};

const vista = (patch: Record<string, unknown> = {}) => vistaCurada({ finalizedBundle: fotografia() as never, ...patch });

const modelo = (deepResearch: ReturnType<typeof vista>): RadarR3Model => ({
  brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, articleDnaVersionId: ARTIGO.articleDnaVersionId,
  title: "Cobrir com clareza o tema skincare para pele oleosa",
  keyword: "skincare para pele oleosa", silo: "skincare", hierarchy: "Suporte",
  articleDnaVersion: "v1", publication: "Ainda não publicado", mode: "competitive_full", article: null,
  researchContext: contexto(), deepResearch,
  serp: { provider: "dataforseo", status: "Coletada", resultCount: 18, primaryCount: 1, pendingCount: 0, needs: 0, latestCollection: "Nenhuma coleta", records: [], references: [], view: null, analysis: null, latestSnapshotId: null, reviewStatus: null, reviewNotes: null, reviewCurrentness: "current", reviewedAt: null, reviewHistory: [], capturedAt: null },
  amazon: { state: "AMAZON_NOT_APPLICABLE", note: "" },
  content: { articleDnaVersion: "v1", principal: "skincare para pele oleosa", needs: 0, evidenceCount: 0, sourceCount: 0, rows: [], technical: { brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, articleDnaVersionId: ARTIGO.articleDnaVersionId, siloId: null, snapshotId: null, provider: null, articleDnaEntityId: null, articleDnaHash: null } },
  specialist: { expert: "Não selecionado", specialty: "", status: "Não iniciado", channel: "Telegram não consumido nesta visão", requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0, pending: 0, existingContent: "Nenhum material" },
  report: { status: "Aguardando", version: null, needs: 0, summary: "", approved: false, sentToPlanner: false, updatedAt: null },
  nextAction: "", lastActivity: null,
  provenance: { brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, articleDnaVersionId: ARTIGO.articleDnaVersionId, siloId: null, snapshotId: null, provider: null },
} as unknown as RadarR3Model);

/**
 * AS DUAS FORMAS DO MESMO PAYLOAD — e é a diferença entre elas que este gate vive.
 *
 * `payloadCompleto` é a AUTORIDADE gravada, que a rota da parte lê do
 * repositório: ela tem as 18 extrações. `payloadCongelado` é a cópia de
 * LEITURA que o DTO inicial entrega — compactada, sem extração nenhuma.
 *
 * Confundir as duas foi o que fez a primeira versão destes testes medir zero:
 * resolver a amostra sobre o compacto é resolver sobre uma lista vazia.
 */
const payloadCompleto = () => ({
  extractions: PAGINAS,
  extractionIds: PAGINAS.map(item => item.id),
  serpSnapshotId: "snap-google-1",
  serpSnapshotVersion: 3,
  deepResearch: { startedAt: "2026-09-10T09:00:00.000Z", finalizedAt: "2026-09-11T08:00:00.000Z", fingerprint: { value: "fundamento:v17" } },
  finalizedBundle: fotografia(),
  researchTransport: "FULL",
} as unknown as Record<string, unknown>);

const payloadCongelado = () => compactRadarResearchForRead(payloadCompleto());

type Chamadas = { sample: number; provenance: number; send: number };

async function montarArea(opcoes: {
  lazySample?: Record<string, unknown>;
  lazyProvenance?: Record<string, unknown>;
  view?: ReturnType<typeof vista>;
} = {}) {
  const chamadas: Chamadas = { sample: 0, provenance: 0, send: 0 };
  const analise = payloadCongelado();
  const tela = await montarRadar();
  const pintar = (estado: typeof opcoes) => tela.render(comProductShell(React.createElement(
    SupabaseSessionProvider, null,
    React.createElement(GlobalNoticeProvider, null,
      React.createElement(RadarR3Workbench, {
        model: modelo(estado.view || vista()), refreshing: false,
        onOpenArticle: () => {}, onOpenDetail: () => {},
        onResetInvestigation: () => {},
        plannerHandoff: {
          eligible: true, blockedReason: null, sent: false, sentAt: null,
          destinationLabel: null, busy: false,
          onSend: () => { chamadas.send += 1; },
        },
        googleResearch: {
          sampleSummary: radarResearchSampleSummary({ payload: analise, profile: "GOOGLE" }),
          provenanceSummary: radarResearchProvenanceSummary(analise),
          lazySample: { state: "IDLE", pages: [], integrity: null, message: null, ...estado.lazySample },
          lazyProvenance: { state: "IDLE", data: null, message: null, ...estado.lazyProvenance },
          onLoadSample: () => { chamadas.sample += 1; },
          onLoadProvenance: () => { chamadas.provenance += 1; },
        },
      } as never)),
  )));

  await pintar(opcoes);
  /*
   * `repintar` FAZ O PAPEL DO PAI, que no runtime é `radar-page`.
   *
   * Lá `carregarParteDaPesquisa` marca LOADING antes do `await`. Sem esse
   * passo aqui, o disclosure ficaria IDLE para sempre e "só o primeiro clique
   * busca" seria uma pergunta que o teste não faz.
   */
  return { tela, chamadas, repintar: (proximo: typeof opcoes) => pintar({ ...opcoes, ...proximo }) };
}

const abrirPesquisa = (tela: RadarDomScreen) => tela.click("radar-r3-card-pesquisa");

/* ========================= §13 · A, B, C e G, H ========================= */

test("A · o disclosure do Google anuncia a contagem CONGELADA, não a corrente", async () => {
  const { tela } = await montarArea();
  await abrirPesquisa(tela);

  const amostra = tela.get("radar-google-sample");
  const rotulo = amostra.querySelector("summary")?.textContent || "";
  assert.match(rotulo, /Ver amostra competitiva/);
  assert.match(rotulo, /\b8 página\(s\)/, "8 congeladas, e o rótulo conta congelado");
  assert.equal(/\b18 página/.test(rotulo), false, "as 18 correntes não aparecem no rótulo");
  tela.destroy();
});

test("B · fechado, o disclosure não busca nada — nem sample, nem provenance", async () => {
  const { tela, chamadas } = await montarArea();
  await abrirPesquisa(tela);

  assert.equal(chamadas.sample, 0, "SAMPLE_CLOSED_FETCHES = 0");
  assert.equal(chamadas.provenance, 0, "PROVENANCE_CLOSED_FETCHES = 0");

  /* §1 · e eles nascem FECHADOS — sem isso "fechado não busca" é vácuo. */
  assert.equal((tela.get("radar-google-sample") as HTMLDetailsElement).open, false, "a amostra nasce fechada");
  assert.equal((tela.get("radar-technical-provenance") as HTMLDetailsElement).open, false, "a proveniência nasce fechada");
  /* E o conteúdo pesado não está na árvore: fechado não é só invisível. */
  assert.equal(tela.query("radar-google-sample-pages"), null);
  assert.equal(tela.query("radar-google-sample-loading"), null, "sem spinner antes do primeiro clique");
  tela.destroy();
});

test("C · abrir busca UMA vez; fechar e reabrir não busca de novo", async () => {
  const { tela, chamadas, repintar } = await montarArea();
  await abrirPesquisa(tela);

  const resumo = () => tela.get("radar-google-sample").querySelector("summary") as HTMLElement;

  /*
   * ABRIR E FECHAR NO MESMO TIQUE — o usuário ansioso.
   *
   * Os dois cliques acontecem ANTES de o pai repintar, com o estado ainda
   * IDLE: aqui a guarda de estado não protege nada, e quem segura o segundo
   * pedido é a pergunta "o `details` está abrindo?". Sem ela, fechar por
   * engano custa uma segunda ida ao banco.
   */
  await tela.doubleClick(resumo());
  assert.equal(chamadas.sample, 1, "abrir e fechar depressa é UMA leitura");

  await repintar({ lazySample: { state: "LOADING" } });
  await tela.click(resumo());
  assert.equal(chamadas.sample, 1, "a primeira abertura leu, e só ela");

  /* O pai marca LOADING e depois READY — é o que o runtime faz. */
  await repintar({ lazySample: { state: "LOADING" } });
  await tela.click(resumo());
  await tela.click(resumo());
  assert.equal(chamadas.sample, 1, "reabrir com a leitura EM VOO não pede de novo");

  await repintar({ lazySample: { state: "READY", pages: [], integrity: null } });
  await tela.click(resumo());
  await tela.click(resumo());
  assert.equal(chamadas.sample, 1, "e reabrir com a leitura PRONTA relê do cache, não do servidor");
  assert.equal(chamadas.provenance, 0, "abrir a amostra não arrasta a proveniência junto");
  tela.destroy();
});

test("G e H · a proveniência é lazy pelo mesmo mecanismo", async () => {
  const { tela, chamadas, repintar } = await montarArea();
  await abrirPesquisa(tela);

  const proveniencia = tela.get("radar-technical-provenance");
  assert.equal((proveniencia as HTMLDetailsElement).open, false, "nasce fechada");
  assert.equal(chamadas.provenance, 0);

  await tela.click(proveniencia.querySelector("summary") as HTMLElement);
  assert.equal(chamadas.provenance, 1, "abrir lê uma vez");
  assert.equal(chamadas.sample, 0, "e não arrasta a amostra junto");

  /* FECHAR não é um pedido: o evento `toggle` dispara nos dois sentidos. */
  await tela.click(proveniencia.querySelector("summary") as HTMLElement);
  assert.equal(chamadas.provenance, 1, "fechar não busca");

  /*
   * §11 · REABRIR REUSA O QUE JÁ CHEGOU.
   *
   * O pai marca READY, como no runtime. Sem este trecho, uma proveniência que
   * relê a cada abertura passaria neste teste — e pagaria uma ida ao banco por
   * clique de curiosidade.
   */
  await repintar({ lazyProvenance: { state: "READY", data: radarResearchProvenanceOfAnalysis({ payload: payloadCompleto(), profile: "GOOGLE" }) } });
  const reaberta = () => tela.get("radar-technical-provenance").querySelector("summary") as HTMLElement;
  await tela.click(reaberta());
  await tela.click(reaberta());
  assert.equal(chamadas.provenance, 1, "reabrir lê do que já chegou, não do servidor");
  tela.destroy();
});

/* ============================ §13 · E e F ============================ */

test("E · 18 correntes + 8 congeladas renderizam EXATAMENTE as 8", async () => {
  const resolvida = radarResearchSampleOfAnalysis({ payload: payloadCompleto(), profile: "GOOGLE" });
  assert.equal(resolvida.count, 8);

  const { tela } = await montarArea({
    lazySample: { state: "READY", pages: resolvida.pages, integrity: resolvida.integrity },
  });
  await abrirPesquisa(tela);
  await tela.click(tela.get("radar-google-sample").querySelector("summary") as HTMLElement);

  const paginas = tela.all("radar-google-sample-page");
  assert.equal(paginas.length, 8, "CURRENT_EXTRACTIONS_OVERRIDE_FROZEN = NO");

  /* E são as 8 da fotografia — não as 8 primeiras de qualquer lista. */
  const titulos = paginas.map(item => item.textContent || "");
  for (const id of IDS_CONGELADOS) {
    const esperado = PAGINAS.find(item => item.url === id)!.title;
    assert.ok(titulos.some(texto => texto.includes(esperado)), `${esperado} está na amostra`);
  }
  assert.equal(titulos.some(texto => texto.includes("Concorrente A9")), false, "a 9ª corrente não entra");
  tela.destroy();
});

test("F · referência congelada que não resolve vira erro explícito, e FINALIZED permanece", async () => {
  /* A versão corrente perdeu duas das páginas que a fotografia aponta. */
  const mutilado = { ...payloadCompleto(), extractions: PAGINAS.slice(2) };
  const resolvida = radarResearchSampleOfAnalysis({ payload: mutilado, profile: "GOOGLE" });

  assert.equal(resolvida.integrity?.code, "FROZEN_SAMPLE_REFERENCE_MISSING");
  assert.deepEqual(resolvida.integrity?.missingIds, IDS_CONGELADOS.slice(0, 2));
  assert.equal(resolvida.pages.length, 6, "as que resolvem aparecem; as que faltam NÃO são substituídas");

  const { tela } = await montarArea({
    lazySample: { state: "READY", pages: resolvida.pages, integrity: resolvida.integrity },
  });
  await abrirPesquisa(tela);
  await tela.click(tela.get("radar-google-sample").querySelector("summary") as HTMLElement);

  const aviso = tela.get("radar-google-sample-integrity").textContent || "";
  assert.match(aviso, /não pôde ser resolvida/);
  assert.match(aviso, /continua finalizada/, "o estado é reafirmado, não retirado");

  /* §11 · a falha não destrava, não apaga o blueprint e não remove o handoff. */
  assert.ok(tela.query("radar-frozen-bundle"), "a investigação congelada continua na tela");
  assert.equal(tela.query("radar-reset-investigation") !== null, true, "reabrir/zerar continua oferecido");
  tela.destroy();
});

/* ============================== §13 · I ============================== */

test("I · erro da leitura lazy não toca FINALIZED, e o retry é local", async () => {
  const { tela, chamadas } = await montarArea({
    lazySample: { state: "FAILED", message: "Não foi possível carregar a amostra." },
  });
  await abrirPesquisa(tela);
  await tela.click(tela.get("radar-google-sample").querySelector("summary") as HTMLElement);

  /* Abrir com a leitura JÁ falhada não dispara outra sozinha: o retry é do USER. */
  assert.equal(chamadas.sample, 0, "estado FAILED não é IDLE — abrir não relê sozinho");

  assert.ok(tela.query("radar-google-sample-failed"), "a falha aparece onde falhou");
  await tela.click("radar-google-sample-retry");
  assert.equal(chamadas.sample, 1, "e só o botão relê");

  /* O que a falha NÃO faz. */
  assert.ok(tela.query("radar-frozen-bundle"), "FINALIZED_PRESERVED_ON_LAZY_ERROR");
  assert.ok(tela.query("radar-planner-handoff") || tela.text().includes("Planejador"), "o handoff continua oferecido");
  tela.destroy();
});

/* ============================== §13 · K ============================== */

test("K · o handoff não exige abrir amostra nem proveniência", async () => {
  const { tela, chamadas } = await montarArea();
  await abrirPesquisa(tela);

  const botao = [...tela.container.querySelectorAll("button")]
    .find(item => /Planejador/i.test(item.textContent || "")) as HTMLButtonElement;
  assert.ok(botao, "a fronteira do Planejador está na tela");

  await tela.click(botao);
  assert.equal(chamadas.send, 1, "enviar funciona com os dois disclosures fechados");
  assert.equal(chamadas.sample, 0, "HANDOFF_REQUIRES_LAZY_READ = NO");
  assert.equal(chamadas.provenance, 0);
  tela.destroy();
});

/* ====================== §13 · D · a leitura é do BANCO ====================== */

test("D · a leitura lazy do Google vai à rota genérica e não chama provider", async () => {
  const pedidos: string[] = [];
  const fetchFalso = (async (url: unknown) => {
    pedidos.push(String(url));
    return {
      ok: true,
      json: async () => ({
        success: true, readbackConfirmed: true, analysisVersionId: "v9",
        sample: radarResearchSampleOfAnalysis({ payload: payloadCompleto(), profile: "GOOGLE" }),
        provenance: radarResearchProvenanceOfAnalysis({ payload: payloadCompleto(), profile: "GOOGLE" }),
      }),
    };
  }) as unknown as typeof fetch;

  const amostra = await loadRadarResearchSample({ brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, profile: "GOOGLE", fetchImpl: fetchFalso });
  assert.equal(amostra.ok, true);
  assert.equal(amostra.ok && amostra.data.pages.length, 8);

  const tecnica = await loadRadarResearchProvenance({ brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, profile: "GOOGLE", fetchImpl: fetchFalso });
  assert.equal(tecnica.ok, true);

  assert.equal(pedidos.length, 2, "uma ida por parte");
  for (const pedido of pedidos) {
    assert.match(pedido, /\/api\/editorial\/radar-research-part\?/, "a rota é a GENÉRICA — §6");
    assert.match(pedido, /profile=GOOGLE/);
  }
  /* PROVIDER_CALLS_FROM_LAZY = 0: nenhuma ida a dataforseo, serper ou google. */
  for (const pedido of pedidos) {
    assert.equal(/dataforseo|serper|googleapis|amazon|youtube/i.test(pedido), false, `${pedido} não é provider`);
  }
});

test("D.1 · a rota da parte lê a autoridade FULL, e o cliente nunca lança", async () => {
  const fonte = await readFile(new URL("../app/api/editorial/radar-research-part/route.ts", import.meta.url), "utf8");
  assert.match(fonte, /findByArticle/, "a parte sai do repositório, não do DTO podado");
  assert.equal(/compactRadarResearchForRead/.test(fonte), false, "a rota não devolve o compacto como conteúdo");

  /* §11 · uma falha de rede vira mensagem, não exceção que derruba a área. */
  const quebrado = (async () => { throw new Error("rede caiu"); }) as unknown as typeof fetch;
  const resultado = await loadRadarResearchSample({ brandId: ARTIGO.brandId, articleId: ARTIGO.articleId, profile: "GOOGLE", fetchImpl: quebrado });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.ok === false && resultado.message, "rede caiu");
});

/* =================== §5 · a proveniência do Google =================== */

test("§5 · a proveniência do Google responde pelas fontes DELE, não pelas do YouTube", async () => {
  const tecnica = radarResearchProvenanceOfAnalysis({ payload: payloadCompleto(), profile: "GOOGLE" });

  assert.equal(tecnica.profile, "GOOGLE");
  assert.equal(tecnica.runId, "snap-google-1", "a SERP canônica é o artefato endereçável");
  assert.equal(tecnica.runVersion, 3);
  assert.equal(tecnica.fingerprint, "fundamento:v17");
  assert.equal(tecnica.collectedAt, "2026-09-10T09:00:00.000Z");
  assert.equal(tecnica.frozenAt, "2026-09-11T08:00:00.000Z");
  assert.equal(tecnica.frozenId, "bundle:2f9c1a77", "a identidade da fotografia");
  assert.equal(tecnica.frozenHash, "bundle-hash:2f9c1a77");
  assert.deepEqual(tecnica.limitations, ["Duas consultas auxiliares não retornaram resultado."]);

  /* Provider e endpoint não são gravados no payload: dizer um valor seria inventar. */
  assert.equal(tecnica.provider, null);
  assert.equal(tecnica.endpoint, null);

  assert.ok(new TextEncoder().encode(JSON.stringify(tecnica)).length < 1024, "e ela continua leve");
});

test("§5 · os ids técnicos saíram do card visível e moram no disclosure", async () => {
  const { tela } = await montarArea({
    lazyProvenance: { state: "READY", data: radarResearchProvenanceOfAnalysis({ payload: payloadCompleto(), profile: "GOOGLE" }) },
  });
  await abrirPesquisa(tela);

  const card = tela.get("radar-frozen-bundle").textContent || "";
  assert.equal(card.includes("bundle:2f9c1a77"), false, "o id não compete com a leitura");
  assert.equal(card.includes("bundle-hash:"), false);
  assert.match(card, /comparável\(is\)/, "o que a pessoa decide olhando continua lá");

  await tela.click(tela.get("radar-technical-provenance").querySelector("summary") as HTMLElement);
  const tecnico = tela.get("radar-google-provenance-data").textContent || "";
  assert.match(tecnico, /bundle:2f9c1a77/, "e ele está onde §5 manda");
  assert.match(tecnico, /bundle-hash:2f9c1a77/);
  tela.destroy();
});

/* ============================== §13 · L ============================== */

test("L · Amazon e YouTube não regridem", async () => {
  /* A amostra dos dois continua vindo pela CORRIDA, e nunca pela lista de páginas. */
  for (const profile of ["AMAZON", "YOUTUBE"] as const) {
    const amostra = radarResearchSampleOfAnalysis({ payload: payloadCongelado(), profile });
    assert.deepEqual(amostra.pages, [], `${profile} não usa a lista de páginas do Google`);
    assert.equal(amostra.integrity, null);
  }

  /* E a proveniência deles continua lendo a corrida — o ramo novo não os capturou. */
  const amazon = radarResearchProvenanceOfAnalysis({
    payload: { amazonSearch: { runId: "run-amz-1", runVersion: 2, provenance: { provider: "dataforseo", endpoint: "merchant", languageCode: "pt_BR", collectedAt: "2026-09-01T10:00:00.000Z" } } },
    profile: "AMAZON",
  });
  assert.equal(amazon.runId, "run-amz-1");
  assert.equal(amazon.provider, "dataforseo");
  assert.equal(amazon.languageCode, "pt_BR", "a grafia realmente enviada continua saindo daqui");

  const youtube = radarResearchProvenanceOfAnalysis({
    payload: { youtubeSearch: { runId: "run-yt-1", runVersion: 1, provenance: { provider: "youtube", endpoint: "search.list", languageCode: "pt-BR", collectedAt: "2026-09-02T10:00:00.000Z" } } },
    profile: "YOUTUBE",
  });
  assert.equal(youtube.runId, "run-yt-1");
  assert.equal(youtube.languageCode, "pt-BR");

  /* Os painéis dos dois continuam com os próprios disclosures, intocados. */
  const amazonPanel = await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
  const youtubePanel = await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");
  assert.match(amazonPanel, /data-testid="radar-amazon-sample"/);
  assert.match(youtubePanel, /data-testid="radar-youtube-sample-details"/);
});

/* ===================== §6 · uma autoridade, três perfis ===================== */

test("§6 · a área Google não criou rota, cliente nem estado paralelos", async () => {
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /* Nada de endpoint próprio do Google. */
  for (const proibido of ["radar-google-sample-part", "GoogleLazySample", "GoogleProvenanceEndpoint", "loadGoogleSample"]) {
    assert.equal(workbench.includes(proibido), false, `${proibido} não existe`);
    assert.equal(page.includes(proibido), false, `${proibido} não existe`);
  }

  /* E a aba do Google usa o MESMO carregador das outras duas. */
  const abaGoogle = page.slice(page.indexOf("googleResearch={{"), page.indexOf("}} onRecoverSerp="));
  assert.ok(abaGoogle.length > 0, "a aba foi localizada");
  assert.match(abaGoogle, /onLoadSample: \(\) => void carregarParteDaPesquisa\("sample"\)/);
  assert.match(abaGoogle, /onLoadProvenance: \(\) => void carregarParteDaPesquisa\("provenance"\)/);
  assert.match(abaGoogle, /profile: "GOOGLE"/);
});

/* ========================= §13 · J e §9 · a escrita ========================= */

test("J · reabrir devolve a escrita pelo mecanismo que já existia", () => {
  const completo = { ...payloadCompleto(), serpDecisions: [{ key: "1", decision: "selected", reason: "comparável", note: "" }] };

  /* Congelada, a escrita competitiva é recusada — a trava do 2.3, intocada. */
  const tentativa = radarGoogleResearchWriteLock({
    current: completo,
    next: { ...completo, extractions: PAGINAS.slice(0, 3) },
  });
  assert.equal(tentativa.allowed, false);
  assert.equal(tentativa.code, "RADAR_GOOGLE_RESEARCH_FINALIZED");

  /* §8 · reabrir é o RESET que já existe; este gate não tocou nele. */
  const zerado = buildRadarResetPayload(completo as unknown as RadarAnalysisPayload) as unknown as Record<string, unknown>;
  assert.equal(zerado.finalizedBundle, null);
  assert.equal(radarGoogleResearchWriteLock({ current: zerado, next: { ...zerado, extractions: PAGINAS.slice(0, 3) } }).allowed, true);

  /* E a amostra congelada deixa de ser autoridade corrente. */
  const depois = radarResearchSampleSummary({ payload: zerado, profile: "GOOGLE" });
  assert.equal(depois.count, 0, "sem fotografia, não há contagem congelada para anunciar");
});

test("§9 · a cópia de leitura nunca vira base de escrita", async () => {
  const compacto = payloadCongelado();
  assert.equal(compacto.researchTransport, "COMPACT");
  assert.deepEqual(compacto.extractions, [], "o DTO inicial não leva a amostra");

  /* Suceder a partir do compacto gravaria uma versão sem as páginas. */
  await assert.rejects(
    () => createRadarAnalysisSuccessor(
      { versionId: "v9", payload: compacto } as never,
      {} as never, "ator", undefined, "id-novo",
    ),
    RadarCompactBaseError,
  );
});
test("sentinela · nenhuma ida REAL ao servidor neste gate", () => {
  assert.deepEqual(idasAoServidor, []);
});
