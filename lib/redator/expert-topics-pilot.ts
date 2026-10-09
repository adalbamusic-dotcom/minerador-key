/**
 * ===== 2026-10-09 · AS PAUTAS DO ESPECIALISTA PELO PROCESSO DO PILOTO =====
 *
 * Regra do dono (2026-10-09): o processo do piloto substitui o antigo em toda
 * operação. A preparação de pautas do especialista
 * (`app/api/editorial/radar-topics`) mandava à IA a pesquisa crua — com a
 * pergunta de newsletter, a do inglês, o título de post e a da outra profissão
 * que o CSV já tirava — e não sabia do artigo-modelo. Agora:
 *
 *   - a pesquisa do contexto (necessidades da SERP, lacunas abertas, perguntas
 *     conhecidas) passa pela MESMA régua de ruído do CSV (`research-noise.ts`),
 *     com o núcleo do artigo (principal, keywords, Assunto, tópicos
 *     obrigatórios) e o público;
 *   - com o artigo-modelo concluído do MESMO ArticleDNA, as linhas do pedido
 *     dizem as seções dele e as afirmações que a trava do CSV marca (a planta as
 *     liga a fonte e o pacote não as sustenta): é para elas que a pauta pede a
 *     fonte ou a experiência do especialista. Sem planta concluída (as pautas
 *     costumam vir antes dela), nenhuma linha a mais.
 *
 * Puro: sem banco, sem rede, sem IA.
 */

import { radarReaderQuestionIsNoise } from "../radar/research-noise.ts";
import { writerBlueprintClaimLock, writerBlueprintWithCurrentNames, writerBlueprintSourcesOf } from "./writer-blueprint-for-writing.ts";
import type { RadarArticleBlueprintAi } from "../radar/article-blueprint.ts";

type ContextoDasPautas = {
  articleDna: { principal: string; audience: string; requiredTopics: string[]; knownQuestions: string[]; subject?: { phrase: string } | undefined };
  keywordDnas: ReadonlyArray<{ keyword: string | null }>;
  serpNeeds: string[];
  openGaps: string[];
  knownQuestions: string[];
};

/** A régua de ruído do CSV na pesquisa do contexto das pautas; o resto do contexto volta como veio. */
export function expertTopicsContextWithoutNoise<T extends ContextoDasPautas>(contexto: T): { context: T; removed: number } {
  const ruido = {
    core: [contexto.articleDna.principal, ...contexto.keywordDnas.map(item => item.keyword), contexto.articleDna.subject?.phrase, ...contexto.articleDna.requiredTopics],
    topics: contexto.articleDna.requiredTopics,
    audience: contexto.articleDna.audience,
  };
  let removed = 0;
  const limpar = (itens: string[]) => {
    const ficam = itens.filter(item => !radarReaderQuestionIsNoise(item, ruido));
    removed += itens.length - ficam.length;
    return ficam;
  };
  const context = {
    ...contexto,
    articleDna: { ...contexto.articleDna, knownQuestions: limpar(contexto.articleDna.knownQuestions) },
    serpNeeds: limpar(contexto.serpNeeds),
    openGaps: limpar(contexto.openGaps),
    knownQuestions: limpar(contexto.knownQuestions),
  };
  return { context: removed ? context : contexto, removed };
}

const registro = (valor: unknown): Record<string, unknown> | null => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null);
const texto = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");

/**
 * As linhas do pedido com o artigo-modelo concluído: as seções (na ordem) e as
 * afirmações que só entram com fonte. A planta passa pela leitura do CSV e pela
 * trava dele (as afirmações da planta sem fonte do pacote dela).
 */
export function expertTopicsBlueprintLines(input: { version: number | null; blueprint: unknown; sources: unknown; principal: string }): string[] {
  const lida = registro(writerBlueprintWithCurrentNames(input.blueprint, { principal: input.principal }, { sources: input.sources }));
  const secoes = (Array.isArray(lida?.sections) ? lida!.sections : []).map(registro).filter((item): item is Record<string, unknown> => Boolean(item && texto(item.h2)));
  if (!lida || !secoes.length) return [];
  const fontes = writerBlueprintSourcesOf(input.sources) ?? [];
  const { pendentes } = writerBlueprintClaimLock({
    planta: { blueprint: lida as unknown as RadarArticleBlueprintAi, sources: fontes },
    principal: input.principal,
  });
  const semFonte = [...new Set(pendentes.filter(item => !item.fonte).map(item => item.texto))].slice(0, 8);
  return [
    `O artigo-modelo da SERP concluído deste artigo (v${input.version ?? "?"}) é a referência dele. Seções, na ordem: ${secoes.map((secao, indice) => `${indice + 1}. ${texto(secao.h2).slice(0, 160)}`).join("; ")}.`,
    "As pautas servem às seções do artigo-modelo: não proponha pauta para assunto que ele não cobre.",
    ...(semFonte.length
      ? [`Afirmações do artigo-modelo que só entram com fonte (o pacote não as sustenta): ${semFonte.map(item => `"${item.slice(0, 200)}"`).join("; ")}. Inclua pautas que tragam a fonte, o dado ou a experiência do especialista que as sustente ou delimite; essas pautas usam origin SERP ou ArticleDNA, need cita a afirmação e reference aponta um rótulo da proveniência recebida.`]
      : []),
  ];
}
