import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { persistenceReasonFromError, persistenceUnavailableMessage, type PersistenceUnavailableReason } from "../radar/persistence";

let operationalClient: SupabaseClient | null = null;

export class PersistenceUnavailableError extends Error {
  code = "persistence_unavailable";
  readonly reason: PersistenceUnavailableReason;
  constructor(message = persistenceUnavailableMessage("repository_unavailable"), reason: PersistenceUnavailableReason = "repository_unavailable") { super(message); this.name = "PersistenceUnavailableError"; this.reason = reason; }
}

export class OptimisticLockError extends Error {
  code = "stale_version";
  constructor(message = "O registro foi alterado por outra sessão. Recarregue antes de salvar novamente.") { super(message); this.name = "OptimisticLockError"; }
}

export function getOperationalClient() {
  if (operationalClient) return operationalClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new PersistenceUnavailableError(persistenceUnavailableMessage("configuration_missing"), "configuration_missing");
  operationalClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return operationalClient;
}

export function mapPersistenceError(error: unknown): never {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "Erro de persistência.";
  const reason = persistenceReasonFromError(code, message);
  if (reason !== "repository_unavailable") throw new PersistenceUnavailableError(persistenceUnavailableMessage(reason), reason);
  throw error instanceof Error ? error : new Error(message);
}
