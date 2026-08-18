import "server-only";

import type { CanonicalSessionProfile } from "./authz";
import { AuthzError, assertCanAccessMarca } from "./authz";
import { getOperationalClient, mapPersistenceError } from "./editorial-db";
import type { z } from "zod";
import { PermissionActionSchema, PermissionModuleSchema } from "../editorial/operational-flow";

export type EditorialModule = z.infer<typeof PermissionModuleSchema>;
export type EditorialAction = z.infer<typeof PermissionActionSchema>;

const capabilityForModule = (module: EditorialModule) => module === "marca" ? "brand_data" : module;
const allAgencyCapabilities = new Set(["brand_data", "brand_collaborators", "brand_dna", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes", "activity", "notifications"]);

export async function assertEditorialPermission(profile: CanonicalSessionProfile, marcaId: string, module: EditorialModule, action: EditorialAction) {
  await assertCanAccessMarca(profile.userId, marcaId, profile);
  const client = getOperationalClient();
  const membershipResult = await client
    .from("brand_memberships")
    .select("id,status,role")
    .eq("marca_id", marcaId)
    .eq("member_user_id", profile.userId)
    .maybeSingle();
  if (membershipResult.error) mapPersistenceError(membershipResult.error);
  const membership = membershipResult.data;
  if (membership?.status === "active") {
    if (membership.role === "owner") return;
    const { data: permission, error: permissionError } = await client.from("brand_member_permissions").select("granted").eq("membership_id", membership.id).eq("module", module).eq("action", action).eq("granted", true).maybeSingle();
    if (permissionError) mapPersistenceError(permissionError);
    if (permission?.granted) return;
    throw new AuthzError(403, `BRAND_ACCESS_DENIED: Permissao ${module}:${action} nao concedida.`);
  }

  const links = await client.from("agency_brands").select("agency_id").eq("brand_id", marcaId).eq("status", "active");
  if (links.error) mapPersistenceError(links.error);
  const capability = capabilityForModule(module);
  for (const link of links.data || []) {
    const agency = await client.from("agencies").select("id,owner_user_id,status").eq("id", link.agency_id).eq("status", "active").maybeSingle();
    if (agency.error) mapPersistenceError(agency.error);
    if (!agency.data) continue;
    const isOwner = agency.data.owner_user_id === profile.userId;
    const agencyMembership = isOwner ? null : (await client.from("agency_memberships").select("id,role,status").eq("agency_id", link.agency_id).eq("user_id", profile.userId).maybeSingle()).data as { id: string; role: string; status: string } | null;
    if (!isOwner && (!agencyMembership || agencyMembership.status !== "active")) continue;

    const restriction = await client.from("brand_agency_capability_restrictions").select("id").eq("brand_id", marcaId).eq("agency_id", link.agency_id).eq("capability", capability).eq("status", "active").maybeSingle();
    if (restriction.error) mapPersistenceError(restriction.error);
    if (restriction.data) throw new AuthzError(403, `DENIED_BRAND_RESTRICTION: A Brand restringiu ${capability}.`);

    if (isOwner || agencyMembership?.role === "agency_admin") {
      if (allAgencyCapabilities.has(capability)) return;
    } else if (agencyMembership) {
      const grant = await client.from("agency_membership_capabilities").select("granted").eq("membership_id", agencyMembership.id).eq("capability", capability).eq("granted", true).maybeSingle();
      if (grant.error) mapPersistenceError(grant.error);
      if (grant.data?.granted) return;
    }
  }

  throw new AuthzError(403, `DENIED_AGENCY_PERMISSION: Permissao ${module}:${action} nao concedida.`);
}
