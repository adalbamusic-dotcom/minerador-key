import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authzErrorResponse } from "@/lib/server/authz";
import { requireCanonicalPlatformAdmin } from "@/lib/server/canonical-authorization";
import { GlobalUserAdminError, listAdminUsers, setAdminGlobalRole } from "@/lib/server/global-user-admin";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Configuração server-side do Supabase ausente.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function errorResponse(error: unknown) {
  if (error instanceof GlobalUserAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.status >= 500 ? "Não foi possível concluir a operação administrativa." : mapped.message }, { status: mapped.status });
}

export async function GET(request: Request) {
  try {
    await requireCanonicalPlatformAdmin();
    const query = new URL(request.url).searchParams.get("q") || "";
    return NextResponse.json(await listAdminUsers({ client: createServiceClient(), profile: { isAdmin: true }, query }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao consultar usuários administrativos:", { status: error instanceof GlobalUserAdminError ? error.status : 500 });
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireCanonicalPlatformAdmin();
    const body = await request.json().catch(() => null) as { userId?: unknown; action?: unknown } | null;
    if (!body) return NextResponse.json({ error: "Dados inválidos para alteração de papel." }, { status: 400 });
    const result = await setAdminGlobalRole({ client: createServiceClient(), profile: { isAdmin: true }, userId: body.userId, action: body.action });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erro ao alterar papel global:", { status: error instanceof GlobalUserAdminError ? error.status : 500 });
    return errorResponse(error);
  }
}
