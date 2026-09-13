import { normalizeAgencyRefSlug, parseAgencyRef } from "../agency-routing";
import { isTenantId, normalizeBrandSlug, parseBrandRef } from "../tenant-routing";

export type CanonicalGlobalRole = "admin" | "user";
export type CanonicalAgencyRole = "agency_admin" | "agency_member";

export type CanonicalBrand = {
  id: string;
  name: string;
  status: "active" | "suspended" | "inactive";
  ownerUserId: string;
};

export type CanonicalAgency = {
  id: string;
  name: string;
  status: "active" | "suspended" | "inactive";
  ownerUserId: string;
};

export type CanonicalBrandMembership = {
  id: string;
  brandId: string;
  userId: string;
  status: "active" | "suspended" | "removed";
};

export type CanonicalAgencyMembership = {
  id: string;
  agencyId: string;
  userId: string;
  role: CanonicalAgencyRole;
  status: "active" | "suspended" | "removed";
};

export type CanonicalAgencyCapability = {
  capability: string;
  granted: boolean;
};

export interface CanonicalAuthorizationRepository {
  getGlobalRole(userId: string): Promise<CanonicalGlobalRole | null>;
  findBrandById(brandId: string): Promise<CanonicalBrand | null>;
  findBrandMembership(brandId: string, userId: string): Promise<CanonicalBrandMembership | null>;
  findAgencyById(agencyId: string): Promise<CanonicalAgency | null>;
  findAgencyMembership(agencyId: string, userId: string): Promise<CanonicalAgencyMembership | null>;
  findActiveAgencyIdsByBrandId(brandId: string): Promise<string[]>;
  findAgencyCapabilities?(agencyId: string, userId: string): Promise<CanonicalAgencyCapability[]>;
  findBrandAgencyRestrictions?(brandId: string, agencyId: string): Promise<string[]>;
}

export type CanonicalAuthorizationCode =
  | "ACTOR_INVALID"
  | "PLATFORM_ADMIN_REQUIRED"
  | "BRAND_REF_INVALID"
  | "BRAND_NOT_FOUND"
  | "BRAND_REF_MISMATCH"
  | "BRAND_INACTIVE"
  | "BRAND_ACCESS_DENIED"
  | "DENIED_NO_RELATION"
  | "DENIED_AGENCY_PERMISSION"
  | "DENIED_BRAND_RESTRICTION"
  | "AGENCY_REF_INVALID"
  | "AGENCY_NOT_FOUND"
  | "AGENCY_REF_MISMATCH"
  | "AGENCY_INACTIVE"
  | "AGENCY_ACCESS_DENIED"
  | "BRAND_AGENCY_MISSING"
  | "BRAND_AGENCY_AMBIGUOUS"
  | "REMOTE_UNAVAILABLE";

export class CanonicalAuthorizationError extends Error {
  /*
   * CAMPOS EXPLÍCITOS, e não parameter properties.
   *
   * Elas produzem código em vez de anotá-lo, e o Node as recusa no modo
   * strip-only — que é como o Local Worker roda este módulo fora do Next.
   * A união dos códigos virou tipo nomeado no caminho: ela estava declarada
   * inline dentro da assinatura e não podia ser referida em lugar nenhum.
   */
  readonly status: 401 | 403 | 404 | 409 | 503;
  readonly code: CanonicalAuthorizationCode;

  constructor(status: 401 | 403 | 404 | 409 | 503, code: CanonicalAuthorizationCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assertActorUserId(actorUserId: string) {
  if (!isTenantId(actorUserId)) {
    throw new CanonicalAuthorizationError(401, "ACTOR_INVALID", "A identidade autenticada é inválida.");
  }
}

function requireActiveBrand(brand: CanonicalBrand) {
  if (brand.status !== "active") {
    throw new CanonicalAuthorizationError(403, "BRAND_INACTIVE", "A marca não está ativa.");
  }
}

function requireActiveAgency(agency: CanonicalAgency) {
  if (agency.status !== "active") {
    throw new CanonicalAuthorizationError(403, "AGENCY_INACTIVE", "A agência não está ativa.");
  }
}

export async function requirePlatformAdmin(repository: CanonicalAuthorizationRepository, actorUserId: string) {
  assertActorUserId(actorUserId);
  if ((await repository.getGlobalRole(actorUserId)) !== "admin") {
    throw new CanonicalAuthorizationError(403, "PLATFORM_ADMIN_REQUIRED", "Administração global necessária.");
  }
  return { actorUserId, role: "admin" as const };
}

export async function resolveStrictBrandRef(repository: CanonicalAuthorizationRepository, brandRef: string): Promise<CanonicalBrand> {
  let parsed: ReturnType<typeof parseBrandRef>;
  try {
    parsed = parseBrandRef(brandRef);
  } catch {
    throw new CanonicalAuthorizationError(404, "BRAND_REF_INVALID", "Referência de marca inválida.");
  }
  const brand = await repository.findBrandById(parsed.brandId);
  if (!brand) throw new CanonicalAuthorizationError(404, "BRAND_NOT_FOUND", "Marca não encontrada.");
  if (brand.id !== parsed.brandId || normalizeBrandSlug(brand.name) !== parsed.brandSlug) {
    throw new CanonicalAuthorizationError(404, "BRAND_REF_MISMATCH", "Referência de marca divergente.");
  }
  requireActiveBrand(brand);
  return brand;
}

export async function requireBrandEditorialAccess(input: {
  repository: CanonicalAuthorizationRepository;
  brand: CanonicalBrand;
  actorUserId: string;
}) {
  assertActorUserId(input.actorUserId);
  requireActiveBrand(input.brand);
  if (input.brand.ownerUserId === input.actorUserId) {
    return { brand: input.brand, actorUserId: input.actorUserId, access: "owner" as const, membershipId: null };
  }
  const membership = await input.repository.findBrandMembership(input.brand.id, input.actorUserId);
  if (membership?.brandId === input.brand.id && membership.userId === input.actorUserId && membership.status === "active") {
    return { brand: input.brand, actorUserId: input.actorUserId, access: "member" as const, membershipId: membership.id };
  }

  const agencyIds = await input.repository.findActiveAgencyIdsByBrandId(input.brand.id);
  for (const agencyId of [...new Set(agencyIds)]) {
    const agency = await input.repository.findAgencyById(agencyId);
    if (!agency || agency.status !== "active") continue;
    if (agency.ownerUserId === input.actorUserId) {
      return { brand: input.brand, actorUserId: input.actorUserId, access: "agency_owner" as const, membershipId: null, agencyId: agency.id, agencyRole: "agency_admin" as const };
    }
    const agencyMembership = await input.repository.findAgencyMembership(agency.id, input.actorUserId);
    if (agencyMembership?.agencyId === agency.id && agencyMembership.userId === input.actorUserId && agencyMembership.status === "active") {
      return { brand: input.brand, actorUserId: input.actorUserId, access: "agency_member" as const, membershipId: agencyMembership.id, agencyId: agency.id, agencyRole: agencyMembership.role };
    }
  }
  throw new CanonicalAuthorizationError(403, "DENIED_NO_RELATION", "Acesso negado: não existe vínculo operacional com esta marca.");
}

export async function resolveStrictAgencyRef(repository: CanonicalAuthorizationRepository, agencyRef: string): Promise<CanonicalAgency> {
  let parsed: ReturnType<typeof parseAgencyRef>;
  try {
    parsed = parseAgencyRef(agencyRef);
  } catch {
    throw new CanonicalAuthorizationError(404, "AGENCY_REF_INVALID", "Referência de agência inválida.");
  }
  const agency = await repository.findAgencyById(parsed.agencyId);
  if (!agency) throw new CanonicalAuthorizationError(404, "AGENCY_NOT_FOUND", "Agência não encontrada.");
  if (agency.id !== parsed.agencyId || normalizeAgencyRefSlug(agency.name) !== parsed.agencySlug) {
    throw new CanonicalAuthorizationError(404, "AGENCY_REF_MISMATCH", "Referência de agência divergente.");
  }
  requireActiveAgency(agency);
  return agency;
}

export async function requireAgencyOperationalAccess(input: {
  repository: CanonicalAuthorizationRepository;
  agency: CanonicalAgency;
  actorUserId: string;
}) {
  assertActorUserId(input.actorUserId);
  requireActiveAgency(input.agency);
  if (input.agency.ownerUserId === input.actorUserId) {
    return { agency: input.agency, actorUserId: input.actorUserId, access: "owner" as const, membershipId: null, role: "agency_admin" as const };
  }
  const membership = await input.repository.findAgencyMembership(input.agency.id, input.actorUserId);
  if (membership?.agencyId === input.agency.id && membership.userId === input.actorUserId && membership.status === "active") {
    return { agency: input.agency, actorUserId: input.actorUserId, access: "member" as const, membershipId: membership.id, role: membership.role };
  }
  throw new CanonicalAuthorizationError(403, "AGENCY_ACCESS_DENIED", "Acesso operacional negado à agência.");
}

export async function resolveExactlyOneActiveAgencyForBrand(repository: CanonicalAuthorizationRepository, brandId: string) {
  if (!isTenantId(brandId)) throw new CanonicalAuthorizationError(404, "BRAND_NOT_FOUND", "Marca inválida.");
  const agencyIds = [...new Set(await repository.findActiveAgencyIdsByBrandId(brandId))];
  if (agencyIds.length === 0) throw new CanonicalAuthorizationError(409, "BRAND_AGENCY_MISSING", "A marca não possui agência operacional ativa.");
  if (agencyIds.length !== 1) throw new CanonicalAuthorizationError(409, "BRAND_AGENCY_AMBIGUOUS", "A marca possui agências operacionais ambíguas.");
  const agency = await repository.findAgencyById(agencyIds[0]);
  if (!agency) throw new CanonicalAuthorizationError(409, "BRAND_AGENCY_MISSING", "A agência operacional da marca não existe.");
  requireActiveAgency(agency);
  return agency;
}
