import { z } from "zod";

/**
 * Identidade opaca do território — primitivo isolado.
 *
 * Vive em módulo próprio porque `contracts.ts` (ArticleDNA) precisa referenciar
 * um território, e `territory.ts` já importa `contracts.ts`. Importar de volta
 * fecharia um ciclo. O primitivo depende só de zod.
 */
export const TERRITORY_REF_PREFIX = "territory:";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TerritoryRefSchema = z.string().refine(
  value => value.startsWith(TERRITORY_REF_PREFIX) && UUID_PATTERN.test(value.slice(TERRITORY_REF_PREFIX.length)),
  { message: "territoryRef precisa ser opaco no formato territory:<uuid>." },
);
export type TerritoryRef = z.infer<typeof TerritoryRefSchema>;

/**
 * `territoryRef` é gerado pelo servidor e é OPACO: não codifica nome, slug,
 * entidade, `siloId`, `lista_id`, `articleId` nem índice visual. A separação é
 * normativa (C4) — reaproveitar a identidade canônica do Silo ou do Article
 * aqui misturaria espaços com ciclos de vida diferentes.
 */
export function buildTerritoryRef(uuid: string = crypto.randomUUID()): TerritoryRef {
  if (!UUID_PATTERN.test(uuid)) throw new Error("territoryRef exige um UUID canônico.");
  return `${TERRITORY_REF_PREFIX}${uuid.toLowerCase()}`;
}

export function isTerritoryRef(value: unknown): value is TerritoryRef {
  return typeof value === "string" && TerritoryRefSchema.safeParse(value).success;
}

/** Parte opaca da referência, para comparação com identidades de outros espaços. */
export function territoryRefUuid(ref: TerritoryRef): string {
  return ref.slice(TERRITORY_REF_PREFIX.length).toLowerCase();
}
