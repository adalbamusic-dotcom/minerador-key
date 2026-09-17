import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  anchorRadarExtract,
  matchRadarVideoBriefs,
  radarCoverageFromExtracts,
  radarExtractRunFingerprint,
  RADAR_VIDEO_MATCHER_VERSION,
  radarMatchableSources,
  summarizeRadarBriefCoverage,
  type RadarFrozenBriefInput,
  type RadarMatchableSource,
} from "../lib/radar/video-brief-matching.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ======  VÍDEOS · GATE 3 — O CASAMENTO ENTRE PAUTA E CONTEÚDO  ========
 *
 * TRÊS CAMADAS, e a terceira nasce aqui:
 *
 *   FONTE      da MARCA.
 *   CONTEÚDO   o transcript é da FONTE, reutilizado por todos os artigos.
 *   CASAMENTO  o recorte é do ARTIGO, porque depende das PAUTAS dele.
 *
 * A mesma palestra serve a dez artigos com dez recortes diferentes, e nenhum
 * deles retranscreve nada.
 *
 * ================== O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ================
 *
 * Evidência sem âncora. Todo trecho sai de SEGMENTOS REAIS do transcript
 * gravado: o texto é a concatenação exata deles, os tempos são os deles. Uma
 * citação que alguém — pessoa ou modelo — afirme ter visto, sem apontar para
 * segmento existente, é descartada pelo portão e não chega ao banco.
 *
 * PROVIDER_CALLS = 0 · nenhuma transcrição, nenhum modelo, nenhuma rede.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const dominio = () => ler("../lib/radar/video-brief-matching.ts");
const rota = () => ler("../app/api/editorial/radar-video-matching/route.ts");
const persistencia = () => ler("../lib/server/radar-video-brief-extracts.ts");
const migracao = () => ler("../supabase/migrations/20260914100000_radar_video_brief_extracts.sql");
const painel = () => ler("../modules/radar/radar-r3-videos-panel.tsx");
const pagina = () => ler("../modules/radar/radar-page.tsx");

/* ============================ a fixture ============================== */

const pauta = (patch: Partial<RadarFrozenBriefInput> & { briefId: string }): RadarFrozenBriefInput => ({
  topic: "Rotina para pele oleosa", narrativePurpose: "Mostrar a ordem real dos passos",
  whatToLookFor: ["ordem dos passos"], relatedSectionId: null, relatedSectionTitle: null,
  questions: ["Qual a ordem dos passos da rotina?"], entities: ["ácido salicílico"],
  evidenceNeeded: "demonstração prática", priority: "HIGH",
  ...patch,
});

const fonte = (patch: Partial<RadarMatchableSource> & { videoSourceId: string }): RadarMatchableSource => ({
  displayName: "Palestra", textState: "TEXT_READY", selectedForArticle: true,
  registrationStatus: "REGISTERED", languageCode: "pt", processingVersion: 1,
  transcriptText: "", segments: [],
  ...patch,
});

/**
 * Uma palestra de verdade: ruído no começo, o assunto no meio, despedida no fim.
 *
 * VIDEOS 3.3 · ELA CRESCEU, e por um motivo: a m3 recorta JANELAS em volta da
 * ocorrência, não segmentos soltos. Numa fixture de cinco linhas toda janela
 * engolia a palestra inteira, e provas sobre recorte viravam provas sobre nada.
 * O bloco do retinol fica longe o bastante para ser outra passagem — que é o
 * que permite mostrar dois recortes diferentes do MESMO áudio.
 */
const PALESTRA = [
  { text: "bom dia a todos e obrigado pelo convite", startMs: 500, endMs: 3_000 },
  { text: "a ordem dos passos da rotina comeca pela limpeza", startMs: 8_140, endMs: 11_000 },
  { text: "depois vem o acido salicilico em concentracao baixa", startMs: 11_000, endMs: 14_200 },
  { text: "vamos falar de outra coisa agora", startMs: 30_000, endMs: 32_000 },
  { text: "o erro comum e usar acido salicilico todo dia", startMs: 40_000, endMs: 44_500 },
  { text: "vou responder algumas duvidas do publico", startMs: 50_000, endMs: 52_000 },
  { text: "a primeira veio la do fundo da sala", startMs: 52_000, endMs: 54_000 },
  { text: "sim eu tambem acho isso importante", startMs: 54_000, endMs: 56_000 },
  { text: "e ai a gente conversa com calma", startMs: 56_000, endMs: 58_000 },
  { text: "obrigado pela paciencia de voces", startMs: 58_000, endMs: 60_000 },
  { text: "agora sim o ultimo bloco de hoje", startMs: 60_000, endMs: 62_000 },
  { text: "muita gente erra com o retinol logo no comeco", startMs: 62_000, endMs: 65_000 },
  { text: "o erro comum e usar retinol na primeira semana", startMs: 65_000, endMs: 68_000 },
  { text: "ate a proxima e bom descanso", startMs: 70_000, endMs: 72_000 },
];

/**
 * A PAUTA CUJO ASSUNTO A PALESTRA REALMENTE COBRE.
 *
 * `pauta()` fala de "pele oleosa", e esta palestra nunca diz essas palavras —
 * na m3 isso vira `PARTIAL`, com o que falta nomeado. Para provar o caminho
 * `SUPPORTED` é preciso uma pauta cujo assunto o áudio cubra inteiro.
 */
const pautaCoberta = (patch: Partial<RadarFrozenBriefInput> & { briefId: string }): RadarFrozenBriefInput =>
  pauta({ topic: "Rotina de limpeza", relatedSectionTitle: null, ...patch });

/* ==========  A, B e C · QUEM PARTICIPA  ========================== */

test("VÍDEOS 3 · A, B e C — só fonte SELECIONADA e com TEXTO participa", () => {
  const selecionadaComTexto = fonte({ videoSourceId: "escolhida", segments: PALESTRA });
  const naoSelecionada = fonte({ videoSourceId: "solta", selectedForArticle: false, segments: PALESTRA });
  const selecionadaSemTexto = fonte({ videoSourceId: "sem-texto", textState: "QUEUED", segments: [] });
  const arquivada = fonte({ videoSourceId: "arquivada", registrationStatus: "ARCHIVED", segments: PALESTRA });

  const { elegiveis, semTexto } = radarMatchableSources([selecionadaComTexto, naoSelecionada, selecionadaSemTexto, arquivada]);
  assert.deepEqual(elegiveis.map(item => item.videoSourceId), ["escolhida"]);
  /* B · a fonte da biblioteca não selecionada nem aparece como pendência. */
  assert.deepEqual(semTexto.map(item => item.videoSourceId), ["sem-texto"], "só a selecionada sem texto é pendência");

  const resultado = matchRadarVideoBriefs({ briefs: [pauta({ briefId: "b1" })], sources: [selecionadaComTexto, naoSelecionada, selecionadaSemTexto, arquivada] });
  const fontesUsadas = new Set(resultado.coverage.flatMap(item => item.extracts.map(trecho => trecho.videoSourceId)));
  assert.deepEqual([...fontesUsadas], ["escolhida"], "nenhuma outra fonte entrou no recorte");
  /* C · e a selecionada SEM texto é dita, não silenciada. */
  assert.deepEqual(resultado.skippedWithoutText, ["sem-texto"]);
});

/* ==========  E e F · O ORIGINAL E OS TEMPOS  ==================== */

test("VÍDEOS 3 · E e F — o texto é o original e os tempos são do segmento", () => {
  const { coverage } = matchRadarVideoBriefs({
    briefs: [pauta({ briefId: "b1" })],
    sources: [fonte({ videoSourceId: "f1", segments: PALESTRA })],
  });
  const trechos = coverage[0].extracts;
  assert.ok(trechos.length >= 1);

  const primeiro = trechos[0];
  /*
   * OS TEMPOS SÃO EXATAMENTE OS DOS SEGMENTOS DA JANELA — nada arredondado.
   *
   * VIDEOS 3.3 · a janela abre em volta da ocorrência, porque um segmento de
   * sete palavras não carrega assunto e relação ao mesmo tempo. O que NÃO muda
   * é a origem: começo do primeiro segmento, fim do último, texto colado deles.
   */
  assert.deepEqual(primeiro.segmentIndexes, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(primeiro.startMs, 500, "o início é o do primeiro segmento da janela");
  assert.equal(primeiro.endMs, 54_000, "e o fim é o do último");
  assert.equal(primeiro.startMs, PALESTRA[primeiro.segmentIndexes[0]].startMs);
  assert.equal(primeiro.endMs, PALESTRA[primeiro.segmentIndexes[primeiro.segmentIndexes.length - 1]].endMs);
  /* E o texto é a concatenação exata deles, sem reescrita. */
  assert.equal(primeiro.originalText, primeiro.segmentIndexes.map(indice => PALESTRA[indice].text).join(" "));
  assert.match(primeiro.originalText, /a ordem dos passos da rotina comeca pela limpeza depois vem o acido salicilico/);

  /* Cada palavra do trecho veio do transcript, e nenhuma foi acrescentada. */
  const doTranscript = PALESTRA.map(item => item.text).join(" ");
  for (const palavra of primeiro.originalText.split(" ")) {
    assert.ok(doTranscript.includes(palavra), `"${palavra}" veio do transcript`);
  }

  /* O idioma original é preservado, e nada é traduzido. */
  assert.equal(primeiro.sourceLanguage, "pt");
  assert.equal(primeiro.provenance.anchoredToSegments, true);
  assert.equal(primeiro.provenance.processingVersion, 1);
});

/* ==========  G · O PORTÃO CONTRA TEMPO INVENTADO  =============== */

test("VÍDEOS 3 · G — nenhuma proposta sem âncora vira trecho", () => {
  const segments = PALESTRA;
  const base = {
    videoBriefId: "b1", videoSourceId: "f1",
    reasonForRelevance: "porque sim", supportType: "COVERS_TOPIC" as const, confidence: 0.9,
  };

  /*
   * AS QUATRO FORMAS DE NÃO ANCORAR — e as quatro são recusadas.
   *
   * É este portão que faz a diferença entre "um modelo pode propor trechos" e
   * "um modelo pode inventar evidência": ele existe antes de qualquer IA, e é
   * por ele que uma proposta teria de passar.
   */
  assert.equal(anchorRadarExtract({ segments, candidate: { ...base, segmentIndexes: [] }, sourceLanguage: "pt", processingVersion: 1 }), null, "lista vazia");
  assert.equal(anchorRadarExtract({ segments, candidate: { ...base, segmentIndexes: [99] }, sourceLanguage: "pt", processingVersion: 1 }), null, "índice fora da faixa");
  assert.equal(anchorRadarExtract({ segments, candidate: { ...base, segmentIndexes: [-1] }, sourceLanguage: "pt", processingVersion: 1 }), null, "índice negativo");
  assert.equal(anchorRadarExtract({ segments, candidate: { ...base, segmentIndexes: [0, 99] }, sourceLanguage: "pt", processingVersion: 1 }), null, "meia âncora também não passa");

  /*
   * E O TEXTO "CITADO" PELO PROPONENTE É IGNORADO.
   *
   * Mesmo ancorando em segmento real, o que vai para o banco é o texto do
   * SEGMENTO. Uma citação lembrada, parafraseada ou melhorada não sobrevive.
   */
  const ancorado = anchorRadarExtract({
    segments,
    candidate: { ...base, segmentIndexes: [1], reasonForRelevance: "o palestrante disse que a rotina tem sete passos mágicos" },
    sourceLanguage: "pt", processingVersion: 1,
  });
  assert.ok(ancorado);
  assert.equal(ancorado!.originalText, "a ordem dos passos da rotina comeca pela limpeza");
  assert.ok(!ancorado!.originalText.includes("sete passos mágicos"), "a citação do proponente não entra no texto");
  assert.equal(ancorado!.startMs, 8_140, "e o tempo é o do segmento");

  /* Segmento sem tempo derruba a proposta inteira, como no R1 do Speech. */
  const semTempo = [{ text: "existe", startMs: 0, endMs: 1 }, { text: "quebrado" } as never];
  assert.equal(anchorRadarExtract({ segments: semTempo, candidate: { ...base, segmentIndexes: [0, 1] }, sourceLanguage: null, processingVersion: 1 }), null);

  /*
   * E TRECHO QUE TERMINA ANTES DE COMEÇAR TAMBÉM NÃO PASSA.
   *
   * Um transcript corrompido — ou um provider que trocou os campos — produziria
   * uma janela impossível. Gravá-la daria a um trecho um tempo que o vídeo não
   * tem, e ele pareceria conferível.
   */
  const invertido = [{ text: "impossivel", startMs: 9_000, endMs: 2_000 }];
  assert.equal(
    anchorRadarExtract({ segments: invertido, candidate: { ...base, segmentIndexes: [0] }, sourceLanguage: null, processingVersion: 1 }),
    null,
    "fim antes do início é recusado",
  );

  /*
   * FONTE COM TEXTO E SEM SEGMENTO NÃO PRODUZ RECORTE.
   *
   * É o caso da transcrição que o humano forneceu, ou daquela cuja unidade de
   * tempo ficou indeterminada: o TEXTO existe e é preservado, mas não há onde
   * ancorar um recorte — e recortar sem âncora é o que este gate proíbe.
   */
  const semAncora = matchRadarVideoBriefs({
    briefs: [pauta({ briefId: "b1" })],
    sources: [fonte({ videoSourceId: "sem-tempo", segments: [], transcriptText: "a ordem dos passos da rotina comeca pela limpeza com acido salicilico" })],
  });
  assert.deepEqual(semAncora.coverage[0].extracts, [], "texto sem segmento não vira trecho");
  assert.equal(semAncora.coverage[0].state, "NOT_FOUND");

  /* E o domínio não tem por onde escrever um tempo: ele só lê dos segmentos. */
  const codigo = dominio().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/startMs:\s*\d/.test(codigo), "nenhum tempo literal é escrito");
  assert.ok(!/(interpolat|estimat|proporcion|Date\.now)/i.test(codigo), "nenhum tempo é derivado");
  assert.match(codigo, /startMs = Math\.min\(\.\.\.ancorados\.map\(item => item\.startMs\)\)/);
});

/* ==========  H e I · COBERTURA HONESTA  ========================= */

test("VÍDEOS 3 · H — pauta sem evidência é NOT_FOUND, e isso não é erro", () => {
  const { coverage } = matchRadarVideoBriefs({
    briefs: [pauta({ briefId: "sozinha", topic: "Fotoprotetor mineral", whatToLookFor: ["textura"], questions: ["Qual fotoprotetor mineral escolher?"], entities: ["óxido de zinco"] })],
    sources: [fonte({ videoSourceId: "f1", segments: PALESTRA })],
  });

  assert.equal(coverage[0].state, "NOT_FOUND");
  assert.deepEqual(coverage[0].extracts, []);
  assert.deepEqual(coverage[0].usefulSourceIds, []);
  assert.match(coverage[0].reason, /Nenhuma passagem atende o que esta pauta manda procurar/);
});

test("VÍDEOS 3 · I — tocar o assunto sem responder a pergunta permanece PARTIAL", () => {
  /*
   * O SEGMENTO CITA A ENTIDADE E NÃO ATENDE A GUIA. Chamar isso de SUPPORTED
   * venderia cobertura que não existe — e o Planejador leria como resolvido.
   *
   * VIDEOS 3.4 · "eu uso ácido salicílico há anos" toca o objetivo do título
   * (procedimento) e não cobre NENHUM aspecto da guia. Vira PARCIAL com zero
   * de um — e é isso que se lê na tela: há resposta de longe, e falta tudo o
   * que a pauta mandou procurar.
   */
  const soMenciona = [
    { text: "eu uso acido salicilico ha anos", startMs: 1_000, endMs: 3_000 },
    { text: "e mudou minha vida", startMs: 3_000, endMs: 5_000 },
  ];
  const { coverage } = matchRadarVideoBriefs({
    briefs: [pauta({ briefId: "b1" })],
    sources: [fonte({ videoSourceId: "f1", segments: soMenciona })],
  });

  assert.equal(coverage[0].state, "PARTIAL");
  assert.deepEqual(coverage[0].matchedCriteria, [], "nenhum aspecto da guia foi coberto");
  assert.deepEqual(coverage[0].missingCriteria, ["ordem dos passos"]);
  assert.match(coverage[0].reason, /0 de 1 aspecto\(s\) da guia encontrado\(s\), falta: ordem dos passos\./);

  /* Atender UM de dois critérios é PARTIAL, e o que falta é nomeado. */
  const duasCoisas = pautaCoberta({ briefId: "b2", whatToLookFor: ["ordem dos passos", "os sinais visiveis no rosto"] });
  const parcial = matchRadarVideoBriefs({ briefs: [duasCoisas], sources: [fonte({ videoSourceId: "f1", segments: PALESTRA })] });
  assert.equal(parcial.coverage[0].state, "PARTIAL");
  assert.deepEqual(parcial.coverage[0].matchedCriteria, ["ordem dos passos"]);
  assert.match(parcial.coverage[0].reason, /1 de 2 aspecto\(s\) da guia encontrado\(s\), falta: os sinais visiveis no rosto\./);

  /*
   * VIDEOS 3.3 · E A PAUTA CUJO ASSUNTO O ÁUDIO NÃO COBRE NÃO RECEBE NADA.
   *
   * `pauta()` fala de pele oleosa e esta palestra nunca diz isso. O assunto é
   * metade do portão, e sem ele não há trecho — nem com a guia inteira
   * atendida por outro assunto.
   */
  const assuntoDescoberto = matchRadarVideoBriefs({ briefs: [pauta({ briefId: "b4", topic: "Fotoprotetor mineral", questions: ["Qual fotoprotetor mineral escolher?"], entities: ["óxido de zinco"] })], sources: [fonte({ videoSourceId: "f1", segments: PALESTRA })] });
  assert.equal(assuntoDescoberto.coverage[0].state, "NOT_FOUND");

  /* E atender a guia inteira, sobre o assunto certo, é SUPPORTED. */
  const completa = matchRadarVideoBriefs({ briefs: [pautaCoberta({ briefId: "b3" })], sources: [fonte({ videoSourceId: "f1", segments: PALESTRA })] });
  assert.equal(completa.coverage[0].state, "SUPPORTED");
  assert.match(completa.coverage[0].reason, /Objetivo da pauta respondido em 1 trecho\(s\) · 1 de 1 aspecto\(s\) da guia encontrado\(s\) em 1 fonte\(s\)\./);
});

/* ==========  D e J · A FONTE É REUTILIZADA  ===================== */

test("VÍDEOS 3 · D e J — o mesmo transcript serve a dois artigos, sem retranscrever", () => {
  /*
   * O CASO QUE MOTIVOU A BIBLIOTECA. A mesma palestra, dois artigos com
   * pautas diferentes: dois recortes diferentes do MESMO texto.
   */
  const mesmaFonte = fonte({ videoSourceId: "palestra-x", segments: PALESTRA });

  const artigoA = matchRadarVideoBriefs({ briefs: [pauta({ briefId: "a1" })], sources: [mesmaFonte] });
  const artigoB = matchRadarVideoBriefs({
    briefs: [pauta({ briefId: "b1", topic: "Erros comuns com retinol", whatToLookFor: ["erro comum"], questions: [], entities: ["retinol"] })],
    sources: [mesmaFonte],
  });

  assert.ok(artigoA.coverage[0].extracts.length >= 1);
  assert.ok(artigoB.coverage[0].extracts.length >= 1);
  /* Os recortes são diferentes — as pautas mudaram, o áudio não. */
  assert.notDeepEqual(
    artigoA.coverage[0].extracts.map(item => item.startMs),
    artigoB.coverage[0].extracts.map(item => item.startMs),
  );
  /* E os dois apontam para a MESMA fonte, na mesma versão de transcript. */
  for (const trecho of [...artigoA.coverage[0].extracts, ...artigoB.coverage[0].extracts]) {
    assert.equal(trecho.videoSourceId, "palestra-x");
    assert.equal(trecho.provenance.processingVersion, 1);
  }

  /*
   * J · O CASAMENTO NÃO TRANSCREVE. Nem o domínio nem a rota conhecem
   * qualquer caminho de aquisição de texto.
   */
  const superficie = `${dominio()}${rota()}${persistencia()}`.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const proibido of ["youtube-transcript", "runSharedLongSpeech", "enqueueRadarVideoTextJob", "radar_video_text_acquisition", "yt-dlp", "uploadShared"]) {
    assert.ok(!superficie.includes(proibido), `o casamento não faz "${proibido}"`);
  }
  /* Ele LÊ o texto gravado, e é só isso que faz com transcript. */
  assert.match(rota(), /\.from\("radar_video_source_texts"\)\.select\(COLUNAS_TEXTO\)/);
});

/* ==========  §8 · IDEMPOTÊNCIA E HISTÓRIA  ===================== */

test("VÍDEOS 3 · §8 — mesmo material não recasa; material novo supera sem apagar", () => {
  const v1 = fonte({ videoSourceId: "f1", processingVersion: 1, segments: PALESTRA });
  const outra = fonte({ videoSourceId: "f2", processingVersion: 1, segments: PALESTRA });

  /* A impressão digital é do MATERIAL, não do relógio: estável e ordenada. */
  /*
   * VIDEOS 3.2 · A VERSÃO DO MATCHER ENTRA NA IDENTIDADE.
   *
   * A v1 aceitava vocabulário operacional como âncora e gravou dez trechos
   * falsos. Sem a versão aqui, a execução errada seria "reutilizada" para
   * sempre: mesmo bundle, mesmas fontes, mesmas versões de processamento.
   */
  assert.equal(radarExtractRunFingerprint([v1]), `m${RADAR_VIDEO_MATCHER_VERSION}:f1@v1`);
  assert.equal(radarExtractRunFingerprint([v1, outra]), radarExtractRunFingerprint([outra, v1]), "a ordem das fontes não muda a identidade");
  assert.equal(radarExtractRunFingerprint([]), `m${RADAR_VIDEO_MATCHER_VERSION}:sem-fonte`);
  assert.ok(RADAR_VIDEO_MATCHER_VERSION >= 2, "a correção do smoke negativo subiu a versão");

  /* Reprocessar o vídeo muda a impressão digital — e aí nasce execução nova. */
  const v2 = { ...v1, processingVersion: 2 };
  assert.notEqual(radarExtractRunFingerprint([v1]), radarExtractRunFingerprint([v2]));

  /* Fonte não selecionada não entra na identidade: ela não participou. */
  assert.equal(radarExtractRunFingerprint([v1, { ...outra, selectedForArticle: false }]), `m${RADAR_VIDEO_MATCHER_VERSION}:f1@v1`);

  /* A persistência reusa a execução quando a impressão digital é a mesma. */
  assert.match(persistencia(), /if \(atual\.run && atual\.run\.inputFingerprint === input\.inputFingerprint\) \{\s*\r?\n\s*return \{ runId: atual\.run\.runId, reused: true \};/);
  /*
   * E SUPERA A ANTERIOR EM VEZ DE SOBRESCREVÊ-LA — a marcação existe E É
   * ALCANÇÁVEL. Só afirmar que a linha está no arquivo deixaria passar um
   * `if (false)` acima dela: código morto casa com qualquer regex.
   */
  assert.match(persistencia(), /if \(atual\.run\) \{\s*\r?\n\s*const superada = await client/);
  assert.match(persistencia(), /superseded_at: new Date\(\)\.toISOString\(\), superseded_by: runId/);
  /* A leitura pega a execução MAIS NOVA: é o que resolve duas correntes. */
  assert.match(persistencia(), /\.order\("created_at", \{ ascending: false \}\)\s*\r?\n\s*\.limit\(1\)/);
  const codigo = persistencia().replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\.delete\(\)/.test(codigo), "nenhuma execução antiga é apagada");
  assert.ok(!/\.update\([^)]*original_text/.test(codigo), "nenhum trecho é reescrito");

  /* O banco também não permite: sem DELETE, e sem UPDATE nos trechos. */
  const sql = migracao().replace(/--[^\n]*/g, "");
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.radar_video_brief_extracts TO service_role;/);
  assert.ok(!/GRANT[^;]*\bDELETE\b[^;]*radar_video_brief_extracts/.test(sql), "nem o service_role apaga trecho");
  assert.ok(!/GRANT[^;]*\bUPDATE\b[^;]*ON TABLE public\.radar_video_brief_extracts/.test(sql), "nem reescreve");
});

/* ==========  M · INVESTIGAÇÃO NOVA NÃO SOBRESCREVE  ============ */

test("VÍDEOS 3 · M — o recorte é amarrado ao bundle congelado que o originou", () => {
  const sql = migracao().replace(/--[^\n]*/g, "");

  /*
   * SEM ESTA AMARRA O RECORTE FLUTUARIA: uma investigação nova mudaria as
   * pautas, e o trecho antigo passaria a responder a uma pergunta que ninguém
   * fez. A execução carrega o bundle E o hash dele.
   */
  assert.match(sql, /frozen_bundle_id text NOT NULL/);
  assert.match(sql, /frozen_bundle_hash text NOT NULL/);
  assert.match(sql, /ix_brief_extract_runs_current/);

  /*
   * E A ROTA RECUSA casar sem investigação congelada — a recusa existe E É
   * ALCANÇÁVEL. Afirmar só o código do erro deixaria passar um `if (false)`
   * acima dele, e o casamento cairia no blueprint vivo em silêncio.
   */
  assert.match(rota(), /if \(!pautas\) \{\s*\r?\n\s*return NextResponse\.json\(\{\s*\r?\n\s*success: false, code: "FROZEN_INVESTIGATION_REQUIRED",/);
  assert.match(rota(), /status: 409/);
  /*
   * VIDEOS_3.4.1 · A LEITURA DAS PAUTAS MUDOU DE CASA, NÃO DE REGRA.
   *
   * Ela saiu da rota e virou o read model que o clique e o F5 compartilham —
   * duas montagens do mesmo resultado era o defeito que aquele gate corrigiu.
   * O que se exige continua sendo o mesmo: bundle congelado, nunca blueprint.
   */
  const leitura = ler("../lib/server/radar-video-matching-read.ts");
  assert.match(leitura, /videoBriefSnapshots/);
  assert.match(rota(), /readRadarFrozenVideoBriefs\(context\.brandId, parsed\.data\.articleId\)/);
  const corpo = rota().replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!corpo.includes("blueprint?.videoBriefs"), "o blueprint vivo não é usado");
  assert.ok(!corpo.includes("videoBriefs)"), "nem por outro caminho");
});

/* ==========  K, L e N · TELA, RESET E PROVIDER  ================ */

test("VÍDEOS 3 · L — o RESET da Pesquisa não alcança fonte, transcript nem recorte", () => {
  const reset = ler("../lib/radar/radar-reset.ts");
  for (const tabela of ["radar_video_sources", "radar_video_source_texts", "radar_article_video_sources", "radar_video_brief_extracts", "radar_video_brief_extract_runs"]) {
    assert.ok(!reset.includes(tabela), `o reset não conhece ${tabela}`);
  }
});

test("VÍDEOS 3 · N — clicar numa pauta não chama nada", async () => {
  const tela = await montarRadar();
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");

  const { coverage } = matchRadarVideoBriefs({
    briefs: [pautaCoberta({ briefId: "b1" })],
    sources: [fonte({ videoSourceId: "f1", segments: PALESTRA })],
  });

  const acoes: unknown[][] = [];
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: "artigo-1",
    videoSources: {
      sources: [], texts: [],
      briefs: [{ briefId: "b1", topic: "Rotina para pele oleosa", narrativePurpose: "Mostrar a ordem", whatToLookFor: ["ordem"], priority: "HIGH", frozen: true }],
      briefsUnavailableReason: null, coverage, matching: false, investigationFinalized: true, frozenBriefCount: 1,
      loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
    },
    onLibraryAction: () => {}, onRunMatching: (...args: unknown[]) => acoes.push(args),
  } as never)));

  const antes = tentativasDeRede.length;

  /*
   * VIDEOS 3.1 · O RESULTADO NÃO PRECISA MAIS DE CLIQUE.
   *
   * Este teste guardava que ABRIR uma pauta não chamava nada. O seletor saiu
   * junto com a lista duplicada: o resultado de cada pauta aparece direto, o
   * que torna a garantia mais forte — não há interação alguma entre o
   * casamento gravado e a leitura dele.
   */
  assert.ok(tela.query("radar-videos-brief-extracts"), "o resultado aparece sem clique");
  assert.ok(tela.query("radar-videos-result-b1"), "e vem por pauta");
  assert.equal(tela.query("radar-videos-brief-b1"), null, "o seletor duplicado não existe mais");

  /* §5 · estado, fonte, trecho original e tempos — tudo por pauta. */
  assert.equal(tela.get("radar-videos-coverage-b1").textContent, "SUPPORTED");
  assert.match(tela.text(), /a ordem dos passos da rotina comeca pela limpeza/);
  assert.match(tela.text(), /cobre: ordem dos passos/, "o trecho diz qual critério da pauta ele sustenta");
  assert.match(tela.text(), /00:01–00:54/, "e o tempo mostrado é o da janela real");

  /* E ler o resultado não chama nada: nem provider, nem a ação de casar. */
  assert.equal(tentativasDeRede.length, antes, "ler o resultado não chama provider");
  assert.deepEqual(acoes, [], "ler o resultado não recasa");

  tela.destroy();
});

test("VÍDEOS 3 · K — o casamento vem do servidor, então sobrevive ao F5", () => {
  const texto = pagina();

  /* A tela NÃO calcula o casamento: ela recebe o que o servidor gravou. */
  assert.ok(!painel().includes("matchRadarVideoBriefs"), "o painel não casa nada");
  assert.ok(!texto.includes("matchRadarVideoBriefs"), "a página também não");
  /*
   * O CASAMENTO DEIXOU DE MORAR EM ESTADO REACT — RADAR_LIVE_UX_2.2 · §7.
   *
   * Ele vem do read-model da área, junto das fontes: uma autoridade só. Guardar
   * a resposta do POST num estado à parte criava uma segunda cópia, que
   * envelhecia sozinha até o próximo F5 discordar do clique.
   */
  assert.ok(!texto.includes("const [videoMatching, setVideoMatching] = useState"), "o casamento não é mais estado próprio");
  assert.match(texto, /coverage: casamentoLido \? \(casamento\.run/, "ele entra pelo read-model da área");
  assert.match(texto, /fetch\("\/api\/editorial\/radar-video-matching"/);

  /*
   * E A RESPOSTA USADA É A RELIDA DO BANCO, não a que foi calculada — pela
   * MESMA projeção que o carregamento usa (VIDEOS_3.4.1 · §4). Duas montagens
   * do mesmo resultado era o que fazia o F5 discordar do clique.
   */
  assert.match(rota(), /READBACK PELA MESMA PROJEÇÃO QUE O F5 USA/);
  assert.match(rota(), /const gravado = await loadRadarVideoBriefMatching\(\{/);
  assert.match(rota(), /coverage: gravado\.coverage,/);

  /* E a tela LÊ o casamento gravado ao abrir: é isso que sobrevive ao F5. */
  assert.match(texto, /new URLSearchParams\(\{ brandId: selectedBrandId, articleId: videosArticleId \}\)/);
  assert.match(texto, /fetch\(`\/api\/editorial\/radar-video-matching\?\$\{new URLSearchParams/);
  assert.match(texto, /cache: "no-store" as const, signal/, "a leitura da área nunca é servida de cache do navegador");
  /* A leitura acontece junto da área, no mesmo read-model — 2.2 · §7. */
  assert.match(texto, /load: carregarAreaVideos,/);

  /* Nenhum efeito de render casa pautas: a ação é humana. */
  for (const efeito of texto.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || []) {
    assert.ok(!/radar-video-matching|runVideoMatching\(/.test(efeito), "nenhum useEffect casa pautas");
  }
  assert.match(painel(), /onClick=\{\(\) => onRunMatching\?\.\(articleId\)\}/);

  /* A cobertura persistida é reclassificada pelo MESMO classificador. */
  assert.match(dominio(), /export function radarCoverageFromExtracts/);
  const coberturaGravada = radarCoverageFromExtracts({
    briefs: [pautaCoberta({ briefId: "b1" })],
    extracts: matchRadarVideoBriefs({ briefs: [pautaCoberta({ briefId: "b1" })], sources: [fonte({ videoSourceId: "f1", segments: PALESTRA })] }).coverage[0].extracts,
  });
  assert.equal(coberturaGravada[0].state, "SUPPORTED");
});

/* ==========  §6 · NADA É TRADUZIDO  ============================ */

test("VÍDEOS 3 · §6 — o trecho fica no idioma original, e a limitação é dita", () => {
  const emIngles = fonte({
    videoSourceId: "en", languageCode: "en",
    segments: [
      { text: "the order of the rotina steps starts with limpeza", startMs: 0, endMs: 4_000 },
      { text: "then comes acido salicilico", startMs: 4_000, endMs: 7_000 },
    ],
  });
  const { coverage } = matchRadarVideoBriefs({ briefs: [pauta({ briefId: "b1" })], sources: [emIngles] });
  const trecho = coverage[0].extracts[0];

  assert.ok(trecho, "a fonte em outro idioma participa");
  assert.equal(trecho.sourceLanguage, "en");
  /*
   * O TEXTO É O DOS SEGMENTOS QUE CASARAM, LETRA POR LETRA.
   *
   * VIDEOS 3.2 · os DOIS entram agora, e por motivos diferentes: o segundo pela
   * entidade ("acido salicilico"), o primeiro porque contém "rotina" — termo do
   * assunto, que sobreviveu ao inglês em volta. "order" e "steps" continuam sem
   * criar nada: eles são o vocabulário operacional que abria janelas entre
   * assuntos sem relação.
   *
   * VIDEOS 3.3 · E A RELAÇÃO TAMBÉM SE DIZ EM INGLÊS. "order" e "steps" não
   * criam assunto nenhum — continuam vocabulário operacional —, mas dizem O QUE
   * está sendo dito sobre "rotina", que é a segunda metade do portão. Por isso
   * a pergunta passa a estar respondida por este trecho.
   */
  assert.equal(trecho.originalText, "the order of the rotina steps starts with limpeza then comes acido salicilico", "o texto continua como veio");
  assert.deepEqual(trecho.segmentIndexes, [0, 1]);
  assert.equal(trecho.supportType, "MENTIONS_ENTITY");
  assert.ok(trecho.limitations.some(item => /en.*não foi traduzido/.test(item)), "a limitação é declarada");

  /*
   * E NADA NO CAMINHO TRADUZ, RESUME OU REORGANIZA.
   *
   * A varredura é de OPERAÇÃO, não de vocabulário: a palavra "traduzido"
   * aparece de propósito na limitação que o próprio trecho carrega — é a
   * declaração de que o texto NÃO foi traduzido. Proibir a palavra proibiria
   * dizer a verdade.
   */
  const codigo = `${dominio()}${rota()}${persistencia()}`.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const semTextoLiteral = codigo.replace(/"[^"\n]*"/g, '""').replace(/`[^`]*`/g, "``");
  for (const proibido of ["translate", "traduzir", "deepseek", "openai", "gemini", "generateText"]) {
    assert.ok(!semTextoLiteral.toLowerCase().includes(proibido.toLowerCase()), `nenhuma operação "${proibido}"`);
  }
  /*
   * "RESUMIR" NÃO É CONFERIDO POR PALAVRA — `summarizeRadarBriefCoverage`
   * resume COBERTURA, não texto, e proibir o substantivo acusaria a função
   * errada. A garantia contra resumo é estrutural, logo abaixo: o texto que sai
   * é concatenação de segmento, e não há outra origem possível.
   */
  /* Nenhum provider é importado em lugar nenhum deste caminho. */
  for (const linha of codigo.match(/^\s*import[^\n]*$/gm) || []) {
    assert.ok(!/deepseek|openai|gemini|translat/i.test(linha), `import proibido: ${linha.trim()}`);
  }
  /* E o texto que sai é só concatenação de segmento — nenhuma outra origem. */
  assert.match(dominio(), /originalText: ancorados\.map\(item => item\.text\.trim\(\)\)\.join\(" "\)/);
});

/* ==========  §14 · O QUE ESTE GATE NÃO FAZ  ==================== */

test("VÍDEOS 3 · §14 — nenhum artigo, nenhum ContentPlan, nenhuma pesquisa", () => {
  const superficie = `${dominio()}${rota()}${persistencia()}`;
  for (const proibido of ["ContentPlan", "content_plan", "createDefinitiveContentPlan", "ArticleDNA", "article_dna", "VideoEvidence", "plannerHandoff", "searchYouTube"]) {
    assert.ok(!superficie.includes(proibido), `o gate não toca "${proibido}"`);
  }

  /* E o resumo existe para a tela falar de cobertura, não de artigo. */
  const resumo = summarizeRadarBriefCoverage(
    matchRadarVideoBriefs({ briefs: [pautaCoberta({ briefId: "b1" }), pauta({ briefId: "b2", topic: "Fotoprotetor", questions: ["Qual escolher?"], entities: ["óxido de zinco"], whatToLookFor: ["textura"] })], sources: [fonte({ videoSourceId: "f1", segments: PALESTRA })] }).coverage,
  );
  assert.equal(resumo.briefs, 2);
  assert.equal(resumo.supported, 1);
  assert.equal(resumo.notFound, 1);
  assert.equal(resumo.sources, 1);
});

/* ==========  TENANT  =========================================== */

test("VÍDEOS 3 · o recorte herda o isolamento por marca", () => {
  const sql = migracao();
  for (const tabela of ["radar_video_brief_extracts", "radar_video_brief_extract_runs"]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${tabela} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${tabela} FROM PUBLIC, anon, authenticated`));
    assert.match(sql, new RegExp(`GRANT SELECT ON TABLE public\\.${tabela} TO authenticated`));
  }
  assert.equal((sql.match(/USING \(public\.can_access_brand\(brand_id\)\)/g) || []).length, 2);
  assert.ok(!/GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*TO authenticated/.test(sql));

  /* A FK é composta por marca, como todas as outras desta frente. */
  assert.match(sql, /FOREIGN KEY \(brand_id, video_source_id\)\s*\r?\n\s*REFERENCES public\.radar_video_sources \(brand_id, id\)/);
  assert.match(sql, /FOREIGN KEY \(brand_id, run_id\)\s*\r?\n\s*REFERENCES public\.radar_video_brief_extract_runs \(brand_id, id\)/);

  /* E a rota nunca confia na marca do corpo. */
  assert.match(rota(), /resolvePipelineContext\(\{ brandId: parsed\.data\.brandId, module: "radar", action: "edit" \}\)/);
  assert.ok(!/\.eq\("brand_id", parsed\.data\.brandId\)/.test(rota()));
});

/* ==========  PROVIDER  ========================================= */

test("VÍDEOS 3 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
