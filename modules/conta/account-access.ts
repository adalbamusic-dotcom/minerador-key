export interface AccountTenantAccess {
  brandId: string;
  brandName: string;
  actorUserId?: string;
  actorRole: string;
  permissions: string[];
  isGlobalAdmin: boolean;
  ownerUserId?: string;
}

export const ACCOUNT_MODULES = [
  { id: "marca", label: "Marca" },
  { id: "minerador", label: "Minerador" },
  { id: "arquiteto", label: "Arquiteto" },
  { id: "radar", label: "Radar" },
  { id: "planejador", label: "Planejador" },
  { id: "redator", label: "Redator" },
  { id: "publicacoes", label: "Publicações" },
  { id: "conta", label: "Conta" },
] as const;

export const ACCOUNT_ACTIONS = [
  { id: "view", label: "Visualizar" },
  { id: "comment", label: "Comentar" },
  { id: "create", label: "Criar" },
  { id: "edit", label: "Editar" },
  { id: "review", label: "Revisar" },
  { id: "approve", label: "Aprovar" },
  { id: "export", label: "Exportar" },
  { id: "publish", label: "Publicar" },
  { id: "manage", label: "Administrar" },
] as const;

export type AccountAccessOrigin = "global_admin" | "owner" | "membership";

export function accountRoleLabel(access: Pick<AccountTenantAccess, "actorRole" | "isGlobalAdmin">) {
  if (access.isGlobalAdmin) return "Admin global";
  if (access.actorRole === "owner") return "Owner";
  return ({ brand_admin: "Administrador da marca", editor: "Editor", reviewer: "Revisor", specialist: "Especialista", reader: "Leitor" } as Record<string, string>)[access.actorRole] || access.actorRole;
}

export function resolveAccountAccessOrigin(access: Pick<AccountTenantAccess, "actorRole" | "isGlobalAdmin">): AccountAccessOrigin {
  if (access.isGlobalAdmin) return "global_admin";
  if (access.actorRole === "owner") return "owner";
  return "membership";
}

export function canManageTeam(access: Pick<AccountTenantAccess, "isGlobalAdmin" | "permissions">) {
  return access.isGlobalAdmin || access.permissions.includes("marca:manage");
}

export function hasPermission(access: Pick<AccountTenantAccess, "isGlobalAdmin" | "permissions">, module: string, action: string) {
  return access.isGlobalAdmin || access.permissions.includes(`${module}:${action}`);
}
