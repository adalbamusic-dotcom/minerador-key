import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError } from "@/lib/server/authz";
import { buildAgencyRef } from "@/lib/agency-routing";

const agencyStatuses = ["active", "suspended", "inactive"] as const;
const membershipStatuses = ["active", "suspended", "removed"] as const;
const brandLinkStatuses = ["active", "inactive", "removed"] as const;
const agencyRoles = ["agency_admin", "agency_member"] as const;

export type AdminAgencyStatus = typeof agencyStatuses[number];
export type AdminAgencyMembershipStatus = typeof membershipStatuses[number];
export type AdminAgencyBrandStatus = typeof brandLinkStatuses[number];
export type AdminAgencyRole = typeof agencyRoles[number];

export type AgencyAdminUser = { id: string; email: string; name: string | null };
export type AgencyAdminBrand = { id: string; name: string; brandRef: string; activeAgencyId: string | null };
export type AgencyAdminMembership = { id: string; agencyId: string; userId: string; role: AdminAgencyRole; status: AdminAgencyMembershipStatus; user: AgencyAdminUser | null };
export type AgencyAdminBrandLink = { id: string; agencyId: string; brandId: string; status: AdminAgencyBrandStatus; brand: AgencyAdminBrand | null };
export type AgencyAdminAccessPeriod = { planCode: string; origin: string; startsAt: string; endsAt: string | null; status: string };
export type AgencyAdminRecord = {
  id: string;
  name: string;
  slug: string;
  agencyRef: string;
  status: AdminAgencyStatus;
  accessStatus: "READY" | "PENDING" | "REQUIRES_ATTENTION";
  ownerIdentityStatus: "IDENTITY_FOUND" | "CONFIRMATION_PENDING" | "IDENTITY_NOT_FOUND";
  createdAt: string;
  accessPeriod: AgencyAdminAccessPeriod | null;
  memberships: AgencyAdminMembership[];
  brandLinks: AgencyAdminBrandLink[];
};

export class AgencyAdminError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AgencyAdminError";
    this.status = status;
    this.code = code;
  }
}

type GlobalAdminProfile = { isAdmin: boolean; userId?: string };

function assertGlobalAdmin(profile: GlobalAdminProfile) {
  if (!profile.isAdmin) throw new AuthzError(403, "Apenas administradores globais podem administrar agências.");
}

function valueFrom<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T[number];
  throw new AgencyAdminError(400, "AGENCY_ADMIN_INVALID_INPUT", `${field} inválido.`);
}

function requiredId(value: unknown, field: string) {
  if (typeof value !== "string" || !isTenantId(value)) throw new AgencyAdminError(400, "AGENCY_ADMIN_INVALID_INPUT", `${field} inválido.`);
  return value;
}

function missingOnboardingSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "42P01" || code === "PGRST205" || /agency_onboardings.*not found|relation .*agency_onboardings.*does not exist/i.test(message);
}

export function normalizeAgencySlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/(^-|-$)/g, "");
}

function requireAgencyName(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 160) {
    throw new AgencyAdminError(400, "AGENCY_ADMIN_INVALID_INPUT", "Informe um nome de agência entre 1 e 160 caracteres.");
  }
  return value.trim();
}

type ServiceClient = SupabaseClient;

async function requireExistingAuthUser(client: ServiceClient, userId: string) {
  const response = await client.auth.admin.getUserById(userId);
  const user = response.data?.user;
  if (response.error || !user?.id || !user.email) throw new AgencyAdminError(404, "AGENCY_ADMIN_USER_NOT_FOUND", "O usuário selecionado não está mais disponível.");
  return user;
}

async function requireExistingBrands(client: ServiceClient, brandIds: string[]) {
  if (!brandIds.length) return;
  const response = await client.from("marcas").select("id").in("id", brandIds);
  if (response.error) throw new AgencyAdminError(503, "AGENCY_ADMIN_BRAND_LOOKUP_FAILED", "Não foi possível validar as marcas selecionadas.");
  if ((response.data || []).length !== brandIds.length) throw new AgencyAdminError(404, "AGENCY_ADMIN_BRAND_NOT_FOUND", "Uma ou mais marcas selecionadas não existem.");
}

async function assertNoActiveBrandConflict(client: ServiceClient, brandIds: string[], agencyId?: string) {
  if (!brandIds.length) return;
  const response = await client.from("agency_brands").select("agency_id,brand_id,agencies(name)").in("brand_id", brandIds).eq("status", "active");
  if (response.error) throw new AgencyAdminError(503, "AGENCY_ADMIN_BRAND_LOOKUP_FAILED", "Não foi possível validar vínculos de marca.");
  const conflict = (response.data || []).find((row: { agency_id: string }) => row.agency_id !== agencyId);
  if (conflict) throw new AgencyAdminError(409, "AGENCY_ADMIN_BRAND_CONFLICT", "Uma das marcas já possui vínculo operacional ativo com outra agência.");
}

export async function listAdminAgencies(input: { client: ServiceClient; profile: GlobalAdminProfile }): Promise<{ agencies: AgencyAdminRecord[]; brands: AgencyAdminBrand[] }> {
  assertGlobalAdmin(input.profile);
  const [agenciesResult, membershipsResult, linksResult, brandsResult, accessPeriodsResult] = await Promise.all([
    input.client.from("agencies").select("id,name,slug,status,owner_user_id,created_at").order("name"),
    input.client.from("agency_memberships").select("id,agency_id,user_id,role,status"),
    input.client.from("agency_brands").select("id,agency_id,brand_id,status"),
    input.client.from("marcas").select("id,nome").order("nome"),
    input.client.from("agency_access_periods").select("agency_id,plan_code,origin,starts_at,ends_at,status,created_at").eq("status", "active").order("starts_at", { ascending: false }),
  ]);
  const onboardingsResult = await input.client.from("agency_onboardings").select("agency_id,owner_user_id");
  if (onboardingsResult.error && !missingOnboardingSchema(onboardingsResult.error)) throw new AgencyAdminError(503, "AGENCY_ADMIN_LIST_FAILED", "NÃ£o foi possÃ­vel carregar o estado de acesso das agÃªncias.");
  const onboardingRows = onboardingsResult.error ? [] : (onboardingsResult.data || []);
  const onboardingByAgency = new Map<string, { owner_user_id: string }>((onboardingRows as Array<{ agency_id: string; owner_user_id: string }>).map((row) => [row.agency_id, row]));
  for (const result of [agenciesResult, membershipsResult, linksResult, brandsResult, accessPeriodsResult]) if (result.error) throw new AgencyAdminError(503, "AGENCY_ADMIN_LIST_FAILED", "Não foi possível carregar a administração de agências.");

  const membershipRows = membershipsResult.data || [];
  const userIds = [...new Set(membershipRows.map(row => row.user_id).filter((value): value is string => typeof value === "string"))];
  const users = new Map<string, AgencyAdminUser>();
  for (const userId of userIds) {
    const result = await input.client.auth.admin.getUserById(userId);
    if (!result.error && result.data.user?.email) users.set(userId, { id: userId, email: result.data.user.email, name: typeof result.data.user.user_metadata?.full_name === "string" ? result.data.user.user_metadata.full_name : null });
  }
  const ownerIdentityStatuses = new Map<string, AgencyAdminRecord["ownerIdentityStatus"]>();
  const ownerIds = [...new Set((agenciesResult.data || []).map((row) => row.owner_user_id).filter((value): value is string => typeof value === "string"))];
  for (const ownerId of ownerIds) {
    const result = await input.client.auth.admin.getUserById(ownerId);
    ownerIdentityStatuses.set(ownerId, result.error || !result.data.user?.id ? "IDENTITY_NOT_FOUND" : result.data.user.email_confirmed_at ? "IDENTITY_FOUND" : "CONFIRMATION_PENDING");
  }
  const activeByBrand = new Map<string, string>();
  for (const link of linksResult.data || []) if (link.status === "active") activeByBrand.set(link.brand_id, link.agency_id);
  const accessPeriodsByAgency = new Map<string, AgencyAdminAccessPeriod>();
  for (const row of accessPeriodsResult.data || []) {
    if (!accessPeriodsByAgency.has(row.agency_id)) {
      accessPeriodsByAgency.set(row.agency_id, { planCode: row.plan_code, origin: row.origin, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status });
    }
  }
  const brands = (brandsResult.data || []).map(brand => ({ id: brand.id, name: brand.nome, brandRef: `${normalizeAgencySlug(brand.nome)}--${brand.id}`, activeAgencyId: activeByBrand.get(brand.id) || null }));
  const brandsById = new Map(brands.map(brand => [brand.id, brand]));
  const membershipsByAgency = new Map<string, AgencyAdminMembership[]>();
  for (const row of membershipRows) {
    const role = valueFrom(row.role, agencyRoles, "Papel de membership");
    const status = valueFrom(row.status, membershipStatuses, "Status de membership");
    const list = membershipsByAgency.get(row.agency_id) || [];
    list.push({ id: row.id, agencyId: row.agency_id, userId: row.user_id, role, status, user: users.get(row.user_id) || null });
    membershipsByAgency.set(row.agency_id, list);
  }
  const linksByAgency = new Map<string, AgencyAdminBrandLink[]>();
  for (const row of linksResult.data || []) {
    const status = valueFrom(row.status, brandLinkStatuses, "Status de vínculo");
    const list = linksByAgency.get(row.agency_id) || [];
    list.push({ id: row.id, agencyId: row.agency_id, brandId: row.brand_id, status, brand: brandsById.get(row.brand_id) || null });
    linksByAgency.set(row.agency_id, list);
  }
  return { agencies: (agenciesResult.data || []).map(row => {
    const status = valueFrom(row.status, agencyStatuses, "Status de agência");
    const ownerIdentityStatus = ownerIdentityStatuses.get(row.owner_user_id) || "IDENTITY_NOT_FOUND";
    const onboarding = onboardingByAgency.get(row.id);
    const accessStatus = status !== "active" ? "PENDING" : onboarding && onboarding.owner_user_id === row.owner_user_id && ownerIdentityStatus === "IDENTITY_FOUND" ? "READY" : "REQUIRES_ATTENTION";
    return { id: row.id, name: row.name, slug: row.slug, agencyRef: buildAgencyRef(row.name, row.id), status, accessStatus, ownerIdentityStatus, createdAt: row.created_at, accessPeriod: accessPeriodsByAgency.get(row.id) || null, memberships: membershipsByAgency.get(row.id) || [], brandLinks: linksByAgency.get(row.id) || [] };
  }), brands };
}

export async function updateAdminAgency(input: { client: ServiceClient; profile: GlobalAdminProfile; agencyId: unknown; name?: unknown; status?: unknown }) {
  assertGlobalAdmin(input.profile);
  const agencyId = requiredId(input.agencyId, "Agência");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = requireAgencyName(input.name);
  if (input.status !== undefined) patch.status = valueFrom(input.status, agencyStatuses, "Status de agência");
  const result = await input.client.from("agencies").update(patch).eq("id", agencyId).select("id").maybeSingle();
  if (result.error || !result.data) throw new AgencyAdminError(404, "AGENCY_ADMIN_NOT_FOUND", "A agência não foi encontrada.");
}

export async function upsertAdminAgencyMembership(input: { client: ServiceClient; profile: GlobalAdminProfile; agencyId: unknown; userId: unknown; role?: unknown; status?: unknown }) {
  assertGlobalAdmin(input.profile);
  const agencyId = requiredId(input.agencyId, "Agência");
  const userId = requiredId(input.userId, "Usuário");
  await requireExistingAuthUser(input.client, userId);
  const role = input.role === undefined ? "agency_admin" : valueFrom(input.role, agencyRoles, "Papel de membership");
  const status = input.status === undefined ? "active" : valueFrom(input.status, membershipStatuses, "Status de membership");
  if (!input.profile.userId) throw new AgencyAdminError(503, "AGENCY_ADMIN_ACTOR_UNAVAILABLE", "A identidade administrativa não pôde ser confirmada.");
  const result = await input.client.rpc("canonical_upsert_agency_membership", { p_actor_user_id: input.profile.userId, p_agency_id: agencyId, p_user_id: userId, p_role: role, p_status: status });
  if (result.error) throw new AgencyAdminError(409, "AGENCY_ADMIN_MEMBERSHIP_SAVE_FAILED", "Não foi possível salvar o membership da agência.");
}

export async function setAdminAgencyMembershipStatus(input: { client: ServiceClient; profile: GlobalAdminProfile; membershipId: unknown; status: unknown }) {
  assertGlobalAdmin(input.profile);
  const membershipId = requiredId(input.membershipId, "Membership");
  const status = valueFrom(input.status, membershipStatuses, "Status de membership");
  if (!input.profile.userId) throw new AgencyAdminError(503, "AGENCY_ADMIN_ACTOR_UNAVAILABLE", "A identidade administrativa não pôde ser confirmada.");
  const result = await input.client.rpc("canonical_set_agency_membership_status", { p_actor_user_id: input.profile.userId, p_membership_id: membershipId, p_status: status });
  if (result.error || !result.data) throw new AgencyAdminError(404, "AGENCY_ADMIN_MEMBERSHIP_NOT_FOUND", "O membership não foi encontrado.");
}

export async function upsertAdminAgencyBrand(input: { client: ServiceClient; profile: GlobalAdminProfile; agencyId: unknown; brandId: unknown }) {
  assertGlobalAdmin(input.profile);
  const agencyId = requiredId(input.agencyId, "Agência");
  const brandId = requiredId(input.brandId, "Marca");
  await requireExistingBrands(input.client, [brandId]);
  await assertNoActiveBrandConflict(input.client, [brandId], agencyId);
  if (!input.profile.userId) throw new AgencyAdminError(503, "AGENCY_ADMIN_ACTOR_UNAVAILABLE", "A identidade administrativa não pôde ser confirmada.");
  const result = await input.client.rpc("canonical_set_agency_brand_link", { p_actor_user_id: input.profile.userId, p_agency_id: agencyId, p_brand_id: brandId, p_status: "active" });
  if (result.error) throw new AgencyAdminError(409, "AGENCY_ADMIN_BRAND_LINK_FAILED", "Não foi possível vincular a marca à agência.");
}

export async function setAdminAgencyBrandStatus(input: { client: ServiceClient; profile: GlobalAdminProfile; linkId: unknown; status: unknown }) {
  assertGlobalAdmin(input.profile);
  const linkId = requiredId(input.linkId, "Vínculo");
  const status = valueFrom(input.status, brandLinkStatuses, "Status de vínculo");
  const link = await input.client.from("agency_brands").select("agency_id,brand_id").eq("id", linkId).maybeSingle();
  if (link.error || !link.data) throw new AgencyAdminError(404, "AGENCY_ADMIN_BRAND_LINK_NOT_FOUND", "O vínculo de marca não foi encontrado.");
  if (!input.profile.userId) throw new AgencyAdminError(503, "AGENCY_ADMIN_ACTOR_UNAVAILABLE", "A identidade administrativa não pôde ser confirmada.");
  const result = await input.client.rpc("canonical_set_agency_brand_link", { p_actor_user_id: input.profile.userId, p_agency_id: link.data.agency_id, p_brand_id: link.data.brand_id, p_status: status });
  if (result.error || !result.data) throw new AgencyAdminError(404, "AGENCY_ADMIN_BRAND_LINK_NOT_FOUND", "O vínculo de marca não foi encontrado.");
}
