import assert from "node:assert/strict";
import test from "node:test";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";
import { RadarR3Workbench } from "../modules/radar/radar-r3-workbench.tsx";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { radarQueryEvidenceFrom, settleRadarDeepResearchQuery, startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { buildRadarSerpView } from "../lib/radar/snapshot-view.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";
import type { RadarR3Model } from "../lib/radar/r3-workbench.ts";
import type { SerpResearchSnapshot } from "../lib/radar/serp/contracts.ts";
import { SupabaseSessionProvider } from "../components/auth/supabase-session-context.tsx";
import { GlobalNoticeProvider } from "../components/global-notice-center.tsx";
import { blocoCongelado, pesquisa, registro } from "./radar-tela-quatro-lentes-fixtures.mts";

/*
 * AS LENTES NO WORKBENCH VIVO — adendos R2, R3 e R4.
 *
 * O painel legado da SERP não é montado (Gate 15.3); quem mostra a pesquisa no
 * Workbench é a área Pesquisa. Aqui se prova, no DOM de verdade, que ela diz:
 * - a cobertura da SERP canônica viva ("SERP · 3 de 4 lentes");
 * - a cobertura de cada consulta auxiliar, na tabela do plano;
 * - numa investigação congelada, a CÓPIA do bundle — ou, no bundle legado, a
 *   linha discreta "lentes não congeladas (investigação finalizada antes de
 *   2026-09-23)".
 *
 * Nada aqui chama rede: a sentinela registra qualquer tentativa.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    const alvo = typeof entrada === "string" ? entrada : String((entrada as { url?: string })?.url || entrada);
    tentativasDeRede.push(alvo);
    return Promise.reject(new Error(`REDE PROIBIDA NESTE TESTE: ${alvo}`));
  },
  writable: true, configurable: true,
});

/* =============================== a fixture ============================== */

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/creme`, status: "success",
  fetchedAt: "2026-09-20T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Creme facial"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 0,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Creme facial" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [], error: null,
});

const PAGINAS = Array.from({ length: 10 }, (_, index) => pagina(`A${index}`, ["Como escolher o creme facial?", "Rotina de cuidados com creme facial"]));

const palavra = (keywordId: string, text: string, role: "principal" | "secundaria", intent: string) => ({
  identity: { keywordId, canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: `kdna-${keywordId}`, text, role },
  strategy: { volume: 720, resultCount: 4200, kgrScore: 0.2, incrementalVolume: null, contribution: null, normalizedIntent: intent, coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: text } }, semanticQualification: { versionId: `sq-${keywordId}`, contentHash: "h", intent, funnel: "TOFU", semanticState: "conclusive", collectedAt: "2026-09-01T10:00:00.000Z" } },
  resolution: "FULL",
  provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: `kdna-${keywordId}`, keywordDnaContentHash: "hash-kdna" },
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "artigo-lentes", articleDnaVersionId: "adna-1", articleDnaContentHash: "hash", promise: "Creme facial", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [palavra("kw-1", "creme facial", "principal", "informacional"), palavra("kw-2", "melhor creme para pele oleosa", "secundaria", "comercial")],
  editorialTopics: ["escolha do creme"],
  resolvedKeywordTexts: ["creme facial", "melhor creme para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const canonica = pesquisa() as unknown as SerpResearchSnapshot;
const auxiliar = pesquisa({ id: "serp:auxiliar:kw-2", keywordId: "kw-2", query: "melhor creme para pele oleosa", contentHash: "c".repeat(64) }) as unknown as SerpResearchSnapshot;

const auxiliarAnterior = pesquisa({ id: "serp:auxiliar:kw-2:antiga", keywordId: "kw-2", query: "melhor creme para pele oleosa", contentHash: "d".repeat(64), lensSet: undefined, cacheProvenance: undefined }) as unknown as SerpResearchSnapshot;

/** A investigação com a canônica e a auxiliar executadas, cada uma com a sua evidência. */
function registroExecutado(opcoes: { auxiliarDeUmaLente?: boolean } = {}) {
  let atual = startRadarDeepResearch({ context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-20T09:00:00.000Z" });
  const central = atual.queries.find(item => item.role === "principal")!;
  const secundaria = atual.queries.find(item => item.role === "secundaria")!;
  atual = settleRadarDeepResearchQuery(atual, central.queryId, { execution: "EXECUTED", reason: "SERP canônica do artigo.", evidence: radarQueryEvidenceFrom({ serpClass: "canonical", research: canonica }) });
  atual = settleRadarDeepResearchQuery(atual, secundaria.queryId, { execution: "EXECUTED", reason: "SERP auxiliar de pesquisa.", evidence: radarQueryEvidenceFrom({ serpClass: "auxiliary", research: opcoes.auxiliarDeUmaLente ? auxiliarAnterior : auxiliar }) });
  return { atual, central, secundaria };
}

const SNAPSHOT = { query: "creme facial", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) };

/** A investigação como o START a deixa: coleta, referências e curadoria gravada. */
function vista(patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) {
  const base = {
    context: contexto(), record: registroExecutado().atual, snapshot: SNAPSHOT as never,
    extractions: PAGINAS, observedAt: "2026-09-20T12:00:00.000Z", ...patch,
  } as Parameters<typeof buildRadarDeepResearchView>[0];
  const universo = buildRadarDeepResearchView(base);
  const curadoria = {
    universeFingerprint: radarResearchUniverseFingerprint(universo.references),
    confirmedAt: "2026-09-20T09:30:00.000Z", confirmedBy: "ator",
    references: universo.references.map(reference => ({
      referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
      decision: autoDecideRadarReference(reference).decision, reason: "",
    })),
  };
  return buildRadarDeepResearchView({
    ...base,
    record: { ...(base.record as ReturnType<typeof registroExecutado>["atual"]), researchCuration: curadoria },
    selectedReferences: curadoria.references.filter(item => item.decision !== "excluded" && item.decision !== "pending").length,
  });
}

const modelo = (deepResearch: ReturnType<typeof vista>, serpAtual = registro()): RadarR3Model => ({
  brandId: "b", articleId: "artigo-lentes", articleDnaVersionId: "adna-1",
  title: "Creme facial", keyword: "creme facial", silo: "skincare", hierarchy: "Suporte",
  articleDnaVersion: "v1", publication: "Ainda não publicado", mode: "competitive_full", article: null,
  researchContext: contexto(), deepResearch,
  serp: { provider: "dataforseo", status: "Coletada", resultCount: 2, primaryCount: 1, pendingCount: 0, needs: 0, latestCollection: "2026-09-20", records: [serpAtual], references: [], view: buildRadarSerpView(serpAtual), analysis: null, latestSnapshotId: serpAtual.id, reviewStatus: null, reviewNotes: null, reviewCurrentness: "current", reviewedAt: null, reviewHistory: [], capturedAt: null },
  amazon: { state: "AMAZON_NOT_APPLICABLE", note: "" },
  content: { articleDnaVersion: "v1", principal: "creme facial", needs: 0, evidenceCount: 0, sourceCount: 0, rows: [], technical: { brandId: "b", articleId: "artigo-lentes", articleDnaVersionId: "adna-1", siloId: null, snapshotId: null, provider: null, articleDnaEntityId: null, articleDnaHash: null } },
  specialist: { expert: "Não selecionado", specialty: "", status: "Não iniciado", channel: "Telegram não consumido nesta visão", requestsSent: 0, contributionsReceived: 0, reviewedEvidence: 0, pending: 0, existingContent: "Nenhum material" },
  report: { status: "Aguardando", version: null, needs: 0, summary: "", approved: false, sentToWriter: false, updatedAt: null },
  nextAction: "", lastActivity: null,
  provenance: { brandId: "b", articleId: "artigo-lentes", articleDnaVersionId: "adna-1", siloId: null, snapshotId: null, provider: null },
} as unknown as RadarR3Model);

async function montarPesquisa(view: ReturnType<typeof vista>, serpAtual = registro()) {
  const tela = await montarRadar();
  await tela.render(comProductShell(React.createElement(
    SupabaseSessionProvider, null,
    React.createElement(GlobalNoticeProvider, null,
      React.createElement(RadarR3Workbench, { model: modelo(view, serpAtual), refreshing: false, onOpenArticle: () => {}, onOpenDetail: () => {} } as never)),
  )));
  await tela.click("radar-r3-card-pesquisa");
  return tela;
}

function congelar(frozenAt: string, comLentes: boolean) {
  const base = vista();
  const congelamento = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: base.observed.sample.analyzedSuccess, failed: 0, sufficiency: base.sufficiency,
    }),
    observed: base.observed, record: registroExecutado().atual, mode: "WEB", sufficiency: base.sufficiency,
    frozenBy: "ator", frozenAt,
  });
  if (!congelamento.ok) throw new Error(`fixture sem congelamento: ${congelamento.reason}`);
  const bundle = comLentes ? { ...congelamento.bundle, search: { ...congelamento.bundle.search, lenses: blocoCongelado() } } : congelamento.bundle;
  return vista({
    record: { ...registroExecutado().atual, finalizedAt: frozenAt, finalizedBy: "ator", conclusion: "SUFFICIENT" } as never,
    finalizedBundle: bundle as never,
  });
}

/* ================================ os testes ================================ */

test("Workbench · investigação aberta: a SERP canônica viva em \"SERP · 3 de 4 lentes\", e cada consulta com a sua cobertura", async () => {
  const tela = await montarPesquisa(vista());

  const lentes = tela.get("radar-research-details-lenses");
  assert.match(lentes.querySelector("summary")?.textContent || "", /Lentes da SERP · SERP · 3 de 4 lentes/);
  assert.equal(tela.get("radar-serp-lens-label").textContent, "SERP · 3 de 4 lentes");
  assert.equal(tela.all("radar-serp-lens-row").length, 4);
  assert.equal(tela.query("radar-frozen-lenses"), null, "aberta, não há fotografia a mostrar");

  const { central, secundaria } = registroExecutado();
  const celula = (queryId: string) => tela.all("radar-query-lenses").find(item => item.getAttribute("data-query-id") === queryId)?.textContent;
  assert.equal(celula(central.queryId), "3 de 4 lentes", "a canônica lê o snapshot que a evidência referencia");
  assert.equal(celula(secundaria.queryId), "3 de 4 lentes · faltou Celular · iOS", "a auxiliar lê as lentes da própria evidência");
  tela.destroy();
});

test("Workbench · a canônica só empresta a cobertura do snapshot que a evidência referencia; auxiliar antiga é uma lente", async () => {
  const outraVersao = registro({ id: "serp:artigo-lentes:v4", version: 4, previousSnapshotId: "serp:artigo-lentes:v3", contentHash: "e".repeat(64) });
  const tela = await montarPesquisa(vista({ record: registroExecutado({ auxiliarDeUmaLente: true }).atual }), outraVersao);

  const { central, secundaria } = registroExecutado();
  const celula = (queryId: string) => tela.all("radar-query-lenses").find(item => item.getAttribute("data-query-id") === queryId)?.textContent;
  assert.equal(celula(central.queryId), "—", "a SERP viva é outra versão: a linha não herda a cobertura dela");
  assert.equal(celula(secundaria.queryId), "1 lente (anterior às quatro lentes)", "evidência anterior às lentes é dita, não inventada");
  tela.destroy();
});

test("Workbench · congelada com lentes: a cópia do bundle, não a SERP viva", async () => {
  const tela = await montarPesquisa(congelar("2026-09-23T15:00:00.000Z", true));

  assert.match(tela.get("radar-frozen-bundle").textContent || "", /Lentes da SERP3 de 4 congeladas/);
  assert.match(tela.get("radar-research-details-lenses").querySelector("summary")?.textContent || "", /Lentes da SERP · 3 de 4 congeladas/);
  assert.equal(tela.get("radar-frozen-lenses-label").textContent, "Lentes congeladas no FINALIZE · 3 de 4");
  assert.match(tela.get("radar-frozen-lenses-auxiliary").textContent || "", /creme para pele oleosa/);
  assert.equal(tela.query("radar-serp-lens-coverage"), null, "a SERP viva não se mistura com a fotografia");
  tela.destroy();
});

test("Workbench · bundle legado: aviso discreto \"lentes não congeladas (antes de 2026-09-23)\", sem lente inventada", async () => {
  const tela = await montarPesquisa(congelar("2026-09-10T13:00:00.000Z", false));

  assert.match(tela.get("radar-frozen-bundle").textContent || "", /Lentes da SERPNão congeladas \(finalizada antes de 2026-09-23\)/);
  const aviso = tela.get("radar-frozen-lenses-absent");
  assert.equal(aviso.getAttribute("data-state"), "legacy");
  assert.equal(aviso.textContent, "Lentes não congeladas (investigação finalizada antes de 2026-09-23).");
  assert.equal(aviso.className.includes("text-text-muted"), true, "discreto: texto secundário, sem cor de alerta");
  assert.equal(tela.query("radar-research-details-lenses"), null, "sem cópia, não há lista de lentes");
  assert.equal(tela.all("radar-serp-lens-row").length, 0);
  tela.destroy();
});

test("REAL_PROVIDER_CALLS = 0 nas telas do Workbench", () => {
  assert.deepEqual(tentativasDeRede, []);
});
