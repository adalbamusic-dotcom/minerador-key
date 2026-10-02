import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RADAR_ARTICLE_BLUEPRINT_LIMITS,
  RadarArticleBlueprintAiSchema,
  RadarArticleBlueprintInvalidError,
  buildRadarArticleBlueprintBrief,
  radarApplyArticleBlueprintEdit,
  radarArticleBlueprintAiFailure,
  radarArticleBlueprintAiFailureMessage,
  radarArticleBlueprintPayloadToStore,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintRetryNote,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintAi,
  type RadarArticleBlueprintBrief,
  type RadarArticleBlueprintEdit,
  type RadarArticleBlueprintPayload,
} from "@/lib/radar/article-blueprint";
import { assembleRadarPortableExport } from "@/lib/server/radar-portable-export-core";
import { resolveDeepSeekCanonicalConfig } from "@/lib/server/deepseek-canonical";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
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
 * recusa mudar a aprovada). Só a aprovada do pacote vigente chega ao Redator.
 *
 * 2026-10-02 · O ARTIGO-MODELO É PARTE DA SERP (decisão do dono). A tela pede a
 * organização logo depois de "Finalizar pesquisa" (o botão avisa a chamada de
 * IA). O pedido é compacto e sem modo de raciocínio; resposta cortada ou fora
 * do formato ganha UMA nova tentativa com saída mais curta — uma chamada a
 * mais, registrada no log e na versão. Enquanto o dono não aprova, o CSV já
 * sai com a proposta, marcada (`readRadarArticleBlueprintsForExport`).
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
    throw new PipelineRuntimeError("CONFLICT", recusa?.reason || "O artigo não tem investigação finalizada: finalize antes de organizar o artigo-modelo da SERP.", 409);
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
  /*
   * 2026-10-02 · D10 (decisão do dono): O ARTIGO-MODELO SAI CONCLUÍDO. "Em tudo o
   * que tem a ver com o entregável — CSV, Redator e MCP — não pode ir algo
   * inconcluso nem com aviso de aprovação." Organizar (com a passada de
   * correção) e editar gravam a versão já concluída, com quem a gerou ou
   * editou e o momento; a edição do dono vira a versão vigente sem outro passo.
   * A versão concluída continua imutável no banco: mudar é gravar outra.
   */
  const agora = new Date().toISOString();
  const insercao = await client.from("radar_article_blueprints").insert({
    brand_id: input.brandId, article_id: input.articleId, bundle_hash: input.bundleHash,
    version_number: versao, state: "APPROVED", approved_by: input.actorUserId, approved_at: agora, origin: input.origin,
    /* 2026-10-02 · a marca de aprovação é do export, nunca do banco. */
    payload: radarArticleBlueprintPayloadToStore(input.payload), validation: input.validation, created_by: input.actorUserId,
  }).select(COLUNAS).single();
  if (insercao.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível gravar o artigo-modelo: ${insercao.error.message}`, 503);
  return linhaDe(insercao.data as unknown as Record<string, unknown>);
}

/**
 * 2026-10-02 · OS TEMPOS DE CADA TENTATIVA. A rota tem 300 s; a montagem leva
 * poucos segundos. A segunda tentativa só existe depois de uma resposta que
 * VOLTOU (cortada, vazia ou fora do formato) — nunca depois de tempo esgotado.
 */
export const RADAR_ARTICLE_BLUEPRINT_TIMEOUTS_MS = Object.freeze({ first: 150_000, retry: 110_000 });

type ProvedorDaIa = Parameters<typeof generateStructuredAI>[0]["provider"];

/**
 * 2026-10-02 · O PEDIDO À IA, COM NO MÁXIMO UMA NOVA TENTATIVA.
 *
 * Sem modo de raciocínio (o raciocínio consome o mesmo teto de tokens e foi o
 * que cortou a primeira resposta real) e com o `finish_reason` capturado pelo
 * diagnóstico. Falhou por corte, formato ou resposta vazia: UMA nova chamada,
 * com o pedido de saída curta, e o log diz por quê. Qualquer outra falha
 * (tempo, quota, credencial, provider) sobe como veio. A mensagem para a tela é
 * em português claro — nunca "JSON invalido" cru.
 */
export async function requestRadarArticleBlueprintAi(input: {
  provider: ProvedorDaIa;
  brief: RadarArticleBlueprintBrief;
  articleId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ai: RadarArticleBlueprintAi; calls: 1 | 2; notes: string[] }> {
  const tentar = async (curta: boolean) => {
    const visto = { finishReason: null as string | null };
    const { system, user } = radarArticleBlueprintPrompt(input.brief, { short: curta });
    try {
      const ai = await generateStructuredAI({
        provider: input.provider,
        system,
        user,
        schema: RadarArticleBlueprintAiSchema,
        maxTokens: RADAR_ARTICLE_BLUEPRINT_LIMITS.maxTokens,
        thinkingMode: "disabled",
        timeoutMs: curta ? RADAR_ARTICLE_BLUEPRINT_TIMEOUTS_MS.retry : RADAR_ARTICLE_BLUEPRINT_TIMEOUTS_MS.first,
        fetchImpl: input.fetchImpl,
        onDiagnostic: diagnostico => { if (diagnostico.finishReason) visto.finishReason = diagnostico.finishReason; },
      });
      return { ok: true as const, ai, finishReason: visto.finishReason };
    } catch (error) {
      return { ok: false as const, error, finishReason: visto.finishReason };
    }
  };
  const codigo = (error: unknown) => (error instanceof StructuredAIError ? error.code : null);

  const primeira = await tentar(false);
  if (primeira.ok) return { ai: primeira.ai, calls: 1, notes: [] };
  const falha = radarArticleBlueprintAiFailure({ code: codigo(primeira.error), finishReason: primeira.finishReason });
  if (!falha) throw primeira.error;

  console.warn("[radar-article-blueprint] nova_tentativa", {
    articleId: input.articleId ?? null,
    motivo: falha,
    finishReason: primeira.finishReason,
    code: codigo(primeira.error),
    chamadasDeIa: 2,
  });
  const segunda = await tentar(true);
  if (segunda.ok) return { ai: segunda.ai, calls: 2, notes: [radarArticleBlueprintRetryNote(falha)] };
  const falhaFinal = radarArticleBlueprintAiFailure({ code: codigo(segunda.error), finishReason: segunda.finishReason });
  console.warn("[radar-article-blueprint] nova_tentativa_falhou", {
    articleId: input.articleId ?? null,
    motivo: falhaFinal,
    finishReason: segunda.finishReason,
    code: codigo(segunda.error),
  });
  if (!falhaFinal) throw segunda.error;
  throw new StructuredAIError(radarArticleBlueprintAiFailureMessage(falhaFinal, 2), 502, undefined, "AI_OUTPUT_INVALID");
}

/** 1 chamada de IA, paga (2 só se a primeira vier cortada ou fora do formato), por clique explícito do dono. */
export async function generateRadarArticleBlueprint(input: { client: SupabaseClient; brandId: string; articleId: string; actorUserId: string; ifMissing?: boolean }): Promise<RadarArticleBlueprintRow> {
  /* Onde gravar tem de existir ANTES da chamada paga: sem a tabela, nada de IA. */
  const existentes = await listRadarArticleBlueprints(input.client, input.brandId, input.articleId);
  const { montada, silo, publicacao, brandVoice } = await montagemDoArtigo(input);
  /* Só se faltar (encadeamento automático): o mesmo pacote já organizado não paga a IA de novo. */
  if (input.ifMissing) {
    const doPacote = existentes.filter(item => item.bundleHash === montada.bundleHash);
    const reaproveitada = doPacote.find(item => item.state === "APPROVED") || doPacote[0];
    if (reaproveitada) return reaproveitada;
  }
  /* A voz da marca (Skill corrente, Adendo C) entra em trechos por assunto, com teto (2026-10-02). */
  const brief = buildRadarArticleBlueprintBrief({ entrada: montada.entrada, silo, articleId: input.articleId, publication: publicacao, brandVoice: brandVoice.kind === "available" ? brandVoice.voice : null });
  const provider = await resolveDeepSeekCanonicalConfig({ actorUserId: input.actorUserId, brandId: input.brandId, client: input.client, quotaUnits: 1 });
  const resposta = await requestRadarArticleBlueprintAi({ provider, brief, articleId: input.articleId });
  const fechada = await fecharArtigoModelo({ provider, brief, ai: resposta.ai, articleId: input.articleId, allowFix: resposta.calls === 1 });
  return gravarVersao(input.client, { brandId: input.brandId, articleId: input.articleId, bundleHash: montada.bundleHash!, origin: "ai", payload: fechada.payload, validation: [...resposta.notes, ...fechada.notes], actorUserId: input.actorUserId });
}

/**
 * 2026-10-02 · D10 · FECHAR A PLANTA ANTES DE GRAVAR.
 *
 * A conferência acha o que pede ação (origem de outro assunto, afirmação
 * absoluta, seções repetidas, abertura de outro assunto). Com pendência, UMA
 * chamada a mais devolve a planta inteira corrigida; fica a que tem menos
 * pendência. Depois, a conferência FECHA o que dá para fechar sem IA (a origem
 * errada sai). O que ainda restar fica registrado na versão (o painel mostra),
 * nunca no entregável. A correção falhando não derruba nada: grava-se a primeira.
 */
export async function fecharArtigoModelo(input: {
  provider: ProvedorDaIa;
  brief: RadarArticleBlueprintBrief;
  ai: RadarArticleBlueprintAi;
  articleId?: string;
  fetchImpl?: typeof fetch;
  /** A rota tem 300 s: depois de uma nova tentativa, não há tempo para a correção (a conferência ainda fecha o que dá). */
  allowFix?: boolean;
}): Promise<{ payload: RadarArticleBlueprintPayload; notes: string[]; calls: 0 | 1 }> {
  const primeira = radarSanitizeArticleBlueprint(input.ai, input.brief);
  const pendentes = radarArticleBlueprintPendingNotes(primeira.notes).pending;
  let escolhida = input.ai;
  let chamadas: 0 | 1 = 0;
  if (pendentes.length && input.allowFix !== false) {
    chamadas = 1;
    try {
      const { system, user } = radarArticleBlueprintPrompt(input.brief, { fix: { previous: input.ai, pending: pendentes } });
      const corrigida = await generateStructuredAI({
        provider: input.provider, system, user, schema: RadarArticleBlueprintAiSchema,
        maxTokens: RADAR_ARTICLE_BLUEPRINT_LIMITS.maxTokens, thinkingMode: "disabled",
        timeoutMs: RADAR_ARTICLE_BLUEPRINT_TIMEOUTS_MS.retry, fetchImpl: input.fetchImpl,
      });
      const conferida = radarSanitizeArticleBlueprint(corrigida, input.brief);
      if (radarArticleBlueprintPendingNotes(conferida.notes).pending.length <= pendentes.length) escolhida = corrigida;
    } catch (error) {
      console.warn("[radar-article-blueprint] correcao_falhou", { articleId: input.articleId ?? null, message: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    }
  }
  const fechada = radarSanitizeArticleBlueprint(escolhida, input.brief, { close: true });
  return {
    payload: fechada.payload,
    notes: [...(chamadas ? [`Passada de correção: ${pendentes.length} pendência(s) enviada(s) de volta à IA (1 chamada a mais).`] : []), ...fechada.notes],
    calls: chamadas,
  };
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
    throw new PipelineRuntimeError("CONFLICT", "Este artigo-modelo é de outro congelamento da investigação. Organize de novo sobre o pacote atual.", 409);
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

export { readApprovedRadarArticleBlueprints, readRadarArticleBlueprintsForExport } from "@/lib/server/radar-article-blueprint-read";
export { RadarArticleBlueprintInvalidError };
