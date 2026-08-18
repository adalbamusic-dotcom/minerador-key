import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("001 migration guarda owner e member na mesma exclusividade transacional", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /uq_agencies_active_owner_0021/);
  assert.match(sql, /uq_agency_memberships_active_user_0021/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER canonical_0021_agencies_actor_guard/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER canonical_0021_memberships_actor_guard/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /pg_advisory_xact_lock/);
});

test("002 migration verifica a união owner mais membership", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /CANONICAL_0021_ACTOR_MULTIPLE_AGENCIES/);
  assert.match(sql, /count\(DISTINCT agency_id\) > 1/);
  assert.match(sql, /UNION/);
});

test("003 mesma Agency pode ter vários members", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /UNIQUE \(agency_id, user_id\)/.test(sql) ? /UNIQUE \(agency_id, user_id\)/ : /ON CONFLICT \(agency_id, user_id\)/);
});

test("004 Admin global pode possuir uma Agency, mas não recebe vínculo por efeito colateral", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /canonical_actor_is_global_admin/);
  assert.doesNotMatch(sql, /CANONICAL_0021_GLOBAL_ADMIN_AGENCY_ASSIGNMENT/);
  assert.doesNotMatch(sql, /Admin global possui vínculo operacional explícito/);
});

test("004a exclusividade conjunta não exclui Admin global e deduplica a Agency", async () => {
  const migration = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  const preflight = await read("supabase/scripts/agency-authorization-preflight-read-only.sql");
  assert.match(migration, /count\(DISTINCT agency_id\) > 1/);
  assert.match(migration, /UNION/);
  assert.match(preflight, /effective_multi_agency_actors/);
  assert.match(preflight, /global_admin_with_single_operational_agency/);
  assert.doesNotMatch(preflight, /common_effective_multi_agency_actors/);
});

test("004b contexto global não vira fallback operacional", async () => {
  const server = await read("lib/server/canonical-authorization.ts");
  const contexts = await read("app/api/contexts/route.ts");
  assert.match(server, /const operationalAgency = agencies\.length === 1 \? agencies\[0\] : null/);
  assert.match(server, /operationalAgency, agency: operationalAgency/);
  assert.match(contexts, /operationalAgency: agencies\.operationalAgency/);
});

test("005 onboarding usa o mesmo guard por trigger", async () => {
  const onboarding = await read("supabase/migrations/0018_agency_onboarding.sql");
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(onboarding, /INSERT INTO public\.agencies/);
  assert.match(sql, /canonical_0021_agencies_actor_guard/);
});

test("006 Agency-Brand permanece vínculo separado", async () => {
  const source = await read("lib/server/canonical-authorization.ts");
  assert.match(source, /findActiveAgencyIdsByBrandId/);
  assert.match(source, /agency_member/);
  assert.doesNotMatch(source, /insert\([\s\S]*brand_memberships/);
});

test("007 Brand sem vínculo não tem fallback", async () => {
  const source = await read("lib/server/tenant-context.ts");
  assert.match(source, /agency_brands/);
  assert.match(source, /Acesso negado a esta marca/);
  assert.doesNotMatch(source, /owner.*fallback|slug.*fallback|nome.*fallback/i);
});

test("008 Agency owner herda capabilities, sujeito à restrição", async () => {
  const source = await read("lib/server/tenant-context.ts");
  assert.match(source, /agency_owner/);
  assert.match(source, /restrictedCapabilities/);
  assert.match(source, /agencyPermissions/);
});

test("009 member precisa de grant explícito", async () => {
  const source = await read("lib/server/tenant-context.ts");
  assert.match(source, /agency_membership_capabilities/);
  assert.match(source, /granted/);
});

test("010 restrição Brand vence a capacidade herdada", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /canonical_actor_has_brand_restriction/);
  assert.match(sql, /NOT public\.canonical_actor_has_brand_restriction/);
});

test("011 remoção da restrição permite restauração sem apagar histórico", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /status = 'revoked'/);
  assert.match(sql, /revoked_at/);
  assert.match(sql, /canonical_revoke_brand_agency_capability_restriction/);
});

test("012 capability catalog não aceita código livre do browser", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /REFERENCES public\.canonical_capabilities\(code\)/);
  assert.match(sql, /canonical_0021_CAPABILITY_INVALID|CANONICAL_0021_CAPABILITY_INVALID/);
});

test("013 colaborador direto continua no caminho Brand", async () => {
  const source = await read("lib/server/editorial-authorization.ts");
  assert.match(source, /brand_memberships/);
  assert.match(source, /brand_member_permissions/);
  assert.match(source, /BRAND_ACCESS_DENIED/);
});

test("014 colaborador direto não recebe Agency", async () => {
  const source = await read("lib/server/editorial-authorization.ts");
  assert.doesNotMatch(source, /insert\([\s\S]*agency_memberships/);
});

test("015 Agency não troca brandId editorial", async () => {
  const context = await read("lib/server/tenant-context.ts");
  assert.match(context, /brandId: input\.brandId/);
  assert.match(context, /brandId diverge do tenant da rota/);
});

test("016 Admin global possui contrato global próprio", async () => {
  const context = await read("lib/server/canonical-authorization.ts");
  assert.match(context, /requireCanonicalPlatformAdmin/);
  assert.match(context, /isPlatformAdmin/);
});

test("016a role global não concede bypass de Brand no SQL canônico", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  const manageBrand = sql.match(/CREATE OR REPLACE FUNCTION public\.canonical_can_manage_brand[\s\S]*?\$\$;/)?.[0] || "";
  assert.doesNotMatch(manageBrand, /canonical_actor_is_global_admin/);
  assert.match(manageBrand, /canonical_actor_can_manage_brand/);
  assert.match(manageBrand, /canonical_actor_can_use_brand_action/);
});

test("017 RLS impede escrita direta autenticada nas estruturas novas", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /DROP POLICY IF EXISTS agency_0014_memberships_insert/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.canonical_capabilities/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.canonical_upsert_agency_membership/);
});

test("018 RLS mantém anon sem acesso", async () => {
  const sql = await read("supabase/migrations/0021_canonical_agency_brand_authorization.sql");
  assert.match(sql, /REVOKE ALL ON TABLE public\.canonical_capabilities, public\.agency_membership_capabilities, public\.brand_agency_capability_restrictions FROM PUBLIC, anon/);
});

test("019 preflight é somente leitura", async () => {
  const sql = await read("supabase/scripts/agency-authorization-preflight-read-only.sql");
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);
});

test("020 pós-verificação é somente leitura e rollback permanece separado", async () => {
  const verification = await read("supabase/scripts/agency-authorization-0021-post-verification-read-only.sql");
  const rollback = await read("supabase/scripts/agency-authorization-0021-rollback.sql");
  assert.doesNotMatch(verification, /\b(?:INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX|FUNCTION|POLICY)|TRUNCATE\s+TABLE)\b/i);
  assert.match(verification, /effective_multi_agency_actors/);
  assert.match(verification, /global_admin_with_single_operational_agency/);
  assert.match(rollback, /Rollback guardado/);
});
