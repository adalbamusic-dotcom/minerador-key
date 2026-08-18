import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { GoogleAdsError } from "@/lib/google/ads/errors";
import { createGoogleAdsCanonicalClient, defaultGoogleAdsCanonicalTargeting, GoogleAdsConfigurationBlocker, resolveGoogleAdsCanonicalContext, targetingToProviderInput, type GoogleAdsCanonicalContext } from "@/lib/server/google-ads-canonical";
import { generateGoogleAdsHistoricalMetrics } from "@/lib/google/ads/historical-metrics";
import { createGoogleAdsKeywordAccount } from "@/lib/google/ads/account";
import type { GoogleAdsHistoricalMetric } from "@/lib/google/ads/contracts";
import { GoogleAdsVolumeRequestSchema, buildGoogleAdsUnavailableVolumePatch, buildGoogleAdsVolumeMetricPatch, matchGoogleAdsVolumeMetrics, splitGoogleAdsVolumeKeywordIds, type GoogleAdsVolumeKeyword } from "@/lib/minerador/google-ads-volume";
import { setVolumeEligibility, volumeEligibilityFromOfficialMeasurement } from "@/lib/minerador/volume-eligibility";
import { isTenantId } from "@/lib/tenant-routing";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { mapDiscoveryCandidateCurrentMetrics } from "@/lib/minerador/discovery-current-metrics";
import { IntegrationRuntimeError } from "@/lib/server/integrations-runtime";
import { buildGoogleAdsMetricsFailure, GOOGLE_ADS_HISTORICAL_METRICS_ENDPOINT, type GoogleAdsMetricsExecutionState, type GoogleAdsMetricsStage, type GoogleAdsMetricsRouteFailure } from "@/lib/minerador/google-ads-metrics-diagnostics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteFailure = GoogleAdsMetricsRouteFailure;

function failure(code: string, stage: string, message: string, status: number, diagnostic: Record<string, unknown>): RouteFailure {
  return { code, stage, message, status, diagnostic };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  let operationRequestId: string | null = null;
  let requestedCount = 0;
  let returnedCount = 0;
  let persistedCount = 0;
  let apiRequestStarted = false;
  let providerResponseReceived = false;
  let internalStage: GoogleAdsMetricsStage = "request_validation";
  let persistenceWriteCount = 0;
  const googleAdsRequestIds: string[] = [];
  let profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>> | null = null;
  let canonicalContext: GoogleAdsCanonicalContext | null = null;
  let authorizedBrandId: string | null = null;
  let loadedKeywords: GoogleAdsVolumeKeyword[] = [];
  let candidateIds = new Set<string>();
  const persistedKeywordIds = new Set<string>();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return NextResponse.json({ success: false, ...failure("BRAND_NOT_FOUND", "authorization", "Marca inválida.", 404, { apiRequestStarted: false }) }, { status: 404 });
    const input = GoogleAdsVolumeRequestSchema.parse(await request.json());
    operationRequestId = input.operationRequestId;
    requestedCount = input.keywordIds.length + input.candidateIds.length;
    candidateIds = new Set(input.candidateIds);
    internalStage = "context_resolution";
    profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    authorizedBrandId = context.brandId;
    canonicalContext = await resolveGoogleAdsCanonicalContext({ actorUserId: profile.userId, agencyId: context.agencyId, brandId: context.brandId, operation: "metrics" });
    const { data: keywordRows, error: keywordError } = input.keywordIds.length ? await profile.supabase
      .from("minerador_keywords")
      .select("id,brand_id,keyword,status,volume_search,results_allintitle,kgr_score,volume_source,analise_semantica")
      .in("id", input.keywordIds) : { data: [], error: null };
    if (keywordError) throw keywordError;
    const keywords = (keywordRows || []).map(row => ({ id: String(row.id), brandId: String(row.brand_id || ""), keyword: String(row.keyword || ""), status: String(row.status || ""), volume_search: typeof row.volume_search === "number" ? row.volume_search : null, results_allintitle: typeof row.results_allintitle === "number" ? row.results_allintitle : null, kgr_score: typeof row.kgr_score === "number" ? row.kgr_score : null, volume_source: typeof row.volume_source === "string" ? row.volume_source : null, analise_semantica: row.analise_semantica && typeof row.analise_semantica === "object" ? row.analise_semantica as Record<string, unknown> : null })) as GoogleAdsVolumeKeyword[];
    const { data: candidateRows, error: candidateError } = input.candidateIds.length ? await profile.supabase.from("minerador_discovery_candidates").select("id,brand_id,keyword_original").in("id", input.candidateIds) : { data: [], error: null };
    if (candidateError) throw candidateError;
    const currentResult = input.candidateIds.length ? await profile.supabase.from("minerador_discovery_candidate_current_metrics").select("*").in("candidate_id", input.candidateIds).eq("brand_id", context.brandId) : { data: [], error: null };
    if (currentResult.error) throw currentResult.error;
    const currentById = new Map((currentResult.data || []).map(row => [String(row.candidate_id), mapDiscoveryCandidateCurrentMetrics(row as Record<string, unknown>)]));
    const candidates = (candidateRows || []).map(row => {
      const id = String(row.id);
      const current = currentById.get(id);
      return { id, brandId: String(row.brand_id || ""), keyword: String(row.keyword_original || ""), status: "bruto", volume_search: current?.averageMonthlySearches ?? null, results_allintitle: current?.resultsAllintitle ?? null, kgr_score: null, volume_source: "google_ads", analise_semantica: null } as GoogleAdsVolumeKeyword;
    });
    const requestedKeywords = [...keywords, ...candidates];
    loadedKeywords = keywords;
    if (requestedKeywords.length !== requestedCount || requestedKeywords.some(keyword => keyword.brandId !== context.brandId)) {
      const result = failure("KEYWORD_BRAND_MISMATCH", "authorization", "Uma das keywords selecionadas não pertence à marca ativa.", 403, { apiRequestStarted: false });
      return NextResponse.json({ success: false, operationRequestId, requestedCount, returnedCount, persistedCount, ...result }, { status: result.status });
    }

    const { client } = await createGoogleAdsCanonicalClient({ context: canonicalContext });
    apiRequestStarted = true;
    internalStage = "provider_request";
    const account = createGoogleAdsKeywordAccount({ customerId: canonicalContext.customerId, loginCustomerId: canonicalContext.managerCustomerId });
    const targeting = targetingToProviderInput(canonicalContext.targeting || defaultGoogleAdsCanonicalTargeting());
    const allMetrics: Array<{ metric: GoogleAdsHistoricalMetric; requestId: string | null }> = [];
    for (const batchIds of splitGoogleAdsVolumeKeywordIds(requestedKeywords.map(keyword => keyword.id))) {
      const batch = requestedKeywords.filter(keyword => batchIds.includes(keyword.id));
      internalStage = "provider_request";
      const result = await generateGoogleAdsHistoricalMetrics(client, {
        account: { customerId: account.customerId, loginCustomerId: account.loginCustomerId || undefined },
        targeting,
        keywords: batch.map(keyword => keyword.keyword),
        includeAverageCpc: true,
      }, account);
      if (result.requestId) googleAdsRequestIds.push(result.requestId);
      providerResponseReceived = true;
      allMetrics.push(...result.metrics.map(metric => ({ metric, requestId: result.requestId })));
    }
    internalStage = "provider_response";
    const matchedItems = allMetrics.flatMap(item => matchGoogleAdsVolumeMetrics(requestedKeywords, [item.metric], input.operationRequestId, item.requestId).matches);
    const matchedIds = new Set(matchedItems.map(item => item.keywordId));
    const unmatchedKeywordIds = requestedKeywords.filter(keyword => !matchedIds.has(keyword.id)).map(keyword => keyword.id);
    const providerReturnedKeywords = allMetrics.slice(0, 25).map(({ metric }) => ({ canonicalKeyword: metric.canonicalKeyword, closeVariants: metric.closeVariants, hasAverageMonthlySearches: metric.averageMonthlySearches !== null }));
    returnedCount = matchedItems.length;
    const keywordById = new Map(requestedKeywords.map(keyword => [keyword.id, keyword]));
    const projection = [] as Array<{ keywordId: string; volumeSearch: number | null; kgrScore: number | null; eligibilityStatus: string | null; measuredAt: string }>;
    for (const measurement of matchedItems) {
      const keyword = keywordById.get(measurement.keywordId);
      if (!keyword) continue;
      if (candidateIds.has(measurement.keywordId)) {
        if (measurement.averageMonthlySearches === null) continue;
        internalStage = "persist_current_metrics";
        const currentResult = await profile.supabase.from("minerador_discovery_candidate_current_metrics").select("*").eq("candidate_id", measurement.keywordId).eq("brand_id", context.brandId).maybeSingle();
        if (currentResult.error || !currentResult.data) throw currentResult.error || new Error("A projeção atual da candidata não foi encontrada.");
        const previous = currentResult.data as Record<string, unknown>;
        const currentPatch = { volume_search: measurement.averageMonthlySearches, monthly_search_volumes: measurement.monthlySearchVolumes, low_top_of_page_bid_micros: measurement.lowTopOfPageBidMicros, high_top_of_page_bid_micros: measurement.highTopOfPageBidMicros, average_cpc_micros: measurement.averageCpcMicros, competition: measurement.competition, competition_index: measurement.competitionIndex, currency_code: measurement.currencyCode, targeting: measurement.targeting, metrics_measured_at: measurement.measuredAt, metrics_provider: measurement.provider, metrics_provider_version: measurement.providerVersion, google_ads_request_id: measurement.googleAdsRequestId, updated_by: profile.userId, updated_at: measurement.measuredAt };
        internalStage = "persist_metric_history";
        const history = await profile.supabase.from("minerador_discovery_candidate_metric_history").insert({ brand_id: context.brandId, candidate_id: measurement.keywordId, metric_type: "google_ads", previous_value: { volumeSearch: previous.volume_search, monthlySearchVolumes: previous.monthly_search_volumes, averageCpcMicros: previous.average_cpc_micros }, new_value: { volumeSearch: measurement.averageMonthlySearches, monthlySearchVolumes: measurement.monthlySearchVolumes, averageCpcMicros: measurement.averageCpcMicros, competition: measurement.competition, competitionIndex: measurement.competitionIndex }, provider: measurement.provider, provider_version: measurement.providerVersion, targeting: measurement.targeting, measured_at: measurement.measuredAt, actor_user_id: profile.userId, operation_request_id: input.operationRequestId, outcome: "success" });
        if (history.error) throw history.error;
        persistenceWriteCount += 1;
        internalStage = "persist_current_metrics";
        const candidateUpdate = await profile.supabase.from("minerador_discovery_candidate_current_metrics").update(currentPatch).eq("candidate_id", measurement.keywordId).eq("brand_id", context.brandId);
        if (candidateUpdate.error) throw candidateUpdate.error;
        persistenceWriteCount += 1;
        persistedKeywordIds.add(measurement.keywordId);
        persistedCount += 1;
        projection.push({ keywordId: measurement.keywordId, volumeSearch: measurement.averageMonthlySearches, kgrScore: null, eligibilityStatus: volumeEligibilityFromOfficialMeasurement(measurement.averageMonthlySearches), measuredAt: measurement.measuredAt });
        continue;
      }
      const patch = measurement.averageMonthlySearches === null
        ? buildGoogleAdsUnavailableVolumePatch(keyword, measurement)
        : buildGoogleAdsVolumeMetricPatch(keyword, measurement);
      internalStage = "persist_measurements";
      const { data: persistedMeasurement, error: measurementError } = await profile.supabase
        .from("minerador_keyword_metric_measurements")
        .insert({ brand_id: context.brandId, keyword_id: measurement.keywordId, operation_request_id: input.operationRequestId, requested_keyword: keyword.keyword, canonical_keyword: measurement.canonicalKeyword, close_variants: measurement.closeVariants, matched_requested_keywords: measurement.matchedRequestedKeywords, average_monthly_searches: measurement.averageMonthlySearches, monthly_search_volumes: measurement.monthlySearchVolumes, competition: measurement.competition, competition_index: measurement.competitionIndex, low_top_of_page_bid_micros: measurement.lowTopOfPageBidMicros, high_top_of_page_bid_micros: measurement.highTopOfPageBidMicros, average_cpc_micros: measurement.averageCpcMicros, currency_code: measurement.currencyCode, time_zone: measurement.timeZone, targeting: measurement.targeting, provider: measurement.provider, provider_version: measurement.providerVersion, customer_id_ref: measurement.customerId.slice(-4).padStart(measurement.customerId.length, "*"), login_customer_id_ref: account.loginCustomerId ? account.loginCustomerId.slice(-4).padStart(account.loginCustomerId.length, "*") : null, google_ads_request_id: measurement.googleAdsRequestId, measured_at: measurement.measuredAt, outcome: "received" })
        .select("id")
        .single();
      if (measurementError || !persistedMeasurement?.id) throw measurementError || new Error("A medição Google Ads não foi persistida.");
      persistenceWriteCount += 1;
      if (patch) {
        internalStage = "project_keywords";
        const { error: projectionError } = await profile.supabase.from("minerador_keywords").update(patch).eq("id", measurement.keywordId).eq("brand_id", context.brandId);
        if (projectionError) {
          await profile.supabase.from("minerador_keyword_metric_measurements").update({ outcome: "projection_failed" }).eq("id", persistedMeasurement.id).eq("brand_id", context.brandId);
          throw projectionError;
        }
        persistenceWriteCount += 1;
      }
      internalStage = "persist_measurements";
      const { error: finalizationError } = await profile.supabase.from("minerador_keyword_metric_measurements").update({ outcome: "persisted" }).eq("id", persistedMeasurement.id).eq("brand_id", context.brandId);
      if (finalizationError) throw finalizationError;
      persistenceWriteCount += 1;
      persistedKeywordIds.add(measurement.keywordId);
      persistedCount += 1;
      projection.push({ keywordId: measurement.keywordId, volumeSearch: measurement.averageMonthlySearches, kgrScore: measurement.averageMonthlySearches === null ? keyword.kgr_score : patch && "kgr_score" in patch ? patch.kgr_score ?? null : null, eligibilityStatus: keyword.status === "publicado" ? null : volumeEligibilityFromOfficialMeasurement(measurement.averageMonthlySearches), measuredAt: measurement.measuredAt });
    }
    internalStage = "completed";
    const partial = unmatchedKeywordIds.length > 0 || persistedCount !== requestedCount;
    return NextResponse.json({ success: true, operationRequestId, code: partial ? "GOOGLE_ADS_PARTIAL_RESULTS" : null, stage: partial ? "response_normalization" : null, message: partial ? "Algumas keywords não retornaram dados de volume." : "Métricas Google Ads persistidas e refletidas na tabela.", requestedCount, returnedCount, persistedCount, unmatchedKeywordIds, batchCount: splitGoogleAdsVolumeKeywordIds(requestedKeywords.map(keyword => keyword.id)).length, source: "google_ads", measuredAt: projection[0]?.measuredAt || null, projections: projection, diagnostic: { apiRequestStarted, providerResponseReceived, failureType: "PROVIDER_SUCCESS", internalStage, endpoint: GOOGLE_ADS_HISTORICAL_METRICS_ENDPOINT, googleAdsRequestIds, providerReturnedCount: allMetrics.length, providerReturnedKeywords, providerReturnedKeywordsTruncated: allMetrics.length > providerReturnedKeywords.length } });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ success: false, operationRequestId, requestedCount, returnedCount, persistedCount, ...failure("INVALID_VOLUME_REQUEST", "argument_validation", "A solicitação de métricas é inválida.", 400, { apiRequestStarted: false, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) }) }, { status: 400 });
    const customerDiagnostic = canonicalContext ? (() => {
      const customerRef = canonicalContext.customerId.slice(-4).padStart(canonicalContext.customerId.length, "*");
      return { customerSource: "platform", customerIdRef: customerRef, researchCustomerConfigured: true, researchCustomerReadback: "pass", requestCustomerSource: "platform", requestCustomerRef: customerRef };
    })() : {};
    const executionState: GoogleAdsMetricsExecutionState = { apiRequestStarted, providerResponseReceived, internalStage, providerRequestIds: googleAdsRequestIds, persistenceWriteCount, persistedCount };
    const mapped = error instanceof GoogleAdsConfigurationBlocker
      ? failure(error.code, "configuration_validation", error.message, error.status, { apiRequestStarted: false, providerResponseReceived: false, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "configuration_validation", source: "canonical" })
      : error instanceof IntegrationRuntimeError
        ? failure(error.code, "integration_runtime", error.message, error.status, { apiRequestStarted, providerResponseReceived, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage, source: "canonical", runtime: error.diagnostic })
        : buildGoogleAdsMetricsFailure(error, executionState, customerDiagnostic, { apiVersion: canonicalContext?.config.apiVersion || "v25", requestedKeywordCount: requestedCount });
    if (apiRequestStarted && profile && authorizedBrandId && operationRequestId) {
      const googleAdsRequestId = error instanceof GoogleAdsError ? error.requestId || googleAdsRequestIds.at(-1) || null : googleAdsRequestIds.at(-1) || null;
      await Promise.all(loadedKeywords.filter(keyword => keyword.status !== "publicado" && !persistedKeywordIds.has(keyword.id)).map(async keyword => {
        try {
          await profile!.supabase.from("minerador_keywords").update({
            analise_semantica: setVolumeEligibility(keyword.analise_semantica, {
              status: "measurement_failed",
              measuredAt: new Date().toISOString(),
              provider: "google_ads",
              providerVersion: "v25",
              averageMonthlySearches: null,
              googleAdsRequestId,
            }),
          }).eq("id", keyword.id).eq("brand_id", authorizedBrandId!);
        } catch {
          // A falha de marcação compensatória não pode apagar o diagnóstico original.
        }
      }));
    }
    return NextResponse.json({ success: false, operationRequestId, requestedCount, returnedCount, persistedCount, ...mapped }, { status: mapped.status });
  }
}
