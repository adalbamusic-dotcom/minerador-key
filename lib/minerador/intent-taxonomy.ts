export type CanonicalIntentKey = "informational" | "commercial_investigation" | "transactional" | "navigational" | "local" | "mixed" | "unknown";

export const CANONICAL_INTENT_LABELS: Record<CanonicalIntentKey, string> = {
  informational: "Informativa",
  commercial_investigation: "Comercial investigativa",
  transactional: "Transacional",
  navigational: "Navegacional",
  local: "Local",
  mixed: "Mista",
  unknown: "Pendente",
};

const keyOf = (value: unknown) => typeof value === "string"
  ? value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_")
  : "";

export function normalizeIntentKey(value: unknown): CanonicalIntentKey {
  const key = keyOf(value);
  if (["informativo", "informativa", "informacional", "informational", "informative", "info"].includes(key)) return "informational";
  if (["comercial", "comercial_investigativa", "investigacao_comercial", "investigacao_de_compra", "commercial_investigation", "commercial", "comparacao", "comparativo"].includes(key)) return "commercial_investigation";
  if (["vendas", "venda", "transacional", "transactional", "compra", "comprar"].includes(key)) return "transactional";
  if (["navegacional", "navigational", "navegacao", "marca"].includes(key)) return "navigational";
  if (["local", "localizada", "local_search"].includes(key)) return "local";
  if (["misto", "mista", "mixed"].includes(key)) return "mixed";
  return "unknown";
}

export function canonicalIntentLabel(value: unknown): string {
  return CANONICAL_INTENT_LABELS[normalizeIntentKey(value)];
}

/**
 * DataForSEO's intent is an independent external signal. Keep its label
 * separate from the canonical KeywordDNA intent so a provider result can
 * never silently become the product's semantic decision.
 */
export function externalIntentLabel(value: unknown): string | null {
  const key = keyOf(value);
  if (!key) return null;
  return ({
    informational: "Informacional",
    informativo: "Informacional",
    informativa: "Informacional",
    commercial: "Comercial",
    comercial: "Comercial",
    commercial_investigation: "Comercial",
    comercial_investigativa: "Comercial",
    transactional: "Transacional",
    transacional: "Transacional",
    navigational: "Navegacional",
    navegacional: "Navegacional",
    local: "Local",
    mixed: "Mista",
    mista: "Mista",
  } as Record<string, string>)[key] || (key === "unknown" ? null : String(value).trim());
}

export function intentFilterLabel(value: unknown): string {
  const key = normalizeIntentKey(value);
  return CANONICAL_INTENT_LABELS[key];
}
