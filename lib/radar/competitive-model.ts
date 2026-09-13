/**
 * O MODELO COMPETITIVO OBSERVADO — o molde que a amostra revela.
 *
 * O lote anterior entregou números soltos: "H2 mediana 3, faixa 0–24". Com um
 * outlier de 15.944 palavras dentro da faixa, isso não é um molde: é ruído com
 * aparência de dado. O que faltava não era mais métrica — era transformar
 * métrica em leitura.
 *
 * Três coisas que este módulo faz e o benchmark cru não fazia:
 *
 *   1. SEPARA O OUTLIER. A faixa central passa a descrever o que a maioria faz,
 *      e o outlier continua visível, nomeado, com a página responsável.
 *   2. RASTREIA. Cada medida carrega as páginas que a sustentam, com o valor de
 *      cada uma. "De onde veio isso?" tem resposta na própria estrutura.
 *   3. ORGANIZA. Padrão de abertura, ordem temática dos H2, cobertura, lacunas
 *      e oportunidades — o formato que o Planejador consegue ler.
 *
 * A FRONTEIRA continua onde estava. Tudo sai como observação da amostra:
 * "aparece como H2 em 4/5", "faixa central 1.200–2.400". Nunca "nosso artigo
 * terá 7 H2". Quem decide é o ContentPlan, e ele é do Planejador.
 *
 * Domínio puro: sem fetch, sem storage, sem IA.
 */

import { classifyRadarExtractionFormat, isComparableRadarExtraction } from "./analysis-insights.ts";
import { z } from "zod";

import type { RadarExtractionPage } from "./analysis-contracts.ts";
import { classifyRadarTopics, radarTopicsOfClass, type RadarClassifiedTopic, type RadarTopicContext } from "./topic-classification.ts";
import {
  buildRadarSemanticConceptModel, radarConceptsOfClass, RadarSemanticConceptModelSchema,
  type RadarPageProvenance, type RadarSemanticConceptModel, type RadarSemanticEnricher,
} from "./semantic-concept-model.ts";

/* ---------------------------- medida rastreável --------------------------- */

export type RadarModelSource = { pageId: string; url: string; title: string; value: number };

export type RadarModelMeasure = {
  key: string;
  label: string;
  /** `single_page`: amostra de um. Não existe faixa de mercado aqui. */
  kind: "absent" | "single_page" | "distribution";
  observed: number | null;
  median: number | null;
  /** A faixa DEPOIS de separar outliers — o que a maioria faz. */
  centralRange: [number, number] | null;
  /** A faixa crua, preservada para quem quiser o dado inteiro. */
  fullRange: [number, number] | null;
  outliers: RadarModelSource[];
  sources: RadarModelSource[];
  sampleSize: number;
};

const mediana = (valores: number[]) => {
  const ordenado = [...valores].sort((left, right) => left - right);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 ? ordenado[meio] : Number(((ordenado[meio - 1] + ordenado[meio]) / 2).toFixed(2));
};

/**
 * Outlier por distância da mediana.
 *
 * Regra explicável de propósito: acima de 3× ou abaixo de 1/3 da mediana, com
 * pelo menos três páginas. Um artigo de 15.944 palavras numa amostra cuja
 * mediana é 1.056 não descreve o que os concorrentes fazem — descreve outra
 * coisa que apareceu na mesma busca.
 */
const OUTLIER_FACTOR = 3;

function measure(key: string, label: string, pages: RadarExtractionPage[], value: (page: RadarExtractionPage) => number): RadarModelMeasure {
  const sources: RadarModelSource[] = pages.map(page => ({ pageId: page.id, url: page.url, title: page.title || page.url, value: value(page) }));
  if (!sources.length) return { key, label, kind: "absent", observed: null, median: null, centralRange: null, fullRange: null, outliers: [], sources: [], sampleSize: 0 };
  if (sources.length === 1) return { key, label, kind: "single_page", observed: sources[0].value, median: null, centralRange: null, fullRange: null, outliers: [], sources, sampleSize: 1 };

  const valores = sources.map(item => item.value);
  const centro = mediana(valores);
  const outliers = sources.length >= 3 && centro > 0
    ? sources.filter(item => item.value > centro * OUTLIER_FACTOR || item.value < centro / OUTLIER_FACTOR)
    : [];
  const centrais = sources.filter(item => !outliers.includes(item));
  const faixa = (lista: RadarModelSource[]): [number, number] | null =>
    lista.length ? [Math.min(...lista.map(item => item.value)), Math.max(...lista.map(item => item.value))] : null;

  return {
    key, label, kind: "distribution", observed: null,
    median: centrais.length ? mediana(centrais.map(item => item.value)) : centro,
    centralRange: faixa(centrais),
    fullRange: faixa(sources),
    outliers, sources, sampleSize: sources.length,
  };
}

/* ------------------------------- presença -------------------------------- */

export type RadarModelPresence = { key: string; label: string; present: number; sampleSize: number; sources: RadarModelSource[] };

function presence(key: string, label: string, pages: RadarExtractionPage[], predicate: (page: RadarExtractionPage) => boolean): RadarModelPresence {
  const atendem = pages.filter(predicate);
  return {
    key, label, present: atendem.length, sampleSize: pages.length,
    sources: atendem.map(page => ({ pageId: page.id, url: page.url, title: page.title || page.url, value: 1 })),
  };
}

/* ------------------------------- o modelo -------------------------------- */

export type RadarTopicPattern = {
  topic: string;
  pages: number;
  sampleSize: number;
  asH2: number;
  asH3: number;
  /** 0 = começo do documento, 1 = fim. Diz se o tópico costuma vir cedo. */
  averagePosition: number;
  occurrences: Array<{ pageId: string; url: string; title: string; level: 2 | 3 }>;
};

export type RadarCompetitiveModel = {
  identity: { query: string | null; observedIntent: string | null; dominantFormat: string | null };
  sample: {
    analyzed: number;
    comparable: number;
    excluded: Array<{ url: string; title: string; format: string; reason: string }>;
  };
  structure: RadarModelMeasure[];
  opening: { measures: RadarModelMeasure[]; patterns: RadarModelPresence[] };
  organization: RadarTopicPattern[];
  closing: { measures: RadarModelMeasure[]; patterns: RadarModelPresence[] };
  semantics: { recurringTopics: RadarTopicPattern[]; recurringTerms: Array<{ term: string; pages: number; sampleSize: number }>; emphasizedTerms: Array<{ term: string; pages: number; sampleSize: number }> };
  formatting: RadarModelPresence[];
  keyword: { keyword: string | null; placements: RadarModelPresence[]; occurrences: RadarModelMeasure } | null;
  links: RadarModelMeasure[];
  /** Cada tópico observado com uma classe e o motivo dela. */
  classifiedTopics: RadarClassifiedTopic[];
  /**
   * A LEITURA POR CONCEITO — a camada que o Planejador deve preferir.
   *
   * `organization`, `semantics.recurringTopics` e `classifiedTopics` continuam
   * aqui de propósito: são a evidência crua por heading literal e servem para
   * conferir de onde o conceito veio. Mas quem responde "o mercado cobre este
   * assunto?" é esta camada, porque quatro formulações do mesmo assunto ali
   * em cima parecem quatro assuntos.
   *
   * `null` apenas em relatório gravado antes deste corte.
   */
  semantic: RadarSemanticConceptModel | null;
  gaps: Array<{ kind: "coverage" | "structural" | "semantic"; description: string; evidence: string }>;
  /** Derivadas da amostra e rotuladas como tal. Nunca requisito. */
  opportunities: Array<{ kind: "DERIVED_OPPORTUNITY"; description: string; evidence: string }>;
  limitations: string[];
};

const normalizar = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

function topicPatterns(pages: RadarExtractionPage[]): RadarTopicPattern[] {
  const mapa = new Map<string, RadarTopicPattern & { positions: number[] }>();
  for (const page of pages) {
    const total = page.headingOutline.length || 1;
    page.headingOutline.forEach((heading, index) => {
      if (heading.level === 1) return;
      const chave = normalizar(heading.text);
      if (!chave) return;
      const atual = mapa.get(chave) || { topic: heading.text, pages: 0, sampleSize: pages.length, asH2: 0, asH3: 0, averagePosition: 0, occurrences: [], positions: [] };
      if (!atual.occurrences.some(item => item.pageId === page.id)) atual.pages += 1;
      if (heading.level === 2) atual.asH2 += 1; else atual.asH3 += 1;
      atual.positions.push(index / total);
      atual.occurrences.push({ pageId: page.id, url: page.url, title: page.title || page.url, level: heading.level as 2 | 3 });
      mapa.set(chave, atual);
    });
  }
  return [...mapa.values()]
    .map(item => ({ ...item, sampleSize: pages.length, averagePosition: Number((item.positions.reduce((total, value) => total + value, 0) / item.positions.length).toFixed(2)) }))
    .map(({ positions: _positions, ...item }) => item)
    .sort((left, right) => right.pages - left.pages || left.averagePosition - right.averagePosition);
}

function contarPorPagina<T>(pages: RadarExtractionPage[], extrair: (page: RadarExtractionPage) => T[]) {
  const mapa = new Map<string, Set<string>>();
  for (const page of pages) {
    for (const item of new Set(extrair(page).map(value => normalizar(String(value))))) {
      if (!item) continue;
      mapa.set(item, (mapa.get(item) || new Set()).add(page.id));
    }
  }
  return [...mapa.entries()]
    .map(([term, paginas]) => ({ term, pages: paginas.size, sampleSize: pages.length }))
    .sort((left, right) => right.pages - left.pages)
    .slice(0, 30);
}

export function buildRadarCompetitiveModel(input: {
  pages: readonly RadarExtractionPage[];
  query?: string | null;
  observedIntent?: string | null;
  /** A principal do ArticleDNA, quando hidratada. Sustenta a leitura de lacuna. */
  principal?: string | null;
  /** Tópicos, cobertura e perguntas declarados pelo Arquiteto, quando existem. */
  editorialTopics?: readonly string[];
  /** Os textos das keywords da composição — a largura do assunto do artigo. */
  keywordTexts?: readonly string[];
  /** As entidades centrais declaradas pelo KeywordDNA, quando hidratadas. */
  centralEntities?: readonly string[];
  /** De onde cada página veio: consulta, papel da keyword, canônica ou auxiliar. */
  provenance?: readonly RadarPageProvenance[];
  /** Enriquecimento semântico opcional. Ausente = leitura determinística. */
  enricher?: RadarSemanticEnricher | null;
}): RadarCompetitiveModel {
  const todas = [...input.pages];
  const comparaveis = todas.filter(isComparableRadarExtraction);
  const limitations: string[] = [];

  if (!todas.length) limitations.push("Nenhuma página foi analisada nesta amostra.");
  if (todas.length && !comparaveis.length) limitations.push("Nenhuma página comparável: o modelo estrutural não pôde ser montado.");
  if (comparaveis.length === 1) limitations.push("Apenas uma página comparável: os valores são observação individual, não faixa de mercado.");
  if (comparaveis.length === 2) limitations.push("Duas páginas comparáveis: a faixa existe, mas outliers não são separáveis com segurança.");
  if (comparaveis.some(page => !page.headingOutline.length)) limitations.push("Alguma página comparável não expôs hierarquia de headings; o padrão de organização é parcial.");
  if (comparaveis.some(page => page.paragraphCount === 0)) limitations.push("Alguma página comparável não expôs parágrafos identificáveis; abertura e fechamento ficam parciais.");

  const comKeyword = comparaveis.filter(page => page.keywordPlacement);
  if (comparaveis.length && !comKeyword.length) {
    limitations.push("As páginas desta amostra foram extraídas sem a principal informada; a presença por localização só aparece após reanalisar as referências.");
  }

  const comAbertura = comparaveis.filter(page => page.introWordCount > 0);
  const comFechamento = comparaveis.filter(page => page.hasClosing);

  const structure = [
    measure("words", "Palavras", comparaveis, page => page.wordCount),
    measure("h2", "H2", comparaveis, page => page.h2.length),
    measure("h3", "H3", comparaveis, page => page.h3.length),
    measure("paragraphs", "Parágrafos", comparaveis, page => page.paragraphCount),
    measure("images", "Imagens", comparaveis, page => page.imageCount),
    measure("emphasis", "Trechos em destaque", comparaveis, page => page.boldCount),
  ];

  const organization = topicPatterns(comparaveis).filter(item => item.pages > 1).slice(0, 20);

  /* ----------------------------- lacunas ---------------------------------- */

  /*
   * "Apareceu uma vez" deixou de ser lacuna por aritmética.
   *
   * A tela chegou a recomendar "cobrir Buscar produtos com profundidade":
   * bloco de vitrine promovido a estratégia editorial. Agora cada tópico
   * recebe uma classe, e só COMPETITIVE_GAP — relevante à consulta, à
   * principal ou ao contexto editorial — chega às lacunas.
   */
  const contextoDosTopicos: RadarTopicContext = {
    query: input.query, observedIntent: input.observedIntent,
    principal: input.principal, editorialTopics: input.editorialTopics,
  };
  const classifiedTopics = classifyRadarTopics(topicPatterns(comparaveis), contextoDosTopicos);

  /*
   * A CAMADA CONCEITUAL, ANTES DA LEITURA DE LACUNA.
   *
   * A ordem é a que importa: observações → normalização → conceito →
   * recorrência POR CONCEITO → só então lacuna. Invertida, "Como identificar
   * pele oleosa", "Características da pele oleosa" e "Sinais de pele oleosa"
   * saíam como três lacunas independentes de um assunto que a amostra inteira
   * cobre.
   */
  const semantic = buildRadarSemanticConceptModel({
    pages: comparaveis,
    centralEntities: input.centralEntities,
    keywordTexts: [input.principal, input.query, ...(input.keywordTexts || [])].filter((value): value is string => Boolean(value)),
    editorialTopics: input.editorialTopics,
    provenance: input.provenance,
    enricher: input.enricher,
  });

  const gaps: RadarCompetitiveModel["gaps"] = [];
  if (comparaveis.length >= 3) {
    if (semantic.concepts.length) {
      for (const item of radarConceptsOfClass(semantic, "COMPETITIVE_GAP").slice(0, 6)) {
        gaps.push({ kind: "semantic", description: `"${item.canonicalLabel}" — ${item.classificationReason}`, evidence: item.sourceUrls[0] || "" });
      }
    } else {
      /* Sem heading aproveitável não há conceito; a leitura crua é o que resta. */
      for (const item of radarTopicsOfClass(classifiedTopics, "COMPETITIVE_GAP").slice(0, 6)) {
        gaps.push({ kind: "semantic", description: `"${item.topic}" — ${item.reason}`, evidence: item.occurrences[0]?.url || "" });
      }
    }
  }
  const semTabela = comparaveis.filter(page => page.tableCount === 0).length;
  if (comparaveis.length >= 3 && semTabela === comparaveis.length) {
    gaps.push({ kind: "structural", description: "Nenhuma página comparável usa tabela para organizar comparação.", evidence: `${comparaveis.length} páginas comparáveis` });
  }
  const semFechamento = comparaveis.length - comFechamento.length;
  if (comparaveis.length >= 3 && semFechamento >= Math.ceil(comparaveis.length / 2)) {
    gaps.push({ kind: "structural", description: `${semFechamento} de ${comparaveis.length} páginas comparáveis não apresentam fechamento editorial identificável.`, evidence: "abertura/fechamento observados na extração" });
  }

  /* -------------------------- oportunidades ------------------------------- */

  const opportunities: RadarCompetitiveModel["opportunities"] = gaps.slice(0, 6).map(gap => ({
    kind: "DERIVED_OPPORTUNITY" as const,
    description: gap.kind === "semantic"
      ? `Aprofundar ${gap.description.replace(/ — .*/, "")} pode diferenciar a página.`
      : `A amostra deixa espaço estrutural: ${gap.description}`,
    evidence: gap.evidence,
  }));

  return {
    identity: {
      query: input.query?.trim() || null,
      observedIntent: input.observedIntent?.trim() || null,
      dominantFormat: comparaveis.length
        ? [...comparaveis.reduce((mapa, page) => mapa.set(classifyRadarExtractionFormat(page), (mapa.get(classifyRadarExtractionFormat(page)) || 0) + 1), new Map<string, number>()).entries()]
          .sort((left, right) => right[1] - left[1])[0][0]
        : null,
    },
    sample: {
      analyzed: todas.length,
      comparable: comparaveis.length,
      excluded: todas.filter(page => !isComparableRadarExtraction(page)).map(page => ({
        url: page.url, title: page.title || page.url, format: classifyRadarExtractionFormat(page),
        reason: ["blocked", "timeout", "invalid_html", "unsupported", "failed"].includes(page.status)
          ? "A extração não foi concluída para esta página."
          : "Formato não editorial: permanece como referência, fora das métricas estruturais.",
      })),
    },
    structure,
    opening: {
      measures: [measure("introWords", "Palavras na abertura", comAbertura, page => page.introWordCount)],
      patterns: [
        presence("introKeyword", "Abertura menciona a principal", comKeyword, page => Boolean(page.keywordPlacement?.intro)),
        presence("introShort", "Abertura direta (até 80 palavras)", comAbertura, page => page.introWordCount <= 80),
      ],
    },
    organization,
    closing: {
      measures: [measure("closingWords", "Palavras no fechamento", comFechamento, page => page.closingWordCount)],
      patterns: [
        presence("hasClosing", "Possui fechamento editorial", comparaveis, page => page.hasClosing),
        presence("closingCta", "Fechamento com chamada para ação observável", comFechamento, page => /\b(saiba mais|confira|conheça|agende|solicite|assine|compre|fale com|clique)\b/i.test(page.closingText)),
      ],
    },
    semantics: {
      recurringTopics: organization.filter(item => item.pages >= Math.max(2, Math.ceil(comparaveis.length / 2))).slice(0, 12),
      recurringTerms: contarPorPagina(comparaveis, page => page.recurringTerms.map(term => term.term)).filter(item => item.pages > 1),
      emphasizedTerms: contarPorPagina(comparaveis, page => page.emphasizedTerms).filter(item => item.pages > 1),
    },
    formatting: [
      presence("lists", "Usa listas", comparaveis, page => page.listCount > 0),
      presence("tables", "Usa tabelas", comparaveis, page => page.tableCount > 0),
      presence("images", "Usa imagens", comparaveis, page => page.imageCount > 0),
      presence("bold", "Usa destaques em negrito", comparaveis, page => page.boldCount > 0),
      presence("quotes", "Usa citações destacadas", comparaveis, page => page.blockquoteCount > 0),
    ],
    keyword: comKeyword.length
      ? {
        keyword: comKeyword[0].keywordPlacement!.keyword,
        placements: [
          presence("kwTitle", "Title", comKeyword, page => Boolean(page.keywordPlacement?.title)),
          presence("kwH1", "H1", comKeyword, page => Boolean(page.keywordPlacement?.h1)),
          presence("kwH2", "H2", comKeyword, page => Boolean(page.keywordPlacement?.h2)),
          presence("kwH3", "H3", comKeyword, page => Boolean(page.keywordPlacement?.h3)),
          presence("kwIntro", "Abertura", comKeyword, page => Boolean(page.keywordPlacement?.intro)),
          presence("kwBody", "Corpo", comKeyword, page => Boolean(page.keywordPlacement?.body)),
        ],
        // Frequência OBSERVADA. Quantas vezes usar é decisão do Planejador.
        occurrences: measure("kwOccurrences", "Ocorrências observadas no corpo", comKeyword, page => page.keywordPlacement!.occurrences),
      }
      : null,
    links: [
      measure("internalLinks", "Links internos", comparaveis, page => page.internalLinkCount),
      measure("externalLinks", "Links externos", comparaveis, page => page.externalLinkCount),
    ],
    classifiedTopics,
    semantic,
    gaps,
    opportunities,
    limitations: [...limitations, ...semantic.limitations],
  };
}

/** Rótulo curto e honesto — nunca "média" com uma página, nunca faixa poluída. */
export function radarModelMeasureLabel(item: RadarModelMeasure): string {
  if (item.kind === "absent") return "Não observado";
  if (item.kind === "single_page") return `Valor observado: ${item.observed} (1 página)`;
  const faixa = item.centralRange ? `${item.centralRange[0]}–${item.centralRange[1]}` : "—";
  const cauda = item.outliers.length ? ` · ${item.outliers.length} outlier(s) fora da faixa` : "";
  return `Mediana ${item.median} · faixa central ${faixa} · ${item.sampleSize} páginas${cauda}`;
}

export function radarModelPresenceLabel(item: RadarModelPresence): string {
  return item.sampleSize ? `${item.present}/${item.sampleSize}` : "Não observado";
}

/* ----------------------- o modelo como dado persistido -------------------- */

/**
 * O MOLDE PRECISA SOBREVIVER AO RELOAD.
 *
 * Enquanto o modelo só existia como cálculo de render, o relatório aprovado
 * não continha nada do que a pessoa leu na tela: o Planejador recebia médias
 * soltas e a rastreabilidade por página morria no fechamento da aba. Aqui ele
 * vira dado — o mesmo formato que a UI mostra, aninhado no relatório.
 *
 * O schema é `.strict()` de propósito: um campo novo no modelo que não passar
 * por aqui falha na hora de gravar, e não silenciosamente na leitura.
 */
const ModelSourceSchema = z.object({ pageId: z.string(), url: z.string(), title: z.string(), value: z.number() }).strict();
const ModelMeasureSchema = z.object({
  key: z.string(), label: z.string(),
  kind: z.enum(["absent", "single_page", "distribution"]),
  observed: z.number().nullable(),
  median: z.number().nullable(),
  centralRange: z.tuple([z.number(), z.number()]).nullable(),
  fullRange: z.tuple([z.number(), z.number()]).nullable(),
  outliers: z.array(ModelSourceSchema),
  sources: z.array(ModelSourceSchema),
  sampleSize: z.number().int().nonnegative(),
}).strict();
const ModelPresenceSchema = z.object({ key: z.string(), label: z.string(), present: z.number().int().nonnegative(), sampleSize: z.number().int().nonnegative(), sources: z.array(ModelSourceSchema) }).strict();
const ModelTermSchema = z.object({ term: z.string(), pages: z.number().int().nonnegative(), sampleSize: z.number().int().nonnegative() }).strict();
const ModelTopicSchema = z.object({
  topic: z.string(),
  pages: z.number().int().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  asH2: z.number().int().nonnegative(),
  asH3: z.number().int().nonnegative(),
  averagePosition: z.number(),
  occurrences: z.array(z.object({ pageId: z.string(), url: z.string(), title: z.string(), level: z.union([z.literal(2), z.literal(3)]) }).strict()),
}).strict();

export const RadarCompetitiveModelSchema = z.object({
  identity: z.object({ query: z.string().nullable(), observedIntent: z.string().nullable(), dominantFormat: z.string().nullable() }).strict(),
  sample: z.object({
    analyzed: z.number().int().nonnegative(),
    comparable: z.number().int().nonnegative(),
    excluded: z.array(z.object({ url: z.string(), title: z.string(), format: z.string(), reason: z.string() }).strict()),
  }).strict(),
  structure: z.array(ModelMeasureSchema),
  opening: z.object({ measures: z.array(ModelMeasureSchema), patterns: z.array(ModelPresenceSchema) }).strict(),
  organization: z.array(ModelTopicSchema),
  closing: z.object({ measures: z.array(ModelMeasureSchema), patterns: z.array(ModelPresenceSchema) }).strict(),
  semantics: z.object({ recurringTopics: z.array(ModelTopicSchema), recurringTerms: z.array(ModelTermSchema), emphasizedTerms: z.array(ModelTermSchema) }).strict(),
  formatting: z.array(ModelPresenceSchema),
  keyword: z.object({ keyword: z.string().nullable(), placements: z.array(ModelPresenceSchema), occurrences: ModelMeasureSchema }).strict().nullable(),
  links: z.array(ModelMeasureSchema),
  /*
   * ADITIVO: `.default([])`.
   *
   * Este campo nasceu depois de relatórios já gravados. Sem o default, cada
   * `observedCompetitiveModel` anterior deixava de parsear e a versão inteira
   * da análise virava registro incompatível na recuperação — foi exatamente
   * o que aconteceu com as versões 8 e 9 do smoke.
   */
  classifiedTopics: z.array(z.object({
    topic: z.string(),
    classification: z.enum(["RECURRENT_TOPIC", "COMPETITIVE_GAP", "ISOLATED_TOPIC", "PAGE_SPECIFIC_NOISE"]),
    pages: z.number().int().nonnegative(),
    sampleSize: z.number().int().nonnegative(),
    reason: z.string(),
    relevance: z.object({ query: z.boolean(), principal: z.boolean(), editorial: z.boolean() }).strict(),
    occurrences: z.array(z.object({ pageId: z.string(), url: z.string(), title: z.string(), level: z.union([z.literal(2), z.literal(3)]) }).strict()),
  }).strict()).default([]),
  /*
   * ADITIVO: `.nullable().default(null)`.
   *
   * A camada conceitual nasceu no Gate 8. Todo relatório gravado antes disso
   * continua parseando com `null` — ausência declarada, nunca conceito
   * inventado para preencher o campo.
   */
  semantic: RadarSemanticConceptModelSchema.nullable().default(null),
  gaps: z.array(z.object({ kind: z.enum(["coverage", "structural", "semantic"]), description: z.string(), evidence: z.string() }).strict()),
  opportunities: z.array(z.object({ kind: z.literal("DERIVED_OPPORTUNITY"), description: z.string(), evidence: z.string() }).strict()),
  limitations: z.array(z.string()),
}).strict();

/*
 * O schema e o tipo descrevem a MESMA coisa — e o compilador confere.
 *
 * Sem esta asserção, acrescentar um campo ao modelo e esquecer o schema só
 * apareceria em produção, no momento de gravar o relatório.
 */
type ModeloPeloSchema = z.infer<typeof RadarCompetitiveModelSchema>;
const CONTRATO_DO_MODELO: [
  RadarCompetitiveModel extends ModeloPeloSchema ? true : never,
  ModeloPeloSchema extends RadarCompetitiveModel ? true : never,
] = [true, true];
void CONTRATO_DO_MODELO;
