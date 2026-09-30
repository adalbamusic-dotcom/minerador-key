import { normalizeKeyword } from "../minerador/keyword-import-core.ts";

/**
 * Sementes curtas para o Google Ads.
 *
 * O Planejador de palavras-chave devolve só a própria frase quando recebe um
 * título longo ("checklist de plano de marketing para clínica de estética"
 * voltou com 1 candidata). Com os núcleos curtos do título ("plano de
 * marketing", "clínica de estética") ele devolve as buscas relacionadas.
 */
export const SEED_STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "em", "no", "na", "um", "uma", "como", "que", "por", "com", "qual"]);
const SPLITTERS = new Set(["para", "pra", "sem", "vs", "versus", "com"]);

const contentWords = (text: string) => normalizeKeyword(text).split(" ").filter(word => word.length > 2 && !SEED_STOPWORDS.has(word));

/** 2+ palavras de conteúdo em comum com o tema (1 quando o tema só tem uma). */
export function sharesTheme(theme: string, keyword: string): boolean {
  const own = new Set(contentWords(theme));
  const common = [...new Set(contentWords(keyword))].filter(word => own.has(word)).length;
  return own.size > 0 && common >= Math.min(2, own.size);
}

export function shortSeedsOf(theme: string): string[] {
  const tokens = theme.toLowerCase().replace(/[:?!.,;]/g, " ").split(/\s+/).filter(Boolean);
  while (tokens.length && ["como", "qual", "o", "que", "é", "e"].includes(tokens[0])) tokens.shift();
  const cut = tokens.findIndex(token => SPLITTERS.has(token));
  const left = cut >= 0 ? tokens.slice(0, cut) : tokens;
  const right = cut >= 0 ? tokens.slice(cut + 1) : [];
  // Os últimos `n` termos de conteúdo do lado esquerdo, com os conectivos entre eles.
  const tail = (words: string[], n: number) => {
    let count = 0, index = words.length;
    while (index > 0 && count < n) { index--; if (!SEED_STOPWORDS.has(words[index])) count++; }
    while (index < words.length && SEED_STOPWORDS.has(words[index])) index++;
    return words.slice(index).join(" ");
  };
  const lastContent = tail(left, 1);
  const rightText = right.join(" ");
  // Os primeiros `n` termos de conteúdo (o assunto costuma abrir o título).
  const head = (words: string[], n: number) => {
    let count = 0, index = 0;
    while (index < words.length && count < n) { if (!SEED_STOPWORDS.has(words[index])) count++; index++; }
    return words.slice(0, index).join(" ");
  };
  const seeds = [
    tail(left, 2),
    left.length > 4 ? head(left, 3) : "",
    left.length <= 4 ? left.join(" ") : "",
    rightText,
    rightText && lastContent ? `${lastContent} ${rightText}` : "",
    tail(left, 3),
  ];
  return [...new Set(seeds.map(seed => seed.trim()).filter(seed => contentWords(seed).length > 0))].slice(0, 5);
}
