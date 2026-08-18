import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTenantId } from "@/lib/tenant-routing";
import type { CanonicalSessionProfile } from "@/lib/server/authz";
import { AuthzError } from "@/lib/server/authz";
import { listAuthUsers, searchAuthUsers, type AuthUserSummary } from "@/lib/server/auth-users";
import type { AdminMembershipSummary, AdminUserRecord } from "@/lib/admin-users-contract";

type ServiceClient = SupabaseClient;
type ProfileRow = { id: string; role: string | null };
type BrandMembershipRow = { member_user_id: string; marca_id: string; role: string | null; status: string | null };
type AgencyMembershipRow = { user_id: string; agency_id: string; role: string | null; status: string | null };

export class GlobalUserAdminError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GlobalUserAdminError";
    this.status = status;
    this.code = code;
  }
}

function assertGlobalAdmin(profile: Pick<CanonicalSessionProfile, "isAdmin">) {
  if (!profile.isAdmin) throw new AuthzError(403, "Apenas administradores globais podem gerir papéis de usuários.");
}

function optionalRelationMissing(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || /relation .* does not exist/i.test(error?.message || "");
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function getProfiles(client: ServiceClient, userIds: string[]) {
  if (!userIds.length) return new Map<string, ProfileRow>();
  const result = await client.from("perfis").select("id,role").in("id", userIds);
  if (result.error) throw new GlobalUserAdminError(503, "GLOBAL_USER_PROFILE_LOOKUP_FAILED", "Não foi possível consultar os papéis globais.");
  return new Map((result.data || []).map((row: ProfileRow) => [row.id, row]));
}

async function getBrandMemberships(client: ServiceClient, userIds: string[]) {
  if (!userIds.length) return new Map<string, AdminMembershipSummary[]>();
  const result = await client.from("brand_memberships").select("member_user_id,marca_id,role,status").in("member_user_id", userIds);
  if (result.error) throw new GlobalUserAdminError(503, "GLOBAL_USER_BRAND_MEMBERSHIP_LOOKUP_FAILED", "Não foi possível consultar os memberships de marca.");
  const rows = (result.data || []) as BrandMembershipRow[];
  const brandIds = [...new Set(rows.map(row => row.marca_id))];
  const brands = brandIds.length ? await client.from("marcas").select("id,nome").in("id", brandIds) : { data: [], error: null };
  if (brands.error) throw new GlobalUserAdminError(503, "GLOBAL_USER_BRAND_LOOKUP_FAILED", "Não foi possível consultar as marcas vinculadas.");
  const names = new Map((brands.data || []).map((row: { id: string; nome: string }) => [row.id, row.nome]));
  const byUser = new Map<string, AdminMembershipSummary[]>();
  for (const row of rows) {
    const current = byUser.get(row.member_user_id) || [];
    current.push({ id: row.marca_id, label: names.get(row.marca_id) || "Marca indisponível", role: text(row.role, "member"), status: text(row.status, "active") });
    byUser.set(row.member_user_id, current);
  }
  return byUser;
}

async function getAgencyMemberships(client: ServiceClient, userIds: string[]) {
  if (!userIds.length) return new Map<string, AdminMembershipSummary[]>();
  const result = await client.from("agency_memberships").select("user_id,agency_id,role,status").in("user_id", userIds);
  if (result.error) {
    if (optionalRelationMissing(result.error)) return new Map<string, AdminMembershipSummary[]>();
    throw new GlobalUserAdminError(503, "GLOBAL_USER_AGENCY_MEMBERSHIP_LOOKUP_FAILED", "Não foi possível consultar os memberships de agência.");
  }
  const rows = (result.data || []) as AgencyMembershipRow[];
  const agencyIds = [...new Set(rows.map(row => row.agency_id))];
  const agencies = agencyIds.length ? await client.from("agencies").select("id,name").in("id", agencyIds) : { data: [], error: null };
  if (agencies.error) {
    if (optionalRelationMissing(agencies.error)) return new Map<string, AdminMembershipSummary[]>();
    throw new GlobalUserAdminError(503, "GLOBAL_USER_AGENCY_LOOKUP_FAILED", "Não foi possível consultar as agências vinculadas.");
  }
  const names = new Map((agencies.data || []).map((row: { id: string; name?: string | null }) => [row.id, text(row.name, "Agência indisponível")]));
  const byUser = new Map<string, AdminMembershipSummary[]>();
  for (const row of rows) {
    const current = byUser.get(row.user_id) || [];
    current.push({ id: row.agency_id, label: names.get(row.agency_id) || "Agência indisponível", role: text(row.role, "member"), status: text(row.status, "active") });
    byUser.set(row.user_id, current);
  }
  return byUser;
}

async function enrichUsers(client: ServiceClient, identities: AuthUserSummary[]): Promise<AdminUserRecord[]> {
  const ids = identities.map(identity => identity.id);
  const [profiles, brands, agencies] = await Promise.all([getProfiles(client, ids), getBrandMemberships(client, ids), getAgencyMemberships(client, ids)]);
  return identities.map(identity => {
    const globalRole = profiles.get(identity.id)?.role === "admin" ? "admin" : "standard";
    const brandMemberships = brands.get(identity.id) || [];
    const agencyMemberships = agencies.get(identity.id) || [];
    const accessState = globalRole === "admin" ? "global_admin"
      : brandMemberships.length ? "brand_member"
      : agencyMemberships.length ? "agency_member" : "no_association";
    return { identity, globalRole, brandMemberships, agencyMemberships, accessState };
  });
}

export async function listAdminUsers(input: { client: ServiceClient; profile: Pick<CanonicalSessionProfile, "isAdmin">; query?: string }) {
  assertGlobalAdmin(input.profile);
  const query = input.query?.trim() || "";
  const identities = query.length >= 2 ? await searchAuthUsers(input.client, query) : await listAuthUsers(input.client);
  return { users: await enrichUsers(input.client, identities) };
}

async function requireAuthUser(client: ServiceClient, userId: unknown) {
  if (typeof userId !== "string" || !isTenantId(userId)) throw new GlobalUserAdminError(400, "GLOBAL_USER_INVALID_INPUT", "Selecione um usuário válido.");
  const result = await client.auth.admin.getUserById(userId);
  if (result.error || !result.data.user?.id || !result.data.user.email) throw new GlobalUserAdminError(404, "GLOBAL_USER_NOT_FOUND", "O usuário selecionado não está mais disponível no Supabase Auth.");
  return result.data.user;
}

async function activeAdminIds(client: ServiceClient) {
  const profiles = await client.from("perfis").select("id").eq("role", "admin");
  if (profiles.error) throw new GlobalUserAdminError(503, "GLOBAL_USER_PROFILE_LOOKUP_FAILED", "Não foi possível validar os administradores globais ativos.");
  const ids = [...new Set((profiles.data || []).map((row: { id: string }) => row.id))];
  const active = new Set<string>();
  for (const id of ids) {
    const result = await client.auth.admin.getUserById(id);
    if (result.error || !result.data.user) throw new GlobalUserAdminError(503, "GLOBAL_USER_ADMIN_VALIDATION_FAILED", "Não foi possível validar os administradores globais ativos.");
    const bannedUntil = result.data.user.banned_until ? Date.parse(result.data.user.banned_until) : Number.NaN;
    if (!Number.isFinite(bannedUntil) || bannedUntil <= Date.now()) active.add(id);
  }
  return active;
}

export async function setAdminGlobalRole(input: { client: ServiceClient; profile: Pick<CanonicalSessionProfile, "isAdmin">; userId: unknown; action: unknown }) {
  assertGlobalAdmin(input.profile);
  if (input.action !== "grant" && input.action !== "remove") throw new GlobalUserAdminError(400, "GLOBAL_USER_INVALID_INPUT", "Ação de papel inválida.");
  const user = await requireAuthUser(input.client, input.userId);
  const profiles = await getProfiles(input.client, [user.id]);
  const current = profiles.get(user.id);

  if (input.action === "grant") {
    if (current?.role === "admin") return { changed: false, message: "O usuário já possui o papel de Administrador global." };
    const result = current
      ? await input.client.from("perfis").update({ role: "admin" }).eq("id", user.id).select("id,role").single()
      : await input.client.from("perfis").insert({ id: user.id, role: "admin" }).select("id,role").single();
    if (result.error || result.data?.role !== "admin") throw new GlobalUserAdminError(503, "GLOBAL_USER_ROLE_SAVE_FAILED", "Não foi possível confirmar o novo papel global.");
    return { changed: true, message: "Papel de Administrador global concedido." };
  }

  if (current?.role !== "admin") return { changed: false, message: "O usuário já não possui papel de Administrador global." };
  const activeAdmins = await activeAdminIds(input.client);
  if (!activeAdmins.has(user.id) || activeAdmins.size <= 1) {
    throw new GlobalUserAdminError(409, "GLOBAL_USER_LAST_ADMIN", "Mantenha ao menos outro Administrador global ativo antes de remover este papel.");
  }
  const result = await input.client.from("perfis").update({ role: "cliente" }).eq("id", user.id).select("id,role").single();
  if (result.error || result.data?.role === "admin") throw new GlobalUserAdminError(503, "GLOBAL_USER_ROLE_SAVE_FAILED", "Não foi possível confirmar a remoção do papel global.");
  return { changed: true, message: "Papel de Administrador global removido." };
}
