import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import type { RadarRelevantExtract } from "@/lib/radar/video-brief-matching";

/**
 * A PERSISTÊNCIA DO CASAMENTO — execução nova supera, nunca sobrescreve.
 *
 * O §8 pede duas coisas que puxam em direções opostas:
 *
 *   idempotência   o mesmo material não pode gerar recorte duplicado;
 *   história       recortar de novo não pode apagar o recorte anterior.
 *
 * A saída é a EXECUÇÃO. Ela carrega a impressão digital do material (fontes +
 * versão de transcript de cada uma): material idêntico devolve a execução que
 * já existe; material diferente cria outra e SUPERA a anterior, que fica
 * gravada e legível.
 *
 * Nada aqui chama provider, e nada reprocessa transcript.
 */

type Cliente = SupabaseClient;
const clienteOu = (client?: Cliente) => client || createCanonicalServiceClient();

function falhar(resultado: { error: { message: string } | null }, contexto: string) {
  if (resultado.error) throw new Error(`${contexto}: ${resultado.error.message}`);
}

export type RadarExtractRun = {
  runId: string;
  frozenBundleId: string;
  frozenBundleHash: string;
  inputFingerprint: string;
  createdAt: string;
  supersededAt: string | null;
};

/** A execução CORRENTE deste artigo sob esta investigação, se houver. */
export async function readRadarExtractRun(input: {
  brandId: string;
  articleId: string;
  frozenBundleId: string;
  client?: Cliente;
}): Promise<{ run: RadarExtractRun | null; extracts: RadarRelevantExtract[] }> {
  const client = clienteOu(input.client);

  const execucao = await client
    .from("radar_video_brief_extract_runs")
    .select("id,frozen_bundle_id,frozen_bundle_hash,input_fingerprint,created_at,superseded_at")
    .eq("brand_id", input.brandId)
    .eq("article_id", input.articleId)
    .eq("frozen_bundle_id", input.frozenBundleId)
    .is("superseded_at", null)
    /*
     * A MAIS NOVA VENCE. Sem índice único parcial, uma falha entre inserir e
     * superar pode deixar duas correntes — e a certa é sempre a última.
     */
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  falhar(execucao, "Não foi possível ler a execução do casamento");
  if (!execucao.data) return { run: null, extracts: [] };

  const linha = execucao.data as unknown as Record<string, unknown>;
  const run: RadarExtractRun = {
    runId: String(linha.id), frozenBundleId: String(linha.frozen_bundle_id),
    frozenBundleHash: String(linha.frozen_bundle_hash), inputFingerprint: String(linha.input_fingerprint),
    createdAt: String(linha.created_at), supersededAt: (linha.superseded_at as string) ?? null,
  };

  const trechos = await client
    .from("radar_video_brief_extracts")
    .select("video_brief_id,video_source_id,processing_version,segment_indexes,start_ms,end_ms,original_text,source_language,reason_for_relevance,matched_questions,matched_entities,support_type,confidence,limitations")
    .eq("brand_id", input.brandId)
    .eq("run_id", run.runId)
    .order("start_ms", { ascending: true });
  falhar(trechos, "Não foi possível ler os trechos do casamento");

  const extracts = ((trechos.data || []) as unknown as Array<Record<string, unknown>>).map(item => ({
    videoBriefId: String(item.video_brief_id),
    videoSourceId: String(item.video_source_id),
    segmentIndexes: (item.segment_indexes as number[]) || [],
    startMs: Number(item.start_ms),
    endMs: Number(item.end_ms),
    originalText: String(item.original_text),
    sourceLanguage: (item.source_language as string) ?? null,
    reasonForRelevance: String(item.reason_for_relevance),
    matchedQuestions: (item.matched_questions as string[]) || [],
    matchedEntities: (item.matched_entities as string[]) || [],
    supportType: item.support_type as RadarRelevantExtract["supportType"],
    confidence: Number(item.confidence),
    limitations: (item.limitations as string[]) || [],
    provenance: { processingVersion: Number(item.processing_version), anchoredToSegments: true as const },
  }));

  return { run, extracts };
}

/**
 * GRAVA UMA EXECUÇÃO — ou devolve a que já existe para o mesmo material.
 *
 * A decisão de reusar vem da IMPRESSÃO DIGITAL, não de um carimbo de tempo:
 * mesmas fontes, mesmas versões de transcript, mesma investigação congelada →
 * nada de novo é gravado, e o que já estava lá continua sendo a resposta.
 */
export async function persistRadarExtractRun(input: {
  brandId: string;
  articleId: string;
  frozenBundleId: string;
  frozenBundleHash: string;
  inputFingerprint: string;
  extracts: readonly RadarRelevantExtract[];
  actorUserId: string | null;
  client?: Cliente;
}): Promise<{ runId: string; reused: boolean }> {
  const client = clienteOu(input.client);

  const atual = await readRadarExtractRun({
    brandId: input.brandId, articleId: input.articleId, frozenBundleId: input.frozenBundleId, client,
  });

  /*
   * MESMO MATERIAL, MESMA RESPOSTA. Recortar de novo sem nada ter mudado não
   * cria execução nem duplica trecho — e não é erro: é a resposta certa.
   */
  if (atual.run && atual.run.inputFingerprint === input.inputFingerprint) {
    return { runId: atual.run.runId, reused: true };
  }

  const criada = await client
    .from("radar_video_brief_extract_runs")
    .insert({
      brand_id: input.brandId, article_id: input.articleId,
      frozen_bundle_id: input.frozenBundleId, frozen_bundle_hash: input.frozenBundleHash,
      input_fingerprint: input.inputFingerprint, matched_by: input.actorUserId,
    })
    .select("id")
    .single();
  falhar(criada, "Não foi possível registrar a execução do casamento");
  const runId = String((criada.data as unknown as { id: string }).id);

  if (input.extracts.length) {
    const insercao = await client.from("radar_video_brief_extracts").insert(input.extracts.map(item => ({
      brand_id: input.brandId, run_id: runId,
      video_brief_id: item.videoBriefId, video_source_id: item.videoSourceId,
      processing_version: item.provenance.processingVersion,
      segment_indexes: item.segmentIndexes, start_ms: item.startMs, end_ms: item.endMs,
      original_text: item.originalText, source_language: item.sourceLanguage,
      reason_for_relevance: item.reasonForRelevance,
      matched_questions: item.matchedQuestions, matched_entities: item.matchedEntities,
      support_type: item.supportType, confidence: item.confidence, limitations: item.limitations,
    })));
    falhar(insercao, "Não foi possível gravar os trechos do casamento");
  }

  /*
   * A ANTERIOR É SUPERADA POR ÚLTIMO, e apontando para quem a superou.
   *
   * Inserir primeiro garante que NUNCA existe um instante sem execução
   * corrente legível: se esta marcação falhar, ficam duas correntes e a leitura
   * pega a mais nova — que já é a certa. Superar antes trocaria uma falha
   * transitória por uma tela vazia com o recorte anterior gravado ao lado.
   */
  if (atual.run) {
    const superada = await client
      .from("radar_video_brief_extract_runs")
      .update({ superseded_at: new Date().toISOString(), superseded_by: runId })
      .eq("brand_id", input.brandId)
      .eq("id", atual.run.runId);
    falhar(superada, "Não foi possível superar a execução anterior");
  }

  return { runId, reused: false };
}
