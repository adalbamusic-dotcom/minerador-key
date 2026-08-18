import { AgencyIntegrationsPage } from "@/modules/conta/agency-integrations-page";
import { readAgencyIntegrationWorkspace } from "@/lib/server/integration-governance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AgencyIntegrationsRoute({ params }: { params: Promise<{ agencyRef: string }> }) {
  return <AgencyIntegrationsPage initialData={await readAgencyIntegrationWorkspace((await params).agencyRef)} />;
}
