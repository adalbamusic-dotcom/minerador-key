import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider as TooltipProvider } from "@radix-ui/react-tooltip";
import { RadarR3Workbench } from "../modules/radar/radar-r3-workbench.tsx";
import {
  RADAR_PHASE1_HANDLER, RADAR_UPSTREAM_UNTOUCHED, radarActionInFlight, radarActionOutcome,
  radarClaimAction, radarReleaseAction, type RadarActionClaim,
} from "../lib/radar/operational-actions.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import { radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { buildRadarResetPayload } from "../lib/radar/radar-reset.ts";
import { radarSearchModeAvailability } from "../lib/radar/search-mode.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarR3Model } from "../lib/radar/r3-workbench.ts";

/*
 * ======  GATE 15.1 · PRÉ-SMOKE DOS BOTÕES  ==============================
 *
 * Antes de gastar chamadas reais, provar que a superfície está encadeada: que
 * cada botão nasce de um clique, chama o handler certo, respeita o guarda de
 * concorrência e só declara sucesso depois do readback.
 *
 * VARRER STRING NÃO BASTA. Os testes de estado abaixo RENDERIZAM o Workbench e
 * leem o DOM resultante: é a diferença entre "o código menciona o botão" e "o
 * botão aparece neste estado e não no outro".
 *
 * REAL_PROVIDER_CALLS = 0: tudo aqui é stub local. O primeiro ciclo real é do
 * USER, depois deste gate.
 */

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

const PAGINAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  return pagina(`A${index}`, headings);
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-1", articleDnaContentHash: "hash", promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  /*
   * A KEYWORD COM `provenance` — como o contexto resolvido sempre a entrega.
   *
   * Renderizar de verdade cobra o contrato inteiro: o perfil da keyword lê a
   * procedência, e uma fixture pela metade quebra onde a tela real não quebra.
   * É o tipo de coisa que varredura de string nunca acusaria.
   */
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) };

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

/**
 * A INVESTIGAÇÃO COMO O START A DEIXA — em duas passagens, como no fluxo real.
 *
 * O START coleta, deriva as referências e grava a curadoria automática. Sem
 * essa segunda parte a amostra fica vazia e a Fase 1 diz "refazer" — que é o
 * comportamento certo para um universo sem seleção, e a razão de a fixture
 * precisar reproduzir a gravação em vez de fingi-la.
 */
function vista(patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) {
  const base = {
    context: contexto(),
    record: registro(),
    snapshot: SNAPSHOT as never,
    extractions: PAGINAS,
    observedAt: "2026-09-10T12:00:00.000Z",
    ...patch,
  } as Parameters<typeof buildRadarDeepResearchView>[0];

  /* Sem registro não há investigação — e portanto não há curadoria a gravar. */
  if (!base.record) return buildRadarDeepResearchView(base);

  const universo = buildRadarDeepResearchView(base);
  const curadoria = {
    universeFingerprint: radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-09-10T09:30:00.000Z",
    confirmedBy: "ator",
    references: universo.references.map(reference => ({
      referenceId: reference.referenceId,
      normalizedUrl: reference.normalizedUrl,
      url: reference.url,
      decision: autoDecideRadarReference(reference).decision,
      reason: "",
    })),
  };

  const recordBase = (base.record || registro()) as ReturnType<typeof registro>;
  return buildRadarDeepResearchView({
    ...base,
    record: { ...recordBase, researchCuration: curadoria },
    selectedReferences: curadoria.references.filter(item => item.decision !== "excluded" && item.decision !== "pending").length,
  });
}

/** O modelo mínimo que o Workbench precisa para renderizar uma linha real. */
const modelo = (deepResearch: ReturnType<typeof vista> | undefined): RadarR3Model => ({
  brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-1",
  title: "Cobrir com clareza o tema skincare para pele oleosa",
  keyword: "skincare para pele oleosa", silo: "skincare", hierarchy: "Suporte",
  articleDnaVersion: "v1", publication: "Ainda não publicado", mode: "competitive_full", article: null,
  researchContext: contexto(), deepResearch,
  serp: { provider: "dataforseo", status: "Coletada", resultCount: 12, primaryCount: 1, pendingCount: 0, references: [], view: null, analysis: null, latestSnapshotId: null, reviewStatus: null, reviewNotes: null, reviewCurrentness: "current", reviewedAt: null, reviewHistory: [], capturedAt: null },
  amazon: { state: "AMAZON_NOT_APPLICABLE", note: "" },
  content: { articleDnaVersion: "v1", principal: "skincare para pele oleosa", needs: 0, evidenceCount: 0, sourceCount: 0, rows: [], technical: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-1", siloId: null, snapshotId: null, provider: null, articleDnaEntityId: null, articleDnaHash: null } },
  specialist: { expert: "Não selecionado", specialty: "", status: "Não iniciado", channel: "Telegram não consumido nesta visão", requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0, pending: 0, existingContent: "Nenhum material" },
  report: { status: "Aguardando", version: null, needs: 0, summary: "", approved: false, sentToPlanner: false, updatedAt: null },
  nextAction: "", lastActivity: null,
  provenance: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-1", siloId: null, snapshotId: null, provider: null },
} as unknown as RadarR3Model);

/** Renderiza o Workbench com a área Pesquisa aberta não é possível sem clique;
 *  o que se lê aqui é a primeira camada — cards, faixa e ação primária. */
function render(model: RadarR3Model | null, extra: Record<string, unknown> = {}) {
  /*
   * O MESMO ANCESTRAL QUE A APLICAÇÃO DÁ.
   *
   * RADAR 18.8 pôs um `InfoHint` ao lado da ação primária, e ele monta um
   * `Tooltip.Root` do Radix, que exige um `Tooltip.Provider` acima — na
   * aplicação ele vem do `ProductShell`. Renderizar sem esse provedor não
   * testaria a tela: testaria uma composição que não existe em lugar nenhum.
   */
  return renderToStaticMarkup(createElement(TooltipProvider, {
    delayDuration: 300,
    skipDelayDuration: 150,
    children: createElement(RadarR3Workbench, {
      model, refreshing: false, onRefreshSerp: () => {}, onOpenArticle: () => {}, onOpenDetail: () => {},
      ...extra,
    } as never),
  }));
}

/* ==========  A, B, C e D · TODA AÇÃO NASCE DE UM CLIQUE  =============== */

test("GATE 15.1 · A, B, C e D — START, ANALYZE, FINALIZE e RESET só existem em onClick", () => {
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /* Nenhum efeito na superfície inteira do Workbench. */
  assert.doesNotMatch(workbench, /useEffect/);
  /* RADAR 18.8: `disparar` chega ao componente único como `onTrigger`, e só ele vira `onClick`. */
  assert.match(workbench, /onTrigger=\{disparar\}/);
  assert.match(workbench, /onClick=\{onTrigger\}/);
  assert.match(workbench, /onClick=\{onReset\}/);

  /*
   * O MAPA CANÔNICO LIGA A AÇÃO RESOLVIDA AO HANDLER.
   *
   * Uma cadeia de `if` no componente é onde "Finalizar" passa a chamar a
   * análise sem que nada quebre visivelmente. O mapa é dado e é testado.
   */
  assert.equal(RADAR_PHASE1_HANDLER.START_RESEARCH, "START");
  assert.equal(RADAR_PHASE1_HANDLER.ANALYZE_COMPETITION, "ANALYZE");
  assert.equal(RADAR_PHASE1_HANDLER.FINALIZE_SERP, "FINALIZE");
  assert.equal(RADAR_PHASE1_HANDLER.NONE, null);
  assert.match(workbench, /RADAR_PHASE1_HANDLER\[acao\.id\]/, "a tela consulta o mapa em vez de repetir a decisão");

  /* E na página, nenhuma das quatro é chamada de dentro de um efeito. */
  for (const handler of ["startDeepResearch", "analyzeSerpSelection", "finalizeInvestigation", "resetRadarInvestigation"]) {
    assert.equal(new RegExp(`useEffect\\([^)]*${handler}`).test(page), false, handler);
    assert.match(page, new RegExp(`void ${handler}\\(\\)`), `${handler} é disparado por intenção explícita`);
  }
});

/* ==========  E, F e G · NAVEGAR E RECARREGAR NÃO EXECUTAM  ============= */

test("GATE 15.1 · E, F e G — trocar de área, abrir fundamentos e recarregar não executam nada", () => {
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");

  /* Trocar de área é setState puro. */
  assert.match(workbench, /onToggle=\{\(\) => setExpandedArea\(current => current === area \? null : area\)\}/);
  assert.doesNotMatch(workbench, /onToggle=\{\(\) => \{[^}]*on(Start|Analyze|Finalize|Reset)/);

  /* Abrir fundamentos é um <details>: sem handler, sem provider. */
  const faixa = workbench.slice(workbench.indexOf("function ArticleContextBand"), workbench.indexOf("O RELATÓRIO RESPONDE PERGUNTAS"));
  assert.match(faixa, /<details/);
  assert.doesNotMatch(faixa, /onClick|onChange|fetch\(/);

  /*
   * O F5 REFAZ A LEITURA, NÃO A PESQUISA.
   *
   * A view é derivada do que está gravado; renderizá-la duas vezes com a mesma
   * entrada devolve a mesma coisa e não toca em nada externo.
   */
  const primeira = vista();
  const segunda = vista();
  assert.equal(segunda.state, primeira.state);
  assert.equal(segunda.observed.sample.comparablePages, primeira.observed.sample.comparablePages);
  assert.equal(segunda.phase1.id, primeira.phase1.id);
  for (const caminho of ["../lib/radar/deep-research-view.ts", "../lib/radar/operational-actions.ts", "../lib/radar/operational-view.ts"]) {
    const fonte = readFileSync(new URL(caminho, import.meta.url), "utf8");
    assert.equal(/\bfetch\(|serper|dataforseo/i.test(fonte), false, caminho);
  }
});

/* ==========  H, I e J · CLIQUE DUPLO NÃO DUPLICA OPERAÇÃO  ============= */

test("GATE 15.1 · H, I e J — o segundo clique não entra, em nenhuma das quatro ações", () => {
  for (const acao of ["START", "ANALYZE", "FINALIZE", "RESET"] as const) {
    const primeiro = radarClaimAction(null, { articleId: "a", action: acao });
    assert.equal(primeiro.granted, true, `${acao}: o primeiro clique entra`);

    const segundo = radarClaimAction(primeiro.claim, { articleId: "a", action: acao });
    assert.equal(segundo.granted, false, `${acao}: o segundo não`);
    assert.match(segundo.refusal || "", /já está em andamento/);
    assert.deepEqual(segundo.claim, primeiro.claim, "e a posse continua com quem a tomou");
  }

  /*
   * UMA OPERAÇÃO POR VEZ, INCLUSIVE ENTRE ARTIGOS DIFERENTES.
   *
   * Duas operações concorrentes disputariam o mesmo pipeline de persistência, e
   * a segunda gravaria por cima de uma versão que a primeira ainda montava.
   */
  const emVoo: RadarActionClaim = { articleId: "a", action: "ANALYZE" };
  const outra = radarClaimAction(emVoo, { articleId: "b", action: "RESET" });
  assert.equal(outra.granted, false);
  assert.match(outra.refusal || "", /Outra ação ainda está em andamento/);

  /* Só quem tomou a posse a devolve. */
  assert.deepEqual(radarReleaseAction(emVoo, { articleId: "b", action: "RESET" }), emVoo, "liberar por engano reabriria a porta");
  assert.equal(radarReleaseAction(emVoo, { articleId: "a", action: "ANALYZE" }), null);
  assert.equal(radarActionInFlight(emVoo), true);
  assert.equal(radarActionInFlight(null), false);
});

/* ==========  K e L · SUCESSO AVANÇA, FALHA NÃO  ======================= */

test("GATE 15.1 · K e L — sucesso avança; falha não deixa estado meio-gravado parecer pronto", () => {
  const sucesso = radarActionOutcome({ action: "START", persistence: { persistenceMode: "remote", readbackConfirmed: true }, successMessage: "Pesquisa iniciada." });
  assert.equal(sucesso.status, "SUCCEEDED");
  assert.equal(sucesso.advances, true);
  assert.equal(sucesso.message, "Pesquisa iniciada.");

  /* Erro de rota/provider: não avança, e a mensagem é de quem opera. */
  const falha = radarActionOutcome({ action: "START", error: new Error("HTTP 500 Internal Server Error") });
  assert.equal(falha.status, "FAILED");
  assert.equal(falha.advances, false);
  assert.equal(falha.message, "O Radar não conseguiu iniciar a pesquisa. Tente novamente.");
  assert.match(falha.detail || "", /HTTP 500/, "o detalhe técnico continua inteiro, ao lado");

  /* Sem resultado de persistência também é falha — não silêncio. */
  const semResultado = radarActionOutcome({ action: "ANALYZE", persistence: null });
  assert.equal(semResultado.status, "FAILED");
  assert.equal(semResultado.advances, false);
});

test("GATE 15.1 · §23 — erro técnico não vira a frase principal", () => {
  const tecnicos = [
    "ZodError: expected string, received null",
    "contentHash mismatch entre a versão gravada e a lida",
    "fetch failed",
    "at Object.<anonymous> (/app/lib/x.ts:12:3)",
  ];
  for (const bruto of tecnicos) {
    const resultado = radarActionOutcome({ action: "ANALYZE", error: new Error(bruto) });
    assert.equal(resultado.message, "O Radar não conseguiu analisar a concorrência. Tente novamente.", bruto);
    assert.equal(resultado.detail, bruto, "e nada se perde");
  }

  /*
   * MENSAGEM ÚTIL CONTINUA APARECENDO.
   *
   * Filtrar tudo esconderia justamente o erro que diz o que fazer — "a
   * composição não tem principal com texto resolvido" é acionável.
   */
  const util = radarActionOutcome({ action: "START", error: new Error("A composição não tem principal com texto resolvido.") });
  assert.equal(util.message, "A composição não tem principal com texto resolvido.");
});

/* ==========  M, N e §7 · CONTADORES DEPOIS DO ANALYZE  ================ */

test("GATE 15.1 · M — terminada a rodada, PENDING = 0 e a conta fecha", () => {
  const view = vista();
  const amostra = view.observed.sample;

  assert.equal(view.phase1.id, "FINALIZE_SERP", "sem pendências, a ação seguinte é finalizar");
  assert.equal(amostra.selectedReferences, amostra.analyzedSuccess + amostra.failedFinal, "SELECTED = ANALYZED + FAILED, sem sobreposição");
  assert.equal(amostra.analyzedSuccess, 12);
  assert.equal(amostra.failedFinal, 0);
});

test("GATE 15.1 · N e §8 — análise parcial é finalizável, e a falha vira limitação", () => {
  const parcial = vista({
    extractions: PAGINAS.slice(0, 9),
    extractionFailureUrls: PAGINAS.slice(9).map(item => item.url),
  });

  assert.equal(parcial.observed.sample.analyzedSuccess, 9);
  assert.equal(parcial.observed.sample.failedFinal, 3);
  assert.equal(parcial.phase1.id, "FINALIZE_SERP", "não trava: a próxima ação é finalizar");
  assert.equal(parcial.finalization.canFinalize, true, "PARTIAL_ANALYSIS_FINALIZABLE");

  /* Três falhas aparecem como limitação declarada, nunca como pendência. */
  assert.ok(parcial.observed.limitations.some(item => /3 página\(s\).*não puderam ser extraídas/.test(item)));
  assert.doesNotMatch(parcial.phase1.label, /pendente/i);

  /* E com pendência de verdade, a ação volta a ser analisar. */
  const comPendentes = vista({ extractions: PAGINAS.slice(0, 9) });
  assert.equal(comPendentes.phase1.id, "ANALYZE_COMPETITION");
  assert.equal(radarFinalizationReadiness({
    started: true, stale: false, alreadyFinalized: false,
    pending: 3, analyzed: 9, failed: 0, sufficiency: comPendentes.sufficiency,
  }).canFinalize, false);
});

/* ==========  O, P e Q · VERIFICAÇÃO DE FONTE E FINALIZAÇÃO  =========== */

test("GATE 15.1 · O e P — a verificação de fontes é subetapa do ANALYZE e não aborta a análise", () => {
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const analyze = page.slice(page.indexOf("const analyzeSerpSelection"), page.indexOf("const reviewSerpForArticle"));

  /* Dentro do ANALYZE, e sem botão próprio em lugar nenhum. */
  assert.match(analyze, /radar-analysis\/verify-sources/, "SOURCE_VERIFICATION_INSIDE_ANALYZE");
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  assert.equal(/VERIFY_SOURCES|verificar fontes/i.test(workbench), false, "nenhum quarto botão");

  /*
   * FONTE QUE FALHA VIRA FALHA NOMEADA, NÃO ABORTO.
   *
   * A amostra competitiva já foi lida quando a verificação roda; derrubar a
   * análise por um domínio fora do ar jogaria fora o trabalho todo.
   */
  assert.match(analyze, /sourceVerificationFailures/);
  assert.match(analyze, /catch/, "a falha é capturada dentro da subetapa");
});

test("GATE 15.1 · Q e R — FINALIZE não chama provider e exige readback", () => {
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const finalize = page.slice(page.indexOf("const finalizeInvestigation"), page.indexOf("const confirmResearchCuration"));

  assert.equal(/collectSerp|verify-sources|extractCompetitorPage|\/api\/editorial\/serp/.test(finalize), false, "FINALIZE_PROVIDER_CALLS = 0");
  assert.match(finalize, /freezeRadarEvidenceBundle/);
  assert.match(finalize, /radarActionOutcome\(\{\s*action: "FINALIZE"/);

  /* Sem readback confirmado, "finalizada" não é dito. */
  const semReadback = radarActionOutcome({ action: "FINALIZE", persistence: { persistenceMode: "local", readbackConfirmed: false } });
  assert.equal(semReadback.status, "NOT_PERSISTED");
  assert.equal(semReadback.advances, false);
  assert.match(semReadback.message, /NÃO foi finalizada/);

  const remotoSemReadback = radarActionOutcome({ action: "FINALIZE", persistence: { persistenceMode: "remote", readbackConfirmed: false } });
  assert.equal(remotoSemReadback.advances, false, "gravar não é confirmar");

  /* Nas demais ações o trabalho local continua útil — e a limitação é dita. */
  const analyzeLocal = radarActionOutcome({ action: "ANALYZE", persistence: { persistenceMode: "local", readbackConfirmed: false } });
  assert.equal(analyzeLocal.status, "NOT_PERSISTED");
  assert.match(analyzeLocal.message, /concluída localmente/);
});

/* =====  §19 · A MATRIZ DE ESTADOS, RENDERIZADA  ======================== */

test("GATE 15.1 · §19 — cada estado mostra a ação que lhe pertence, e só ela", () => {
  const estados = [
    /* RADAR 18.8 · §8 — o rótulo do START nomeia o destino da busca. */
    { nome: "NOT_STARTED", entrada: { record: null }, esperado: "START_RESEARCH", rotulo: /Iniciar Pesquisa Google/ },
    { nome: "READY_TO_ANALYZE", entrada: { extractions: PAGINAS.slice(0, 6) }, esperado: "ANALYZE_COMPETITION", rotulo: /Analisar concorrência/ },
    { nome: "ANALYZED", entrada: {}, esperado: "FINALIZE_SERP", rotulo: /Finalizar pesquisa/ },
  ];

  for (const estado of estados) {
    const view = vista(estado.entrada as never);
    assert.equal(view.phase1.id, estado.esperado, estado.nome);

    const markup = render(modelo(view));
    assert.match(markup, /data-testid="radar-deep-research-button"/, estado.nome);
    assert.match(markup, new RegExp(`data-action-id="${estado.esperado}"`), estado.nome);
    assert.match(markup, estado.rotulo, estado.nome);
  }

  /* ANALYZING: a ação some enquanto a operação está em voo. */
  const emVoo = vista({ running: true });
  assert.equal(emVoo.phase1.id, "NONE");
  assert.equal(emVoo.phase1.enabled, false);
  assert.match(emVoo.phase1.hint || "", /em andamento/);

  /* STALE: refazer, nunca finalizar como corrente. */
  const desatualizada = radarPhase1Action({
    state: "STALE", contextReady: true, hasPrimaryQuery: true, running: false,
    selected: 12, pending: 0, failed: 0, analyzed: 12,
  });
  assert.equal(desatualizada.id, "START_RESEARCH");
  assert.match(desatualizada.label, /Refazer/);

  /* FAILED_START: nada analisável, e o motivo é dito em vez de escondido. */
  const semAnalisavel = radarPhase1Action({
    state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false,
    selected: 12, pending: 0, failed: 12, analyzed: 0,
  });
  assert.equal(semAnalisavel.id, "START_RESEARCH");
  assert.match(semAnalisavel.blockedReason || "", /Nenhuma das 12 página/);
});

/* ==========  S e T · FINALIZADO NÃO OFERECE NADA  ===================== */

test("GATE 15.1 · S e T — finalizado não mostra ANALYZE nem FINALIZE", () => {
  const finalizada = radarPhase1Action({
    state: "FINALIZED", contextReady: true, hasPrimaryQuery: true, running: false,
    selected: 12, pending: 0, failed: 0, analyzed: 12,
  });
  assert.equal(finalizada.id, "NONE");
  assert.equal(finalizada.enabled, false);

  /*
   * O QUE A TELA MOSTRA — lido do DOM, não do código.
   *
   * Com a investigação finalizada, o botão da Fase 1 não é renderizado: sem
   * ação, sem botão. Um botão morto convidaria ao clique e não faria nada.
   */
  const markup = render(modelo(vista({ record: { ...startRadarDeepResearch({ context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z" }), finalizedAt: "2026-09-10T13:00:00.000Z", finalizedBy: "ator", conclusion: "SUFFICIENT" } as never })));
  assert.doesNotMatch(markup, /data-testid="radar-deep-research-button"/, "FINALIZED_RESEARCH_SHOWS_ANALYZE = NO");
  assert.doesNotMatch(markup, /data-action-id="ANALYZE_COMPETITION"|data-action-id="FINALIZE_SERP"/);
  assert.doesNotMatch(markup, /data-testid="radar-phase1-slot"/, "sem ação, sem slot");

  /*
   * O ESTADO CONTINUA VISÍVEL — o que some é a ação, não a informação.
   *
   * Zerar é ação de bancada e vive dentro da Pesquisa, alcançável por quem
   * abrir a área. A primeira camada diz que a investigação está finalizada.
   */
  assert.match(markup, /Finalizado/);
});

/* ==========  U e V · RESET LIMPA O RADAR E PRESERVA O FUNDAMENTO  ===== */

test("GATE 15.1 · U e V — zerar limpa o que é do Radar e não toca no fundamento", () => {
  const payload = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15-1",
    serpSnapshotId: "snap-1", serpSnapshotVersion: 1, serpSnapshotHash: "h", mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture"], confidence: "high", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: PAGINAS,
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    extractionFailures: [], plannerPackage: null, status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
    verifiedSources: [{ domain: "aad.org", url: "https://aad.org/x", sourceType: "PROFESSIONAL_ORGANIZATION", classificationReason: "r", confidence: "HIGH", provenance: "p", observedAt: "2026-09-10T13:00:00.000Z" }],
  });

  const zerado = buildRadarResetPayload(payload);
  assert.equal(zerado.finalizedBundle, null);
  assert.deepEqual(zerado.verifiedSources, []);
  assert.deepEqual(zerado.sourceVerificationFailures, []);
  assert.deepEqual(zerado.extractions, []);
  assert.equal(zerado.deepResearch, null);
  assert.equal(zerado.benchmark, null);

  /*
   * A IDENTIDADE PERMANECE: ela diz DE QUEM é esta linha.
   *
   * Zerar descarta o que o Radar produziu; não descarta o que o Arquiteto
   * formou — e essa fronteira está escrita em vez de apenas respeitada.
   */
  assert.equal(zerado.articleDnaVersionId, payload.articleDnaVersionId, "RESET_PRESERVES_UPSTREAM");
  assert.equal(zerado.brandId, payload.brandId);
  assert.equal(zerado.articleId, payload.articleId);

  const reset = readFileSync(new URL("../lib/radar/radar-reset.ts", import.meta.url), "utf8");
  for (const fundamento of RADAR_UPSTREAM_UNTOUCHED) {
    assert.equal(new RegExp(`${fundamento}\\s*[:=]\\s*(null|\\[\\])`).test(reset), false, `${fundamento} não é limpo pelo reset`);
  }
});

/* ==========  W e X · VÍDEOS REGISTRA, AMAZON NÃO PROMETE  ============= */

test("GATE 15.1 · W — registrar material não transcreve, não baixa e não pesquisa", () => {
  const painel = readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");

  assert.match(painel, /data-testid="radar-videos-register"/);
  /*
   * GATE 1 DE VÍDEOS · o handler mudou de nome e de destino — a garantia, não.
   *
   * `onExistingContentAdd` escrevia num `useState`; `onRegisterVideoSources`
   * manda o bloco colado para a rota canônica. O que este teste protege segue
   * idêntico: o registro nasce de um CLIQUE e não faz mais nada.
   */
  assert.match(painel, /onClick=\{\(\) => \{ onRegisterVideoSources\?\.\(articleId, raw\);/, "o registro nasce de um clique");
  assert.ok(!/onExistingContentAdd/.test(painel), "o caminho local não sobreviveu");
  /*
   * A VARREDURA É SOBRE EXECUÇÃO, NÃO SOBRE A PALAVRA.
   *
   * O próprio painel diz "nenhum download acontece aqui" — proibir o termo
   * proibiria a frase que garante o comportamento.
   */
  assert.equal(/\bfetch\(|transcribe\(|startTranscription|downloadFile|<DeepResearch|buildRadar/i.test(painel), false, "VIDEOS_REGISTER_ONLY");
  /* A rota do registro também não transcreve, não baixa e não cria job. */
  const rota = readFileSync(new URL("../app/api/editorial/radar-video-sources/route.ts", import.meta.url), "utf8");
  assert.equal(/transcribe|download|external_processing_jobs|runSharedLongSpeech|googleapis/i.test(rota), false, "VIDEOS_REGISTER_ONLY na rota");
  assert.doesNotMatch(painel, /useEffect/);

  /* E o que a área ainda não faz está escrito, não insinuado. */
  /*
   * GATE 2 · A FRASE MUDOU PORQUE O COMPORTAMENTO MUDOU.
   *
   * "nada é transcrito nem enviado" virou falso: a extração passou a existir.
   * O que a área continua devendo — e continua dizendo que deve — é o
   * casamento com a pauta, a tradução e a evidência.
   */
  assert.match(painel, /ainda não existem/);
  assert.match(painel, /O texto extraído é preservado no idioma ORIGINAL: nada é traduzido, resumido nem reescrito\./);
});

test("GATE 15.1 · X — modo sem engine não oferece ação falsa", () => {
  const amazon = radarSearchModeAvailability("AMAZON");
  assert.equal(amazon.canStart, false);
  assert.match(amazon.reason || "", /ainda não foi construída/);

  /* Com Amazon escolhido, a Fase 1 não oferece START. */
  const semEngine = radarPhase1Action({
    state: "NOT_STARTED", contextReady: true, hasPrimaryQuery: true, running: false,
    mode: "AMAZON", selected: 0, pending: 0, failed: 0, analyzed: 0,
  });
  assert.equal(semEngine.id, "NONE", "AMAZON_FALSE_ACTION_AVAILABLE = NO");
  assert.equal(semEngine.enabled, false);
  assert.equal(semEngine.blockedReason, amazon.reason);

  /* Google continua disponível — a indisponibilidade é do modo, não do fluxo. */
  assert.equal(radarSearchModeAvailability("WEB").canStart, true);
  assert.equal(radarPhase1Action({
    state: "NOT_STARTED", contextReady: true, hasPrimaryQuery: true, running: false,
    mode: "WEB", selected: 0, pending: 0, failed: 0, analyzed: 0,
  }).id, "START_RESEARCH");
});

/* ==============  Y · A PRÓXIMA AÇÃO VEM DA AUTORIDADE  ================ */

test("GATE 15.1 · Y — a tela e a planilha leem a próxima ação da mesma autoridade", () => {
  const workbench = readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  assert.match(workbench, /const acao = view\.phase1;/, "a ação primária é a da fase 1");
  assert.match(page, /radarPhase1NextAction\(deepResearch\.phase1\)/, "e a planilha lê a mesma");

  /* Nenhuma segunda decisão de "qual é a próxima ação" na tela. */
  assert.equal(/if \(view\.state === "NOT_STARTED"\) return "Iniciar/.test(workbench), false);

  const view = vista();
  assert.equal(view.phase1.id, "FINALIZE_SERP");
  assert.equal(RADAR_PHASE1_HANDLER[view.phase1.id], "FINALIZE");
});

/* ==========  §15 e §16 · A PRIMEIRA CAMADA RENDERIZADA  =============== */

test("GATE 15.1 · a primeira camada renderiza as quatro áreas e a faixa do Article", () => {
  const markup = render(modelo(vista()));

  for (const area of ["pesquisa", "videos", "especialista", "relatorio"]) {
    assert.match(markup, new RegExp(`data-testid="radar-r3-card-${area}"`), area);
  }
  assert.match(markup, /data-testid="radar-article-context-band"/);
  assert.match(markup, /skincare para pele oleosa/);

  /*
   * NENHUM PAINEL OPERACIONAL ABERTO POR PADRÃO.
   *
   * A área começa recolhida: abrir é intenção, e é o que garante que nada
   * pesado monta — nem dispara — só por a linha estar selecionada.
   */
  assert.doesNotMatch(markup, /data-testid="radar-videos-panel"/);
  assert.doesNotMatch(markup, /data-testid="radar-report-summary"/);
  assert.doesNotMatch(markup, /radar-serp-tab-action/);

  /* E a linha sem artigo selecionado não renderiza ação nenhuma. */
  const vazio = render(null);
  assert.match(vazio, /radar-r3-workbench-empty/);
  assert.doesNotMatch(vazio, /data-testid="radar-deep-research-button"/);
});
