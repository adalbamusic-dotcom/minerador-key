import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveCanonicalPublication, isFormalSitePublication } from "../lib/lifecycle/publication.ts";
import { buildDeletionImpact, impactEntry } from "../lib/lifecycle/deletion-impact.ts";
import { recoveryStateForTombstone } from "../lib/lifecycle/contracts.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/0047_global_lifecycle_delete_recovery_purge.sql");
const preflight = read("../supabase/scripts/0047-global-lifecycle-preflight-read-only.sql");
const postVerifier = read("../supabase/scripts/0047-global-lifecycle-post-verifier-read-only.sql");
const cleanupPreflight = read("../supabase/scripts/0047-test-cleanup-preflight-read-only.sql");
const sdd = read("../docs/compartilhado/sdd-lifecycle-global-plataforma-2026-08-20.md");
const deleteUi = read("../components/lifecycle/delete-confirmation.tsx");

function executableSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\r\n]*/g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
}

test("published canônico ignora status legado e exige evidência real", () => {
  assert.deepEqual(resolveCanonicalPublication({ legacyStatus: "publicado" }), { isPublished: false, source: "legacy_unverified" });
  assert.equal(isFormalSitePublication({
    publicationStatus: "published",
    resolvedUrl: "https://example.test/artigo",
    lastCheckedAt: "2026-08-20T12:00:00.000Z",
    urlSituation: "accessible",
    publicationConfirmedBy: "actor",
    publicationConfirmedAt: "2026-08-20T12:01:00.000Z",
  }), true);
  assert.deepEqual(resolveCanonicalPublication({ publicationRecordStatus: "published" }), { isPublished: true, source: "publication_record" });
});

test("impacto compartilhado separa owned, draft, shared, published e histórico", () => {
  const impact = buildDeletionImpact({
    root: { type: "minerador_keyword", id: "kw-1", brandId: "brand-1" },
    isPublished: false,
    ownedChildren: [impactEntry({ key: "metrics", label: "medições", count: 2, classification: "OWNED_CHILD", behavior: "delete" })],
    downstreamDrafts: [impactEntry({ key: "dna", label: "ArticleDNA canônico", count: 1, classification: "CANONICAL_HISTORY", behavior: "preserve" })],
    sharedReferences: [impactEntry({ key: "candidates", label: "referências", count: 1, classification: "SHARED_REFERENCE", behavior: "unlink" })],
  });
  assert.equal(impact.mode, "hard");
  assert.equal(impact.partialDelete, false);
  assert.equal(recoveryStateForTombstone({ deletedAt: "2026-08-20T12:00:00.000Z", purgeAfter: "2026-08-21T12:00:00.000Z" }, new Date("2026-08-20T13:00:00.000Z")), "recoverable");
});

test("migration usa camada tipada, transação única e janela de 24 horas", () => {
  assert.match(migration, /ADD COLUMN deleted_at timestamptz/);
  assert.match(migration, /ADD COLUMN purge_after timestamptz/);
  assert.match(migration, /ADD COLUMN deleted_by uuid/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lifecycle_keyword_deletion_impact/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lifecycle_delete_minerador_keywords/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lifecycle_restore_minerador_keywords/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.lifecycle_purge_minerador_keywords/);
  assert.match(migration, /deleted_at \+ interval '24 hours'/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|ON\s+DELETE\s+CASCADE/i);
  assert.doesNotMatch(migration, /EXECUTE\s+format|table_name|column_name/i);
  assert.match(migration, /partialDelete', false/);
});

test("preflight e post-verifier são read-only e têm baseline vinculado", () => {
  for (const script of [preflight, postVerifier, cleanupPreflight]) {
    const executable = executableSql(script);
    assert.doesNotMatch(executable, /(^|;)\s*(BEGIN|COMMIT|ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|DO|SET)\b/im);
    assert.doesNotMatch(script, /CREATE\s+(TEMP|TEMPORARY)|INTO\s+TEMP/i);
  }
  assert.match(preflight, /MIGRATION_NOT_APPLIED/);
  assert.match(postVerifier, /6514d62c2a740a076c408d92e7bfa3a4/);
  assert.match(postVerifier, /36b0ec7798a1b1aa9df006054b46cc63/);
  assert.match(postVerifier, /POST_VERIFIER_GATE/);
});

test("UI compartilhada exige nome exato para hard delete e recuperação", () => {
  assert.match(deleteUi, /export function DeleteConfirmation/);
  assert.match(deleteUi, /export function PublishedDeleteConfirmation/);
  assert.match(deleteUi, /export function RecoveryAction/);
  assert.match(deleteUi, /24 horas/);
  assert.match(deleteUi, /confirmationName: string/);
  assert.match(deleteUi, /TypedConfirmField/);
  assert.match(deleteUi, /typedConfirmationMatches/);
  assert.doesNotMatch(deleteUi, /acknowledged|type="checkbox"/);
  assert.match(sdd, /SESSION_HISTORY/);
  assert.match(sdd, /legacy.*publicado|status legado/i);
});
