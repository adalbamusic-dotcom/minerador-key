import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { readKeywordGroupInfo } from "@/lib/editorial/article-groups-store";
import { linkEditorialGroupSilo, readEditorialGroupPlan } from "@/lib/editorial/editorial-groups-store";
import { resolveSiloDeclaredGroup } from "@/lib/arquiteto/silo-declared-plan";

/**
 * ===== F4 · O GRUPO DO PLANO LIGADO AO SILO CONSOLIDADO =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §5.2 e
 * §6.2-6: "ao consolidar, `editorial_groups.silo_id` recebe o `siloId`".
 *
 * ADITIVO E NUNCA FATAL. Roda DEPOIS do readback da consolidação: o Silo já
 * está gravado e confirmado, e grupo é organização, não significado. Qualquer
 * falha (banco sem a M1, grupo ligado a outro Silo, leitura que caiu) volta
 * como `failed` com a frase, e a consolidação continua um sucesso.
 *
 * Grava pelo `linkEditorialGroupSilo` (o único escritor de `silo_id`), com o
 * cliente de service role do contexto — depois da autorização da rota.
 */

export type SiloGroupLinkOutcome =
  | { state: "linked" | "unchanged"; groupId: string; siloId: string; message: string }
  | { state: "not_applicable"; message: string }
  | { state: "failed"; groupId: string | null; message: string };

const texto = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const registro = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** O Assunto do ArticleDNA, venha a linha com o payload puro ou com o envelope. */
function subjectKeywordIdOf(payload: unknown): { articleId: string | null; subjectKeywordId: string | null } {
  const linha = registro(payload);
  const corpo = registro(linha?.payload) ?? linha;
  return { articleId: texto(corpo?.articleId), subjectKeywordId: texto(registro(corpo?.subject)?.keywordId) };
}

export async function linkDeclaredPlanGroupToSilo(
  context: Pick<PipelineContext, "supabase" | "brandId" | "actorUserId">,
  input: { siloId: string; articleVersionIds: readonly string[] },
): Promise<SiloGroupLinkOutcome> {
  let groupId: string | null = null;
  try {
    const ids = [...new Set(input.articleVersionIds)].filter(Boolean);
    if (!ids.length) return { state: "not_applicable", message: "O Silo não tem artigos." };
    const artigos = await context.supabase
      .from("editorial_artifact_versions")
      .select("version_id,payload")
      .eq("marca_id", context.brandId)
      .eq("artifact_type", "article_dna")
      .in("version_id", ids);
    if (artigos.error) throw artigos.error;
    const lidos = ((artigos.data || []) as Array<Record<string, unknown>>).map(row => subjectKeywordIdOf(row.payload));
    if (lidos.length !== ids.length) return { state: "not_applicable", message: "Nem todos os ArticleDNA do Silo foram lidos." };

    const assuntos = lidos.map(item => item.subjectKeywordId).filter((id): id is string => Boolean(id));
    const grupos = assuntos.length ? await readKeywordGroupInfo(context.supabase, context.brandId, assuntos) : { ok: true as const, info: new Map() };
    if (!grupos.ok) return { state: "not_applicable", message: grupos.message };
    const decisao = resolveSiloDeclaredGroup({
      articles: lidos.map(item => ({ articleId: item.articleId ?? "", subjectKeywordId: item.subjectKeywordId })),
      keywordGroupById: new Map([...grupos.info].map(([id, info]) => [id, info.groupId])),
    });
    if (decisao.groupId === null) return { state: "not_applicable", message: decisao.reason };
    groupId = decisao.groupId;

    const grupo = await readEditorialGroupPlan(context.supabase, context.brandId, groupId);
    if (!grupo.ok) return { state: "not_applicable", message: grupo.message };
    if (!grupo.group || grupo.group.origin !== "declared_plan" || !grupo.group.plan) {
      return { state: "not_applicable", message: "O grupo dos Assuntos não tem plano declarado." };
    }
    const ligado = await linkEditorialGroupSilo(context.supabase, {
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      groupId,
      siloId: input.siloId,
    });
    if (!ligado.ok) return { state: "failed", groupId, message: ligado.message };
    return {
      state: ligado.changed ? "linked" : "unchanged",
      groupId,
      siloId: input.siloId,
      message: ligado.changed ? `O grupo “${grupo.group.name}” ficou ligado a este Silo.` : `O grupo “${grupo.group.name}” já estava ligado a este Silo.`,
    };
  } catch (error) {
    console.warn("[silo-consolidation] vínculo do grupo com o Silo não gravado", JSON.stringify({
      brandId: context.brandId,
      siloId: input.siloId,
      groupId,
      message: error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? "erro sem mensagem"),
    }));
    return { state: "failed", groupId, message: "O Silo foi consolidado, mas o vínculo com o grupo do plano não foi gravado (o motivo ficou no log do servidor)." };
  }
}
