import "server-only";

import type { DataForSeoSerpConfig } from "@/lib/minerador/dataforseo-serp-core";
import { executeDataForSeoSerpOperation, type DataForSeoSerpProviderDiagnostic } from "@/lib/server/dataforseo-serp-operation";
import { serpCacheObservationFromBody } from "@/lib/server/serp-cache-observation";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_CONTRACT_VERSION,
  buildSerpOrganicDigest,
  normalizeSerpCacheKeyword,
  pruneSerpBody,
  sameSerpCacheLens,
  serpCacheEntryServes,
  serpCacheSubjectId,
  trimSerpBodyToDepth,
  type SerpCacheMeta,
  type SerpCacheObservation,
  type SerpCacheQuery,
  type SerpOrganicDigest,
} from "@/lib/editorial/serp-cache";
import {
  readSerpCacheEntries,
  writeSerpCacheEntry,
  type SerpCacheContext,
  type SerpCacheReadMode,
  type SerpCacheWriteOutcome,
} from "@/lib/server/serp-cache-store";

/**
 * O CACHE DE SERP DO LADO DO SERVIDOR — quem decide o que é chamada paga.
 *
 * Dois passos, nesta ordem, em toda rota que usa SERP:
 *
 *   1. `lookupSerpCache` — separa os pedidos atendidos pelo cache dos que
 *      faltam. Vem ANTES de resolver credencial e quota: a quota recusa zero
 *      unidade, e com tudo em cache nem o Secret Store precisa ser lido.
 *   2. `collectAndCacheSerp` — só para os que faltaram: paga, poda, calcula
 *      a observação e grava. Uma falha ao gravar NÃO derruba quem chamou — a
 *      SERP já está na mão dele; o cache só não guardou desta vez.
 *
 * Numa falta, quem chama recebe o corpo CRU, exatamente como antes do cache.
 * Num acerto, recebe o corpo podado — provado equivalente nos três leitores
 * reais por `tests/serp-cache.test.mts`.
 */

export type SerpCacheRequest = {
  query: SerpCacheQuery;
  /** Quantos resultados quem pede precisa. */
  depth: number;
  /** A keyword do acervo, quando há uma: a entrada some junto com ela. */
  keywordId: string | null;
};

export type SerpCacheLookup = {
  request: SerpCacheRequest;
  subjectId: string;
  /** A entrada que atende, quando atende. `digest` só no modo `digest`, e só se gravado. */
  hit: { meta: SerpCacheMeta; observation?: SerpCacheObservation; body?: Record<string, unknown>; digest?: SerpOrganicDigest } | null;
  /** Por que não atendeu — ausente, vencida, outra lente… */
  missReason: string | null;
};

export async function lookupSerpCache(
  context: SerpCacheContext,
  requests: readonly SerpCacheRequest[],
  options: { mode: SerpCacheReadMode; now: Date; maxAgeMs?: number; refresh?: boolean },
): Promise<SerpCacheLookup[]> {
  const ids = requests.map(request => serpCacheSubjectId(request.query));
  // Recoleta explícita não lê nada: pagar de novo é a decisão.
  const gravadas = options.refresh ? new Map() : await readSerpCacheEntries(context, ids, options.mode);

  return requests.map((request, indice) => {
    const subjectId = ids[indice];
    if (options.refresh) return { request, subjectId, hit: null, missReason: "recoleta pedida" };
    const gravada = gravadas.get(subjectId);
    if (!gravada) return { request, subjectId, hit: null, missReason: "sem entrada" };
    const atende = serpCacheEntryServes(gravada.meta, {
      query: request.query, depth: request.depth, now: options.now, maxAgeMs: options.maxAgeMs,
    });
    if (!atende.serves) return { request, subjectId, hit: null, missReason: atende.reason };
    return {
      request,
      subjectId,
      hit: {
        meta: gravada.meta,
        ...(gravada.observation ? { observation: gravada.observation } : {}),
        // Entrada mais funda que o pedido: devolve como o provider teria devolvido.
        ...(gravada.body ? { body: gravada.meta.depth > request.depth ? trimSerpBodyToDepth(gravada.body, request.depth) : gravada.body } : {}),
        // O digest já é o top 10 de qualquer coleta: não há o que recortar.
        ...(gravada.digest ? { digest: gravada.digest } : {}),
      },
      missReason: null,
    };
  });
}

export type SerpCacheCollection = {
  /** O corpo CRU do provider — o mesmo que o chamador recebia antes do cache. */
  body: unknown;
  providerRequestId: string | null;
  /** O diagnóstico saneado da resposta, igual ao de `executeDataForSeoSerpOperation`. */
  diagnostic: DataForSeoSerpProviderDiagnostic;
  meta: SerpCacheMeta;
  /**
   * `null` quando o corpo não vira SERP (task recusada, status raiz inválido):
   * o motivo vai em `observationError`, e quem chama normaliza o corpo cru e
   * recebe o MESMO erro de antes do cache — com o diagnóstico já na mão.
   */
  observation: SerpCacheObservation | null;
  observationError: string | null;
  /**
   * O digest orgânico do corpo podado — o MESMO objeto que foi (ou seria)
   * gravado. `null` quando o corpo não vira SERP. Quem classifica a lente na
   * coleta lê daqui, e o acerto futuro lê o gravado: mesma entrada, mesma leitura.
   */
  digest: SerpOrganicDigest | null;
  /**
   * O que aconteceu com a gravação. `failed` não derruba ninguém; `skipped` é
   * corpo que não se grava — recusado pelo provider ou sem nenhum orgânico;
   * `kept` é gravação sem corpo que preservou a entrada com corpo ainda válida.
   */
  write: SerpCacheWriteOutcome | "failed" | "skipped";
  writeError: string | null;
};

/**
 * Paga a SERP de UM pedido que faltou, e deixa gravada para os próximos.
 *
 * Localidade e idioma vêm da CONSULTA, não da config: o Minerador consulta com
 * o idioma do alvo, o Arquiteto com o da config — a chave é o que foi enviado.
 */
export async function collectAndCacheSerp(
  context: SerpCacheContext,
  request: SerpCacheRequest,
  options: {
    config: DataForSeoSerpConfig;
    operationRequestId: string;
    collectedBy: SerpCacheMeta["collectedBy"];
    now: Date;
    /**
     * `false` grava só `meta` + `observation`: é a lente sem leitor de corpo.
     * Quem chama continua recebendo o corpo CRU — só o banco não o guarda.
     * Padrão `true`: todo chamador anterior grava como antes.
     */
    storeBody?: boolean;
    /**
     * Grava o digest orgânico (`payload.digest`). Padrão: em toda lente que não
     * é a canônica — é o que o Minerador classifica nelas. A canônica guarda o
     * corpo, e duplicar o top 10 ao lado dele só custaria banco.
     */
    storeDigest?: boolean;
    /**
     * Os mesmos ganchos de `executeDataForSeoSerpOperation`: quem monta
     * diagnóstico da chamada continua recebendo cada etapa. `fetchImpl`
     * permite testar sem gastar crédito.
     */
    provider?: {
      fetchImpl?: typeof fetch;
      onRequestBuilt?: () => void;
      onRequestStarted?: () => void;
      onHttpResponse?: (status: number) => void;
    };
  },
): Promise<SerpCacheCollection> {
  const { query } = request;
  const resposta = await executeDataForSeoSerpOperation({
    keyword: query.keyword,
    locationCode: query.locationCode,
    languageCode: query.languageCode,
    device: query.lens.device,
    operatingSystem: query.lens.operatingSystem,
    resultLimit: request.depth,
    operationRequestId: options.operationRequestId,
    payloadDepth: query.endpoint,
  }, { config: options.config, ...(options.provider || {}) });

  const meta: SerpCacheMeta = {
    keyword: query.keyword,
    normalizedKeyword: normalizeSerpCacheKeyword(query.keyword),
    locationCode: query.locationCode,
    languageCode: query.languageCode.trim().toLowerCase(),
    lens: query.lens,
    endpoint: query.endpoint,
    depth: request.depth,
    collectedAt: options.now.toISOString(),
    providerRequestId: resposta.providerRequestId,
    keywordId: request.keywordId,
    collectedBy: options.collectedBy,
  };
  const podado = pruneSerpBody(resposta.body);
  /*
   * A normalização recusa corpo de task falha. Lançar aqui apagaria o
   * diagnóstico do provider que quem chama registra — então a recusa vira
   * `observation: null` e o corpo cru segue para quem chama, como antes.
   */
  let observation: SerpCacheObservation | null = null;
  let observationError: string | null = null;
  try {
    observation = serpCacheObservationFromBody(podado, meta);
  } catch (error) {
    observationError = error instanceof Error ? error.message : "a resposta do provider não é uma SERP";
  }
  // Do mesmo corpo podado que vai ao banco: a coleta e o acerto leem o mesmo digest.
  const digest = observation ? buildSerpOrganicDigest(podado) : null;

  /*
   * Só se grava SERP de verdade. Corpo recusado nunca; SERP sem nenhum
   * orgânico também não — uma resposta vazia transitória serviria de acerto
   * por 30 dias a todos os módulos, e pagar de novo custa uma chamada.
   */
  if (!observation || observation.organicCount === 0) {
    return { body: resposta.body, providerRequestId: resposta.providerRequestId, diagnostic: resposta.diagnostic, meta, observation, observationError, digest, write: "skipped", writeError: null };
  }

  const guardaDigest = options.storeDigest ?? !sameSerpCacheLens(query.lens, SERP_CACHE_CANONICAL_LENS);
  let write: SerpCacheCollection["write"] = "failed";
  let writeError: string | null = null;
  try {
    write = await writeSerpCacheEntry(context, {
      contractVersion: SERP_CACHE_CONTRACT_VERSION,
      meta,
      observation,
      // Sem corpo, o store nunca troca por esta uma entrada com corpo que ainda vale (`kept`).
      ...(options.storeBody === false ? {} : { body: podado }),
      ...(guardaDigest && digest ? { digest } : {}),
    });
  } catch (error) {
    writeError = error instanceof Error ? error.message : "falha ao gravar o cache de SERP";
  }

  return { body: resposta.body, providerRequestId: resposta.providerRequestId, diagnostic: resposta.diagnostic, meta, observation, observationError, digest, write, writeError };
}

/** Quantos pedidos de uma lista vão virar chamada paga. */
export const serpCacheMisses = (lookups: readonly SerpCacheLookup[]) => lookups.filter(item => !item.hit);
