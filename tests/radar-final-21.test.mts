import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  compactRadarResearchForRead,
  radarResearchIsFrozen,
  radarResearchProvenanceOfAnalysis,
  radarResearchProvenanceSummary,
  radarResearchSampleOfAnalysis,
  radarResearchSampleSummary,
} from "../lib/radar/research-read-model.ts";
import { loadRadarResearchProvenance, loadRadarResearchSample } from "../lib/radar/research-part-client.ts";
import { RadarCompactBaseError, createRadarAnalysisSuccessor, RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint } from "../lib/radar/amazon-search-run.ts";
import { amazonCompetitiveBlueprintOfAnalysis } from "../lib/radar/amazon-editorial.ts";
import { freezeRadarAmazonInvestigation } from "../lib/radar/amazon-evidence.ts";
import { radarResearchProfileStateOfAnalysis } from "../lib/radar/research-profile-state.ts";
import { radarCompetitiveBlueprintViewOfAnalysis } from "../lib/radar/competitive-blueprint-view.ts";
import { buildRadarEvidenceBundleFromAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";

/*
 * ===== RADAR_FINAL_2.1 · O READ MODEL COMPACTO DA VERSÃO CORRENTE =====
 *
 * Disclosure fechado não é lazy loading se os 129,7 KB já atravessaram a rede.
 * Este gate tira a matéria-prima da CÓPIA DE LEITURA e a busca sob demanda —
 * sem tocar na autoridade persistida.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String(entrada));
    return Promise.reject(new Error("REDE NÃO ESPERADA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const payloadAmazon = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"),
);

const fonteDaRotaLazy = await readFile(new URL("../app/api/editorial/radar-research-part/route.ts", import.meta.url), "utf8");
const fonteDoPainel = await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
const fonteDoRepositorio = await readFile(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8");
const fonteDaRotaDeAnalise = await readFile(new URL("../app/api/editorial/radar-analysis/route.ts", import.meta.url), "utf8");

/* ============================ as investigações ============================ */

const corrida = () => {
  const normalizada = normalizeDataForSeoAmazonResponse(payloadAmazon, "amzq:1");
  return buildRadarAmazonSearchRun({
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
};

const blueprint = () => amazonCompetitiveBlueprintOfAnalysis({
  articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc",
  run: corrida(), support: null,
  primaryKeyword: "protetor solar facial", declaredIntent: "comercial",
  researchRefs: [], generatedAt: "2026-09-15T13:00:00.000Z", frozenAt: null,
});

const congelada = () => freezeRadarAmazonInvestigation({
  run: corrida(), blueprint: blueprint(), finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
});

const analiseFinalizada = () => ({
  amazonSearch: corrida(),
  amazonFrozenInvestigation: congelada(),
  amazonBlueprint: null,
  researchTransport: "FULL" as const,
});

const analiseViva = () => ({
  amazonSearch: corrida(),
  amazonFrozenInvestigation: null,
  amazonBlueprint: null,
  researchTransport: "FULL" as const,
});

const bytes = (valor: unknown) => JSON.stringify(valor ?? null).length;

/* ============================== A, B e C ============================== */

test("A · o initial read de uma investigação Amazon congelada não leva universe nem results", () => {
  const compacto = compactRadarResearchForRead(analiseFinalizada() as unknown as Record<string, unknown>);
  const serializado = JSON.stringify(compacto);

  assert.equal(compacto.amazonSearch, null);
  assert.equal(serializado.includes('"universe"'), false);
  assert.equal(serializado.includes('"results"'), false);
  assert.equal(compacto.researchTransport, "COMPACT");

  /*
   * ============ §12 · A MEDIDA ============
   *
   * 147,0 KB → 17,3 KB. O que sobra é a fotografia, o blueprint e o estado —
   * exatamente o que §3 manda ter no carregamento inicial.
   */
  const antes = bytes(analiseFinalizada());
  const depois = bytes(compacto);
  assert.ok(depois < antes * 0.2, `a compactação precisa cortar >80%; cortou ${((1 - depois / antes) * 100).toFixed(1)}%`);

  /* E a FOTOGRAFIA sobrevive inteira: é ela que sustenta a visão principal. */
  assert.ok(compacto.amazonFrozenInvestigation);
});

test("B · o mesmo vale para o YouTube congelado", () => {
  const compacto = compactRadarResearchForRead({
    youtubeSearch: { universe: [{ videoId: "v1" }], results: [{ videoId: "v1" }] },
    youtubeFrozenInvestigation: { finalizedAt: "2026-09-14T10:00:00.000Z", runRef: { universeSize: 38, queriesExecuted: 3 } },
  } as unknown as Record<string, unknown>);

  assert.equal(compacto.youtubeSearch, null);
  assert.equal(compacto.researchTransport, "COMPACT");
});

test("C · investigação VIVA não é compactada — o universo é a superfície de trabalho", () => {
  /*
   * ============ A RAZÃO É DE PRODUTO, NÃO DE PERFORMANCE ============
   *
   * Antes do freeze o universo está ABERTO por construção: é nele que a
   * curadoria do YouTube acontece. Tirá-lo dali quebraria a curadoria para
   * economizar bytes que a pessoa está olhando.
   */
  const viva = analiseViva() as unknown as Record<string, unknown>;
  assert.equal(radarResearchIsFrozen(viva), false);

  const resultado = compactRadarResearchForRead(viva);
  assert.equal(resultado, viva, "a investigação viva sai intacta, e pelo mesmo objeto");
  assert.equal(resultado.researchTransport, "FULL");
});

/* ============================== D, E e F ============================== */

test("D e E · abrir a amostra faz UMA leitura remota, e nenhuma chamada a provider", async () => {
  const chamadas: string[] = [];
  const fetchFalso = (async (url: unknown) => {
    chamadas.push(String(url));
    return { ok: true, json: async () => ({ success: true, readbackConfirmed: true, analysisVersionId: "v-3", sample: { profile: "AMAZON", run: corrida(), count: 51 } }) };
  }) as unknown as typeof fetch;

  const resultado = await loadRadarResearchSample({
    brandId: "marca-1", articleId: "artigo-1", profile: "AMAZON", fetchImpl: fetchFalso,
  });

  assert.equal(resultado.ok, true);
  assert.equal(chamadas.length, 1);
  assert.match(chamadas[0], /^\/api\/editorial\/radar-research-part\?/);
  assert.match(chamadas[0], /part=sample/);

  /*
   * §4 · PROVIDER_CALLS = 0 — A COLETA FOI PAGA UMA VEZ.
   *
   * Buscá-la no provider ao abrir um disclosure cobraria duas vezes pelo mesmo
   * dado, e cobraria por um clique de curiosidade.
   */
  const rota = semComentarios(fonteDaRotaLazy);
  assert.equal(/executeDataForSeo|collectDataForSeo|dataforseo\.com|\bfetch\(/.test(rota), false);
  assert.match(rota, /WorkflowRepository/);
  /* É GET: lê, não decide e não muda estado. */
  assert.match(rota, /export async function GET/);
  assert.equal(/export async function POST/.test(rota), false);
});

test("F · com o disclosure fechado, nenhuma leitura acontece", () => {
  const painel = semComentarios(fonteDoPainel);

  /*
   * A BUSCA É DISPARADA PELO `onToggle`, e só quando ele ABRE.
   *
   * Um `useEffect` que buscasse na montagem transformaria "recolhido" em
   * decoração: os bytes chegariam do mesmo jeito, que é exatamente o defeito
   * que este gate veio corrigir.
   */
  assert.match(painel, /onToggle=\{evento => \{/);
  assert.match(painel, /if \(!\(evento\.currentTarget as HTMLDetailsElement\)\.open\) return;/);
  assert.equal(/useEffect\([^)]*onLoadSample|useEffect\([^)]*onLoadProvenance/.test(painel), false, "a busca acontece na montagem");

  /* E o segundo clique não busca de novo: `IDLE` é o único estado que dispara. */
  assert.match(painel, /if \(leitura \|\| lazySample\?\.state !== "IDLE"\) return;/);
  assert.match(painel, /if \(tecnico \|\| lazyProvenance\?\.state !== "IDLE"\) return;/);
});

/* ================================ G e H ================================ */

test("G e H · a proveniência também é sob demanda, e some do payload inicial", async () => {
  const chamadas: string[] = [];
  const fetchFalso = (async (url: unknown) => {
    chamadas.push(String(url));
    return { ok: true, json: async () => ({ success: true, readbackConfirmed: true, analysisVersionId: "v-3", provenance: radarResearchProvenanceOfAnalysis({ payload: analiseFinalizada(), profile: "AMAZON" }) }) };
  }) as unknown as typeof fetch;

  const resultado = await loadRadarResearchProvenance({
    brandId: "marca-1", articleId: "artigo-1", profile: "AMAZON", fetchImpl: fetchFalso,
  });

  assert.equal(resultado.ok, true);
  assert.match(chamadas[0], /part=provenance/);
  if (!resultado.ok) return;

  /*
   * ============ A PROVENIÊNCIA RESPONDE SEM A CORRIDA AO LADO ============
   *
   * É para isso que a fotografia guarda `runRef`: id, assinatura, provider e
   * locale continuam disponíveis depois da compactação.
   */
  const semCorrida = radarResearchProvenanceOfAnalysis({
    payload: compactRadarResearchForRead(analiseFinalizada() as unknown as Record<string, unknown>),
    profile: "AMAZON",
  });
  assert.equal(semCorrida.runId, "run-amz-1");
  assert.equal(semCorrida.fingerprint, corrida().fingerprint.signature);
  assert.equal(semCorrida.languageCode, "pt_BR");
  assert.ok(semCorrida.limitations.length > 0, "§24 · as limitações atravessam o lazy");

  /* E o resumo do payload inicial diz só que ela EXISTE. */
  assert.deepEqual(radarResearchProvenanceSummary(analiseFinalizada()), { available: true });
});

/* ================================== I ================================== */

test("I · o DTO compacto NUNCA pode ser a base de uma escrita", async () => {
  /*
   * ============ §9 · A TRAVA QUE TORNA A COMPACTAÇÃO SEGURA ============
   *
   * Uma cópia compacta tem exatamente a FORMA de uma investigação sem coleta.
   * Sucedê-la gravaria `amazonSearch: null` sobre uma coleta paga — e o banco
   * aceitaria, porque nada no objeto denuncia a diferença.
   *
   * O erro acontece na montagem, alto, em vez de virar perda silenciosa.
   */
  const base = RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1",
    serpSnapshotId: null, serpSnapshotVersion: null, serpSnapshotHash: null,
    serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [], extractionFailures: [],
    verifiedSources: [], sourceVerificationFailures: [], deepResearch: null, researchTarget: null,
    supportResearch: null, researchPackage: null, amazonSearch: corrida(), amazonBlueprint: null,
    amazonFrozenInvestigation: congelada(), youtubeSearch: null, youtubeFrozenInvestigation: null,
    finalizedBundle: null, benchmark: null, semanticTerms: [], structuralDecisions: [],
    competitiveness: null, keywordDecisions: [], competitiveReport: null,
    plannerPackage: null, plannerTransfer: null, plannerBundle: null, researchTransport: "FULL",
    mode: "kgr_light",
    modeRecommendation: { suggestedMode: "kgr_light", reasons: ["fixture"], confidence: "low", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  });

  const versao = {
    versionId: "v-1", entityId: "radar-analysis:artigo-1", versionNumber: 1,
    previousVersionId: null, contentHash: "sha256:x", origin: "human" as const,
    changeReason: "fixture", createdAt: "2026-09-15T12:00:00.000Z", createdBy: "user-1",
    payload: base,
  };

  /* Sobre a AUTORIDADE a escrita funciona, e a coleta sobrevive. */
  const sucessora = await createRadarAnalysisSuccessor(versao, { amazonBlueprint: null }, "user-1");
  assert.ok(sucessora.payload.amazonSearch, "a matéria-prima canônica foi preservada");
  assert.equal(sucessora.payload.amazonSearch?.universe.length, 51);

  /* Sobre a CÓPIA DE LEITURA, não. */
  const compacta = { ...versao, payload: { ...base, ...compactRadarResearchForRead(base as unknown as Record<string, unknown>) } as typeof base };
  await assert.rejects(
    () => createRadarAnalysisSuccessor(compacta, { amazonBlueprint: null }, "user-1"),
    (erro: unknown) => erro instanceof RadarCompactBaseError,
  );
});

test("I · o readback por artigo continua devolvendo a autoridade — é dele que se escreve", () => {
  const rota = semComentarios(fonteDaRotaDeAnalise);
  const repositorio = semComentarios(fonteDoRepositorio);

  /*
   * A COMPACTAÇÃO VIVE NA LISTAGEM, não no readback.
   *
   * O readback é a base de toda escrita do cliente: compactá-lo apagaria a
   * coleta na gravação seguinte — e nenhuma trava o salvaria, porque ele não
   * seria mais a autoridade.
   */
  assert.match(repositorio, /compactRadarResearchForRead\(versao\.payload/);
  assert.equal(/compactRadarResearchForRead/.test(rota), false, "o readback não compacta");
});

/* ================================ J e K ================================ */

test("J e K · FINALIZED renderiza tudo sem a amostra, e o handoff não a exige", () => {
  const compacta = compactRadarResearchForRead(analiseFinalizada() as unknown as Record<string, unknown>);

  /*
   * §7 · A FOTOGRAFIA SUSTENTA A VISÃO PRINCIPAL SOZINHA.
   *
   * Estado, contagens, blueprint: tudo responde sem o universo ao lado. É para
   * isso que o freeze nasceu por referência.
   */
  const projecao = radarResearchProfileStateOfAnalysis({ payload: compacta, profile: "AMAZON" });
  assert.equal(projecao.state, "FINALIZED");
  assert.equal(projecao.counts.videos, 51);

  const vista = radarCompetitiveBlueprintViewOfAnalysis({
    profile: "AMAZON", articleId: "artigo-1", articleDnaVersionId: "dna-1",
    frozen: null, liveBlueprint: null, liveMultimodal: null, primaryKeyword: null,
    amazonFrozen: compacta.amazonFrozenInvestigation as never,
    amazonBlueprint: null, amazonUniverseSize: 0,
    generatedAt: "2026-09-15T16:00:00.000Z",
  });
  assert.equal(vista.frozen, true);
  assert.ok(vista.blueprint, "o Blueprint renderiza sem a amostra");

  /*
   * §8 · E O HANDOFF NÃO DEPENDE DE O CLIENTE TER ABERTO NADA.
   *
   * O servidor resolve as próprias autoridades: o dossiê é montado a partir da
   * fotografia, e lazy é transporte de tela.
   */
  const dossie = buildRadarEvidenceBundleFromAnalysis({
    payload: compacta,
    article: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:abc" },
    competitiveBlueprint: blueprint(),
    observedAt: "2026-09-15T16:00:00.000Z",
  });
  assert.equal(dossie.ok, true);
  if (!dossie.ok) return;
  assert.equal(dossie.bundle.research.amazon?.counts.items, 51);
});

/* ================================== L ================================== */

test("L · o resumo do payload inicial basta para o rótulo do disclosure", () => {
  const compacta = compactRadarResearchForRead(analiseFinalizada() as unknown as Record<string, unknown>);

  /*
   * "Ver amostra competitiva · 51 produtos" sem ter transportado 51 produtos.
   *
   * A contagem vem da fotografia — `observedSummary` e `runRef` — e é isso que
   * permite o rótulo existir antes do conteúdo.
   */
  const resumo = radarResearchSampleSummary({ payload: compacta, profile: "AMAZON" });
  assert.deepEqual(resumo, { count: 51, available: true, unit: "produto(s)" });

  /* E a amostra buscada devolve a corrida inteira, que é o que ela renderiza. */
  const amostra = radarResearchSampleOfAnalysis({ payload: analiseFinalizada(), profile: "AMAZON" });
  assert.equal((amostra.run as { universe: unknown[] }).universe.length, 51);
  assert.equal(amostra.count, 51);
});

test("sentinela · nenhuma ida ao servidor fora das leituras declaradas", () => {
  assert.deepEqual(idasAoServidor, []);
});
