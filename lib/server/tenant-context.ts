import "server-only";

import { AuthzError, requireCanonicalSessionProfile, type CanonicalSessionProfile } from "@/lib/server/authz";
import { TENANT_ID_PATTERN } from "@/lib/tenant-routing";

export const TENANT_MODULES = ["marca", "conta", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"] as const;
export type TenantModule = (typeof TENANT_MODULES)[number];
export type TenantRole = "owner" | "brand_admin" | "editor" | "reviewer" | "specialist" | "reader";

export interface TenantContext {
  brandId: string;
  /** Compatibility-only alias while consumers still use this name. */
  brandName: string;
  ownerUserId?: string;
  actorUserId: string;
  actorRole: TenantRole;
  permissions: string[];
  isGlobalAdmin: boolean;
  authorizationSource?: "brand_owner" | "brand_member" | "agency_owner" | "agency_member";
  agencyId?: string;
  restrictedCapabilities?: string[];
}

const allPermissions = TENANT_MODULES.flatMap(module => ["view", "comment", "create", "edit", "review", "approve", "export", "publish", "manage"].map(action => `${module}:${action}`));
const agencyModules = TENANT_MODULES.filter(module => module !== "conta");
const canonicalUnavailable = (error: { code?: string; message?: string } | null) => error?.code === "42P01" || error?.code === "42703" || /does not exist|column/i.test(error?.message || "");
const role = (value: string | null | undefined): TenantRole => value === "owner" || value === "brand_admin" || value === "editor" || value === "reviewer" || value === "specialist" ? value : "reader";
const agencyCapabilityForModule = (module: TenantModule) => module === "marca" ? "brand_data" : module;
const agencyPermissions = (capabilities: string[], restrictions: string[]) => {
  const granted = new Set(capabilities);
  const denied = new Set(restrictions);
  return agencyModules.flatMap(module => {
    const capability = agencyCapabilityForModule(module);
    if (!granted.has(capability) || denied.has(capability)) return [];
    return ["view", "comment", "create", "edit", "review", "approve", "export", "publish", "manage"].map(action => `${module}:${action}`);
  });
};

type Brand = { id: string; nome: string | null };
type CanonicalBrand = { owner_user_id: string | null; status: "active" | "suspended" | "inactive" | null };
type BrandMembership = { id: string; status: string; brand_roles?: { slug?: string } | { slug?: string }[] | null };

async function resolveAgencyBrandAccess(profile: CanonicalSessionProfile, brandId: string, baseContext: Omit<TenantContext, "actorRole" | "permissions" | "isGlobalAdmin">): Promise<TenantContext | null> {
  const links = await profile.supabase.from("agency_brands").select("agency_id").eq("brand_id", brandId).eq("status", "active");
  if (links.error) throw new AuthzError(503, "Nao foi possivel validar o vinculo Agency-Brand.");
  for (const link of links.data || []) {
    const agencyResult = await profile.supabase.from("agencies").select("id,status,owner_user_id").eq("id", link.agency_id).eq("status", "active").maybeSingle();
    if (agencyResult.error) throw new AuthzError(503, "Nao foi possivel validar a Agency operacional.");
    if (!agencyResult.data) continue;
    const isAgencyOwner = agencyResult.data.owner_user_id === profile.userId;
    const membershipResult = isAgencyOwner ? { data: null, error: null } : await profile.supabase.from("agency_memberships").select("id,role,status").eq("agency_id", link.agency_id).eq("user_id", profile.userId).maybeSingle();
    if (membershipResult.error) throw new AuthzError(503, "Nao foi possivel validar o membership da Agency.");
    const membership = membershipResult.data as { id: string; role: string; status: string } | null;
    if (!isAgencyOwner && (!membership || membership.status !== "active")) continue;

    const restrictions = await profile.supabase.from("brand_agency_capability_restrictions").select("capability").eq("brand_id", brandId).eq("agency_id", link.agency_id).eq("status", "active");
    if (restrictions.error) throw new AuthzError(503, "Nao foi possivel validar as restricoes da Brand.");
    const restrictedCapabilities = (restrictions.data || []).map(item => item.capability);
    let capabilities: string[];
    if (isAgencyOwner || membership?.role === "agency_admin") {
      capabilities = ["brand_data", "brand_collaborators", "brand_dna", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes", "activity", "notifications"];
    } else {
      const grants = await profile.supabase.from("agency_membership_capabilities").select("capability").eq("membership_id", membership!.id).eq("granted", true);
      if (grants.error) throw new AuthzError(503, "Nao foi possivel validar as capabilities da Agency.");
      capabilities = (grants.data || []).map(item => item.capability);
    }
    return {
      ...baseContext,
      actorRole: isAgencyOwner || membership?.role === "agency_admin" ? "brand_admin" : "reader",
      permissions: agencyPermissions(capabilities, restrictedCapabilities),
      isGlobalAdmin: false,
      authorizationSource: isAgencyOwner ? "agency_owner" : "agency_member",
      agencyId: link.agency_id,
      restrictedCapabilities,
    };
  }
  return null;
}

export async function resolveTenantContext(input: { brandId: string; actorUserId?: string; profile?: CanonicalSessionProfile }): Promise<TenantContext> {
  const profile = input.profile ?? await requireCanonicalSessionProfile();
  if (input.actorUserId && input.actorUserId !== profile.userId) throw new AuthzError(403, "actorUserId nao corresponde a sessao.");
  if (!TENANT_ID_PATTERN.test(input.brandId)) throw new AuthzError(404, "Tenant invalido.");

  const base = await profile.supabase.from("marcas").select("id,nome").eq("id", input.brandId).maybeSingle();
  if (base.error) throw new AuthzError(503, "Nao foi possivel validar a marca.");
  if (!base.data) throw new AuthzError(404, "Marca nao encontrada.");
  const brand = base.data as Brand;
  const canonicalResult = await profile.supabase.from("marcas").select("owner_user_id,status").eq("id", input.brandId).maybeSingle();
  const canonical = canonicalResult.error && canonicalUnavailable(canonicalResult.error) ? null : canonicalResult.data as CanonicalBrand | null;
  if (canonicalResult.error && !canonicalUnavailable(canonicalResult.error)) throw new AuthzError(503, "Nao foi possivel validar o estado da marca.");
  if (canonical?.status && canonical.status !== "active") throw new AuthzError(403, "Marca indisponivel para acesso.");

  const baseContext = { brandId: input.brandId, brandName: brand.nome || input.brandId, ownerUserId: canonical?.owner_user_id || undefined, actorUserId: profile.userId };
  if (canonical?.owner_user_id === profile.userId) return { ...baseContext, actorRole: "owner", permissions: allPermissions, isGlobalAdmin: false, authorizationSource: "brand_owner" };

  const canonicalMembership = await profile.supabase.from("brand_memberships").select("id,status,member_user_id,brand_roles(slug)").eq("marca_id", input.brandId).eq("member_user_id", profile.userId).maybeSingle();
  const membership = canonicalMembership.data as BrandMembership | null;
  if (canonicalMembership.error && !canonicalUnavailable(canonicalMembership.error)) throw new AuthzError(503, "Nao foi possivel validar o membership.");
  if (membership?.status === "active") {
    const permissions = await profile.supabase.from("brand_member_permissions").select("module,action").eq("membership_id", membership.id).eq("granted", true);
    if (permissions.error) throw new AuthzError(503, "Nao foi possivel validar permissoes.");
    const roleRelation = Array.isArray(membership.brand_roles) ? membership.brand_roles[0] : membership.brand_roles;
    return { ...baseContext, actorRole: role(roleRelation?.slug), permissions: (permissions.data || []).map(item => `${item.module}:${item.action}`), isGlobalAdmin: false, authorizationSource: "brand_member" };
  }

  const agencyContext = await resolveAgencyBrandAccess(profile, input.brandId, baseContext);
  if (agencyContext) return agencyContext;
  throw new AuthzError(403, "Acesso negado a esta marca.");
}

export function canAccessTenantModule(context: TenantContext, module: TenantModule) { return context.permissions.includes(`${module}:view`); }
export function assertRequestTenant(brandId: string, requestBrandId: unknown) { if (typeof requestBrandId !== "undefined" && requestBrandId !== brandId) throw new AuthzError(400, "brandId diverge do tenant da rota."); }

export async function requireTenantPermission(input: { brandId: string; actorUserId?: string; module: TenantModule; action: string; recordBrandId?: string | null; profile?: CanonicalSessionProfile }) {
  assertRequestTenant(input.brandId, input.recordBrandId);
  const context = await resolveTenantContext({ brandId: input.brandId, actorUserId: input.actorUserId, profile: input.profile });
  if (!context.isGlobalAdmin && !context.permissions.includes(`${input.module}:${input.action}`)) {
    const capability = agencyCapabilityForModule(input.module);
    const code = context.authorizationSource?.startsWith("agency") ? context.restrictedCapabilities?.includes(capability) ? "DENIED_BRAND_RESTRICTION" : "DENIED_AGENCY_PERMISSION" : "BRAND_ACCESS_DENIED";
    throw new AuthzError(403, `${code}: Permissao ${input.module}:${input.action} nao concedida.`);
  }
  return context;
}

export async function listAccessibleTenantIds(profile: CanonicalSessionProfile) {
  const ids = new Set<string>();
  const canonical = await profile.supabase.from("marcas").select("id").eq("owner_user_id", profile.userId);
  if (!canonical.error) for (const item of canonical.data || []) ids.add(item.id);
  const memberships = await profile.supabase.from("brand_memberships").select("marca_id").eq("member_user_id", profile.userId).eq("status", "active");
  if (memberships.error) throw new AuthzError(503, "Nao foi possivel listar memberships.");
  for (const item of memberships.data || []) ids.add(item.marca_id);
  const agencyMemberships = await profile.supabase.from("agency_memberships").select("agency_id").eq("user_id", profile.userId).eq("status", "active");
  const agencyOwned = await profile.supabase.from("agencies").select("id").eq("owner_user_id", profile.userId).eq("status", "active");
  if (agencyMemberships.error || agencyOwned.error) throw new AuthzError(503, "Nao foi possivel listar as Agencies autorizadas.");
  const agencyIds = [...new Set([...(agencyMemberships.data || []).map(item => item.agency_id), ...(agencyOwned.data || []).map(item => item.id)])];
  if (agencyIds.length) {
    const links = await profile.supabase.from("agency_brands").select("brand_id").in("agency_id", agencyIds).eq("status", "active");
    if (links.error) throw new AuthzError(503, "Nao foi possivel listar as Brands da Agency.");
    for (const item of links.data || []) ids.add(item.brand_id);
  }
  if (!ids.size) return [];
  const result = await profile.supabase.from("marcas").select("id,nome").in("id", [...ids]).order("nome");
  if (result.error) throw new AuthzError(503, "Nao foi possivel listar marcas.");
  return result.data || [];
}
