import type { ArticleDNA, SiloPage } from "./contracts";
import { anchorCompareKey, anchorRepeatsTargetKeyword } from "./link-anchor-ai.ts";

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
 *
 * 2026-10-14 · F4 (SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md`
 * §6.4) · A PARTIDA DEIXA DE PÔR A PRINCIPAL DO DESTINO COMO PRIMEIRO CONCEITO.
 * Com a malha do Silo, o mesmo destino é citado por todos os irmãos: a
 * principal repetida como âncora em cada um é a "salada de keywords" que o dono
 * proibiu. A partida passa a ser a régua da âncora natural do Radar: recortes
 * das buscas do destino e o Assunto, nunca uma keyword do destino nem frase que
 * contenha uma inteira. Só quando nenhum recorte existe (rótulo de uma palavra,
 * sem Assunto) a partida volta ao rótulo, para o destino não sair do grafo — a
 * IA de âncoras e a régua do Radar tiram a keyword depois.
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

/* Palavras que não abrem nem fecham uma âncora natural. */
const LIGACAO = new Set(["de", "do", "da", "dos", "das", "para", "pra", "com", "em", "no", "na", "nos", "nas", "e", "o", "a", "os", "as", "um", "uma", "uns", "umas", "ao", "aos", "por", "pelo", "pela", "vs", "versus", "x", "como", "que"]);
const ligacao = (palavra: string) => LIGACAO.has(anchorCompareKey(palavra));
const aparar = (palavras: readonly string[]): string[] => {
  const saida = [...palavras];
  while (saida.length && ligacao(saida[0])) saida.shift();
  while (saida.length && ligacao(saida[saida.length - 1])) saida.pop();
  return saida;
};
const INTERROGATIVO = /^(?:como|o\s+que|oque|por\s*que|porque|qual|quais|quando|onde|quanto|quantos|quantas)\s+(?:(?:é|e|são|sao)\s+)?/i;
/* O trecho "para <público ou contexto>": até "sem", "vs", "versus", "x", "com" ou o fim. */
const PARA_O_PUBLICO = /\s+para\s+.+?(?=\s+(?:sem|vs\.?|versus|x|com)\s|$)/i;

/**
 * OS RECORTES DE UMA BUSCA, na ordem de preferência (a mesma ideia de
 * `radarAnchorCuts`): sem o interrogativo e sem o "para <público>"; "<algo> sem
 * <condição>" vira o algo e a condição; "<sujeito> não <predicado>" vira o
 * sujeito; o complemento depois da primeira preposição ("empresa de captação de
 * pacientes" → "captação de pacientes") e o núcleo antes dela. Nenhum é a busca
 * inteira. Puro.
 */
export function internalLinkAnchorCuts(busca: string): string[] {
  const base = compact(busca);
  const chaveDaBusca = anchorCompareKey(base);
  const saida: string[] = [];
  const adicionar = (valor: string | null | undefined) => {
    const limpo = compact(valor);
    const chave = anchorCompareKey(limpo);
    if (!chave || chave.length < 3 || chave === chaveDaBusca || saida.some(item => anchorCompareKey(item) === chave)) return;
    saida.push(limpo);
  };
  const semPergunta = base.replace(INTERROGATIVO, "").trim() || base;
  const aparado = semPergunta.replace(PARA_O_PUBLICO, "").trim() || semPergunta;
  const palavras = aparado.split(" ").filter(Boolean);
  const sem = aparado.match(/^(.+?)\s+(sem\s+.+)$/i);
  if (sem) {
    const antes = aparar(sem[1].split(" "));
    if (antes.length >= 2) adicionar(antes.join(" "));
    adicionar(sem[2]);
  }
  const nao = palavras.findIndex(palavra => anchorCompareKey(palavra) === "nao");
  if (!sem && nao > 0) {
    const sujeito = aparar(palavras.slice(0, nao));
    if (sujeito.join(" ").length >= 4) adicionar(sujeito.join(" "));
  }
  /* O complemento depois da primeira preposição (quando ele mesmo é uma locução, com preposição dentro) e o núcleo antes dela. */
  const ehPreposicao = (palavra: string) => /^(?:de|do|da|dos|das|para|com|em|no|na|nos|nas)$/.test(anchorCompareKey(palavra));
  const prep = palavras.findIndex((palavra, indice) => indice > 0 && ehPreposicao(palavra));
  if (!sem && prep > 0) {
    const depois = aparar(palavras.slice(prep + 1));
    if (depois.length >= 3 && depois.some(ehPreposicao)) adicionar(depois.join(" "));
    const nucleo = aparar(palavras.slice(0, prep));
    if (nucleo.length) adicionar(nucleo.join(" "));
  }
  /* Sem preposição, o nome composto sem o qualificador do fim ("tráfego orgânico como fazer" → "tráfego orgânico"). */
  if (!sem && prep < 0 && nao < 0 && palavras.length >= 3) adicionar(aparar(palavras.slice(0, 2)).join(" "));
  /* Duas palavras, sem preposição: a primeira, quando dá nome ao assunto ("leads qualificados" → "leads"). */
  if (!sem && palavras.length === 2 && !ligacao(palavras[0]) && palavras[0].length >= 4) adicionar(palavras[0]);
  /* A busca aparada, quando ela já não é a busca inteira. */
  adicionar(aparado);
  /* Multipalavra primeiro: a palavra solta é a última opção. */
  return [...saida.filter(item => item.includes(" ")), ...saida.filter(item => !item.includes(" "))];
}

/**
 * Os conceitos naturais de partida: os recortes das buscas do destino (a
 * principal primeiro), o Assunto e as entidades — só o que não é keyword do
 * destino nem a contém inteira. Vazio quando nada passa.
 */
export function naturalInternalLinkAnchorConcepts(input: {
  keywords: readonly (string | null | undefined)[];
  subject?: string | null;
  entities?: readonly (string | null | undefined)[] | null;
}): string[] {
  const keywords = input.keywords.map(compact).filter(Boolean);
  const candidatos = [
    compact(input.subject),
    ...keywords.flatMap(internalLinkAnchorCuts),
    ...(input.entities || []).map(compact),
  ].filter(item => item && item.split(" ").length <= 8 && !anchorRepeatsTargetKeyword(item, keywords));
  const saida: string[] = [];
  for (const item of candidatos) {
    if (!saida.some(atual => anchorCompareKey(atual) === anchorCompareKey(item))) saida.push(item);
  }
  return saida.slice(0, 5);
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
    /* 2026-10-14 · F4 · a ideia do destino primeiro; a principal não é mais o primeiro conceito. */
    const assunto = (article as { subject?: { phrase?: string | null } | null }).subject?.phrase ?? null;
    const naturais = naturalInternalLinkAnchorConcepts({
      keywords: [principal, ...apoio, input.fallbackLabel],
      subject: assunto,
      entities: Array.isArray(article.entities) ? article.entities : [],
    });
    if (naturais.length) return naturais;
    // Sem recorte possível: a busca principal e as de apoio, como antes (a IA e a régua do Radar tiram a keyword).
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
    /* 2026-10-14 · F4 · o nome do Silo é a keyword da SiloPage: os recortes dele vêm antes. */
    const naturais = naturalInternalLinkAnchorConcepts({ keywords: [siloPage.h1, input.fallbackLabel] });
    if (naturais.length) return naturais;
    return unique([siloPage.h1, input.fallbackLabel]).slice(0, 5);
  }

  return unique([input.fallbackLabel]);
}
