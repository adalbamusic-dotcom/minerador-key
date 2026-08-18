export type AdminTab = "visao-geral" | "marcas" | "agencias" | "usuarios" | "planos" | "consumo" | "configuracoes" | "integracoes";

const knownTabs = new Set<AdminTab>(["visao-geral", "marcas", "agencias", "usuarios", "planos", "consumo", "configuracoes", "integracoes"]);

export function isAdminTab(value: string | null | undefined): value is AdminTab {
  return Boolean(value && knownTabs.has(value as AdminTab));
}

export function buildAdminPath(tab: AdminTab = "visao-geral") {
  return tab === "visao-geral" ? "/admin" : `/admin?tab=${tab}`;
}
