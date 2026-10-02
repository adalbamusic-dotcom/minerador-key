import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RadarArticleBlueprintAiSchema,
  RadarArticleBlueprintInvalidError,
  buildRadarArticleBlueprintBrief,
  radarApplyArticleBlueprintEdit,
  radarArticleBlueprintPrompt,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintEdit,
  type RadarArticleBlueprintPayload,
} from "@/lib/radar/article-blueprint";
import { assembleRadarPortableExport } from "@/lib/server/radar-portable-export-core";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI } from "@/lib/server/structured-ai";
import { PipelineRuntimeError } from "@/lib/server/pipeline-runtime";

/**
 * ===== O ARTIGO-MODELO NO SERVIDOR (SDD diretriz editorial, Adendo A, D5) =====
 *
 * Gerar é 1 chamada de IA por clique (Connection DeepSeek da plataforma, com a
 * cota da marca). A entrada é a MESMA montagem do export (pacote congelado,
 * SERP, Silo, especialista, vídeos): não existe uma segunda leitura do artigo.
 *
 * Versões append-only, presas ao hash do pacote: a IA cria um rascunho; a
 * edição do dono cria outra versão; aprovar marca a versão uma vez só (o banco
 * recusa mudar a aprovada). Só a aprovada do pacote vigente chega ao CSV.
 */

export type RadarArticleBlueprintRow = {
  id: string;
  articleId: string;
  bundleHash: string;
  versionNumber: number;
  state: "DRAFT" | "APPROVED";
  origin: "ai" | "human_edit";
  payload: RadarArticleBlueprintPayload;
  validation: string[];
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

const COLUNAS = "id,article_id,bundle_hash,version_number,state,origin,payload,validation,created_by,created_at,approved_by,approved_at";

const linhaDe = (linha: Record<string, unknown>): RadarArticleBlueprintRow => ({
  id: String(linha.id),
  articleId: String(linha.article_id),
  bundleHash: String(linha.bundle_hash),
  versionNumber: Number(linha.version_number),
  state: linha.state === "APPROVED" ? "APPROVED" : "DRAFT",
  origin: linha.origin === "human_edit" ? "human_edit" : "ai",
  payload: linha.payload as RadarArticleBlueprintPayload,
  validation: Array.isArray(linha.validation) ? (linha.validation as unknown[]).map(String) : [],
  createdBy: String(linha.created_by),
  createdAt: String(linha.created_at),
  approvedBy: (linha.approved_by as string) ?? null,
  approvedAt: (linha.approved_at as string) ?? null,
});

/** O pacote congelado vigente do artigo, pela mesma montagem do export. */
async function montagemDoArtigo(input: { client: SupabaseClient; brandId: string; articleId: string; actorUserId: string }) {
  const montagem = await assembleRadarPortableExport({
    brandId: input.brandId,
    articleIds: [input.articleId],
    supabase: input.client as never,
    actorUserId: input.actorUserId,
    selectionSiloContext: true,
  });
  const montada = montagem.montadas[0];
  if (!montada || !montada.bundleHash) {
    const recusa = montagem.recusados[0];
    throw new PipelineRuntimeError("CONFLICT", recusa?.reason || "O artigo não tem investigação finalizada: finalize antes de gerar o artigo-modelo.", 409);
  }
  const silo = montagem.planoDaSelecao?.files.find(arquivo => arquivo.articleIds.includes(input.articleId))?.writing ?? null;
  return { montada, silo, publicacao: montagem.publicacoes.get(input.articleId) ?? null, brandVoice: montagem.brandVoice };
}

export async function listRadarArticleBlueprints(client: SupabaseClient, brandId: string, articleId: string): Promise<RadarArticleBlueprintRow[]> {
  const leitura = await client.from("radar_article_blueprints").select(COLUNAS)
    .eq("brand_id", brandId).eq("article_id", articleId).order("version_number", { ascending: false }).limit(20);
  if (leitura.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler o artigo-modelo: ${leitura.error.message}`, 503);
  return ((leitura.data || []) as unknown as Array<Record<string, unknown>>).map(linhaDe);
}

async function gravarVersao(client: SupabaseClient, input: {
  brandId: string; articleId: string; bundleHash: string; origin: "ai" | "human_edit";
  payload: RadarArticleBlueprintPayload; validation: string[]; actorUserId: string;
}): Promise<RadarArticleBlueprintRow> {
  const atuais = await listRadarArticleBlueprints(client, input.brandId, input.articleId);
  const versao = (atuais[0]?.versionNumber || 0) + 1;
  const insercao = await client.from("radar_article_blueprints").insert({
    brand_id: input.brandId, article_id: input.articleId, bundle_hash: input.bundleHash,
    version_number: versao, state: "DRAFT", origin: input.origin,
    payload: input.payload, validation: input.validation, created_by: input.actorUserId,
  }).select(COLUNAS).single();
  if (insercao.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível gravar o artigo-modelo: ${insercao.error.message}`, 503);
  return linhaDe(insercao.data as unknown as Record<string, unknown>);
}

/** 1 chamada de IA, paga, por clique explícito do dono. */
export async function generateRadarArticleBlueprint(input: { client: SupabaseClient; brandId: string; articleId: string; actorUserId: string }): Promise<RadarArticleBlueprintRow> {
  /* Onde gravar tem de existir ANTES da chamada paga: sem a tabela, nada de IA. */
  await listRadarArticleBlueprints(input.client, input.brandId, input.articleId);
  const { montada, silo, publicacao, brandVoice } = await montagemDoArtigo(input);
  /* A voz da marca (Skill corrente, Adendo C) entra inteira: CTA, promessa, H1 e imagens seguem ela. */
  const brief = buildRadarArticleBlueprintBrief({ entrada: montada.entrada, silo, articleId: input.articleId, publication: publicacao, brandVoice: brandVoice.kind === "available" ? brandVoice.voice : null });
  const { system, user } = radarArticleBlueprintPrompt(brief);
  const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: input.actorUserId, brandId: input.brandId, client: input.client, quotaUnits: 1 });
  const resposta = await generateStructuredAI({ provider, system, user, schema: RadarArticleBlueprintAiSchema, maxTokens: 8000 });
  const { payload, notes } = radarSanitizeArticleBlueprint(resposta, brief);
  return gravarVersao(input.client, { brandId: input.brandId, articleId: input.articleId, bundleHash: montada.bundleHash!, origin: "ai", payload, validation: notes, actorUserId: input.actorUserId });
}

export async function editRadarArticleBlueprint(input: { client: SupabaseClient; brandId: string; articleId: string; blueprintId: string; edit: RadarArticleBlueprintEdit; actorUserId: string }): Promise<RadarArticleBlueprintRow> {
  const versoes = await listRadarArticleBlueprints(input.client, input.brandId, input.articleId);
  const base = versoes.find(item => item.id === input.blueprintId);
  if (!base) throw new PipelineRuntimeError("NO_DATA", "Versão do artigo-modelo não encontrada nesta marca.", 409);
  const payload = radarApplyArticleBlueprintEdit(base.payload, input.edit);
  return gravarVersao(input.client, { brandId: input.brandId, articleId: input.articleId, bundleHash: base.bundleHash, origin: "human_edit", payload, validation: base.validation, actorUserId: input.actorUserId });
}

/** Aprovar vale só para o pacote vigente: aprovar o de outro congelamento não chegaria a lugar nenhum. */
export async function approveRadarArticleBlueprint(input: { client: SupabaseClient; brandId: string; articleId: string; blueprintId: string; actorUserId: string }): Promise<RadarArticleBlueprintRow> {
  const versoes = await listRadarArticleBlueprints(input.client, input.brandId, input.articleId);
  const alvo = versoes.find(item => item.id === input.blueprintId);
  if (!alvo) throw new PipelineRuntimeError("NO_DATA", "Versão do artigo-modelo não encontrada nesta marca.", 409);
  if (alvo.state === "APPROVED") return alvo;
  const { montada } = await montagemDoArtigo(input);
  if (montada.bundleHash !== alvo.bundleHash) {
    throw new PipelineRuntimeError("CONFLICT", "Este artigo-modelo é de outro congelamento da investigação. Gere de novo sobre o pacote atual.", 409);
  }
  const atualizacao = await input.client.from("radar_article_blueprints")
    .update({ state: "APPROVED", approved_by: input.actorUserId, approved_at: new Date().toISOString() })
    .eq("id", alvo.id).eq("brand_id", input.brandId).eq("state", "DRAFT")
    .select(COLUNAS).single();
  if (atualizacao.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível aprovar: ${atualizacao.error.message}`, 503);
  /* Releitura: sucesso só depois de o banco devolver a versão aprovada. */
  const lida = linhaDe(atualizacao.data as unknown as Record<string, unknown>);
  if (lida.state !== "APPROVED") throw new PipelineRuntimeError("QUERY_FAILURE", "A aprovação não foi confirmada pelo banco.", 503);
  return lida;
}

export { readApprovedRadarArticleBlueprints } from "@/lib/server/radar-article-blueprint-read";
export { RadarArticleBlueprintInvalidError };
