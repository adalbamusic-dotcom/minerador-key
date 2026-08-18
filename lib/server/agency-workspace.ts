import "server-only";

import { createAdminBrandWithAgency } from "@/lib/server/admin-brand-creation";
import {
  createCanonicalAuthorizationRepository,
  createCanonicalServiceClient,
  requireCanonicalActorUserId,
} from "@/lib/server/canonical-authorization";
import {
  CanonicalAuthorizationError,
  requireAgencyOperationalAccess,
  requireBrandEditorialAccess,
  resolveStrictAgencyRef,
} from "@/lib/tenant/canonical-authorization";
import { buildAgencyRef } from "@/lib/agency-routing";
import { buildBrandRef } from "@/lib/tenant-routing";

export const CANONICAL_AGENCY_CAPABILITIES = [
  "brand_data", "brand_collaborators", "brand_dna", "minerador", "arquiteto", "radar",
  "planejador", "redator", "publicacoes", "activity", "notifications",
] as const;

export type AgencyCapability = typeof CANONICAL_AGENCY_CAPABILITIES[number];
export type AgencyWorkspaceRole = "agency_admin" | "agency_member";
export type AgencyMemberStatus = "active" | "suspended" | "removed";

export type AgencyWorkspaceMember = {
  id: string | null;
  email: string | null;
  name: string | null;
  role: AgencyWorkspaceRole | "owner";
  status: AgencyMemberStatus;
  isOwner: boolean;
  capabilities: AgencyCapability[];
};

export type AgencyWorkspaceBrand = {
  id: string;
  name: string;
  brandRef: string;
  status: string;
  ownerName: string | null;
  ownerEmail: string | null;
  siteUrl: string | null;
  membershipCount: number;
  strategySummary: string | null;
  authorizedForEditorial: boolean;
};

export type AgencyWorkspaceData = {
  actorUserId: string;
  isGlobalAdmin: boolean;
  access: "owner" | "member";
  role: AgencyWorkspaceRole;
  canManage: boolean;
  agency: {
    id: string;
    name: string;
    slug: string;
    agencyRef: string;
    status: string;
    ownerName: string | null;
    ownerEmail: string | null;
    createdAt: string;
    updatedAt: string | null;
  };
  completeness: { completed: number; total: number };
  memberCount: number;
  brandCount: number;
  members: AgencyWorkspaceMember[];
  brands: AgencyWorkspaceBrand[];
  capabilities: Array<{ code: AgencyCapability; label: string }>;
};

export class AgencyWorkspaceError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 503, public readonly code: string, message: string) {
    super(message);
    this.name = "AgencyWorkspaceError";
  }
}

type ServiceClient = ReturnType<typeof createCanonicalServiceClient>;

function remoteFailure(message: string): never {
  throw new CanonicalAuthorizationError(503, "REMOTE_UNAVAILABLE", message);
}

function text(value: unknown, field: string, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new AgencyWorkspaceError(400, "AGENCY_WORKSPACE_INVALID_INPUT", `${field} é obrigatório.`);
  }
  return value.trim();
}

function role(value: unknown): AgencyWorkspaceRole {
  if (value === "agency_admin" || value === "agency_member") return value;
  throw new AgencyWorkspaceError(400, "AGENCY_WORKSPACE_INVALID_ROLE", "Papel de membro inválido.");
}

function status(value: unknown): AgencyMemberStatus {
  if (value === "active" || value === "suspended" || value === "removed") return value;
  throw new AgencyWorkspaceError(400, "AGENCY_WORKSPACE_INVALID_STATUS", "Status de membro inválido.");
}

function capabilityList(value: unknown): AgencyCapability[] {
  if (value === undefined) return [...CANONICAL_AGENCY_CAPABILITIES];
  if (!Array.isArray(value)) throw new AgencyWorkspaceError(400, "AGENCY_WORKSPACE_INVALID_CAPABILITIES", "Capacidades inválidas.");
  const unique = [...new Set(value.filter((item): item is string => typeof item === "string"))];
  if (unique.some((item) => !(CANONICAL_AGENCY_CAPABILITIES as readonly string[]).includes(item))) {
    throw new AgencyWorkspaceError(400, "AGENCY_WORKSPACE_INVALID_CAPABILITIES", "Uma capacidade não pertence ao catálogo canônico.");
  }
  return unique as AgencyCapability[];
}

function identityLabel(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) {
  const metadata = user?.user_metadata;
  const name = metadata ? ["full_name", "name", "display_name"].map((key) => metadata[key]).find((value): value is string => typeof value === "string" && Boolean(value.trim())) : null;
  return { name: name?.trim() || null, email: user?.email || null };
}

async function getIdentities(client: ServiceClient, userIds: string[]) {
  const identities = new Map<string, { name: string | null; email: string | null }>();
  await Promise.all([...new Set(userIds)].map(async (userId) => {
    const result = await client.auth.admin.getUserById(userId);
    if (!result.error && result.data.user) identities.set(userId, identityLabel(result.data.user));
  }));
  return identities;
}

async function workspaceContext(agencyRef: string) {
  const actorUserId = await requireCanonicalActorUserId();
  const client = createCanonicalServiceClient();
  const repository = createCanonicalAuthorizationRepository(client);
  const agency = await resolveStrictAgencyRef(repository, agencyRef);
  const access = await requireAgencyOperationalAccess({ repository, agency, actorUserId });
  const detail = await client.from("agencies").select("id,name,slug,status,owner_user_id,created_at,updated_at").eq("id", agency.id).maybeSingle();
  if (detail.error || !detail.data) remoteFailure("Não foi possível carregar os dados da Agency.");
  return { actorUserId, client, repository, agency: detail.data, access };
}

export async function getAgencyWorkspaceData(agencyRef: string): Promise<AgencyWorkspaceData> {
  const { actorUserId, client, repository, agency, access } = await workspaceContext(agencyRef);
  const [membersResult, linksResult, capabilitiesResult, globalRole] = await Promise.all([
    client.from("agency_memberships").select("id,user_id,role,status").eq("agency_id", agency.id).order("created_at"),
    client.from("agency_brands").select("brand_id,status").eq("agency_id", agency.id).eq("status", "active"),
    client.from("canonical_capabilities").select("code,label").eq("active", true).order("code"),
    repository.getGlobalRole(actorUserId),
  ]);
  if (membersResult.error || linksResult.error || capabilitiesResult.error) remoteFailure("Não foi possível carregar a estrutura operacional da Agency.");

  const membershipRows = membersResult.data || [];
  const memberIds = membershipRows.map((row) => row.user_id).filter((id): id is string => typeof id === "string");
  const brandIds = [...new Set((linksResult.data || []).map((row) => row.brand_id).filter((id): id is string => typeof id === "string"))];
  const [identities, ownerIdentities, brandsResult, brandMembershipsResult] = await Promise.all([
    getIdentities(client, [agency.owner_user_id, ...memberIds]),
    getIdentities(client, [agency.owner_user_id]),
    brandIds.length ? client.from("marcas").select("id,nome,status,owner_user_id,site_url,dna_diretrizes").in("id", brandIds) : Promise.resolve({ data: [], error: null }),
    brandIds.length ? client.from("brand_memberships").select("marca_id").in("marca_id", brandIds).eq("status", "active") : Promise.resolve({ data: [], error: null }),
  ]);
  if (brandsResult.error || brandMembershipsResult.error) remoteFailure("Não foi possível carregar as marcas da Agency.");
  const membershipCountByBrand = new Map<string, number>();
  for (const membership of brandMembershipsResult.data || []) membershipCountByBrand.set(membership.marca_id, (membershipCountByBrand.get(membership.marca_id) || 0) + 1);

  const membershipIds = membershipRows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  const grantsResult = membershipIds.length
    ? await client.from("agency_membership_capabilities").select("membership_id,capability,granted").in("membership_id", membershipIds).eq("granted", true)
    : { data: [], error: null };
  if (grantsResult.error) remoteFailure("Não foi possível carregar as capacidades dos membros.");
  const grantsByMembership = new Map<string, AgencyCapability[]>();
  for (const grant of grantsResult.data || []) {
    if (!(CANONICAL_AGENCY_CAPABILITIES as readonly string[]).includes(grant.capability)) continue;
    const list = grantsByMembership.get(grant.membership_id) || [];
    list.push(grant.capability as AgencyCapability);
    grantsByMembership.set(grant.membership_id, list);
  }

  const members: AgencyWorkspaceMember[] = [];
  const ownerIdentity = ownerIdentities.get(agency.owner_user_id) || null;
  members.push({ id: null, name: ownerIdentity?.name || null, email: ownerIdentity?.email || null, role: "owner", status: "active", isOwner: true, capabilities: [...CANONICAL_AGENCY_CAPABILITIES] });
  for (const member of membershipRows.filter((row) => row.user_id !== agency.owner_user_id)) {
    const identity = identities.get(member.user_id) || { name: null, email: null };
    const memberRole = member.role === "agency_admin" ? "agency_admin" : "agency_member";
    members.push({ id: member.id, ...identity, role: memberRole, status: status(member.status), isOwner: member.user_id === agency.owner_user_id, capabilities: grantsByMembership.get(member.id) || [] });
  }

  const brands: AgencyWorkspaceBrand[] = [];
  for (const brand of brandsResult.data || []) {
    const owner = identities.get(brand.owner_user_id) || (await getIdentities(client, [brand.owner_user_id])).get(brand.owner_user_id) || { name: null, email: null };
    let authorizedForEditorial = false;
    try {
      const found = await repository.findBrandById(brand.id);
      if (found) { await requireBrandEditorialAccess({ repository, brand: found, actorUserId }); authorizedForEditorial = true; }
    } catch (error) {
      if (!(error instanceof CanonicalAuthorizationError) || error.code !== "DENIED_NO_RELATION") throw error;
    }
    brands.push({ id: brand.id, name: brand.nome, brandRef: buildBrandRef(brand.nome, brand.id), status: brand.status, ownerName: owner.name, ownerEmail: owner.email, siteUrl: brand.site_url, membershipCount: membershipCountByBrand.get(brand.id) || 0, strategySummary: brand.dna_diretrizes, authorizedForEditorial });
  }

  const capabilities = (capabilitiesResult.data || []).filter((item): item is { code: AgencyCapability; label: string } => (CANONICAL_AGENCY_CAPABILITIES as readonly string[]).includes(item.code));
  return {
    actorUserId, isGlobalAdmin: globalRole === "admin", access: access.access, role: access.role,
    canManage: access.access === "owner" || access.role === "agency_admin",
    agency: { id: agency.id, name: agency.name, slug: agency.slug, agencyRef: buildAgencyRef(agency.name, agency.id), status: agency.status, ownerName: ownerIdentity?.name || null, ownerEmail: ownerIdentity?.email || null, createdAt: agency.created_at, updatedAt: agency.updated_at || null },
    completeness: { completed: [agency.name, agency.slug, agency.status, agency.owner_user_id].filter(Boolean).length, total: 4 },
    memberCount: members.length, brandCount: brands.length, members, brands,
    capabilities: capabilities.length ? capabilities : CANONICAL_AGENCY_CAPABILITIES.map((code) => ({ code, label: code })),
  };
}

export async function updateAgencyWorkspace(input: { agencyRef: string; name: unknown }) {
  const context = await workspaceContext(input.agencyRef);
  if (context.access.access !== "owner" && context.access.role !== "agency_admin") throw new CanonicalAuthorizationError(403, "AGENCY_ACCESS_DENIED", "Somente o owner ou um administrador da Agency pode alterar seus dados.");
  const name = text(input.name, "O nome da Agency");
  const result = await context.client.from("agencies").update({ name, updated_at: new Date().toISOString() }).eq("id", context.agency.id).select("id,name").maybeSingle();
  if (result.error || !result.data) throw new AgencyWorkspaceError(409, "AGENCY_WORKSPACE_UPDATE_FAILED", "Não foi possível salvar os dados da Agency.");
  return { agencyRef: buildAgencyRef(result.data.name, result.data.id), name: result.data.name };
}

async function findUserByEmail(client: ServiceClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const result = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw new AgencyWorkspaceError(503, "AGENCY_WORKSPACE_USERS_UNAVAILABLE", "Não foi possível consultar identidades existentes.");
  return (result.data.users || []).find((user) => user.email?.trim().toLowerCase() === normalized) || null;
}

export async function searchAgencyMembers(input: { agencyRef: string; query: string }) {
  const context = await workspaceContext(input.agencyRef);
  if (context.access.access !== "owner" && context.access.role !== "agency_admin") throw new CanonicalAuthorizationError(403, "AGENCY_ACCESS_DENIED", "Somente administradores da Agency podem pesquisar membros.");
  const query = input.query.trim().toLowerCase();
  if (query.length < 3) throw new AgencyWorkspaceError(400, "AGENCY_WORKSPACE_SEARCH_TOO_SHORT", "Informe pelo menos 3 caracteres para pesquisar.");
  const result = await context.client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw new AgencyWorkspaceError(503, "AGENCY_WORKSPACE_USERS_UNAVAILABLE", "Não foi possível consultar identidades existentes.");
  const memberships = await context.client.from("agency_memberships").select("user_id,status").eq("agency_id", context.agency.id);
  if (memberships.error) remoteFailure("Não foi possível confirmar os membros atuais.");
  const existing = new Set((memberships.data || []).map((row) => row.user_id));
  return (result.data.users || []).filter((user) => {
    const name = identityLabel(user).name?.toLowerCase() || "";
    return !existing.has(user.id) && (user.email?.toLowerCase().includes(query) || name.includes(query));
  }).slice(0, 8).map((user) => ({ name: identityLabel(user).name, email: user.email || "" }));
}

export async function saveAgencyMember(input: { agencyRef: string; email: unknown; role: unknown; status: unknown; capabilities?: unknown }) {
  const context = await workspaceContext(input.agencyRef);
  if (context.access.access !== "owner" && context.access.role !== "agency_admin") throw new CanonicalAuthorizationError(403, "AGENCY_ACCESS_DENIED", "Somente administradores da Agency podem salvar membros.");
  const email = text(input.email, "O e-mail do membro", 320).toLowerCase();
  const memberRole = role(input.role);
  const memberStatus = status(input.status);
  const capabilities = capabilityList(input.capabilities);
  const user = await findUserByEmail(context.client, email);
  if (!user?.id) throw new AgencyWorkspaceError(404, "AGENCY_WORKSPACE_USER_NOT_FOUND", "Não encontramos uma identidade Auth com esse e-mail. O convite por e-mail ainda não faz parte desta fase.");
  const result = await context.client.rpc("canonical_upsert_agency_membership", { p_actor_user_id: context.actorUserId, p_agency_id: context.agency.id, p_user_id: user.id, p_role: memberRole, p_status: memberStatus });
  if (result.error) throw new AgencyWorkspaceError(409, "AGENCY_WORKSPACE_MEMBER_SAVE_FAILED", "Não foi possível salvar o vínculo do membro.");
  const membership = await context.client.from("agency_memberships").select("id").eq("agency_id", context.agency.id).eq("user_id", user.id).maybeSingle();
  if (membership.error || !membership.data?.id) throw new AgencyWorkspaceError(503, "AGENCY_WORKSPACE_MEMBER_CONFIRMATION_FAILED", "O vínculo foi salvo, mas não pôde ser confirmado.");
  const membershipId = membership.data?.id;
  if (!membershipId) throw new AgencyWorkspaceError(503, "AGENCY_WORKSPACE_MEMBER_CONFIRMATION_FAILED", "O vínculo foi salvo, mas não pôde ser confirmado.");
  const grants = CANONICAL_AGENCY_CAPABILITIES.map((capability) => ({ membership_id: membershipId, capability, granted: capabilities.includes(capability), updated_at: new Date().toISOString() }));
  const grantResult = await context.client.from("agency_membership_capabilities").upsert(grants, { onConflict: "membership_id,capability" });
  if (grantResult.error) throw new AgencyWorkspaceError(409, "AGENCY_WORKSPACE_CAPABILITIES_SAVE_FAILED", "O membro foi salvo, mas suas capacidades não puderam ser confirmadas.");
  return { success: true };
}

export async function setAgencyMemberStatus(input: { agencyRef: string; membershipId: unknown; status: unknown }) {
  const context = await workspaceContext(input.agencyRef);
  if (context.access.access !== "owner" && context.access.role !== "agency_admin") throw new CanonicalAuthorizationError(403, "AGENCY_ACCESS_DENIED", "Somente administradores da Agency podem alterar membros.");
  const membershipId = text(input.membershipId, "O vínculo", 80);
  const memberStatus = status(input.status);
  const result = await context.client.rpc("canonical_set_agency_membership_status", { p_actor_user_id: context.actorUserId, p_membership_id: membershipId, p_status: memberStatus });
  if (result.error || !result.data) throw new AgencyWorkspaceError(409, "AGENCY_WORKSPACE_MEMBER_STATUS_FAILED", "Não foi possível alterar o status do membro.");
  return { success: true };
}

export async function createAgencyBrand(input: { agencyRef: string; name: unknown; siteUrl?: unknown; nicho?: unknown; localizacao?: unknown }) {
  const context = await workspaceContext(input.agencyRef);
  if (context.access.access !== "owner" && context.access.role !== "agency_admin") throw new CanonicalAuthorizationError(403, "AGENCY_ACCESS_DENIED", "Somente administradores da Agency podem cadastrar marcas.");
  const result = await createAdminBrandWithAgency({ client: context.client, name: input.name, ownerUserId: context.agency.owner_user_id, agencyId: context.agency.id, siteUrl: input.siteUrl, nicho: input.nicho, localizacao: input.localizacao });
  return { success: true, brandRef: result.brandRef, brandName: result.name };
}
