export const DEEPSEEK_BASE_URL = "https://api.deepseek.com" as const;
export const DEEPSEEK_API_URL = `${DEEPSEEK_BASE_URL}/chat/completions` as const;
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-pro" as const;
export const DEEPSEEK_ALLOWED_MODELS = ["deepseek-v4-pro", "deepseek-v4-flash"] as const;

export type DeepSeekModel = (typeof DEEPSEEK_ALLOWED_MODELS)[number];
