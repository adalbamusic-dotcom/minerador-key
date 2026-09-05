import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyKeywordLifecycleDependencyError,
  KeywordLifecycleDependencyAuditError,
  KEYWORD_LIFECYCLE_DEPENDENCY_QUERIES,
  assessKeywordHardDelete,
  canRestoreKeyword,
  keywordHardDeleteBlockMessage,
  keywordRecoveryRemainingLabel,
  recoverablePurgeAfter,
  resolveKeywordPublication,
} from "../lib/minerador/keyword-lifecycle.ts";

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

const base = {
  keywordId: "keyword-1",
  publicationProtected: false,
  semantic: null,
  volumeSearch: null,
  resultsAllintitle: null,
  volumeSource: null,
};

test("keyword nova sem dependências protegidas pode ser hard-deleted", () => {
  const decision = assessKeywordHardDelete(base);
  assert.equal(decision.allowed, true);
});

test("medição Google Ads não impede hard delete de keyword não publicada", () => {
  const decision = assessKeywordHardDelete({
    ...base,
    references: [{ kind: "google_ads_measurement", count: 1 }],
  });
  assert.equal(decision.allowed, true);
});

test("medição DataForSEO embutida não impede hard delete", () => {
  const decision = assessKeywordHardDelete({ ...base, resultsAllintitle: 12 });
  assert.equal(decision.allowed, true);
});

test("proveniência, DNA e histórico semântico não criam lixeira para keyword não publicada", () => {
  for (const semantic of [
    { discovery_import: { discoveryRunId: "run-1" } },
    { keyword_dna: { version: 1 } },
    { kgr_score_history: [{ score: 0.1 }] },
  ]) {
    const decision = assessKeywordHardDelete({ ...base, semantic });
    assert.equal(decision.allowed, true);
  }
});

test("publicação formal/legada exige o fluxo recuperável", () => {
  const decision = assessKeywordHardDelete({ ...base, publicationProtected: true });
  assert.equal(decision.allowed, false);
  assert.match(keywordHardDeleteBlockMessage(decision), /restaurada durante 24 horas/);
});

test("a publicação é resolvida antes da confirmação e a mutação usa a rota transacional", () => {
  const start = workspace.indexOf("const handleBatchDelete");
  const end = workspace.indexOf("const organizeFilterLabels", start);
  const handler = workspace.slice(start, end);
  assert.ok(handler.indexOf("requestKeywordDeletePreview") >= 0);
  assert.doesNotMatch(handler, /window\.confirm/);
  assert.match(workspace, /<DeleteConfirmation/);
  assert.match(workspace, /<PublishedDeleteConfirmation/);
  assert.doesNotMatch(handler, /\.from\("minerador_keywords"\)/);
  assert.doesNotMatch(handler, /\.delete\(\)/);
  assert.match(workspace, /keywords\/delete\/preview/);
  assert.match(workspace, /keywords\/delete/);
});

test("duplicatas e recuperação usam o mesmo gate server-side", () => {
  assert.match(workspace, /handleBatchDelete\(false, idsToDelete\)/);
  assert.doesNotMatch(workspace, /executeKeywordDeletion\(\{ ids: idsToDelete/);
  assert.match(workspace, /loadRecoverableKeywords\(selectedBrandId\)/);
  assert.doesNotMatch(workspace, /new Date\(Date\.parse\(deletedAt\)/);
});

test("carregar a tela não executa mais hard delete automático de duplicatas", () => {
  const start = workspace.indexOf("let loadedKeywords =");
  const end = workspace.indexOf("// B.", start);
  const hydration = workspace.slice(start, end);
  assert.doesNotMatch(hydration, /\.delete\(\)/);
});

test("status editorial e vínculo candidato não são usados como archive", () => {
  assert.doesNotMatch(workspace, /status\s*=\s*["']archived["']/i);
  assert.doesNotMatch(workspace, /publicationStatus\s*=\s*["']archived["']/i);
});

test("o catálogo distingue limpeza própria de dependência compartilhada", () => {
  const measurement = KEYWORD_LIFECYCLE_DEPENDENCY_QUERIES.find(spec => spec.key.includes("metric_measurements"));
  const candidate = KEYWORD_LIFECYCLE_DEPENDENCY_QUERIES.find(spec => spec.key.includes("existing_keyword_id"));
  assert.equal(measurement?.blockingPolicy, "cleanup_on_hard_delete");
  assert.equal(candidate?.blockingPolicy, "preserve_shared_reference");
});

test("a janela recuperável dura 24 horas e nunca depende de métricas", () => {
  const deletedAt = "2026-08-20T12:00:00.000Z";
  const purgeAfter = recoverablePurgeAfter(deletedAt);
  assert.equal(purgeAfter, "2026-08-21T12:00:00.000Z");
  assert.equal(canRestoreKeyword({ deleted_at: deletedAt, purge_after: purgeAfter }, new Date("2026-08-20T13:00:00.000Z")), true);
  assert.equal(canRestoreKeyword({ deleted_at: deletedAt, purge_after: purgeAfter }, new Date("2026-08-21T12:00:00.000Z")), false);
  assert.match(keywordRecoveryRemainingLabel({ deleted_at: deletedAt, purge_after: purgeAfter }, new Date("2026-08-20T13:00:00.000Z")), /23h/);
});

test("a fonte publicada é formal ou linhagem canônica, nunca DNA/metrics/workflow/status legado", () => {
  assert.deepEqual(resolveKeywordPublication({ status: "bruto", semantic: { keyword_dna: { version: 1 }, workflow: { state: "approved" } } }), { isPublished: false, source: "none" });
  assert.deepEqual(resolveKeywordPublication({ status: "publicado", semantic: null }), { isPublished: false, source: "legacy_unverified" });
  assert.deepEqual(resolveKeywordPublication({
    status: "aprovado",
    semantic: {
      site_origin: {
        publicationStatus: "published",
        resolvedUrl: "https://example.com/keyword",
        urlSituation: "accessible",
        lastCheckedAt: "2026-08-20T12:00:00.000Z",
        publicationConfirmedBy: "actor-1",
        publicationConfirmedAt: "2026-08-20T12:01:00.000Z",
      },
    },
  }), { isPublished: true, source: "formal_site_link" });
});

test("o pacote não usa CASCADE como atalho client-side", () => {
  assert.doesNotMatch(workspace, /ALTER\s+TABLE[\s\S]{0,120}ON\s+DELETE\s+CASCADE/i);
});

test("o catálogo ativo só contém dependências do contrato atual", () => {
  assert.equal(KEYWORD_LIFECYCLE_DEPENDENCY_QUERIES.some(spec => spec.table === "brand_site_keyword_candidates"), false);
  assert.equal(workspace.includes("brand_site_keyword_candidates"), false);
  for (const spec of KEYWORD_LIFECYCLE_DEPENDENCY_QUERIES) {
    assert.equal(spec.schema, "public");
    assert.equal(spec.required, spec.applicability === "current_contract");
    assert.ok(["current_contract", "optional_current_contract"].includes(spec.applicability));
    assert.ok(["cleanup_on_hard_delete", "preserve_shared_reference"].includes(spec.blockingPolicy));
    assert.ok(spec.key);
    assert.ok(spec.referenceColumn);
  }
});

test("fonte legada ausente fica fora do preflight, sem transformar ausência opcional em zero", () => {
  assert.doesNotMatch(workspace, /site_import_reference/);
  assert.equal(KEYWORD_LIFECYCLE_DEPENDENCY_QUERIES.filter(spec => spec.applicability === "optional_current_contract").length, 1);
  assert.equal(assessKeywordHardDelete(base).allowed, true);
});

test("tabela obrigatória ausente, coluna inválida e permissão negada falham fechados", () => {
  assert.equal(classifyKeywordLifecycleDependencyError({ code: "42P01", message: "relation does not exist" }), "TABLE_NOT_FOUND");
  assert.equal(classifyKeywordLifecycleDependencyError({ code: "42703", message: "column does not exist" }), "COLUMN_NOT_FOUND");
  assert.equal(classifyKeywordLifecycleDependencyError({ code: "42501", message: "permission denied" }), "PERMISSION_DENIED");
  assert.equal(classifyKeywordLifecycleDependencyError({ code: "42501", message: "new row violates row-level security policy" }), "RLS_DENIED");
  assert.equal(classifyKeywordLifecycleDependencyError({ code: "42601", message: "syntax error" }), "INVALID_QUERY");

  const error = new KeywordLifecycleDependencyAuditError(
    { key: "required.table.keyword_id", table: "required_table", referenceColumn: "keyword_id" },
    { code: "42703", message: "column keyword_id does not exist; token=do-not-expose" },
  );
  assert.equal(error.code, "KEYWORD_DEPENDENCY_AUDIT_FAILED");
  assert.deepEqual(error.diagnostic, {
    dependencyKey: "required.table.keyword_id",
    table: "required_table",
    referenceColumn: "keyword_id",
    errorCode: "42703",
    errorCategory: "COLUMN_NOT_FOUND",
    message: "column keyword_id does not exist; token=[redacted]",
  });
});
