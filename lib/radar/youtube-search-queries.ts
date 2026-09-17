import { radarDeclaredArticleIntent } from "./editorial-identity.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";

/**
 * AS CONSULTAS DA PESQUISA DE YOUTUBE — YOUTUBE_SEARCH_1 · §3.
 *
 * ===================== POR QUE NÃO SÃO AS DO GOOGLE =====================
 *
 * A pesquisa do Google procura PÁGINAS que respondem a uma keyword. A do
 * YouTube procura VÍDEOS que competem por uma intenção — e as pessoas não
 * digitam a mesma coisa nos dois lugares. Quem busca "skincare para pele
 * oleosa" no Google quer ler; quem digita isso no YouTube quer ver alguém
 * fazendo. O que compete lá é "rotina", "como", "resenha", "passo a passo".
 *
 * Reaproveitar cegamente o plano do Google traria a SERP de artigos convertida
 * em vídeos — e o universo competitivo descreveria a disputa errada.
 *
 * ========================= DETERMINÍSTICO E AUDITÁVEL =========================
 *
 * Nenhum modelo participa. Cada consulta declara DE ONDE saiu e POR QUE existe,
 * e o mesmo contexto produz sempre as mesmas consultas, na mesma ordem, com os
 * mesmos identificadores. É o que permite comparar duas coletas do mesmo artigo
 * e saber se o que mudou foi o YouTube ou foi a nossa estratégia.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/* ============================ de onde ela veio ============================ */

export const RADAR_YOUTUBE_QUERY_ORIGINS = [
  /** A keyword principal, verbatim. A consulta que não pode faltar. */
  "PRIMARY_KEYWORD",
  /** A principal com o enquadramento que o YouTube premia: como, rotina, resenha. */
  "AUDIOVISUAL_FRAMING",
  /** Um tópico editorial que o artigo precisa cobrir, buscado como vídeo. */
  "EDITORIAL_TOPIC",
  /** Uma keyword secundária do próprio artigo. */
  "SECONDARY_KEYWORD",
] as const;
export type RadarYoutubeQueryOrigin = typeof RADAR_YOUTUBE_QUERY_ORIGINS[number];

export type RadarYoutubeQuery = {
  /** Determinístico: deriva do texto normalizado, nunca de um contador. */
  queryId: string;
  text: string;
  origin: RadarYoutubeQueryOrigin;
  /** De qual keyword ou tópico ela saiu. `null` quando é composição. */
  sourceRef: string | null;
  /** Por que esta consulta existe. Sem isto, o plano é um chute ordenado. */
  reason: string;
};

export type RadarYoutubeQueryPlan = {
  articleId: string;
  articleDnaVersionId: string;
  queries: RadarYoutubeQuery[];
  /** O que não deu para montar, declarado. Ausência nunca é omitida. */
  limitations: string[];
};

/**
 * O TETO DE CONSULTAS — e ele existe por causa do custo.
 *
 * Cada consulta é uma chamada paga ao provider. Seis cobre a principal, dois
 * enquadramentos, dois tópicos e uma secundária: o suficiente para um universo
 * competitivo com mais de uma origem, sem transformar um START em dez
 * requisições. O gate seguinte pode mexer nisto com número na mão.
 */
export const RADAR_YOUTUBE_MAX_QUERIES = 6;

/* ===================== o enquadramento por intenção ===================== */

/**
 * OS MODIFICADORES SÃO DE FORMATO, NUNCA DE NICHO.
 *
 * "rotina", "como", "resenha" descrevem o TIPO de vídeo que compete — e
 * funcionam em qualquer marca. Um modificador de nicho ("pele oleosa") só
 * funcionaria nesta marca e quebraria na primeira diferente, além de fingir
 * que o Radar entende do assunto. Ele não entende: ele lê a classificação que
 * o Arquiteto fechou.
 */
/**
 * DOIS VOCABULÁRIOS, O MESMO FUNDAMENTO.
 *
 * `radarDeclaredArticleIntent` devolve o terminal do Arquiteto
 * (`COMMERCIAL_INVESTIGATION`) ou, quando ele não existe, o `mainIntent`
 * legado em português (`comercial`). Reconhecer só o primeiro fazia todo artigo
 * classificado à moda antiga cair no enquadramento neutro sem que ninguém
 * percebesse — e a tela diria que a intenção foi considerada.
 *
 * O casamento é por RADICAL, não por igualdade: é o que atravessa
 * "COMMERCIAL_INVESTIGATION", "comercial" e "investigação comercial".
 */
const ENQUADRAMENTO_POR_INTENCAO: Array<{ radicais: readonly string[]; modificadores: readonly string[] }> = [
  { radicais: ["COMMERCIAL", "COMERCIAL"], modificadores: ["resenha", "comparativo"] },
  { radicais: ["TRANSACTIONAL", "TRANSACIONAL"], modificadores: ["resenha", "vale a pena"] },
  { radicais: ["NAVIGATIONAL", "NAVEGACIONAL"], modificadores: ["review"] },
  { radicais: ["INFORMATIONAL", "INFORMACIONAL"], modificadores: ["como", "rotina"] },
];

/** Sem intenção reconhecível, o enquadramento é o mais neutro que existe. */
const ENQUADRAMENTO_PADRAO = ["como", "rotina"] as const;

function enquadramentos(intent: string | null): { modificadores: readonly string[]; reconhecida: boolean } {
  const chave = (intent || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (!chave) return { modificadores: ENQUADRAMENTO_PADRAO, reconhecida: false };
  const encontrado = ENQUADRAMENTO_POR_INTENCAO.find(item => item.radicais.some(radical => chave.includes(radical)));
  return encontrado
    ? { modificadores: encontrado.modificadores, reconhecida: true }
    : { modificadores: ENQUADRAMENTO_PADRAO, reconhecida: false };
}

/* ============================== a identidade ============================= */

const espacos = /\s+/g;

/** Caixa baixa, acento fora, espaço colapsado: a forma que decide duplicata. */
export function radarYoutubeQueryKey(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(espacos, " ").trim();
}

/**
 * O IDENTIFICADOR DERIVA DO TEXTO, e isso não é detalhe.
 *
 * Um contador faria a mesma consulta mudar de id entre duas coletas, e a
 * proveniência de um vídeo — "foi achado por estas consultas" — apontaria para
 * identificadores que não existem mais.
 */
export function radarYoutubeQueryId(texto: string): string {
  const normalizado = radarYoutubeQueryKey(texto);
  let hash = 0x811c9dc5;
  for (let indice = 0; indice < normalizado.length; indice += 1) {
    hash ^= normalizado.charCodeAt(indice);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `ytq:${hash.toString(16).padStart(8, "0")}`;
}

/* =============================== o plano =============================== */

const texto = (valor: string | null | undefined): string | null =>
  typeof valor === "string" && valor.trim() ? valor.replace(espacos, " ").trim() : null;

/**
 * O PLANO, MONTADO NA ORDEM DA IMPORTÂNCIA EDITORIAL.
 *
 * Principal primeiro, porque é a disputa central. Depois o enquadramento, que é
 * onde mora a diferença entre buscar no Google e buscar no YouTube. Só então
 * tópicos e secundárias — que ampliam o universo sem redefinir o assunto.
 *
 * Consulta repetida NÃO entra duas vezes: a mesma string paga duas vezes e
 * traz o mesmo resultado. A primeira origem a produzi-la é a que fica, e é ela
 * que explica por que a consulta existe.
 */
export function buildRadarYoutubeQueryPlan(input: {
  context: RadarArticleResearchContext;
  limit?: number;
}): RadarYoutubeQueryPlan {
  const limite = Math.max(1, input.limit ?? RADAR_YOUTUBE_MAX_QUERIES);
  const { article, keywords, editorialTopics } = input.context;
  const limitations: string[] = [];

  const principalKeyword = keywords.find(item => item.identity.role === "principal") || null;
  const principal = texto(principalKeyword?.identity.text);

  const queries: RadarYoutubeQuery[] = [];
  const vistos = new Set<string>();

  const acrescentar = (candidato: { text: string; origin: RadarYoutubeQueryOrigin; sourceRef: string | null; reason: string }) => {
    const limpo = texto(candidato.text);
    if (!limpo) return;
    const chave = radarYoutubeQueryKey(limpo);
    if (!chave || vistos.has(chave)) return;
    if (queries.length >= limite) return;
    vistos.add(chave);
    queries.push({ queryId: radarYoutubeQueryId(limpo), text: limpo, origin: candidato.origin, sourceRef: candidato.sourceRef, reason: candidato.reason });
  };

  /*
   * SEM KEYWORD PRINCIPAL NÃO HÁ PESQUISA — e isso é uma ausência declarada,
   * não um plano vazio. O Arquiteto resolve o vínculo; o Radar não inventa.
   */
  if (!principal) {
    limitations.push("A keyword principal deste artigo não foi resolvida; sem ela não há consulta central para pesquisar no YouTube.");
    return { articleId: article.articleId, articleDnaVersionId: article.articleDnaVersionId, queries: [], limitations };
  }

  acrescentar({
    text: principal,
    origin: "PRIMARY_KEYWORD",
    sourceRef: principalKeyword?.identity.keywordId || null,
    reason: "A keyword principal do artigo, como as pessoas a digitam.",
  });

  /*
   * A INTENÇÃO VEM DA AUTORIDADE, NUNCA DO CAMPO CRU — GATE 18.6.
   *
   * `radarDeclaredArticleIntent` é o único leitor: ele aceita as duas formas em
   * que o fundamento existe e trata `INDETERMINATE`/`AMBIGUOUS` como ausência.
   * Ler `classification.intent` aqui faria o enquadramento audiovisual usar um
   * "não concluí" como se fosse uma conclusão.
   */
  const intencao = radarDeclaredArticleIntent(article);
  const enquadramento = enquadramentos(intencao);
  /*
   * "NÃO CONCLUÍRAM" E "CONCLUÍRAM ALGO QUE EU NÃO SEI LER" SÃO A MESMA COISA
   * PARA QUEM OPERA — em ambos o enquadramento é o neutro, e em ambos isso
   * precisa ser dito. Calar o segundo faria a tela sugerir que a intenção do
   * artigo foi considerada quando ela só não foi reconhecida.
   */
  if (!enquadramento.reconhecida) {
    limitations.push(intencao
      ? `A intenção declarada ("${intencao}") não corresponde a nenhum enquadramento audiovisual conhecido; a pesquisa usou o padrão neutro.`
      : "O Arquiteto não fechou a classificação de intenção; o enquadramento audiovisual usou o padrão neutro.");
  }
  for (const modificador of enquadramento.modificadores) {
    acrescentar({
      text: `${modificador} ${principal}`,
      origin: "AUDIOVISUAL_FRAMING",
      sourceRef: principalKeyword?.identity.keywordId || null,
      reason: `Enquadramento que o YouTube premia para a intenção ${intencao || "não declarada"}: quem busca vídeo procura "${modificador}".`,
    });
  }

  for (const topico of editorialTopics) {
    const limpo = texto(topico);
    if (!limpo) continue;
    acrescentar({
      text: limpo,
      origin: "EDITORIAL_TOPIC",
      sourceRef: null,
      reason: "Tópico que o artigo precisa cobrir; procura quem já o explicou em vídeo.",
    });
  }

  for (const keyword of keywords) {
    if (keyword.identity.role === "principal") continue;
    const limpo = texto(keyword.identity.text);
    if (!limpo) continue;
    acrescentar({
      text: limpo,
      origin: "SECONDARY_KEYWORD",
      sourceRef: keyword.identity.keywordId,
      reason: `Keyword ${keyword.identity.role} do mesmo artigo: amplia o universo sem mudar o assunto.`,
    });
  }

  if (!editorialTopics.length) {
    limitations.push("A investigação não declarou tópicos editoriais; o plano não incluiu consultas por tópico.");
  }

  return { articleId: article.articleId, articleDnaVersionId: article.articleDnaVersionId, queries, limitations };
}
