export type IntentNicheClassification = {
  intent: string;
  nicho: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;

const readText = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

export function extractIntentNicheClassification(payload: unknown): IntentNicheClassification | null {
  const root = asRecord(payload);
  if (!root) return null;
  const candidates = [root, root.classification, root.classificacao, root.result, root.data]
    .map(asRecord)
    .filter((value): value is Record<string, unknown> => Boolean(value));

  for (const candidate of candidates) {
    const intent = readText(candidate, ["intent", "intencao", "intenção", "search_intent"]);
    const nicho = readText(candidate, ["nicho", "niche", "segmento", "categoria"]);
    if (intent && nicho) return { intent, nicho };
  }

  return null;
}
