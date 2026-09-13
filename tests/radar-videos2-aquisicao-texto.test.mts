import assert from "node:assert/strict";
import test from "node:test";
import { buildSpeechRecognitionConfig, transcribeShortAudio } from "../lib/server/google-cloud/speech-operation.ts";
import { parseGoogleCloudServiceAccountSecret } from "../lib/server/google-cloud/contracts.ts";
import {
  RADAR_VIDEO_ACQUISITION_TODAY,
  RADAR_VIDEO_TEXT_STATE_LABEL,
  radarVideoAcquisitionCapability,
  radarVideoTextCanRequest,
} from "../lib/radar/video-text-acquisition.ts";

/*
 * ======  VÍDEOS · GATE 2 — AQUISIÇÃO E TEMPOS  ========================
 *
 * Duas coisas que não dependem de nenhuma decisão pendente:
 *
 *   R1  o Speech-to-Text sempre soube devolver tempos de palavra; o adaptador
 *       do projeto é que não os pedia e descartava a resposta.
 *
 *   §4  a ordem de preferência da aquisição, auditada contra a infraestrutura
 *       real — e o item 4 dessa ordem ("declarar limitação") é onde vídeo de
 *       terceiros no YouTube chega hoje.
 *
 * PROVIDER_CALLS = 0: o cliente do Speech é injetado, e o sentinela de rede
 * confirma no fim.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* A mesma credencial de fixture que `google-cloud-media.test.mts` já usa. */
const SERVICE_ACCOUNT = JSON.stringify({
  type: "service_account",
  project_id: "minerador-key-test",
  private_key_id: "private-key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----\n",
  client_email: "media@minerador-key-test.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
});

const credenciais = () => parseGoogleCloudServiceAccountSecret(SERVICE_ACCOUNT);

const transcrever = async (resposta: unknown, metadata: Record<string, unknown> = {}) => {
  let pedido: Record<string, unknown> | null = null;
  const resultado = await transcribeShortAudio({
    credentials: credenciais(),
    audioContent: new Uint8Array([1, 2, 3]),
    metadata: metadata as never,
    clientFactory: () => ({
      recognize: async (request: unknown) => { pedido = request as Record<string, unknown>; return [resposta]; },
      longRunningRecognize: async () => { throw new Error("não usado"); },
    }),
  });
  return { resultado, pedido: pedido as unknown as Record<string, unknown> };
};

/* ==========  H · TEMPOS REAIS SÃO PRESERVADOS  ===================== */

test("VÍDEOS 2 · H — os tempos de palavra do provider viram trechos", async () => {
  const { resultado, pedido } = await transcrever({
    results: [{
      alternatives: [{
        transcript: "pele oleosa precisa de rotina",
        confidence: 0.94,
        /* As duas formas que a API usa, na mesma resposta — de propósito. */
        words: [
          { word: "pele", startTime: { seconds: "1", nanos: 500_000_000 }, endTime: { seconds: "1", nanos: 900_000_000 } },
          { word: "oleosa", startTime: "2.0s", endTime: "2.45s" },
        ],
      }],
    }],
  }, { enableWordTimeOffsets: true });

  assert.equal((pedido.config as Record<string, unknown>).enableWordTimeOffsets, true, "o adaptador PEDE os tempos");
  assert.equal(resultado.timestampState, "TIMESTAMPED");
  assert.deepEqual(resultado.segments, [
    { text: "pele", startMs: 1500, endMs: 1900 },
    { text: "oleosa", startMs: 2000, endMs: 2450 },
  ]);
  /* O transcript continua sendo o mesmo de antes: nada foi trocado por tempo. */
  assert.equal(resultado.transcript, "pele oleosa precisa de rotina");
});

test("VÍDEOS 2 · H — os tempos só são pedidos quando alguém os pede", () => {
  /*
   * Ligar por padrão mudaria o custo e o formato do caminho do Especialista,
   * que já roda e não precisa de tempo. A capacidade é opcional.
   */
  assert.equal(buildSpeechRecognitionConfig({ languageCode: "pt-BR" }).enableWordTimeOffsets, undefined);
  assert.equal(buildSpeechRecognitionConfig({ languageCode: "pt-BR", enableWordTimeOffsets: true }).enableWordTimeOffsets, true);
  assert.equal(buildSpeechRecognitionConfig({ languageCode: "pt-BR", enableWordTimeOffsets: false }).enableWordTimeOffsets, undefined);
});

/* ==========  I · SEM TEMPO NÃO SE INVENTA TEMPO  ================== */

test("VÍDEOS 2 · I — resposta sem tempos não vira tempo estimado", async () => {
  const { resultado } = await transcrever({
    results: [{ alternatives: [{ transcript: "sem tempos aqui", confidence: 0.8 }] }],
  });

  assert.equal(resultado.timestampState, "NON_TIMESTAMPED");
  assert.deepEqual(resultado.segments, [], "nenhum trecho é fabricado");
  assert.equal(resultado.transcript, "sem tempos aqui", "e o texto é preservado mesmo assim");
});

test("VÍDEOS 2 · I — palavra com meio tempo é descartada, não completada", async () => {
  /*
   * Dividir a duração proporcionalmente pelas palavras produziria números
   * plausíveis e falsos. Um trecho citado no tempo errado é pior que um trecho
   * sem tempo, porque parece verificável.
   */
  const { resultado } = await transcrever({
    results: [{
      alternatives: [{
        transcript: "uma duas tres",
        words: [
          { word: "uma", startTime: "0s", endTime: "0.4s" },
          { word: "duas", startTime: "0.4s" },
          { word: "tres", endTime: "1.2s" },
          { word: "   ", startTime: "1.2s", endTime: "1.5s" },
        ],
      }],
    }],
  }, { enableWordTimeOffsets: true });

  assert.deepEqual(resultado.segments, [{ text: "uma", startMs: 0, endMs: 400 }], "só a palavra com os dois tempos sobrevive");
  assert.equal(resultado.timestampState, "TIMESTAMPED", "e o que veio com tempo continua marcado");
});

/* ==========  §4 · A ORDEM DE AQUISIÇÃO, AUDITADA  ================= */

test("VÍDEOS 2 · §4 — sem a tentativa pública, vídeo de terceiro não tem caminho, e isso é declarado", () => {
  /*
   * GATE 2.4 acrescentou uma TENTATIVA best effort. A fronteira das APIs
   * OFICIAIS, que este teste guarda, não mudou — e desligar a tentativa é
   * justamente como se prova que ela continua inteira por baixo.
   */
  const leitura = radarVideoAcquisitionCapability({
    kind: "YOUTUBE",
    infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, publicTranscriptBestEffort: false },
  });

  assert.equal(leitura.available, false);
  assert.equal(leitura.method, null, "nenhum método é escolhido por desencargo");
  /*
   * A FRONTEIRA É DAS APIS OFICIAIS, e a frase diz exatamente isso: a YouTube
   * Data API responde metadado; legenda exige OAuth com permissão sobre o
   * vídeo. Não é defeito do produto, e não se resolve tentando de novo.
   */
  assert.match(leitura.reason, /YouTube Data API responde com metadados públicos/);
  assert.match(leitura.reason, /obter legenda exige OAuth com permissão sobre o vídeo/);
  /* O que falta é dito, não insinuado — um item por saída legítima. */
  assert.equal(leitura.requires.length, 3);
  assert.ok(leitura.requires.some(item => /enviar o arquivo de mídia/.test(item)));
  assert.ok(leitura.requires.some(item => /informar a transcrição/.test(item)));
  assert.ok(leitura.requires.some(item => /OAuth do canal da própria marca/.test(item)));
  /* E nenhum caminho de download ou provider externo é oferecido. */
  assert.ok(!/download|baixar|yt-dlp|ytdl|licenciado/i.test(leitura.requires.join(" ")));

  /*
   * A INFRAESTRUTURA DE HOJE É DECLARADA, e não presumida por ausência.
   *
   * Os três caminhos que o USER autorizou no Gate 2 continuam `false` até
   * alguém configurar a credencial, contratar o provider ou instalar o
   * binário. Autorizar não é ter.
   */
  /*
   * AS CONNECTIONS REAIS DA PLATAFORMA: YouTube Data API, Cloud Storage e
   * Speech estão READY; OAuth de canal é capacidade FUTURA, porque não nasce
   * da mesma credencial.
   */
  assert.deepEqual(RADAR_VIDEO_ACQUISITION_TODAY, {
    youtubeMetadata: true,
    ownedChannelOAuth: false,
    cloudStorage: true,
    speechToText: true,
    /*
     * GATE 2.4 · NÃO É CONNECTION, e por isso tem nome próprio: é uma tentativa
     * best effort num endpoint não oficial. Declará-la junto das Connections
     * READY sugeriria uma garantia que ela não tem.
     */
    publicTranscriptBestEffort: true,
  });
});

test("VÍDEOS 2 · §4 — os caminhos que existem são escolhidos na ordem certa", () => {
  /* 1 · texto fornecido: não custa provider e é o original mais fiel. */
  const fornecido = radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasProvidedTranscript: true });
  assert.equal(fornecido.method, "USER_PROVIDED_TRANSCRIPT");
  assert.equal(fornecido.available, true);
  assert.deepEqual(fornecido.requires, []);

  /* 2 · áudio já preservado no Storage + Speech. */
  const comAudio = radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasStoredAudio: true });
  assert.equal(comAudio.method, "STORED_AUDIO_TO_SPEECH");

  /* 3 · arquivo de mídia que a marca enviou: Storage e daí o Speech. */
  const comArquivo = radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasUploadedMedia: true });
  assert.equal(comArquivo.method, "MEDIA_FILE_TO_SPEECH");

  /*
   * 4 · legenda do PRÓPRIO canal — exige as DUAS coisas: ser da marca E ter
   * OAuth. Só uma delas não basta, e é essa a fronteira do vídeo de terceiro.
   */
  /*
   * 5 · A TENTATIVA PÚBLICA É O ÚLTIMO DEGRAU AUTOMÁTICO — depois de tudo que
   * a marca possui. Quando existe mídia própria, o Speech vence: ele dá tempos
   * reais e não depende de endpoint não documentado.
   */
  const soUrl = radarVideoAcquisitionCapability({ kind: "YOUTUBE" });
  assert.equal(soUrl.method, "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL");
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasUploadedMedia: true }).method, "MEDIA_FILE_TO_SPEECH", "mídia própria vence a tentativa pública");
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasProvidedTranscript: true }).method, "USER_PROVIDED_TRANSCRIPT", "texto do humano vence tudo");

  const comOAuth = radarVideoAcquisitionCapability({
    kind: "YOUTUBE", ownedByBrand: true,
    infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, ownedChannelOAuth: true },
  });
  assert.equal(comOAuth.method, "OWNED_YOUTUBE_CAPTION");
  /*
   * AS DUAS CONDIÇÕES CONTINUAM SENDO DUAS. O que mudou no Gate 2.4 é que
   * faltar uma delas não deixa mais a fonte sem saída: ela cai na tentativa
   * best effort, que é outro método e se chama outro nome.
   */
  assert.notEqual(
    radarVideoAcquisitionCapability({ kind: "YOUTUBE", infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, ownedChannelOAuth: true } }).method,
    "OWNED_YOUTUBE_CAPTION",
    "OAuth sem ser dono não alcança legenda oficial de vídeo de terceiro",
  );
  assert.notEqual(
    radarVideoAcquisitionCapability({ kind: "YOUTUBE", ownedByBrand: true }).method,
    "OWNED_YOUTUBE_CAPTION",
    "ser dono sem OAuth também não alcança a legenda oficial",
  );

  /* O texto fornecido vence o áudio: o original da marca antes do provider. */
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasProvidedTranscript: true, hasStoredAudio: true }).method, "USER_PROVIDED_TRANSCRIPT");

  /*
   * CADA CONNECTION CONTINUA SENDO CONDIÇÃO DO SEU CAMINHO.
   *
   * Sem Speech o áudio não vira texto; sem Storage o arquivo não chega lá. O
   * que mudou é o que acontece depois da recusa: em vez de ficar sem saída, a
   * fonte cai na tentativa best effort. Por isso a asserção é sobre o MÉTODO —
   * `available` deixou de distinguir, e continuar usando-o aqui faria o teste
   * medir outra coisa sem avisar.
   */
  const semSpeech = radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasStoredAudio: true, infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, speechToText: false } });
  assert.notEqual(semSpeech.method, "STORED_AUDIO_TO_SPEECH", "sem Speech, o áudio preservado não vira texto");
  const semStorage = radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasUploadedMedia: true, infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, cloudStorage: false } });
  assert.notEqual(semStorage.method, "MEDIA_FILE_TO_SPEECH", "sem Storage, o arquivo enviado também não");

  /* E com as duas Connections fora E sem tentativa pública, não há via nenhuma. */
  const semNada = { ...RADAR_VIDEO_ACQUISITION_TODAY, speechToText: false, cloudStorage: false, publicTranscriptBestEffort: false };
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasStoredAudio: true, infrastructure: semNada }).available, false);
  assert.equal(radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasUploadedMedia: true, infrastructure: semNada }).available, false);
});

/* ==========  A e §12 · A AÇÃO É EXPLÍCITA E IDEMPOTENTE  ========= */

test("VÍDEOS 2 · A e §12 — a extração só é oferecida quando faz sentido pedir", () => {
  const disponivel = radarVideoAcquisitionCapability({ kind: "YOUTUBE", hasProvidedTranscript: true });
  /* Sem a tentativa best effort do Gate 2.4, o YouTube de terceiro segue sem via. */
  const indisponivel = radarVideoAcquisitionCapability({ kind: "YOUTUBE", infrastructure: { ...RADAR_VIDEO_ACQUISITION_TODAY, publicTranscriptBestEffort: false } });

  /* A · registrada e com caminho: pronta para o humano acionar. */
  assert.deepEqual(radarVideoTextCanRequest({ state: "REGISTERED", capability: disponivel }), {
    allowed: true, reason: "Pronta para extrair o texto.",
  });

  /*
   * §12 · CLICAR DE NOVO NÃO CRIA SEGUNDO PROCESSAMENTO.
   *
   * A recusa vem do ESTADO, não de um debounce de interface: um segundo clique
   * depois do F5, em outra aba, encontraria a mesma resposta.
   */
  for (const estado of ["QUEUED", "PROCESSING"] as const) {
    const leitura = radarVideoTextCanRequest({ state: estado, capability: disponivel });
    assert.equal(leitura.allowed, false, `${estado} não aceita novo pedido`);
    assert.match(leitura.reason, /já existe uma extração em andamento/i);
  }
  assert.equal(radarVideoTextCanRequest({ state: "TEXT_READY", capability: disponivel }).allowed, false);
  assert.equal(radarVideoTextCanRequest({ state: "FAILED_FINAL", capability: disponivel }).allowed, false);
  /* Falha retentável continua podendo ser pedida de novo. */
  assert.equal(radarVideoTextCanRequest({ state: "FAILED_RETRYABLE", capability: disponivel }).allowed, true);

  /*
   * SEM CAMINHO, A AÇÃO NÃO É OFERECIDA — e o motivo é o da limitação, não um
   * "tente mais tarde". Um botão que sempre falha transforma uma limitação
   * conhecida em suspeita de defeito a cada clique.
   */
  const semCaminho = radarVideoTextCanRequest({ state: "REGISTERED", capability: indisponivel });
  assert.equal(semCaminho.allowed, false);
  assert.equal(semCaminho.reason, indisponivel.reason);
});

test("VÍDEOS 2 · §11 — limitação não é falha, e os dois estados são distinguíveis", () => {
  /*
   * `ACQUISITION_UNAVAILABLE` é saber ANTES de tentar; `FAILED_*` é ter
   * tentado. Colapsar os dois faria o sistema repetir indefinidamente algo que
   * nunca teve caminho.
   */
  assert.notEqual(RADAR_VIDEO_TEXT_STATE_LABEL.TEXT_ACQUISITION_UNAVAILABLE, RADAR_VIDEO_TEXT_STATE_LABEL.FAILED_FINAL);
  assert.notEqual(RADAR_VIDEO_TEXT_STATE_LABEL.TEXT_ACQUISITION_UNAVAILABLE, RADAR_VIDEO_TEXT_STATE_LABEL.FAILED_RETRYABLE);
  /*
   * METADADO OBTIDO NÃO É TEXTO OBTIDO — §8 do Gate 2.1.
   *
   * Os dois estados existem porque descrevem coisas diferentes, e o rótulo de
   * `METADATA_READY` continua dizendo que o texto não está disponível.
   */
  assert.equal(RADAR_VIDEO_TEXT_STATE_LABEL.METADATA_READY, "Metadados obtidos · texto ainda não disponível");
  assert.match(RADAR_VIDEO_TEXT_STATE_LABEL.METADATA_READY, /texto ainda não disponível/);
  assert.equal(RADAR_VIDEO_TEXT_STATE_LABEL.REGISTERED, "Texto ainda não disponível");
});

/* ==========  O e P · NADA A JUSANTE FOI ANTECIPADO  ============== */

test("VÍDEOS 2 · O e P — nenhuma tradução, nenhum matching, nenhum artigo", async () => {
  const { readFileSync } = await import("node:fs");
  const aquisicao = readFileSync(new URL("../lib/radar/video-text-acquisition.ts", import.meta.url), "utf8");
  const codigo = aquisicao.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const proibido of ["translat", "traduz", "videoBrief", "match", "ContentPlan", "fetch", "await "]) {
    assert.ok(!codigo.toLowerCase().includes(proibido.toLowerCase()), `a aquisição não faz "${proibido}"`);
  }
});

/* ==========  PROVIDER  ========================================== */

test("VÍDEOS 2 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
