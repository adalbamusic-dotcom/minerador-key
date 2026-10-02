/**
 * O CABEÇALHO DO CONCORRENTE, SEM A MOLDURA DE LISTICLE (SDD diretriz editorial, 2026-10-02).
 *
 * "2. Aproveite os recursos do Instagram" e "10 principais influencers de IA…"
 * entravam inteiros no modelo: a numeração virava seção ("O que considerar
 * sobre 2. Aproveite…"), H1 e pergunta de abertura. O número é a posição na
 * lista do concorrente, não o assunto. Aqui sai a moldura e fica o assunto.
 *
 * Só tira a moldura do começo (e uma data solta no fim); nunca reescreve o
 * miolo. Se sobrar quase nada, devolve o texto original.
 */

const ENUMERACAO = /^\s*(?:#\s*)?\d{1,3}\s*[.)ºª°:\-–—]\s*/u;
const ROTULO_NUMERADO = /^\s*(?:passo|dica|etapa|item|m[eé]todo|estrat[eé]gia|ideia|t[oó]pico|parte)\s+\d{1,3}\s*[.):\-–—]?\s*/iu;
const CONTAGEM_DE_LISTICLE = /^\s*\d{1,3}\s+(?:principais|melhores|maiores|dicas|ideias|estrat[eé]gias|formas|maneiras|passos|m[eé]todos|motivos|erros|truques|segredos|exemplos|ferramentas|tipos|raz[oõ]es|t[aá]ticas|a[cç][oõ]es|perguntas)\b\s*(?:(?:de|para|que|sobre|do|da|dos|das)\s+)?/iu;
const DATA_NO_FIM = /\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/u;

export function radarCleanCompetitorHeading(texto: string): string {
  const original = texto.trim();
  let limpo = original;
  for (let rodada = 0; rodada < 3; rodada += 1) {
    const antes = limpo;
    limpo = limpo.replace(ROTULO_NUMERADO, "").replace(ENUMERACAO, "").replace(CONTAGEM_DE_LISTICLE, "");
    if (limpo === antes) break;
  }
  limpo = limpo.replace(DATA_NO_FIM, "").trim();
  if (limpo.replace(/[^\p{L}]/gu, "").length < 3) return original;
  return limpo.charAt(0).toLocaleUpperCase("pt-BR") + limpo.slice(1);
}
