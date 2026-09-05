import assert from "node:assert/strict";
import test from "node:test";
import { configureSupportedPlatformProvider } from "../lib/server/platform-integrations-admin.ts";
import { DEEPSEEK_DEFAULT_MODEL } from "../lib/deepseek-model-config.ts";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const PROVIDER_ID = "10000000-0000-4000-8000-000000000002";
const CONNECTION_ID = "10000000-0000-4000-8000-000000000003";
const SECRET_REF = "10000000-0000-4000-8000-000000000004";
const API_KEY = "deepseek-secret-fixture";

type ProviderRow = { id: string; provider_key: "deepseek"; status: "active" };
type ConnectionRow = {
  id: string;
  provider_id: string;
  owner_scope_type: "platform";
  environment: "production";
  lifecycle_status: string;
  secret_ref: string | null;
  metadata: Record<string, unknown>;
};

function fakeClient(options: {
  provider?: ProviderRow | null;
  connection?: ConnectionRow | null;
  secretStoreError?: boolean;
  connectionInsertError?: boolean;
} = {}) {
  let provider = options.provider === undefined ? null : options.provider;
  let connection = options.connection === undefined ? null : options.connection;
  const writes: Array<{ table: string; operation: "insert" | "update"; payload: Record<string, unknown> }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const client = {
    from(table: string) {
      let operation: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        neq() { return builder; },
        insert(value: Record<string, unknown>) {
          operation = "insert";
          payload = value;
          writes.push({ table, operation, payload });
          return builder;
        },
        update(value: Record<string, unknown>) {
          operation = "update";
          payload = value;
          writes.push({ table, operation, payload });
          return builder;
        },
        async maybeSingle() {
          if (table === "integration_providers") return { data: provider, error: null };
          if (table === "integration_connections") return { data: connection, error: null };
          return { data: null, error: null };
        },
        async single() {
          if (table === "integration_providers" && operation === "insert") {
            provider = { id: PROVIDER_ID, provider_key: "deepseek", status: "active" };
            return { data: provider, error: null };
          }
          if (table === "integration_connections" && operation === "insert") {
            if (options.connectionInsertError) return { data: null, error: { code: "CONNECTION_INSERT_FAILED" } };
            connection = {
              id: CONNECTION_ID,
              provider_id: PROVIDER_ID,
              owner_scope_type: "platform",
              environment: "production",
              lifecycle_status: "draft",
              secret_ref: null,
              metadata: { label: String(payload.metadata && (payload.metadata as Record<string, unknown>).label) },
            };
            return { data: connection, error: null };
          }
          if (table === "integration_connections" && operation === "update" && connection) {
            connection = {
              ...connection,
              lifecycle_status: String(payload.lifecycle_status),
              secret_ref: typeof payload.secret_ref === "string" ? payload.secret_ref : connection.secret_ref,
              metadata: payload.metadata as Record<string, unknown>,
            };
            return { data: connection, error: null };
          }
          return { data: null, error: { code: "UNEXPECTED_QUERY" } };
        },
      };
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (options.secretStoreError) return { data: null, error: { code: "SECRET_STORE_FAILED" } };
      return { data: SECRET_REF, error: null };
    },
  };

  return { client, writes, rpcCalls, get connection() { return connection; } };
}

function input(secretPayload = JSON.stringify({ DEEPSEEK_API_KEY: API_KEY })) {
  return {
    providerKey: "deepseek",
    environment: "production",
    label: "DeepSeek Platform",
    secretPayload,
  };
}

test("configuração DeepSeek cria provider/Connection, grava no Secret Store e retorna somente readback seguro", async () => {
  const fake = fakeClient();
  const result = await configureSupportedPlatformProvider(fake.client as never, ACTOR_ID, input());

  assert.equal(result.providerKey, "deepseek");
  assert.equal(result.ownerScope, "platform");
  assert.equal(result.lifecycleStatus, "pending");
  assert.equal(result.secretConfigured, true);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(API_KEY));
  assert.equal(fake.writes.filter((write) => write.table === "integration_providers" && write.operation === "insert").length, 1);
  assert.equal(fake.writes.filter((write) => write.table === "integration_connections" && write.operation === "insert").length, 1);
  assert.equal(fake.writes.filter((write) => write.table === "integration_connections" && write.operation === "update").length, 1);
  assert.deepEqual(fake.rpcCalls[0], {
    name: "integration_secret_store_upsert",
    args: {
      p_secret_ref: null,
      p_secret: JSON.stringify({ DEEPSEEK_API_KEY: API_KEY }),
      p_name: "deepseek_platform",
      p_description: "DeepSeek platform credential",
    },
  });
  assert.equal(fake.connection?.metadata.deepseek_model, DEEPSEEK_DEFAULT_MODEL);
});

test("reconfiguração DeepSeek reutiliza a Connection e substitui o segredo sem duplicação", async () => {
  const existing: ConnectionRow = {
    id: CONNECTION_ID,
    provider_id: PROVIDER_ID,
    owner_scope_type: "platform",
    environment: "production",
    lifecycle_status: "pending",
    secret_ref: SECRET_REF,
    metadata: { label: "DeepSeek antiga", deepseek_model: DEEPSEEK_DEFAULT_MODEL },
  };
  const fake = fakeClient({ provider: { id: PROVIDER_ID, provider_key: "deepseek", status: "active" }, connection: existing });
  const result = await configureSupportedPlatformProvider(fake.client as never, ACTOR_ID, input(JSON.stringify({ DEEPSEEK_API_KEY: "rotated-secret" })));

  assert.equal(result.id, CONNECTION_ID);
  assert.equal(fake.writes.filter((write) => write.operation === "insert").length, 0);
  assert.equal(fake.writes.filter((write) => write.table === "integration_connections" && write.operation === "update").length, 1);
  assert.equal(fake.rpcCalls[0]?.args.p_secret_ref, SECRET_REF);
  assert.equal(fake.connection?.metadata.deepseek_model, DEEPSEEK_DEFAULT_MODEL);
});

test("payload inválido, falha no Secret Store e falha de Connection não produzem falso sucesso", async () => {
  const invalid = fakeClient();
  await assert.rejects(
    configureSupportedPlatformProvider(invalid.client as never, ACTOR_ID, input("{}")),
    (error: unknown) => error instanceof Error && error.message.includes("credencial") && invalid.writes.length === 0,
  );

  const secretFailure = fakeClient({ secretStoreError: true });
  await assert.rejects(configureSupportedPlatformProvider(secretFailure.client as never, ACTOR_ID, input()), /secret store/i);
  assert.equal(secretFailure.writes.filter((write) => write.operation === "update").length, 0);

  const connectionFailure = fakeClient({ connectionInsertError: true });
  await assert.rejects(configureSupportedPlatformProvider(connectionFailure.client as never, ACTOR_ID, input()), /connection/i);
  assert.equal(connectionFailure.rpcCalls.length, 0);
});

