import { loadStateSummary, type WorkspaceLoadDiagnostics } from "../editorial/partial-read.ts";
import { radarArticleDisplayTitle } from "./r3-workbench.ts";

/**
 * ===== 2026-10-09 · A PLANILHA DO RADAR DIZ QUANDO A LISTA NÃO VEIO DO SERVIDOR =====
 *
 * Visto em produção: a leitura da mesa (GET /api/editorial/workspace) falhava
 * por tamanho (10,95 MB contra o teto de 4,5 MB da Vercel) e a planilha seguia
 * desenhando a cópia local do navegador — só o artigo piloto — sem aviso. O
 * aviso só aparecia com a planilha vazia ou com registro incompatível.
 *
 * Regra: leitura que falhou (ou acesso negado) aparece SEMPRE que há linhas na
 * planilha, porque elas podem ser só o que este navegador guardou. E a
 * importação do Arquiteto espera a lista do servidor: sem ela, a tela não sabe
 * quais artigos já estão no Radar nem a versão que o Arquiteto entregou.
 *
 * Módulo puro: sem React, sem servidor.
 */

type Diagnostico = Pick<WorkspaceLoadDiagnostics, "state" | "message" | "loadedCount" | "incompatible">;

export function radarListReadFailed(diagnostico: Pick<WorkspaceLoadDiagnostics, "state">): boolean {
  return diagnostico.state === "read_failure" || diagnostico.state === "access_denied";
}

/** O aviso da planilha com linhas na tela; `null` quando a lista veio do servidor ou a planilha está vazia (o vazio já tem a sua frase). */
export function radarListReadFailureNotice(diagnostico: Diagnostico, linhasNaTela: number): string | null {
  if (!radarListReadFailed(diagnostico) || linhasNaTela === 0) return null;
  return `${loadStateSummary(diagnostico as WorkspaceLoadDiagnostics)} A planilha mostra só o que este navegador guardou; os artigos continuam salvos no servidor.`;
}

export const RADAR_IMPORT_NEEDS_SERVER_LIST = "A lista do Radar não carregou do servidor. Use “Tentar carregar novamente” antes de importar: sem ela, a tela não sabe quais artigos já estão no Radar nem a versão que o Arquiteto entregou.";

/** A frase que segura a importação enquanto a lista do servidor não chegou; `null` libera. */
export function radarImportBlockedByListRead(diagnostico: Pick<WorkspaceLoadDiagnostics, "state">): string | null {
  return radarListReadFailed(diagnostico) ? RADAR_IMPORT_NEEDS_SERVER_LIST : null;
}

/** O nome do artigo no aviso da importação: o título (sem a moldura "Cobrir com clareza o tema") e o slug, que separa homônimos. */
export function radarImportNoticeLabel(artigo: { promise?: string | null; slug?: string | null; fallback: string }): string {
  const titulo = radarArticleDisplayTitle(artigo.promise || "") || artigo.fallback;
  const slug = (artigo.slug || "").trim().replace(/^\/+/, "");
  return slug ? `${titulo} · /${slug}` : titulo;
}
