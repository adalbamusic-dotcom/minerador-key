export type LegacyImportList = { id: string; nome: string; marca_id: string };

export type LegacyCsvSiloResolution =
  | { listaId: string | null; issue: null }
  | { listaId: null; issue: "silo_reference_not_found" };

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

/**
 * Empty silo/list references intentionally resolve to null. A non-empty
 * reference must match a list of the active brand; this importer never creates
 * lists as a side effect.
 */
export function resolveLegacyCsvSilo(input: {
  rawReference: unknown;
  brandId: string;
  lists: LegacyImportList[];
}): LegacyCsvSiloResolution {
  const raw = typeof input.rawReference === "string" ? input.rawReference.trim() : "";
  if (!raw) return { listaId: null, issue: null };
  const reference = normalized(raw);
  const match = input.lists.find(list => list.marca_id === input.brandId && (list.id === raw || normalized(list.nome) === reference));
  return match ? { listaId: match.id, issue: null } : { listaId: null, issue: "silo_reference_not_found" };
}

export function manualImportListaId(input: { selectedListId: string; brandId: string; lists: LegacyImportList[] }) {
  if (!input.selectedListId) return null;
  return input.lists.some(list => list.id === input.selectedListId && list.marca_id === input.brandId) ? input.selectedListId : null;
}
