import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRadarSerpFeatureIntelligence } from "../lib/radar/serp-features.ts";
import { buildRadarMultimodalBlueprint, radarDecideEditorialOutput } from "../lib/radar/multimodal-blueprint.ts";
import { buildRadarYoutubeUniverse, radarYoutubeFormatCohorts } from "../lib/radar/youtube-search-model.ts";
import { buildRadarYoutubeQueryPlan } from "../lib/radar/youtube-search-queries.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";
import { RadarYoutubeFrozenInvestigationSchema, freezeRadarYoutubeInvestigation, projectRadarYoutubeEvidence, type RadarYoutubeFrozenInvestigation } from "../lib/radar/youtube-evidence.ts";
import { RADAR_YOUTUBE_PROVIDER_ENDPOINT, buildRadarYoutubeRunFingerprint, buildRadarYoutubeSearchRun } from "../lib/radar/youtube-search-run.ts";
import {
  RADAR_YOUTUBE_MIN_COHORT,
  RADAR_YOUTUBE_PERTINENT_RULER,
  buildRadarYoutubeBlueprint,
  radarVideoFormatDecision,
  radarYoutubeBlueprintRuler,
  radarYoutubeCohort,
  radarYoutubeCohortRange,
  radarYoutubeCredentialMarker,
  radarYoutubeRunPertinence,
  radarYoutubeRunPertinentSample,
} from "../lib/radar/youtube-blueprint.ts";
import { radarVideoCohortRange, radarVideoCredentialMarker } from "../lib/radar/video-competitive.ts";
import { radarCompetitiveBlueprintViewOfAnalysis } from "../lib/radar/competitive-blueprint-view.ts";
import { buildRadarEvidenceBundleFromAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import { buildRadarEditorialVideoModel } from "../lib/radar/editorial-profile-model.ts";

/*
 * ===== 2026-10-09 · YOUTUBE PELO PROCESSO DO PILOTO (regra do dono) =====
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos": a fotografia nova do YouTube nasce da amostra
 * pertinente, sem roteiro genérico; a decisão de formato curto é uma só; o CSV
 * de vídeo sai só pela planta APPROVED. E o congelamento é sagrado: a
 * fotografia gravada ANTES desta régua (fixture gerada com o código de antes,
 * `radar-youtube-congelado-antes-2026-10-09.json`) é lida como foi gravada,
 * com o mesmo hash de pacote.
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const ANTES = JSON.parse(await readFile(new URL("./fixtures/radar-youtube-congelado-antes-2026-10-09.json", import.meta.url), "utf8")) as {
  frozen: RadarYoutubeFrozenInvestigation;
  esperado: { canonical: unknown; evidence: unknown; bundleHashYoutube: string; bundleHashGoogleComVideo: string };
};
const googleReal = JSON.parse(await readFile(new URL("./fixtures/dataforseo-google-skin-care-noturno.json", import.meta.url), "utf8"));
const youtubeReal = JSON.parse(await readFile(new URL("./fixtures/dataforseo-youtube-skin-care-noturno.json", import.meta.url), "utf8"));

const corrida = () => {
  const normalizada = normalizeDataForSeoYoutubeResponse(youtubeReal, "ytq:1");
  return buildRadarYoutubeSearchRun({
    runId: "run-1", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "usuario-1",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["ytq:1"] }),
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [],
      collectedAt: "2026-09-14T18:51:07.000Z",
    },
    queries: [{ queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: normalizada.results.length }],
    results: normalizada.results,
    universe: buildRadarYoutubeUniverse(normalizada.results),
  });
};

const FUNDAMENTO = { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: `sha256:${"a".repeat(64)}` };

const vistaDe = (frozen: RadarYoutubeFrozenInvestigation) => radarCompetitiveBlueprintViewOfAnalysis({
  profile: "YOUTUBE", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: FUNDAMENTO.articleDnaContentHash,
  frozen, liveBlueprint: null, liveMultimodal: null, googleObserved: null, primaryKeyword: null,
  amazonFrozen: null, amazonBlueprint: null, amazonUniverseSize: 0, supportSnapshotId: null, serpSnapshotId: null, googleFrozenAt: null,
  generatedAt: "2026-09-14T21:00:00.000Z",
});

/* ============================== o congelamento é sagrado ============================== */

test("congelamento sagrado · a fotografia gravada ANTES da régua nova é lida como foi gravada, com o mesmo hash de pacote", () => {
  const frozen = RadarYoutubeFrozenInvestigationSchema.parse(JSON.parse(JSON.stringify(ANTES.frozen)));
  assert.deepEqual(frozen, ANTES.frozen, "o contrato da fotografia não mudou de forma: a gravada atravessa a leitura intacta");
  assert.equal(radarYoutubeBlueprintRuler(frozen.blueprint), "AMOSTRA_INTEIRA", "a fotografia antiga é reconhecida pela régua que a fez");
  assert.ok(frozen.blueprint.recommended.script.length > 0, "e o roteiro gravado nela continua lá (não é regravado)");

  const vista = vistaDe(frozen);
  assert.deepEqual(JSON.parse(JSON.stringify(vista.blueprint)), ANTES.esperado.canonical, "a camada canônica da fotografia antiga é a de antes, campo a campo");
  assert.deepEqual(JSON.parse(JSON.stringify(projectRadarYoutubeEvidence(frozen))), ANTES.esperado.evidence, "a evidência projetada também");

  const dossie = buildRadarEvidenceBundleFromAnalysis({
    payload: { youtubeFrozenInvestigation: frozen, youtubeSearch: corrida() },
    article: FUNDAMENTO, competitiveBlueprint: vista.blueprint, observedAt: "2026-09-14T21:00:00.000Z",
  });
  assert.ok(dossie.ok);
  assert.equal(dossie.ok && dossie.bundle.bundleHash, ANTES.esperado.bundleHashYoutube, "o pacote do perfil YouTube mantém o hash");

  const comGoogle = buildRadarEvidenceBundleFromAnalysis({
    payload: { finalizedBundle: { frozenAt: "2026-09-10T13:00:00.000Z", frozenBy: "usuario-1", limitations: [] }, youtubeFrozenInvestigation: frozen, youtubeSearch: corrida() },
    article: FUNDAMENTO, competitiveBlueprint: null, observedAt: "2026-09-10T13:00:00.000Z",
  });
  assert.ok(comGoogle.ok);
  assert.equal(comGoogle.ok && comGoogle.bundle.bundleHash, ANTES.esperado.bundleHashGoogleComVideo, "o pacote do Google com o acréscimo de vídeo mantém o hash");
});

/* ============================== a fotografia nova ============================== */

test("fotografia nova · nasce da amostra pertinente, diz a régua e não grava roteiro genérico", () => {
  const run = corrida();
  const blueprint = buildRadarYoutubeBlueprint({ run, declaredIntent: "INFORMATIONAL", editorialTopics: ["ordem dos produtos"], generatedAt: "2026-10-09T10:00:00.000Z" });
  assert.equal(radarYoutubeBlueprintRuler(blueprint), "PERTINENTE");
  assert.deepEqual(blueprint.recommended.script, [], "sem roteiro genérico: o roteiro é a planta do artigo-modelo");
  const regua = blueprint.limitations.find(item => item.startsWith(RADAR_YOUTUBE_PERTINENT_RULER))!;
  assert.match(regua, /^Amostra pertinente \(régua de 2026-10-09\): \d+ de \d+ longos e \d+ de \d+ Shorts entram na leitura/);
  assert.match(regua, /Formato: /);
  /* As coortes gravadas são as pertinentes: o total comparável inclui o que ficou fora da conta. */
  const total = run.universe.filter(item => item.universeClass === "COMPARABLE_LONG_FORM" || item.universeClass === "COMPARABLE_SHORT").length;
  assert.equal(blueprint.observed.longForm.videoCount + blueprint.observed.shorts.videoCount, blueprint.observed.comparableSize);
  assert.ok(blueprint.observed.comparableSize <= total);
  /* A faixa recomendada é a da coorte do formato decidido, pela função única. */
  const decisao = radarVideoFormatDecision({ longos: blueprint.observed.longForm, curtos: blueprint.observed.shorts });
  assert.deepEqual(blueprint.recommended.durationSecondsRange, decisao.faixa);
  /* D10: nenhuma frase de lacuna com conferência aberta. */
  for (const lacuna of blueprint.recommended.gaps) assert.doesNotMatch(lacuna.statement, /confira se a coleta traz/);

  /* A camada canônica da fotografia nova: sem roteiro, gancho nem Shorts genéricos. */
  const multimodal = buildRadarMultimodalBlueprint({ features: buildRadarSerpFeatureIntelligence(googleReal), youtubeUniverse: run.universe, generatedAt: "2026-10-09T10:00:00.000Z" });
  const nova = freezeRadarYoutubeInvestigation({ run, blueprint, finalizedBy: "u", finalizedAt: "2026-10-09T11:00:00.000Z", multimodal: { blueprint: multimodal, researchSources: ["WEB_SERP", "YOUTUBE_SERP"] } });
  const canonica = vistaDe(nova).blueprint;
  assert.equal(canonica?.profile, "YOUTUBE");
  if (canonica?.profile !== "YOUTUBE") return;
  assert.deepEqual(canonica.recommended.script, []);
  assert.equal(canonica.recommended.hookDirection, null);
  assert.deepEqual(canonica.recommended.shorts, []);
  assert.ok(canonica.recommended.articleApplication.every(item => item.piece !== "SHORT"));

  /* O modelo editorial de vídeo da fotografia nova não inventa roteiro, gancho nem CTA: é o da planta. */
  const contextoDoArtigo = {
    state: "COMPLETE", article: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: null, promise: null, mainIntent: null, hierarchy: null, classification: null },
    keywords: [{ identity: { keywordId: "kw-1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: null, text: "skin care noturno", role: "principal" }, resolution: "FULL" }],
    editorialTopics: ["ordem dos produtos"], resolvedKeywordTexts: ["skin care noturno"], silo: null, formationSerp: null, internalLinks: null, limitations: [],
  } as unknown as RadarArticleResearchContext;
  const modelo = buildRadarEditorialVideoModel({ context: contextoDoArtigo, blueprint: canonica });
  assert.deepEqual(modelo.blocks, []);
  assert.equal(modelo.hook, null);
  assert.equal(modelo.cta, null);
  assert.deepEqual(modelo.derived, []);
  /* A camada antiga continua lida como sempre: com roteiro, gancho e CTA. */
  const antigo = vistaDe(ANTES.frozen).blueprint;
  if (antigo?.profile !== "YOUTUBE") throw new Error("a fotografia antiga é do YouTube");
  const modeloAntigo = buildRadarEditorialVideoModel({ context: contextoDoArtigo, blueprint: antigo });
  assert.ok(modeloAntigo.blocks.length > 0 && modeloAntigo.hook && modeloAntigo.cta);
});

/* ============================== uma régua de cada ============================== */

test("uma régua de cada · faixa e credencial são a mesma função no blueprint e no CSV de vídeo", () => {
  const coorte = radarYoutubeCohort({ format: "LONG_FORM", entries: corrida().universe.filter(item => item.universeClass === "COMPARABLE_LONG_FORM"), collectedAt: null });
  assert.deepEqual(radarVideoCohortRange(coorte), radarYoutubeCohortRange(coorte));
  for (const nome of ["Dra. Ana", "Dermatologista explica", "Canal Qualquer", "Maquiadora Profissional", "CRM 1234"]) {
    assert.equal(radarVideoCredentialMarker(nome), radarYoutubeCredentialMarker(nome), nome);
  }
});

test("decisão única de formato curto · Shorts pertinentes lideram com 4 ou mais; senão, vídeo longo pela planta", () => {
  const run = corrida();
  const longos = radarYoutubeCohort({ format: "LONG_FORM", entries: run.universe.filter(item => item.universeClass === "COMPARABLE_LONG_FORM").slice(0, 2), collectedAt: null });
  const curtos = radarYoutubeCohort({ format: "SHORTS", entries: run.universe.filter(item => item.universeClass === "COMPARABLE_SHORT").slice(0, RADAR_YOUTUBE_MIN_COHORT), collectedAt: null });
  const curto = radarVideoFormatDecision({ longos, curtos });
  assert.equal(curto.curto, true);
  assert.equal(curto.lider, "SHORTS");
  assert.deepEqual(curto.faixa, radarYoutubeCohortRange(curtos));
  assert.match(curto.motivo, /recorte da planta/);

  const poucos = radarYoutubeCohort({ format: "SHORTS", entries: curtos.videoCount ? run.universe.filter(item => item.universeClass === "COMPARABLE_SHORT").slice(0, 3) : [], collectedAt: null });
  const umLongo = radarYoutubeCohort({ format: "LONG_FORM", entries: run.universe.filter(item => item.universeClass === "COMPARABLE_LONG_FORM").slice(0, 1), collectedAt: null });
  const casos = radarVideoFormatDecision({ longos: umLongo, curtos: poucos });
  assert.equal(casos.curto, false, "abaixo de 4 Shorts pertinentes, os Shorts descrevem casos");
  assert.match(casos.motivo, /descrevem casos, não mercado/);

  const semAmostra = radarVideoFormatDecision(null);
  assert.equal(semAmostra.curto, false);
  assert.match(semAmostra.motivo, /segue o artigo-modelo, em formato longo/);
});

test("multiformato · com a conta pertinente da corrida, as contagens e a saída curta seguem a mesma régua; sem ela, a conta de antes", () => {
  const run = corrida();
  const features = buildRadarSerpFeatureIntelligence(googleReal);
  const pertinencia = radarYoutubeRunPertinence(run);
  const { amostra, decisao } = radarYoutubeRunPertinentSample(run);
  assert.deepEqual(pertinencia, { longForm: amostra.longos.coorte.videoCount, shorts: amostra.curtos.coorte.videoCount, shortFormat: decisao.curto });

  const novo = buildRadarMultimodalBlueprint({ features, youtubeUniverse: run.universe, generatedAt: "2026-09-14T21:00:00.000Z", youtubePertinence: pertinencia });
  assert.equal(novo.observed.youtubeLongForm, pertinencia.longForm);
  assert.equal(novo.observed.youtubeShorts, pertinencia.shorts);

  /* A fotografia nova do YouTube conta os mesmos pertinentes que o multiformato. */
  const blueprint = buildRadarYoutubeBlueprint({ run, declaredIntent: null, editorialTopics: [], generatedAt: "2026-09-14T21:00:00.000Z" });
  const regua = blueprint.limitations.find(item => item.startsWith(RADAR_YOUTUBE_PERTINENT_RULER)) || "";
  assert.ok(regua.includes(`${pertinencia.longForm} de `) && regua.includes(` e ${pertinencia.shorts} de `), regua);

  /* Sem a conta pertinente, nada muda para quem não a passa (a camada gravada é lida como foi). */
  const antigo = buildRadarMultimodalBlueprint({ features, youtubeUniverse: run.universe, generatedAt: "2026-09-14T21:00:00.000Z" });
  const coortes = radarYoutubeFormatCohorts(run.universe);
  assert.equal(antigo.observed.youtubeLongForm, coortes.longForm.length);
  assert.equal(antigo.observed.youtubeShorts, coortes.shorts.length);

  /* A saída curta é a decisão única: 3 Shorts contra 2 longos não fazem formato curto. */
  assert.equal(radarDecideEditorialOutput({ features: null, longForm: 2, shorts: 3 }).output, "SHORTS", "a conta de antes, sem a decisão");
  assert.equal(radarDecideEditorialOutput({ features: null, longForm: 2, shorts: 3, shortFormat: false }).output, "YOUTUBE_VIDEO");
  assert.equal(radarDecideEditorialOutput({ features: null, longForm: 2, shorts: 5, shortFormat: true }).output, "SHORTS");
});

test("plano de consultas · o tópico fora do escopo e o tópico ruído não viram consulta paga; keyword e Assunto não passam pela régua", () => {
  const keyword = (text: string, role: "principal" | "secundaria", keywordId: string) => ({
    identity: { keywordId, canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: null, text, role },
    resolution: "FULL" as const,
  });
  const contexto = (articleScope?: unknown) => ({
    state: "COMPLETE" as const,
    article: {
      brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "hash-1",
      promise: null, mainIntent: "informacional", hierarchy: "Suporte",
      classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "fixture" },
    },
    keywords: [keyword("skincare para pele oleosa", "principal", "kw-1"), keyword("acne e pele oleosa", "secundaria", "kw-2")],
    editorialTopics: ["como controlar oleosidade da pele", "maquiagem para pele oleosa", "Assine nossa newsletter de skincare"],
    resolvedKeywordTexts: [], silo: null, formationSerp: null, internalLinks: null, limitations: [],
    ...(articleScope ? { articleScope } : {}),
  }) as unknown as RadarArticleResearchContext;

  const semReajuste = buildRadarYoutubeQueryPlan({ context: contexto(), limit: 10 });
  const textos = semReajuste.queries.map(item => item.text);
  assert.ok(textos.includes("como controlar oleosidade da pele"));
  assert.ok(textos.includes("maquiagem para pele oleosa"), "sem reajuste, o tópico entra");
  assert.ok(!textos.some(item => /newsletter/i.test(item)), "chamada de newsletter não é consulta");
  assert.ok(textos.includes("acne e pele oleosa"), "a secundária do artigo não passa pela régua");
  assert.ok(semReajuste.limitations.some(item => item.includes("\"Assine nossa newsletter de skincare\" (newsletter ou inscrição)")), semReajuste.limitations.join(" | "));

  const comReajuste = buildRadarYoutubeQueryPlan({
    context: contexto({ angle: null, exclusions: [{ label: "maquiagem", source: "excludedSubjects", owner: "Maquiagem para pele oleosa" }] }),
    limit: 10,
  });
  const textosComReajuste = comReajuste.queries.map(item => item.text);
  assert.ok(!textosComReajuste.includes("maquiagem para pele oleosa"), "o assunto que o reajuste tirou não vira consulta");
  assert.ok(textosComReajuste.includes("como controlar oleosidade da pele"));
  assert.ok(comReajuste.limitations.some(item => item.includes("\"maquiagem para pele oleosa\" (fora do escopo deste artigo)")), comReajuste.limitations.join(" | "));
  for (const limitacao of [...semReajuste.limitations, ...comReajuste.limitations]) {
    assert.doesNotMatch(limitacao, /pendência|aguardando aprovação|rascunho|fonte a obter|preencher|peça ao Arquiteto|confira se a coleta traz/i);
  }
});

test("tela do YouTube · a superfície principal é o vídeo pela planta: amostra pertinente, faixa por coorte, formato, capítulos e cortes", async () => {
  const { montarRadar, React } = await import("./radar-dom-harness.mts");
  const { VideoPelaPlanta } = await import("../modules/radar/radar-youtube-search-panel.tsx");
  const run = corrida();
  const { amostra, decisao } = radarYoutubeRunPertinentSample(run);

  /* Corrida viva, sem planta entregue: a conta pertinente e de onde saem capítulos e cortes. */
  const tela = await montarRadar();
  await tela.render(React.createElement(VideoPelaPlanta, { corrida: run, frozen: null, videoPlan: null }));
  const amostraNaTela = tela.get("radar-youtube-pertinent-sample").textContent || "";
  assert.ok(amostraNaTela.includes(`${amostra.longos.coorte.videoCount} de ${amostra.longos.total} longo(s)`), amostraNaTela);
  assert.match(tela.get("radar-youtube-cohort-ranges").textContent || "", /Faixa por coorte \(P25–P75 dos pertinentes; referência, não meta\): longos .+ · Shorts /);
  assert.ok((tela.get("radar-youtube-format-decision").textContent || "").includes(decisao.motivo));
  assert.match(tela.get("radar-youtube-plant-capitulos-source").textContent || "", /artigo-modelo aprovado/);
  assert.doesNotMatch(tela.text(), /Roteiro-modelo competitivo|Roteiro recomendado|Estrutura sugerida|Formato vencedor/);
  tela.destroy();

  /* Fotografia antiga: dita como antiga, e a amostra pertinente lida da corrida. */
  const antiga = await montarRadar();
  await antiga.render(React.createElement(VideoPelaPlanta, { corrida: run, frozen: ANTES.frozen, videoPlan: null }));
  assert.match(antiga.get("radar-youtube-pertinent-old-photo").textContent || "", /anterior à régua de 2026-10-09 e continua como foi gravada/);
  antiga.destroy();

  /* Com o plano da planta: capítulos e cortes, na ordem dela. */
  const plano = {
    status: "ready" as const, formato: decisao, gancho: "abra pelo próprio tema, \"skin care noturno\", sem apresentação longa.", premissa: "A rotina da noite repara.",
    capitulos: [
      { numero: 1, titulo: "Limpeza", pergunta: null, entregar: "Limpe antes de tratar.", explicar: [], falaDelimitada: [], mostrar: "", antesDeAfirmar: null, demonstravel: true },
      { numero: 2, titulo: "Hidratação", pergunta: null, entregar: "Hidrate por último.", explicar: [], falaDelimitada: [], mostrar: "", antesDeAfirmar: null, demonstravel: false },
    ],
    cortes: [{ numero: 1, capitulo: 1, titulo: "Limpeza", utilidade: { pontos: 3, partes: [] }, gancho: "Por que limpar primeiro?", ideia: "", mostrar: "", fonte: null, origem: "" }],
    semCorte: [], foraDoPublicavel: [], amostra,
  };
  const comPlano = await montarRadar();
  await comPlano.render(React.createElement(VideoPelaPlanta, { corrida: run, frozen: null, videoPlan: plano }));
  const capitulos = comPlano.get("radar-youtube-plant-capitulos").textContent || "";
  assert.ok(capitulos.indexOf("Capítulo 1 · Limpeza") >= 0 && capitulos.indexOf("Capítulo 2 · Hidratação") > capitulos.indexOf("Capítulo 1 · Limpeza"), capitulos);
  assert.match(comPlano.get("radar-youtube-plant-cuts").textContent || "", /capítulo 1 · Limpeza — gancho: Por que limpar primeiro\?/);
  comPlano.destroy();
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
