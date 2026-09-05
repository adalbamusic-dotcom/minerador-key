import { parseBrandRef } from "@/lib/tenant-routing";

export const CONTEXT_HELP_AREAS = [
  "marca",
  "minerador",
  "arquiteto",
  "radar",
  "planejador",
  "redator",
  "publicacoes",
] as const;

export type ContextHelpArea = (typeof CONTEXT_HELP_AREAS)[number];

export type ContextHelpSection = {
  heading: string;
  body: string;
};

export type ContextHelpTopic = {
  id: string;
  title: string;
  summary: string;
  description: string;
  sections?: readonly ContextHelpSection[];
  howToUse?: readonly string[];
  keywords?: readonly string[];
  futureArticleUrl?: string;
};

export type ContextHelpAreaDefinition = {
  area: ContextHelpArea;
  title: string;
  topics: readonly ContextHelpTopic[];
};

export const CONTEXT_HELP_AREA_LABELS: Record<ContextHelpArea, string> = {
  marca: "Marca",
  minerador: "Minerador",
  arquiteto: "Arquiteto",
  radar: "Radar",
  planejador: "Planejador",
  redator: "Redator",
  publicacoes: "Publicações",
};

function isContextHelpArea(value: string | undefined): value is ContextHelpArea {
  return value !== undefined && (CONTEXT_HELP_AREAS as readonly string[]).includes(value);
}

/**
 * Resolve ajuda somente para rotas tenantizadas canônicas. Rotas globais,
 * públicas, de conta e de seleção de contexto não recebem o trigger.
 */
export function resolveContextHelpArea(pathname: string): ContextHelpArea | null {
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  const brandRef = segments[0];
  if (!brandRef || ["admin", "conta", "login", "cadastro", "selecionar-marca", "agencias"].includes(brandRef)) return null;

  try {
    parseBrandRef(brandRef);
  } catch {
    return null;
  }

  const routeArea = segments[1] || "marca";
  return isContextHelpArea(routeArea) ? routeArea : null;
}

export function normalizeContextHelpText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

export function filterContextHelpTopics(definition: ContextHelpAreaDefinition, query: string): readonly ContextHelpTopic[] {
  const normalizedQuery = normalizeContextHelpText(query);
  if (!normalizedQuery) return definition.topics;

  return definition.topics.filter((topic) => {
    const searchable = [
      topic.title,
      topic.summary,
      topic.description,
      ...(topic.keywords || []),
    ].map(normalizeContextHelpText);
    return searchable.some((value) => value.includes(normalizedQuery));
  });
}
