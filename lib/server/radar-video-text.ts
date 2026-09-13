import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import type { RadarVideoTextMethod, RadarVideoTextState } from "@/lib/radar/video-text-acquisition";

/**
 * A PERSISTÊNCIA DO TEXTO ORIGINAL DE UMA FONTE DE VÍDEO.
 *
 * Modelo híbrido do Gate 0: o artefato bruto vai para o Storage durável, e o
 * texto consultável fica no PostgreSQL — fora do payload do workflow, que é
 * lido inteiro a cada render da planilha.
 *
 * APPEND-ONLY POR VERSÃO. Reprocessar cria linha nova; o original de ontem
 * continua auditável. O §5 é explícito: o original nunca é sobrescrito, e
 * tradução, quando existir, será outra camada — nunca um UPDATE desta.
 */

type Cliente = SupabaseClient;
const clienteOu = (client?: Cliente) => client || createCanonicalServiceClient();

function falhar(resultado: { error: { message?: string } | null }, mensagem: string) {
  if (resultado.error) throw new Error(`${mensagem}: ${resultado.error.message || "erro desconhecido"}`);
}

export const RADAR_VIDEO_TEXT_JOB_KIND = "radar_video_text_acquisition" as const;

export type RadarVideoTextWriteback = {
  kind: "radar_video_source_text";
  brandId: string;
  videoSourceId: string;
  sourceMethod: RadarVideoTextMethod;
  provider: string | null;
  languageCode: string | null;
  transcriptText: string;
  segments: Array<{ text: string; startMs: number; endMs: number }>;
  hasTimestamps: boolean;
  originalAssetUri: string | null;
};

/** O hash do conteúdo original — identidade estável do que foi preservado. */
export const radarVideoTextContentHash = (texto: string) =>
  `sha256:${createHash("sha256").update(texto, "utf8").digest("hex")}`;

export async function persistRadarVideoSourceText(input: { writeback: RadarVideoTextWriteback; client?: Cliente }) {
  const client = clienteOu(input.client);
  const { writeback } = input;

  /*
   * A PRÓXIMA VERSÃO, LIDA DO QUE EXISTE.
   *
   * Não é um contador em memória: duas execuções do worker sobre a mesma fonte
   * precisam chegar a números diferentes, e é a restrição de unicidade
   * `(video_source_id, content_kind, processing_version)` que arbitra.
   */
  const anterior = await client
    .from("radar_video_source_texts")
    .select("processing_version")
    .eq("brand_id", writeback.brandId)
    .eq("video_source_id", writeback.videoSourceId)
    .eq("content_kind", "ORIGINAL_TRANSCRIPT")
    .order("processing_version", { ascending: false })
    .limit(1);
  falhar(anterior, "Não foi possível ler a versão anterior do texto");

  const processingVersion = Number((anterior.data?.[0] as { processing_version?: number } | undefined)?.processing_version || 0) + 1;

  const insercao = await client.from("radar_video_source_texts").insert({
    brand_id: writeback.brandId,
    video_source_id: writeback.videoSourceId,
    content_kind: "ORIGINAL_TRANSCRIPT",
    source_method: writeback.sourceMethod,
    provider: writeback.provider,
    language_code: writeback.languageCode,
    transcript_text: writeback.transcriptText,
    segments: writeback.segments,
    has_timestamps: writeback.hasTimestamps,
    original_asset_uri: writeback.originalAssetUri,
    content_hash: radarVideoTextContentHash(writeback.transcriptText),
    processing_version: processingVersion,
  }).select("id").single();
  falhar(insercao, "Não foi possível preservar o texto original da fonte");

  await marcarEstadoDaFonte({ brandId: writeback.brandId, videoSourceId: writeback.videoSourceId, state: "TEXT_READY", reason: null, client });
  return { textId: String((insercao.data as { id: string }).id), processingVersion };
}

/**
 * O ESTADO DA FONTE — autoridade única (§11).
 *
 * A tela não deduz "pronto" pela existência de uma string de transcript: ela lê
 * esta coluna. Um processamento a meio caminho, com texto parcial gravado,
 * pareceria concluído sob a outra regra.
 */
export async function marcarEstadoDaFonte(input: {
  brandId: string;
  videoSourceId: string;
  state: RadarVideoTextState;
  reason: string | null;
  client?: Cliente;
}) {
  const resultado = await clienteOu(input.client)
    .from("radar_video_sources")
    .update({ text_state: input.state, text_state_reason: input.reason, updated_at: new Date().toISOString() })
    .eq("brand_id", input.brandId)
    .eq("id", input.videoSourceId);
  falhar(resultado, "Não foi possível atualizar o estado do texto da fonte");
}

/**
 * OS METADADOS PÚBLICOS DA FONTE — §7.
 *
 * Vêm da YouTube Data API por AÇÃO EXPLÍCITA e são gravados na própria fonte,
 * porque descrevem a fonte e não um processamento dela. Obter metadado NÃO
 * inicia transcrição: o estado do texto só avança de `REGISTERED` para
 * `METADATA_READY`, que continua dizendo que o texto não existe.
 */
export async function persistRadarVideoMetadata(input: {
  brandId: string;
  videoSourceId: string;
  metadata: {
    videoId: string;
    title: string;
    channelId: string;
    channelTitle: string;
    description: string;
    publishedAt: string | null;
    duration: string | null;
    thumbnails: Record<string, unknown>;
  };
  client?: Cliente;
}) {
  const client = clienteOu(input.client);
  const atual = await client
    .from("radar_video_sources")
    .select("text_state")
    .eq("brand_id", input.brandId)
    .eq("id", input.videoSourceId)
    .maybeSingle();
  falhar(atual, "Não foi possível ler o estado da fonte");

  /*
   * O ESTADO SÓ AVANÇA DE `REGISTERED`. Uma fonte que já tem texto, está na
   * fila ou falhou não volta para `METADATA_READY` — metadado é informação
   * adicional, não um retrocesso do ciclo de aquisição.
   */
  const estadoAtual = String((atual.data as { text_state?: string } | null)?.text_state || "REGISTERED");
  const proximoEstado = estadoAtual === "REGISTERED" ? "METADATA_READY" : estadoAtual;

  const resultado = await client
    .from("radar_video_sources")
    .update({
      youtube_video_id: input.metadata.videoId,
      video_title: input.metadata.title || null,
      channel_id: input.metadata.channelId || null,
      channel_title: input.metadata.channelTitle || null,
      video_description: input.metadata.description || null,
      published_at: input.metadata.publishedAt,
      duration: input.metadata.duration,
      thumbnails: input.metadata.thumbnails,
      metadata_fetched_at: new Date().toISOString(),
      text_state: proximoEstado,
      updated_at: new Date().toISOString(),
    })
    .eq("brand_id", input.brandId)
    .eq("id", input.videoSourceId);
  falhar(resultado, "Não foi possível preservar os metadados da fonte");
  return { textState: proximoEstado };
}

/**
 * ENFILEIRAR A AQUISIÇÃO — idempotente por construção (§12).
 *
 * O índice único parcial `(video_source_id, job_kind)` sobre os estados ativos
 * é quem recusa o segundo job. Dois cliques, duas abas ou um F5 no meio do
 * caminho encontram a mesma resposta, porque quem arbitra é o banco e não um
 * debounce de interface.
 */
export async function enqueueRadarVideoTextJob(input: {
  brandId: string;
  videoSourceId: string;
  payload?: Record<string, unknown>;
  client?: Cliente;
}) {
  const client = clienteOu(input.client);
  const resultado = await client.from("external_processing_jobs").insert({
    brand_id: input.brandId,
    video_source_id: input.videoSourceId,
    job_kind: RADAR_VIDEO_TEXT_JOB_KIND,
    status: "PENDING_LOCAL_PROCESSING",
    payload: input.payload || {},
  }).select("id").single();

  if (resultado.error?.code === "23505") return { duplicate: true as const, jobId: null };
  falhar(resultado, "Não foi possível enfileirar a aquisição de texto do vídeo");

  await marcarEstadoDaFonte({ brandId: input.brandId, videoSourceId: input.videoSourceId, state: "QUEUED", reason: null, client });
  return { duplicate: false as const, jobId: String((resultado.data as { id: string }).id) };
}
