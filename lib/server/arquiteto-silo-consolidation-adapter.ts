import "server-only";

import type { PipelineContext } from "./pipeline-runtime";
import { PipelineRuntimeError, pipelineErrorFromSupabase } from "./pipeline-runtime";
import { readRpcDomainError } from "@/lib/arquiteto/silo-working-copy-record";
import { canonicalVersionFromRow } from "./arquiteto-persistence";
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
  type BindingRefusal,
  type RemoteArticleVersion,
} from "@/lib/arquiteto/silo-dna-binding";
import {
  confirmSiloConsolidation,
  resolveSiloConsolidationReadiness,
  type SiloConsolidationDecision,
} from "@/lib/arquiteto/silo-consolidation-territorial";
import {
  resolveSiloPageApprovalReadiness,
  type SiloPageApprovalDecision,
} from "@/lib/arquiteto/silo-page-approval";
import type { TerritoryCandidate } from "@/lib/arquiteto/territory";
import type { SiloDNA, SiloPage, VersionEnvelope } from "@/lib/arquiteto/contracts";

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
  decision: SiloConsolidationDecision;
  /**
   * Decisão humana de aprovação DA PÁGINA — independente da consolidação.
   * Ausente significa que a SiloPage não está sendo aprovada, não que a
   * aprovação foi dispensada: `siloPageStatus='approved'` sem ela é recusado.
   */
  siloPageApproval?: SiloPageApprovalDecision | null;
};

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
async function loadArticleVersions(
  context: PipelineContext,
  workingCopy: SiloWorkingCopyState,
): Promise<RemoteArticleVersion[]> {
  const versionIds = workingCopy.articleRefs.map(reference => reference.articleDnaVersionId);
  if (!versionIds.length) return [];
  const result = await context.supabase
    .from("editorial_artifact_versions")
    .select("version_id,entity_id,content_hash,payload")
    .eq("marca_id", context.brandId)
    .eq("artifact_type", "article_dna")
    .in("version_id", versionIds);
  if (result.error) throw pipelineErrorFromSupabase(result.error);
  return ((result.data || []) as Array<Record<string, unknown>>).map(row => {
    const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
    return {
      versionId: String(row.version_id ?? ""),
      entityId: String(row.entity_id ?? ""),
      contentHash: String(row.content_hash ?? ""),
      brandId: typeof payload.brandId === "string" ? payload.brandId : "",
      territoryRef: typeof payload.territoryRef === "string" ? payload.territoryRef : null,
    };
  });
}

export async function consolidateSiloFromWorkingCopy(
  context: PipelineContext,
  request: SiloConsolidationRequest,
): Promise<SiloConsolidationResult> {
  // ---------------------------------------------------------- 1. snapshot remoto
  const { workflowItemId, territory } = await loadTerritory(context, request.territoryRef);
  const { workingCopy, lockVersion } = await loadWorkingCopy(context, request.territoryRef);

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
  });
  refuse(refuseStatusEscalation({
    siloDnaStatus: request.statuses.siloDna,
    siloPageStatus: request.statuses.siloPage,
    humanConsolidationConfirmed,
    siloPageApproval,
  }));

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
    // O erro bruto fica no log do servidor, nunca na resposta: a mensagem
    // mapeada não distingue "faltou privilégio" de "faltou schema", e sem o
    // original a investigação vira adivinhação. Expor ao cliente contaria a
    // estrutura interna do banco a quem pediu a escrita.
    console.error("[silo-consolidation] RPC recusou", result.error);
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
  };
}
