import type { PipelineState } from "./contracts.ts";

export type ProductModule = "marca" | "minerador" | "arquiteto" | "radar" | "redator" | "publicacoes" | "conta" | "admin";

/*
 * O Planejador foi aposentado em 2026-10-01 e saiu do registro: a rota antiga
 * `/{brandRef}/planejador` redireciona para o Radar (`lib/legacy-routing.ts`).
 */
export const PRODUCT_MODULES: Record<ProductModule, { label: string; href: string; adminOnly?: boolean; historical?: boolean }> = {
  admin: { label: "Admin", href: "/admin", adminOnly: true }, marca: { label: "Marca", href: "/marca" },
  minerador: { label: "Minerador", href: "/minerador" }, arquiteto: { label: "Arquiteto", href: "/arquiteto" },
  radar: { label: "Radar", href: "/radar" },
  redator: { label: "Redator", href: "/redator" }, publicacoes: { label: "Publicações", href: "/publicacoes" },
  conta: { label: "Conta", href: "/conta" },
};

/**
 * ===== A ÁRVORE DA PLATAFORMA =====
 *
 * Com o Planejador aposentado (2026-10-01) o estágio 5 é o Redator, e a
 * numeração segue a ordem de desenvolvimento do AGENTS.md §18.
 */
export const MODULE_STAGE: Record<ProductModule, number | null> = {
  marca: 1, minerador: 2, arquiteto: 3, radar: 4,
  redator: 5, publicacoes: 6, conta: 7,
  admin: null,
};

/**
 * ===== O FLUXO EDITORIAL =====
 *
 * `conta` NÃO entra aqui. Ela é o estágio 7 da árvore da plataforma, não uma
 * etapa do pipeline editorial, e esta lista é o que o menu de workflow
 * exibe. Quem precisa do número lê `MODULE_STAGE`.
 */
export const PRODUCT_FLOW: ProductModule[] = ["marca", "minerador", "arquiteto", "radar", "redator", "publicacoes"];
export const LEGACY_REDIRECTS: Record<string, string> = {
  marca: "/marca", keywords: "/minerador", artigos: "/arquiteto", silos: "/arquiteto?painel=silo",
  serp: "/radar", planejamento: "/radar", documentos: "/redator",
};
export function menuEntriesForRole(role: string) { return Object.entries(PRODUCT_MODULES).filter(([, item]) => !item.historical && (!item.adminOnly || role === "admin")).map(([id, item]) => ({ id: id as ProductModule, ...item })); }
export type PipelineModule = Exclude<ProductModule, "conta" | "admin">;
export function derivePipelineStates(input: { hasBrand: boolean; legacyKeywordCount: number; articleApproved: number; articleProposed: number; siloApproved: number; conflicts: number }) {
  return { marca: input.hasBrand ? "in_progress" : "blocked", minerador: input.legacyKeywordCount ? "in_progress" : "not_started",
    arquiteto: input.conflicts ? "has_conflicts" : input.articleApproved ? "approved" : input.articleProposed ? "pending_review" : "not_started",
    radar: input.articleApproved ? "not_started" : "blocked", redator: "blocked", publicacoes: "not_started" } satisfies Record<PipelineModule, PipelineState>;
}
