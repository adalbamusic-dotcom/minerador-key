import { NextResponse } from "next/server";
import { z } from "zod";
import {
  matchRadarVideoBriefs,
  radarExtractRunFingerprint,
  type RadarMatchableSource,
} from "@/lib/radar/video-brief-matching";
import { persistRadarExtractRun } from "@/lib/server/radar-video-brief-extracts";
import { loadRadarVideoBriefMatching, readRadarFrozenVideoBriefs } from "@/lib/server/radar-video-matching-read";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";

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

/*
 * A LEITURA CANÔNICA É DINÂMICA — §8.
 *
 * Ela depende da marca, do artigo e do que o banco tem AGORA. Uma projeção
 * guardada em cache devolveria, depois de um casamento, o estado anterior — e
 * o sintoma seria idêntico ao que este gate corrige: a tela discordando do
 * banco. Nada aqui se resolve com F5 duplo ou espera.
 */
export const dynamic = "force-dynamic";

const CorpoSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
}).strict();

const ConsultaSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
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

function falha(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Requisição de casamento inválida.", issues: error.flatten() }, { status: 400 });
  if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha no casamento de vídeo." }, { status: 500 });
}

/**
 * LER O CASAMENTO GRAVADO — nunca recalcula, nunca grava.
 *
 * VIDEOS_3.4.1 · É esta leitura que faz o resultado sobreviver ao F5, e ela
 * não existia no caminho da tela: a página vivia do que o POST devolvia, e
 * recarregar apagava um casamento íntegro no banco.
 *
 * O `frozenBundleId` SAIU DA CONSULTA. Ele é derivado no servidor, da mesma
 * investigação congelada que o casamento usou — exigi-lo do cliente obrigava a
 * tela a conhecer bundle para poder pedir o próprio resultado.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = ConsultaSchema.safeParse({
      brandId: url.searchParams.get("brandId") || "",
      articleId: url.searchParams.get("articleId") || "",
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Consulta de casamento inválida.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "view" });
    const gravado = await loadRadarVideoBriefMatching({
      brandId: context.brandId, articleId: parsed.data.articleId, client: context.supabase,
    });

    return NextResponse.json({
      success: true,
      run: gravado.run,
      coverage: gravado.coverage,
      summary: gravado.summary,
      matcherVersion: gravado.matcherVersion,
      inputFingerprint: gravado.inputFingerprint,
      frozenBundleId: gravado.frozenBundleId,
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

    const pautas = await readRadarFrozenVideoBriefs(context.brandId, parsed.data.articleId);
    if (!pautas) {
      return NextResponse.json({
        success: false, code: "FROZEN_INVESTIGATION_REQUIRED",
        error: "Este artigo ainda não tem investigação congelada com pautas de vídeo. O casamento se amarra ao bundle congelado; sem ele, o recorte mudaria de sentido na próxima investigação.",
      }, { status: 409 });
    }

    const fontes = await lerFontesDoArtigo(context, parsed.data.articleId);
    const { coverage, skippedWithoutText, candidatesFound } = matchRadarVideoBriefs({ briefs: pautas.briefs, sources: fontes });
    /*
     * SÓ OS EXTRATOS EDITORIAIS SÃO GRAVADOS — VIDEOS 3.3 · §1 e §6.
     *
     * `candidatesFound` conta as janelas que o material sustentou; `extracts`
     * são as poucas que a seleção editorial manteve. Os dois números viajam na
     * resposta porque a diferença entre eles é o assunto deste gate: a m2
     * gravava os 509 candidatos como se fossem evidência.
     */
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

    /*
     * READBACK PELA MESMA PROJEÇÃO QUE O F5 USA — VIDEOS_3.4.1 · §4.
     *
     * O que respondemos é o que o banco confirmou, e é o MESMO objeto que a
     * tela receberia ao recarregar. Enquanto eram duas montagens, o clique
     * mostrava uma coisa e o F5 outra — que foi exatamente o defeito.
     */
    const gravado = await loadRadarVideoBriefMatching({
      brandId: context.brandId, articleId: parsed.data.articleId, client: context.supabase,
    });

    return NextResponse.json({
      success: true,
      run: gravado.run,
      reused: execucao.reused,
      coverage: gravado.coverage,
      summary: gravado.summary,
      matcherVersion: gravado.matcherVersion,
      inputFingerprint: gravado.inputFingerprint,
      candidatesFound,
      /* Fonte selecionada SEM texto não é erro: é uma extração que falta fazer. */
      skippedWithoutText,
      readbackConfirmed: true,
      persistenceMode: "remote",
    });
  } catch (error) {
    return falha(error);
  }
}
