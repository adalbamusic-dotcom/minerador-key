import type { NextRequest } from "next/server";
import { mcpRuntimeFailure, readMcpRuntimeConfig } from "@/lib/server/mcp-runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = readMcpRuntimeConfig();
  const host = request.headers.get("host") || "";
  if (!config.allowedHosts.includes(host)) {
    return Response.json({ ok: false, code: "host_not_allowed" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const failure = mcpRuntimeFailure(config);
  const payload = {
    ok: !failure,
    service: "minerador-key-redator-mcp",
    transport: "streamable_http",
    endpoint: config.endpoint,
    authMode: "delegated_bearer",
    remoteBearerAllowed: config.remoteBearerAllowed,
    oauth: { configured: false, requiredForPublicClient: true },
    checks: {
      publicEndpoint: Boolean(config.publicBaseUrl),
      https: config.httpsConfigured,
      hostAllowlist: true,
    },
    error: failure?.code || null,
  };
  return Response.json(payload, { status: failure ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}

