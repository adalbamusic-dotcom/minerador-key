import assert from "node:assert/strict";
import test from "node:test";
import { PlannedSiloSourceRefSchema, SiloDNASchema, plannedSiloMemberKey } from "../lib/arquiteto/contracts.ts";

const groupId = "b9b25a86-553f-4962-8cd4-d0233b80e2d0";
const source = { kind: "editorial_group_plan" as const, groupId, planVersion: 6, planHash: "abc123", lockVersion: 3 };

test("fonte do Silo aponta para a versão real do plano do grupo", () => {
  assert.deepEqual(PlannedSiloSourceRefSchema.parse(source), source);
  assert.equal(PlannedSiloSourceRefSchema.parse({ ...source, planHash: " abc " }).planHash, " abc ", "a validação não pode alterar o hash persistido");
  for (const value of [
    { ...source, groupId: "não é uuid" },
    { ...source, planVersion: 0 },
    { ...source, lockVersion: 0 },
    { ...source, planHash: " " },
    { ...source, planHash: "a".repeat(129) },
    { ...source, versionId: "versão-fabricada" },
    { entityId: groupId, versionId: "v6", contentHash: `sha256:${"a".repeat(64)}` },
  ]) assert.equal(PlannedSiloSourceRefSchema.safeParse(value).success, false);
});

test("estrutura planejada exige fonte real e não mistura referências de artigos finais", () => {
  const member = { memberKey: plannedSiloMemberKey("brand-1", "subject_keyword", "kw-1"), anchorKind: "subject_keyword", anchorId: "kw-1", role: "Pilar", order: 1 };
  const silo = {
    schemaVersion: 1, compositionBasis: "planned_members", compositionSourceRef: source, plannedMembers: [member], keywordPackageRefs: [{ keywordId: "kw-1", version: 1, contentHash: "package-hash", approvedAt: "2026-11-13" }],
    formationStatus: "formed", siloId: "silo-1", brandId: "brand-1", centralEntity: "Internet", objective: "Informar",
    audience: "Pessoas", macroProblem: "Conexão", dominantIntent: "Informativa", pillarArticleId: null,
    supportArticleIds: [], articleReferences: [], articleRoles: [], narrativeOrder: [], linkMap: [], boundary: "Conexão",
    includedTopics: [], excludedTopics: [], nearbySiloIds: [], possibleConflicts: [], gaps: [], nextContents: [],
    confidence: 0.8, humanPendingDecisions: [],
  };
  assert.equal(SiloDNASchema.safeParse(silo).success, true);
  assert.equal(SiloDNASchema.safeParse({ ...silo, compositionSourceRef: undefined }).success, false);
  assert.equal(SiloDNASchema.safeParse({ ...silo, keywordPackageRefs: [] }).success, false);
  assert.equal(SiloDNASchema.safeParse({ ...silo, compositionBasis: "article_versions" }).success, false);
  assert.equal(SiloDNASchema.safeParse({ ...silo, pillarArticleId: "artigo-fabricado" }).success, false);
  assert.equal(SiloDNASchema.safeParse({ ...silo, plannedMembers: [{ ...member, memberKey: "outro" }] }).success, false);
  const support = { ...member, memberKey: plannedSiloMemberKey("brand-1", "subject_keyword", "kw-2"), anchorId: "kw-2", role: "Suporte", order: 2 };
  const proofs = [...silo.keywordPackageRefs, { keywordId: "kw-2", version: 1, contentHash: "package-hash-2", approvedAt: "2026-11-13" }];
  assert.equal(SiloDNASchema.safeParse({ ...silo, keywordPackageRefs: proofs, plannedMembers: [member, support] }).success, true);
  assert.equal(SiloDNASchema.safeParse({ ...silo, keywordPackageRefs: proofs, plannedMembers: [support, member] }).success, false);
});
