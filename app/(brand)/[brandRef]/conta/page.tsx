import { AccountPage } from "@/modules/conta"; import { requireTenantModule } from "../layout";
export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) { await requireTenantModule((await params).brandRef, "conta"); return <AccountPage />; }
