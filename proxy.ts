import { NextResponse, type NextRequest } from "next/server";
import { legacyTargetFromPathname, retiredBrandModuleTarget } from "@/lib/legacy-routing";
import { refreshSupabaseSession } from "@/lib/supabase/session-proxy";

export async function proxy(request: NextRequest) {
  const sessionResponse = await refreshSupabaseSession(request);
  const retired = retiredBrandModuleTarget(request.nextUrl.pathname);
  if (retired) {
    const destino = NextResponse.redirect(new URL(retired, request.url), 308);
    sessionResponse.cookies.getAll().forEach(cookie => destino.cookies.set(cookie));
    return destino;
  }
  const target = legacyTargetFromPathname(request.nextUrl.pathname);
  if (!target) return sessionResponse;
  const url = new URL("/selecionar-marca", request.url);
  url.searchParams.set("continuar", target);
  request.nextUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));
  const response = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
  return response;
}

// `.well-known` é metadata público lido por clientes OAuth sem sessão; não passa pelo refresh.
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
