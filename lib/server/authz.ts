import { getServerSession } from "next-auth/next";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();

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

export interface SessionProfile {
  userId: string;
  email: string;
  role: "admin" | "cliente";
  marcaId: string | null;
  isAdmin: boolean;
  supabase: SupabaseClient;
}

async function buildSessionProfile(identity: { userId: string; email: string }): Promise<SessionProfile> {
  const email = identity.email.toLowerCase();
  const userId = identity.userId;

  let role: "admin" | "cliente" = "cliente";
  let marcaId: string | null = null;
  let isAdmin = email === ADMIN_EMAIL;

  // A identidade já foi validada pelo provedor de sessão. O perfil continua
  // sendo resolvido no servidor, por ID, e nunca por um valor enviado pelo cliente.
  if (!isAdmin) {
    const supabase = serviceClient();
    const { data: perfil, error } = await supabase
      .from("perfis")
      .select("role, marca_id")
      .eq("id", userId)
      .single();

    if (!error && perfil) {
      role = perfil.role === "admin" ? "admin" : "cliente";
      marcaId = perfil.marca_id || null;
      isAdmin = role === "admin";
    }
  } else {
    role = "admin";
  }

  return {
    userId,
    email,
    role,
    marcaId,
    isAdmin,
    supabase: serviceClient(),
  };
}

/**
 * Exige sessao valida e carrega o perfil do usuario (role + marca_id).
 * Lanca AuthzError(401) se nao houver sessao.
 */
export async function requireSessionProfile(): Promise<SessionProfile> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    throw new AuthzError(401, "Nao autorizado: sessao ausente.");
  }

  const email = (session.user.email || "").toLowerCase();
  const userId = session.user.id as string | undefined;
  const isConfiguredAdmin = email === ADMIN_EMAIL;

  if (!userId && !isConfiguredAdmin) {
    throw new AuthzError(401, "Nao autorizado: usuario sem id valido.");
  }

  return buildSessionProfile({ userId: userId || email, email });
}

/**
 * Resolve um perfil a partir de uma identidade já validada no Supabase Auth.
 * Usado por contratos server-side que recebem Bearer e não possuem cookie NextAuth.
 */
export async function requireSessionProfileForIdentity(identity: { userId: string; email?: string | null }): Promise<SessionProfile> {
  if (!identity.userId.trim()) throw new AuthzError(401, "Nao autorizado: usuario sem id valido.");
  const profile = await buildSessionProfile({ userId: identity.userId, email: identity.email || "" });
  if (profile.isAdmin) return profile;

  const profileResult = await profile.supabase.from("perfis").select("id").eq("id", identity.userId).maybeSingle();
  if (profileResult.error && !/does not exist|column/i.test(profileResult.error.message || "")) {
    throw new AuthzError(503, "Nao foi possivel validar o perfil da identidade.");
  }
  if (profileResult.data || profile.marcaId) return profile;

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

  const legacyMemberships = await profile.supabase
    .from("brand_memberships")
    .select("id")
    .eq("user_key", identity.email?.toLowerCase() || "")
    .eq("status", "active")
    .limit(1);
  if (!legacyMemberships.error && legacyMemberships.data?.length) return profile;
  if (legacyMemberships.error) throw new AuthzError(503, "Nao foi possivel validar o vinculo da identidade.");
  throw new AuthzError(403, "Identidade sem perfil autorizado.");
}

/**
 * Valida que o usuario pode acessar a marca informada.
 * Admin pode acessar qualquer marca. Cliente so a sua.
 */
export async function assertCanAccessMarca(
  userId: string,
  marcaId: string,
  ctx?: SessionProfile
): Promise<void> {
  const profile = ctx ?? (await requireSessionProfile());
  if (profile.isAdmin) return;
  if (profile.marcaId === marcaId) return;

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

  // Membership can be resolved canonically by auth.users UUID. The legacy
  // email key is used only when the canonical columns are unavailable.
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

  if (!error && !membership) throw new AuthzError(403, "Acesso negado a esta marca.");
  const legacy = await profile.supabase
    .from("brand_memberships")
    .select("id,status")
    .eq("marca_id", marcaId)
    .eq("user_key", profile.email.toLowerCase())
    .maybeSingle();
  if (!legacy.error && legacy.data?.status === "active") return;
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
  ctx?: SessionProfile
): Promise<void> {
  const profile = ctx ?? (await requireSessionProfile());
  const supabase = profile.supabase;

  const { data: kw, error } = await supabase
    .from("keywords_kgr")
    .select("id, lista_id, brand_id")
    .eq("id", keywordId)
    .single();

  if (error || !kw) {
    throw new AuthzError(404, "Keyword nao encontrada.");
  }

  if (!kw.brand_id) {
    throw new AuthzError(409, "Keyword sem tenant canônico.");
  }

  if (!profile.isAdmin && kw.brand_id !== marcaId) {
    throw new AuthzError(403, "Keyword nao pertence a marca permitida.");
  }

  if (kw.lista_id) {
    const { data: lista, error: listaErr } = await supabase
      .from("listas_kgr")
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
  ctx?: SessionProfile
): Promise<void> {
  const profile = ctx ?? (await requireSessionProfile());
  const supabase = profile.supabase;

  const { data: lista, error } = await supabase
    .from("listas_kgr")
    .select("marca_id")
    .eq("id", listaId)
    .single();

  if (error || !lista) {
    throw new AuthzError(404, "Lista nao encontrada.");
  }

  if (!profile.isAdmin && lista.marca_id !== marcaId) {
    throw new AuthzError(403, "Lista nao pertence a marca permitida.");
  }
}

/**
 * Garante que a keyword NAO esta publicada. Use antes de operacoes que poderiam
 * alterar campos estruturais (mesmo que o banco ja bloqueie via trigger).
 */
export async function assertNotPublishedKeyword(
  keywordId: string,
  ctx?: SessionProfile
): Promise<void> {
  const profile = ctx ?? (await requireSessionProfile());
  const supabase = profile.supabase;

  const { data: kw, error } = await supabase
    .from("keywords_kgr")
    .select("status")
    .eq("id", keywordId)
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
 * (via listas_kgr). Retorna true se existir. Usado para bloquear
 * exclusao de marca.
 */
export async function marcaHasPublished(
  marcaId: string,
  supabase?: SupabaseClient
): Promise<boolean> {
  const client = supabase ?? serviceClient();

  // 1. Busca listas da marca
  const { data: listas } = await client
    .from("listas_kgr")
    .select("id")
    .eq("marca_id", marcaId);
  const listaIds = (listas || []).map((l: { id: string }) => l.id);
  if (listaIds.length === 0) return false;

  // 2. Conta keywords publicadas nessas listas
  const { count } = await client
    .from("keywords_kgr")
    .select("id", { count: "exact", head: true })
    .eq("status", "publicado")
    .eq("brand_id", marcaId)
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
