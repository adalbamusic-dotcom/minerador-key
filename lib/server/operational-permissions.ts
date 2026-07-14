import type { BrandInvitation } from "../editorial/operational-flow.ts";
import { validateInvitationAccess } from "../editorial/operational-flow.ts";

export class OperationalPermissionError extends Error {
  constructor(message: string) { super(message); this.name = "OperationalPermissionError"; }
}

export function assertOperationalInvitationAccess(invitation: BrandInvitation, brandId: string, module: Parameters<typeof validateInvitationAccess>[1], action: Parameters<typeof validateInvitationAccess>[2], now = new Date()) {
  if (invitation.brandId !== brandId) throw new OperationalPermissionError("O convite não pertence à marca solicitada.");
  if (!validateInvitationAccess(invitation, module, action, now)) throw new OperationalPermissionError("O convite não concede esta ação ou não está ativo.");
}

export function assertNoImplicitSensitiveAccess(action: string) {
  if (["billing", "change_tax_id", "remove_owner", "delete_brand", "structural_registration"].includes(action)) {
    throw new OperationalPermissionError("Acesso delegado não concede ações estruturais ou de cobrança.");
  }
}
