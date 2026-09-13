import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyRadarPublicTranscriptFailure,
  radarIsoDurationToMs,
  readRadarPublicTranscript,
  resolveRadarTranscriptUnit,
  RADAR_PUBLIC_TRANSCRIPT_PROVIDER,
  type RawYouTubeTranscriptItem,
} from "../lib/radar/youtube-public-transcript.ts";
import { attemptRadarPublicTranscript } from "../lib/server/youtube-public-transcript.ts";
import {
  RADAR_VIDEO_ACQUISITION_TODAY,
  RADAR_VIDEO_TEXT_METHODS,
  RADAR_VIDEO_TEXT_STATES,
  radarVideoAcquisitionCapability,
  radarVideoTextCanRequest,
} from "../lib/radar/video-text-acquisition.ts";

/*
 * ======  VÍDEOS · GATE 2.4 — TRANSCRIPT PÚBLICO, BEST EFFORT  =========
 *
 * O caso real: 25 palestras coladas, nenhuma mídia em mãos. Até aqui a única
 * saída era baixar 25 áudios à mão. Agora existe uma TENTATIVA — o endpoint
 * público de legendas do YouTube, o mesmo que o player usa.
 *
 * ELE NÃO É API OFICIAL, e o desenho inteiro parte disso:
 *
 *   · proveniência PRÓPRIA (`PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL`), nunca
 *     `OWNED_YOUTUBE_CAPTION` nem "veio da Data API";
 *   · metadado continua sendo da YouTube Data API, e só dela;
 *   · "não tem legenda" NÃO invalida a fonte;
 *   · nenhum fallback silencioso para downloader.
 *
 * O DEFEITO DO PACOTE QUE ESTE GATE TEVE DE RESOLVER: `parseTranscriptXml`
 * devolve MILISSEGUNDOS no caminho srv3 e SEGUNDOS no clássico, no mesmo campo
 * e sem marcador. Gravar direto poria uma palestra de 50 minutos nos primeiros
 * 3 segundos, com o texto certo e todo tempo errado.
 *
 * NENHUM TESTE CHAMA O YOUTUBE: o fetcher é injetado, e o sentinela confirma.
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
const processor = () => ler("../lib/server/local-worker/radar-video-text.ts");
const adaptador = () => ler("../lib/server/youtube-public-transcript.ts");
const dominio = () => ler("../lib/radar/youtube-public-transcript.ts");
const aditiva = () => ler("../supabase/migrations/20260913100000_radar_public_youtube_transcript.sql");
const painel = () => ler("../modules/radar/radar-r3-videos-panel.tsx");
const rotaTexto = () => ler("../app/api/editorial/radar-video-text/route.ts");
const pagina = () => ler("../modules/radar/radar-page.tsx");

/** Meia hora de palestra, em milissegundos — a medida oficial do fixture. */
const MEIA_HORA_MS = 30 * 60 * 1000;

const emMs: RawYouTubeTranscriptItem[] = [
  { text: "a pele oleosa", offset: 0, duration: 3_000, lang: "pt" },
  { text: "produz mais sebo", offset: 3_000, duration: 2_500, lang: "pt" },
  { text: "e isso tem causa hormonal", offset: 1_790_000, duration: 4_000, lang: "pt" },
];
const emSegundos: RawYouTubeTranscriptItem[] = emMs.map(item => ({ ...item, offset: item.offset / 1000, duration: item.duration / 1000 }));

/* ==========  C, D e E · OS SEGMENTOS E OS TEMPOS  ================ */

test("VÍDEOS 2.4 · C — cada segmento devolvido é preservado, na ordem do provider", () => {
  const leitura = readRadarPublicTranscript({ items: emMs, officialDurationMs: MEIA_HORA_MS });

  assert.equal(leitura.segments.length, 3, "nada é fundido nem descartado");
  assert.deepEqual(leitura.segments.map(item => item.text), ["a pele oleosa", "produz mais sebo", "e isso tem causa hormonal"]);
  /* E o texto completo também sai, porque ele não depende do tempo. */
  assert.equal(leitura.text, "a pele oleosa produz mais sebo e isso tem causa hormonal");
});

test("VÍDEOS 2.4 · D — o tempo devolvido é preservado, na unidade CERTA", () => {
  /*
   * O MESMO CONTEÚDO, NAS DUAS UNIDADES QUE O PACOTE PODE DEVOLVER.
   *
   * Os dois têm de produzir os MESMOS milissegundos. Se a resolução fosse um
   * palpite, uma das duas leituras sairia mil vezes errada — e com aparência
   * de medida.
   */
  const deMs = readRadarPublicTranscript({ items: emMs, officialDurationMs: MEIA_HORA_MS });
  const deSegundos = readRadarPublicTranscript({ items: emSegundos, officialDurationMs: MEIA_HORA_MS });

  assert.equal(deMs.unit, "MILLISECONDS");
  assert.equal(deSegundos.unit, "SECONDS");
  assert.deepEqual(deMs.segments, deSegundos.segments, "a mesma legenda, o mesmo tempo real");
  assert.deepEqual(deMs.segments[2], { text: "e isso tem causa hormonal", startMs: 1_790_000, endMs: 1_794_000 });
  assert.equal(deMs.hasTimestamps, true);

  /* A evidência é a duração OFICIAL, e o motivo fica escrito para auditoria. */
  assert.match(deMs.unitReason, /Lido em milissegundos, o transcript cobre \d+% da duração oficial/);
  assert.match(deSegundos.unitReason, /Lido em segundos, o transcript cobre \d+% da duração oficial/);
});

test("VÍDEOS 2.4 · E — tempo que não dá para conferir não é inventado", () => {
  /*
   * SEM DURAÇÃO OFICIAL não há como saber qual das duas unidades veio. Um
   * palpite aqui ficaria gravado como se fosse medida — é a mesma regra do R1
   * no Speech: sem os dois limites reais, o trecho não existe.
   */
  const semDuracao = readRadarPublicTranscript({ items: emMs, officialDurationMs: null });
  assert.equal(semDuracao.unit, "UNDETERMINED");
  assert.deepEqual(semDuracao.segments, [], "nenhum tempo é fabricado");
  assert.equal(semDuracao.hasTimestamps, false);
  /* E o TEXTO sobrevive: ele é a matéria-prima e não depende do tempo. */
  assert.equal(semDuracao.text, "a pele oleosa produz mais sebo e isso tem causa hormonal");
  assert.match(semDuracao.unitReason, /duração oficial do vídeo não está disponível/);

  /* Legenda que ultrapassa o vídeo nas duas leituras também é indeterminada. */
  const absurdo = resolveRadarTranscriptUnit({
    items: [{ text: "x", offset: 99_999_999, duration: 1_000 }],
    officialDurationMs: 60_000,
  });
  assert.equal(absurdo.unit, "UNDETERMINED");
  assert.match(absurdo.reason, /ultrapassa a duração oficial/);

  /* E vídeo curto demais, onde as duas leituras cabem, também. */
  const ambiguo = resolveRadarTranscriptUnit({ items: [{ text: "x", offset: 0, duration: 2 }], officialDurationMs: 10_000 });
  assert.equal(ambiguo.unit, "UNDETERMINED");
  assert.match(ambiguo.reason, /fração pequena demais/);
  /*
   * E NÃO EXISTE EMPATE ENTRE AS DUAS UNIDADES — é aritmética: elas estão a um
   * fator de 1000 de distância, então uma cobrir metade do vídeo implica a
   * outra cobrir 500 vezes. Um vídeo de 5,2s com legenda de 5 resolve limpo.
   */
  const curto = resolveRadarTranscriptUnit({ items: [{ text: "x", offset: 0, duration: 5 }], officialDurationMs: 5_200 });
  assert.equal(curto.unit, "SECONDS");

  /* Trecho sem número não derruba os outros: ele é descartado. */
  const misto = readRadarPublicTranscript({
    items: [...emMs, { text: "sem tempo", offset: Number.NaN, duration: Number.NaN }],
    officialDurationMs: MEIA_HORA_MS,
  });
  assert.equal(misto.segments.length, 3);
  assert.match(misto.text, /sem tempo$/, "mas o texto dele continua no original");
});

test("VÍDEOS 2.4 · D — a duração oficial é lida do formato da YouTube Data API", () => {
  assert.equal(radarIsoDurationToMs("PT30M"), MEIA_HORA_MS);
  assert.equal(radarIsoDurationToMs("PT1H2M30S"), (3600 + 150) * 1000);
  assert.equal(radarIsoDurationToMs("PT45S"), 45_000);
  /*
   * AUSÊNCIA, FORMATO DESCONHECIDO E DURAÇÃO ZERO DEVOLVEM `null`.
   *
   * Zero não é uma duração: aceito como número, ele passaria pela guarda de
   * "tem duração oficial" e faria a resolução da unidade dividir por zero.
   */
  for (const invalido of [null, undefined, "", "30 minutos", "P0D", "PT0S", "PT0M0S"]) {
    assert.equal(radarIsoDurationToMs(invalido as string), null, `"${invalido}" não vira duração`);
  }
});

/* ==========  F e G · IDIOMA E PROVENIÊNCIA  ===================== */

test("VÍDEOS 2.4 · F — o idioma é o que o YouTube declarou, e nada é traduzido", async () => {
  const leitura = readRadarPublicTranscript({ items: emMs, officialDurationMs: MEIA_HORA_MS });
  assert.equal(leitura.languageCode, "pt");

  /* Sem declaração de idioma é `null`: não se infere idioma do texto. */
  assert.equal(readRadarPublicTranscript({ items: emMs.map(({ lang: _lang, ...resto }) => resto), officialDurationMs: MEIA_HORA_MS }).languageCode, null);

  /*
   * ORIGINAL É ORIGINAL — §7. Nada de traduzir, resumir ou reorganizar: as
   * palavras que saem são exatamente as que entraram, na ordem que vieram.
   */
  const codigo = `${dominio()}${adaptador()}`.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["translate", "traduz", "summar", "resum", "gemini", "openai"]) {
    assert.ok(!codigo.toLowerCase().includes(proibido), `nenhuma operação "${proibido}"`);
  }
  assert.ok(!/\.sort\(/.test(codigo), "a ordem é a do provider");
});

test("VÍDEOS 2.4 · G — a proveniência é própria, e carrega o pacote e a versão", async () => {
  /* O método existe no domínio, com nome que não se confunde com a API. */
  assert.ok(RADAR_VIDEO_TEXT_METHODS.includes("PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL"));
  assert.equal(RADAR_PUBLIC_TRANSCRIPT_PROVIDER, "youtube-transcript");

  const tentativa = await attemptRadarPublicTranscript({
    videoId: "dQw4w9WgXcQ",
    officialDurationMs: MEIA_HORA_MS,
    fetcher: async () => emMs,
  });
  assert.equal(tentativa.outcome, "TEXT_READY");
  assert.equal(tentativa.provider, "youtube-transcript");
  /*
   * A VERSÃO É LIDA DO PACOTE INSTALADO, não escrita à mão.
   *
   * Um literal ficaria mentindo no dia seguinte a um `pnpm update` — e a
   * proveniência de um endpoint não oficial vale justamente por dizer QUAL
   * versão obteve aquele texto. A prova é cruzar com o que está em disco.
   */
  const instalada = (JSON.parse(ler("../package.json")) as { dependencies: Record<string, string> }).dependencies["youtube-transcript"];
  assert.ok(instalada, "o pacote está declarado no package.json");
  assert.equal(
    String((tentativa as { providerVersion: string }).providerVersion),
    instalada.replace(/^[^\d]*/, ""),
    "a versão reportada é a que está instalada",
  );
  /*
   * E A COMPARAÇÃO ACIMA NÃO BASTA SOZINHA: um literal `"1.3.1"` no código
   * passaria por ela hoje e só começaria a mentir depois do próximo `update` —
   * quando ninguém estivesse olhando. Aqui o MECANISMO é a afirmação.
   */
  assert.match(adaptador(), /await import\("youtube-transcript\/package\.json"/);
  const semComentarios = adaptador().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/["'`]\d+\.\d+\.\d+["'`]/.test(semComentarios), "nenhuma versão escrita à mão");

  /* E o worker grava pacote@versão, porque o endpoint muda entre versões. */
  assert.match(processor(), /provider: tentativa\.providerVersion \? `\$\{tentativa\.provider\}@\$\{tentativa\.providerVersion\}` : tentativa\.provider/);

  /*
   * O BANCO ACEITA O MÉTODO NOVO — por migration ADITIVA, porque a
   * 20260911180000 está APLICADA e não é editada.
   */
  const sql = aditiva();
  assert.match(sql, /'PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL'/);
  assert.match(sql, /'PUBLIC_TRANSCRIPT_UNAVAILABLE'/);
  for (const herdado of RADAR_VIDEO_TEXT_METHODS.filter(item => item !== "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL")) {
    assert.ok(sql.includes(`'${herdado}'`), `${herdado} continua aceito`);
  }
  for (const estado of RADAR_VIDEO_TEXT_STATES) {
    assert.ok(sql.includes(`'${estado}'`), `o estado ${estado} é aceito`);
  }
  /* Reexecutável, como toda migration desta frente passou a ser. */
  assert.equal((sql.match(/DROP CONSTRAINT IF EXISTS/g) || []).length, 3);
});

/* ==========  H e I · O TEXTO É DA FONTE  ======================== */

test("VÍDEOS 2.4 · H e I — texto pronto não busca de novo, e serve a todos os artigos", () => {
  const capacidade = radarVideoAcquisitionCapability({ kind: "YOUTUBE" });
  assert.equal(capacidade.method, "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL");

  /*
   * H · O ESTADO RECUSA, NÃO A TELA. Um segundo clique depois do F5, em outra
   * aba, encontra a mesma resposta — e o motivo diz que o texto é da FONTE.
   */
  const pronta = radarVideoTextCanRequest({ state: "TEXT_READY", capability: capacidade });
  assert.equal(pronta.allowed, false);
  assert.match(pronta.reason, /reutilizado por qualquer artigo que a selecione/);

  /*
   * I · E O WORKER TAMBÉM RECUSA, antes de qualquer chamada: a idempotência
   * não depende de a tela ter escondido o botão.
   */
  assert.match(processor(), /if \(linha\.text_state === "TEXT_READY"\) \{\s*\r?\n\s*return \{ status: "COMPLETED", payload: \{ idempotent: true/);

  /* O vínculo por artigo não entra nessa decisão: o texto é source-level. */
  const corpo = processor();
  const trecho = corpo.slice(corpo.indexOf("IDEMPOTÊNCIA A JUSANTE"), corpo.indexOf("const storedAudioUri"));
  assert.ok(!trecho.includes("article"), "a idempotência não conhece artigo");
});

/* ==========  J e K · FALHA NÃO INVALIDA A FONTE  ================ */

test("VÍDEOS 2.4 · J — 'não tem legenda' não é falha, e não invalida a fonte", async () => {
  /* As classes de erro do próprio pacote, distinguidas por significado. */
  for (const nome of ["YoutubeTranscriptDisabledError", "YoutubeTranscriptNotAvailableError", "YoutubeTranscriptNotAvailableLanguageError"]) {
    const erro = Object.assign(new Error("sem legenda"), { name: nome });
    const leitura = classifyRadarPublicTranscriptFailure(erro);
    assert.equal(leitura.outcome, "PUBLIC_TRANSCRIPT_UNAVAILABLE", `${nome} não é falha do sistema`);
    assert.match(leitura.reason, /A fonte continua registrada/);
  }

  /*
   * Rede e limite de requisições são outra coisa: cabe repetir — e o motivo
   * precisa dizer QUAL, senão "tente mais tarde" e "o endpoint quebrou" viram
   * a mesma frase para quem opera.
   */
  const demais = classifyRadarPublicTranscriptFailure(Object.assign(new Error("429"), { name: "YoutubeTranscriptTooManyRequestError" }));
  assert.equal(demais.outcome, "FAILED_RETRYABLE");
  assert.match(demais.reason, /excesso de requisições/);

  /*
   * E O ENDPOINT MUDAR TAMBÉM NÃO INVALIDA A FONTE. Ele não é oficial: quebra
   * é esperada, e transformá-la em `FAILED_FINAL` apagaria um cadastro
   * legítimo por um problema de fora.
   */
  const quebrou = classifyRadarPublicTranscriptFailure(new Error("Cannot read properties of undefined"));
  assert.equal(quebrou.outcome, "FAILED_RETRYABLE");
  assert.match(quebrou.reason, /A fonte continua registrada/);
  assert.notEqual(quebrou.outcome, "FAILED_FINAL" as never);

  /* Resposta VAZIA é ausência de legenda, não erro — e não grava texto vazio. */
  const vazia = await attemptRadarPublicTranscript({ videoId: "x", fetcher: async () => [] });
  assert.equal(vazia.outcome, "PUBLIC_TRANSCRIPT_UNAVAILABLE");

  /* O worker traduz isso em estado próprio, e em `BLOCKED` — não em retry. */
  assert.match(processor(), /state: "PUBLIC_TRANSCRIPT_UNAVAILABLE", reason: resultado\.reason/);
  assert.match(processor(), /status: "BLOCKED", payload: \{ code: "RADAR_PUBLIC_TRANSCRIPT_UNAVAILABLE"/);
  /* E a fonte NÃO é marcada como falha nem arquivada por isso. */
  const bloco = processor().slice(processor().indexOf("semLegenda(resultado)"), processor().indexOf("if (!resultado) {"));
  for (const proibido of ["FAILED_FINAL", "FAILED_RETRYABLE", "ARCHIVED", "registration_status"]) {
    assert.ok(!bloco.includes(proibido), `ausência de legenda não vira "${proibido}"`);
  }
});

test("VÍDEOS 2.4 · K e L — falha não dispara Speech sozinha, e não existe downloader", () => {
  const codigo = processor().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /*
   * K · NENHUM FALLBACK AUTOMÁTICO. Sem legenda pública, quem decide é o
   * humano: enviar áudio ou informar transcrição. O caminho do Speech continua
   * nascendo de `storedAudioUri`, que só existe depois de um upload.
   */
  const semLegenda = codigo.slice(codigo.indexOf("semLegenda(resultado)"), codigo.indexOf("if (!resultado) {"));
  for (const proibido of ["runSharedLongSpeech", "speechFromStoredAudio", "MEDIA_FILE_TO_SPEECH", "STORED_AUDIO_TO_SPEECH"]) {
    assert.ok(!semLegenda.includes(proibido), `ausência de legenda não aciona "${proibido}"`);
  }
  assert.match(codigo, /if \(!input\.storedAudioUri\) return null;/, "o Speech continua exigindo áudio preservado");

  /* L · NENHUM DOWNLOADER, em lugar nenhum desta frente. */
  /* Comentários citam os nomes proibidos para EXPLICAR a proibição: varre-se o CÓDIGO. */
  const semComentario = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const superficie = [codigo, dominio(), adaptador(), rotaTexto()].map(semComentario).join("").toLowerCase();
  for (const proibido of ["yt-dlp", "ytdl", "youtube-dl", "ffmpeg", "download(", "audiodownload"]) {
    assert.ok(!superficie.includes(proibido), `nenhum caminho "${proibido}"`);
  }
  /* E o package.json não ganhou nenhum deles. */
  const pacote = JSON.parse(ler("../package.json")) as { dependencies?: Record<string, string> };
  assert.ok(pacote.dependencies?.["youtube-transcript"], "o pacote da tentativa está declarado");
  for (const proibido of ["yt-dlp", "ytdl-core", "youtube-dl-exec", "@distube/ytdl-core"]) {
    assert.ok(!pacote.dependencies?.[proibido], `nenhuma dependência "${proibido}"`);
  }
});

/* ==========  O PROCESSOR, EXERCIDO DE VERDADE  ================== */

/**
 * UM SUPABASE FALSO QUE SÓ GUARDA O QUE PEDIRAM A ELE.
 *
 * O processor é injetável de propósito: cliente e adaptadores entram por
 * parâmetro. Ler o código dele prova que a linha existe; RODÁ-LO prova que ela
 * executa — e foram justamente as mutações que o texto não pegava que pediram
 * este fixture.
 */
function clienteFalso(fonte: Record<string, unknown>) {
  const estados: Array<{ text_state: string; text_state_reason: string | null }> = [];
  const cliente = {
    from(tabela: string) {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tabela === "radar_video_sources" ? fonte : null, error: null }) }) }),
        }),
        update: (valores: Record<string, unknown>) => {
          if (tabela === "radar_video_sources" && "text_state" in valores) {
            estados.push({ text_state: String(valores.text_state), text_state_reason: (valores.text_state_reason as string) ?? null });
          }
          return { eq: () => ({ eq: async () => ({ data: null, error: null }) }) };
        },
      };
    },
  };
  return { cliente, estados };
}

const jobDeVideo = (payload: Record<string, unknown> = {}) => ({
  id: "job-1", brand_id: "marca-1", brief_id: null, contribution_id: null,
  job_kind: "radar_video_text_acquisition" as const, video_source_id: "fonte-1",
  status: "PENDING_LOCAL_PROCESSING", attempts: 0, max_attempts: 5, payload, claimed_by: "worker",
});

const FONTE_YOUTUBE = {
  id: "fonte-1", brand_id: "marca-1", source_kind: "YOUTUBE",
  youtube_video_id: "dQw4w9WgXcQ", normalized_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  text_state: "REGISTERED", duration: "PT30M",
};

test("VÍDEOS 2.4 · o processor realmente usa a via pública, e grava a proveniência certa", async () => {
  const { createRadarVideoTextWorkerProcessor } = await import("../lib/server/local-worker/radar-video-text.ts");
  const { cliente, estados } = clienteFalso(FONTE_YOUTUBE);
  let pedidos = 0;

  const processar = createRadarVideoTextWorkerProcessor({
    actorUserId: "ator", client: cliente as never,
    adapters: { publicTranscript: async () => { pedidos += 1; return emMs; } },
  });

  const saida = await processar(jobDeVideo() as never);

  assert.equal(pedidos, 1, "a via pública foi realmente exercida");
  assert.equal(saida.status, "COMPLETED");
  const writeback = (saida as { writeback: Record<string, unknown> }).writeback;
  /* A PROVENIÊNCIA É A PRÓPRIA, e carrega pacote@versão. */
  assert.equal(writeback.sourceMethod, "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL");
  assert.match(String(writeback.provider), /^youtube-transcript@\d+\.\d+\.\d+/);
  /* Os tempos vieram resolvidos pela duração oficial da própria fonte. */
  assert.equal(writeback.hasTimestamps, true);
  assert.deepEqual((writeback.segments as unknown[])[2], { text: "e isso tem causa hormonal", startMs: 1_790_000, endMs: 1_794_000 });
  assert.equal(writeback.languageCode, "pt");
  assert.equal(writeback.originalAssetUri, null, "nada foi baixado nem preservado no Storage");
  /* E o caminho passou por PROCESSING, como qualquer outro. */
  assert.deepEqual(estados.map(item => item.text_state), ["PROCESSING"]);
});

test("VÍDEOS 2.4 · J no processor — sem legenda, a fonte fica válida e o job sai da fila", async () => {
  const { createRadarVideoTextWorkerProcessor } = await import("../lib/server/local-worker/radar-video-text.ts");
  const { cliente, estados } = clienteFalso(FONTE_YOUTUBE);

  const processar = createRadarVideoTextWorkerProcessor({
    actorUserId: "ator", client: cliente as never,
    adapters: {
      publicTranscript: async () => { throw Object.assign(new Error("sem legenda"), { name: "YoutubeTranscriptDisabledError" }); },
      /* Se o Speech for tocado sem áudio, este adaptador acusa. */
      speechFromStoredAudio: async () => { throw new Error("O SPEECH NÃO PODE SER CHAMADO AQUI"); },
    },
  });

  const saida = await processar(jobDeVideo() as never);

  /* BLOCKED tira da fila sem consumir tentativas — não é FAILED. */
  assert.equal(saida.status, "BLOCKED");
  assert.equal((saida.payload as { code: string }).code, "RADAR_PUBLIC_TRANSCRIPT_UNAVAILABLE");
  /* A fonte fica no estado próprio, e nunca em falha. */
  assert.deepEqual(estados.map(item => item.text_state), ["PROCESSING", "PUBLIC_TRANSCRIPT_UNAVAILABLE"]);
  assert.match(String(estados[1].text_state_reason), /A fonte continua registrada/);
  assert.ok(!estados.some(item => item.text_state.startsWith("FAILED")), "ausência de legenda não é falha");
});

test("VÍDEOS 2.4 · falha de rede volta para o RETRY do runner, e não vira 'sem legenda'", async () => {
  const { createRadarVideoTextWorkerProcessor } = await import("../lib/server/local-worker/radar-video-text.ts");
  const { cliente, estados } = clienteFalso(FONTE_YOUTUBE);

  const processar = createRadarVideoTextWorkerProcessor({
    actorUserId: "ator", client: cliente as never,
    adapters: { publicTranscript: async () => { throw Object.assign(new Error("429"), { name: "YoutubeTranscriptTooManyRequestError" }); } },
  });

  /*
   * LANÇAR É O CONTRATO COM O RUNNER: é ele que sabe esperar, contar tentativas
   * e aplicar backoff. Devolver `BLOCKED` aqui tiraria da fila algo que só
   * precisava de tempo — e a fonte ficaria marcada como "sem legenda" sendo que
   * a legenda nunca foi consultada.
   */
  await assert.rejects(() => processar(jobDeVideo() as never), /excesso de requisições/);
  assert.ok(!estados.some(item => item.text_state === "PUBLIC_TRANSCRIPT_UNAVAILABLE"), "rede não vira ausência de legenda");
});

test("VÍDEOS 2.4 · H no processor — fonte já pronta não chama o endpoint", async () => {
  const { createRadarVideoTextWorkerProcessor } = await import("../lib/server/local-worker/radar-video-text.ts");
  const { cliente, estados } = clienteFalso({ ...FONTE_YOUTUBE, text_state: "TEXT_READY" });
  let pedidos = 0;

  const processar = createRadarVideoTextWorkerProcessor({
    actorUserId: "ator", client: cliente as never,
    adapters: { publicTranscript: async () => { pedidos += 1; return emMs; } },
  });

  const saida = await processar(jobDeVideo() as never);
  assert.equal(saida.status, "COMPLETED");
  assert.equal((saida.payload as { idempotent: boolean }).idempotent, true);
  assert.equal(pedidos, 0, "nenhuma segunda chamada ao endpoint");
  assert.deepEqual(estados, [], "e o estado da fonte não é tocado");
});

test("VÍDEOS 2.4 · o áudio enviado vence a tentativa pública, dentro do processor", async () => {
  const { createRadarVideoTextWorkerProcessor } = await import("../lib/server/local-worker/radar-video-text.ts");
  const { cliente } = clienteFalso(FONTE_YOUTUBE);
  let publicas = 0;
  let speech = 0;

  const processar = createRadarVideoTextWorkerProcessor({
    actorUserId: "ator", client: cliente as never,
    adapters: {
      publicTranscript: async () => { publicas += 1; return emMs; },
      speechFromStoredAudio: async () => {
        speech += 1;
        return { transcriptText: "do áudio", languageCode: "pt-BR", segments: [], hasTimestamps: false, provider: "google_cloud_speech", originalAssetUri: "gs://b/a.mp3" };
      },
    },
  });

  const saida = await processar(jobDeVideo({ storedAudioUri: "gs://b/brand/x/radar/videos/f/a.mp3" }) as never);

  assert.equal(speech, 1);
  assert.equal(publicas, 0, "com áudio próprio, a tentativa não oficial nem é feita");
  assert.equal((saida as { writeback: Record<string, unknown> }).writeback.sourceMethod, "STORED_AUDIO_TO_SPEECH");
});

/* ==========  A, B e M · A AÇÃO É HUMANA  ======================== */

test("VÍDEOS 2.4 · A — a ação explícita cria um JOB, e o browser não transcreve", () => {
  const rota = rotaTexto();

  /* A rota enfileira e para: quem executa é o Local Worker. */
  assert.match(rota, /enqueueRadarVideoTextJob\(\{/);
  for (const proibido of ["YoutubeTranscript", "youtube-transcript", "fetchTranscript"]) {
    assert.ok(!rota.includes(proibido), `a rota não chama "${proibido}"`);
  }
  /* E o pacote só é importado no adaptador do servidor, dentro do worker. */
  assert.ok(!painel().includes("youtube-transcript"), "a tela não conhece o pacote");
  assert.ok(!pagina().includes("youtube-transcript"), "a página também não");
  assert.match(adaptador(), /const \{ YoutubeTranscript \} = await import\("youtube-transcript"\);/);

  /* Uma fila só: o tipo de job é o mesmo que o Gate 2 criou. */
  assert.match(processor(), /job\.job_kind !== "radar_video_text_acquisition"/);
});

test("VÍDEOS 2.4 · B e M — nada roda em mount, F5, seleção ou troca de filtro", () => {
  const tela = pagina();

  /* Nenhum efeito de render enfileira extração. */
  for (const efeito of tela.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || []) {
    assert.ok(!/radar-video-text|extractVideoText\(/.test(efeito), "nenhum useEffect extrai texto");
  }
  /* A extração nasce do clique, e só dele. */
  assert.match(painel(), /onClick=\{\(\) => onExtractVideoText\?\.\(articleId, fonte\.id\)\}/);

  /* Marcar, filtrar e trocar de artigo não passam perto da extração. */
  const painelSemComentario = painel().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const checkbox = painelSemComentario.slice(painelSemComentario.indexOf("radar-videos-check-"), painelSemComentario.indexOf("</label>"));
  assert.ok(!checkbox.includes("onExtractVideoText"), "o checkbox não extrai");
  const filtros = painelSemComentario.slice(painelSemComentario.indexOf('data-testid="radar-videos-filters"'), painelSemComentario.indexOf("radar-videos-bulk"));
  assert.ok(!filtros.includes("onExtractVideoText"), "o filtro não extrai");
});

/* ==========  N · RESET  ======================================== */

test("VÍDEOS 2.4 · N — o RESET da Pesquisa não alcança o transcript", () => {
  const reset = ler("../lib/radar/radar-reset.ts");
  for (const tabela of ["radar_video_source_texts", "radar_video_sources", "radar_article_video_sources"]) {
    assert.ok(!reset.includes(tabela), `o reset não conhece ${tabela}`);
  }
  /* E o texto vive em tabela própria, fora do payload do workflow. */
  assert.match(processor(), /kind: "radar_video_source_text"/);
});

/* ==========  A CAPACIDADE DECLARADA  =========================== */

test("VÍDEOS 2.4 · a tentativa é declarada best effort, não Connection", () => {
  /*
   * DIZER QUE É BEST EFFORT É PARTE DO CONTRATO. Ela entra na infraestrutura
   * com nome próprio — `publicTranscriptBestEffort` — em vez de se misturar às
   * Connections READY, que têm garantia e esta não tem.
   */
  assert.equal(RADAR_VIDEO_ACQUISITION_TODAY.publicTranscriptBestEffort, true);
  assert.equal(RADAR_VIDEO_ACQUISITION_TODAY.ownedChannelOAuth, false, "OAuth de canal continua sendo capacidade futura");

  const capacidade = radarVideoAcquisitionCapability({ kind: "YOUTUBE" });
  assert.match(capacidade.reason, /endpoint não oficial do YouTube/);
  assert.match(capacidade.reason, /pode não existir legenda/);
  assert.match(capacidade.reason, /enviar o áudio ou informar a transcrição/);

  /* E metadado continua sendo assunto da Data API, não do pacote. */
  const metadados = ler("../app/api/editorial/radar-video-metadata/route.ts");
  assert.ok(!metadados.includes("youtube-transcript"), "metadado não vem do endpoint não oficial");
  assert.match(metadados, /fetchSharedYouTubeMetadata/);
});

/* ==========  PROVIDER  ========================================= */

test("VÍDEOS 2.4 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
