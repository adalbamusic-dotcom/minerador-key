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
};

export type SpeechRecognitionConfig = {
  languageCode: string;
  encoding?: string;
  sampleRateHertz?: number;
  audioChannelCount?: number;
  model?: string;
  enableAutomaticPunctuation: boolean;
};

export type SpeechClientLike = {
  recognize(request: unknown): Promise<[unknown]>;
  longRunningRecognize(request: unknown): Promise<[SpeechLongRunningOperationLike]>;
};

export type SpeechLongRunningOperationLike = {
  promise?: () => Promise<[unknown]>;
};

export type SpeechClientFactory = (credentials: GoogleCloudServiceAccountCredentials) => Promise<SpeechClientLike> | SpeechClientLike;

export type SpeechTranscriptResult = {
  transcript: string;
  confidence: number | null;
  alternatives: Array<{ transcript: string; confidence: number | null }>;
  languageCode: string;
  mode: "short" | "long";
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
  return config;
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
  return {
    transcript: alternatives[0]?.transcript || "",
    confidence: alternatives[0]?.confidence ?? null,
    alternatives,
    languageCode: typeof metadata.languageCode === "string" && metadata.languageCode.trim() ? metadata.languageCode.trim() : "pt-BR",
    mode,
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
