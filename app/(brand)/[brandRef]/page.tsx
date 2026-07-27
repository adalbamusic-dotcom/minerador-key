import { MarcaPageEntry } from "@/modules/marca";
import { requireTenantModule } from "./layout";
export default async function Page({ params, searchParams }: { params: Promise<{ brandRef: string }>; searchParams: Promise<{ secao?: string; painel?: string }> }) { const { brandRef } = await params; const query = await searchParams; await requireTenantModule(brandRef, "marca"); return <MarcaPageEntry initialSection={query.secao || "visao"} initialPanel={query.painel} />; }
