/**
 * ===== O ASSUNTO NA LINHA DO ARTIGO — pedido do dono, 2026-10-13 =====
 *
 * "Coloca sempre o assunto no painel para que seja legível." Só a keyword
 * principal não identifica o artigo; o Assunto (tronco editorial declarado no
 * Minerador e fixado no ArticleDNA em `subject.phrase`) identifica.
 *
 * Uma linha só, em todas as áreas: rótulo "Assunto · " em `text-text-muted`,
 * a frase INTEIRA em `text-foreground` (14 px, quebra de linha, nunca
 * truncada) e `title` com a frase. Sem Assunto: "Sem Assunto" em
 * `text-text-muted` — ou nada, quando a área decide não poluir a lista
 * (`showEmpty={false}`). Só lê: não decide, não grava, não busca.
 */

import type { ReactNode } from "react";

/** A frase do Assunto de um ArticleDNA (ou de qualquer objeto com `subject`). Vazia vira null. */
export function articleSubjectPhraseOf(source: { subject?: { phrase?: string | null } | null } | null | undefined): string | null {
  const phrase = source?.subject?.phrase;
  return typeof phrase === "string" && phrase.trim() ? phrase.trim() : null;
}

export const ARTICLE_SUBJECT_LABEL = "Assunto · ";
export const ARTICLE_SUBJECT_EMPTY = "Sem Assunto";

type ArticleSubjectLineProps = {
  phrase: string | null | undefined;
  /** Mostrar "Sem Assunto" quando não houver frase. Padrão: sim. */
  showEmpty?: boolean;
  /** `span` quando a linha vive dentro de botão, rótulo ou outro inline. */
  as?: "p" | "span" | "div";
  className?: string;
  /** `data-testid` da linha, para os testes de cada área. */
  testId?: string;
};

export function ArticleSubjectLine({ phrase, showEmpty = true, as = "p", className = "", testId }: ArticleSubjectLineProps): ReactNode {
  const Tag = as;
  const frase = typeof phrase === "string" && phrase.trim() ? phrase.trim() : null;
  const bloco = as === "span" ? "block " : "";
  if (frase) {
    return (
      <Tag data-testid={testId} data-article-subject="presente" title={`Assunto: ${frase}`} className={`${bloco}min-w-0 whitespace-normal break-words text-left text-sm font-medium leading-snug text-foreground ${className}`}>
        <span className="font-normal text-text-muted">{ARTICLE_SUBJECT_LABEL}</span>{frase}
      </Tag>
    );
  }
  if (!showEmpty) return null;
  return (
    <Tag data-testid={testId} data-article-subject="ausente" title="Este artigo não tem Assunto declarado" className={`${bloco}min-w-0 text-left text-sm leading-snug text-text-muted ${className}`}>
      {ARTICLE_SUBJECT_EMPTY}
    </Tag>
  );
}
