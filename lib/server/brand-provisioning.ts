import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBrandRef } from "../tenant-routing.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProvisionBrandInput = {
  nome: string;
  site_url?: string | null;
  nicho?: string | null;
  dna_diretrizes?: string | null;
  silos_existentes?: Array<{ nome: string; slug?: string }>;
  localizacao?: string | null;
  ownerUserId?: string | null;
  ownerEmail?: string | null;
};

export class BrandProvisioningError extends Error {
  public readonly code: "OWNER_NOT_FOUND" | "OWNER_REQUIRED" | "OWNER_INVALID" | "BRAND_CREATE_FAILED" | "LIST_CREATE_FAILED" | "COMPENSATION_FAILED";
  public readonly status: number;

  constructor(code: "OWNER_NOT_FOUND" | "OWNER_REQUIRED" | "OWNER_INVALID" | "BRAND_CREATE_FAILED" | "LIST_CREATE_FAILED" | "COMPENSATION_FAILED", message: string, status = 409) {
    super(message);
    this.name = "BrandProvisioningError";
    this.code = code;
    this.status = status;
  }
}

type AuthUser = { id: string; email?: string | null };

async function resolveOwner(client: SupabaseClient, input: ProvisionBrandInput): Promise<AuthUser> {
  const ownerUserId = input.ownerUserId?.trim();
  const ownerEmail = input.ownerEmail?.trim().toLowerCase();
  if (!ownerUserId && !ownerEmail) throw new BrandProvisioningError("OWNER_REQUIRED", "Informe o e-mail ou o ID do owner.", 400);
  if (ownerUserId && !UUID_PATTERN.test(ownerUserId)) throw new BrandProvisioningError("OWNER_INVALID", "O ID do owner é inválido.", 400);

  if (ownerUserId) {
    const result = await client.auth.admin.getUserById(ownerUserId);
    if (result.error || !result.data.user) throw new BrandProvisioningError("OWNER_NOT_FOUND", "Não encontramos um usuário cadastrado com esse e-mail. Cadastre o usuário primeiro.");
    return { id: result.data.user.id, email: result.data.user.email };
  }

  for (let page = 1; page <= 100; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new BrandProvisioningError("OWNER_NOT_FOUND", "Não foi possível validar o usuário owner.", 503);
    const user = result.data.users.find(candidate => candidate.email?.toLowerCase() === ownerEmail);
    if (user) return { id: user.id, email: user.email };
    if (result.data.users.length < 1000) break;
  }
  throw new BrandProvisioningError("OWNER_NOT_FOUND", "Não encontramos um usuário cadastrado com esse e-mail. Cadastre o usuário primeiro.");
}

async function compensate(client: SupabaseClient, brandId: string, listIds: string[]) {
  if (listIds.length) {
    const result = await client.from("minerador_keyword_lists").delete().in("id", listIds);
    if (result.error) throw result.error;
  }
  const result = await client.from("marcas").delete().eq("id", brandId);
  if (result.error) throw result.error;
}

export async function provisionBrandWithOwner(client: SupabaseClient, actorUserId: string, input: ProvisionBrandInput) {
  void actorUserId;
  const owner = await resolveOwner(client, input);

  const brandResult = await client.from("marcas").insert({
    nome: input.nome.trim(),
    site_url: input.site_url?.trim() || null,
    nicho: input.nicho?.trim() || null,
    dna_diretrizes: input.dna_diretrizes?.trim() || null,
    silos_existentes: input.silos_existentes || [],
    localizacao: input.localizacao?.trim() || "",
    owner_user_id: owner.id,
    status: "active",
  }).select("*").single();
  if (brandResult.error || !brandResult.data?.id) throw new BrandProvisioningError("BRAND_CREATE_FAILED", "Não foi possível criar a marca.", 500);

  const brand = brandResult.data as { id: string; owner_user_id?: string | null; status?: string | null; nome: string };
  let listIds: string[] = [];
  try {
    const silos = (input.silos_existentes || []).filter(silo => silo.nome.trim());
    if (silos.length) {
      const listsResult = await client.from("minerador_keyword_lists").insert(silos.map(silo => ({ nome: silo.nome.trim(), nicho: input.nicho?.trim() || null, marca_id: brand.id }))).select("id");
      if (listsResult.error) throw new BrandProvisioningError("LIST_CREATE_FAILED", "Não foi possível criar os silos iniciais.", 500);
      listIds = (listsResult.data || []).map(item => item.id).filter((id): id is string => typeof id === "string");
    }

    if (brand.owner_user_id !== owner.id || brand.status !== "active") throw new BrandProvisioningError("BRAND_CREATE_FAILED", "A marca criada não possui ownership canônico ativo.", 500);
    return { ...brand, membership_id: null, owner_user_id: owner.id, brandRef: buildBrandRef(brand.nome, brand.id) };
  } catch (error) {
    try {
      await compensate(client, brand.id, listIds);
    } catch {
      throw new BrandProvisioningError("COMPENSATION_FAILED", "A criação falhou e a compensação não pôde ser confirmada. Nenhum sucesso foi informado.", 500);
    }
    throw error;
  }
}
