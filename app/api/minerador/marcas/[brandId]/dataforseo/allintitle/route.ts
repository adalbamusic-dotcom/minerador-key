import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { isTenantId } from "@/lib/tenant-routing";
import { buildDataForSeoKeywordFailureSemantic, buildDataForSeoKeywordMeasurementPatch } from "@/lib/minerador/dataforseo-allintitle";
import { resolveDataForSeoCanonicalConfig, DataForSeoCanonicalError } from "@/lib/minerador/dataforseo-canonical";
import { measureDataForSeoAllintitle, type DataForSeoAllintitleMeasurement, DataForSeoSerpError } from "@/lib/minerador/dataforseo-serp";
import { measureDataForSeoKeywordOverview, DataForSeoKeywordOverviewError, type DataForSeoKeywordOverviewMeasurement } from "@/lib/minerador/dataforseo-keyword-overview";
import { collectAndCacheSerp, lookupSerpCache, type SerpCacheRequest } from "@/lib/server/serp-cache";
import type { SerpCacheContext } from "@/lib/server/serp-cache-store";
import { SERP_CACHE_CANONICAL_LENS, SERP_CACHE_LENSES, serpCacheLensLabel } from "@/lib/editorial/serp-cache";
import { readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { SERP_LENS_COVERAGE_DEPTH, countSerpLensOutcomes, createSerpLensCoverage, planSerpLensCoverage, serpLensDerivationInputs, type SerpLensCoverageTarget, type SerpLensOutcome } from "@/lib/server/minerador-serp-lens-coverage";
import { getOperationalClient } from "@/lib/server/editorial-db";
import { deriveSerpSemanticEvidence, deriveSerpSemanticEvidenceAcrossLenses, type SerpLensSource, type SerpSemanticEvidence } from "@/lib/minerador/serp-semantic-evidence";
import { buildKeywordSemanticQualification, predatesCurrentSemanticQualification, repeatsCurrentSemanticQualification, type KeywordSemanticQualification } from "@/lib/minerador/keyword-semantic-qualification";
import { KeywordSemanticQualificationPersistenceError, persistKeywordSemanticQualification, readCurrentKeywordSemanticQualifications } from "@/lib/server/keyword-semantic-qualification-store";
import { applySerpEvidenceRecord, readSerpEvidenceRecord } from "@/lib/minerador/serp-evidence-record";
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
  /** SERP paga agora ou reaproveitada do cache da marca; null sem SERP. */
  serpSource: SemanticSerpOutcome["serpSource"];
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
  /**
   * O pedido pago NESTA operação — é o que entra na referência do consumo.
   * Num reaproveitamento é null: nenhuma chamada foi feita agora. A
   * proveniência da observação reaproveitada vai na própria evidência.
   */
  providerRequestId: string | null;
  cost: number | null;
  /**
   * De onde veio a SERP: paga agora ou reaproveitada do cache da marca.
   * null quando a chamada ao provider falhou antes de haver SERP.
   */
  serpSource: "COLLECTED" | "REUSED" | null;
  /**
   * A lente canônica como entrada da leitura nas quatro lentes: o corpo (cru na
   * coleta, podado no acerto — dão a mesma leitura) e a proveniência. null
   * quando não há evidência da canônica.
   */
  canonical: (SerpLensSource & { body: unknown }) | null;
  /**
   * Depois da leitura nas quatro lentes: quantas lentes extras LIDAS foram
   * pagas nesta requisição. É o que o motivo da versão diz além da canônica.
   */
  lensesCollectedNow?: number;
};

/** A leitura semântica sempre pediu 20 resultados; o cache serve igual ou menos. */
const SEMANTIC_SERP_DEPTH = 20;

/**
 * CALL 3 — SERP orgânica da keyword natural. Depois do preflight comum, é
 * independente das outras duas finalidades: pode rodar mesmo quando a medição
 * allintitle ou o Keyword Overview falharem, e falhar aqui não invalida nada.
 *
 * Consulta o cache de SERP da marca ANTES do provider. A quota da rota não
 * muda: ela é resolvida antes do laço porque cobre o allintitle e o Keyword
 * Overview de cada alvo, que continuam sempre pagos.
 */
async function collectSemanticSerp(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  operationRequestId: string;
  config: Awaited<ReturnType<typeof resolveDataForSeoCanonicalConfig>>["config"];
  onRequestStarted: () => void;
  /** Candidata de descoberta sem keyword oficial entra com null. */
  keywordId: string | null;
  serpCache: SerpCacheContext;
  /** O mesmo instante da requisição inteira: validade e coleta contam dele. */
  now: Date;
  /**
   * Pula o cache e paga SERP nova. É o caso da evidência invalidada por
   * decisão humana: o cache devolveria justamente a SERP recusada.
   */
  refresh: boolean;
}): Promise<SemanticSerpOutcome> {
  /*
   * A chave usa os códigos do targeting do alvo, que são exatamente os que vão
   * ao provider: esta rota nunca envia os da config. Por isso não há
   * divergência config × chave a conferir aqui (ao contrário do Arquiteto).
   *
   * Lente explícita desktop/windows. Antes o pedido ia `desktop` sem `os`; o
   * eco da DataForSEO (tests/fixtures/dataforseo-eco-desktop-sem-os.json)
   * mostra que `desktop` sem `os` é servido como `windows` — a SERP é a mesma,
   * só que agora o rótulo gravado é o que de fato foi enviado.
   */
  const request: SerpCacheRequest = {
    query: {
      keyword: input.keyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      lens: SERP_CACHE_CANONICAL_LENS,
      // A leitura semântica precisa da SERP completa: blocos de feature e campos
      // estruturais (preço, rating, PAA) que o `regular` não devolve.
      endpoint: "advanced",
    },
    depth: SEMANTIC_SERP_DEPTH,
    keywordId: input.keywordId,
  };

  // Leitura do cache: banco fora nunca derruba a coleta — segue pagando como antes.
  let reused: { body: Record<string, unknown>; collectedAt: string; providerRequestId: string | null; collectedBy: string } | null = null;
  try {
    const [lookup] = await lookupSerpCache(input.serpCache, [request], { mode: "body", now: input.now, refresh: input.refresh });
    if (lookup?.hit?.body) reused = { body: lookup.hit.body, collectedAt: lookup.hit.meta.collectedAt, providerRequestId: lookup.hit.meta.providerRequestId, collectedBy: lookup.hit.meta.collectedBy };
  } catch (error) {
    console.warn("[minerador] serp_cache_read_failed", {
      operationRequestId: input.operationRequestId,
      brandId: input.serpCache.brandId,
      message: error instanceof Error ? error.message.slice(0, 240) : "falha desconhecida",
    });
  }

  if (reused) {
    // Proveniência honesta: a evidência diz quando e por qual pedido a SERP
    // foi observada, não quando foi relida.
    const evidence = deriveSerpSemanticEvidence({
      body: reused.body,
      keyword: input.keyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      device: "desktop",
      providerRequestId: reused.providerRequestId,
      operationRequestId: input.operationRequestId,
      collectedAt: reused.collectedAt,
    });
    // Nenhuma chamada: custo zero e nenhuma referência de provider no consumo.
    if (evidence) return { evidence, error: null, providerRequestId: null, cost: 0, serpSource: "REUSED", canonical: { lens: serpCacheLensLabel(SERP_CACHE_CANONICAL_LENS), body: reused.body, collectedAt: reused.collectedAt, providerRequestId: reused.providerRequestId, collectedBy: reused.collectedBy } };
    // Entrada gravada que não vira evidência não bloqueia: paga como antes.
    console.warn("[minerador] serp_cache_hit_unusable", { operationRequestId: input.operationRequestId, brandId: input.serpCache.brandId });
  }

  try {
    const collected = await collectAndCacheSerp(input.serpCache, request, {
      config: input.config,
      operationRequestId: input.operationRequestId,
      collectedBy: "minerador",
      now: input.now,
      provider: { onRequestStarted: input.onRequestStarted },
    });
    if (collected.writeError) {
      console.warn("[minerador] serp_cache_write_failed", { operationRequestId: input.operationRequestId, brandId: input.serpCache.brandId, message: collected.writeError.slice(0, 240) });
    }
    // Daqui em diante, o corpo CRU — exatamente o que a rota lia antes do cache.
    const task = collected.body && typeof collected.body === "object" && !Array.isArray(collected.body) && Array.isArray((collected.body as { tasks?: unknown[] }).tasks)
      ? (collected.body as { tasks: unknown[] }).tasks[0] as JsonObject | undefined
      : undefined;
    const cost = task && typeof task.cost === "number" && Number.isFinite(task.cost) ? task.cost : null;
    const evidence = deriveSerpSemanticEvidence({
      body: collected.body,
      keyword: input.keyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      device: "desktop",
      providerRequestId: collected.providerRequestId,
      operationRequestId: input.operationRequestId,
      /*
       * A data gravada no cache. Assim a versão da Qualificação feita agora e
       * um acerto futuro da mesma entrada dizem a MESMA coleta — e o acerto
       * não vira versão nova (ver `repeatsCurrentSemanticQualification`).
       */
      collectedAt: collected.meta.collectedAt,
    });
    return {
      evidence,
      error: evidence ? null : { code: "dataforseo_serp_unusable", message: "A SERP natural retornou sem resultados aproveitáveis para a evidência semântica.", providerRequestId: collected.providerRequestId },
      providerRequestId: collected.providerRequestId,
      cost,
      serpSource: "COLLECTED",
      canonical: evidence ? { lens: serpCacheLensLabel(SERP_CACHE_CANONICAL_LENS), body: collected.body, collectedAt: collected.meta.collectedAt, providerRequestId: collected.providerRequestId, collectedBy: collected.meta.collectedBy } : null,
    };
  } catch (error) {
    const mapped = mapProviderError(error);
    return { evidence: null, error: { code: mapped.code, message: mapped.message, providerRequestId: mapped.providerRequestId }, providerRequestId: mapped.providerRequestId, cost: null, serpSource: null, canonical: null };
  }
}

/**
 * Os alvos das TRÊS LENTES EXTRAS (as quatro do produto menos a canônica, que
 * é a CALL 3), com o targeting que o laço vai resolver.
 *
 * O laço resolve o targeting com `config.locationCode`, e a config tira esse
 * código de `readDataForSeoTargetCodes` — lido aqui sem tocar credencial,
 * porque o plano vem ANTES da quota. Alvo cujo targeting falha fica fora: o
 * laço registra a falha dele como antes, sem lente nenhuma.
 */
function lensCoverageTargets(targets: readonly LoadedTarget[]): SerpLensCoverageTarget[] {
  let locationCode: number;
  try {
    locationCode = readDataForSeoTargetCodes().locationCode;
  } catch {
    // Config inválida: a resolução da credencial recusa a rota como antes.
    return [];
  }
  const alvos: SerpLensCoverageTarget[] = [];
  // `carregado`, não `target`: guardas estruturais localizam o laço do POST pelo nome da variável.
  for (const carregado of targets) {
    try {
      const targeting = resolveDataForSeoTargeting({ ...targetingInput(carregado), locationCode });
      alvos.push({ targetId: carregado.targetId, keyword: carregado.keyword, keywordId: carregado.keywordId, locationCode: targeting.locationCode, languageCode: targeting.languageCode });
    } catch {
      continue;
    }
  }
  return alvos;
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

    // Um único instante por requisição: o cache conta validade e coleta dele.
    const now = new Date();
    const startedAt = now.toISOString();
    /*
     * Cache de SERP da marca, no mesmo cliente service role que grava a
     * Qualificação Semântica (`getOperationalClient`). O getter adia a criação:
     * sem a chave de serviço, a leitura lança e a coleta segue paga, e a
     * gravação falha dentro de `collectAndCacheSerp`, que não lança — o cache
     * fora nunca derruba a medição.
     */
    const serpCache: SerpCacheContext = {
      get supabase() { return getOperationalClient(); },
      brandId: context.brandId,
      actorUserId: profile.userId,
    };

    /*
     * AS QUATRO LENTES (decisão do usuário, 2026-09-23): a SERP paga vai para o
     * cache desde a primeira vez que é acionada, no Processador ou na
     * Descoberta, e nas quatro lentes — não só no desktop.
     *
     * A canônica segue na CALL 3 (corpo, 20 resultados). As outras três são
     * planejadas AQUI, antes de credencial e quota, em modo `digest` (meta e o
     * digest que a leitura das quatro lentes usa): só o que falta ou venceu é
     * pago, e a quota conta essas faltas.
     */
    const lensPlan = await planSerpLensCoverage(serpCache, lensCoverageTargets(targets), { now });
    if (lensPlan.readFailed) {
      console.warn("[minerador] serp_lens_cache_read_failed", { operationRequestId: input.operationRequestId, brandId: context.brandId, message: lensPlan.readFailed });
    }
    const resolveConfig = (quotaUnits: number) => resolveDataForSeoCanonicalConfig({
      actorUserId: profile.userId,
      agencyId: context.agencyId || null,
      brandId: context.brandId,
      quotaUnits,
    });
    /*
     * Uma unidade por alvo cobre allintitle, KD e a lente canônica, como antes;
     * cada lente extra que falta soma uma. Se a quota não cobre as lentes
     * extras, o resto segue com a quota de antes: lente extra nunca impede o
     * Resultado nem o KD. O saldo que a quota ainda tem além dos alvos paga as
     * lentes que couberem, na ordem dos alvos; as outras viram lacuna.
     */
    let lensQuotaCovered = true;
    const canonicalDataForSeo = await resolveConfig(targets.length + lensPlan.missingQueries).catch(async (error: unknown) => {
      if (!lensPlan.missingQueries || !(error instanceof IntegrationRuntimeError) || error.code !== "INTEGRATION_QUOTA_EXHAUSTED") throw error;
      lensQuotaCovered = false;
      return resolveConfig(targets.length);
    });
    const lensQuota = canonicalDataForSeo.resource?.quota;
    const lensQuotaBudget = lensQuotaCovered
      ? lensPlan.missingQueries
      : lensQuota?.limited && typeof lensQuota.remainingUnits === "number" && Number.isFinite(lensQuota.remainingUnits)
        ? Math.max(0, Math.min(lensPlan.missingQueries, Math.floor(lensQuota.remainingUnits) - targets.length))
        : 0;
    if (!lensQuotaCovered) {
      console.warn("[minerador] serp_lens_quota_exhausted", { brandId: context.brandId, missingLensQueries: lensPlan.missingQueries, lensQuotaBudget });
    }
    const config = canonicalDataForSeo.config;
    const lensCoverage = createSerpLensCoverage(serpCache, lensPlan, {
      config,
      operationRequestId: input.operationRequestId,
      now,
      quotaCovered: lensQuotaCovered,
      quotaBudget: lensQuotaBudget,
      provider: { onRequestStarted: () => { apiRequestStarted = true; } },
    });
    const successes: TargetSuccess[] = [];
    const failures: TargetFailure[] = [];
    const targetingDiagnostics: JsonObject[] = [];
    // Evidência semântica por alvo: existe mesmo quando a medição falha.
    const semanticEvidences: Array<{ targetKind: TargetKind; targetId: string; keywordId: string | null; serpSource: SemanticSerpOutcome["serpSource"]; serpEvidence: SerpSemanticEvidence | null; serpError: { code: string; message: string; providerRequestId: string | null } | null }> = [];
    // Qualificação Semântica persistida por keyword: a working copy da sessão
    // deixou de ser a fonte. Cada coleta bem-sucedida grava a próxima versão.
    // `unchanged`: a SERP reaproveitada repetia a versão vigente, que continua sendo a resposta.
    const semanticQualifications: Array<{ keywordId: string; versionId: string; version: number; persisted: boolean; unchanged?: boolean; error: string | null; failure: { classification: string; code: string; constraint: string | null; column: string | null } | null }> = [];
    const currentQualifications = await readCurrentKeywordSemanticQualifications({
      brandId: context.brandId,
      keywordIds: targets.map(target => target.keywordId).filter((value): value is string => Boolean(value)),
    }).catch(() => new Map<string, KeywordSemanticQualification>());
    const semanticOperationRequestId = input.operationRequestId;
    /** Evidência SERP invalidada por decisão humana pede SERP nova, nunca a do cache. */
    const serpEvidenceInvalidated = (target: LoadedTarget) => Boolean(readSerpEvidenceRecord(asObject(target.keywordRow?.analise_semantica))?.invalidada);
    // A versão confirmada vira evidência forte na própria keyword: é o que
    // a tabela lê antes da Lógica e o que entra na assinatura do pacote
    // aprovado. Reler a linha evita sobrescrever o que a medição gravou.
    const projectSerpEvidenceRecord = async (target: LoadedTarget, qualification: KeywordSemanticQualification) => {
      if (target.targetKind !== "keyword" || !target.keywordId) return;
      const latestRow = await profile.supabase.from("minerador_keywords").select("analise_semantica").eq("id", target.keywordId).eq("brand_id", context.brandId).is("deleted_at", null).maybeSingle();
      if (latestRow.error || !latestRow.data) throw new Error("A keyword não foi encontrada para registrar a evidência SERP.");
      const withEvidence = applySerpEvidenceRecord(asObject(latestRow.data.analise_semantica), qualification);
      const evidenceUpdate = await profile.supabase.from("minerador_keywords").update({ analise_semantica: withEvidence }).eq("id", target.keywordId).eq("brand_id", context.brandId).is("deleted_at", null);
      if (evidenceUpdate.error) throw evidenceUpdate.error;
      if (target.keywordRow) target.keywordRow = { ...target.keywordRow, analise_semantica: withEvidence };
    };
    const persistQualification = async (target: LoadedTarget, evidence: SerpSemanticEvidence, serpSource: SemanticSerpOutcome["serpSource"], lensesCollectedNow = 0) => {
      if (!target.keywordId) return;
      try {
        const previous = currentQualifications.get(target.keywordId) || null;
        const qualification = await buildKeywordSemanticQualification({
          brandId: context.brandId,
          keywordId: target.keywordId,
          evidence,
          createdBy: profile.userId,
          previous,
        });
        /*
         * Acerto do cache que não traz nada novo: é a mesma coleta que a versão
         * vigente já registrou, ou uma coleta MAIS VELHA que ela (duas execuções
         * em paralelo, gravação no cache que falhou). Nenhuma versão nova
         * (AGENTS §9) — a vigente segue como resposta. Só a projeção na keyword
         * é conferida: se a vigente foi gravada por um caminho que não projeta
         * (candidata da Descoberta) ou a projeção falhou, é aqui que ela se
         * corrige, sem esperar o cache vencer.
         */
        if (serpSource === "REUSED" && previous && (repeatsCurrentSemanticQualification(previous, qualification) || predatesCurrentSemanticQualification(previous, qualification))) {
          if (readSerpEvidenceRecord(asObject(target.keywordRow?.analise_semantica))?.versionId !== previous.id) await projectSerpEvidenceRecord(target, previous);
          semanticQualifications.push({ keywordId: target.keywordId, versionId: previous.id, version: previous.lifecycle.version, persisted: true, unchanged: true, error: null, failure: null });
          return;
        }
        await persistKeywordSemanticQualification({
          brandId: context.brandId,
          keywordId: target.keywordId,
          qualification,
          // A origem é a da canônica; lente extra paga agora é dita à parte — é ela que muda a versão.
          changeReason: serpSource === "REUSED"
            ? `SERP orgânica reaproveitada do cache da marca (coleta de ${evidence.collectedAt})${lensesCollectedNow ? `, com ${lensesCollectedNow} lente(s) extra(s) coletada(s) agora,` : ""} pelo processo Resultados (${semanticOperationRequestId}).`
            : `SERP orgânica coletada pelo processo Resultados (${semanticOperationRequestId}).`,
        });
        currentQualifications.set(target.keywordId, qualification);
        semanticQualifications.push({ keywordId: target.keywordId, versionId: qualification.id, version: qualification.lifecycle.version, persisted: true, error: null, failure: null });
        await projectSerpEvidenceRecord(target, qualification);
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

    /*
     * INTENÇÃO E FUNIL PELAS QUATRO LENTES (adendo `docs/03-minerador/
     * propostas/adendo-derivacao-v4-quatro-lentes-2026-09-23.md`, §3). A CALL 3
     * traz a canônica; as três extras vêm da cobertura, que correu em paralelo
     * com a cadeia do alvo. A Qualificação só é derivada DEPOIS que as lentes
     * assentam — esperar aqui custa só o que a cobertura passar da cadeia.
     * Cada extra entra pelo digest (na coleta, montado do corpo em memória; no
     * acerto, lido do cache) ou como lente faltante. Sem evidência da
     * canônica, nada muda: a falha dela segue como antes.
     */
    const readAcrossLenses = async (semantic: SemanticSerpOutcome, lensOutcomes: Promise<SerpLensOutcome[]>, evidenceInvalidated: boolean): Promise<SemanticSerpOutcome> => {
      if (!semantic.evidence || !semantic.canonical) return semantic;
      /*
       * Allintitle, KD e a CALL 3 já foram pagos aqui: uma falha na leitura das
       * lentes nunca derruba o alvo. Ela volta à leitura da canônica, que já é
       * a de uma lente, e só avisa.
       */
      try {
        const outcomes = await lensOutcomes;
        const evidence = deriveSerpSemanticEvidenceAcrossLenses({
          keyword: semantic.evidence.query,
          locationCode: semantic.evidence.locationCode,
          languageCode: semantic.evidence.languageCode,
          operationRequestId: semantic.evidence.operationRequestId,
          canonical: semantic.canonical,
          // Evidência invalidada: a lente extra do cache é da coleta recusada e fica fora.
          extras: serpLensDerivationInputs(outcomes, { invalidatedBefore: evidenceInvalidated ? startedAt : null }),
        });
        if (!evidence) return semantic;
        const lidas = new Set((evidence.lensEvidence?.readings || []).map(reading => reading.lens));
        return { ...semantic, evidence, lensesCollectedNow: outcomes.filter(outcome => outcome.source === "collected" && lidas.has(outcome.lens)).length };
      } catch (error) {
        console.warn("[minerador] serp_lens_derivation_failed", { operationRequestId: semanticOperationRequestId, brandId: context.brandId, keyword: semantic.evidence.query, message: error instanceof Error ? error.message.slice(0, 240) : "falha desconhecida" });
        return semantic;
      }
    };

    /*
     * AS TRÊS LENTES EXTRAS DE CADA ALVO: pagas só quando faltam no cache. A
     * liquidação abaixo só registra o uso — a leitura delas vai à Qualificação
     * por `readAcrossLenses`, nunca por aqui.
     */
    const lensOperationRequestId = input.operationRequestId;
    const lensResults: Array<{ targetKind: TargetKind; targetId: string; keywordId: string | null; outcomes: SerpLensOutcome[] }> = [];
    let lensUsageRecordFailedCount = 0;
    const settleLensCoverage = async (target: LoadedTarget, outcomes: SerpLensOutcome[]) => {
      lensResults.push({ targetKind: target.targetKind, targetId: target.targetId, keywordId: target.keywordId, outcomes });
      for (const lacuna of outcomes.filter(item => !item.stored)) {
        console.warn("[minerador] serp_lens_gap", { operationRequestId: lensOperationRequestId, brandId: context.brandId, targetId: target.targetId, lens: lacuna.lens, reason: lacuna.reason });
      }
      /*
       * O uso vale para cada chamada paga: um registro por alvo com uma unidade
       * por lente paga, custo e referências de cada uma. Um registro por
       * chamada triplicaria as idas à Auth que `recordIntegrationUsage` faz.
       * Falhar aqui não desfaz nada do alvo: a lente já está no cache.
       * A quota soma só o uso `succeeded`: nele entram só as lentes que
       * voltaram como SERP. As que falharam ficam em `metadata.failed` — como
       * no registro do alvo, onde a falha vai como `failed` e não conta.
       */
      const pagas = outcomes.filter(item => item.paid);
      if (!pagas.length) return;
      const coletadas = pagas.filter(item => item.source === "collected");
      const custos = pagas.map(item => item.cost).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      try {
        await recordIntegrationUsage({
          resource: canonicalDataForSeo.resource,
          operation: "module_operation",
          module: "minerador",
          resultStatus: coletadas.length ? "succeeded" : "failed",
          units: coletadas.length ? coletadas.length : pagas.length,
          costAmount: custos.length ? custos.reduce((total, value) => total + value, 0) : null,
          providerReference: pagas.map(item => item.providerRequestId).filter((value): value is string => Boolean(value)).join(",") || null,
          errorCode: coletadas.length ? null : "SERP_LENS_FAILED",
          idempotencyKey: `${usageKey(lensOperationRequestId, target)}:serp-lenses`,
          metadata: {
            operationRequestId: lensOperationRequestId,
            operationKind: "serp_lens_coverage",
            targetKind: target.targetKind,
            targetId: target.targetId,
            lenses: pagas.map(item => item.lens).join(","),
            collected: coletadas.length,
            failed: pagas.length - coletadas.length,
          },
        });
      } catch (error) {
        lensUsageRecordFailedCount += 1;
        console.warn("[minerador] serp_lens_usage_recording_failed", { operationRequestId: lensOperationRequestId, brandId: context.brandId, targetId: target.targetId, message: error instanceof Error ? error.message.slice(0, 240) : "falha desconhecida" });
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
      /*
       * As três lentes extras correm JUNTO com a cadeia do alvo (allintitle →
       * KD → CALL 3), com concorrência limitada: a duração do alvo continua a
       * da cadeia. `ensure` nunca rejeita — lente que falha é lacuna. A leitura
       * das quatro lentes espera por elas logo depois da CALL 3, e o `finally`
       * ainda as liquida antes do próximo alvo em qualquer caminho.
       */
      const lensOutcomes = lensCoverage.ensure(target.targetId, { locationCode: targeting.locationCode, languageCode: targeting.languageCode });
      try {
        let measurement: DataForSeoAllintitleMeasurement;
        try {
          measurement = await measureDataForSeoAllintitle({ keyword: target.keyword, locationCode: targeting.locationCode, languageCode: targeting.languageCode, operationRequestId: input.operationRequestId }, { config, onRequestStarted: () => { apiRequestStarted = true; } });
        } catch (error) {
          const mapped = mapProviderError(error);
          // As finalidades são independentes depois do preflight: a SERP natural
          // continua sendo coletada mesmo quando o allintitle falha.
          const canonicalSerpAfterFailure = await collectSemanticSerp({ keyword: target.keyword, locationCode: targeting.locationCode, languageCode: targeting.languageCode, operationRequestId: input.operationRequestId, config, onRequestStarted: () => { apiRequestStarted = true; }, keywordId: target.keywordId, serpCache, now, refresh: serpEvidenceInvalidated(target) });
          const semanticSerpAfterFailure = await readAcrossLenses(canonicalSerpAfterFailure, lensOutcomes, serpEvidenceInvalidated(target));
          if (semanticSerpAfterFailure.evidence) {
            semanticEvidences.push({ targetKind: target.targetKind, targetId: target.targetId, keywordId: target.keywordId, serpSource: semanticSerpAfterFailure.serpSource, serpEvidence: semanticSerpAfterFailure.evidence, serpError: null });
            await persistQualification(target, semanticSerpAfterFailure.evidence, semanticSerpAfterFailure.serpSource, semanticSerpAfterFailure.lensesCollectedNow);
          }
          else semanticEvidences.push({ targetKind: target.targetKind, targetId: target.targetId, keywordId: target.keywordId, serpSource: semanticSerpAfterFailure.serpSource, serpEvidence: null, serpError: semanticSerpAfterFailure.error });
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
        // medições anteriores. A leitura sai das quatro lentes (`readAcrossLenses`).
        const canonicalSerp = await collectSemanticSerp({ keyword: target.keyword, locationCode: targeting.locationCode, languageCode: targeting.languageCode, operationRequestId: input.operationRequestId, config, onRequestStarted: () => { apiRequestStarted = true; }, keywordId: target.keywordId, serpCache, now, refresh: serpEvidenceInvalidated(target) });
        const semanticSerp = await readAcrossLenses(canonicalSerp, lensOutcomes, serpEvidenceInvalidated(target));
        const serpEvidence = semanticSerp.evidence;
        const serpError = semanticSerp.error;
        const serpProviderRequestId = semanticSerp.providerRequestId;
        const serpCost = semanticSerp.cost;
        const serpSource = semanticSerp.serpSource;
        semanticEvidences.push({ targetKind: target.targetKind, targetId: target.targetId, keywordId: target.keywordId, serpSource, serpEvidence, serpError });
        // Persistência da Qualificação antes de qualquer relato de sucesso.
        if (serpEvidence) await persistQualification(target, serpEvidence, serpSource, semanticSerp.lensesCollectedNow);
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
        successes.push({ targetKind: target.targetKind, targetId: target.targetId, candidateId: target.candidateId, keywordId: target.keywordId, resultsAllintitle: measurement.resultsAllintitle, measuredAt: measurement.measuredAt, provider: "dataforseo", providerVersion: "v3", measurementKind, keywordDifficulty: keywordOverview?.keywordDifficulty ?? null, keywordOverview, keywordOverviewError, serpSource, serpEvidence, serpError });
      } catch (error) {
        const mapped = mapProviderError(error);
        await persistFailure({ profile, brandId: context.brandId, actorUserId: profile.userId, target, operationRequestId: input.operationRequestId, targeting: targetingRecord, error: mapped });
        failures.push({ targetKind: target.targetKind, targetId: target.targetId, code: mapped.code, message: mapped.message, providerRequestId: mapped.providerRequestId });
      } finally {
        await settleLensCoverage(target, await lensOutcomes);
      }
    }

    /*
     * Contagens ADITIVAS por lente: nenhum campo anterior muda. A canônica vem
     * da CALL 3; as outras três, do cache que esta requisição garantiu.
     */
    const lensOutcomesAll = lensResults.flatMap(item => item.outcomes);
    const serpLensCoverage = {
      lenses: SERP_CACHE_LENSES.map(serpCacheLensLabel),
      depth: { canonical: SEMANTIC_SERP_DEPTH, others: SERP_LENS_COVERAGE_DEPTH },
      byLens: {
        [serpCacheLensLabel(SERP_CACHE_CANONICAL_LENS)]: {
          paid: semanticEvidences.filter(item => item.serpSource === "COLLECTED").length,
          cached: semanticEvidences.filter(item => item.serpSource === "REUSED").length,
          failed: semanticEvidences.filter(item => item.serpError).length,
          skipped: 0,
        },
        ...countSerpLensOutcomes(lensOutcomesAll),
      },
      paidCount: lensOutcomesAll.filter(item => item.paid).length,
      cachedCount: lensOutcomesAll.filter(item => item.source === "cache").length,
      gapCount: lensOutcomesAll.filter(item => !item.stored).length,
      gaps: lensResults.flatMap(item => item.outcomes.filter(outcome => !outcome.stored).map(outcome => ({ targetKind: item.targetKind, targetId: item.targetId, keywordId: item.keywordId, lens: outcome.lens, source: outcome.source, reason: outcome.reason }))),
      quotaCovered: lensQuotaCovered,
      quotaBudget: lensQuotaBudget,
      cacheReadFailed: Boolean(lensPlan.readFailed),
      usageRecordFailedCount: lensUsageRecordFailedCount,
    };
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
    const response = { success: successes.length > 0, operationRequestId: input.operationRequestId, requestedCount: targets.length, persistedCount: successes.length, firstMeasurements, updatedMeasurements, failedCount: failures.length, overviewFailedCount: overviewFailures.length, code: partial ? "DATAFORSEO_PARTIAL_RESULTS" : overviewPartial ? "DATAFORSEO_OVERVIEW_PARTIAL" : null, stage: partial || overviewPartial ? "response_normalization" : null, message: successes.length === targets.length ? `${successMessage}${overviewPartial ? ` ${overviewFailures.length} KD(s) não retornaram dado; o allintitle foi preservado.` : ""}` : `${successMessage} ${failures.length} alvo(s) não retornaram uma medição confirmada.`, projections: successes, failures, overviewFailures, semanticEvidences, semanticQualifications, semanticQualificationPersistedCount: semanticQualifications.filter(item => item.persisted).length, semanticQualificationUnchangedCount: semanticQualifications.filter(item => item.unchanged).length, semanticQualificationFailedCount: semanticQualifications.filter(item => !item.persisted).length, serpFailures: semanticEvidences.filter(item => item.serpError).map(item => ({ targetKind: item.targetKind, targetId: item.targetId, keywordId: item.keywordId, ...item.serpError })), serpFailedCount: semanticEvidences.filter(item => item.serpError).length, serpReusedCount: semanticEvidences.filter(item => item.serpSource === "REUSED").length, serpLensCoverage, diagnostic: { apiRequestStarted, provider: "dataforseo", providerVersion: "v3", endpoint: "/v3/serp/google/organic/live/regular", overviewEndpoint: "/v3/dataforseo_labs/google/keyword_overview/live", semanticSerpEndpoint: "/v3/serp/google/organic/live/advanced", targeting: targetingDiagnostics } };
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
