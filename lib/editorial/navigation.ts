import type { PipelineState } from "./contracts.ts";

export type ProductModule = "marca" | "minerador" | "arquiteto" | "radar" | "planejador" | "redator" | "publicacoes" | "conta" | "admin";

/**
 * ===== REMOÇÃO LÓGICA DO PLANEJADOR · O REGISTRO NÃO É O MENU =====
 *
 * `historical: true` marca a rota que continua RESPONDENDO e deixa de ser
 * OFERECIDA. As duas coisas foram separadas de propósito: apagar a entrada
 * apagaria junto o caminho para os planos já aprovados, e quem os aprovou
 * ficaria sem a própria vista. O que a remoção precisa impedir é ESCRITA
 * NOVA pelo caminho antigo — e isso não se resolve escondendo a rota.
 */
export const PRODUCT_MODULES: Record<ProductModule, { label: string; href: string; adminOnly?: boolean; historical?: boolean }> = {
  admin: { label: "Admin", href: "/admin", adminOnly: true }, marca: { label: "Marca", href: "/marca" },
  minerador: { label: "Minerador", href: "/minerador" }, arquiteto: { label: "Arquiteto", href: "/arquiteto" },
  radar: { label: "Radar", href: "/radar" }, planejador: { label: "Planejador", href: "/planejador", historical: true },
  redator: { label: "Redator", href: "/redator" }, publicacoes: { label: "Publicações", href: "/publicacoes" },
  conta: { label: "Conta", href: "/conta" },
};

/**
 * ===== A ÁRVORE DA PLATAFORMA · ESTÁGIO É IDENTIFICADOR, NÃO POSIÇÃO =====
 *
 * `redator: 6` é o NOME do estágio, não o sexto item de uma lista. Derivar o
 * número de um índice obrigaria a existir algo na posição 5 — e aí alguém
 * inventaria uma etapa só para preencher o buraco. A posição 5 fica
 * declarada e não atribuída.
 *
 * `planejador: null` é `PLANEJADOR_STAGE = NONE`: o módulo existe, e não tem
 * estágio no fluxo operacional.
 */
export const MODULE_STAGE: Record<ProductModule, number | null> = {
  marca: 1, minerador: 2, arquiteto: 3, radar: 4,
  redator: 6, publicacoes: 7, conta: 8,
  planejador: null, admin: null,
};

/**
 * ===== RADAR_TO_WRITER_HANDOFF_1 · §1 e §19 · O FLUXO NÃO PASSA MAIS PELO PLANEJADOR =====
 *
 * Ele saiu daqui, e não de `PRODUCT_MODULES`: a rota `/planejador` continua
 * respondendo para leitura do histórico. O que deixou de existir é o passo —
 * um breadcrumb que ainda o mostrasse ensinaria o fluxo errado a quem opera.
 *
 * `conta` NÃO entra aqui. Ela é o estágio 8 da árvore da plataforma, não uma
 * etapa do pipeline editorial, e esta lista é o que o menu de workflow
 * exibe. Quem precisa do número lê `MODULE_STAGE`.
 */
export const PRODUCT_FLOW: ProductModule[] = ["marca", "minerador", "arquiteto", "radar", "redator", "publicacoes"];
export const LEGACY_REDIRECTS: Record<string, string> = {
  marca: "/marca", keywords: "/minerador", artigos: "/arquiteto", silos: "/arquiteto?painel=silo",
  serp: "/radar", planejamento: "/planejador", documentos: "/redator",
};
export function menuEntriesForRole(role: string) { return Object.entries(PRODUCT_MODULES).filter(([, item]) => !item.historical && (!item.adminOnly || role === "admin")).map(([id, item]) => ({ id: id as ProductModule, ...item })); }
export type PipelineModule = Exclude<ProductModule, "conta" | "admin" | "planejador">;
export function derivePipelineStates(input: { hasBrand: boolean; legacyKeywordCount: number; articleApproved: number; articleProposed: number; siloApproved: number; conflicts: number }) {
  return { marca: input.hasBrand ? "in_progress" : "blocked", minerador: input.legacyKeywordCount ? "in_progress" : "not_started",
    arquiteto: input.conflicts ? "has_conflicts" : input.articleApproved ? "approved" : input.articleProposed ? "pending_review" : "not_started",
    radar: input.articleApproved ? "not_started" : "blocked", redator: "blocked", publicacoes: "not_started" } satisfies Record<PipelineModule, PipelineState>;
}
