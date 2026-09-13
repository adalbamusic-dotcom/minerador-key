/**
 * O CACHE DO NAVEGADOR NÃO É AUTORIDADE.
 *
 * A recuperação local existe para dar continuidade ao trabalho na MESMA aba
 * depois de um F5. Ela nunca foi persistência, nunca foi prova e nunca deveria
 * ter poder de veto sobre uma operação já concluída — muito menos sobre uma
 * coleta paga que já voltou do provider e já pode estar gravada remotamente.
 *
 * Este módulo existe por causa de duas falhas concretas:
 *
 * 1. `catch { return false }` colapsava causas distintas — quota estourada,
 *    contrato divergente, `window` ausente — numa única frase muda. Quem lia a
 *    tela não conseguia distinguir "o navegador está cheio" de "o schema
 *    mudou", e o Dev não conseguia reproduzir nenhuma das duas.
 *
 * 2. O booleano era lido como veredito: `if (!salvou) throw`. Uma gravação de
 *    cache que falha passava a descartar o resultado remoto do estado em
 *    memória, e a tela voltava a dizer "Não iniciado" sobre uma pesquisa que
 *    realmente aconteceu.
 *
 * A ordem correta é sempre: estado em memória primeiro, cache depois, aviso
 * quando o cache falhar. O aviso é sobre o NAVEGADOR, nunca sobre a coleta.
 */

/** O que a gravação local produziu. `null` em `reason` significa sucesso. */
export type LocalRecoveryOutcome = {
  saved: boolean;
  /** Frase curta, em português, sobre o navegador. Nunca sobre a operação. */
  reason: string | null;
};

export const LOCAL_RECOVERY_SAVED: LocalRecoveryOutcome = { saved: true, reason: null };

/**
 * Traduz a exceção da gravação local para uma causa nomeada.
 *
 * `QuotaExceededError` chega com nomes diferentes conforme o motor, e em
 * navegadores antigos vinha só pelo `code` legado (22 / 1014). Tratar os três
 * é o que separa "o armazenamento está cheio" de "causa não identificada".
 */
export function describeLocalRecoveryFailure(error: unknown): string {
  if (isQuotaExceeded(error)) {
    return "o armazenamento local do navegador está cheio (quota excedida)";
  }
  const issue = firstSchemaIssuePath(error);
  if (issue) {
    return `o snapshot local não corresponde ao contrato de recuperação em "${issue}"`;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "causa não identificada pelo navegador";
}

function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  if (candidate.name === "QuotaExceededError" || candidate.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  return candidate.code === 22 || candidate.code === 1014;
}

/**
 * O primeiro caminho recusado pelo contrato, quando a exceção for de schema.
 *
 * Lido estruturalmente (`issues[].path`) para não depender de `instanceof` num
 * módulo que precisa rodar fora do bundle do cliente.
 */
function firstSchemaIssuePath(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues) || !issues.length) return null;
  const first = issues[0] as { path?: unknown };
  const path = Array.isArray(first?.path)
    ? first.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number").join(".")
    : "";
  return path || "campo não nomeado";
}

/**
 * A FRASE QUE VAI À TELA — e o que ela NÃO pode dizer.
 *
 * Ela nomeia o navegador como responsável e diz, na mesma linha, o que de fato
 * aconteceu com o trabalho. Sem essa segunda metade a pessoa lê "não pôde ser
 * salva" e conclui, corretamente pelo texto e erradamente pelo fato, que
 * precisa refazer a pesquisa — foi exatamente o que aconteceu três vezes.
 *
 * DUAS SITUAÇÕES, DUAS FRASES — e a diferença não é de tom.
 *
 * Com o servidor confirmado, o trabalho está seguro e só o cache do navegador
 * ficou para trás: "não precisa ser refeita" é verdade. SEM essa confirmação,
 * o que existe está apenas nesta aba — e prometer que não precisa ser refeita
 * seria a mesma mentira de antes, invertida. A segunda frase não manda refazer
 * (isso custaria uma consulta paga de novo); ela diz onde o trabalho está e o
 * que o pode apagar.
 */
export function localRecoveryWarning(input: {
  operation: string;
  reason: string;
  remoteConfirmed: boolean;
  /**
   * O sujeito é feminino? — 18.10.2 · §10.
   *
   * O smoke leu "O relatório competitivo foi concluída": a frase é montada com
   * o rótulo na frente e o particípio atrás, e o rótulo muda de gênero conforme
   * a etapa gravada. Padrão feminino porque a maioria das operações é ("a
   * coleta", "a análise", "a pesquisa"), mas quem chama declara.
   */
  operationFeminine?: boolean;
}): string {
  const feminino = input.operationFeminine ?? true;
  const salva = feminino ? "salva" : "salvo";
  const concluida = feminino ? "concluída" : "concluído";
  const perdela = feminino ? "perdê-la" : "perdê-lo";

  if (input.remoteConfirmed) {
    return `${input.operation} foi ${salva} remotamente e não precisa ser ${feminino ? "refeita" : "refeito"}. Apenas a cópia de recuperação no navegador não pôde ser atualizada: ${input.reason}.`;
  }
  return `${input.operation} foi ${concluida} e está ${feminino ? "aplicada" : "aplicado"} nesta aba, mas não foi ${feminino ? "confirmada" : "confirmado"} no servidor nem na cópia de recuperação do navegador: ${input.reason}. Recarregar a página pode ${perdela}.`;
}
