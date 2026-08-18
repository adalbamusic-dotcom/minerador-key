import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ids = {
  brandA: "11111111-1111-4111-8111-111111111111",
  brandB: "22222222-2222-4222-8222-222222222222",
  agencyA: "33333333-3333-4333-8333-333333333333",
  agencyB: "44444444-4444-4444-8444-444444444444",
  ownerA: "55555555-5555-4555-8555-555555555555",
  ownerAgencyA: "66666666-6666-4666-8666-666666666666",
  collaboratorA: "77777777-7777-4777-8777-777777777777",
  other: "88888888-8888-4888-888888888888",
  admin: "99999999-9999-4999-8999-999999999999",
};

function fixtureAccess(input: { ownerUserId: string; actorUserId: string; membership?: { userId: string; status: string } | null; isPlatformAdmin?: boolean }) {
  if (input.ownerUserId === input.actorUserId) return "owner";
  if (input.membership?.userId === input.actorUserId && input.membership.status === "active") return "member";
  if (input.isPlatformAdmin) return "denied_platform_admin";
  return "denied";
}

function fixtureStrictRef(ref: string, expectedSlug: string, expectedId: string) {
  const delimiter = ref.lastIndexOf("--");
  if (delimiter <= 0) return "invalid";
  const slug = ref.slice(0, delimiter);
  const id = ref.slice(delimiter + 2);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return "invalid";
  return slug === expectedSlug && id === expectedId ? "resolved" : "mismatch";
}

test("fixtures cobrem brandRef/agencyRef estritos e isolamento de owner, membership e Admin", () => {
  assert.equal(fixtureStrictRef(`marca-agil--${ids.brandA}`, "marca-agil", ids.brandA), "resolved");
  assert.equal(fixtureStrictRef(`outra-marca--${ids.brandA}`, "marca-agil", ids.brandA), "mismatch");
  assert.equal(fixtureStrictRef("marca-agil", "marca-agil", ids.brandA), "invalid");
  assert.equal(fixtureStrictRef(`agencia-norte--${ids.agencyA}`, "agencia-norte", ids.agencyA), "resolved");
  assert.equal(fixtureStrictRef(`agencia-errada--${ids.agencyA}`, "agencia-norte", ids.agencyA), "mismatch");
  assert.equal(fixtureAccess({ ownerUserId: ids.ownerA, actorUserId: ids.ownerA }), "owner");
  assert.equal(fixtureAccess({ ownerUserId: ids.ownerA, actorUserId: ids.collaboratorA, membership: { userId: ids.collaboratorA, status: "active" } }), "member");
  assert.equal(fixtureAccess({ ownerUserId: ids.ownerA, actorUserId: ids.other, membership: { userId: ids.other, status: "suspended" } }), "denied");
  assert.equal(fixtureAccess({ ownerUserId: ids.ownerA, actorUserId: ids.admin, isPlatformAdmin: true }), "denied_platform_admin");
});

test("contratos novos implementam as decisões cobertas pelas fixtures", async () => {
  const [core, agencyRouting] = await Promise.all([
    readFile(new URL("../lib/tenant/canonical-authorization.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/agency-routing.ts", import.meta.url), "utf8"),
  ]);
  assert.match(core, /export async function resolveStrictBrandRef/);
  assert.match(core, /normalizeBrandSlug\(brand\.name\) !== parsed\.brandSlug/);
  assert.match(core, /export async function requireBrandEditorialAccess/);
  assert.match(core, /input\.brand\.ownerUserId === input\.actorUserId/);
  assert.match(core, /membership\.status === "active"/);
  assert.match(core, /export async function resolveStrictAgencyRef/);
  assert.match(core, /export async function requireAgencyOperationalAccess/);
  assert.match(core, /export async function resolveExactlyOneActiveAgencyForBrand/);
  assert.doesNotMatch(core, /email|user_key|ADMIN_EMAIL|getServerSession|next-auth|access_token|refresh_token/i);
  assert.match(agencyRouting, /export function parseAgencyRef/);
  assert.match(agencyRouting, /lastIndexOf\("--"\)/);
});

test("migration 0015 é sucessora, aditiva, UUID-only e não concede editorial a Admin global", async () => {
  const source = await readFile(new URL("../supabase/migrations/0015_canonical_identity_authorization_foundation.sql", import.meta.url), "utf8");
  const executable = source.replace(/^--.*$/gm, "").replace(/'[^']*'/g, "");
  assert.match(source, /^-- PREPARAÇÃO LOCAL[\s\S]*^BEGIN;/m);
  assert.match(source, /ADD COLUMN IF NOT EXISTS owner_user_id uuid/);
  assert.doesNotMatch(source, /ADD COLUMN IF NOT EXISTS user_id uuid/);
  assert.match(source, /member_user_id/);
  assert.match(source, /canonical_role IN \('agency_admin', 'agency_member'\)/);
  assert.match(source, /uq_agency_brands_active_brand_0014 ausente/);
  assert.doesNotMatch(source, /uq_agency_brands_active_brand_0015/);
  assert.match(source, /CANONICAL_0015_OWNER_DECISION_REQUIRED/);
  assert.match(source, /CANONICAL_0015_BLOCKED: agência sem owner não possui candidato agency_admin ativo/);
  assert.match(source, /CANONICAL_0015_BLOCKED: agência sem owner possui múltiplos candidatos agency_admin/);
  assert.doesNotMatch(source, /SET owner_user_id = am\.user_id/);
  assert.match(source, /canonical_can_access_brand/);
  assert.match(source, /canonical_can_access_agency/);
  assert.match(source, /bm\.member_user_id = auth\.uid\(\)/);
  assert.doesNotMatch(source, /bm\.user_id = auth\.uid\(\)/);
  assert.doesNotMatch(executable, /auth\.jwt\(\).*email|user_key|ADMIN_EMAIL|is_global_admin\(\)/i);
  assert.doesNotMatch(source, /\bDROP\s+(?:TABLE|COLUMN|POLICY|FUNCTION)|\bDELETE\s+FROM/i);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.canonical_can_access_brand\(uuid\) FROM PUBLIC, anon/);
  assert.match(source, /COMMIT;\s*$/);
});

test("SDD fixa member_user_id e documenta o ciclo temporário de canonical_role", async () => {
  const sdd = await readFile(new URL("../docs/compartilhado/sdd-geracao-canonica-identidade-tenant.md", import.meta.url), "utf8");
  assert.match(sdd, /Aprovada para implementação controlada e aplicação manual da 0015/);
  assert.match(sdd, /member_user_id` é a única coluna UUID canônica/);
  assert.match(sdd, /brand_memberships\.user_id.*foi rejeitada/);
  assert.match(sdd, /`canonical_role` é uma coluna de transição/);
  assert.match(sdd, /nome definitivo no schema final é `agency_memberships\.role`/);
  assert.match(sdd, /mesmo único candidato ainda não aprovado/);
});

test("scripts de preflight e validação 0015 permanecem somente leitura", async () => {
  const [preflight, validation] = await Promise.all([
    readFile(new URL("../supabase/scripts/canonical-0015-agency-owner-preflight-read-only.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/scripts/canonical-0015-post-migration-validation.sql", import.meta.url), "utf8"),
  ]);
  for (const source of [preflight, validation]) {
    assert.match(source, /SOMENTE LEITURA/);
    assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|BEGIN|COMMIT)\b/i);
  }
  assert.match(preflight, /BLOCKED_HUMAN_OWNER_DECISION_REQUIRED/);
  assert.match(preflight, /uq_agency_brands_active_brand_0014/);
  assert.match(validation, /UNEXPECTED_COMPETING_UUID_COLUMN/);
  assert.match(validation, /MISSING_NOT_MIGRATED/);
  assert.doesNotMatch(validation, /WHERE owner_user_id IS NULL/);
  assert.match(validation, /member_user_id = auth\.uid\(\)/);
});

test("adaptador server-side usa sessão Supabase e não lê e-mail ou token operacional", async () => {
  const source = await readFile(new URL("../lib/server/canonical-authorization.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/);
  assert.match(source, /requireSupabaseUser/);
  assert.match(source, /requireCanonicalActorUserId/);
  assert.match(source, /auth\.admin\.getUserById\(actorUserId\)/);
  assert.match(source, /resolveStrictBrandRef/);
  assert.match(source, /resolveStrictAgencyRef/);
  assert.match(source, /requireCanonicalTenantModule/);
  assert.doesNotMatch(source, /ADMIN_EMAIL|user_key|\.email|access_token|refresh_token/i);
});

test("auditorias remotas toleram ledger e artefatos opcionais ausentes", async () => {
  const [ledger, integrity] = await Promise.all([
    readFile(new URL("../supabase/scripts/auditoria-geracao-canonica-ledger-read-only.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/scripts/auditoria-geracao-canonica-integridade-read-only.sql", import.meta.url), "utf8"),
  ]);
  assert.match(ledger, /LEDGER_RELATION_UNAVAILABLE/);
  assert.doesNotMatch(ledger, /FROM supabase_migrations\.schema_migrations/);
  assert.match(integrity, /MISSING_NOT_IN_SCOPE/);
  assert.doesNotMatch(integrity, /FROM public\.editorial_artifact_versions/);
});

test("parecer pré-0015 resume integridade e RLS sem escrita", async () => {
  const source = await readFile(new URL("../supabase/scripts/canonical-0015-pre-apply-verdict-read-only.sql", import.meta.url), "utf8");
  const executable = source.replace(/^--.*$/gm, "").replace(/'[^']*'/g, "");
  assert.match(source, /current_rls_and_grants/);
  assert.match(source, /owner_membership_conflicts/);
  assert.match(source, /unsafe_security_definer_details/);
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|BEGIN|COMMIT)\b/i);
});

test("parecer pós-0015 resume schema, dados, índice e funções sem escrita", async () => {
  const source = await readFile(new URL("../supabase/scripts/canonical-0015-post-apply-verdict-read-only.sql", import.meta.url), "utf8");
  const executable = source.replace(/^--.*$/gm, "").replace(/'[^']*'/g, "");
  assert.match(source, /post_migration_validation/);
  assert.match(source, /canonical_function_contract_failures/);
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|BEGIN|COMMIT)\b/i);
});
