import "server-only";
import type { SessionProfile } from "./authz";
import { AuthzError, assertCanAccessMarca } from "./authz";
import { getOperationalClient, mapPersistenceError, PersistenceUnavailableError } from "./editorial-db";
import type { z } from "zod";
import { PermissionActionSchema, PermissionModuleSchema } from "../editorial/operational-flow";

export type EditorialModule = z.infer<typeof PermissionModuleSchema>;
export type EditorialAction = z.infer<typeof PermissionActionSchema>;

export async function assertEditorialPermission(profile: SessionProfile, marcaId: string, module: EditorialModule, action: EditorialAction) {
  await assertCanAccessMarca(profile.userId, marcaId, profile).catch(error => {
    if (!profile.isAdmin) throw error;
  });
  try {
    const client = getOperationalClient();
    const userKey = profile.email.toLowerCase();
    const membershipResult = await client.from("brand_memberships").select("id,status").eq("marca_id", marcaId).eq("user_key", userKey).maybeSingle();
    let membership = membershipResult.data;
    if (membershipResult.error) mapPersistenceError(membershipResult.error);
    if (!membership && profile.isAdmin) membership = await bootstrapPlatformAdmin(client, marcaId, userKey);
    if (membership?.status === "active") {
      const { data: permission, error: permissionError } = await client.from("brand_member_permissions").select("granted").eq("membership_id", membership.id).eq("module", module).eq("action", action).eq("granted", true).maybeSingle();
      if (permissionError) mapPersistenceError(permissionError);
      if (permission?.granted) return;
    }
    const { data: grants, error: grantError } = await client.from("delegated_access_grants").select("id,expires_at").eq("marca_id", marcaId).eq("grantee_user_key", userKey).eq("status", "active");
    if (grantError) mapPersistenceError(grantError);
    const activeIds = (grants || []).filter(grant => !grant.expires_at || new Date(grant.expires_at) > new Date()).map(grant => grant.id);
    if (activeIds.length) {
      const { count, error: delegatedError } = await client.from("delegated_access_permissions").select("grant_id", { count: "exact", head: true }).in("grant_id", activeIds).eq("module", module).eq("action", action);
      if (delegatedError) mapPersistenceError(delegatedError);
      if ((count || 0) > 0) return;
    }
    throw new AuthzError(403, `Permissão ${module}:${action} não concedida.`);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      // Compatibilidade temporária enquanto a migration não foi aplicada.
      if (profile.isAdmin || profile.marcaId === marcaId) return;
    }
    throw error;
  }
}

async function bootstrapPlatformAdmin(client: ReturnType<typeof getOperationalClient>, marcaId: string, userKey: string) {
  const { data: role, error: roleError } = await client.from("brand_roles").select("id").is("marca_id", null).eq("slug", "platform_admin").single();
  if (roleError) mapPersistenceError(roleError);
  const { data: membership, error } = await client.from("brand_memberships").upsert({ marca_id: marcaId, user_key: userKey, role_id: role!.id, status: "active" }, { onConflict: "marca_id,user_key" }).select("id,status").single();
  if (error) mapPersistenceError(error);
  const modules = ["marca","minerador","arquiteto","radar","planejador","redator","publicacoes","administracao"];
  const actions = ["view","comment","create","edit","review","approve","export","publish","manage"];
  const permissions = modules.flatMap(module => actions.map(action => ({ membership_id: membership!.id, module, action, granted: true, granted_by: userKey })));
  const { error: permissionError } = await client.from("brand_member_permissions").upsert(permissions, { onConflict: "membership_id,module,action" });
  if (permissionError) mapPersistenceError(permissionError); return membership;
}
