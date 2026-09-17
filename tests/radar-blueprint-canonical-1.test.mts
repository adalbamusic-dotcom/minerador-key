import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_EVIDENCE_GRADES,
  RADAR_PRICE_BANDS,
  RadarCompetitiveBlueprintSchema,
  RadarObservedPriceSchema,
  RadarObservedSignalSchema,
  RadarRecommendationSchema,
  RadarYoutubeScriptSectionSchema,
  assertRadarBlueprintSeparation,
  percepcaoDeComprador,
  recomendacao,
  sinalObservado,
} from "../lib/radar/competitive-blueprint.ts";
import { buildRadarYoutubeCanonicalBlueprint } from "../lib/radar/youtube-editorial.ts";
import { radarCompetitiveBlueprintViewOfAnalysis } from "../lib/radar/competitive-blueprint-view.ts";
import {
  RadarYoutubeRunRefError,
  freezeRadarYoutubeInvestigation,
  projectRadarYoutubeEvidence,
  radarFrozenRunCounts,
  resolveRadarFrozenRun,
} from "../lib/radar/youtube-evidence.ts";
import { buildRadarYoutubeBlueprint } from "../lib/radar/youtube-blueprint.ts";
import { buildRadarMultimodalBlueprint } from "../lib/radar/multimodal-blueprint.ts";
import { buildRadarSerpFeatureIntelligence } from "../lib/radar/serp-features.ts";
import { buildRadarYoutubeUniverse } from "../lib/radar/youtube-search-model.ts";
import { buildRadarYoutubeRunFingerprint, buildRadarYoutubeSearchRun, RADAR_YOUTUBE_PROVIDER_ENDPOINT } from "../lib/radar/youtube-search-run.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";

/*
 * ===== RADAR_BLUEPRINT_CANONICAL_1 · CONTRATO ÚNICO E FREEZE COMPACTO =====
 *
 * A auditoria do banco mediu o estrago que este gate desfaz:
 *
 *   youtubeSearch                        126.656 bytes
 *   youtubeFrozenInvestigation           144.440 bytes
 *   youtubeFrozenInvestigation.run       126.656 bytes
 *   youtubeSearch == frozen.run          TRUE
 *
 * 88% da fotografia era a corrida copiada byte a byte.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
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

const bytes = (valor: unknown) => Buffer.byteLength(JSON.stringify(valor), "utf8");

/* ===================== a bancada, com payload real ===================== */

const brutoYoutube = JSON.parse(await readFile(new URL("./fixtures/dataforseo-youtube-skin-care-noturno.json", import.meta.url), "utf8"));
const brutoGoogle = JSON.parse(await readFile(new URL("./fixtures/dataforseo-google-skin-care-noturno.json", import.meta.url), "utf8"));

const normalizada = normalizeDataForSeoYoutubeResponse(brutoYoutube, "ytq:1");
const universo = buildRadarYoutubeUniverse(normalizada.results);

const corrida = () => buildRadarYoutubeSearchRun({
  runId: "run-1", runVersion: 1, startedAt: "2026-09-14T18:51:00.000Z", startedBy: "u",
  fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "a1", articleDnaVersionId: "d1", queryIds: ["ytq:1"] }),
  provenance: {
    provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: 20,
    queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [],
    collectedAt: "2026-09-14T18:51:07.000Z",
  },
  queries: [{ queryId: "ytq:1", text: "skin care noturno", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true, resultCount: normalizada.results.length }],
  results: normalizada.results, universe: universo,
});

const blueprintDeYoutube = (run = corrida()) =>
  buildRadarYoutubeBlueprint({ run, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z" });

const multimodal = () => buildRadarMultimodalBlueprint({
  features: buildRadarSerpFeatureIntelligence(brutoGoogle)!,
  youtubeUniverse: universo,
  generatedAt: "2026-09-14T20:00:00.000Z",
});

const congelar = (run = corrida()) => freezeRadarYoutubeInvestigation({
  run, blueprint: blueprintDeYoutube(run), finalizedBy: "u", finalizedAt: "2026-09-14T21:00:00.000Z",
  multimodal: { blueprint: multimodal(), researchSources: ["WEB_SERP", "YOUTUBE_SERP"] },
});

const canonico = () => buildRadarYoutubeCanonicalBlueprint({
  articleId: "a1", articleDnaVersionId: "d1",
  blueprint: blueprintDeYoutube(), multimodal: multimodal(),
  researchRefs: [{ source: "YOUTUBE_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH", ref: "run-1", fingerprint: "sig", collectedAt: null, sampleSize: universo.length }],
  primaryKeyword: "skin care noturno",
  generatedAt: "2026-09-14T20:00:00.000Z",
});

/* ============ §2 e §22 · o freeze compacto ============ */

test("§2 · o novo freeze NÃO contém results nem universe — ele referencia", () => {
  const frozen = congelar();

  assert.equal(frozen.run, null, "a cópia da corrida saiu");
  assert.ok(frozen.runRef, "e no lugar dela há uma referência");
  assert.equal(frozen.runRef.runId, "run-1");
  assert.equal(frozen.runRef.runFingerprint, corrida().fingerprint.signature);
  assert.equal(frozen.runRef.universeSize, universo.length, "a contagem congela, a amostra não");

  /* A PROVA: nenhum resultado e nenhum vídeo do universo atravessam. */
  const serializado = JSON.stringify(frozen);
  assert.equal(serializado.includes('"results"'), false);
  assert.equal(serializado.includes('"universeClass"'), false);
  for (const video of universo.slice(0, 5)) {
    assert.equal(serializado.includes(video.videoId), false, `videoId vazou: ${video.videoId}`);
  }
});

test("§21 · o freeze encolheu, e o número prova", () => {
  const frozen = congelar();
  const legado = { ...frozen, runRef: null, run: corrida() };

  const novo = bytes(frozen);
  const antigo = bytes(legado);
  assert.ok(novo < antigo / 3, `novo ${novo} vs legado ${antigo}`);
  /* A referência custa centenas de bytes, não dezenas de milhares. */
  assert.ok(bytes(frozen.runRef) < 600, `runRef ${bytes(frozen.runRef)} bytes`);
});

test("§22 · referência resolvida, e referência quebrada é ERRO — nunca silêncio", () => {
  const run = corrida();
  const frozen = congelar(run);

  assert.deepEqual(resolveRadarFrozenRun({ frozen, liveRun: run }).universe, run.universe);

  /*
   * Devolver `null` aqui faria a tela dizer "nenhum vídeo" sobre uma
   * investigação finalizada, e ninguém saberia que o elo se perdeu.
   */
  assert.throws(
    () => resolveRadarFrozenRun({ frozen, liveRun: null }),
    (erro: unknown) => erro instanceof RadarYoutubeRunRefError && erro.code === "youtube_run_ref_missing",
  );

  /* Identidade diferente. */
  assert.throws(
    () => resolveRadarFrozenRun({ frozen, liveRun: { ...run, runId: "outra" } }),
    (erro: unknown) => erro instanceof RadarYoutubeRunRefError && erro.code === "youtube_run_ref_mismatch",
  );

  /*
   * MESMO id, assinatura diferente: a corrida foi refeita sob o mesmo nome, e a
   * fotografia passaria a descrever uma amostra que não é a dela.
   */
  assert.throws(
    () => resolveRadarFrozenRun({ frozen, liveRun: { ...run, fingerprint: { ...run.fingerprint, signature: "outra-assinatura" } } }),
    (erro: unknown) => erro instanceof RadarYoutubeRunRefError && erro.code === "youtube_run_ref_fingerprint",
  );
});

test("§3 · fotografia LEGADA continua legível, sem migrar dado histórico", () => {
  const run = corrida();
  const legada = { ...congelar(run), runRef: null, run };

  /* A cópia responde quando não há referência — e não o contrário. */
  assert.equal(resolveRadarFrozenRun({ frozen: legada, liveRun: null }).runId, run.runId);

  const contagens = radarFrozenRunCounts(legada);
  assert.equal(contagens.universeSize, run.universe.length);
  assert.equal(contagens.queriesExecuted, 1);

  /* E a projeção de evidência continua funcionando nas duas formas. */
  assert.equal(projectRadarYoutubeEvidence(legada).provenance.runId, run.runId);
  assert.equal(projectRadarYoutubeEvidence(congelar(run)).provenance.runId, run.runId);
});

/* ============ §5 e §6 · o contrato canônico ============ */

test("§5 · o envelope é discriminado por perfil — nada de schema tudo-nullable", () => {
  const bp = canonico();
  assert.equal(bp.profile, "YOUTUBE");
  assert.equal(bp.schemaVersion, 1);
  assert.ok(bp.researchRefs.length, "§2 · referências, nunca matéria-prima");

  /* O perfil errado não passa: a união recusa campos de outro perfil. */
  assert.throws(() => RadarCompetitiveBlueprintSchema.parse({ ...bp, profile: "AMAZON" }));
});

test("§6 · observed e recommended são objetos DIFERENTES, e o grau é conferido", () => {
  const bp = canonico();

  /* Toda recomendação aponta para o sinal que a originou. */
  const recomendacoes = [
    ...bp.recommended.titleDirections,
    ...(bp.recommended.hookDirection ? [bp.recommended.hookDirection] : []),
  ];
  assert.ok(recomendacoes.length > 0);
  for (const item of recomendacoes) {
    assert.ok(item.sourceSignal.length > 10, `recomendação sem origem: ${item.id}`);
    assert.ok(item.objective.length > 5);
  }

  /* Todo sinal observado carrega o que o sustenta. */
  for (const sinal of bp.observed.titlePatterns) {
    assert.equal(sinal.grade, "OBSERVED_SERP");
    assert.match(sinal.evidence, /\d/, "evidência sem número não é conferível");
  }

  assertRadarBlueprintSeparation(bp);
});

test("§6 · o CONTRATO recusa recomendação sem origem — não só o construtor", () => {
  /*
   * Não basta o builder preencher `sourceSignal`: o schema precisa recusar o
   * vazio. Com um `default("")`, qualquer outro produtor — um handoff futuro,
   * uma importação — passaria palpite adiante com a mesma aparência de leitura.
   */
  assert.throws(() => RadarRecommendationSchema.parse({ id: "x", statement: "Faça X", objective: "para Y" }));
  assert.throws(() => RadarRecommendationSchema.parse({ id: "x", statement: "Faça X", objective: "para Y", sourceSignal: "" }));

  /* E o sinal observado recusa evidência vazia pela mesma razão. */
  assert.throws(() => RadarObservedSignalSchema.parse({ id: "x", statement: "Algo", grade: "OBSERVED_SERP", evidence: "" }));
});

test("§12 · peça SEM sinal não vira Short, mesmo vindo do multimodal", () => {
  /*
   * O caso que o `multimodal: null` não cobre: o blueprint multiformato EXISTE
   * e traz uma peça sem origem. Deixá-la passar produziria um Short sem
   * pergunta para responder, indistinguível dos que têm.
   */
  const base = multimodal();
  const contaminado = {
    ...base,
    recommended: {
      ...base.recommended,
      pieces: [
        ...base.recommended.pieces,
        { piece: "SHORT" as const, role: "peça órfã", derivedFrom: "nada", sourceSignal: null, sourceQuestion: null, objective: null, suggestedAngle: null },
      ],
    },
  };

  const comOrfa = buildRadarYoutubeCanonicalBlueprint({
    articleId: "a1", articleDnaVersionId: "d1",
    blueprint: blueprintDeYoutube(), multimodal: contaminado as never,
    researchRefs: [], primaryKeyword: null, generatedAt: "2026-09-14T20:00:00.000Z",
  });

  const legitimos = canonico().recommended.shorts.length;
  assert.equal(comOrfa.recommended.shorts.length, legitimos, "a peça órfã foi recusada");
  for (const short of comOrfa.recommended.shorts) assert.ok(short.sourceSignal && short.sourceQuestion);
});

test("§10 · nenhuma IDENTIDADE de concorrente vira recomendação", () => {
  /*
   * Título já é conferido acima. Canal é a outra identidade que a amostra
   * expõe, e recomendar "faça como o canal X" entrega o problema que a pessoa
   * veio resolver — com o agravante de nomear terceiro.
   */
  const bp = canonico();
  const recomendado = JSON.stringify(bp.recommended);
  for (const video of universo) {
    if (video.channelName) assert.equal(recomendado.includes(video.channelName), false, `canal copiado: ${video.channelName}`);
  }
});

test("§6 · conclusão nossa dentro de observed é RECUSADA", () => {
  const bp = canonico();
  const contaminado = {
    ...bp,
    observed: {
      ...bp.observed,
      titlePatterns: [
        ...bp.observed.titlePatterns,
        RadarObservedSignalSchema.parse({ id: "x", statement: "Use promessa específica", grade: "DERIVED", evidence: "nossa leitura", count: null }),
      ],
    },
  };
  assert.throws(() => assertRadarBlueprintSeparation(contaminado as never), /DERIVED/);
});

/* ============ §10 · títulos e gancho ============ */

test("§10 · nenhum título de concorrente vira recomendação", () => {
  const bp = canonico();
  const recomendado = JSON.stringify(bp.recommended);
  for (const video of universo) {
    assert.equal(recomendado.includes(video.title), false, `título copiado: ${video.title}`);
  }
  assert.ok(bp.recommended.titleDirections.length >= 2 && bp.recommended.titleDirections.length <= 4, "2 a 4 direções");
});

test("§10 · o gancho é RECOMENDAÇÃO, e o contrato não tem onde guardá-lo como observação", () => {
  const bp = canonico();
  assert.ok(bp.recommended.hookDirection, "existe direção de gancho");
  assert.ok(bp.recommended.hookDirection.sourceSignal.length > 10, "e ela declara de onde veio");

  /*
   * A SERP lê TÍTULO — ela não abre vídeo. Um campo de "gancho observado"
   * convidaria a afirmar uma leitura que ninguém fez.
   */
  assert.equal("hookDirection" in bp.observed, false);
  assert.equal(JSON.stringify(bp.observed).includes("hook"), false);
});

/* ============ §11 e §12 · roteiro e Shorts ============ */

test("§11 · o roteiro é utilizável: bloco, objetivo, direção e origem", () => {
  const bp = canonico();
  assert.ok(bp.recommended.script.length >= 6, "hook, abertura, blocos, conclusão e CTA");
  for (const secao of bp.recommended.script) {
    assert.ok(secao.objective.length > 5, `${secao.block} sem objetivo`);
    assert.ok(secao.direction.length > 20, `${secao.block} sem direção`);
    assert.ok(secao.sourceSignal.length > 10, `${secao.block} sem origem`);
  }
  assert.ok(bp.recommended.script.some(item => /gancho/i.test(item.block)));
  assert.ok(bp.recommended.script.some(item => /CTA/i.test(item.block)));

  /*
   * E o CONTRATO recusa bloco sem origem, não só o construtor. Com um
   * `default("")`, outro produtor entregaria roteiro sem lastro ao Planejador
   * com a mesma aparência deste.
   */
  assert.throws(() => RadarYoutubeScriptSectionSchema.parse({ block: "Gancho", objective: "abrir", direction: "faça assim" }));
  assert.throws(() => RadarYoutubeScriptSectionSchema.parse({ block: "Gancho", objective: "abrir", direction: "faça assim", sourceSignal: "" }));

  /* Tom, linguagem e nível técnico chegam preenchidos. */
  assert.ok(bp.recommended.tone);
  assert.ok(bp.recommended.languageDirection);
  assert.ok(bp.recommended.technicalLevel);
  assert.ok(bp.recommended.authorityDirection);
});

test("§12 · cada Short nasce de um sinal — nunca de uma cota", () => {
  const bp = canonico();
  assert.ok(bp.recommended.shorts.length > 0, "a amostra real sustenta Shorts");

  for (const short of bp.recommended.shorts) {
    assert.ok(short.sourceSignal, "de qual bloco da busca veio");
    assert.ok(short.sourceQuestion, "qual pergunta responde");
    assert.ok(short.hookDirection.length > 15);
    assert.ok(short.contentPromise.length > 10);
    assert.ok(short.ctaDirection.length > 10);
  }

  /* Sem multimodal não há pergunta observada — e não se inventa Short. */
  const semSinal = buildRadarYoutubeCanonicalBlueprint({
    articleId: "a1", articleDnaVersionId: "d1",
    blueprint: blueprintDeYoutube(), multimodal: null,
    researchRefs: [], primaryKeyword: null, generatedAt: "2026-09-14T20:00:00.000Z",
  });
  assert.deepEqual(semSinal.recommended.shorts, [], "cota fixa produziria peça sem origem");
});

test("§13 · a aplicação no artigo liga vídeo, Shorts e apoio do Google", () => {
  const bp = canonico();
  const pecas = bp.recommended.articleApplication;
  assert.ok(pecas.length > 0);
  assert.ok(pecas.some(item => item.piece === "VIDEO_HERO"));
  assert.ok(pecas.some(item => item.piece === "SHORT"));
  assert.ok(pecas.some(item => item.piece === "GOOGLE_SUPPORT"));
  for (const peca of pecas) {
    assert.ok(peca.placement.length > 5, "onde encaixa");
    assert.ok(peca.sourceSignal.length > 10, "e por quê");
  }
});

/* ============ §15 e §16 · o contrato da Amazon ============ */

test("§15 · preço observado guarda data; recomendação trabalha com banda", () => {
  const observado = RadarObservedPriceSchema.parse({
    band: "INTERMEDIARIO", observedValue: 89.9, currency: "BRL",
    observedAt: "2026-09-14T12:00:00.000Z", source: "amazon", sampleSize: 12,
  });
  assert.equal(observado.observedValue, 89.9);
  assert.ok(observado.observedAt, "valor sem data envelheceria mentindo");

  /* A recomendação só aceita banda — o schema não tem campo para valor. */
  assert.deepEqual([...RADAR_PRICE_BANDS], ["ECONOMICO", "INTERMEDIARIO", "PREMIUM"]);
  const amazon = RadarCompetitiveBlueprintSchema.parse({
    schemaVersion: 1, profile: "AMAZON", articleId: "a1", articleDnaVersionId: "d1",
    observed: { products: 12, sufficiency: "12 produtos sustentam a leitura." },
    recommended: { priceBandDirection: "INTERMEDIARIO" },
    provenance: { generatedAt: "2026-09-14T20:00:00.000Z" },
  });
  assert.equal(amazon.profile === "AMAZON" && amazon.recommended.priceBandDirection, "INTERMEDIARIO");
  assert.equal("priceValue" in (amazon.recommended as object), false);
});

test("§16 · review é percepção, e o grau impede que vire fato", () => {
  assert.deepEqual([...RADAR_EVIDENCE_GRADES], ["OBSERVED_SERP", "BUYER_PERCEPTION", "DERIVED"]);

  const reclamacao = percepcaoDeComprador("c1", "Compradores relatam que resseca a pele.", "34 de 210 avaliações mencionam ressecamento.", 34);
  assert.equal(reclamacao.grade, "BUYER_PERCEPTION");
  /*
   * A frase começa por "Compradores relatam" porque o grau obriga a leitura a
   * ser dita assim. "O produto resseca" seria especificação técnica derivada
   * de experiência de pele — outra afirmação, e não sustentada.
   */
  assert.match(reclamacao.statement, /^Compradores relatam/);

  const observado = sinalObservado("o1", "Doze produtos disputam a primeira página.", "12 resultados orgânicos.", 12);
  assert.equal(observado.grade, "OBSERVED_SERP");
  assert.notEqual(observado.grade, reclamacao.grade, "os dois não se confundem no contrato");
});

test("§14 · a Amazon já cabe no envelope, sem coletor", () => {
  const amazon = RadarCompetitiveBlueprintSchema.parse({
    schemaVersion: 1, profile: "AMAZON", articleId: "a1", articleDnaVersionId: "d1",
    observed: {
      products: 0,
      /*
       * AMAZON_SEARCH_1 · §3 · `complaintPatterns` SAIU DO CONTRATO.
       *
       * A SERP de produtos não entrega texto de avaliação — só nota e volume
       * de votos. O campo prometia matéria-prima que a fonte não tem, e um
       * lugar vazio no contrato é convite a preenchê-lo com heurística.
       *
       * A percepção de comprador continua existindo como GRAU, para quando
       * houver AMAZON_PRODUCT_ENRICHMENT.
       */
      ratingSignals: [sinalObservado("r1", "Os produtos têm nota média alta.", "12 de 12 produtos com nota.", 12)],
      sufficiency: "Sem coleta: o contrato aceita o perfil, o coletor não existe.",
    },
    recommended: { ctaDirection: recomendacao("cta", "Levar ao comparativo.", "converter quem já decidiu a categoria.", "Percepção recorrente de dúvida entre marcas.") },
    provenance: { generatedAt: "2026-09-14T20:00:00.000Z" },
  });
  assert.equal(amazon.profile, "AMAZON");
  assert.equal(amazon.observed.products, 0);
});

/* ============ §7, §19 e §20 · a autoridade de leitura ============ */

test("§20 · a fotografia vence o vivo, e a leitura declara qual é", () => {
  const frozen = congelar();
  const comum = {
    profile: "YOUTUBE" as const, articleId: "a1", articleDnaVersionId: "d1",
    primaryKeyword: "skin care noturno", generatedAt: "2026-09-14T22:00:00.000Z",
  };

  const congelada = radarCompetitiveBlueprintViewOfAnalysis({ ...comum, frozen, liveBlueprint: blueprintDeYoutube(), liveMultimodal: multimodal() });
  assert.equal(congelada.frozen, true);
  assert.equal(congelada.blueprint?.provenance.frozenAt, "2026-09-14T21:00:00.000Z");
  assert.equal(congelada.sample.count, universo.length, "a contagem sai da referência");

  const viva = radarCompetitiveBlueprintViewOfAnalysis({ ...comum, frozen: null, liveBlueprint: blueprintDeYoutube(), liveMultimodal: multimodal() });
  assert.equal(viva.frozen, false);
  assert.equal(viva.blueprint?.provenance.frozenAt, null);
});

test("§7 · sem coleta a autoridade DIZ por que não há blueprint", () => {
  const vazio = radarCompetitiveBlueprintViewOfAnalysis({
    profile: "YOUTUBE", articleId: "a1", articleDnaVersionId: "d1",
    frozen: null, liveBlueprint: null, liveMultimodal: null,
    primaryKeyword: null, generatedAt: "2026-09-14T22:00:00.000Z",
  });
  assert.equal(vazio.blueprint, null);
  assert.ok(vazio.unavailableReason, "seção vazia não explica se falta coleta ou freeze");

  /*
   * O GOOGLE SEM MODELO COMPETITIVO — 1.1.
   *
   * No gate 1 ele devolvia a mão por não ter adapter. Agora tem um, e a
   * ausência que ele declara é outra: o pipeline ainda não produziu o modelo
   * que o adapter traduziria.
   */
  const google = radarCompetitiveBlueprintViewOfAnalysis({
    profile: "GOOGLE", articleId: "a1", articleDnaVersionId: "d1",
    frozen: null, liveBlueprint: null, liveMultimodal: null,
    googleObserved: null,
    primaryKeyword: null, generatedAt: "2026-09-14T22:00:00.000Z",
  });
  assert.equal(google.blueprint, null);
  assert.match(google.unavailableReason!, /modelo competitivo/);
});

test("§19 · a UI lê a projeção, e não caminho JSON arbitrário", async () => {
  const componente = semComentarios(await readFile(new URL("../modules/radar/radar-competitive-blueprint.tsx", import.meta.url), "utf8"));

  /* Nada de montar a leitura dentro do React. */
  assert.equal(/buildRadarYoutubeCanonicalBlueprint|radarYoutubeTitleDirections|radarYoutubeScript\(/.test(componente), false);
  assert.equal(/payload\?\.|analysisVersions|\['youtubeSearch'\]|\.youtubeFrozenInvestigation/.test(componente), false);
  assert.ok(componente.includes("view.blueprint"), "ele recebe o blueprint pronto");

  const pagina = semComentarios(await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  assert.ok(pagina.includes("radarCompetitiveBlueprintViewOfAnalysis({"), "e a página usa a autoridade");
  assert.equal((pagina.match(/radarCompetitiveBlueprintViewOfAnalysis\(/g) || []).length, 1, "uma montagem só");
});

/* ============ §17 e §18 · a visão normal ============ */

test("§17 · nenhum id técnico na visão normal do blueprint", async () => {
  const componente = await readFile(new URL("../modules/radar/radar-competitive-blueprint.tsx", import.meta.url), "utf8");
  const render = semComentarios(componente).replace(/key=\{[^}]*\}/g, " ");

  assert.equal(/runId|fingerprint|JSON\.stringify|videoId|bundleHash|articleDnaContentHash/.test(render), false);
  /* E o que aparece é decisão, recomendação e justificativa. */
  assert.ok(render.includes("{item.statement}"));
  assert.ok(render.includes("Objetivo: {item.objective}"));
  assert.ok(render.includes("Observado: {item.sourceSignal}"));
});

test("§8 · o blueprint vem ANTES da amostra, e a leitura técnica desce", async () => {
  const painel = semComentarios(await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8"));

  const blueprint = painel.indexOf("<RadarCompetitiveBlueprintSection");
  const amostra = painel.indexOf("radar-youtube-sample-details");
  assert.ok(blueprint > 0 && amostra > blueprint, "a ordem da tela é a da decisão");

  /* A leitura de coortes virou disclosure, ao lado da proveniência. */
  assert.ok(painel.includes('data-testid="radar-youtube-cohort-details"'));
  assert.ok(painel.includes('data-testid="radar-youtube-provenance-details"'));
});

test("§24 · os quatro cards canônicos existem, com a semântica do perfil", async () => {
  const componente = await readFile(new URL("../modules/radar/radar-competitive-blueprint.tsx", import.meta.url), "utf8");
  for (const card of ["modelo", "titulos", "roteiro", "formatos"]) {
    assert.ok(componente.includes(`radar-blueprint-card-${card}`), `falta o card ${card}`);
  }
  assert.ok(componente.includes("radar-blueprint-application"), "e o pacote editorial");
  assert.ok(componente.includes("blueprint-observed-list"));
  assert.ok(componente.includes("blueprint-recommended-list"));
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
  void RadarRecommendationSchema;
});
