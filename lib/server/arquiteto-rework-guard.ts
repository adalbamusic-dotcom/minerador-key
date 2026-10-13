import "server-only";

/**
 * ===== GUARDA DE RETRABALHO NO ARQUITETO (F5) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §10.3.
 * Os pontos de chamada do Arquiteto que não cabem dentro de um núcleo só:
 *
 *   - a gravação do ArticleDNA (`appendArquitetoArtifact`): `contradicts_declared`
 *     e `parallel_path` ANTES de gravar — é por ali que passam a conclusão da
 *     formação, a melhoria, o Reforçar publicados e o "Prender Assunto";
 *   - a conclusão da formação (marcador): o registro na linha do guarda, para
 *     o histórico do grupo (a conclusão em si é decidida pela portaria).
 *
 * As regras são de `lib/editorial/rework-guard.ts` e
 * `lib/arquiteto/declared-plan-rework.ts`; aqui só se lê o mínimo.
 */

import type { ArticleDNA } from "@/lib/arquiteto/contracts";
import { readArchitectSubjectStanding } from "@/lib/arquiteto/declared-subject";
import { declaredPlanArticleContradictions, declaredPlanParallelPath } from "@/lib/arquiteto/declared-plan-rework";
import type { ArticleFormationMarkerPayload } from "@/lib/arquiteto/article-formation-marker";
import { readKeywordGroupInfo } from "@/lib/editorial/article-groups-store";
import { readEditorialGroupPlan } from "@/lib/editorial/editorial-groups-store";
import { operationFingerprint, type ReworkAssessment } from "@/lib/editorial/rework-guard";
import { checkRework, enforceRework, recordOperation } from "./rework-guard";
import type { PipelineContext } from "./pipeline-runtime";
import { readSubjectGuardKeyword } from "./arquiteto-subject-guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Snapshot = Pick<ArticleDNA, "principalKeywordId" | "hierarchy">;

/** Principal e papel da versão vigente (dois campos, não o payload). Falha = desconhecido. */
async function readPreviousArticleSnapshot(context: PipelineContext, entityId: string): Promise<{ found: boolean; snapshot: Snapshot | null; failed: boolean }> {
  try {
    const result = await context.supabase
      .from("editorial_artifact_versions")
      .select("version_id,principalKeywordId:payload->principalKeywordId,hierarchy:payload->hierarchy")
      .eq("marca_id", context.brandId)
      .eq("entity_id", entityId)
      .eq("artifact_type", "article_dna")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) return { found: false, snapshot: null, failed: true };
    const row = result.data as { principalKeywordId?: unknown; hierarchy?: unknown } | null;
    if (!row) return { found: false, snapshot: null, failed: false };
    return {
      found: true,
      snapshot: typeof row.principalKeywordId === "string" && typeof row.hierarchy === "string"
        ? { principalKeywordId: row.principalKeywordId, hierarchy: row.hierarchy as Snapshot["hierarchy"] }
        : null,
      failed: false,
    };
  } catch {
    return { found: false, snapshot: null, failed: true };
  }
}

/** O plano do Assunto, lido do pacote APROVADO do item do Arquiteto. Falha = sem plano. */
async function readSubjectPlan(context: PipelineContext, subjectKeywordId: string) {
  if (!UUID.test(subjectKeywordId)) return null;
  try {
    // A MESMA leitura da guarda do Assunto (linha da keyword + pacote aprovado do item do Arquiteto).
    const keyword = await readSubjectGuardKeyword(context, subjectKeywordId);
    if (!keyword || String(keyword.brand_id ?? "") !== context.brandId) return null;
    const standing = readArchitectSubjectStanding(keyword);
    return standing.plan ? { plan: standing.plan, phrase: standing.phrase } : null;
  } catch {
    return null;
  }
}

/** O grupo da principal tem plano declarado? Grupos ausentes/ilegíveis = não. */
async function principalGroupHasPlan(context: PipelineContext, principalKeywordId: string): Promise<{ hasPlan: boolean; groupId: string | null; label: string | null }> {
  try {
    const info = await readKeywordGroupInfo(context.supabase, context.brandId, [principalKeywordId]);
    if (!info.ok) return { hasPlan: false, groupId: null, label: null };
    const keyword = info.info.get(principalKeywordId);
    if (!keyword?.groupId) return { hasPlan: false, groupId: null, label: keyword?.keyword ?? null };
    const group = await readEditorialGroupPlan(context.supabase, context.brandId, keyword.groupId);
    return { hasPlan: Boolean(group.ok && group.group?.plan && group.group.status === "active"), groupId: keyword.groupId, label: keyword.keyword };
  } catch {
    return { hasPlan: false, groupId: null, label: null };
  }
}

/**
 * `contradicts_declared` e `parallel_path` antes de gravar um ArticleDNA.
 * Recusa 409 (`DECLARED_PLAN_CONTRADICTION` / `REWORK_PARALLEL_PATH`), sem
 * "refazer mesmo assim" (D11). Não lê nada a mais para artigo sem plano à
 * vista: sem Assunto, a primeira leitura é o grupo da principal.
 */
export async function assertArticleDnaAgainstDeclaredPlan(context: PipelineContext, input: {
  entityId: string;
  article: ArticleDNA;
  /** A versão anterior que o envelope declara; `null` = artigo novo (primeira versão). */
  previousVersionId?: string | null;
}): Promise<ReworkAssessment | null> {
  const article = input.article;
  let contradictions: string[] = [];
  let parallelPaths: string[] = [];
  let groupId: string | null = null;

  if (article.subject?.keywordId) {
    // Primeiro a versão vigente (dois campos): sem mudança de principal nem de papel, não há o que contradizer — nada mais é lido.
    const previous = await readPreviousArticleSnapshot(context, input.entityId);
    if (previous.failed) return null;
    if (previous.snapshot && previous.snapshot.principalKeywordId === article.principalKeywordId && previous.snapshot.hierarchy === article.hierarchy) return null;
    const subject = await readSubjectPlan(context, article.subject.keywordId);
    if (!subject) return null;
    groupId = subject.plan.groupId;
    contradictions = declaredPlanArticleContradictions({ plan: subject.plan, next: article, previous: previous.snapshot, subjectLabel: subject.phrase });
  } else {
    // Caminho paralelo é só do artigo NOVO (o envelope diz): versão nova de artigo existente não lê nada a mais.
    if (article.publishedIdentityRef || input.previousVersionId) return null;
    const grupo = await principalGroupHasPlan(context, article.principalKeywordId);
    if (!grupo.hasPlan) return null;
    groupId = grupo.groupId;
    const previous = await readPreviousArticleSnapshot(context, input.entityId);
    if (previous.failed) return null;
    parallelPaths = declaredPlanParallelPath({ article, hasPreviousVersion: previous.found, principalGroupHasPlan: true, principalLabel: grupo.label });
  }
  if (!contradictions.length && !parallelPaths.length) return null;

  const operation = {
    kind: "article_dna_write" as const,
    fingerprint: await operationFingerprint("article_dna_write", { entityId: input.entityId, principalKeywordId: article.principalKeywordId, hierarchy: article.hierarchy, subject: article.subject?.keywordId ?? null }),
    groupId,
    inputsSummary: `ArticleDNA ${input.entityId}: principal ${article.principalKeywordId}, papel ${article.hierarchy}.`,
    declared: { contradictions, parallelPaths },
    previous: null,
  };
  const assessment = await checkRework(context, operation);
  // A recusa fica no histórico do grupo: o dono vê o que foi barrado e por quê.
  await recordOperation(context, operation, { outcome: "refused", outcomeCode: assessment.code, message: assessment.message, resultRef: input.entityId });
  enforceRework(assessment);
  return assessment;
}

/**
 * A conclusão da formação no histórico (§10.1): uma linha por cenário +
 * conjunto fechado. Só registra; a portaria (`validateFormationConclusion`)
 * decide. Melhor esforço.
 */
export async function recordFormationConclusion(context: PipelineContext, marker: ArticleFormationMarkerPayload): Promise<boolean> {
  const status = marker.confirmation?.status;
  if (!status || status === "none") return false;
  const formations = [...(marker.concludedFormations || [])]
    .map(item => ({ candidateRef: item.candidateRef, principal: item.principalKeywordId, members: item.members.map(member => `${member.keywordId}:${member.role}`).sort(), base: item.formationBaseHash }))
    .sort((left, right) => left.candidateRef.localeCompare(right.candidateRef));
  const fingerprint = await operationFingerprint("formation_conclusion", { baseHash: marker.baseHash, formations });
  const confirmation = marker.confirmation!;
  return recordOperation(context, {
    kind: "formation_conclusion",
    fingerprint,
    inputsSummary: `${formations.length} formação(ões) concluída(s) no cenário ${marker.baseHash.slice(0, 16)}.`,
  }, {
    outcome: status === "refused" ? "refused" : "succeeded",
    outcomeCode: status === "partial" ? "FORMATION_PARTIAL" : status === "refused" ? "FORMATION_REFUSED" : "FORMATION_CONFIRMED",
    message: `${confirmation.confirmedArticleCount} ArticleDNA confirmado(s), ${confirmation.coveredKeywordCount} keyword(s) cobertas, ${confirmation.pendingSiloCount} pendente(s), ${confirmation.failedCount} falha(s).`,
    resultRef: `article-formation:${marker.baseHash}`,
    costUsd: 0,
    // O instante da confirmação: regravar o mesmo marcador não duplica a tentativa.
    ...(confirmation.confirmedAt ? { at: confirmation.confirmedAt } : {}),
  });
}
