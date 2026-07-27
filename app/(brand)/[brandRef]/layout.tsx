import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ProductShell } from "@/components/product-shell";
import { AuthzError, requireSessionProfile } from "@/lib/server/authz";
import { canAccessTenantModule, resolveTenantContext, TENANT_MODULES, type TenantModule } from "@/lib/server/tenant-context";
import { buildBrandRef, buildTenantPath, isTenantId, parseBrandRef } from "@/lib/tenant-routing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noarchive: true, noimageindex: true, nosnippet: true } } };

export default async function BrandTenantLayout({ children, params }: { children: ReactNode; params: Promise<unknown> }) {
  const { brandRef } = await params as { brandRef: string };
  let brandId = brandRef;
  if (!isTenantId(brandRef)) { try { brandId = parseBrandRef(brandRef).brandId; } catch { notFound(); } }
  let context: Awaited<ReturnType<typeof resolveTenantContext>>;
  try { context = await resolveTenantContext({ brandId, profile: await requireSessionProfile() }); }
  catch (error) {
    if (error instanceof AuthzError && error.status === 401) redirect(`/login?callbackUrl=/${encodeURIComponent(brandId)}`);
    if (error instanceof AuthzError && (error.status === 403 || error.status === 503)) redirect("/selecionar-marca");
    notFound();
  }
  return <ProductShell key={context.brandId} tenant={context}>{children}</ProductShell>;
}

export async function requireTenantModule(brandRef: string, module: TenantModule) {
  const brandId = isTenantId(brandRef) ? brandRef : parseBrandRef(brandRef).brandId;
  const context = await resolveTenantContext({ brandId, profile: await requireSessionProfile() });
  if (!canAccessTenantModule(context, module)) notFound();
  const canonicalRef = buildBrandRef(context.brandName, context.brandId);
  if (brandRef !== canonicalRef) redirect(buildTenantPath({ brandId: context.brandId, brandName: context.brandName, module }));
  return context;
}
export function isTenantModule(value: string): value is TenantModule { return (TENANT_MODULES as readonly string[]).includes(value); }
