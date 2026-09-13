import "server-only";

import { loadGoogleCloudSpeechClient } from "./sdk-loaders";
import { GoogleCloudMediaError, type GoogleCloudServiceAccountCredentials } from "./contracts";

export type SpeechAudioMetadata = {
  languageCode?: string | null;
  encoding?: string | null;
  sampleRateHertz?: number | null;
  audioChannelCount?: number | null;
  model?: string | null;
  enableAutomaticPunctuation?: boolean;
  /**
   * OS TEMPOS DE PALAVRA — risco R1 do Gate 0 de Vídeos.
   *
   * O Speech-to-Text devolve `words[].startTime/endTime` quando
   * `enableWordTimeOffsets` é pedido. A capacidade sempre existiu no provider;
   * este adaptador é que não a pedia e descartava a resposta.
   *
   * Continua OPCIONAL: a contribuição do Especialista não precisa de tempo, e
   * ligar por padrão mudaria o custo e o formato de um caminho que já roda.
   */
  enableWordTimeOffsets?: boolean;
};

export type SpeechRecognitionConfig = {
  languageCode: string;
  encoding?: string;
  sampleRateHertz?: number;
  audioChannelCount?: number;
  model?: string;
  enableAutomaticPunctuation: boolean;
  enableWordTimeOffsets?: boolean;
};

export type SpeechClientLike = {
  recognize(request: unknown): Promise<[unknown]>;
  longRunningRecognize(request: unknown): Promise<[SpeechLongRunningOperationLike]>;
};

export type SpeechLongRunningOperationLike = {
  promise?: () => Promise<[unknown]>;
};

export type SpeechClientFactory = (credentials: GoogleCloudServiceAccountCredentials) => Promise<SpeechClientLike> | SpeechClientLike;

/** Um trecho com tempo REAL devolvido pelo provider. Nunca calculado. */
export type SpeechTranscriptSegment = {
  text: string;
  startMs: number;
  endMs: number;
};

export type SpeechTranscriptResult = {
  transcript: string;
  confidence: number | null;
  alternatives: Array<{ transcript: string; confidence: number | null }>;
  languageCode: string;
  mode: "short" | "long";
  /**
   * DECLARADO, NÃO PRESUMIDO.
   *
   * `TIMESTAMPED` só quando o provider devolveu tempos de verdade. Dividir a
   * duração proporcionalmente pelas palavras produziria números plausíveis e
   * falsos — e um trecho citado no tempo errado é pior do que um trecho sem
   * tempo, porque parece verificável.
   */
  timestampState: "TIMESTAMPED" | "NON_TIMESTAMPED";
  segments: SpeechTranscriptSegment[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildSpeechRecognitionConfig(metadata: SpeechAudioMetadata = {}): SpeechRecognitionConfig {
  const languageCode = typeof metadata.languageCode === "string" && metadata.languageCode.trim() ? metadata.languageCode.trim() : "pt-BR";
  const config: SpeechRecognitionConfig = {
    languageCode,
    enableAutomaticPunctuation: metadata.enableAutomaticPunctuation ?? true,
  };
  if (typeof metadata.encoding === "string" && metadata.encoding.trim()) config.encoding = metadata.encoding.trim();
  if (typeof metadata.sampleRateHertz === "number" && Number.isInteger(metadata.sampleRateHertz) && metadata.sampleRateHertz > 0) config.sampleRateHertz = metadata.sampleRateHertz;
  if (typeof metadata.audioChannelCount === "number" && Number.isInteger(metadata.audioChannelCount) && metadata.audioChannelCount > 0) config.audioChannelCount = metadata.audioChannelCount;
  if (typeof metadata.model === "string" && metadata.model.trim()) config.model = metadata.model.trim();
  if (metadata.enableWordTimeOffsets) config.enableWordTimeOffsets = true;
  return config;
}

/**
 * O TEMPO QUE O PROVIDER DEVOLVEU — ou nada.
 *
 * A API devolve duração ora como `{ seconds, nanos }`, ora como string
 * (`"12.500s"`), dependendo do cliente e do transporte. Qualquer outra coisa
 * vira `null`: um tempo que não veio não pode ser estimado.
 */
function durationToMs(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/s$/, ""));
    return Number.isFinite(parsed) ? Math.round(parsed * 1000) : null;
  }
  const duration = record(value);
  const seconds = typeof duration.seconds === "string" ? Number.parseInt(duration.seconds, 10) : numberOrNull(duration.seconds);
  const nanos = numberOrNull(duration.nanos);
  if (seconds === null && nanos === null) return null;
  return Math.round((seconds || 0) * 1000 + (nanos || 0) / 1_000_000);
}

function normalizeResponse(response: unknown, metadata: SpeechAudioMetadata, mode: "short" | "long"): SpeechTranscriptResult {
  const responseRecord = record(response);
  const results = Array.isArray(responseRecord.results) ? responseRecord.results : [];
  const alternatives = results.flatMap((result) => {
    const resultRecord = record(result);
    const first = Array.isArray(resultRecord.alternatives) ? resultRecord.alternatives : [];
    return first.flatMap((alternative) => {
      const alternativeRecord = record(alternative);
      const transcript = typeof alternativeRecord.transcript === "string" ? alternativeRecord.transcript.trim() : "";
      if (!transcript) return [];
      return [{ transcript, confidence: numberOrNull(alternativeRecord.confidence) }];
    });
  });

  /*
   * OS TEMPOS SAEM DA PRIMEIRA ALTERNATIVA DE CADA RESULTADO — que é a que
   * compõe o transcript. Ler as demais misturaria hipóteses concorrentes na
   * mesma linha do tempo.
   */
  const segments = results.flatMap((result) => {
    const primeira = record(Array.isArray(record(result).alternatives) ? (record(result).alternatives as unknown[])[0] : null);
    const words = Array.isArray(primeira.words) ? primeira.words : [];
    return words.flatMap((word) => {
      const wordRecord = record(word);
      const text = typeof wordRecord.word === "string" ? wordRecord.word.trim() : "";
      const startMs = durationToMs(wordRecord.startTime);
      const endMs = durationToMs(wordRecord.endTime);
      /* Palavra sem os DOIS tempos não vira trecho: meio tempo não é tempo. */
      if (!text || startMs === null || endMs === null) return [];
      return [{ text, startMs, endMs }];
    });
  });

  return {
    transcript: alternatives[0]?.transcript || "",
    confidence: alternatives[0]?.confidence ?? null,
    alternatives,
    languageCode: typeof metadata.languageCode === "string" && metadata.languageCode.trim() ? metadata.languageCode.trim() : "pt-BR",
    mode,
    timestampState: segments.length ? "TIMESTAMPED" : "NON_TIMESTAMPED",
    segments,
  };
}

function asAudioContent(value: string | Uint8Array) {
  if (typeof value === "string") return value.trim();
  return Buffer.from(value).toString("base64");
}

async function resolveClient(input: { credentials: GoogleCloudServiceAccountCredentials; clientFactory?: SpeechClientFactory }) {
  if (input.clientFactory) return input.clientFactory(input.credentials);
  return loadGoogleCloudSpeechClient(input.credentials);
}

export async function transcribeShortAudio(input: {
  credentials: GoogleCloudServiceAccountCredentials;
  audioContent: string | Uint8Array;
  metadata?: SpeechAudioMetadata;
  clientFactory?: SpeechClientFactory;
}): Promise<SpeechTranscriptResult> {
  const content = asAudioContent(input.audioContent);
  if (!content) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "O áudio curto está vazio.");
  const metadata = input.metadata || {};
  const client = await resolveClient(input);
  const [response] = await client.recognize({ config: buildSpeechRecognitionConfig(metadata), audio: { content } });
  return normalizeResponse(response, metadata, "short");
}

export async function transcribeLongAudio(input: {
  credentials: GoogleCloudServiceAccountCredentials;
  gcsUri: string;
  metadata?: SpeechAudioMetadata;
  clientFactory?: SpeechClientFactory;
}): Promise<SpeechTranscriptResult> {
  const gcsUri = input.gcsUri.trim();
  if (!/^gs:\/\/[^/]+\/.+/.test(gcsUri)) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "A URI do áudio longo precisa ser gs:// válida.");
  const metadata = input.metadata || {};
  const client = await resolveClient(input);
  const [operation] = await client.longRunningRecognize({ config: buildSpeechRecognitionConfig(metadata), audio: { uri: gcsUri } });
  if (!operation?.promise) throw new GoogleCloudMediaError("GOOGLE_CLOUD_PROVIDER_FAILED", "O provider não retornou uma operação assíncrona utilizável.");
  const [response] = await operation.promise();
  return normalizeResponse(response, metadata, "long");
}
