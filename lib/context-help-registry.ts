import { MINERADOR_CONTEXT_HELP } from "@/modules/minerador/context-help";
import { CONTEXT_HELP_AREA_LABELS, type ContextHelpArea, type ContextHelpAreaDefinition } from "@/lib/context-help";

const EMPTY_TOPICS: readonly [] = [];

/**
 * A registry of module-owned definitions. The shared shell resolves the
 * current area, but it does not author or borrow another module's content.
 */
export function getContextHelpDefinition(area: ContextHelpArea): ContextHelpAreaDefinition {
  if (area === "minerador") return MINERADOR_CONTEXT_HELP;
  return { area, title: CONTEXT_HELP_AREA_LABELS[area], topics: EMPTY_TOPICS };
}
