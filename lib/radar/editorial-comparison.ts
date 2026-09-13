/**
 * O QUE O ARTIGO DECLARA, O QUE A BUSCA MOSTRA, O QUE OS CONCORRENTES COBREM.
 *
 * O relatório antigo comparava a amostra com ela mesma: contava heading, media
 * palavra, listava tópico recorrente. Ninguém confrontava aquilo com o que o
 * ArticleDNA tinha declarado — e por isso "lacuna" saía do nada e "conflito"
 * não existia como conceito.
 *
 * Aqui cada linha é um confronto explícito das três leituras, com a mesma
 * gramática em todas:
 *
 *   ARTIGO DECLARA · SERP MOSTRA · CONCORRENTES COBREM · situação · evidência
 *
 * E as situações têm significados que não se confundem:
 *
 *   CONFIRMED       o artigo declara e o mercado cobre
 *   GAP             o mercado cobre e o artigo não declara
 *   DIFFERENTIATION o artigo declara e o mercado não cobre — é diferencial
 *                   observado, nunca "erro do artigo"
 *   CONFLICT        as leituras se contradizem (intenção, formato)
 *   NOT_OBSERVED    a amostra não permitiu observar
 *
 * O QUE ESTE MÓDULO NÃO FAZ: não escreve outline, não define H2 obrigatório,
 * não decide contagem de palavra, densidade ou âncora. Ele produz o FATO
 * comparado. A prescrição é do Planejador.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { radarConclusiveIntent, radarDeclaredArticleIntent, radarIntentConflict } from "./editorial-identity.ts";
import type { RadarCompetitiveModel } from "./competitive-model.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarClassifiedTopic } from "./topic-classification.ts";
import { radarTopicTokens } from "./topic-classification.ts";
import { radarSemanticType, type RadarSemanticConcept } from "./semantic-concept-model.ts";

export type RadarComparisonDimension = "topic" | "intent" | "format" | "entity";

export type RadarComparisonStatus =
  | "CONFIRMED"
  | "GAP"
  | "DIFFERENTIATION"
  | "CONFLICT"
  | "NOT_OBSERVED";

export type RadarComparisonRow = {
  dimension: RadarComparisonDimension;
  subject: string;
  /** ARTIGO DECLARA — do ArticleDNA e das keywords resolvidas. */
  articleDeclares: string | null;
  /** SERP MOSTRA — do diagnóstico da coleta corrente. */
  serpShows: string | null;
  /** CONCORRENTES COBREM — das páginas comparáveis extraídas. */
  competitorsCover: string | null;
  status: RadarComparisonStatus;
  /** EVIDÊNCIA — quantas páginas, quais, com que recorrência. */
  evidence: string;
  sources: Array<{ pageId: string; url: string; title: string }>;
};

export type RadarEditorialComparison = {
  rows: RadarComparisonRow[];
  confirmed: number;
  gaps: number;
  differentiation: number;
  conflicts: number;
  notObserved: number;
  limitations: string[];
};

const normalizar = (value: string | null | undefined) =>
  (value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Duas formulações do mesmo assunto? Interseção de tokens significativos. */
function mesmoAssunto(esquerda: string, direita: string): boolean {
  const daEsquerda = new Set(radarTopicTokens(esquerda));
  const daDireita = radarTopicTokens(direita);
  if (!daEsquerda.size || !daDireita.length) return false;
  const comuns = daDireita.filter(token => daEsquerda.has(token)).length;
  return comuns / Math.min(daEsquerda.size, daDireita.length) >= 0.6;
}

const fontesDe = (topico: RadarClassifiedTopic) =>
  topico.occurrences.map(item => ({ pageId: item.pageId, url: item.url, title: item.title }));

const COBERTURA_RELEVANTE: RadarClassifiedTopic["classification"][] = ["RECURRENT_TOPIC", "COMPETITIVE_GAP"];

/*
 * A COBERTURA OBSERVADA, VENHA ELA DE ONDE VIER.
 *
 * Antes do Gate 8 a única leitura possível era o heading literal; a partir
 * dele, o conceito. Esta forma intermediária deixa o confronto escrito uma vez
 * só: quem muda é a régua que o alimenta, não a gramática da comparação.
 *
 * `formulations` é o que faz a diferença aparecer. O ArticleDNA declara
 * "identificação da pele oleosa" e nenhuma página escreve isso; oito escrevem
 * "Sinais de pele oleosa" e "Como saber se a pele é oleosa?". Comparar com a
 * lista inteira de formulações é o que transforma oito lacunas em um
 * confirmado.
 */
type RadarCoberturaObservada = {
  subject: string;
  /** A necessidade que o conceito expressa. `null` na leitura por heading cru. */
  conceptType: RadarSemanticConcept["conceptType"] | null;
  formulations: string[];
  pages: number;
  sampleSize: number;
  reason: string;
  relevant: boolean;
  sources: Array<{ pageId: string; url: string; title: string }>;
  /** Presente só quando a leitura veio da camada conceitual. */
  queryCoverage: number | null;
  auxiliaryOnly: boolean;
};

const coberturaDoConceito = (concept: RadarSemanticConcept): RadarCoberturaObservada => ({
  subject: concept.canonicalLabel,
  conceptType: concept.conceptType,
  formulations: concept.variants,
  pages: concept.sourceCount,
  sampleSize: concept.sampleSize,
  reason: concept.classificationReason,
  relevant: concept.anchored,
  sources: concept.supportingObservations.map(item => ({ pageId: item.pageId, url: item.url, title: item.pageTitle })),
  queryCoverage: concept.queryCoverage,
  auxiliaryOnly: concept.auxiliaryOnly,
});

const coberturaDoTopico = (topico: RadarClassifiedTopic): RadarCoberturaObservada => ({
  subject: topico.topic,
  conceptType: null,
  formulations: [topico.topic],
  pages: topico.pages,
  sampleSize: topico.sampleSize,
  reason: topico.reason,
  relevant: topico.relevance.query || topico.relevance.principal || topico.relevance.editorial,
  sources: fontesDe(topico),
  queryCoverage: null,
  auxiliaryOnly: false,
});

/**
 * O declarado casa com alguma das formulações observadas para este conceito?
 *
 * A interseção de tokens sozinha não basta e o Gate 8 mostra por quê:
 * "identificação da pele oleosa" e "Causas internas da pele oleosa"
 * compartilham dois terços dos termos significativos e são necessidades
 * OPOSTAS. Quando as duas pontas declaram a sua necessidade, ela é conferida
 * antes das palavras — senão o confronto dá o assunto por coberto e a lacuna
 * real desaparece do relatório.
 */
const cobreOAssunto = (declarado: string, cobertura: RadarCoberturaObservada) => {
  if (cobertura.conceptType) {
    const declaradoTipado = radarSemanticType(declarado);
    if (declaradoTipado.faceted && declaradoTipado.type !== cobertura.conceptType) return false;
  }
  return cobertura.formulations.some(formulacao => mesmoAssunto(declarado, formulacao));
};

export function buildRadarEditorialComparison(input: {
  context: RadarArticleResearchContext;
  model: RadarCompetitiveModel | null;
  /** Intenção dominante observada na coleta, quando o diagnóstico existir. */
  observedIntent?: string | null;
  /** Formatos dominantes observados na coleta. */
  observedFormats?: readonly string[];
}): RadarEditorialComparison {
  const limitations: string[] = [];
  const rows: RadarComparisonRow[] = [];
  const model = input.model;
  const declarados = input.context.editorialTopics;
  const amostra = model?.sample.comparable ?? 0;

  if (!model) limitations.push("Não há modelo competitivo observado: a comparação não pôde confrontar cobertura de concorrentes.");
  if (!declarados.length) limitations.push("O ArticleDNA desta versão não declara tópicos obrigatórios nem cobertura; só existe confronto de intenção e formato.");

  /*
   * A LEITURA CONCEITUAL TEM PRECEDÊNCIA.
   *
   * Enquanto o confronto era feito por heading literal, o mesmo assunto escrito
   * de quatro maneiras produzia quatro linhas — e, quando o ArticleDNA usava
   * uma quinta formulação, cinco. A camada do Gate 8 resolve isso antes de a
   * comparação começar; o caminho antigo continua para amostras sem conceito
   * aproveitável.
   */
  const conceitos = model?.semantic?.concepts || [];
  const usaCamadaSemantica = conceitos.length > 0;
  if (model && !usaCamadaSemantica) {
    limitations.push("A camada conceitual não produziu conceitos nesta amostra: o confronto usou os headings literais.");
  }

  const observados: RadarCoberturaObservada[] = usaCamadaSemantica
    ? conceitos.filter(item => item.classification === "RECURRENT_TOPIC" || item.classification === "COMPETITIVE_GAP").map(coberturaDoConceito)
    : (model?.classifiedTopics || []).filter(item => COBERTURA_RELEVANTE.includes(item.classification)).map(coberturaDoTopico);

  /* ------------------------- o que o artigo declara ------------------------ */

  const casados = new Set<string>();

  for (const declarado of declarados) {
    const cobertura = observados.find(item => cobreOAssunto(declarado, item)) || null;
    if (cobertura) casados.add(cobertura.subject);

    if (!model) {
      rows.push({
        dimension: "topic", subject: declarado,
        articleDeclares: declarado, serpShows: null, competitorsCover: null,
        status: "NOT_OBSERVED",
        evidence: "Sem amostra analisada nesta investigação.",
        sources: [],
      });
      continue;
    }

    if (cobertura) {
      const formulacoes = cobertura.formulations.length > 1
        ? ` sob ${cobertura.formulations.length} formulações diferentes`
        : "";
      rows.push({
        dimension: "topic", subject: declarado,
        articleDeclares: declarado,
        serpShows: null,
        competitorsCover: cobertura.subject,
        status: "CONFIRMED",
        evidence: `${cobertura.pages} de ${cobertura.sampleSize} página(s) comparável(is) cobrem este assunto${formulacoes}.`,
        sources: cobertura.sources,
      });
      continue;
    }

    /*
     * DECLARADO E NÃO COBERTO NÃO É ERRO DO ARTIGO.
     *
     * O Arquiteto decidiu incluir o assunto. Se o mercado não o cobre, o fato
     * é diferencial observado — quem decide o que fazer com ele é o Planejador.
     */
    rows.push({
      dimension: "topic", subject: declarado,
      articleDeclares: declarado,
      serpShows: null,
      competitorsCover: null,
      status: "DIFFERENTIATION",
      evidence: amostra
        ? `Nenhuma das ${amostra} página(s) comparável(is) cobre este assunto.`
        : "Não houve página comparável para observar cobertura.",
      sources: [],
    });
  }

  /* ---------------------- o que só os concorrentes cobrem ------------------ */

  for (const observado of observados) {
    if (casados.has(observado.subject)) continue;
    if (declarados.some(declarado => cobreOAssunto(declarado, observado))) continue;

    /*
     * LACUNA EXIGE RECORRÊNCIA E RELEVÂNCIA.
     *
     * "Apareceu uma vez" virava oportunidade no modelo antigo. Aqui um assunto
     * só entra como lacuna se a leitura já o considerou relacionado ao que o
     * artigo declara — e, com a camada conceitual, só DEPOIS de agrupado: as
     * quatro formulações de um mesmo assunto viram uma linha, não quatro.
     */
    if (!observado.relevant) continue;

    /* Achado só pela pesquisa auxiliar continua aparecendo, e dito como tal. */
    const procedencia = observado.auxiliaryOnly
      ? " Encontrado apenas por keyword auxiliar da composição."
      : observado.queryCoverage && observado.queryCoverage > 1
        ? ` Encontrado por ${observado.queryCoverage} consultas distintas.`
        : "";

    rows.push({
      dimension: "topic", subject: observado.subject,
      articleDeclares: null,
      serpShows: null,
      competitorsCover: observado.subject,
      status: "GAP",
      evidence: `${observado.pages} de ${observado.sampleSize} página(s) comparável(is) cobrem este assunto e o ArticleDNA não o declara. ${observado.reason}${procedencia}`.trim(),
      sources: observado.sources,
    });
  }

  /* ------------------------------- intenção -------------------------------- */

  /*
   * O SEGUNDO PRODUTOR DA FRASE DO SMOKE — e ninguém tinha olhado para ele.
   *
   * "O artigo declara X e a SERP responde com Y" é escrita aqui TAMBÉM, com
   * outra leitura crua e outra comparação literal. Corrigir só o modelo
   * competitivo teria deixado a mesma frase nascendo de um segundo lugar.
   */
  const declaradaIntencao = radarDeclaredArticleIntent(input.context.article);
  const observadaIntencao = radarConclusiveIntent(input.observedIntent || model?.identity.observedIntent);

  if (declaradaIntencao || observadaIntencao) {
    const iguais = Boolean(declaradaIntencao && observadaIntencao && !radarIntentConflict({ expected: declaradaIntencao, observed: observadaIntencao }).conflicting);
    rows.push({
      dimension: "intent", subject: "Intenção de busca",
      articleDeclares: declaradaIntencao,
      serpShows: observadaIntencao,
      competitorsCover: null,
      status: !declaradaIntencao || !observadaIntencao ? "NOT_OBSERVED" : iguais ? "CONFIRMED" : "CONFLICT",
      evidence: !declaradaIntencao
        ? "O ArticleDNA desta versão não declara intenção principal."
        : !observadaIntencao
          ? "A coleta não classificou intenção dominante."
          : iguais
            ? "A intenção observada na SERP corresponde à declarada."
            : `O artigo declara "${declaradaIntencao}" e a SERP responde com "${observadaIntencao}".`,
      sources: [],
    });
  }

  /* -------------------------------- formato -------------------------------- */

  const formatos = [...(input.observedFormats || [])].filter(Boolean);
  const formatoDominante = model?.identity.dominantFormat || formatos[0] || null;
  if (formatoDominante || input.context.article.hierarchy) {
    rows.push({
      dimension: "format", subject: "Formato dominante",
      articleDeclares: input.context.article.hierarchy,
      serpShows: formatos.length ? formatos.join(" · ") : formatoDominante,
      competitorsCover: formatoDominante,
      status: formatoDominante ? "CONFIRMED" : "NOT_OBSERVED",
      evidence: formatoDominante
        ? `Formato predominante observado nas páginas da amostra: ${formatoDominante}.`
        : "A coleta não classificou formato dominante.",
      sources: [],
    });
  }

  /* -------------------------------- entidade ------------------------------- */

  for (const keyword of input.context.keywords) {
    const snapshot = keyword.strategy.keywordDnaSnapshot as { payload?: Record<string, unknown> } | null;
    const entidade = typeof snapshot?.payload?.centralEntity === "string" ? snapshot.payload.centralEntity.trim() : "";
    if (!entidade) continue;
    if (rows.some(row => row.dimension === "entity" && normalizar(row.subject) === normalizar(entidade))) continue;

    const cobertura = observados.filter(item => cobreOAssunto(entidade, item));

    /*
     * A ENTIDADE RELACIONADA CONTA COMO OBSERVAÇÃO — E CONTINUA DISTINTA.
     *
     * "sebo" não é "pele oleosa"; aparece ao lado dela e a explica. Registrar a
     * relação sem colapsar as duas é o que separa "a amostra trata da entidade"
     * de "a amostra usa a mesma palavra".
     */
    const relacionadas = (model?.semantic?.entities || [])
      .filter(item => item.relation === "related_to" && item.pages > 0)
      .filter(item => radarTopicTokens(entidade).map(token => token.slice(0, 4)).some(prefixo => (item.relatedTo || "").startsWith(prefixo)))
      .map(item => item.label);

    rows.push({
      dimension: "entity", subject: entidade,
      articleDeclares: `Entidade central de "${keyword.identity.text || keyword.identity.keywordId}"`,
      serpShows: null,
      competitorsCover: cobertura.length ? cobertura.map(item => item.subject).join(" · ") : null,
      status: !model ? "NOT_OBSERVED" : cobertura.length ? "CONFIRMED" : "DIFFERENTIATION",
      evidence: !model
        ? "Sem amostra analisada nesta investigação."
        : cobertura.length
          ? `${cobertura.length} assunto(s) da amostra tratam desta entidade.${relacionadas.length ? ` Entidades relacionadas observadas: ${relacionadas.slice(0, 5).join(", ")}.` : ""}`
          : "A entidade declarada não apareceu como assunto recorrente na amostra.",
      sources: cobertura.flatMap(item => item.sources),
    });
  }

  const contar = (status: RadarComparisonStatus) => rows.filter(row => row.status === status).length;

  return {
    rows,
    confirmed: contar("CONFIRMED"),
    gaps: contar("GAP"),
    differentiation: contar("DIFFERENTIATION"),
    conflicts: contar("CONFLICT"),
    notObserved: contar("NOT_OBSERVED"),
    limitations,
  };
}

export const radarComparisonStatusLabel = (status: RadarComparisonStatus) => ({
  CONFIRMED: "Confirmado",
  GAP: "Lacuna",
  DIFFERENTIATION: "Diferencial declarado",
  CONFLICT: "Conflito",
  NOT_OBSERVED: "Não observado",
}[status]);
