export type PersistenceUnavailableReason = "configuration_missing" | "migration_missing" | "connection_unavailable" | "repository_unavailable";

export function persistenceReasonFromError(code: string, message: string): PersistenceUnavailableReason {
  if (["42P01", "PGRST205", "PGRST204"].includes(code) || /relation .* does not exist|schema cache/i.test(message)) return "migration_missing";
  if (/fetch failed|network|timeout|timed out|econn|connection/i.test(message)) return "connection_unavailable";
  return "repository_unavailable";
}

export function persistenceUnavailableMessage(reason: PersistenceUnavailableReason) {
  if (reason === "configuration_missing") return "Configuração server-side do Supabase ausente; a coleta local continua disponível quando a keyword estiver hidratada.";
  if (reason === "migration_missing") return "Tabela editorial remota ausente; aplique a migration correspondente para confirmar a persistência remota.";
  if (reason === "connection_unavailable") return "Não foi possível conectar ao Supabase editorial; a coleta local continua disponível quando a keyword estiver hidratada.";
  return "O repositório editorial remoto não pôde ser inicializado; a coleta local continua disponível quando a keyword estiver hidratada.";
}
