import type { SupabaseClient } from "@supabase/supabase-js";
import type { SerpResearchSnapshot, SerpSearchInput } from "../radar/serp/contracts";
import { collectDataForSeoSerpSnapshot, type DataForSeoSerpProviderDiagnostic } from "../server/dataforseo-serp-operation.ts";
import type { IntegrationEnvironment, IntegrationRuntimeDependencies, IntegrationResolvedResource } from "../server/integrations-runtime.ts";
import type { IntegrationSecretStore } from "../server/integration-secret-store.ts";
import type { DataForSeoSerpConfig } from "../minerador/dataforseo-serp-core.ts";

export const DATAFORSEO_SERP_COMPATIBILITY_STATUS = "AVAILABLE_FROM_GLOBAL_DATAFORSEO" as const;

type CanonicalClient = Pick<SupabaseClient, "from" | "rpc">;

export type DataForSeoCompatibilityOptions = {
  actorUserId: string;
  agencyId?: string | null;
  brandId?: string;
  client?: CanonicalClient;
  secretStore?: IntegrationSecretStore;
  runtimeDependencies?: IntegrationRuntimeDependencies;
  environment?: IntegrationEnvironment;
  technicalEnvironment?: NodeJS.ProcessEnv;
  quotaUnits?: number;
  operationRequestId?: string;
  resolution?: { resource: IntegrationResolvedResource; config: DataForSeoSerpConfig; environment: IntegrationEnvironment; credentialSource: "connection" };
  fetchImpl?: typeof fetch;
  onRequestBuilt?: () => void;
  onRequestStarted?: () => void;
  onHttpResponse?: (status: number) => void;
  onProviderResponse?: (diagnostic: DataForSeoSerpProviderDiagnostic) => void;
  onNormalizationSucceeded?: () => void;
};

export async function resolveDataForSeoCompatibilityConfig(input: Omit<DataForSeoCompatibilityOptions, "resolution" | "operationRequestId" | "fetchImpl" | "onRequestStarted"> & { brandId: string }) {
  // A consulta de formação usa uma SERP normal. Este resolvedor somente
  // reutiliza a Connection global DataForSEO READY já exposta pela Plataforma;
  // ele não pede uma capability específica de SERP do Arquiteto.
  const { resolveDataForSeoCanonicalConfig } = await import("../server/dataforseo-canonical.ts");
  return resolveDataForSeoCanonicalConfig({
    actorUserId: input.actorUserId,
    agencyId: input.agencyId,
    brandId: input.brandId,
    client: input.client,
    secretStore: input.secretStore,
    runtimeDependencies: input.runtimeDependencies,
    environment: input.environment,
    technicalEnvironment: input.technicalEnvironment,
    quotaUnits: input.quotaUnits,
  });
}

export async function collectDataForSeoCompatibilitySnapshot(
  input: SerpSearchInput,
  options: DataForSeoCompatibilityOptions,
): Promise<SerpResearchSnapshot> {
  const resolution = options.resolution || await resolveDataForSeoCompatibilityConfig({
    actorUserId: options.actorUserId,
    agencyId: options.agencyId,
    brandId: options.brandId || input.brandId,
    client: options.client,
    secretStore: options.secretStore,
    runtimeDependencies: options.runtimeDependencies,
    environment: options.environment,
    technicalEnvironment: options.technicalEnvironment,
    quotaUnits: options.quotaUnits,
  });

  return collectDataForSeoSerpSnapshot(input, {
    config: resolution.config,
    operationRequestId: options.operationRequestId || crypto.randomUUID(),
    fetchImpl: options.fetchImpl,
    onRequestBuilt: options.onRequestBuilt,
    onRequestStarted: options.onRequestStarted,
    onHttpResponse: options.onHttpResponse,
    onProviderResponse: options.onProviderResponse,
    onNormalizationSucceeded: options.onNormalizationSucceeded,
  });
}
