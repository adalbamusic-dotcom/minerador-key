import { isTenantId, parseBrandRef, safeTenantNavigationSearch, tenantModuleFromPathname } from "@/lib/tenant-routing";
import { parseAgencyRef } from "@/lib/agency-routing";

export const GLOBAL_NAVIGATION_STORAGE_KEY = "minerador-key:global-navigation:v1";
export const SHELL_EXPANDED_STORAGE_KEY = "minerador-key:shell-expanded:v1";
export const SHELL_EXPANDED_COOKIE = "minerador-key-shell-expanded";
export const SELECTED_OPERATIONAL_BRAND_COOKIE = "minerador-key-operational-brand";

export type GlobalNavigationKind = "brand" | "agency" | "account" | "admin";

export type StoredGlobalNavigationContext = {
  kind: GlobalNavigationKind;
  pathname: string;
  search: string;
  brandId?: string;
  brandRef?: string;
  agencyId?: string;
  agencyRef?: string;
};

type StoredNavigationMap = {
  version: 1;
  actors: Record<string, StoredGlobalNavigationContext>;
};

function safePathname(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.length > 512) return null;
  return value;
}

function safeOptionalId(value: unknown) {
  return typeof value === "string" && isTenantId(value) ? value : undefined;
}

function safeOptionalRef(value: unknown, parser: (value: string) => unknown) {
  if (typeof value !== "string" || value.length > 256) return undefined;
  try {
    parser(value);
    return value;
  } catch {
    return undefined;
  }
}

function normalizeContext(value: unknown): StoredGlobalNavigationContext | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredGlobalNavigationContext>;
  if (candidate.kind !== "brand" && candidate.kind !== "agency" && candidate.kind !== "account" && candidate.kind !== "admin") return null;
  const pathname = safePathname(candidate.pathname);
  if (!pathname) return null;
  const search = typeof candidate.search === "string" ? safeTenantNavigationSearch(candidate.search) : "";
  const brandId = safeOptionalId(candidate.brandId);
  const agencyId = safeOptionalId(candidate.agencyId);
  const brandRef = candidate.brandRef ? safeOptionalRef(candidate.brandRef, parseBrandRef) : undefined;
  const agencyRef = candidate.agencyRef ? safeOptionalRef(candidate.agencyRef, parseAgencyRef) : undefined;
  return { kind: candidate.kind, pathname, search, ...(brandId ? { brandId } : {}), ...(brandRef ? { brandRef } : {}), ...(agencyId ? { agencyId } : {}), ...(agencyRef ? { agencyRef } : {}) };
}

function readStoredMap(): StoredNavigationMap {
  if (typeof window === "undefined") return { version: 1, actors: {} };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GLOBAL_NAVIGATION_STORAGE_KEY) || "null") as Partial<StoredNavigationMap> | null;
    if (!parsed || parsed.version !== 1 || !parsed.actors || typeof parsed.actors !== "object") return { version: 1, actors: {} };
    return { version: 1, actors: parsed.actors as Record<string, StoredGlobalNavigationContext> };
  } catch {
    return { version: 1, actors: {} };
  }
}

export function readGlobalNavigationContext(actorUserId: string | null | undefined) {
  if (!actorUserId || !isTenantId(actorUserId)) return null;
  return normalizeContext(readStoredMap().actors[actorUserId]);
}

export function writeGlobalNavigationContext(actorUserId: string | null | undefined, context: StoredGlobalNavigationContext) {
  if (typeof window === "undefined" || !actorUserId || !isTenantId(actorUserId)) return;
  const normalized = normalizeContext(context);
  if (!normalized) return;
  try {
    const stored = readStoredMap();
    stored.actors[actorUserId] = normalized;
    window.localStorage.setItem(GLOBAL_NAVIGATION_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Persistence is a convenience only. The server remains authoritative.
  }
}

/**
 * Visual preference only. It is intentionally separate from actor/context
 * authorization and never participates in restoring a tenant or permission.
 */
export function readShellExpandedPreference() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(SHELL_EXPANDED_STORAGE_KEY);
    return value === "true" ? true : value === "false" ? false : null;
  } catch {
    return null;
  }
}

export function readShellExpandedCookie(value: string | null | undefined) {
  return value === "true" ? true : value === "false" ? false : null;
}

export function writeShellExpandedPreference(expanded: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHELL_EXPANDED_STORAGE_KEY, String(expanded));
    document.cookie = `${SHELL_EXPANDED_COOKIE}=${String(expanded)}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // The shell remains usable when browser preference storage is unavailable.
  }
}

export function readSelectedOperationalBrandCookie(value: string | null | undefined) {
  return typeof value === "string" && isTenantId(value) ? value : null;
}

export function writeSelectedOperationalBrandPreference(brandId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!brandId || !isTenantId(brandId)) {
      document.cookie = `${SELECTED_OPERATIONAL_BRAND_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      return;
    }
    document.cookie = `${SELECTED_OPERATIONAL_BRAND_COOKIE}=${encodeURIComponent(brandId)}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // The server will simply ignore an unavailable visual/context hint.
  }
}

export function classifyGlobalNavigation(pathname: string): GlobalNavigationKind | null {
  if (/^\/agencias\/[^/]+(?:\/|$)/.test(pathname)) return "agency";
  if (/^\/admin(?:\/|$)/.test(pathname)) return "admin";
  if (/^\/conta(?:\/|$)/.test(pathname)) return "account";
  return tenantModuleFromPathname(pathname) ? "brand" : null;
}

export function buildGlobalNavigationContext(input: {
  pathname: string;
  search: string;
  brandId?: string | null;
  brandRef?: string | null;
  agencyId?: string | null;
  agencyRef?: string | null;
}): StoredGlobalNavigationContext | null {
  const kind = classifyGlobalNavigation(input.pathname);
  if (!kind) return null;
  const pathname = safePathname(input.pathname);
  if (!pathname) return null;
  const context: StoredGlobalNavigationContext = { kind, pathname, search: safeTenantNavigationSearch(input.search) };
  if (input.brandId && isTenantId(input.brandId)) context.brandId = input.brandId;
  if (input.brandRef) {
    const brandRef = safeOptionalRef(input.brandRef, parseBrandRef);
    if (brandRef) context.brandRef = brandRef;
  }
  if (input.agencyId && isTenantId(input.agencyId)) context.agencyId = input.agencyId;
  if (input.agencyRef) {
    const agencyRef = safeOptionalRef(input.agencyRef, parseAgencyRef);
    if (agencyRef) context.agencyRef = agencyRef;
  }
  return context;
}

export async function restoreLastGlobalNavigationContext(actorUserId: string | null | undefined) {
  const context = readGlobalNavigationContext(actorUserId);
  if (!context) return null;
  try {
    const response = await fetch("/api/contexts/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(context),
    });
    if (!response.ok) return null;
    const body = await response.json() as { target?: unknown };
    return typeof body.target === "string" && body.target.startsWith("/") && !body.target.startsWith("//") ? body.target : null;
  } catch {
    return null;
  }
}
