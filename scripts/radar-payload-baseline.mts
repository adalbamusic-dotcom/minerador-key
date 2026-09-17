/**
 * ===== A MEDIÇÃO DO PAYLOAD DO RADAR — RADAR_FINAL_2 · §1 e §23 =====
 *
 * ==================== O QUE ESTE SCRIPT MEDE, E O QUE NÃO ====================
 *
 * Ele mede o PAYLOAD QUE O CÓDIGO PRODUZ: quantos bytes cada região da versão
 * de análise ocupa quando serializada, que é a forma em que ela atravessa a
 * rede e chega ao banco.
 *
 * Ele NÃO mede o transporte do navegador — compressão, hidratação do React,
 * bundle. Isso é homologação de runtime, e é do usuário.
 *
 * ==================== POR QUE MEDIR ANTES DE MEXER ====================
 *
 * §1: não otimizar no escuro. A auditoria do YouTube já mostrou o custo de
 * supor: a intuição dizia "o blueprint é grande" e a medição mostrou que 88%
 * da fotografia era a coleta copiada.
 *
 * PROVIDER_CALLS = 0: tudo sai de fixture e de contrato.
 */

import { readFileSync } from "node:fs";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint } from "../lib/radar/amazon-search-run.ts";
import { amazonCompetitiveBlueprintOfAnalysis } from "../lib/radar/amazon-editorial.ts";
import { freezeRadarAmazonInvestigation } from "../lib/radar/amazon-evidence.ts";
import { buildRadarEvidenceBundleFromAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";

const bytes = (valor: unknown) => JSON.stringify(valor ?? null).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/* ========================= a investigação da Amazon ========================= */

const payloadAmazon = JSON.parse(readFileSync("./tests/fixtures/dataforseo-amazon-discovery.json", "utf8"));
const normalizada = normalizeDataForSeoAmazonResponse(payloadAmazon, "amzq:1");

const corrida = buildRadarAmazonSearchRun({
  runId: "run-amz-1", runVersion: 1,
  startedAt: "2026-09-15T12:00:00.000Z", startedBy: "user-1",
  fingerprint: buildRadarAmazonRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["amzq:1"] }),
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

const blueprint = amazonCompetitiveBlueprintOfAnalysis({
  articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc",
  run: corrida, support: null,
  primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
  researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null,
});

const congelada = freezeRadarAmazonInvestigation({
  run: corrida, blueprint, finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
});

const analise = {
  amazonSearch: corrida,
  amazonBlueprint: null,
  amazonFrozenInvestigation: congelada,
};

const dossie = buildRadarEvidenceBundleFromAnalysis({
  payload: analise,
  article: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc" },
  competitiveBlueprint: blueprint,
  observedAt: "2026-09-15T15:00:00.000Z",
});
if (!dossie.ok) throw new Error(dossie.reason);

/* ============================== o relatório ============================== */

/**
 * AS REGIÕES, E O QUE CADA UMA CUSTA.
 *
 * `results` e `universe` são MATÉRIA-PRIMA: recalculáveis, com autoridade
 * própria na corrida. A fotografia e o dossiê são CONCLUSÕES. A diferença entre
 * as duas colunas é exatamente o que este gate pergunta.
 */
const regioes: Array<{ nome: string; valor: unknown; tipo: "MATÉRIA-PRIMA" | "CONCLUSÃO" | "REFERÊNCIA" }> = [
  { nome: "amazonSearch.results (55 itens de página)", valor: corrida.results, tipo: "MATÉRIA-PRIMA" },
  { nome: "amazonSearch.universe (51 produtos)", valor: corrida.universe, tipo: "MATÉRIA-PRIMA" },
  { nome: "amazonSearch.relatedSearches", valor: corrida.relatedSearches, tipo: "MATÉRIA-PRIMA" },
  { nome: "amazonSearch (corrida inteira)", valor: corrida, tipo: "MATÉRIA-PRIMA" },
  { nome: "amazonFrozenInvestigation (fotografia)", valor: congelada, tipo: "CONCLUSÃO" },
  { nome: "  └ competitiveBlueprint dentro dela", valor: congelada.competitiveBlueprint, tipo: "CONCLUSÃO" },
  { nome: "  └ runRef + supportRefs + observedSummary", valor: { runRef: congelada.runRef, supportRefs: congelada.supportRefs, observedSummary: congelada.observedSummary }, tipo: "REFERÊNCIA" },
  { nome: "RadarEvidenceBundleV3 (dossiê entregue)", valor: dossie.bundle, tipo: "CONCLUSÃO" },
];

console.log("\n===== PAYLOAD DE UMA VERSÃO DE ANÁLISE · perfil AMAZON finalizado =====\n");
for (const regiao of regioes) {
  console.log(`${String(bytes(regiao.valor)).padStart(8)}  ${kb(bytes(regiao.valor)).padStart(9)}  ${regiao.tipo.padEnd(13)}  ${regiao.nome}`);
}

const versaoInteira = bytes(analise);
const materiaPrima = bytes(corrida);
const conclusoes = bytes(congelada);

console.log(`\n${String(versaoInteira).padStart(8)}  ${kb(versaoInteira).padStart(9)}  TOTAL         uma versão de análise finalizada`);
console.log(`\nMatéria-prima: ${((materiaPrima / versaoInteira) * 100).toFixed(1)}% da versão`);
console.log(`Conclusões:    ${((conclusoes / versaoInteira) * 100).toFixed(1)}% da versão`);

/*
 * ============ §2 · A DÍVIDA DO `analysisVersions` ============
 *
 * A leitura do Radar devolve TODAS as versões da análise, e cada versão carrega
 * a corrida inteira. O custo não é linear no trabalho feito: ele é linear no
 * número de CLIQUES que gravaram uma versão.
 */
console.log("\n===== §2 · A PROJEÇÃO DE `analysisVersions` =====\n");
console.log("versões   payload total   observação");
for (const n of [1, 3, 5, 10, 20]) {
  const total = versaoInteira * n;
  const nota = n === 1 ? "uma investigação" : `${n} gravações da mesma investigação`;
  console.log(`${String(n).padStart(7)}   ${kb(total).padStart(13)}   ${nota}`);
}
console.log("\nA leitura atual (GET /api/editorial/radar-analysis) devolve a lista inteira.");
console.log("A versão CORRENTE é a única que a tela usa para decidir qualquer coisa.\n");

/* ===================== §23 · O DEPOIS, COM A PODA APLICADA ===================== */

const { pruneRadarAnalysisHistory } = await import("../lib/radar/analysis-history-pruning.ts");

const historico = [1, 2, 3, 4, 5].map(numero => ({
  versionId: `v-${numero}`,
  versionNumber: numero,
  payload: { ...analise, status: numero === 4 ? "approved" : "draft" },
}));

const antes = bytes(historico);
const depois = bytes(pruneRadarAnalysisHistory(historico as never));

console.log("===== §23 · BEFORE / AFTER · 5 versões da mesma investigação =====\n");
console.log(`BEFORE  ${kb(antes).padStart(10)}`);
console.log(`AFTER   ${kb(depois).padStart(10)}`);
console.log(`DELTA   ${kb(antes - depois).padStart(10)}`);
console.log(`REDUÇÃO ${((1 - depois / antes) * 100).toFixed(1)}%\n`);

/*
 * §23 · OS TRÊS MAIORES PAYLOADS QUE SOBRAM — e o que fazer com cada um.
 */
console.log("===== §23 · OS TRÊS MAIORES PAYLOADS RESTANTES =====\n");
console.log(`1. amazonSearch da versão CORRENTE       ${kb(bytes(corrida)).padStart(10)}  não podável: toda gravação a sucede`);
console.log(`2. competitiveBlueprint na fotografia    ${kb(bytes(congelada.competitiveBlueprint)).padStart(10)}  é a CONCLUSÃO — podá-la perderia semântica`);
console.log(`3. RadarEvidenceBundleV3 gravado         ${kb(bytes(dossie.bundle)).padStart(10)}  o dossiê entregue ao Planejador\n`);

/* ============ §12 · RADAR_FINAL_2.1 · O INITIAL READ COMPACTO ============ */

const { compactRadarResearchForRead, radarResearchSampleOfAnalysis, radarResearchProvenanceOfAnalysis } =
  await import("../lib/radar/research-read-model.ts");

const correnteFull = { ...analise, status: "approved" } as Record<string, unknown>;
const correnteCompact = compactRadarResearchForRead(correnteFull);

const antes21 = bytes(correnteFull);
const depois21 = bytes(correnteCompact);
const amostraLazy = bytes(radarResearchSampleOfAnalysis({ payload: correnteFull, profile: "AMAZON" }));
const provenienciaLazy = bytes(radarResearchProvenanceOfAnalysis({ payload: correnteFull, profile: "AMAZON" }));

console.log("===== §12 · A VERSÃO CORRENTE, ANTES E DEPOIS =====\n");
console.log(`BEFORE_21_INITIAL_BYTES  ${String(antes21).padStart(8)}  ${kb(antes21).padStart(9)}`);
console.log(`AFTER_21_INITIAL_BYTES   ${String(depois21).padStart(8)}  ${kb(depois21).padStart(9)}`);
console.log(`REDUCTION_21             ${((1 - depois21 / antes21) * 100).toFixed(1)}%\n`);
console.log(`INITIAL_CORE_BYTES       ${String(depois21).padStart(8)}  ${kb(depois21).padStart(9)}  fotografia + blueprint + estado`);
console.log(`SAMPLE_LAZY_BYTES        ${String(amostraLazy).padStart(8)}  ${kb(amostraLazy).padStart(9)}  buscado ao abrir a amostra`);
console.log(`PROVENANCE_LAZY_BYTES    ${String(provenienciaLazy).padStart(8)}  ${kb(provenienciaLazy).padStart(9)}  buscado ao abrir a proveniência\n`);

/* ============ §12 · RADAR_FINAL_2.2 · YOUTUBE E GOOGLE ============ */

const { RadarYoutubeSearchRunSchema } = await import("../lib/radar/youtube-search-run.ts");

/*
 * Uma corrida de YouTube com 38 vídeos — o tamanho da investigação real do
 * artigo "skin care noturno", que é a referência homologada deste perfil.
 */
const videoDe = (indice: number) => ({
  videoId: `vid-${String(indice).padStart(4, "0")}`,
  url: `https://www.youtube.com/watch?v=vid-${indice}`,
  title: `Título de vídeo concorrente número ${indice}, com o comprimento que o YouTube costuma exibir`,
  channelName: `Canal concorrente ${indice}`,
  channelId: `UC${String(indice).padStart(20, "0")}`,
  channelUrl: `https://www.youtube.com/channel/UC${indice}`,
  channelLogo: null,
  publishedAt: "2026-03-01T10:00:00.000Z", publishedAtLabel: "há 6 meses",
  durationSeconds: 640, durationLabel: "10:40", views: 128000,
  description: "Descrição do vídeo concorrente, com o tamanho que a SERP costuma devolver no bloco orgânico.",
  thumbnailUrl: `https://i.ytimg.com/vi/vid-${indice}/hqdefault.jpg`,
  isShorts: false, isLive: false, isMovie: false, badges: [],
  queriesFoundIn: ["ytq:1"], bestRank: indice,
  allRanks: [{ queryId: "ytq:1", rank: indice }],
  occurrenceCount: 1,
  universeClass: "COMPARABLE_LONG_FORM", universeReason: "Long-form que responde a mesma intenção.",
});
const corridaYoutube = RadarYoutubeSearchRunSchema.parse({
  researchMode: "YOUTUBE", runId: "run-yt-1", runVersion: 1,
  startedAt: "2026-09-14T09:00:00.000Z", startedBy: "user-1", state: "COLLECTED",
  fingerprint: { articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["ytq:1"], signature: "assinatura-yt" },
  provenance: {
    provider: "dataforseo", endpoint: "/v3/serp/youtube/organic/live/advanced",
    queriesRequested: 3, queriesSucceeded: 3, queriesFailed: 0,
    collectedAt: "2026-09-14T09:00:00.000Z",
  },
  queries: [{ queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: 38 }],
  results: [],
  universe: Array.from({ length: 38 }, (_, i) => videoDe(i + 1)),
});

const analiseYoutube = {
  youtubeSearch: corridaYoutube,
  youtubeFrozenInvestigation: {
    frozenVersion: 1, finalizedAt: "2026-09-14T10:00:00.000Z", finalizedBy: "user-1",
    runRef: {
      runId: "run-yt-1", runVersion: 1, runFingerprint: "assinatura-yt",
      collectedAt: "2026-09-14T09:00:00.000Z", provider: "dataforseo",
      endpoint: "/v3/serp/youtube/organic/live/advanced",
      queriesExecuted: 3, universeSize: 38, selectedVideoIds: [],
    },
    run: null, multimodal: null, limitations: [],
  },
};

const ytAntes = bytes(analiseYoutube);
const ytDepois = bytes(compactRadarResearchForRead(analiseYoutube as unknown as Record<string, unknown>));
const ytAmostra = bytes(radarResearchSampleOfAnalysis({ payload: analiseYoutube, profile: "YOUTUBE" }));
const ytProv = bytes(radarResearchProvenanceOfAnalysis({ payload: analiseYoutube, profile: "YOUTUBE" }));

console.log("===== §12 · YOUTUBE FINALIZED · 38 vídeos =====\n");
console.log(`YOUTUBE_INITIAL_BEFORE        ${kb(ytAntes).padStart(10)}`);
console.log(`YOUTUBE_INITIAL_AFTER         ${kb(ytDepois).padStart(10)}`);
console.log(`REDUÇÃO                       ${((1 - ytDepois / ytAntes) * 100).toFixed(1)}%`);
console.log(`YOUTUBE_SAMPLE_LAZY_BYTES     ${kb(ytAmostra).padStart(10)}`);
console.log(`YOUTUBE_PROVENANCE_LAZY_BYTES ${kb(ytProv).padStart(10)}\n`);

/* ============ §16 · RADAR_FINAL_2.3 · O GOOGLE FINALIZED ============ */

const { RadarExtractionPageSchema } = await import("../lib/radar/analysis-contracts.ts");

const paginaExtraida = (indice: number) => RadarExtractionPageSchema.parse({
  id: `page-${indice}`,
  url: `https://exemplo-${indice}.test/artigo-sobre-o-tema`,
  status: "success", fetchedAt: "2026-09-15T12:00:00.000Z",
  title: "Um título de artigo concorrente com tamanho realista para a SERP",
  metaDescription: "Uma meta description de concorrente, com o comprimento que o Google costuma exibir em resultado orgânico.",
  canonical: `https://exemplo-${indice}.test/artigo-sobre-o-tema`,
  h1: ["O H1 da página concorrente"],
  h2: Array.from({ length: 8 }, (_, i) => `H2 número ${i + 1} do concorrente, com texto de tamanho realista`),
  h3: Array.from({ length: 12 }, (_, i) => `H3 número ${i + 1} do concorrente`),
  wordCount: 1800, internalLinkCount: 24, externalLinkCount: 6,
  listCount: 5, tableCount: 1, faqCount: 4, imageCount: 9,
  blockquoteCount: 2, comparisonCount: 1, hasDates: true,
  author: "Autor do concorrente",
  structuredDataTypes: ["Article", "FAQPage"],
  recurringTerms: Array.from({ length: 30 }, (_, i) => ({ term: `termo recorrente ${i + 1}`, frequency: 5, pageCount: 3, sources: ["body"], pageIds: [`page-${i + 1}`] })),
  boldCount: 18, italicCount: 3, error: "",
});

console.log("===== §16 · GOOGLE FINALIZED =====\n");
for (const n of [8, 18]) {
  const analiseGoogle = {
    extractions: Array.from({ length: n }, (_, i) => paginaExtraida(i + 1)),
    serpSnapshotId: "snap-goo-1", serpSnapshotHash: "sha256:serp",
    finalizedBundle: {
      bundleId: "bundle-1", bundleHash: "hash-1",
      frozenAt: "2026-09-15T14:00:00.000Z", frozenBy: "user-1",
      sample: { analyzedSuccess: n, comparablePages: n, failedFinal: 0, extractionIds: Array.from({ length: n }, (_, i) => `page-${i + 1}`) },
      limitations: ["Fonte citada por concorrente não é endosso automático."],
    },
  };

  const antesG = bytes(analiseGoogle);
  const depoisG = bytes(compactRadarResearchForRead(analiseGoogle as unknown as Record<string, unknown>));
  const amostraG = bytes(radarResearchSampleOfAnalysis({ payload: analiseGoogle, profile: "GOOGLE" }));
  const provG = bytes(radarResearchProvenanceOfAnalysis({ payload: analiseGoogle, profile: "GOOGLE" }));

  console.log(`--- ${n} páginas ---`);
  console.log(`GOOGLE_INITIAL_BEFORE         ${kb(antesG).padStart(10)}`);
  console.log(`GOOGLE_INITIAL_AFTER          ${kb(depoisG).padStart(10)}`);
  console.log(`GOOGLE_REDUCTION_PERCENT      ${((1 - depoisG / antesG) * 100).toFixed(1)}%`);
  console.log(`GOOGLE_SAMPLE_LAZY_BYTES      ${kb(amostraG).padStart(10)}`);
  console.log(`GOOGLE_PROVENANCE_LAZY_BYTES  ${kb(provG).padStart(10)}\n`);
}

/* ============ §12 · RADAR_FINAL_2.4 · A UI LIGADA À LEITURA LAZY ============ */

console.log("===== §12 · GOOGLE FINALIZED · a medida com a CHAVE REAL =====\n");
console.log("A fotografia grava URLs em `sample.extractionIds` — não `page.id`.");
console.log("Esta medida usa a mesma chave que o runtime grava.\n");

for (const [correntes, congeladas] of [[8, 8], [18, 8]] as const) {
  const paginas = Array.from({ length: correntes }, (_, i) => paginaExtraida(i + 1));
  const analiseGoogle = {
    extractions: paginas,
    serpSnapshotId: "snap-goo-1", serpSnapshotVersion: 3, serpSnapshotHash: "sha256:serp",
    deepResearch: { startedAt: "2026-09-15T09:00:00.000Z", finalizedAt: "2026-09-15T14:00:00.000Z", fingerprint: { value: "fundamento:v17" } },
    finalizedBundle: {
      bundleId: "bundle-1", bundleHash: "hash-1",
      frozenAt: "2026-09-15T14:00:00.000Z", frozenBy: "user-1",
      foundationFingerprint: "fundamento:v17",
      sample: {
        analyzedSuccess: congeladas, comparablePages: congeladas, failedFinal: 0,
        extractionIds: paginas.slice(0, congeladas).map(item => item.url),
      },
      limitations: ["Fonte citada por concorrente não é endosso automático."],
    },
  };

  const antesG = bytes(analiseGoogle);
  const compacto = compactRadarResearchForRead(analiseGoogle as unknown as Record<string, unknown>);
  const depoisG = bytes(compacto);
  const amostra = radarResearchSampleOfAnalysis({ payload: analiseGoogle, profile: "GOOGLE" });
  const provG = bytes(radarResearchProvenanceOfAnalysis({ payload: analiseGoogle, profile: "GOOGLE" }));

  console.log(`--- ${correntes} correntes · ${congeladas} congeladas ---`);
  console.log(`GOOGLE_INITIAL_BEFORE         ${kb(antesG).padStart(10)}`);
  console.log(`GOOGLE_INITIAL_AFTER          ${kb(depoisG).padStart(10)}`);
  console.log(`GOOGLE_REDUCTION_PERCENT      ${((1 - depoisG / antesG) * 100).toFixed(1)}%`);
  console.log(`GOOGLE_SAMPLE_LAZY_BYTES      ${kb(bytes(amostra)).padStart(10)}`);
  console.log(`GOOGLE_PROVENANCE_LAZY_BYTES  ${kb(provG).padStart(10)}`);
  console.log(`SAMPLE_CONTENT_IN_INITIAL     ${(compacto.extractions as unknown[]).length === 0 ? "NO" : "YES"}`);
  console.log(`SAMPLE_RESOLVED_PAGES         ${amostra.pages.length} de ${amostra.count} congeladas`);
  console.log(`FROZEN_REFERENCE_INTEGRITY    ${amostra.integrity ? amostra.integrity.code : "OK"}\n`);
}
