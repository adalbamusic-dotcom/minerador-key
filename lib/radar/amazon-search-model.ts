/**
 * ===== O UNIVERSO COMPETITIVO DA AMAZON — AMAZON_SEARCH_1 · §6 a §8 =====
 *
 * ================== SÓ O QUE A SERP REALMENTE ENTREGA ==================
 *
 * A descoberta do AMAZON_SEARCH_0 mediu o payload real e o resultado foi menor
 * do que a documentação sugeria. Não existe marca, vendedor, categoria,
 * atributo, descrição nem texto de avaliação — e `labels` chega sempre nulo.
 *
 * Este modelo carrega o que foi OBSERVADO, e nada além. Um campo opcional
 * "para quando houver" seria um convite a preenchê-lo com heurística, e a
 * heurística chega ao Planejador com a mesma aparência de coleta.
 *
 * ========================= A IDENTIDADE É O ASIN =========================
 *
 * A URL da Amazon carrega `crid`, `qid` e um blob `dib` que mudam a cada
 * coleta. Deduplicar por URL faria o mesmo produto contar duas vezes entre duas
 * consultas — e "esta marca aparece três vezes" passaria a medir quantas buscas
 * foram feitas.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";

/* ================== §8 · orgânico e patrocinado ================== */

/**
 * DE ONDE O ITEM VEIO NA PÁGINA — e isto é o TIPO do item, não um palpite.
 *
 * O provider separa `amazon_serp` de `amazon_paid` e os dois carregam campos
 * idênticos. Inferir patrocínio por texto ("Patrocinado" no título) seria
 * adivinhar o que já vem dito.
 */
export const RADAR_AMAZON_PLACEMENTS = ["ORGANIC", "SPONSORED"] as const;
export const RadarAmazonPlacementSchema = z.enum(RADAR_AMAZON_PLACEMENTS);
export type RadarAmazonPlacement = typeof RADAR_AMAZON_PLACEMENTS[number];

export const RADAR_AMAZON_PLACEMENT_LABELS: Record<RadarAmazonPlacement, string> = {
  ORGANIC: "orgânico",
  SPONSORED: "patrocinado",
};

/* ===================== §6 · um resultado da SERP ===================== */

export const RadarAmazonSerpResultSchema = z.object({
  /** §7 · a identidade. `data_asin` no payload, presente em 100% dos itens. */
  asin: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  imageUrl: z.string().nullable().default(null),
  domain: z.string().nullable().default(null),

  placement: RadarAmazonPlacementSchema,
  rankGroup: z.number().int().nonnegative().nullable().default(null),
  rankAbsolute: z.number().int().nonnegative().nullable().default(null),

  /**
   * §9 · SÓ O PREÇO ATUAL.
   *
   * `price_to` chegou sempre nulo na amostra real e `original_price` não
   * existe. Sem preço anterior não há desconto calculável: derivar um seria
   * inventar a economia que o artigo prometeria ao leitor.
   */
  priceFrom: z.number().nonnegative().nullable().default(null),
  currency: z.string().nullable().default(null),

  /**
   * `special_offers` é ARRAY DE STRING: `["R$ 10,00", "off"]`. Não é número,
   * não é percentual e não é par estruturado. Fica como texto observado até
   * existir regra comprovada para lê-lo.
   */
  offerText: z.array(z.string().min(1)).default([]),

  ratingValue: z.number().nullable().default(null),
  ratingVotes: z.number().int().nonnegative().nullable().default(null),
  ratingMax: z.number().nullable().default(null),

  isAmazonChoice: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  boughtPastMonth: z.number().int().nonnegative().nullable().default(null),

  /** Frase em português para humano. `delivery_price` nunca veio preenchido. */
  deliveryMessage: z.string().nullable().default(null),

  /** A consulta que encontrou este item. */
  queryId: z.string().min(1),
}).strict();
export type RadarAmazonSerpResult = z.infer<typeof RadarAmazonSerpResultSchema>;

/* ============== §5 · buscas relacionadas, que não são categoria ============== */

/**
 * O QUE `related_searches` É — e o que ele não é.
 *
 * São consultas comerciais vizinhas, como a Amazon as sugere. Mapeá-las para
 * "categorias" daria a elas uma autoridade taxonômica que não têm: "protetor
 * solar" ao lado de "protetor solar facial" é reformulação de busca, não um
 * departamento da loja.
 *
 * CATEGORIA continua não suportada pela fonte primária, e é assim que fica
 * declarado.
 */
export const RadarAmazonRelatedSearchSchema = z.object({
  term: z.string().min(1),
  rankAbsolute: z.number().int().nonnegative().nullable().default(null),
  queryId: z.string().min(1),
}).strict();
export type RadarAmazonRelatedSearch = z.infer<typeof RadarAmazonRelatedSearchSchema>;

/* ==================== §7 · o universo, deduplicado ==================== */

export const RadarAmazonUniverseEntrySchema = RadarAmazonSerpResultSchema
  .omit({ queryId: true, placement: true, rankGroup: true, rankAbsolute: true })
  .extend({
    /**
     * ONDE ESTE PRODUTO APARECEU — e ele pode ter aparecido nos dois lugares.
     *
     * O mesmo ASIN pode vir como orgânico numa consulta e patrocinado noutra.
     * Escolher um dos dois apagaria metade do que a página mostra: uma marca
     * que ranqueia E compra anúncio para a mesma busca está dizendo algo que
     * nenhuma das duas metades diz sozinha.
     */
    placements: z.array(RadarAmazonPlacementSchema).min(1),
    /** A melhor posição alcançada como ORGÂNICO. `null` se nunca foi orgânico. */
    bestOrganicRank: z.number().int().positive().nullable().default(null),
    bestSponsoredRank: z.number().int().positive().nullable().default(null),
    /** Todas as ocorrências, para a recorrência ser conferível. */
    occurrences: z.array(z.object({
      queryId: z.string().min(1),
      placement: RadarAmazonPlacementSchema,
      rankAbsolute: z.number().int().nonnegative().nullable(),
    }).strict()).default([]),
    queriesFoundIn: z.array(z.string().min(1)).default([]),
    occurrenceCount: z.number().int().positive(),
  }).strict();
export type RadarAmazonUniverseEntry = z.infer<typeof RadarAmazonUniverseEntrySchema>;

const primeiroNaoNulo = <T>(atual: T | null, novo: T | null): T | null => atual ?? novo;

/**
 * O UNIVERSO A PARTIR DOS RESULTADOS — uma identidade por ASIN.
 *
 * A ordem é a da melhor posição orgânica, porque é ela que descreve a disputa
 * que não foi comprada. Produto só patrocinado vai para o fim — visível, e sem
 * fingir que ranqueou.
 */
export function buildRadarAmazonUniverse(
  resultados: readonly RadarAmazonSerpResult[],
): RadarAmazonUniverseEntry[] {
  const porAsin = new Map<string, {
    base: RadarAmazonSerpResult;
    placements: Set<RadarAmazonPlacement>;
    ocorrencias: Array<{ queryId: string; placement: RadarAmazonPlacement; rankAbsolute: number | null }>;
    consultas: string[];
    melhorOrganico: number | null;
    melhorPatrocinado: number | null;
  }>();

  for (const item of resultados) {
    const atual = porAsin.get(item.asin);
    if (!atual) {
      porAsin.set(item.asin, {
        base: item,
        placements: new Set([item.placement]),
        ocorrencias: [{ queryId: item.queryId, placement: item.placement, rankAbsolute: item.rankAbsolute }],
        consultas: [item.queryId],
        melhorOrganico: item.placement === "ORGANIC" ? item.rankAbsolute : null,
        melhorPatrocinado: item.placement === "SPONSORED" ? item.rankAbsolute : null,
      });
      continue;
    }

    atual.placements.add(item.placement);
    atual.ocorrencias.push({ queryId: item.queryId, placement: item.placement, rankAbsolute: item.rankAbsolute });
    if (!atual.consultas.includes(item.queryId)) atual.consultas.push(item.queryId);

    if (item.placement === "ORGANIC" && item.rankAbsolute !== null) {
      atual.melhorOrganico = atual.melhorOrganico === null ? item.rankAbsolute : Math.min(atual.melhorOrganico, item.rankAbsolute);
    }
    if (item.placement === "SPONSORED" && item.rankAbsolute !== null) {
      atual.melhorPatrocinado = atual.melhorPatrocinado === null ? item.rankAbsolute : Math.min(atual.melhorPatrocinado, item.rankAbsolute);
    }

    /*
     * O QUE FALTA NUMA OCORRÊNCIA, OUTRA COMPLETA — preservando a PRIMEIRA.
     *
     * O item patrocinado às vezes vem sem preço; o orgânico do mesmo ASIN traz.
     * Mesclar recupera o dado sem inventá-lo, e manter o primeiro valor impede
     * que a última ocorrência sobrescreva a leitura de quem chegou antes.
     */
    atual.base = {
      ...atual.base,
      imageUrl: primeiroNaoNulo(atual.base.imageUrl, item.imageUrl),
      domain: primeiroNaoNulo(atual.base.domain, item.domain),
      priceFrom: primeiroNaoNulo(atual.base.priceFrom, item.priceFrom),
      currency: primeiroNaoNulo(atual.base.currency, item.currency),
      offerText: atual.base.offerText.length ? atual.base.offerText : item.offerText,
      ratingValue: primeiroNaoNulo(atual.base.ratingValue, item.ratingValue),
      ratingVotes: primeiroNaoNulo(atual.base.ratingVotes, item.ratingVotes),
      ratingMax: primeiroNaoNulo(atual.base.ratingMax, item.ratingMax),
      boughtPastMonth: primeiroNaoNulo(atual.base.boughtPastMonth, item.boughtPastMonth),
      deliveryMessage: primeiroNaoNulo(atual.base.deliveryMessage, item.deliveryMessage),
      isAmazonChoice: atual.base.isAmazonChoice || item.isAmazonChoice,
      isBestSeller: atual.base.isBestSeller || item.isBestSeller,
    };
  }

  const entradas = [...porAsin.values()].map(item => RadarAmazonUniverseEntrySchema.parse({
    asin: item.base.asin,
    title: item.base.title,
    url: item.base.url,
    imageUrl: item.base.imageUrl,
    domain: item.base.domain,
    priceFrom: item.base.priceFrom,
    currency: item.base.currency,
    offerText: item.base.offerText,
    ratingValue: item.base.ratingValue,
    ratingVotes: item.base.ratingVotes,
    ratingMax: item.base.ratingMax,
    isAmazonChoice: item.base.isAmazonChoice,
    isBestSeller: item.base.isBestSeller,
    boughtPastMonth: item.base.boughtPastMonth,
    deliveryMessage: item.base.deliveryMessage,
    placements: [...item.placements].sort(),
    bestOrganicRank: item.melhorOrganico,
    bestSponsoredRank: item.melhorPatrocinado,
    occurrences: item.ocorrencias,
    queriesFoundIn: item.consultas,
    occurrenceCount: item.ocorrencias.length,
  }));

  return entradas.sort((esquerda, direita) => {
    const rankEsquerda = esquerda.bestOrganicRank ?? Number.MAX_SAFE_INTEGER;
    const rankDireita = direita.bestOrganicRank ?? Number.MAX_SAFE_INTEGER;
    if (rankEsquerda !== rankDireita) return rankEsquerda - rankDireita;
    return (esquerda.bestSponsoredRank ?? Number.MAX_SAFE_INTEGER) - (direita.bestSponsoredRank ?? Number.MAX_SAFE_INTEGER);
  });
}

/**
 * ============ §8 · A CONTAGEM QUE SEPARA DISPUTA DE COMPRA ============
 *
 * Patrocinado não entra em recorrência orgânica. "Esta marca aparece em toda
 * página" descreveria quem pagou mais, não quem o algoritmo escolheu — e é o
 * tipo de leitura que um artigo repetiria como se fosse mérito do produto.
 */
export function radarAmazonUniverseCounts(universo: readonly RadarAmazonUniverseEntry[]) {
  const organicos = universo.filter(item => item.placements.includes("ORGANIC"));
  const patrocinados = universo.filter(item => item.placements.includes("SPONSORED"));
  return {
    total: universo.length,
    organic: organicos.length,
    sponsored: patrocinados.length,
    /* Quem faz as duas coisas pela mesma busca — sinal comercial próprio. */
    both: universo.filter(item => item.placements.length > 1).length,
    withPrice: universo.filter(item => item.priceFrom !== null).length,
    withRating: universo.filter(item => item.ratingValue !== null).length,
    amazonChoice: universo.filter(item => item.isAmazonChoice).length,
    bestSeller: universo.filter(item => item.isBestSeller).length,
  };
}
