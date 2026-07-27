export const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BRAND_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type TenantRouteModule = "marca" | "conta" | "minerador" | "arquiteto" | "radar" | "planejador" | "redator" | "publicacoes";
export interface ParsedBrandRef { brandSlug: string; brandId: string; }
export interface TenantRouteInput { brandId: string; brandName: string; module: TenantRouteModule; }

const modulePaths: Record<TenantRouteModule, string> = {
  marca: "/", conta: "/conta", minerador: "/minerador", arquiteto: "/arquiteto", radar: "/radar",
  planejador: "/planejador", redator: "/redator", publicacoes: "/publicacoes",
};
const safeSwitchQuery = new Set(["secao", "painel", "tab", "view", "q", "search", "filter", "sort", "order"]);

export function isTenantId(value: string) { return TENANT_ID_PATTERN.test(value); }

export function normalizeBrandSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

export function buildBrandRef(brandName: string, brandId: string): string {
  if (!isTenantId(brandId)) throw new Error("Tenant inválido.");
  const brandSlug = normalizeBrandSlug(brandName);
  if (!BRAND_SLUG_PATTERN.test(brandSlug)) throw new Error("Nome de marca não produz slug válido.");
  return `${brandSlug}--${brandId}`;
}

export function parseBrandRef(brandRef: string): ParsedBrandRef {
  const delimiter = brandRef.lastIndexOf("--");
  if (delimiter <= 0) throw new Error("brandRef inválido.");
  const brandSlug = brandRef.slice(0, delimiter);
  const brandId = brandRef.slice(delimiter + 2);
  if (!BRAND_SLUG_PATTERN.test(brandSlug) || !isTenantId(brandId)) throw new Error("brandRef inválido.");
  return { brandSlug, brandId };
}

export function buildTenantPath({ brandId, brandName, module }: TenantRouteInput) {
  return `/${buildBrandRef(brandName, brandId)}${modulePaths[module] === "/" ? "" : modulePaths[module]}`;
}

export function tenantPathWithQuery(input: TenantRouteInput, query: string) {
  const target = buildTenantPath(input);
  return query ? `${target}${query.startsWith("?") ? query : `?${query}`}` : target;
}

export function tenantModuleFromPathname(pathname: string): TenantRouteModule | null {
  const match = pathname.match(/^\/([^/]+)(?:\/(conta|minerador|arquiteto|radar|planejador|redator|publicacoes))?\/?$/i);
  if (!match) return null;
  try { parseBrandRef(match[1]); } catch { return null; }
  return (match[2] || "marca") as TenantRouteModule;
}

export function switchTenantPath(input: { targetBrand: { brandId: string; brandName: string }; pathname: string; search?: string; allowedModules?: readonly TenantRouteModule[] }) {
  const currentModule = tenantModuleFromPathname(input.pathname);
  const targetModule = currentModule && (!input.allowedModules || input.allowedModules.includes(currentModule)) ? currentModule : "marca";
  const query = new URLSearchParams(input.search?.replace(/^\?/, "") || "");
  const preserved = new URLSearchParams();
  for (const [key, value] of query) if (safeSwitchQuery.has(key)) preserved.append(key, value);
  const target = buildTenantPath({ ...input.targetBrand, module: targetModule });
  const suffix = preserved.toString();
  return suffix ? `${target}?${suffix}` : target;
}
