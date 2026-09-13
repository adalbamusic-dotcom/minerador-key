/**
 * A RADIOGRAFIA DA AMOSTRA — o que os concorrentes FAZEM, não o que devemos fazer.
 *
 * O Radar observa; o Planejador prescreve. Por isso tudo aqui sai como
 * "mediana observada 7 H2" e nunca como "nosso artigo terá 7 H2". A diferença
 * não é de redação: é de fronteira. Um número que sai daqui rotulado como
 * requisito vira decisão editorial tomada pela área errada.
 *
 * Duas regras que o formato carrega sozinho:
 *
 *   1. amostra de UMA página não vira média de mercado — vira valor observado;
 *   2. página não comparável continua VISÍVEL e fica fora de média, mediana,
 *      faixa e padrão estrutural.
 *
 * Domínio puro: sem fetch, sem storage, sem IA.
 */

import { classifyRadarExtractionFormat, isComparableRadarExtraction } from "./analysis-insights.ts";
import type { RadarExtractionPage } from "./analysis-contracts.ts";

/* ------------------------------ medidas ---------------------------------- */

export type RadarObservedMeasure = {
  label: string;
  /** `single_page` diz, no próprio dado, que não há faixa de mercado aqui. */
  kind: "single_page" | "distribution";
  observed: number | null;
  min: number | null;
  median: number | null;
  max: number | null;
  average: number | null;
  sampleSize: number;
};

function measure(label: string, values: number[]): RadarObservedMeasure {
  if (!values.length) return { label, kind: "distribution", observed: null, min: null, median: null, max: null, average: null, sampleSize: 0 };
  if (values.length === 1) return { label, kind: "single_page", observed: values[0], min: null, median: null, max: null, average: null, sampleSize: 1 };
  const ordenado = [...values].sort((left, right) => left - right);
  const meio = Math.floor(ordenado.length / 2);
  const mediana = ordenado.length % 2 ? ordenado[meio] : Number(((ordenado[meio - 1] + ordenado[meio]) / 2).toFixed(2));
  return {
    label, kind: "distribution", observed: null,
    min: ordenado[0], median: mediana, max: ordenado[ordenado.length - 1],
    average: Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2)),
    sampleSize: values.length,
  };
}

/* ------------------------------ presença --------------------------------- */

/** "4/5 começam respondendo" — proporção observada, sem virar obrigação. */
export type RadarObservedPresence = { label: string; present: number; sampleSize: number };

const presence = (label: string, pages: RadarExtractionPage[], predicate: (page: RadarExtractionPage) => boolean): RadarObservedPresence =>
  ({ label, present: pages.filter(predicate).length, sampleSize: pages.length });

/* ------------------------------ o consolidado ---------------------------- */

export type RadarCompetitiveBenchmark = {
  sample: {
    analyzed: number;
    comparable: number;
    /** Fora do benchmark, mas continuam listadas com a função observada. */
    nonComparable: Array<{ url: string; format: string; reason: string }>;
  };
  structure: Record<string, RadarObservedMeasure>;
  opening: { measures: Record<string, RadarObservedMeasure>; patterns: RadarObservedPresence[] };
  closing: { measures: Record<string, RadarObservedMeasure>; patterns: RadarObservedPresence[] };
  formatting: RadarObservedPresence[];
  keyword: { keyword: string | null; placements: RadarObservedPresence[]; occurrences: RadarObservedMeasure } | null;
  headingPatterns: Array<{ text: string; pages: number; sampleSize: number; asH2: number; asH3: number; averagePosition: number }>;
  emphasizedTerms: Array<{ term: string; pages: number; sampleSize: number }>;
  /** O que NÃO foi possível observar. Ausência declarada, nunca preenchida. */
  limitations: string[];
};

const naoComparavelMotivo = (page: RadarExtractionPage) =>
  ["blocked", "timeout", "invalid_html", "unsupported", "failed"].includes(page.status)
    ? "A extração não foi concluída para esta página."
    : "Formato não editorial: permanece como referência, fora das métricas estruturais.";

export function buildRadarCompetitiveBenchmark(pages: readonly RadarExtractionPage[]): RadarCompetitiveBenchmark {
  const todas = [...pages];
  const comparaveis = todas.filter(isComparableRadarExtraction);
  const limitations: string[] = [];

  if (!todas.length) limitations.push("Nenhuma página foi analisada nesta amostra.");
  if (todas.length && !comparaveis.length) limitations.push("Nenhuma página comparável: as métricas estruturais não podem ser calculadas.");
  if (comparaveis.length === 1) limitations.push("Apenas uma página comparável: os valores são observação individual, não faixa de mercado.");
  if (comparaveis.some(page => page.paragraphCount === 0)) limitations.push("Alguma página comparável não expôs parágrafos identificáveis; contagem de parágrafos e abertura ficam parciais.");
  if (comparaveis.some(page => !page.headingOutline.length)) limitations.push("Alguma página comparável não expôs hierarquia de headings extraível.");

  const comKeyword = comparaveis.filter(page => page.keywordPlacement);
  if (comparaveis.length && !comKeyword.length) limitations.push("A keyword principal não foi informada à extração: a presença por localização não pôde ser observada.");

  const structure = {
    words: measure("Palavras", comparaveis.map(page => page.wordCount)),
    h2: measure("H2", comparaveis.map(page => page.h2.length)),
    h3: measure("H3", comparaveis.map(page => page.h3.length)),
    paragraphs: measure("Parágrafos", comparaveis.map(page => page.paragraphCount)),
    images: measure("Imagens", comparaveis.map(page => page.imageCount)),
    internalLinks: measure("Links internos", comparaveis.map(page => page.internalLinkCount)),
    externalLinks: measure("Links externos", comparaveis.map(page => page.externalLinkCount)),
    emphasis: measure("Trechos em destaque", comparaveis.map(page => page.boldCount)),
  };

  /* ----- padrões de heading: um tópico, quantas páginas, em que nível ----- */
  const porTopico = new Map<string, { text: string; pages: Set<string>; asH2: number; asH3: number; positions: number[] }>();
  for (const page of comparaveis) {
    const total = page.headingOutline.length || 1;
    page.headingOutline.forEach((heading, index) => {
      if (heading.level === 1) return;
      const chave = heading.text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
      if (!chave) return;
      const atual = porTopico.get(chave) || { text: heading.text, pages: new Set<string>(), asH2: 0, asH3: 0, positions: [] };
      atual.pages.add(page.id);
      if (heading.level === 2) atual.asH2 += 1; else atual.asH3 += 1;
      atual.positions.push(index / total);
      porTopico.set(chave, atual);
    });
  }
  const headingPatterns = [...porTopico.values()]
    .filter(item => item.pages.size > 1)
    .map(item => ({
      text: item.text, pages: item.pages.size, sampleSize: comparaveis.length,
      asH2: item.asH2, asH3: item.asH3,
      averagePosition: Number((item.positions.reduce((total, value) => total + value, 0) / item.positions.length).toFixed(2)),
    }))
    .sort((left, right) => right.pages - left.pages || left.averagePosition - right.averagePosition)
    .slice(0, 25);

  /* ----------------------------- destaques -------------------------------- */
  const porTermo = new Map<string, Set<string>>();
  for (const page of comparaveis) {
    for (const termo of new Set(page.emphasizedTerms.map(value => value.toLowerCase().trim()))) {
      if (!termo) continue;
      porTermo.set(termo, (porTermo.get(termo) || new Set()).add(page.id));
    }
  }
  const emphasizedTerms = [...porTermo.entries()]
    .filter(([, paginas]) => paginas.size > 1)
    .map(([term, paginas]) => ({ term, pages: paginas.size, sampleSize: comparaveis.length }))
    .sort((left, right) => right.pages - left.pages)
    .slice(0, 25);

  return {
    sample: {
      analyzed: todas.length,
      comparable: comparaveis.length,
      nonComparable: todas.filter(page => !isComparableRadarExtraction(page)).map(page => ({
        url: page.url, format: classifyRadarExtractionFormat(page), reason: naoComparavelMotivo(page),
      })),
    },
    structure,
    opening: {
      measures: { words: measure("Palavras na abertura", comparaveis.filter(page => page.introWordCount > 0).map(page => page.introWordCount)) },
      patterns: [
        presence("Abertura menciona a principal", comKeyword, page => Boolean(page.keywordPlacement?.intro)),
        presence("Abertura com até 80 palavras", comparaveis.filter(page => page.introWordCount > 0), page => page.introWordCount <= 80),
      ],
    },
    closing: {
      measures: { words: measure("Palavras no fechamento", comparaveis.filter(page => page.closingWordCount > 0).map(page => page.closingWordCount)) },
      patterns: [
        presence("Possui fechamento editorial", comparaveis, page => page.hasClosing),
        // Sinal observável de CTA — nunca uma recomendação de usar CTA.
        presence("Fechamento com chamada para ação observável", comparaveis.filter(page => page.hasClosing), page => /\b(saiba mais|confira|conheça|agende|solicite|assine|compre|fale com|clique)\b/i.test(page.closingText)),
      ],
    },
    formatting: [
      presence("Usa listas", comparaveis, page => page.listCount > 0),
      presence("Usa tabelas", comparaveis, page => page.tableCount > 0),
      presence("Usa imagens", comparaveis, page => page.imageCount > 0),
      presence("Usa destaques em negrito", comparaveis, page => page.boldCount > 0),
      presence("Usa citações destacadas", comparaveis, page => page.blockquoteCount > 0),
    ],
    keyword: comKeyword.length
      ? {
        keyword: comKeyword[0].keywordPlacement!.keyword,
        placements: [
          presence("Title", comKeyword, page => Boolean(page.keywordPlacement?.title)),
          presence("H1", comKeyword, page => Boolean(page.keywordPlacement?.h1)),
          presence("H2", comKeyword, page => Boolean(page.keywordPlacement?.h2)),
          presence("H3", comKeyword, page => Boolean(page.keywordPlacement?.h3)),
          presence("Abertura", comKeyword, page => Boolean(page.keywordPlacement?.intro)),
          presence("Corpo", comKeyword, page => Boolean(page.keywordPlacement?.body)),
        ],
        // Frequência OBSERVADA. Quantas vezes usar é decisão do Planejador.
        occurrences: measure("Ocorrências observadas no corpo", comKeyword.map(page => page.keywordPlacement!.occurrences)),
      }
      : null,
    headingPatterns,
    emphasizedTerms,
    limitations,
  };
}

/** Rótulo curto e honesto para uma medida — evita "média" com uma página só. */
export function radarMeasureLabel(measure: RadarObservedMeasure): string {
  if (!measure.sampleSize) return "Não observado";
  if (measure.kind === "single_page") return `Valor observado: ${measure.observed} (1 página)`;
  return `Mediana ${measure.median} · faixa ${measure.min}–${measure.max} · ${measure.sampleSize} páginas`;
}

export function radarPresenceLabel(presence: RadarObservedPresence): string {
  return presence.sampleSize ? `${presence.present}/${presence.sampleSize}` : "Não observado";
}
