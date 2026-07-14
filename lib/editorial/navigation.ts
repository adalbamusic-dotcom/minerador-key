import type { PipelineState } from "./contracts.ts";

export type ProductModule = "marca" | "minerador" | "arquiteto" | "radar" | "planejador" | "redator" | "publicacoes" | "conta" | "admin";
export const PRODUCT_MODULES: Record<ProductModule, { label: string; href: string; adminOnly?: boolean }> = {
  admin: { label: "Admin", href: "/admin", adminOnly: true }, marca: { label: "Marca", href: "/marca" },
  minerador: { label: "Minerador", href: "/minerador" }, arquiteto: { label: "Arquiteto", href: "/arquiteto" },
  radar: { label: "Radar", href: "/radar" }, planejador: { label: "Planejador", href: "/planejador" },
  redator: { label: "Redator", href: "/redator" }, publicacoes: { label: "Publicações", href: "/publicacoes" },
  conta: { label: "Conta", href: "/conta" },
};
export const PRODUCT_FLOW: ProductModule[] = ["marca", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"];
export const LEGACY_REDIRECTS: Record<string, string> = {
  marca: "/marca", keywords: "/minerador", artigos: "/arquiteto", silos: "/arquiteto?painel=silo",
  serp: "/radar", planejamento: "/planejador", documentos: "/redator",
};
export function menuEntriesForRole(role: string) { return Object.entries(PRODUCT_MODULES).filter(([, item]) => !item.adminOnly || role === "admin").map(([id, item]) => ({ id: id as ProductModule, ...item })); }
export function derivePipelineStates(input: { hasBrand: boolean; legacyKeywordCount: number; articleApproved: number; articleProposed: number; siloApproved: number; conflicts: number }) {
  return { marca: input.hasBrand ? "in_progress" : "blocked", minerador: input.legacyKeywordCount ? "in_progress" : "not_started",
    arquiteto: input.conflicts ? "has_conflicts" : input.articleApproved ? "approved" : input.articleProposed ? "pending_review" : "not_started",
    radar: input.articleApproved ? "not_started" : "blocked", planejador: "blocked", redator: "blocked", publicacoes: "not_started" } satisfies Record<Exclude<ProductModule, "conta" | "admin">, PipelineState>;
}
