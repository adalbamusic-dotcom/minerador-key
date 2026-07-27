import { RadarPage as Entry } from "@/modules/radar"; import { requireTenantModule } from "../layout";
export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) { await requireTenantModule((await params).brandRef, "radar"); return <Entry />; }
