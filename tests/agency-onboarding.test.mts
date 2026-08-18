import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("0018 separa solicitação Free, convite e agency criada", async () => {
  const migration = await read("supabase/migrations/0018_agency_onboarding.sql");
  assert.match(migration, /CREATE TABLE public\.agency_applications/);
  assert.match(migration, /status IN \('PENDING', 'APPROVED', 'REJECTED'\)/);
  assert.match(migration, /plan_code text NOT NULL DEFAULT 'FREE'/);
  assert.match(migration, /source IN \('ADMIN_INVITE', 'PUBLIC_APPLICATION'\)/);
  assert.match(migration, /application_id uuid UNIQUE/);
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.doesNotMatch(migration, /SELF_SERVICE_PLAN|AGENCY_SIMULATION|charged_amount/);
});

test("solicitação pública não cria Auth, agência ou membership", async () => {
  const [route, service, migration] = await Promise.all([read("app/api/agency-applications/route.ts"), read("lib/server/agency-onboarding.ts"), read("supabase/migrations/0018_agency_onboarding.sql")]);
  assert.match(route, /createPublicAgencyApplication/);
  assert.match(service, /idempotency_key/);
  assert.match(service, /agency_applications/);
  const applicationSegment = migration.slice(migration.indexOf("CREATE TABLE public.agency_applications"), migration.indexOf("CREATE TABLE public.agency_invitations"));
  assert.doesNotMatch(applicationSegment, /agency_memberships|brand_memberships|INSERT INTO public\.agencies/);
  assert.match(service, /SCHEMA_NOT_APPLIED/);
  assert.match(service, /0018_agency_onboarding\.sql/);
});

test("Admin aprova uma solicitação por fronteira transacional e não duplica convite", async () => {
  const [route, migration] = await Promise.all([read("app/api/admin/agency-applications/route.ts"), read("supabase/migrations/0018_agency_onboarding.sql")]);
  assert.match(route, /requireCanonicalPlatformAdmin/);
  assert.match(route, /approveAgencyApplication/);
  assert.match(route, /rejectAgencyApplication/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.approve_agency_application/);
  assert.match(migration, /WHERE application_id = application\.id FOR UPDATE/);
  assert.match(migration, /UPDATE public\.agency_applications SET status = 'APPROVED'/);
  assert.match(migration, /RAISE EXCEPTION 'AGENCY_APPLICATION_ALREADY_APPROVED'/);
});

test("gate da 0018 é somente leitura, sanitizado e valida os contratos pós-migration", async () => {
  const [preflight, validation] = await Promise.all([
    read("supabase/scripts/fase-3b1-0018-preflight-read-only.sql"),
    read("supabase/scripts/fase-3b1-0018-post-validation-read-only.sql"),
  ]);
  for (const source of [preflight, validation]) {
    assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE)\b/i);
  }
  assert.match(preflight, /legacy_identity_columns_remaining/);
  assert.match(preflight, /object_conflicts/);
  assert.match(preflight, /acceptance_actor_source/);
  assert.match(preflight, /SUPABASE_SSR_VERIFIED_SESSION/);
  assert.match(preflight, /service_role_does_not_define_end_user_identity/);
  assert.match(preflight, /READY_FOR_0018_REVIEW/);
  assert.match(validation, /public_application_read_access/);
  assert.match(validation, /public_invitation_read_access/);
  assert.match(validation, /HASH_ONLY/);
  assert.match(validation, /post_migration_status/);
});

test("onboarding exige sessão, convite e destinatário correspondente", async () => {
  const [route, page, signup, migration] = await Promise.all([read("app/api/onboarding/agency/route.ts"), read("app/onboarding/agencia/page.tsx"), read("app/cadastro/page.tsx"), read("supabase/migrations/0018_agency_onboarding.sql")]);
  assert.match(route, /requireSupabaseUser/);
  assert.match(route, /inspectAgencyInvitation/);
  assert.match(migration, /invitation\.destination_email <> owner_email/);
  assert.match(page, /window\.crypto\.randomUUID/);
  assert.doesNotMatch(page, /SELF_SERVICE_PLAN|localStorage|sessionStorage/);
  assert.match(signup, /safeAuthRedirect\(searchParams\.get\("callbackUrl"\)\)/);
});
