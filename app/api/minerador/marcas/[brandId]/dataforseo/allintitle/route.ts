import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { isTenantId } from "@/lib/tenant-routing";
import { buildDataForSeoKeywordFailureSemantic, buildDataForSeoKeywordMeasurementPatch } from "@/lib/minerador/dataforseo-allintitle";
import { resolveDataForSeoCanonicalConfig, DataForSeoCanonicalError } from "@/lib/minerador/dataforseo-canonical";
import { measureDataForSeoAllintitle, type DataForSeoAllintitleMeasurement, DataForSeoSerpError } from "@/lib/minerador/dataforseo-serp";
import { measureDataForSeoKeywordOverview, DataForSeoKeywordOverviewError, type DataForSeoKeywordOverviewMeasurement } from "@/lib/minerador/dataforseo-keyword-overview";
import { executeDataForSeoSerpOperation } from "@/lib/server/dataforseo-serp-operation";
import { deriveSerpSemanticEvidence, type SerpSemanticEvidence } from "@/lib/minerador/serp-semantic-evidence";
import { buildKeywordSemanticQualification, type KeywordSemanticQualification } from "@/lib/minerador/keyword-semantic-qualification";
import { KeywordSemanticQualificationPersistenceError, persistKeywordSemanticQualification, readCurrentKeywordSemanticQualifications } from "@/lib/server/keyword-semantic-qualification-store";
import { classifyQualificationPersistenceError } from "@/lib/minerador/keyword-semantic-qualification-row";
import { DataForSeoTargetingError, resolveDataForSeoTargeting } from "@/lib/minerador/dataforseo-targeting";
import { IntegrationRuntimeError, recordIntegrationUsage } from "@/lib/server/integrations-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  operationRequestId: z.string().uuid(),
  keywordIds: z.array(z.string().uuid()).default([]),
  candidateIds: z.array(z.string().uuid()).default([]),
}).superRefine((value, context) => {
  const total = new Set([...value.keywordIds, ...value.candidateIds]).size;
  if (!total) context.addIssue({ code: "custom", path: ["keywordIds"], message: "Selecione pelo menos uma keyword ou candidata." });
  if (total > 1000) context.addIssue({ code: "custom", path: ["keywordIds"], message: "O lote de allintitle excede o limite operacional de 1.000 alvos." });
});

type JsonObject = Record<string, unknown>;
type TargetKind = "keyword" | "discovery_candidate";
type LoadedTarget = {
  targetKind: TargetKind;
  targetId: string;
  candidateId: string | null;
  keywordId: string | null;
  keyword: string;
  keywordRow: JsonObject | null;
  candidateRow: JsonObject | null;
  currentRow: JsonObject | null;
};

type TargetSuccess = {
  targetKind: TargetKind;
  targetId: string;
  candidateId: string | null;
  keywordId: string | null;
  resultsAllintitle: number;
  measuredAt: string;
  provider: "dataforseo";
  providerVersion: "v3";
  measurementKind: "first" | "updated";
  keywordDifficulty: number | null;
  keywordOverview: DataForSeoKeywordOverviewMeasurement | null;
  keywordOverviewError: { code: string; message: string; providerRequestId: string | null } | null;
  /** Evidência semântica da SERP natural; independente do Resultado e do KGR. */
  serpEvidence: SerpSemanticEvidence | null;
  serpError: { code: string; message: string; providerRequestId: string | null } | null;
};

type TargetFailure = {
  targetKind: TargetKind;
  targetId: string;
  code: string;
  message: string;
  providerRequestId: string | null;
};

function responseFailure(code: string, stage: string, message: string, status: number, diagnostic: JsonObject = {}) {
  return NextResponse.json({ success: false, code, stage, message, diagnostic: { ...diagnostic, apiRequestStarted: diagnostic.apiRequestStarted === true } }, { status });
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function safeDatabaseError(error: unknown) {
  const value = asObject(error);
  const code = typeof value?.code === "string" && /^[A-Z0-9_ -]{1,40}$/.test(value.code) ? value.code : "database_error";
  return { code, message: typeof value?.message === "string" ? value.message.replace(/(token|secret|password|authorization)\s*[:=]?\s*[^\s,;]+/gi, "$1=[redacted]").slice(0, 240) : "A persistência retornou um erro sem mensagem." };
}

function targetingInput(target: LoadedTarget): { geoTargetConstants?: unknown; languageCode?: string | null } {
  const currentTargeting = asObject(target.currentRow?.targeting);
  const snapshotTargeting = asObject(target.candidateRow?.targeting);
  const source = currentTargeting || snapshotTargeting;
  return { geoTargetConstants: source?.geoTargetConstants, languageCode: typeof source?.language === "string" ? source.language : typeof source?.languageCode === "string" ? source.languageCode : null };
}

function currentOperationId(target: LoadedTarget): string | null {
  const candidateOperation = target.currentRow?.allintitle_operation_request_id;
  if (typeof candidateOperation === "string") return candidateOperation;
  const semantic = asObject(target.keywordRow?.analise_semantica);
  const measurement = asObject(semantic?.allintitle_measurement);
  return typeof measurement?.operationRequestId === "string" ? measurement.operationRequestId : null;
}

function currentMeasuredAt(target: LoadedTarget): string | null {
  const candidateMeasuredAt = target.currentRow?.allintitle_measured_at;
  if (typeof candidateMeasuredAt === "string") return candidateMeasuredAt;
  const semantic = asObject(target.keywordRow?.analise_semantica);
  const measurement = asObject(semantic?.allintitle_measurement);
  return typeof measurement?.measuredAt === "string" ? measurement.measuredAt : null;
}

function isStale(target: LoadedTarget, startedAt: string, operationRequestId: string) {
  const measuredAt = currentMeasuredAt(target);
  return Boolean(measuredAt && currentOperationId(target) !== operationRequestId && Date.parse(measuredAt) > Date.parse(startedAt));
}

function hasCurrentAllintitle(target: LoadedTarget) {
  return numberOrNull(target.currentRow?.results_allintitle ?? target.keywordRow?.results_allintitle) !== null;
}

function mapProviderError(error: unknown): { code: string; message: string; status: number; providerRequestId: string | null } {
  if (error instanceof DataForSeoTargetingError) return { code: error.code, message: error.message, status: 422, providerRequestId: null };
  if (error instanceof DataForSeoKeywordOverviewError) return { code: error.code, message: error.message, status: error.status, providerRequestId: error.providerRequestId };
  if (error instanceof DataForSeoSerpError) return { code: error.code, message: error.message, status: error.status, providerRequestId: error.providerRequestId };
  return { code: "dataforseo_persistence", message: "Não foi possível salvar a medição allintitle.", status: 503, providerRequestId: null };
}

function usageKey(operationRequestId: string, target: LoadedTarget) {
  return `dataforseo:${operationRequestId}:${target.targetKind}:${target.targetId}`;
}

type SemanticSerpOutcome = {
  evidence: SerpSemanticEvidence | null;
  error: { code: string; message: string; providerRequestId: string | null } | null;
  providerRequestId: string | null;
  cost: number | null;
};

/**
 * CALL 3 — SERP orgânica da keyword natural. Depois do preflight comum, é
 * independente das outras duas finalidades: pode rodar mesmo quando a medição
 * allintitle ou o Keyword Overview falharem, e falhar aqui não invalida nada.
 */
async function collectSemanticSerp(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  operationRequestId: string;
  config: Awaited<ReturnType<typeof resolveDataForSeoCanonicalConfig>>["config"];
  onRequestStarted: () => void;
}): Promise<SemanticSerpOutcome> {
  try {
    const serp = await executeDataForSeoSerpOperation({
      keyword: input.keyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      device: "desktop",
      // A leitura semântica precisa da SERP completa: blocos de feature e campos
      // estruturais (preço, rating, PAA) que o `regular` não devolve.
      resultLimit: 20,
      payloadDepth: "advanced",
      operationRequestId: input.operationRequestId,
    }, { config: input.config, onRequestStarted: input.onRequestStarted });
    const task = serp.body && typeof serp.body === "object" && !Array.isArray(serp.body) && Array.isArray((serp.body as { tasks?: unknown[] }).tasks)
      ? (serp.body as { tasks: unknown[] }).tasks[0] as JsonObject | undefined
      : undefined;
    const cost = task && typeof task.cost === "number" && Number.isFinite(task.cost) ? task.cost : null;
    const evidence = deriveSerpSemanticEvidence({
      body: serp.body,
      keyword: input.keyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      device: "desktop",
      providerRequestId: serp.providerRequestId,
      operationRequestId: input.operationRequestId,
      collectedAt: new Date().toISOString(),
    });
    return {
      evidence,
      error: evidence ? null : { code: "dataforseo_serp_unusable", message: "A SERP natural retornou sem resultados aproveitáveis para a evidência semântica.", providerRequestId: serp.providerRequestId },
      providerRequestId: serp.providerRequestId,
      cost,
    };
  } catch (error) {
    const mapped = mapProviderError(error);
    return { evidence: null, error: { code: mapped.code, message: mapped.message, providerRequestId: mapped.providerRequestId }, providerRequestId: mapped.providerRequestId, cost: null };
  }
}

async function recordTargetUsage(input: {
  resource: Awaited<ReturnType<typeof resolveDataForSeoCanonicalConfig>>["resource"];
  target: LoadedTarget;
  operationRequestId: string;
  resultStatus: "succeeded" | "failed";
  costAmount?: number | null;
  providerReference?: string | null;
  errorCode?: string | null;
}) {
  return recordIntegrationUsage({
    resource: input.resource,
    operation: "module_operation",
    module: "minerador",
    resultStatus: input.resultStatus,
    units: 1,
    costAmount: input.costAmount ?? null,
    providerReference: input.providerReference ?? null,
    errorCode: input.errorCode ?? null,
    idempotencyKey: usageKey(input.operationRequestId, input.target),
    metadata: {
      operationRequestId: input.operationRequestId,
      targetKind: input.target.targetKind,
      targetId: input.target.targetId,
    },
  });
}

function currentPatch(measurement: DataForSeoAllintitleMeasurement, operationRequestId: string, actorUserId: string, targeting: JsonObject) {
  return {
    results_allintitle: measurement.resultsAllintitle,
    allintitle_status: "measured" as const,
    allintitle_measured_at: measurement.measuredAt,
    allintitle_provider: measurement.provider,
    allintitle_executor: "minerador_server",
    allintitle_error_code: null,
    allintitle_error_message: null,
    allintitle_operation_request_id: operationRequestId,
    allintitle_batch_id: null,
    targeting,
    updated_by: actorUserId,
    updated_at: measurement.measuredAt,
  };
}

function historyRow(input: { brandId: string; target: LoadedTarget; previous: JsonObject | null; measurement: DataForSeoAllintitleMeasurement | null; overview?: DataForSeoKeywordOverviewMeasurement | null; targeting: JsonObject; actorUserId: string; operationRequestId: string; outcome: "success" | "failed"; errorCode?: string; errorMessage?: string }) {
  return {
    brand_id: input.brandId,
    candidate_id: input.target.candidateId,
    keyword_id: input.target.keywordId,
    metric_type: "allintitle",
    previous_value: input.previous,
    new_value: input.measurement ? { resultsAllintitle: input.measurement.resultsAllintitle, measuredAt: input.measurement.measuredAt, cost: input.measurement.cost, keywordDifficulty: input.overview?.keywordDifficulty ?? null, keywordOverviewMeasuredAt: input.overview?.measuredAt ?? null } : null,
    provider: "dataforseo",
    provider_version: "v3",
    targeting: input.targeting,
    measured_at: input.measurement?.measuredAt || new Date().toISOString(),
    actor_user_id: input.actorUserId,
    operation_request_id: input.operationRequestId,
    batch_id: null,
    outcome: input.outcome,
    error_code: input.errorCode || null,
    error_message: input.errorMessage || null,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  let input: z.infer<typeof RequestSchema> | null = null;
  let apiRequestStarted = false;
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return responseFailure("BRAND_NOT_FOUND", "authorization", "Marca inválida.", 404);
    input = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    const context = await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });
    const keywordIds = [...new Set(input.keywordIds)];
    const candidateIds = [...new Set(input.candidateIds)];

    const keywordResult = keywordIds.length
      ? await profile.supabase.from("minerador_keywords").select("id,brand_id,keyword,results_allintitle,volume_search,kgr_score,analise_semantica").eq("brand_id", context.brandId).is("deleted_at", null).in("id", keywordIds)
      : { data: [], error: null };
    if (keywordResult.error) throw keywordResult.error;
    if ((keywordResult.data || []).length !== keywordIds.length) return responseFailure("KEYWORD_NOT_FOUND", "authorization", "Uma das keywords não pertence à marca ativa.", 404, { requestedKeywordCount: keywordIds.length, loadedKeywordCount: keywordResult.data?.length || 0 });

    const candidateResult = candidateIds.length
      ? await profile.supabase.from("minerador_discovery_candidates").select("id,brand_id,keyword_original,targeting,imported_keyword_id,existing_keyword_id").eq("brand_id", context.brandId).in("id", candidateIds)
      : { data: [], error: null };
    if (candidateResult.error) throw candidateResult.error;
    if ((candidateResult.data || []).length !== candidateIds.length) return responseFailure("DISCOVERY_CANDIDATE_NOT_FOUND", "authorization", "Uma das candidatas não pertence à marca ativa.", 404, { requestedCandidateCount: candidateIds.length, loadedCandidateCount: candidateResult.data?.length || 0 });

    const currentResult = candidateIds.length
      ? await profile.supabase.from("minerador_discovery_candidate_current_metrics").select("*").eq("brand_id", context.brandId).in("candidate_id", candidateIds)
      : { data: [], error: null };
    if (currentResult.error) throw currentResult.error;
    const currentByCandidateId = new Map((currentResult.data || []).map(row => [String(row.candidate_id), row as JsonObject]));

    const candidateRows = (candidateResult.data || []) as JsonObject[];
    const candidateKeywordIds = candidateRows.map(row => typeof row.imported_keyword_id === "string" ? row.imported_keyword_id : typeof row.existing_keyword_id === "string" ? row.existing_keyword_id : currentByCandidateId.get(String(row.id))?.keyword_id).filter((value): value is string => typeof value === "string");
    const officialIds = [...new Set([...keywordIds, ...candidateKeywordIds])];
    const officialResult = officialIds.length
          ? await profile.supabase.from("minerador_keywords").select("id,brand_id,keyword,results_allintitle,volume_search,kgr_score,analise_semantica").eq("brand_id", context.brandId).is("deleted_at", null).in("id", officialIds)
      : { data: [], error: null };
    if (officialResult.error) throw officialResult.error;
    const officialById = new Map((officialResult.data || []).map(row => [String(row.id), row as JsonObject]));
    if (officialById.size !== officialIds.length) return responseFailure("KEYWORD_NOT_FOUND", "authorization", "Uma keyword vinculada a uma candidata não pertence à marca ativa.", 404, { requestedLinkedKeywordCount: officialIds.length, loadedLinkedKeywordCount: officialById.size });

    const targets: LoadedTarget[] = [];
    for (const row of (keywordResult.data || []) as JsonObject[]) targets.push({ targetKind: "keyword", targetId: String(row.id), candidateId: null, keywordId: String(row.id), keyword: String(row.keyword || ""), keywordRow: row, candidateRow: null, currentRow: null });
    for (const row of candidateRows) {
      const candidateId = String(row.id);
      const currentRow = currentByCandidateId.get(candidateId) || null;
      const keywordId = typeof currentRow?.keyword_id === "string" ? currentRow.keyword_id : typeof row.imported_keyword_id === "string" ? row.imported_keyword_id : typeof row.existing_keyword_id === "string" ? row.existing_keyword_id : null;
      targets.push({ targetKind: "discovery_candidate", targetId: candidateId, candidateId, keywordId, keyword: String(row.keyword_original || ""), keywordRow: keywordId ? officialById.get(keywordId) || null : null, candidateRow: row, currentRow });
    }

    const canonicalDataForSeo = await resolveDataForSeoCanonicalConfig({
      actorUserId: profile.userId,
      agencyId: context.agencyId || null,
      brandId: context.brandId,
      quotaUnits: targets.length,
    });
    const config = canonicalDataForSeo.config;
    const startedAt = new Date().toISOString();
    const successes: TargetSuccess[] = [];
    const failures: TargetFailure[] = [];
    const targetingDiagnostics: JsonObject[] = [];
    // Evidência semântica por alvo: existe mesmo quando a medição falha.
    const semanticEvidences: Array<{ targetKind: TargetKind; targetId: string; keywordId: string | null; serpEvidence: SerpSemanticEvidence | null; serpError: { code: string; message: string; providerRequestId: string | null } | null }> = [];
    // Qualificação Semântica persistida por keyword: a working copy da sessão
    // deixou de ser a fonte. Cada coleta bem-sucedida grava a próxima versão.
    const semanticQualifications: Array<{ keywordId: string; versionId: string; version: number; persisted: boolean; error: string | null; failure: { classification: string; code: string; constraint: string | null; column: string | null } | null }> = [];
    const currentQualifications = await readCurrentKeywordSemanticQualifications({
      brandId: context.brandId,
      keywordIds: targets.map(target => target.keywordId).filter((value): value is string => Boolean(value)),
    }).catch(() => new Map<string, KeywordSemanticQualification>());
    const semanticOperationRequestId = input.operationRequestId;
    const persistQualification = async (target: LoadedTarget, evidence: SerpSemanticEvidence) => {
      if (!target.keywordId) return;
      try {
        const qualification = await buildKeywordSemanticQualification({
          brandId: context.brandId,
          keywordId: target.keywordId,
          evidence,
          createdBy: profile.userId,
          previous: currentQualifications.get(target.keywordId) || null,
        });
        await persistKeywordSemanticQualification({
          brandId: context.brandId,
          keywordId: target.keywordId,
          qualification,
          changeReason: `SERP orgânica coletada pelo processo Resultados (${semanticOperationRequestId}).`,
        });
        currentQualifications.set(target.keywordId, qualification);
        semanticQualifications.push({ keywordId: target.keywordId, versionId: qualification.id, version: qualification.lifecycle.version, persisted: true, error: null, failure: null });
      } catch (error) {
        // Write não confirmado nunca vira sucesso: a versão anterior permanece.
        // O diagnóstico técnico real é preservado; a mensagem ao usuário segue
        // genérica na camada de notificação.
        const diagnostic = error instanceof KeywordSemanticQualificationPersistenceError
          ? error.diagnostic
          : classifyQualificationPersistenceError(error);
        console.error("[minerador] semantic_qualification_persistence", {
          operationRequestId: semanticOperationRequestId,
          brandId: context.brandId,
          keywordId: target.keywordId,
          classification: diagnostic.classification,
          code: diagnostic.code,
          message: diagnostic.message,
          details: diagnostic.details,
          hint: diagnostic.hint,
          constraint: diagnostic.constraint,
          column: diagnostic.column,
        });
        semanticQualifications.push({
          keywordId: target.keywordId,
          versionId: "",
          version: 0,
          persisted: false,
          error: diagnostic.classification,
          failure: { classification: diagnostic.classification, code: diagnostic.code, constraint: diagnostic.constraint, column: diagnostic.column },
        });
      }
    };

    for (const target of targets) {
      let targeting: ReturnType<typeof resolveDataForSeoTargeting>;
      try {
        targeting = resolveDataForSeoTargeting({ ...targetingInput(target), locationCode: config.locationCode });
      } catch (error) {
        const mapped = mapProviderError(error);
        const safeTargeting = { sourceGeoTargetConstants: (error instanceof DataForSeoTargetingError ? error.selectedGeoTargets : []), locationCode: config.locationCode, languageCode: config.languageCode, catalogVersion: "2026-08-04-br-country" };
        targetingDiagnostics.push({ targetKind: target.targetKind, targetId: target.targetId, ...safeTargeting });
        await persistFailure({ profile, brandId: context.brandId, actorUserId: profile.userId, target, operationRequestId: input.operationRequestId, targeting: safeTargeting, error: mapped });
        failures.push({ targetKind: target.targetKind, targetId: target.targetId, code: mapped.code, message: mapped.message, providerRequestId: mapped.providerRequestId });
        continue;
      }
      const targetingRecord = { provider: "dataforseo", catalogVersion: targeting.catalogVersion, countryCode: targeting.countryCode, locationCode: targeting.locationCode, locationLabel: targeting.locationLabel, languageCode: targeting.languageCode, sourceGeoTargetConstants: targeting.sourceGeoTargetConstants } satisfies JsonObject;
      targetingDiagnostics.push({ targetKind: target.targetKind, targetId: target.targetId, ...targetingRecord });
      const measurementKind = hasCurrentAllintitle(target) ? "updated" as const : "first" as const;
      if (isStale(target, startedAt, input.operationRequestId)) {
        const mapped = { code: "dataforseo_stale_result", message: "A medição atual é mais recente e o resultado atrasado foi preservado.", providerRequestId: null, status: 409 };
        await persistFailure({ profile, brandId: context.brandId, actorUserId: profile.userId, target, operationRequestId: input.operationRequestId, targeting: targetingRecord, error: mapped });
        failures.push({ targetKind: target.targetKind, targetId: target.targetId, code: mapped.code, message: mapped.message, providerRequestId: null });
        continue;
      }
      try {
        let measurement: DataForSeoAllintitleMeasurement;
        try {
          measurement = await measureDataForSeoAllintitle({ keyword: target.keyword, locationCode: targeting.locationCode, languageCode: targeting.languageCode, operationRequestId: input.operationRequestId }, { config, onRequestStarted: () => { apiRequestStarted = true; } });
        } catch (error) {
          const mapped = mapProviderError(error);
          // As finalidades são independentes depois do preflight: a SERP natural
          // continua sendo coletada mesmo quando o allintitle falha.
          const semanticSerpAfterFailure = await collectSemanticSerp({ keyword: target.keyword, locationCode: targeting.locationCode, languageCode: targeting.languageCode, operationRequestId: input.operationRequestId, config, onRequestStarted: () => { apiRequestStarted = true; } });
          if (semanticSerpAfterFailure.evidence) {
            semanticEvidences.push({ targetKind: target.targetKind, targetId: target.targetId, keywordId: target.keywordId, serpEvidence: semanticSerpAfterFailure.evidence, serpError: null });
            await persistQualification(target, semanticSerpAfterFailure.evidence);
          }
          else semanticEvidences.push({ targetKind: target.targetKind, targetId: target.targetId, keywordId: target.keywordId, serpEvidence: null, serpError: semanticSerpAfterFailure.error });
          let usageError = false;
          try {
            await recordTargetUsage({
              resource: canonicalDataForSeo.resource,
              target,
              operationRequestId: input.operationRequestId,
              resultStatus: "failed",
              costAmount: semanticSerpAfterFailure.cost,
              providerReference: [mapped.providerRequestId, semanticSerpAfterFailure.providerRequestId].filter((value): value is string => Boolean(value)).join(",") || null,
              errorCode: mapped.code,
            });
          } catch {
            usageError = true;
          }
          const recordedError = usageError ? { ...mapped, code: "dataforseo_usage_recording", message: "A tentativa foi iniciada, mas não foi possível registrar o consumo com segurança." } : mapped;
          await persistFailure({ profile, brandId: context.brandId, actorUserId: profile.userId, target, operationRequestId: input.operationRequestId, targeting: targetingRecord, error: recordedError });
          failures.push({ targetKind: target.targetKind, targetId: target.targetId, code: recordedError.code, message: recordedError.message, providerRequestId: recordedError.providerRequestId });
          continue;
        }
        let keywordOverview: DataForSeoKeywordOverviewMeasurement | null = null;
        let keywordOverviewError: { code: string; message: string; providerRequestId: string | null } | null = null;
        try {
          keywordOverview = await measureDataForSeoKeywordOverview(
            { keyword: target.keyword, locationCode: targeting.locationCode, languageCode: targeting.languageCode, operationRequestId: input.operationRequestId },
            { config, onRequestStarted: () => { apiRequestStarted = true; } },
          );
        } catch (error) {
          const mapped = mapProviderError(error);
          keywordOverviewError = { code: mapped.code, message: mapped.message, providerRequestId: mapped.providerRequestId };
        }
        // CALL 3 — SERP orgânica da keyword natural. É a evidência semântica e
        // não participa do Resultado nem do KGR: falhar aqui preserva as duas
        // medições anteriores.
        const semanticSerp = await collectSemanticSerp({ keyword: target.keyword, locationCode: targeting.locationCode, languageCode: targeting.languageCode, operationRequestId: input.operationRequestId, config, onRequestStarted: () => { apiRequestStarted = true; } });
        const serpEvidence = semanticSerp.evidence;
        const serpError = semanticSerp.error;
        const serpProviderRequestId = semanticSerp.providerRequestId;
        const serpCost = semanticSerp.cost;
        semanticEvidences.push({ targetKind: target.targetKind, targetId: target.targetId, keywordId: target.keywordId, serpEvidence, serpError });
        // Persistência da Qualificação antes de qualquer relato de sucesso.
        if (serpEvidence) await persistQualification(target, serpEvidence);
        try {
          const providerReference = [measurement.providerRequestId, keywordOverview?.providerRequestId, serpProviderRequestId].filter((value): value is string => Boolean(value)).join(",") || null;
          const costs = [measurement.cost, keywordOverview?.cost ?? null, serpCost].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
          await recordTargetUsage({ resource: canonicalDataForSeo.resource, target, operationRequestId: input.operationRequestId, resultStatus: "succeeded", costAmount: costs.length ? costs.reduce((total, value) => total + value, 0) : null, providerReference });
        } catch {
          failures.push({ targetKind: target.targetKind, targetId: target.targetId, code: "dataforseo_usage_recording", message: "A medição foi recebida, mas o consumo não pôde ser registrado com segurança; o resultado não foi aplicado.", providerRequestId: measurement.providerRequestId });
          continue;
        }
        const latest = target.targetKind === "keyword"
          ? await profile.supabase.from("minerador_keywords").select("id,brand_id,keyword,results_allintitle,volume_search,kgr_score,analise_semantica").eq("id", target.keywordId).eq("brand_id", context.brandId).is("deleted_at", null).maybeSingle()
          : await profile.supabase.from("minerador_discovery_candidate_current_metrics").select("*").eq("candidate_id", target.candidateId).eq("brand_id", context.brandId).maybeSingle();
        if (latest.error || !latest.data) throw new Error("A projeção atual da medição não foi encontrada.");
        const latestTarget: LoadedTarget = target.targetKind === "keyword" ? { ...target, keywordRow: latest.data as JsonObject } : { ...target, currentRow: latest.data as JsonObject };
        if (isStale(latestTarget, startedAt, input.operationRequestId)) throw { code: "dataforseo_stale_result", message: "A medição atual é mais recente e o resultado atrasado foi preservado.", status: 409, providerRequestId: measurement.providerRequestId };
        await persistSuccess({ profile, brandId: context.brandId, actorUserId: profile.userId, target: latestTarget, measurement, overview: keywordOverview, overviewError: keywordOverviewError, operationRequestId: input.operationRequestId, targeting: targetingRecord });
        successes.push({ targetKind: target.targetKind, targetId: target.targetId, candidateId: target.candidateId, keywordId: target.keywordId, resultsAllintitle: measurement.resultsAllintitle, measuredAt: measurement.measuredAt, provider: "dataforseo", providerVersion: "v3", measurementKind, keywordDifficulty: keywordOverview?.keywordDifficulty ?? null, keywordOverview, keywordOverviewError, serpEvidence, serpError });
      } catch (error) {
        const mapped = mapProviderError(error);
        await persistFailure({ profile, brandId: context.brandId, actorUserId: profile.userId, target, operationRequestId: input.operationRequestId, targeting: targetingRecord, error: mapped });
        failures.push({ targetKind: target.targetKind, targetId: target.targetId, code: mapped.code, message: mapped.message, providerRequestId: mapped.providerRequestId });
      }
    }

    const partial = failures.length > 0;
    const firstMeasurements = successes.filter(item => item.measurementKind === "first").length;
    const updatedMeasurements = successes.filter(item => item.measurementKind === "updated").length;
    const overviewFailures = successes.filter(item => item.keywordOverviewError).map(item => ({ targetKind: item.targetKind, targetId: item.targetId, ...item.keywordOverviewError }));
    const overviewPartial = overviewFailures.length > 0;
    const successMessage = updatedMeasurements && !firstMeasurements
      ? `${updatedMeasurements} resultado(s) allintitle atualizado(s) e refletido(s) na tabela.`
      : firstMeasurements && !updatedMeasurements
        ? `${firstMeasurements} resultado(s) allintitle medido(s) e refletido(s) na tabela.`
        : `${firstMeasurements} primeira(s) medição(ões) e ${updatedMeasurements} resultado(s) allintitle atualizado(s) e refletido(s) na tabela.`;
    const response = { success: successes.length > 0, operationRequestId: input.operationRequestId, requestedCount: targets.length, persistedCount: successes.length, firstMeasurements, updatedMeasurements, failedCount: failures.length, overviewFailedCount: overviewFailures.length, code: partial ? "DATAFORSEO_PARTIAL_RESULTS" : overviewPartial ? "DATAFORSEO_OVERVIEW_PARTIAL" : null, stage: partial || overviewPartial ? "response_normalization" : null, message: successes.length === targets.length ? `${successMessage}${overviewPartial ? ` ${overviewFailures.length} KD(s) não retornaram dado; o allintitle foi preservado.` : ""}` : `${successMessage} ${failures.length} alvo(s) não retornaram uma medição confirmada.`, projections: successes, failures, overviewFailures, semanticEvidences, semanticQualifications, semanticQualificationPersistedCount: semanticQualifications.filter(item => item.persisted).length, semanticQualificationFailedCount: semanticQualifications.filter(item => !item.persisted).length, serpFailures: semanticEvidences.filter(item => item.serpError).map(item => ({ targetKind: item.targetKind, targetId: item.targetId, keywordId: item.keywordId, ...item.serpError })), serpFailedCount: semanticEvidences.filter(item => item.serpError).length, diagnostic: { apiRequestStarted, provider: "dataforseo", providerVersion: "v3", endpoint: "/v3/serp/google/organic/live/regular", overviewEndpoint: "/v3/dataforseo_labs/google/keyword_overview/live", semanticSerpEndpoint: "/v3/serp/google/organic/live/advanced", targeting: targetingDiagnostics } };
    return NextResponse.json(response, { status: successes.length ? 200 : 502 });
  } catch (error) {
    if (error instanceof ZodError) return responseFailure("DATAFORSEO_INVALID_REQUEST", "argument_validation", "A solicitação de medição allintitle é inválida.", 400, { apiRequestStarted: false, issues: error.issues.map(issue => ({ path: issue.path, code: issue.code })) });
    if (error instanceof IntegrationRuntimeError) return responseFailure(error.code, "integration_runtime", error.message, error.status, { apiRequestStarted, runtime: error.diagnostic });
    if (error instanceof DataForSeoCanonicalError) return responseFailure(error.code, "connection_resolution", error.message, error.status, { apiRequestStarted });
    if (error instanceof DataForSeoKeywordOverviewError) return responseFailure(error.code, "provider_request", error.message, error.status, { apiRequestStarted, providerRequestId: error.providerRequestId });
    if (error instanceof DataForSeoSerpError) return responseFailure(error.code, error.code === "dataforseo_configuration" ? "configuration_validation" : "provider_request", error.message, error.status, { apiRequestStarted, providerRequestId: error.providerRequestId });
    const safe = safeDatabaseError(error);
    return responseFailure("DATAFORSEO_PERSISTENCE_ERROR", "persistence", "A medição allintitle não pôde ser concluída.", 503, { apiRequestStarted, databaseCode: safe.code, ...(process.env.NODE_ENV !== "production" ? { databaseMessage: safe.message } : {}) });
  }
}

async function persistSuccess(input: { profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>; brandId: string; actorUserId: string; target: LoadedTarget; measurement: DataForSeoAllintitleMeasurement; overview: DataForSeoKeywordOverviewMeasurement | null; overviewError: { code: string; message: string; providerRequestId: string | null } | null; operationRequestId: string; targeting: JsonObject }) {
  const previous = input.target.targetKind === "keyword" ? input.target.keywordRow : input.target.currentRow;
  if (input.target.targetKind === "keyword") {
    const keyword = input.target.keywordRow;
    if (!keyword) throw new Error("A keyword oficial não foi encontrada.");
    const patch = buildDataForSeoKeywordMeasurementPatch({ existing: { results_allintitle: numberOrNull(keyword.results_allintitle), volume_search: numberOrNull(keyword.volume_search), kgr_score: numberOrNull(keyword.kgr_score), analise_semantica: asObject(keyword.analise_semantica) }, measurement: input.measurement, overview: input.overview, overviewError: input.overviewError, operationRequestId: input.operationRequestId, targeting: input.targeting, requireCurrentVolumeMeasurement: true });
    const update = await input.profile.supabase.from("minerador_keywords").update(patch).eq("id", input.target.keywordId).eq("brand_id", input.brandId).is("deleted_at", null);
    if (update.error) throw update.error;
    return;
  }
  const currentPatch = currentPatchForTarget(input.measurement, input.operationRequestId, input.actorUserId, input.targeting);
  const currentUpdate = await input.profile.supabase.from("minerador_discovery_candidate_current_metrics").upsert({ candidate_id: input.target.candidateId, brand_id: input.brandId, keyword_id: input.target.keywordId, ...currentPatch }, { onConflict: "candidate_id" });
  if (currentUpdate.error) throw currentUpdate.error;
  if (input.target.keywordId && input.target.keywordRow) {
    const keyword = input.target.keywordRow;
    const patch = buildDataForSeoKeywordMeasurementPatch({ existing: { results_allintitle: numberOrNull(keyword.results_allintitle), volume_search: numberOrNull(keyword.volume_search), kgr_score: numberOrNull(keyword.kgr_score), analise_semantica: asObject(keyword.analise_semantica) }, measurement: input.measurement, overview: input.overview, overviewError: input.overviewError, operationRequestId: input.operationRequestId, targeting: input.targeting, requireCurrentVolumeMeasurement: true });
    const keywordUpdate = await input.profile.supabase.from("minerador_keywords").update(patch).eq("id", input.target.keywordId).eq("brand_id", input.brandId).is("deleted_at", null);
    if (keywordUpdate.error) throw keywordUpdate.error;
  }
  const history = await input.profile.supabase.from("minerador_discovery_candidate_metric_history").insert(historyRow({ brandId: input.brandId, target: input.target, previous, measurement: input.measurement, overview: input.overview, targeting: input.targeting, actorUserId: input.actorUserId, operationRequestId: input.operationRequestId, outcome: "success" }));
  if (history.error) throw history.error;
}

function currentPatchForTarget(measurement: DataForSeoAllintitleMeasurement, operationRequestId: string, actorUserId: string, targeting: JsonObject) {
  return currentPatch(measurement, operationRequestId, actorUserId, targeting);
}

async function persistFailure(input: { profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>; brandId: string; actorUserId: string; target: LoadedTarget; operationRequestId: string; targeting: JsonObject; error: { code: string; message: string; providerRequestId: string | null } }) {
  const failedAt = new Date().toISOString();
  const safeMessage = input.error.message.slice(0, 240);
  if (input.target.targetKind === "discovery_candidate" && input.target.candidateId) {
    const currentUpdate = await input.profile.supabase.from("minerador_discovery_candidate_current_metrics").upsert({ candidate_id: input.target.candidateId, brand_id: input.brandId, keyword_id: input.target.keywordId, allintitle_status: "failed", allintitle_provider: "dataforseo", allintitle_executor: "minerador_server", allintitle_error_code: input.error.code, allintitle_error_message: safeMessage, allintitle_operation_request_id: input.operationRequestId, updated_by: input.actorUserId, updated_at: failedAt }, { onConflict: "candidate_id" });
    if (currentUpdate.error) throw currentUpdate.error;
    const history = await input.profile.supabase.from("minerador_discovery_candidate_metric_history").insert(historyRow({ brandId: input.brandId, target: input.target, previous: input.target.currentRow, measurement: null, targeting: input.targeting, actorUserId: input.actorUserId, operationRequestId: input.operationRequestId, outcome: "failed", errorCode: input.error.code, errorMessage: safeMessage }));
    if (history.error) throw history.error;
  }
  if (input.target.targetKind === "keyword" && input.target.keywordId && input.target.keywordRow) {
    const semantic = buildDataForSeoKeywordFailureSemantic({ semantic: asObject(input.target.keywordRow.analise_semantica), errorCode: input.error.code, message: safeMessage, operationRequestId: input.operationRequestId, failedAt });
    const update = await input.profile.supabase.from("minerador_keywords").update({ analise_semantica: semantic }).eq("id", input.target.keywordId).eq("brand_id", input.brandId).is("deleted_at", null);
    if (update.error) throw update.error;
  }
}
