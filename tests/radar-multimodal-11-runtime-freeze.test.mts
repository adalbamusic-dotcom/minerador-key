import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildRadarSerpFeatureIntelligence } from "../lib/radar/serp-features.ts";
import { buildRadarMultimodalBlueprint } from "../lib/radar/multimodal-blueprint.ts";
import { buildRadarYoutubeUniverse } from "../lib/radar/youtube-search-model.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";
import { radarResearchPlanOfAnalysis, RADAR_RESEARCH_SOURCES } from "../lib/radar/search-mode.ts";
import { freezeRadarYoutubeInvestigation, RadarYoutubeFrozenInvestigationSchema } from "../lib/radar/youtube-evidence.ts";
import {
  RADAR_YOUTUBE_PROVIDER_ENDPOINT,
  buildRadarYoutubeRunFingerprint,
  buildRadarYoutubeSearchRun,
} from "../lib/radar/youtube-search-run.ts";
import { buildRadarYoutubeBlueprint } from "../lib/radar/youtube-blueprint.ts";

/*
 * ====  RADAR_MULTIMODAL_1.1 · RUNTIME, UI E FREEZE  ====
 *
 * O gate anterior construiu e testou o domínio. Este liga: fontes aditivas na
 * tela, blueprint multiformato visível, e a fotografia guardando a
 * investigação INTEIRA — não só a parte de YouTube.
 *
 * Roda contra os dois payloads reais de `skin care noturno`.
 *
 * PROVIDER_CALLS_IN_TESTS = 0, com sentinela no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const googleReal = JSON.parse(await readFile(new URL("./fixtures/dataforseo-google-skin-care-noturno.json", import.meta.url), "utf8"));
const youtubeReal = JSON.parse(await readFile(new URL("./fixtures/dataforseo-youtube-skin-care-noturno.json", import.meta.url), "utf8"));

const features = () => buildRadarSerpFeatureIntelligence(googleReal)!;
const universo = () => buildRadarYoutubeUniverse(normalizeDataForSeoYoutubeResponse(youtubeReal, "ytq:1").results);

const corrida = () => buildRadarYoutubeSearchRun({
  runId: "run-1", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "usuario-1",
  fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["ytq:1"] }),
  provenance: {
    provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
    queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [],
    collectedAt: "2026-09-14T18:51:07.000Z",
  },
  queries: [{ queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: 25 }],
  results: normalizeDataForSeoYoutubeResponse(youtubeReal, "ytq:1").results,
  universe: universo(),
});

const multimodal = () => buildRadarMultimodalBlueprint({
  features: features(), youtubeUniverse: universo(), generatedAt: "2026-09-14T20:00:00.000Z",
});

/* ================= §1 e §2 · as fontes se somam ================= */

test("§1 · RESEARCH_SOURCES_ADDITIVE — Google e YouTube convivem no mesmo artigo", () => {
  const plano = radarResearchPlanOfAnalysis({
    researchTarget: { primaryTarget: "YOUTUBE" },
    youtubeSearch: { runId: "r" },
    serpSnapshotId: "serp-9",
    deepResearch: null,
  });

  assert.deepEqual(plano.sources, ["WEB_SERP", "YOUTUBE_SERP"], "as duas fontes coexistem");
  assert.equal(plano.primaryTarget, "YOUTUBE", "e o alvo continua de vídeo");
  assert.equal(plano.missingRequiredSource, null);
});

test("§1 · a SERP simples do Google CONTA como fonte — não só a investigação profunda", () => {
  /*
   * Uma leitura de APOIO produz snapshot, não `deepResearch`. Olhar só o
   * segundo faria a tela oferecer "adicionar Google" para algo já coletado — e
   * a pessoa pagaria de novo.
   */
  const soSnapshot = radarResearchPlanOfAnalysis({ serpSnapshotId: "serp-9", youtubeSearch: { runId: "r" } });
  assert.deepEqual(soSnapshot.sources, ["WEB_SERP", "YOUTUBE_SERP"]);

  const semNada = radarResearchPlanOfAnalysis({ serpSnapshotId: null, youtubeSearch: { runId: "r" } });
  assert.deepEqual(semNada.sources, ["YOUTUBE_SERP"]);
});

test("§2 e §3 · as TRÊS fontes aparecem, e o papel de cada uma é derivado do alvo", () => {
  const plano = radarResearchPlanOfAnalysis({
    researchTarget: { primaryTarget: "YOUTUBE" }, youtubeSearch: { runId: "r" }, serpSnapshotId: "serp-9",
  });

  /* A tela mostra as três lado a lado: uma lista só do coletado pareceria escolha feita. */
  assert.equal(plano.sourceStatus.length, RADAR_RESEARCH_SOURCES.length);
  const porFonte = new Map(plano.sourceStatus.map(item => [item.source, item]));

  assert.equal(porFonte.get("YOUTUBE_SERP")!.role, "PRIMARY", "a fonte do alvo é a principal");
  assert.equal(porFonte.get("YOUTUBE_SERP")!.required, true);
  assert.equal(porFonte.get("YOUTUBE_SERP")!.collected, true);

  /* GOOGLE_SUPPORT_ON_YOUTUBE_TARGET: coletada, e marcada como apoio. */
  assert.equal(porFonte.get("WEB_SERP")!.role, "SUPPORTING");
  assert.equal(porFonte.get("WEB_SERP")!.collected, true);
  assert.equal(porFonte.get("WEB_SERP")!.required, false);

  assert.equal(porFonte.get("AMAZON_SERP")!.collected, false);

  /*
   * SEM ALVO DECLARADO, nenhuma fonte é apoio: o artigo ainda não decidiu o
   * que produz, e chamar a primeira coleta de "apoio" inventaria hierarquia.
   */
  const virgem = radarResearchPlanOfAnalysis({});
  assert.ok(virgem.sourceStatus.every(item => item.role === "PRIMARY"));
  assert.ok(virgem.sourceStatus.every(item => !item.collected));
});

/* ============ §4 · feature intelligence em runtime ============ */

test("§4 · snapshot ANTIGO não ganha camadas fabricadas", () => {
  /*
   * `serpFeatures: null` é a verdade sobre um snapshot coletado antes do gate.
   * Fabricar perguntas e entidades para ele entregaria leitura de uma SERP que
   * ninguém leu.
   */
  const semFeatures = buildRadarMultimodalBlueprint({
    features: null, youtubeUniverse: universo(), generatedAt: "2026-09-14T20:00:00.000Z",
  });

  assert.equal(semFeatures.observed.googleFeatures, null);
  assert.deepEqual(semFeatures.recommended.mustAnswer, []);
  assert.deepEqual(semFeatures.recommended.mustCover, []);
  assert.deepEqual(semFeatures.observed.sources, ["YOUTUBE_SERP"]);
  assert.ok(semFeatures.limitations.some(item => /Não há SERP do Google/.test(item)));
});

test("§4 · a tela lê o snapshot que TEM features — e não fabrica quando não há", async () => {
  const pagina = semComentarios(await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  const leitura = pagina.slice(pagina.indexOf("const multimodalDoArtigo"), pagina.indexOf("const gravarYoutube"));

  assert.ok(leitura.includes("registro.research?.serpFeatures"), "o filtro exige features presentes");
  assert.ok(leitura.includes("buildRadarMultimodalBlueprint("));
  /* E nada de inventar: sem features e sem corrida, não há blueprint. */
  assert.ok(leitura.includes("if (!features && !corrida?.universe.length) return null;"), "sem nada coletado, não há blueprint");
  assert.ok(leitura.includes("features,"), "o que entra é o que o snapshot tem — inclusive null");
});

/* ================ §5 e §13 · o cruzamento em runtime ================ */

test("§5 e §13 · CROSS_PLATFORM real nos dois payloads de `skin care noturno`", () => {
  const bp = multimodal();

  const atravessaram = bp.observed.crossSerpVideos.filter(item => item.signal === "CROSS_PLATFORM");
  assert.ok(atravessaram.length > 0, "a amostra real prova travessia entre plataformas");

  for (const video of atravessaram) {
    /* §5 · é SINAL, e ele se explica em português. */
    assert.match(video.reason, /posição \d+ do YouTube/);
    assert.match(video.reason, /Google/);
    assert.ok(video.title.length > 5);
  }

  /* As nove famílias canônicas do Google aparecem na leitura. */
  const google = bp.observed.googleFeatures!;
  assert.equal(google.itemTypes.length, 8, "oito item_types no payload");
  assert.ok(google.entityMap.some(item => item.source === "REFINEMENT_CHIP"), "mais os refinement_chips: nove famílias");
});

/* ================= §9 e §10 · o congelamento ================= */

test("§9 · FINALIZE_FREEZES_MULTIMODAL — fontes, cruzamento, saída e blueprint", () => {
  const run = corrida();
  const blueprint = buildRadarYoutubeBlueprint({ run, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z" });
  const bp = multimodal();

  const congelada = freezeRadarYoutubeInvestigation({
    run, blueprint, finalizedBy: "usuario-1", finalizedAt: "2026-09-14T21:00:00.000Z",
    multimodal: { blueprint: bp, researchSources: ["WEB_SERP", "YOUTUBE_SERP"] },
  });

  assert.ok(congelada.multimodal, "a camada multiformato entrou na fotografia");
  assert.deepEqual(congelada.multimodal.researchSources, ["WEB_SERP", "YOUTUBE_SERP"]);
  assert.equal(congelada.multimodal.editorialOutput, bp.recommended.editorialOutput);
  assert.equal(congelada.multimodal.editorialOutput, "MULTIFORMAT_PACKAGE");
  assert.ok(congelada.multimodal.blueprint.observed.crossSerpVideos.length > 0, "o cruzamento congelou junto");
  assert.ok(congelada.multimodal.blueprint.observed.googleFeatures, "e a leitura do Google também");

  /* As limitações das duas camadas entram na mesma lista. */
  assert.ok(congelada.limitations.some(item => /Nenhuma página foi visitada/.test(item)));

  /*
   * §9 · F5_PRESERVES e CROSS_SESSION_PRESERVES.
   *
   * A fotografia atravessa a serialização intacta porque é DADO, não cálculo.
   * Outra sessão lê o mesmo blueprint por ler o mesmo registro.
   */
  const relida = RadarYoutubeFrozenInvestigationSchema.parse(JSON.parse(JSON.stringify(congelada)));
  assert.deepEqual(relida, congelada);
  assert.equal(relida.multimodal!.blueprint.recommended.editorialOutput, "MULTIFORMAT_PACKAGE");
  assert.deepEqual(
    relida.multimodal!.blueprint.recommended.pieces.map(item => item.piece),
    congelada.multimodal.blueprint.recommended.pieces.map(item => item.piece),
  );
});

test("§9 · investigação congelada ANTES deste gate continua legível", () => {
  /*
   * A camada é aditiva. Uma fotografia tirada no gate 2 não tem multiformato —
   * e isso é a verdade sobre ela, não uma lacuna a preencher.
   */
  const run = corrida();
  const blueprint = buildRadarYoutubeBlueprint({ run, declaredIntent: null, editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z" });
  const antiga = freezeRadarYoutubeInvestigation({ run, blueprint, finalizedBy: "u", finalizedAt: "2026-09-14T21:00:00.000Z" });

  assert.equal(antiga.multimodal, null, "ausência declarada");
  assert.ok(antiga.blueprint, "e o blueprint de YouTube continua lá");
});

test("§10 · a tela mostra a FOTOGRAFIA quando ela existe — não o recálculo", async () => {
  const painel = semComentarios(await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8"));

  /*
   * O blueprint vivo é recalculado a cada abertura; o congelado não muda. Com
   * os dois na tela ao mesmo tempo, a pessoa veria duas leituras da mesma
   * investigação sem saber qual assinar — e uma coleta nova alteraria a que
   * está sob o carimbo "finalizado".
   */
  const render = painel.split("\n").filter(linha => linha.includes("<BlueprintMultiformato"));
  assert.equal(render.length, 1, "a seção é renderizada em um único lugar");
  assert.ok(render[0].includes("blueprint={frozen?.multimodal?.blueprint || multimodal!}"), "o congelado vem primeiro no ou-lógico");
});

/* ================= §6, §7 e §12 · a tela ================= */

test("§6 e §12 · a tela separa OBSERVADO de RECOMENDADO — e não mostra id técnico", async () => {
  const painel = await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");

  assert.ok(painel.includes("radar-multimodal-observed"));
  assert.ok(painel.includes("radar-multimodal-recommended"));
  assert.ok(painel.includes("O que a busca mostra"));
  assert.ok(painel.includes("O que recomendamos"));
  /*
   * A LISTA DE FONTES VIROU PACOTE — RADAR_RESEARCH_PROFILES_1 · §14.
   *
   * O 1.1 mostrava as três fontes com um botão para somar a leitura do Google.
   * O perfil passou a responder isso, e o botão saiu: ele levava ao caminho da
   * investigação Google PRINCIPAL e nunca coletou nada.
   */
  assert.ok(painel.includes("radar-research-package"), "o pacote aparece como uma investigação só");
  assert.equal(painel.includes("radar-add-google-support"), false, "e não há botão de somar fonte");

  /*
   * §12 · NADA DE HASH, runId, id de concorrente ou JSON na visão normal.
   *
   * A seção multiformato renderiza título, motivo e pergunta — o que decide.
   * O `videoId` é usado só como chave de lista do React, que não é exibida.
   */
  const secao = semComentarios(painel.slice(painel.indexOf("function BlueprintMultiformato"), painel.indexOf("export function RadarYoutubeSearchPanel")));
  assert.ok(secao.includes("key={video.videoId}"), "o id serve de chave de lista");

  /* `key` é atributo do React, não texto renderizado — sai da auditoria. */
  const renderizado = secao.replace(/key=\{[^}]*\}/g, " ");
  assert.equal(/JSON\.stringify|fingerprint|runId|videoId|channelId/.test(renderizado), false, "nenhum identificador técnico exibido");
  assert.ok(secao.includes("{video.reason}"), "o que aparece é o motivo, em português");
});

test("§7 · SHORTS_DERIVED_FROM_SIGNALS — cada Short leva pergunta, objetivo e ângulo", () => {
  const bp = multimodal();
  const shorts = bp.recommended.pieces.filter(item => item.piece === "SHORT");

  assert.ok(shorts.length > 0);
  /* Quantidade não é fixa: ela segue as perguntas observadas. */
  assert.ok(shorts.length <= bp.observed.googleFeatures!.questionMap.length);

  for (const short of shorts) {
    assert.ok(short.sourceSignal, "de qual bloco veio");
    assert.ok(short.sourceQuestion, "qual pergunta responde");
    assert.ok(short.objective, "o que ele precisa entregar");
    assert.ok(short.suggestedAngle, "e com que ângulo");
    assert.ok(bp.recommended.mustAnswer.includes(short.sourceQuestion), "a pergunta é uma das observadas");
  }

  /*
   * O ÂNGULO SAI DA FORMA DA PERGUNTA — e isso é observável.
   *
   * "Qual a ordem?" pede demonstração sequencial; "o que usar?" pede critério.
   * O mesmo ângulo para os dois faria o Short responder a pergunta errada.
   */
  const deOrdem = shorts.find(item => /ordem/i.test(item.sourceQuestion || ""));
  if (deOrdem) assert.match(deOrdem.suggestedAngle!, /sequencial/i);
  const deEscolha = shorts.find(item => /o que|qual produto/i.test(item.sourceQuestion || ""));
  if (deEscolha) assert.match(deEscolha.suggestedAngle!, /critério/i);

  /* As peças que não são Short não fingem ter sinal. */
  for (const outra of bp.recommended.pieces.filter(item => item.piece !== "SHORT")) {
    assert.equal(outra.sourceQuestion, null);
    assert.equal(outra.suggestedAngle, null);
  }
});

/* ==================== §8 e §14 · as proibições ==================== */

test("§8 · NÃO COPIAR — nenhum título concorrente e nenhum markdown de AI Overview", () => {
  const bp = multimodal();
  const recomendado = JSON.stringify(bp.recommended);

  for (const video of universo()) {
    assert.equal(recomendado.includes(video.title), false, `título de concorrente vazou: ${video.title}`);
  }
  assert.equal(/"markdown"/.test(JSON.stringify(bp)), false, "o texto do AI Overview não atravessa");

  /* O que atravessa são perguntas da SERP e recomendações nossas. */
  assert.ok(bp.recommended.mustAnswer.length > 0);
  assert.ok(bp.recommended.rationale.every(item => item.length > 20));
});

test("§14 · PROVIDER_AUTO_RUNS = 0 — montar o blueprint não coleta nada", async () => {
  const pagina = semComentarios(await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  const leitura = pagina.slice(pagina.indexOf("const multimodalDoArtigo"), pagina.indexOf("const gravarYoutube"));

  /*
   * O blueprint é cálculo sobre dado que já existe. Se ele disparasse coleta,
   * ABRIR a aba passaria a custar dinheiro.
   */
  assert.equal(/fetch\(|startRadarYoutubeRun|executeDataForSeo/.test(leitura), false);

  /*
   * O APOIO PASSOU PARA DENTRO DO START — RADAR_RESEARCH_PROFILES_1 · §2.
   *
   * Ele reusa a única porta até o provider e roda depois da principal, no
   * mesmo clique. Nenhum caminho novo até a rede foi aberto.
   */
  assert.ok(pagina.includes("await coletarApoioDoGoogle(target, run.runId);"), "o apoio entra no mesmo START");
  assert.ok(pagina.includes("const registro = await coletarSerpDoProvider(target);"), "e usa a porta única");
  assert.deepEqual(tentativasDeRede, []);
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
