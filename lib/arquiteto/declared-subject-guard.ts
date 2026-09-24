/**
 * A GUARDA DO ASSUNTO NO SERVIDOR — F2 fase B (SDD 2026-09-24,
 * `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`).
 *
 * A tela já monta o `subject` pelo pacote aprovado (`planSubjectAttachment`),
 * mas estado de navegador não é autorização (AGENTS.md §10). Esta é a
 * conferência que o writer faz antes de gravar um ArticleDNA, um SiloDNA ou o
 * vínculo do Assunto na cópia de trabalho:
 *
 *   - quem prende é o `auth.users.id` da requisição — nunca IA, e-mail ou
 *     "local-user" (AGENTS.md §9);
 *   - a keyword é viva, da MESMA marca, chegou ao Arquiteto e o pacote
 *     aprovado dela declara Assunto;
 *   - `approvedPackageRef`, `phrase`, `note` e `destinationUrl` são os do
 *     pacote (o snapshot não é inventado pelo cliente);
 *   - o Assunto só é a própria principal com Volume validado (Q7).
 *
 * Subject IGUAL ao da versão anterior passa sem conferência: carregar o que já
 * foi preso não é prender de novo.
 *
 * Domínio puro: sem rede e sem storage. Quem lê o banco (leitura estreita, por
 * id) é `lib/server/arquiteto-subject-guard.ts`.
 */

import { z } from "zod";
import { isKeywordSubjectActorId } from "../minerador/keyword-subject.ts";
import type { DeclaredSubject } from "./contracts.ts";
import { planSubjectAttachment, readArchitectSubjectStanding, type SubjectAttachRefusalCode } from "./declared-subject.ts";

type RecordLike = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export const SUBJECT_WRITE_REFUSAL_CODES = [
  "SUBJECT_ACTOR_MISMATCH",
  "SUBJECT_KEYWORD_NOT_FOUND",
  "SUBJECT_CROSS_BRAND",
  "SUBJECT_NOT_RECEIVED",
  "SUBJECT_NO_APPROVED_PACKAGE",
  "SUBJECT_NOT_DECLARED",
  "SUBJECT_PACKAGE_MISMATCH",
  "SUBJECT_PRINCIPAL_WITHOUT_VOLUME",
  "SUBJECT_SILO_PAGE_BOUND",
  "SUBJECT_DROPPED",
  "SUBJECT_INVALID",
] as const;
export type SubjectWriteRefusalCode = (typeof SUBJECT_WRITE_REFUSAL_CODES)[number];

export type SubjectWriteVerdict =
  | { ok: true }
  | { ok: false; code: SubjectWriteRefusalCode; reason: string };

const refuse = (code: SubjectWriteRefusalCode, reason: string): SubjectWriteVerdict => ({ ok: false, code, reason });

/** Recusas que são de autorização (403); as demais são conflito (409). */
export const SUBJECT_WRITE_AUTHORIZATION_CODES: ReadonlySet<SubjectWriteRefusalCode> = new Set([
  "SUBJECT_ACTOR_MISMATCH",
  "SUBJECT_CROSS_BRAND",
]);

/**
 * O mesmo registro, campo a campo — inclusive autor e data.
 *
 * O JSONB do banco não preserva ordem de chave, então comparar texto de JSON
 * diria "mudou" sobre o mesmo Assunto relido.
 */
export function sameSubjectRecord(left: DeclaredSubject | null | undefined, right: DeclaredSubject | null | undefined): boolean {
  if (!left || !right) return !left && !right;
  return left.keywordId === right.keywordId
    && left.approvedPackageRef.version === right.approvedPackageRef.version
    && left.approvedPackageRef.contentHash === right.approvedPackageRef.contentHash
    && left.approvedPackageRef.approvedAt === right.approvedPackageRef.approvedAt
    && left.phrase === right.phrase
    && (left.note ?? null) === (right.note ?? null)
    && (left.destinationUrl ?? null) === (right.destinationUrl ?? null)
    && left.attachedBy === right.attachedBy
    && left.attachedAt === right.attachedAt;
}

/** Só subject NOVO ou ALTERADO é conferido; soltar não prende nada. */
export function subjectWriteRequiresCheck(previous: DeclaredSubject | null | undefined, next: DeclaredSubject | null | undefined): boolean {
  return Boolean(next) && !sameSubjectRecord(previous, next);
}

/**
 * A keyword como a guarda a lê: a linha estreita do Minerador e o item de
 * workflow do Arquiteto, com o pacote aprovado. Mesma forma da linha da mesa
 * (`canonicalWorkflow.payload.approvedDna`), para o plano do domínio valer
 * igual nos dois lados.
 */
export function subjectGuardKeyword(input: {
  keyword: RecordLike | null;
  workflow: { state: unknown; approvedDna: unknown } | null;
}): RecordLike | null {
  if (!input.keyword) return null;
  return {
    id: input.keyword.id,
    brand_id: input.keyword.brand_id,
    keyword: input.keyword.keyword,
    deleted_at: input.keyword.deleted_at ?? null,
    ...(input.workflow
      ? { canonicalWorkflow: { state: input.workflow.state, payload: { approvedDna: input.workflow.approvedDna ?? null } } }
      : {}),
  };
}

export type SubjectActorMode = "session" | "restored";

function actorVerdict(input: { attachedBy: string; actorUserId: string; actorMode?: SubjectActorMode }): SubjectWriteVerdict | null {
  const attachedBy = input.attachedBy.trim();
  if (!isKeywordSubjectActorId(attachedBy)) {
    return refuse("SUBJECT_ACTOR_MISMATCH", "O Assunto só é preso por uma pessoa autenticada (auth.users.id): IA, e-mail ou usuário local não prendem.");
  }
  if (input.actorMode === "restored") return null;
  if (!isKeywordSubjectActorId(input.actorUserId) || attachedBy !== input.actorUserId.trim()) {
    return refuse("SUBJECT_ACTOR_MISMATCH", "Quem prende o Assunto é o usuário autenticado desta requisição: attachedBy diverge do ator.");
  }
  return null;
}

const PLAN_TO_WRITE: Partial<Record<SubjectAttachRefusalCode, SubjectWriteRefusalCode>> = {
  ACTOR_REQUIRED: "SUBJECT_ACTOR_MISMATCH",
  NOT_RECEIVED: "SUBJECT_NOT_RECEIVED",
  NO_APPROVED_PACKAGE: "SUBJECT_NO_APPROVED_PACKAGE",
  CROSS_BRAND: "SUBJECT_CROSS_BRAND",
  NOT_DECLARED: "SUBJECT_NOT_DECLARED",
  PRINCIPAL_WITHOUT_VOLUME: "SUBJECT_PRINCIPAL_WITHOUT_VOLUME",
};

/**
 * A keyword existe, está viva, é desta marca, chegou ao Arquiteto e o pacote
 * aprovado a declara Assunto? Devolve o plano do domínio quando sim.
 */
function keywordVerdict(input: {
  brandId: string;
  keywordId: string;
  keyword: RecordLike | null;
  planActor: string;
  attachedAt: string;
  principalKeywordId?: string | null;
}): { verdict: SubjectWriteVerdict; subject: DeclaredSubject | null } {
  const keyword = input.keyword;
  if (!keyword || String(keyword.id ?? "") !== input.keywordId || text(keyword.deleted_at)) {
    return { verdict: refuse("SUBJECT_KEYWORD_NOT_FOUND", "A keyword do Assunto não existe ou foi excluída no Minerador."), subject: null };
  }
  if (text(keyword.brand_id) !== input.brandId) {
    return { verdict: refuse("SUBJECT_CROSS_BRAND", "A keyword do Assunto pertence a outra marca e não pode ser presa aqui."), subject: null };
  }
  const plan = planSubjectAttachment({
    brandId: input.brandId,
    keyword,
    actorUserId: input.planActor,
    attachedAt: input.attachedAt,
    target: input.principalKeywordId === input.keywordId ? { principalKeywordId: input.principalKeywordId } : null,
  });
  if (!plan.ok) {
    return { verdict: refuse(PLAN_TO_WRITE[plan.code] ?? "SUBJECT_INVALID", plan.reason), subject: null };
  }
  return { verdict: { ok: true }, subject: plan.subject };
}

/**
 * Confere o `subject` que vai ser gravado num ArticleDNA ou SiloDNA.
 *
 * Só é chamada para subject novo ou alterado (`subjectWriteRequiresCheck`).
 * `actorMode: "restored"` é a restauração de backup: o autor gravado é o
 * humano de então, e só se exige que seja um `auth.users.id`; o resto da
 * conferência vale igual.
 */
export function verifyDeclaredSubjectWrite(input: {
  brandId: string;
  actorUserId: string;
  subject: DeclaredSubject;
  keyword: RecordLike | null;
  /** Principal do ArticleDNA; o SiloDNA não tem. */
  principalKeywordId?: string | null;
  actorMode?: SubjectActorMode;
}): SubjectWriteVerdict {
  const subject = input.subject;
  const actor = actorVerdict({ attachedBy: subject.attachedBy, actorUserId: input.actorUserId, actorMode: input.actorMode });
  if (actor) return actor;

  const checked = keywordVerdict({
    brandId: input.brandId,
    keywordId: subject.keywordId,
    keyword: input.keyword,
    planActor: subject.attachedBy.trim(),
    attachedAt: subject.attachedAt,
    principalKeywordId: input.principalKeywordId ?? null,
  });
  if (!checked.verdict.ok || !checked.subject) return checked.verdict;

  const expected = checked.subject;
  const divergent: string[] = [];
  if (expected.approvedPackageRef.version !== subject.approvedPackageRef.version
    || expected.approvedPackageRef.contentHash !== subject.approvedPackageRef.contentHash
    || expected.approvedPackageRef.approvedAt !== subject.approvedPackageRef.approvedAt) divergent.push("approvedPackageRef");
  if (expected.phrase !== subject.phrase) divergent.push("phrase");
  if ((expected.note ?? null) !== (subject.note ?? null)) divergent.push("note");
  if ((expected.destinationUrl ?? null) !== (subject.destinationUrl ?? null)) divergent.push("destinationUrl");
  if (divergent.length) {
    return refuse("SUBJECT_PACKAGE_MISMATCH", `O Assunto não bate com o pacote aprovado da keyword (${divergent.join(", ")}). Releia a mesa e prenda de novo.`);
  }
  return { ok: true };
}

/**
 * Q7 também vale para quem CARREGA o Assunto: repetir o subject já gravado
 * dispensa a conferência, mas trocar a principal para a própria keyword do Assunto é
 * decisão nova. Só pede conferência quando a versão anterior ainda não tinha
 * o Assunto como principal — o caminho sem Assunto não lê nada.
 */
export function subjectPrincipalRequiresCheck(input: {
  subject: DeclaredSubject | null | undefined;
  principalKeywordId: string | null | undefined;
  previousPrincipalKeywordId: string | null | undefined;
}): boolean {
  const keywordId = input.subject?.keywordId;
  return Boolean(keywordId) && input.principalKeywordId === keywordId && input.previousPrincipalKeywordId !== keywordId;
}

/** O Assunto carregado virou a principal: só com Volume validado no pacote aprovado (Q7). */
export function verifySubjectAsPrincipal(input: {
  brandId: string;
  keywordId: string;
  keyword: RecordLike | null;
}): SubjectWriteVerdict {
  const keyword = input.keyword;
  if (!keyword || String(keyword.id ?? "") !== input.keywordId || text(keyword.deleted_at)) {
    return refuse("SUBJECT_KEYWORD_NOT_FOUND", "A keyword do Assunto não existe ou foi excluída no Minerador.");
  }
  const standing = readArchitectSubjectStanding(keyword);
  if (text(keyword.brand_id) !== input.brandId || standing.brandId !== input.brandId) {
    return refuse("SUBJECT_CROSS_BRAND", "A keyword do Assunto pertence a outra marca e não pode ser presa aqui.");
  }
  if (!standing.volumeValidated) {
    return refuse("SUBJECT_PRINCIPAL_WITHOUT_VOLUME", "O Assunto só pode ser a própria principal com Volume validado no pacote aprovado.");
  }
  return { ok: true };
}

/**
 * A consolidação do Silo recebe o envelope pronto do cliente. Versão nova sem
 * o Assunto que a versão vigente tem é perda silenciosa de decisão humana:
 * soltar é ato próprio, não efeito colateral de consolidar.
 */
export function subjectDroppedOnConsolidation(previous: DeclaredSubject | null | undefined, next: DeclaredSubject | null | undefined): boolean {
  return Boolean(previous) && !next;
}

export const SUBJECT_DROPPED_REASON =
  "A versão vigente do SiloDNA tem Assunto preso e a consolidação chegou sem ele. Recarregue a mesa e consolide de novo; soltar o Assunto é ação própria, não efeito da consolidação.";

/* ------------------------------------------ vínculo na cópia de trabalho */

/**
 * O vínculo do Assunto numa formação que ainda não tem Definição do artigo.
 *
 * Mora no payload do item de workflow da PRINCIPAL da formação, como campo
 * opcional e aditivo (`articleSubjectAnchor`). É chaveado pelo `candidateRef`
 * da formação; vínculo cujo candidato não existe mais não ancora nada.
 */
export const WORKING_SUBJECT_ANCHOR_FIELD = "articleSubjectAnchor" as const;

export const WorkingSubjectAnchorSchema = z.object({
  candidateRef: z.string().min(1).max(400),
  subjectKeywordId: z.string().min(1).max(200),
  attachedBy: z.string().min(1).max(200),
  attachedAt: z.string().min(1).max(64),
}).strict();
export type WorkingSubjectAnchor = z.infer<typeof WorkingSubjectAnchorSchema>;

/** O vínculo gravado num payload de item; ilegível ou ausente = `null`. */
export function readWorkingSubjectAnchor(payload: unknown): WorkingSubjectAnchor | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const parsed = WorkingSubjectAnchorSchema.safeParse((payload as RecordLike)[WORKING_SUBJECT_ANCHOR_FIELD]);
  return parsed.success ? parsed.data : null;
}

export function sameWorkingSubjectAnchor(left: WorkingSubjectAnchor | null | undefined, right: WorkingSubjectAnchor | null | undefined): boolean {
  if (!left || !right) return !left && !right;
  return left.candidateRef === right.candidateRef
    && left.subjectKeywordId === right.subjectKeywordId
    && left.attachedBy === right.attachedBy
    && left.attachedAt === right.attachedAt;
}

/**
 * Confere o vínculo novo ou alterado: ator da requisição e keyword viva, da
 * marca, recebida e declarada Assunto no pacote aprovado.
 */
export function verifyWorkingSubjectAnchorWrite(input: {
  brandId: string;
  actorUserId: string;
  anchor: WorkingSubjectAnchor;
  keyword: RecordLike | null;
}): SubjectWriteVerdict {
  const actor = actorVerdict({ attachedBy: input.anchor.attachedBy, actorUserId: input.actorUserId });
  if (actor) return actor;
  return keywordVerdict({
    brandId: input.brandId,
    keywordId: input.anchor.subjectKeywordId,
    keyword: input.keyword,
    planActor: input.anchor.attachedBy.trim(),
    attachedAt: input.anchor.attachedAt,
  }).verdict;
}

/**
 * Os vínculos gravados na cópia de trabalho, por `candidateRef`, com a
 * keyword cujo item os guarda. Linha sem item ou sem vínculo não entra.
 */
export function persistedWorkingSubjectAnchors(rows: readonly RecordLike[]): Map<string, { subjectKeywordId: string; holderKeywordId: string }> {
  const anchors = new Map<string, { subjectKeywordId: string; holderKeywordId: string }>();
  for (const row of rows) {
    const workflow = row.canonicalWorkflow;
    if (!workflow || typeof workflow !== "object") continue;
    const anchor = readWorkingSubjectAnchor((workflow as RecordLike).payload);
    if (!anchor || anchors.has(anchor.candidateRef)) continue;
    anchors.set(anchor.candidateRef, { subjectKeywordId: anchor.subjectKeywordId, holderKeywordId: String(row.id ?? "") });
  }
  return anchors;
}

/**
 * Soma o que está gravado com o que a sessão acabou de confirmar. `null` na
 * sessão é vínculo solto que a releitura ainda não trouxe.
 */
export function mergeWorkingSubjectAnchors(
  persisted: ReadonlyMap<string, { subjectKeywordId: string }>,
  session: ReadonlyMap<string, string | null>,
): Map<string, string> {
  const merged = new Map<string, string>();
  for (const [ref, anchor] of persisted) merged.set(ref, anchor.subjectKeywordId);
  for (const [ref, subjectKeywordId] of session) {
    if (subjectKeywordId) merged.set(ref, subjectKeywordId);
    else merged.delete(ref);
  }
  return merged;
}

export type WorkingSubjectAnchorWrite = {
  keywordId: string;
  workflowItemId: string;
  expectedLock: number;
  assignment: { [WORKING_SUBJECT_ANCHOR_FIELD]: WorkingSubjectAnchor | null };
};

/**
 * As escritas que gravam (ou soltam) o vínculo de uma formação.
 *
 * Prender: o vínculo vai para o item da principal (`holderKeywordId`), e sai
 * de qualquer outro item que o guardava para o mesmo `candidateRef`. Soltar:
 * sai de onde estiver. Sem item com lock para a principal, recusa — o vínculo
 * não fica só na sessão fingindo que foi gravado.
 */
export function planWorkingSubjectAnchorWrites(input: {
  candidateRef: string;
  subjectKeywordId: string | null;
  holderKeywordId: string | null;
  items: readonly { keywordId: string; workflowItemId: string; lockVersion: number }[];
  persisted: ReadonlyMap<string, { subjectKeywordId: string; holderKeywordId: string }>;
  actorUserId: string;
  attachedAt: string;
}): { ok: true; writes: WorkingSubjectAnchorWrite[] } | { ok: false; reason: string } {
  const itemOf = new Map(input.items.map(item => [item.keywordId, item]));
  const writes: WorkingSubjectAnchorWrite[] = [];
  const current = input.persisted.get(input.candidateRef) ?? null;

  if (input.subjectKeywordId) {
    const holder = input.holderKeywordId ? itemOf.get(input.holderKeywordId) : undefined;
    if (!holder) return { ok: false, reason: "A principal desta formação não tem item de workflow com lock: o vínculo não pode ser gravado." };
    const anchor = WorkingSubjectAnchorSchema.safeParse({
      candidateRef: input.candidateRef,
      subjectKeywordId: input.subjectKeywordId,
      attachedBy: input.actorUserId,
      attachedAt: input.attachedAt,
    });
    if (!anchor.success) return { ok: false, reason: "O vínculo do Assunto não fecha o contrato da cópia de trabalho." };
    writes.push({ keywordId: holder.keywordId, workflowItemId: holder.workflowItemId, expectedLock: holder.lockVersion, assignment: { [WORKING_SUBJECT_ANCHOR_FIELD]: anchor.data } });
  }
  if (current && current.holderKeywordId !== (input.subjectKeywordId ? input.holderKeywordId : null)) {
    const previousHolder = itemOf.get(current.holderKeywordId);
    if (previousHolder) {
      writes.push({ keywordId: previousHolder.keywordId, workflowItemId: previousHolder.workflowItemId, expectedLock: previousHolder.lockVersion, assignment: { [WORKING_SUBJECT_ANCHOR_FIELD]: null } });
    }
  }
  return { ok: true, writes };
}

/**
 * Quando um plano de formação muda o `candidateRef` do artigo, o vínculo
 * gravado muda junto, NA MESMA escrita da formação: vai para o item da
 * principal do ref novo e sai do item que o guardava. `before` e `after` são
 * os vínculos antes e depois de `migrateWorkingSubjectAnchors`.
 *
 * Devolve o campo a acrescentar à atribuição de cada keyword do plano. Só
 * mexe em keyword que o plano já grava (o lock é o do próprio patch).
 */
export function workingSubjectAnchorMigrationAssignments(input: {
  before: ReadonlyMap<string, string>;
  after: ReadonlyMap<string, string>;
  patches: readonly { keywordId: string; assignment: { articleFormationRef: string; articleFormationDecision?: { role?: string } | null } }[];
  persisted: ReadonlyMap<string, { subjectKeywordId: string; holderKeywordId: string }>;
  actorUserId: string;
  attachedAt: string;
}): Map<string, { [WORKING_SUBJECT_ANCHOR_FIELD]: WorkingSubjectAnchor | null }> {
  const extra = new Map<string, { [WORKING_SUBJECT_ANCHOR_FIELD]: WorkingSubjectAnchor | null }>();
  const patched = new Set(input.patches.map(patch => patch.keywordId));
  for (const [ref, subjectKeywordId] of input.after) {
    if (input.before.get(ref) === subjectKeywordId) continue;
    const principal = input.patches.find(patch => patch.assignment.articleFormationRef === ref
      && patch.assignment.articleFormationDecision?.role === "principal")
      ?? input.patches.find(patch => patch.assignment.articleFormationRef === ref);
    if (!principal) continue;
    const anchor = WorkingSubjectAnchorSchema.safeParse({ candidateRef: ref, subjectKeywordId, attachedBy: input.actorUserId, attachedAt: input.attachedAt });
    if (anchor.success) extra.set(principal.keywordId, { [WORKING_SUBJECT_ANCHOR_FIELD]: anchor.data });
  }
  for (const [ref, stored] of input.persisted) {
    if (input.after.get(ref) === stored.subjectKeywordId) continue;
    if (!patched.has(stored.holderKeywordId) || extra.has(stored.holderKeywordId)) continue;
    extra.set(stored.holderKeywordId, { [WORKING_SUBJECT_ANCHOR_FIELD]: null });
  }
  return extra;
}
