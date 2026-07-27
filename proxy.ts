import { NextResponse, type NextRequest } from "next/server";
import { legacyTargetFromPathname } from "@/lib/legacy-routing";

export function proxy(request: NextRequest) {
  const target = legacyTargetFromPathname(request.nextUrl.pathname);
  if (!target) return NextResponse.next();
  const url = new URL("/selecionar-marca", request.url);
  url.searchParams.set("continuar", target);
  request.nextUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/marca", "/conta", "/minerador", "/arquiteto", "/radar", "/planejador", "/redator", "/publicacoes"] };
