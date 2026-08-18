import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseUser } from "@/lib/server/supabase-session";
import { TENANT_MODULES, type TenantContext, type TenantModule, type TenantRole } from "@/lib/server/tenant-context";
import { isTenantId } from "@/lib/tenant-routing";
import { buildAgencyRef } from "@/lib/agency-routing";
import {
  CanonicalAuthorizationError,
  requireAgencyOperationalAccess,
  requireBrandEditorialAccess,
  requirePlatformAdmin,
  resolveExactlyOneActiveAgencyForBrand,
  resolveStrictAgencyRef,
  resolveStrictBrandRef,
  type CanonicalAuthorizationRepository,
} from "@/lib/tenant/canonical-authorization";

type QueryClient = Pick<SupabaseClient, "from">;
type ServiceClient = SupabaseClient;

const ALL_TENANT_PERMISSIONS = TENANT_MODULES.flatMap((module) =>
  ["view", "comment", "create", "edit", "review", "approve", "export", "publish", "manage"].map((action) => `${module}:${action}`),
);
const AGENCY_TENANT_MODULES = TENANT_MODULES.filter((module) => module !== "conta");
const AGENCY_CAPABILITIES = ["brand_data", "brand_collaborators", "brand_dna", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes", "activity", "notifications"] as const;

function agencyCapabilityForModule(module: TenantModule) {
  return module === "marca" ? "brand_data" : module;
}

function permissionsForAgencyCapabilities(capabilities: string[], restricted: string[]) {
  const granted = new Set(capabilities);
  const denied = new Set(restricted);
  return AGENCY_TENANT_MODULES.flatMap((module) => {
    const capability = agencyCapabilityForModule(module);
    if (!granted.has(capability) || denied.has(capability)) return [];
    return ["view", "comment", "create", "edit", "review", "approve", "export", "publish", "manage"].map((action) => `${module}:${action}`);
  });
}

function remoteUnavailable(message: string) {
  return new CanonicalAuthorizationError(503, "REMOTE_UNAVAILABLE", message);
}

/** Server-only client for authorization lookups. It is never returned to a client component. */
export function createCanonicalServiceClient(): ServiceClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw remoteUnavailable("A autoriza\u00e7\u00e3o can\u00f4nica n\u00e3o est\u00e1 configurada no servidor.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Native Supabase SSR session. Every authorization decision below is made
 * against canonical persisted records after Auth verifies the current user.
 */
export async function requireCanonicalActorUserId() {
  const actorUserId = (await requireSupabaseUser()).id;
  if (!isTenantId(actorUserId)) {
    throw new CanonicalAuthorizationError(401, "ACTOR_INVALID", "A sess\u00e3o autenticada n\u00e3o possui uma identidade UUID v\u00e1lida.");
  }

  const result = await createCanonicalServiceClient().auth.admin.getUserById(actorUserId);
  if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel validar a identidade autenticada.");
  if (!result.data.user?.id || result.data.user.id !== actorUserId) {
    throw new CanonicalAuthorizationError(401, "ACTOR_INVALID", "A identidade autenticada n\u00e3o est\u00e1 dispon\u00edvel.");
  }
  return actorUserId;
}

export function createCanonicalAuthorizationRepository(client: QueryClient): CanonicalAuthorizationRepository {
  return {
    async getGlobalRole(userId) {
      const result = await client.from("perfis").select("role").eq("id", userId).maybeSingle();
      if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar o papel global.");
      return result.data?.role === "admin" ? "admin" : result.data ? "user" : null;
    },
    async findBrandById(brandId) {
      const result = await client.from("marcas").select("id,nome,status,owner_user_id").eq("id", brandId).maybeSingle();
      if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar a marca.");
      if (!result.data?.owner_user_id || !result.data.nome || !result.data.status) return null;
      return { id: result.data.id, name: result.data.nome, status: result.data.status, ownerUserId: result.data.owner_user_id };
    },
    async findBrandMembership(brandId, userId) {
      const result = await client.from("brand_memberships").select("id,marca_id,member_user_id,status").eq("marca_id", brandId).eq("member_user_id", userId).maybeSingle();
      if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar o membership da marca.");
      return result.data ? { id: result.data.id, brandId: result.data.marca_id, userId: result.data.member_user_id, status: result.data.status } : null;
    },
    async findAgencyById(agencyId) {
      const result = await client.from("agencies").select("id,name,status,owner_user_id").eq("id", agencyId).maybeSingle();
      if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar a ag\u00eancia.");
      if (!result.data?.owner_user_id || !result.data.name || !result.data.status) return null;
      return { id: result.data.id, name: result.data.name, status: result.data.status, ownerUserId: result.data.owner_user_id };
    },
    async findAgencyMembership(agencyId, userId) {
      const result = await client.from("agency_memberships").select("id,agency_id,user_id,role,status").eq("agency_id", agencyId).eq("user_id", userId).maybeSingle();
      if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar o membership da ag\u00eancia.");
      return result.data?.role === "agency_admin" || result.data?.role === "operator" || result.data?.role === "viewer"
        ? { id: result.data.id, agencyId: result.data.agency_id, userId: result.data.user_id, role: result.data.role === "agency_admin" ? "agency_admin" as const : "agency_member" as const, status: result.data.status }
        : null;
    },
    async findActiveAgencyIdsByBrandId(brandId) {
      const result = await client.from("agency_brands").select("agency_id").eq("brand_id", brandId).eq("status", "active");
      if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar o v\u00ednculo operacional da ag\u00eancia.");
      return (result.data || []).map((row) => row.agency_id);
    },
    async findAgencyCapabilities(agencyId, userId) {
      const membership = await this.findAgencyMembership(agencyId, userId);
      if (!membership) return [];
      const result = await client.from("agency_membership_capabilities").select("capability,granted").eq("membership_id", membership.id).eq("granted", true);
      if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar as capacidades da ag\u00eancia.");
      return (result.data || []).map((row) => ({ capability: row.capability, granted: row.granted }));
    },
    async findBrandAgencyRestrictions(brandId, agencyId) {
      const result = await client.from("brand_agency_capability_restrictions").select("capability").eq("brand_id", brandId).eq("agency_id", agencyId).eq("status", "active");
      if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar as restri\u00e7\u00f5es da Brand.");
      return (result.data || []).map((row) => row.capability);
    },
  };
}

async function canonicalRequestContext() {
  const actorUserId = await requireCanonicalActorUserId();
  const client = createCanonicalServiceClient();
  return { actorUserId, client, repository: createCanonicalAuthorizationRepository(client) };
}

function canonicalRole(value: unknown): TenantRole {
  return value === "brand_admin" || value === "editor" || value === "reviewer" || value === "specialist" ? value : "reader";
}

async function memberPermissions(client: QueryClient, membershipId: string) {
  const result = await client.from("brand_member_permissions").select("module,action").eq("membership_id", membershipId).eq("granted", true);
  if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar as permiss\u00f5es da marca.");
  return (result.data || []).map((permission) => `${permission.module}:${permission.action}`);
}

async function memberRole(client: QueryClient, membershipId: string) {
  const result = await client.from("brand_memberships").select("brand_roles(slug)").eq("id", membershipId).maybeSingle();
  if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel consultar o papel do membership.");
  const relation = Array.isArray(result.data?.brand_roles) ? result.data.brand_roles[0] : result.data?.brand_roles;
  return canonicalRole(relation?.slug);
}

export async function resolveCanonicalBrandTenantContext(brandRef: string): Promise<TenantContext> {
  const { actorUserId, client, repository } = await canonicalRequestContext();
  const brand = await resolveStrictBrandRef(repository, brandRef);
  const access = await requireBrandEditorialAccess({ repository, brand, actorUserId });
  const isDirectOwner = access.access === "owner";
  const isAgencyAccess = access.access === "agency_owner" || access.access === "agency_member";
  const restricted = isAgencyAccess && access.agencyId && repository.findBrandAgencyRestrictions
    ? await repository.findBrandAgencyRestrictions(brand.id, access.agencyId)
    : [];
  const agencyCapabilities = isAgencyAccess && access.agencyId && repository.findAgencyCapabilities
    ? await repository.findAgencyCapabilities(access.agencyId, actorUserId)
    : [];
  const permissions = isDirectOwner
    ? ALL_TENANT_PERMISSIONS
    : isAgencyAccess
      ? permissionsForAgencyCapabilities(
        access.access === "agency_owner" || access.agencyRole === "agency_admin" ? [...AGENCY_CAPABILITIES] : agencyCapabilities.filter((item) => item.granted).map((item) => item.capability),
        restricted,
      )
      : await memberPermissions(client, access.membershipId!);
  const actorRole = isDirectOwner ? "owner" : isAgencyAccess ? "owner" : await memberRole(client, access.membershipId!);
  return {
    brandId: brand.id,
    brandName: brand.name,
    ownerUserId: brand.ownerUserId,
    actorUserId,
    actorRole,
    permissions,
    isGlobalAdmin: false,
  };
}

export async function requireCanonicalTenantModule(brandRef: string, module: TenantModule) {
  const context = await resolveCanonicalBrandTenantContext(brandRef);
  if (!context.permissions.includes(`${module}:view`)) {
    throw new CanonicalAuthorizationError(403, "DENIED_AGENCY_PERMISSION", `Permiss\u00e3o ${module}:view n\u00e3o concedida para esta marca.`);
  }
  return context;
}

export async function canActorAccessBrand(brandId: string, actorUserId?: string) {
  const context = await canonicalRequestContext();
  const actor = actorUserId || context.actorUserId;
  if (!isTenantId(brandId) || !isTenantId(actor)) return false;
  const brand = await context.repository.findBrandById(brandId);
  if (!brand) return false;
  try {
    await requireBrandEditorialAccess({ repository: context.repository, brand, actorUserId: actor });
    return true;
  } catch (error) {
    if (error instanceof CanonicalAuthorizationError && error.code === "DENIED_NO_RELATION") return false;
    throw error;
  }
}

export async function canActorUseBrandCapability(brandId: string, capability: string, actorUserId?: string) {
  const context = await canonicalRequestContext();
  const actor = actorUserId || context.actorUserId;
  if (!isTenantId(brandId) || !isTenantId(actor) || !AGENCY_CAPABILITIES.includes(capability as typeof AGENCY_CAPABILITIES[number])) return false;
  const result = await context.client.rpc("canonical_actor_can_use_brand_capability", {
    target_brand_id: brandId,
    target_actor_user_id: actor,
    target_capability: capability,
  });
  if (result.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel confirmar a capability da Brand.");
  return result.data === true;
}

export async function requireCanonicalPlatformAdmin() {
  const { actorUserId, repository } = await canonicalRequestContext();
  return requirePlatformAdmin(repository, actorUserId);
}

export async function listCanonicalAccessibleBrands(requiredModule?: TenantModule) {
  const { actorUserId, client, repository } = await canonicalRequestContext();
  const [owned, memberships, agencyOwned, agencyMemberships, globalRole] = await Promise.all([
    client.from("marcas").select("id,nome,status").eq("owner_user_id", actorUserId).eq("status", "active"),
    client.from("brand_memberships").select("id,marca_id").eq("member_user_id", actorUserId).eq("status", "active"),
    client.from("agencies").select("id").eq("owner_user_id", actorUserId).eq("status", "active"),
    client.from("agency_memberships").select("agency_id").eq("user_id", actorUserId).eq("status", "active"),
    repository.getGlobalRole(actorUserId),
  ]);
  if (owned.error || memberships.error || agencyOwned.error || agencyMemberships.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel listar as marcas autorizadas.");
  const byId = new Map((owned.data || []).map((brand) => [brand.id, { id: brand.id, nome: brand.nome }]));
  let permittedMemberships = memberships.data || [];
  if (requiredModule && permittedMemberships.length) {
    const permissionResult = await client.from("brand_member_permissions").select("membership_id").in("membership_id", permittedMemberships.map((membership) => membership.id)).eq("module", requiredModule).eq("action", "view").eq("granted", true);
    if (permissionResult.error) throw remoteUnavailable("Não foi possível confirmar as permissões da marca.");
    const permittedIds = new Set((permissionResult.data || []).map((permission) => permission.membership_id));
    permittedMemberships = permittedMemberships.filter((membership) => permittedIds.has(membership.id));
  }
  const memberIds = [...new Set(permittedMemberships.map((membership) => membership.marca_id).filter((id) => !byId.has(id)))];
  if (memberIds.length) {
    const brands = await client.from("marcas").select("id,nome").in("id", memberIds).eq("status", "active");
    if (brands.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel listar as marcas vinculadas.");
    for (const brand of brands.data || []) byId.set(brand.id, { id: brand.id, nome: brand.nome });
  }
  const agencyIds = [...new Set([
    ...(agencyOwned.data || []).map((agency) => agency.id),
    ...(agencyMemberships.data || []).map((membership) => membership.agency_id),
  ])];
  if (agencyIds.length) {
    const links = await client.from("agency_brands").select("brand_id").in("agency_id", agencyIds).eq("status", "active");
    if (links.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel listar as marcas da Agency.");
    const linkIds = [...new Set((links.data || []).map((link) => link.brand_id))];
    if (linkIds.length) {
      const brands = await client.from("marcas").select("id,nome").in("id", linkIds).eq("status", "active");
      if (brands.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel listar as marcas da Agency.");
      const agencyBrands = requiredModule
        ? (await Promise.all((brands.data || []).map(async (brand) => ({
          brand,
          allowed: await canActorUseBrandCapability(brand.id, agencyCapabilityForModule(requiredModule), actorUserId),
        })))).filter((item) => item.allowed).map((item) => item.brand)
        : brands.data || [];
      for (const brand of agencyBrands) byId.set(brand.id, { id: brand.id, nome: brand.nome });
    }
  }
  return { actorUserId, isPlatformAdmin: globalRole === "admin", brands: [...byId.values()].sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR")) };
}

/**
 * Lists agency contexts already authorized to the current actor. A platform
 * role intentionally adds no agency access: only the explicit owner or an
 * active agency membership is returned. The singular operational context is
 * exposed only when exactly one Agency resolves; a global Admin with a
 * broader administrative list never receives a primeira Agency as fallback.
 */
export async function listCanonicalAccessibleAgencies() {
  const { actorUserId, client, repository } = await canonicalRequestContext();
  const [owned, memberships, globalRole] = await Promise.all([
    client.from("agencies").select("id,name").eq("owner_user_id", actorUserId).eq("status", "active"),
    client.from("agency_memberships").select("agency_id").eq("user_id", actorUserId).eq("status", "active"),
    repository.getGlobalRole(actorUserId),
  ]);
  if (owned.error || memberships.error) throw remoteUnavailable("Não foi possível listar os contextos de agência autorizados.");

  const agenciesById = new Map((owned.data || []).map((agency) => [agency.id, { id: agency.id, name: agency.name }]));
  const memberAgencyIds = [...new Set((memberships.data || []).map((membership) => membership.agency_id).filter((id) => !agenciesById.has(id)))];
  if (memberAgencyIds.length) {
    const agencies = await client.from("agencies").select("id,name").in("id", memberAgencyIds).eq("status", "active");
    if (agencies.error) throw remoteUnavailable("Não foi possível listar as agências vinculadas.");
    for (const agency of agencies.data || []) agenciesById.set(agency.id, { id: agency.id, name: agency.name });
  }

  const agencies = [...agenciesById.values()]
    .map((agency) => ({ ...agency, agencyRef: buildAgencyRef(agency.name, agency.id) }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  if (globalRole !== "admin" && agencies.length > 1) {
    throw new CanonicalAuthorizationError(409, "AGENCY_ACCESS_DENIED", "A identidade possui mais de uma Agency operacional.");
  }
  const operationalAgency = agencies.length === 1 ? agencies[0] : null;
  return { actorUserId, operationalAgency, agency: operationalAgency, agencies, isPlatformAdmin: globalRole === "admin" };
}

export type PendingAgencyOnboardingContext = {
  agencyName: string;
  applicationStatus: "APPROVED";
  invitationStatus: "PENDING";
  onboardingStatus: "NOT_COMPLETED";
  agencyStatus: "NOT_CREATED";
};

/**
 * Resolves only the authenticated actor's own approved application and
 * pending invitation. The e-mail match is server-side and is never exposed
 * as an account-existence lookup.
 */
export async function findPendingAgencyOnboarding(): Promise<PendingAgencyOnboardingContext | null> {
  const { actorUserId, client } = await canonicalRequestContext();
  const identity = await client.auth.admin.getUserById(actorUserId);
  if (identity.error) throw remoteUnavailable("NÃ£o foi possÃ­vel consultar a identidade autenticada.");
  const destinationEmail = identity.data.user?.["email"]?.trim().toLowerCase();
  if (!destinationEmail) return null;

  const applications = await client.from("agency_applications")
    .select("id,proposed_agency_name")
    .eq("destination_email", destinationEmail)
    .eq("status", "APPROVED")
    .order("created_at", { ascending: false });
  if (applications.error) throw remoteUnavailable("NÃ£o foi possÃ­vel consultar o estado da solicitaÃ§Ã£o.");
  const applicationIds = (applications.data || []).map((application) => application.id);
  if (!applicationIds.length) return null;

  const invitations = await client.from("agency_invitations")
    .select("id,application_id,proposed_agency_name,expires_at")
    .in("application_id", applicationIds)
    .eq("destination_email", destinationEmail)
    .eq("status", "PENDING")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (invitations.error) throw remoteUnavailable("NÃ£o foi possÃ­vel consultar o convite pendente.");
  const invitation = (invitations.data || [])[0];
  if (!invitation) return null;

  const onboarding = await client.from("agency_onboardings")
    .select("invitation_id")
    .eq("invitation_id", invitation.id)
    .maybeSingle();
  if (onboarding.error) throw remoteUnavailable("NÃ£o foi possÃ­vel confirmar o estado do onboarding.");
  if (onboarding.data) return null;

  return {
    agencyName: invitation.proposed_agency_name,
    applicationStatus: "APPROVED",
    invitationStatus: "PENDING",
    onboardingStatus: "NOT_COMPLETED",
    agencyStatus: "NOT_CREATED",
  };
}

export type AuthenticatedPendingAgencyInvitation = {
  invitationId: string;
  agencyName: string;
  destinationEmail: string;
  responsibleName: string;
  planCode: string;
  expiresAt: string;
};

/**
 * Resolves the current actor's own pending invitation for authenticated
 * onboarding resumption. The invitation id stays server-side.
 */
export async function findPendingAgencyInvitationForActor(): Promise<AuthenticatedPendingAgencyInvitation | null> {
  const { actorUserId, client } = await canonicalRequestContext();
  const identity = await client.auth.admin.getUserById(actorUserId);
  if (identity.error) throw remoteUnavailable("Não foi possível consultar a identidade autenticada.");
  const destinationEmail = identity.data.user?.["email"]?.trim().toLowerCase();
  if (!destinationEmail) return null;

  const applications = await client.from("agency_applications")
    .select("id")
    .eq("destination_email", destinationEmail)
    .eq("status", "APPROVED")
    .order("created_at", { ascending: false });
  if (applications.error) throw remoteUnavailable("Não foi possível consultar a solicitação aprovada.");
  const applicationIds = (applications.data || []).map((application) => application.id);
  if (!applicationIds.length) return null;

  const invitations = await client.from("agency_invitations")
    .select("id,application_id,proposed_agency_name,destination_email,responsible_name,plan_code,expires_at")
    .in("application_id", applicationIds)
    .eq("destination_email", destinationEmail)
    .eq("status", "PENDING")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (invitations.error) throw remoteUnavailable("Não foi possível consultar o convite pendente.");
  const invitation = (invitations.data || [])[0];
  if (!invitation) return null;

  const onboarding = await client.from("agency_onboardings")
    .select("invitation_id")
    .eq("invitation_id", invitation.id)
    .maybeSingle();
  if (onboarding.error) throw remoteUnavailable("Não foi possível confirmar o estado do onboarding.");
  if (onboarding.data) return null;

  return {
    invitationId: invitation.id,
    agencyName: invitation.proposed_agency_name,
    destinationEmail: invitation.destination_email,
    responsibleName: invitation.responsible_name,
    planCode: invitation.plan_code,
    expiresAt: invitation.expires_at,
  };
}

export async function getCanonicalAgencyWorkspace(agencyRef: string) {
  const { actorUserId, client, repository } = await canonicalRequestContext();
  const agency = await resolveStrictAgencyRef(repository, agencyRef);
  const access = await requireAgencyOperationalAccess({ repository, agency, actorUserId });
  const links = await client.from("agency_brands").select("brand_id").eq("agency_id", agency.id).eq("status", "active");
  if (links.error) throw remoteUnavailable("Não foi possível consultar as marcas vinculadas à agência.");
  const linkedIds = [...new Set((links.data || []).map((link) => link.brand_id))];
  const linkedBrands = linkedIds.length
    ? await client.from("marcas").select("id,nome,status,owner_user_id,site_url,dna_diretrizes").in("id", linkedIds).eq("status", "active")
    : { data: [], error: null };
  if (linkedBrands.error) throw remoteUnavailable("Não foi possível consultar as marcas operacionais da agência.");
  const memberships = linkedIds.length
    ? await client.from("brand_memberships").select("marca_id").in("marca_id", linkedIds).eq("status", "active")
    : { data: [], error: null };
  if (memberships.error) throw remoteUnavailable("N\u00e3o foi poss\u00edvel contar os memberships ativos da marca.");
  const membershipCountByBrandId = new Map<string, number>();
  for (const membership of memberships.data || []) {
    membershipCountByBrandId.set(membership.marca_id, (membershipCountByBrandId.get(membership.marca_id) || 0) + 1);
  }

  const accessible = await listCanonicalAccessibleBrands();
  const accessibleIds = new Set(accessible.brands.map((brand) => brand.id));
  return {
    actorUserId,
    agency: { id: agency.id, name: agency.name, agencyRef: buildAgencyRef(agency.name, agency.id) },
    role: access.role,
    access: access.access,
    brands: (linkedBrands.data || []).map((brand) => ({
      id: brand.id,
      name: brand.nome,
      status: brand.status,
      ownerUserId: brand.owner_user_id,
      membershipCount: membershipCountByBrandId.get(brand.id) || 0,
      siteUrl: brand.site_url,
      strategySummary: brand.dna_diretrizes,
      authorizedForEditorial: accessibleIds.has(brand.id),
    })).sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
  };
}

export async function requireCanonicalBrandManageOrPlatformAdmin(brandId: string) {
  if (!isTenantId(brandId)) throw new CanonicalAuthorizationError(404, "BRAND_NOT_FOUND", "Marca inv\u00e1lida.");
  const { actorUserId, client, repository } = await canonicalRequestContext();
  if (await repository.getGlobalRole(actorUserId) === "admin") return { actorUserId, access: "platform_admin" as const };
  const brand = await repository.findBrandById(brandId);
  if (!brand) throw new CanonicalAuthorizationError(404, "BRAND_NOT_FOUND", "Marca n\u00e3o encontrada.");
  const access = await requireBrandEditorialAccess({ repository, brand, actorUserId });
  if (access.access === "owner") return { actorUserId, access: "owner" as const };
  if (access.access === "agency_owner" || access.access === "agency_member") {
    const allowed = await canActorUseBrandCapability(brandId, "brand_data", actorUserId);
    if (!allowed) throw new CanonicalAuthorizationError(403, "DENIED_AGENCY_PERMISSION", "A Agency não possui capacidade para administrar os dados desta Brand.");
    return { actorUserId, access: "agency" as const };
  }
  const permissions = await memberPermissions(client, access.membershipId);
  if (!permissions.includes("marca:manage")) {
    throw new CanonicalAuthorizationError(403, "BRAND_ACCESS_DENIED", "Permiss\u00e3o marca:manage n\u00e3o concedida para esta marca.");
  }
  return { actorUserId, access: "member" as const };
}

export async function resolveCanonicalBrandRef(brandRef: string) {
  const { repository } = await canonicalRequestContext();
  return resolveStrictBrandRef(repository, brandRef);
}

export async function requireCanonicalBrandEditorialAccess(brandRef: string) {
  const { actorUserId, repository } = await canonicalRequestContext();
  const brand = await resolveStrictBrandRef(repository, brandRef);
  return requireBrandEditorialAccess({ repository, brand, actorUserId });
}

export async function resolveCanonicalAgencyRef(agencyRef: string) {
  const { repository } = await canonicalRequestContext();
  return resolveStrictAgencyRef(repository, agencyRef);
}

export async function requireCanonicalAgencyOperationalAccess(agencyRef: string) {
  const { actorUserId, repository } = await canonicalRequestContext();
  const agency = await resolveStrictAgencyRef(repository, agencyRef);
  return requireAgencyOperationalAccess({ repository, agency, actorUserId });
}

export async function resolveCanonicalAgencyForBrand(brandId: string) {
  const { repository } = await canonicalRequestContext();
  return resolveExactlyOneActiveAgencyForBrand(repository, brandId);
}
