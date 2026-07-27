import { PlannerCockpitWorkspace } from "@/modules/planejador";
import { requireTenantModule } from "../../layout";

export default async function Page({ params }: { params: Promise<{ brandRef: string; contentPlanId: string }> }) {
  const { brandRef, contentPlanId } = await params;
  await requireTenantModule(brandRef, "planejador");
  return <PlannerCockpitWorkspace contentPlanId={contentPlanId} />;
}
