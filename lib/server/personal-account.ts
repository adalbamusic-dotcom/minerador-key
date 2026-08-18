import "server-only";

import {
  createCanonicalServiceClient,
  listCanonicalAccessibleAgencies,
  listCanonicalAccessibleBrands,
  requireCanonicalActorUserId,
} from "@/lib/server/canonical-authorization";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";

export async function getCanonicalPersonalAccount() {
  const actorUserId = await requireCanonicalActorUserId();
  const user = await createCanonicalServiceClient().auth.admin.getUserById(actorUserId);
  if (user.error || !user.data.user) {
    throw new CanonicalAuthorizationError(503, "REMOTE_UNAVAILABLE", "Não foi possível consultar a identidade pessoal.");
  }
  const [brands, agencies] = await Promise.all([listCanonicalAccessibleBrands("marca"), listCanonicalAccessibleAgencies()]);
  const metadata = user.data.user.user_metadata || {};
  const name = typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null;
  const image = typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
  return {
    actorUserId,
    identity: { name, email: user.data.user.email || null, image },
    brands: brands.brands,
    operationalAgency: agencies.operationalAgency,
    agencies: agencies.agencies,
    isPlatformAdmin: brands.isPlatformAdmin,
  };
}
