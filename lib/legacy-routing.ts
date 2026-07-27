export const LEGACY_TENANT_TARGETS: Record<string, string> = {
  marca: "/", conta: "/conta", minerador: "/minerador", arquiteto: "/arquiteto",
  radar: "/radar", planejador: "/planejador", redator: "/redator", publicacoes: "/publicacoes",
};

export function legacyTargetFromPathname(pathname: string) {
  return LEGACY_TENANT_TARGETS[pathname.replace(/^\//, "")] || null;
}

export function isLegacyTenantTarget(value: string) {
  return Object.values(LEGACY_TENANT_TARGETS).includes(value);
}
