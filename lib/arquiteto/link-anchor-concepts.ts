import type { ArticleDNA, SiloPage } from "./contracts";

/**
 * PONTO DE PARTIDA DETERMINÍSTICO PARA ÂNCORAS.
 *
 * Este arquivo produzia rótulos tipados — "intenção: informacional",
 * "entidade: retinol", "categoria: /skin-care". Nenhum deles é âncora:
 * ninguém escreve isso no meio de uma frase, e o último usava o próprio
 * ENDEREÇO como texto de link, que é exatamente o que o contrato proíbe.
 *
 * Agora ele devolve formulações naturais derivadas dos fatos do destino, e
 * serve apenas como fallback: a proposta semântica de verdade vem da IA em
 * `link-anchor-ai.ts`, e passa pela mesma validação editorial.
 *
 * Continua valendo o princípio: conceito de âncora é um universo permitido
 * que o redator pode usar, nunca a string obrigatória de um `<a>`.
 */

function compact(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map(compact).filter(Boolean))];
}

function keywordForReference(article: ArticleDNA, keywordId: string) {
  const snapshot = article.keywordReferences.find(reference => reference.keywordId === keywordId)?.keywordDnaSnapshot;
  const value = snapshot?.sourceKeywordSnapshot.keyword;
  return typeof value === "string" ? compact(value) : "";
}

/** Pontos de partida semânticos editáveis, nunca a âncora final de um link. */
export function suggestInternalLinkAnchorConcepts(input: {
  article?: ArticleDNA | null;
  siloPage?: SiloPage | null;
  fallbackLabel?: string | null;
}) {
  const article = input.article || null;
  if (article) {
    const principal = keywordForReference(article, article.principalKeywordId);
    const apoio = unique([
      ...article.secondaryKeywordIds.map(keywordId => keywordForReference(article, keywordId)),
      ...article.narrativeReinforcementIds.map(keywordId => keywordForReference(article, keywordId)),
    ]);
    // A busca principal e as de apoio JÁ são formulações que uma pessoa
    // escreveria. O que elas não são é obrigação: a IA acrescenta variantes.
    return unique([principal, ...apoio.slice(0, 4), input.fallbackLabel]).slice(0, 5);
  }

  const siloPage = input.siloPage || null;
  if (siloPage) {
    // O H1 e os títulos de seção descrevem o universo em linguagem humana; o
    // slug fica de fora de propósito — endereço não é texto de âncora.
    /*
     * A âncora para a raiz descreve O UNIVERSO, não as seções de dentro.
     *
     * Os títulos de seção falam dos ARTIGOS que a página lista; usá-los como
     * âncora para a própria página aponta para o lugar errado. E eles são
     * derivados do papel de cada artigo, então um deles chegou a virar
     * "unidade editorial principal confirmada pelo humano" — uma frase de
     * sistema oferecida como texto de link.
     */
    return unique([siloPage.h1, input.fallbackLabel]).slice(0, 5);
  }

  return unique([input.fallbackLabel]);
}
