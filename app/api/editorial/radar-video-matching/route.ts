import { NextResponse } from "next/server";
import { z } from "zod";
import {
  matchRadarVideoBriefs,
  radarCoverageFromExtracts,
  radarExtractRunFingerprint,
  summarizeRadarBriefCoverage,
  type RadarFrozenBriefInput,
  type RadarMatchableSource,
} from "@/lib/radar/video-brief-matching";
import { persistRadarExtractRun, readRadarExtractRun } from "@/lib/server/radar-video-brief-extracts";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { WorkflowRepository } from "@/lib/server/editorial-repositories";

/**
 * O CASAMENTO ENTRE PAUTA E CONTEÚDO — por ação humana, e só sobre o que já
 * está gravado.
 *
 * ZERO PROVIDER. Nenhuma URL é visitada, nenhum áudio é transcrito, nenhum
 * modelo é chamado: o casamento acontece sobre transcripts que já estão no
 * banco e pautas que já estão congeladas. Abrir a tela, clicar numa pauta ou
 * dar F5 não passam por aqui.
 *
 * A INVESTIGAÇÃO CONGELADA É PRÉ-REQUISITO. Sem bundle congelado não existe
 * identidade a que amarrar o recorte — e casar contra blueprint vivo produziria
 * evidência que muda de sentido na próxima investigação.
 */

const CorpoSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
}).strict();

const ConsultaSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  frozenBundleId: z.string().trim().min(1).max(256),
});

type Contexto = Awaited<ReturnType<typeof resolvePipelineContext>>;

const COLUNAS_FONTE = "id,registration_status,text_state,display_name";
const COLUNAS_TEXTO = "video_source_id,language_code,transcript_text,segments,has_timestamps,processing_version";

/**
 * AS FONTES QUE O ARTIGO SELECIONOU, com o texto delas.
 *
 * A biblioteca inteira NÃO entra: só o que este artigo declarou usar. E o
 * texto vem da versão corrente de cada fonte — a maior `processing_version`.
 */
async function lerFontesDoArtigo(context: Contexto, articleId: string): Promise<RadarMatchableSource[]> {
  const vinculos = await context.supabase
    .from("radar_article_video_sources")
    .select("video_source_id")
    .eq("brand_id", context.brandId)
    .eq("article_id", articleId)
    .eq("status", "ACTIVE");
  if (vinculos.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler as seleções: ${vinculos.error.message}`, 503);

  const ids = [...new Set(((vinculos.data || []) as unknown as Array<{ video_source_id: string }>).map(item => item.video_source_id))];
  if (!ids.length) return [];

  const fontes = await context.supabase.from("radar_video_sources").select(COLUNAS_FONTE).eq("brand_id", context.brandId).in("id", ids);
  if (fontes.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler as fontes: ${fontes.error.message}`, 503);

  const textos = await context.supabase
    .from("radar_video_source_texts").select(COLUNAS_TEXTO)
    .eq("brand_id", context.brandId).in("video_source_id", ids)
    .order("processing_version", { ascending: false });
  if (textos.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler os textos: ${textos.error.message}`, 503);

  /* A ordenação já traz a maior versão primeiro; a primeira de cada fonte vence. */
  const correntes = new Map<string, Record<string, unknown>>();
  for (const linha of (textos.data || []) as unknown as Array<Record<string, unknown>>) {
    const chave = String(linha.video_source_id);
    if (!correntes.has(chave)) correntes.set(chave, linha);
  }

  return ((fontes.data || []) as unknown as Array<Record<string, unknown>>).map(linha => {
    const texto = correntes.get(String(linha.id));
    return {
      videoSourceId: String(linha.id),
      displayName: (linha.display_name as string) ?? null,
      textState: String(linha.text_state) as RadarMatchableSource["textState"],
      selectedForArticle: true,
      registrationStatus: String(linha.registration_status),
      languageCode: (texto?.language_code as string) ?? null,
      processingVersion: Number(texto?.processing_version ?? 1),
      segments: Array.isArray(texto?.segments) ? (texto!.segments as RadarMatchableSource["segments"]) : [],
      transcriptText: String(texto?.transcript_text ?? ""),
    };
  });
}

/**
 * AS PAUTAS CONGELADAS DO ARTIGO. Sem elas não há casamento.
 *
 * O caminho é o mesmo que `radar-analysis` já usa — item do workflow, versões
 * de análise dentro do payload, bundle congelado dentro da análise. Reusar o
 * `WorkflowRepository` em vez de montar a consulta aqui é o que impede as duas
 * leituras de divergirem quando a de lá mudar.
 *
 * A escolhida é a análise MAIS RECENTE que tenha bundle congelado: uma análise
 * posterior sem congelamento não apaga a evidência da anterior.
 */
async function lerPautasCongeladas(brandId: string, articleId: string): Promise<{
  briefs: RadarFrozenBriefInput[]; frozenBundleId: string; frozenBundleHash: string;
} | null> {
  const item = await new WorkflowRepository().findByArticle(brandId, articleId, "radar");
  if (!item) return null;

  const payload = item.payload as { analysisVersions?: Array<{ payload?: Record<string, unknown> }> } | null;
  const versoes = Array.isArray(payload?.analysisVersions) ? payload.analysisVersions : [];

  for (const versao of [...versoes].reverse()) {
    const bundle = versao?.payload?.finalizedBundle as Record<string, unknown> | null | undefined;
    const blueprint = bundle?.blueprint as Record<string, unknown> | undefined;
    const snapshots = (blueprint?.videoBriefSnapshots as RadarFrozenBriefInput[] | undefined) || [];
    if (bundle?.bundleId && snapshots.length) {
      return {
        briefs: snapshots,
        frozenBundleId: String(bundle.bundleId),
        frozenBundleHash: String(bundle.bundleHash || ""),
      };
    }
  }
  return null;
}

function falha(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Requisição de casamento inválida.", issues: error.flatten() }, { status: 400 });
  if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha no casamento de vídeo." }, { status: 500 });
}

/** LER o casamento gravado. Nunca recalcula, nunca grava — é isto que sobrevive ao F5. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = ConsultaSchema.safeParse({
      brandId: url.searchParams.get("brandId") || "",
      articleId: url.searchParams.get("articleId") || "",
      frozenBundleId: url.searchParams.get("frozenBundleId") || "",
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Consulta de casamento inválida.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "view" });
    const pautas = await lerPautasCongeladas(context.brandId, parsed.data.articleId);
    const gravado = await readRadarExtractRun({
      brandId: context.brandId, articleId: parsed.data.articleId,
      frozenBundleId: parsed.data.frozenBundleId, client: context.supabase,
    });

    const coverage = pautas ? radarCoverageFromExtracts({ briefs: pautas.briefs, extracts: gravado.extracts }) : [];
    return NextResponse.json({
      success: true,
      run: gravado.run,
      coverage,
      summary: summarizeRadarBriefCoverage(coverage),
      persistenceMode: "remote",
    });
  } catch (error) {
    return falha(error);
  }
}

/** CASAR — ação explícita. Lê o que está gravado, compara, e grava a execução. */
export async function POST(request: Request) {
  try {
    const parsed = CorpoSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Requisição de casamento inválida.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "edit" });

    const pautas = await lerPautasCongeladas(context.brandId, parsed.data.articleId);
    if (!pautas) {
      return NextResponse.json({
        success: false, code: "FROZEN_INVESTIGATION_REQUIRED",
        error: "Este artigo ainda não tem investigação congelada com pautas de vídeo. O casamento se amarra ao bundle congelado; sem ele, o recorte mudaria de sentido na próxima investigação.",
      }, { status: 409 });
    }

    const fontes = await lerFontesDoArtigo(context, parsed.data.articleId);
    const { coverage, skippedWithoutText } = matchRadarVideoBriefs({ briefs: pautas.briefs, sources: fontes });
    const extracts = coverage.flatMap(item => item.extracts);

    const execucao = await persistRadarExtractRun({
      brandId: context.brandId,
      articleId: parsed.data.articleId,
      frozenBundleId: pautas.frozenBundleId,
      frozenBundleHash: pautas.frozenBundleHash,
      inputFingerprint: radarExtractRunFingerprint(fontes),
      extracts,
      actorUserId: context.actorUserId,
      client: context.supabase,
    });

    /* READBACK: o que respondemos é o que o banco confirmou, não o que casamos. */
    const gravado = await readRadarExtractRun({
      brandId: context.brandId, articleId: parsed.data.articleId,
      frozenBundleId: pautas.frozenBundleId, client: context.supabase,
    });
    const relido = radarCoverageFromExtracts({ briefs: pautas.briefs, extracts: gravado.extracts });

    return NextResponse.json({
      success: true,
      run: gravado.run,
      reused: execucao.reused,
      coverage: relido,
      summary: summarizeRadarBriefCoverage(relido),
      /* Fonte selecionada SEM texto não é erro: é uma extração que falta fazer. */
      skippedWithoutText,
      readbackConfirmed: true,
      persistenceMode: "remote",
    });
  } catch (error) {
    return falha(error);
  }
}
