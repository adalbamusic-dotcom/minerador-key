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
  if (!url || !key) {
    /* Qual das duas faltou — sem imprimir nenhuma das duas. */
    console.error("[persistence:config]", url ? "SUPABASE_SERVICE_ROLE_KEY ausente" : "NEXT_PUBLIC_SUPABASE_URL ausente");
    throw new PersistenceUnavailableError(persistenceUnavailableMessage("configuration_missing"), "configuration_missing");
  }
  operationalClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return operationalClient;
}

/**
 * ===== O PONTO ÚNICO ONDE A FRASE NASCE — RADAR_EDITORIAL_SUPABASE_RUNTIME_FIX_1 =====
 *
 * Instrumentar rota por rota não funcionou, e o motivo é estrutural:
 * `authzErrorResponse` devolve `err.message` de QUALQUER `Error`. Uma rota que
 * nem importa `PersistenceUnavailableError` ainda assim entrega a frase
 * canônica ao cliente — e cada `catch` novo seria mais um lugar para esquecer.
 *
 * Aqui não tem como escapar: toda ocorrência desta mensagem passa por
 * `mapPersistenceError` ou por `getOperationalClient`. Um log só responde
 * "qual operação, qual tabela, qual rota".
 *
 * E se ele NÃO aparecer na próxima reprodução, isso também é resposta: a frase
 * veio de estado já carregado no cliente, não de uma chamada ao Supabase.
 *
 * Nada de credencial: razão, código do Postgres, mensagem do driver e as
 * primeiras molduras da pilha, que nomeiam o chamador.
 */
function chamadorProvavel(): string {
  const pilha = new Error().stack || "";
  return pilha
    .split("\n")
    .slice(2, 7)
    .map(linha => linha.trim())
    .filter(linha => !linha.includes("editorial-db"))
    .slice(0, 3)
    .join(" | ");
}

export function mapPersistenceError(error: unknown): never {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "Erro de persistência.";
  const reason = persistenceReasonFromError(code, message);
  if (reason !== "repository_unavailable") {
    console.error("[persistence]", reason, code || "(sem code)", message, "::", chamadorProvavel());
    throw new PersistenceUnavailableError(persistenceUnavailableMessage(reason), reason, { code, message });
  }
  console.error("[persistence:repository]", code || "(sem code)", message, "::", chamadorProvavel());
  throw error instanceof Error ? error : new Error(message);
}
