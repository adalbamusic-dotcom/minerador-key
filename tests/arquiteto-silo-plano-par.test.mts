import assert from "node:assert/strict";
import test from "node:test";
import { buildPlannedSiloWorkingCopy } from "../lib/arquiteto/silo-working-copy-record.ts";
import { buildPlannedSiloDnaPayload, buildPlannedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { deterministicSiloPagePayload } from "../lib/arquiteto/adapters.ts";
import { plannedSiloMemberKey } from "../lib/arquiteto/planned-silo-member.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { resolveSiloPageApprovalReadiness } from "../lib/arquiteto/silo-page-approval.ts";
import { plannedArticleMembership } from "../lib/arquiteto/declared-plan-formation.ts";
import { resolvePlannedSiloMembers } from "../lib/arquiteto/planned-silo-members.ts";

test("o par planejado usa a decisão sem fabricar artigos ou versões", async () => {
  const brandId = "brand-a", territoryRef = "territory:11111111-1111-4111-8111-111111111111";
  const memberKey = plannedSiloMemberKey(brandId, "subject_keyword", "kw-1");
  const composition = {
    source: { kind: "editorial_group_plan" as const, groupId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", planVersion: 1, planHash: "hash", lockVersion: 1 },
    members: [{ memberKey, anchorKind: "subject_keyword" as const, anchorId: "kw-1", role: "Pilar" as const, order: 1 }],
    subjectProofs: [{ keywordId: "kw-1", approvedPackageRef: { version: 1, contentHash: "hash", approvedAt: "2026-11-13" } }],
  };
  const base = { brandId, territoryRef, name: "Internet", slug: "internet", existingSiloId: null, composition };
  const copy = buildPlannedSiloWorkingCopy({ ...base, pillarSelection: { memberKey, actorUserId: "human", decidedAt: "2026-11-13", reason: "Confirmado", decidedOverMemberKeys: [memberKey] } });
  const args = { copy, workingCopyLockVersion: 1, siloId: "silo-1", centralEntity: "Internet", objective: "Orientar", audience: "Leitores", macroProblem: "Dúvidas", dominantIntent: "Informar", boundary: "Internet residencial", includedTopics: [], excludedTopics: [] };
  const dna = buildPlannedSiloDnaPayload(args);
  const version = await createVersionEnvelope({ entityId: dna.siloId, versionNumber: 1, previousVersionId: null, origin: "human", changeReason: "Confirmado", createdBy: "human", payload: dna });
  const page = deterministicSiloPagePayload(version, brandId, "internet");
  assert.deepEqual(dna.articleReferences, []);
  assert.equal(dna.pillarArticleId, null);
  assert.equal(page.compositionBasis, "planned_members");
  assert.deepEqual(page.plannedMemberKeys, [memberKey]);
  assert.equal(page.territoryRef, territoryRef);
  assert.equal(page.siloDnaRef.contentHash, version.contentHash);
  const plannedPage = buildPlannedSiloPagePayload({ siloDna: version, slug: "internet", canonical: "https://example.com/internet", outline: [{ memberKey, heading: "Internet residencial", objective: "Orientar a escolha" }] });
  assert.deepEqual(plannedPage.sections.map(section => [section.id, section.heading, section.linkedArticleIds]), [[`planned:${memberKey}`, "Internet residencial", []]]);
  const approval = { actorUserId: "human", decidedAt: "2026-11-13", reason: "Revisado", scope: "silo_page_approval" as const, siloPageId: plannedPage.siloPageId, siloPageVersionId: "page-v1", siloPageContentHash: "page-hash", siloDnaVersionId: version.versionId, territoryRef };
  const approvalInput = { brandId, territoryRef, siloId: dna.siloId, siloPage: plannedPage, siloPageVersion: { versionId: "page-v1", contentHash: "page-hash" }, siloDna: dna, siloDnaVersion: { versionId: version.versionId }, decision: approval, actor: "human" as const };
  assert.equal(resolveSiloPageApprovalReadiness(approvalInput).state, "approved");
  assert.equal(resolveSiloPageApprovalReadiness({ ...approvalInput, siloPage: { ...plannedPage, sections: [{ ...plannedPage.sections[0], id: "outra" }] } }).state, "blocked");
  const article = { articleId: "artigo-1", brandId, siloId: dna.siloId, territoryRef, hierarchy: "Pilar", subject: { keywordId: "kw-1" }, keywordReferences: [{ keywordId: "outra-principal" }] };
  const sourceCurrent = { brandId, groupId: composition.source.groupId, origin: "declared_plan", status: "active", planVersion: 1, planHash: "hash", subjectProofs: composition.subjectProofs.map(proof => ({ keywordId: proof.keywordId, ...proof.approvedPackageRef })) };
  const linking = plannedArticleMembership({ brandId, article, silo: { ...version, current: true, effectiveStatus: "approved" }, page: { payload: plannedPage, current: true, effectiveStatus: "approved" }, sourceCurrent, occupied: [] } as never);
  assert.equal(linking.ok, true);
  if (linking.ok) {
    const resolved = resolvePlannedSiloMembers({ brandId, silo: { ...version, current: true, effectiveStatus: "approved", payload: { ...dna, brandId } }, page: { payload: plannedPage, current: true, effectiveStatus: "approved" }, sourceCurrent, articles: [{ versionId: "article-v1", contentHash: "article-hash", current: true, effectiveStatus: "approved", payload: { ...article, siloMembershipRef: linking.ref } }] });
    assert.equal(resolved.ok, true);
    if (resolved.ok) assert.equal(resolved.members[0].member.role, "Pilar");
  }
  assert.throws(() => buildPlannedSiloPagePayload({ siloDna: version, slug: "internet", canonical: "https://example.com/internet", outline: [{ memberKey: "outro", heading: "Assunto", objective: "Orientar" }] }), /ordem aprovada/);
  assert.throws(() => buildPlannedSiloDnaPayload({ ...args, copy: buildPlannedSiloWorkingCopy({ ...base, pillarSelection: null }) }), /decisão humana/);
  assert.throws(() => buildPlannedSiloDnaPayload({ ...args, objective: "" }));
  assert.throws(() => buildPlannedSiloDnaPayload({ ...args, copy: { ...copy, existingSiloId: "silo-1" } }), /Silo existente/);
  assert.throws(() => buildPlannedSiloDnaPayload({ ...args, copy: { ...copy, conflicts: ["Fronteira indefinida"] } }), /conflitos/);
  assert.throws(() => buildPlannedSiloDnaPayload({ ...args, audience: "Pendente de enriquecimento e revisão humana" }), /precisam estar definidos/);
});
