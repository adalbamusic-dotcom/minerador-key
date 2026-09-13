import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRadarVideoDurableObjectKey } from "../lib/server/google-cloud/storage-operation.ts";
import { radarVideoAcquisitionCapability } from "../lib/radar/video-text-acquisition.ts";

/*
 * ======  VÍDEOS · GATE 2.2 — MÍDIA DA MARCA → GCS → SPEECH  ==========
 *
 * O caminho que a infraestrutura Google já sustenta ponta a ponta:
 *
 *   arquivo do humano → Cloud Storage (prefixo durável) → job → Local Worker
 *   → Speech-to-Text → transcript + tempos reais → TEXT_READY
 *
 * O QUE ESTE GATE CONSERTOU ANTES DE TUDO: o processor de vídeo existia,
 * estava testado e NÃO estava ligado ao worker. Um job de vídeo era reclamado
 * pelo processor do Especialista e voltava `BLOCKED`; a fonte ficava em
 * `QUEUED` para sempre. O teste que faltava não era sobre o processor existir —
 * era sobre ele estar LIGADO.
 *
 * PROVIDER_CALLS = 0 · STORAGE_WRITES = 0 · nada é executado aqui.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const rotaMedia = () => readFileSync(new URL("../app/api/editorial/radar-video-media/route.ts", import.meta.url), "utf8");
const worker = () => readFileSync(new URL("../scripts/local-worker.mts", import.meta.url), "utf8");
const processor = () => readFileSync(new URL("../lib/server/local-worker/radar-video-text.ts", import.meta.url), "utf8");
const storage = () => readFileSync(new URL("../lib/server/google-cloud/storage-operation.ts", import.meta.url), "utf8");
const migracao = () => readFileSync(new URL("../supabase/migrations/20260911180000_radar_video_source_texts.sql", import.meta.url), "utf8");
const painel = () => readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");

const BRAND = "11111111-1111-4111-8111-111111111111";
const SOURCE = "22222222-2222-4222-8222-222222222222";

/* ==========  A e B · O PREFIXO DURÁVEL  ========================== */

test("VÍDEOS 2.2 · A e B — o upload vai para o prefixo durável, nunca temporary/", () => {
  const chave = createRadarVideoDurableObjectKey({ brandId: BRAND, videoSourceId: SOURCE, fileName: "original.mp3", objectId: "33333333-3333-4333-8333-333333333333" });

  assert.ok(chave.startsWith(`brand/${BRAND}/radar/videos/${SOURCE}/`), "A · o caminho é o do §4");
  assert.ok(!chave.startsWith("temporary/"), "B · e não é o transitório");

  /* O upload durável é função própria, e usa a chave durável. */
  assert.match(storage(), /export async function uploadRadarVideoDurableObject/);
  const corpo = storage().slice(storage().indexOf("export async function uploadRadarVideoDurableObject"), storage().indexOf("export async function checkTemporaryMediaObject"));
  assert.match(corpo, /createRadarVideoDurableObjectKey\(\{/);
  assert.ok(!corpo.includes("createBrandScopedMediaObjectKey"), "não cai no caminho transitório");

  /*
   * O BANCO TAMBÉM RECUSA `temporary/`. Sem esta trava, um envio por outro
   * caminho gravaria um URI descartável como se fosse o original preservado —
   * e só apareceria quando o objeto sumisse.
   */
  const ddl = migracao().replace(/--[^\n]*/g, "");
  assert.match(ddl, /CHECK \(uploaded_media_uri IS NULL OR uploaded_media_uri LIKE 'gs:\/\/%\/brand\/%\/radar\/videos\/%'\)/);
});

/* ==========  C · UM JOB POR FONTE  =============================== */

test("VÍDEOS 2.2 · C — o envio cria um job, e o segundo encontra o primeiro", () => {
  const rota = rotaMedia();

  assert.match(rota, /enqueueRadarVideoTextJob\(\{/);
  assert.match(rota, /method: "MEDIA_FILE_TO_SPEECH"/);
  assert.match(rota, /storedAudioUri: enviado\.result\.uri/);

  /* Fonte já em andamento ou pronta não aceita novo envio. */
  assert.match(rota, /if \(linha\.text_state === "QUEUED" \|\| linha\.text_state === "PROCESSING"\)/);
  assert.match(rota, /if \(linha\.text_state === "TEXT_READY"\)/);
  /* E a duplicata da fila continua sendo reuso, não erro. */
  assert.match(rota, /if \(enfileirado\.duplicate\)/);

  /*
   * A MÍDIA É GRAVADA ANTES DO JOB — e a ordem importa.
   *
   * Se o job nascesse primeiro, o worker leria uma fonte sem mídia e
   * bloquearia por falta de caminho, com o arquivo já no Storage.
   */
  const posicaoDaMidia = rota.indexOf("uploaded_media_uri: enviado.result.uri");
  const posicaoDoJob = rota.indexOf("enqueueRadarVideoTextJob({");
  /*
   * PRESENÇA ANTES DE ORDEM.
   *
   * `indexOf` devolve -1 para string ausente, e `-1 < N` é verdadeiro: sem
   * esta guarda, apagar a gravação da mídia passaria como se a ordem estivesse
   * correta. A ausência precisa falhar tão alto quanto a inversão.
   */
  assert.ok(posicaoDaMidia > 0, "a mídia é gravada na fonte");
  assert.ok(posicaoDoJob > 0, "o job é criado");
  assert.ok(posicaoDaMidia < posicaoDoJob, "a identidade da mídia precede o job");
});

/* ==========  D · O WORKER EXISTENTE PROCESSA  =================== */

test("VÍDEOS 2.2 · D — o processor de vídeo está LIGADO ao worker", () => {
  const entrypoint = worker();

  /*
   * ESTAR INJETÁVEL E ESTAR INJETADO SÃO COISAS DIFERENTES.
   *
   * Esta é a asserção que faltava no Gate 2: o processor existia e era
   * testado, e o entrypoint injetava só o do Especialista. Um job de vídeo
   * voltava `BLOCKED` e a fonte ficava em `QUEUED` para sempre.
   */
  assert.match(entrypoint, /import \{ createRadarVideoTextWorkerProcessor \}/);
  assert.match(entrypoint, /const video = createRadarVideoTextWorkerProcessor\(\{ actorUserId, client \}\)/);
  assert.match(entrypoint, /job\.job_kind === "radar_video_text_acquisition" \? video\(job\) : especialista\(job\)/);

  /* E continua sendo UM runner: o roteamento é por tipo, não por fila. */
  assert.equal((entrypoint.match(/runLocalWorkerOnce\(/g) || []).length, 1, "um runner só");
  assert.match(entrypoint, /const especialista = createRadarExpertContributionWorkerProcessor/, "o caminho do Especialista continua");
});

/* ==========  E, G e H · O SPEECH E OS TEMPOS  =================== */

test("VÍDEOS 2.2 · E, G e H — o Speech recebe a mídia e os tempos são os dele", () => {
  const codigo = processor();

  /* O Speech recebe um `gs://`, nunca uma URL do YouTube. */
  assert.match(codigo, /runSharedLongSpeech\(\{/);
  assert.match(codigo, /gcsUri: input\.storedAudioUri/);
  assert.ok(!/youtube\.com|youtu\.be/i.test(codigo), "nenhuma URL do YouTube chega ao Speech");

  /* G · os tempos são pedidos e repassados como vieram. */
  assert.match(codigo, /enableWordTimeOffsets: true/);
  assert.match(codigo, /segments: fala\.result\.segments/);
  /* H · e o estado do tempo é o que o provider disse, não um palpite. */
  assert.match(codigo, /hasTimestamps: fala\.result\.timestampState === "TIMESTAMPED"/);
  assert.ok(!/startMs: \d|proporcion|estimat|interpolat/i.test(codigo), "nenhum tempo é fabricado");

  /* MEDIA_FILE_TO_SPEECH e STORED_AUDIO_TO_SPEECH terminam no mesmo lugar. */
  assert.match(codigo, /method === "STORED_AUDIO_TO_SPEECH" \|\| method === "MEDIA_FILE_TO_SPEECH"/);
});

/* ==========  F, I e L · O QUE FICA PRESERVADO  ================== */

test("VÍDEOS 2.2 · F, I e L — original, idioma e proveniência", () => {
  const codigo = processor();
  const ddl = migracao().replace(/--[^\n]*/g, "");

  /* F · o transcript vai para a tabela própria, com o URI do artefato. */
  assert.match(codigo, /transcriptText: resultado\.transcriptText/);
  assert.match(codigo, /originalAssetUri: resultado\.originalAssetUri/);
  /* I · o idioma que o provider devolveu, preservado. */
  assert.match(codigo, /languageCode: fala\.result\.languageCode/);
  /* L · e a proveniência é o método, gravado como tal. */
  assert.match(codigo, /sourceMethod: capacidade\.method/);
  assert.ok(ddl.includes("'MEDIA_FILE_TO_SPEECH'"), "o método é aceito pelo banco");

  /*
   * A CAPABILITY NASCE DA MÍDIA GRAVADA, não de um sinal da tela: é o
   * `uploaded_media_uri` na fonte que faz `MEDIA_FILE_TO_SPEECH` existir.
   */
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasUploadedMedia: true }).method, "MEDIA_FILE_TO_SPEECH");
  /*
   * E SEM MÍDIA ELA NÃO EXISTE — continua sendo o ponto. O que mudou no Gate
   * 2.4 é o que vem DEPOIS da recusa: a tentativa de legenda pública, que é
   * outro método. `MEDIA_FILE_TO_SPEECH` segue nascendo só do arquivo gravado.
   */
  assert.notEqual(radarVideoAcquisitionCapability({ kind: "YOUTUBE" }).method, "MEDIA_FILE_TO_SPEECH");
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE" }).method, "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL");
});

/* ==========  J e K · F5 E RESET  =============================== */

test("VÍDEOS 2.2 · J e K — o F5 lê, e o RESET da Pesquisa não alcança nada disto", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /* J · nenhum efeito de render envia mídia, enfileira ou transcreve. */
  for (const efeito of pagina.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || []) {
    assert.ok(!/radar-video-media|uploadVideoMedia\(|radar-video-text/.test(efeito), "nenhum useEffect envia mídia");
  }
  /* O envio nasce da escolha do arquivo, e de nada mais. */
  assert.equal((painel().match(/onUploadVideoMedia\?\.\(/g) || []).length, 1);
  assert.match(painel(), /if \(arquivo\) onUploadVideoMedia\?\.\(articleId, fonte\.id, arquivo\)/);

  /* K · o reset não conhece nenhuma das tabelas nem o Storage. */
  const reset = readFileSync(new URL("../lib/radar/radar-reset.ts", import.meta.url), "utf8");
  for (const alvo of ["radar_video_sources", "radar_video_source_texts", "external_processing_jobs", "uploaded_media"]) {
    assert.ok(!reset.includes(alvo), `o reset não alcança ${alvo}`);
  }
});

/* ==========  M e N · O QUE NÃO ACONTECE  ======================= */

test("VÍDEOS 2.2 · M e N — nenhuma chamada YouTube para texto, nenhuma tradução", () => {
  const superficie = [rotaMedia(), processor(), painel()].join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  /* M · o YouTube não participa da aquisição de texto. */
  for (const proibido of ["fetchSharedYouTubeMetadata", "captions", "timedtext", "ytdl", "yt-dlp", "youtube-dl"]) {
    assert.ok(!superficie.includes(proibido), `nenhum caminho "${proibido}" na aquisição de texto`);
  }
  /* N · e nada é traduzido. */
  for (const proibido of ["translateText", "translationClient", "targetLanguage", "target_language"]) {
    assert.ok(!superficie.includes(proibido), `nenhuma tradução: "${proibido}"`);
  }

  /*
   * CONTÊINER DE VÍDEO É RECUSADO NA PORTA, com o motivo escrito.
   *
   * Extrair a trilha de um `.mp4` exigiria um conversor que esta infraestrutura
   * não tem. Aceitar o arquivo e falhar depois faria quem opera esperar a fila
   * inteira para descobrir.
   */
  const rota = rotaMedia();
  assert.ok(!/"video\/mp4"|"video\//.test(rota), "contêiner de vídeo não é aceito");
  assert.match(rota, /"audio\/flac"|"audio\/mpeg"/);
  assert.match(rota, /Formato não aceito nesta fase/);
  assert.match(rota, /exigiria um conversor que esta infraestrutura não possui/);
  assert.match(painel(), /accept="audio\/flac,audio\/wav,audio\/mpeg,audio\/ogg,audio\/webm,audio\/amr"/);
});

/* ==========  TENANT  ========================================== */

test("VÍDEOS 2.2 · a mídia é da marca, conferida no servidor", () => {
  const rota = rotaMedia();

  assert.match(rota, /resolvePipelineContext\(\{ brandId: parsed\.data\.brandId, module: "radar", action: "edit" \}\)/);
  /*
   * DA MARCA — e o teste já se chamava assim. Até o §2.3.2 ele conferia o
   * ARTIGO, o que contradizia o próprio nome e impedia enviar áudio sem artigo
   * aberto. A fronteira é `context.brandId`, que vem do guard.
   */
  assert.match(rota, /\.eq\("brand_id", context\.brandId\)\s*\r?\n\s*\.eq\("id", parsed\.data\.videoSourceId\)/);
  assert.ok(!/\.eq\("article_id", parsed\.data\.articleId\)/.test(rota), "a fonte não é filtrada por artigo");
  assert.ok(!/\.eq\("brand_id", parsed\.data\.brandId\)/.test(rota), "a marca do corpo nunca é autoridade");
  assert.ok(!/\.eq\("brand_id", parsed\.data\.brandId\)/.test(rota), "o filtro não confia no corpo");

  /* E a chave do objeto recusa marca ou fonte inválidas. */
  assert.throws(() => createRadarVideoDurableObjectKey({ brandId: "nao-e-uuid", videoSourceId: SOURCE }), /brandId inválido/);
  assert.throws(() => createRadarVideoDurableObjectKey({ brandId: BRAND, videoSourceId: "../outra" }), /videoSourceId inválido/);
});

/* ==========  PROVIDER  ======================================== */

test("VÍDEOS 2.2 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
