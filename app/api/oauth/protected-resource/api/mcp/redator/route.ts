import { protectedResourceMetadataResponse } from "@/lib/server/mcp-oauth";

/*
 * Caminho RFC 9728 específico do recurso:
 * `/.well-known/oauth-protected-resource/api/mcp/redator`, também por rewrite.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return protectedResourceMetadataResponse();
}
