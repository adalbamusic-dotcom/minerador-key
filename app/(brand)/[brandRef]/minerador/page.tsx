import { MineradorScreen as Entry } from "@/modules/minerador";
import { MineradorSectionTabs } from "@/modules/minerador/minerador-section-tabs";
import { requireTenantModule } from "../layout";

export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) {
  const { brandRef } = await params;
  await requireTenantModule(brandRef, "minerador");
  return (
    <Entry brandRef={brandRef} sectionTabs={<MineradorSectionTabs brandRef={brandRef}/>} />
  );
}
