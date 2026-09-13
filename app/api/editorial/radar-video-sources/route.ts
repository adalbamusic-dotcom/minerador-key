import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyRadarVideoSourceBatch, RadarVideoSourceSchema, RadarVideoSourceTextSchema, type RadarVideoSource, type RadarVideoSourceText } from "@/lib/radar/video-source";
import { overlayRadarArticleSelection } from "@/lib/radar/video-library";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * AS FONTES DELIBERADAS DE VÍDEO — escrita e leitura canônicas.
 *
 * Esta rota é a autoridade das fontes da área Vídeos. O estado React da tela
 * passa a ser cache do que veio daqui; ele não é mais a única cópia de nada.
 *
 * ZERO PROVIDER. Nenhuma URL é visitada, nenhuma API do YouTube é chamada,
 * nenhum arquivo é baixado, nenhum job é criado. O `videoId` sai da própria
 * string, deterministicamente, no domínio.
 *
 * SUCESSO SÓ DEPOIS DO READBACK. A escrita devolve o que o banco confirmou ter
 * gravado, relido numa segunda consulta — não o que enviamos. Sem isso, "salvo"
 * seria uma afirmação sobre a nossa intenção, não sobre o estado remoto.
 */

/*
 * A BIBLIOTECA CARREGA POR MARCA — §2.3.2.
 *
 * `articleId` é OPCIONAL nas duas operações. Sem ele a resposta é a biblioteca
 * crua da marca; com ele vem a mesma biblioteca mais a camada de seleção
 * daquele artigo. Exigi-lo era o que impedia administrar o acervo sem ter um
 * artigo aberto — e um artigo aberto não é pré-requisito de nada aqui.
 */
const ListQuerySchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256).nullable().optional(),
});

const RegisterSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256).nullable().optional(),
  /* O bloco colado, cru. A classificação é do domínio, não do cliente. */
  raw: z.string().min(1).max(20000),
  articleDnaVersionId: z.string().trim().min(1).max(256).nullable().optional(),
  articleDnaContentHash: z.string().trim().min(1).max(256).nullable().optional(),
}).strict();

type LinhaRemota = {
  id: string;
  brand_id: string;
  /* NULL desde o §2.3.2: cadastrar sem artigo não inventa proveniência. */
  article_id: string | null;
  source_kind: string;
  original_url: string;
  normalized_url: string;
  normalized_url_hash: string;
  youtube_video_id: string | null;
  display_name: string | null;
  registration_status: string;
  registered_by: string | null;
  registration_article_dna_version_id: string | null;
  registration_article_dna_content_hash: string | null;
  text_state: string;
  text_state_reason: string | null;
  metadata_fetched_at: string | null;
  video_title: string | null;
  channel_id: string | null;
  channel_title: string | null;
  video_description: string | null;
  published_at: string | null;
  duration: string | null;
  thumbnails: Record<string, unknown> | null;
  uploaded_media_uri: string | null;
  uploaded_media_content_type: string | null;
  uploaded_media_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLUNAS = "id,brand_id,article_id,source_kind,original_url,normalized_url,normalized_url_hash,youtube_video_id,display_name,registration_status,registered_by,registration_article_dna_version_id,registration_article_dna_content_hash,text_state,text_state_reason,metadata_fetched_at,video_title,channel_id,channel_title,video_description,published_at,duration,thumbnails,uploaded_media_uri,uploaded_media_content_type,uploaded_media_at,created_at,updated_at";
const COLUNAS_TEXTO = "id,video_source_id,source_method,provider,language_code,transcript_text,segments,has_timestamps,processing_version,created_at";

function projetar(linha: LinhaRemota): RadarVideoSource {
  return RadarVideoSourceSchema.parse({
    id: linha.id,
    brandId: linha.brand_id,
    articleId: linha.article_id,
    sourceKind: linha.source_kind,
    originalUrl: linha.original_url,
    normalizedUrl: linha.normalized_url,
    normalizedUrlHash: linha.normalized_url_hash,
    youtubeVideoId: linha.youtube_video_id,
    displayName: linha.display_name,
    registrationStatus: linha.registration_status,
    registeredBy: linha.registered_by,
    registrationArticleDnaVersionId: linha.registration_article_dna_version_id,
    registrationArticleDnaContentHash: linha.registration_article_dna_content_hash,
    textState: linha.text_state,
    textStateReason: linha.text_state_reason,
    metadataFetchedAt: linha.metadata_fetched_at,
    videoTitle: linha.video_title,
    channelId: linha.channel_id,
    channelTitle: linha.channel_title,
    videoDescription: linha.video_description,
    publishedAt: linha.published_at,
    duration: linha.duration,
    thumbnails: linha.thumbnails,
    uploadedMediaUri: linha.uploaded_media_uri,
    uploadedMediaContentType: linha.uploaded_media_content_type,
    uploadedMediaAt: linha.uploaded_media_at,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  });
}

/**
 * A BIBLIOTECA É DA MARCA — Gate 2.3, e sem artigo nenhum — Gate 2.3.2.
 *
 * A leitura devolve TODAS as fontes da marca. O artigo, QUANDO EXISTE, entra só
 * como uma camada por cima: quais delas ele selecionou. Filtrar por
 * `article_id` aqui é o que prendia a fonte a um artigo.
 *
 * `articleId` nulo é resposta legítima, não erro: é a biblioteca sendo lida por
 * quem ainda não abriu artigo nenhum. `articleUsageCount` continua contando o
 * uso em TODOS os artigos, porque essa informação é da fonte.
 */
async function lerFontes(context: Awaited<ReturnType<typeof resolvePipelineContext>>, articleId: string | null) {
  const resultado = await context.supabase
    .from("radar_video_sources")
    .select(COLUNAS)
    .eq("brand_id", context.brandId)
    .order("created_at", { ascending: true });
  if (resultado.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler as fontes de vídeo: ${resultado.error.message}`, 503);
  const fontes = ((resultado.data || []) as unknown as LinhaRemota[]).map(projetar);

  const vinculos = await context.supabase
    .from("radar_article_video_sources")
    .select("article_id,video_source_id,status")
    .eq("brand_id", context.brandId)
    .eq("status", "ACTIVE");
  if (vinculos.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler as seleções: ${vinculos.error.message}`, 503);

  const linhas = (vinculos.data || []) as unknown as Array<{ article_id: string; video_source_id: string }>;
  /* A sobreposição é decisão do domínio — uma só, conferível sem banco. */
  return overlayRadarArticleSelection({
    sources: fontes,
    links: linhas.map(item => ({ articleId: item.article_id, videoSourceId: item.video_source_id })),
    articleId,
  });
}

function falha(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Requisição de fontes de vídeo inválida.", issues: error.flatten() }, { status: 400 });
  if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha nas fontes de vídeo do Radar." }, { status: 500 });
}

/**
 * O TEXTO PRESERVADO DE CADA FONTE — a versão mais recente de cada uma.
 *
 * Append-only por `processing_version`: o histórico continua no banco, e a
 * leitura devolve a corrente. Nada aqui reprocessa nem chama provider.
 */
async function lerTextos(context: Awaited<ReturnType<typeof resolvePipelineContext>>, sources: RadarVideoSource[]) {
  if (!sources.length) return [] as RadarVideoSourceText[];
  const resultado = await context.supabase
    .from("radar_video_source_texts")
    .select(COLUNAS_TEXTO)
    .eq("brand_id", context.brandId)
    .in("video_source_id", sources.map(item => item.id))
    .order("processing_version", { ascending: false });
  if (resultado.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler o texto das fontes: ${resultado.error.message}`, 503);

  const correntes = new Map<string, RadarVideoSourceText>();
  for (const linha of (resultado.data || []) as unknown as Array<Record<string, unknown>>) {
    const projetado = RadarVideoSourceTextSchema.parse({
      id: String(linha.id), videoSourceId: String(linha.video_source_id),
      sourceMethod: String(linha.source_method), provider: linha.provider ?? null,
      languageCode: linha.language_code ?? null, transcriptText: String(linha.transcript_text || ""),
      segments: Array.isArray(linha.segments) ? linha.segments : [],
      hasTimestamps: Boolean(linha.has_timestamps),
      processingVersion: Number(linha.processing_version), createdAt: String(linha.created_at),
    });
    /* A ordenação já traz a maior versão primeiro; a primeira vence. */
    if (!correntes.has(projetado.videoSourceId)) correntes.set(projetado.videoSourceId, projetado);
  }
  return [...correntes.values()];
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    /* Ausência de `articleId` é a leitura da marca, não um parâmetro faltando. */
    const parsed = ListQuerySchema.safeParse({ brandId: url.searchParams.get("brandId") || "", articleId: url.searchParams.get("articleId") || null });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Consulta de fontes de vídeo inválida.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "view" });
    const sources = await lerFontes(context, parsed.data.articleId || null);
    return NextResponse.json({ success: true, sources, texts: await lerTextos(context, sources), persistenceMode: "remote" });
  } catch (error) {
    return falha(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = RegisterSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Registro de fontes de vídeo inválido.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "edit" });

    /*
     * A CLASSIFICAÇÃO CONFERE CONTRA O QUE JÁ ESTÁ GRAVADO, não contra o que a
     * tela acha que está. O cliente não envia a lista de existentes: ele não é
     * autoridade sobre ela.
     */
    /*
     * A DEDUPLICAÇÃO É POR MARCA — Gate 2.3.
     *
     * A mesma palestra colada num segundo artigo não cria fonte nova: ela já
     * está na biblioteca, e o que o segundo artigo faz é SELECIONÁ-LA.
     */
    const existentes = await lerFontes(context, parsed.data.articleId || null);
    const lote = classifyRadarVideoSourceBatch({
      raw: parsed.data.raw,
      existing: existentes.map(item => ({ normalizedUrlHash: item.normalizedUrlHash })),
    });

    if (lote.registrable.length) {
      const insercao = await context.supabase.from("radar_video_sources").insert(lote.registrable.map(item => ({
        brand_id: context.brandId,
        /*
         * Proveniência do cadastro, nunca identidade: a fonte é da marca.
         * Cadastrar sem artigo é fluxo principal (§2.3.2), e aí não há
         * proveniência de artigo a registrar — `null` diz isso.
         */
        article_id: parsed.data.articleId || null,
        source_kind: item.kind,
        original_url: item.raw.slice(0, 2048),
        normalized_url: item.normalizedUrl,
        normalized_url_hash: item.normalizedUrlHash,
        youtube_video_id: item.videoId,
        display_name: null,
        registration_status: "REGISTERED",
        registered_by: context.actorUserId,
        registration_article_dna_version_id: parsed.data.articleDnaVersionId || null,
        registration_article_dna_content_hash: parsed.data.articleDnaContentHash || null,
      })));
      /*
       * A corrida existe: duas abas podem registrar a mesma URL entre a leitura
       * e a escrita. A restrição de unicidade é quem decide, e o conflito dela
       * é REUSO — não erro. O readback abaixo mostra a linha que venceu.
       */
      if (insercao.error && insercao.error.code !== "23505") {
        throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível registrar as fontes de vídeo: ${insercao.error.message}`, 503);
      }
    }

    /* READBACK: o que respondemos é o que o banco confirmou, não o que enviamos. */
    const apos = await lerFontes(context, parsed.data.articleId || null);
    const gravadas = new Set(existentes.map(item => item.normalizedUrlHash));
    const registered = apos.filter(item => !gravadas.has(item.normalizedUrlHash));

    /*
     * CADASTRAR NÃO É SELECIONAR — §2.3.1. E é por isso que esta rota NÃO
     * escreve em `radar_article_video_sources`.
     *
     * São duas decisões distintas. Registrar diz "esta fonte pertence ao acervo
     * da marca"; selecionar diz "este artigo usa esta fonte". Colapsar as duas
     * faria a importação de 25 palestras declarar que o artigo corrente usa as
     * 25 — e a intenção de quem importa um acervo é justamente escolher depois.
     *
     * A seleção é do checkbox, e passa pela rota da biblioteca.
     */
    const coladas = new Set(lote.entries.flatMap(entry => entry.identity ? [entry.identity.normalizedUrlHash] : []));

    /*
     * COLAR DE NOVO READMITE O QUE FOI ARQUIVADO — e só isso.
     *
     * A alternativa seria criar uma segunda fonte para a mesma URL — o índice
     * parcial permite — e com ela abandonar a transcrição que a primeira já
     * tem. Readmitir preserva o texto, o histórico e a identidade.
     *
     * A fonte readmitida volta à BIBLIOTECA, não ao artigo: ela reaparece na
     * lista com o checkbox desmarcado, como qualquer outra.
     */
    const readmitir = apos.filter(item => coladas.has(item.normalizedUrlHash) && item.registrationStatus === "ARCHIVED");
    if (readmitir.length) {
      const revivida = await context.supabase
        .from("radar_video_sources")
        .update({ registration_status: "REGISTERED", updated_at: new Date().toISOString() })
        .eq("brand_id", context.brandId)
        .in("id", readmitir.map(item => item.id));
      if (revivida.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível readmitir as fontes arquivadas: ${revivida.error.message}`, 503);
    }

    const sources = await lerFontes(context, parsed.data.articleId || null);

    return NextResponse.json({
      success: true,
      sources,
      registered: registered.length,
      entries: lote.entries.map(entry => ({ raw: entry.raw, verdict: entry.verdict, reason: entry.reason })),
      counts: lote.counts,
      readbackConfirmed: true,
      persistenceMode: "remote",
    });
  } catch (error) {
    return falha(error);
  }
}
