export type PersistenceUnavailableReason = "configuration_missing" | "migration_missing" | "statement_timeout" | "connection_unavailable" | "repository_unavailable";

/**
 * ===== 57014 NÃO É FALHA DE CONEXÃO — RADAR_TO_WRITER_NO_ANALYSIS_APPEND_1 · §7 =====
 *
 * `canceling statement due to statement timeout` contém a palavra "timeout", e
 * por isso caía na regra de rede: a tela dizia "não foi possível conectar ao
 * Supabase" para uma conexão que funcionou perfeitamente e devolveu um erro.
 *
 * A mentira custou caro: toda a investigação foi atrás de rede, env e
 * disponibilidade do projeto, enquanto a causa real era uma escrita grande
 * demais para o tempo limite. Uma mensagem que descreve a causa errada é pior
 * que uma mensagem genérica, porque ela dirige o diagnóstico para o lugar
 * errado com confiança.
 *
 * O teste do statement timeout vem PRIMEIRO, de propósito: ele é específico, e
 * a regra de rede é ampla o bastante para engoli-lo.
 */
const STATEMENT_TIMEOUT_CODES = ["57014"];

export function persistenceReasonFromError(code: string, message: string): PersistenceUnavailableReason {
  if (["42P01", "PGRST205", "PGRST204"].includes(code) || /relation .* does not exist|schema cache/i.test(message)) return "migration_missing";
  if (STATEMENT_TIMEOUT_CODES.includes(code) || /statement timeout|canceling statement/i.test(message)) return "statement_timeout";
  if (/fetch failed|network|timeout|timed out|econn|connection/i.test(message)) return "connection_unavailable";
  return "repository_unavailable";
}

export function persistenceUnavailableMessage(reason: PersistenceUnavailableReason) {
  if (reason === "configuration_missing") return "Configuração server-side do Supabase ausente; a coleta local continua disponível quando a keyword estiver hidratada.";
  if (reason === "migration_missing") return "Tabela editorial remota ausente; aplique a migration correspondente para confirmar a persistência remota.";
  if (reason === "statement_timeout") return "A operação no banco excedeu o tempo limite. A conexão está de pé: o que passou do limite foi a consulta.";
  if (reason === "connection_unavailable") return "Não foi possível conectar ao Supabase editorial; a coleta local continua disponível quando a keyword estiver hidratada.";
  return "O repositório editorial remoto não pôde ser inicializado; a coleta local continua disponível quando a keyword estiver hidratada.";
}
