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
 * Este detector é a portaria das entradas de keyword (colar e CSV) e o gatilho
 * do "colar em qualquer campo" do card: texto que o leitor de plano de sempre
 * (`parseDeclaredPlanText`, o único) entende como plano NÃO vai para a
 * Descoberta.
 *
 * 2026-10-16 · reconhece todos os formatos do leitor: rótulos ("Nome:",
 * "Slug:", "Objetivo:", "Palavra-chave:", "Keyword:", "Título:", "Descrição:"…),
 * planilha (TAB) e CSV com cabeçalho, tabela com "|", blocos com o papel na 1ª
 * linha ("Silo", "Pilar", "Suporte", sem rótulo nenhum) e artigos numerados
 * sem rótulo. Lista simples de keywords (uma por linha) nunca é plano.
 */

const MARCA_DE_PLANO = /^\s*(?:(?:nome|slug|objetivo)(?:\s+do\s+silo)?\s*[:：]|(?:.*?[•·|\-–—]\s*)?(?:palavra[\s-]?chave|keyword(?:\s+principal)?)\s*[:：]|(?:t[íi]tulo|assunto|descri[çc][ãa]o|detalhes|escopo|url|canonical|papel|trava)\s*[:：])/i;
/** O papel sozinho na linha: o começo de um bloco do plano. */
const ROTULO_DE_BLOCO = /^\s*(?:silo\s*\d{0,2}|(?:artigo\s+(?:de\s+)?)?(?:pilar|suporte))\s*[.:：]?\s*$/i;

export function looksLikeSiloPlanText(text: string | null | undefined): boolean {
  const valor = String(text || "");
  if (!valor.trim()) return false;
  const linhas = valor.split(/\r?\n/).filter(linha => linha.trim());
  // Uma linha "Palavra-chave: …" já é plano (keyword nunca vem com rótulo e dois-pontos).
  if (linhas.some(linha => /(?:palavra[\s-]?chave|keyword\s+principal)\s*[:：]/i.test(linha))) return true;
  const lido = parseDeclaredPlanText(valor);
  // Tabela, planilha (TAB) ou CSV com cabeçalho do plano, com artigo com título.
  if (lido.format === "planilha" || lido.format === "csv" || lido.format === "tabela") return lido.articles.some(article => Boolean(article.subject));
  // Rótulos ("Nome:", "Slug:", "Keyword:"…) contam quando o leitor os entende.
  if (linhas.some(linha => MARCA_DE_PLANO.test(linha))) return lido.articles.length > 0 || Boolean(lido.silo.name || lido.silo.slug || lido.silo.objective);
  // Blocos sem rótulo: pelo menos dois blocos com o papel na 1ª linha e um artigo com slug ou detalhes.
  if (lido.format === "blocos") {
    const rotulos = linhas.filter(linha => ROTULO_DE_BLOCO.test(linha)).length;
    return rotulos >= 2 && lido.articles.some(article => Boolean(article.rawSlug || article.scope));
  }
  // Numerado sem rótulo: um artigo com a keyword e os detalhes (lista numerada de keywords não tem os dois).
  return lido.articles.some(article => Boolean(article.subject && article.principal && article.scope));
}

export const SILO_PLAN_IN_KEYWORD_ENTRY_MESSAGE = "Isto é um plano de Silo (Nome, Slug, Objetivo, Palavra-chave, blocos Pilar/Suporte…), não uma lista de keywords. Nada foi adicionado à Descoberta. Plano entra por “Cadastrar Assuntos”: lá você escolhe a cor, o Silo e cada artigo com a sua keyword — o Assunto e os detalhes ficam dentro da keyword.";
