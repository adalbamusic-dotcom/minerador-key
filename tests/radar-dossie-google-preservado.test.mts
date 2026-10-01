import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildRadarEvidenceBundleFromAnalysis, radarPrimaryProfileOfAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import { assertRadarEvidenceBundleIntegrity, assertRadarEvidenceProvenance } from "../lib/radar/evidence-bundle.ts";
import { radarDossierDivergesFromFrozen, radarObservedDivergesFromFrozen, radarHandoffReadiness } from "../lib/radar/handoff-readiness.ts";
import { freezeRadarEvidenceBundle, radarFinalizationReadiness } from "../lib/radar/investigation-finalization.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import { radarKgrClassificationLabel } from "../lib/radar/strategy-context.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/**
 * SDD "SERP no artigo e KGR opcional" (2026-09-28), fatia R3 do Radar.
 *
 * Decisão do dono: "YouTube (artigo que vira vídeo) e Amazon (artigo que vira
 * review) só ACRESCENTAM dados; nunca substituem nem apagam os dados de busca
 * no Google".
 *
 * Antes, com o Google FINALIZADO e depois um YouTube ou uma Amazon
 * finalizados, o perfil primário passava a ser o de vídeo ou o de produto
 * (precedência fixa) e o Google viajava só como referência: sem `observed`,
 * sem a fotografia inteira. O dado continuava no banco, mas deixava de ser
 * entregue ao Planejador e ao Redator.
 *
 * Agora a camada Google continua SUPPORT (o dossiê exige uma única PRIMARY),
 * mas leva a fotografia finalizada: `observed`, as referências do congelado e
 * as limitações dele. O hash de todo dossiê SEM Google finalizado ao lado de
 * YouTube ou Amazon é o mesmo de antes (valores dourados medidos antes da
 * mudança).
 *
 * Domínio puro: sem rede, sem banco, sem provider.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("rede proibida neste teste"));
  },
  writable: true, configurable: true,
});

/* ============================== a fixture do Google ============================== */

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
  observedLinks: [], error: null,
});

const PAGINAS = Array.from({ length: 10 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 8) headings.push("Por que a pele fica oleosa?");
  if (index < 7) headings.push("Rotina de cuidados para pele oleosa");
  return pagina(`A${index}`, headings);
});

const ARTIGO = { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v16", articleDnaContentHash: "hash-dna-v16" };

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { ...ARTIGO, promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte" },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "informacional", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: null },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: null,
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((item, index) => ({ position: index + 1, title: item.title, domain: `d${index}.com`, url: item.url })) };

const registro = () => startRadarDeepResearch({
  context: contexto(), plan: buildRadarResearchQueryPlan(contexto()), startedBy: "ator", now: "2026-09-10T09:00:00.000Z",
});

function vista(paginas = PAGINAS) {
  const base = {
    context: contexto(), record: registro(), snapshot: SNAPSHOT as never,
    extractions: paginas, observedAt: "2026-09-10T12:00:00.000Z", verifiedSources: [],
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
  return buildRadarDeepResearchView({
    ...base,
    record: { ...(base.record as ReturnType<typeof registro>), researchCuration: curadoria },
    selectedReferences: curadoria.references.filter(item => item.decision !== "excluded" && item.decision !== "pending").length,
  });
}

const VISTA = vista();

function congelar(view = VISTA) {
  const resultado = freezeRadarEvidenceBundle({
    readiness: radarFinalizationReadiness({
      started: true, stale: false, alreadyFinalized: false,
      pending: 0, analyzed: view.observed.sample.analyzedSuccess,
      failed: view.observed.sample.failedFinal, sufficiency: view.sufficiency,
    }),
    observed: view.observed, record: registro(), mode: "WEB", sufficiency: view.sufficiency,
    frozenBy: "ator", frozenAt: "2026-09-10T13:00:00.000Z",
  });
  if (!resultado.ok) throw new Error(`fixture não congelou: ${resultado.reason}`);
  return resultado.bundle;
}

const GOOGLE_FINALIZADO = congelar();

/* ============================== os três perfis ============================== */

const APOIO_DO_YOUTUBE = { serpSnapshotId: "serp-1", keyword: "skincare para pele oleosa", collectedAt: "2026-09-10T11:00:00.000Z" };
const YOUTUBE = {
  finalizedAt: "2026-09-14T10:00:00.000Z",
  runRef: { runId: "yt-1", runFingerprint: "yt-fp", collectedAt: "2026-09-14T09:00:00.000Z", universeSize: 12, queriesExecuted: 3 },
  limitations: ["vídeos curtos fora da amostra"],
};
const AMAZON = {
  finalizedAt: "2026-09-16T08:00:00.000Z",
  runRef: { runId: "amz-1", runFingerprint: "amz-fp", collectedAt: "2026-09-16T07:00:00.000Z", universeSize: 20, queriesExecuted: 2 },
  observedSummary: { products: 18 },
  supportRefs: [{ snapshotId: "serp-1", keyword: "skincare para pele oleosa review", collectedAt: "2026-09-16T06:00:00.000Z" }],
  limitations: ["não abriu PDP"],
};

const SO_GOOGLE = { serpSnapshotId: "serp-1", serpSnapshotHash: "hash-serp-1", finalizedBundle: GOOGLE_FINALIZADO };
const SO_YOUTUBE = { serpSnapshotId: "serp-1", serpSnapshotHash: "hash-serp-1", supportResearch: APOIO_DO_YOUTUBE, youtubeFrozenInvestigation: YOUTUBE };
const SO_AMAZON = { serpSnapshotId: "serp-1", serpSnapshotHash: "hash-serp-1", amazonFrozenInvestigation: AMAZON };
const GOOGLE_E_YOUTUBE = { ...SO_GOOGLE, supportResearch: APOIO_DO_YOUTUBE, youtubeFrozenInvestigation: YOUTUBE };
const GOOGLE_E_AMAZON = { ...SO_GOOGLE, amazonFrozenInvestigation: AMAZON };

function dossie(payload: Record<string, unknown>, observado: typeof VISTA.observed | null = VISTA.observed) {
  const resultado = buildRadarEvidenceBundleFromAnalysis({
    payload,
    article: ARTIGO,
    competitiveBlueprint: null,
    googleObserved: observado,
    observedAt: "2026-09-20T00:00:00.000Z",
  });
  assert.ok(resultado.ok, resultado.ok ? "" : resultado.reason);
  return resultado.bundle;
}

/*
 * VALORES DOURADOS medidos ANTES da fatia R3, com este mesmo código de
 * fixture. Eles provam que a mudança só alcança o caso "Google finalizado +
 * YouTube ou Amazon": todo outro dossiê sai byte a byte igual.
 */
const DOURADO = {
  soGoogle: "bundle-hash:7cee8b89",
  soYoutube: "bundle-hash:c7ff4436",
  soAmazon: "bundle-hash:b52dd027",
  /* Antes da R3 o Google finalizado era invisível: o hash era o do YouTube ou da Amazon sozinhos. */
  googleEYoutubeAntes: "bundle-hash:c7ff4436",
  googleEAmazonAntes: "bundle-hash:b52dd027",
};

test("R3 · dossiês sem Google finalizado ao lado de YouTube ou Amazon mantêm o hash de antes", () => {
  assert.equal(dossie(SO_GOOGLE).bundleHash, DOURADO.soGoogle, "perfil Google");
  assert.equal(dossie(SO_YOUTUBE).bundleHash, DOURADO.soYoutube, "só YouTube (o observed do Google passado por engano não entra)");
  assert.equal(dossie(SO_YOUTUBE, null).bundleHash, DOURADO.soYoutube, "só YouTube sem observed");
  assert.equal(dossie(SO_AMAZON).bundleHash, DOURADO.soAmazon, "só Amazon");
});

/*
 * ===== SDD Radar 2026-09-30 (Parte A): O GOOGLE É A BASE =====
 *
 * Antes (R3, 2026-09-28) o YouTube ou a Amazon viravam a camada PRIMARY e o
 * Google finalizado, apoio. Decisão do dono (2026-09-30): o Google é sempre a
 * base; YouTube (vídeo) e Amazon (review) são acréscimos, camadas SUPPORT com
 * o blueprint do formato em `formatBlueprints`. Investigação legada sem Google
 * finalizado continua na precedência antiga (os dourados acima não mudam).
 */
test("Google base · YouTube acrescentado: Google PRIMARY com a fotografia inteira, YouTube SUPPORT como acréscimo de formato", () => {
  const entregue = dossie(GOOGLE_E_YOUTUBE);
  assert.equal(entregue.primaryResearchProfile, "GOOGLE", "o Google é a base");
  assert.equal(entregue.research.google?.role, "PRIMARY");
  const youtube = entregue.research.youtube!;
  assert.equal(youtube.role, "SUPPORT", "uma única camada PRIMARY");
  assert.ok(youtube.refs.every(ref => ref.role === "FORMAT_EXTENSION"), "o YouTube é acréscimo de formato, não pesquisa principal");
  assert.deepEqual(youtube.counts, { queries: 3, items: 12 });
  assert.deepEqual(entregue.observed, VISTA.observed, "a fotografia do Google viaja inteira");
  assert.deepEqual(entregue.researchSources, ["WEB_SERP", "YOUTUBE_SERP"]);
  for (const frase of GOOGLE_FINALIZADO.limitations) assert.ok(entregue.limitations.includes(frase), `limitação do Google perdida: ${frase}`);
  assert.ok(entregue.limitations.includes("vídeos curtos fora da amostra"), "e as do YouTube continuam");
  assert.equal("formatBlueprints" in entregue, false, "sem blueprint de vídeo congelado, a chave não aparece");
  assert.doesNotThrow(() => assertRadarEvidenceProvenance(entregue));
  assert.doesNotThrow(() => assertRadarEvidenceBundleIntegrity(entregue));
  assert.notEqual(entregue.bundleHash, DOURADO.soGoogle, "o acréscimo muda o pacote: o Redator vê 'Atualização disponível'");
});

test("Google base · Amazon acrescentada: Google PRIMARY, Amazon SUPPORT como acréscimo de formato", () => {
  const entregue = dossie(GOOGLE_E_AMAZON);
  assert.equal(entregue.primaryResearchProfile, "GOOGLE");
  assert.equal(entregue.research.google?.role, "PRIMARY");
  assert.equal(entregue.research.amazon?.role, "SUPPORT");
  assert.ok(entregue.research.amazon!.refs.every(ref => ref.role === "FORMAT_EXTENSION"));
  assert.deepEqual(entregue.observed, VISTA.observed);
  assert.deepEqual(entregue.researchSources, ["WEB_SERP", "AMAZON_SERP"]);
  assert.doesNotThrow(() => assertRadarEvidenceBundleIntegrity(entregue));
});

test("Google base · os blueprints de vídeo e de review viajam em formatBlueprints, e a saída de vídeo soma à do artigo", () => {
  const multimodal = { recommended: { editorialOutput: "ARTICLE_WITH_EMBEDDED_VIDEO", rationale: ["vídeos vencem nas duas buscas"] }, observed: { crossSerpVideos: [{ signal: "CROSS_PLATFORM" }], sources: ["WEB_SERP", "YOUTUBE_SERP"] } };
  const blueprintComercial = { profile: "AMAZON", recommended: { recommendedOutputs: [] } };
  const entregue = dossie({
    ...SO_GOOGLE,
    youtubeFrozenInvestigation: { ...YOUTUBE, multimodal: { blueprint: multimodal } },
    amazonFrozenInvestigation: { ...AMAZON, competitiveBlueprint: blueprintComercial, originalEditorialIntent: { type: "TOP_BEST", setupSignature: "sig" } },
  });
  assert.deepEqual(entregue.formatBlueprints?.video, { frozenAt: YOUTUBE.finalizedAt, blueprint: multimodal });
  assert.equal(entregue.formatBlueprints?.review?.frozenAt, AMAZON.finalizedAt);
  assert.equal(entregue.formatBlueprints?.review?.intent?.type, "TOP_BEST");
  assert.ok(entregue.editorialOutputs.some(saida => saida.output === "ARTICLE_WITH_EMBEDDED_VIDEO"), "a saída de vídeo entra nas saídas");
  assert.deepEqual(entregue.crossSerp?.signals, [{ signal: "CROSS_PLATFORM", count: 1 }]);
  assert.doesNotThrow(() => assertRadarEvidenceBundleIntegrity(entregue));
});

test("Google base · o pacote com Google + YouTube continua pronto para o Planejador e o Redator", () => {
  const entregue = dossie(GOOGLE_E_YOUTUBE);
  assert.deepEqual(radarDossierDivergesFromFrozen(entregue, GOOGLE_FINALIZADO), []);
  const prontidao = radarHandoffReadiness({ article: ARTIGO, frozen: GOOGLE_FINALIZADO, dossier: entregue, stale: false });
  assert.equal(prontidao.ready, true, JSON.stringify(prontidao.blocks));
});

test("Google base · fotografia viva que diverge do congelado bloqueia, como em todo artigo Google", () => {
  const outra = vista(PAGINAS.slice(0, 7)).observed;
  assert.ok(radarObservedDivergesFromFrozen(outra, GOOGLE_FINALIZADO).length > 0, "o controle: a outra fotografia diverge");
  const entregue = dossie(GOOGLE_E_YOUTUBE, outra);
  const prontidao = radarHandoffReadiness({ article: ARTIGO, frozen: GOOGLE_FINALIZADO, dossier: entregue, stale: false });
  assert.equal(prontidao.ready, false, "a leitura de hoje não viaja com o carimbo de ontem");
});

test("Google base · fotografia de outro artigo nunca entra (a identidade é conferida na montagem)", () => {
  const alheia = { ...VISTA.observed, identity: { ...VISTA.observed.identity, articleId: "outro-artigo" } };
  assert.throws(() => dossie(GOOGLE_E_YOUTUBE, alheia), /RADAR_EVIDENCE_BUNDLE_ARTICLE_MISMATCH/);
});

test("Google base · a precedência: com o Google finalizado ele manda; sem ele, a precedência antiga (legado)", () => {
  assert.equal(radarPrimaryProfileOfAnalysis(GOOGLE_E_YOUTUBE), "GOOGLE");
  assert.equal(radarPrimaryProfileOfAnalysis(GOOGLE_E_AMAZON), "GOOGLE");
  assert.equal(radarPrimaryProfileOfAnalysis(SO_GOOGLE), "GOOGLE");
  assert.equal(radarPrimaryProfileOfAnalysis(SO_YOUTUBE), "YOUTUBE");
  assert.equal(radarPrimaryProfileOfAnalysis(SO_AMAZON), "AMAZON");
  assert.equal(radarPrimaryProfileOfAnalysis({ youtubeFrozenInvestigation: YOUTUBE, amazonFrozenInvestigation: AMAZON }), "AMAZON");
});

test("R3 · a leitura das autoridades monta a fotografia do Google sempre que ele foi finalizado", () => {
  const fonte = readFileSync(new URL("../lib/server/radar-canonical-authorities.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(fonte, /const googleFinalizado = perfil === "GOOGLE" \|\| \(perfil !== null && Boolean\(input\.analysis\.payload\.finalizedBundle\)\);/);
  assert.match(fonte, /\(googleFinalizado \? \(await new SerpSnapshotRepository\(\)\.list/);
  assert.match(fonte, /const google = googleFinalizado && researchContext/);
});

test("rótulo · KGR padrão é \"KGR não aplicável\", não \"Não classificado\"", () => {
  assert.equal(radarKgrClassificationLabel("not_kgr"), "KGR não aplicável");
  assert.equal(radarKgrClassificationLabel("confirmed_kgr", "minerador"), "KGR confirmado pelo Minerador");
  assert.equal(radarKgrClassificationLabel("not_available"), "Classificação KGR não recebida");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
