import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalAgencyInvitationExpiry,
  classifyAgencyInvitationRenewal,
  resolveAgencyInvitationPolicy,
} from "../lib/server/agency-invitation-lifecycle.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("resolver usa sete dias em produção", () => {
  const policy = resolveAgencyInvitationPolicy({ AGENCY_INVITATION_ENV: "production" });
  assert.equal(policy.environment, "production");
  assert.equal(policy.ttlHours, 168);
});

test("resolver usa duas horas em homologação, development e preview", () => {
  assert.equal(resolveAgencyInvitationPolicy({ AGENCY_INVITATION_ENV: "staging" }).ttlHours, 2);
  assert.equal(resolveAgencyInvitationPolicy({ NODE_ENV: "development" }).ttlHours, 2);
  assert.equal(resolveAgencyInvitationPolicy({ VERCEL_ENV: "preview" }).ttlHours, 2);
});

test("resolver aceita override injetável e fallback seguro", () => {
  assert.equal(resolveAgencyInvitationPolicy({ AGENCY_INVITATION_ENV: "test" }, { ttlMs: 30 * 60 * 1000 }).ttlHours, 0.5);
  assert.equal(resolveAgencyInvitationPolicy({ AGENCY_INVITATION_ENV: "unknown" }).ttlHours, 168);
  assert.equal(resolveAgencyInvitationPolicy({}).ttlHours, 168);
});

test("mudança de policy não recalcula validade histórica", () => {
  const historical = "2026-12-13T00:00:00.000Z";
  assert.equal(canonicalAgencyInvitationExpiry(new Date("2026-08-10T00:00:00.000Z"), resolveAgencyInvitationPolicy({ AGENCY_INVITATION_ENV: "development" })), "2026-08-10T02:00:00.000Z");
  assert.equal(historical, "2026-12-13T00:00:00.000Z");
});

test("ACCEPTED é terminal no schema, onboarding e SDD", async () => {
  const [migration, sdd, service] = await Promise.all([
    read("supabase/migrations/0018_agency_onboarding.sql"),
    read("docs/compartilhado/sdd-agency-invitation-successor-lifecycle.md"),
    read("lib/server/agency-onboarding.ts"),
  ]);
  assert.match(migration, /status IN \('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'\)/);
  assert.match(migration, /UPDATE public\.agency_invitations SET status = 'ACCEPTED'/);
  assert.match(sdd, /`ACCEPTED` é terminal/);
  assert.match(service, /ONBOARDING_INVITATION_ACCEPTED_TERMINAL/);
});

test("migration 0023 remove unicidade por catálogo, preserva FK e cria marcador operacional", async () => {
  const [migration, base] = await Promise.all([
    read("supabase/migrations/0023_agency_invitation_successor_lifecycle.sql"),
    read("supabase/migrations/0018_agency_onboarding.sql"),
  ]);
  assert.match(migration, /pg_constraint/);
  assert.match(migration, /DROP CONSTRAINT %I/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_operational boolean NOT NULL DEFAULT false/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS ix_agency_invitations_application_0023/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_invitations_operational_0023/);
  assert.match(base, /application_id uuid UNIQUE REFERENCES public\.agency_applications/);
});

test("backfill não usa heurística e mantém ACCEPTED terminal", async () => {
  const migration = await read("supabase/migrations/0023_agency_invitation_successor_lifecycle.sql");
  assert.match(migration, /SET is_operational = \(status <> 'ACCEPTED'\)/);
  assert.doesNotMatch(migration, /ORDER BY created_at.*is_operational|destination_email.*is_operational/);
  assert.match(migration, /is_operational = false/);
});

test("RPC de renovação bloqueia ACCEPTED, serializa por application e correlaciona mensagem", async () => {
  const migration = await read("supabase/migrations/0023_agency_invitation_successor_lifecycle.sql");
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.renew_agency_invitation/);
  assert.match(migration, /FROM public\.agency_applications[\s\S]*FOR UPDATE/);
  assert.match(migration, /AGENCY_INVITATION_ACCEPTED_TERMINAL/);
  assert.match(migration, /is_operational = false/);
  assert.match(migration, /p_application_id[\s\S]*p_successor_expires_at/);
  assert.match(migration, /agency_invitation:%s:generation:%s/);
});

test("token, onboarding e dispatcher não reabrem predecessor não operacional", async () => {
  const [migration, dispatcher, service] = await Promise.all([
    read("supabase/migrations/0023_agency_invitation_successor_lifecycle.sql"),
    read("lib/server/communication/dispatcher.ts"),
    read("lib/server/agency-onboarding.ts"),
  ]);
  assert.match(migration, /application_id IS NOT NULL AND NOT invitation\.is_operational/);
  assert.match(dispatcher, /application_id && !invitation\.data\.is_operational/);
  assert.match(service, /generatedInvitation\.data\.is_operational/);
});

test("verifier 0023 é read-only, possui versão fixa e um único SELECT final", async () => {
  const verifier = await read("supabase/scripts/agency-invitation-0023-post-verification-read-only.sql");
  assert.match(verifier, /2026-08-10-0023-v1/);
  assert.equal((verifier.match(/\bSELECT\b/gi) || []).length > 0, true);
  assert.doesNotMatch(verifier, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.match(verifier, /SELECT check_name, expected, observed, verdict\s+FROM all_checks/);
  assert.match(verifier, /token_hash/);
  assert.match(verifier, /security:table_acl/);
  assert.match(verifier, /communication_delivery_events/);
});

test("preflight 0023 é read-only, sanitizado e termina em um único result set", async () => {
  const preflight = await read("supabase/scripts/agency-invitation-0023-preflight-read-only.sql");
  assert.doesNotMatch(preflight, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.match(preflight, /2026-08-10-0023-preflight-v2/);
  assert.match(preflight, /migration:versioning_catalog/);
  assert.match(preflight, /data:policy_window_comparison/);
  assert.match(preflight, /security:acl_snapshot/);
  assert.match(preflight, /SELECT check_name, expected, observed, verdict\s+FROM all_checks/);
  assert.doesNotMatch(preflight, /SELECT[^;]*\b(token_hash|destination_email|responsible_name|proposed_agency_name)\b/i);
});

test("snapshot pré-0023 é read-only, sanitizado e captura o baseline", async () => {
  const snapshot = await read("supabase/scripts/agency-invitation-0023-pre-apply-snapshot-read-only.sql");
  assert.doesNotMatch(snapshot, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.match(snapshot, /2026-08-10-0023-snapshot-v2/);
  assert.match(snapshot, /count:agency_invitations_application_id_null/);
  assert.match(snapshot, /count:communication_delivery_events/);
  assert.match(snapshot, /constraint:agency_invitations\.application_id_fk/);
  assert.match(snapshot, /pre-0023: four existing lifecycle signatures; exact renew signature absent/);
  assert.match(snapshot, /expected\.identity <> 'public\.renew_agency_invitation/);
  assert.match(snapshot, /SELECT check_name, expected, observed, verdict\s+FROM all_checks/);
  assert.doesNotMatch(snapshot, /SELECT[^;]*\b(token_hash|destination_email|responsible_name|proposed_agency_name)\b/i);
  assert.match(snapshot, /missing_signatures/);
});

test("diagnóstico RPC 0023 só retorna funções existentes e conta renew separadamente", async () => {
  const diagnostic = await read("supabase/scripts/agency-invitation-0023-rpc-diagnostic-read-only.sql");
  assert.doesNotMatch(diagnostic, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  assert.match(diagnostic, /2026-08-10-0023-rpc-diagnostic-v1/);
  assert.match(diagnostic, /pg_get_function_identity_arguments/);
  assert.match(diagnostic, /pg_get_function_result/);
  assert.match(diagnostic, /pg_get_functiondef/);
  assert.match(diagnostic, /aclexplode/);
  assert.match(diagnostic, /renew_agency_invitation_count/);
  assert.match(diagnostic, /WHERE proname = 'renew_agency_invitation'/);
  assert.doesNotMatch(diagnostic, /CASE\s+WHEN\s+p\.oid\s+IS\s+NULL\s+THEN\s+expected\.identity/i);
  assert.match(diagnostic, /FROM \(\s*SELECT \* FROM function_rows\s*UNION ALL\s*SELECT \* FROM count_row/i);
});

test("classificação respeita política de duas horas e legado exige successor", () => {
  const policy = resolveAgencyInvitationPolicy({ AGENCY_INVITATION_ENV: "development" });
  const now = new Date("2026-08-10T00:00:00.000Z");
  assert.equal(classifyAgencyInvitationRenewal({ status: "PENDING", expiresAt: "2026-08-10T01:00:00.000Z", now, policy }), "REUSE_CURRENT_INVITATION");
  assert.equal(classifyAgencyInvitationRenewal({ status: "PENDING", expiresAt: "2026-08-10T03:00:00.000Z", now, policy }), "CREATE_SUCCESSOR_INVITATION");
  assert.equal(classifyAgencyInvitationRenewal({ status: "REVOKED", expiresAt: "2026-08-10T01:00:00.000Z", now, policy }), "CREATE_SUCCESSOR_INVITATION");
});
