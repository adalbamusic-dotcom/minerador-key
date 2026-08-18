import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authzErrorResponse } from "@/lib/server/authz";
import { requireCanonicalPlatformAdmin } from "@/lib/server/canonical-authorization";
import { searchAuthUsers } from "@/lib/server/auth-users";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Configuração server-side do Supabase ausente.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  try {
    await requireCanonicalPlatformAdmin();
    const query = new URL(request.url).searchParams.get("q") || "";
    if (query.trim().length < 2) return NextResponse.json({ users: [] });
    return NextResponse.json({ users: await searchAuthUsers(createServiceClient(), query) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    console.error("Erro na busca de usuários owner:", { status: mapped.status });
    return NextResponse.json({ error: mapped.status >= 500 ? "Não foi possível consultar os usuários Auth." : mapped.message }, { status: mapped.status });
  }
}
