"use client";

/**
 * 2026-10-13 · Abrir "Cadastrar Assuntos" a partir do Descobrir (outra página).
 *
 * O Descobrir não monta o card: ele leva o dono ao Processador com
 * `?cadastrar=1`, e o texto colado (quando houver) viaja numa chave de
 * sessionStorage DESTA marca, escrita e consumida só por este fluxo. É
 * conveniência de apresentação (try/catch em tudo); sem armazenamento o card
 * abre vazio.
 */

export const SUBJECT_CADASTRO_URL_PARAM = "cadastrar";

const chave = (brandId: string) => `minerador-key:cadastro-assuntos:texto:${brandId}`;

export function stashSubjectCadastroText(brandId: string, text: string) {
  try {
    window.sessionStorage.setItem(chave(brandId), text);
  } catch {
    /* Sem armazenamento: o card abre vazio. */
  }
}

/** Lê e consome o texto deixado por `stashSubjectCadastroText` (só a chave deste fluxo). */
export function takeSubjectCadastroText(brandId: string): string {
  try {
    const texto = window.sessionStorage.getItem(chave(brandId)) || "";
    if (texto) window.sessionStorage.removeItem(chave(brandId));
    return texto;
  } catch {
    return "";
  }
}

export function subjectCadastroHref(brandRef: string) {
  return `/${brandRef}/minerador?${SUBJECT_CADASTRO_URL_PARAM}=1`;
}
