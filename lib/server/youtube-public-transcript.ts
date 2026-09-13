import {
  classifyRadarPublicTranscriptFailure,
  readRadarPublicTranscript,
  RADAR_PUBLIC_TRANSCRIPT_PROVIDER,
  type RadarPublicTranscriptReading,
  type RawYouTubeTranscriptItem,
} from "@/lib/radar/youtube-public-transcript";

/**
 * O ÚNICO PONTO QUE FALA COM O ENDPOINT NÃO OFICIAL DO YOUTUBE.
 *
 * `youtube-transcript` é um pacote que simula a chamada que o player do
 * YouTube faz para carregar legendas. Não é a YouTube Data API: não tem
 * contrato, não tem cota e pode quebrar quando a plataforma mudar. Isolar a
 * chamada aqui é o que permite que a biblioteca, os metadados e o Speech
 * continuem funcionando no dia em que ele parar.
 *
 * O QUE ESTE MÓDULO NÃO FAZ:
 *
 *   não baixa áudio, não usa yt-dlp, não chama Speech, não traduz, não resume
 *   e não decide nada sobre a fonte. Ele tenta, normaliza e devolve.
 *
 * A DEPENDÊNCIA É INJETÁVEL porque os testes não chamam o YouTube: o padrão é
 * o pacote real, e o teste passa a própria função.
 */

export type RadarPublicTranscriptFetcher = (
  videoId: string,
  config?: { lang?: string },
) => Promise<RawYouTubeTranscriptItem[]>;

/*
 * A UNIÃO É DISCRIMINADA POR `outcome` — e por isso o braço de sucesso lista
 * os campos, em vez de intersectar: `A & B` não estreita, e o chamador
 * perderia a garantia de que `segments` só existe quando houve texto.
 */
export type RadarPublicTranscriptAttempt =
  | {
    outcome: "TEXT_READY";
    provider: string;
    providerVersion: string | null;
    segments: RadarPublicTranscriptReading["segments"];
    text: string;
    languageCode: string | null;
    unit: RadarPublicTranscriptReading["unit"];
    hasTimestamps: boolean;
    unitReason: string;
  }
  | { outcome: "PUBLIC_TRANSCRIPT_UNAVAILABLE"; reason: string; provider: string; providerVersion: string | null }
  | { outcome: "FAILED_RETRYABLE"; reason: string; provider: string; providerVersion: string | null };

/** A versão do pacote, lida do próprio `package.json` — nunca escrita à mão. */
export async function radarPublicTranscriptProviderVersion(): Promise<string | null> {
  try {
    const pacote = await import("youtube-transcript/package.json", { with: { type: "json" } });
    const versao = (pacote as { default?: { version?: string }; version?: string }).default?.version
      ?? (pacote as { version?: string }).version;
    return typeof versao === "string" ? versao : null;
  } catch {
    /* Sem versão é `null`. Inventá-la seria mentir na proveniência. */
    return null;
  }
}

async function pacoteReal(videoId: string, config?: { lang?: string }): Promise<RawYouTubeTranscriptItem[]> {
  const { YoutubeTranscript } = await import("youtube-transcript");
  return YoutubeTranscript.fetchTranscript(videoId, config) as Promise<RawYouTubeTranscriptItem[]>;
}

/**
 * UMA TENTATIVA DE LEGENDA PÚBLICA.
 *
 * `officialDurationMs` vem dos metadados da YouTube Data API e não é enfeite:
 * é a evidência que resolve a unidade ambígua do tempo que o pacote devolve.
 * Sem ela o texto é preservado sem tempos, e o motivo fica escrito.
 */
export async function attemptRadarPublicTranscript(input: {
  videoId: string;
  /** Idioma preferido; ausência deixa o YouTube escolher o que existir. */
  languageCode?: string | null;
  officialDurationMs?: number | null;
  fetcher?: RadarPublicTranscriptFetcher;
}): Promise<RadarPublicTranscriptAttempt> {
  const provider = RADAR_PUBLIC_TRANSCRIPT_PROVIDER;
  const providerVersion = await radarPublicTranscriptProviderVersion();
  const buscar = input.fetcher || pacoteReal;

  let itens: RawYouTubeTranscriptItem[];
  try {
    itens = await buscar(input.videoId, input.languageCode ? { lang: input.languageCode } : undefined);
  } catch (error) {
    const { outcome, reason } = classifyRadarPublicTranscriptFailure(error);
    return { outcome, reason, provider, providerVersion };
  }

  const leitura = readRadarPublicTranscript({ items: itens || [], officialDurationMs: input.officialDurationMs ?? null });

  /*
   * RESPOSTA VAZIA É AUSÊNCIA DE LEGENDA, não erro. O pacote às vezes devolve
   * lista vazia em vez de lançar, e gravar um texto vazio violaria o próprio
   * CHECK da tabela — além de afirmar que existe transcript quando não existe.
   */
  if (!leitura.text.trim()) {
    return {
      outcome: "PUBLIC_TRANSCRIPT_UNAVAILABLE",
      reason: "Este vídeo não oferece legenda pública. A fonte continua registrada: envie o áudio ou informe a transcrição.",
      provider, providerVersion,
    };
  }

  return { outcome: "TEXT_READY", provider, providerVersion, ...leitura };
}
