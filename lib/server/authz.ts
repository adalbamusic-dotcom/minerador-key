import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseUser, SupabaseSessionError } from "@/lib/server/supabase-session";

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

/**
 * Erro de autorizacao carregando o status HTTP que deve ser retornado.
 * As rotas de API devem capturar AuthzError e responder com o status correto.
 */
export class AuthzError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
  }
}

export interface CanonicalSessionProfile {
  userId: string;
  role: "admin" | "cliente";
  isAdmin: boolean;
  supabase: SupabaseClient;
}

async function buildCanonicalSessionProfile(identity: { userId: string }): Promise<CanonicalSessionProfile> {
  const userId = identity.userId;

  let role: "admin" | "cliente" = "cliente";
  let isAdmin = false;

  // A identidade já foi validada pelo provedor de sessão. O perfil continua
  // sendo resolvido no servidor, por ID, e nunca por um valor enviado pelo cliente.
  const supabase = serviceClient();
  const { data: perfil, error } = await supabase
    .from("perfis")
    .select("role")
    .eq("id", userId)
    .single();

  if (!error && perfil) {
    role = perfil.role === "admin" ? "admin" : "cliente";
    isAdmin = role === "admin";
  }

  return {
    userId,
    role,
    isAdmin,
    supabase: serviceClient(),
  };
}

/**
 * Exige sessao valida e carrega somente o papel global persistido do ator.
 * Lanca AuthzError(401) se nao houver sessao.
 */
export async function requireCanonicalSessionProfile(): Promise<CanonicalSessionProfile> {
  try {
    const user = await requireSupabaseUser();
    return buildCanonicalSessionProfile({ userId: user.id });
  } catch {
    throw new AuthzError(401, "Nao autorizado: sessao Supabase ausente.");
  }
}

/**
 * Resolve um perfil a partir de uma identidade já validada no Supabase Auth.
 * Usado por contratos server-side que recebem uma identidade já validada pelo Supabase.
 */
export async function requireCanonicalSessionProfileForIdentity(identity: { userId: string }): Promise<CanonicalSessionProfile> {
  if (!identity.userId.trim()) throw new AuthzError(401, "Nao autorizado: usuario sem id valido.");
  const profile = await buildCanonicalSessionProfile({ userId: identity.userId });
  const profileResult = await profile.supabase.from("perfis").select("id").eq("id", identity.userId).maybeSingle();
  if (profileResult.error && !/does not exist|column/i.test(profileResult.error.message || "")) {
    throw new AuthzError(503, "Nao foi possivel validar o perfil da identidade.");
  }
  if (profileResult.data) return profile;

  const memberships = await profile.supabase
    .from("brand_memberships")
    .select("id")
    .eq("member_user_id", identity.userId)
    .eq("status", "active")
    .limit(1);
  if (!memberships.error && memberships.data?.length) return profile;
  if (memberships.error && !/does not exist|column/i.test(memberships.error.message || "")) {
    throw new AuthzError(503, "Nao foi possivel validar o vinculo da identidade.");
  }

  throw new AuthzError(403, "Identidade sem perfil autorizado.");
}

/**
 * Valida que o usuario pode acessar a marca informada.
 * O papel global nunca concede acesso editorial. Owner e membership ativo
 * continuam sendo os únicos vínculos válidos para uma marca.
 */
export async function assertCanAccessMarca(
  userId: string,
  marcaId: string,
  ctx?: CanonicalSessionProfile
): Promise<void> {
  const profile = ctx ?? (await requireCanonicalSessionProfile());
  const owner = await profile.supabase
    .from("marcas")
    .select("id")
    .eq("id", marcaId)
    .eq("owner_user_id", profile.userId)
    .maybeSingle();
  if (!owner.error && owner.data) return;
  if (owner.error && !/does not exist|column/i.test(owner.error.message || "")) {
    throw new AuthzError(503, "Nao foi possivel validar o owner da marca.");
  }

  const { data: membership, error } = await profile.supabase
    .from("brand_memberships")
    .select("id,status,member_user_id")
    .eq("marca_id", marcaId)
    .eq("member_user_id", profile.userId)
    .maybeSingle();
  if (!error && membership?.status === "active") return;
  if (error && !/does not exist|column/i.test(error.message || "")) {
    throw new AuthzError(503, "Nao foi possivel validar o membership da marca.");
  }

  const links = await profile.supabase.from("agency_brands").select("agency_id").eq("brand_id", marcaId).eq("status", "active");
  if (links.error) throw new AuthzError(503, "Nao foi possivel validar o vinculo Agency-Brand.");
  for (const link of links.data || []) {
    const agency = await profile.supabase.from("agencies").select("id,owner_user_id,status").eq("id", link.agency_id).eq("status", "active").maybeSingle();
    if (agency.error) throw new AuthzError(503, "Nao foi possivel validar a Agency.");
    if (agency.data?.owner_user_id === profile.userId) return;
    const agencyMembership = await profile.supabase.from("agency_memberships").select("id,status").eq("agency_id", link.agency_id).eq("user_id", profile.userId).maybeSingle();
    if (agencyMembership.error) throw new AuthzError(503, "Nao foi possivel validar o membership da Agency.");
    if (agencyMembership.data?.status === "active") return;
  }

  throw new AuthzError(403, "Acesso negado a esta marca.");
}

/**
 * Confirma que a keyword pertence ao tenant canônico da marca.
 * `brand_id` é a fonte de verdade inclusive quando `lista_id` é null;
 * a lista, quando presente, deve continuar coerente com o mesmo tenant.
 */
export async function assertKeywordBelongsToMarca(
  keywordId: string,
  marcaId: string,
  ctx?: CanonicalSessionProfile
): Promise<void> {
  const profile = ctx ?? (await requireCanonicalSessionProfile());
  const supabase = profile.supabase;

  const { data: kw, error } = await supabase
    .from("minerador_keywords")
    .select("id, lista_id, brand_id")
    .eq("id", keywordId)
    .is("deleted_at", null)
    .single();

  if (error || !kw) {
    throw new AuthzError(404, "Keyword nao encontrada.");
  }

  if (!kw.brand_id) {
    throw new AuthzError(409, "Keyword sem tenant canônico.");
  }

  if (kw.brand_id !== marcaId) {
    throw new AuthzError(403, "Keyword nao pertence a marca permitida.");
  }

  if (kw.lista_id) {
    const { data: lista, error: listaErr } = await supabase
      .from("minerador_keyword_lists")
      .select("marca_id")
      .eq("id", kw.lista_id)
      .single();

    if (listaErr || !lista) {
      throw new AuthzError(404, "Lista da keyword nao encontrada.");
    }

    if (lista.marca_id !== kw.brand_id) {
      throw new AuthzError(409, "Keyword e lista possuem tenants divergentes.");
    }
  }
}

/**
 * Confirma que a lista/silo pertence a marca permitida.
 */
export async function assertListaBelongsToMarca(
  listaId: string,
  marcaId: string,
  ctx?: CanonicalSessionProfile
): Promise<void> {
  const profile = ctx ?? (await requireCanonicalSessionProfile());
  const supabase = profile.supabase;

  const { data: lista, error } = await supabase
    .from("minerador_keyword_lists")
    .select("marca_id")
    .eq("id", listaId)
    .single();

  if (error || !lista) {
    throw new AuthzError(404, "Lista nao encontrada.");
  }

  if (lista.marca_id !== marcaId) {
    throw new AuthzError(403, "Lista nao pertence a marca permitida.");
  }
}

/**
 * Garante que a keyword NAO esta publicada. Use antes de operacoes que poderiam
 * alterar campos estruturais (mesmo que o banco ja bloqueie via trigger).
 */
export async function assertNotPublishedKeyword(
  keywordId: string,
  ctx?: CanonicalSessionProfile
): Promise<void> {
  const profile = ctx ?? (await requireCanonicalSessionProfile());
  const supabase = profile.supabase;

  const { data: kw, error } = await supabase
    .from("minerador_keywords")
    .select("status")
    .eq("id", keywordId)
    .is("deleted_at", null)
    .single();

  if (error || !kw) {
    throw new AuthzError(404, "Keyword nao encontrada.");
  }

  if ((kw.status || "").toLowerCase() === "publicado") {
    throw new AuthzError(
      409,
      "PUBLICADO_PROTEGIDO: operacao recusada pois a keyword esta publicada."
    );
  }
}

/**
 * Verifica se existe alguma keyword publicada ligada a uma marca
 * (via minerador_keyword_lists). Retorna true se existir. Usado para bloquear
 * exclusao de marca.
 */
export async function marcaHasPublished(
  marcaId: string,
  supabase?: SupabaseClient
): Promise<boolean> {
  const client = supabase ?? serviceClient();

  // 1. Busca listas da marca
  const { data: listas } = await client
    .from("minerador_keyword_lists")
    .select("id")
    .eq("marca_id", marcaId);
  const listaIds = (listas || []).map((l: { id: string }) => l.id);
  if (listaIds.length === 0) return false;

  // 2. Conta keywords publicadas nessas listas
  const { count } = await client
    .from("minerador_keywords")
    .select("id", { count: "exact", head: true })
    .eq("status", "publicado")
    .eq("brand_id", marcaId)
    .is("deleted_at", null)
    .in("lista_id", listaIds);

  if ((count || 0) > 0) return true;

  // 3. Tenta briefings publicados ligados as listas da marca (se a tabela suportar)
  try {
    const { count: bCount } = await client
      .from("briefings_artigos")
      .select("id", { count: "exact", head: true })
      .eq("status", "publicado")
      .in("silo_id", listaIds);
    return (bCount || 0) > 0;
  } catch {
    // Tabela/coluna pode nao existir; ignora (o trigger do banco cobre)
    return false;
  }
}

/**
 * Helper para responder a um AuthzError em uma rota de API.
 */
export function authzErrorResponse(err: unknown) {
  if (err instanceof SupabaseSessionError) {
    return { status: 401, message: err.message };
  }
  if (err instanceof AuthzError) {
    return { status: err.status, message: err.message };
  }
  if (
    err instanceof Error &&
    "status" in err &&
    typeof (err as Error & { status?: unknown }).status === "number"
  ) {
    return {
      status: (err as Error & { status: number }).status,
      message: err.message,
    };
  }
  const message =
    err instanceof Error ? err.message : "Erro interno.";
  return { status: 500, message };
}
