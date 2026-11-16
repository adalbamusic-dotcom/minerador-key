import assert from "node:assert/strict";
import test from "node:test";
import { refusePlannedSiloBinding, refusePlannedSiloConfirmation } from "../lib/arquiteto/silo-dna-binding.ts";
import { PlannedSiloConsolidationDecisionSchema } from "../lib/arquiteto/silo-consolidation-territorial.ts";

function example(): Parameters<typeof refusePlannedSiloBinding>[0] {
  const source = { kind: "editorial_group_plan", groupId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", planVersion: 1, planHash: "hash", lockVersion: 1 };
  const members = [{ memberKey: "p", anchorKind: "subject_keyword", anchorId: "p", role: "Pilar", order: 1 }, { memberKey: "s", anchorKind: "subject_keyword", anchorId: "s", role: "Suporte", order: 2 }];
  const subjectProofs = members.map(member => ({ keywordId: member.anchorId, approvedPackageRef: { version: 1, contentHash: "hash", approvedAt: "2026-11-13" } }));
  return {
    workingCopy: { brandId: "marca", territoryRef: "territory:123", plannedComposition: { source, members, subjectProofs, pillarSelection: { memberKey: "p", actorUserId: "humano", decidedAt: "2026-11-13", reason: "Pilar", decidedOverMemberKeys: ["p", "s"] } } },
    siloDna: { brandId: "marca", territoryRef: "territory:123", siloId: "silo", compositionBasis: "planned_members", compositionSourceRef: { ...source }, plannedMembers: structuredClone(members), keywordPackageRefs: subjectProofs.map(proof => ({ keywordId: proof.keywordId, ...proof.approvedPackageRef })) },
    siloPage: { brandId: "marca", territoryRef: "territory:123", siloId: "silo", compositionBasis: "planned_members", plannedMemberKeys: ["p", "s"] },
    authority: { source: { ...source }, members: structuredClone(members), subjectProofs: structuredClone(subjectProofs) },
  } as unknown as Parameters<typeof refusePlannedSiloBinding>[0];
}

test("o par deve preservar a composição e a decisão humana", () => {
  assert.deepEqual(refusePlannedSiloBinding(example()), []);
  const cases = [
    (x: ReturnType<typeof example>) => { x.siloDna.plannedMembers![0].role = "Suporte"; },
    (x: ReturnType<typeof example>) => { x.siloDna.compositionSourceRef!.planHash = "outro"; },
    (x: ReturnType<typeof example>) => { x.siloPage.plannedMemberKeys!.reverse(); },
    (x: ReturnType<typeof example>) => { x.workingCopy.plannedComposition!.pillarSelection!.decidedOverMemberKeys.pop(); },
    (x: ReturnType<typeof example>) => { x.siloDna.brandId = "outra"; },
    (x: ReturnType<typeof example>) => { x.authority.members[0].anchorId = "substituído"; },
    (x: ReturnType<typeof example>) => { x.authority.subjectProofs[0].approvedPackageRef.contentHash = "alterado"; },
  ];
  for (const change of cases) { const item = example(); change(item); assert.notEqual(refusePlannedSiloBinding(item).length, 0); }
});

test("confirmar usa o ator autenticado e a ordem de membros que ele revisou", () => {
  const { workingCopy } = example();
  const decision = { scope: "planned_members" as const, actorUserId: "humano", decidedAt: "2026-11-13", reason: "Confirmado", territoryRef: workingCopy.territoryRef, pillarMemberKey: "p", supportMemberKeys: ["s"], publishedIdentityResolved: false };
  assert.deepEqual(refusePlannedSiloConfirmation({ workingCopy, decision, authenticatedActorId: "humano" }), []);
  assert.notEqual(refusePlannedSiloConfirmation({ workingCopy, decision, authenticatedActorId: "outro" }).length, 0);
  assert.notEqual(refusePlannedSiloConfirmation({ workingCopy, decision: { ...decision, supportMemberKeys: [] }, authenticatedActorId: "humano" }).length, 0);
  const canonical = { ...decision, territoryRef: "territory:11111111-1111-4111-8111-111111111111" };
  assert.equal(PlannedSiloConsolidationDecisionSchema.safeParse(canonical).success, true);
  assert.equal(PlannedSiloConsolidationDecisionSchema.safeParse({ ...canonical, supportMemberKeys: ["p"] }).success, false);
});
