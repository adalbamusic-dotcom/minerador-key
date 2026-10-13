/**
 * COMO UMA MENSAGEM DO ARQUITETO NOMEIA O ARTIGO (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 12).
 *
 * A recusa do envio ao Radar nomeava o artigo pela `promise` ("Cobrir com
 * clareza o tema …"), frase que o dono não reconhece na planilha. Agora é o
 * Assunto (ou, sem Assunto, a principal) e o slug — como o Radar já faz.
 */
export function architectArticleNoticeLabel(input: {
  subjectPhrase?: string | null;
  principal?: string | null;
  slug?: string | null;
  fallback: string;
}): string {
  const assunto = (input.subjectPhrase || "").trim();
  const principal = (input.principal || "").trim();
  const titulo = assunto ? `Assunto “${assunto}”` : principal || input.fallback;
  const slug = (input.slug || "").trim().replace(/^\/+/, "");
  return slug ? `${titulo} · /${slug}` : titulo;
}
