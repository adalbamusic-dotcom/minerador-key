/**
 * ===== O ASSUNTO DO DOCUMENTO DO REDATOR — pedido do dono, 2026-10-13 =====
 *
 * "Coloca sempre o assunto no painel para que seja legível." A lista de
 * documentos e o cabeçalho do documento aberto mostram o Assunto do artigo.
 *
 * Fonte única: o ArticleDNA (`subject.phrase`) que a mesa já carrega em
 * memória (`pipeline.articleVersions`, chave = `articleDnaRef.entityId`).
 * Quando o ArticleDNA não está na mesa, vale a linha do tronco que o Radar
 * gravou no envio (`importedContext.editorialContext`, lida pela mesma
 * projeção do painel de fundamentos). Nada é buscado; nada é gravado.
 *
 * Domínio puro: sem fetch, sem storage.
 */

import { radarFoundationsSubjectOf } from "./radar-foundations.ts";

type DocumentoComAssunto = {
  articleDnaRef?: { entityId?: string | null } | null;
  importedContext?: { editorialContext?: readonly string[] | null } | null;
} | null | undefined;

type ArticleDnaPorId = Readonly<Record<string, { payload?: { subject?: { phrase?: string | null } | null } | null } | undefined>>;

export function writerDocumentSubjectPhrase(documento: DocumentoComAssunto, articleVersions: ArticleDnaPorId): string | null {
  if (!documento) return null;
  const articleId = documento.articleDnaRef?.entityId;
  const doDna = articleId ? articleVersions[articleId]?.payload?.subject?.phrase : null;
  if (typeof doDna === "string" && doDna.trim()) return doDna.trim();
  const linhas = documento.importedContext?.editorialContext;
  const doEnvio = linhas?.length ? radarFoundationsSubjectOf({ editorialContext: [...linhas] })?.phrase : null;
  return typeof doEnvio === "string" && doEnvio.trim() ? doEnvio.trim() : null;
}
