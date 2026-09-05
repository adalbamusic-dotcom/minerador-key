import { z } from "zod";

/**
 * Narrativa territorial — primitivo isolado.
 *
 * Vive em módulo próprio pelo mesmo motivo de `territory-ref.ts`: o SiloDNA em
 * `contracts.ts` precisa preservar um snapshot dela, e `territory.ts` já importa
 * `contracts.ts`. Importar de volta fecharia ciclo. Depende só de zod.
 *
 * Continuidade narrativa: um território não é um agrupamento lexical. Estes
 * campos dizem POR QUE os artigos pertencem juntos, e é isso que precisa
 * sobreviver à consolidação.
 */
export const TerritoryNarrativeSchema = z.object({
  statement: z.string().min(1).nullable(),
  continuity: z.enum(["coherent", "partial", "fragmented", "unknown"]),
  brandAlignment: z.enum(["aligned", "adjacent", "off_strategy", "unknown"]),
  rationale: z.array(z.string().min(1)),
}).strict();
export type TerritoryNarrative = z.infer<typeof TerritoryNarrativeSchema>;

export const emptyTerritoryNarrative = (): TerritoryNarrative =>
  ({ statement: null, continuity: "unknown", brandAlignment: "unknown", rationale: [] });
