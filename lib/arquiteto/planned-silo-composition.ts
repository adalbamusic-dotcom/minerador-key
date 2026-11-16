import { readDeclaredArticlePlan, readDeclaredSiloPlan } from "../minerador/declared-plan.ts";
import { PlannedSiloSourceRefSchema, plannedSiloMemberKey, type PlannedSiloMember, type PlannedSiloSourceRef } from "./planned-silo-member.ts";
import type { ArchitectSubjectStanding } from "./declared-subject.ts";
import type { ApprovedPackageRef } from "./contracts.ts";

/** As âncoras precisam estar no território confirmado, não apenas no grupo. */
export function plannedSiloTerritoryMatches(input: {
  territoryRef: string;
  members: readonly PlannedSiloMember[];
  assignments: readonly { keywordId: string; territoryRef: string | null }[];
}): boolean {
  if (!input.territoryRef || !input.members.length) return false;
  return input.members.every(member => {
    if (member.anchorKind !== "subject_keyword") return false;
    const matches = input.assignments.filter(item => item.keywordId === member.anchorId);
    return matches.length === 1 && matches[0].territoryRef === input.territoryRef;
  });
}

/** Leitura do plano e das âncoras; não cria cópia de trabalho nem grava artefatos. */
export function plannedSiloComposition(input: {
  brandId: string;
  group: { id: string; brandId: string; origin: string; status: string; plan: unknown; planVersion: number; planHash: string | null; lockVersion: number };
  /** Provenientes da leitura canônica do pacote, nunca da linha viva da keyword. */
  subjects: readonly Pick<ArchitectSubjectStanding, "keywordId" | "brandId" | "phrase" | "plan" | "declared" | "received" | "approvedPackageRef">[];
}): { ok: true; source: PlannedSiloSourceRef; members: PlannedSiloMember[]; subjectProofs: { keywordId: string; approvedPackageRef: ApprovedPackageRef }[]; outline: { memberKey: string; heading: string; objective: string }[] } | { ok: false; reason: string } {
  const { brandId, group } = input;
  if (!brandId || group.brandId !== brandId || group.origin !== "declared_plan" || group.status !== "active") return { ok: false, reason: "O grupo ativo do plano não pertence à marca ou não está disponível." };
  const source = PlannedSiloSourceRefSchema.safeParse({ kind: "editorial_group_plan", groupId: group.id, planVersion: group.planVersion, planHash: group.planHash, lockVersion: group.lockVersion });
  const plan = readDeclaredSiloPlan(group.plan);
  if (!source.success || !plan) return { ok: false, reason: "O plano do grupo está incompleto ou não possui versão e hash verificáveis." };
  const selected: PlannedSiloMember[] = [];
  const proofs = new Map<string, ApprovedPackageRef>();
  const outlines = new Map<string, { heading: string; objective: string }>();
  for (const subject of input.subjects) {
    const declared = readDeclaredArticlePlan(subject.plan);
    if (!declared) {
      if (subject.plan && typeof subject.plan === "object" && "groupId" in subject.plan && subject.plan.groupId === group.id) return { ok: false, reason: "Há um Assunto deste plano com dados inválidos." };
      continue;
    }
    if (declared.groupId !== group.id) continue;
    const ref = subject.approvedPackageRef;
    if (subject.brandId !== brandId || !subject.keywordId.trim() || declared.planVersion !== group.planVersion) return { ok: false, reason: "Há Assunto de outra marca ou de outra versão do plano." };
    if (!subject.declared || !subject.received || !ref || !Number.isSafeInteger(ref.version) || ref.version < 1 || !ref.contentHash.trim() || !ref.approvedAt.trim() || !subject.phrase.trim()) return { ok: false, reason: "Há Assunto sem pacote aprovado e recebido pelo Arquiteto." };
    selected.push({ memberKey: plannedSiloMemberKey(brandId, "subject_keyword", subject.keywordId), anchorKind: "subject_keyword", anchorId: subject.keywordId, role: declared.role, order: declared.order });
    proofs.set(subject.keywordId, { ...ref });
    outlines.set(subject.keywordId, { heading: subject.phrase, objective: declared.scope });
  }
  if (selected.length !== plan.articleCount || new Set(selected.map(member => member.anchorId)).size !== selected.length || new Set(selected.map(member => member.order)).size !== selected.length || selected.filter(member => member.role === "Pilar").length !== 1) return { ok: false, reason: "O plano e seus Assuntos não formam uma composição completa e inequívoca com um Pilar." };
  selected.sort((a, b) => a.order - b.order);
  return { ok: true, source: source.data, members: selected, subjectProofs: selected.map(member => ({ keywordId: member.anchorId, approvedPackageRef: proofs.get(member.anchorId)! })), outline: selected.map(member => ({ memberKey: member.memberKey, ...outlines.get(member.anchorId)! })) };
}
