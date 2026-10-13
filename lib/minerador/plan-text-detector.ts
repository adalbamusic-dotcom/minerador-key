import { parseDeclaredPlanText } from "./declared-plan.ts";

/**
 * 2026-10-13 · PLANO DE SILO NÃO É LISTA DE KEYWORDS.
 *
 * O dono colou o plano do Silo 2 em "Colar keywords": o texto virou 36
 * "keywords" na Descoberta ("Nome: …", "Slug: …", títulos e descrições
 * soltos). Plano entra por UMA porta, "Cadastrar Assuntos" (SDD
 * 2026-10-13): cor, Silo e cada artigo com a sua keyword; o Assunto e os
 * detalhes ficam dentro da keyword.
 *
 * Este detector é a portaria das entradas de keyword (colar e CSV): texto
 * com marcas de plano ("Nome:", "Slug:", "Objetivo:", "Palavra-chave:") que
 * o leitor de plano de sempre entende NÃO vai para a Descoberta.
 */

const MARCA_DE_PLANO = /^\s*(?:(?:nome|slug|objetivo)(?:\s+do\s+silo)?\s*[:：]|(?:.*?[•·|\-–—]\s*)?(?:palavra[\s-]?chave|keyword\s+principal)\s*[:：])/i;

export function looksLikeSiloPlanText(text: string | null | undefined): boolean {
  const valor = String(text || "");
  if (!valor.trim()) return false;
  const linhas = valor.split(/\r?\n/).filter(linha => linha.trim());
  if (!linhas.some(linha => MARCA_DE_PLANO.test(linha))) return false;
  // Uma linha "Palavra-chave: …" já é plano (keyword nunca vem com rótulo e dois-pontos);
  // "Nome:"/"Slug:"/"Objetivo:" contam quando o leitor de plano de sempre os entende.
  if (linhas.some(linha => /(?:palavra[\s-]?chave|keyword\s+principal)\s*[:：]/i.test(linha))) return true;
  const lido = parseDeclaredPlanText(valor);
  return lido.articles.length > 0 || Boolean(lido.silo.name || lido.silo.slug || lido.silo.objective);
}

export const SILO_PLAN_IN_KEYWORD_ENTRY_MESSAGE = "Isto é um plano de Silo (Nome, Slug, Objetivo, Palavra-chave…), não uma lista de keywords. Nada foi adicionado à Descoberta. Plano entra por “Cadastrar Assuntos”: lá você escolhe a cor, o Silo e cada artigo com a sua keyword — o Assunto e os detalhes ficam dentro da keyword.";
