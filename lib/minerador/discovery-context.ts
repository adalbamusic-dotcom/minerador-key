import type { DiscoveryCustomerFocus, DiscoveryMode, DiscoverySearchDraft } from "../../modules/minerador/discovery/discovery-types.ts";
import { DISCOVERY_PERSPECTIVE_CLASSIFIER_VERSION } from "./discovery-perspective.ts";

export type DiscoveryRunContext = {
  discoveryMode: DiscoveryMode;
  discoveryFocus: DiscoveryCustomerFocus;
  seedOriginal: string | null;
  perspectiveClassifier: string | null;
};

export function discoveryModeOfDraft(draft: Pick<DiscoverySearchDraft, "discoveryMode">) {
  return draft.discoveryMode === "customer_discovery" ? "customer_discovery" as const : "keyword" as const;
}

export function discoveryFocusOfDraft(draft: Pick<DiscoverySearchDraft, "discoveryFocus">) {
  return draft.discoveryFocus === "hire" ? "hire" as const : "all_customer" as const;
}

export function buildDiscoveryRunSourceData(draft: DiscoverySearchDraft): Record<string, unknown> | null {
  if (discoveryModeOfDraft(draft) !== "customer_discovery") return null;
  return {
    discoveryMode: "customer_discovery",
    discoveryFocus: discoveryFocusOfDraft(draft),
    seedOriginal: draft.seed.trim(),
    perspectiveClassifier: DISCOVERY_PERSPECTIVE_CLASSIFIER_VERSION,
  };
}

export function readDiscoveryRunContext(value: unknown): DiscoveryRunContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  if (object.discoveryMode !== "customer_discovery") return null;
  return {
    discoveryMode: "customer_discovery",
    discoveryFocus: object.discoveryFocus === "hire" ? "hire" : "all_customer",
    seedOriginal: typeof object.seedOriginal === "string" ? object.seedOriginal : null,
    perspectiveClassifier: typeof object.perspectiveClassifier === "string" ? object.perspectiveClassifier : null,
  };
}
