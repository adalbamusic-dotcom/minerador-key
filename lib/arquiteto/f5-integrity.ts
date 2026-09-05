export type ArchitectSessionStatus = "loading" | "authenticated" | "unauthenticated";

/** Recovery local do Arquiteto só pode ser indexada por identidade autenticada e Brand canônico. */
export function authenticatedArchitectActor(input: {
  sessionStatus: ArchitectSessionStatus;
  actorUserId: string | null | undefined;
  brandId: string | null | undefined;
}) {
  if (input.sessionStatus !== "authenticated" || !input.actorUserId || !input.brandId) return null;
  return input.actorUserId;
}

export function shouldWaitForRadarBrandBootstrap(input: {
  selectedBrandId: string | null | undefined;
  profileLoading: boolean;
  pipelineLoading: boolean;
  hasSnapshot: boolean;
  error: string | null | undefined;
}) {
  return Boolean(input.selectedBrandId)
    && (input.profileLoading || input.pipelineLoading || (!input.hasSnapshot && !input.error));
}
