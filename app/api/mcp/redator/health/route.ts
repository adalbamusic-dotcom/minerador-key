import type { NextRequest } from "next/server";
import { PLATFORM_GUIDE_TOPICS, catalogToolNames } from "@/lib/agent/platform-catalog";
import { PLATFORM_CATALOG_HASH } from "@/lib/agent/catalog-hash";
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
  // Homologado em 2026-09-19 (docs/07-redator/estado-atual.md): login OAuth pelo ChatGPT,
  // consentimento, grant e save_writer_draft com readback. Só é verdadeiro com o OAuth ligado;
  // a data da homologação é registro documental, não inferência de runtime.
  const chatgptLoginReady = config.oauthEnabled;
  const blockers = config.oauthEnabled ? [] : ["oauth_disabled"];
  const payload = {
    ok: !failure,
    service: "minerador-key-mcp",
    transport: "streamable_http",
    endpoint: config.endpoint,
    catalog: {
      hash: PLATFORM_CATALOG_HASH,
      guideTopicCount: PLATFORM_GUIDE_TOPICS.length,
      toolCount: catalogToolNames().length,
    },
    authMode: config.oauthEnabled ? "oauth_supabase" : "delegated_bearer",
    remoteBearerAllowed: config.remoteBearerAllowed,
    oauth: {
      configured: config.oauthReady,
      requiredForPublicClient: true,
      issuer: config.oauthIssuer,
      protectedResourceMetadataUrl: config.oauthEnabled ? config.protectedResourceMetadataUrl : null,
    },
    readiness: {
      bearerTransportConfigured: !failure,
      oauthImplemented: true,
      oauthEnabled: config.oauthEnabled,
      chatgptLoginReady,
      authenticatedRoundTrip: config.oauthEnabled ? "homologated_2026-09-19" : "not_verified",
      blockers,
      verificationScope: "runtime_configuration_only",
    },
    checks: {
      publicEndpoint: Boolean(config.publicBaseUrl),
      https: config.httpsConfigured,
      hostAllowlist: true,
    },
    error: failure?.code || null,
  };
  return Response.json(payload, { status: failure ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
