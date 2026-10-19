import { ARQUITETO_CONTEXT_HELP } from "@/modules/arquiteto/context-help";
import { MARCA_CONTEXT_HELP } from "@/modules/marca/context-help";
import { MINERADOR_CONTEXT_HELP } from "@/modules/minerador/context-help";
import { PUBLICACOES_CONTEXT_HELP } from "@/modules/publicacoes/context-help";
import { RADAR_CONTEXT_HELP } from "@/modules/radar/context-help";
import { REDATOR_CONTEXT_HELP } from "@/modules/redator/context-help";
import { CONTEXT_HELP_AREA_LABELS, type ContextHelpArea, type ContextHelpAreaDefinition } from "@/lib/context-help";

const EMPTY_TOPICS: readonly [] = [];

/**
 * A registry of module-owned definitions. The shared shell resolves the
 * current area, but it does not author or borrow another module's content.
 *
 * 2026-10-18 (dono): toda área traz o tutorial de uso — "Como funciona esta
 * área" e um tópico por etapa da linha de processo, na ordem da linha. Mudou
 * um botão ou uma etapa, muda na mesma entrega o InfoHint, o tutorial (o
 * arquivo `context-help.ts` do módulo) e o catálogo `lib/agent/platform-catalog.ts`.
 */
const DEFINITIONS: Record<ContextHelpArea, ContextHelpAreaDefinition> = {
  marca: MARCA_CONTEXT_HELP,
  minerador: MINERADOR_CONTEXT_HELP,
  arquiteto: ARQUITETO_CONTEXT_HELP,
  radar: RADAR_CONTEXT_HELP,
  redator: REDATOR_CONTEXT_HELP,
  publicacoes: PUBLICACOES_CONTEXT_HELP,
};

export function getContextHelpDefinition(area: ContextHelpArea): ContextHelpAreaDefinition {
  return DEFINITIONS[area] ?? { area, title: CONTEXT_HELP_AREA_LABELS[area], topics: EMPTY_TOPICS };
}
