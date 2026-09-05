import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCanonicalWorkflowWorkspaceItems } from "../lib/arquiteto/canonical-workspace.ts";
import {
  buildMineradorArquitetoHandoffPlan,
  CANONICAL_IMPORTABILITY,
  resolveCanonicalMineradorArquitetoImportEligibility,
} from "../lib/arquiteto/minerador-handoff.ts";
import { mergeCanonicalArticleWorkspaceItems } from "../lib/arquiteto/canonical-bootstrap.ts";

const brandId = "95bef1bb-0a3d-4218-a01f-ac7281c55e45";
const otherBrandId = "550e8400-e29b-41d4-a716-446655440099";

/** KeywordDNA consolidada: a importação normal exige qualificação conclusiva. */
const readyQualification = {
  versionId: "ksq-ready",
  contentHash: "hash-ready",
  intent: "informational",
  funnel: "TOFU",
  semanticState: "conclusive" as const,
  collectedAt: "2026-08-29T00:00:00.000Z",
};

function workflow(id: string, subjectId: string, marcaId = brandId, state = "received") {
  return {
    id,
    marcaId,
    subjectType: "keyword",
    subjectId,
    articleId: null,
    stage: "architect" as const,
    state,
    sourceEntityId: subjectId,
    sourceVersionId: null,
    sourceContentHash: null,
    payload: { brandId: marcaId, keywordId: subjectId, source: "MINERADOR", decision: "aprovado", state: "received" },
    lockVersion: 1,
    createdAt: "2026-08-11T12:00:00.000Z",
    updatedAt: "2026-08-11T12:00:00.000Z",
  };
}

test("handoff cria item keyword/architect e mantém a keyword não agrupada", () => {
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId,
    keywords: [{ id: "kw-1", brandId, status: "aprovado" }],
    existingKeywordIds: new Set(),
  });

  assert.equal(plan.status, "PERSISTED");
  assert.deepEqual(plan.createdKeywordIds, ["kw-1"]);
  assert.equal(plan.rows[0]?.subject_type, "keyword");
  assert.equal(plan.rows[0]?.subject_id, "kw-1");
  assert.equal(plan.rows[0]?.stage, "architect");
  assert.equal(plan.rows[0]?.state, "received");
  assert.equal(plan.rows[0]?.payload.source, "MINERADOR");

  const items = buildCanonicalWorkflowWorkspaceItems([workflow("wf-1", "kw-1")], [{ id: "kw-1", brand_id: brandId, keyword: "keyword canônica", status: "aprovado" }], brandId);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.source, "CANONICAL_REMOTE");
  assert.equal(items[0]?.keyword, "keyword canônica");
  assert.equal(items[0]?.clusterId, null);
  assert.equal(items[0]?.provisionalGroupId, null);
});

test("handoff preserva versão e hash de origem quando o Minerador os fornece", () => {
  const contentHash = `sha256:${"b".repeat(64)}`;
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId,
    keywords: [{ id: "kw-versioned", brandId, status: "aprovado", sourceVersionId: "keyword-dna:kw-versioned:v3", contentHash }],
    existingKeywordIds: new Set(),
  });

  assert.equal(plan.rows[0]?.source_version_id, "keyword-dna:kw-versioned:v3");
  assert.equal(plan.rows[0]?.source_content_hash, contentHash);
});

test("handoff remoto received permanece no workspace antes do ArticleDNA", () => {
  const handoffItem = {
    id: "kw-handoff",
    keywordId: "kw-handoff",
    keyword: "keyword nova aprovada",
    status: "aprovado",
    source: "CANONICAL_REMOTE",
    canonicalWorkflow: workflow("wf-handoff", "kw-handoff"),
  };

  assert.deepEqual(mergeCanonicalArticleWorkspaceItems([handoffItem], [], brandId), [handoffItem]);
});

test("handoff é idempotente e não cria nova linha para item já existente", () => {
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId,
    keywords: [{ id: "kw-1", brandId, status: "aprovado" }],
    existingKeywordIds: new Set(["kw-1"]),
  });

  assert.equal(plan.status, "UNCHANGED");
  assert.deepEqual(plan.rows, []);
  assert.deepEqual(plan.existingKeywordIds, ["kw-1"]);
  assert.deepEqual(plan.importedKeywordIds, ["kw-1"]);
});

test("handoff rejeita silenciosamente a projeção de keyword de outra Brand", () => {
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId,
    keywords: [{ id: "kw-other", brandId: otherBrandId, status: "aprovado" }],
    existingKeywordIds: new Set(),
  });

  assert.deepEqual(plan.rows, []);
  assert.deepEqual(plan.importedKeywordIds, []);
});

test("o workspace remoto não promove recovery local nem inventa item sem workflow", () => {
  const items = buildCanonicalWorkflowWorkspaceItems([], [{ id: "kw-local", brand_id: brandId, keyword: "somente local", status: "aprovado" }], brandId);
  assert.deepEqual(items, []);
});

test("somente workflow recebido é operacional no workspace", () => {
  const items = buildCanonicalWorkflowWorkspaceItems([
    workflow("wf-blocked", "kw-blocked", brandId, "remote_legacy_state"),
    workflow("wf-received", "kw-received"),
  ], [
    { id: "kw-blocked", brand_id: brandId, keyword: "bloqueada", status: "aprovado" },
    { id: "kw-received", brand_id: brandId, keyword: "recebida", status: "aprovado" },
  ], brandId);
  assert.deepEqual(items.map(item => item.keywordId), ["kw-received"]);
});

test("a elegibilidade ignora marcador local legado e permite keyword nova aprovada", async () => {
  const eligibility = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId,
    keywords: [{ id: "kw-new", brandId, status: "aprovado", semanticQualification: readyQualification }],
    workflowItems: [],
    articleDnaKeywordIds: new Set(),
  });
  assert.deepEqual(eligibility, [{
    keywordId: "kw-new",
    importability: CANONICAL_IMPORTABILITY.IMPORTABLE,
    workflowState: null,
  }]);

  // Aprovado sem Qualificação Semântica continua importável: o gate é estrutural.
  const withoutQualification = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId,
    keywords: [{ id: "kw-incomplete", brandId, status: "aprovado", semanticQualification: null }],
    workflowItems: [],
    articleDnaKeywordIds: new Set(),
  });
  assert.equal(withoutQualification[0]?.importability, CANONICAL_IMPORTABILITY.IMPORTABLE);

  const workspace = await readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(workspace, /transientHistoricalMarkerIdsForUi/);
  assert.match(workspace, /disabled=\{keyword => !canEnterCanonicalArchitectWorkflow\(keyword\)\}/);
});

test("workflow remoto e ArticleDNA remoto bloqueiam a keyword canonicamente", () => {
  const received = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId,
    keywords: [{ id: "kw-received", brandId, status: "aprovado" }],
    workflowItems: [workflow("wf-received", "kw-received")],
    articleDnaKeywordIds: new Set(),
  });
  const incorporated = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId,
    keywords: [{ id: "kw-article", brandId, status: "aprovado" }],
    workflowItems: [],
    articleDnaKeywordIds: new Set(["kw-article"]),
  });
  const unknownWorkflow = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId,
    keywords: [{ id: "kw-unknown", brandId, status: "aprovado" }],
    workflowItems: [workflow("wf-unknown", "kw-unknown", brandId, "remote_legacy_state")],
    articleDnaKeywordIds: new Set(),
  });

  assert.equal(received[0]?.importability, CANONICAL_IMPORTABILITY.WORKFLOW_RECEIVED);
  assert.equal(incorporated[0]?.importability, CANONICAL_IMPORTABILITY.ARTICLE_DNA_INCORPORATED);
  assert.equal(unknownWorkflow[0]?.importability, CANONICAL_IMPORTABILITY.REMOTE_WORKFLOW_BLOCKED);
});

test("workflow e ArticleDNA de outra Brand não afetam a elegibilidade da Brand atual", () => {
  const eligibility = resolveCanonicalMineradorArquitetoImportEligibility({
    brandId,
    keywords: [{ id: "kw-isolated", brandId, status: "aprovado", semanticQualification: readyQualification }],
    workflowItems: [workflow("wf-other", "kw-isolated", otherBrandId)],
    articleDnaKeywordIds: new Set(),
  });

  assert.equal(eligibility[0]?.importability, CANONICAL_IMPORTABILITY.IMPORTABLE);
});

test("a mesma leitura canônica mantém a decisão após reload", () => {
  const input = {
    brandId,
    keywords: [{ id: "kw-reload", brandId, status: "aprovado" }],
    workflowItems: [],
    articleDnaKeywordIds: new Set<string>(),
  };

  assert.deepEqual(
    resolveCanonicalMineradorArquitetoImportEligibility(input),
    resolveCanonicalMineradorArquitetoImportEligibility(input),
  );
});

test("o handoff normal usa somente o writer canônico", async () => {
  const [workspace, route, pipeline] = await Promise.all([
    readFile(new URL("../lib/server/arquiteto-workspace.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/arquiteto/handoff/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/editorial/workflow/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /createMineradorArquitetoHandoff/);
  assert.match(workspace, /prepareCanonicalHandoff/);
  assert.match(route, /createMineradorArquitetoHandoff/);
  assert.doesNotMatch(pipeline, /subject_type:\s*["']keyword["']/);
});

test("diagnóstico do handoff é catalog-only e não expõe dados editoriais", async () => {
  const script = await readFile(new URL("../supabase/scripts/minerador-arquiteto-handoff-diagnostic-read-only.sql", import.meta.url), "utf8");
  assert.match(script, /2026-08-12-v1/);
  assert.match(script, /REPLACE_WITH_BRAND_UUID/);
  assert.match(script, /minerador_keywords:eligible_for_new_handoff/);
  assert.match(script, /editorial_workflow_items:architect_by_state/);
  assert.match(script, /editorial_artifact_versions:article_dna_versions/);
  assert.doesNotMatch(script, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|ROLLBACK)\b/i);
});
