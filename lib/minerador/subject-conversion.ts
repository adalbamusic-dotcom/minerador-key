import { z } from "zod";
import { isKeywordSubjectActorId, resolveKeywordSubject } from "./keyword-subject.ts";

/**
 * ===== CONVERTER O ASSUNTO DO FORMATO ANTERIOR — DOMÍNIO PURO =====
 *
 * SDD `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md`.
 *
 * No formato anterior o Assunto é uma keyword própria (a "linha-título" T, cujo
 * texto é o título). Converter leva o Assunto para DENTRO da keyword K que
 * carrega o artigo (o cadastro único: `keyword_subject.entry` + plano). A
 * conversão deixa em K um bloco de PROVENIÊNCIA:
 *
 *   keyword_subject_conversion          { fromKeywordId, fromPhrase, articleId, convertedAt, actorId } | null
 *   keyword_subject_conversion_history  append-only
 *
 * T NÃO é tocada (nenhuma escrita: continua aprovada, recebida, com o pacote
 * antigo). Ela passa a valer como "linha-título convertida" por DERIVAÇÃO: há
 * uma K viva que carrega o Assunto e aponta para ela. Desfazer em K devolve T
 * ao estado de Assunto sozinha. Nada vai para a lixeira (que, para keyword não
 * publicada, é exclusão definitiva — §2.3 da SDD).
 *
 * Domínio puro: não lê banco, não grava, não chama provider.
 */

export const SUBJECT_CONVERSION_KEY = "keyword_subject_conversion" as const;
export const SUBJECT_CONVERSION_HISTORY_KEY = "keyword_subject_conversion_history" as const;

export const SUBJECT_CONVERSION_LABEL = "Convertido do formato anterior" as const;
export const CONVERTED_TITLE_LABEL = "Linha-título convertida" as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SubjectConversionSchema = z.object({
  /** A linha-título (o Assunto do formato anterior). */
  fromKeywordId: z.string().regex(UUID),
  /** O texto da linha-título no ato (é o título do Assunto). */
  fromPhrase: z.string().trim().min(1).max(400),
  /** O artigo do Arquiteto cujo `subject` apontava para a linha-título; `null` = Assunto sem artigo. */
  articleId: z.string().min(1).max(400).nullable(),
  convertedAt: z.string().min(1),
  actorId: z.string().regex(UUID),
}).strict();
export type SubjectConversion = z.infer<typeof SubjectConversionSchema>;

type Semantic = Record<string, unknown> | null | undefined;

/** O bloco gravado em K; malformado ou ausente = `null` (nunca derruba a leitura). */
export function readSubjectConversion(semantic: Semantic): SubjectConversion | null {
  const value = semantic?.[SUBJECT_CONVERSION_KEY];
  if (value === null || value === undefined) return null;
  const parsed = SubjectConversionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function sameSubjectConversion(left: SubjectConversion | null, right: SubjectConversion | null): boolean {
  if (!left || !right) return !left && !right;
  return left.fromKeywordId === right.fromKeywordId && left.fromPhrase === right.fromPhrase && left.articleId === right.articleId;
}

type ConversionHistoryEntry = { previous: SubjectConversion | null; next: SubjectConversion | null; actorId: string; changedAt: string };

/**
 * Grava (ou retira, com `null`) o bloco de conversão em K. O mesmo bloco (mesma
 * T, mesmo título, mesmo artigo) = `changed: false` — repetir não regrava. O
 * ator é `auth.users.id`; a IA nunca converte sozinha.
 */
export function setSubjectConversion(
  semantic: Semantic,
  input: { conversion: Omit<SubjectConversion, "actorId" | "convertedAt"> | null; actorId: string; changedAt: string },
): { ok: true; semantic: Record<string, unknown>; changed: boolean } | { ok: false; semantic: Record<string, unknown>; changed: false; reason: string } {
  const current = { ...(semantic || {}) };
  if (!isKeywordSubjectActorId(input.actorId)) return { ok: false, semantic: current, changed: false, reason: "Converter o Assunto exige o usuário autenticado (auth.users.id)." };
  const previous = readSubjectConversion(current);
  let next: SubjectConversion | null = null;
  if (input.conversion) {
    const parsed = SubjectConversionSchema.safeParse({ ...input.conversion, convertedAt: input.changedAt, actorId: input.actorId.trim() });
    if (!parsed.success) return { ok: false, semantic: current, changed: false, reason: `A conversão não fecha o contrato: ${parsed.error.issues[0]?.message || "campo inválido"}.` };
    next = parsed.data;
  }
  if (sameSubjectConversion(previous, next)) return { ok: true, semantic: current, changed: false };
  const history = Array.isArray(current[SUBJECT_CONVERSION_HISTORY_KEY]) ? [...(current[SUBJECT_CONVERSION_HISTORY_KEY] as ConversionHistoryEntry[])] : [];
  history.push({ previous, next, actorId: input.actorId.trim(), changedAt: input.changedAt });
  return { ok: true, changed: true, semantic: { ...current, [SUBJECT_CONVERSION_KEY]: next, [SUBJECT_CONVERSION_HISTORY_KEY]: history } };
}

/**
 * O Assunto do formato anterior que pode ser convertido: declarado, SEM título
 * cadastrado (`entry`) e SEM plano. (Assunto anterior com plano — principal em
 * outra linha — fica para depois: a SDD restringe esta fase ao caso sem plano.)
 */
export function isConvertibleLegacySubject(semantic: Semantic): boolean {
  const subject = resolveKeywordSubject(semantic);
  return subject.declared && !subject.entry && !subject.plan;
}

/** Uma linha qualquer da marca, como os leitores a têm. */
export type ConversionIndexRow = { id: string; keyword?: string | null; semantic: Semantic };

export type ConvertedTitle = { keywordId: string; keyword: string | null; articleId: string | null };

/**
 * O ÍNDICE T → K da marca: a linha-título está convertida quando uma keyword
 * VIVA carrega o Assunto (declarado, com `entry`) e o bloco aponta para ela.
 * K que perdeu o Assunto (desfeito) não converte nada: T volta a ser Assunto.
 */
export function convertedTitleIndex(rows: readonly ConversionIndexRow[]): Map<string, ConvertedTitle> {
  const index = new Map<string, ConvertedTitle>();
  for (const row of rows) {
    const conversion = readSubjectConversion(row.semantic);
    if (!conversion || conversion.fromKeywordId === row.id) continue;
    const subject = resolveKeywordSubject(row.semantic);
    if (!subject.declared || !subject.entry) continue;
    if (!index.has(conversion.fromKeywordId)) index.set(conversion.fromKeywordId, { keywordId: String(row.id), keyword: typeof row.keyword === "string" ? row.keyword : null, articleId: conversion.articleId });
  }
  return index;
}

/** "Linha-título convertida → <keyword>". */
export function convertedTitleLabel(target: Pick<ConvertedTitle, "keyword">): string {
  return target.keyword ? `${CONVERTED_TITLE_LABEL} → ${target.keyword}` : CONVERTED_TITLE_LABEL;
}
