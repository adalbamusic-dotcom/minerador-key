import { NextResponse } from "next/server";
import { z } from "zod";
import { radarVideoMetadataCanRequest } from "@/lib/radar/video-text-acquisition";
import { fetchSharedYouTubeMetadata } from "@/lib/server/google-cloud/media-operations";
import { persistRadarVideoMetadata } from "@/lib/server/radar-video-text";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * OBTER OS METADADOS PÚBLICOS DE UMA FONTE — §7.
 *
 * É a única coisa que a YouTube Data API alcança com a API key atual, e vale
 * tanto para vídeo da marca quanto de terceiro.
 *
 * ISTO NÃO INICIA TRANSCRIÇÃO. Nenhum job é criado, nada vai para o Storage e
 * o Speech não é chamado. O estado do texto só avança de `REGISTERED` para
 * `METADATA_READY`, que continua dizendo que o texto não existe.
 *
 * AÇÃO EXPLÍCITA: nenhuma coleta acontece no F5 nem ao registrar a fonte.
 */

/*
 * A FONTE É DA MARCA — §2.3.2. O artigo é opcional aqui.
 *
 * Pedir metadado é ação sobre a BIBLIOTECA, e a biblioteca existe sem artigo
 * nenhum selecionado. `articleId` sobrevive apenas como contexto de quem pediu.
 */
const RequestSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256).nullable().optional(),
  videoSourceId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido de metadados inválido.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "edit" });

    const fonte = await context.supabase
      .from("radar_video_sources")
      .select("id,source_kind,normalized_url,youtube_video_id,metadata_fetched_at")
      .eq("brand_id", context.brandId)
      .eq("id", parsed.data.videoSourceId)
      .maybeSingle();
    if (fonte.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler a fonte: ${fonte.error.message}`, 503);
    /* A marca é a fronteira. Filtrar por artigo recusaria a própria fonte da marca. */
    if (!fonte.data) throw new PipelineRuntimeError("NOT_AUTHORIZED", "A fonte não pertence à biblioteca desta marca.", 403);

    const linha = fonte.data as { source_kind: string; normalized_url: string; youtube_video_id: string | null; metadata_fetched_at: string | null };

    const permitido = radarVideoMetadataCanRequest({
      kind: linha.source_kind as "YOUTUBE",
      hasMetadata: Boolean(linha.metadata_fetched_at),
    });
    if (!permitido.allowed) {
      return NextResponse.json({ success: false, fetched: false, error: permitido.reason }, { status: 409 });
    }

    /*
     * O `videoId` JÁ FOI EXTRAÍDO DA URL no registro, deterministicamente. Usar
     * o gravado em vez de reanalisar a URL mantém a identidade da fonte e a
     * consulta ao provider falando do mesmo vídeo.
     */
    const metadata = await fetchSharedYouTubeMetadata({
      actorUserId: context.actorUserId,
      brandId: context.brandId,
      client: context.supabase,
      videoUrlOrId: linha.youtube_video_id || linha.normalized_url,
    });

    const gravado = await persistRadarVideoMetadata({
      brandId: context.brandId,
      videoSourceId: parsed.data.videoSourceId,
      metadata: {
        videoId: metadata.result.videoId,
        title: metadata.result.title,
        channelId: metadata.result.channelId,
        channelTitle: metadata.result.channelTitle,
        description: metadata.result.description,
        publishedAt: metadata.result.publishedAt,
        duration: metadata.result.duration,
        thumbnails: metadata.result.thumbnails as Record<string, unknown>,
      },
      client: context.supabase,
    });

    return NextResponse.json({
      success: true,
      fetched: true,
      textState: gravado.textState,
      /* Dito para quem opera: metadado não é texto. */
      reason: "Metadados públicos obtidos. O texto do vídeo continua não disponível por esta via.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Pedido de metadados inválido.", issues: error.flatten() }, { status: 400 });
    if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha ao obter os metadados do vídeo." }, { status: 500 });
  }
}
