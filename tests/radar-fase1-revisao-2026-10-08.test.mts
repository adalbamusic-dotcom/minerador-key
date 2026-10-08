import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { finalizeRadarDeepResearch, startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { freezeRadarEvidenceBundle } from "../lib/radar/investigation-finalization.ts";
import { RADAR_EXTRACTION_REDIRECT_DUPLICATE, radarExtractionAccount, radarReconcileExtractionRound } from "../lib/radar/extraction-round.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import { radarAutoFinalizePendingNotice, radarGoogleAutoFinalizeStartNote, radarPhase1WithAutoFinalize } from "../lib/radar/operational-actions.ts";
import { radarPhase1Visible, radarPhase1VisibleLabel } from "../modules/radar/radar-article-blueprint-panel.tsx";

/*
 * ====== 2026-10-08 · REVISÃO DA FASE 1 AUTOMÁTICA DO GOOGLE — OS ACHADOS, EM FIXTURE ======
 *
 * Depois da correção do "pendente eterno", a revisão adversarial achou o que
 * ainda deixava o automático parado, contando em dobro ou prometendo o que não
 * cumpre:
 *
 *   F1 · todas as candidatas falham e a amostra está vazia: nada era gravado;
 *   F2 · a extração órfã entrava no modelo e no pacote congelado;
 *   F3 · curadoria da pesquisa obsoleta + canônicas: "Finalizar pesquisa" que
 *        a prontidão recusa;
 *   F4 · o ⓘ do botão do YouTube e da Amazon prometia a regra do Google;
 *   F5 · o ⓘ do Google listava três paradas, o automático tem mais;
 *   V3 · a rota de detalhe gravava a URL final e não gravava as falhas;
 *   V4 · duas referências que terminam na mesma página contavam o conteúdo em dobro.
 *
 * Tudo aqui é fixture: nenhuma rede, nenhum provider. PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => { tentativasDeRede.push(String(entrada)); return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); },
  writable: true, configurable: true,
});

/* Teste estrutural lê o código sem comentários e com fim de linha único. */
const semComentarios = (fonte: string) =>
  fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ler = (arquivo: string) => semComentarios(readFileSync(arquivo, "utf8"));
const fatia = (fonte: string, de: string, ate: string) => {
  const inicio = fonte.indexOf(de);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.ok(inicio >= 0, `âncora "${de}"`);
  assert.ok(fim > inicio, `âncora "${ate}"`);
  return fonte.slice(inicio, fim);
};

/* ============================ a investigação, em fixture ============================ */

const TOTAL = 17;
const URLS = Array.from({ length: TOTAL }, (_, i) => `https://dominio-${i}.com.br/artigo/marketing-para-dentistas`);
const PENDENTE = URLS[TOTAL - 1];
const SEM_ACESSO = URLS.slice(11, TOTAL - 1);
const LIDAS = URLS.slice(0, 11);
const REDIRECIONADA = "https://dominio-16.com.br/blog/marketing-para-dentistas/";

const paginaLida = (url: string, i: number) => ({
  id: `page:${i}`, url, status: "success",
  fetchedAt: "2026-10-08T10:00:00.000Z", title: `Concorrente ${i}`, metaDescription: "", canonical: null,
  h1: ["Marketing para dentistas"], h2: ["Como atrair pacientes?"], h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Marketing para dentistas" }], introWordCount: 60, introText: "x", closingWordCount: 40,
  closingText: "y", hasClosing: true, emphasizedTerms: [], keywordPlacement: null, observedLinks: [], error: null,
}) as never;

const contexto = () => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-1", articleDnaContentHash: "hash", promise: "Marketing digital para dentistas", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "marketing digital para dentistas", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "dentistas" } }, semanticQualification: { versionId: "sq-1", contentHash: "h", intent: "informacional", funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["captação de pacientes"],
  resolvedKeywordTexts: ["marketing digital para dentistas"],
  silo: { siloId: "silo-1", siloName: "odonto", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
});

const snapshot = () => ({ query: "marketing digital para dentistas", organicResults: URLS.map((url, i) => ({ position: i + 1, title: `Concorrente ${i}`, domain: new URL(url).hostname, url })) });
const registro = () => startRadarDeepResearch({ context: contexto() as never, plan: buildRadarResearchQueryPlan(contexto() as never), startedBy: "ator", now: "2026-10-08T09:00:00.000Z" });

type Curadoria = "confirmada" | "obsoleta" | "ausente";

/* A releitura como `rowWorkbenchData` a monta: o registro com a curadoria automática e a amostra gravada. */
function vista(input: { extractions: unknown[]; failureUrls?: string[]; curadoria?: Curadoria; canonicalSelectedUrls?: string[]; analysisConfirmed?: boolean }) {
  const base = { context: contexto(), record: registro(), snapshot: snapshot(), observedAt: "2026-10-08T12:00:00.000Z" } as never as Parameters<typeof buildRadarDeepResearchView>[0];
  const universo = buildRadarDeepResearchView(base);
  const modo = input.curadoria || "confirmada";
  const curadoria = modo === "ausente" ? null : {
    universeFingerprint: modo === "obsoleta" ? "outro-universo" : radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-10-08T09:30:00.000Z", confirmedBy: "ator",
    references: universo.references.map(reference => ({ referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url, decision: autoDecideRadarReference(reference).decision, reason: "" })),
  };
  return buildRadarDeepResearchView({
    ...base,
    record: { ...(base as { record: ReturnType<typeof registro> }).record, researchCuration: curadoria },
    extractions: input.extractions as never,
    extractionFailures: (input.failureUrls || []).length,
    extractionFailureUrls: input.failureUrls || [],
    ...(input.canonicalSelectedUrls ? { canonicalSelectedUrls: input.canonicalSelectedUrls } : {}),
    analysisConfirmed: input.analysisConfirmed ?? true,
  } as never);
}

const congelar = (v: ReturnType<typeof vista>) => {
  const fim = finalizeRadarDeepResearch({ record: v.record, currentFingerprint: v.fingerprint, sufficiency: v.sufficiency, summary: v.summary, analyzed: v.observed.sample.analyzedSuccess, finalizedBy: "ator", now: "2026-10-08T13:00:00.000Z" });
  if (!fim.ok) throw new Error(`finalizar recusou: ${fim.reason}`);
  const resultado = freezeRadarEvidenceBundle({ readiness: v.finalization, observed: v.observed, record: fim.record, mode: fim.record.primarySearchMode, sufficiency: v.sufficiency, blueprint: v.blueprint, frozenBy: "ator", frozenAt: "2026-10-08T13:00:00.000Z" });
  if (!resultado.ok) throw new Error(`congelar recusou: ${resultado.reason}`);
  return resultado.bundle;
};

/* ======================= F1 · amostra vazia: as falhas são gravadas ======================= */

test("F1 · todas falham e a amostra está vazia: gravadas as falhas, a Fase 1 diz o caminho — não fica pendente", () => {
  const antes = vista({ extractions: [], analysisConfirmed: false });
  assert.equal(antes.phase1.id, "ANALYZE_COMPETITION");
  assert.equal(antes.sample.pending, TOTAL);
  /* As 17 candidatas falham (403); a rodada fecha cada uma como falha declarada. */
  const fechada = radarReconcileExtractionRound({
    candidates: antes.sample.pendingUrls.map((url, i) => ({ key: `ref-${i}`, url })),
    responses: [],
    failures: antes.sample.pendingUrls.map((url, i) => ({ key: `ref-${i}`, url, code: "access_blocked", message: "403", status: 403, observedAt: "2026-10-08T12:00:00.000Z" })),
    previousExtractions: [], previousFailures: [],
    selectedUrls: antes.sample.selectedUrls, observedAt: "2026-10-08T12:00:00.000Z",
  });
  assert.equal(fechada.pages.length, 0);
  assert.equal(fechada.failures.length, TOTAL);
  /* O que a versão gravada (só as falhas, sem carimbo) mostra na releitura. */
  const depois = vista({ extractions: fechada.mergedExtractions, failureUrls: fechada.failures.map(item => item.url), analysisConfirmed: false });
  assert.equal(depois.sample.pending, 0, "a página que nunca abre vira limitação declarada, não pendência eterna");
  assert.equal(depois.phase1.id, "START_RESEARCH");
  assert.equal(depois.phase1.blockedReason, `Nenhuma das ${TOTAL} página(s) selecionada(s) pôde ser acessada.`);
  /* A frase nomeia o botão da tela e onde ele está. */
  assert.equal(
    radarAutoFinalizePendingNotice("nenhuma das 17 página(s) pendente(s) pôde ser analisada", radarPhase1VisibleLabel(depois.phase1), "Pesquisa"),
    'Não finalizou sozinha: nenhuma das 17 página(s) pendente(s) pôde ser analisada. Para continuar, na área Pesquisa, botão "Refazer Pesquisa Google".',
  );
});

test("F1 · a análise grava a amostra com as falhas e PARA ali — antes da verificação de fontes, sem lançar antes de gravar", () => {
  const fonte = ler("modules/radar/radar-page.tsx");
  const analise = fatia(fonte, "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");
  /* Não lança mais por amostra vazia; só sem falha nenhuma para gravar. */
  assert.equal(/if \(!pages\.length && !retomandoConsolidacao && !membership\.reused\) throw/.test(analise), false, "a amostra vazia voltou a ser descartada");
  assert.ok(analise.includes("const semPaginaNaAmostra = !pages.length && !retomandoConsolidacao && !membership.reused;"));
  assert.ok(analise.includes("if (semPaginaNaAmostra && !rodadaFechada.failures.length) throw new Error("));
  /* A ordem: amostra (com as falhas) gravada e confirmada → para → só depois as fontes. */
  const ordem = [
    "extractionFailures: rodadaFechada.failures,",
    "versaoDaAmostra = await createRadarAnalysisSuccessor(data.analysis, amostraPayload,",
    "await pipeline.saveRadarAnalysis(target.articleId, versaoDaAmostra)",
    "if (semPaginaNaAmostra) {",
    "await analiseConfirmadaNoServidor(target)",
    'setNotice(radarAutoFinalizePendingNotice(motivo, radarPhase1VisibleLabel(fase1Relida), "Pesquisa"));',
    "return { confirmada: null, motivo };",
    "const planoDeFontes = buildRadarSourceVerificationPlan({",
  ];
  let desde = 0;
  for (const marco of ordem) {
    const posicao = analise.indexOf(marco, desde);
    assert.ok(posicao >= 0, `fora de ordem ou ausente: ${marco}`);
    desde = posicao + marco.length;
  }
});

/* ====================== F2 · a órfã não entra no modelo nem no congelado ====================== */

test("F2 · 11 lidas + 1 órfã + 6 sem acesso: o modelo, a suficiência e o pacote contam 11 — não 12", () => {
  /* A pendente redirecionou (a órfã é a URL final gravada pelo defeito) e falhou agora: ela é "sem acesso". */
  const v = vista({ extractions: [...LIDAS.map(paginaLida), paginaLida(REDIRECIONADA, 99)], failureUrls: [...SEM_ACESSO, PENDENTE] });
  assert.deepEqual([v.sample.selected, v.sample.analyzed, v.sample.failed, v.sample.pending, v.sample.orphans], [17, 11, 6, 0, 1]);
  assert.equal(v.phase1.id, "FINALIZE_SERP");
  assert.equal(v.observed.sample.analyzedSuccess, 11, "a órfã era contada como analisada");
  assert.equal(v.observed.sample.failedFinal, 6);
  assert.equal(v.sufficiency.analyzed, 11);
  assert.equal(v.summary.pagesAnalyzed, 11);
  const bundle = congelar(v);
  assert.equal(bundle.sample.analyzedSuccess, 11);
  assert.equal(bundle.sample.failedFinal, 6);
  assert.equal(bundle.sample.analyzedSuccess + bundle.sample.failedFinal, v.sample.selected, "a conta do congelado fecha com a seleção");
  assert.equal(bundle.sample.extractionIds.length, 11);
});

test("F2 · sem página nenhuma na amostra, a leitura continua mostrando o que há (cache), como antes", () => {
  const v = vista({ extractions: [paginaLida(REDIRECIONADA, 99)], failureUrls: [] });
  assert.equal(v.sample.analyzed, 0);
  assert.equal(v.sample.orphans, 1);
  assert.equal(v.observed.sample.analyzedSuccess, 1);
  assert.equal(v.summary.pagesAnalyzed, 1);
});

/* ============ F3 · curadoria obsoleta/ausente: a Fase 1 não oferece o que a prontidão recusa ============ */

test("F3 · com a curadoria da pesquisa obsoleta ou ausente, as canônicas extraídas não levam a um 'Finalizar' recusado", () => {
  const canonicas = URLS.slice(0, 3);
  const extraidas = canonicas.map(paginaLida);
  for (const curadoria of ["obsoleta", "ausente"] as const) {
    const sem = vista({ extractions: extraidas, curadoria });
    const com = vista({ extractions: extraidas, curadoria, canonicalSelectedUrls: canonicas });
    assert.equal(com.sufficiency.level, "BLOCKED", `${curadoria}: a suficiência só conhece a curadoria confirmada`);
    assert.ok(com.phase1.id !== "FINALIZE_SERP" || com.finalization.canFinalize, `${curadoria}: a Fase 1 ofereceu um botão que a prontidão recusa`);
    /* A conta volta a ser a de antes desta entrega — e o caminho, refazer. */
    assert.deepEqual([com.phase1.id, com.phase1.label], [sem.phase1.id, sem.phase1.label], curadoria);
    assert.equal(com.phase1.label, "Refazer Pesquisa Google");
  }
  /* Com a curadoria CONFIRMADA, as canônicas continuam na mesma régua da análise. */
  const confirmada = vista({ extractions: LIDAS.map(paginaLida), failureUrls: SEM_ACESSO, canonicalSelectedUrls: ["https://canonica-fora.com.br/guia"] });
  assert.ok(confirmada.sample.pendingUrls.includes("https://canonica-fora.com.br/guia"));
});

/* ============ F4 · o ⓘ do YouTube e da Amazon não promete a regra do Google ============ */

test("F4 · 'Iniciar Pesquisa YouTube/Amazon' diz a regra do próprio perfil; só o Google diz 'não seguram'", () => {
  const acao = (mode: "WEB" | "YOUTUBE" | "AMAZON") => radarPhase1Action({ state: "NOT_STARTED", mode, contextReady: true, hasPrimaryQuery: true, running: false, selected: 0, pending: 0, failed: 0, analyzed: 0 });
  for (const mode of ["YOUTUBE", "AMAZON"] as const) {
    const visivel = radarPhase1Visible(acao(mode), mode);
    assert.equal(visivel.id, "START_RESEARCH");
    assert.match(visivel.label, mode === "YOUTUBE" ? /YouTube$/ : /Amazon$/);
    assert.equal(/não seguram/.test(visivel.info || ""), false, `${mode}: prometeu a regra do Google`);
    assert.match(visivel.info || "", /Com pendência, nada congela/, `${mode}: a regra D9 do perfil`);
    /* A análise do perfil também: o rótulo diz o custo, o ⓘ diz a regra dele. */
    const analisar = radarPhase1WithAutoFinalize({ id: "ANALYZE_COMPETITION", label: "Analisar concorrência", info: null }, mode);
    assert.equal(/não seguram/.test(analisar.info || ""), false, `${mode}: análise`);
  }
  const google = radarPhase1Visible(acao("WEB"));
  assert.ok((google.info || "").includes(radarGoogleAutoFinalizeStartNote()), "o Google diz a regra nova");
  assert.deepEqual(radarPhase1Visible(acao("WEB"), "WEB"), google, "sem modo, é o Google — como antes");
});

test("F4 · a tela passa o modo da investigação ao botão, nos dois lugares em que ele aparece", () => {
  const bancada = ler("modules/radar/radar-r3-workbench.tsx");
  const botao = fatia(bancada, "function Phase1Button(", "function RecoverSerpAction(");
  assert.ok(botao.includes("const acao = radarPhase1Visible(daFase1, mode);"));
  const pesquisa = fatia(bancada, "function DeepResearch(", "function Phase1Slot(");
  const slot = fatia(bancada, "function Phase1Slot(", "export function RadarR3Workbench(");
  for (const [nome, trecho] of [["DeepResearch", pesquisa], ["Phase1Slot", slot]] as const) {
    assert.ok(trecho.includes("<Phase1Button acao={acao} mode={view.record?.primarySearchMode || searchMode} busy={busy} onTrigger={disparar} />"), `${nome}: o botão sem o modo`);
  }
  const workbench = bancada.slice(bancada.indexOf("export function RadarR3Workbench("));
  assert.match(workbench, /<Phase1Slot\s+view=\{model\.deepResearch\}\s+busy=\{[^}]+\}\s+searchMode=\{searchMode\}/, "a barra recolhida recebe o modo");
});

/* ============ F5 · o ⓘ do Google lista todas as paradas do automático ============ */

test("F5 · o ⓘ do Google diz TODAS as paradas — as da decisão e as do automático", () => {
  const nota = radarGoogleAutoFinalizeStartNote();
  for (const parada of [
    "intenção da SERP em conflito com a declarada",
    "nenhuma página lida",
    "fundamento do artigo mudado",
    "consulta paga ainda faltando",
    "página que segue sem desfecho depois da leitura extra",
    "gravação ou a releitura do servidor não confirmadas",
  ]) assert.ok(nota.includes(parada), `o ⓘ não diz: ${parada}`);
  assert.equal(/Só param/.test(nota), false, "a lista curta antiga não volta");
});

/* ============ V4 · duas referências, uma página: o conteúdo entra uma vez ============ */

test("V4 · A redireciona para B, e B foi lida agora pela própria URL: A vira limitação declarada, B fica", () => {
  const [a, b] = [URLS[0], URLS[1]];
  const fechada = radarReconcileExtractionRound({
    candidates: [{ key: "A", url: a }, { key: "B", url: b }],
    responses: [
      { key: "A", requestedUrl: a, page: paginaLida(b, 0) as never },
      { key: "B", requestedUrl: b, page: paginaLida(b, 1) as never },
    ],
    failures: [], previousExtractions: [], previousFailures: [],
    selectedUrls: [a, b], observedAt: "2026-10-08T12:00:00.000Z",
  });
  assert.deepEqual(fechada.pages.map(page => page.url), [b]);
  assert.deepEqual(fechada.failures.map(item => [item.url, item.code]), [[a, RADAR_EXTRACTION_REDIRECT_DUPLICATE]]);
  assert.match(fechada.failures[0].message, /redireciona para https:\/\/dominio-1\.com\.br/);
  const conta = radarExtractionAccount({ selectedUrls: [a, b], extractionUrls: fechada.mergedExtractions.map(page => page.url), failureUrls: fechada.failures.map(item => item.url) });
  assert.deepEqual([conta.analyzed, conta.failed, conta.pending, conta.orphans], [1, 1, 0, 0]);
  assert.equal(fechada.mergedExtractions.length, 1, "o conteúdo de B não entra em dobro");
});

test("V4 · duas referências que terminam na mesma página FORA da seleção: a primeira fica com ela", () => {
  const [a, c] = [URLS[0], URLS[2]];
  const destino = "https://agregador.com.br/marketing";
  const fechada = radarReconcileExtractionRound({
    candidates: [{ key: "A", url: a }, { key: "C", url: c }],
    responses: [
      { key: "A", requestedUrl: a, page: paginaLida(destino, 0) as never },
      { key: "C", requestedUrl: c, page: paginaLida(destino, 1) as never },
    ],
    failures: [], previousExtractions: [], previousFailures: [],
    selectedUrls: [a, c], observedAt: "2026-10-08T12:00:00.000Z",
  });
  assert.deepEqual(fechada.pages.map(page => page.url), [a]);
  assert.deepEqual(fechada.failures.map(item => [item.url, item.code]), [[c, RADAR_EXTRACTION_REDIRECT_DUPLICATE]]);
});

test("V4 · A redireciona para B e B FALHOU: A fica com o conteúdo (uma vez só, nada em dobro)", () => {
  const [a, b] = [URLS[0], URLS[1]];
  const fechada = radarReconcileExtractionRound({
    candidates: [{ key: "A", url: a }, { key: "B", url: b }],
    responses: [{ key: "A", requestedUrl: a, page: paginaLida(b, 0) as never }],
    failures: [{ key: "B", url: b, code: "access_blocked", message: "403", status: 403, observedAt: "2026-10-08T12:00:00.000Z" }],
    previousExtractions: [], previousFailures: [],
    selectedUrls: [a, b], observedAt: "2026-10-08T12:00:00.000Z",
  });
  assert.deepEqual(fechada.pages.map(page => page.url), [a]);
  assert.deepEqual(fechada.failures.map(item => item.code), ["access_blocked"]);
});

/* ============ V3 · a rota de detalhe fecha a rodada por chave ============ */

test("V3 · /radar/{articleId}: 'Analisar páginas selecionadas' fecha a rodada por chave e grava as falhas", () => {
  const detalhe = ler("modules/radar/radar-analysis-page.tsx");
  const extrair = fatia(detalhe, "const extractSelected = async", "const approve = async");
  assert.equal(extrair.includes("map((item: { page: unknown }) => item.page)"), false, "a URL final do extrator voltou a entrar crua");
  assert.ok(extrair.includes("const rodada = radarReconcileExtractionRound({"));
  assert.ok(extrair.includes("RadarExtractionPageSchema.safeParse(item.page)"), "a página recusada pelo contrato vira falha, não some");
  assert.ok(extrair.includes("previousFailures: analysis.payload.extractionFailures,"));
  assert.ok(extrair.includes("extractions: rodada.mergedExtractions, extractionFailures: rodada.failures,"));
  /* V6 · higiene: o espaço depois do "=" voltou. */
  assert.ok(detalhe.includes("const emptyRemoteExpertEvidence: RemoteExpertEvidenceState = { selectionKey"));
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
