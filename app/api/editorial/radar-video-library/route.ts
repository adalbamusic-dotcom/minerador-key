import { NextResponse } from "next/server";
import { z } from "zod";
import { decideRadarVideoArchive, decideRadarVideoProcessing, overlayRadarArticleSelection, summarizeRadarVideoArchive, type RadarLibrarySource } from "@/lib/radar/video-library";
import { radarVideoAcquisitionCapability } from "@/lib/radar/video-text-acquisition";
import { enqueueRadarVideoTextJob } from "@/lib/server/radar-video-text";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * AS AÇÕES DA BIBLIOTECA — seleção, processamento e arquivamento.
 *
 * SELECIONAR NÃO PROCESSA (§12). O checkbox cria ou desfaz o vínculo entre o
 * artigo e a fonte, e mais nada: nenhum provider é tocado ao marcar.
 *
 * ARQUIVAR NÃO APAGA (§14, §15, §16). Uma fonte pode sustentar evidência
 * congelada; se ela sumisse, o congelamento deixaria de provar o que provava.
 * A recusa é declarada POR ITEM, com motivo.
 */

/**
 * DUAS CAMADAS, DUAS EXIGÊNCIAS — §2.3.2.
 *
 * `ARCHIVE` e `CLEAR_LIST` são da BIBLIOTECA e não precisam de artigo nenhum.
 * `SELECT`, `UNSELECT` e `PROCESS_SELECTED` são do ARTIGO e não existem sem um
 * — mas a recusa tem de ser explícita, e não um artigo implícito inventado
 * para fazer a requisição passar.
 */
const ACOES_DO_ARTIGO = ["SELECT", "UNSELECT", "PROCESS_SELECTED"] as const;

const AcaoSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256).nullable().optional(),
  action: z.enum(["SELECT", "UNSELECT", "PROCESS_SELECTED", "ARCHIVE", "CLEAR_LIST"]),
  videoSourceIds: z.array(z.string().uuid()).max(500).default([]),
}).strict();

const COLUNAS = "id,brand_id,article_id,source_kind,original_url,normalized_url,normalized_url_hash,youtube_video_id,display_name,registration_status,registered_by,registration_article_dna_version_id,registration_article_dna_content_hash,text_state,text_state_reason,metadata_fetched_at,video_title,channel_id,channel_title,video_description,published_at,duration,thumbnails,uploaded_media_uri,uploaded_media_content_type,uploaded_media_at,created_at,updated_at";

type Contexto = Awaited<ReturnType<typeof resolvePipelineContext>>;

/** A biblioteca da marca, com a seleção do artigo corrente por cima — se houver. */
async function lerBiblioteca(context: Contexto, articleId: string | null): Promise<RadarLibrarySource[]> {
  const fontes = await context.supabase.from("radar_video_sources").select(COLUNAS).eq("brand_id", context.brandId);
  if (fontes.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler a biblioteca: ${fontes.error.message}`, 503);

  const vinculos = await context.supabase
    .from("radar_article_video_sources")
    .select("article_id,video_source_id")
    .eq("brand_id", context.brandId)
    .eq("status", "ACTIVE");
  if (vinculos.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler as seleções: ${vinculos.error.message}`, 503);

  const linhas = (vinculos.data || []) as unknown as Array<{ article_id: string; video_source_id: string }>;

  /* A sobreposição é decisão do domínio — uma só, conferível sem banco. */
  const projetadas = ((fontes.data || []) as unknown as Array<Record<string, unknown>>).map(linha => ({
    id: String(linha.id), brandId: String(linha.brand_id), articleId: (linha.article_id as string) ?? null,
    sourceKind: String(linha.source_kind), originalUrl: String(linha.original_url),
    normalizedUrl: String(linha.normalized_url), normalizedUrlHash: String(linha.normalized_url_hash),
    youtubeVideoId: (linha.youtube_video_id as string) ?? null, displayName: (linha.display_name as string) ?? null,
    registrationStatus: String(linha.registration_status), registeredBy: (linha.registered_by as string) ?? null,
    registrationArticleDnaVersionId: (linha.registration_article_dna_version_id as string) ?? null,
    registrationArticleDnaContentHash: (linha.registration_article_dna_content_hash as string) ?? null,
    textState: String(linha.text_state), textStateReason: (linha.text_state_reason as string) ?? null,
    metadataFetchedAt: (linha.metadata_fetched_at as string) ?? null, videoTitle: (linha.video_title as string) ?? null,
    channelId: (linha.channel_id as string) ?? null, channelTitle: (linha.channel_title as string) ?? null,
    videoDescription: (linha.video_description as string) ?? null, publishedAt: (linha.published_at as string) ?? null,
    duration: (linha.duration as string) ?? null, thumbnails: (linha.thumbnails as Record<string, unknown>) ?? null,
    uploadedMediaUri: (linha.uploaded_media_uri as string) ?? null,
    uploadedMediaContentType: (linha.uploaded_media_content_type as string) ?? null,
    uploadedMediaAt: (linha.uploaded_media_at as string) ?? null,
    createdAt: String(linha.created_at), updatedAt: String(linha.updated_at),
  }));

  return overlayRadarArticleSelection({
    sources: projetadas,
    links: linhas.map(item => ({ articleId: item.article_id, videoSourceId: item.video_source_id })),
    articleId,
  }) as RadarLibrarySource[];
}

/** As fontes citadas por qualquer investigação congelada desta marca. */
async function fontesCongeladas(context: Contexto): Promise<string[]> {
  /*
   * A PROVENIÊNCIA VEM DO TEXTO PRESERVADO — §16.
   *
   * Uma fonte cujo texto já foi gravado pode ter sido citada por evidência
   * congelada, e o bundle precisa continuar resolvível. Errar para o lado de
   * PRESERVAR é o único erro barato aqui: arquivar de menos incomoda; arquivar
   * uma fonte que sustenta histórico quebra o histórico.
   */
  const textos = await context.supabase
    .from("radar_video_source_texts")
    .select("video_source_id")
    .eq("brand_id", context.brandId);
  if (textos.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível conferir a proveniência: ${textos.error.message}`, 503);
  return [...new Set(((textos.data || []) as unknown as Array<{ video_source_id: string }>).map(item => item.video_source_id))];
}

export async function POST(request: Request) {
  try {
    const parsed = AcaoSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Ação da biblioteca inválida.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "edit" });
    const { action, videoSourceIds } = parsed.data;
    const articleId = parsed.data.articleId || null;

    /*
     * A CAMADA DO ARTIGO RECUSA EM VOZ ALTA — §2.3.2.
     *
     * Sem artigo, selecionar não tem sujeito. Escolher um artigo qualquer para
     * a requisição não falhar gravaria uso que ninguém declarou.
     */
    if (!articleId && (ACOES_DO_ARTIGO as readonly string[]).includes(action)) {
      return NextResponse.json({
        success: false,
        code: "ARTICLE_REQUIRED",
        error: "Esta ação pertence a um artigo. Selecione o artigo antes de declarar o uso das fontes.",
      }, { status: 400 });
    }

    const biblioteca = await lerBiblioteca(context, articleId);
    const porId = new Map(biblioteca.map(item => [item.id, item]));
    /* Só fontes desta marca entram: o corpo da requisição não é autoridade. */
    const alvos = videoSourceIds.filter(id => porId.has(id));

    if (action === "SELECT" || action === "UNSELECT") {
      /*
       * O CHECKBOX NÃO PROCESSA — §12. Ele só declara o uso.
       *
       * `UNSELECT` marca `REMOVED` em vez de apagar a linha: a história de que
       * o artigo usou aquela fonte um dia continua existindo, e a fonte segue
       * inteira na biblioteca e nos outros artigos.
       */
      if (action === "SELECT" && alvos.length) {
        const insercao = await context.supabase.from("radar_article_video_sources").upsert(
          alvos.map(id => ({ brand_id: context.brandId, article_id: articleId, video_source_id: id, status: "ACTIVE", selected_by: context.actorUserId, selected_at: new Date().toISOString(), removed_at: null })),
          { onConflict: "brand_id,article_id,video_source_id" },
        );
        if (insercao.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível selecionar: ${insercao.error.message}`, 503);
      }
      if (action === "UNSELECT" && alvos.length) {
        const remocao = await context.supabase
          .from("radar_article_video_sources")
          .update({ status: "REMOVED", removed_at: new Date().toISOString() })
          .eq("brand_id", context.brandId)
          .eq("article_id", articleId)
          .in("video_source_id", alvos);
        if (remocao.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível remover deste artigo: ${remocao.error.message}`, 503);
      }
      return NextResponse.json({ success: true, action, affected: alvos.length, sources: await lerBiblioteca(context, articleId) });
    }

    if (action === "PROCESS_SELECTED") {
      /*
       * SÓ AS SELECIONADAS PARTICIPAM — §7. A biblioteca inteira não entra.
       *
       * E "processar" não significa chamar Speech para todas: texto pronto é
       * reusado, job em andamento é reusado, e sem via de aquisição a fonte é
       * declarada em vez de tentada.
       */
      const selecionadas = biblioteca.filter(item => item.selectedForArticle && item.registrationStatus !== "ARCHIVED");
      const decisoes = decideRadarVideoProcessing({ selected: selecionadas });

      for (const decisao of decisoes) {
        if (decisao.outcome !== "ENQUEUED") continue;
        const fonte = porId.get(decisao.videoSourceId);
        if (!fonte) continue;
        const capacidade = radarVideoAcquisitionCapability({ kind: fonte.sourceKind as "YOUTUBE", hasUploadedMedia: Boolean(fonte.uploadedMediaUri) });
        await enqueueRadarVideoTextJob({
          brandId: context.brandId,
          videoSourceId: decisao.videoSourceId,
          payload: { method: capacidade.method, ...(fonte.uploadedMediaUri ? { storedAudioUri: fonte.uploadedMediaUri } : {}) },
          client: context.supabase,
        });
      }

      return NextResponse.json({
        success: true, action,
        decisions: decisoes,
        enqueued: decisoes.filter(item => item.outcome === "ENQUEUED").length,
        reusedText: decisoes.filter(item => item.outcome === "REUSED_TEXT").length,
        sources: await lerBiblioteca(context, articleId),
      });
    }

    /* ARCHIVE e CLEAR_LIST: a política decide, e a recusa é por item. */
    const escopo = action === "CLEAR_LIST"
      ? biblioteca.filter(item => item.registrationStatus !== "ARCHIVED")
      : biblioteca.filter(item => alvos.includes(item.id));

    const decisoes = decideRadarVideoArchive({
      sources: escopo,
      currentArticleId: articleId,
      frozenSourceIds: await fontesCongeladas(context),
      clearList: action === "CLEAR_LIST",
    });

    const arquivar = decisoes.filter(item => item.outcome === "ARCHIVED").map(item => item.videoSourceId);
    if (arquivar.length) {
      const atualizacao = await context.supabase
        .from("radar_video_sources")
        .update({ registration_status: "ARCHIVED", updated_at: new Date().toISOString() })
        .eq("brand_id", context.brandId)
        .in("id", arquivar);
      if (atualizacao.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível arquivar: ${atualizacao.error.message}`, 503);
    }

    return NextResponse.json({
      success: true, action,
      decisions: decisoes,
      summary: summarizeRadarVideoArchive(decisoes),
      sources: await lerBiblioteca(context, articleId),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Ação da biblioteca inválida.", issues: error.flatten() }, { status: 400 });
    if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha na ação da biblioteca de vídeos." }, { status: 500 });
  }
}
