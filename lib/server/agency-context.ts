import "server-only";

import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile, type CanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission, type TenantContext, type TenantModule } from "@/lib/server/tenant-context";

export const AGENCY_ROLES = ["agency_admin", "operator", "viewer"] as const;
export type AgencyRole = typeof AGENCY_ROLES[number];
export type AgencyMembershipStatus = "active" | "suspended" | "removed";

export type AgencyContext = {
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  agencyStatus: "active" | "suspended" | "inactive";
  brandLinkId: string;
};

export type AgencyMembershipContext = {
  agencyId: string;
  membershipId: string | null;
  role: AgencyRole | "platform_admin";
  isGlobalAdmin: boolean;
};

export type AgencyAccessContext = {
  tenant: TenantContext;
  agency: AgencyContext;
  membership: AgencyMembershipContext;
};

type AgencyRow = { id: string; name: string; slug: string; status: string };
type AgencyBrandRow = { id: string; agency_id: string; status: string; agencies: AgencyRow | AgencyRow[] | null };
type AgencyMembershipRow = { id: string; agency_id: string; user_id: string; role: string; status: string };

function asAgencyRole(value: unknown): AgencyRole | null {
  return typeof value === "string" && (AGENCY_ROLES as readonly string[]).includes(value) ? value as AgencyRole : null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function assertAgencyId(agencyId: string) {
  if (!isTenantId(agencyId)) throw new AuthzError(404, "Agência inválida.");
}

/** This is intentionally explicit: a global admin is not materialized as a membership. */
export function isGlobalAdmin(profile: Pick<CanonicalSessionProfile, "isAdmin">): boolean {
  return profile.isAdmin === true;
}

/**
 * Resolves only the active structural link. Callers that are reached from a
 * request must compose this with requireAgencyAccessToBrand.
 */
export async function resolveAgencyForBrand(input: { brandId: string; profile?: CanonicalSessionProfile }): Promise<AgencyContext> {
  if (!isTenantId(input.brandId)) throw new AuthzError(404, "Marca inválida.");
  const profile = input.profile ?? await requireCanonicalSessionProfile();
  const { data, error } = await profile.supabase
    .from("agency_brands")
    .select("id,agency_id,status,agencies(id,name,slug,status)")
    .eq("brand_id", input.brandId)
    .eq("status", "active");
  if (error) throw new AuthzError(503, "Não foi possível resolver a agência operacional da marca.");
  const links = (data || []) as AgencyBrandRow[];
  if (links.length === 0) throw new AuthzError(409, "A marca não possui uma agência operacional ativa.");
  if (links.length !== 1) throw new AuthzError(409, "A marca possui vínculo operacional de agência ambíguo.");
  const link = links[0];
  const agency = one(link.agencies);
  if (!agency || agency.id !== link.agency_id || agency.status !== "active") throw new AuthzError(409, "A agência operacional da marca está indisponível.");
  return { agencyId: agency.id, agencyName: agency.name, agencySlug: agency.slug, agencyStatus: agency.status, brandLinkId: link.id };
}

export async function requireAgencyMembership(input: { agencyId: string; profile?: CanonicalSessionProfile }): Promise<AgencyMembershipContext> {
  assertAgencyId(input.agencyId);
  const profile = input.profile ?? await requireCanonicalSessionProfile();
  if (isGlobalAdmin(profile)) return { agencyId: input.agencyId, membershipId: null, role: "platform_admin", isGlobalAdmin: true };
  const { data, error } = await profile.supabase
    .from("agency_memberships")
    .select("id,agency_id,user_id,role,status")
    .eq("agency_id", input.agencyId)
    .eq("user_id", profile.userId)
    .maybeSingle();
  if (error) throw new AuthzError(503, "Não foi possível validar o membership da agência.");
  const membership = data as AgencyMembershipRow | null;
  const role = asAgencyRole(membership?.role);
  if (!membership || membership.agency_id !== input.agencyId || membership.user_id !== profile.userId || membership.status !== "active" || !role) {
    throw new AuthzError(403, "Acesso negado a esta agência.");
  }
  return { agencyId: input.agencyId, membershipId: membership.id, role, isGlobalAdmin: false };
}

/**
 * The server-side composition required before a future provider resolver can
 * use an agency connection. It deliberately grants neither brand-owner nor
 * global-admin membership as an implicit agency membership.
 */
export async function requireAgencyAccessToBrand(input: {
  brandId: string;
  module: TenantModule;
  action: string;
  actorUserId?: string;
  profile?: CanonicalSessionProfile;
}): Promise<AgencyAccessContext> {
  const profile = input.profile ?? await requireCanonicalSessionProfile();
  const tenant = await requireTenantPermission({ brandId: input.brandId, actorUserId: input.actorUserId ?? profile.userId, module: input.module, action: input.action, profile });
  const agency = await resolveAgencyForBrand({ brandId: tenant.brandId, profile });
  const membership = await requireAgencyMembership({ agencyId: agency.agencyId, profile });
  return { tenant, agency, membership };
}
