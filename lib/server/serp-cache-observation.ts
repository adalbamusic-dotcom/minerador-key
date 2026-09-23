/**
 * A OBSERVAÇÃO COMPACTA DE UMA ENTRADA DE CACHE — ~1 KB, calculada uma vez.
 *
 * É o que o agrupamento lê. Sai do corpo podado pelo MESMO normalizador que
 * Arquiteto e Radar usam, recortado ao top 10 (`SERP_CACHE_OBSERVATION_DEPTH`)
 * — assim uma keyword coletada com 20 resultados e outra com 10 são medidas
 * pela mesma régua.
 *
 * A normalização aqui é NEUTRA: sem intenção esperada nem tópicos exigidos.
 * Nada da observação depende deles — domínios, blocos, perguntas e buscas
 * relacionadas vêm da SERP, não de quem pergunta.
 *
 * Sem `server-only` de propósito: função pura sobre um corpo já em memória,
 * provada em teste contra o corpo real.
 */

import { normalizeDataForSeoSerpResponse } from "./dataforseo-serp-normalizer.ts";
import { observationFromSnapshot, normalizeCompetitorDomain } from "../arquiteto/serp-competitive-evidence.ts";
import {
  SERP_CACHE_OBSERVATION_DEPTH,
  serpCacheLensLabel,
  trimSerpBodyToDepth,
  type SerpCacheMeta,
  type SerpCacheObservation,
} from "../editorial/serp-cache.ts";
import type { SerpSearchInput } from "../radar/serp/contracts.ts";

const unicos = (valores: readonly string[]) => [...new Set(valores.filter(Boolean))];

export function serpCacheObservationFromBody(
  body: unknown,
  meta: Pick<SerpCacheMeta, "keyword" | "locationCode" | "languageCode" | "lens" | "collectedAt">,
): SerpCacheObservation {
  const recortado = trimSerpBodyToDepth(body, SERP_CACHE_OBSERVATION_DEPTH);
  const snapshot = normalizeDataForSeoSerpResponse(recortado, {
    brandId: "serp-cache",
    articleId: "serp-cache",
    articleDnaVersionId: "serp-cache",
    keywordId: "serp-cache",
    keywordDnaVersionId: "serp-cache",
    keyword: meta.keyword,
    location: String(meta.locationCode),
    language: meta.languageCode,
    device: meta.lens.device,
    operatingSystem: meta.lens.operatingSystem,
    expectedIntent: "",
    expectedFormat: "",
    requiredTopics: [],
    articleEntities: [],
    resultLimit: SERP_CACHE_OBSERVATION_DEPTH,
    version: 1,
    previousSnapshotId: null,
  } as SerpSearchInput, { locationCode: meta.locationCode, languageCode: meta.languageCode }, meta.collectedAt, null);

  const base = observationFromSnapshot(snapshot);
  const citados = unicos((snapshot.serpFeatures?.aiOverview?.references || []).map(item => normalizeCompetitorDomain(item.domain)));

  return {
    lens: serpCacheLensLabel(meta.lens),
    depth: SERP_CACHE_OBSERVATION_DEPTH,
    competitorDomains: [...base.competitorDomains],
    organicCount: base.organicCount,
    itemTypes: [...base.itemTypes],
    questions: [...base.questions],
    relatedSearches: unicos(snapshot.relatedSearches.map(item => item.term.trim())),
    aiOverviewDomains: citados,
    commercialSignals: base.commercialSignals,
  };
}
