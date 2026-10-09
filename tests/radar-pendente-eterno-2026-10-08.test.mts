import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { finalizeRadarDeepResearch, startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import {
  freezeRadarEvidenceBundle,
  radarAuxiliaryFailureLimitation,
  radarFinalizationReadiness,
  radarGoogleAutoFinalizeDecision,
} from "../lib/radar/investigation-finalization.ts";
import { radarNormalizedUrl } from "../lib/radar/research-reference.ts";
import { extractCompetitorPage } from "../lib/radar/competitor-extractor.ts";
import { RADAR_EXTRACTION_NO_OUTCOME, RADAR_EXTRACTION_REDIRECT_DUPLICATE, radarExtractionAccount, radarReconcileExtractionRound } from "../lib/radar/extraction-round.ts";
import { buildRadarAnalysisMembership } from "../lib/radar/analysis-membership.ts";
import { radarAnalysisCandidates } from "../lib/radar/serp-curation.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import {
  RADAR_AUTO_FINALIZE_DONE_NOTICE,
  radarAutoFinalizeDoneNotice,
  radarAutoFinalizePendingNotice,
} from "../lib/radar/operational-actions.ts";
import { radarPhase1Visible, radarPhase1VisibleLabel } from "../modules/radar/radar-article-blueprint-panel.tsx";

/*
 * ====== 2026-10-08 · O PENDENTE ETERNO DA FASE 1 DO GOOGLE ======
 *
 * O caso do dono, em fixture: "Analisar concorrência · e finaliza (+ 1 chamada
 * de IA)" terminou com "17 selecionada(s) · 11 reutilizada(s) · 1 analisada(s)
 * agora · 5 sem acesso" e, logo depois, "Não finalizou sozinha: a próxima
 * etapa ainda é 'Analisar concorrência'. Revise e use 'Finalizar pesquisa'".
 *
 * A página lida voltava do extrator com a URL FINAL (redirect, acento como
 * %C3%B3, "/" na raiz) e a releitura a contava como "fora da seleção" — a
 * referência ficava pendente para sempre e cada clique relia a mesma página.
 *
 * Tudo aqui é fixture: nenhum provider, nenhuma rede. PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

/* Teste estrutural lê o código sem comentários e com fim de linha único. */
const semComentarios = (fonte: string) =>
  fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
const pagina = () => semComentarios(readFileSync("modules/radar/radar-page.tsx", "utf8"));
const fatia = (fonte: string, de: string, ate: string) => {
  const inicio = fonte.indexOf(de);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.ok(inicio >= 0, `âncora "${de}"`);
  assert.ok(fim > inicio, `âncora "${ate}"`);
  return fonte.slice(inicio, fim);
};

/* ======================= a investigação do dono, em fixture ======================= */

const TOTAL = 17;
const URLS = Array.from({ length: TOTAL }, (_, i) => `https://dominio-${i}.com.br/artigo/marketing-para-dentistas`);
/* A pendente da rodada: a 17ª. As 5 anteriores são as "sem acesso". */
const PENDENTE = TOTAL - 1;
const SEM_ACESSO = URLS.slice(11, PENDENTE);
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

const snapshot = (urls: string[]) => ({ query: "marketing digital para dentistas", organicResults: urls.map((url, i) => ({ position: i + 1, title: `Concorrente ${i}`, domain: new URL(url).hostname, url })) });
const registro = () => startRadarDeepResearch({ context: contexto() as never, plan: buildRadarResearchQueryPlan(contexto() as never), startedBy: "ator", now: "2026-10-08T09:00:00.000Z" });

/* O START grava a curadoria automática; a releitura monta a view sobre ela — como `rowWorkbenchData`. */
function vista(input: { urls?: string[]; extractions: unknown[]; failureUrls?: string[]; analysisConfirmed?: boolean }) {
  const urls = input.urls || URLS;
  const base = { context: contexto(), record: registro(), snapshot: snapshot(urls), observedAt: "2026-10-08T12:00:00.000Z" } as never as Parameters<typeof buildRadarDeepResearchView>[0];
  const universo = buildRadarDeepResearchView(base);
  const curadoria = {
    universeFingerprint: radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-10-08T09:30:00.000Z", confirmedBy: "ator",
    references: universo.references.map(reference => ({ referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url, decision: autoDecideRadarReference(reference).decision, reason: "" })),
  };
  return buildRadarDeepResearchView({
    ...base,
    record: { ...(base as { record: ReturnType<typeof registro> }).record, researchCuration: curadoria },
    extractions: input.extractions as never,
    extractionFailures: (input.failureUrls || []).length,
    extractionFailureUrls: input.failureUrls || [],
    analysisConfirmed: input.analysisConfirmed ?? true,
  } as never);
}

const decisao = (v: ReturnType<typeof vista>) =>
  radarGoogleAutoFinalizeDecision({ phase1: v.phase1, finalization: v.finalization, sufficiency: v.sufficiency, auxiliaryFailed: v.resumption.auxiliaryFailed });

const falha = (url: string, key: string) => ({ key, url, code: "access_blocked", message: "403", status: 403, observedAt: "2026-10-08T10:00:00.000Z" });

/*
 * A rodada como o handler a monta: candidatas = pendentes + sem acesso (que
 * voltam para nova tentativa), pela chave do servidor (o `referenceId`).
 */
function rodadaDoDono(input: { finalDaPendente: string; anteriores?: unknown[]; urls?: string[] }) {
  const urls = input.urls || URLS;
  const antes = vista({ urls, extractions: input.anteriores || LIDAS.map(paginaLida), failureUrls: SEM_ACESSO });
  const chaveDe = new Map(antes.references.map(reference => [reference.normalizedUrl, reference.referenceId]));
  const alvo = [...antes.sample.pendingUrls, ...antes.sample.failedUrls];
  const candidatas = alvo.map(url => ({ key: chaveDe.get(radarNormalizedUrl(url))!, url }));
  const pendente = antes.sample.pendingUrls[0]!;
  const fechada = radarReconcileExtractionRound({
    candidates: candidatas,
    responses: [{ key: chaveDe.get(radarNormalizedUrl(pendente))!, requestedUrl: pendente, page: paginaLida(input.finalDaPendente, PENDENTE) }],
    failures: antes.sample.failedUrls.map(url => falha(url, chaveDe.get(radarNormalizedUrl(url))!)),
    previousExtractions: (input.anteriores || LIDAS.map(paginaLida)) as never,
    previousFailures: SEM_ACESSO.map((url, i) => falha(url, `antiga-${i}`)),
    selectedUrls: antes.sample.selectedUrls,
    observedAt: "2026-10-08T12:00:00.000Z",
  });
  const depois = vista({ urls, extractions: fechada.mergedExtractions, failureUrls: fechada.failures.map(item => item.url) });
  return { antes, fechada, depois };
}

/* ============================ o defeito, nomeado ============================ */

test("O DEFEITO · a página gravada com a URL FINAL deixa a referência pendente para sempre", () => {
  /* Controle: com a URL pedida, a conta fecha e a Fase 1 vai para FINALIZE. */
  const controle = vista({ extractions: [...LIDAS.map(paginaLida), paginaLida(URLS[PENDENTE], PENDENTE)], failureUrls: SEM_ACESSO });
  assert.equal(controle.phase1.id, "FINALIZE_SERP");

  /* Com a URL final (como o handler gravava), a mesma página vira pendente + órfã. */
  const comFinal = vista({ extractions: [...LIDAS.map(paginaLida), paginaLida(REDIRECIONADA, PENDENTE)], failureUrls: SEM_ACESSO });
  assert.equal(comFinal.phase1.id, "ANALYZE_COMPETITION");
  assert.equal(comFinal.sample.pending, 1);
  assert.equal(comFinal.sample.orphans, 1, "a assinatura no banco: 1 extração fora da seleção atual");
  assert.equal(decisao(comFinal).reason, 'A próxima etapa ainda é "Analisar concorrência".', "a frase que o dono viu");

  /* `radarNormalizedUrl` não absorve percent-encoding — e não deve mudar (referenceId e fingerprint dependem dela). */
  const comAcento = "https://dominio-16.com.br/artigo/marketing-odontológico";
  assert.notEqual(radarNormalizedUrl(comAcento), radarNormalizedUrl(new URL(comAcento).toString()));
});

test("EXTRATOR REAL · page.url é a URL final do redirect, não a pedida (fetch e DNS em stub)", async () => {
  const pedida = URLS[PENDENTE];
  const html = `<html><head><title>T</title></head><body><h1>Marketing para dentistas</h1><p>${"palavra ".repeat(80)}</p></body></html>`;
  const fetchImpl = (async (url: URL | string) => {
    if (String(url) === pedida) return new Response(null, { status: 301, headers: { location: "/blog/marketing-para-dentistas/" } });
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  }) as typeof fetch;
  const lookupImpl = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;
  const page = await extractCompetitorPage(pedida, { fetchImpl, lookupImpl, now: "2026-10-08T10:00:00.000Z" });
  /* É por isso que a rodada fecha pela chave: a URL que volta não é a da seleção. */
  assert.equal(page.url, REDIRECIONADA);
});

/* ======================== o caso do dono, corrigido ======================== */

for (const [nome, finalDaPendente] of [
  ["redirect para outro caminho", REDIRECIONADA],
  ["mesma URL", URLS[PENDENTE]],
] as const) {
  test(`CASO DO DONO (${nome}) · a rodada fecha por chave e a Fase 1 vai a FINALIZE — o automático finaliza`, () => {
    const { antes, fechada, depois } = rodadaDoDono({ finalDaPendente });

    /* Antes: a conta que o dono viu — 17 = 11 + 5 + 1 pendente, e o botão é "Analisar concorrência". */
    assert.equal(antes.sample.selected, TOTAL);
    assert.deepEqual([antes.sample.analyzed, antes.sample.failed, antes.sample.pending], [11, 5, 1]);
    assert.equal(antes.phase1.id, "ANALYZE_COMPETITION");

    /* A página entra com a URL que a seleção pediu. */
    assert.deepEqual(fechada.pages.map(page => page.url), [URLS[PENDENTE]]);

    /* Depois: a MESMA régua da análise e da Fase 1 — nada pendente, nada órfão, conta fechada. */
    assert.equal(depois.sample.selected, TOTAL);
    assert.deepEqual([depois.sample.analyzed, depois.sample.failed, depois.sample.pending, depois.sample.orphans], [12, 5, 0, 0]);
    assert.equal(depois.sample.consistent, true);
    assert.equal(depois.phase1.id, "FINALIZE_SERP");
    const auto = decisao(depois);
    assert.equal(auto.autoFinalize, true, auto.reason);

    /* A frase da rodada sai da mesma função: 17 · 11 reutilizadas · 1 agora · 5 sem acesso · 0 sem desfecho. */
    const frase = radarExtractionAccount({
      selectedUrls: antes.sample.selectedUrls,
      extractionUrls: fechada.mergedExtractions.map(page => (page as { url: string }).url),
      failureUrls: fechada.failures.map(item => item.url),
    });
    assert.deepEqual([frase.selected, frase.analyzed - antes.sample.analyzed, frase.failed, frase.pending], [17, 1, 5, 0]);
  });
}

test("CASO DO DONO · acento no caminho: o extrator devolve %C3%B3 e a amostra guarda a URL da seleção", () => {
  const comAcento = [...URLS.slice(0, PENDENTE), "https://dominio-16.com.br/artigo/marketing-odontológico"];
  const { depois, fechada } = rodadaDoDono({ urls: comAcento, finalDaPendente: new URL(comAcento[PENDENTE]).toString() });
  assert.equal(fechada.pages[0].url, comAcento[PENDENTE]);
  assert.equal(depois.sample.pending, 0);
  assert.equal(depois.phase1.id, "FINALIZE_SERP");
});

test("DADO LEGADO · a órfã que o defeito gravou sai na primeira rodada, e a página não conta duas vezes", () => {
  /* O banco do dono: 11 lidas + a órfã (URL final da 17ª), e a 17ª pendente. */
  const anteriores = [...LIDAS.map(paginaLida), paginaLida(REDIRECIONADA, 99)];
  const { antes, fechada, depois } = rodadaDoDono({ finalDaPendente: REDIRECIONADA, anteriores });
  assert.equal(antes.sample.orphans, 1);
  assert.deepEqual(fechada.removedOrphans, [REDIRECIONADA]);
  assert.equal(fechada.mergedExtractions.length, 12, "11 + a relida; a órfã saiu");
  assert.equal(depois.sample.orphans, 0);
  assert.equal(depois.phase1.id, "FINALIZE_SERP");
});

test("DADO LEGADO · a URL final que é OUTRA referência selecionada não é apagada — e o conteúdo dela não entra em dobro", () => {
  /* A pendente redireciona para a página de outra referência já lida: aquela continua na amostra. */
  const destino = LIDAS[0];
  const { fechada, depois } = rodadaDoDono({ finalDaPendente: destino });
  assert.deepEqual(fechada.removedOrphans, []);
  assert.ok(fechada.mergedExtractions.some(page => (page as { url: string }).url === destino));
  /*
   * 2026-10-08 · revisão: gravar a pendente com a URL pedida e o conteúdo do
   * destino punha a MESMA página duas vezes no modelo (12 registros, 11
   * conteúdos). A repetida vira limitação declarada, com o destino dito.
   */
  assert.equal(fechada.mergedExtractions.length, 11, "o conteúdo do destino entra uma vez só");
  const repetida = fechada.failures.find(item => item.url === URLS[PENDENTE]);
  assert.equal(repetida?.code, RADAR_EXTRACTION_REDIRECT_DUPLICATE);
  assert.ok(repetida?.message.includes(destino));
  assert.deepEqual([depois.sample.analyzed, depois.sample.failed, depois.sample.pending], [11, 6, 0]);
  assert.equal(depois.phase1.id, "FINALIZE_SERP");
});

/* ================= sem resposta e recusada pelo contrato ================= */

test("NO_OUTCOME · candidata sem página nem erro, ou com página recusada pelo contrato, vira falha declarada", () => {
  const antes = vista({ extractions: LIDAS.map(paginaLida), failureUrls: SEM_ACESSO });
  const chaveDe = new Map(antes.references.map(reference => [reference.normalizedUrl, reference.referenceId]));
  const pendente = antes.sample.pendingUrls[0]!;
  const semNada = radarReconcileExtractionRound({
    candidates: [{ key: chaveDe.get(radarNormalizedUrl(pendente))!, url: pendente }],
    responses: [], failures: [],
    previousExtractions: LIDAS.map(paginaLida), previousFailures: SEM_ACESSO.map((url, i) => falha(url, `f${i}`)),
    selectedUrls: antes.sample.selectedUrls, observedAt: "2026-10-08T12:00:00.000Z",
  });
  assert.equal(semNada.failures.at(-1)?.code, RADAR_EXTRACTION_NO_OUTCOME);
  assert.equal(semNada.failures.at(-1)?.url, pendente);
  assert.match(semNada.failures.at(-1)?.message || "", /não devolveu página nem erro/);

  const recusada = radarReconcileExtractionRound({
    candidates: [{ key: chaveDe.get(radarNormalizedUrl(pendente))!, url: pendente }],
    responses: [{ key: chaveDe.get(radarNormalizedUrl(pendente))!, requestedUrl: pendente, page: null }], failures: [],
    previousExtractions: LIDAS.map(paginaLida), previousFailures: SEM_ACESSO.map((url, i) => falha(url, `f${i}`)),
    selectedUrls: antes.sample.selectedUrls, observedAt: "2026-10-08T12:00:00.000Z",
  });
  assert.equal(recusada.failures.at(-1)?.code, RADAR_EXTRACTION_NO_OUTCOME);
  assert.match(recusada.failures.at(-1)?.message || "", /não passou no contrato de extração/);

  for (const fechada of [semNada, recusada]) {
    const depois = vista({ extractions: fechada.mergedExtractions, failureUrls: fechada.failures.map(item => item.url) });
    assert.equal(depois.sample.pending, 0, "a página que nunca é lida vira limitação, não pendência eterna");
    assert.equal(depois.phase1.id, "FINALIZE_SERP");
    assert.equal(decisao(depois).autoFinalize, true);
  }
});

/* ============= a rodada extra só relê a pendente — e herda as falhas ============= */

test("RODADA EXTRA · lendo só a pendente, as 5 sem acesso continuam desfecho (herdadas), não voltam a pendente", () => {
  const antes = vista({ extractions: LIDAS.map(paginaLida), failureUrls: SEM_ACESSO });
  const chaveDe = new Map(antes.references.map(reference => [reference.normalizedUrl, reference.referenceId]));
  const pendente = antes.sample.pendingUrls[0]!;
  const extra = radarReconcileExtractionRound({
    candidates: [{ key: chaveDe.get(radarNormalizedUrl(pendente))!, url: pendente }],
    responses: [{ key: chaveDe.get(radarNormalizedUrl(pendente))!, requestedUrl: pendente, page: paginaLida(REDIRECIONADA, PENDENTE) }],
    failures: [],
    previousExtractions: LIDAS.map(paginaLida),
    previousFailures: SEM_ACESSO.map((url, i) => falha(url, `f${i}`)),
    selectedUrls: antes.sample.selectedUrls, observedAt: "2026-10-08T12:00:00.000Z",
  });
  assert.equal(extra.failures.length, 5, "as cinco falhas anteriores seguem gravadas");
  const depois = vista({ extractions: extra.mergedExtractions, failureUrls: extra.failures.map(item => item.url) });
  assert.deepEqual([depois.sample.analyzed, depois.sample.failed, depois.sample.pending], [12, 5, 0]);
  assert.equal(depois.phase1.id, "FINALIZE_SERP");
});

test("RODADA NORMAL · a falha anterior tentada de novo não é herdada duas vezes", () => {
  const { fechada } = rodadaDoDono({ finalDaPendente: URLS[PENDENTE] });
  assert.equal(fechada.failures.length, 5, "as 5 desta rodada; as antigas, retentadas, não se repetem");
  assert.deepEqual(new Set(fechada.failures.map(item => item.url)), new Set(SEM_ACESSO));
});

/* ================= as canônicas: identidade por URL normalizada ================= */

const canon = ["https://a.com.br/p1", "https://b.com.br/p2", "https://c.com.br"];
const serpView = () => ({
  record: { id: "s1" }, version: 1, provider: "dataforseo", hash: "h".repeat(64), capturedAt: "2026-10-08T10:00:00.000Z", source: "merged", partial: false,
  organicResults: canon.map((url, i) => ({ position: i + 1, url, title: `P${i}`, domain: new URL(url).hostname, snippet: "", inferredType: "article", isOwnDomain: false })),
  peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
  diagnostic: { dominantIntent: "informacional", dominantFormats: [], frequentEntities: [], possibleConflicts: [], limitations: [], questions: [], opportunities: [], recurringTitlePatterns: [] },
}) as never;
const analise = (extraidas: string[]) => ({
  versionId: "v1", versionNumber: 2,
  payload: {
    brandId: "b", articleId: "a", articleDnaVersionId: "d", serpSnapshotId: "s1", serpSnapshotVersion: 1, serpSnapshotHash: "h".repeat(64),
    serpDecisions: canon.map((url, i) => ({ key: `organic:${i + 1}`, itemType: "organic", decision: "included", reason: "", note: "", ownDomain: false, url })),
    extractions: extraidas.map((url, i) => ({ id: `p${i}`, url, status: "success" })), extractionFailures: [],
  },
}) as never;
const escopo = { brandId: "b", articleId: "a", articleDnaVersionId: "d" };

test("CANÔNICAS · a home lida como 'https://c.com.br/' e as variantes www/http não voltam como candidatas", () => {
  for (const extraidas of [
    ["https://a.com.br/p1", "https://b.com.br/p2", new URL("https://c.com.br").toString()],
    ["http://www.a.com.br/p1/", "https://www.b.com.br/p2?utm=x", "https://www.c.com.br/"],
  ]) {
    const conta = buildRadarAnalysisMembership({ view: serpView(), analysis: analise(extraidas), scope: escopo });
    assert.equal(radarAnalysisCandidates(serpView(), analise(extraidas), escopo).length, 0, `relia ${JSON.stringify(extraidas)}`);
    assert.equal(conta.selected, conta.reused + conta.failed + conta.pending);
    assert.deepEqual([conta.reused, conta.pending, conta.orphanExtractions], [3, 0, 0]);
  }
});

test("UMA RÉGUA · a Fase 1 conta também as canônicas que a análise lê", () => {
  const sem = vista({ extractions: [...LIDAS.map(paginaLida), paginaLida(URLS[PENDENTE], PENDENTE)], failureUrls: SEM_ACESSO });
  const fora = "https://canonica-fora-da-pesquisa.com.br/guia";
  const comCanonica = buildRadarDeepResearchView({
    ...({ context: contexto(), record: { ...registro(), researchCuration: {
      universeFingerprint: radarResearchUniverseFingerprint(sem.references), confirmedAt: "2026-10-08T09:30:00.000Z", confirmedBy: "ator",
      references: sem.references.map(reference => ({ referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url, decision: autoDecideRadarReference(reference).decision, reason: "" })),
    } }, snapshot: snapshot(URLS), observedAt: "2026-10-08T12:00:00.000Z" } as never as Parameters<typeof buildRadarDeepResearchView>[0]),
    extractions: [...LIDAS.map(paginaLida), paginaLida(URLS[PENDENTE], PENDENTE)] as never,
    extractionFailureUrls: SEM_ACESSO,
    canonicalSelectedUrls: [fora, URLS[0]],
    analysisConfirmed: true,
  });
  /* A duplicata (URLS[0]) conta uma vez; a canônica nova entra pendente — e a análise a lê. */
  assert.equal(comCanonica.sample.selected, sem.sample.selected + 1);
  assert.deepEqual(comCanonica.sample.pendingUrls, [fora]);
  assert.equal(comCanonica.phase1.id, "ANALYZE_COMPETITION");
});

/* ============== a decisão do dono: finaliza com a limitação escrita ============== */

test("STALE, já finalizada e nada lido continuam parando — a prontidão é quem recusa", () => {
  const sufic = { level: "SUFFICIENT", headline: "Leitura de mercado", reasons: [] } as never;
  const fase1 = radarPhase1Action({ state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false, selected: 12, pending: 0, failed: 0, analyzed: 12, analysisConfirmed: true, sufficiency: sufic });
  for (const recusa of [
    { stale: true, alreadyFinalized: false, analyzed: 12 },
    { stale: false, alreadyFinalized: true, analyzed: 12 },
    { stale: false, alreadyFinalized: false, analyzed: 0 },
  ]) {
    const finalization = radarFinalizationReadiness({ started: true, pending: 0, failed: 0, sufficiency: sufic, ...recusa });
    assert.equal(radarGoogleAutoFinalizeDecision({ phase1: fase1, finalization, sufficiency: sufic }).autoFinalize, false, JSON.stringify(recusa));
  }
});

test("O BUNDLE · a consulta auxiliar que falhou vai às limitações; sem ela o bundle é o de antes (hash igual)", () => {
  const v = vista({ extractions: [...LIDAS.map(paginaLida), paginaLida(URLS[PENDENTE], PENDENTE)], failureUrls: SEM_ACESSO });
  const fim = finalizeRadarDeepResearch({ record: v.record, currentFingerprint: v.fingerprint, sufficiency: v.sufficiency, summary: v.summary, analyzed: v.observed.sample.analyzedSuccess, finalizedBy: "ator", now: "2026-10-08T13:00:00.000Z" });
  assert.ok(fim.ok);
  if (!fim.ok) return;
  const congelar = (extra?: string[]) => freezeRadarEvidenceBundle({
    readiness: v.finalization, observed: v.observed, record: fim.record, mode: fim.record.primarySearchMode,
    sufficiency: v.sufficiency, blueprint: v.blueprint, frozenBy: "ator", frozenAt: "2026-10-08T13:00:00.000Z",
    ...(extra ? { extraLimitations: extra } : {}),
  });
  const antigo = congelar();
  const vazio = congelar([]);
  const comFalha = congelar(radarAuxiliaryFailureLimitation([{ keyword: "marketing odontológico" }, { keyword: null }]));
  assert.ok(antigo.ok && vazio.ok && comFalha.ok);
  if (!antigo.ok || !vazio.ok || !comFalha.ok) return;
  assert.equal(vazio.bundle.bundleHash, antigo.bundle.bundleHash, "sem limitação extra, o bundle não muda");
  assert.notEqual(comFalha.bundle.bundleHash, antigo.bundle.bundleHash);
  assert.ok(comFalha.bundle.limitations.includes('2 consulta(s) auxiliar(es) do plano falharam na coleta ("marketing odontológico"); o universo competitivo foi montado sem elas.'));
  assert.deepEqual(radarAuxiliaryFailureLimitation(0), []);
});

test("A FRASE DE SUCESSO · sem limitação é a de sempre; com limitação, diz qual", () => {
  assert.equal(radarAutoFinalizeDoneNotice([]), RADAR_AUTO_FINALIZE_DONE_NOTICE);
  assert.match(radarAutoFinalizeDoneNotice(["amostra insuficiente (Apenas 1 página comparável)"]),
    /^Finalizada sozinha com limitação registrada: amostra insuficiente \(Apenas 1 página comparável\)\. A IA está organizando/);
});

/* ============== a frase de parada nomeia o botão da tela, e onde ============== */

const acaoDaFase1 = (entrada: { pending: number; analyzed: number; analysisConfirmed?: boolean }) =>
  radarPhase1Action({ state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false, selected: 12, failed: 0, ...entrada });

test("O BOTÃO VISÍVEL · a frase usa a mesma montagem do botão da Fase 1", () => {
  /* 2026-10-09 (correção) · os rótulos dizem o teto real do custo (até 2 chamadas de IA). */
  assert.equal(radarPhase1VisibleLabel(acaoDaFase1({ pending: 1, analyzed: 11 })), "Analisar concorrência · e finaliza (+ até 2 chamadas de IA)");
  assert.equal(radarPhase1VisibleLabel(acaoDaFase1({ pending: 0, analyzed: 11, analysisConfirmed: false })), "Concluir análise · e finaliza (+ até 2 chamadas de IA)");
  assert.equal(radarPhase1VisibleLabel(acaoDaFase1({ pending: 0, analyzed: 12, analysisConfirmed: true })), "Finalizar pesquisa · inclui até 2 chamadas de IA");
  assert.equal(radarPhase1VisibleLabel(radarPhase1Action({ state: "FINALIZED", contextReady: true, hasPrimaryQuery: true, running: false, selected: 12, pending: 0, failed: 0, analyzed: 12 })), null, "NONE: nenhum botão prometido");
  assert.equal(radarPhase1VisibleLabel({ ...acaoDaFase1({ pending: 1, analyzed: 11 }), enabled: false }), null, "desabilitado: nenhum botão prometido");
  assert.equal(radarPhase1VisibleLabel(null), null);
  const visivel = radarPhase1Visible(acaoDaFase1({ pending: 1, analyzed: 11 }));
  assert.equal(radarPhase1VisibleLabel(acaoDaFase1({ pending: 1, analyzed: 11 })), visivel.label);

  assert.equal(
    radarAutoFinalizePendingNotice('A próxima etapa ainda é "Analisar concorrência".', radarPhase1VisibleLabel(acaoDaFase1({ pending: 1, analyzed: 11 })), "Pesquisa"),
    'Não finalizou sozinha: a próxima etapa ainda é "Analisar concorrência". Para continuar, na área Pesquisa, botão "Analisar concorrência · e finaliza (+ até 2 chamadas de IA)".',
  );
});

test("O BOTÃO VISÍVEL · o automático do Google não nomeia mais 'Finalizar pesquisa' fixo", () => {
  const fonte = pagina();
  const automatico = fatia(fonte, "const finalizarGoogleSemPendencia = async", "const confirmResearchCuration = async");
  const rotina = fatia(fonte, "const finalizarInvestigacaoGoogle = async", "const finalizarGoogleSemPendencia = async");
  for (const [nome, trecho] of [["finalizarGoogleSemPendencia", automatico], ["finalizarInvestigacaoGoogle", rotina]] as const) {
    assert.equal(trecho.includes('"Finalizar pesquisa")'), false, `${nome} ainda nomeia o botão fixo`);
    assert.ok(trecho.includes("radarPhase1VisibleLabel("), `${nome} nomeia o botão da tela`);
    assert.ok(trecho.includes('"Pesquisa")'), `${nome} diz onde ele está`);
  }
  /* O botão da tela é montado pela MESMA função. */
  const bancada = semComentarios(readFileSync("modules/radar/radar-r3-workbench.tsx", "utf8"));
  assert.ok(bancada.includes("const acao = radarPhase1Visible(daFase1, mode);"));
});

test("A RODADA EXTRA · relê o servidor, lê SÓ as pendentes uma vez, e só então decide", () => {
  const fonte = pagina();
  const automatico = fatia(fonte, "const finalizarGoogleSemPendencia = async", "const confirmResearchCuration = async");
  const ordem = [
    "await analiseConfirmadaNoServidor(target)",
    "investigacao.sample.pendingUrls",
    "if (pendentes.length && !rodadaExtraFeita)",
    "await analyzeSerpSelection({ target: linhaRelida, data: dadosRelidos, somente: pendentes })",
    "await finalizarGoogleSemPendencia(linhaRelida, `${antes} Rodada extra: ${extra.confirmada}`, true)",
    "radarGoogleAutoFinalizeDecision({",
    "await finalizarInvestigacaoGoogle(linhaRelida, dadosRelidos, { antes });",
  ];
  let desde = 0;
  for (const marco of ordem) {
    const posicao = automatico.indexOf(marco, desde);
    assert.ok(posicao >= 0, `fora de ordem ou ausente: ${marco}`);
    desde = posicao + marco.length;
  }

  /* A análise pedida pela rodada extra devolve a frase e NÃO encadeia o automático de novo. */
  const analise = fatia(fonte, "const analyzeSerpSelection = async", "const reviewSerpForArticle = async");
  const devolve = analise.indexOf("if (rodadaExtra) return { confirmada: analiseConfirmada, motivo: motivoDaFalha };");
  const encadeia = analise.indexOf("if (analiseConfirmada) await finalizarGoogleSemPendencia(target, analiseConfirmada);");
  assert.ok(devolve > 0 && encadeia > devolve, "a rodada extra volta antes de encadear");
  assert.ok(analise.includes("&& (!alvo || alvo.has(row.reference.normalizedUrl)))"), "a rodada extra filtra só as pendentes");
  assert.ok(analise.includes("const rodadaFechada = radarReconcileExtractionRound({"), "a rodada fecha por chave");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
