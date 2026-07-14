export type EditorialHistoryModule = "minerador" | "arquiteto" | "radar" | "planejador" | "redator" | "publicacoes";

export interface EditorialHistoryEntry<T> {
  id: string;
  module: EditorialHistoryModule;
  label: string;
  createdAt: string;
  snapshot: T;
}

export const cloneHistorySnapshot = <T,>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

export const createHistoryEntry = <T,>(module: EditorialHistoryModule, label: string, snapshot: T): EditorialHistoryEntry<T> => ({
  id: crypto.randomUUID(),
  module,
  label,
  createdAt: new Date().toISOString(),
  snapshot: cloneHistorySnapshot(snapshot),
});
