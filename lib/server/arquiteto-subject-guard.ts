import "server-only";

/**
 * A GUARDA DO ASSUNTO NA GRAVAÇÃO — leitura estreita, por id.
 *
 * A regra é do domínio (`lib/arquiteto/declared-subject-guard.ts`); aqui só se
 * lê o mínimo para aplicá-la, e SÓ quando o Assunto é novo ou mudou:
 *
 *   - o `subject` da versão vigente do artefato (`payload->subject`, não o
 *     payload inteiro);
 *   - a linha da keyword do Assunto (id, marca, frase, exclusão);
 *   - o pacote aprovado do item de workflow do Arquiteto
 *     (`payload->approvedDna`, não o payload inteiro).
 *
 * Sem Assunto, nenhuma leitura nova: a gravação é a mesma de antes.
 */

import type { DeclaredSubject } from "@/lib/arquiteto/contracts";
import {
  readWorkingSubjectAnchor,
  sameWorkingSubjectAnchor,
  subjectDroppedOnConsolidation,
  subjectGuardKeyword,
  subjectPrincipalRequiresCheck,
  subjectWriteRequiresCheck,
  SUBJECT_DROPPED_REASON,
  SUBJECT_WRITE_AUTHORIZATION_CODES,
  verifyDeclaredSubjectWrite,
  verifySubjectAsPrincipal,
  verifyWorkingSubjectAnchorWrite,
  WORKING_SUBJECT_ANCHOR_FIELD,
  WorkingSubjectAnchorSchema,
  type SubjectActorMode,
  type SubjectWriteRefusalCode,
} from "@/lib/arquiteto/declared-subject-guard";
import { PipelineRuntimeError, type PipelineContext } from "./pipeline-runtime";

/** Recusa do Assunto: código próprio, motivo em uma frase, status 403 ou 409. */
export class SubjectWriteRefusedError extends PipelineRuntimeError {
  public readonly subjectCode: SubjectWriteRefusalCode;

  constructor(subjectCode: SubjectWriteRefusalCode, reason: string) {
    const authorization = SUBJECT_WRITE_AUTHORIZATION_CODES.has(subjectCode);
    super(authorization ? "NOT_AUTHORIZED" : "CONFLICT", `Assunto recusado (${subjectCode}): ${reason}`, authorization ? 403 : 409);
    this.name = "SubjectWriteRefusedError";
    this.subjectCode = subjectCode;
  }
}

/** Falha de leitura fecha a gravação: sem saber o que está gravado, nada é escrito. */
function readFailure(): never {
  throw new PipelineRuntimeError("QUERY_FAILURE", "Não foi possível conferir o Assunto no banco; nada foi gravado.", 503);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SUBJECT_GUARD_KEYWORD_COLUMNS = "id,brand_id,keyword,deleted_at";
export const SUBJECT_GUARD_WORKFLOW_COLUMNS = "state,approvedDna:payload->approvedDna";
export const SUBJECT_GUARD_PREVIOUS_COLUMNS = "version_id,subject:payload->subject,principalKeywordId:payload->principalKeywordId";

/**
 * A keyword do Assunto e o pacote aprovado dela. A linha é lida pelo id, sem
 * filtro de marca, para a recusa dizer "outra marca" em vez de "não existe";
 * o pacote só é lido quando a marca confere.
 */
export async function readSubjectGuardKeyword(context: PipelineContext, keywordId: string) {
  if (!UUID_PATTERN.test(keywordId)) return null;
  const keywordResult = await context.supabase
    .from("minerador_keywords")
    .select(SUBJECT_GUARD_KEYWORD_COLUMNS)
    .eq("id", keywordId)
    .maybeSingle();
  if (keywordResult.error) readFailure();
  const keyword = (keywordResult.data || null) as Record<string, unknown> | null;
  if (!keyword || String(keyword.brand_id ?? "") !== context.brandId) {
    return subjectGuardKeyword({ keyword, workflow: null });
  }
  const workflowResult = await context.supabase
    .from("editorial_workflow_items")
    .select(SUBJECT_GUARD_WORKFLOW_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("subject_type", "keyword")
    .eq("stage", "architect")
    .eq("subject_id", keywordId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (workflowResult.error) readFailure();
  const workflow = (workflowResult.data || null) as { state?: unknown; approvedDna?: unknown } | null;
  return subjectGuardKeyword({ keyword, workflow: workflow ? { state: workflow.state, approvedDna: workflow.approvedDna } : null });
}

type PreviousSubjectState = { subject: DeclaredSubject | null; principalKeywordId: string | null };

/** O `subject` da versão vigente do artefato; sem versão ou sem Assunto, `null`. */
export async function readLatestArtifactSubject(
  context: PipelineContext,
  artifactType: "article_dna" | "silo_dna",
  entityId: string,
): Promise<DeclaredSubject | null> {
  return (await readLatestArtifactSubjectState(context, artifactType, entityId)).subject;
}

/** `subject` e principal da versão vigente — só os dois campos, não o payload. */
async function readLatestArtifactSubjectState(
  context: PipelineContext,
  artifactType: "article_dna" | "silo_dna",
  entityId: string,
): Promise<PreviousSubjectState> {
  const result = await context.supabase
    .from("editorial_artifact_versions")
    .select(SUBJECT_GUARD_PREVIOUS_COLUMNS)
    .eq("marca_id", context.brandId)
    .eq("entity_id", entityId)
    .eq("artifact_type", artifactType)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) readFailure();
  const row = result.data as { subject?: unknown; principalKeywordId?: unknown } | null;
  const subject = row?.subject;
  return {
    subject: subject && typeof subject === "object" && !Array.isArray(subject) ? subject as DeclaredSubject : null,
    principalKeywordId: typeof row?.principalKeywordId === "string" ? row.principalKeywordId : null,
  };
}

/** O Silo já tem SiloPage? Versão nova do SiloDNA sozinho desalinharia a página. */
async function siloHasPage(context: PipelineContext, siloId: string) {
  const result = await context.supabase
    .from("editorial_artifact_versions")
    .select("version_id")
    .eq("marca_id", context.brandId)
    .eq("entity_id", `silo-page:${siloId}`)
    .eq("artifact_type", "silo_page")
    .limit(1)
    .maybeSingle();
  if (result.error) readFailure();
  return Boolean(result.data);
}

export const SUBJECT_SILO_PAGE_BOUND_REASON =
  "Este Silo já tem SiloPage ligada à versão atual do SiloDNA. Prender o Assunto criaria outra versão do SiloDNA e desalinharia a página em silêncio; o Assunto do Silo com página entra pela consolidação do Silo.";

type SubjectWriteInput = {
  artifactType: "article_dna" | "silo_dna";
  entityId: string;
  subject: DeclaredSubject | undefined;
  principalKeywordId?: string | null;
  actorMode?: SubjectActorMode;
  pairedWithPage?: boolean;
};

/**
 * Confere o `subject` de um ArticleDNA ou SiloDNA antes de gravar.
 *
 * `pairedWithPage`: a consolidação grava SiloDNA e SiloPage juntos, então a
 * página nasce apontando para a versão nova e nada fica desalinhado.
 */
export async function assertDeclaredSubjectWrite(context: PipelineContext, input: SubjectWriteInput) {
  if (!input.subject) return;
  const previous = await readLatestArtifactSubjectState(context, input.artifactType, input.entityId);
  await checkSubjectAgainstPrevious(context, input, previous);
}

/**
 * A consolidação canônica do Silo (`persist_silo_from_working_copy_atomic`)
 * recebe o envelope pronto do cliente. Aqui a versão vigente é SEMPRE lida
 * (leitura estreita, dois campos): perder o Assunto é recusado, e Assunto
 * novo ou alterado passa pela mesma guarda do writer. SiloDNA e SiloPage são
 * gravados juntos, então a página nasce apontando para a versão nova.
 */
export async function assertConsolidatedSiloSubject(context: PipelineContext, input: {
  entityId: string;
  subject: DeclaredSubject | undefined;
}) {
  const previous = await readLatestArtifactSubjectState(context, "silo_dna", input.entityId);
  if (subjectDroppedOnConsolidation(previous.subject, input.subject)) {
    throw new SubjectWriteRefusedError("SUBJECT_DROPPED", SUBJECT_DROPPED_REASON);
  }
  await checkSubjectAgainstPrevious(context, {
    artifactType: "silo_dna",
    entityId: input.entityId,
    subject: input.subject,
    pairedWithPage: true,
  }, previous);
}

async function checkSubjectAgainstPrevious(context: PipelineContext, input: SubjectWriteInput, previous: PreviousSubjectState) {
  if (!input.subject) return;
  if (!subjectWriteRequiresCheck(previous.subject, input.subject)) {
    if (subjectPrincipalRequiresCheck({
      subject: input.subject,
      principalKeywordId: input.principalKeywordId ?? null,
      previousPrincipalKeywordId: previous.principalKeywordId,
    })) {
      const keyword = await readSubjectGuardKeyword(context, input.subject.keywordId);
      const verdict = verifySubjectAsPrincipal({ brandId: context.brandId, keywordId: input.subject.keywordId, keyword });
      if (!verdict.ok) throw new SubjectWriteRefusedError(verdict.code, verdict.reason);
    }
    return;
  }
  const keyword = await readSubjectGuardKeyword(context, input.subject.keywordId);
  const verdict = verifyDeclaredSubjectWrite({
    brandId: context.brandId,
    actorUserId: context.actorUserId,
    subject: input.subject,
    keyword,
    principalKeywordId: input.principalKeywordId ?? null,
    actorMode: input.actorMode,
  });
  if (!verdict.ok) throw new SubjectWriteRefusedError(verdict.code, verdict.reason);
  if (input.artifactType === "silo_dna" && !input.pairedWithPage && input.actorMode !== "restored"
    && await siloHasPage(context, input.entityId)) {
    throw new SubjectWriteRefusedError("SUBJECT_SILO_PAGE_BOUND", SUBJECT_SILO_PAGE_BOUND_REASON);
  }
}

/**
 * Confere o vínculo do Assunto numa edição da cópia de trabalho.
 *
 * Só quando a atribuição traz o campo e ele muda: soltar (`null`) é sempre
 * aceito; prender ou trocar passa pela mesma guarda de ator e marca.
 */
export async function assertWorkingSubjectAnchorAssignment(
  context: PipelineContext,
  currentPayload: Record<string, unknown>,
  assignment: Record<string, unknown>,
) {
  if (!Object.prototype.hasOwnProperty.call(assignment, WORKING_SUBJECT_ANCHOR_FIELD)) return;
  const raw = assignment[WORKING_SUBJECT_ANCHOR_FIELD];
  if (raw === null || raw === undefined) return;
  const parsed = WorkingSubjectAnchorSchema.safeParse(raw);
  if (!parsed.success) throw new SubjectWriteRefusedError("SUBJECT_INVALID", "O vínculo do Assunto não fecha o contrato da cópia de trabalho.");
  if (sameWorkingSubjectAnchor(readWorkingSubjectAnchor(currentPayload), parsed.data)) return;
  const keyword = await readSubjectGuardKeyword(context, parsed.data.subjectKeywordId);
  const verdict = verifyWorkingSubjectAnchorWrite({ brandId: context.brandId, actorUserId: context.actorUserId, anchor: parsed.data, keyword });
  if (!verdict.ok) throw new SubjectWriteRefusedError(verdict.code, verdict.reason);
}
