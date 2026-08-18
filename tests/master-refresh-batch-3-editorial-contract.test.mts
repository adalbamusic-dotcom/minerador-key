import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260817233939_master_refresh_batch_3_editorial_contract_alignment.sql");
const repository = read("lib/server/editorial-repositories.ts");
const workflowRoute = read("app/api/editorial/workflow/route.ts");
const rollback = read("supabase/scripts/master-refresh-batch-3-editorial-rollback.sql");

test("Batch 3 adds only BrandDNA to the closed artifact type contract", () => {
  assert.match(migration, /artifact_type IN \('article_dna', 'silo_dna', 'silo_page', 'content_plan', 'brand_dna'\)/);
  assert.doesNotMatch(migration, /keyword_dna/);
});

test("event ledgers are UUID-bound, tenantized and append-only", () => {
  for (const table of ["editorial_version_status_events", "editorial_decision_events"]) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}`));
    assert.match(migration, new RegExp(`${table}_append_only_trg`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /actor_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE RESTRICT/g);
  assert.match(migration, /canonical_actor_can_access_brand/);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.editorial_decision_events TO service_role/);
  assert.doesNotMatch(migration, /GRANT[^;]+TO anon/);
  assert.match(migration, /Batch 3 refused: artifact_type CHECK drifted/);
});

test("Brand invitations and legacy briefing are outside the schema delta", () => {
  assert.doesNotMatch(migration, /CREATE TABLE public\.brand_invitation/);
  assert.doesNotMatch(migration, /briefings_artigos/);
});

test("active operational repository matches schema 0027 columns", () => {
  assert.match(repository, /status, payload: version/);
  assert.match(repository, /subject_type: "article", subject_id: input\.articleId/);
  assert.match(repository, /onConflict: "marca_id,subject_type,subject_id,stage"/);
  assert.match(repository, /snapshot_version/);
  assert.doesNotMatch(repository, /version_number,payload,created_at/);
  assert.doesNotMatch(repository, /notes: review\.notes/);
  assert.doesNotMatch(repository, /reviewed_at/);
  assert.match(workflowRoute, /"content_plan", command\.plan, "proposed", profile\.userId/);
});

test("rollback is fail-closed once Batch 3 data exists", () => {
  assert.match(rollback, /rollback refused: Batch 3 contracts already contain data/);
  assert.match(rollback, /artifact_type='brand_dna'/);
  assert.doesNotMatch(rollback, /CASCADE/);
});
