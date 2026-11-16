import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase, resolvePipelineContext } from "./pipeline-runtime";
import { readRpcDomainError } from "@/lib/arquiteto/silo-working-copy-record";
import { siloRpcErrorDiagnostic } from "@/lib/arquiteto/silo-closure-diagnostics";
import { canonicalVersionFromRow } from "./arquiteto-persistence";
import { assertConsolidatedSiloSubject } from "./arquiteto-subject-guard";
import { linkDeclaredPlanGroupToSilo, type SiloGroupLinkOutcome } from "./arquiteto-silo-group-link";
import { runUnderReworkGuard } from "./rework-guard";
import { operationFingerprint, type ReworkOverride } from "@/lib/editorial/rework-guard";
import { siloConsolidationFailureDisposition } from "@/lib/arquiteto/silo-consolidation-operation";
import { TERRITORY_SUBJECT_TYPE, TERRITORY_WORKFLOW_STAGE, parseTerritoryWorkflowRow } from "@/lib/arquiteto/territory-record";
import {
  SILO_WORKING_COPY_STAGE,
  SILO_WORKING_COPY_SUBJECT_TYPE,
  buildSiloWorkingCopyRef,
  parseSiloWorkingCopyRow,
  type SiloWorkingCopyState,
} from "@/lib/arquiteto/silo-working-copy-record";
import {
  assertSiloDnaMatchesConfirmedTerritory,
  assertSiloDnaMatchesConfirmedWorkingCopy,
  assertSiloPageMatchesSiloDna,
  deriveExpectedCompositionFromWorkingCopy,
  deriveTerritorialArticlesFromWorkingCopy,
  refuseArticleVersionBinding,
  refusePillarDecisionBinding,
  refuseStatusEscalation,
  refusePlannedSiloBinding,
  refusePlannedSiloConfirmation,
  type BindingRefusal,
  type RemoteArticleVersion,
} from "@/lib/arquiteto/silo-dna-binding";
import {
  confirmSiloConsolidation,
  resolveSiloConsolidationReadiness,
  type SiloConsolidationDecision,
  type PlannedSiloConsolidationDecision,
} from "@/lib/arquiteto/silo-consolidation-territorial";
import {
  resolveSiloPageApprovalReadiness,
  type SiloPageApprovalDecision,
} from "@/lib/arquiteto/silo-page-approval";
import { CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION } from "@/lib/arquiteto/publication-scenario";
import type { TerritoryCandidate } from "@/lib/arquiteto/territory";
import type { SiloDNA, SiloPage, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { PlannedSiloSourceRefSchema, type PlannedSiloSourceRef, type PlannedSiloCurrentSource } from "@/lib/arquiteto/planned-silo-member";
import { plannedSiloComposition, plannedSiloTerritoryMatches } from "@/lib/arquiteto/planned-silo-composition";
import { readArchitectSubjectStanding } from "@/lib/arquiteto/declared-subject";
import { buildCanonicalWorkflowWorkspaceItems } from "@/lib/arquiteto/canonical-workspace";
import { loadCanonicalArquitetoWorkspace } from "./arquiteto-workspace";

/**
 * ADAPTER DA CONSOLIDAÇÃO SILO-FIRST.
 *
 * Chama SOMENTE `persist_silo_from_working_copy_atomic`. A 2C.1 e a primitiva do
 * par viraram internas.
 *
 * O servidor NÃO aceita o envelope pela palavra do chamador. Ele carrega a
 * working copy REMOTA inteira, o Território canônico e os ArticleDNA
 * versionados, DERIVA a expectativa da decisão já registrada e compara. Sem
 * isso, proveniência correta autorizava qualquer composição — e `workingCopyRef`
 * e `lock_version` são legíveis pelo GET do workspace.
 *
 * ESTABILIDADE DO ENVELOPE. Os envelopes chegam prontos e são repassados sem
 * reconstrução: `createVersionEnvelope` gera `versionId` e `createdAt` novos a
 * cada invocação, e regenerá-los num retry destruiria o replay idempotente.
 */

export type SiloConsolidationRequest = {
  territoryRef: string;
  territoryExpectedLock: number;
  workingCopyExpectedLock: number;
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage>;
  /** Independentes por contrato: aprovar o SiloDNA não aprova a SiloPage. */
  statuses: { siloDna: string; siloPage: string };
  /** Decisão humana de consolidação, exigida pelo gate da 2C.2. */
  decision: SiloConsolidationDecision | PlannedSiloConsolidationDecision;
  /**
   * Decisão humana de aprovação DA PÁGINA — independente da consolidação.
   * Ausente significa que a SiloPage não está sendo aprovada, não que a
   * aprovação foi dispensada: `siloPageStatus='approved'` sem ela é recusado.
   */
  siloPageApproval?: SiloPageApprovalDecision | null;
};

/**
 * Pré-condição de leitura para o futuro writer planejado. Não faz lock e não
 * autoriza gravação: a RPC deve repetir as mesmas verificações sob lock, além
 * de comprovar o vínculo territorial e cada Assunto/membro aprovado.
 */
export async function loadVerifiedPlannedSiloSource(context: PipelineContext, rawSource: PlannedSiloSourceRef): Promise<Record<string, unknown>> {
  const source = PlannedSiloSourceRefSchema.parse(rawSource);
  const result = await context.supabase.from("editorial_groups")
    .select("id,marca_id,origin,status,plan,plan_version,plan_hash,lock_version,silo_id")
    .eq("marca_id", context.brandId).eq("id", source.groupId).maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  const row = result.data as Record<string, unknown> | null;
  if (!row || row.id !== source.groupId || row.marca_id !== context.brandId || row.status !== "active" || row.origin !== "declared_plan" || !row.plan || typeof row.plan !== "object" || Array.isArray(row.plan)) {
    throw new PipelineRuntimeError("CONFLICT", "A fonte do plano não está disponível nesta marca.", 409);
  }
  if (row.plan_version !== source.planVersion || row.plan_hash !== source.planHash || row.lock_version !== source.lockVersion) {
    throw new PipelineRuntimeError("CONFLICT", "O plano ou sua versão mudou. Reprocesse a arquitetura antes de confirmar.", 409);
  }
  return row;
}

/** Leitura para etapas posteriores: vincular o grupo pode alterar só o lock. */
export async function loadCurrentPlannedSiloSource(context: PipelineContext, rawSource: PlannedSiloSourceRef, territoryRef: string, siloId: string): Promise<PlannedSiloCurrentSource> {
  const source = PlannedSiloSourceRefSchema.parse(rawSource);
  const result = await context.supabase.from("editorial_groups").select("id,marca_id,origin,status,plan,plan_version,plan_hash,lock_version,silo_id").eq("marca_id", context.brandId).eq("id", source.groupId).maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  const row = result.data as Record<string, unknown> | null;
  if (!row || !siloId || row.silo_id !== siloId || row.id !== source.groupId || row.marca_id !== context.brandId || row.origin !== "declared_plan" || row.status !== "active" || row.plan_version !== source.planVersion || row.plan_hash !== source.planHash) throw new PipelineRuntimeError("CONFLICT", "O plano ou o vínculo do Silo mudou ou não está disponível nesta marca. Revise a arquitetura antes de continuar.", 409);
  const workspace = await loadCanonicalArquitetoWorkspace(context);
  const rows = buildCanonicalWorkflowWorkspaceItems(workspace.workflowItems, workspace.keywords, context.brandId) as unknown as Array<Record<string, unknown>>;
  const composition = plannedSiloComposition({ brandId: context.brandId, group: { id: String(row.id), brandId: String(row.marca_id), origin: String(row.origin), status: String(row.status), plan: row.plan, planVersion: Number(row.plan_version), planHash: typeof row.plan_hash === "string" ? row.plan_hash : null, lockVersion: Number(row.lock_version) }, subjects: rows.map(readArchitectSubjectStanding) });
  if (!composition.ok || !plannedSiloTerritoryMatches({ territoryRef, members: composition.members, assignments: rows.map(item => ({ keywordId: String(item.id ?? ""), territoryRef: typeof item.territoryRef === "string" ? item.territoryRef : null })) })) throw new PipelineRuntimeError("CONFLICT", "Os Assuntos do plano ou seu território mudaram. Revise a arquitetura antes de continuar.", 409);
  const current: PlannedSiloCurrentSource = { brandId: context.brandId, groupId: source.groupId, origin: "declared_plan", status: "active", planVersion: source.planVersion, planHash: source.planHash, subjectProofs: composition.subjectProofs.map(proof => ({ keywordId: proof.keywordId, ...proof.approvedPackageRef })) };
  const reread = await context.supabase.from("editorial_groups").select("id,marca_id,origin,status,plan_version,plan_hash,silo_id").eq("marca_id", context.brandId).eq("id", source.groupId).maybeSingle();
  if (reread.error) throw pipelineErrorFromSupabase(reread.error);
  const after = reread.data as Record<string, unknown> | null;
  if (!after || after.silo_id !== siloId || after.id !== source.groupId || after.marca_id !== context.brandId || after.origin !== "declared_plan" || after.status !== "active" || after.plan_version !== source.planVersion || after.plan_hash !== source.planHash) throw new PipelineRuntimeError("CONFLICT", "O plano do Silo mudou durante a leitura. Revise a arquitetura antes de continuar.", 409);
  return current;
}

/**
 * Reconstrói a composição a partir dos pacotes recebidos na mesa canônica,
 * nunca de membros enviados pelo navegador. É uma leitura preparatória: não
 * trava linhas e não substitui a revalidação da futura RPC na transação.
 */
export async function loadVerifiedPlannedSiloComposition(context: PipelineContext, source: PlannedSiloSourceRef, territoryRef: string, siloId: string) {
  const group = await loadVerifiedPlannedSiloSource(context, source);
  if (!siloId || (group.silo_id != null && group.silo_id !== siloId)) throw new PipelineRuntimeError("CONFLICT", "O grupo do plano já está ligado a outro Silo; revise a estrutura antes de confirmar.", 409);
  const workspace = await loadCanonicalArquitetoWorkspace(context);
  const rows = buildCanonicalWorkflowWorkspaceItems(workspace.workflowItems, workspace.keywords, context.brandId) as unknown as Array<Record<string, unknown>>;
  const result = plannedSiloComposition({
    brandId: context.brandId,
    group: {
      id: String(group.id), brandId: String(group.marca_id), origin: String(group.origin), status: String(group.status),
      plan: group.plan, planVersion: Number(group.plan_version), planHash: typeof group.plan_hash === "string" ? group.plan_hash : null,
      lockVersion: Number(group.lock_version),
    },
    subjects: rows.map(readArchitectSubjectStanding),
  });
  if (!result.ok) throw new PipelineRuntimeError("CONFLICT", result.reason, 409);
  const assignments = rows.map(row => ({ keywordId: String(row.id ?? ""), territoryRef: typeof row.territoryRef === "string" ? row.territoryRef : null }));
  if (!plannedSiloTerritoryMatches({ territoryRef, members: result.members, assignments })) throw new PipelineRuntimeError("CONFLICT", "Os Assuntos do plano não estão todos vinculados ao território confirmado deste Silo.", 409);
  // Uma leitura longa da mesa não pode aceitar um plano já alterado durante a
  // montagem. A dupla leitura não é lock e não substitui a futura RPC.
  await loadVerifiedPlannedSiloSource(context, source);
  return result;
}

/** Pré-validação do mesmo gravador; a RPC ainda deve repetir as provas sob lock. */
export async function verifyPlannedSiloConsolidation(context: PipelineContext, workingCopy: SiloWorkingCopyState, siloDna: VersionEnvelope<SiloDNA>, siloPage: VersionEnvelope<SiloPage>, decision: PlannedSiloConsolidationDecision, options: { statuses: { siloDna: string; siloPage: string }; siloPageApproval: SiloPageApprovalDecision | null }) {
  if (!workingCopy.plannedComposition) throw new PipelineRuntimeError("CONFLICT", "A cópia não contém uma composição planejada.", 409);
  if (decision.actorUserId !== context.actorUserId || (options.siloPageApproval && options.siloPageApproval.actorUserId !== context.actorUserId)) throw new PipelineRuntimeError("NOT_AUTHORIZED", "A confirmação deve pertencer ao usuário autenticado.", 403);
  refuse(refusePlannedSiloConfirmation({ workingCopy, decision, authenticatedActorId: context.actorUserId }));
  const reference = siloPage.payload.siloDnaRef;
  if (siloDna.entityId !== siloDna.payload.siloId || siloPage.entityId !== siloPage.payload.siloPageId || reference.entityId !== siloDna.entityId || reference.versionId !== siloDna.versionId || reference.contentHash !== siloDna.contentHash) throw new PipelineRuntimeError("CONFLICT", "A página não referencia a versão exata do Silo planejado.", 409);
  const authority = await loadVerifiedPlannedSiloComposition(context, workingCopy.plannedComposition.source, workingCopy.territoryRef, siloDna.payload.siloId);
  refuse(refusePlannedSiloBinding({ workingCopy, siloDna: siloDna.payload, siloPage: siloPage.payload, authority }));
  const { territory } = await loadTerritory(context, workingCopy.territoryRef);
  if (!["confirmed", "consolidated"].includes(territory.lifecycleStatus) || territory.decisionState !== "confirmed") throw new PipelineRuntimeError("CONFLICT", "O território do Silo precisa estar confirmado antes da consolidação.", 409);
  refuse(assertSiloDnaMatchesConfirmedTerritory({ territory: { territoryRef: territory.territoryRef, centralEntity: territory.centralEntity, macroIntent: territory.macroIntent, boundary: territory.boundary, narrative: territory.narrative }, siloDna: siloDna.payload }));
  const pageApproval = resolveSiloPageApprovalReadiness({ brandId: context.brandId, territoryRef: workingCopy.territoryRef, siloId: siloDna.payload.siloId, siloPage: siloPage.payload, siloPageVersion: { versionId: siloPage.versionId, contentHash: siloPage.contentHash }, siloDna: siloDna.payload, siloDnaVersion: { versionId: siloDna.versionId }, decision: options.siloPageApproval, actor: "human", publishedVerificationRequired: CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION });
  refuse(refuseStatusEscalation({ siloDnaStatus: options.statuses.siloDna, siloPageStatus: options.statuses.siloPage, humanConsolidationConfirmed: true, siloPageApproval: pageApproval }));
  return authority;
}

export type SiloConsolidationResult = {
  persistence: "PERSISTED";
  source: "CANONICAL_REMOTE";
  entrypoint: string;
  atomicity: string;
  idempotentReplay: boolean;
  territory: unknown;
  siloDna: unknown;
  siloPage: unknown;
  workingCopy: unknown;
  /**
   * F4 — o grupo do plano declarado ligado ao Silo (`editorial_groups.silo_id`).
   * Aditivo e nunca fatal: `failed` não desfaz a consolidação.
   */
  groupLink?: SiloGroupLinkOutcome;
};

const WORKFLOW_COLUMNS =
  "id,marca_id,subject_type,subject_id,article_id,stage,state,source_entity_id,payload,lock_version";

function refuse(refusals: readonly BindingRefusal[]): void {
  if (!refusals.length) return;
  // Cada recusa mantém código próprio: colapsar em falha genérica apagaria a
  // diferença entre "a arquitetura não é a decidida" e "o banco caiu".
  const first = refusals[0];
  throw new PipelineRuntimeError("CONFLICT", `${first.code}: ${first.detail}`, 409);
}

/** Território canônico, com todos os guards de linha. */
async function loadTerritory(
  context: PipelineContext,
  territoryRef: string,
): Promise<{ workflowItemId: string; territory: TerritoryCandidate }> {
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(WORKFLOW_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", TERRITORY_SUBJECT_TYPE)
    .eq("stage", TERRITORY_WORKFLOW_STAGE)
    .eq("subject_id", territoryRef)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  const row = result.data as Record<string, unknown> | null;
  if (!row) throw new PipelineRuntimeError("CONFLICT", "INCOHERENT_TERRITORY_RECORD: território ausente", 409);

  const parsed = parseTerritoryWorkflowRow(
    {
      subjectType: String(row.subject_type ?? ""),
      subjectId: String(row.subject_id ?? ""),
      stage: String(row.stage ?? ""),
      state: String(row.state ?? ""),
      sourceEntityId: String(row.source_entity_id ?? ""),
      articleId: (row.article_id as string | null) ?? null,
      payload: row.payload,
    },
    context.brandId,
  );
  if (!parsed.ok) {
    throw new PipelineRuntimeError("CONFLICT", `INCOHERENT_TERRITORY_RECORD: ${parsed.issues.join(", ")}`, 409);
  }
  return { workflowItemId: String(row.id), territory: parsed.territory };
}

/** Working copy remota INTEIRA — não só ref e lock. */
async function loadWorkingCopy(
  context: PipelineContext,
  territoryRef: string,
): Promise<{ workingCopy: SiloWorkingCopyState; lockVersion: number }> {
  const workingCopyRef = buildSiloWorkingCopyRef(territoryRef);
  const result = await context.supabase
    .from("editorial_workflow_items")
    .select(WORKFLOW_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", SILO_WORKING_COPY_SUBJECT_TYPE)
    .eq("stage", SILO_WORKING_COPY_STAGE)
    .eq("subject_id", workingCopyRef)
    .maybeSingle();
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  const row = result.data as Record<string, unknown> | null;
  if (!row) throw new PipelineRuntimeError("CONFLICT", "WORKING_COPY_NOT_FOUND", 409);

  const parsed = parseSiloWorkingCopyRow(
    {
      subjectType: String(row.subject_type ?? ""),
      subjectId: String(row.subject_id ?? ""),
      stage: String(row.stage ?? ""),
      state: String(row.state ?? ""),
      sourceEntityId: String(row.source_entity_id ?? ""),
      articleId: (row.article_id as string | null) ?? null,
      payload: row.payload,
    },
    context.brandId,
  );
  if (!parsed.ok) {
    throw new PipelineRuntimeError("CONFLICT", `SILO_WORKING_COPY_RECORD_INCOHERENT: ${parsed.issues.join(", ")}`, 409);
  }
  return { workingCopy: parsed.workingCopy, lockVersion: Number(row.lock_version) };
}

/** ArticleDNA versionados, pelas referências que a working copy registrou. */
export async function loadArticleVersions(
  context: PipelineContext,
  workingCopy: SiloWorkingCopyState,
): Promise<RemoteArticleVersion[]> {
  const versionIds = workingCopy.articleRefs.map(reference => reference.articleDnaVersionId);
  if (!versionIds.length) return [];
  const result = await context.supabase
    .from("editorial_artifact_versions")
    .select("version_id,entity_id,content_hash,payload,status")
    .eq("marca_id", context.brandId)
    .eq("artifact_type", "article_dna")
    .in("version_id", versionIds);
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  const statuses = new Map<string, string>();
  const authorizedVersions = ((result.data || []) as Array<Record<string, unknown>>)
    .map(row => typeof row.version_id === "string" ? row.version_id : "").filter(Boolean);
  for (const versionId of [...new Set(authorizedVersions)]) {
    const event = await context.supabase.from("editorial_version_status_events")
      .select("status")
      .eq("version_id", versionId)
      .order("occurred_at", { ascending: false }).order("id", { ascending: false })
      .limit(1).maybeSingle();
    if (event.error) throw pipelineErrorFromSupabase(event.error);
    if (typeof event.data?.status === "string") statuses.set(versionId, event.data.status);
  }
  return ((result.data || []) as Array<Record<string, unknown>>).map(row => {
    const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
    return {
      versionId: String(row.version_id ?? ""),
      entityId: String(row.entity_id ?? ""),
      contentHash: String(row.content_hash ?? ""),
      brandId: typeof payload.brandId === "string" ? payload.brandId : "",
      territoryRef: typeof payload.territoryRef === "string" ? payload.territoryRef : null,
      effectiveStatus: statuses.get(String(row.version_id ?? "")) ?? (typeof row.status === "string" ? row.status : null),
    };
  });
}

async function consolidateSiloFromWorkingCopyCore(
  context: PipelineContext,
  request: SiloConsolidationRequest,
): Promise<SiloConsolidationResult> {
  // ---------------------------------------------------------- 1. snapshot remoto
  const { workflowItemId, territory } = await loadTerritory(context, request.territoryRef);
  const { workingCopy, lockVersion } = await loadWorkingCopy(context, request.territoryRef);

  // Não aplicar as guardas antigas, baseadas em ArticleDNA, ao contrato novo;
  // a gravação planejada exige validação transacional da fonte e dos membros.
  if (workingCopy.plannedComposition || request.siloDna.payload.compositionBasis === "planned_members" || request.siloPage.payload.compositionBasis === "planned_members" || "scope" in request.decision) {
    throw new PipelineRuntimeError("CONFLICT", "A consolidação de estrutura planejada ainda está em adaptação.", 409);
  }

  if (workingCopy.territoryRef !== territory.territoryRef) {
    throw new PipelineRuntimeError("CONFLICT", "TERRITORY_REF_MISMATCH", 409);
  }
  // O lock lido AQUI é o que viaja para a RPC: se virar N+1 no meio, ela recusa
  // com STALE_WORKING_COPY e nenhum artefato é gravado.
  if (lockVersion !== request.workingCopyExpectedLock) {
    throw new PipelineRuntimeError("CONFLICT", "STALE_WORKING_COPY", 409);
  }

  const articleVersions = await loadArticleVersions(context, workingCopy);
  refuse(refuseArticleVersionBinding({ workingCopy, remoteVersions: articleVersions }));
  refuse(refusePillarDecisionBinding(workingCopy));

  // ------------------------------------------------- 2. readiness SERVER-SIDE
  // Sobre o snapshot REMOTO. Nenhum booleano do chamador é autoridade.
  const composition = deriveExpectedCompositionFromWorkingCopy(workingCopy);
  const remoteById = new Map(articleVersions.map(version => [version.versionId, version]));
  const articles = deriveTerritorialArticlesFromWorkingCopy(workingCopy, remoteById);

  const readiness = resolveSiloConsolidationReadiness({
    territory,
    composition,
    articles,
    decision: request.decision,
    siloDnaTerritoryRef: request.siloDna.payload.territoryRef ?? null,
    siloPageTerritoryRef: request.siloPage.payload.territoryRef ?? null,
  });
  if (readiness.state !== "ready") {
    throw new PipelineRuntimeError(
      "CONFLICT",
      `SILO_NOT_READY_FOR_CONSOLIDATION: ${readiness.blockers.map(blocker => blocker.code).join(", ")}`,
      409,
    );
  }

  // ------------------------------------------- 3. confirmação humana canônica
  const confirmation = confirmSiloConsolidation({
    readiness,
    composition,
    decision: request.decision,
    actor: "human",
    alreadyConsolidated: territory.lifecycleStatus === "consolidated",
  });
  const humanConsolidationConfirmed = confirmation.status === "consolidated";
  if (!humanConsolidationConfirmed && territory.lifecycleStatus !== "consolidated") {
    throw new PipelineRuntimeError(
      "CONFLICT",
      `HUMAN_SILO_CONSOLIDATION_REQUIRED: ${confirmation.status === "refused" ? confirmation.refusals.map(item => item.code).join(", ") : ""}`,
      409,
    );
  }

  // ------------------------------------------------ 4. binding dos envelopes
  // O Território confirmado é a autoridade dos campos que a working copy não
  // decide. Eles não são livres, e os ArticleDNAs não os redefinem: divergência
  // volta à revisão territorial, não consolida.
  refuse(assertSiloDnaMatchesConfirmedTerritory({
    territory: {
      territoryRef: territory.territoryRef,
      centralEntity: territory.centralEntity,
      macroIntent: territory.macroIntent,
      boundary: territory.boundary,
      narrative: territory.narrative,
    },
    siloDna: request.siloDna.payload,
  }));
  refuse(assertSiloDnaMatchesConfirmedWorkingCopy({
    workingCopy,
    workingCopyLockVersion: lockVersion,
    siloDna: request.siloDna.payload,
  }));
  refuse(assertSiloPageMatchesSiloDna({
    siloDna: request.siloDna.payload,
    siloPage: request.siloPage.payload,
    workingCopy,
    publishedIdentityDecisionResolved: request.decision.publishedIdentityResolved,
  }));
  // Gate PRÓPRIO da SiloPage. Resolvido aqui, sobre os artefatos remotos e o
  // envelope recebido — o cliente entrega a decisão, nunca o veredito.
  const siloPageApproval = resolveSiloPageApprovalReadiness({
    brandId: context.brandId,
    territoryRef: territory.territoryRef,
    siloId: request.siloDna.payload.siloId,
    siloPage: request.siloPage.payload,
    siloPageVersion: { versionId: request.siloPage.versionId, contentHash: request.siloPage.contentHash },
    siloDna: request.siloDna.payload,
    siloDnaVersion: { versionId: request.siloDna.versionId },
    decision: request.siloPageApproval ?? null,
    actor: "human",
    /*
     * O CENÁRIO É DECLARADO NO CÓDIGO, NÃO ENVIADO PELO CLIENTE.
     *
     * Aceitar esta bandeira no corpo da requisição deixaria a tela relaxar o
     * próprio portão. Esta passada fecha arquitetura planejada; a capacidade
     * de reconciliar publicados continua inteira e volta a ser exigida quando
     * a constante mudar.
     */
    publishedVerificationRequired: CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION,
  });
  refuse(refuseStatusEscalation({
    siloDnaStatus: request.statuses.siloDna,
    siloPageStatus: request.statuses.siloPage,
    humanConsolidationConfirmed,
    siloPageApproval,
  }));

  // ------------------------------------------------- 4b. Assunto do SiloDNA
  // O envelope vem pronto do cliente: Assunto novo ou alterado passa pela
  // mesma guarda do writer (ator, marca, declaração, pacote), e a versão nova
  // não perde em silêncio o Assunto da vigente. Sem Assunto em nenhuma das
  // duas, só a leitura estreita da versão vigente.
  await assertConsolidatedSiloSubject(context, {
    entityId: request.siloDna.entityId,
    subject: request.siloDna.payload.subject,
  });

  // ------------------------------------------------------------- 5. RPC A
  const result = await context.supabase.rpc("persist_silo_from_working_copy_atomic", {
    p_marca_id: context.brandId,
    p_actor_user_id: context.actorUserId,
    p_action: context.action,
    p_territory_workflow_item_id: workflowItemId,
    p_territory_expected_lock: request.territoryExpectedLock,
    p_working_copy_expected_lock: request.workingCopyExpectedLock,
    p_silo_dna: request.siloDna,
    p_silo_page: request.siloPage,
    p_silo_dna_status: request.statuses.siloDna,
    p_silo_page_status: request.statuses.siloPage,
  });
  if (result.error) {
    const code = readRpcDomainError(result.error);
    if (code) throw new PipelineRuntimeError("CONFLICT", code, 409);
    // O log conserva categoria e código, inclusive de Error não enumerável;
    // mensagens SQL, dados editoriais e credenciais não são registradas.
    console.error(`[silo-consolidation] RPC recusou ${JSON.stringify(siloRpcErrorDiagnostic(result.error))}`);
    throw pipelineErrorFromSupabase(result.error);
  }

  const data = result.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new PipelineRuntimeError("QUERY_FAILURE", "A consolidação não devolveu readback canônico.", 503);
  }
  // Sucesso só depois do readback: os quatro artefatos precisam ter voltado.
  for (const key of ["territory", "siloDna", "siloPage", "workingCopy"]) {
    const value = data[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new PipelineRuntimeError("QUERY_FAILURE", `O readback da consolidação está incompleto (${key}).`, 503);
    }
  }

  // O readback sai no MESMO formato de todo leitor canônico.
  //
  // A RPC devolve a linha do banco em snake_case. Repassá-la crua fazia o
  // cliente receber um objeto sem versionId, sem contentHash e sem createdAt:
  // a consolidação commitava no servidor e aparecia como falha na tela — o
  // pior desfecho possível, porque convida a repetir uma escrita que já valeu.
  const siloDnaEnvelope = canonicalVersionFromRow("silo_dna", data.siloDna as Record<string, unknown>);
  const siloPageEnvelope = canonicalVersionFromRow("silo_page", data.siloPage as Record<string, unknown>);

  // Não anunciar a conclusão nem vincular o grupo quando o retorno da RPC não
  // corresponde ao par confirmado. A RPC pode já ter gravado: o erro pede
  // releitura, não uma nova versão criada automaticamente.
  if (siloDnaEnvelope.entityId !== request.siloDna.entityId || siloDnaEnvelope.versionId !== request.siloDna.versionId || siloDnaEnvelope.contentHash !== request.siloDna.contentHash ||
      siloPageEnvelope.entityId !== request.siloPage.entityId || siloPageEnvelope.versionId !== request.siloPage.versionId || siloPageEnvelope.contentHash !== request.siloPage.contentHash) {
    throw new PipelineRuntimeError("QUERY_FAILURE", "A gravação do Silo retornou versões diferentes das confirmadas. Recarregue a arquitetura para verificar o resultado antes de tentar novamente.", 503);
  }

  /*
   * F4 — DEPOIS do readback, nunca antes: o Silo já está gravado e confirmado.
   * O vínculo do grupo do plano é aditivo e não derruba a consolidação.
   */
  const consolidado = siloDnaEnvelope as VersionEnvelope<SiloDNA>;
  const groupLink = await linkDeclaredPlanGroupToSilo(context, {
    siloId: consolidado.payload.siloId,
    articleVersionIds: consolidado.payload.articleReferences.map(reference => reference.articleDnaVersionId),
  });

  return {
    persistence: "PERSISTED",
    source: "CANONICAL_REMOTE",
    entrypoint: String(data.entrypoint ?? "persist_silo_from_working_copy_atomic"),
    atomicity: String(data.atomicity ?? "TRANSACTIONAL_RPC"),
    idempotentReplay: data.idempotentReplay === true,
    territory: data.territory,
    siloDna: siloDnaEnvelope,
    siloPage: siloPageEnvelope,
    workingCopy: data.workingCopy,
    groupLink,
  };
}

/**
 * F5 · GUARDA DE RETRABALHO NO FECHAMENTO DO SILO (SDD 2026-10-12 §10.3).
 *
 * O núcleo único da consolidação (rota da tela; o fechamento automático usa a
 * mesma rota). A recusa de domínio ANTES da gravação (os portões de
 * `SILO_CONSOLIDATION_PRE_WRITE_REFUSAL_PREFIXES`) fica registrada com os
 * insumos; o MESMO pedido de novo, sem nada mudado, volta 409
 * `REWORK_SAME_REFUSAL` com "a mesma recusa de <data>" e não chega à RPC.
 * "Refazer mesmo assim" com motivo (D11) passa. Falha de rede, 5xx e
 * conflito de lock não são recusa: a retomada com o mesmo envelope segue livre.
 */
export async function consolidateSiloFromWorkingCopy(
  context: PipelineContext,
  request: SiloConsolidationRequest,
  options: { reworkOverride?: ReworkOverride } = {},
): Promise<SiloConsolidationResult> {
  if (request.siloDna.payload.compositionBasis === "planned_members" || request.siloPage.payload.compositionBasis === "planned_members" || "scope" in request.decision) {
    throw new PipelineRuntimeError("CONFLICT", "A consolidação de estrutura planejada ainda está em adaptação.", 409);
  }
  if (request.decision.actorUserId !== context.actorUserId || (request.siloPageApproval && request.siloPageApproval.actorUserId !== context.actorUserId)) {
    throw new PipelineRuntimeError("NOT_AUTHORIZED", "A confirmação do Silo e da página deve pertencer ao usuário autenticado.", 403);
  }
  if (request.statuses.siloDna === "approved" || request.statuses.siloPage === "approved") {
    // Criar/editar é uma permissão distinta de aprovar. A confirmação usa o
    // mesmo ator e cliente já autenticados e precisa das duas autorizações.
    await resolvePipelineContext({ brandId: context.brandId, module: "arquiteto", action: "approve" }, {
      requireActorUserId: async () => context.actorUserId,
      createServiceClient: () => context.supabase,
    });
  }
  const operation = {
    kind: "silo_consolidation" as const,
    fingerprint: await operationFingerprint("silo_consolidation", siloConsolidationReworkInputs(request)),
    inputsSummary: `Fechamento do Silo ${request.territoryRef} (cópia de trabalho v${request.workingCopyExpectedLock}).`,
    policy: { sameInputs: "ignore" as const, sameRefusal: "block" as const },
  };
  return runUnderReworkGuard(context, operation, {
    override: options.reworkOverride,
    // Só a recusa de domínio ANTES da RPC é "a mesma recusa"; rede, 5xx e lock seguem retomáveis.
    classifyFailure: error => siloConsolidationFailureDisposition(error) === "discard" ? "refused" : "failed",
    success: result => ({ outcomeCode: "SILO_CONSOLIDATED", resultRef: typeof (result.siloDna as { versionId?: unknown } | null)?.versionId === "string" ? (result.siloDna as { versionId: string }).versionId : request.territoryRef, costUsd: 0 }),
  }, () => consolidateSiloFromWorkingCopyCore(context, request));
}

/** O que muda o resultado do fechamento — sem os ids e instantes gerados a cada clique. */
const VOLATILE_KEYS = new Set(["versionId", "previousVersionId", "createdAt", "updatedAt", "decidedAt", "approvedAt", "actorUserId", "contentHash", "siloPageVersionId", "siloPageContentHash", "siloDnaVersionId"]);
function semVolateis(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semVolateis);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !VOLATILE_KEYS.has(key)).map(([key, item]) => [key, semVolateis(item)]));
}
export function siloConsolidationReworkInputs(request: SiloConsolidationRequest) {
  return semVolateis({
    territoryRef: request.territoryRef,
    territoryExpectedLock: request.territoryExpectedLock,
    workingCopyExpectedLock: request.workingCopyExpectedLock,
    statuses: request.statuses,
    decision: request.decision,
    siloPageApproval: request.siloPageApproval ?? null,
    siloDna: request.siloDna.payload,
    siloPage: request.siloPage.payload,
  });
}
