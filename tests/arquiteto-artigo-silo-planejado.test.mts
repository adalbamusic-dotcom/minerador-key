import assert from "node:assert/strict";
import test from "node:test";
import { plannedArticleMembership } from "../lib/arquiteto/declared-plan-formation.ts";
import { plannedSiloMemberKey } from "../lib/arquiteto/planned-silo-member.ts";

const key = plannedSiloMemberKey("marca", "subject_keyword", "assunto");
const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const source = { kind: "editorial_group_plan", groupId, planVersion: 1, planHash: "hash-plan", lockVersion: 1 };
const subjectProofs = [{ keywordId: "assunto", version: 1, contentHash: "subject-hash", approvedAt: "2026-11-13" }];
function input(): Parameters<typeof plannedArticleMembership>[0] {
  return {
    brandId: "marca",
    article: { articleId: "artigo", brandId: "marca", siloId: "silo", territoryRef: "territory:123", hierarchy: "Pilar", subject: { keywordId: "assunto" }, keywordReferences: [{ keywordId: "assunto" }] },
    silo: { versionId: "s1", contentHash: "hash", current: true, effectiveStatus: "approved", payload: { brandId: "marca", siloId: "silo", territoryRef: "territory:123", formationStatus: "formed", compositionBasis: "planned_members", compositionSourceRef: source, keywordPackageRefs: structuredClone(subjectProofs), plannedMembers: [{ memberKey: key, anchorKind: "subject_keyword", anchorId: "assunto", role: "Pilar", order: 1 }] } },
    page: { current: true, effectiveStatus: "approved", payload: { brandId: "marca", siloId: "silo", territoryRef: "territory:123", formationStatus: "formed", compositionBasis: "planned_members", plannedMemberKeys: [key], siloDnaRef: { entityId: "silo", versionId: "s1", contentHash: "hash" } } },
    occupied: [],
    sourceCurrent: { brandId: "marca", groupId, origin: "declared_plan", status: "active", planVersion: 1, planHash: "hash-plan", subjectProofs: structuredClone(subjectProofs) },
  } as unknown as Parameters<typeof plannedArticleMembership>[0];
}

test("artigo recebe apenas referência da estrutura planejada aprovada e vigente", () => {
  const actual = plannedArticleMembership(input());
  assert.deepEqual(actual, { ok: true, ref: { siloDnaVersionId: "s1", siloDnaContentHash: "hash", memberKey: key }, order: 1 });
  const retry = input(); retry.occupied = [{ memberKey: key, articleId: "artigo" }];
  assert.equal(plannedArticleMembership(retry).ok, true, "a repetição do mesmo vínculo permanece idempotente");
});

test("recusa outra marca, aprovação desconhecida ou versão antiga do par", () => {
  const wrongBrand = input(); wrongBrand.article.brandId = "outra";
  const missingStatus = input(); missingStatus.page.effectiveStatus = null;
  const stale = input(); stale.silo.current = false;
  const wrongHash = input(); wrongHash.page.payload.siloDnaRef.contentHash = "outro";
  const changedPlan = input(); changedPlan.sourceCurrent!.planHash = "outro";
  const missingPlan = input(); missingPlan.sourceCurrent = null;
  const changedSubject = input(); changedSubject.sourceCurrent!.subjectProofs = [{ ...subjectProofs[0], version: 2 }];
  const archivedPlan = input(); archivedPlan.sourceCurrent!.status = "archived";
  for (const example of [wrongBrand, missingStatus, stale, wrongHash, changedPlan, missingPlan, archivedPlan, changedSubject]) assert.equal(plannedArticleMembership(example).ok, false);
});

test("recusa papel divergente, membro ocupado ou Assunto diferente mesmo com keyword em comum", () => {
  const wrongRole = input(); wrongRole.article.hierarchy = "Suporte";
  const occupied = input(); occupied.occupied = [{ memberKey: key, articleId: "outro" }];
  const doublePosition = input(); doublePosition.occupied = [{ memberKey: "outra-posicao", articleId: "artigo" }];
  const wrongSubject = input(); wrongSubject.article.subject = { keywordId: "outro" } as typeof wrongSubject.article.subject;
  for (const example of [wrongRole, occupied, doublePosition, wrongSubject]) assert.equal(plannedArticleMembership(example).ok, false);
});

test("troca da principal não altera âncora e artigo sem Assunto pode usar uma única âncora recebida", () => {
  const example = input(); example.article.subject = undefined;
  assert.equal(plannedArticleMembership(example).ok, true);
  const otherKey = plannedSiloMemberKey("marca", "subject_keyword", "outra-keyword");
  example.silo.payload.plannedMembers!.push({ memberKey: otherKey, anchorKind: "subject_keyword", anchorId: "outra-keyword", role: "Suporte", order: 2 });
  example.page.payload.plannedMemberKeys!.push(otherKey);
  example.article.keywordReferences.push({ keywordId: "outra-keyword" } as typeof example.article.keywordReferences[number]);
  assert.equal(plannedArticleMembership(example).ok, false, "duas âncoras impedem vinculação por dedução");
});
