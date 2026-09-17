import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeDataForSeoAmazonResponse } from "../lib/server/dataforseo-amazon-operation.ts";
import { buildRadarAmazonUniverse } from "../lib/radar/amazon-search-model.ts";
import { buildRadarAmazonSearchRun, buildRadarAmazonRunFingerprint, type RadarAmazonSearchRun } from "../lib/radar/amazon-search-run.ts";
import {
  RADAR_AMAZON_BASE_LIMITATIONS,
  RADAR_AMAZON_SUPPORT_MISSING_LIMITATION,
  amazonCompetitiveBlueprintOfAnalysis,
  buildRadarAmazonPriceBands,
} from "../lib/radar/amazon-editorial.ts";
import { buildRadarAmazonGoogleSupport } from "../lib/radar/amazon-google-support.ts";
import {
  RadarAmazonRunRefError,
  freezeRadarAmazonInvestigation,
  radarAmazonFrozenCounts,
  resolveRadarAmazonFrozenRun,
} from "../lib/radar/amazon-evidence.ts";
import { assertRadarBlueprintSeparation, RadarCompetitiveBlueprintSchema } from "../lib/radar/competitive-blueprint.ts";
import { radarCompetitiveBlueprintViewOfAnalysis } from "../lib/radar/competitive-blueprint-view.ts";
import { radarAmazonReportEvidence, radarResearchProfileStateOfAnalysis } from "../lib/radar/research-profile-state.ts";
import { buildRadarAmazonBlueprintCards } from "../lib/radar/amazon-observed.ts";

/*
 * ===== AMAZON_SEARCH_2 · O BLUEPRINT COMPETITIVO E O FINALIZE =====
 *
 * Toda a suíte roda contra o payload REAL do AMAZON_SEARCH_0 — 55 itens de
 * página, 51 produtos, 2 slots pagos do MESMO ASIN. É essa amostra que torna os
 * testes falseáveis: uma implementação que confunda produto com posição, ou
 * nota com qualidade, passa em fixture inventada e falha aqui.
 *
 * ANALYSIS_PROVIDER_CALLS = 0, com sentinela no fim.
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

const payloadReal = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-amazon-discovery.json", import.meta.url), "utf8"),
);

const fonteDoAdapter = await readFile(new URL("../lib/radar/amazon-editorial.ts", import.meta.url), "utf8");
const fonteDoFreeze = await readFile(new URL("../lib/radar/amazon-evidence.ts", import.meta.url), "utf8");
const fonteDoPainel = await readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
const fonteDoServico = await readFile(new URL("../lib/server/radar-amazon-analyze.ts", import.meta.url), "utf8");
const fonteDaRota = await readFile(new URL("../app/api/editorial/radar-amazon-search/route.ts", import.meta.url), "utf8");
const fonteDoBlueprintUI = await readFile(new URL("../modules/radar/radar-competitive-blueprint.tsx", import.meta.url), "utf8");

/* ============================ as fixturas ============================ */

const corridaReal = (): RadarAmazonSearchRun => {
  const normalizada = normalizeDataForSeoAmazonResponse(payloadReal, "amzq:1");
  return buildRadarAmazonSearchRun({
    runId: "run-amz-1",
    runVersion: 1,
    startedAt: "2026-09-15T12:00:00.000Z",
    startedBy: "user-1",
    fingerprint: buildRadarAmazonRunFingerprint({
      articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["amzq:1"],
    }),
    provenance: {
      provider: "dataforseo",
      endpoint: "/v3/merchant/amazon/products/live/advanced",
      collectedAt: "2026-09-15T12:00:05.000Z",
      languageCode: "pt_BR",
      depth: 20,
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0,
    },
    queries: [{ queryId: "amzq:1", text: "protetor solar facial", origin: "PRIMARY_KEYWORD", reason: "principal", executed: true }],
    results: normalizada.results,
    universe: buildRadarAmazonUniverse(normalizada.results),
    relatedSearches: normalizada.relatedSearches,
  });
};

/**
 * O SNAPSHOT DO APOIO — na forma em que o armazenamento o devolve.
 *
 * Perguntas, refinamentos, entidades, produtos populares e blocos multimídia:
 * é sobre esse material que as recomendações dependentes do Google nascem, e é
 * a ausência dele que o teste B exercita.
 */
const snapshotDoGoogle = () => ({
  id: "snap-1",
  query: "protetor solar facial",
  collectedAt: "2026-09-15T12:00:08.000Z",
  peopleAlsoAsk: [
    { position: 1, question: "Qual o melhor protetor solar facial?", answer: null, sourceTitle: null, sourceUrl: null, classification: null, notes: "" },
    { position: 2, question: "Protetor solar facial com cor ou sem cor?", answer: null, sourceTitle: null, sourceUrl: null, classification: null, notes: "" },
  ],
  relatedSearches: [
    { term: "protetor solar facial para pele oleosa", classification: null, notes: "" },
    { term: "protetor solar facial vs corporal", classification: null, notes: "" },
  ],
  serpFeatures: {
    featuresVersion: 1,
    keyword: "protetor solar facial",
    itemTypes: ["organic", "people_also_ask", "video"],
    aiOverview: { present: false, markdownLength: 0, references: [] },
    organicCount: 10,
    questionMap: [{ question: "Protetor solar facial pode ser usado todo dia?", source: "PEOPLE_ALSO_ASK" }],
    entityMap: [
      { term: "pele oleosa", source: "REFINEMENT_CHIP" },
      { term: "fps 50", source: "REFINEMENT_CHIP" },
    ],
    visualOpportunities: [{ alt: "aplicação de protetor solar", sourceDomain: "exemplo.com" }],
    videos: [
      { title: "Como escolher protetor solar", url: "https://youtube.com/watch?v=a", domain: "youtube.com", source: null, block: "VIDEO", youtubeVideoId: "a", platform: "YOUTUBE" },
      { title: "Protetor em 30s", url: "https://youtube.com/shorts/b", domain: "youtube.com", source: null, block: "SHORT_VIDEOS", youtubeVideoId: "b", platform: "YOUTUBE" },
    ],
    commercialSignals: {
      present: true,
      products: [{ title: "Protetor XYZ", seller: "Loja A", price: "R$ 59,90", rating: 4.5, reviews: 120 }],
    },
    contentFormatMap: {
      hasAiOverview: false, hasOrganic: true, hasQuestions: true,
      hasImages: true, hasVideo: true, hasShortVideos: true, hasProducts: true,
    },
    observedIntentSignals: ["comercial"],
    limitations: [],
  },
});

const apoioReal = () => buildRadarAmazonGoogleSupport({ snapshotId: "snap-1", snapshot: snapshotDoGoogle() });

const blueprintDe = (comApoio = true) => amazonCompetitiveBlueprintOfAnalysis({
  articleId: "artigo-1",
  articleDnaVersionId: "dna-1",
  articleDnaContentHash: null,
  run: corridaReal(),
  support: comApoio ? apoioReal() : null,
  primaryKeyword: "protetor solar facial",
  declaredIntent: "comercial",
  researchRefs: [{
    source: "AMAZON_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH",
    ref: "run-amz-1", fingerprint: "assinatura", collectedAt: "2026-09-15T12:00:05.000Z", sampleSize: 51,
  }],
  generatedAt: "2026-09-15T13:00:00.000Z",
  frozenAt: null,
});

/* ================================ A ================================ */

test("A · pacote READY produz blueprint sem tocar em provider", () => {
  const blueprint = blueprintDe();

  assert.equal(blueprint.profile, "AMAZON");
  /* O contrato canônico aceita o objeto inteiro — nada de campo cross-profile. */
  assert.doesNotThrow(() => RadarCompetitiveBlueprintSchema.parse(blueprint));
  /* §6 · nenhuma conclusão nossa entrou no lado observado. */
  assert.doesNotThrow(() => assertRadarBlueprintSeparation(blueprint));

  assert.equal(blueprint.observed.products, 51);
  assert.ok(blueprint.recommended.comparisonAxes.length >= 2);
  assert.ok(blueprint.recommended.sectionDirections.length >= 4);
  assert.equal(blueprint.recommended.supportState, "APPLIED");

  /*
   * O ADAPTER É DOMÍNIO PURO. Uma chamada de rede aqui faria "analisar" custar
   * dinheiro — e ela seria disparada por F5, por reabrir o artigo, por tudo.
   */
  const fonte = semComentarios(fonteDoAdapter);
  assert.equal(/\bfetch\(|executeDataForSeo|SerpSnapshotRepository|appendAnalysis/.test(fonte), false);
});

test("A · a análise é determinística — a mesma entrada, o mesmo blueprint", () => {
  /*
   * §34.L e §34.M · É ISTO que faz F5 e outra sessão mostrarem a mesma página.
   *
   * O único campo que muda entre duas montagens é `generatedAt`, que é o
   * instante e não a leitura.
   */
  const primeiro = blueprintDe();
  const segundo = blueprintDe();
  assert.deepEqual(segundo, primeiro);
});

/* ================================ B ================================ */

test("B · PARTIAL_SUPPORT_FAILED analisa parcialmente e declara SUPPORT_MISSING", () => {
  const semApoio = blueprintDe(false);

  /* A DECISÃO DESTE GATE: analisar, e dizer que faltou. */
  assert.equal(semApoio.recommended.supportState, "SUPPORT_MISSING");
  assert.ok(semApoio.limitations.includes(RADAR_AMAZON_SUPPORT_MISSING_LIMITATION));

  /*
   * E NENHUMA RECOMENDAÇÃO DEPENDENTE DO GOOGLE SOBREVIVE.
   *
   * Um plano de multimídia sem SERP externa recomendaria vídeo por hábito, e a
   * produção sairia sem nenhum sinal pedindo por ela.
   */
  assert.deepEqual(semApoio.recommended.multimediaPlan, []);
  assert.deepEqual(semApoio.recommended.googleSeoSupport, []);
  assert.deepEqual(semApoio.observed.googleSupport, []);
  assert.equal(
    semApoio.recommended.comparisonAxes.some(eixo => eixo.axis === "GOOGLE_SUPPORT_CRITERION"),
    false,
    "nenhum critério externo sem a fonte externa",
  );
  assert.equal(
    semApoio.recommended.recommendedOutputs.some(saida => saida.output === "ARTICLE_WITH_VIDEO"),
    false,
    "vídeo não é recomendado por padrão",
  );

  /* A pesquisa paga continua inteira: 51 produtos, eixos e estrutura. */
  assert.equal(semApoio.observed.products, 51);
  assert.ok(semApoio.recommended.comparisonAxes.length >= 2);
  assert.ok(semApoio.recommended.sectionDirections.length >= 3);
});

/* ================================ C ================================ */

test("C · nenhuma direção de título copia título de concorrente", () => {
  const blueprint = blueprintDe();
  const titulosDaAmazon = corridaReal().universe.map(item => item.title);

  assert.ok(blueprint.recommended.titleDirections.length >= 2);
  assert.ok(blueprint.recommended.titleDirections.length <= 4);

  for (const direcao of blueprint.recommended.titleDirections) {
    assert.ok(direcao.sourceSignals.length >= 1, "toda direção declara o sinal que a sustenta");
    /*
     * A CÓPIA SERIA DETECTÁVEL POR TRECHO, não por igualdade.
     *
     * Ninguém copia um título inteiro; copia-se o miolo. Trechos de 20
     * caracteres do título de um concorrente dentro de uma "direção" seriam
     * exatamente isso.
     *
     * A KEYWORD DO PRÓPRIO ARTIGO SAI DA CONTA — ela aparece nos títulos da
     * prateleira porque é do que a prateleira trata, e é a formulação que o
     * Arquiteto escolheu. Acusá-la de cópia empurraria a direção a EVITAR o
     * termo pelo qual o artigo quer ranquear.
     */
    const semAKeyword = direcao.pattern.toLowerCase().split("protetor solar facial").join("·");
    for (const titulo of titulosDaAmazon) {
      for (let inicio = 0; inicio + 20 <= titulo.length; inicio += 5) {
        assert.equal(
          semAKeyword.includes(titulo.slice(inicio, inicio + 20).toLowerCase()),
          false,
          `a direção "${direcao.pattern}" repete um trecho de "${titulo}"`,
        );
      }
    }
  }
});

/* ================================ D ================================ */

test("D · todo eixo de comparação tem sinal sustentado e está na lista fechada", () => {
  const blueprint = blueprintDe();
  const sinaisObservados = new Set(
    Object.values(blueprint.observed)
      .filter(Array.isArray)
      .flat()
      .filter((item): item is { id: string } => Boolean(item && typeof item === "object" && "id" in item))
      .map(item => item.id),
  );

  for (const eixo of blueprint.recommended.comparisonAxes) {
    assert.ok(eixo.sourceSignal.length > 0);
    /*
     * O SINAL CITADO PRECISA EXISTIR NO OBSERVADO DESTE MESMO BLUEPRINT.
     *
     * Uma origem que aponta para nada é indistinguível de uma recomendação sem
     * origem — e passa pela trava do contrato, que só exige a string.
     */
    assert.ok(sinaisObservados.has(eixo.sourceSignal), `o eixo ${eixo.axis} aponta para o sinal inexistente ${eixo.sourceSignal}`);
  }

  /* §15 · nenhum critério de atributo — eles exigiriam PDP ou review. */
  const rotulos = blueprint.recommended.comparisonAxes.map(eixo => eixo.label.toLowerCase()).join(" ");
  assert.equal(/hidrat|absorç|acabamento|textura|benefíci|fórmula/.test(rotulos), false);
});

/* ================================ E ================================ */

test("E · nota e selo nunca viram qualidade nem recomendação de compra", () => {
  const blueprint = blueprintDe();

  /*
   * A PROIBIÇÃO VALE PARA O BLUEPRINT INTEIRO — inclusive o OBSERVADO.
   *
   * Auditar só o lado recomendado deixaria passar o caso pior: um veredito
   * de qualidade escrito como se fosse leitura da busca, que é a forma mais
   * autoritativa possível de afirmar o que a coleta nunca mediu.
   */
  const textoInteiro = JSON.stringify(blueprint).toLowerCase();
  for (const proibida of ["melhor produto", "maior qualidade", "mais confiável", "recomendamos comprar", "1º melhor", "o melhor da lista"]) {
    assert.equal(textoInteiro.includes(proibida), false, `o blueprint afirma "${proibida}"`);
  }
  /* E o observado sobre nota descreve AVALIAÇÃO, nunca o produto. */
  for (const sinal of blueprint.observed.ratingSignals) {
    assert.equal(/melhor|qualidade|superior|pior/i.test(sinal.statement), false, `o sinal ${sinal.id} julga em vez de observar`);
  }

  /*
   * §8 · A RESSALVA ANDA COM O EIXO REPUTACIONAL.
   *
   * Sem ela, uma coluna "4,7" numa tabela é lida como veredito — e o artigo
   * passa a afirmar o que a coleta nunca mediu.
   */
  for (const eixo of blueprint.recommended.comparisonAxes) {
    if (["RATING", "REVIEW_VOLUME", "AMAZON_CHOICE", "BEST_SELLER", "PURCHASE_VOLUME_SIGNAL"].includes(eixo.axis)) {
      assert.ok(eixo.caveat, `o eixo ${eixo.axis} não declara ressalva`);
    }
  }

  /* §16 · agrupamento, nunca ordenação por mérito. */
  assert.ok(blueprint.recommended.comparisonGrouping.length > 0);
  const fonte = semComentarios(fonteDoAdapter);
  assert.equal(/\bsort\(\s*\(\s*a\s*,\s*b\s*\)\s*=>\s*b\.ratingValue/.test(fonte), false, "nada ordena produto por nota");
});

/* ================================ F ================================ */

test("F · buscas relacionadas nunca viram categoria", () => {
  const blueprint = blueprintDe();
  assert.ok(blueprint.observed.relatedSearchSignals.length > 0);

  for (const sinal of blueprint.observed.relatedSearchSignals) {
    assert.match(sinal.statement, /busca relacionada/);
    assert.equal(/categoria|departamento|taxonomia/i.test(sinal.statement), false);
  }

  for (const fonte of [semComentarios(fonteDoAdapter), semComentarios(fonteDoPainel), semComentarios(fonteDoBlueprintUI)]) {
    assert.equal(/\bcategories\b|\bcategoria(s)?:/i.test(fonte), false);
  }
});

/* ================================ G ================================ */

test("G · marca ausente continua ausente — nada é inferido do título", () => {
  const blueprint = blueprintDe();
  const inteiro = JSON.stringify(blueprint);

  /* O contrato não tem lugar para marca, e o adapter não inventa um. */
  assert.equal(/"brand"|"brands"|"manufacturer"|"seller"/.test(inteiro), false);

  const fonte = semComentarios(fonteDoAdapter);
  assert.equal(/title\.split\(|marcaDoTitulo|\bfabricante\b/i.test(fonte), false);
  assert.ok(blueprint.recommended.requiresEnrichment.includes("BRAND_IDENTITY"), "a lacuna é declarada, não preenchida");
});

/* ================================ H ================================ */

test("H · sem texto de avaliação, o blueprint declara a limitação", () => {
  const blueprint = blueprintDe();

  for (const limitacao of RADAR_AMAZON_BASE_LIMITATIONS) {
    assert.ok(blueprint.limitations.includes(limitacao), `falta a limitação: ${limitacao}`);
  }
  assert.ok(blueprint.recommended.requiresEnrichment.includes("REVIEW_TEXT"));
  assert.ok(blueprint.recommended.requiresEnrichment.includes("PDP_ATTRIBUTES"));

  /*
   * §21 · ELAS PRECISAM SER LEGÍVEIS, não escondidas em proveniência técnica.
   *
   * A casca canônica já imprime `limitations` fora da gaveta — e é por isso que
   * este teste olha o componente, e não só o dado.
   */
  const ui = semComentarios(fonteDoBlueprintUI);
  assert.ok(ui.includes('data-testid="radar-blueprint-limitations"'));

  /* E nenhuma percepção de comprador foi fabricada a partir de nota. */
  const graus = Object.values(blueprint.observed)
    .filter(Array.isArray).flat()
    .filter((item): item is { grade: string } => Boolean(item && typeof item === "object" && "grade" in item))
    .map(item => item.grade);
  assert.equal(graus.includes("BUYER_PERCEPTION"), false, "sem texto de review não existe percepção de comprador");
});

/* ================================ I ================================ */

test("I · as faixas de preço declaram método e tamanho de amostra", () => {
  const run = corridaReal();
  const bandas = buildRadarAmazonPriceBands({ universe: run.universe, observedAt: run.provenance.collectedAt });

  assert.ok(bandas.length >= 2);
  for (const banda of bandas) {
    assert.match(banda.method, /Tercil da amostra de \d+ preço/);
    assert.ok(banda.sampleSize > 0);
    assert.ok(banda.rangeFrom !== null && banda.rangeTo !== null);
    assert.equal(banda.observedAt, run.provenance.collectedAt, "o preço observado carrega a data");
  }

  /*
   * §7 · O CORTE SAI DA AMOSTRA, NUNCA DE UM NÚMERO FIXO.
   *
   * "Até R$ 50 é econômico" seria verdade em protetor solar e absurdo em
   * eletrodoméstico.
   */
  const fonte = semComentarios(fonteDoAdapter);
  assert.equal(/valor\s*[<>]=?\s*\d{2,}/.test(fonte), false, "nenhum corte de preço hardcodado");

  /* Com menos de três preços não há tercil — e a função não inventa um. */
  assert.deepEqual(
    buildRadarAmazonPriceBands({ universe: run.universe.slice(0, 2), observedAt: "2026-09-15T12:00:05.000Z" }),
    [],
  );

  /* §7 · a recomendação fala em BANDA, nunca em valor durável. */
  const recomendado = JSON.stringify(blueprintDe().recommended);
  assert.equal(/R\$\s?\d/.test(recomendado), false, "nenhum preço exato vira recomendação");
});

/* ================================ J e K ================================ */

test("J e K · o FINALIZE congela por referência — sem universe, sem results", () => {
  const run = corridaReal();
  const fotografia = freezeRadarAmazonInvestigation({
    run,
    blueprint: blueprintDe(),
    supportRefs: [{ source: "WEB_SERP", role: "SEO_COMMERCIAL_SUPPORT", snapshotId: "snap-1", keyword: "protetor solar facial", collectedAt: "2026-09-15T12:00:08.000Z" }],
    finalizedBy: "user-1",
    finalizedAt: "2026-09-15T14:00:00.000Z",
  });

  assert.equal(fotografia.runRef.runId, run.runId);
  assert.equal(fotografia.runRef.runFingerprint, run.fingerprint.signature);
  assert.equal(fotografia.runRef.universeSize, 51);
  assert.equal(fotografia.observedSummary.sponsoredPlacements, 2);
  assert.equal(fotografia.observedSummary.sponsored, 1, "produto patrocinado, não posição");
  assert.equal(fotografia.competitiveBlueprint.provenance.frozenAt, "2026-09-15T14:00:00.000Z");

  /*
   * ============ §26 · RUN_DUPLICATED_IN_FREEZE = NO ============
   *
   * A auditoria mediu o estrago da versão anterior deste erro: 126.656 dos
   * 144.440 bytes de uma fotografia de YouTube eram a corrida copiada byte a
   * byte. Aqui a Amazon nasce corrigida — e o teste confere no SERIALIZADO,
   * que é a forma em que isso realmente chega ao banco.
   */
  const serializada = JSON.stringify(fotografia);
  assert.equal(serializada.includes('"universe"'), false);
  assert.equal(serializada.includes('"results"'), false);
  assert.equal(serializada.includes('"relatedSearches":['), false);
  for (const produto of run.universe.slice(0, 5)) {
    assert.equal(serializada.includes(`"${produto.asin}"`), false, `o ASIN ${produto.asin} foi copiado para a fotografia`);
  }

  /* E o snapshot do Google também é referência, nunca cópia. */
  assert.deepEqual(fotografia.supportRefs.map(item => item.snapshotId), ["snap-1"]);
  assert.equal(serializada.includes("peopleAlsoAsk"), false);

  /* A fotografia é muito menor que a corrida — a diferença é o ponto. */
  assert.ok(serializada.length < JSON.stringify(run).length, "a fotografia não pode pesar mais que a coleta");

  /* As contagens são legíveis sem reabrir a corrida. */
  assert.deepEqual(radarAmazonFrozenCounts(fotografia), {
    queriesExecuted: 1, universeSize: 51, collectedAt: "2026-09-15T12:00:05.000Z",
  });
});

test("J · congelar o que não está pronto é recusado, não tolerado", () => {
  const run = corridaReal();
  const blueprint = blueprintDe();

  /*
   * UMA FOTOGRAFIA DE COLETA EM CURSO É UMA FOTOGRAFIA DE NADA.
   *
   * E ela chegaria ao Planejador com o mesmo peso de uma investigação real —
   * por isso o FINALIZE recusa em vez de congelar o que houver.
   */
  assert.throws(
    () => freezeRadarAmazonInvestigation({
      run: { ...run, state: "COLLECTING" },
      blueprint, finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
    }),
    (erro: unknown) => (erro as { code?: string }).code === "amazon_run_not_collected",
  );

  assert.throws(
    () => freezeRadarAmazonInvestigation({
      run: { ...run, universe: [] },
      blueprint, finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
    }),
    (erro: unknown) => (erro as { code?: string }).code === "amazon_universe_empty",
  );

  /* E o blueprint congelado precisa ser DESTE artigo. */
  assert.throws(
    () => freezeRadarAmazonInvestigation({
      run,
      blueprint: { ...blueprint, articleId: "outro-artigo" },
      finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
    }),
    (erro: unknown) => (erro as { code?: string }).code === "amazon_blueprint_article_mismatch",
  );
});

test("K · referência quebrada é erro explícito, nunca reconstrução", () => {
  const run = corridaReal();
  const fotografia = freezeRadarAmazonInvestigation({
    run, blueprint: blueprintDe(), finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
  });

  assert.equal(resolveRadarAmazonFrozenRun({ frozen: fotografia, liveRun: run }), run);

  assert.throws(
    () => resolveRadarAmazonFrozenRun({ frozen: fotografia, liveRun: null }),
    (erro: unknown) => (erro as RadarAmazonRunRefError).code === "amazon_run_ref_missing",
  );
  assert.throws(
    () => resolveRadarAmazonFrozenRun({ frozen: fotografia, liveRun: { ...run, runId: "outra" } }),
    (erro: unknown) => (erro as RadarAmazonRunRefError).code === "amazon_run_ref_mismatch",
  );
  /*
   * MESMO runId COM ASSINATURA DIFERENTE É O CASO PERIGOSO.
   *
   * A corrida foi refeita sob o mesmo nome: a fotografia passaria a descrever
   * uma amostra que não é a dela, e nada na tela diria isso.
   */
  assert.throws(
    () => resolveRadarAmazonFrozenRun({
      frozen: fotografia,
      liveRun: { ...run, fingerprint: { ...run.fingerprint, signature: "outra-assinatura" } },
    }),
    (erro: unknown) => (erro as RadarAmazonRunRefError).code === "amazon_run_ref_fingerprint",
  );

  const fonte = semComentarios(fonteDoFreeze);
  assert.equal(/reconstru|rebuild|fallback/i.test(fonte), false, "nenhuma reconstrução de corrida");
});

/* ================================ L e M ================================ */

test("L e M · F5 e outra sessão leem a MESMA página — porque ela está gravada", () => {
  const run = corridaReal();
  const blueprint = blueprintDe();

  /*
   * O BLUEPRINT É PERSISTIDO, não recalculado a cada render.
   *
   * Recalcular abriria a porta para uma melhoria no vocabulário de faixas mudar
   * a recomendação sob uma página que a pessoa já leu — sem que nada anunciasse.
   */
  const leitura = () => radarCompetitiveBlueprintViewOfAnalysis({
    profile: "AMAZON",
    articleId: "artigo-1", articleDnaVersionId: "dna-1",
    frozen: null, liveBlueprint: null, liveMultimodal: null, primaryKeyword: null,
    amazonFrozen: null,
    amazonBlueprint: blueprint,
    amazonUniverseSize: run.universe.length,
    generatedAt: "2026-09-15T15:00:00.000Z",
  });

  assert.deepEqual(leitura().blueprint, leitura().blueprint);
  assert.equal(leitura().frozen, false);
  assert.equal(leitura().sample.count, 51);

  /* Congelada, quem responde é a fotografia — e ela vence o vivo. */
  const fotografia = freezeRadarAmazonInvestigation({
    run, blueprint, finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
  });
  const congelada = radarCompetitiveBlueprintViewOfAnalysis({
    profile: "AMAZON",
    articleId: "artigo-1", articleDnaVersionId: "dna-1",
    frozen: null, liveBlueprint: null, liveMultimodal: null, primaryKeyword: null,
    amazonFrozen: fotografia,
    /* Um blueprint vivo diferente ao lado NÃO pode vencer a fotografia. */
    amazonBlueprint: blueprintDe(false),
    amazonUniverseSize: 51,
    generatedAt: "2026-09-15T15:00:00.000Z",
  });
  assert.equal(congelada.frozen, true);
  assert.equal(congelada.blueprint?.profile === "AMAZON" && congelada.blueprint.recommended.supportState, "APPLIED");
  assert.equal(congelada.blueprint?.provenance.frozenAt, "2026-09-15T14:00:00.000Z");
});

/* ================================ N ================================ */

test("N · FINALIZED some com START e ANALYZE, e o blueprint fica legível", () => {
  const run = corridaReal();
  const fotografia = freezeRadarAmazonInvestigation({
    run, blueprint: blueprintDe(), finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
  });

  const projecao = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: run, amazonFrozenInvestigation: fotografia, researchPackage: null },
    profile: "AMAZON",
  });

  assert.equal(projecao.state, "FINALIZED");
  assert.equal(projecao.canStart, false);
  assert.equal(projecao.profileLocked, true);
  assert.equal(projecao.showBlueprint, true);
  /* §26 · os números vêm da referência, não de uma cópia que não existe. */
  assert.equal(projecao.counts.videos, 51);
  assert.equal(projecao.counts.queries, 1);

  const painel = semComentarios(fonteDoPainel);
  /* Cada ação que reescreveria o congelado é guardada por `!finalizada`. */
  for (const testid of ["radar-amazon-start", "radar-amazon-analyze", "radar-amazon-finalize"]) {
    const trecho = painel.slice(0, painel.indexOf(`data-testid="${testid}"`));
    assert.ok(trecho.lastIndexOf("!finalizada") > trecho.lastIndexOf("</button>}"), `${testid} não é guardado por !finalizada`);
  }
  assert.equal(/Refinalizar|Nova coleta/.test(painel), false, "§27 · não existe refinalizar nem nova coleta");
  assert.ok(painel.includes("Reabrir / zerar investigação"));
  assert.ok(painel.includes('data-testid="radar-amazon-view-blueprint"'));
});

/* ================================ O ================================ */

test("O · a amostra vem recolhida e abri-la não chama nada", () => {
  const painel = semComentarios(fonteDoPainel);

  /*
   * §29 · fechada por padrão; um card por ASIN.
   *
   * ============ A REGRA FICOU MAIS FORTE EM 1.3 · §8 ============
   *
   * Era `open={projecao.sampleDefaultExpanded && !analisado}` — recolhida
   * DEPOIS da análise e aberta antes. Isso herdava a regra do YouTube, onde os
   * vídeos são o trabalho porque é neles que se cura. Na Amazon não há
   * curadoria por produto, e 59 cards abertos empurravam o blueprint para fora
   * da tela.
   *
   * Agora ela nasce fechada SEMPRE, e a asserção passa a ser a ausência do
   * atributo — que é a condição mais forte.
   */
  const aberturaDaAmostra = painel.slice(
    painel.lastIndexOf("<details", painel.indexOf('data-testid="radar-amazon-sample"')),
    painel.indexOf('data-testid="radar-amazon-sample"'),
  ).split("onToggle")[0];
  assert.equal(/(^|\s)open(\s*=|\s*\/?>|\s)/.test(aberturaDaAmostra), false, "a amostra nasce fechada");
  assert.ok(painel.includes('data-testid="radar-amazon-sample"'));
  assert.equal(/\bfetch\(|onClick=\{\(\) => on(Start|Analyze)/.test(painel.slice(painel.indexOf('data-testid="radar-amazon-sample"'))), false);

  /* §28 · o blueprint vem ANTES da amostra, e a amostra antes da proveniência. */
  /*
   * A ORDEM É A DOS ELEMENTOS RENDERIZADOS.
   *
   * Procurar a string "radar-competitive-blueprint" pegaria primeiro o
   * `querySelector` do botão [Ver blueprint], lá no cabeçalho — e o teste
   * mediria a ordem do código, não a da tela.
   */
  const ordem = ["radar-amazon-observed", "<RadarCompetitiveBlueprintSection", "radar-amazon-sample", "radar-amazon-provenance"]
    .map(marcador => painel.indexOf(marcador));
  assert.ok(ordem.every(indice => indice > 0), "os quatro blocos existem");
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, "a ordem da tela é a ordem da decisão");

  /*
   * §30 · OS IDS TÉCNICOS MORAM NA GAVETA, E SÓ NELA.
   *
   * A auditoria é sobre o que é RENDERIZADO: a fatia começa na árvore JSX, não
   * no topo do arquivo. Acima dela existe preparação de dados — desde o
   * RADAR_FINAL_2.1, a leitura técnica é montada antes para ser entregue ao
   * disclosure —, e preparar não é mostrar.
   */
  const arvore = painel.slice(painel.indexOf('return <section className="mt-3 space-y-3"'));
  const antesDaProveniencia = arvore.slice(0, arvore.indexOf('data-testid="radar-amazon-provenance"'));
  assert.ok(antesDaProveniencia.length > 0, "a fatia da visão normal existe");
  assert.equal(/\{run\.runId|\{tecnico\.runId|fingerprint\.signature|provenance\.endpoint/.test(antesDaProveniencia), false);
});

/* ================================ P ================================ */

test("P · Google e YouTube não regridem — o envelope segue discriminado", () => {
  /* O adapter da Amazon não toca em nenhuma das outras duas investigações. */
  const fonte = semComentarios(fonteDoAdapter);
  assert.equal(/youtubeSearch|youtubeFrozenInvestigation|deepResearch|finalizedBundle|serpSnapshotId/.test(fonte), false);

  /* O serviço grava SÓ os campos do perfil Amazon. */
  const servico = semComentarios(fonteDoServico);
  assert.match(servico, /\{ amazonBlueprint: blueprint \}/);
  assert.match(servico, /\{ amazonFrozenInvestigation: fotografia, amazonBlueprint: null \}/);
  assert.equal(/youtubeSearch:|youtubeFrozenInvestigation:|finalizedBundle:/.test(servico), false);

  /* E a casca visual continua uma só, com uma ramificação por perfil. */
  const ui = semComentarios(fonteDoBlueprintUI);
  for (const perfil of ["GOOGLE", "YOUTUBE", "AMAZON"]) {
    assert.ok(ui.includes(`view.blueprint.profile === "${perfil}"`), `o perfil ${perfil} perdeu a casca`);
  }
});

/* ======================== §2 · ZERO PROVIDER CALLS ======================== */

test("§2 · analisar e finalizar não chamam provider em caminho nenhum", () => {
  const servico = semComentarios(fonteDoServico);
  assert.equal(
    /executeDataForSeo|collectDataForSeoSerpSnapshot|collectRadarGoogleSupport|resolveDataForSeoCanonical|\bfetch\(/.test(servico),
    false,
    "o serviço de análise não fala com provider nenhum",
  );
  /* Ler o snapshot gravado NÃO é chamada de provider — é o mesmo dado já pago. */
  assert.ok(servico.includes("SerpSnapshotRepository"));

  const rota = semComentarios(fonteDaRota);
  /* O marcador de fim é CÓDIGO: um comentário some com `semComentarios`. */
  const fatia = rota.slice(
    rota.indexOf('if (input.action === "analyze")'),
    rota.indexOf('radar_amazon_queries_required'),
  );
  assert.ok(fatia.length > 0, "a fatia das ações sem provider existe");
  assert.equal(/executeDataForSeoAmazonQuery|startRadarAmazonRun|resolveDataForSeoCanonical/.test(fatia), false);
  assert.ok(fatia.includes("analyzeRadarAmazonInvestigation({"));
  assert.ok(fatia.includes("finalizeRadarAmazonInvestigation({"));
});

/* ============ §5 e §24 · os cards e o estado depois da análise ============ */

test("§5 · os quatro cards sobrevivem, agora com os dois lados", () => {
  const cards = buildRadarAmazonBlueprintCards(blueprintDe());

  assert.deepEqual(
    cards.map(card => card.id),
    ["COMPETITIVE_MODEL", "PRICE_AND_OFFER", "REPUTATION_AND_PURCHASE", "COMMERCIAL_AND_SEO"],
  );
  assert.ok(cards.every(card => card.lines.length > 0), "todo card mostra observação");
  assert.ok(cards.some(card => card.recommended.length > 0), "e ao menos um mostra recomendação");

  /* Toda recomendação de card aponta para um sinal — nenhuma é órfã. */
  for (const card of cards) {
    for (const item of card.recommended) assert.ok(item.sourceSignal.length > 0);
  }

  /* A faixa de preço aparece com o método, nunca só com o rótulo. */
  const preco = cards.find(card => card.id === "PRICE_AND_OFFER")!;
  assert.ok(preco.lines.some(linha => /Tercil da amostra/.test(linha)));
});

test("§24 · blueprint gravado leva a READY_TO_FINALIZE, e ele não oferece START", () => {
  const run = corridaReal();
  const projecao = radarResearchProfileStateOfAnalysis({
    payload: { amazonSearch: run, amazonBlueprint: blueprintDe() },
    profile: "AMAZON",
  });

  assert.equal(projecao.state, "READY_TO_FINALIZE");
  assert.equal(projecao.nextAction.id, "FINALIZE");
  /*
   * §23 · UM START AQUI RECOLETARIA A PRATELEIRA e jogaria fora a análise que
   * a pessoa está revisando — cobrando de novo pelo que já foi pago.
   */
  assert.equal(projecao.canStart, false);
  assert.equal(projecao.showBlueprint, true);
  assert.equal(projecao.sampleDefaultExpanded, false, "§29 · a amostra não empurra o blueprint para fora da tela");
});

/* ============================ §33 · o relatório ============================ */

test("§33 · o relatório reconhece a Amazon — e não marca o que não existe", () => {
  const run = corridaReal();
  const fotografia = freezeRadarAmazonInvestigation({
    run, blueprint: blueprintDe(), finalizedBy: "user-1", finalizedAt: "2026-09-15T14:00:00.000Z",
    supportRefs: [{ source: "WEB_SERP", role: "SEO_COMMERCIAL_SUPPORT", snapshotId: "snap-1", keyword: "protetor solar facial", collectedAt: null }],
  });
  const payload = { amazonSearch: run, amazonFrozenInvestigation: fotografia };

  const evidencia = radarAmazonReportEvidence({
    projecao: radarResearchProfileStateOfAnalysis({ payload, profile: "AMAZON" }),
    payload,
  });

  assert.ok(evidencia);
  assert.equal(evidencia.finalized, true);
  assert.equal(evidencia.products, 51);
  assert.equal(evidencia.supportCollected, true);
  assert.equal(evidencia.blueprintFrozen, true);
  assert.ok(evidencia.editorialOutput, "a saída editorial escolhida viaja com a fotografia");

  /*
   * §33 · E NADA ALÉM DISSO.
   *
   * A tentação é marcar "evidência de produto" verde porque há 51 produtos. Mas
   * esta coleta não abriu review, não abriu PDP e não leu atributo nenhum — e
   * um check verde que o dado não sustenta é pior do que um pendente, porque
   * ninguém volta para conferir o que já está verde.
   */
  assert.equal("reviewEvidence" in evidencia, false);
  assert.equal("expertEvidence" in evidencia, false);
  assert.equal("pdpAttributes" in evidencia, false);

  /* Sem fotografia, não há evidência nenhuma para o relatório. */
  assert.equal(
    radarAmazonReportEvidence({
      projecao: radarResearchProfileStateOfAnalysis({ payload: { amazonSearch: run, amazonBlueprint: blueprintDe() }, profile: "AMAZON" }),
      payload: { amazonSearch: run },
    }),
    null,
  );
});

test("sentinela · ANALYSIS_PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
