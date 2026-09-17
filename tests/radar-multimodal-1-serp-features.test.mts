import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildRadarSerpFeatureIntelligence,
  radarYoutubeIdFromAnyUrl,
} from "../lib/radar/serp-features.ts";
import {
  RADAR_EDITORIAL_OUTPUTS,
  buildRadarMultimodalBlueprint,
  radarCrossSerpVideoSignal,
  radarDecideEditorialOutput,
} from "../lib/radar/multimodal-blueprint.ts";
import { buildRadarYoutubeUniverse } from "../lib/radar/youtube-search-model.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";
import { SerpResearchSnapshotSchema } from "../lib/radar/serp/contracts.ts";

/*
 * ====  RADAR_MULTIMODAL_1 · SERP FEATURES + CROSS-SERP  ====
 *
 * ==================== O ACHADO QUE ORIGINOU O GATE ====================
 *
 * A mesma keyword, nas duas SERPs reais:
 *
 *   GOOGLE   125 itens em OITO tipos de bloco — AI Overview, orgânicos, PAA,
 *            imagens, vídeos, Shorts, People Also Search, produtos.
 *   YOUTUBE  100 vídeos numa consulta só, long-form e Shorts misturados.
 *
 * A normalização do Google guardava TRÊS blocos e descartava cinco. Isso
 * jogava fora perguntas, entidades, linguagem visual, presença audiovisual e a
 * camada comercial inteira — tudo que já vinha pago na mesma resposta.
 *
 * Este arquivo roda contra os dois payloads reais.
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

const googleReal = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-google-skin-care-noturno.json", import.meta.url), "utf8"),
);
const youtubeReal = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-youtube-skin-care-noturno.json", import.meta.url), "utf8"),
);

const features = () => buildRadarSerpFeatureIntelligence(googleReal)!;
const universo = () => buildRadarYoutubeUniverse(normalizeDataForSeoYoutubeResponse(youtubeReal, "ytq:1").results);

/* ============ os oito blocos, preservados e interpretados ============ */

test("os OITO blocos da SERP real são lidos — e cada um vira uma camada", () => {
  const f = features();

  assert.equal(f.keyword, "skin care noturno");
  assert.equal(f.itemTypes.length, 8, f.itemTypes.join(", "));

  /* AI_OVERVIEW: a resposta que o Google quer dar, e quem ele cita. */
  assert.equal(f.aiOverview.present, true);
  assert.ok(f.aiOverview.markdownLength > 100, "a síntese tem corpo");
  assert.ok(f.aiOverview.references.length > 0);
  assert.ok(f.aiOverview.references.every(ref => ref.domain.length > 3));

  /* QUESTION_MAP, ENTITY_MAP, VISUAL, VIDEO, COMMERCIAL. */
  assert.ok(f.questionMap.length > 0, "PAA vira mapa de perguntas");
  assert.ok(f.entityMap.length > 0, "chips e expansões viram entidades");
  assert.ok(f.visualOpportunities.length > 0, "imagens viram linguagem visual");
  assert.ok(f.videos.length > 0, "vídeos e Shorts viram presença audiovisual");
  assert.equal(f.commercialSignals.present, true, "produtos viram sinal comercial");
  assert.ok(f.organicCount > 0);

  /* CONTENT_FORMAT_MAP: cada presença é um voto do Google sobre o formato. */
  assert.deepEqual(f.contentFormatMap, {
    hasAiOverview: true, hasOrganic: true, hasQuestions: true, hasImages: true,
    hasVideo: true, hasShortVideos: true, hasProducts: true,
  });
});

test("PERGUNTA e ENTIDADE não caem no mesmo balde", () => {
  const f = features();

  /*
   * "O que devo usar no rosto à noite?" e "niacinamida" pedem tratamentos
   * editoriais diferentes: uma vira seção que responde, a outra vira cobertura
   * de tema. Num balde só, a leitura perderia a distinção.
   */
  assert.ok(f.questionMap.some(item => /\?/.test(item.question)), "as perguntas são perguntas");
  assert.ok(f.questionMap.some(item => item.source === "PEOPLE_ALSO_ASK"));
  assert.equal(f.entityMap.some(item => /\?/.test(item.term)), false, "nenhuma entidade é pergunta disfarçada");

  /* Cada item declara de qual bloco veio — sem isso não dá para conferir. */
  for (const pergunta of f.questionMap) assert.ok(["PEOPLE_ALSO_ASK", "PEOPLE_ALSO_SEARCH", "REFINEMENT_CHIP"].includes(pergunta.source));
  for (const entidade of f.entityMap) assert.ok(["REFINEMENT_CHIP", "PEOPLE_ALSO_SEARCH", "RELATED_IMAGE_SEARCH"].includes(entidade.source));

  /* Cada bloco CONTRIBUI de verdade — e a contagem por origem prova isso. */
  assert.ok(f.questionMap.filter(item => item.source === "PEOPLE_ALSO_ASK").length > 0, "o PAA alimenta perguntas");
  assert.ok(f.entityMap.filter(item => item.source === "REFINEMENT_CHIP").length > 0, "os chips alimentam entidades");
  assert.ok(f.entityMap.filter(item => item.source === "PEOPLE_ALSO_SEARCH").length > 0, "as expansões alimentam entidades");

  /*
   * A SEPARAÇÃO É POR FORMA, e o teste exercita os dois lados no MESMO bloco.
   *
   * "People Also Search" devolve tanto termo quanto pergunta; classificar tudo
   * como entidade perderia a pergunta, e o inverso encheria a cobertura de
   * frases interrogativas.
   */
  const misturado = buildRadarSerpFeatureIntelligence({
    tasks: [{ result: [{ keyword: "k", item_types: ["people_also_search"], items: [
      { type: "people_also_search", items: ["niacinamida", "Como aplicar niacinamida?", "retinol"] },
    ] }] }],
  })!;
  assert.deepEqual(misturado.questionMap.map(item => item.question), ["Como aplicar niacinamida?"]);
  assert.deepEqual(misturado.entityMap.map(item => item.term), ["niacinamida", "retinol"]);
  assert.equal(misturado.questionMap[0].source, "PEOPLE_ALSO_SEARCH");

  /* E a repetição não vira duas linhas. */
  assert.equal(new Set(f.questionMap.map(item => item.question.toLowerCase())).size, f.questionMap.length);
  assert.equal(new Set(f.entityMap.map(item => item.term.toLowerCase())).size, f.entityMap.length);

  /*
   * A MESMA PERGUNTA EM DOIS BLOCOS É UMA PERGUNTA.
   *
   * O Google repete a mesma dúvida no PAA e nas expansões; contá-la duas vezes
   * inflaria o mapa e faria a peça principal parecer ter mais a responder.
   */
  const repetido = buildRadarSerpFeatureIntelligence({
    tasks: [{ result: [{ keyword: "k", item_types: ["people_also_ask", "people_also_search"], items: [
      { type: "people_also_ask", items: [{ type: "people_also_ask_element", title: "Qual a ordem?" }] },
      { type: "people_also_search", items: ["Qual a ordem?", "ordem correta"] },
    ] }] }],
  })!;
  assert.equal(repetido.questionMap.length, 1, "a pergunta repetida entra uma vez só");
  assert.equal(repetido.questionMap[0].source, "PEOPLE_ALSO_ASK", "e a primeira origem é a que fica");
});

test("SEARCH_INTENT observada nomeia o sinal E o bloco que o sustenta", () => {
  const f = features();

  assert.ok(f.observedIntentSignals.length >= 4);
  /*
   * "Intenção comercial" sem o bloco que a produziu seria um rótulo que ninguém
   * confere contra o payload — e a pessoa teria de acreditar.
   */
  for (const sinal of f.observedIntentSignals) assert.ok(/\d/.test(sinal), `sinal sem número: ${sinal}`);
  assert.ok(f.observedIntentSignals.some(item => /comercial/i.test(item)));
  assert.ok(f.observedIntentSignals.some(item => /audiovisual|vídeo/i.test(item)));

  /* E o teto da leitura é dito sempre. */
  assert.ok(f.limitations.some(item => /Nenhuma página foi visitada/.test(item)));
});

test("bloco ausente vira ausência DECLARADA, nunca zero inventado", () => {
  /* Uma SERP de dez links azuis: o que falta é dito, não silenciado. */
  const magra = buildRadarSerpFeatureIntelligence({
    tasks: [{ result: [{ keyword: "termo simples", item_types: ["organic"], items: [
      { type: "organic", rank_absolute: 1, title: "t", url: "https://exemplo.com", domain: "exemplo.com" },
    ] }] }],
  })!;

  assert.equal(magra.aiOverview.present, false);
  assert.deepEqual(magra.videos, []);
  assert.equal(magra.commercialSignals.present, false);
  assert.deepEqual(magra.commercialSignals.products, []);
  assert.equal(magra.contentFormatMap.hasProducts, false);

  assert.ok(magra.limitations.some(item => /não trouxe AI Overview/.test(item)));
  assert.ok(magra.limitations.some(item => /não trouxe bloco de vídeo/.test(item)));
  assert.ok(magra.limitations.some(item => /não trouxe produtos/.test(item)));

  /* E payload sem resultado nenhum devolve `null` — não um objeto vazio. */
  assert.equal(buildRadarSerpFeatureIntelligence({ tasks: [] }), null);
  assert.equal(buildRadarSerpFeatureIntelligence(null), null);
});

test("GOOGLE_CURRENT_PIPELINE_REGRESSION = 0 — o campo é aditivo", () => {
  /*
   * A camada entrou como `.default(null)`. Um snapshot gravado antes deste
   * gate continua parseando e simplesmente não tem features — que é a verdade
   * sobre ele, e não uma leitura inventada.
   */
  const shape = SerpResearchSnapshotSchema.shape;
  assert.ok("serpFeatures" in shape, "o campo existe no contrato");

  const antigo = {
    id: "serp:a:1", brandId: "m", articleId: "a", articleDnaVersionId: "v", keywordId: "k", keywordDnaVersionId: "kv",
    query: "x", country: "br", language: "pt-BR", location: "Brasil", device: "desktop" as const, resultLimit: 10,
    provider: "dataforseo", providerEndpoint: "/search" as const, origin: "real" as const, isMock: false,
    collectedAt: "2026-09-14T18:00:00.000Z", version: 1, previousSnapshotId: null,
    contentHash: "a".repeat(64), persistenceMode: "remote" as const, status: "needs_review" as const,
    organicResults: [], peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null,
    diagnostic: {
      dominantIntent: null, secondaryIntents: [], confidence: "low" as const, dominantFormats: [],
      resultTypeCounts: {}, pageTypes: [], recurringTitlePatterns: [], recurringSnippetPatterns: [],
      frequentEntities: [], frequentDomains: [], localSignals: [], questions: [], relatedSearches: [],
      possibleConflicts: [], opportunities: [], limitations: [], verdict: "informacao_insuficiente" as const,
    },
  };

  const parseado = SerpResearchSnapshotSchema.parse(antigo);
  assert.equal(parseado.serpFeatures, null, "ausência declarada");
  assert.deepEqual(parseado.organicResults, [], "e o resto do snapshot intacto");
});

/* ==================== o cruzamento entre as duas SERPs ==================== */

test("CROSS_SERP_VIDEO_SIGNAL — quem atravessa as duas plataformas", () => {
  const cruzados = radarCrossSerpVideoSignal({ features: features(), youtubeUniverse: universo() });

  const atravessou = cruzados.filter(item => item.signal === "CROSS_PLATFORM");
  assert.ok(atravessou.length > 0, "a amostra real tem travessia de plataforma");

  for (const video of atravessou) {
    /*
     * O SINAL SE EXPLICA — e continua sendo SINAL.
     *
     * "Aparece nos dois lugares" é força competitiva observada, não verdade
     * editorial: nada aqui diz que este vídeo é bom, só que ele atravessou.
     */
    assert.match(video.reason, /posição \d+ do YouTube/);
    assert.match(video.reason, /Google/);
    assert.ok(video.youtubeBestRank > 0);
  }

  /*
   * O QUE SÓ O GOOGLE DEVOLVEU É DITO — e a leitura é sobre NÓS.
   *
   * Um vídeo que o Google escolhe e as nossas consultas não alcançaram revela
   * buraco no PLANO DE CONSULTAS. Omiti-lo esconderia a única pista de que a
   * nossa amostra do YouTube está incompleta.
   */
  const soGoogle = cruzados.filter(item => item.signal === "GOOGLE_ONLY");
  assert.ok(soGoogle.length > 0, "a amostra real tem vídeo que só o Google devolveu");
  for (const video of soGoogle) assert.match(video.reason, /consultas de YouTube não o alcançaram/);

  /* CROSS_PLATFORM vem primeiro: é o sinal mais forte. */
  if (atravessou.length && soGoogle.length) {
    assert.equal(cruzados[0].signal, "CROSS_PLATFORM");
  }
});

test("o cruzamento é por videoId — Instagram e TikTok não têm par possível", () => {
  const f = features();

  /* O bloco do Google mistura plataformas: só o YouTube tem identidade comum. */
  const plataformas = new Set(f.videos.map(item => item.platform));
  assert.ok(plataformas.size > 1, `a SERP real mistura plataformas: ${[...plataformas].join(", ")}`);
  assert.ok(f.videos.some(item => item.platform !== "YOUTUBE"));

  /*
   * A PLATAFORMA SAI DO DOMÍNIO, e errá-la faria um Reel do Instagram entrar
   * na fila de cruzamento com o YouTube — onde ele nunca terá par.
   */
  for (const video of f.videos) {
    const esperada = /youtube\.com|youtu\.be/.test(video.url) ? "YOUTUBE"
      : /instagram\.com/.test(video.url) ? "INSTAGRAM"
        : /tiktok\.com/.test(video.url) ? "TIKTOK" : "OUTRA";
    assert.equal(video.platform, esperada, `plataforma errada para ${video.url}`);
    if (video.platform === "YOUTUBE") continue;
    assert.equal(video.youtubeVideoId, null, `${video.platform} não pode ter videoId de YouTube`);
  }
  assert.ok(f.videos.some(item => item.platform === "INSTAGRAM"), "a SERP real tem Reel do Instagram");

  assert.equal(radarYoutubeIdFromAnyUrl("https://www.youtube.com/watch?v=abc123"), "abc123");
  assert.equal(radarYoutubeIdFromAnyUrl("https://www.youtube.com/shorts/xyz789"), "xyz789");
  assert.equal(radarYoutubeIdFromAnyUrl("https://www.instagram.com/reel/DYKYR7htpKW/"), null);
  assert.equal(radarYoutubeIdFromAnyUrl(null), null);
});

/* ================= o blueprint multiformato ================= */

test("a SERP real desta keyword pede um PACOTE — e o raciocínio acompanha", () => {
  const bp = buildRadarMultimodalBlueprint({
    features: features(), youtubeUniverse: universo(), generatedAt: "2026-09-14T20:00:00.000Z",
  });

  assert.deepEqual(bp.observed.sources, ["GOOGLE_SERP", "YOUTUBE_SERP"]);
  assert.ok(bp.observed.youtubeLongForm > 0);
  assert.ok(bp.observed.youtubeShorts > 0);

  /*
   * TEXTO, VÍDEO LONGO E FORMATO CURTO disputando a mesma intenção. Responder
   * com uma peça só deixaria duas frentes inteiras sem resposta.
   */
  assert.equal(bp.recommended.editorialOutput, "MULTIFORMAT_PACKAGE");
  assert.ok(bp.recommended.rationale.length >= 4);
  for (const razao of bp.recommended.rationale) assert.ok(razao.length > 20);
  /*
   * A DECISÃO DIZ POR QUE FOI ESTA — e a frase decisiva é a do pacote.
   *
   * Sem ela, "produza um pacote multiformato" chegaria como veredito, e
   * discordar exigiria refazer a leitura das duas SERPs à mão.
   */
  assert.ok(
    bp.recommended.rationale.some(item => /deixaria duas frentes sem resposta/.test(item)),
    bp.recommended.rationale.join(" | "),
  );

  /* As peças, e cada uma com o que na SERP a sustenta. */
  const pecas = bp.recommended.pieces.map(item => item.piece);
  assert.ok(pecas.includes("ARTIGO"));
  assert.ok(pecas.includes("VIDEO_HERO"));
  assert.ok(pecas.includes("SHORT"));
  assert.ok(pecas.includes("SECAO_COMERCIAL"), "a SERP tem produtos");
  for (const peca of bp.recommended.pieces) assert.ok(peca.derivedFrom.length > 15, `peça sem lastro: ${peca.piece}`);

  /*
   * OS SHORTS NASCEM DAS PERGUNTAS, não de um número escolhido a dedo.
   *
   * Um "3 Shorts" fixo seria recomendação hardcoded; aqui cada Short responde
   * uma pergunta que a SERP mostrou.
   */
  const shorts = bp.recommended.pieces.filter(item => item.piece === "SHORT");
  assert.ok(shorts.length > 0);
  for (const short of shorts) assert.match(short.derivedFrom, /Pergunta observada no bloco/);

  assert.ok(bp.recommended.mustAnswer.length > 0, "o que a peça precisa responder");
  assert.ok(bp.recommended.mustCover.length > 0, "e o que precisa cobrir");
});

test("a saída editorial MUDA com os sinais — não é tabela fixa", () => {
  assert.deepEqual([...RADAR_EDITORIAL_OUTPUTS], ["ARTICLE", "YOUTUBE_VIDEO", "ARTICLE_WITH_VIDEO", "SHORTS", "PRODUCT_SECTION", "MULTIFORMAT_PACKAGE"]);

  const semNada = radarDecideEditorialOutput({ features: null, longForm: 0, shorts: 0 });
  assert.equal(semNada.output, "ARTICLE", "sem sinal, a peça é de texto");

  const f = features();
  /* Só texto e vídeo, sem formato curto: artigo com vídeo. */
  const semShort = radarDecideEditorialOutput({
    features: { ...f, contentFormatMap: { ...f.contentFormatMap, hasShortVideos: false } },
    longForm: 5, shorts: 0,
  });
  assert.equal(semShort.output, "ARTICLE_WITH_VIDEO");

  /* Sem disputa de texto, a resposta é audiovisual — e o formato segue a coorte. */
  const soVideo = radarDecideEditorialOutput({
    features: { ...f, contentFormatMap: { ...f.contentFormatMap, hasOrganic: false, hasVideo: false, hasShortVideos: false } },
    longForm: 9, shorts: 2,
  });
  assert.equal(soVideo.output, "YOUTUBE_VIDEO");
  const soShorts = radarDecideEditorialOutput({
    features: { ...f, contentFormatMap: { ...f.contentFormatMap, hasOrganic: false, hasVideo: false, hasShortVideos: false } },
    longForm: 2, shorts: 9,
  });
  assert.equal(soShorts.output, "SHORTS");

  /* Sinal comercial dominante sem disputa audiovisual. */
  const comercial = radarDecideEditorialOutput({
    features: { ...f, contentFormatMap: { ...f.contentFormatMap, hasOrganic: false, hasVideo: false, hasShortVideos: false } },
    longForm: 0, shorts: 0,
  });
  assert.equal(comercial.output, "PRODUCT_SECTION");

  /* E toda decisão vem com o porquê. */
  for (const decisao of [semNada, semShort, soVideo, soShorts, comercial]) {
    assert.ok(decisao.rationale.length > 0, `saída ${decisao.output} sem raciocínio`);
  }
});

test("uma fonte só ainda produz blueprint — e diz o que faltou", () => {
  /*
   * A AUSÊNCIA MUDA O PESO DA LEITURA, e precisa ser dita.
   *
   * Só com o Google não se sabe qual formato audiovisual vence; só com o
   * YouTube não se sabe o que o vídeo precisa cobrir.
   */
  const soGoogle = buildRadarMultimodalBlueprint({ features: features(), youtubeUniverse: [], generatedAt: "2026-09-14T20:00:00.000Z" });
  assert.deepEqual(soGoogle.observed.sources, ["GOOGLE_SERP"]);
  assert.ok(soGoogle.limitations.some(item => /Não há SERP do YouTube/.test(item)));
  assert.deepEqual(soGoogle.observed.crossSerpVideos.filter(item => item.signal === "CROSS_PLATFORM"), []);

  const soYoutube = buildRadarMultimodalBlueprint({ features: null, youtubeUniverse: universo(), generatedAt: "2026-09-14T20:00:00.000Z" });
  assert.deepEqual(soYoutube.observed.sources, ["YOUTUBE_SERP"]);
  assert.ok(soYoutube.limitations.some(item => /Não há SERP do Google/.test(item)));
  assert.deepEqual(soYoutube.recommended.mustAnswer, [], "sem Google não há perguntas observadas");
});

/* ======================== as proibições ======================== */

test("NUNCA COPIAR CONTEÚDO CONCORRENTE — e o markdown do AI Overview não vaza", () => {
  const f = features();

  /*
   * O AI Overview é o texto que o GOOGLE escreveu sintetizando concorrentes.
   * Guardá-lo inteiro convidaria a reaproveitá-lo. O que fica é o TAMANHO — a
   * prova de que existe síntese — e os domínios citados.
   */
  const serializado = JSON.stringify(f);
  assert.equal(/"markdown"/.test(serializado), false, "o texto da síntese não atravessa");
  assert.ok(typeof f.aiOverview.markdownLength === "number");

  /* E o blueprint não carrega título nem descrição de página concorrente. */
  const bp = buildRadarMultimodalBlueprint({ features: f, youtubeUniverse: universo(), generatedAt: "2026-09-14T20:00:00.000Z" });
  const recomendado = JSON.stringify(bp.recommended);
  for (const video of universo().slice(0, 20)) {
    assert.equal(recomendado.includes(video.title), false, `título de concorrente vazou: ${video.title}`);
  }
});

test("nenhuma peça é sugerida sem o bloco da SERP que a sustenta", () => {
  const f = features();

  /*
   * SEÇÃO COMERCIAL SEM PRODUTO NA SERP seria uma peça inventada — e a pessoa
   * escreveria recomendação de produto para uma intenção que não a pede.
   */
  const semProduto = buildRadarMultimodalBlueprint({
    features: { ...f, commercialSignals: { present: false, products: [] }, contentFormatMap: { ...f.contentFormatMap, hasProducts: false } },
    youtubeUniverse: universo(), generatedAt: "2026-09-14T20:00:00.000Z",
  });
  assert.equal(semProduto.recommended.pieces.some(item => item.piece === "SECAO_COMERCIAL"), false, "sem produto na SERP, sem seção comercial");

  /* E sem imagem na SERP, nenhuma peça de apoio visual. */
  const semImagem = buildRadarMultimodalBlueprint({
    features: { ...f, visualOpportunities: [], contentFormatMap: { ...f.contentFormatMap, hasImages: false } },
    youtubeUniverse: universo(), generatedAt: "2026-09-14T20:00:00.000Z",
  });
  assert.equal(semImagem.recommended.pieces.some(item => item.piece === "IMAGEM"), false);

  /* Com os blocos presentes, as duas voltam. */
  const completo = buildRadarMultimodalBlueprint({ features: f, youtubeUniverse: universo(), generatedAt: "2026-09-14T20:00:00.000Z" });
  assert.ok(completo.recommended.pieces.some(item => item.piece === "SECAO_COMERCIAL"));
  assert.ok(completo.recommended.pieces.some(item => item.piece === "IMAGEM"));
});

test("a coleta do Google passou a CAPTURAR os blocos — e não é código morto", async () => {
  const normalizador = await readFile(new URL("../lib/server/dataforseo-serp-normalizer.ts", import.meta.url), "utf8");

  /*
   * A camada só vale se ela entrar no snapshot na hora da coleta. Guardá-la
   * num módulo que ninguém chama deixaria os oito blocos morrendo na porta
   * exatamente como antes — só que com mais código.
   */
  assert.ok(normalizador.includes("serpFeatures: buildRadarSerpFeatureIntelligence(body)"), "o normalizador captura os blocos");
  assert.ok(normalizador.includes("from \"../radar/serp-features.ts\""));

  /*
   * E a captura lê o CORPO CRU — não o snapshot já normalizado, que é
   * justamente o que descartava os cinco blocos.
   */
  const captura = normalizador.slice(normalizador.indexOf("serpFeatures:"));
  assert.match(captura.slice(0, 60), /buildRadarSerpFeatureIntelligence\(body\)/);
});

test("PROVIDER_AUTO_RUNS = 0 — interpretar SERP não coleta nada", async () => {
  const fontes = await Promise.all([
    readFile(new URL("../lib/radar/serp-features.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/radar/multimodal-blueprint.ts", import.meta.url), "utf8"),
  ]);

  /*
   * Os dois módulos leem payload que já existe. Eles não importam nada que
   * alcance rede, worker ou transcrição — é o que torna a proibição uma
   * propriedade do código, e não uma promessa.
   */
  for (const fonte of fontes.map(item => item.replace(/\/\*[\s\S]*?\*\//g, " "))) {
    assert.equal(/fetch\(|XMLHttpRequest|from ["']\.\.\/server\//.test(fonte), false, "nenhuma chamada e nenhum módulo de servidor");
    assert.equal(/transcript|speech|download|worker/i.test(fonte), false);
  }

  assert.deepEqual(tentativasDeRede, []);
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
