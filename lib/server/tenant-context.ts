import "server-only";

import { AuthzError, requireSessionProfile, type SessionProfile } from "@/lib/server/authz";
import { TENANT_ID_PATTERN } from "@/lib/tenant-routing";

export const TENANT_MODULES = ["marca", "conta", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"] as const;
export type TenantModule = (typeof TENANT_MODULES)[number];
export type TenantRole = "owner" | "brand_admin" | "editor" | "reviewer" | "specialist" | "reader";

export interface TenantContext {
  brandId: string;
  /** Compatibility-only alias while consumers still use this name. */
  brandUserId: string;
  brandName: string;
  ownerUserId?: string;
  actorUserId: string;
  actorRole: TenantRole;
  permissions: string[];
  isGlobalAdmin: boolean;
}

const allPermissions = TENANT_MODULES.flatMap(module => ["view", "comment", "create", "edit", "review", "approve", "export", "publish", "manage"].map(action => `${module}:${action}`));
const canonicalUnavailable = (error: { code?: string; message?: string } | null) => error?.code === "42P01" || error?.code === "42703" || /does not exist|column/i.test(error?.message || "");
const role = (value: string | null | undefined): TenantRole => value === "owner" || value === "brand_admin" || value === "editor" || value === "reviewer" || value === "specialist" ? value : "reader";

type Brand = { id: string; nome: string | null };
type CanonicalBrand = { owner_user_id: string | null; status: "active" | "suspended" | "inactive" | null };

export async function resolveTenantContext(input: { brandId: string; actorUserId?: string; profile?: SessionProfile }): Promise<TenantContext> {
  const profile = input.profile ?? await requireSessionProfile();
  if (input.actorUserId && input.actorUserId !== profile.userId) throw new AuthzError(403, "actorUserId não corresponde à sessão.");
  if (!TENANT_ID_PATTERN.test(input.brandId)) throw new AuthzError(404, "Tenant inválido.");

  const base = await profile.supabase.from("marcas").select("id,nome").eq("id", input.brandId).maybeSingle();
  if (base.error) throw new AuthzError(503, "Não foi possível validar a marca.");
  if (!base.data) throw new AuthzError(404, "Marca não encontrada.");
  const brand = base.data as Brand;

  const canonicalResult = await profile.supabase.from("marcas").select("owner_user_id,status").eq("id", input.brandId).maybeSingle();
  const canonical = canonicalResult.error && canonicalUnavailable(canonicalResult.error) ? null : canonicalResult.data as CanonicalBrand | null;
  if (canonicalResult.error && !canonicalUnavailable(canonicalResult.error)) throw new AuthzError(503, "Não foi possível validar o estado da marca.");
  if (canonical?.status && canonical.status !== "active") throw new AuthzError(403, "Marca indisponível para acesso.");

  const baseContext = { brandId: input.brandId, brandUserId: input.brandId, brandName: brand.nome || input.brandId, ownerUserId: canonical?.owner_user_id || undefined, actorUserId: profile.userId };
  if (profile.isAdmin) return { ...baseContext, actorRole: "brand_admin", permissions: allPermissions, isGlobalAdmin: true };
  if (canonical?.owner_user_id === profile.userId) return { ...baseContext, actorRole: "owner", permissions: allPermissions, isGlobalAdmin: false };
  // Compatibility only until owner_user_id is reviewed and populated.
  if (!canonical?.owner_user_id && profile.marcaId === input.brandId) return { ...baseContext, actorRole: "owner", permissions: allPermissions, isGlobalAdmin: false };

  const canonicalMembership = await profile.supabase.from("brand_memberships").select("id,status,member_user_id,brand_roles(slug)").eq("marca_id", input.brandId).eq("member_user_id", profile.userId).maybeSingle();
  let membership = canonicalMembership.data as { id: string; status: string; brand_roles?: { slug?: string } | { slug?: string }[] | null } | null;
  if (canonicalMembership.error && !canonicalUnavailable(canonicalMembership.error)) throw new AuthzError(503, "Não foi possível validar o membership.");
  if (!membership && (!canonicalMembership.error || canonicalUnavailable(canonicalMembership.error))) {
    const legacy = await profile.supabase.from("brand_memberships").select("id,status,brand_roles(slug)").eq("marca_id", input.brandId).eq("user_key", profile.email.toLowerCase()).maybeSingle();
    if (legacy.error) throw new AuthzError(403, "Acesso de colaborador indisponível até a migration de memberships ser aplicada.");
    membership = legacy.data as typeof membership;
  }
  if (!membership || membership.status !== "active") throw new AuthzError(403, "Acesso negado a esta marca.");
  const permissions = await profile.supabase.from("brand_member_permissions").select("module,action").eq("membership_id", membership.id).eq("granted", true);
  if (permissions.error) throw new AuthzError(503, "Não foi possível validar permissões.");
  const roleRelation = Array.isArray(membership.brand_roles) ? membership.brand_roles[0] : membership.brand_roles;
  return { ...baseContext, actorRole: role(roleRelation?.slug), permissions: (permissions.data || []).map(item => `${item.module}:${item.action}`), isGlobalAdmin: false };
}

export function canAccessTenantModule(context: TenantContext, module: TenantModule) { return context.isGlobalAdmin || context.permissions.includes(`${module}:view`); }
export function assertRequestTenant(brandId: string, requestBrandId: unknown) { if (typeof requestBrandId !== "undefined" && requestBrandId !== brandId) throw new AuthzError(400, "brandId diverge do tenant da rota."); }

export async function requireTenantPermission(input: { brandId: string; actorUserId?: string; module: TenantModule; action: string; recordBrandId?: string | null; profile?: SessionProfile }) {
  assertRequestTenant(input.brandId, input.recordBrandId);
  const context = await resolveTenantContext({ brandId: input.brandId, actorUserId: input.actorUserId, profile: input.profile });
  if (!context.isGlobalAdmin && !context.permissions.includes(`${input.module}:${input.action}`)) throw new AuthzError(403, `Permissão ${input.module}:${input.action} não concedida.`);
  return context;
}

export async function listAccessibleTenantIds(profile: SessionProfile) {
  if (profile.isAdmin) { const result = await profile.supabase.from("marcas").select("id,nome").order("nome"); if (result.error) throw new AuthzError(503, "Não foi possível listar marcas."); return result.data || []; }
  const ids = new Set<string>();
  if (profile.marcaId) ids.add(profile.marcaId);
  const canonical = await profile.supabase.from("marcas").select("id").eq("owner_user_id", profile.userId);
  if (!canonical.error) for (const item of canonical.data || []) ids.add(item.id);
  const memberships = await profile.supabase.from("brand_memberships").select("marca_id").eq("member_user_id", profile.userId).eq("status", "active");
  if (memberships.error && canonicalUnavailable(memberships.error)) {
    const legacy = await profile.supabase.from("brand_memberships").select("marca_id").eq("user_key", profile.email.toLowerCase()).eq("status", "active");
    for (const item of legacy.data || []) ids.add(item.marca_id);
  } else if (memberships.error) throw new AuthzError(503, "Não foi possível listar memberships.");
  else for (const item of memberships.data || []) ids.add(item.marca_id);
  if (!ids.size) return [];
  const result = await profile.supabase.from("marcas").select("id,nome").in("id", [...ids]).order("nome");
  if (result.error) throw new AuthzError(503, "Não foi possível listar marcas.");
  return result.data || [];
}
