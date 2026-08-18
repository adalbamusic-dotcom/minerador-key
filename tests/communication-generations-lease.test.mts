import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("convites usam gerações hash-only e preservam links anteriores", async () => {
  const [migration, dispatcher, onboarding, route] = await Promise.all([
    read("supabase/migrations/0020_communication_transactional_minimum.sql"),
    read("lib/server/communication/dispatcher.ts"),
    read("lib/server/agency-onboarding.ts"),
    read("app/api/onboarding/agency/route.ts"),
  ]);
  assert.match(migration, /CREATE TABLE public\.agency_invitation_token_generations/);
  assert.match(migration, /used_at timestamptz/);
  assert.match(migration, /revoked_at timestamptz/);
  assert.match(migration, /expires_at timestamptz/);
  assert.match(migration, /create_agency_invitation_token_generation/);
  assert.match(migration, /complete_agency_onboarding_with_token/);
  assert.match(dispatcher, /createAgencyInvitationTokenGeneration/);
  assert.match(dispatcher, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.doesNotMatch(dispatcher, /update\(\{\s*token_hash/);
  assert.match(onboarding, /agency_invitation_token_generations/);
  assert.match(onboarding, /p_token_hash: hashToken\(token\)/);
  assert.match(route, /body\?\.token/);
  assert.match(migration, /SET used_at = now\(\)/);
});

test("claim possui lease central, reclaim de SENDING expirado e limite de tentativas", async () => {
  const [migration, contracts] = await Promise.all([
    read("supabase/migrations/0020_communication_transactional_minimum.sql"),
    read("lib/server/communication/contracts.ts"),
  ]);
  assert.match(contracts, /COMMUNICATION_DISPATCH_MAX_ATTEMPTS = 3/);
  assert.match(contracts, /COMMUNICATION_DISPATCH_LEASE_SECONDS = 5 \* 60/);
  assert.match(migration, /communication_dispatch_lease_seconds\(\)/);
  assert.match(migration, /status IN \('QUEUED', 'FAILED'\)/);
  assert.match(migration, /status = 'SENDING'/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /attempt_count < 3/);
  assert.match(migration, /locked_at = now\(\)/);
  assert.match(migration, /claimed_at = NULL/);
  assert.match(migration, /locked_at = NULL/);
});

test("onboarding é idempotente e delivery events não sobrescrevem o primeiro provider id", async () => {
  const migration = await read("supabase/migrations/0020_communication_transactional_minimum.sql");
  assert.match(migration, /WHERE idempotency_key = p_idempotency_key FOR UPDATE/);
  assert.match(migration, /AGENCY_ONBOARDING_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.match(migration, /provider_message_id = coalesce\(provider_message_id, p_provider_message_id\)/);
  assert.match(migration, /communication_delivery_events_message_0020/);
});

test("rollback físico é bloqueado por dados e dry-run é somente leitura", async () => {
  const [rollback, dryRun] = await Promise.all([
    read("supabase/scripts/fase-comunicacao-0020-rollback.sql"),
    read("supabase/scripts/fase-comunicacao-0020-rollback-dry-run-read-only.sql"),
  ]);
  assert.match(rollback, /COMMUNICATION_0020_ROLLBACK_BLOCKED_DATA_PRESENT/);
  assert.match(rollback, /count\(\*\)/);
  assert.match(rollback, /DROP COLUMN IF EXISTS communication_generation/);
  assert.doesNotMatch(rollback, /DELETE FROM|TRUNCATE/i);
  const executableDryRun = dryRun.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(executableDryRun, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE)\b/i);
  assert.match(dryRun, /SAFE_TO_REVIEW_SCHEMA_REMOVAL/);
  assert.match(dryRun, /BLOCKED_DATA_PRESENT/);
});
