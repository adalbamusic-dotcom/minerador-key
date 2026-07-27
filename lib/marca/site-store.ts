import { readBrowserArtifact, writeBrowserArtifact } from "../editorial/browser-artifact-store.ts";
import { BrandSiteWorkspaceSchema, type BrandSiteWorkspace } from "./site-contracts.ts";

export function siteWorkspaceStorageKey(brandId: string): string {
  return `minerador-pro:site-workspace:${brandId}`;
}

export function emptyBrandSiteWorkspace(brandId: string, now = new Date().toISOString()): BrandSiteWorkspace {
  return BrandSiteWorkspaceSchema.parse({ brandId, persistenceMode: "local_fallback", sitemaps: [], syncRuns: [], catalog: [], verifications: [], candidates: [], importBatches: [], events: [], updatedAt: now });
}

export async function loadBrandSiteWorkspace(brandId: string): Promise<{ workspace: BrandSiteWorkspace; parseError: string | null }> {
  const raw = await readBrowserArtifact(siteWorkspaceStorageKey(brandId));
  if (raw === null) return { workspace: emptyBrandSiteWorkspace(brandId), parseError: null };
  try {
    const workspace = BrandSiteWorkspaceSchema.parse(raw);
    if (workspace.brandId !== brandId) throw new Error("O workspace local não pertence à marca solicitada.");
    return { workspace, parseError: null };
  } catch (error) {
    return { workspace: emptyBrandSiteWorkspace(brandId), parseError: error instanceof Error ? error.message : "Estado local inválido." };
  }
}

export async function saveBrandSiteWorkspace(workspace: BrandSiteWorkspace): Promise<"indexeddb" | "localstorage"> {
  const validated = BrandSiteWorkspaceSchema.parse({ ...workspace, persistenceMode: "local_fallback", updatedAt: new Date().toISOString() });
  return writeBrowserArtifact(siteWorkspaceStorageKey(validated.brandId), validated);
}
