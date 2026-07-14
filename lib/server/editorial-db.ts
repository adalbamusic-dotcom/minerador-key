import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let operationalClient: SupabaseClient | null = null;

export class PersistenceUnavailableError extends Error {
  code = "persistence_unavailable";
  constructor(message = "A persistência editorial ainda não está disponível.") { super(message); this.name = "PersistenceUnavailableError"; }
}

export class OptimisticLockError extends Error {
  code = "stale_version";
  constructor(message = "O registro foi alterado por outra sessão. Recarregue antes de salvar novamente.") { super(message); this.name = "OptimisticLockError"; }
}

export function getOperationalClient() {
  if (operationalClient) return operationalClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new PersistenceUnavailableError("Configuração server-side do Supabase ausente.");
  operationalClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return operationalClient;
}

export function mapPersistenceError(error: unknown): never {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "Erro de persistência.";
  if (["42P01", "PGRST205", "PGRST204"].includes(code) || /relation .* does not exist|schema cache/i.test(message)) throw new PersistenceUnavailableError();
  throw error instanceof Error ? error : new Error(message);
}

