export const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731" as const;
export const OPENROUTER_MODEL_METADATA_KEY = "openrouter_model" as const;

const OPENROUTER_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

export function normalizeOpenRouterModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f\s]/.test(normalized) || !OPENROUTER_MODEL_PATTERN.test(normalized)) return null;
  return normalized;
}

export function readOpenRouterModel(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return normalizeOpenRouterModel((metadata as Record<string, unknown>)[OPENROUTER_MODEL_METADATA_KEY]);
}

export function writeOpenRouterModel(metadata: unknown, model: string): Record<string, unknown> {
  const current = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  return { ...current, [OPENROUTER_MODEL_METADATA_KEY]: model };
}
