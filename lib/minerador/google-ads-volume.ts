import { z } from "zod";
import type { GoogleAdsHistoricalMetric, GoogleAdsTargeting } from "../google/ads/contracts.ts";
import { normalizeGoogleAdsKeyword } from "../google/ads/normalizers.ts";
import { buildVolumeMetricPatch, type ExistingVolumeMetrics, type VolumeMetricPatch } from "./volume-provider.ts";
import { readGoogleAdsEmptyVolumeResponse, setVolumeEligibility, volumeEligibilityFromOfficialMeasurement, type GoogleAdsEmptyVolumeResponseKind } from "./volume-eligibility.ts";
import { isValidGoogleAdsDemandMeasurement } from "./google-ads-demand.ts";
import { carryApprovalAcrossRemeasurement } from "./approved-package.ts";

export const GOOGLE_ADS_VOLUME_BATCH_SIZE = 10_000;
export const GoogleAdsVolumeRequestSchema = z.object({
  keywordIds: z.array(z.string().uuid()).max(50_000).default([]).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "keywordIds contém duplicidades." });
  }),
  candidateIds: z.array(z.string().uuid()).max(50_000).default([]).superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "candidateIds duplicados." });
  }),
  operationRequestId: z.string().uuid(),
}).superRefine((value, context) => {
  if (!value.keywordIds.length && !value.candidateIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Informe ao menos uma keyword ou candidata." });
});

export type GoogleAdsVolumeRequest = z.infer<typeof GoogleAdsVolumeRequestSchema>;

export type GoogleAdsBrandConnection = {
  brandId: string;
  customerId: string;
  loginCustomerId: string | null;
  languageConstant: string;
  geoTargetConstants: string[];
  keywordPlanNetwork: GoogleAdsTargeting["keywordPlanNetwork"];
  includeAdultKeywords: boolean;
  currencyCode: string;
  timeZone: string;
  status: "validated" | "invalid" | "pending" | "disabled";
  validatedAt: string | null;
};

export type GoogleAdsVolumeKeyword = ExistingVolumeMetrics & { id: string; brandId: string; keyword: string };

export type GoogleAdsVolumeMeasurement = GoogleAdsHistoricalMetric & {
  keywordId: string;
  operationRequestId: string;
  googleAdsRequestId: string | null;
};

export type GoogleAdsVolumeMetricPatch = VolumeMetricPatch & { volume_source: "google_ads" };

export function splitGoogleAdsVolumeKeywordIds(keywordIds: string[], batchSize = GOOGLE_ADS_VOLUME_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("O tamanho do lote Google Ads deve ser positivo.");
  return Array.from({ length: Math.ceil(keywordIds.length / batchSize) }, (_, index) => keywordIds.slice(index * batchSize, (index + 1) * batchSize));
}

export function matchGoogleAdsVolumeMetrics(keywords: GoogleAdsVolumeKeyword[], metrics: GoogleAdsHistoricalMetric[], operationRequestId: string, googleAdsRequestId: string | null) {
  const keywordByNormalizedText = new Map<string, GoogleAdsVolumeKeyword[]>();
  for (const keyword of keywords) {
    const normalized = normalizeGoogleAdsKeyword(keyword.keyword);
    keywordByNormalizedText.set(normalized, [...(keywordByNormalizedText.get(normalized) || []), keyword]);
  }

  const matches: GoogleAdsVolumeMeasurement[] = [];
  for (const metric of metrics) {
    for (const requestedKeyword of metric.matchedRequestedKeywords) {
      for (const keyword of keywordByNormalizedText.get(normalizeGoogleAdsKeyword(requestedKeyword)) || []) {
        matches.push({ ...metric, keywordId: keyword.id, operationRequestId, googleAdsRequestId });
      }
    }
  }
  const matchedIds = new Set(matches.map(item => item.keywordId));
  return { matches, unmatchedKeywordIds: keywords.filter(keyword => !matchedIds.has(keyword.id)).map(keyword => keyword.id) };
}

export function buildGoogleAdsVolumeMetricPatch(existing: ExistingVolumeMetrics, measurement: GoogleAdsVolumeMeasurement, options: { requireCurrentResultsMeasurement?: boolean } = {}): GoogleAdsVolumeMetricPatch | null {
  if (measurement.averageMonthlySearches === null || measurement.averageMonthlySearches < 0) return null;
  const base = buildVolumeMetricPatch(existing, {
    keyword: measurement.keyword,
    status: "success",
    volume: measurement.averageMonthlySearches,
    source: "google_ads",
    measuredAt: measurement.measuredAt,
    match: "exact",
  }, options);
  if (!base.volume_search && base.volume_search !== 0) return null;
  const semantic = existing.status === "publicado"
    ? { ...(base.analise_semantica || {}) }
    : setVolumeEligibility(base.analise_semantica, {
      status: volumeEligibilityFromOfficialMeasurement(measurement.averageMonthlySearches),
      measuredAt: measurement.measuredAt,
      provider: measurement.provider,
      providerVersion: measurement.providerVersion,
      averageMonthlySearches: measurement.averageMonthlySearches,
      googleAdsRequestId: measurement.googleAdsRequestId,
    });
  semantic.volume_measurement = {
    ...(semantic.volume_measurement as Record<string, unknown> || {}),
    provider: measurement.provider,
    providerVersion: measurement.providerVersion,
    measuredAt: measurement.measuredAt,
    averageMonthlySearches: measurement.averageMonthlySearches,
    monthlySearchVolumes: measurement.monthlySearchVolumes,
    competition: measurement.competition,
    competitionIndex: measurement.competitionIndex,
    lowTopOfPageBidMicros: measurement.lowTopOfPageBidMicros,
    highTopOfPageBidMicros: measurement.highTopOfPageBidMicros,
    averageCpcMicros: measurement.averageCpcMicros,
    currencyCode: measurement.currencyCode,
    timeZone: measurement.timeZone,
    targeting: measurement.targeting,
    closeVariants: measurement.closeVariants,
    matchedRequestedKeywords: measurement.matchedRequestedKeywords,
    accountRef: measurement.customerId.slice(-4).padStart(measurement.customerId.length, "*"),
    googleAdsRequestId: measurement.googleAdsRequestId,
  };
  return { ...base, volume_source: "google_ads", analise_semantica: semantic };
}

export type GoogleAdsEmptyVolumeResponseInput = {
  measuredAt: string;
  providerVersion: "v25";
  googleAdsRequestId: string | null;
  /** Diagnóstico: devolvida sem média ou não devolvida no lote. */
  kind?: GoogleAdsEmptyVolumeResponseKind;
};

/**
 * Registra a resposta do Google Ads SEM média mensal — processo executado,
 * não falha (decisão do dono, 2026-09-25). Nunca toca em `volume_search`,
 * `kgr_score` nem `volume_measurement` (ADR-020: ausência não vira zero).
 *
 * - Sem número válido anterior: `volume_eligibility` passa a `unavailable`
 *   com a data desta resposta. É o que a tela e a trava de aprovação leem
 *   como "processado, sem média oficial".
 * - Com número válido anterior: o número fica, e a elegibilidade que ele
 *   sustenta também. Só a data desta resposta vazia é registrada, em
 *   `volume_eligibility.lastEmptyResponse`.
 *
 * Vale também para linha com status legado `publicado`: sem o registro, a
 * resposta vazia desapareceria e a keyword pareceria nunca medida.
 */
export function buildGoogleAdsEmptyVolumePatch(existing: ExistingVolumeMetrics, response: GoogleAdsEmptyVolumeResponseInput) {
  const semantic = existing.analise_semantica || {};
  if (isValidGoogleAdsDemandMeasurement(semantic.volume_measurement)) {
    const eligibility = semantic.volume_eligibility && typeof semantic.volume_eligibility === "object" && !Array.isArray(semantic.volume_eligibility)
      ? semantic.volume_eligibility as Record<string, unknown>
      : {};
    return {
      analise_semantica: {
        ...semantic,
        volume_eligibility: {
          ...eligibility,
          lastEmptyResponse: {
            provider: "google_ads",
            providerVersion: response.providerVersion,
            measuredAt: response.measuredAt,
            averageMonthlySearches: null,
            googleAdsRequestId: response.googleAdsRequestId,
            ...(response.kind ? { emptyResponseKind: response.kind } : {}),
          },
        },
      },
    };
  }
  return {
    analise_semantica: setVolumeEligibility(semantic, {
      status: "unavailable",
      measuredAt: response.measuredAt,
      provider: "google_ads",
      providerVersion: response.providerVersion,
      averageMonthlySearches: null,
      googleAdsRequestId: response.googleAdsRequestId,
      ...(response.kind ? { emptyResponseKind: response.kind } : {}),
    }),
  };
}

/** Records an exact Google Ads response with no monthly average without overwriting volume or KGR. */
export function buildGoogleAdsUnavailableVolumePatch(existing: ExistingVolumeMetrics, measurement: GoogleAdsVolumeMeasurement) {
  if (measurement.averageMonthlySearches !== null) return null;
  return buildGoogleAdsEmptyVolumePatch(existing, {
    measuredAt: measurement.measuredAt,
    providerVersion: measurement.providerVersion,
    googleAdsRequestId: measurement.googleAdsRequestId,
    kind: "returned_without_average",
  });
}

/**
 * A falha de uma nova tentativa não apaga a resposta anterior.
 *
 * A marcação compensatória `measurement_failed` só vale para keyword que
 * nunca teve resposta registrada. Com número válido ou com resposta sem
 * média gravada, a falha fica na tela e na notificação, e o registro
 * anterior segue — senão um erro de rede tiraria a keyword da aprovação.
 */
export function shouldMarkVolumeMeasurementFailed(existing: Pick<ExistingVolumeMetrics, "status" | "analise_semantica">): boolean {
  if (existing.status === "publicado") return false;
  const semantic = existing.analise_semantica || {};
  return !isValidGoogleAdsDemandMeasurement(semantic.volume_measurement) && !readGoogleAdsEmptyVolumeResponse(semantic);
}

/**
 * Aplica ao patch da remedição a regra "remedir sem mudança real não rebaixa
 * a aprovada" (`carryApprovalAcrossRemeasurement`). Sem aprovação, com
 * mudança real ou já em revisão, devolve o patch intocado.
 */
export function withApprovalCarriedAcrossRemeasurement<T extends { volume_search?: number; kgr_score?: number | null; analise_semantica?: Record<string, unknown> }>(
  existing: GoogleAdsVolumeKeyword & { intent?: string | null },
  patch: T,
): T {
  if (!patch.analise_semantica) return patch;
  const before = {
    keywordId: existing.id,
    keyword: existing.keyword,
    intent: existing.intent ?? null,
    volumeSearch: existing.volume_search,
    resultsAllintitle: existing.results_allintitle,
    kgrScore: existing.kgr_score,
    semantic: existing.analise_semantica || null,
  };
  const after = {
    ...before,
    volumeSearch: patch.volume_search !== undefined ? patch.volume_search : existing.volume_search,
    kgrScore: patch.kgr_score !== undefined ? patch.kgr_score : existing.kgr_score,
    semantic: patch.analise_semantica,
  };
  const carried = carryApprovalAcrossRemeasurement(before, after);
  return carried ? { ...patch, analise_semantica: carried } : patch;
}
