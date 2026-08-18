import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBrandRef, isTenantId } from "@/lib/tenant-routing";
import { normalizeSiteUrl } from "@/lib/marca/site-domain";

export class AdminBrandCreationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) {
    throw new AdminBrandCreationError(400, "ADMIN_BRAND_INVALID_INPUT", `${field} é obrigatório.`);
  }
  return value.trim();
}

function requiredId(value: unknown, field: string) {
  if (typeof value !== "string" || !isTenantId(value)) {
    throw new AdminBrandCreationError(400, "ADMIN_BRAND_INVALID_INPUT", `${field} é inválido.`);
  }
  return value;
}

function optionalText(value: unknown, field: string, max = 160) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new AdminBrandCreationError(400, "ADMIN_BRAND_INVALID_INPUT", `${field} é inválido.`);
  }
  return value.trim() || null;
}

function optionalSiteUrl(value: unknown) {
  const raw = optionalText(value, "O site", 2048);
  if (!raw) return null;
  try { return normalizeSiteUrl(raw); } catch { throw new AdminBrandCreationError(400, "ADMIN_BRAND_INVALID_INPUT", "Informe um endereço http ou https válido."); }
}

async function requireAuthUser(client: SupabaseClient, ownerUserId: string) {
  const result = await client.auth.admin.getUserById(ownerUserId);
  if (result.error || !result.data.user?.id) {
    throw new AdminBrandCreationError(404, "ADMIN_BRAND_OWNER_NOT_FOUND", "Não encontramos o proprietário selecionado. Cadastre o usuário primeiro.");
  }
}

async function requireActiveAgency(client: SupabaseClient, agencyId: string) {
  const result = await client.from("agencies").select("id,status").eq("id", agencyId).maybeSingle();
  if (result.error) throw new AdminBrandCreationError(503, "ADMIN_BRAND_AGENCY_LOOKUP_FAILED", "Não foi possível validar a agência selecionada.");
  if (!result.data) throw new AdminBrandCreationError(404, "ADMIN_BRAND_AGENCY_NOT_FOUND", "A agência selecionada não existe.");
  if (result.data.status !== "active") throw new AdminBrandCreationError(409, "ADMIN_BRAND_AGENCY_INACTIVE", "A agência selecionada está inativa.");
}

/**
 * This is the structural Admin flow. An agency link is administrative only;
 * neither the global Admin nor the selected owner receives a membership here.
 * PostgREST has no request-scoped transaction API, so a failed second write is
 * compensated synchronously before the endpoint reports failure.
 */
export async function createAdminBrandWithAgency(input: { client: SupabaseClient; name: unknown; ownerUserId: unknown; agencyId: unknown; siteUrl?: unknown; nicho?: unknown; localizacao?: unknown }) {
  const name = requiredText(input.name, "O nome da marca");
  const ownerUserId = requiredId(input.ownerUserId, "O proprietário");
  const agencyId = requiredId(input.agencyId, "A agência");
  const siteUrl = optionalSiteUrl(input.siteUrl);
  const nicho = optionalText(input.nicho, "O nicho");
  const localizacao = optionalText(input.localizacao, "A localização");
  await Promise.all([requireAuthUser(input.client, ownerUserId), requireActiveAgency(input.client, agencyId)]);

  const brandResult = await input.client.from("marcas").insert({
    nome: name,
    owner_user_id: ownerUserId,
    status: "active",
    site_url: siteUrl,
    nicho,
    dna_diretrizes: null,
    silos_existentes: [],
    localizacao: localizacao || "",
  }).select("id,nome,owner_user_id,status").single();
  if (brandResult.error || !brandResult.data?.id) {
    throw new AdminBrandCreationError(409, "ADMIN_BRAND_CREATE_FAILED", "Não foi possível criar a marca. Verifique o nome informado.");
  }

  const brand = brandResult.data;
  try {
    const linkResult = await input.client.from("agency_brands").insert({ agency_id: agencyId, brand_id: brand.id, status: "active" }).select("id,agency_id,brand_id,status").single();
    if (linkResult.error || !linkResult.data?.id) {
      throw new AdminBrandCreationError(409, "ADMIN_BRAND_LINK_FAILED", "A marca não pôde ser vinculada à agência selecionada.");
    }
    if (brand.owner_user_id !== ownerUserId || linkResult.data.agency_id !== agencyId || linkResult.data.brand_id !== brand.id || linkResult.data.status !== "active") {
      throw new AdminBrandCreationError(500, "ADMIN_BRAND_CONFIRMATION_FAILED", "A persistência da marca não pôde ser confirmada.");
    }
    return { id: brand.id, name: brand.nome, ownerUserId, agencyId, status: brand.status, brandRef: buildBrandRef(brand.nome, brand.id) };
  } catch (error) {
    const unlink = await input.client.from("agency_brands").delete().eq("agency_id", agencyId).eq("brand_id", brand.id);
    const compensation = await input.client.from("marcas").delete().eq("id", brand.id);
    if (unlink.error || compensation.error) {
      throw new AdminBrandCreationError(500, "ADMIN_BRAND_COMPENSATION_FAILED", "A criação da marca falhou e a reversão não pôde ser confirmada. Nenhum sucesso foi informado.");
    }
    throw error;
  }
}
