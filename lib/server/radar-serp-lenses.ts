import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DataForSeoSerpError, type DataForSeoSerpConfig } from "../minerador/dataforseo-serp-core.ts";
import { DataForSeoTargetingError, resolveDataForSeoTargeting } from "../minerador/dataforseo-targeting.ts";
import {
  SERP_CACHE_CANONICAL_LENS,
  SERP_CACHE_LENSES,
  pruneSerpBody,
  sameSerpCacheLens,
  trimSerpBodyToDepth,
  type SerpCacheLens,
  type SerpCacheMeta,
} from "../editorial/serp-cache.ts";
import { isCanonicalUuid } from "../radar/identifiers.ts";
import { SerpResearchSnapshotSchema, type SerpResearchSnapshot, type SerpSearchInput } from "../radar/serp/contracts.ts";
import {
  RADAR_SERP_CANONICAL_COLLECTION_DEPTH,
  RADAR_SERP_EXTRA_LENS_DEPTH,
  RADAR_SERP_MAX_AGE_MS,
  RADAR_SERP_NO_ORGANIC_REASON,
  RADAR_SERP_SNAPSHOT_DEPTH,
  buildRadarSerpLensSet,
  normalizeRadarSerpInstant,
  radarSerpLensHashParts,
  radarSerpLensLabel,
  radarSerpLensSetMatchesCache,
  radarSerpMissingLens,
  radarSerpObservedLens,
  radarSerpReusableLensGap,
  type RadarSerpCodesSource,
  type RadarSerpLensEntry,
  type RadarSerpLensLabel,
  type RadarSerpLensSet,
} from "../radar/serp/lens-set.ts";
import { normalizeDataForSeoSerpResponse } from "./dataforseo-serp-normalizer.ts";
import { serpCacheObservationFromBody } from "./serp-cache-observation.ts";
import { collectAndCacheSerp, lookupSerpCache, type SerpCacheCollection, type SerpCacheLookup, type SerpCacheRequest } from "./serp-cache.ts";
import type { SerpCacheContext } from "./serp-cache-store.ts";
import type { IntegrationResolvedResource, RecordIntegrationUsageInput } from "./integrations-runtime.ts";

/**
 * O NÚCLEO DA SERP DO RADAR NAS QUATRO LENTES — SDD do Radar, R2.
 *
 * Uma função, chamada pelas três portas do Google no Radar — a SERP canônica
 * do artigo, a pesquisa auxiliar e o apoio da Amazon (R4): a regra das lentes
 * mora aqui e não em cópias. A auxiliar chama sem snapshot anterior e não
 * grava o resultado como snapshot do artigo; o apoio só chama quando o artigo
 * ainda não tem SERP real.
 *
 * A ordem é a do cache (SDD do cache, §2), e ela é a garantia de custo:
 *
 *   1. CACHE PRIMEIRO. Uma leitura leve (meta + observação, ~1 KB por lente)
 *      das quatro lentes. Se o snapshot anterior copiou exatamente as mesmas
 *      coletas, "Atualizar SERP" termina aqui: sem corpo, sem credencial.
 *   2. O corpo da canônica, só quando ela está no cache e o atalho não serviu.
 *   3. SÓ ENTÃO credencial e quota, com `quotaUnits` = lentes faltantes. A
 *      canônica é paga em 20 (a CALL 3 do Minerador não paga de novo); as
 *      extras em 10, sem corpo, com o digest que o núcleo do cache grava.
 *      Quem paga grava com `collectedBy: "radar"`.
 *   4. A normalização sai SEMPRE do mesmo recorte — `trimSerpBodyToDepth(
 *      pruneSerpBody(corpo), 10)` —, venha o corpo do cache ou da coleta: o
 *      mesmo corpo dá o mesmo snapshot e o mesmo hash.
 *   5. Hash igual ao do snapshot anterior não abre versão: devolve o anterior.
 *
 * Uma lente extra que falha vira lacuna DECLARADA e não derruba a canônica.
 * A canônica que falha derruba a coleta com o mesmo erro de antes do cache.
 */

export type RadarSerpTargetCodes = { locationCode: number; languageCode: string };

export type RadarSerpLensDeps = {
  /** Credencial e quota, resolvidas só com faltantes. `quotaUnits` = chamadas que serão pagas. */
  resolveConfig: (quotaUnits: number) => Promise<{ config: DataForSeoSerpConfig; resource: IntegrationResolvedResource }>;
  /** Um registro de uso por chamada paga. Acerto de cache não registra. */
  recordUsage: (input: RecordIntegrationUsageInput) => Promise<unknown>;
  /** Só para teste: o provider falso. */
  fetchImpl?: typeof fetch;
};

export type RadarSerpLensCollectionInput = {
  context: SerpCacheContext;
  /** O pedido do artigo. Lente, janela e endpoint são decididos aqui, não por quem chama. */
  searchInput: SerpSearchInput;
  codes: RadarSerpTargetCodes;
  /** De onde vieram os códigos — gravado na proveniência do snapshot. */
  codesSource?: RadarSerpCodesSource;
  /** A keyword do acervo da marca, quando é uma: a entrada de cache some junto com ela. */
  cacheKeywordId: string | null;
  /** O último snapshot real do artigo — a referência de "sem mudança". */
  previous: SerpResearchSnapshot | null;
  /** "Recoletar agora (pago)": nenhuma leitura de cache, as quatro lentes pagas. */
  recollect: boolean;
  now: Date;
  maxAgeMs?: number;
  operationRequestId: string;
  /**
   * R4 · qual das três portas chamou. Muda só o registro de uso (tipo da
   * operação e chave de idempotência): a regra das lentes é uma só.
   *   canonical  a SERP do artigo ("Atualizar SERP"), padrão;
   *   auxiliary  a pesquisa de uma secundária ou do reforço (não vira snapshot);
   *   support    o apoio do Google a um artigo de Amazon.
   */
  purpose?: RadarSerpLensPurpose;
  /** Metadados a mais no registro de uso — a keyword da auxiliar, o papel do apoio. */
  usageMetadata?: Record<string, string | number | null>;
};

export type RadarSerpLensPurpose = "canonical" | "auxiliary" | "support";

/*
 * O registro de uso de cada porta, com os prefixos que ela já usava antes das
 * lentes — agora com a lente no fim. A recoleta paga só existe na canônica.
 */
const USO_POR_PORTA: Record<RadarSerpLensPurpose, { operationKind: string; prefixo: string }> = {
  canonical: { operationKind: "serp", prefixo: "dataforseo:radar:serp" },
  auxiliary: { operationKind: "serp_auxiliary", prefixo: "dataforseo:radar:serp-auxiliar" },
  support: { operationKind: "serp_support", prefixo: "dataforseo:radar:support" },
};

export type RadarSerpLensCollection = {
  /** O snapshot novo — ou o ANTERIOR, quando nada mudou. */
  research: SerpResearchSnapshot;
  unchanged: boolean;
  /** `cache_meta`: as mesmas coletas no cache, sem ler corpo; `content_hash`: normalizado e igual. */
  unchangedBy: "cache_meta" | "content_hash" | null;
  paidCalls: number;
  cacheHits: number;
  /** A leitura do cache falhou: toda lente virou falta e foi paga. A rota diz isso na resposta. */
  cacheReadFailed: boolean;
  /** Lacunas definitivas copiadas do snapshot anterior, sem pagar de novo. */
  reusedLensGaps: number;
};

/* ------------------------------ os códigos ------------------------------ */

/** A coluna estreita: só o targeting da última medição, nunca a `analise_semantica` inteira. */
export const RADAR_SERP_TARGETING_COLUMNS = "id,targeting:analise_semantica->allintitle_measurement->targeting" as const;

const registro = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;
const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

/**
 * Os códigos de local e idioma do ALVO da keyword — os mesmos do Minerador.
 *
 * A chave do cache inclui localidade e idioma. Com códigos diferentes dos do
 * Minerador, toda SERP que ele já pagou seria paga de novo e gravada numa chave
 * que ninguém mais lê. A regra é a função dele (`resolveDataForSeoTargeting`)
 * sobre o targeting que a última medição da keyword gravou, lido no servidor,
 * filtrado pela marca, em coluna estreita. Sem keyword do acervo, sem
 * targeting resolvível ou com a leitura falha: os códigos do ambiente.
 */
export async function readRadarKeywordTargetCodes(
  client: Pick<SupabaseClient, "from">,
  brandId: string,
  keywordId: string | null,
  environment: RadarSerpTargetCodes,
): Promise<{ codes: RadarSerpTargetCodes; cacheKeywordId: string | null; source: "keyword_targeting" | "environment"; readFailed: boolean }> {
  const ambiente = { codes: environment, cacheKeywordId: null, source: "environment" as const };
  if (!keywordId || !isCanonicalUuid(keywordId)) return { ...ambiente, readFailed: false };
  try {
    const resultado = await client
      .from("minerador_keywords")
      .select(RADAR_SERP_TARGETING_COLUMNS)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .eq("id", keywordId)
      .maybeSingle();
    if (resultado.error) throw new Error(resultado.error.message || "falha na leitura do targeting");
    const linha = registro(resultado.data);
    if (!linha || linha.id !== keywordId) return { ...ambiente, readFailed: false };
    const alvo = registro(linha.targeting);
    try {
      const resolvido = resolveDataForSeoTargeting({
        geoTargetConstants: alvo?.sourceGeoTargetConstants ?? alvo?.geoTargetConstants,
        languageCode: texto(alvo?.languageCode) ?? texto(alvo?.language),
        locationCode: environment.locationCode,
      });
      return { codes: { locationCode: resolvido.locationCode, languageCode: resolvido.languageCode }, cacheKeywordId: keywordId, source: "keyword_targeting", readFailed: false };
    } catch (error) {
      // Localidade que o Minerador também recusaria: não há entrada dele a reaproveitar.
      if (error instanceof DataForSeoTargetingError) return { codes: environment, cacheKeywordId: keywordId, source: "environment", readFailed: false };
      throw error;
    }
  } catch {
    return { ...ambiente, readFailed: true };
  }
}

/* -------------------------------- o hash -------------------------------- */

export const RADAR_SERP_LENSED_HASH_FORMULA = "radar-serp-lenses-v1" as const;

/*
 * Chaves ordenadas em todo nível. O corpo que volta do jsonb não preserva a
 * ordem das chaves (atributos do knowledge graph, por exemplo), e o mesmo
 * conteúdo não pode dar dois hashes conforme tenha passado pelo banco ou não.
 */
function estavel(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(estavel);
  const objeto = registro(valor);
  if (!objeto) return valor;
  return Object.fromEntries(Object.keys(objeto).sort().filter(chave => objeto[chave] !== undefined).map(chave => [chave, estavel(objeto[chave])]));
}

/**
 * O hash do snapshot com lentes.
 *
 * O mesmo conteúdo que a fórmula anterior cobria (consulta, códigos, lente,
 * orgânicos, PAA, relacionadas, knowledge graph e diagnóstico), mais o
 * endpoint e, por lente, rótulo, estado e observação. Data e
 * `providerRequestId` ficam fora, como sempre ficaram. Só vale para snapshot
 * com `lensSet`: nenhum hash gravado é recalculado.
 */
export function radarSerpLensedContentHash(
  snapshot: Pick<SerpResearchSnapshot, "query" | "device" | "operatingSystem" | "organicResults" | "peopleAlsoAsk" | "relatedSearches" | "knowledgeGraph" | "diagnostic">,
  codes: RadarSerpTargetCodes,
  lensSet: RadarSerpLensSet,
): string {
  const conteudo = {
    formula: RADAR_SERP_LENSED_HASH_FORMULA,
    query: snapshot.query,
    locationCode: codes.locationCode,
    languageCode: codes.languageCode.trim().toLowerCase(),
    device: snapshot.device,
    operatingSystem: snapshot.operatingSystem ?? null,
    organic: snapshot.organicResults,
    paa: snapshot.peopleAlsoAsk,
    related: snapshot.relatedSearches,
    knowledgeGraph: snapshot.knowledgeGraph,
    diagnostic: snapshot.diagnostic,
    endpoint: "advanced",
    lenses: radarSerpLensHashParts(lensSet),
  };
  return createHash("sha256").update(JSON.stringify(estavel(conteudo))).digest("hex");
}

/* ------------------------------- a coleta ------------------------------- */

const CANONICA = SERP_CACHE_CANONICAL_LENS;
const INDICE_CANONICA = SERP_CACHE_LENSES.findIndex(lens => sameSerpCacheLens(lens, CANONICA));
/** Concorrência limitada: o provider é compartilhado com os outros módulos. */
const CONCORRENCIA_DAS_EXTRAS = 3;

type Pedido = { lens: SerpCacheLens; request: SerpCacheRequest };
type Uso = { lens: RadarSerpLensLabel; providerRequestId: string | null; ok: boolean; costAmount: number | null; depth: number };

async function limitado<T>(itens: readonly T[], limite: number, trabalho: (item: T) => Promise<void>) {
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (proximo < itens.length) {
      const item = itens[proximo];
      proximo += 1;
      await trabalho(item);
    }
  }));
}

function custoDa(corpo: unknown): number | null {
  const tarefas = registro(corpo)?.tasks;
  const custo = registro(Array.isArray(tarefas) ? tarefas[0] : null)?.cost;
  return typeof custo === "number" && Number.isFinite(custo) && custo >= 0 ? custo : null;
}

function motivoDoProvider(coleta: SerpCacheCollection): string {
  const { taskStatusCode, taskStatusMessage } = coleta.diagnostic;
  const doProvider = taskStatusCode && taskStatusCode !== 20000 ? ` (provider ${taskStatusCode}${taskStatusMessage ? `: ${taskStatusMessage}` : ""})` : "";
  return `${coleta.observationError || "A resposta do provider não é uma SERP."}${doProvider}`;
}

/** Task recusada com 40xxx é definitiva (campo inválido, lente não suportada); o resto é transitório. */
function tipoDaRecusa(coleta: SerpCacheCollection): "provider_refused" | "request_failed" {
  const codigo = coleta.diagnostic.taskStatusCode;
  return typeof codigo === "number" && codigo >= 40000 && codigo < 50000 ? "provider_refused" : "request_failed";
}

function avisoDeEscrita(contexto: SerpCacheContext, operationRequestId: string, coleta: SerpCacheCollection) {
  if (!coleta.writeError) return;
  console.warn("[radar] serp_cache_write_failed", { operationRequestId, brandId: contexto.brandId, message: coleta.writeError.slice(0, 240) });
}

/**
 * O snapshot anterior descreve a MESMA pergunta? Mesmo artigo, mesma versão do
 * ArticleDNA, mesma keyword e mesma consulta, e já nas quatro lentes. Um
 * snapshot de outra versão do ArticleDNA nunca é devolvido como "sem mudança":
 * o diagnóstico depende do artigo.
 */
function comparavel(anterior: SerpResearchSnapshot | null, busca: SerpSearchInput): anterior is SerpResearchSnapshot {
  return Boolean(anterior
    && anterior.lensSet
    && anterior.payloadDepth === "advanced"
    && anterior.origin === "real" && !anterior.isMock
    && anterior.brandId === busca.brandId
    && anterior.articleId === busca.articleId
    && anterior.articleDnaVersionId === busca.articleDnaVersionId
    && anterior.keywordId === busca.keywordId
    && anterior.keywordDnaVersionId === busca.keywordDnaVersionId
    && anterior.query === busca.keyword
    && anterior.device === CANONICA.device
    && anterior.operatingSystem === CANONICA.operatingSystem);
}

export async function collectRadarSerpLensSnapshot(input: RadarSerpLensCollectionInput, deps: RadarSerpLensDeps): Promise<RadarSerpLensCollection> {
  const busca: SerpSearchInput = {
    ...input.searchInput,
    device: CANONICA.device,
    operatingSystem: CANONICA.operatingSystem,
    resultLimit: RADAR_SERP_SNAPSHOT_DEPTH,
  };
  const codes = { locationCode: input.codes.locationCode, languageCode: input.codes.languageCode.trim().toLowerCase() };
  const maxAgeMs = input.maxAgeMs ?? RADAR_SERP_MAX_AGE_MS;
  const pedidos: Pedido[] = SERP_CACHE_LENSES.map(lens => ({
    lens,
    request: { query: { keyword: busca.keyword, ...codes, lens, endpoint: "advanced" }, depth: RADAR_SERP_SNAPSHOT_DEPTH, keywordId: input.cacheKeywordId },
  }));
  const anterior = comparavel(input.previous, busca) ? input.previous : null;

  /* 1. Cache primeiro, leve. A recoleta explícita não lê nada: pagar é a decisão. */
  let leves: SerpCacheLookup[] = [];
  let cacheReadFailed = false;
  if (!input.recollect) {
    try {
      leves = await lookupSerpCache(input.context, pedidos.map(pedido => pedido.request), { mode: "observation", now: input.now, maxAgeMs });
    } catch (error) {
      // Banco fora não derruba a coleta: tudo vira falta, como antes do cache.
      cacheReadFailed = true;
      console.warn("[radar] serp_cache_read_failed", { operationRequestId: input.operationRequestId, brandId: input.context.brandId, message: error instanceof Error ? error.message.slice(0, 240) : "falha desconhecida" });
    }
  }
  const leve = (indice: number) => leves[indice]?.hit ?? null;

  /*
   * Lacuna DEFINITIVA do snapshot anterior comparável (recusa 40xxx ou zero
   * orgânico) que o cache continua sem ter: copiada, não paga de novo. Sem
   * isso, cada clique pagaria a lente que o provider recusa e responderia
   * "sem mudança". A recoleta paga tenta de novo.
   */
  const lacunasReaproveitaveis = pedidos.map((_, indice) => Boolean(!input.recollect
    && indice !== INDICE_CANONICA
    && anterior?.lensSet
    && !leve(indice)
    && radarSerpReusableLensGap(anterior.lensSet.lenses[indice])));
  const reusedLensGaps = lacunasReaproveitaveis.filter(Boolean).length;

  /* 2. As mesmas coletas que o snapshot anterior copiou: nada mudou, nada é lido. */
  if (anterior?.lensSet && leves.length === pedidos.length
    && radarSerpLensSetMatchesCache(anterior.lensSet, pedidos.map((_, indice) => leve(indice)?.meta ?? null), lacunasReaproveitaveis)) {
    return { research: anterior, unchanged: true, unchangedBy: "cache_meta", paidCalls: 0, cacheHits: pedidos.length - reusedLensGaps, cacheReadFailed: false, reusedLensGaps };
  }

  /* 3. O corpo da canônica, só se ela está no cache. */
  let canonica: { body: unknown; meta: SerpCacheMeta; source: "cache" | "paid" } | null = null;
  if (leve(INDICE_CANONICA)) {
    try {
      const [corpo] = await lookupSerpCache(input.context, [pedidos[INDICE_CANONICA].request], { mode: "body", now: input.now, maxAgeMs });
      if (corpo?.hit?.body) canonica = { body: corpo.hit.body, meta: corpo.hit.meta, source: "cache" };
    } catch (error) {
      cacheReadFailed = true;
      console.warn("[radar] serp_cache_body_read_failed", { operationRequestId: input.operationRequestId, brandId: input.context.brandId, message: error instanceof Error ? error.message.slice(0, 240) : "falha desconhecida" });
    }
  }

  const entradas: Array<RadarSerpLensEntry | null> = pedidos.map(() => null);
  let extrasDoCache = 0;
  pedidos.forEach((pedido, indice) => {
    if (indice === INDICE_CANONICA) return;
    const hit = leve(indice);
    if (hit?.observation) {
      entradas[indice] = radarSerpObservedLens({ lens: pedido.lens, source: "cache", meta: hit.meta, observation: hit.observation });
      extrasDoCache += 1;
    } else if (lacunasReaproveitaveis[indice] && anterior?.lensSet) {
      // A lacuna copiada como está — motivo, tipo e a data da tentativa que faltou.
      entradas[indice] = structuredClone(anterior.lensSet.lenses[indice]);
    }
  });
  const cacheHits = (canonica ? 1 : 0) + extrasDoCache;
  const extrasFaltantes = pedidos.map((pedido, indice) => ({ pedido, indice })).filter(({ indice }) => indice !== INDICE_CANONICA && !entradas[indice]);
  const faltas = (canonica ? 0 : 1) + extrasFaltantes.length;

  const tentadaEm = input.now.toISOString();
  const usos: Uso[] = [];
  let recurso: IntegrationResolvedResource | null = null;
  let usoRegistrado = false;
  const porta = USO_POR_PORTA[input.purpose ?? "canonical"];
  const registrarUso = async (snapshotId: string | null) => {
    if (usoRegistrado || !recurso) return;
    usoRegistrado = true;
    for (const uso of usos) {
      await deps.recordUsage({
        resource: recurso,
        operation: "module_operation",
        module: "radar",
        resultStatus: uso.ok ? "succeeded" : "failed",
        ...(uso.ok ? {} : { errorCode: "RADAR_SERP_LENS_NOT_A_SERP" }),
        units: 1,
        costAmount: uso.costAmount,
        idempotencyKey: `${porta.prefixo}:${input.operationRequestId}:${busca.articleId}:${uso.lens}`,
        providerReference: uso.providerRequestId,
        metadata: {
          ...(input.usageMetadata ?? {}),
          operationKind: input.recollect ? "serp_recollect" : porta.operationKind,
          articleId: busca.articleId,
          lens: uso.lens,
          depth: uso.depth,
          snapshotId,
          cacheHits,
        },
      });
    }
  };

  try {
    /* 4. Só com faltantes: credencial, quota e provider. */
    if (faltas > 0) {
      const resolvido = await deps.resolveConfig(faltas);
      recurso = resolvido.resource;
      const provider = deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : undefined;

      if (!canonica) {
        const pedido = pedidos[INDICE_CANONICA];
        const coleta = await collectAndCacheSerp(input.context, { ...pedido.request, depth: RADAR_SERP_CANONICAL_COLLECTION_DEPTH }, {
          config: resolvido.config,
          operationRequestId: input.operationRequestId,
          collectedBy: "radar",
          now: input.now,
          ...(provider ? { provider } : {}),
        });
        usos.push({ lens: radarSerpLensLabel(pedido.lens), providerRequestId: coleta.providerRequestId, ok: Boolean(coleta.observation), costAmount: custoDa(coleta.body), depth: RADAR_SERP_CANONICAL_COLLECTION_DEPTH });
        avisoDeEscrita(input.context, input.operationRequestId, coleta);
        if (!coleta.observation) {
          // O MESMO erro de antes do cache: a normalização do corpo cru recusa a task falha.
          normalizeDataForSeoSerpResponse(coleta.body, busca, codes, input.now.toISOString(), coleta.providerRequestId);
          throw new DataForSeoSerpError("dataforseo_invalid_response", motivoDoProvider(coleta), 502, coleta.providerRequestId);
        }
        canonica = { body: coleta.body, meta: coleta.meta, source: "paid" };
      }

      await limitado(extrasFaltantes, CONCORRENCIA_DAS_EXTRAS, async ({ pedido, indice }) => {
        try {
          const coleta = await collectAndCacheSerp(input.context, { ...pedido.request, depth: RADAR_SERP_EXTRA_LENS_DEPTH }, {
            config: resolvido.config,
            operationRequestId: input.operationRequestId,
            collectedBy: "radar",
            now: input.now,
            storeBody: false,
            ...(provider ? { provider } : {}),
          });
          usos.push({ lens: radarSerpLensLabel(pedido.lens), providerRequestId: coleta.providerRequestId, ok: Boolean(coleta.observation), costAmount: custoDa(coleta.body), depth: RADAR_SERP_EXTRA_LENS_DEPTH });
          avisoDeEscrita(input.context, input.operationRequestId, coleta);
          if (!coleta.observation) {
            entradas[indice] = radarSerpMissingLens(pedido.lens, motivoDoProvider(coleta), { kind: tipoDaRecusa(coleta), attemptedAt: tentadaEm });
            return;
          }
          if (coleta.observation.organicCount === 0) {
            // O cache recusa guardar SERP vazia (resposta transitória); o snapshot também não a trata como observação.
            entradas[indice] = radarSerpMissingLens(pedido.lens, RADAR_SERP_NO_ORGANIC_REASON, { kind: "no_organic", attemptedAt: tentadaEm });
            return;
          }
          entradas[indice] = radarSerpObservedLens({ lens: pedido.lens, source: "paid", meta: coleta.meta, observation: coleta.observation });
        } catch (error) {
          entradas[indice] = radarSerpMissingLens(pedido.lens, error instanceof Error ? error.message : "Falha ao consultar a lente.", { kind: "request_failed", attemptedAt: tentadaEm });
        }
      });
    }
    if (!canonica) throw new DataForSeoSerpError("dataforseo_invalid_response", "A SERP canônica não foi obtida do cache nem do provider.", 502);

    /* 5. O mesmo recorte para o acerto e para a coleta: mesmo corpo, mesmo snapshot. */
    const janela = trimSerpBodyToDepth(pruneSerpBody(canonica.body), RADAR_SERP_SNAPSHOT_DEPTH);
    const coletadaEm = normalizeRadarSerpInstant(canonica.meta.collectedAt);
    const normalizado = normalizeDataForSeoSerpResponse(janela, busca, codes, coletadaEm, canonica.meta.providerRequestId);
    entradas[INDICE_CANONICA] = radarSerpObservedLens({
      lens: CANONICA,
      source: canonica.source,
      meta: canonica.meta,
      // A data normalizada: o normalizador recusa `+00:00`, e a entrada pode ter vindo assim do banco.
      observation: serpCacheObservationFromBody(janela, { ...canonica.meta, collectedAt: coletadaEm }),
    });
    const lensSet = buildRadarSerpLensSet(entradas.map((entrada, indice) => entrada ?? radarSerpMissingLens(pedidos[indice].lens, "Lente não observada.", { kind: "not_observed" })));
    const novo = SerpResearchSnapshotSchema.parse({
      ...normalizado,
      payloadDepth: "advanced",
      providerDepth: canonica.meta.depth,
      cacheProvenance: {
        source: canonica.source,
        collectedBy: canonica.meta.collectedBy,
        providerRequestId: canonica.meta.providerRequestId,
        cacheCollectedAt: coletadaEm,
        // O que a consulta usou de fato: `location`/`language` do snapshot são o texto do pedido.
        locationCode: codes.locationCode,
        languageCode: codes.languageCode,
        ...(input.codesSource ? { codesSource: input.codesSource } : {}),
        // `collectedAt` é a idade da SERP; esta é a da versão (com cache, a SERP pode ser mais velha que a versão anterior).
        snapshotOpenedAt: input.now.toISOString(),
      },
      lensSet,
      contentHash: radarSerpLensedContentHash(normalizado, codes, lensSet),
    });

    /* 6. Hash igual ao anterior: nenhuma versão nova. */
    const semMudanca = Boolean(anterior && anterior.contentHash === novo.contentHash);
    const research = semMudanca && anterior ? anterior : novo;
    await registrarUso(research.id);
    return { research, unchanged: semMudanca, unchangedBy: semMudanca ? "content_hash" : null, paidCalls: usos.length, cacheHits, cacheReadFailed, reusedLensGaps };
  } catch (error) {
    // Chamada paga é registrada mesmo quando a coleta não vira snapshot.
    if (!usoRegistrado) await registrarUso(null).catch(() => undefined);
    throw error;
  }
}
