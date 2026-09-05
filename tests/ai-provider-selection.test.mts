import assert from "node:assert/strict";
import test from "node:test";
import { AIProviderConfigurationError, resolveAIProvider } from "../lib/server/ai-provider-config.ts";

test("resolver ENV legado não cria uma operação de IA sem Connection DeepSeek", () => {
  assert.throws(
    () => resolveAIProvider({ AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "fixture-secret" }),
    (error: unknown) => error instanceof AIProviderConfigurationError && error.code === "AI_PROVIDER_CONNECTION_REQUIRED",
  );
});

test("credenciais de ambiente não são uma alternativa silenciosa ao resolver canônico", () => {
  assert.throws(
    () => resolveAIProvider({ DEEPSEEK_API_KEY: "fixture-secret", AI_PROVIDER: "unsupported" }),
    (error: unknown) => error instanceof AIProviderConfigurationError && error.code === "AI_PROVIDER_CONNECTION_REQUIRED",
  );
});
