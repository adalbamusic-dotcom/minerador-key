/*
 * IA canônica da plataforma desde 2026-10-11: OpenRouter.
 *
 * Arquivo sem segredo e sem "server-only": o painel de Admin lê o endpoint e o
 * modelo padrão para exibir. A chave nunca passa por aqui.
 *
 * O modelo efetivo vem de `OPENROUTER_MODEL` (env do servidor). Sem env, vale o
 * modelo padrão abaixo. Trocar de modelo é trocar a env e reiniciar o servidor,
 * sem deploy de código.
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1" as const;
export const OPENROUTER_API_URL = `${OPENROUTER_BASE_URL}/chat/completions` as const;
export const OPENROUTER_KEY_URL = `${OPENROUTER_BASE_URL}/key` as const;

/** Escolha do dono em 2026-10-11: variante batch, servida pela OpenAI pela metade do preço normal. */
export const OPENROUTER_DEFAULT_MODEL = "openai/gpt-6-luna-pro:batch" as const;

/**
 * Modelos que a metadata da Connection pode fixar. A env aceita qualquer slug
 * válido da OpenRouter, porque quem a escreve é o operador da plataforma.
 */
export const OPENROUTER_KNOWN_MODELS = [
  "openai/gpt-6-luna-pro:batch",
  "openai/gpt-6-luna-pro",
  "openai/gpt-6-luna:batch",
  "openai/gpt-6-luna",
] as const;

export type OpenRouterKnownModel = (typeof OPENROUTER_KNOWN_MODELS)[number];

/** `fornecedor/modelo`, com variante opcional depois de `:`. */
export const OPENROUTER_MODEL_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9._-]+)?$/i;

export function isOpenRouterModelSlug(value: unknown): value is string {
  return typeof value === "string" && value.trim().length <= 160 && OPENROUTER_MODEL_SLUG_PATTERN.test(value.trim());
}

export function isOpenRouterKnownModel(value: unknown): value is OpenRouterKnownModel {
  return typeof value === "string" && (OPENROUTER_KNOWN_MODELS as readonly string[]).includes(value.trim());
}
