import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildRadarExternalSourceResearch,
  radarConceptSupportsLinkRelation,
  radarLinkObservations,
  type RadarLinkObservation,
  type RadarSourceConceptAlignment,
} from "../lib/radar/link-and-source-research.ts";
import {
  buildRadarSemanticConceptModel,
  buildRadarSemanticScope,
  radarSemanticStems,
  radarSemanticType,
  type RadarSemanticConceptModel,
  type RadarSemanticScope,
} from "../lib/radar/semantic-concept-model.ts";
import { radarTopicTokens } from "../lib/radar/topic-classification.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/*
 * ====== 2026-10-08 · AS FONTES EXTERNAS SEM REFAZER A MESMA LEITURA DE TEXTO ======
 *
 * O dono: "o selector e o scroll estão muito lentos". Medido na bancada do
 * scratchpad: `buildRadarExternalSourceResearch` respondia por ~86% do modelo
 * de cada linha da planilha, e o custo crescia com os links observados — 54 ms
 * com 12 links por página, 158 ms com 36, 321 ms com 72 (o extrator guarda até
 * 300). O laço conceito × destino × seção × variante perguntava o tipo, os
 * tokens e as raízes das MESMAS strings milhares de vezes.
 *
 * A correção guarda essas três leituras por string dentro de UMA chamada.
 * Aqui:
 *   (a) a saída é a MESMA — comparada com um oráculo que é a cópia literal do
 *       laço anterior, chamando as funções públicas sem guarda nenhuma, numa
 *       amostra que produz alinhamento LEXICAL e SEMANTICALLY_RELATED;
 *   (b) o orçamento: no pior caso (12 páginas × 72 links, nenhuma seção casando
 *       por palavra), pelo menos 15× mais rápido que o laço sem guarda medido
 *       ao lado (antes ~230 ms; com a guarda ~5 ms), com teto absoluto folgado;
 *   (c) a fiação: nenhuma das três leituras é chamada crua dentro do laço.
 *
 * Só fixture: nenhuma rede, nenhum provider.
 */

const semComentarios = (texto: string) => texto.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");

/* ------------------------------ a amostra ------------------------------ */

/* Formulações reais de mercado: a mesma necessidade dita de jeitos diferentes. */
const SECOES = [
  "Como identificar a pele oleosa?",
  "Como saber se a pele é oleosa",
  "Sinais de pele oleosa",
  "Por que a pele fica oleosa?",
  "Causas da oleosidade da pele",
  "O que causa a pele oleosa",
  "Como controlar a oleosidade",
  "Rotina de cuidados para pele oleosa",
  "Tratamento da pele oleosa",
  "Melhores produtos para pele oleosa",
  "Hidratação da pele oleosa",
  "Erros comuns de quem tem pele oleosa",
];

const FONTES = [
  { dominio: "www.aad.org", caminho: "public/diseases/oily-skin" },
  { dominio: "pubmed.ncbi.nlm.nih.gov", caminho: "31234567" },
  { dominio: "www.sbd.org.br", caminho: "doencas/pele-oleosa" },
  { dominio: "www.gov.br", caminho: "anvisa/cosmeticos" },
  { dominio: "revista-dermatologia.com.br", caminho: "artigos/sebo" },
  { dominio: "blog-de-beleza.com.br", caminho: "pele-oleosa-guia" },
];

/*
 * O PIOR CASO REAL: links de menu, rodapé e "leia também" sob títulos que não
 * são formulação de conceito nenhum. Nenhum casa, então o laço varre TODAS as
 * ocorrências × variantes, nos dois critérios — é onde o custo explodia.
 */
const SECOES_GENERICAS = Array.from({ length: 12 }, (_, k) => `Bloco editorial ${k}`);

function link(pagina: number, ordem: number, secoes: readonly string[], generica: boolean): RadarObservedLink {
  const externo = ordem % 4 !== 3;
  const fonte = FONTES[(pagina + ordem) % FONTES.length];
  return {
    destinationUrl: externo ? `https://${fonte.dominio}/${fonte.caminho}-${ordem % 5}` : `https://concorrente-${pagina}.com.br/blog/post-${ordem}`,
    destinationDomain: externo ? fonte.dominio : `concorrente-${pagina}.com.br`,
    kind: externo ? "EXTERNAL" : "INTERNAL",
    anchorText: `estudo sobre ${secoes[ordem % secoes.length].toLowerCase()}`,
    surroundingText: `Segundo a referência, ${secoes[ordem % secoes.length].toLowerCase()} depende da produção de sebo.`,
    /* Um em cada sete fica sem seção: a limitação continua contada. */
    sectionHeading: ordem % 7 === 6 ? null : generica ? SECOES_GENERICAS[ordem % SECOES_GENERICAS.length] : secoes[ordem % secoes.length],
    rel: [], target: null, order: ordem,
  };
}

function pagina(indice: number, linksPorPagina: number, generica = false): RadarExtractionPage {
  const secoes = SECOES.filter((_, k) => (k + indice) % 3 !== 0);
  return {
    id: `page:${indice}`, url: `https://concorrente-${indice}.com.br/artigo/pele-oleosa`, status: "success",
    fetchedAt: "2026-10-08T10:00:00.000Z", title: `Pele oleosa: guia ${indice}`, metaDescription: "", canonical: null,
    h1: ["Pele oleosa"], h2: secoes, h3: [], wordCount: 1600 + indice * 10, internalLinkCount: 3, externalLinkCount: 9,
    listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
    hasDates: true, author: "Equipe", structuredDataTypes: ["Article"], recurringTerms: [],
    boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
    headingOutline: [{ level: 1, text: "Pele oleosa" }, ...secoes.map(text => ({ level: 2 as const, text }))],
    introWordCount: 60, introText: "Introdução.", closingWordCount: 40, closingText: "Fecho.", hasClosing: true,
    emphasizedTerms: [], keywordPlacement: null,
    observedLinks: [
      ...Array.from({ length: linksPorPagina }, (_, ordem) => link(indice, ordem, secoes, generica)),
      /*
       * Uma fonte citada sempre sob uma seção que NÃO é formulação de conceito
       * nenhum, mas partilha a raiz do assunto ("oleos"): é ela que produz o
       * alinhamento SEMANTICALLY_RELATED, sem casamento lexical.
       */
      {
        destinationUrl: "https://www.sbd.org.br/oleosidade-e-acne", destinationDomain: "www.sbd.org.br", kind: "EXTERNAL",
        anchorText: "consenso da sociedade de dermatologia", surroundingText: "A oleosidade aumenta na adolescência.",
        sectionHeading: "Oleosidade e acne na adolescência", rel: [], target: null, order: linksPorPagina,
      },
    ],
    error: null,
  } as RadarExtractionPage;
}

/* O pedaço do contexto que o laço lê: as keywords que ancoram o assunto. */
const CONTEXTO = { keywords: [], resolvedKeywordTexts: ["pele oleosa", "oleosidade da pele"], editorialTopics: ["cuidados com a pele oleosa"] } as unknown as RadarArticleResearchContext;

function amostra(linksPorPagina: number, generica = false) {
  const pages = Array.from({ length: 12 }, (_, indice) => pagina(indice, linksPorPagina, generica));
  const semantic = buildRadarSemanticConceptModel({ pages, keywordTexts: ["pele oleosa", "oleosidade da pele"], editorialTopics: ["cuidados com a pele oleosa"] });
  return { pages, semantic };
}

/* ----------------- o oráculo: o laço de antes, sem guarda ----------------- */

function oraculoDosAlinhamentos(pages: readonly RadarExtractionPage[], semantic: RadarSemanticConceptModel): RadarSourceConceptAlignment[] {
  const necessidadeCompativel = (esquerda: string, direita: string) => {
    const aqui = radarSemanticType(esquerda);
    const ali = radarSemanticType(direita);
    return !(aqui.faceted && ali.faceted && aqui.type !== ali.type);
  };
  const mesmaFormulacao = (esquerda: string, direita: string) => {
    if (!necessidadeCompativel(esquerda, direita)) return false;
    const daEsquerda = new Set(radarTopicTokens(esquerda));
    const daDireita = radarTopicTokens(direita);
    if (!daEsquerda.size || !daDireita.length) return false;
    return daDireita.filter(token => daEsquerda.has(token)).length / Math.min(daEsquerda.size, daDireita.length) >= 0.6;
  };
  const raizesEmComum = (anchor: string, conceito: string, escopo: RadarSemanticScope) => {
    if (!necessidadeCompativel(anchor, conceito)) return false;
    const doConceito = new Set(radarSemanticStems(conceito));
    const comuns = radarSemanticStems(anchor).filter(raiz => doConceito.has(raiz));
    if (!comuns.length) return false;
    if (comuns.length >= 2) return true;
    return escopo.stems.has(comuns[0]);
  };
  const podeSerFonte = (item: RadarLinkObservation) => item.kind === "EXTERNAL" && item.category === "CONTENT_REFERENCE";
  const porDestino = new Map<string, RadarLinkObservation[]>();
  for (const item of radarLinkObservations({ pages }).filter(podeSerFonte)) {
    porDestino.set(item.normalizedDestination, [...(porDestino.get(item.normalizedDestination) || []), item]);
  }
  const escopo = buildRadarSemanticScope({ centralEntities: [], keywordTexts: CONTEXTO.resolvedKeywordTexts, editorialTopics: CONTEXTO.editorialTopics });
  const alinhamentos: RadarSourceConceptAlignment[] = [];
  for (const concept of semantic.concepts.filter(radarConceptSupportsLinkRelation)) {
    for (const [, ocorrencias] of porDestino) {
      const comSecao = ocorrencias.filter(item => item.sectionHeading);
      const lexical = comSecao.find(item => mesmaFormulacao(item.sectionHeading as string, concept.canonicalLabel)
        || concept.variants.some(variante => mesmaFormulacao(item.sectionHeading as string, variante)));
      const semantico = comSecao.find(item => raizesEmComum(item.sectionHeading as string, concept.canonicalLabel, escopo)
        || concept.variants.some(variante => raizesEmComum(item.sectionHeading as string, variante, escopo)));
      const casado = lexical || semantico;
      if (!casado) continue;
      const paginasCitantes = [...new Set(ocorrencias.map(item => item.sourcePageId))];
      alinhamentos.push({
        conceptId: concept.id,
        conceptLabel: concept.canonicalLabel,
        domain: casado.destinationDomain,
        destinationUrl: casado.destinationUrl,
        sectionHeading: casado.sectionHeading,
        matchKind: lexical ? "LEXICAL" : "SEMANTICALLY_RELATED",
        confidence: lexical && paginasCitantes.length > 1 ? "HIGH" : lexical ? "MEDIUM" : "LOW",
        evidence: `${paginasCitantes.length} concorrente(s) citam ${casado.destinationDomain} na seção "${casado.sectionHeading}", que trata de "${concept.canonicalLabel}".`,
        provenance: ocorrencias.map(item => ({ pageId: item.sourcePageId, pageUrl: item.sourceUrl })),
      });
    }
  }
  return alinhamentos;
}

/* -------------------------------- testes -------------------------------- */

test("(a) mesma saída: os alinhamentos conceito × fonte batem com o laço de antes, sem guarda", () => {
  for (const linksPorPagina of [12, 36]) {
    const { pages, semantic } = amostra(linksPorPagina);
    const resultado = buildRadarExternalSourceResearch({ pages, semantic, context: CONTEXTO });
    const tipos = new Set(resultado.conceptAlignments.map(item => item.matchKind));
    assert.ok(resultado.conceptAlignments.length > 0, "a amostra precisa produzir alinhamento, senão o oráculo não prova nada");
    assert.ok(tipos.has("LEXICAL"), "faltou alinhamento LEXICAL na amostra");
    assert.ok(tipos.has("SEMANTICALLY_RELATED"), "faltou alinhamento SEMANTICALLY_RELATED na amostra");
    assert.deepStrictEqual(resultado.conceptAlignments, oraculoDosAlinhamentos(pages, semantic), `${linksPorPagina} links por página`);
    /* E chamar de novo dá o mesmo: nada sobra de uma chamada para a outra. */
    assert.deepStrictEqual(buildRadarExternalSourceResearch({ pages, semantic, context: CONTEXTO }), resultado);
  }
});

test("(a) a guarda não vaza entre chamadas: amostras diferentes, respostas de cada uma", () => {
  const curta = amostra(12);
  const longa = amostra(36);
  const primeiro = buildRadarExternalSourceResearch({ pages: longa.pages, semantic: longa.semantic, context: CONTEXTO });
  const segundo = buildRadarExternalSourceResearch({ pages: curta.pages, semantic: curta.semantic, context: CONTEXTO });
  assert.deepStrictEqual(segundo.conceptAlignments, oraculoDosAlinhamentos(curta.pages, curta.semantic));
  assert.deepStrictEqual(primeiro.conceptAlignments, oraculoDosAlinhamentos(longa.pages, longa.semantic));
});

test("(a) também no pior caso (nenhuma seção casa por palavra), a saída é a do laço de antes", () => {
  const { pages, semantic } = amostra(36, true);
  const resultado = buildRadarExternalSourceResearch({ pages, semantic, context: CONTEXTO });
  assert.deepStrictEqual(resultado.conceptAlignments, oraculoDosAlinhamentos(pages, semantic));
});

test("(b) orçamento no pior caso: 12 páginas × 72 links, ≥ 15× mais rápido que o laço sem guarda e abaixo de 100 ms", () => {
  const { pages, semantic } = amostra(72, true);
  const entrada = { pages, semantic, context: CONTEXTO };
  /*
   * Aquecimento do JIT; depois 9 medições INTERCALADAS com o oráculo sem
   * guarda, e o MÍNIMO de cada lado (o mínimo descarta os tiques em que a
   * máquina estava ocupada com outra coisa).
   *
   * O critério é a RAZÃO contra o oráculo: medida no mesmo processo e no
   * mesmo instante, ela não depende de a suíte estar rodando 200 arquivos em
   * paralelo — e é ela que pega a guarda removida de um só dos helpers
   * (medido: ~45× com as três guardas; 2× a 10× sem uma delas). O teto
   * absoluto é folgado de propósito: na suíte cheia a mesma chamada chegou a
   * 42 ms; sem guarda nenhuma ela passa de 200 ms.
   */
  for (let vez = 0; vez < 2; vez += 1) { buildRadarExternalSourceResearch(entrada); oraculoDosAlinhamentos(pages, semantic); }
  const atual: number[] = [];
  const semGuarda: number[] = [];
  for (let vez = 0; vez < 9; vez += 1) {
    let inicio = performance.now();
    buildRadarExternalSourceResearch(entrada);
    atual.push(performance.now() - inicio);
    inicio = performance.now();
    oraculoDosAlinhamentos(pages, semantic);
    semGuarda.push(performance.now() - inicio);
  }
  const menorAtual = Math.min(...atual);
  const menorSemGuarda = Math.min(...semGuarda);
  assert.ok(menorSemGuarda / menorAtual >= 15, `só ${(menorSemGuarda / menorAtual).toFixed(1)}× mais rápido que o laço sem guarda (${menorAtual.toFixed(1)} × ${menorSemGuarda.toFixed(1)} ms) — a leitura por texto voltou a ser refeita?`);
  assert.ok(menorAtual < 100, `${menorAtual.toFixed(1)} ms com 72 links por página`);
});

test("(c) dentro do laço conceito × fonte, as três leituras passam pela guarda da chamada", async () => {
  const codigo = semComentarios(await readFile(new URL("../lib/radar/link-and-source-research.ts", import.meta.url), "utf8"));
  const corpo = codigo.slice(codigo.indexOf("export function buildRadarExternalSourceResearch("), codigo.indexOf("const paginasComFonte = "));
  assert.match(corpo, /const leitura = criarLeituraDeTexto\(\);/);
  assert.match(corpo, /mesmaFormulacao\(item\.sectionHeading as string, concept\.canonicalLabel, leitura\)/);
  assert.match(corpo, /mesmaFormulacao\(item\.sectionHeading as string, variante, leitura\)/);
  assert.match(corpo, /raizesEmComum\(item\.sectionHeading as string, concept\.canonicalLabel, escopo, leitura\)/);
  assert.match(corpo, /raizesEmComum\(item\.sectionHeading as string, variante, escopo, leitura\)/);
  for (const helper of ["necessidadeCompativel", "mesmaFormulacao", "raizesEmComum"]) {
    const inicio = codigo.indexOf(`function ${helper}(`);
    const fim = codigo.indexOf("\n}\n", inicio);
    const funcao = codigo.slice(inicio, fim);
    assert.doesNotMatch(funcao, /radarSemanticType\(|radarTopicTokens\(|radarSemanticStems\(/, `${helper} voltou a ler o texto cru`);
  }
  /* A guarda nasce dentro da chamada: nada de Map de módulo guardando texto entre marcas. */
  assert.doesNotMatch(codigo, /^const [a-zA-Z_]+ = new Map<string/m);
});
