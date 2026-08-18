import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type SecretStoreClient = Pick<SupabaseClient, "rpc">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IntegrationSecretStoreErrorCode =
  | "INTEGRATION_SECRET_REF_INVALID"
  | "INTEGRATION_SECRET_STORE_UNAVAILABLE";

export class IntegrationSecretStoreError extends Error {
  public readonly code: IntegrationSecretStoreErrorCode;

  constructor(code: IntegrationSecretStoreErrorCode, message: string) {
    super(message);
    this.name = "IntegrationSecretStoreError";
    this.code = code;
  }
}

export function normalizeIntegrationSecretRef(value: unknown) {
  if (typeof value !== "string") {
    throw new IntegrationSecretStoreError("INTEGRATION_SECRET_REF_INVALID", "A referência do segredo é inválida.");
  }
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new IntegrationSecretStoreError("INTEGRATION_SECRET_REF_INVALID", "A referência do segredo não possui o formato aceito pelo secret store.");
  }
  return normalized;
}

export type IntegrationSecretStore = {
  resolve(secretRef: string): Promise<string | null>;
  store(input: {
    secretRef?: string | null;
    secret: string;
    name: string;
    description: string;
  }): Promise<string>;
};

function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== "string") throw new IntegrationSecretStoreError("INTEGRATION_SECRET_STORE_UNAVAILABLE", `O campo ${field} não foi aceito pelo secret store.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new IntegrationSecretStoreError("INTEGRATION_SECRET_STORE_UNAVAILABLE", `O campo ${field} não foi aceito pelo secret store.`);
  return normalized;
}

export function createIntegrationSecretStore(client: SecretStoreClient): IntegrationSecretStore {
  return {
    async resolve(secretRef) {
      const normalizedRef = normalizeIntegrationSecretRef(secretRef);
      const result = await client.rpc("integration_secret_resolve", { p_secret_ref: normalizedRef });
      if (result.error) {
        throw new IntegrationSecretStoreError("INTEGRATION_SECRET_STORE_UNAVAILABLE", "O secret store compartilhado não está disponível.");
      }
      return typeof result.data === "string" && result.data.length > 0 ? result.data : null;
    },

    async store(input) {
      const normalizedSecret = requiredText(input.secret, "secret", 200_000);
      const normalizedName = requiredText(input.name, "name", 160);
      const normalizedDescription = requiredText(input.description, "description", 500);
      const normalizedRef = input.secretRef === null || typeof input.secretRef === "undefined" || (typeof input.secretRef === "string" && input.secretRef.trim() === "")
        ? null
        : normalizeIntegrationSecretRef(input.secretRef);
      const result = await client.rpc("integration_secret_store_upsert", {
        p_secret_ref: normalizedRef,
        p_secret: normalizedSecret,
        p_name: normalizedName,
        p_description: normalizedDescription,
      });
      if (result.error || typeof result.data !== "string" || !result.data.trim()) {
        throw new IntegrationSecretStoreError("INTEGRATION_SECRET_STORE_UNAVAILABLE", "Não foi possível armazenar o segredo no secret store compartilhado.");
      }
      return result.data.trim();
    },
  };
}
