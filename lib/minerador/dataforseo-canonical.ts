import "server-only";

// Compatibility boundary for existing Minerador consumers. Connection and
// Secret Store resolution belongs to the shared server layer.
export {
  DATAFORSEO_ALLINTITLE_CAPABILITY_KEY,
  DATAFORSEO_SERP_COMPATIBILITY_CAPABILITY_KEY,
  DataForSeoCanonicalError,
  resolveDataForSeoCanonicalConfig,
  resolveDataForSeoCanonicalSerpCompatibilityConfig,
  resolveDataForSeoIntegrationEnvironment,
} from "@/lib/server/dataforseo-canonical";
export type { DataForSeoCanonicalResolution } from "@/lib/server/dataforseo-canonical";
