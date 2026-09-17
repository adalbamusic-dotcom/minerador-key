import { NextResponse } from "next/server";
import { z } from "zod";
import { radarVideoAcquisitionCapability, RADAR_VIDEO_ACQUISITION_TODAY } from "@/lib/radar/video-text-acquisition";
import { RadarVideoSourceTextSchema } from "@/lib/radar/video-source";
import { enqueueRadarVideoTextJob, marcarEstadoDaFonte } from "@/lib/server/radar-video-text";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * A AÇÃO EXPLÍCITA DE EXTRAIR TEXTO — §3.
 *
 * Enfileira e para. Nenhum provider é chamado aqui: quem executa é o Local
 * Worker, que já tem claim, lease, heartbeat, retry e backoff provados.
 *
 * IDEMPOTENTE POR CONSTRUÇÃO — §12. Quem recusa o segundo job é o índice único
 * parcial do banco, não um debounce de interface: dois cliques, duas abas ou um
 * F5 no meio do caminho chegam à mesma resposta.
 */

const RequestSchema = z.object({
  brandId: z.string().uuid(),
  /* A fonte é da MARCA — §2.3.2. O artigo é contexto, não fronteira. */
  articleId: z.string().trim().min(1).max(256).nullable().optional(),
  videoSourceId: z.string().uuid(),
  /**
   * O texto que o humano já tem, quando tem. É o primeiro degrau da escada do
   * §4 e não custa provider nenhum.
   */
  providedTranscript: z.string().trim().min(1).max(2_000_000).nullable().optional(),
  languageCode: z.string().trim().min(2).max(20).nullable().optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido de extração inválido.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "edit" });

    const fonte = await context.supabase
      .from("radar_video_sources")
      .select("id,source_kind,text_state")
      .eq("brand_id", context.brandId)
      .eq("id", parsed.data.videoSourceId)
      .maybeSingle();
    if (fonte.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler a fonte: ${fonte.error.message}`, 503);
    if (!fonte.data) throw new PipelineRuntimeError("NOT_AUTHORIZED", "A fonte não pertence à biblioteca desta marca.", 403);

    const linha = fonte.data as { source_kind: string; text_state: string };

    /*
     * A CAPACIDADE É CONFERIDA ANTES DE ENFILEIRAR.
     *
     * Enfileirar um job que o worker vai bloquear por falta de caminho gastaria
     * uma volta inteira da fila para descobrir o que já se sabe aqui — e
     * deixaria a fonte parecendo "na fila" sem nunca sair dela.
     */
    const capacidade = radarVideoAcquisitionCapability({
      kind: linha.source_kind as "YOUTUBE",
      hasProvidedTranscript: Boolean(parsed.data.providedTranscript),
      infrastructure: RADAR_VIDEO_ACQUISITION_TODAY,
    });

    if (!capacidade.available) {
      await marcarEstadoDaFonte({
        brandId: context.brandId, videoSourceId: parsed.data.videoSourceId,
        state: "TEXT_ACQUISITION_UNAVAILABLE", reason: capacidade.reason, client: context.supabase,
      });
      return NextResponse.json({
        success: false, queued: false, code: "TEXT_ACQUISITION_UNAVAILABLE",
        error: capacidade.reason, requires: capacidade.requires,
      }, { status: 409 });
    }

    if (linha.text_state === "TEXT_READY") {
      return NextResponse.json({ success: true, queued: false, reused: true, reason: "O texto desta fonte já foi preservado." });
    }

    const enfileirado = await enqueueRadarVideoTextJob({
      brandId: context.brandId,
      videoSourceId: parsed.data.videoSourceId,
      payload: {
        method: capacidade.method,
        ...(parsed.data.providedTranscript ? { providedTranscript: parsed.data.providedTranscript } : {}),
        ...(parsed.data.languageCode ? { languageCode: parsed.data.languageCode } : {}),
      },
      client: context.supabase,
    });

    /* Duplicata não é erro: é o segundo clique encontrando o primeiro job. */
    return NextResponse.json({
      success: true,
      queued: !enfileirado.duplicate,
      reused: enfileirado.duplicate,
      method: capacidade.method,
      reason: enfileirado.duplicate ? "Já existe uma extração em andamento para esta fonte." : "Extração enfileirada.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Pedido de extração inválido.", issues: error.flatten() }, { status: 400 });
    if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha na extração de texto do vídeo." }, { status: 500 });
  }
}

/**
 * O TEXTO INTEIRO DE UMA FONTE, SOB DEMANDA — RADAR_LIVE_UX_2.2 · §8.
 *
 * ======================== POR QUE ESTE GET EXISTE ========================
 *
 * A listagem da área devolvia `transcript_text` e `segments` de TODAS as fontes
 * da marca: 420,7 KB por leitura no acervo real, 94,9% deles em transcrições
 * que ninguém tinha aberto. Com a área revalidando sozinha — que é o ponto
 * deste gate — esse peso passaria a trafegar a cada poucos segundos.
 *
 * A listagem passou a mandar resumo. O texto inteiro vem por aqui, UMA FONTE
 * POR VEZ, quando alguém abre "Ver transcrição completa".
 *
 * ============================ O QUE ELE NÃO FAZ ============================
 *
 * NÃO enfileira, NÃO extrai, NÃO chama provider e NÃO muda estado nenhum. É
 * leitura pura, com a permissão de leitura da área — abrir um disclosure não
 * pode ser uma ação de escrita disfarçada.
 */

const ConsultaDeTextoSchema = z.object({
  brandId: z.string().uuid(),
  videoSourceId: z.string().uuid(),
}).strict();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = ConsultaDeTextoSchema.safeParse({
      brandId: url.searchParams.get("brandId") || "",
      videoSourceId: url.searchParams.get("videoSourceId") || "",
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Consulta de transcrição inválida.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "view" });

    /*
     * A VERSÃO CORRENTE, E SÓ ELA.
     *
     * `radar_video_source_texts` é append-only por `processing_version`: o
     * histórico fica no banco e a tela lê a última. Devolver todas faria a
     * busca sob demanda recriar o peso que este gate acabou de tirar.
     */
    const resultado = await context.supabase
      .from("radar_video_source_texts")
      .select("id,video_source_id,source_method,provider,language_code,transcript_text,segments,has_timestamps,processing_version,created_at")
      .eq("brand_id", context.brandId)
      .eq("video_source_id", parsed.data.videoSourceId)
      .order("processing_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (resultado.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler a transcrição: ${resultado.error.message}`, 503);

    /*
     * AUSÊNCIA É RESPOSTA, NÃO ERRO. Uma fonte sem texto preservado ainda não
     * foi processada — a tela já sabe disso pelo `textState` e não deve tratar
     * o disclosure vazio como falha de leitura.
     */
    if (!resultado.data) return NextResponse.json({ success: true, text: null, reason: "Esta fonte ainda não tem texto preservado." });

    const linha = resultado.data as unknown as Record<string, unknown>;
    const text = RadarVideoSourceTextSchema.parse({
      id: String(linha.id), videoSourceId: String(linha.video_source_id),
      sourceMethod: String(linha.source_method), provider: linha.provider ?? null,
      languageCode: linha.language_code ?? null, transcriptText: String(linha.transcript_text || ""),
      segments: Array.isArray(linha.segments) ? linha.segments : [],
      hasTimestamps: Boolean(linha.has_timestamps),
      processingVersion: Number(linha.processing_version), createdAt: String(linha.created_at),
    });

    return NextResponse.json({ success: true, text, persistenceMode: "remote" });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Consulta de transcrição inválida.", issues: error.flatten() }, { status: 400 });
    if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha ao ler a transcrição." }, { status: 500 });
  }
}
