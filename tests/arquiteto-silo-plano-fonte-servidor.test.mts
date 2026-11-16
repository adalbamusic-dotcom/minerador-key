import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { linhaDaMesa, declarado, MARCA } from "./arquiteto-assunto-fixtures.mts";
import { TerritoryCandidateSchema, emptyTerritoryDiscovery, emptyTerritoryLineage } from "../lib/arquiteto/territory.ts";
import { buildTerritoryWorkflowRow } from "../lib/arquiteto/territory-record.ts";
import { buildPlannedSiloWorkingCopy } from "../lib/arquiteto/silo-working-copy-record.ts";
import { buildPlannedSiloDnaPayload, buildPlannedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { plannedSiloSourceIsCurrent } from "../lib/arquiteto/planned-silo-member.ts";

const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const territoryRef = "territory:11111111-1111-4111-8111-111111111111";
const source = { kind: "editorial_group_plan" as const, groupId, planVersion: 1, planHash: "hash-plan", lockVersion: 3 };
let workspaceRows: Array<Record<string, unknown>> = [];
mock.module("../lib/server/arquiteto-workspace.ts", { namedExports: { loadCanonicalArquitetoWorkspace: async () => ({ workflowItems: [], keywords: workspaceRows }) } });
mock.module("../lib/arquiteto/canonical-workspace.ts", { namedExports: { buildCanonicalWorkflowWorkspaceItems: (_items: unknown, keywords: unknown) => keywords } });
const { loadCurrentPlannedSiloSource, loadVerifiedPlannedSiloComposition, verifyPlannedSiloConsolidation } = await import("../lib/server/arquiteto-silo-consolidation-adapter.ts");

const narrative = { statement: "Internet residencial e seus usos.", continuity: "coherent" as const, brandAlignment: "aligned" as const, rationale: ["Mesmo tema."] };
const territory = TerritoryCandidateSchema.parse({ schemaVersion: 1, territoryRef, brandId: MARCA, existingSiloRef: null, name: "Internet", centralEntity: "Internet", macroIntent: "Informar", boundary: { includes: [], excludes: [] }, narrative, discovery: emptyTerritoryDiscovery(), territoryKind: "new", architecturalOrigin: "manual_strategic", ingestionOrigin: "ui", lifecycleStatus: "confirmed", decisionState: "confirmed", publicationProtection: "unpublished", slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null }, lineage: emptyTerritoryLineage(), consolidation: null, pendingOperation: null, conflicts: [], reasons: ["Confirmado."], provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 0, note: null } });

function input(options: { territory?: string; received?: boolean; changedGroup?: boolean; changedPlanAfter?: boolean; linkedSilo?: string | null; packageVersion?: number; initialLock?: number } = {}) {
  const subject = declarado();
  subject.keyword_subject = { ...(subject.keyword_subject as object), plan: { groupId, planVersion: 1, order: 1, role: "Pilar", scope: "Explicar internet residencial", declaredPrincipal: null } };
  workspaceRows = [{ ...linhaDaMesa({ id: "kw-1", keyword: "internet residencial", semantic: subject, received: options.received, version: options.packageVersion }), territoryRef: options.territory ?? territoryRef }];
  let reads = 0;
  const row = { id: groupId, marca_id: MARCA, origin: "declared_plan", status: "active", plan: { siloName: "Internet", siloSlug: "internet", objective: null, articleCount: 1 }, plan_version: 1, plan_hash: "hash-plan", lock_version: options.initialLock ?? 3, silo_id: options.linkedSilo ?? null };
  const query = { select() { return query; }, eq() { return query; }, async maybeSingle() { reads += 1; return { data: options.changedPlanAfter && reads > 1 ? { ...row, plan_version: 2 } : options.changedGroup && reads > 1 ? { ...row, lock_version: 4 } : row, error: null }; } };
  const territorial = buildTerritoryWorkflowRow(territory);
  const territoryRow = { id: "wf-territory", subject_type: territorial.subjectType, subject_id: territorial.subjectId, stage: territorial.stage, state: territorial.state, source_entity_id: territorial.sourceEntityId, article_id: territorial.articleId, payload: territorial.payload };
  const territoryQuery = { select() { return territoryQuery; }, eq() { return territoryQuery; }, async maybeSingle() { return { data: territoryRow, error: null }; } };
  return { brandId: MARCA, actorUserId: "human", supabase: { from(table: string) { if (table === "editorial_groups") return query; assert.equal(table, "editorial_workflow_items"); return territoryQuery; } } };
}

test("servidor recompõe o plano dos pacotes recebidos e verifica o território e a versão do grupo", async () => {
  const result = await loadVerifiedPlannedSiloComposition(input() as never, source, territoryRef, "silo-1");
  assert.deepEqual(result.members.map(member => [member.anchorId, member.role]), [["kw-1", "Pilar"]]);
  assert.deepEqual(result.outline.map(section => [section.heading, section.objective]), [["internet residencial", "Explicar internet residencial"]]);
  await assert.rejects(loadVerifiedPlannedSiloComposition(input({ territory: "territory:outro" }) as never, source, territoryRef, "silo-1"), /território confirmado/);
  await assert.rejects(loadVerifiedPlannedSiloComposition(input({ received: false }) as never, source, territoryRef, "silo-1"), /plano|Assunto/);
  await assert.rejects(loadVerifiedPlannedSiloComposition(input({ changedGroup: true }) as never, source, territoryRef, "silo-1"), /plano|versão/);
  await assert.rejects(loadVerifiedPlannedSiloComposition(input({ linkedSilo: "outro" }) as never, source, territoryRef, "silo-1"), /outro Silo/);
});

test("leitura posterior detecta mudança do Assunto sem confundir o lock do grupo", async () => {
  const original = await loadVerifiedPlannedSiloComposition(input() as never, source, territoryRef, "silo-1");
  const expectedSubjectProofs = original.subjectProofs.map(proof => ({ keywordId: proof.keywordId, ...proof.approvedPackageRef }));
  const same = await loadCurrentPlannedSiloSource(input({ initialLock: 99, linkedSilo: "silo-1" }) as never, source, territoryRef, "silo-1");
  assert.equal(plannedSiloSourceIsCurrent({ brandId: MARCA, source, expectedSubjectProofs, current: same }), true);
  const changed = await loadCurrentPlannedSiloSource(input({ packageVersion: 2, linkedSilo: "silo-1" }) as never, source, territoryRef, "silo-1");
  assert.equal(plannedSiloSourceIsCurrent({ brandId: MARCA, source, expectedSubjectProofs, current: changed }), false);
  await assert.rejects(loadCurrentPlannedSiloSource(input({ territory: "territory:outro", linkedSilo: "silo-1" }) as never, source, territoryRef, "silo-1"), /Assuntos|território/);
  await assert.rejects(loadCurrentPlannedSiloSource(input({ changedPlanAfter: true, linkedSilo: "silo-1" }) as never, source, territoryRef, "silo-1"), /mudou durante/);
  await assert.rejects(loadCurrentPlannedSiloSource(input({ linkedSilo: "outro" }) as never, source, territoryRef, "silo-1"), /vínculo/);
});

test("pré-validação exige a decisão do Silo e aprovação própria da página sem gravar", async () => {
  const context = input();
  const authority = await loadVerifiedPlannedSiloComposition(context as never, source, territoryRef, "silo-1");
  const memberKey = authority.members[0].memberKey;
  const copy = buildPlannedSiloWorkingCopy({ brandId: MARCA, territoryRef, name: "Internet", slug: "internet", existingSiloId: null, composition: authority, pillarSelection: { memberKey, actorUserId: "human", decidedAt: "2026-11-13", reason: "Confirmado", decidedOverMemberKeys: [memberKey] } });
  const dna = buildPlannedSiloDnaPayload({ copy, workingCopyLockVersion: 1, siloId: "silo-1", centralEntity: "Internet", objective: "Orientar", audience: "Leitores", macroProblem: "Dúvidas", dominantIntent: "Informar", boundary: "Internet residencial", includedTopics: [], excludedTopics: [], territoryNarrative: narrative });
  const version = await createVersionEnvelope({ entityId: dna.siloId, versionNumber: 1, previousVersionId: null, origin: "human", changeReason: "Confirmado", createdBy: "human", payload: dna });
  const pagePayload = buildPlannedSiloPagePayload({ siloDna: version, slug: "internet", canonical: "https://example.com/internet", outline: authority.outline });
  const page = await createVersionEnvelope({ entityId: pagePayload.siloPageId, versionNumber: 1, previousVersionId: null, origin: "human", changeReason: "Confirmado", createdBy: "human", payload: pagePayload });
  const decision = { scope: "planned_members" as const, actorUserId: "human", decidedAt: "2026-11-13", reason: "Confirmado", territoryRef, pillarMemberKey: memberKey, supportMemberKeys: [], publishedIdentityResolved: false };
  const approval = { actorUserId: "human", decidedAt: "2026-11-13", reason: "Página revisada", scope: "silo_page_approval" as const, siloPageId: page.entityId, siloPageVersionId: page.versionId, siloPageContentHash: page.contentHash, siloDnaVersionId: version.versionId, territoryRef };
  const statuses = { siloDna: "approved", siloPage: "approved" };
  await assert.doesNotReject(verifyPlannedSiloConsolidation(context as never, copy, version, page, decision, { statuses, siloPageApproval: approval }));
  await assert.rejects(verifyPlannedSiloConsolidation(context as never, copy, version, page, decision, { statuses, siloPageApproval: null }), /SILO_PAGE_APPROVAL_GATE_MISSING/);
});
