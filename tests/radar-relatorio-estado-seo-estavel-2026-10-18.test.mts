import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { buildRadarReportSummary, buildRadarResearchCardSummary, radarAnalysisSampleLoaded } from "../lib/radar/operational-view.ts";
import { radarSeoGuidelineState } from "../lib/radar/seo-guidelines.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ===== 2026-10-18 · O ESTADO SEO DA PLANILHA NÃO MUDA SEM O DADO MUDAR =====
 *
 * Teste real no local: o MESMO artigo finalizado mostrava na coluna
 * "Relatório" "Estado SEO: 83% · 5 de 8" num instante e "50% · 2 de 6" no
 * outro, enquanto a página carregava e quando outro artigo ficava ativo.
 *
 * Causa verificada: a listagem da mesa entrega a versão da análise LEVE (as
 * corridas — `extractions` e `competitiveReport` — moram em
 * `radar_analysis_runs`; numa investigação congelada a cópia ainda é
 * compactada), e o readback por artigo devolve a versão INTEIRA. O Relatório
 * lia a leitura VIVA (links, fontes, especialista, descoberta, esqueleto,
 * modelo), que depende dessas páginas: sem elas, quatro verificações viravam
 * "não se aplica" e o placar caía.
 *
 * O que fica guardado aqui:
 *   · investigação congelada → a fotografia responde, igual com e sem as
 *     páginas carregadas (mesmas verificações, mesmo placar);
 *   · investigação viva sem a amostra carregada → nenhuma verificação vira
 *     "não se aplica" por falta de leitura: fica pendente, "carregando";
 *   · a coluna, o card e o painel leem as MESMAS entradas da linha.
 * Nenhuma rede, nenhum provider.
 */

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
  if (index < 7) headings.push("Riscos do ácido salicílico para pele oleosa na gravidez");
  return pagina(`A${index}`, headings);
});

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "b", articleId: "a", articleDnaVersionId: "dna-v15", articleDnaContentHash: "hash-v15",
    promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Pilar",
  },
  keywords: [
    {
      identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
      strategy: { volume: 720, kgrScore: 0.589, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { versionId: "sq-1", intent: "informacional", funnel: "TOFU" } },
      resolution: "FULL",
    },
    {
      identity: { keywordId: "kw2", text: "skin care pele oleosa", role: "secundaria" },
      strategy: { volume: 1300, kgrScore: 0.325, normalizedIntent: "informacional", coveredIntentions: [], keywordDnaSnapshot: null, semanticQualification: null },
      resolution: "FULL",
    },
  ],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa", "skin care pele oleosa"],
  silo: null, formationSerp: null,
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v15", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["skincare para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = {
  query: "skincare para pele oleosa",
  organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `dominio-a${index}.com.br`, url: item.url })),
};

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator-1", now: "2026-09-10T09:00:00.000Z",
});

const VERIFICADAS = [{ domain: "aad.org", url: "https://www.aad.org/public/diseases/oily-skin", sourceType: "PROFESSIONAL_ORGANIZATION", classificationReason: "r", confidence: "HIGH" as const, signals: [], provenance: "p" }];

const vista = (patch: Partial<Parameters<typeof buildRadarDeepResearchView>[0]> = {}) => buildRadarDeepResearchView({
  context: contexto(), record: registro(), snapshot: SNAPSHOT as never, extractions: PAGINAS,
  selectedReferences: PAGINAS.length, verifiedSources: VERIFICADAS, observedAt: "2026-09-10T12:00:00.000Z", ...patch,
});

/* O congelamento como a página o faz: leitura viva INTEIRA, com o esqueleto junto. */
const congelar = () => {
  const view = vista();
  const suficiencia = { level: "SUFFICIENT" as const, headline: "Amostra competitiva suficiente", reasons: ["12 página(s) editorial(is) comparável(is) sustentam a leitura."] };
  const resultado = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({ started: true, stale: false, alreadyFinalized: false, pending: 0, analyzed: 12, failed: 0, sufficiency: suficiencia }),
    observed: view.observed, record: registro(), mode: "WEB", sufficiency: suficiencia, blueprint: view.blueprint,
    frozenBy: "ator-1", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  if (!resultado.ok) throw new Error(`a fixture não congelou: ${resultado.reason}`);
  return resultado.bundle;
};

const placarDe = (view: ReturnType<typeof vista>, extra: Partial<Parameters<typeof buildRadarReportSummary>[0]> = {}) => {
  const resumo = buildRadarReportSummary({ observed: view.observed, view, ...extra });
  const placar = radarSeoGuidelineState(resumo.checks);
  return {
    resumo,
    estados: resumo.checks.map(item => `${item.id}:${item.state}`),
    detalhes: resumo.checks.map(item => `${item.id}:${item.detail}`),
    exigidas: resumo.checks.filter(item => item.state !== "NOT_REQUIRED").length,
    prontas: resumo.checks.filter(item => item.state === "READY").length,
    overall: placar.overall,
  };
};

test("2026-10-18 · investigação congelada: o mesmo Estado SEO com e sem as páginas carregadas", () => {
  const bundle = congelar();
  /* Readback por artigo: a versão INTEIRA. */
  const inteira = vista({ finalizedBundle: bundle });
  /* Listagem da mesa: versão leve e compacta — sem extrações e sem o relatório competitivo. */
  const leve = vista({ finalizedBundle: bundle, extractions: [], model: null });

  /* A prova de que a fixture exercita o defeito: a leitura VIVA diverge entre as duas. */
  assert.notEqual(inteira.observed.authorityEvidence.claims.length + inteira.observed.externalSources.evidenceCandidates.length,
    leve.observed.authorityEvidence.claims.length + leve.observed.externalSources.evidenceCandidates.length,
    "sem as páginas, a leitura viva perde afirmações e fontes");

  const a = placarDe(inteira);
  const b = placarDe(leve);
  assert.deepEqual(b.estados, a.estados, "as mesmas verificações, no mesmo estado");
  assert.deepEqual(b.detalhes, a.detalhes, "e o mesmo texto");
  assert.equal(b.exigidas, a.exigidas);
  assert.equal(b.prontas, a.prontas);
  assert.equal(b.overall, a.overall, "o mesmo placar");
  assert.equal(a.resumo.loading, false);
  assert.equal(b.resumo.loading, false, "congelada nunca fica 'carregando'");

  /* O congelado responde pelo que ele guardou. */
  const porId = new Map(a.resumo.checks.map(item => [item.id, item]));
  assert.equal(porId.get("specialist")!.state, bundle.authority.specialistRequirements.length ? "PENDING" : "NOT_REQUIRED");
  assert.equal(porId.get("links")!.state === "NOT_REQUIRED", bundle.links.relatedDestinations === 0);
  assert.equal(porId.get("sources")!.state, "READY", "fonte verificada congelada");
  assert.equal(porId.get("frozen")!.state, "READY");

  /* E o card da Pesquisa: o mesmo "Modelo competitivo" nas duas leituras. */
  assert.deepEqual(buildRadarResearchCardSummary({ view: leve, mode: "WEB" }).model, buildRadarResearchCardSummary({ view: inteira, mode: "WEB" }).model);
});

test("2026-10-18 · investigação viva sem a amostra carregada: nada vira 'não se aplica' por falta de leitura", () => {
  const leve = vista({ extractions: [], model: null });
  const { resumo } = placarDe(leve, { sampleLoaded: false });
  assert.equal(resumo.loading, true);
  for (const id of ["research", "model", "sources", "specialist", "discovery", "blueprint"]) {
    const check = resumo.checks.find(item => item.id === id)!;
    assert.equal(check.state, "PENDING", `${id} pendente enquanto a amostra não chega`);
    assert.match(check.detail, /[Cc]arregando/, `${id} diz que está carregando`);
  }
  /* Com o grafo relacionando o artigo, links também espera. */
  assert.equal(resumo.checks.find(item => item.id === "links")!.state, "PENDING");

  /* Carregada, a leitura de sempre (o padrão continua o de antes). */
  const inteira = vista();
  assert.deepEqual(placarDe(inteira, { sampleLoaded: true }).estados, placarDe(inteira).estados);
  assert.equal(placarDe(inteira).resumo.loading, false);
});

test("2026-10-18 · a amostra conta como carregada pela própria versão da análise", () => {
  assert.equal(radarAnalysisSampleLoaded(null), true, "sem análise, nada a esperar");
  assert.equal(radarAnalysisSampleLoaded({ extractions: [], extractionIds: [] }), true, "versão sem página nenhuma");
  assert.equal(radarAnalysisSampleLoaded({ extractions: [], extractionIds: ["page:1"] }), false, "versão leve da listagem");
  assert.equal(radarAnalysisSampleLoaded({ extractions: [PAGINAS[0]], extractionIds: ["page:1"] }), true, "readback inteiro");
});

test("2026-10-18 · coluna, card e painel do Relatório leem as MESMAS entradas da linha", () => {
  const limpar = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const pagina = limpar(readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  const bancada = limpar(readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8"));

  /* A entrada nasce uma vez, no modelo da linha. */
  assert.match(pagina, /reportInputs: radarReportInputsOf\(/);
  /* A coluna lê dela, e não monta mais a sua. */
  const coluna = pagina.slice(pagina.indexOf("{ id: \"report\", header: \"Relatório\""));
  const corpoDaColuna = coluna.slice(0, coluna.indexOf("{ id: \"nextAction\""));
  assert.match(corpoDaColuna, /buildRadarReportSummary\(\{ observed: data\.r3\.deepResearch\.observed, view: data\.r3\.deepResearch, \.\.\.data\.r3\.reportInputs \}\)/);
  assert.doesNotMatch(corpoDaColuna, /radarYoutubeReportEvidence|radarAmazonReportEvidence/, "a coluna não monta evidência própria");
  /* O card e o painel, as duas chamadas da bancada, com a mesma entrada. */
  const chamadas = bancada.match(/buildRadarReportSummary\(\{[^}]*\}/g) || [];
  assert.equal(chamadas.length, 2, "card e painel: duas chamadas, sem porta paralela");
  for (const chamada of chamadas) assert.match(chamada, /\.\.\.entradasDoRelatorio\(model, researchProjection\)/);
  assert.equal((bancada.match(/function entradasDoRelatorio\(/g) || []).length, 1);
});
