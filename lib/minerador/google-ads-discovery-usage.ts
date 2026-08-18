import "server-only";

import {
  recordGoogleAdsInfrastructureUsage,
  resolveGoogleAdsInfrastructureUsageForActor,
  type IntegrationEnvironment,
  type IntegrationRuntimeDependencies,
  type IntegrationUsageEvent,
} from "@/lib/server/integrations-runtime";
import { resolveGoogleAdsIntegrationEnvironment } from "@/lib/server/google-ads-canonical";

export const GOOGLE_ADS_DISCOVERY_USAGE_CAPABILITY = "google_ads_keyword_discovery" as const;

export class GoogleAdsDiscoveryUsageError extends Error {
  readonly code = "GOOGLE_ADS_USAGE_RECORDING_FAILED" as const;
  readonly causeCode: string | null;

  constructor(message = "O consumo da Descoberta Google Ads não pôde ser registrado com segurança.", causeCode: string | null = null) {
    super(message);
    this.name = "GoogleAdsDiscoveryUsageError";
    this.causeCode = causeCode;
  }
}

function safeCauseCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const value = String((error as { code: unknown }).code);
  return /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

export function googleAdsDiscoveryUsageKey(operationRequestId: string) {
  return `google_ads:${operationRequestId}:keyword_discovery`;
}

export async function recordGoogleAdsDiscoveryUsage(input: {
  actorUserId: string;
  agencyId: string | null;
  brandId: string;
  operationRequestId: string;
  resultStatus: "succeeded" | "failed";
  providerReference?: string | null;
  errorCode?: string | null;
  discoveryRunId?: string | null;
  receivedCount?: number;
  normalizedCount?: number;
  approvedCount?: number;
  filteredCount?: number;
  environment?: IntegrationEnvironment;
  dependencies: IntegrationRuntimeDependencies;
}): Promise<IntegrationUsageEvent> {
  try {
    const usage = await resolveGoogleAdsInfrastructureUsageForActor({
      actorUserId: input.actorUserId,
      agencyId: input.agencyId,
      brandId: input.brandId,
      capabilityKey: GOOGLE_ADS_DISCOVERY_USAGE_CAPABILITY,
      operation: "keyword_discovery",
      environment: input.environment || resolveGoogleAdsIntegrationEnvironment(),
      quotaUnits: 1,
    }, input.dependencies);

    if (usage.provider.provider_key !== "google_ads" || usage.capability.capability_key !== GOOGLE_ADS_DISCOVERY_USAGE_CAPABILITY) {
      throw new GoogleAdsDiscoveryUsageError("O ledger de Usage resolveu um provider diferente de Google Ads.", "GOOGLE_ADS_PROVIDER_MISMATCH");
    }

    const event = await recordGoogleAdsInfrastructureUsage({
      usage,
      operation: "module_operation",
      module: "minerador",
      resultStatus: input.resultStatus,
      units: 1,
      providerReference: input.providerReference || null,
      errorCode: input.errorCode || null,
      idempotencyKey: googleAdsDiscoveryUsageKey(input.operationRequestId),
      metadata: {
        operationRequestId: input.operationRequestId,
        discoveryRunId: input.discoveryRunId || null,
        provider: "google_ads",
        providerVersion: "v25",
        receivedCount: input.receivedCount ?? null,
        normalizedCount: input.normalizedCount ?? null,
        approvedCount: input.approvedCount ?? null,
        filteredCount: input.filteredCount ?? null,
      },
    }, input.dependencies);

    if (!event) throw new GoogleAdsDiscoveryUsageError("A capability Google Ads Discovery não está disponível para o ledger de Usage.", "GOOGLE_ADS_DISCOVERY_CAPABILITY_MISSING");
    return event;
  } catch (error) {
    if (error instanceof GoogleAdsDiscoveryUsageError) throw error;
    throw new GoogleAdsDiscoveryUsageError(undefined, safeCauseCode(error));
  }
}
