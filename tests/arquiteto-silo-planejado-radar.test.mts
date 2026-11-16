import test from "node:test";
import assert from "node:assert/strict";
import { buildRadarHandoffContexts, resolveCanonicalSiloForArticle } from "../lib/arquiteto/radar-handoff-context.ts";

const brandId = "marca";
const groupId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const memberKey = JSON.stringify([brandId, "subject_keyword", "assunto"]);
const subjectProofs = [{ keywordId: "assunto", version: 1, contentHash: "subject-hash", approvedAt: "2026-11-13" }];
const membership = { siloDnaVersionId: "sv1", siloDnaContentHash: "sha256:silo", memberKey };
const article = { articleId: "art", brandId, siloId: "silo", hierarchy: "Pilar", territoryRef: "territory:x", siloMembershipRef: membership, subject: { keywordId: "assunto" }, keywordReferences: [{ keywordId: "assunto" }] };
const silo = { versionId: "sv1", contentHash: "sha256:silo", payload: { brandId, siloId: "silo", name: "Tema", territoryRef: "territory:x", compositionBasis: "planned_members", compositionSourceRef: { kind: "editorial_group_plan", groupId, planVersion: 1, planHash: "hash-plan", lockVersion: 1 }, keywordPackageRefs: subjectProofs, plannedMembers: [{ memberKey, anchorKind: "subject_keyword", anchorId: "assunto", role: "Pilar", order: 1 }] } };
const page = { versionId: "pv1", payload: { brandId, siloId: "silo", siloPageId: "page", compositionBasis: "planned_members", plannedMemberKeys: [memberKey], siloDnaRef: { versionId: "sv1", contentHash: "sha256:silo", entityId: "silo" } } };
const approvedArticle = { versionId: "av1", contentHash: "sha256:article", current: true, effectiveStatus: "approved", payload: article };
const authority = { siloStatus: "approved", siloCurrent: true, pageStatus: "approved", pageCurrent: true, articleVersionId: "av1", articles: [approvedArticle], sourceCurrent: { brandId, groupId, origin: "declared_plan", status: "active", planVersion: 1, planHash: "hash-plan", subjectProofs } };

test("handoff planejado não presume o papel sem leitura completa e aprovada", () => {
  const missing = resolveCanonicalSiloForArticle({ article: article as never, siloVersions: [silo] as never, siloPageVersions: [page] as never });
  assert.equal(missing.ok, false);
  const resolved = resolveCanonicalSiloForArticle({ article: article as never, siloVersions: [silo] as never, siloPageVersions: [page] as never, plannedAuthority: authority as never, articleVersion: { versionId: "av1", contentHash: "sha256:article" } });
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.context.articleRole, "pillar");
  const changedPlan = resolveCanonicalSiloForArticle({ article: article as never, siloVersions: [silo] as never, siloPageVersions: [page] as never, plannedAuthority: { ...authority, sourceCurrent: { ...authority.sourceCurrent, planHash: "outro" } } as never, articleVersion: { versionId: "av1", contentHash: "sha256:article" } });
  assert.equal(changedPlan.ok, false);
  const changedSubject = resolveCanonicalSiloForArticle({ article: article as never, siloVersions: [silo] as never, siloPageVersions: [page] as never, plannedAuthority: { ...authority, sourceCurrent: { ...authority.sourceCurrent, subjectProofs: [{ ...subjectProofs[0], version: 2 }] } } as never, articleVersion: { versionId: "av1", contentHash: "sha256:article" } });
  assert.equal(changedSubject.ok, false);
  const rejected = resolveCanonicalSiloForArticle({ article: article as never, siloVersions: [silo] as never, siloPageVersions: [page] as never, plannedAuthority: { ...authority, articles: [{ ...approvedArticle, effectiveStatus: "rejected" }] } as never, articleVersion: { versionId: "av1", contentHash: "sha256:article" } });
  assert.equal(rejected.ok, false);
});

test("lote para Radar não libera estrutura planejada sem autoridade; artigo deve ser a versão resolvida", () => {
  const version = { versionId: "av1", contentHash: "sha256:article", payload: article };
  const input = { articles: [version], siloVersions: [silo], siloPageVersions: [page], graphs: [] } as never;
  const result = buildRadarHandoffContexts(input);
  assert.equal(result.eligible.length, 0);
  assert.equal(result.blocked.length, 1);
  const eligible = buildRadarHandoffContexts({ articles: [version], siloVersions: [silo], siloPageVersions: [page], graphs: [], plannedAuthorityFor: () => authority } as never);
  assert.equal(eligible.eligible.length, 1);
  assert.equal(eligible.eligible[0].silo.articleRole, "pillar");
  const wrong = resolveCanonicalSiloForArticle({ article: article as never, siloVersions: [silo] as never, siloPageVersions: [page] as never, plannedAuthority: { ...authority, articleVersionId: "other" } as never, articleVersion: { versionId: "av1", contentHash: "sha256:article" } });
  assert.equal(wrong.ok, false);
  const wrongHash = resolveCanonicalSiloForArticle({ article: article as never, siloVersions: [silo] as never, siloPageVersions: [page] as never, plannedAuthority: authority as never, articleVersion: { versionId: "av1", contentHash: "outro" } });
  assert.equal(wrongHash.ok, false);
});
