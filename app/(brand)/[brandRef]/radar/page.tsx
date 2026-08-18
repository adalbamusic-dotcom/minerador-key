import { RadarPage as Entry } from "@/modules/radar"; import { requireTenantModule } from "../layout";
export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) { const { brandRef } = await params; await requireTenantModule(brandRef, "radar"); return <Entry brandRef={brandRef} />; }
