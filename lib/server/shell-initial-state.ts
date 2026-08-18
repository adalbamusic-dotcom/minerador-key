import "server-only";

import { isTenantId } from "@/lib/tenant-routing";
import { listCanonicalAccessibleBrands } from "@/lib/server/canonical-authorization";

export type ServerValidatedOperationalBrand = {
  id: string;
  nome: string;
};

/**
 * A cookie is only a server-readable hint. The returned Brand exists only
 * after the canonical operational scope has accepted its id for the actor.
 */
export async function getServerValidatedOperationalBrand(brandIdHint: string | null) {
  if (!brandIdHint || !isTenantId(brandIdHint)) return null;
  try {
    const access = await listCanonicalAccessibleBrands("marca");
    const brand = access.brands.find((candidate) => candidate.id === brandIdHint);
    return brand ? { id: brand.id, nome: brand.nome } : null;
  } catch {
    return null;
  }
}
