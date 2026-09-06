import { z } from "zod";

/**
 * LEITURA PARCIAL — um registro incompatível é problema daquele registro.
 *
 * O leitor do workspace fazia `Schema.parse()` dentro do laço, sem proteção por
 * linha. Uma linha do Radar cujo payload não casava com o schema vigente
 * derrubava a consulta inteira — e junto iam os artigos bons e os itens do
 * Planejador da mesma marca. A mesa não estava suja: estava sendo escondida.
 *
 * A correção NÃO é afrouxar o schema. Afrouxar troca um defeito visível por um
 * silencioso, e um registro em formato antigo passaria a ser lido como se
 * estivesse completo. A correção é isolar a falha na linha, devolver o resto e
 * dizer, com nome e caminho, qual registro não coube.
 *
 * Três proibições que este contrato carrega:
 *
 *   1. NUNCA descartar em silêncio — incompatível é reportado, não sumido.
 *   2. NUNCA completar com default para satisfazer o schema — isso inventaria
 *      decisão editorial que ninguém tomou.
 *   3. NUNCA promover recuperado a aprovado.
 */

export const INCOMPATIBLE_RECORD_KINDS = [
  "workflow_item",
  "artifact_version",
  "version_status_event",
] as const;
export type IncompatibleRecordKind = (typeof INCOMPATIBLE_RECORD_KINDS)[number];

/**
 * O que se sabe de um registro que não coube no schema.
 *
 * A identidade vem das COLUNAS, nunca do payload: é justamente o payload que
 * está em formato desconhecido. Por isso `id`, `stage` e `articleId` são lidos
 * da linha, e só `paths` vem do Zod.
 */
export const IncompatibleRecordSchema = z.object({
  kind: z.enum(INCOMPATIBLE_RECORD_KINDS),
  /** Identidade da linha, das colunas — o payload não é confiável aqui. */
  id: z.string().min(1),
  articleId: z.string().min(1).nullable(),
  /** `radar`, `planner`, `article_dna`, `silo_dna`… conforme o tipo. */
  stage: z.string().min(1).nullable(),
  /** Caminhos que o schema recusou, para o defeito se explicar sozinho. */
  paths: z.array(z.string()),
  message: z.string().min(1),
}).strict();
export type IncompatibleRecord = z.infer<typeof IncompatibleRecordSchema>;

/**
 * COMO A LEITURA TERMINOU — cinco desfechos que antes chegavam como lista vazia.
 *
 * Colapsar os cinco em "vazio" é o que fez a interface dizer que a marca não
 * tinha artigos quando na verdade a consulta havia falhado. Cada um pede uma
 * resposta diferente do humano, então cada um precisa de nome próprio.
 */
export const WORKSPACE_LOAD_STATES = [
  /** Tudo que existe foi lido e coube. */
  "complete",
  /** Parte foi lida; há registros incompatíveis nomeados. */
  "partial",
  /** A consulta respondeu e a marca não tem registros mesmo. */
  "empty_confirmed",
  /** A sessão não tem acesso a esta marca. */
  "access_denied",
  /** A consulta falhou. NÃO é o mesmo que vazio. */
  "read_failure",
] as const;
export type WorkspaceLoadState = (typeof WORKSPACE_LOAD_STATES)[number];

export const WorkspaceLoadDiagnosticsSchema = z.object({
  state: z.enum(WORKSPACE_LOAD_STATES),
  loadedCount: z.number().int().nonnegative(),
  incompatible: z.array(IncompatibleRecordSchema),
  /** Mensagem do servidor quando `read_failure` ou `access_denied`. */
  message: z.string().min(1).nullable(),
}).strict();
export type WorkspaceLoadDiagnostics = z.infer<typeof WorkspaceLoadDiagnosticsSchema>;

export const emptyLoadDiagnostics = (): WorkspaceLoadDiagnostics => ({
  state: "empty_confirmed",
  loadedCount: 0,
  incompatible: [],
  message: null,
});

/** Os caminhos que o Zod recusou, achatados e legíveis. */
export function rejectedPaths(issues: ReadonlyArray<{ path?: unknown; message?: unknown }>): string[] {
  return issues
    .map(issue => Array.isArray(issue.path)
      ? issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number").join(".")
      : "")
    .filter(path => path.length > 0);
}

/** Primeira mensagem útil do Zod, para o humano não ler um dump. */
export function firstIssueMessage(
  issues: ReadonlyArray<{ path?: unknown; message?: unknown }>,
  fallback: string,
): string {
  for (const issue of issues) {
    if (typeof issue.message === "string" && issue.message.trim()) {
      const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
      return path ? `${path}: ${issue.message}` : issue.message;
    }
  }
  return fallback;
}

/**
 * O desfecho derivado do que a leitura produziu.
 *
 * `empty_confirmed` só vale quando NADA falhou: consulta respondeu, nenhum
 * registro incompatível e nenhum item. Vazio com incompatíveis é `partial` —
 * a marca tem trabalho, ele é que não está legível.
 */
export function resolveLoadState(input: {
  loadedCount: number;
  incompatibleCount: number;
  queryFailed?: boolean;
  accessDenied?: boolean;
}): WorkspaceLoadState {
  if (input.accessDenied) return "access_denied";
  if (input.queryFailed) return "read_failure";
  if (input.incompatibleCount > 0) return "partial";
  return input.loadedCount > 0 ? "complete" : "empty_confirmed";
}

/**
 * A frase que a interface mostra. Vazio confirmado e falha de leitura NUNCA
 * dizem a mesma coisa: um convida a importar, o outro pede nova tentativa.
 */
export function loadStateSummary(diagnostics: WorkspaceLoadDiagnostics): string {
  const { state, loadedCount, incompatible } = diagnostics;
  if (state === "access_denied") {
    return diagnostics.message || "Esta sessão não tem acesso aos dados desta marca.";
  }
  if (state === "read_failure") {
    return diagnostics.message || "Não foi possível ler os registros desta marca. Tente carregar novamente.";
  }
  if (state === "partial") {
    return `${loadedCount} item(ns) carregado(s) · ${incompatible.length} registro(s) incompatível(is)`;
  }
  if (state === "empty_confirmed") return "Nenhum registro para esta marca.";
  return `${loadedCount} item(ns) carregado(s)`;
}

/* ------------------------- dependências incompletas ---------------------- */

export const DEPENDENCY_BLOCK_REASONS = [
  "DEPENDENCIA_INCOMPATIVEL",
  "DEPENDENCIA_AUSENTE",
] as const;
export type DependencyBlockReason = (typeof DEPENDENCY_BLOCK_REASONS)[number];

export type DependencyBlock = {
  articleId: string;
  reason: DependencyBlockReason;
  detail: string;
};

/**
 * Artigo cuja dependência não pôde ser lida NÃO avança.
 *
 * Aprovar ou transferir sobre leitura parcial decidiria sobre o que ninguém
 * viu: a dependência pode estar lá, em formato que este código não entende. O
 * bloqueio é declarado e nomeia o registro — não é recusa muda.
 */
export function blockedByIncompleteDependencies(input: {
  articleIds: readonly string[];
  incompatible: readonly IncompatibleRecord[];
  /** Ids que a leitura deveria ter trazido e não trouxe. */
  missingArticleIds?: readonly string[];
}): DependencyBlock[] {
  const blocks: DependencyBlock[] = [];
  const pedidos = new Set(input.articleIds);

  for (const registro of input.incompatible) {
    if (!registro.articleId || !pedidos.has(registro.articleId)) continue;
    blocks.push({
      articleId: registro.articleId,
      reason: "DEPENDENCIA_INCOMPATIVEL",
      detail: `${registro.kind}${registro.stage ? `/${registro.stage}` : ""} ${registro.id}: ${registro.message}`,
    });
  }

  for (const articleId of input.missingArticleIds || []) {
    if (!pedidos.has(articleId)) continue;
    blocks.push({
      articleId,
      reason: "DEPENDENCIA_AUSENTE",
      detail: "A dependência não voltou da leitura remota.",
    });
  }

  return blocks.sort((left, right) => left.articleId.localeCompare(right.articleId));
}
