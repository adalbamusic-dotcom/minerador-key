import { NextResponse } from "next/server";
import { authzErrorResponse } from "@/lib/server/authz";
import { createCanonicalServiceClient, requireCanonicalPlatformAdmin } from "@/lib/server/canonical-authorization";
import {
  createPlatformIntegrationCapability,
  createPlatformIntegrationConnection,
  grantPlatformIntegrationToAgency,
  applyPlatformHomologationPolicy,
  bootstrapPlatformCapabilityCatalog,
  configureSupportedPlatformProvider,
  configurePlatformGoogleAdsConnection,
  updatePlatformGoogleAdsResearchCustomerId,
  healthCheckPlatformIntegrationConnection,
  createPlatformIntegrationProvider,
  PlatformIntegrationsAdminError,
  readPlatformIntegrations,
  updatePlatformIntegrationCapability,
  updatePlatformIntegrationProvider,
  rotatePlatformGoogleAdsRefreshToken,
} from "@/lib/server/platform-integrations-admin";
import { configureTelegramPlatformWebhook, TelegramWebhookAdminError } from "@/lib/server/telegram/admin";

function errorResponse(error: unknown) {
  if (error instanceof PlatformIntegrationsAdminError) {
    return NextResponse.json({ error: error.message, code: error.code, diagnostic: error.diagnostics, providerRequestRef: error.providerRequestRef }, { status: error.status });
  }
  if (error instanceof TelegramWebhookAdminError) {
    return NextResponse.json({ error: error.message, code: error.code, diagnostic: error.diagnostics, providerRequestRef: error.providerRequestRef }, { status: error.status });
  }
  const mapped = authzErrorResponse(error);
  return NextResponse.json({ error: mapped.status >= 500 ? "Não foi possível concluir a operação de integrações." : mapped.message }, { status: mapped.status });
}

export async function GET() {
  try {
    await requireCanonicalPlatformAdmin();
    return NextResponse.json(await readPlatformIntegrations(createCanonicalServiceClient()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireCanonicalPlatformAdmin();
    const body = await request.json().catch(() => null) as { action?: unknown; [key: string]: unknown } | null;
    if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Ação de integração inválida.", code: "INTEGRATIONS_INVALID_INPUT" }, { status: 400 });
    const client = createCanonicalServiceClient();
    let result: unknown;
    switch (body.action) {
      case "create_provider":
        result = await createPlatformIntegrationProvider(client, { providerKey: body.providerKey, displayName: body.displayName, status: body.status });
        break;
      case "update_provider":
        result = await updatePlatformIntegrationProvider(client, { id: body.id, displayName: body.displayName, status: body.status });
        break;
      case "create_capability":
        result = await createPlatformIntegrationCapability(client, { capabilityKey: body.capabilityKey, operationKind: body.operationKind, environment: body.environment, unitName: body.unitName, status: body.status });
        break;
      case "update_capability":
        result = await updatePlatformIntegrationCapability(client, { id: body.id, unitName: body.unitName, status: body.status });
        break;
      case "create_platform_connection":
        result = await createPlatformIntegrationConnection(client, admin.actorUserId, { providerId: body.providerId, environment: body.environment, label: body.label });
        break;
      case "grant_platform_to_agency":
        result = await grantPlatformIntegrationToAgency(client, admin.actorUserId, { capabilityId: body.capabilityId, connectionId: body.connectionId, agencyId: body.agencyId, environment: body.environment });
        break;
      case "apply_platform_homologation_policy":
        result = await applyPlatformHomologationPolicy(client, admin.actorUserId);
        break;
      case "bootstrap_platform_capability_catalog":
        result = await bootstrapPlatformCapabilityCatalog(client, admin.actorUserId);
        break;
      case "configure_platform_google_ads_connection":
        result = await configurePlatformGoogleAdsConnection(client, {
          connectionId: body.connectionId,
          managerCustomerId: body.managerCustomerId,
          researchCustomerId: body.researchCustomerId,
          secretPayload: body.secretPayload,
          label: body.label,
        });
        break;
      case "rotate_google_ads_refresh_token":
        result = await rotatePlatformGoogleAdsRefreshToken(client, admin.actorUserId, {
          refreshToken: body.refreshToken,
          label: body.label,
        });
        break;
      case "update_google_ads_research_customer_id":
        result = await updatePlatformGoogleAdsResearchCustomerId(client, {
          connectionId: body.connectionId,
          researchCustomerId: body.researchCustomerId,
        });
        break;
      case "configure_supported_platform_provider":
        result = await configureSupportedPlatformProvider(client, admin.actorUserId, {
          providerKey: body.providerKey,
          environment: body.environment,
          label: body.label,
          managerCustomerId: body.managerCustomerId,
          researchCustomerId: body.researchCustomerId,
          bucketName: body.bucketName,
          youtubeHealthVideoId: body.youtubeHealthVideoId,
          telegramWebhookUrl: body.telegramWebhookUrl,
          secretPayload: body.secretPayload,
        });
        break;
      case "health_check_platform_connection":
        result = await healthCheckPlatformIntegrationConnection(client, {
          connectionId: body.connectionId,
          providerKey: body.providerKey,
          healthOperation: body.healthOperation,
        });
        break;
      case "configure_telegram_webhook":
        result = await configureTelegramPlatformWebhook({ client, connectionId: String(body.connectionId || ""), url: String(body.url || "") });
        break;
      default:
        return NextResponse.json({ error: "Ação de integração inválida.", code: "INTEGRATIONS_INVALID_ACTION" }, { status: 400 });
    }
    return NextResponse.json({ success: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
