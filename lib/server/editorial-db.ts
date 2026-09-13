import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { persistenceReasonFromError, persistenceUnavailableMessage, type PersistenceUnavailableReason } from "../radar/persistence";

let operationalClient: SupabaseClient | null = null;

export class PersistenceUnavailableError extends Error {
  code = "persistence_unavailable";
  readonly reason: PersistenceUnavailableReason;
  /**
   * O ERRO DO DRIVER, PRESERVADO.
   *
   * `persistenceReasonFromError` classifica por regex sobre a mensagem e depois
   * a joga fora. Com isso, "não foi possível conectar ao Supabase" passou a
   * cobrir coisas muito diferentes — timeout de statement, payload grande
   * demais, socket derrubado, RLS — e nenhuma delas chegava a quem precisava
   * corrigir. O rótulo continua; o que o originou deixa de sumir.
   */
  readonly driver: { code: string; message: string } | null;
  constructor(
    message = persistenceUnavailableMessage("repository_unavailable"),
    reason: PersistenceUnavailableReason = "repository_unavailable",
    driver: { code: string; message: string } | null = null,
  ) { super(message); this.name = "PersistenceUnavailableError"; this.reason = reason; this.driver = driver; }
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
  if (reason !== "repository_unavailable") throw new PersistenceUnavailableError(persistenceUnavailableMessage(reason), reason, { code, message });
  throw error instanceof Error ? error : new Error(message);
}
