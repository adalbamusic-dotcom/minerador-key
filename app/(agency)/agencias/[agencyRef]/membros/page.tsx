import { AgencyWorkspacePage } from "@/modules/conta/agency-workspace-page";
import { getAgencyWorkspaceData } from "@/lib/server/agency-workspace";

export default async function AgencyMembersPage({ params }: { params: Promise<{ agencyRef: string }> }) {
  return <AgencyWorkspacePage workspace={await getAgencyWorkspaceData((await params).agencyRef)} section="membros" />;
}
