import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_PUBLIC_YOUTUBE_TEXT_LIMITATION,
  RADAR_VIDEO_ACQUISITION_TODAY,
  RADAR_VIDEO_TEXT_METHODS,
  RADAR_VIDEO_TEXT_STATES,
  radarVideoAcquisitionCapability,
  radarVideoMetadataCanRequest,
} from "../lib/radar/video-text-acquisition.ts";

/*
 * ======  VÍDEOS · GATE 2.1 — A INFRA GOOGLE QUE EXISTE  ==============
 *
 * A decisão arquitetural: operar sobre as Connections que a Plataforma já tem
 * — YouTube Data API, Cloud Storage e Speech-to-Text. Sem Gemini, sem
 * downloader, sem provider externo, sem raspagem.
 *
 * A FRONTEIRA QUE ISSO CRIA não é defeito do produto: `captions.list` e
 * `captions.download` exigem OAuth, e o download exige permissão sobre o
 * vídeo. Uma API key de metadados públicos não alcança nenhum dos dois.
 *
 * O que este gate garante é que a fronteira seja DITA, com os caminhos
 * legítimos ao lado — e nunca contornada em silêncio.
 *
 * PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const migracao = () => readFileSync(new URL("../supabase/migrations/20260911180000_radar_video_source_texts.sql", import.meta.url), "utf8");
const rotaMetadata = () => readFileSync(new URL("../app/api/editorial/radar-video-metadata/route.ts", import.meta.url), "utf8");
const persistencia = () => readFileSync(new URL("../lib/server/radar-video-text.ts", import.meta.url), "utf8");
const painel = () => readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");
const aquisicao = () => readFileSync(new URL("../lib/radar/video-text-acquisition.ts", import.meta.url), "utf8");

/* ==========  §5 · SÓ CAPACIDADES REAIS  ========================== */

test("VÍDEOS 2.1 · §5 — os métodos são exatamente os caminhos legítimos", () => {
  /*
   * GATE 2.4 acrescentou o QUINTO — e a lista continua fechada.
   *
   * `PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL` é o endpoint público de legendas do
   * YouTube: best effort, não oficial, com proveniência PRÓPRIA justamente
   * para nunca ser lido como se fosse a Data API ou legenda de dono do canal.
   */
  assert.deepEqual([...RADAR_VIDEO_TEXT_METHODS], [
    "USER_PROVIDED_TRANSCRIPT",
    "OWNED_YOUTUBE_CAPTION",
    "MEDIA_FILE_TO_SPEECH",
    "STORED_AUDIO_TO_SPEECH",
    "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL",
  ]);

  /*
   * O QUE FOI REMOVIDO, e não pode voltar por descuido: download de mídia e
   * provider externo de transcrição. A ausência é a decisão.
   */
  const codigo = aquisicao().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["MEDIA_DOWNLOAD", "LICENSED", "ytdl", "yt-dlp", "gemini", "scrap"]) {
    assert.ok(!codigo.toLowerCase().includes(proibido.toLowerCase()), `nenhum caminho "${proibido}"`);
  }
});

test("VÍDEOS 2.1 · §11 — a migration só aceita os métodos legítimos", () => {
  /*
   * AUDITADA ANTES DA APLICAÇÃO, como o §11 exige: a versão anterior aceitava
   * 'MEDIA_DOWNLOAD_THEN_SPEECH' e 'LICENSED_TRANSCRIPT_PROVIDER' no CHECK.
   * Aplicar assim teria gravado no banco a premissa de um caminho proibido.
   */
  const ddl = migracao().replace(/--[^\n]*/g, "");

  assert.match(ddl, /source_method text NOT NULL CHECK \(source_method IN \(/);
  /*
   * GATE 2.4: a via best effort entrou por migration ADITIVA — a 20260911180000
   * está APLICADA e não é editada. O enum do domínio tem de estar coberto pela
   * UNIÃO das duas, e é a união que este teste confere.
   */
  const aditiva = readFileSync(new URL("../supabase/migrations/20260913100000_radar_public_youtube_transcript.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
  const aceitos = `${ddl}\n${aditiva}`;
  for (const metodo of RADAR_VIDEO_TEXT_METHODS) {
    assert.ok(aceitos.includes(`'${metodo}'`), `o método ${metodo} é aceito`);
  }
  /* E a aditiva não invalida nenhum método que já era aceito. */
  for (const herdado of ["USER_PROVIDED_TRANSCRIPT", "OWNED_YOUTUBE_CAPTION", "MEDIA_FILE_TO_SPEECH", "STORED_AUDIO_TO_SPEECH"]) {
    assert.ok(aditiva.includes(`'${herdado}'`), `${herdado} continua aceito depois da aditiva`);
  }
  /*
   * COM A ASPA DE ABERTURA: `USER_PROVIDED_TRANSCRIPT'` contém
   * `PROVIDED_TRANSCRIPT'`, e a primeira versão deste teste acusava o nome novo
   * como se fosse o antigo. O literal SQL completo é o que distingue os dois.
   */
  for (const proibido of ["'MEDIA_DOWNLOAD_THEN_SPEECH'", "'LICENSED_TRANSCRIPT_PROVIDER'", "'PROVIDED_TRANSCRIPT'", "'OWNED_CAPTION'", "'SPEECH_FROM_STORED_AUDIO'"]) {
    assert.ok(!ddl.includes(proibido), `o método ${proibido} não sobreviveu`);
  }

  /* E a migration continua neutra: nada nela pressupõe download. */
  for (const proibido of ["ytdl", "yt-dlp", "download", "scrap", "gemini"]) {
    assert.ok(!ddl.toLowerCase().includes(proibido), `a migration não pressupõe "${proibido}"`);
  }
});

/* ==========  §12 · OS RESULTADOS ESPERADOS  ====================== */

test("VÍDEOS 2.1 · §12 — vídeo público de terceiro: metadados sim, legenda OFICIAL não", () => {
  /*
   * A FRONTEIRA MUDOU DE LUGAR NO GATE 2.4 — e este teste passou a guardar
   * onde ela está agora.
   *
   * O que continua VERDADEIRO: a API key de metadados públicos não alcança
   * `captions.download`, e legenda oficial de vídeo de terceiro continua
   * exigindo OAuth com permissão sobre o vídeo. Nada disso foi contornado.
   *
   * O que passou a existir: uma TENTATIVA best effort no endpoint público do
   * player — declarada como não oficial, com proveniência própria. Sem ela
   * ligada, a fronteira original reaparece intacta, e é assim que se prova que
   * ela não foi apagada: desligando a tentativa.
   */
  const semTentativa = radarVideoAcquisitionCapability({
    kind: "YOUTUBE",
    infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, publicTranscriptBestEffort: false },
  });
  assert.equal(semTentativa.available, false);
  assert.equal(semTentativa.method, null);
  assert.equal(semTentativa.reason, RADAR_PUBLIC_YOUTUBE_TEXT_LIMITATION);
  assert.match(semTentativa.reason, /YouTube Data API responde com metadados públicos/);
  assert.match(semTentativa.reason, /exige OAuth com permissão sobre o vídeo/);

  /* Com a tentativa ligada, a via é a best effort — NUNCA a de dono do canal. */
  const leitura = radarVideoAcquisitionCapability({ kind: "YOUTUBE" });
  assert.equal(leitura.method, "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL");
  assert.notEqual(leitura.method, "OWNED_YOUTUBE_CAPTION");
  assert.match(leitura.reason, /endpoint não oficial do YouTube/);

  /* YOUTUBE_METADATA_WITH_EXISTING_API = YES, para a MESMA fonte. */
  const metadados = radarVideoMetadataCanRequest({ kind: "YOUTUBE", hasMetadata: false });
  assert.equal(metadados.allowed, true, "metadado é alcançável mesmo quando o texto não é");

  /* OWNED_CAPTION_WITH_FUTURE_OAUTH = YES — as DUAS condições, não uma. */
  assert.equal(
    radarVideoAcquisitionCapability({ kind: "YOUTUBE", ownedByBrand: true, infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, ownedChannelOAuth: true } }).method,
    "OWNED_YOUTUBE_CAPTION",
  );
  /*
   * OAUTH SEM SER DONO NÃO ALCANÇA VÍDEO DE TERCEIRO — e continua não
   * alcançando. O que a fonte recebe é a tentativa best effort, que é outra
   * coisa e se chama outra coisa.
   */
  assert.notEqual(
    radarVideoAcquisitionCapability({ kind: "YOUTUBE", infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, ownedChannelOAuth: true } }).method,
    "OWNED_YOUTUBE_CAPTION",
    "OAuth sem ser dono não alcança legenda oficial de vídeo de terceiro",
  );
  assert.equal(
    radarVideoAcquisitionCapability({
      kind: "YOUTUBE",
      infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, ownedChannelOAuth: true, publicTranscriptBestEffort: false },
    }).available,
    false,
    "sem a tentativa pública, quem não é dono não tem via nenhuma",
  );

  /* MEDIA_TO_GCS_TO_SPEECH = YES */
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasUploadedMedia: true }).method, "MEDIA_FILE_TO_SPEECH");
  /* USER_PROVIDED_TRANSCRIPT = SUPPORTED */
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasProvidedTranscript: true }).method, "USER_PROVIDED_TRANSCRIPT");
});

/* ==========  §7 · METADADO NÃO É TEXTO  ========================= */

test("VÍDEOS 2.1 · §7 — obter metadados não inicia transcrição", () => {
  const rota = rotaMetadata();

  /* A rota usa a Connection do YouTube e mais nada. */
  assert.match(rota, /fetchSharedYouTubeMetadata\(\{/);
  for (const proibido of ["runSharedLongSpeech", "runSharedShortSpeech", "enqueueRadarVideoTextJob", "external_processing_jobs", "uploadShared"]) {
    assert.ok(!rota.includes(proibido), `a rota de metadados não faz "${proibido}"`);
  }

  /* Persiste o que o §7 lista, e nada além. */
  for (const campo of ["youtube_video_id", "video_title", "channel_id", "channel_title", "video_description", "published_at", "duration", "thumbnails", "metadata_fetched_at"]) {
    assert.ok(persistencia().includes(campo), `persiste ${campo}`);
  }

  /*
   * §8 · O ESTADO SÓ AVANÇA DE `REGISTERED` PARA `METADATA_READY`.
   *
   * Marcar `TEXT_READY` aqui seria a mentira mais cara possível: a coluna
   * "Conteúdo extraído" mostraria uma fonte pronta sem texto nenhum.
   */
  assert.match(persistencia(), /estadoAtual === "REGISTERED" \? "METADATA_READY" : estadoAtual/);
  assert.ok(!/proximoEstado = "TEXT_READY"/.test(persistencia()));

  /* E os dois estados existem no CHECK persistido. */
  const ddl = `${migracao().replace(/--[^\n]*/g, "")}\n${readFileSync(new URL("../supabase/migrations/20260913100000_radar_public_youtube_transcript.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "")}`;
  for (const estado of RADAR_VIDEO_TEXT_STATES) {
    assert.ok(ddl.includes(`'${estado}'`), `o estado ${estado} é aceito pelo banco`);
  }
  assert.ok(!ddl.includes("'ACQUISITION_UNAVAILABLE'"), "o nome antigo não sobreviveu");
});

test("VÍDEOS 2.1 · §7 — metadado já obtido não é pedido de novo", () => {
  assert.equal(radarVideoMetadataCanRequest({ kind: "YOUTUBE", hasMetadata: true }).allowed, false);
  assert.match(radarVideoMetadataCanRequest({ kind: "YOUTUBE", hasMetadata: true }).reason, /já foram obtidos/);
  /* Sem a Connection, a ação também não é oferecida. */
  assert.equal(
    radarVideoMetadataCanRequest({ kind: "YOUTUBE", hasMetadata: false, infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, youtubeMetadata: false } }).allowed,
    false,
  );
});

/* ==========  §9 · A UI DIZ A VERDADE  ========================== */

test("VÍDEOS 2.1 · §9 — a tela não oferece 'Extrair texto' sem capability", () => {
  const tela = painel();

  /*
   * O BOTÃO É CONDICIONAL, não desabilitado. Um botão cinza que recusa a cada
   * clique transforma uma fronteira conhecida em suspeita de defeito; a ação
   * simplesmente não existe quando não há caminho.
   */
  assert.match(tela, /\{pedido\.allowed && <button/);
  assert.match(tela, /data-testid=\{`radar-videos-extract-\$\{fonte\.id\}`\}/);

  /* As três ações do §9 existem, cada uma com a sua condição. */
  assert.match(tela, /\{metadados\.allowed && <button/, "Obter metadados");
  assert.match(tela, /data-testid=\{`radar-videos-provide-\$\{fonte\.id\}`\}/, "Informar transcrição");

  /* O motivo acompanha o "não", em vez de só o silêncio. */
  assert.match(tela, /\{!pedido\.allowed && !capacidade\.available && <p[^>]*>\{capacidade\.reason\}<\/p>\}/);

  /* E os metadados aparecem na primeira camada quando existem. */
  assert.match(tela, /\{leitura\.channel \? `.*\$\{leitura\.channel\}` : ""\}/);
  assert.match(tela, /\{leitura\.duration \? `.*\$\{leitura\.duration\}` : ""\}/);
});

/* ==========  §10 · O QUE NÃO FOI IMPLEMENTADO  ================= */

test("VÍDEOS 2.1 · §10 — nem Gemini, nem downloader, nem raspagem em lugar nenhum", () => {
  const superficie = [
    aquisicao(), persistencia(), painel(), rotaMetadata(),
    readFileSync(new URL("../lib/server/local-worker/radar-video-text.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../app/api/editorial/radar-video-text/route.ts", import.meta.url), "utf8"),
  ].join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const proibido of ["gemini", "ytdl", "yt-dlp", "youtube-dl", "timedtext", "scrap", "puppeteer", "playwright"]) {
    assert.ok(!superficie.toLowerCase().includes(proibido), `nenhuma superfície usa "${proibido}"`);
  }

  /*
   * E NADA A JUSANTE FOI ANTECIPADO — a varredura é sobre EXECUÇÃO.
   *
   * A tela diz "nada é traduzido, resumido nem organizado por pauta": proibir
   * a palavra proibiria justamente a frase que garante o comportamento. O que
   * não pode existir é a CHAMADA.
   */
  for (const proibido of ["translateText", "translationClient", "target_language", "targetLanguage", "VideoEvidence", "ContentPlan", "matchVideoBrief"]) {
    assert.ok(!superficie.includes(proibido), `nada de "${proibido}" nesta fase`);
  }
});

/* ==========  PROVIDER  ========================================= */

test("VÍDEOS 2.1 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
