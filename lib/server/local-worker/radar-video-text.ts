import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { runSharedLongSpeech } from "@/lib/server/google-cloud/media-operations";
import {
  RADAR_VIDEO_ACQUISITION_TODAY,
  radarVideoAcquisitionCapability,
  type RadarVideoAcquisitionInfrastructure,
  type RadarVideoTextMethod,
} from "@/lib/radar/video-text-acquisition";
import { marcarEstadoDaFonte, type RadarVideoTextWriteback } from "@/lib/server/radar-video-text";
import { attemptRadarPublicTranscript, type RadarPublicTranscriptFetcher } from "@/lib/server/youtube-public-transcript";
import { radarIsoDurationToMs } from "@/lib/radar/youtube-public-transcript";
import type { ExternalProcessingJob, LocalWorkerProcessorOutcome } from "./runner";

/**
 * O PROCESSOR DE AQUISIÇÃO DE TEXTO DE VÍDEO.
 *
 * REUSA O RUNNER EXISTENTE — §9. Claim com `FOR UPDATE SKIP LOCKED`, lease,
 * heartbeat, retry e backoff continuam sendo os mesmos da fundação do
 * Especialista, já provados. Nada de segunda fila, nada de segundo worker.
 *
 * A ESCADA DECIDE, O ADAPTADOR EXECUTA. Cada degrau é injetável, e um degrau
 * não configurado devolve `BLOCKED` com o motivo declarado — nunca uma falha
 * genérica que o retry tentaria de novo para sempre.
 *
 * O QUE ESTE PROCESSOR NÃO FAZ: traduzir, casar com pauta, derivar conceito ou
 * gerar evidência. Ele preserva o ORIGINAL e para.
 */

/**
 * OS ADAPTADORES DOS CAMINHOS LEGÍTIMOS.
 *
 * Não existe adaptador de download nem de provider externo, e a ausência é
 * deliberada: o Gate 2.1 fixou que o MineKey opera sobre as Connections Google
 * que já tem. Um adaptador vazio "para depois" seria um convite silencioso.
 */
export type RadarVideoAcquisitionAdapters = {
  /** Legenda do canal da própria marca, via OAuth com permissão sobre o vídeo. */
  ownedCaption?: (input: { job: ExternalProcessingJob; videoId: string | null }) => Promise<AcquisitionResult>;
  /** Speech sobre áudio já preservado no Storage durável da marca. */
  speechFromStoredAudio?: (input: { job: ExternalProcessingJob; gcsUri: string }) => Promise<AcquisitionResult>;
  /*
   * A TENTATIVA DE LEGENDA PÚBLICA — Gate 2.4, e a única via best effort.
   *
   * Injetável porque nenhum teste chama o YouTube: o padrão é o pacote real, e
   * o teste passa a própria função. Ela devolve os itens crus; normalizar e
   * decidir a unidade do tempo é do domínio.
   */
  publicTranscript?: RadarPublicTranscriptFetcher;
};

/** Ausência de legenda não é falha: é uma saída própria, com motivo. */
type SemLegenda = { unavailable: true; reason: string };
const semLegenda = (valor: unknown): valor is SemLegenda =>
  Boolean(valor) && (valor as SemLegenda).unavailable === true;

export type AcquisitionResult = {
  transcriptText: string;
  languageCode: string | null;
  segments: Array<{ text: string; startMs: number; endMs: number }>;
  hasTimestamps: boolean;
  provider: string | null;
  originalAssetUri: string | null;
};

const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

export function createRadarVideoTextWorkerProcessor(input: {
  actorUserId: string;
  client?: SupabaseClient;
  infrastructure?: RadarVideoAcquisitionInfrastructure;
  adapters?: RadarVideoAcquisitionAdapters;
}) {
  const client = input.client || createCanonicalServiceClient();
  const infra = input.infrastructure || RADAR_VIDEO_ACQUISITION_TODAY;
  const adapters = input.adapters || {};

  return async function processar(job: ExternalProcessingJob): Promise<LocalWorkerProcessorOutcome> {
    if (job.job_kind !== "radar_video_text_acquisition") {
      return { status: "BLOCKED", payload: { code: "RADAR_VIDEO_JOB_KIND_UNSUPPORTED" } };
    }
    const videoSourceId = texto((job as unknown as { video_source_id?: string }).video_source_id);
    if (!videoSourceId) return { status: "BLOCKED", payload: { code: "RADAR_VIDEO_SOURCE_MISSING" } };

    const fonte = await client
      .from("radar_video_sources")
      .select("id,brand_id,source_kind,youtube_video_id,normalized_url,text_state,duration")
      .eq("brand_id", job.brand_id)
      .eq("id", videoSourceId)
      .maybeSingle();
    if (fonte.error) throw new Error(`Não foi possível ler a fonte de vídeo: ${fonte.error.message}`);
    if (!fonte.data) return { status: "BLOCKED", payload: { code: "RADAR_VIDEO_SOURCE_NOT_FOUND" } };

    const linha = fonte.data as { source_kind: string; youtube_video_id: string | null; text_state: string; duration: string | null };

    /* IDEMPOTÊNCIA A JUSANTE: um job que sobreviveu ao texto não reprocessa. */
    if (linha.text_state === "TEXT_READY") {
      return { status: "COMPLETED", payload: { idempotent: true, reason: "O texto desta fonte já estava preservado." } };
    }

    const storedAudioUri = texto(job.payload.storedAudioUri);
    const providedTranscript = texto(job.payload.providedTranscript);

    const capacidade = radarVideoAcquisitionCapability({
      kind: linha.source_kind as "YOUTUBE",
      hasProvidedTranscript: Boolean(providedTranscript),
      hasStoredAudio: Boolean(storedAudioUri),
      ownedByBrand: Boolean(job.payload.ownedByBrand),
      infrastructure: infra,
    });

    /*
     * SEM CAMINHO NÃO É FALHA — §11. `BLOCKED` tira o job da fila sem consumir
     * tentativas; `FAILED_RETRYABLE` o traria de volta indefinidamente para
     * algo que nunca teve caminho.
     */
    if (!capacidade.available || !capacidade.method) {
      await marcarEstadoDaFonte({ brandId: job.brand_id, videoSourceId, state: "TEXT_ACQUISITION_UNAVAILABLE", reason: capacidade.reason, client });
      return { status: "BLOCKED", payload: { code: "RADAR_VIDEO_ACQUISITION_UNAVAILABLE", reason: capacidade.reason, requires: capacidade.requires } };
    }

    await marcarEstadoDaFonte({ brandId: job.brand_id, videoSourceId, state: "PROCESSING", reason: null, client });

    const resultado = await executar({
      method: capacidade.method,
      job, adapters, actorUserId: input.actorUserId, client,
      videoId: linha.youtube_video_id,
      storedAudioUri, providedTranscript,
      officialDurationMs: radarIsoDurationToMs(linha.duration),
    });

    /*
     * "ESTE VÍDEO NÃO TEM LEGENDA" É RESPOSTA, NÃO ERRO — §8.
     *
     * A fonte continua registrada e as duas saídas humanas seguem abertas:
     * enviar áudio ou informar a transcrição. `BLOCKED` tira o job da fila sem
     * consumir tentativas; `FAILED_*` o traria de volta para sempre por algo
     * que não depende de repetir.
     */
    if (semLegenda(resultado)) {
      await marcarEstadoDaFonte({ brandId: job.brand_id, videoSourceId, state: "PUBLIC_TRANSCRIPT_UNAVAILABLE", reason: resultado.reason, client });
      return { status: "BLOCKED", payload: { code: "RADAR_PUBLIC_TRANSCRIPT_UNAVAILABLE", reason: resultado.reason } };
    }

    if (!resultado) {
      const motivo = `O caminho ${capacidade.method} está autorizado, mas o adaptador dele não está disponível neste worker.`;
      await marcarEstadoDaFonte({ brandId: job.brand_id, videoSourceId, state: "TEXT_ACQUISITION_UNAVAILABLE", reason: motivo, client });
      return { status: "BLOCKED", payload: { code: "RADAR_VIDEO_ADAPTER_MISSING", method: capacidade.method, reason: motivo } };
    }

    if (!resultado.transcriptText.trim()) throw new Error("RADAR_VIDEO_TRANSCRIPT_EMPTY");

    const writeback: RadarVideoTextWriteback = {
      kind: "radar_video_source_text",
      brandId: job.brand_id,
      videoSourceId,
      sourceMethod: capacidade.method,
      provider: resultado.provider,
      languageCode: resultado.languageCode,
      transcriptText: resultado.transcriptText,
      segments: resultado.segments,
      hasTimestamps: resultado.hasTimestamps,
      originalAssetUri: resultado.originalAssetUri,
    };

    return {
      status: "COMPLETED",
      payload: {
        method: capacidade.method,
        transcriptLength: resultado.transcriptText.length,
        hasTimestamps: resultado.hasTimestamps,
        segments: resultado.segments.length,
        languageCode: resultado.languageCode,
      },
      writeback: writeback as never,
      /* NENHUM job de tradução ou de matching é encadeado: não é esta fase. */
    };
  };
}

async function executar(input: {
  method: RadarVideoTextMethod;
  job: ExternalProcessingJob;
  adapters: RadarVideoAcquisitionAdapters;
  actorUserId: string;
  client: SupabaseClient;
  videoId: string | null;
  storedAudioUri: string | null;
  providedTranscript: string | null;
  officialDurationMs: number | null;
}): Promise<AcquisitionResult | SemLegenda | null> {
  const { method, job, adapters, videoId } = input;

  if (method === "USER_PROVIDED_TRANSCRIPT") {
    /*
     * O TEXTO DO HUMANO ENTRA COMO VEIO. Nenhuma normalização, nenhum resumo,
     * nenhuma "limpeza": ele é o original, e o original não é editado.
     */
    return {
      transcriptText: input.providedTranscript || "",
      languageCode: (typeof job.payload.languageCode === "string" && job.payload.languageCode.trim()) || null,
      segments: [],
      hasTimestamps: false,
      provider: null,
      originalAssetUri: null,
    };
  }

  if (method === "OWNED_YOUTUBE_CAPTION") return adapters.ownedCaption ? adapters.ownedCaption({ job, videoId }) : null;

  if (method === "PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL") {
    if (!videoId) return null;
    const tentativa = await attemptRadarPublicTranscript({
      videoId,
      languageCode: (typeof job.payload.languageCode === "string" && job.payload.languageCode.trim()) || null,
      officialDurationMs: input.officialDurationMs,
      fetcher: adapters.publicTranscript,
    });

    if (tentativa.outcome === "PUBLIC_TRANSCRIPT_UNAVAILABLE") return { unavailable: true, reason: tentativa.reason };
    /*
     * Rede, limite de requisições ou endpoint mudado: lançar devolve o job ao
     * RETRY do runner, que é quem sabe esperar. A fonte não é tocada.
     */
    if (tentativa.outcome === "FAILED_RETRYABLE") throw new Error(tentativa.reason);

    return {
      transcriptText: tentativa.text,
      languageCode: tentativa.languageCode,
      segments: tentativa.segments,
      hasTimestamps: tentativa.hasTimestamps,
      /* A proveniência carrega a VERSÃO: o endpoint não é oficial e muda. */
      provider: tentativa.providerVersion ? `${tentativa.provider}@${tentativa.providerVersion}` : tentativa.provider,
      originalAssetUri: null,
    };
  }

  /*
   * MÍDIA ENVIADA E ÁUDIO PRESERVADO TERMINAM NO MESMO LUGAR.
   *
   * O que muda entre os dois é COMO o objeto chegou ao Storage — e isso já
   * aconteceu antes do job. Daqui em diante é um `gs://` e o Speech.
   */
  if (method === "STORED_AUDIO_TO_SPEECH" || method === "MEDIA_FILE_TO_SPEECH") {
    if (!input.storedAudioUri) return null;
    if (adapters.speechFromStoredAudio) return adapters.speechFromStoredAudio({ job, gcsUri: input.storedAudioUri });

    /*
     * OS TEMPOS SÃO PEDIDOS — risco R1 fechado no Gate 2. O provider sempre
     * soube devolvê-los; era o adaptador que não os pedia.
     */
    const fala = await runSharedLongSpeech({
      actorUserId: input.actorUserId,
      brandId: job.brand_id,
      client: input.client,
      gcsUri: input.storedAudioUri,
      metadata: {
        languageCode: (typeof job.payload.languageCode === "string" && job.payload.languageCode.trim()) || null,
        enableWordTimeOffsets: true,
      },
    });
    return {
      transcriptText: fala.result.transcript,
      languageCode: fala.result.languageCode,
      segments: fala.result.segments,
      hasTimestamps: fala.result.timestampState === "TIMESTAMPED",
      provider: "google_cloud_speech",
      originalAssetUri: input.storedAudioUri,
    };
  }

  return null;
}
