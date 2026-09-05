import assert from "node:assert/strict";
import test from "node:test";
import { configureTelegramPlatformWebhook, TelegramWebhookAdminError } from "../lib/server/telegram/admin.ts";
import { configureSupportedPlatformProvider } from "../lib/server/platform-integrations-admin.ts";
import { runPlatformProviderHealthProbe } from "../lib/server/platform-integrations-health.ts";

test("Testar Bot usa getMe sem exigir URL ou webhook secret", async () => {
  const requests: string[] = [];
  const probe = await runPlatformProviderHealthProbe({
    providerKey: "telegram",
    healthOperation: "telegram_get_me",
    secretPayload: JSON.stringify({ TELEGRAM_BOT_TOKEN: "123:short" }),
    fetchImpl: async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ ok: true, result: { id: 7, is_bot: true, first_name: "Ada", username: "ada_bot" } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0], /\/getMe$/);
  assert.deepEqual(probe.details, { stage: "get_me", botId: "7", botUsername: "ada_bot", botName: "Ada" });
});

test("Configurar Webhook sem URL é bloqueado antes de consultar Secret Store ou Telegram", async () => {
  let clientCalls = 0;
  const client = {
    from() {
      clientCalls += 1;
      throw new Error("client must not be called");
    },
    rpc() {
      clientCalls += 1;
      throw new Error("client must not be called");
    },
  };

  await assert.rejects(
    () => configureTelegramPlatformWebhook({ client: client as never, connectionId: "connection-id", url: "" }),
    (error: unknown) => error instanceof TelegramWebhookAdminError && error.code === "WEBHOOK_URL_REQUIRED" && error.message === "Informe a URL pública HTTPS antes de configurar o webhook.",
  );
  assert.equal(clientCalls, 0);
});

test("Configurar Webhook bloqueia HTTP antes de consultar Secret Store", async () => {
  let clientCalls = 0;
  const client = {
    from() { clientCalls += 1; throw new Error("client must not be called"); },
    rpc() { clientCalls += 1; throw new Error("client must not be called"); },
  };
  await assert.rejects(
    () => configureTelegramPlatformWebhook({ client: client as never, connectionId: "connection-id", url: "http://example.com/api/integrations/telegram/webhook" }),
    (error: unknown) => error instanceof TelegramWebhookAdminError && error.code === "WEBHOOK_URL_INVALID",
  );
  assert.equal(clientCalls, 0);
});

test("Salvar Telegram sem URL exige somente Bot Token, gera segredo e não chama provider", async () => {
  let storedSecret = "";
  const provider = { id: "telegram-provider", provider_key: "telegram", status: "active" };
  const connection = { id: "telegram-connection", provider_id: provider.id, owner_scope_type: "platform", environment: "production", lifecycle_status: "draft", secret_ref: null, metadata: {} };
  const updated = { ...connection, lifecycle_status: "pending", secret_ref: "11111111-1111-4111-8111-111111111111", metadata: { label: "Telegram Bot", telegram: {} } };

  const query = (data: unknown) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.neq = () => chain;
    chain.maybeSingle = async () => ({ data, error: null });
    chain.single = async () => ({ data, error: null });
    return chain;
  };
  const client = {
    from(table: string) {
      if (table === "integration_providers") return query(provider);
      if (table === "integration_connections") {
        const chain = query(connection) as Record<string, (...args: unknown[]) => unknown>;
        chain.update = (payload: unknown) => {
          const metadata = payload && typeof payload === "object" && "metadata" in payload ? (payload as { metadata?: unknown }).metadata : undefined;
          chain.single = async () => ({ data: { ...updated, ...(metadata ? { metadata } : {}) }, error: null });
          return chain;
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, "integration_secret_store_upsert");
      storedSecret = String(args.p_secret || "");
      return { data: "11111111-1111-4111-8111-111111111111", error: null };
    },
  };

  const result = await configureSupportedPlatformProvider(client as never, "actor-user", {
    providerKey: "telegram",
    environment: "production",
    label: "Telegram Bot",
    secretPayload: JSON.stringify({ botToken: "123:short" }),
  });
  const secret = JSON.parse(storedSecret) as Record<string, string>;
  assert.equal(result.secretConfigured, true);
  assert.doesNotMatch(JSON.stringify(result), /123:short|TELEGRAM_WEBHOOK_SECRET/);
  assert.equal(secret.TELEGRAM_BOT_TOKEN, "123:short");
  assert.match(secret.TELEGRAM_WEBHOOK_SECRET, /^[A-Za-z0-9_-]{32,64}$/);
});
