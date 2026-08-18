import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { CanonicalAccessState } from "@/components/canonical-access-state";
import { ProductShell } from "@/components/product-shell";
import { CanonicalAuthorizationError } from "@/lib/tenant/canonical-authorization";
import { resolveCanonicalBrandTenantContext, requireCanonicalTenantModule } from "@/lib/server/canonical-authorization";
import { SupabaseSessionError } from "@/lib/server/supabase-session";
import { TENANT_MODULES, type TenantModule } from "@/lib/server/tenant-context";
import { buildBrandRef, buildTenantPath, parseBrandRef } from "@/lib/tenant-routing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noarchive: true, noimageindex: true, nosnippet: true } } };

export default async function BrandTenantLayout({ children, params }: { children: ReactNode; params: Promise<unknown> }) {
  const { brandRef } = await params as { brandRef: string };
  try { parseBrandRef(brandRef); } catch { notFound(); }
  let context: Awaited<ReturnType<typeof resolveCanonicalBrandTenantContext>> | undefined;
  let failure: unknown;
  try {
    context = await resolveCanonicalBrandTenantContext(brandRef);
  } catch (error) {
    failure = error;
  }
  if (failure instanceof CanonicalAuthorizationError) {
    if (failure.status === 401) redirect(`/login?callbackUrl=/${encodeURIComponent(brandRef)}`);
    if (failure.status === 503) return <CanonicalAccessState title="Não foi possível confirmar esta marca" description="Tente novamente quando a autorização estiver disponível. Nenhum outro contexto foi escolhido." />;
    if (failure.status === 403) return <CanonicalAccessState status="denied" title="Acesso à marca não disponível" description="Sua identidade não possui acesso editorial ativo para esta marca. Nenhum outro contexto será escolhido automaticamente." />;
  }
  if (failure instanceof SupabaseSessionError) redirect(`/login?callbackUrl=/${encodeURIComponent(brandRef)}`);
  if (failure || !context) notFound();
  return <ProductShell tenant={context}>{children}</ProductShell>;
}

/** Canonical gate used only by the Phase 2A Marca and Conta entry routes. */
export async function requireCanonicalTenantRouteModule(brandRef: string, module: TenantModule) {
  const context = await requireCanonicalTenantModule(brandRef, module);
  const canonicalRef = buildBrandRef(context.brandName, context.brandId);
  if (brandRef !== canonicalRef) redirect(buildTenantPath({ brandId: context.brandId, brandName: context.brandName, module }));
  return context;
}

/** Compatibility export for module pages; the decision is canonical in Phase 2C. */
export async function requireTenantModule(brandRef: string, module: TenantModule) {
  return requireCanonicalTenantRouteModule(brandRef, module);
}
export function isTenantModule(value: string): value is TenantModule { return (TENANT_MODULES as readonly string[]).includes(value); }
