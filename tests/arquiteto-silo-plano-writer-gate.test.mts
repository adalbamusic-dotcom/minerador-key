import assert from "node:assert/strict";
import test from "node:test";
import { createSiloWorkingCopy, updateSiloWorkingCopy } from "../lib/server/arquiteto-silo-working-copy-store.ts";
import { buildSiloWorkingCopyRef } from "../lib/arquiteto/silo-working-copy-record.ts";
import { plannedSiloMemberKey } from "../lib/arquiteto/planned-silo-member.ts";
import { consolidateSiloFromWorkingCopy, loadVerifiedPlannedSiloSource, verifyPlannedSiloConsolidation } from "../lib/server/arquiteto-silo-consolidation-adapter.ts";
import { appendArquitetoArtifact, persistSiloPairAtomic } from "../lib/server/arquiteto-persistence.ts";

const brandId = "brand-a";
const territoryRef = "territory:11111111-1111-4111-8111-111111111111";
const memberKey = plannedSiloMemberKey(brandId, "subject_keyword", "subject-a");
const draft = {
  territoryRef, name: "Silo", slug: "silo", formationStatus: "draft", existingSiloId: null,
  articleRefs: [], pillarSuggestionArticleId: null, pillarSelection: null,
  supportArticleIds: [], exclusions: [], reasons: [], conflicts: [],
  plannedComposition: {
    source: { kind: "editorial_group_plan", groupId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", planVersion: 1, planHash: "sha256:abc", lockVersion: 1 },
    members: [{ memberKey, anchorKind: "subject_keyword", anchorId: "subject-a", role: "Pilar", order: 1 }],
    subjectProofs: [{ keywordId: "subject-a", approvedPackageRef: { version: 1, contentHash: "hash", approvedAt: "2026-11-02" } }],
    pillarSelection: { memberKey, actorUserId: "human-a", decidedAt: "2026-11-02", reason: "Pilar", decidedOverMemberKeys: [memberKey] },
  },
};

test("a pré-validação recusa página que aponta para outra versão antes de ler banco", async () => {
  let calls = 0;
  const context = { brandId, actorUserId: "human-a", supabase: { from() { calls++; throw new Error("consulta inesperada"); } } };
  const dna = { entityId: "silo", versionId: "v1", contentHash: "hash", payload: { siloId: "silo" } };
  const page = { entityId: "silo-page:silo", payload: { siloPageId: "silo-page:silo", siloDnaRef: { entityId: "silo", versionId: "v2", contentHash: "hash" } } };
  const decision = { scope: "planned_members", actorUserId: "human-a", decidedAt: "2026-11-02", reason: "Confirmado", territoryRef, pillarMemberKey: memberKey, supportMemberKeys: [], publishedIdentityResolved: false };
  const options = { statuses: { siloDna: "approved", siloPage: "approved" }, siloPageApproval: null };
  await assert.rejects(verifyPlannedSiloConsolidation(context as never, draft as never, dna as never, page as never, decision as never, options), /versão exata/);
  await assert.rejects(verifyPlannedSiloConsolidation(context as never, draft as never, dna as never, page as never, { ...decision, actorUserId: "outro" } as never, options), /usuário autenticado/);
  await assert.rejects(verifyPlannedSiloConsolidation(context as never, draft as never, dna as never, page as never, { ...decision, pillarMemberKey: "outra" } as never, options), /PILLAR_DECISION_STALE/);
  assert.equal(calls, 0);
});

test("a confirmação não aceita decisão em nome de outro usuário", async () => {
  let calls = 0;
  const context = { brandId, actorUserId: "humano-a", supabase: { from() { calls++; throw new Error("consulta inesperada"); }, rpc() { calls++; throw new Error("RPC inesperada"); } } };
  const request = { siloDna: { payload: {} }, siloPage: { payload: {} }, decision: { actorUserId: "humano-b" } };
  await assert.rejects(consolidateSiloFromWorkingCopy(context as never, request as never), /usuário autenticado/);
  await assert.rejects(consolidateSiloFromWorkingCopy(context as never, { ...request, decision: { actorUserId: "humano-a" }, siloPageApproval: { actorUserId: "humano-b" } } as never), /usuário autenticado/);
  assert.equal(calls, 0);
});

test("aprovar o par exige permissão de aprovação antes de qualquer gravação", async () => {
  const actorUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const calls: string[] = [];
  const context = { brandId: tenant, actorUserId, supabase: { async rpc(name: string) { calls.push(name); return { data: name === "canonical_actor_can_access_brand", error: null }; }, from() { throw new Error("gravação inesperada"); } } };
  const request = { siloDna: { payload: {} }, siloPage: { payload: {} }, decision: { actorUserId }, statuses: { siloDna: "approved", siloPage: "approved" } };
  await assert.rejects(consolidateSiloFromWorkingCopy(context as never, request as never), /permissão/);
  assert.deepEqual(calls, ["canonical_actor_can_access_brand", "canonical_actor_can_use_brand_action"]);
});

test("criação e alteração recusam escrita planejada antes de qualquer consulta ou RPC", async () => {
  let calls = 0;
  const context = { brandId, actorUserId: "human-a", supabase: { from() { calls++; throw new Error("consulta inesperada"); }, rpc() { calls++; throw new Error("RPC inesperada"); } } };
  await assert.rejects(createSiloWorkingCopy(context as never, draft), /estrutura planejada.*adaptação/i);
  await assert.rejects(updateSiloWorkingCopy(context as never, buildSiloWorkingCopyRef(territoryRef), 1, draft), /estrutura planejada.*adaptação/i);
  assert.equal(calls, 0);
});

test("cópia legada ainda percorre o writer existente", async () => {
  let calls = 0;
  const context = { brandId, actorUserId: "human-a", supabase: { from() { calls++; throw new Error("consulta legada executada"); } } };
  const { plannedComposition: ignored, ...legacy } = draft;
  void ignored;
  await assert.rejects(createSiloWorkingCopy(context as never, legacy), /consulta legada executada/);
  assert.equal(calls, 1);
});

test("fonte é relida pela marca e só aceita plano ativo com versão, hash e lock exatos", async () => {
  const source = draft.plannedComposition.source;
  const initial = { id: source.groupId, marca_id: brandId, origin: "declared_plan", status: "active", plan: { name: "Silo" }, plan_version: 1, plan_hash: "sha256:abc", lock_version: 1 };
  const load = async (row: Record<string, unknown> | null, error: unknown = null) => {
    const filters: Record<string, unknown> = {};
    const query = { select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; }, async maybeSingle() { return { data: row, error }; } };
    const context = { brandId, supabase: { from(table: string) { assert.equal(table, "editorial_groups"); return query; } } };
    const promise = loadVerifiedPlannedSiloSource(context as never, source as never);
    assert.equal(filters.marca_id, brandId);
    assert.equal(filters.id, source.groupId);
    return promise;
  };
  assert.deepEqual(await load(initial), initial);
  for (const row of [null, { ...initial, marca_id: "outra" }, { ...initial, status: "archived" }, { ...initial, origin: "manual" }, { ...initial, plan: null }, { ...initial, plan_version: 2 }, { ...initial, plan_hash: "mudou" }, { ...initial, lock_version: 2 }]) {
    await assert.rejects(load(row), /plano|fonte/i);
  }
  await assert.rejects(load(null, { message: "falha", code: "UNKNOWN" }));
});

test("append e par legado recusam estrutura planejada antes de tocar banco", async () => {
  let calls = 0;
  const context = { brandId, actorUserId: "human-a", supabase: { from() { calls++; throw new Error("consulta inesperada"); }, rpc() { calls++; throw new Error("RPC inesperada"); } } };
  const hash = `sha256:${"a".repeat(64)}`;
  const member = draft.plannedComposition.members[0];
  const dna = { schemaVersion: 1, compositionBasis: "planned_members", compositionSourceRef: draft.plannedComposition.source, plannedMembers: [member], keywordPackageRefs: draft.plannedComposition.subjectProofs.map(proof => ({ keywordId: proof.keywordId, ...proof.approvedPackageRef })), formationStatus: "formed", siloId: "silo-1", brandId, centralEntity: "Internet", objective: "Informar", audience: "Pessoas", macroProblem: "Conexão", dominantIntent: "Informativa", pillarArticleId: null, supportArticleIds: [], articleReferences: [], articleRoles: [], narrativeOrder: [], linkMap: [], boundary: "Conexão", includedTopics: [], excludedTopics: [], nearbySiloIds: [], possibleConflicts: [], gaps: [], nextContents: [], confidence: 0.8, humanPendingDecisions: [] };
  const page = { schemaVersion: 1, compositionBasis: "planned_members", plannedMemberKeys: [memberKey], formationStatus: "formed", siloPageId: "silo-page:silo-1", brandId, siloDnaRef: { entityId: "silo-1", versionId: "dna:v1", contentHash: hash }, siloId: "silo-1", slug: "silo", h1: "Título", seoTitle: "Título", metaDescription: "Descrição", canonical: null, intro: "Introdução", sections: [], cta: "Saiba mais", coverImageBrief: "", visualBriefing: "", breadcrumbs: [], pillarArticleId: null, supportArticleIds: [], indexationStatus: "noindex", alerts: [], confidence: 0.8, humanPendingDecisions: [] };
  const envelope = (entityId: string, payload: unknown) => ({ entityId, versionId: `${entityId}:v1`, versionNumber: 1, previousVersionId: null, contentHash: hash, origin: "human", changeReason: "teste", createdAt: "2026-11-02T00:00:00.000Z", createdBy: "human-a", payload });
  const dnaVersion = envelope("silo-1", dna);
  const pageVersion = envelope("silo-page:silo-1", page);
  const article = { schemaVersion: 1, articleId: "article-1", brandId, principalKeywordId: "kw-1", secondaryKeywordIds: [], narrativeReinforcementIds: [], keywordReferences: [{ keywordId: "kw-1", keywordDnaVersionId: "legacy:kw-1:v1", keywordDnaContentHash: "legacy:kw-1", role: "principal", strategicContribution: "Tema", coveredIntentions: ["informativa"], requiredTopics: [], excludedTopics: [], classificationOrigin: "legacy", confidence: 0.8, humanConfirmed: true }], siloId: "silo-1", siloMembershipRef: { siloDnaVersionId: "dna:v1", siloDnaContentHash: hash, memberKey }, hierarchy: "Pilar", suggestedSlug: "tema", canonical: null, mainIntent: "Informar", auxiliaryIntents: [], audience: "Pessoas", problem: "Dúvida", desiredResult: "Entendimento", journeyStage: "topo", brandObjective: "Informar", promise: "Explicar", angle: "Guia", cta: "Ler", coverage: ["tema"], excludedSubjects: [], antiCannibalizationBoundary: "Tema", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.8, humanPendingDecisions: [] };
  await assert.rejects(appendArquitetoArtifact(context as never, "silo_dna", dnaVersion as never), /estrutura planejada.*adaptação/i);
  await assert.rejects(appendArquitetoArtifact(context as never, "silo_page", pageVersion as never), /estrutura planejada.*adaptação/i);
  await assert.rejects(appendArquitetoArtifact(context as never, "article_dna", envelope("article-1", article) as never), /artigo vinculado.*adaptação/i);
  await assert.rejects(persistSiloPairAtomic(context as never, dnaVersion as never, pageVersion as never, { siloDna: "approved", siloPage: "approved" }), /estrutura planejada.*adaptação/i);
  await assert.rejects(consolidateSiloFromWorkingCopy(context as never, { siloDna: dnaVersion, siloPage: pageVersion } as never), /estrutura planejada.*adaptação/i);
  assert.equal(calls, 0);
});
