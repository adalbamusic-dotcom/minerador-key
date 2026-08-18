import { AgencyWorkspacePage } from "@/modules/conta/agency-workspace-page";
import { getAgencyWorkspaceData } from "@/lib/server/agency-workspace";

export default async function AgencyBrandsPage({ params, searchParams }: { params: Promise<{ agencyRef: string }>; searchParams: Promise<{ created?: string }> }) {
  const { agencyRef } = await params;
  const query = await searchParams;
  return <AgencyWorkspacePage workspace={await getAgencyWorkspaceData(agencyRef)} section="marcas" createdBrandName={query.created} />;
}
