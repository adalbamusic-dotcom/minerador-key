import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { isTenantId } from "@/lib/tenant-routing";
import { AuthzError, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { DiscoveryImportRequestSchema, DiscoveryImportResponseSchema } from "@/lib/minerador/discovery-import";
import { importKeywordsWithCore, type KeywordImportCoreItem } from "@/lib/minerador/keyword-import-core";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JsonRecord = Record<string, unknown>;

class DiscoveryImportError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly stage = "import_persistence",
    readonly diagnostic: JsonRecord = {},
  ) {
    super(message);
    this.name = "DiscoveryImportError";
  }
}

function failure(code: string, status: number, message: string, diagnostic: JsonRecord = {}, stage = "import_persistence") {
  return NextResponse.json({ success: false, code, stage, message, diagnostic }, { status });
}

function sanitizeDatabaseError(error: unknown) {
  const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const databaseCode = typeof value.code === "string" && /^[A-Z0-9_ -]{1,40}$/.test(value.code) ? value.code : "database_error";
  const databaseMessage = typeof value.message === "string"
    ? value.message.replace(/(service[_ -]?role|access[_ -]?token|refresh[_ -]?token|developer[_ -]?token|authorization|cookie|password)\s*[:=]?\s*[^\s,;]+/gi, "$1=[redacted]").slice(0, 240)
    : "A camada de persistencia retornou um erro sem mensagem.";
  return { databaseCode, databaseMessage };
}

function asStringArray(value: unknown) {
  return Array.isArray(value) && value.every(item => typeof item === "string") ? value as string[] : [];
}

function asNumberOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

type DiscoveryCandidateSource = "google_ads" | "manual" | "csv";

function candidateSource(candidate: JsonRecord): DiscoveryCandidateSource {
  return candidate.source === "manual" || candidate.source === "csv" ? candidate.source : "google_ads";
}

function candidateDiagnostic(candidate: JsonRecord, reason: string, errorCode: string) {
  return {
    candidateId: String(candidate.id),
    keyword: String(candidate.keyword_original || "").trim() || "(sem keyword)",
    source: candidateSource(candidate),
    reason,
    errorCode,
  } satisfies JsonRecord;
}

function sameUuidArray(left: unknown, right: string[]) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function isImportableRun(run: JsonRecord) {
  return run.status === "completed" || (run.status === "partial" && Boolean(run.completed_at));
}

function runDiagnostic(run: JsonRecord, candidateCount: number) {
  return {
    runStatus: typeof run.status === "string" ? run.status : "unknown",
    completedAtPresent: Boolean(run.completed_at),
    candidateCount,
  };
}

function buildSourceSnapshot(run: JsonRecord, candidate: JsonRecord, current: JsonRecord | null = null) {
  const metric = (name: string, fallback: unknown) => current && Object.prototype.hasOwnProperty.call(current, name) ? current[name] : fallback;
  return {
    discoveryRunId: candidate.discovery_run_id,
    discoveryCandidateId: candidate.id,
    seedOriginal: run.seed_original,
    seedCanonical: run.seed_canonical,
    relationshipMode: run.relationship_mode,
    source: candidate.source || run.source || "google_ads",
    sourceData: candidate.source_data || null,
    preliminaryIntent: candidate.preliminary_intent,
    preliminaryFunnel: candidate.preliminary_funnel,
    selectedStates: asStringArray(run.selected_states),
    stateLabels: asStringArray(run.state_labels),
    targeting: candidate.targeting,
    provider: candidate.provider,
    providerVersion: candidate.provider_version,
    measuredAt: candidate.measured_at,
    metrics: {
      averageMonthlySearches: metric("volume_search", candidate.average_monthly_searches) ?? null,
      monthlySearchVolumes: metric("monthly_search_volumes", candidate.monthly_search_volumes) ?? [],
      competition: metric("competition", candidate.competition) ?? null,
      competitionIndex: metric("competition_index", candidate.competition_index) ?? null,
      lowTopOfPageBidMicros: metric("low_top_of_page_bid_micros", candidate.low_top_of_page_bid_micros) ?? null,
      highTopOfPageBidMicros: metric("high_top_of_page_bid_micros", candidate.high_top_of_page_bid_micros) ?? null,
      averageCpcMicros: metric("average_cpc_micros", candidate.average_cpc_micros) ?? null,
      currencyCode: metric("currency_code", candidate.currency_code),
      timeZone: candidate.time_zone,
      resultsAllintitle: metric("results_allintitle", null),
      allintitleMeasuredAt: metric("allintitle_measured_at", null),
    },
  } satisfies JsonRecord;
}

function toCoreItem(run: JsonRecord, candidate: JsonRecord, current: JsonRecord | null = null): KeywordImportCoreItem {
  const source = candidateSource(candidate);
  const selectedStates = source === "google_ads" ? asStringArray(run.selected_states) : [];
  const volume = source === "google_ads" ? asNumberOrNull(current?.volume_search ?? candidate.average_monthly_searches) : null;
  const resultsAllintitle = source === "google_ads" ? asNumberOrNull(current?.results_allintitle) : null;
  const sourceData = candidate.source_data && typeof candidate.source_data === "object" && !Array.isArray(candidate.source_data) ? candidate.source_data as JsonRecord : null;
  const listaId = typeof sourceData?.listaId === "string" && sourceData.listaId.trim() ? sourceData.listaId : null;
  const locations = selectedStates.map(stateCode => ({ countryCode: "BR" as const, stateCode }));
  const funnel = candidate.preliminary_funnel === "TOFU" || candidate.preliminary_funnel === "MOFU" || candidate.preliminary_funnel === "BOFU"
    ? candidate.preliminary_funnel
    : undefined;
  return {
    keyword: String(candidate.keyword_original || ""),
    source: "discovery",
    status: "bruto",
    intentHint: typeof candidate.preliminary_intent === "string" ? [candidate.preliminary_intent] : undefined,
    funnelHint: funnel,
    resultsAllintitle,
    resultsStatus: resultsAllintitle === null ? "pending" : "success",
    volume,
    volumeStatus: volume === null ? "not_found" : "success",
    volumeSource: source === "google_ads" ? "google_ads" : undefined,
    volumeMeasuredAt: typeof current?.metrics_measured_at === "string" ? current.metrics_measured_at : typeof candidate.measured_at === "string" ? candidate.measured_at : undefined,
    locations,
    extractionBatchId: String(run.id),
    discoveryRunId: String(candidate.discovery_run_id),
    discoverySource: source,
    listaId,
    sourceSnapshot: buildSourceSnapshot(run, candidate, current),
  };
}

async function getBatch(client: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>["supabase"], brandId: string, importRequestId: string) {
  const result = await client.from("minerador_discovery_import_batches").select("*").eq("brand_id", brandId).eq("import_request_id", importRequestId).maybeSingle();
  if (result.error) throw result.error;
  return result.data as JsonRecord | null;
}

async function createOrRecoverBatch(input: {
  client: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>["supabase"];
  brandId: string;
  actorUserId: string;
  importRequestId: string;
  discoveryRunId: string;
  candidateIds: string[];
}) {
  const current = await getBatch(input.client, input.brandId, input.importRequestId);
  if (current) {
    if (!sameUuidArray(current.candidate_ids, input.candidateIds)) {
      throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_REQUEST_REUSED", 409, "Este importRequestId ja foi usado com outra selecao.");
    }
    return current;
  }
  const inserted = await input.client.from("minerador_discovery_import_batches").insert({
    brand_id: input.brandId,
    actor_user_id: input.actorUserId,
    import_request_id: input.importRequestId,
    discovery_run_id: input.discoveryRunId,
    candidate_ids: input.candidateIds,
    status: "pending",
    selected_count: input.candidateIds.length,
  }).select("*").maybeSingle();
  if (inserted.error) {
    const recovered = await getBatch(input.client, input.brandId, input.importRequestId);
    if (recovered) {
      if (!sameUuidArray(recovered.candidate_ids, input.candidateIds)) throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_REQUEST_REUSED", 409, "Este importRequestId ja foi usado com outra selecao.");
      return recovered;
    }
    throw inserted.error;
  }
  if (!inserted.data) throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_BATCH_NOT_CREATED", 503, "O lote de importacao nao foi criado.");
  return inserted.data as JsonRecord;
}

async function linkOrigin(input: {
  client: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>["supabase"];
  brandId: string;
  keywordId: string;
  candidateId: string;
  runId: string;
  batchId: string;
  actorUserId: string;
  sourceSnapshot: JsonRecord;
}) {
  const existing = await input.client.from("minerador_discovery_keyword_origins").select("id").eq("brand_id", input.brandId).eq("keyword_id", input.keywordId).eq("discovery_candidate_id", input.candidateId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return;
  const inserted = await input.client.from("minerador_discovery_keyword_origins").insert({
    brand_id: input.brandId,
    keyword_id: input.keywordId,
    discovery_candidate_id: input.candidateId,
    discovery_run_id: input.runId,
    import_batch_id: input.batchId,
    actor_user_id: input.actorUserId,
    source_snapshot: input.sourceSnapshot,
  });
  if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  if (inserted.error) {
    const retry = await input.client.from("minerador_discovery_keyword_origins").select("id").eq("brand_id", input.brandId).eq("keyword_id", input.keywordId).eq("discovery_candidate_id", input.candidateId).maybeSingle();
    if (retry.error || !retry.data) throw inserted.error;
  }
}

async function verifyCandidateImport(input: {
  client: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>["supabase"];
  brandId: string;
  candidateId: string;
  keywordId: string;
}) {
  const readback = await input.client
    .from("minerador_discovery_candidates")
    .select("import_status,imported_keyword_id")
    .eq("id", input.candidateId)
    .eq("brand_id", input.brandId)
    .maybeSingle();
  if (readback.error) {
    throw new DiscoveryImportError(
      "MINERADOR_DISCOVERY_IMPORT_CANDIDATE_READBACK_FAILED",
      503,
      "A candidata não confirmou o vínculo com o Processador.",
      "candidate_readback",
      { databaseCode: sanitizeDatabaseError(readback.error).databaseCode },
    );
  }
  const data = readback.data as { import_status?: unknown; imported_keyword_id?: unknown } | null;
  if (data?.import_status !== "imported" || String(data.imported_keyword_id || "") !== input.keywordId) {
    throw new DiscoveryImportError(
      "MINERADOR_DISCOVERY_IMPORT_CANDIDATE_READBACK_FAILED",
      503,
      "A candidata não confirmou o vínculo com o Processador.",
      "candidate_readback",
      { status: typeof data?.import_status === "string" ? data.import_status : "missing", keywordIdMatched: String(data?.imported_keyword_id || "") === input.keywordId },
    );
  }
}

async function persistBatchResult(client: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>["supabase"], batchId: string, result: JsonRecord) {
  const update = await client.from("minerador_discovery_import_batches").update({ ...result, completed_at: new Date().toISOString() }).eq("id", batchId);
  if (update.error) throw update.error;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", 404, "Marca invalida.", { requestId, brandIdValidated: false }, "tenant_validation");
    const input = DiscoveryImportRequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "create", profile });
    const candidateResult = await profile.supabase.from("minerador_discovery_candidates").select("*").eq("brand_id", context.brandId).in("id", input.candidateIds);
    if (candidateResult.error) throw candidateResult.error;
    const candidates = (candidateResult.data || []) as JsonRecord[];
    if (candidates.length !== input.candidateIds.length) throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_CANDIDATE_NOT_FOUND", 404, "Uma das candidatas nao pertence a marca ativa.");
    const currentResult = await profile.supabase.from("minerador_discovery_candidate_current_metrics").select("*").eq("brand_id", context.brandId).in("candidate_id", input.candidateIds);
    const currentMetricsUnavailable = Boolean(currentResult.error && /does not exist|relation .* does not exist|PGRST205/i.test(String(currentResult.error.message || currentResult.error.code || "")));
    const currentByCandidateId = currentMetricsUnavailable
      ? new Map<string, JsonRecord>()
      : new Map((currentResult.data || []).map(row => [String(row.candidate_id), row as JsonRecord]));
    if (currentResult.error && !currentMetricsUnavailable) throw currentResult.error;

    const runIds = [...new Set(candidates.map(candidate => String(candidate.discovery_run_id || "")))];
    if (runIds.length !== 1 || !runIds[0]) throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_MULTIPLE_RUNS", 409, "As candidatas selecionadas pertencem a execucoes diferentes.");
    const runResult = await profile.supabase.from("minerador_discovery_runs").select("*").eq("brand_id", context.brandId).eq("id", runIds[0]).maybeSingle();
    if (runResult.error) throw runResult.error;
    const run = runResult.data as JsonRecord | null;
    if (!run) throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_RUN_NOT_FOUND", 404, "A execucao da Descoberta nao foi encontrada.");
    if (!isImportableRun(run)) throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_RUN_NOT_COMPLETED", 409, "A execucao da candidata ainda nao esta concluida.", "import_validation", runDiagnostic(run, candidates.length));
    if (candidates.some(candidate => candidate.filter_outcome !== "approved")) throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_CANDIDATE_NOT_APPROVED", 409, "Somente candidatas aprovadas pelos filtros podem ser enviadas.");

    const candidateIds = [...input.candidateIds].sort();
    const batch = await createOrRecoverBatch({ client: profile.supabase, brandId: context.brandId, actorUserId: context.actorUserId, importRequestId: input.importRequestId, discoveryRunId: String(run.id), candidateIds });
    if (batch.status === "completed") {
      const parsed = DiscoveryImportResponseSchema.safeParse({ ...batch, batchId: batch.id, alreadyExisting: batch.already_existing_count, selected: batch.selected_count, created: batch.created_count, linked: batch.linked_count, rejected: batch.rejected_count, failed: batch.failed_count, failureReasons: batch.failure_reasons, resultItems: batch.result_items, idempotent: true });
      if (!parsed.success) throw new DiscoveryImportError("MINERADOR_DISCOVERY_IMPORT_INVALID_BATCH", 502, "O lote persistido retornou uma resposta incompativel.");
      return NextResponse.json({ success: true, requestId, ...parsed.data });
    }

    const candidatesById = new Map(candidates.map(candidate => [String(candidate.id), candidate]));
    const orderedCandidates = candidateIds.map(id => candidatesById.get(id)).filter((candidate): candidate is JsonRecord => Boolean(candidate));
    const core = await importKeywordsWithCore({
      brandId: context.brandId,
      actorUserId: context.actorUserId,
      supabase: profile.supabase,
      items: orderedCandidates.map(candidate => toCoreItem(run, candidate, currentByCandidateId.get(String(candidate.id)) || null)),
    });
    const coreByIndex = new Map(core.items.map(item => [item.index, item]));
    const resultItems: JsonRecord[] = [];
    const failureReasons: JsonRecord[] = [];
    let created = 0;
    let alreadyExisting = 0;
    let linked = 0;
    let rejected = 0;
    let failed = 0;

    for (const [index, candidate] of orderedCandidates.entries()) {
      const candidateId = String(candidate.id);
      const coreItem = coreByIndex.get(index);
      if (!coreItem || coreItem.outcome === "duplicate") {
        rejected += 1;
        const reason = coreItem?.reason || "duplicate_in_batch";
        const errorCode = coreItem?.errorCode || reason;
        const diagnostic = candidateDiagnostic(candidate, reason, errorCode);
        failureReasons.push(diagnostic);
        resultItems.push({ ...diagnostic, keywordId: null, outcome: "failed" });
        continue;
      }
      if (coreItem.outcome === "failed" || !coreItem.keywordId) {
        failed += 1;
        const reason = coreItem.reason || "keyword_import_failed";
        const errorCode = coreItem.errorCode || reason;
        const diagnostic = candidateDiagnostic(candidate, reason, errorCode);
        failureReasons.push(diagnostic);
        resultItems.push({ ...diagnostic, keywordId: coreItem.keywordId || null, outcome: "failed" });
        continue;
      }
      try {
        const snapshot = buildSourceSnapshot(run, candidate, currentByCandidateId.get(candidateId) || null);
        await linkOrigin({ client: profile.supabase, brandId: context.brandId, keywordId: coreItem.keywordId, candidateId, runId: String(run.id), batchId: String(batch.id), actorUserId: context.actorUserId, sourceSnapshot: snapshot });
        const candidateUpdate = await profile.supabase.from("minerador_discovery_candidates").update({ import_status: "imported", imported_keyword_id: coreItem.keywordId }).eq("id", candidateId).eq("brand_id", context.brandId);
        if (candidateUpdate.error) throw candidateUpdate.error;
        await verifyCandidateImport({ client: profile.supabase, brandId: context.brandId, candidateId, keywordId: coreItem.keywordId });
        if (!currentMetricsUnavailable) {
          const currentLink = await profile.supabase.from("minerador_discovery_candidate_current_metrics").update({ keyword_id: coreItem.keywordId, updated_by: context.actorUserId, updated_at: new Date().toISOString() }).eq("candidate_id", candidateId).eq("brand_id", context.brandId);
          if (currentLink.error) throw currentLink.error;
        }
        if (coreItem.outcome === "created") created += 1;
        else alreadyExisting += 1;
        linked += 1;
        resultItems.push({ candidateId, keyword: String(candidate.keyword_original || "").trim() || "(sem keyword)", source: candidateSource(candidate), keywordId: coreItem.keywordId, outcome: coreItem.outcome === "created" ? "created" : "already_existing" });
      } catch (error) {
        failed += 1;
        const database = sanitizeDatabaseError(error);
        const reason = error instanceof DiscoveryImportError ? error.message : "candidate_provenance_persist_failed";
        const errorCode = error instanceof DiscoveryImportError ? error.code : database.databaseCode;
        const diagnostic = candidateDiagnostic(candidate, reason, errorCode);
        failureReasons.push(diagnostic);
        resultItems.push({ ...diagnostic, keywordId: coreItem.keywordId, outcome: "failed" });
        console.error("[minerador.discovery.import] provenance failed", { requestId, brandId: context.brandId, candidateId, error: sanitizeDatabaseError(error) });
      }
    }

    const status = failed === 0 && rejected === 0 ? "completed" : created + alreadyExisting > 0 ? "partial" : "failed";
    const response = { batchId: String(batch.id), status, selected: candidateIds.length, created, alreadyExisting, linked, rejected, failed, failureReasons, resultItems, idempotent: false };
    await persistBatchResult(profile.supabase, String(batch.id), { status, selected_count: response.selected, created_count: created, already_existing_count: alreadyExisting, linked_count: linked, rejected_count: rejected, failed_count: failed, failure_reasons: failureReasons, result_items: resultItems });
    return NextResponse.json({ success: true, requestId, ...response });
  } catch (error) {
    if (error instanceof ZodError) return failure("INVALID_DISCOVERY_IMPORT", 400, "A solicitacao de importacao e invalida.", { requestId, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) }, "payload_validation");
    if (error instanceof AuthzError) return failure(error.status === 401 ? "DISCOVERY_IMPORT_UNAUTHENTICATED" : "DISCOVERY_IMPORT_AUTHORIZATION_FAILED", error.status, error.message, { requestId, actorResolved: false }, "authorization");
    if (error instanceof DiscoveryImportError) return failure(error.code, error.status, error.message, { requestId, ...error.diagnostic }, error.stage);
    return failure("DISCOVERY_IMPORT_FAILED", 503, "A importacao nao pode ser concluida.", { requestId, ...sanitizeDatabaseError(error) }, "import_persistence");
  }
}
