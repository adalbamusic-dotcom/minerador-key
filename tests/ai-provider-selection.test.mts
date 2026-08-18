import assert from "node:assert/strict";
import test from "node:test";
import {
  AIProviderConfigurationError,
  resolveAIProvider,
} from "../lib/server/ai-provider-config.ts";
import {
  ProviderRequestError,
  requestProviderContent,
} from "../lib/arquiteto/provider-client.ts";

const successResponse = () => new Response(JSON.stringify({
  choices: [{ message: { content: '{"ok":true}' } }],
}), { status: 200, headers: { "content-type": "application/json" } });

test("DeepSeek explicitamente configurado é o provider usado", async () => {
  const provider = resolveAIProvider({
    AI_PROVIDER: "deepseek",
    DEEPSEEK_API_KEY: "deepseek-test-secret",
    OPENROUTER_API_KEY: "openrouter-test-secret",
  });
  let calledUrl = "";
  let calledModel = "";

  const content = await requestProviderContent({
    ...provider,
    system: "system",
    user: "user",
    fetchImpl: async (url, init) => {
      calledUrl = String(url);
      calledModel = JSON.parse(String(init?.body)).model;
      return successResponse();
    },
  });

  assert.equal(calledUrl, "https://api.deepseek.com/chat/completions");
  assert.equal(calledModel, "deepseek-chat");
  assert.equal(content, '{"ok":true}');
});

test("falha do DeepSeek retorna erro e não chama OpenRouter", async () => {
  const provider = resolveAIProvider({
    AI_PROVIDER: "deepseek",
    DEEPSEEK_API_KEY: "deepseek-test-secret",
    OPENROUTER_API_KEY: "openrouter-test-secret",
  });
  let calls = 0;

  await assert.rejects(
    requestProviderContent({
      ...provider,
      system: "system",
      user: "user",
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ message: "deepseek-test-secret" }), { status: 503 });
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderRequestError);
      assert.equal(error.code, "AI_PROVIDER_UNAVAILABLE");
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /deepseek-test-secret|openrouter-test-secret/i);
      return true;
    },
  );

  assert.equal(calls, 1);
});

test("OpenRouter explicitamente configurado é o provider e modelo usados", async () => {
  const provider = resolveAIProvider({
    AI_PROVIDER: "openrouter",
    DEEPSEEK_API_KEY: "deepseek-test-secret",
    OPENROUTER_API_KEY: "openrouter-test-secret",
    OPENROUTER_MODEL: "openrouter/test-model",
  });
  let calledUrl = "";
  let calledModel = "";

  await requestProviderContent({
    ...provider,
    system: "system",
    user: "user",
    fetchImpl: async (url, init) => {
      calledUrl = String(url);
      calledModel = JSON.parse(String(init?.body)).model;
      return successResponse();
    },
  });

  assert.equal(calledUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calledModel, "openrouter/test-model");
});

test("provider sem configuração explícita falha mesmo com credenciais presentes", () => {
  assert.throws(
    () => resolveAIProvider({ DEEPSEEK_API_KEY: "deepseek-test-secret", OPENROUTER_API_KEY: "openrouter-test-secret" }),
    (error: unknown) => error instanceof AIProviderConfigurationError && error.code === "AI_PROVIDER_NOT_CONFIGURED",
  );
});

test("provider inválido falha sem chamada real", () => {
  assert.throws(
    () => resolveAIProvider({ AI_PROVIDER: "unsupported", DEEPSEEK_API_KEY: "test-secret" }),
    (error: unknown) => error instanceof AIProviderConfigurationError && error.code === "AI_PROVIDER_INVALID",
  );
});

test("credencial ausente e resposta inválida têm erros sanitizados", async () => {
  assert.throws(
    () => resolveAIProvider({ AI_PROVIDER: "openrouter" }),
    (error: unknown) => error instanceof AIProviderConfigurationError && error.code === "AI_CREDENTIAL_MISSING",
  );

  await assert.rejects(
    requestProviderContent({
      ...resolveAIProvider({ AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "never-log-this-secret" }),
      system: "system",
      user: "user",
      fetchImpl: async () => new Response(JSON.stringify({ error: "never-log-this-secret" }), { status: 401 }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderRequestError);
      assert.equal(error.code, "AI_PROVIDER_AUTHENTICATION");
      assert.doesNotMatch(error.message, /never-log-this-secret/i);
      return true;
    },
  );
});
