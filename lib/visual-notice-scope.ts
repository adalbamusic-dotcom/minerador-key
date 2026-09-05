import { parseAgencyRef } from "./agency-routing.ts";
import { parseBrandRef, tenantModuleFromPathname, type TenantRouteModule } from "./tenant-routing.ts";
import type { NoticeScope } from "./visual-notice-contract.ts";

const tenantModules: readonly TenantRouteModule[] = ["marca", "conta", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"];

function scopePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-");
}

export function createBrandNoticeScope({ brandId, module, area }: { brandId: string; module: TenantRouteModule; area?: string }): NoticeScope {
  return {
    key: `brand:${brandId}:${module}`,
    scopeType: "brand",
    module,
    area,
    brandId,
  };
}

export function createAgencyNoticeScope({ agencyId, area }: { agencyId: string; area?: string }): NoticeScope {
  return {
    key: `agency:${agencyId}:agencia`,
    scopeType: "agency",
    module: "agencia",
    area,
    agencyId,
  };
}

export function createGlobalNoticeScope(module: "admin" | "perfil" | "plataforma", area?: string): NoticeScope {
  return {
    key: `global:${module}`,
    scopeType: "global",
    module,
    area,
  };
}

/**
 * Resolves only canonical route identifiers. Slugs are never used as scope
 * identity; the parsed UUID is the sole tenant part of the key.
 */
export function resolveNoticeScope(pathname: string | null | undefined): NoticeScope | null {
  if (!pathname) return null;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return createGlobalNoticeScope("admin");
  if (pathname === "/conta" || pathname.startsWith("/conta/")) return createGlobalNoticeScope("perfil");

  const agencyMatch = pathname.match(/^\/agencias\/([^/]+)(?:\/([^/]+))?/i);
  if (agencyMatch) {
    try {
      const { agencyId } = parseAgencyRef(agencyMatch[1]);
      const area = agencyMatch[2] ? scopePart(agencyMatch[2]) : undefined;
      return createAgencyNoticeScope({ agencyId, area });
    } catch {
      return null;
    }
  }

  const brandRef = pathname.match(/^\/([^/]+)/)?.[1];
  if (!brandRef) return null;
  try {
    const { brandId } = parseBrandRef(brandRef);
    const routeModule = pathname.split("/")[2]?.toLowerCase();
    const noticeModule = tenantModuleFromPathname(pathname)
      || (routeModule && tenantModules.includes(routeModule as TenantRouteModule) ? routeModule as TenantRouteModule : "marca");
    return createBrandNoticeScope({
      brandId,
      module: noticeModule,
    });
  } catch {
    return null;
  }
}
