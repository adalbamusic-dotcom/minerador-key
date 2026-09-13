/**
 * A CONCLUSÃO PRIMEIRO — a matemática depois.
 *
 * A aba Análise abria com mediana, faixa central e outlier, e quem lia tinha
 * que descobrir sozinho o que a SERP ensinou sobre o artigo que compete ali.
 * Números não são leitura: são o material dela.
 *
 * Este módulo traduz o modelo observado em frases — o que a amostra é, o que os
 * concorrentes fazem em comum, que temas se repetem, o que ficou pouco coberto
 * e o que isso abre. Os mesmos dados, sem inventar nenhum: cada frase sai de um
 * campo do `RadarCompetitiveModel`.
 *
 * A fronteira continua: aqui se descreve a amostra. Quem decide a estrutura do
 * nosso artigo é o Planejador.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarModelMeasureLabel, type RadarCompetitiveModel, type RadarModelPresence } from "./competitive-model.ts";
import { radarTopicsOfClass } from "./topic-classification.ts";

export type RadarSerpSynthesis = {
  headline: string;
  sample: { analyzed: number; comparable: number };
  intent: string;
  dominantFormat: string;
  /** O que a maioria das páginas comparáveis faz. */
  commonPatterns: string[];
  structure: string[];
  recurringTopics: string[];
  /** Temas relacionados à consulta que a amostra cobre pouco. */
  underCovered: string[];
  opportunities: string[];
  /** Blocos de vitrine e navegação, nomeados como tal em vez de virarem pauta. */
  setAside: string[];
  limitations: string[];
};

/** A maioria simples da amostra comparável — o limiar de "em comum". */
const maioria = (sampleSize: number) => Math.max(2, Math.ceil(sampleSize / 2));

const frasePresenca = (item: RadarModelPresence) =>
  `${item.label}: ${item.present} de ${item.sampleSize} páginas.`;

export function buildRadarSerpSynthesis(model: RadarCompetitiveModel): RadarSerpSynthesis {
  const comparable = model.sample.comparable;
  const corte = maioria(comparable);

  const presencas = [...model.opening.patterns, ...model.closing.patterns, ...model.formatting];
  const commonPatterns = presencas
    .filter(item => item.sampleSize > 0 && item.present >= corte)
    .map(frasePresenca);

  const structure = model.structure
    .filter(item => item.kind !== "absent")
    .map(item => `${item.label} — ${radarModelMeasureLabel(item)}`);

  const recurringTopics = radarTopicsOfClass(model.classifiedTopics, "RECURRENT_TOPIC")
    .slice(0, 10)
    .map(item => `${item.topic} (${item.pages}/${item.sampleSize})`);

  const underCovered = radarTopicsOfClass(model.classifiedTopics, "COMPETITIVE_GAP")
    .slice(0, 8)
    .map(item => `${item.topic} — ${item.reason}`);

  const setAside = radarTopicsOfClass(model.classifiedTopics, "PAGE_SPECIFIC_NOISE")
    .slice(0, 8)
    .map(item => item.topic);

  /*
   * Sem página comparável não existe leitura, e dizer isso é mais honesto do
   * que devolver uma síntese vazia com cara de conclusão.
   */
  const limitations = [...model.limitations];
  if (comparable > 0 && !commonPatterns.length) {
    limitations.push("Nenhum padrão apareceu na maioria da amostra; as páginas comparáveis divergem entre si.");
  }
  if (comparable > 0 && !recurringTopics.length) {
    limitations.push("Nenhum tema se repetiu na amostra: não há assunto que os concorrentes tratem em comum.");
  }

  return {
    headline: comparable
      ? `${model.sample.analyzed} página(s) analisada(s) · ${comparable} comparável(is)`
      : `${model.sample.analyzed} página(s) analisada(s) · nenhuma comparável`,
    sample: { analyzed: model.sample.analyzed, comparable },
    intent: model.identity.observedIntent || "Não classificada",
    dominantFormat: model.identity.dominantFormat || "Não determinado",
    commonPatterns,
    structure,
    recurringTopics,
    underCovered,
    opportunities: model.opportunities.map(item => item.description),
    setAside,
    limitations,
  };
}
