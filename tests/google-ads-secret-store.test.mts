import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createIntegrationSecretStore,
  normalizeIntegrationSecretRef,
  IntegrationSecretStoreError,
} from "../lib/server/integration-secret-store.ts";

const SECRET_REF = "10000000-0000-4000-8000-000000000001";
const SECRET_PAYLOAD = JSON.stringify({
  GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
  GOOGLE_ADS_CLIENT_ID: "client-id",
  GOOGLE_ADS_CLIENT_SECRET: "client-secret",
  GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
});

type RpcResult = { data: unknown; error: { message: string } | null };

function rpcClient(handler: (name: string, args: Record<string, unknown>) => RpcResult | Promise<RpcResult>) {
  return { rpc: handler } as unknown as Pick<SupabaseClient, "rpc">;
}

test("shared secret store normaliza referências e resolve somente por RPC server-side", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const store = createIntegrationSecretStore(rpcClient((name, args) => {
    calls.push({ name, args });
    return { data: SECRET_PAYLOAD, error: null };
  }));

  assert.equal(normalizeIntegrationSecretRef(`  ${SECRET_REF} `), SECRET_REF);
  assert.equal(await store.resolve(` ${SECRET_REF} `), SECRET_PAYLOAD);
  assert.deepEqual(calls, [{ name: "integration_secret_resolve", args: { p_secret_ref: SECRET_REF } }]);
  assert.throws(() => normalizeIntegrationSecretRef("vault://legacy"), (error: unknown) => error instanceof IntegrationSecretStoreError && error.code === "INTEGRATION_SECRET_REF_INVALID");
});

test("shared secret store cria/atualiza por referência sem alterar o contrato de connection", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const store = createIntegrationSecretStore(rpcClient((name, args) => {
    calls.push({ name, args });
    return { data: SECRET_REF, error: null };
  }));

  assert.equal(await store.store({ secret: SECRET_PAYLOAD, name: "google_ads_platform", description: "Google Ads server credential" }), SECRET_REF);
  assert.equal(await store.store({ secretRef: SECRET_REF, secret: SECRET_PAYLOAD, name: "google_ads_platform", description: "Google Ads server credential" }), SECRET_REF);
  assert.equal(calls[0].args.p_secret_ref, null);
  assert.equal(calls[1].args.p_secret_ref, SECRET_REF);
  assert.equal(calls[0].args.p_secret, SECRET_PAYLOAD);
});
