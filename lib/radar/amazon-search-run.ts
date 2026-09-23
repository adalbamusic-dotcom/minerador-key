/**
 * ===== A CORRIDA DA AMAZON — AMAZON_SEARCH_1 · §16, §18 e §20 =====
 *
 * Mesma disciplina da corrida de YouTube: a coleta é gravada ANTES da chamada,
 * o estado distingue "coletando" de "falhou" de "vazia", e a proveniência diz
 * o que foi pedido e o que o provider respondeu.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";
import { RadarAmazonRelatedSearchSchema, RadarAmazonSerpResultSchema, RadarAmazonUniverseEntrySchema, radarAmazonUniverseCounts, type RadarAmazonUniverseEntry } from "./amazon-search-model.ts";
import { radarAmazonTargetQueries, type RadarAmazonEditorialIntent, type RadarAmazonResearchTarget } from "./amazon-editorial-target.ts";

export const RADAR_AMAZON_PROVIDER_ENDPOINT = "/v3/merchant/amazon/products/live/advanced" as const;

/* ========================= §16 · o plano de consultas ========================= */

/**
 * O PLANO É DETERMINÍSTICO E PEQUENO — de propósito.
 *
 * O YouTube ganhou enquadramentos audiovisuais porque a intenção declarada
 * sustentava recortes diferentes de vídeo. A Amazon não tem equivalente: uma
 * busca de produto não vira "tutorial de produto" nem "review de produto" sem
 * mudar o que se está procurando.
 *
 * Então começa com a keyword principal, e só. Fan-out aqui seria gastar
 * chamadas para descobrir se valia a pena — e o preço de descobrir é o mesmo
 * de acertar.
 */
export const RADAR_AMAZON_MAX_QUERIES = 3;

export const RadarAmazonQuerySchema = z.object({
  queryId: z.string().min(1),
  text: z.string().min(1),
  origin: z.enum(["PRIMARY_KEYWORD", "ARTICLE_TOPIC"]),
  reason: z.string().min(1),
  executed: z.boolean().default(false),
  resultCount: z.number().int().nonnegative().default(0),
  failureReason: z.string().nullable().default(null),
  checkUrl: z.string().nullable().default(null),
  seResultsCount: z.number().int().nonnegative().nullable().default(null),
  itemsCount: z.number().int().nonnegative().nullable().default(null),
}).strict();
export type RadarAmazonQuery = z.infer<typeof RadarAmazonQuerySchema>;

/** Identidade estável da consulta: o mesmo texto produz o mesmo id. */
export function radarAmazonQueryId(texto: string): string {
  const limpo = texto.trim().toLowerCase().replace(/\s+/g, " ");
  let hash = 0x811c9dc5;
  for (let indice = 0; indice < limpo.length; indice += 1) {
    hash ^= limpo.charCodeAt(indice);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `amzq:${hash.toString(16).padStart(8, "0")}`;
}

export type RadarAmazonQueryPlan = {
  articleId: string;
  articleDnaVersionId: string;
  queries: RadarAmazonQuery[];
  limitations: string[];
};

export function buildRadarAmazonQueryPlan(input: {
  articleId: string;
  articleDnaVersionId: string;
  primaryKeyword: string | null;
  /**
   * ===== §21 · O ALVO MANDA NA CONSULTA — AMAZON_EDITORIAL_TARGET_1 =====
   *
   * Até aqui o plano era SEMPRE a keyword principal do ArticleDNA. Num review
   * isso é quase garantia de amostra errada: "skin care nivea" devolve a
   * prateleira da marca inteira, e o produto que o artigo vai avaliar pode não
   * estar entre os vinte primeiros.
   *
   * Opcional porque o campo é aditivo: artigo anterior a este gate não tem alvo
   * declarado, e continua pesquisando pela keyword como sempre pesquisou.
   */
  setup?: { intent: RadarAmazonEditorialIntent; target: RadarAmazonResearchTarget } | null;
}): RadarAmazonQueryPlan {
  const limitations: string[] = [];
  const principal = (input.primaryKeyword || "").trim();

  if (input.setup) {
    const consultas = radarAmazonTargetQueries({
      intent: input.setup.intent,
      target: input.setup.target,
      primaryKeyword: input.primaryKeyword,
    });

    if (consultas.length) {
      return {
        articleId: input.articleId,
        articleDnaVersionId: input.articleDnaVersionId,
        queries: consultas.map(consulta => RadarAmazonQuerySchema.parse({
          queryId: radarAmazonQueryId(consulta.text),
          text: consulta.text,
          /*
           * A ORIGEM DO ALVO NÃO CABE NO ENUM DA CORRIDA, e forçá-la lá
           * mudaria um contrato gravado para registrar uma distinção que o
           * MOTIVO já carrega em português.
           */
          origin: "PRIMARY_KEYWORD",
          reason: consulta.reason,
        })),
        limitations,
      };
    }

    /*
     * ALVO DECLARADO E INCOMPLETO NÃO CAI NA KEYWORD EM SILÊNCIO.
     *
     * Cair seria pesquisar outra coisa com a aparência de ter pesquisado a
     * pedida — e a pessoa só descobriria depois de pagar, olhando uma amostra
     * que não fala do produto que ela escolheu.
     */
    limitations.push("O alvo editorial da Amazon está declarado e incompleto; nenhuma consulta foi montada a partir dele.");
    return { articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId, queries: [], limitations };
  }

  /*
   * SEM KEYWORD PRINCIPAL NÃO HÁ PESQUISA — e isso é ausência declarada.
   *
   * §17 proíbe cair no título como reserva silenciosa: o título é promessa
   * editorial, não formulação de busca, e a SERP voltaria de outra intenção.
   */
  if (!principal) {
    limitations.push("A keyword principal deste artigo não foi resolvida; sem ela não há consulta para pesquisar na Amazon.");
    return { articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId, queries: [], limitations };
  }

  return {
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    queries: [RadarAmazonQuerySchema.parse({
      queryId: radarAmazonQueryId(principal),
      text: principal,
      origin: "PRIMARY_KEYWORD",
      reason: "A keyword principal do artigo, como as pessoas a digitam na loja.",
    })],
    limitations,
  };
}

/* ============================ a corrida ============================ */

export const RADAR_AMAZON_RUN_STATES = ["COLLECTING", "COLLECTED", "COLLECTION_FAILED"] as const;
export type RadarAmazonRunState = typeof RADAR_AMAZON_RUN_STATES[number];

export const RadarAmazonRunFingerprintSchema = z.object({
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  queryIds: z.array(z.string().min(1)),
  signature: z.string().min(1),
}).strict();

export function buildRadarAmazonRunFingerprint(input: {
  articleId: string;
  articleDnaVersionId: string;
  queryIds: readonly string[];
}) {
  const base = `${input.articleId}|${input.articleDnaVersionId}|${[...input.queryIds].sort().join(",")}`;
  let hash = 0x811c9dc5;
  for (let indice = 0; indice < base.length; indice += 1) {
    hash ^= base.charCodeAt(indice);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return RadarAmazonRunFingerprintSchema.parse({
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    queryIds: [...input.queryIds],
    signature: `amzf:${hash.toString(16).padStart(8, "0")}`,
  });
}

export const RadarAmazonProvenanceSchema = z.object({
  provider: z.literal("dataforseo"),
  endpoint: z.string().min(1),
  locationCode: z.number().int().nullable().default(null),
  /** §13 · a grafia REALMENTE enviada. Gravar `pt-br` aqui mentiria sobre a chamada. */
  languageCode: z.string().nullable().default(null),
  seDomain: z.string().nullable().default(null),
  depth: z.number().int().positive().nullable().default(null),
  /**
   * R5 · O APARELHO QUE O PROVIDER ECOOU — lente única, declarada.
   *
   * O pedido não manda aparelho; a DataForSEO devolve o que executou
   * (`desktop`/`windows` por padrão). É o eco, não uma escolha nossa e não a
   * prova de que o aparelho muda a prateleira. OPCIONAL, sem default: corrida
   * gravada antes não ganha chave, e `null` numa corrida nova diz que a
   * resposta não declarou.
   */
  device: z.string().nullable().optional(),
  os: z.string().nullable().optional(),
  queriesRequested: z.number().int().nonnegative(),
  queriesSucceeded: z.number().int().nonnegative(),
  queriesFailed: z.number().int().nonnegative(),
  failures: z.array(z.object({ queryId: z.string().min(1), reason: z.string().min(1) }).strict()).default([]),
  collectedAt: z.string().min(1),
}).strict();

export const RadarAmazonSearchRunSchema = z.object({
  researchMode: z.literal("AMAZON"),
  runId: z.string().min(1),
  runVersion: z.number().int().positive(),
  startedAt: z.string().min(1),
  startedBy: z.string().min(1),
  state: z.enum(RADAR_AMAZON_RUN_STATES),
  fingerprint: RadarAmazonRunFingerprintSchema,
  provenance: RadarAmazonProvenanceSchema,
  queries: z.array(RadarAmazonQuerySchema),
  results: z.array(RadarAmazonSerpResultSchema),
  universe: z.array(RadarAmazonUniverseEntrySchema),
  /** §5 · buscas relacionadas, que não são categoria. */
  relatedSearches: z.array(RadarAmazonRelatedSearchSchema).default([]),
  limitations: z.array(z.string()).default([]),
}).strict();
export type RadarAmazonSearchRun = z.infer<typeof RadarAmazonSearchRunSchema>;

export function buildRadarAmazonSearchRun(input: {
  runId: string;
  runVersion: number;
  startedAt: string;
  startedBy: string;
  fingerprint: z.infer<typeof RadarAmazonRunFingerprintSchema>;
  provenance: z.input<typeof RadarAmazonProvenanceSchema>;
  queries: readonly z.input<typeof RadarAmazonQuerySchema>[];
  results: readonly z.input<typeof RadarAmazonSerpResultSchema>[];
  universe: readonly RadarAmazonUniverseEntry[];
  relatedSearches?: readonly z.input<typeof RadarAmazonRelatedSearchSchema>[];
  limitations?: readonly string[];
}): RadarAmazonSearchRun {
  /*
   * §15 · COLETA SEM NENHUMA CONSULTA RESPONDIDA NÃO É COLETA VAZIA.
   *
   * As duas terminam com universo zerado, e a tela precisa dizer coisas
   * diferentes: "a Amazon não tem produto para esta busca" e "não conseguimos
   * perguntar" pedem ações opostas de quem opera.
   */
  const state: RadarAmazonRunState = input.provenance.queriesSucceeded > 0 ? "COLLECTED" : "COLLECTION_FAILED";

  return RadarAmazonSearchRunSchema.parse({
    researchMode: "AMAZON",
    runId: input.runId,
    runVersion: input.runVersion,
    startedAt: input.startedAt,
    startedBy: input.startedBy,
    state,
    fingerprint: input.fingerprint,
    provenance: input.provenance,
    queries: input.queries,
    results: input.results,
    universe: input.universe,
    relatedSearches: input.relatedSearches || [],
    limitations: input.limitations || [],
  });
}

export function buildRadarAmazonStartedRun(input: {
  runId: string;
  runVersion: number;
  startedAt: string;
  startedBy: string;
  fingerprint: z.infer<typeof RadarAmazonRunFingerprintSchema>;
  queries: readonly z.input<typeof RadarAmazonQuerySchema>[];
  endpoint: string;
  limitations?: readonly string[];
}): RadarAmazonSearchRun {
  return RadarAmazonSearchRunSchema.parse({
    researchMode: "AMAZON",
    runId: input.runId,
    runVersion: input.runVersion,
    startedAt: input.startedAt,
    startedBy: input.startedBy,
    state: "COLLECTING",
    fingerprint: input.fingerprint,
    provenance: {
      provider: "dataforseo",
      endpoint: input.endpoint,
      queriesRequested: input.queries.length,
      queriesSucceeded: 0,
      queriesFailed: 0,
      failures: [],
      collectedAt: input.startedAt,
    },
    queries: input.queries,
    results: [],
    universe: [],
    relatedSearches: [],
    limitations: input.limitations || [],
  });
}

/** §22 · a linha que a aba mostra. Sem hash, sem id. */
export function radarAmazonRunSummary(run: RadarAmazonSearchRun | null) {
  if (!run) return null;
  const contagem = radarAmazonUniverseCounts(run.universe);
  const executadas = run.queries.filter(item => item.executed).length;
  const stateLabel = run.state === "COLLECTED" ? "Coleta concluída"
    : run.state === "COLLECTING" ? "Coletando produtos…"
      : "Coleta falhou";

  return {
    queries: run.queries.length,
    queriesExecuted: executadas,
    ...contagem,
    stateLabel,
    headline: [
      `${executadas} consulta(s)`,
      `${contagem.total} produto(s)`,
      `${contagem.organic} orgânico(s)`,
      `${contagem.sponsored} patrocinado(s)`,
      stateLabel,
    ].join(" · "),
  };
}

export const radarAmazonResetPatch = () => ({ amazonSearch: null });
