import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_YOUTUBE_MIN_COHORT,
  RADAR_YOUTUBE_SCRIPT_DISCLAIMER,
  RADAR_YOUTUBE_TITLE_PATTERNS,
  buildRadarYoutubeBlueprint,
  radarPercentil,
  radarYoutubeCohort,
  radarYoutubeRange,
  radarYoutubeRecurrentTerms,
  radarYoutubeTitleOpportunities,
  radarYoutubeTitlePatterns,
} from "../lib/radar/youtube-blueprint.ts";
import {
  RadarYoutubeFinalizeError,
  freezeRadarYoutubeInvestigation,
  projectRadarYoutubeEvidence,
  resolveRadarFrozenRun,
} from "../lib/radar/youtube-evidence.ts";
import { buildRadarYoutubeUniverse, radarYoutubeFormatCohorts } from "../lib/radar/youtube-search-model.ts";
import {
  RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
  RADAR_YOUTUBE_PROVIDER_ENDPOINT,
  buildRadarYoutubeRunFingerprint,
  buildRadarYoutubeSearchRun,
  buildRadarYoutubeStartedRun,
  radarYoutubeResetPatch,
} from "../lib/radar/youtube-search-run.ts";
import { normalizeDataForSeoYoutubeResponse } from "../lib/server/dataforseo-youtube-operation.ts";

/*
 * ========  YOUTUBE_SEARCH_2 · O BLUEPRINT COMPETITIVO DA SERP  ========
 *
 * A pergunta deste gate é: o que a SERP JÁ COLETADA ensina sobre como competir?
 *
 * Nada é baixado, transcrito ou processado. As fontes são título, canal,
 * posição, duração, formato, visualizações, data e recorrência — e a suíte
 * roda inteira contra o payload REAL de `skincare para pele oleosa`.
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

const payloadReal = JSON.parse(
  await readFile(new URL("./fixtures/dataforseo-youtube-skincare-pele-oleosa.json", import.meta.url), "utf8"),
);

const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ============================== a bancada ============================== */

const CONSULTAS = [
  { queryId: "ytq:1", text: "skincare para pele oleosa", origin: "PRIMARY_KEYWORD", sourceRef: null, reason: "A keyword principal do artigo.", resultCount: 14, executed: true, failureReason: null, checkUrl: null, seResultsCount: 1476931, itemsCount: 114 },
];

const corridaReal = () => {
  const { results } = normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:1");
  return buildRadarYoutubeSearchRun({
    runId: "run-1", runVersion: 1,
    startedAt: "2026-09-14T18:51:00.000Z", startedBy: "usuario-1",
    fingerprint: buildRadarYoutubeRunFingerprint({ articleId: "artigo-1", articleDnaVersionId: "dna-1", queryIds: ["ytq:1"] }),
    provenance: {
      provider: "dataforseo", endpoint: RADAR_YOUTUBE_PROVIDER_ENDPOINT, blockDepth: RADAR_YOUTUBE_DEFAULT_BLOCK_DEPTH,
      locationCode: 2076, languageCode: "pt-BR", device: "mobile", os: "android",
      queriesRequested: 1, queriesSucceeded: 1, queriesFailed: 0, failures: [],
      collectedAt: "2026-09-14T18:51:07.000Z",
    },
    queries: CONSULTAS,
    results,
    universe: buildRadarYoutubeUniverse(results),
    limitations: [],
  });
};

const blueprintReal = (patch: { declaredIntent?: string | null; editorialTopics?: string[] } = {}) =>
  buildRadarYoutubeBlueprint({
    run: corridaReal(),
    declaredIntent: patch.declaredIntent === undefined ? "INFORMATIONAL" : patch.declaredIntent,
    editorialTopics: patch.editorialTopics || ["como controlar oleosidade da pele"],
    generatedAt: "2026-09-14T19:00:00.000Z",
  });

/* ===================== §1 · as fontes, e só elas ====================== */

test("§1 · SERP_ONLY — o blueprint sai da coleta, sem worker, transcript ou fala", async () => {
  const fontes = await Promise.all([
    readFile(new URL("../lib/radar/youtube-blueprint.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/radar/youtube-evidence.ts", import.meta.url), "utf8"),
  ]);

  /*
   * §14 · AS PROIBIÇÕES SÃO ESTRUTURAIS, não disciplina.
   *
   * Estes módulos não têm como chamar provider, worker ou transcrição: eles não
   * importam nada que faça isso. É o que torna WORKER_REQUIRED = NO uma
   * propriedade do código, e não uma promessa.
   */
  for (const fonte of fontes.map(semComentarios)) {
    assert.equal(/fetch\(|await fetch|XMLHttpRequest/.test(fonte), false, "nenhuma chamada de rede");
    assert.equal(/transcript|speech|whisper|download|worker|openai|anthropic/i.test(fonte), false, "nenhum worker, transcrição ou IA");
    assert.equal(/from ["']\.\.\/server\//.test(fonte), false, "domínio puro: não importa módulo de servidor");
  }

  /* E o que ele consome é exatamente o que a corrida entrega. */
  const blueprint = blueprintReal();
  assert.equal(blueprint.observed.universeSize, 13, "os 13 concorrentes do payload real");
  assert.equal(blueprint.runFingerprint, corridaReal().fingerprint.signature, "amarrado à coleta que o originou");
  assert.deepEqual(tentativasDeRede, []);
});

/* ============ §2 · as coortes, separadas até na estatística ============ */

test("§2 · LONG_FORM e SHORTS têm estatística própria — nunca somada", () => {
  const blueprint = blueprintReal();
  const { longForm, shorts } = blueprint.observed;

  assert.equal(longForm.format, "LONG_FORM");
  assert.equal(shorts.format, "SHORTS");
  assert.equal(longForm.videoCount, 6);
  assert.equal(shorts.videoCount, 7);
  assert.equal(longForm.videoCount + shorts.videoCount, blueprint.observed.comparableSize);

  /*
   * A PROVA DE QUE NÃO HOUVE MISTURA.
   *
   * As duas medianas de duração ficam em ordens de grandeza diferentes — e
   * qualquer valor "somado" cairia entre elas, descrevendo um formato que não
   * existe na SERP.
   */
  assert.ok(longForm.durationSeconds.median! > 400, `long-form mediana ${longForm.durationSeconds.median}`);
  assert.ok(shorts.durationSeconds.median! < 120, `shorts mediana ${shorts.durationSeconds.median}`);
  assert.ok(longForm.durationSeconds.p25! < longForm.durationSeconds.p75!, "a faixa long-form é uma faixa");

  /* Cada coorte descreve os SEUS canais e os SEUS padrões. */
  for (const coorte of [longForm, shorts]) {
    assert.ok(coorte.titlePatterns.every(padrao => padrao.count <= coorte.videoCount), "nenhum padrão conta além da coorte");
    assert.ok(coorte.dominantChannels.every(canal => canal.videos > 1), "dominante é quem repete");
  }
});

test("§2 e §7 · a faixa declara de quantos vídeos ela saiu", () => {
  const faixa = radarYoutubeRange([100, null, 200, 300, null]);
  assert.equal(faixa.sampleSize, 3, "os nulos não contam como zero");
  assert.equal(faixa.min, 100);
  assert.equal(faixa.max, 300);
  assert.equal(faixa.median, 200);

  /*
   * NULO NÃO É ZERO — e tratá-lo assim afundaria toda mediana de uma SERP em
   * que o provider deixou de informar visualizações.
   */
  const comZeros = radarYoutubeRange([0, 0, 100]);
  assert.notEqual(comZeros.median, faixa.median);
  assert.equal(radarYoutubeRange([]).sampleSize, 0);
  assert.equal(radarYoutubeRange([]).median, null, "sem dado, a faixa é nula — nunca 0");

  /* O percentil interpola: com 4 itens a mediana fica entre os dois do meio. */
  assert.equal(radarPercentil([10, 20, 30, 40], 0.5), 25);
  assert.equal(radarPercentil([10], 0.5), 10);
  assert.equal(radarPercentil([], 0.5), null);
});

test("§2 · coorte pequena demais CHEGA com a ressalva", () => {
  const universo = buildRadarYoutubeUniverse(normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:1").results);
  const coortes = radarYoutubeFormatCohorts(universo);

  const minúscula = radarYoutubeCohort({ format: "LONG_FORM", entries: coortes.longForm.slice(0, 2), collectedAt: "2026-09-14T18:51:07.000Z" });
  assert.equal(minúscula.videoCount, 2);
  assert.ok(minúscula.limitations.some(item => new RegExp(`abaixo de ${RADAR_YOUTUBE_MIN_COHORT}`).test(item)), minúscula.limitations.join(" | "));

  /* E a coorte vazia diz que está vazia, em vez de devolver faixa de nada. */
  const vazia = radarYoutubeCohort({ format: "SHORTS", entries: [], collectedAt: null });
  assert.equal(vazia.videoCount, 0);
  assert.equal(vazia.durationSeconds.median, null);
  assert.ok(vazia.limitations.some(item => /não devolveu nenhum vídeo/.test(item)));
});

/* ==================== §3 · padrões e termos de título =================== */

test("§3 · TITLE_PATTERNS — o que sai é o NOME do padrão, nunca o título copiado", () => {
  const blueprint = blueprintReal();
  const padroes = blueprint.observed.longForm.titlePatterns;

  assert.ok(padroes.length > 0, "a SERP real exibe padrões");
  assert.ok(padroes.every(padrao => padrao.count > 0), "padrão sem ocorrência não entra");
  assert.ok(padroes.every(padrao => padrao.share > 0 && padrao.share <= 1));

  /*
   * NADA AQUI CARREGA O TEXTO DO CONCORRENTE.
   *
   * Reproduzir o título dele e sugerir variação entregaria o material dele
   * como se fosse nosso. O que o blueprint expõe são rótulos do nosso
   * vocabulário e contagens.
   */
  const rotulos = new Set<string>(RADAR_YOUTUBE_TITLE_PATTERNS.map(item => item.label));
  for (const padrao of padroes) assert.ok(rotulos.has(padrao.label), `rótulo fora do vocabulário: ${padrao.label}`);

  const titulosReais = corridaReal().universe.map(item => item.title);
  const serializado = JSON.stringify(blueprint.observed.longForm) + JSON.stringify(blueprint.recommended);
  for (const titulo of titulosReais) {
    assert.equal(serializado.includes(titulo), false, `um título do concorrente vazou para a análise: ${titulo}`);
  }
});

test("§3 · TITLE_TERMS_RECURRENT — termo de um vídeo só não é padrão", () => {
  const termos = radarYoutubeRecurrentTerms([
    "Rotina de skincare para pele oleosa",
    "Skincare para pele oleosa e acneica",
    "Um titulo totalmente diferente",
  ]);

  const nomes = termos.map(item => item.term);
  assert.ok(nomes.includes("skincare"), nomes.join(","));
  assert.ok(nomes.includes("oleosa"));
  assert.equal(nomes.includes("totalmente"), false, "palavra de um título só não é recorrente");

  /* E palavra vazia do português não vira tema. */
  for (const vazia of ["para", "de", "com", "que"]) assert.equal(nomes.includes(vazia), false, `palavra vazia virou termo: ${vazia}`);
  assert.ok(termos.every(item => item.count > 1));
});

test("§3 · TITLE_OPPORTUNITIES são padrões AUSENTES — não títulos sugeridos", () => {
  const usados = radarYoutubeTitlePatterns(["Como fazer skincare passo a passo"]);
  const oportunidades = radarYoutubeTitleOpportunities(usados);

  assert.ok(oportunidades.length > 0);
  assert.equal(oportunidades.some(item => /passo a passo/i.test(item)), false, "padrão usado não vira oportunidade");
  assert.ok(oportunidades.some(item => /Comparação/.test(item)), oportunidades.join(" | "));
  /* Cada oportunidade explica POR QUE ela é uma. */
  assert.ok(oportunidades.every(item => /nenhum título da amostra/.test(item)));
});

/* ===================== §4 · a intenção audiovisual ===================== */

test("§4 · pode haver MAIS DE UM formato recorrente — e o empate aparece", () => {
  const blueprint = blueprintReal();
  const formatos = blueprint.observed.avFormats;

  assert.ok(formatos.length >= 2, `a SERP real mistura formatos: ${formatos.map(item => item.label).join(", ")}`);
  assert.ok(formatos.every(item => item.count > 0));
  /* Ordenados por recorrência: quem lê vê a hierarquia, e o empate quando existe. */
  for (let indice = 1; indice < formatos.length; indice += 1) {
    assert.ok(formatos[indice - 1].count >= formatos[indice].count, "a ordem é de recorrência");
  }
  assert.ok(formatos.every(item => item.share <= 1));
});

/* ============ §5 · observado e recomendado, sempre separados ============ */

test("§5 · OBSERVED_VS_RECOMMENDED_SEPARATED — cada recomendação carrega o sinal", () => {
  const blueprint = blueprintReal();

  assert.ok(blueprint.recommended.strategy.length >= 5, "as dimensões do §5 estão cobertas");
  for (const item of blueprint.recommended.strategy) {
    assert.ok(item.observedSignal.length > 10, `sinal vazio em ${item.dimension}`);
    assert.ok(item.recommendedStrategy.length > 10, `recomendação vazia em ${item.dimension}`);
    assert.notEqual(item.observedSignal, item.recommendedStrategy, `${item.dimension} funde observação e opinião`);
  }

  /*
   * A SEPARAÇÃO É ESTRUTURAL, não convenção de redação.
   *
   * `observed` e `recommended` são objetos distintos no contrato. Quem consome
   * não precisa ler prosa para saber o que foi coletado e o que foi derivado.
   */
  const dimensoes = blueprint.recommended.strategy.map(item => item.dimension);
  for (const esperada of ["Linguagem e nível técnico", "Promessa", "Posicionamento", "Foco e CTA", "Formato"]) {
    assert.ok(dimensoes.includes(esperada), `falta a dimensão ${esperada}`);
  }

  /* E a recomendação MUDA com o sinal — ela não é texto fixo. */
  const comercial = blueprintReal({ declaredIntent: "COMMERCIAL_INVESTIGATION" });
  const cta = (bp: typeof blueprint) => bp.recommended.strategy.find(item => item.dimension === "Foco e CTA")!;
  assert.notEqual(cta(comercial).recommendedStrategy, cta(blueprint).recommendedStrategy, "o CTA acompanha a intenção declarada");
  assert.match(cta(comercial).recommendedStrategy, /decisão/i);
  assert.match(cta(blueprint).recommendedStrategy, /continuidade/i);
});

/* ======================= §6 · o roteiro recomendado ====================== */

test("§6 · SCRIPT_RECOMMENDATION — e o aviso viaja com o dado", () => {
  const blueprint = blueprintReal();

  assert.ok(blueprint.recommended.script.length >= 4);
  for (const bloco of blueprint.recommended.script) {
    assert.ok(bloco.purpose.length > 10);
    /* Cada bloco diz DE ONDE veio; recomendação sem lastro é palpite. */
    assert.ok(bloco.derivedFrom.length > 5, `bloco sem origem: ${bloco.block}`);
  }

  /*
   * NUNCA DECLARAR QUE ESTA É A ESTRUTURA DOS CONCORRENTES — §6 é explícito.
   *
   * Sem transcript não sabemos a estrutura de vídeo nenhum. O aviso é campo do
   * contrato, não rodapé de tela: quem consumir em outro módulo recebe junto.
   */
  assert.equal(blueprint.recommended.scriptDisclaimer, RADAR_YOUTUBE_SCRIPT_DISCLAIMER);
  assert.match(blueprint.recommended.scriptDisclaimer, /não é a estrutura literal dos concorrentes/i);
  assert.match(blueprint.recommended.scriptDisclaimer, /não baixa nem transcreve/i);
});

test("§6 · SHORT não recebe roteiro de long-form encurtado", () => {
  const corrida = corridaReal();
  /* Uma SERP só de Shorts: a coorte líder passa a ser a curta. */
  const soShorts = { ...corrida, universe: corrida.universe.filter(item => item.universeClass === "COMPARABLE_SHORT") };
  const blueprint = buildRadarYoutubeBlueprint({ run: soShorts, declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z" });

  const blocos = blueprint.recommended.script.map(item => item.block);
  assert.deepEqual(blocos, ["GANCHO", "ENTREGA", "PROVA", "CORTE"], "o Short tem estrutura própria");
  assert.equal(blocos.includes("CONTEXTO"), false, "um Short não tem contexto e desenvolvimento");

  /* E a faixa de duração recomendada é a da coorte curta, não a somada. */
  assert.ok(blueprint.recommended.durationSecondsRange!.max < 180, JSON.stringify(blueprint.recommended.durationSecondsRange));
});

/* ==================== §7 · duração em faixa, não número ================== */

test("§7 · DURATION_RANGES — P25 a P75, e nunca um número mágico", () => {
  const blueprint = blueprintReal();
  const faixa = blueprint.recommended.durationSecondsRange!;

  assert.ok(faixa.min < faixa.max, "é faixa, não ponto");

  /*
   * A FAIXA SAI DA COORTE LÍDER — e na SERP real ela é a de Shorts.
   *
   * São 7 Shorts contra 6 long-form. Recomendar a partir do long-form aqui
   * mandaria mirar 13 minutos num terreno onde a maioria dos concorrentes
   * entrega em menos de dois — e somar as duas coortes produziria uma faixa
   * que nenhum dos formatos reconhece.
   */
  const lider = blueprint.observed.shorts.videoCount > blueprint.observed.longForm.videoCount
    ? blueprint.observed.shorts
    : blueprint.observed.longForm;
  assert.equal(lider.format, "SHORTS", `a coorte líder desta SERP é a de Shorts (${blueprint.observed.shorts.videoCount} × ${blueprint.observed.longForm.videoCount})`);
  assert.equal(faixa.min, lider.durationSeconds.p25, "o piso é o P25 da coorte líder");
  assert.equal(faixa.max, lider.durationSeconds.p75, "o teto é o P75 da coorte líder");

  /* E a faixa recomendada NÃO cai entre as duas medianas — o que seria a mistura. */
  const medianaLong = blueprint.observed.longForm.durationSeconds.median!;
  assert.ok(faixa.max < medianaLong, `a faixa recomendada (${faixa.max}s) invadiu o território do long-form (${medianaLong}s)`);

  /* Sem duração observável, não se inventa faixa. */
  const corrida = corridaReal();
  const semDuracao = { ...corrida, universe: corrida.universe.map(item => ({ ...item, durationSeconds: null })) };
  const sem = buildRadarYoutubeBlueprint({ run: semDuracao, declaredIntent: null, editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z" });
  assert.equal(sem.recommended.durationSecondsRange, null);
});

/* ================= §8 · força competitiva, não verdade ================= */

test("§8 · RECURRENCE_ANALYSIS — o sinal é explicável e não vira verdade editorial", () => {
  const corrida = corridaReal();
  /* A fixture real tem um vídeo repetido DENTRO de uma consulta só. */
  const blueprint = blueprintReal();
  assert.deepEqual(blueprint.observed.crossQueryVideos, [], "com uma consulta só, ninguém disputa duas frentes");

  /* Com o mesmo vídeo em duas consultas, ele aparece — com os motivos. */
  const duasConsultas = buildRadarYoutubeUniverse([
    ...normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:1").results,
    ...normalizeDataForSeoYoutubeResponse(payloadReal, "ytq:2").results,
  ]);
  const comRecorrencia = buildRadarYoutubeBlueprint({
    run: { ...corrida, universe: duasConsultas, queries: [...corrida.queries, { ...corrida.queries[0], queryId: "ytq:2", text: "rotina pele oleosa" }] },
    declaredIntent: "INFORMATIONAL", editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z",
  });

  assert.ok(comRecorrencia.observed.crossQueryVideos.length > 0);
  for (const video of comRecorrencia.observed.crossQueryVideos) {
    assert.ok(video.occurrenceCount > 1);
    /* O sinal se explica: sem motivos, "forte" seria veredito. */
    assert.ok(video.signalReasons.length >= 3, `sinal sem motivos: ${video.title}`);
    assert.ok(["FORTE", "MEDIO", "OBSERVAR"].includes(video.signalLevel));
  }
  /* Ordenado por frentes disputadas, não por views. */
  const ocorrencias = comRecorrencia.observed.crossQueryVideos.map(item => item.occurrenceCount);
  assert.deepEqual(ocorrencias, [...ocorrencias].sort((esquerda, direita) => direita - esquerda));
});

/* ========================== §9 · as lacunas ========================== */

test("§9 · COMPETITIVE_GAPS nascem da diferença entre o ArticleDNA e a SERP", () => {
  const comTopicoCoberto = blueprintReal({ editorialTopics: ["skincare para pele oleosa"] });
  const semCobertura = blueprintReal({ editorialTopics: ["protetor solar mineral para gestantes"] });

  const lacunaDeTopico = (bp: typeof semCobertura) => bp.recommended.gaps.filter(item => item.kind === "TOPICO_SEM_COBERTURA");
  assert.equal(lacunaDeTopico(comTopicoCoberto).length, 0, "tópico coberto não é lacuna");
  assert.equal(lacunaDeTopico(semCobertura).length, 1, "tópico ausente da SERP é oportunidade");
  assert.match(lacunaDeTopico(semCobertura)[0].statement, /protetor solar mineral para gestantes/);

  /*
   * TODA LACUNA CARREGA A EVIDÊNCIA QUE A SUSTENTA.
   *
   * "Oportunidade" sem o que a produziu é palpite — e ninguém consegue
   * discordar de um palpite sem refazer a leitura inteira.
   */
  for (const lacuna of semCobertura.recommended.gaps) {
    assert.ok(lacuna.evidence.length > 15, `lacuna sem evidência: ${lacuna.statement}`);
    assert.notEqual(lacuna.statement, lacuna.evidence);
  }

  /*
   * AUTORIDADE SE DECLARA NO TÍTULO **OU** NO NOME DO CANAL.
   *
   * A leitura da SERP real expôs o erro de olhar só o título: os canais que
   * dominam são "Dra. Marina Hayashida" e "Dr. Alan Ost", e a versão anterior
   * anunciava "pouca autoridade" com dois médicos no topo — mandando a marca
   * disputar um espaço especializado que já estava ocupado.
   */
  assert.equal(
    semCobertura.recommended.gaps.some(item => item.kind === "AUTORIDADE_ESCASSA"), false,
    "a SERP real tem médicos no topo: autoridade não é lacuna aqui",
  );
  const semMedicos = buildRadarYoutubeBlueprint({
    run: {
      ...corridaReal(),
      universe: corridaReal().universe.map(item => ({ ...item, title: "Video generico", channelName: "Canal Qualquer" })),
    },
    declaredIntent: null, editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z",
  });
  const lacunaDeAutoridade = semMedicos.recommended.gaps.find(item => item.kind === "AUTORIDADE_ESCASSA");
  assert.ok(lacunaDeAutoridade, "sem credencial nenhuma, a lacuna existe");
  assert.match(lacunaDeAutoridade.evidence, /título ou no nome do canal/);

  /* FORMATO AUSENTE: uma coorte vazia vira oportunidade declarada. */
  const corrida = corridaReal();
  const soLongForm = { ...corrida, universe: corrida.universe.filter(item => item.universeClass === "COMPARABLE_LONG_FORM") };
  const semShorts = buildRadarYoutubeBlueprint({ run: soLongForm, declaredIntent: null, editorialTopics: [], generatedAt: "2026-09-14T19:00:00.000Z" });
  assert.ok(semShorts.recommended.gaps.some(item => item.kind === "FORMATO_AUSENTE" && /Shorts/.test(item.statement)));
});

/* ==================== §10 e §11 · o blueprint final ==================== */

test("§10 e §11 · o blueprint serve aos três destinos sem mexer no primaryMode", () => {
  const padrao = blueprintReal();
  assert.equal(padrao.recommended.destination, "BOTH", "STANDALONE e ARTICLE_VIDEO por padrão");

  for (const destino of ["STANDALONE_YOUTUBE_VIDEO", "ARTICLE_VIDEO", "BOTH"] as const) {
    const bp = buildRadarYoutubeBlueprint({
      run: corridaReal(), declaredIntent: "INFORMATIONAL", editorialTopics: [],
      destination: destino, generatedAt: "2026-09-14T19:00:00.000Z",
    });
    assert.equal(bp.recommended.destination, destino);
    /* O destino é editorial: ele NÃO é o modo de pesquisa do artigo. */
    assert.equal(bp.observed.declaredIntent, "INFORMATIONAL");
  }

  /* O teto da leitura é dito SEMPRE, não só em amostra pequena. */
  assert.ok(padrao.limitations.some(item => /Nenhum vídeo foi baixado, assistido ou transcrito/.test(item)));
});

/* ========================= §12 · o congelamento ========================= */

test("§12 · FINALIZE congela consultas, amostra, coortes, blueprint e proveniência", () => {
  const run = corridaReal();
  const blueprint = blueprintReal();
  const congelada = freezeRadarYoutubeInvestigation({ run, blueprint, finalizedBy: "usuario-1", finalizedAt: "2026-09-14T19:05:00.000Z" });

  assert.equal(congelada.frozenVersion, 1);

  /*
   * ====== A CORRIDA VIROU REFERÊNCIA — RADAR_BLUEPRINT_CANONICAL_1 · §2 ======
   *
   * Este teste exigia a corrida COPIADA verbatim aqui dentro. A auditoria do
   * banco mostrou o preço: 126.656 dos 144.440 bytes da fotografia eram a
   * mesma corrida que já estava em `youtubeSearch`, byte a byte.
   *
   * A garantia que ele protegia — a fotografia não muda sozinha — continua
   * inteira: a corrida é append-only e a referência confere identidade E
   * assinatura antes de resolver. O que deixou de ser verdade é que congelar
   * exige copiar.
   */
  assert.equal(congelada.run, null, "a cópia não é mais feita");
  assert.equal(congelada.runRef?.runId, run.runId);
  assert.equal(congelada.runRef?.runFingerprint, run.fingerprint.signature);
  assert.equal(congelada.runRef?.universeSize, run.universe.length, "a contagem da amostra fica congelada");
  assert.equal(congelada.runRef?.endpoint, RADAR_YOUTUBE_PROVIDER_ENDPOINT);

  /* E a corrida real é alcançável pela referência, idêntica ao que foi coletado. */
  const resolvida = resolveRadarFrozenRun({ frozen: congelada, liveRun: run });
  assert.deepEqual(resolvida.queries, run.queries, "as consultas continuam conferíveis");
  assert.equal(resolvida.universe.length, run.universe.length);

  assert.equal(congelada.blueprint.observed.longForm.videoCount, blueprint.observed.longForm.videoCount);
  assert.ok(congelada.limitations.length > 0);

  /*
   * F5 E OUTRA SESSÃO LEEM A MESMA COISA porque leem a FOTOGRAFIA.
   *
   * Recalcular a cada abertura faria uma melhoria no vocabulário de padrões
   * mudar conceitos, lacunas e roteiro sob o mesmo carimbo de "finalizado".
   */
  const relida = JSON.parse(JSON.stringify(congelada));
  assert.deepEqual(relida, congelada, "a fotografia atravessa a serialização intacta");
});

test("§12 · FINALIZE recusa o que não dá para congelar", () => {
  const run = corridaReal();
  const blueprint = blueprintReal();
  const finalizar = (patch: Partial<typeof run>) => () => freezeRadarYoutubeInvestigation({
    run: { ...run, ...patch }, blueprint, finalizedBy: "usuario-1", finalizedAt: "2026-09-14T19:05:00.000Z",
  });

  /* Coleta em curso: a fotografia sairia de um estado que ainda vai mudar. */
  assert.throws(finalizar({ state: "COLLECTING" }), (erro: unknown) => {
    assert.ok(erro instanceof RadarYoutubeFinalizeError);
    assert.equal(erro.code, "youtube_run_not_collected");
    return true;
  });

  /* Coleta falha e universo vazio: fotografia de nada, com peso de investigação. */
  assert.throws(finalizar({ state: "COLLECTION_FAILED" }), (erro: unknown) => {
    assert.ok(erro instanceof RadarYoutubeFinalizeError);
    assert.equal(erro.code, "youtube_run_not_collected");
    assert.match(erro.message, /A coleta falhou/);
    return true;
  });
  assert.throws(finalizar({ universe: [] }), (erro: unknown) => {
    assert.ok(erro instanceof RadarYoutubeFinalizeError);
    assert.equal(erro.code, "youtube_universe_empty");
    return true;
  });

  /* E o blueprint TEM de ser o desta corrida. */
  assert.throws(
    () => freezeRadarYoutubeInvestigation({ run, blueprint: { ...blueprint, runId: "run-de-outra" }, finalizedBy: "u", finalizedAt: "2026-09-14T19:05:00.000Z" }),
    (erro: unknown) => {
      assert.ok(erro instanceof RadarYoutubeFinalizeError);
      assert.equal(erro.code, "youtube_blueprint_mismatch");
      return true;
    },
  );
});

test("§12 · zerar a pesquisa alcança o congelamento — e nada além do YouTube", () => {
  const patch = radarYoutubeResetPatch();
  /*
   * Deixar o blueprint congelado de pé depois do reset faria a tela mostrar
   * leitura competitiva de uma amostra que não existe mais.
   */
  assert.equal(patch.youtubeFrozenInvestigation, null);
  assert.equal(patch.youtubeSearch, null);
  for (const chave of Object.keys(patch)) assert.match(chave, /^youtube/i);
});

/* ===================== §13 · a camada de evidência ===================== */

test("§13 · RADAR_EVIDENCE_BUNDLE_YOUTUBE separa observado de recomendado", () => {
  const congelada = freezeRadarYoutubeInvestigation({
    run: corridaReal(), blueprint: blueprintReal(), finalizedBy: "usuario-1", finalizedAt: "2026-09-14T19:05:00.000Z",
  });
  const evidencia = projectRadarYoutubeEvidence(congelada);

  assert.equal(evidencia.researchMode, "YOUTUBE");
  assert.equal(evidencia.provenance.runId, "run-1");
  assert.equal(evidencia.provenance.finalizedAt, "2026-09-14T19:05:00.000Z");

  /* Os dois lados existem, e são objetos diferentes. */
  assert.ok(evidencia.observedEvidence.universeSize > 0);
  assert.ok(evidencia.recommendedStrategy.dimensions.length > 0);
  assert.ok(evidencia.recommendedStrategy.scriptDisclaimer.length > 20);

  /*
   * NENHUM TRANSCRIPT ATRAVESSA — §13.
   *
   * A camada não tem campo para ele. Um campo vazio esperando transcrição seria
   * convite a preenchê-lo com o que a área Vídeos guarda por outro caminho.
   */
  const chaves = JSON.stringify(evidencia);
  assert.equal(/transcript|legenda|caption|audio|speech/i.test(chaves), false, "transcript vazou para a evidência");

  /* E a coorte continua separada do outro lado também. */
  assert.notEqual(evidencia.observedEvidence.longForm.videoCount, evidencia.observedEvidence.shorts.videoCount);
  assert.ok(evidencia.observedEvidence.longForm.durationSeconds.median! > evidencia.observedEvidence.shorts.durationSeconds.median!);
});

/* ====================== §14 · as proibições ====================== */

test("§14 · PROVIDER_AUTO_RUNS = 0 — gerar blueprint não coleta nada", async () => {
  const pagina = semComentarios(await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8"));
  const finalize = pagina.slice(pagina.indexOf("const finalizeYoutubeInvestigation"), pagina.indexOf("const resetYoutubeSearch"));

  /*
   * FINALIZE É CÁLCULO SOBRE DADO QUE JÁ EXISTE.
   *
   * Ele recalcula o blueprint a partir da corrida gravada e congela. Se
   * dispusesse de uma chamada ao provider aqui, "finalizar" passaria a custar
   * dinheiro — e ninguém espera isso de um botão de fechamento.
   */
  assert.ok(finalize.includes("buildRadarYoutubeBlueprint("));
  assert.ok(finalize.includes("freezeRadarYoutubeInvestigation("));
  assert.equal(/fetch\(|executeDataForSeo|startRadarYoutubeRun|extractVideoText/i.test(finalize), false, "FINALIZE não chama provider nem worker");

  assert.deepEqual(tentativasDeRede, []);
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
