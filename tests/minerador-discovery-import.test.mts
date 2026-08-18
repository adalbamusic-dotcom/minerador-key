import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DiscoveryImportRequestSchema, DiscoveryImportResponseSchema } from "../lib/minerador/discovery-import.ts";

const migration = readFileSync(new URL("../supabase/migrations/0010_minerador_discovery_import.sql", import.meta.url), "utf8");
const migrationFix = readFileSync(new URL("../supabase/migrations/0011_fix_minerador_discovery_import_candidate_alias.sql", import.meta.url), "utf8");
const migrationFinalizedRunFix = readFileSync(new URL("../supabase/migrations/0012_fix_minerador_discovery_import_finalized_run.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/discovery/import/route.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("../lib/minerador/keyword-import-core.ts", import.meta.url), "utf8");
const table = readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");

const importRequestId = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";

test("contrato aceita somente request UUID e IDs tecnicos das candidatas", () => {
  assert.equal(DiscoveryImportRequestSchema.safeParse({ importRequestId, candidateIds: [candidateId] }).success, true);
  assert.equal(DiscoveryImportRequestSchema.safeParse({ importRequestId, candidateIds: [] }).success, false);
  assert.equal(DiscoveryImportRequestSchema.safeParse({ importRequestId, candidateIds: ["keyword livre"] }).success, false);
  assert.equal(DiscoveryImportRequestSchema.safeParse({ importRequestId, candidateIds: [candidateId, candidateId] }).success, false);
});

test("resposta preserva contagens, resultado individual e reexecucao idempotente", () => {
  const result = DiscoveryImportResponseSchema.safeParse({
    batchId: "33333333-3333-4333-8333-333333333333",
    status: "partial",
    selected: 2,
    created: 1,
    alreadyExisting: 1,
    linked: 2,
    rejected: 0,
    failed: 0,
    failureReasons: [],
    resultItems: [
      { candidateId, keyword: "keyword criada", source: "manual", keywordId: "44444444-4444-4444-8444-444444444444", outcome: "created" },
      { candidateId: "55555555-5555-4555-8555-555555555555", keyword: "keyword existente", source: "csv", keywordId: "66666666-6666-4666-8666-666666666666", outcome: "already_existing", errorCode: "keyword_preserved" },
    ],
    idempotent: true,
  });
  assert.equal(result.success, true);
});

test("migration legada cria lote, vinculo de multiplas origens e guardas", () => {
  for (const token of [
    "minerador_discovery_import_batches",
    "minerador_discovery_keyword_origins",
    "UNIQUE (brand_id, import_request_id)",
    "UNIQUE (keyword_id, discovery_candidate_id)",
    "import_minerador_discovery_candidates",
    "candidate.filter_outcome <> 'approved'",
    "run.status <> 'completed'",
    "candidate.import_status = 'imported'",
    "status, lista_id, volume_source, analise_semantica",
    "'bruto'",
    "'google_ads'",
    "ON CONFLICT (keyword_id, discovery_candidate_id) DO NOTHING",
    "ENABLE ROW LEVEL SECURITY",
  ]) assert.equal(migration.includes(token), true, `migration nao contem: ${token}`);
  assert.match(migration, /candidate_ids uuid\[\][\s\S]*cardinality\(candidate_ids\) BETWEEN 1 AND 1000/);
  assert.match(migration, /brand\.owner_user_id = p_actor_user_id/);
  assert.match(migration, /permission\.module = 'minerador'/);
});

test("rota da Descoberta usa o nucleo compartilhado e nao a RPC legada", () => {
  assert.match(route, /DiscoveryImportRequestSchema\.parse/);
  assert.match(route, /importKeywordsWithCore/);
  assert.match(route, /minerador_discovery_import_batches/);
  assert.match(route, /minerador_discovery_keyword_origins/);
  assert.match(route, /requireTenantPermission/);
  assert.doesNotMatch(route, /import_minerador_discovery_candidates/);
  assert.doesNotMatch(route, /createGoogleAds|google-ads|fetch\s*\(/);
});

test("rotas preservam diagnostico sanitizado sem expor credenciais", () => {
  assert.match(route, /sanitizeDatabaseError/);
  assert.match(route, /databaseCode/);
  assert.match(route, /databaseMessage/);
  assert.match(route, /requestId/);
  assert.match(route, /\[redacted\]/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|refreshToken|clientSecret|developerToken/);
});

test("run partial so e elegivel com completed_at", () => {
  assert.match(route, /status === "partial"/);
  assert.match(route, /completed_at/);
  assert.match(route, /completedAtPresent/);
  assert.match(migrationFinalizedRunFix, /run\.status NOT IN \('completed', 'partial'\)/);
  assert.match(migrationFinalizedRunFix, /run\.completed_at IS NULL/);
});

test("patch legada elimina ambiguidade entre variavel candidate e aliases SQL", () => {
  assert.match(migrationFix, /CREATE OR REPLACE FUNCTION public\.import_minerador_discovery_candidates/);
  assert.match(migrationFix, /FROM public\.minerador_discovery_candidates selected_candidate/);
  assert.match(migrationFix, /selected_candidate\.brand_id = p_brand_id/);
  assert.doesNotMatch(migrationFix, /FROM public\.minerador_discovery_candidates candidate\s+WHERE candidate\.brand_id/);
});

test("Extensao e Descoberta compartilham uma unica normalizacao e criacao", () => {
  assert.match(core, /normalizeKeyword/);
  assert.match(core, /duplicate_in_batch/);
  assert.match(core, /status: "bruto"/);
  assert.match(core, /lista_id: null/);
  assert.match(route, /importKeywordsWithCore/);
});

test("Descoberta preserva proveniencia, vincula candidata e permite retry", () => {
  assert.match(route, /discoveryRunId/);
  assert.match(route, /sourceSnapshot/);
  assert.match(route, /discovery_candidate_id/);
  assert.match(route, /import_status: "imported"/);
  assert.match(route, /batch\.status === "completed"/);
  assert.match(route, /createOrRecoverBatch/);
  assert.match(route, /verifyCandidateImport/);
  assert.match(route, /MINERADOR_DISCOVERY_IMPORT_CANDIDATE_READBACK_FAILED/);
  assert.match(route, /errorCode/);
  assert.match(route, /candidateDiagnostic/);
  assert.match(route, /keyword_original/);
  assert.match(route, /candidateSource/);
});

test("interface envia IDs persistidos, request id e encerra loading", () => {
  assert.match(table, /Enviar selecionadas ao Processador/);
  assert.match(table, /candidateIds: selectedCandidateIds/);
  assert.match(table, /const importRequestId = crypto\.randomUUID\(\)/);
  assert.match(table, /apiRequestStarted = true/);
  assert.match(table, /type="button"/);
  assert.match(table, /disabled=\{importing\}/);
  assert.match(table, /finally \{ setImporting\(false\); \}/);
  assert.doesNotMatch(table, /useEffect\([^)]*importSelected/);
  assert.match(table, /Ver detalhes das falhas/);
  assert.match(table, /candidateId: \{detail\.candidateId\}/);
  assert.match(table, /Código: \{detail\.errorCode\}/);
  assert.match(table, /Motivo: \{detail\.reason\}/);
  assert.match(table, /source: item\.source/);
});
