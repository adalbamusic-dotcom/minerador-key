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

  let role: "admin" | "cliente" = "cliente";
  let marcaId: string | null = null;
  let isAdmin = email === ADMIN_EMAIL;

  // Se nao e admin por e-mail, consulta o perfil no banco
  if (!isAdmin && userId) {
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
  } else if (isAdmin) {
    role = "admin";
  }

  if (!userId && !isAdmin) {
    throw new AuthzError(401, "Nao autorizado: usuario sem id valido.");
  }

  return {
    userId: userId || email,
    email,
    role,
    marcaId,
    isAdmin,
    supabase: serviceClient(),
  };
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
  if (!profile.marcaId || profile.marcaId !== marcaId) {
    throw new AuthzError(403, "Acesso negado a esta marca.");
  }
}

/**
 * Confirma que a keyword pertence a marca permitida (via lista_id -> listas_kgr.marca_id).
 * Lanca 404 se nao existir, 403 se for de outra marca.
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
    .select("id, lista_id")
    .eq("id", keywordId)
    .single();

  if (error || !kw) {
    throw new AuthzError(404, "Keyword nao encontrada.");
  }

  if (!kw.lista_id) {
    // Keyword sem lista: so pode pertencer a marca se admin (nao ha vinculo)
    if (!profile.isAdmin) {
      throw new AuthzError(404, "Keyword nao vinculada a uma lista.");
    }
    return;
  }

  const { data: lista, error: listaErr } = await supabase
    .from("listas_kgr")
    .select("marca_id")
    .eq("id", kw.lista_id)
    .single();

  if (listaErr || !lista) {
    throw new AuthzError(404, "Lista da keyword nao encontrada.");
  }

  if (!profile.isAdmin && lista.marca_id !== marcaId) {
    throw new AuthzError(403, "Keyword nao pertence a marca permitida.");
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
