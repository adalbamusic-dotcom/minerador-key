import { MineradorScreen as Entry } from "@/modules/minerador";
import MineradorExtensionHandshakeResponder from "@/modules/minerador/minerador-extension-handshake-responder";
import { requireTenantModule } from "../layout";

export default async function Page({ params }: { params: Promise<{ brandRef: string }> }) {
  const { brandRef } = await params;
  const context = await requireTenantModule(brandRef, "minerador");
  return (
    <>
      <MineradorExtensionHandshakeResponder
        actorUserId={context.actorUserId}
        activeBrandId={context.brandId}
        activeBrandRef={brandRef}
        activeBrandName={context.brandName}
        pathname={`/${brandRef}/minerador`}
        accessConfirmed
        protocolVersion={2}
      />
      <Entry />
    </>
  );
}
