import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/0014_agency_foundation.sql", import.meta.url);
const contextPath = new URL("../lib/server/agency-context.ts", import.meta.url);
const googleAdsPath = new URL("../app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts", import.meta.url);
const dataForSeoPath = new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url);
const serperPath = new URL("../lib/radar/serper-provider-core.ts", import.meta.url);

type Link = { agencyId: string; brandId: string; status: "active" | "inactive" | "removed" };
type Membership = { agencyId: string; userId: string; role: "agency_admin" | "operator" | "viewer"; status: "active" | "suspended" | "removed" };

function resolveFixture(input: { brandId: string; userId: string; links: Link[]; memberships: Membership[]; isGlobalAdmin?: boolean }) {
  const links = input.links.filter(link => link.brandId === input.brandId && link.status === "active");
  if (links.length !== 1) throw new Error(links.length ? "ambiguous_agency" : "agency_missing");
  if (input.isGlobalAdmin) return { agencyId: links[0].agencyId, role: "platform_admin", membershipId: null };
  const membership = input.memberships.find(item => item.agencyId === links[0].agencyId && item.userId === input.userId && item.status === "active");
  if (!membership) throw new Error("agency_membership_required");
  return { agencyId: links[0].agencyId, role: membership.role, membershipId: `${membership.agencyId}:${membership.userId}` };
}

test("migration cria fundação aditiva e proíbe duas agências operacionais ativas por marca", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  for (const table of ["agencies", "agency_memberships", "agency_brands"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS uq_agency_brands_active_brand_0014[\s\S]*WHERE status = 'active'/);
  assert.match(sql, /REFERENCES public\.marcas\(id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /ALTER TABLE public\.(?:marcas|brand_memberships|keywords_kgr)/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\s+INTO?\s+public\.(?:marcas|brand_memberships|keywords_kgr)/i);
});

test("RLS de agência exige membership explícita e não usa owner, slug ou e-mail como fallback", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of ["agencies", "agency_memberships", "agency_brands"]) assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_access_agency/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_manage_agency/);
  assert.match(sql, /membership\.user_id = auth\.uid\(\)/);
  assert.match(sql, /membership\.role = 'agency_admin'/);
  assert.doesNotMatch(sql, /owner_user_id|auth\.jwt\(\).*email|\bslug\s*=/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.agencies, public\.agency_memberships, public\.agency_brands FROM PUBLIC, anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.can_access_agency\(uuid\) FROM anon/);
});

test("contratos server-side compõem acesso à marca e membership da agência sem materializar admin global", async () => {
  const source = await readFile(contextPath, "utf8");
  for (const symbol of ["resolveAgencyForBrand", "requireAgencyMembership", "requireAgencyAccessToBrand", "isGlobalAdmin"]) assert.match(source, new RegExp(`export (?:async )?function ${symbol}`));
  assert.match(source, /requireTenantPermission\(/);
  assert.match(source, /requireAgencyMembership\(\{ agencyId: agency\.agencyId, profile \}\)/);
  assert.match(source, /membershipId: null, role: "platform_admin", isGlobalAdmin: true/);
  assert.doesNotMatch(source, /ownerUserId[\s\S]*agencyId|brandRef[\s\S]*agencyId|profile\.marcaId[\s\S]*agencyId/);
});

test("fixtures preservam isolamento entre agências, marcas e papéis", () => {
  const links: Link[] = [
    { agencyId: "agency-a", brandId: "brand-a", status: "active" },
    { agencyId: "agency-a", brandId: "brand-b", status: "active" },
    { agencyId: "agency-b", brandId: "brand-c", status: "active" },
  ];
  const memberships: Membership[] = [
    { agencyId: "agency-a", userId: "member-a", role: "agency_admin", status: "active" },
    { agencyId: "agency-b", userId: "member-b", role: "operator", status: "active" },
    { agencyId: "agency-a", userId: "suspended", role: "viewer", status: "suspended" },
  ];
  assert.equal(resolveFixture({ brandId: "brand-a", userId: "member-a", links, memberships }).agencyId, "agency-a");
  assert.equal(resolveFixture({ brandId: "brand-b", userId: "member-a", links, memberships }).agencyId, "agency-a");
  assert.throws(() => resolveFixture({ brandId: "brand-a", userId: "member-b", links, memberships }), /agency_membership_required/);
  assert.throws(() => resolveFixture({ brandId: "brand-a", userId: "suspended", links, memberships }), /agency_membership_required/);
  assert.equal(resolveFixture({ brandId: "brand-c", userId: "platform", links, memberships, isGlobalAdmin: true }).membershipId, null);
  assert.throws(() => resolveFixture({ brandId: "brand-a", userId: "member-a", links: [...links, { agencyId: "agency-b", brandId: "brand-a", status: "active" }], memberships }), /ambiguous_agency/);
});

test("consumidores de providers permanecem inalterados pela fundação", async () => {
  const [googleAds, dataForSeo, serper] = await Promise.all([readFile(googleAdsPath, "utf8"), readFile(dataForSeoPath, "utf8"), readFile(serperPath, "utf8")]);
  assert.doesNotMatch(googleAds, /minerador_google_ads_connections/);
  assert.match(googleAds, /resolveGoogleAdsCanonicalContext/);
  assert.match(dataForSeo, /measureDataForSeoAllintitle/);
  assert.match(serper, /SERPER_API_KEY/);
  assert.doesNotMatch(googleAds, /agency_brands|resolveAgencyForBrand/);
  assert.doesNotMatch(dataForSeo, /agency_brands|resolveAgencyForBrand/);
  assert.doesNotMatch(serper, /agency_brands|resolveAgencyForBrand/);
});
test("reexecução valida policies existentes e não as recria cegamente", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /FROM pg_catalog\.pg_policies/);
  assert.match(sql, /AGENCY_0014_POLICY_CONFLICT: agencies_select/);
  assert.match(sql, /AGENCY_0014_POLICY_CONFLICT: brands_delete/);
  assert.match(sql, /existing_policy\.roles <> ARRAY\['authenticated'\]::name\[\]/);
  assert.match(sql, /ELSE EXECUTE 'CREATE POLICY agency_0014_agencies_select/);
  assert.doesNotMatch(sql, /DROP POLICY/);
});
