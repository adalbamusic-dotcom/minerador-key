import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { uploadSharedRadarVideoMedia } from "@/lib/server/google-cloud/media-operations";
import { enqueueRadarVideoTextJob, marcarEstadoDaFonte } from "@/lib/server/radar-video-text";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * ENVIAR ÁUDIO DE UMA FONTE — §4 do Gate 2.2.
 *
 * Entrada deliberada do humano: o arquivo vem dele, não de um download.
 *
 *   arquivo → Cloud Storage (prefixo durável) → job → Local Worker → Speech
 *
 * O upload acontece AQUI porque o objeto precisa existir antes do job; a
 * transcrição acontece no worker, que tem claim, lease, heartbeat e retry.
 * Amarrar o Speech ao timeout de um request HTTP seria trocar o problema.
 */

/**
 * OS FORMATOS QUE O SPEECH REALMENTE ACEITA.
 *
 * Contêiner de vídeo NÃO entra: extrair a trilha de um `.mp4` exigiria
 * `ffmpeg`, que não existe nesta infraestrutura. Aceitar o arquivo e falhar
 * depois seria pior do que recusá-lo agora com o motivo escrito — quem opera
 * saberia só depois de esperar a fila.
 */
const FORMATOS_ACEITOS: Record<string, string> = {
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/webm": "webm",
  "audio/amr": "amr",
};

/** 480 MB: o limite prático do `longRunningRecognize` sobre objeto no Storage. */
const TAMANHO_MAXIMO = 480 * 1024 * 1024;

/* A fonte é da MARCA — §2.3.2. O artigo é contexto, não fronteira. */
const CampoSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256).nullable().optional(),
  videoSourceId: z.string().uuid(),
  languageCode: z.string().trim().min(2).max(20).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const parsed = CampoSchema.safeParse({
      brandId: String(form.get("brandId") || ""),
      articleId: form.get("articleId") ? String(form.get("articleId")) : null,
      videoSourceId: String(form.get("videoSourceId") || ""),
      languageCode: form.get("languageCode") ? String(form.get("languageCode")) : null,
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Envio de mídia inválido.", issues: parsed.error.flatten() }, { status: 400 });

    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) return NextResponse.json({ success: false, error: "Nenhum arquivo foi enviado." }, { status: 400 });

    const tipo = (arquivo.type || "").toLowerCase().trim();
    const extensao = FORMATOS_ACEITOS[tipo];
    if (!extensao) {
      return NextResponse.json({
        success: false,
        error: `Formato não aceito nesta fase: ${tipo || "desconhecido"}. O Speech-to-Text transcreve áudio; extrair a trilha de um arquivo de vídeo exigiria um conversor que esta infraestrutura não possui.`,
        accepted: [...new Set(Object.values(FORMATOS_ACEITOS))],
      }, { status: 415 });
    }
    if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO) {
      return NextResponse.json({ success: false, error: "O arquivo está vazio ou excede o limite desta fase." }, { status: 413 });
    }

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "edit" });

    /* A fonte precisa ser desta marca, conferido no servidor. */
    const fonte = await context.supabase
      .from("radar_video_sources")
      .select("id,text_state,uploaded_media_uri")
      .eq("brand_id", context.brandId)
      .eq("id", parsed.data.videoSourceId)
      .maybeSingle();
    if (fonte.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler a fonte: ${fonte.error.message}`, 503);
    if (!fonte.data) throw new PipelineRuntimeError("NOT_AUTHORIZED", "A fonte não pertence à biblioteca desta marca.", 403);

    const linha = fonte.data as { text_state: string; uploaded_media_uri: string | null };
    if (linha.text_state === "TEXT_READY") {
      return NextResponse.json({ success: true, uploaded: false, reused: true, reason: "O texto desta fonte já foi preservado." });
    }
    if (linha.text_state === "QUEUED" || linha.text_state === "PROCESSING") {
      return NextResponse.json({ success: true, uploaded: false, reused: true, reason: "Já existe uma extração em andamento para esta fonte." });
    }

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");

    const enviado = await uploadSharedRadarVideoMedia({
      actorUserId: context.actorUserId,
      brandId: context.brandId,
      client: context.supabase,
      videoSourceId: parsed.data.videoSourceId,
      data: bytes,
      contentType: tipo,
      fileName: `original.${extensao}`,
      checksum,
    });

    /*
     * A IDENTIDADE DA MÍDIA É GRAVADA ANTES DO JOB.
     *
     * É ela que faz a capability `MEDIA_FILE_TO_SPEECH` existir para esta
     * fonte. Se o job nascesse primeiro, o worker leria uma fonte sem mídia e
     * bloquearia por falta de caminho — com o arquivo já no Storage.
     */
    const gravado = await context.supabase
      .from("radar_video_sources")
      .update({
        uploaded_media_uri: enviado.result.uri,
        uploaded_media_content_type: tipo,
        uploaded_media_checksum: checksum,
        uploaded_media_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("brand_id", context.brandId)
      .eq("id", parsed.data.videoSourceId);
    if (gravado.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível registrar a mídia enviada: ${gravado.error.message}`, 503);

    const enfileirado = await enqueueRadarVideoTextJob({
      brandId: context.brandId,
      videoSourceId: parsed.data.videoSourceId,
      payload: {
        method: "MEDIA_FILE_TO_SPEECH",
        storedAudioUri: enviado.result.uri,
        ...(parsed.data.languageCode ? { languageCode: parsed.data.languageCode } : {}),
      },
      client: context.supabase,
    });

    if (enfileirado.duplicate) {
      await marcarEstadoDaFonte({ brandId: context.brandId, videoSourceId: parsed.data.videoSourceId, state: "QUEUED", reason: null, client: context.supabase });
    }

    return NextResponse.json({
      success: true,
      uploaded: true,
      queued: !enfileirado.duplicate,
      reused: enfileirado.duplicate,
      durableUri: enviado.result.uri,
      checksum,
      reason: "Mídia preservada no Storage e extração enfileirada. O Local Worker transcreve.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Envio de mídia inválido.", issues: error.flatten() }, { status: 400 });
    if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha ao enviar a mídia do vídeo." }, { status: 500 });
  }
}
