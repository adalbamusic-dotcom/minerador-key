import { protectedResourceMetadataResponse } from "@/lib/server/mcp-oauth";

/*
 * Servido em `/.well-known/oauth-protected-resource` por rewrite do
 * `next.config.ts`. Público, sem segredo, sem cookie: só diz qual issuer
 * emite tokens para o MCP do Redator.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return protectedResourceMetadataResponse();
}
