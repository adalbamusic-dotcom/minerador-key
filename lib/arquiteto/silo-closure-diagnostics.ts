/** Identifica a etapa do fechamento sem mascarar a recusa que veio dela. */
export async function siloClosureStep<T>(label: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "erro sem resposta";
    throw new Error(`${label}: ${message}`, { cause: error });
  }
}

/** Metadados sem mensagem SQL, conteúdo editorial, IDs ou credenciais. */
export function siloRpcErrorDiagnostic(error: unknown): { code: string | null; name: string | null; category: string; causeCode: string | null; domainReason: string | null } {
  const object = error && typeof error === "object" ? error as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown } : {};
  const cause = object.cause && typeof object.cause === "object" ? object.cause as { code?: unknown } : {};
  const safeCode = (value: unknown) => typeof value === "string" && /^[A-Z0-9_]{2,32}$/.test(value) ? value : null;
  const name = typeof object.name === "string" && /^(Error|TypeError|AbortError|PostgrestError)$/.test(object.name) ? object.name : null;
  const message = typeof object.message === "string" ? object.message : "";
  const category = /timeout|timed out|abort/i.test(message) ? "timeout" : /fetch failed|network|econn|enotfound|connection/i.test(message) ? "network" : safeCode(object.code) ? "database_or_api" : "unknown";
  // Somente mensagens fixas conhecidas das RPCs: não registrar valores SQL,
  // nomes editoriais, IDs nem qualquer mensagem arbitrária do banco.
  const known = ["silo pair actor does not match envelope creator", "silo pair identity or source reference is inconsistent", "initial SiloDNA pair must use version 1 without predecessor", "SiloDNA successor is not the next canonical version", "initial SiloPage pair must use version 1 without predecessor", "SiloPage successor is not the next canonical version", "only a confirmed territory can be consolidated", "territory consolidation lost the optimistic lock", "territory consolidation may not change any other territorial decision", "territory consolidation may not change any other payload field", "silo pair readback is incomplete"];
  const domainReason = known.find(item => message === item) ?? null;
  return { code: safeCode(object.code), name, category, causeCode: safeCode(cause.code), domainReason };
}
