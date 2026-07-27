import { ArquitetoScreen as Entry } from "@/modules/arquiteto"; import { requireTenantModule } from "../layout";
export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) { await requireTenantModule((await params).brandRef, "arquiteto"); return <Entry />; }
