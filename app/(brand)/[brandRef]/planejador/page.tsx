import { PlannerPage as Entry } from "@/modules/planejador"; import { requireTenantModule } from "../layout";
export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) { await requireTenantModule((await params).brandRef, "planejador"); return <Entry />; }
