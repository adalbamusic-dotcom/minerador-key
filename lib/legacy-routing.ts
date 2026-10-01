export const LEGACY_TENANT_TARGETS: Record<string, string> = {
  marca: "/", minerador: "/minerador", arquiteto: "/arquiteto",
  // O Planejador foi aposentado em 2026-10-01: o caminho antigo leva ao Radar.
  radar: "/radar", planejador: "/radar", redator: "/redator", publicacoes: "/publicacoes",
};

export function legacyTargetFromPathname(pathname: string) {
  return LEGACY_TENANT_TARGETS[pathname.replace(/^\//, "")] || null;
}

export function isLegacyTenantTarget(value: string) {
  return Object.values(LEGACY_TENANT_TARGETS).includes(value);
}

/**
 * Módulos de marca aposentados: `/{brandRef}/planejador` (e o cockpit
 * `/{brandRef}/planejador/{contentPlanId}`) redirecionam de forma permanente
 * para o Radar da MESMA marca, em vez de 404. A marca nunca muda no caminho.
 */
export function retiredBrandModuleTarget(pathname: string) {
  const match = /^\/([^/]+)\/planejador(?:\/.*)?$/.exec(pathname);
  return match ? `/${match[1]}/radar` : null;
}
