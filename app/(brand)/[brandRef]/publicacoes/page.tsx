import { PublicationsWorkspace as Entry } from "@/modules/publicacoes"; import { requireTenantModule } from "../layout";
export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) { await requireTenantModule((await params).brandRef, "publicacoes"); return <Entry />; }
