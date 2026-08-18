import { MarcaPageEntry } from "@/modules/marca";
import { requireCanonicalTenantRouteModule } from "./layout";
export default async function Page({ params, searchParams }: { params: Promise<{ brandRef: string }>; searchParams: Promise<{ secao?: string; painel?: string }> }) { const { brandRef } = await params; const query = await searchParams; await requireCanonicalTenantRouteModule(brandRef, "marca"); return <MarcaPageEntry initialSection={query.secao || "visao"} initialPanel={query.painel} />; }
