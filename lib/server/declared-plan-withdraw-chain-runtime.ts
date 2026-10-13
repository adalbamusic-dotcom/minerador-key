import "server-only";

import type { CanonicalSessionProfile } from "./authz";
import { requireTenantPermission } from "./tenant-context";
import { editorialGroupsClient } from "./editorial-groups";
import { withdrawFromDeclaredPlanWithCore } from "@/lib/minerador/declared-plan-withdraw-core";
import { applyApproveAndSend, previewApproveAndSend } from "@/lib/minerador/approve-and-send-core";
import { approveAndSendDeps } from "./minerador-approve-and-send";
import { applyWithdrawChain, locateSubjectArticle, previewWithdrawChain, type WithdrawChainDeps } from "./declared-plan-withdraw-chain";
import { resolvePipelineContext } from "./pipeline-runtime";

/**
 * As dependências reais de "Tirar do plano" numa confirmação (SDD acelerar
 * 2026-10-13, item 15): cada passo chama o núcleo do dono — o do plano
 * (Minerador), o encadeamento único "aprovar → enviar" (item 2) e a retirada do
 * Silo (Arquiteto, com o contexto e as permissões do Arquiteto).
 */
export async function withdrawChainResponse(args: {
  brandId: string;
  actorUserId: string;
  profile: CanonicalSessionProfile;
  input: { groupId: string; subjectKeywordId: string; mode: "preview" | "apply"; decisionHash?: string; chain: { reapproveAndSend: boolean; withdrawFromSilo: boolean } };
}): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; code: string; reason: string }> {
  const { brandId, actorUserId, profile, input } = args;
  const plano = (mode: "preview" | "apply", decisionHash?: string | null) => withdrawFromDeclaredPlanWithCore({
    brandId, actorUserId, keywordsClient: profile.supabase, groupsClient: editorialGroupsClient(),
    mode, groupId: input.groupId, subjectKeywordId: input.subjectKeywordId, decisionHash: decisionHash ?? null,
  });
  const contextoDoArquiteto = async (action: "view" | "edit" | "approve") =>
    resolvePipelineContext({ brandId, module: "arquiteto", action }, { requireActorUserId: async () => actorUserId });
  const deps: WithdrawChainDeps = {
    withdraw: plano,
    approveAndSend: async keywordIds => {
      await requireTenantPermission({ brandId, actorUserId, module: "minerador", action: "approve", profile });
      await requireTenantPermission({ brandId, actorUserId, module: "arquiteto", action: "create", profile });
      const dependencias = approveAndSendDeps(brandId, actorUserId);
      const previa = await previewApproveAndSend({ brandId, actorId: actorUserId, keywordIds, send: true }, dependencias);
      return applyApproveAndSend({ brandId, actorId: actorUserId, keywordIds, send: true, decisionHash: previa.decisionHash }, dependencias);
    },
    locateArticle: async () => {
      const { siloArticleWithdrawalRuntime } = await import("./arquiteto-silo-article-withdrawal");
      const artefatos = await siloArticleWithdrawalRuntime(await contextoDoArquiteto("view")).listArtifacts();
      return locateSubjectArticle({ subjectKeywordId: input.subjectKeywordId, articleDnas: artefatos.articleDnas, siloDnas: artefatos.siloDnas });
    },
    canWithdrawFromSilo: async () => {
      try { await contextoDoArquiteto("edit"); await contextoDoArquiteto("approve"); return true; } catch { return false; }
    },
    withdrawFromSilo: async ({ siloId, articleId, mode }) => {
      const { handleSiloArticleWithdrawal, siloArticleWithdrawalRuntime } = await import("./arquiteto-silo-article-withdrawal");
      const resultado = await handleSiloArticleWithdrawal(siloArticleWithdrawalRuntime(await contextoDoArquiteto(mode === "apply" ? "edit" : "view")), {
        siloId, articleId, mode, reason: "Tirado do plano declarado no Minerador (Tirar do plano).",
      });
      if (resultado.state === "REFUSED") return { ok: false, message: resultado.message };
      return { ok: true, message: resultado.mode === "apply" ? `“${resultado.article.label}” saiu do Silo (SiloDNA v${resultado.siloDna.versionNumber}, relido).` : `“${resultado.article.label}” sai do Silo.` };
    },
  };
  if (input.mode === "preview") {
    const previa = await previewWithdrawChain(deps, input.chain);
    if ("ok" in previa) return { ok: false, code: previa.code, reason: previa.reason };
    return { ok: true, body: { ...previa.minerador, chain: { effects: previa.effects, arquiteto: previa.arquiteto } } };
  }
  // As keywords que voltam a "Em revisão" saem da prévia vigente (antes de gravar); na retomada, o Assunto.
  const antes = await plano("preview");
  const revisar = antes.ok && antes.mode === "preview"
    ? [antes.article.subject.keywordId, ...(antes.article.principal && !antes.article.principal.sameAsSubject ? [antes.article.principal.keywordId] : [])]
    : [input.subjectKeywordId];
  const aplicado = await applyWithdrawChain(deps, { decisionHash: input.decisionHash ?? null, reapproveAndSend: input.chain.reapproveAndSend, withdrawFromSilo: input.chain.withdrawFromSilo, reviewKeywordIds: revisar });
  if (aplicado.steps[0]?.outcome === "refused") return { ok: false, code: "DECISION_STALE", reason: aplicado.steps[0].message };
  return { ok: true, body: { mode: "apply", chain: aplicado } };
}
