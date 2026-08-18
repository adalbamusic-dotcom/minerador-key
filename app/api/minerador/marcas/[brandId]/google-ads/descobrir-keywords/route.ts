import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { createGoogleAdsKeywordAccount } from "@/lib/google/ads/account";
import { GoogleAdsError } from "@/lib/google/ads/errors";
import { buildGoogleAdsProviderDiagnostic, buildGoogleAdsUnknownFailureDiagnostic } from "@/lib/google/ads/diagnostics";
import { generateGoogleAdsKeywordIdeas } from "@/lib/google/ads/keyword-ideas";
import { assertCanonicalTargeting, createGoogleAdsCanonicalClient, defaultGoogleAdsCanonicalTargeting, GoogleAdsConfigurationBlocker, resolveGoogleAdsCanonicalContext, targetingToProviderInput, type GoogleAdsCanonicalContext } from "@/lib/server/google-ads-canonical";
import { normalizeGoogleAdsKeyword } from "@/lib/google/ads/normalizers";
import { GOOGLE_ADS_DISCOVERY_LANGUAGES, resolveDiscoveryTargeting } from "@/lib/minerador/google-ads-discovery-catalog";
import { applyDiscoveryFilters, buildDiscoveryCandidateRows, buildDiscoveryRunRow } from "@/lib/minerador/discovery-persistence";
import type { DiscoveryCandidate } from "@/lib/minerador/discovery-keywords";
import type { DiscoverySearchDraft } from "@/modules/minerador/discovery/discovery-types";
import { isTenantId } from "@/lib/tenant-routing";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { maskGoogleAdsConnectionId } from "@/lib/minerador/google-ads-connection";
import { currentMetricsSeedFromCandidate, mapDiscoveryCandidateCurrentMetrics, mergeDiscoveryCandidateCurrentMetrics } from "@/lib/minerador/discovery-current-metrics";
import { mapDiscoveryCandidateRow } from "@/lib/minerador/discovery-candidate-adapter";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createIntegrationRuntimeRepository, IntegrationRuntimeError } from "@/lib/server/integrations-runtime";
import { GoogleAdsDiscoveryUsageError, recordGoogleAdsDiscoveryUsage } from "@/lib/minerador/google-ads-discovery-usage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const GOOGLE_ADS_DISCOVERY_PAGE_CAP = 500;

const DiscoveryDraftSchema = z.object({
  seed: z.string().trim().min(1).max(200),
  relationshipMode: z.string().min(1),
  preliminaryIntent: z.string().min(1),
  preliminaryFunnel: z.string().min(1),
  language: z.string().min(1),
  countryCode: z.literal("BR"),
  selectedStates: z.array(z.string()),
  volumeFilter: z.string().min(1),
  cpcFilter: z.string().min(1),
  includeTerms: z.string(),
  excludeTerms: z.string(),
  includeAdultKeywords: z.boolean(),
});

const DiscoveryRequestSchema = z.object({
  operationRequestId: z.string().uuid(),
  seed: z.string().trim().min(1).max(200),
  draft: DiscoveryDraftSchema.optional(),
  targeting: z.object({
    language: z.string().refine(value => (Object.values(GOOGLE_ADS_DISCOVERY_LANGUAGES) as string[]).includes(value), "Idioma Google Ads inválido"),
    countryCode: z.literal("BR"),
    selectedStates: z.array(z.string()),
    keywordPlanNetwork: z.enum(["GOOGLE_SEARCH", "GOOGLE_SEARCH_AND_PARTNERS"]),
    includeAdultKeywords: z.boolean(),
  }),
});

type ExecutedTargeting = {
  countryCode: "BR";
  countryLabel: string;
  selectedStates: string[];
  stateLabels: string[];
  geoTargetConstants: string[];
  language: string;
  keywordPlanNetwork: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS";
  includeAdultKeywords: boolean;
};

const defaultDraft = (seed: string, targeting: z.infer<typeof DiscoveryRequestSchema>["targeting"]): DiscoverySearchDraft => ({
  seed: seed.trim(),
  relationshipMode: "Todas as palavras-chave" as DiscoverySearchDraft["relationshipMode"],
  preliminaryIntent: "Não definida" as DiscoverySearchDraft["preliminaryIntent"],
  preliminaryFunnel: "Não definido" as DiscoverySearchDraft["preliminaryFunnel"],
  language: Object.entries(GOOGLE_ADS_DISCOVERY_LANGUAGES).find(([, value]) => value === targeting.language)?.[0] || "Português",
  countryCode: "BR",
  selectedStates: targeting.selectedStates,
  volumeFilter: "Todos" as DiscoverySearchDraft["volumeFilter"],
  cpcFilter: "Todos" as DiscoverySearchDraft["cpcFilter"],
  includeTerms: "",
  excludeTerms: "",
  includeAdultKeywords: targeting.includeAdultKeywords,
});

function isPersistenceUnavailable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "PGRST202" || error.code === "PGRST205" || /does not exist|relation .* does not exist|persist_minerador_discovery_run/i.test(error.message || "")));
}

function persistenceUnavailableResponse(operationRequestId: string | null, apiRequestStarted: boolean, providerResponseReceived = false) {
  return NextResponse.json({ success: false, operationRequestId, code: "DISCOVERY_PERSISTENCE_UNAVAILABLE", stage: "persistence", message: "A persistência da Descoberta ainda não está disponível nesta instalação. Aplique a migration local antes de executar uma nova descoberta.", diagnostic: { apiRequestStarted, providerResponseReceived, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "persistence", httpStatus: null, providerRequestId: null, providerErrorCode: null, providerErrorMessage: null, googleStatus: null, endpoint: null, migration: "0009_minerador_discovery_persistence.sql" } }, { status: 503 });
}

function googleAdsUsageDependencies() {
  const client = createCanonicalServiceClient();
  return {
    repository: createIntegrationRuntimeRepository(client),
    authorizationRepository: createCanonicalAuthorizationRepository(client),
  };
}

type GeoDiagnostic = {
  receivedStateValues: string[];
  selectedStateCodes: string[];
  resolvedGeoTargetConstants: string[];
  resolvedGeoTargetCount: number;
  includesBrazil: boolean;
  language: string;
  network: string;
  selectedStateLabels: string[];
  customerIdRef: string | null;
  customerSource?: "platform";
  researchCustomerConfigured?: true;
  researchCustomerReadback?: "pass";
  requestCustomerSource?: "platform";
  requestCustomerRef?: string | null;
};

type RouteErrorResult = { status: number; code: string; stage: string; message: string; diagnostic: Record<string, unknown> };

function routeError(error: unknown, apiRequestStarted: boolean, geoDiagnostic: GeoDiagnostic | null = null, providerResponseReceived = false, internalStage = "unknown"): RouteErrorResult {
  if (error instanceof GoogleAdsConfigurationBlocker) return { status: error.status, code: error.code, stage: "configuration_validation", message: error.message, diagnostic: { ...(geoDiagnostic || {}), apiRequestStarted: false, providerResponseReceived: false, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "configuration_validation", httpStatus: null, providerRequestId: null, providerErrorCode: null, providerErrorMessage: null, googleStatus: null, endpoint: null, source: "canonical" } };
  if (error instanceof GoogleAdsDiscoveryUsageError) return { status: 503, code: error.code, stage: "usage", message: error.message, diagnostic: { ...(geoDiagnostic || {}), apiRequestStarted, providerResponseReceived, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "usage", httpStatus: null, providerRequestId: null, providerErrorCode: null, providerErrorMessage: null, failedField: null, googleStatus: null, endpoint: null, usageRecorded: false, usageErrorCode: error.causeCode, persisted: true } };
  if (error instanceof IntegrationRuntimeError) return { status: error.status, code: error.code, stage: "integration_runtime", message: error.message, diagnostic: buildGoogleAdsUnknownFailureDiagnostic({ apiRequestStarted, providerResponseReceived, internalStage, extra: { ...(geoDiagnostic || {}), runtime: error.diagnostic, source: "canonical" } }) };
  if (error instanceof GoogleAdsError) {
    if (error.code === "google_ads_configuration") return { status: 503, code: "GOOGLE_ADS_CONFIGURATION", stage: "configuration_validation", message: "A integração Google Ads não está configurada para esta operação.", diagnostic: { ...(geoDiagnostic || {}), apiRequestStarted: false, providerResponseReceived: false, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "configuration_validation", httpStatus: null, providerRequestId: null, providerErrorCode: null, providerErrorMessage: null, googleStatus: null, endpoint: null } };
    if (error.code === "google_ads_quota" || error.code === "google_ads_rate_limited") return { status: 429, code: "GOOGLE_ADS_QUOTA", stage: "provider_request", message: "O limite temporário da Google Ads API foi atingido.", diagnostic: buildGoogleAdsProviderDiagnostic(error, true, geoDiagnostic || {}) };
    const geoTargetRejected = error.code === "google_ads_invalid_request" && Boolean(error.providerField?.toLowerCase().includes("geo") || error.providerCode?.toLowerCase().includes("geo"));
    const failedStateIndex = error.providerField?.match(/\[(\d+)\]/)?.[1];
    const failedState = failedStateIndex && geoDiagnostic ? geoDiagnostic.selectedStateLabels[Number(failedStateIndex)] : null;
    const diagnostic = buildGoogleAdsProviderDiagnostic(error, apiRequestStarted, { ...(geoDiagnostic || {}), detail: failedState ? `Falha ao validar a localização ${failedState}.` : geoTargetRejected && geoDiagnostic ? `A Google Ads rejeitou uma das ${geoDiagnostic.resolvedGeoTargetCount} localidades selecionadas.` : undefined });
    return { status: error.status || 502, code: geoTargetRejected ? "GOOGLE_ADS_GEO_TARGET_INVALID" : "GOOGLE_ADS_DISCOVERY_ERROR", stage: "provider_request", message: geoTargetRejected ? "Uma ou mais localidades selecionadas não foram aceitas." : error.message, diagnostic };
  }
  return { status: 502, code: "GOOGLE_ADS_DISCOVERY_ERROR", stage: "provider_request", message: "Não foi possível concluir a descoberta no Google Ads.", diagnostic: buildGoogleAdsUnknownFailureDiagnostic({ apiRequestStarted, providerResponseReceived, internalStage, extra: geoDiagnostic || {} }) };
}

function asStringArray(value: unknown) { return Array.isArray(value) && value.every(item => typeof item === "string") ? value as string[] : []; }

async function loadRunSnapshot(profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>, brandId: string, runId: string) {
  const runResult = await profile.supabase.from("minerador_discovery_runs").select("*").eq("brand_id", brandId).eq("id", runId).maybeSingle();
  if (runResult.error) throw runResult.error;
  if (!runResult.data) return null;
  const candidateResult = await profile.supabase.from("minerador_discovery_candidates").select("*").eq("brand_id", brandId).eq("discovery_run_id", runId).order("created_at", { ascending: true });
  if (candidateResult.error) throw candidateResult.error;
  const run = runResult.data as Record<string, unknown>;
  const rawCandidates = (candidateResult.data || []).map(row => mapDiscoveryCandidateRow(row as Record<string, unknown>));
  const currentResult = rawCandidates.length ? await profile.supabase.from("minerador_discovery_candidate_current_metrics").select("*").eq("brand_id", brandId).in("candidate_id", rawCandidates.map(candidate => candidate.candidateId)) : { data: [], error: null };
  if (currentResult.error && !isPersistenceUnavailable(currentResult.error)) throw currentResult.error;
  const currentById = new Map((currentResult.data || []).map(row => [String(row.candidate_id), mapDiscoveryCandidateCurrentMetrics(row as Record<string, unknown>)]));
  const candidates = rawCandidates.map(candidate => mergeDiscoveryCandidateCurrentMetrics(candidate, currentById.get(candidate.candidateId)));
  const source = run.source === "manual" || run.source === "csv" ? run.source : "google_ads";
  const firstTargeting = rawCandidates[0]?.targeting;
  const targeting: ExecutedTargeting | null = source === "google_ads" ? {
    countryCode: "BR",
    countryLabel: String(run.country_label || "Brasil"),
    selectedStates: asStringArray(run.selected_states),
    stateLabels: asStringArray(run.state_labels),
    geoTargetConstants: asStringArray(run.geo_target_constants),
    language: firstTargeting?.language || String(run.language_constant || "languageConstants/1014"),
    keywordPlanNetwork: run.keyword_plan_network === "GOOGLE_SEARCH_AND_PARTNERS" ? "GOOGLE_SEARCH_AND_PARTNERS" : "GOOGLE_SEARCH",
    includeAdultKeywords: Boolean(run.include_adult_keywords),
  } : null;
  const draft = {
    seed: typeof run.seed_original === "string" ? run.seed_original : "",
    relationshipMode: (typeof run.relationship_mode === "string" ? run.relationship_mode : "Todas as palavras-chave") as DiscoverySearchDraft["relationshipMode"],
    preliminaryIntent: (typeof run.preliminary_intent === "string" ? run.preliminary_intent : "Não definida") as DiscoverySearchDraft["preliminaryIntent"],
    preliminaryFunnel: (typeof run.preliminary_funnel === "string" ? run.preliminary_funnel : "Não definido") as DiscoverySearchDraft["preliminaryFunnel"],
    language: typeof run.language === "string" ? run.language : "Português",
    countryCode: "BR" as const,
    selectedStates: asStringArray(run.selected_states).length ? asStringArray(run.selected_states) : ["Todos os estados"],
    volumeFilter: (typeof run.volume_filter === "string" ? run.volume_filter : "Todos") as DiscoverySearchDraft["volumeFilter"],
    cpcFilter: (typeof run.cpc_filter === "string" ? run.cpc_filter : "Todos") as DiscoverySearchDraft["cpcFilter"],
    includeTerms: typeof run.include_terms === "string" ? run.include_terms : "",
    excludeTerms: typeof run.exclude_terms === "string" ? run.exclude_terms : "",
    includeAdultKeywords: run.include_adult_keywords === true,
  } as DiscoverySearchDraft;
  return { source, operationRequestId: String(run.operation_request_id), executedAt: String(run.executed_at), draft, candidates, targeting, foundCount: Number(run.received_count || candidates.length), returnedCount: candidates.length, truncated: Boolean(run.response_truncated), nextPageAvailable: Boolean(run.response_truncated) };
}

async function syncCandidateCurrentMetrics(profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>, brandId: string, actorUserId: string, candidates: DiscoveryCandidate[]) {
  if (!candidates.length) return { ready: true };
  const measurableCandidates = candidates.filter(candidate => candidate.source !== "manual" && candidate.source !== "csv");
  if (!measurableCandidates.length) return { ready: true };
  const rows = measurableCandidates.map(candidate => ({ ...currentMetricsSeedFromCandidate(candidate, actorUserId), brand_id: brandId }));
  const result = await profile.supabase.from("minerador_discovery_candidate_current_metrics").upsert(rows, { onConflict: "candidate_id" });
  if (result.error && isPersistenceUnavailable(result.error)) return { ready: false };
  if (result.error) throw result.error;
  return { ready: true };
}

function snapshotResponse(snapshot: Awaited<ReturnType<typeof loadRunSnapshot>>, diagnostic: Record<string, unknown> = {}) {
  if (!snapshot) return NextResponse.json({ success: false, code: "DISCOVERY_RUN_NOT_FOUND", stage: "persistence", message: "A execução da Descoberta não foi encontrada.", diagnostic }, { status: 404 });
  return NextResponse.json({ success: true, restored: true, source: snapshot.source, operationRequestId: snapshot.operationRequestId, executedAt: snapshot.executedAt, draft: snapshot.draft, candidates: snapshot.candidates, targeting: snapshot.targeting, foundCount: snapshot.foundCount, returnedCount: snapshot.returnedCount, truncated: snapshot.truncated, nextPageAvailable: snapshot.nextPageAvailable, diagnostic });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return NextResponse.json({ success: false, code: "BRAND_NOT_FOUND", message: "Marca inválida." }, { status: 404 });
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "view", profile });
    const result = await profile.supabase.from("minerador_discovery_runs").select("id").eq("brand_id", context.brandId).in("status", ["completed", "partial"]).order("executed_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error && isPersistenceUnavailable(result.error)) return NextResponse.json({ success: true, restored: false, persistenceReady: false });
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ success: true, restored: false, persistenceReady: true });
    return snapshotResponse(await loadRunSnapshot(profile, context.brandId, String(result.data.id)), { persistenceReady: true });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ success: false, code: "INVALID_DISCOVERY_REQUEST", stage: "argument_validation", message: "A solicitação de descoberta é inválida." }, { status: 400 });
    return NextResponse.json({ success: false, code: "DISCOVERY_RESTORE_FAILED", stage: "persistence", message: "Não foi possível restaurar a última Descoberta.", diagnostic: { apiRequestStarted: false } }, { status: 503 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  let operationRequestId: string | null = null;
  let apiRequestStarted = false;
  let providerResponseReceived = false;
  let internalStage = "request_validation";
  let usageAttempted = false;
  let usageRecorded = false;
  let providerRequestId: string | null = null;
  let geoDiagnostic: GeoDiagnostic | null = null;
  let canonicalContext: GoogleAdsCanonicalContext | null = null;
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return NextResponse.json({ success: false, code: "BRAND_NOT_FOUND", stage: "authorization", message: "Marca inválida.", diagnostic: { apiRequestStarted: false } }, { status: 404 });
    const input = DiscoveryRequestSchema.parse(await request.json());
    operationRequestId = input.operationRequestId;
    let resolvedTargeting;
    try {
      resolvedTargeting = resolveDiscoveryTargeting(input.targeting.selectedStates);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "GOOGLE_ADS_TOO_MANY_GEO_TARGETS") return NextResponse.json({ success: false, operationRequestId, code: "GOOGLE_ADS_TOO_MANY_GEO_TARGETS", stage: "request_validation", message: "Selecione no máximo 10 estados ou use Todos os estados.", diagnostic: { apiRequestStarted: false, geoTargetCount: input.targeting.selectedStates.length } }, { status: 400 });
      if (message.startsWith("GOOGLE_ADS_INVALID_GEO_TARGET:")) return NextResponse.json({ success: false, operationRequestId, code: "GOOGLE_ADS_TARGETING_INVALID", stage: "request_validation", message: "Uma das UFs selecionadas não pertence ao catálogo habilitado do Brasil.", diagnostic: { apiRequestStarted: false, field: "targeting.selectedStates", selectedLocation: message.split(":")[1] || null, geoTargetCount: input.targeting.selectedStates.length } }, { status: 400 });
      if (message === "GOOGLE_ADS_MIXED_GEO_TARGETS") return NextResponse.json({ success: false, operationRequestId, code: "GOOGLE_ADS_TARGETING_INVALID", stage: "request_validation", message: "Escolha Brasil ou uma lista de UFs, sem misturar os dois modos.", diagnostic: { apiRequestStarted: false, field: "targeting.selectedStates" } }, { status: 400 });
      if (message === "GOOGLE_ADS_DUPLICATE_GEO_TARGETS") return NextResponse.json({ success: false, operationRequestId, code: "GOOGLE_ADS_TARGETING_INVALID", stage: "request_validation", message: "Remova localidades repetidas antes de pesquisar.", diagnostic: { apiRequestStarted: false, field: "targeting.selectedStates" } }, { status: 400 });
      throw error;
    }
    geoDiagnostic = {
      receivedStateValues: input.targeting.selectedStates.map(state => state.trim()),
      selectedStateCodes: resolvedTargeting.selectedStates,
      resolvedGeoTargetConstants: resolvedTargeting.geoTargetConstants,
      resolvedGeoTargetCount: resolvedTargeting.geoTargetConstants.length,
      includesBrazil: resolvedTargeting.geoTargetConstants.includes("geoTargetConstants/2076"),
      language: input.targeting.language,
      network: input.targeting.keywordPlanNetwork,
      selectedStateLabels: resolvedTargeting.stateLabels,
      customerIdRef: null,
    };
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const persistenceProbe = await profile.supabase.from("minerador_discovery_runs").select("id,status").eq("brand_id", context.brandId).eq("operation_request_id", operationRequestId).maybeSingle();
    if (persistenceProbe.error && isPersistenceUnavailable(persistenceProbe.error)) return persistenceUnavailableResponse(operationRequestId, false);
    if (persistenceProbe.error) throw persistenceProbe.error;
    if (persistenceProbe.data?.status === "completed" || persistenceProbe.data?.status === "partial") {
      const snapshot = await loadRunSnapshot(profile, context.brandId, String(persistenceProbe.data.id));
      const isGoogleAdsRun = snapshot?.source === "google_ads";
      if (isGoogleAdsRun) {
        usageAttempted = true;
        await recordGoogleAdsDiscoveryUsage({
          actorUserId: context.actorUserId,
          agencyId: context.agencyId || null,
          brandId: context.brandId,
          operationRequestId: input.operationRequestId,
          resultStatus: "succeeded",
          discoveryRunId: String(persistenceProbe.data.id),
          receivedCount: snapshot?.foundCount,
          normalizedCount: snapshot?.returnedCount,
          providerReference: null,
          dependencies: googleAdsUsageDependencies(),
        });
        usageRecorded = true;
      }
      return snapshotResponse(snapshot, { idempotent: true, persistenceReady: true, usageRecorded, usageResultStatus: usageRecorded ? "succeeded" : null });
    }

    internalStage = "configuration_resolution";
    canonicalContext = await resolveGoogleAdsCanonicalContext({ actorUserId: profile.userId, agencyId: context.agencyId, brandId: context.brandId, operation: "discovery" });
    const canonicalTargeting = canonicalContext.targeting;
    if (canonicalTargeting) assertCanonicalTargeting({ language: input.targeting.language, geoTargetConstants: resolvedTargeting.geoTargetConstants, keywordPlanNetwork: input.targeting.keywordPlanNetwork, includeAdultKeywords: input.targeting.includeAdultKeywords }, canonicalTargeting);
    const { client } = await createGoogleAdsCanonicalClient({ context: canonicalContext });
    const customerRef = maskGoogleAdsConnectionId(canonicalContext.customerId);
    geoDiagnostic = { ...geoDiagnostic, customerIdRef: customerRef, customerSource: "platform", researchCustomerConfigured: true, researchCustomerReadback: "pass", requestCustomerSource: "platform", requestCustomerRef: customerRef };
    apiRequestStarted = true;
    internalStage = "provider_request";
    const account = createGoogleAdsKeywordAccount({ customerId: canonicalContext.customerId, loginCustomerId: canonicalContext.managerCustomerId });
    const targeting = targetingToProviderInput(canonicalTargeting || {
      ...defaultGoogleAdsCanonicalTargeting(),
      languageConstant: input.targeting.language,
      geoTargetConstants: resolvedTargeting.geoTargetConstants,
      keywordPlanNetwork: input.targeting.keywordPlanNetwork,
      includeAdultKeywords: input.targeting.includeAdultKeywords,
    });
    const page = await generateGoogleAdsKeywordIdeas(client, { account: { customerId: account.customerId, loginCustomerId: account.loginCustomerId || undefined }, seed: { kind: "keyword", keywords: [input.seed.trim()] }, targeting, pageSize: GOOGLE_ADS_DISCOVERY_PAGE_CAP }, account);
    providerResponseReceived = true;
    providerRequestId = page.requestId || null;
    internalStage = "response_normalization";
    const canonicalIdeas = new Map<string, typeof page.ideas[number]>();
    for (const idea of page.ideas) if (!canonicalIdeas.has(idea.normalizedKeyword)) canonicalIdeas.set(idea.normalizedKeyword, idea);
    internalStage = "persistence";
    const { data: existingRows, error: existingError } = await profile.supabase.from("minerador_keywords").select("id,keyword").eq("brand_id", context.brandId);
    if (existingError) throw existingError;
    const existingByCanonical = new Map((existingRows || []).map(row => [normalizeGoogleAdsKeyword(String(row.keyword || "")), String(row.id)]));
    const candidates = [...canonicalIdeas.values()].map((idea, index) => ({ candidateId: `${operationRequestId}:${index + 1}`, keyword: idea.keyword, canonicalKeyword: idea.normalizedKeyword, averageMonthlySearches: idea.averageMonthlySearches, monthlySearchVolumes: idea.monthlySearchVolumes, competition: idea.competition, competitionIndex: idea.competitionIndex, lowTopOfPageBidMicros: idea.lowTopOfPageBidMicros, highTopOfPageBidMicros: idea.highTopOfPageBidMicros, averageCpcMicros: idea.averageCpcMicros, currencyCode: idea.currencyCode, timeZone: idea.timeZone, targeting: idea.targeting, source: "google_ads" as const, sourceData: null, provider: idea.provider, providerVersion: idea.providerVersion, measuredAt: idea.measuredAt, existingKeywordId: existingByCanonical.get(idea.normalizedKeyword) || null } satisfies DiscoveryCandidate));
    const executedTargeting: ExecutedTargeting = { ...resolvedTargeting, language: input.targeting.language, keywordPlanNetwork: input.targeting.keywordPlanNetwork, includeAdultKeywords: input.targeting.includeAdultKeywords };
    const draft = (input.draft ? { ...input.draft, seed: input.seed.trim(), selectedStates: input.targeting.selectedStates } : defaultDraft(input.seed, input.targeting)) as DiscoverySearchDraft;
    const applied = applyDiscoveryFilters(candidates, draft);
    const executedAt = new Date().toISOString();
    const runId = crypto.randomUUID();
    const runRow = buildDiscoveryRunRow({ id: runId, brandId: context.brandId, actorUserId: context.actorUserId, operationRequestId, draft, targeting: executedTargeting, providerVersion: "v25", currencyCode: account.currencyCode, timeZone: account.timeZone, status: page.nextPageToken ? "partial" : "completed", receivedCount: page.ideas.length, normalizedCount: candidates.length, approvedCount: applied.acceptedCandidates.length, filteredCount: candidates.length - applied.acceptedCandidates.length, responseTruncated: Boolean(page.nextPageToken) || page.ideas.length >= GOOGLE_ADS_DISCOVERY_PAGE_CAP, executedAt });
    const candidateRows = buildDiscoveryCandidateRows({ brandId: context.brandId, runId, draft, candidates, decisions: applied.decisions });
    const persistResult = await profile.supabase.rpc("persist_minerador_discovery_run", { p_run: runRow, p_candidates: candidateRows });
    if (persistResult.error && isPersistenceUnavailable(persistResult.error)) return persistenceUnavailableResponse(operationRequestId, true, true);
    if (persistResult.error) throw persistResult.error;
    const persistedRunId = persistResult.data && typeof persistResult.data === "object" && "runId" in persistResult.data ? String((persistResult.data as { runId: string }).runId) : runId;
    const snapshot = await loadRunSnapshot(profile, context.brandId, persistedRunId);
    if (snapshot) await syncCandidateCurrentMetrics(profile, context.brandId, context.actorUserId, snapshot.candidates);
    if (!snapshot) return snapshotResponse(snapshot, { apiRequestStarted: true, providerResponseReceived: true, failureType: "INTERNAL_POST_REQUEST_ERROR", internalStage: "persistence", googleAdsRequestId: providerRequestId, provider: "google_ads", providerVersion: "v25", persisted: false, usageRecorded: false });
    internalStage = "usage";
    usageAttempted = true;
    await recordGoogleAdsDiscoveryUsage({
      actorUserId: context.actorUserId,
      agencyId: context.agencyId || null,
      brandId: context.brandId,
      operationRequestId: input.operationRequestId,
      resultStatus: "succeeded",
      providerReference: providerRequestId,
      discoveryRunId: persistedRunId,
      receivedCount: page.ideas.length,
      normalizedCount: candidates.length,
      approvedCount: applied.acceptedCandidates.length,
      filteredCount: candidates.length - applied.acceptedCandidates.length,
      dependencies: googleAdsUsageDependencies(),
    });
    usageRecorded = true;
    return snapshotResponse(snapshot, { apiRequestStarted: true, providerResponseReceived: true, failureType: "PROVIDER_SUCCESS", internalStage: "usage", googleAdsRequestId: providerRequestId, provider: "google_ads", providerVersion: "v25", persisted: true, usageRecorded: true, usageResultStatus: "succeeded", idempotent: Boolean(persistResult.data && typeof persistResult.data === "object" && "idempotent" in persistResult.data && (persistResult.data as { idempotent: boolean }).idempotent) });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ success: false, operationRequestId, code: "INVALID_DISCOVERY_REQUEST", stage: "argument_validation", message: "A solicitação de descoberta é inválida.", diagnostic: { apiRequestStarted: false, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) } }, { status: 400 });
    let usageRecordingErrorCode: string | null = null;
    if (apiRequestStarted && canonicalContext && operationRequestId && !usageAttempted) {
      usageAttempted = true;
      try {
        await recordGoogleAdsDiscoveryUsage({
          actorUserId: canonicalContext.actorUserId,
          agencyId: canonicalContext.agencyId,
          brandId: canonicalContext.brandId,
          operationRequestId,
          resultStatus: "failed",
          providerReference: providerRequestId || (error instanceof GoogleAdsError ? error.requestId || null : null),
          errorCode: error instanceof GoogleAdsError ? error.providerCode || error.code : "GOOGLE_ADS_DISCOVERY_ERROR",
          dependencies: googleAdsUsageDependencies(),
        });
        usageRecorded = true;
      } catch (usageError) {
        usageRecordingErrorCode = usageError instanceof GoogleAdsDiscoveryUsageError ? usageError.causeCode : "GOOGLE_ADS_USAGE_RECORDING_FAILED";
      }
    }
    const mapped = routeError(error, apiRequestStarted, geoDiagnostic, providerResponseReceived, internalStage);
    mapped.diagnostic = { ...mapped.diagnostic, usageAttempted, usageRecorded, usageResultStatus: usageRecorded ? (error instanceof GoogleAdsDiscoveryUsageError ? null : "failed") : null, usageRecordingErrorCode };
    return NextResponse.json({ success: false, operationRequestId, ...mapped }, { status: mapped.status });
  }
}
