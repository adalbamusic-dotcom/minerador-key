import { NextResponse } from "next/server";
import { z } from "zod";
import { ArchitectKeywordSchema, ProvisionalArticleGroupSchema } from "@/lib/arquiteto/contracts";
import { articleKeywordReference, buildKeywordDnaProvenanceSnapshot } from "@/lib/arquiteto/adapters";
import { buildSiloCandidateSerpEvidence, buildSerpFormationAssessment, resolveSerpValidationProfile } from "@/lib/arquiteto/serp-formation";
import { resolveArticleSerpIdentityContext } from "@/lib/arquiteto/identity-context";
import { explicitEditorialFormat, normalizeSearchIntent } from "@/lib/arquiteto/intent-profile";
import { collectDataForSeoCompatibilitySnapshot, resolveDataForSeoCompatibilityConfig } from "@/lib/arquiteto/dataforseo-serp-compatibility";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { DataForSeoCanonicalError } from "@/lib/server/dataforseo-canonical";
import { DataForSeoSerpError } from "@/lib/minerador/dataforseo-serp";
import { IntegrationRuntimeError, integrationRuntimeErrorResponse, recordIntegrationUsage } from "@/lib/server/integrations-runtime";
import { resolvePipelineContext } from "@/lib/server/pipeline-runtime";
import { readbackArticleFormationSerpAssessment, saveArticleFormationSerpAssessment } from "@/lib/server/arquiteto-article-serp-store";
import { interpretArticleSerp, type KeywordSerpFacts } from "@/lib/arquiteto/article-serp-interpretation";
import type { DataForSeoSerpProviderDiagnostic } from "@/lib/server/dataforseo-serp-operation";

const RequestSchema = z.object({
  brandId: z.string().min(1),
  groups: z.array(ProvisionalArticleGroupSchema).min(1).max(20),
  siloCandidates: z.array(ArchitectKeywordSchema).max(20).default([]),
  location: z.string().trim().min(1).default("Brasil"),
  language: z.string().trim().min(2).default("pt-br"),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  resultLimit: z.number().int().positive().max(100).default(10),
  articleDnaVersionIds: z.record(z.string(), z.string().min(1)).optional(),
  previousAssessments: z.record(z.string(), z.object({ id: z.string().min(1), version: z.number().int().positive() })).optional(),
  /** Composição de cada Article candidato; a evidência nasce carimbada. */
  formationBaseHashes: z.record(z.string(), z.string().min(1)).optional(),
});

type SerpQueryDiagnostic = DataForSeoSerpProviderDiagnostic & {
  keywordId: string;
  internalCode: "SERP_REQUEST_FAILED" | "SERP_PROVIDER_RESPONSE_ERROR" | "SERP_TASK_ERROR" | "SERP_EMPTY_RESULT" | "SERP_NORMALIZATION_FAILED" | null;
  requestBuilt: boolean;
  apiRequestStarted: boolean;
  normalizationSucceeded: boolean;
};

type SerpOperationDiagnostic = {
  correlationId: string;
  route: "/api/arquiteto/serp";
  endpoint: "/v3/serp/google/organic/live/regular";
  stage: "request_validation" | "connection_resolution" | "provider_request" | "response_normalization" | "assessment" | "completed";
  internalCode: "SERP_CONNECTION_RESOLUTION_FAILED" | "SERP_REQUEST_FAILED" | "SERP_PROVIDER_RESPONSE_ERROR" | "SERP_TASK_ERROR" | "SERP_EMPTY_RESULT" | "SERP_NORMALIZATION_FAILED" | "SERP_PERSISTENCE_FAILED" | "SERP_READBACK_FAILED" | null;
  connectionResolved: boolean;
  requestBuilt: boolean;
  apiRequestStarted: boolean;
  httpStatus: number | null;
  rootStatusCode: number | null;
  rootStatusMessage: string | null;
  taskStatusCode: number | null;
  taskStatusMessage: string | null;
  taskCount: number;
  resultCount: number;
  itemsCount: number;
  normalizationSucceeded: boolean;
  assessmentSucceeded: boolean;
  persistenceSucceeded: "client_pending";
  readbackSucceeded: "client_pending";
  queries: SerpQueryDiagnostic[];
};

/**
 * Falha de um Article não é falha do lote: cada unidade carrega estágio,
 * código e motivo reais, e só erros compartilhados encerram a execução inteira.
 */
type SerpArticleFailure = {
  articleId: string;
  principalKeywordId: string;
  stage: SerpOperationDiagnostic["stage"];
  code: string;
  message: string;
  retryable: boolean;
};

function describeArticleFailure(input: {
  articleId: string;
  principalKeywordId: string;
  keywordIds: readonly string[];
  error: unknown;
  diagnostic: SerpOperationDiagnostic;
}): SerpArticleFailure {
  const queries = input.diagnostic.queries.filter(query => input.keywordIds.includes(query.keywordId));
  const failedQuery = queries.find(query => query.internalCode) || queries.at(-1) || null;
  const providerError = input.error instanceof DataForSeoSerpError ? input.error : null;
  const stage: SerpOperationDiagnostic["stage"] = failedQuery?.normalizationSucceeded === false && failedQuery.apiRequestStarted
    ? "response_normalization"
    : failedQuery?.apiRequestStarted
      ? "provider_request"
      : failedQuery?.requestBuilt
        ? "provider_request"
        : "assessment";
  const code = failedQuery?.internalCode
    || (providerError
      ? providerError.code === "dataforseo_task_failed" ? "SERP_TASK_ERROR" : "SERP_PROVIDER_RESPONSE_ERROR"
      : "SERP_ASSESSMENT_FAILED");
  // Falha de provider/normalização é tentável de novo; falha estrutural do
  // grupo (principal ausente, refs incompletas) exige correção antes.
  const retryable = code !== "SERP_ASSESSMENT_FAILED";
  return {
    articleId: input.articleId,
    principalKeywordId: input.principalKeywordId,
    stage,
    code,
    message: input.error instanceof Error && input.error.message.trim() ? input.error.message.trim() : "Falha não identificada ao avaliar a SERP deste artigo.",
    retryable,
  };
}

function createSerpDiagnostic(correlationId: string): SerpOperationDiagnostic {
  return {
    correlationId,
    route: "/api/arquiteto/serp",
    endpoint: "/v3/serp/google/organic/live/regular",
    stage: "request_validation",
    internalCode: null,
    connectionResolved: false,
    requestBuilt: false,
    apiRequestStarted: false,
    httpStatus: null,
    rootStatusCode: null,
    rootStatusMessage: null,
    taskStatusCode: null,
    taskStatusMessage: null,
    taskCount: 0,
    resultCount: 0,
    itemsCount: 0,
    normalizationSucceeded: false,
    assessmentSucceeded: false,
    // O endpoint constrói assessments; a persistência/readback ocorre no
    // artefato local do workspace após a resposta e não é alegada pelo servidor.
    persistenceSucceeded: "client_pending",
    readbackSucceeded: "client_pending",
    queries: [],
  };
}

function emptyQueryDiagnostic(keywordId: string): SerpQueryDiagnostic {
  return {
    keywordId,
    internalCode: null,
    requestBuilt: false,
    apiRequestStarted: false,
    normalizationSucceeded: false,
    httpStatus: null,
    rootStatusCode: null,
    rootStatusMessage: null,
    taskStatusCode: null,
    taskStatusMessage: null,
    taskCount: 0,
    resultCount: 0,
    itemsCount: 0,
    providerRequestId: null,
  };
}

function diagnosticCodeFor(query: SerpQueryDiagnostic): SerpQueryDiagnostic["internalCode"] {
  if (!query.requestBuilt || !query.apiRequestStarted) return "SERP_REQUEST_FAILED";
  if (query.httpStatus === null) return "SERP_REQUEST_FAILED";
  if (query.httpStatus !== null && (query.httpStatus < 200 || query.httpStatus >= 300)) return "SERP_PROVIDER_RESPONSE_ERROR";
  if (query.rootStatusCode !== null && query.rootStatusCode !== 20000) return "SERP_PROVIDER_RESPONSE_ERROR";
  if (query.taskStatusCode !== null && query.taskStatusCode !== 20000) return "SERP_TASK_ERROR";
  if (query.resultCount === 0 || query.itemsCount === 0) return "SERP_EMPTY_RESULT";
  if (!query.normalizationSucceeded) return "SERP_NORMALIZATION_FAILED";
  return null;
}

function logSerpFailure(diagnostic: SerpOperationDiagnostic, error: unknown) {
  console.error("[arquiteto/serp] operação não concluída", {
    correlationId: diagnostic.correlationId,
    route: diagnostic.route,
    stage: diagnostic.stage,
    internalCode: diagnostic.internalCode,
    connectionResolved: diagnostic.connectionResolved,
    requestBuilt: diagnostic.requestBuilt,
    apiRequestStarted: diagnostic.apiRequestStarted,
    httpStatus: diagnostic.httpStatus,
    rootStatusCode: diagnostic.rootStatusCode,
    taskStatusCode: diagnostic.taskStatusCode,
    taskCount: diagnostic.taskCount,
    resultCount: diagnostic.resultCount,
    itemsCount: diagnostic.itemsCount,
    normalizationSucceeded: diagnostic.normalizationSucceeded,
    assessmentSucceeded: diagnostic.assessmentSucceeded,
    persistenceSucceeded: diagnostic.persistenceSucceeded,
    readbackSucceeded: diagnostic.readbackSucceeded,
    queries: diagnostic.queries,
    errorName: error instanceof Error ? error.name : "UnknownError",
    // A mensagem já é sanitizada nas camadas de provider; não logamos payload,
    // headers, credenciais, snippets ou qualquer campo de raciocínio.
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Falha não identificada.",
  });
}

export async function POST(request: Request) {
  const diagnostic = createSerpDiagnostic(crypto.randomUUID());
  try {
    const profile = await requireCanonicalSessionProfile();
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Pedido de SERP inválido.", issues: parsed.error.flatten() }, { status: 400 });
    await assertEditorialPermission(profile, parsed.data.brandId, "arquiteto", "edit");
    const pipelineContext = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "arquiteto", action: "edit" });

    const groups = parsed.data.groups;
    const totalKeywords = groups.reduce((total, group) => total + group.keywords.length, 0) + parsed.data.siloCandidates.length;
    if (groups.some(group => group.keywords.length !== group.keywordIds.length)) {
      return NextResponse.json({ success: false, error: "O grupo contém keywords divergentes entre IDs e objetos." }, { status: 422 });
    }
    const operationRequestId = diagnostic.correlationId;
    diagnostic.stage = "connection_resolution";
    const dataForSeo = await resolveDataForSeoCompatibilityConfig({
      actorUserId: pipelineContext.actorUserId,
      brandId: pipelineContext.brandId,
      client: pipelineContext.supabase,
      quotaUnits: totalKeywords,
    });
    diagnostic.connectionResolved = true;

    const recordSerpUsage = async (input: { articleId: string; keywordId: string; resultStatus: "succeeded" | "failed"; errorCode?: string | null }) => recordIntegrationUsage({
      resource: dataForSeo.resource,
      operation: "module_operation",
      module: "arquiteto",
      resultStatus: input.resultStatus,
      units: 1,
      errorCode: input.errorCode || null,
      idempotencyKey: `dataforseo:serp_validation:${operationRequestId}:${input.articleId}:${input.keywordId}`,
      metadata: {
        operationRequestId,
        operationKind: "serp_validation",
        articleId: input.articleId,
        keywordId: input.keywordId,
      },
    });

    const settledAssessments = await Promise.allSettled(groups.map(async group => {
      const articleId = group.publishedAnchorId || group.id;
      const articleDnaVersionId = parsed.data.articleDnaVersionIds?.[articleId] || `work:${articleId}`;
      const principalId = group.principalSuggestion.keywordId;
      const principal = group.keywords.find(keyword => keyword.id === principalId);
      const identityContext = resolveArticleSerpIdentityContext({
        published: Boolean(group.publishedAnchorId),
        principalKeywordId: principalId,
        primaryKeywordPolicy: principal?.primaryKeywordPolicy,
        keywordUrlRelation: principal?.keywordUrlRelation,
        architectureStatus: group.architectureStatus || principal?.architectureStatus,
        kgrIdentity: group.kgrIdentity || principal?.kgrIdentity,
        slug: principal?.slug_sugerido,
      });
      const references = group.keywords.map(keyword => articleKeywordReference(keyword,
        keyword.id === principalId ? "principal" : group.roles[keyword.id] === "reforco_narrativo" ? "reforco_narrativo" : "secundaria", parsed.data.brandId));
      const validationProfile = resolveSerpValidationProfile(identityContext.mode, identityContext.kgrIdentityProtected);
      const collect = async (keyword: typeof group.keywords[number], index: number) => {
        const queryDiagnostic = emptyQueryDiagnostic(keyword.id);
        diagnostic.queries.push(queryDiagnostic);
        const reference = references[index];
        if (!reference) throw new Error(`Referência ausente para ${keyword.id}.`);
        const serpInput = {
          brandId: parsed.data.brandId, articleId, articleDnaVersionId, keywordId: keyword.id,
          keywordDnaVersionId: reference.keywordDnaVersionId, keyword: keyword.keyword,
          location: parsed.data.location, language: parsed.data.language, device: parsed.data.device,
          expectedIntent: normalizeSearchIntent(keyword.intent || keyword.analise_semantica?.intencao_principal), expectedFormat: explicitEditorialFormat(keyword) || "",
          requiredTopics: [keyword.keyword], articleEntities: [], resultLimit: parsed.data.resultLimit,
          version: 1, previousSnapshotId: null,
        };
        try {
          diagnostic.stage = "provider_request";
          const snapshot = await collectDataForSeoCompatibilitySnapshot(serpInput, {
            actorUserId: pipelineContext.actorUserId,
            brandId: pipelineContext.brandId,
            resolution: dataForSeo,
            operationRequestId,
            onRequestBuilt: () => { queryDiagnostic.requestBuilt = true; diagnostic.requestBuilt = true; },
            onRequestStarted: () => { queryDiagnostic.apiRequestStarted = true; diagnostic.apiRequestStarted = true; },
            onHttpResponse: (httpStatus) => { queryDiagnostic.httpStatus = httpStatus; diagnostic.httpStatus = httpStatus; },
            onProviderResponse: (providerDiagnostic) => {
              Object.assign(queryDiagnostic, providerDiagnostic);
              diagnostic.httpStatus = providerDiagnostic.httpStatus;
              diagnostic.rootStatusCode = providerDiagnostic.rootStatusCode;
              diagnostic.rootStatusMessage = providerDiagnostic.rootStatusMessage;
              diagnostic.taskStatusCode = providerDiagnostic.taskStatusCode;
              diagnostic.taskStatusMessage = providerDiagnostic.taskStatusMessage;
              diagnostic.taskCount = providerDiagnostic.taskCount;
              diagnostic.resultCount = providerDiagnostic.resultCount;
              diagnostic.itemsCount = providerDiagnostic.itemsCount;
            },
            onNormalizationSucceeded: () => { queryDiagnostic.normalizationSucceeded = true; diagnostic.normalizationSucceeded = true; },
          });
          queryDiagnostic.internalCode = diagnosticCodeFor(queryDiagnostic);
          await recordSerpUsage({ articleId, keywordId: keyword.id, resultStatus: "succeeded" });
          return snapshot;
        } catch (error) {
          diagnostic.normalizationSucceeded = false;
          queryDiagnostic.internalCode = diagnosticCodeFor(queryDiagnostic);
          if (error instanceof DataForSeoSerpError) {
            queryDiagnostic.internalCode = error.code === "dataforseo_task_failed"
              ? "SERP_TASK_ERROR"
              : error.code === "dataforseo_http" || error.code === "dataforseo_timeout"
                ? "SERP_PROVIDER_RESPONSE_ERROR"
                : "SERP_NORMALIZATION_FAILED";
          }
          diagnostic.internalCode = queryDiagnostic.internalCode || "SERP_NORMALIZATION_FAILED";
          diagnostic.stage = queryDiagnostic.normalizationSucceeded ? "assessment" : "response_normalization";
          if (error instanceof DataForSeoSerpError) await recordSerpUsage({ articleId, keywordId: keyword.id, resultStatus: "failed", errorCode: error.code });
          throw error;
        }
      };
      const principalIndex = group.keywords.findIndex(keyword => keyword.id === principalId);
      if (principalIndex < 0) throw new Error("KeywordDNA principal ausente no grupo.");
      const principalSnapshot = await collect(group.keywords[principalIndex], principalIndex);
      const snapshots = [principalSnapshot];
      const principalAmbiguous = principalSnapshot.diagnostic.verdict === "possivel_conflito"
        || principalSnapshot.diagnostic.verdict === "parcialmente_coerente"
        || principalSnapshot.diagnostic.verdict === "informacao_insuficiente"
        || principalSnapshot.diagnostic.confidence === "low"
        || principalSnapshot.diagnostic.confidence === "insufficient";
      if (validationProfile !== "kgr_light" || principalAmbiguous) {
        const secondarySnapshots = await Promise.all(group.keywords.map((keyword, index) => index === principalIndex ? null : collect(keyword, index)));
        snapshots.push(...secondarySnapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot)));
      }
      const keywordDnaReferences = references.map(reference => reference.keywordDnaSnapshot).filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
      if (keywordDnaReferences.length !== references.length) throw new Error("KeywordDNA integral ausente na formação do assessment.");
      const previous = parsed.data.previousAssessments?.[articleId];
      return buildSerpFormationAssessment({ brandId: parsed.data.brandId, articleId, articleDnaVersionId, createdBy: profile.userId,
        previousVersionId: previous?.id || null, previousVersion: previous?.version || 0,
        principalKeywordId: principalId, assessmentMode: identityContext.mode, validationProfile, keywordReferences: references, keywordDnaReferences, snapshots,
        queriedKeywordDnaIds: snapshots.map(snapshot => snapshot.keywordId),
        // A evidência nasce dizendo qual composição observou.
        formationBaseHash: parsed.data.formationBaseHashes?.[articleId] || null });
    }));

    // Erro compartilhado (conexão, credencial, capability, quota) encerra o
    // lote; falha específica de um Article preserva os assessments válidos.
    const assessments: Awaited<ReturnType<typeof buildSerpFormationAssessment>>[] = [];
    const failures: SerpArticleFailure[] = [];
    settledAssessments.forEach((settled, index) => {
      const group = groups[index];
      if (settled.status === "fulfilled") {
        assessments.push(settled.value);
        return;
      }
      const error = settled.reason;
      if (error instanceof DataForSeoCanonicalError || error instanceof IntegrationRuntimeError) throw error;
      failures.push(describeArticleFailure({
        articleId: group.publishedAnchorId || group.id,
        principalKeywordId: group.principalSuggestion.keywordId,
        keywordIds: group.keywords.map(keyword => keyword.id),
        error,
        diagnostic,
      }));
    });
    const siloCandidateEvidence = await Promise.all(parsed.data.siloCandidates
      .filter(keyword => keyword.siloCandidate?.status === "candidate")
      .map(async keyword => {
        const articleId = `silo-candidate:${keyword.id}`;
        const articleDnaVersionId = `work:${articleId}`;
        const keywordDnaSnapshot = buildKeywordDnaProvenanceSnapshot(keyword, { brandId: parsed.data.brandId });
        const queryDiagnostic = emptyQueryDiagnostic(keyword.id);
        diagnostic.queries.push(queryDiagnostic);
        try {
          diagnostic.stage = "provider_request";
          const snapshot = await collectDataForSeoCompatibilitySnapshot({
            brandId: parsed.data.brandId, articleId, articleDnaVersionId, keywordId: keyword.id,
            keywordDnaVersionId: keywordDnaSnapshot.versionReference.versionId, keyword: keyword.keyword,
            location: parsed.data.location, language: parsed.data.language, device: parsed.data.device,
            expectedIntent: normalizeSearchIntent(keyword.intent || keyword.analise_semantica?.intencao_principal),
            expectedFormat: explicitEditorialFormat(keyword) || "", requiredTopics: [keyword.keyword], articleEntities: [],
            resultLimit: parsed.data.resultLimit, version: 1, previousSnapshotId: null,
          }, {
            actorUserId: pipelineContext.actorUserId, brandId: pipelineContext.brandId, resolution: dataForSeo,
            operationRequestId,
            onRequestBuilt: () => { queryDiagnostic.requestBuilt = true; diagnostic.requestBuilt = true; },
            onRequestStarted: () => { queryDiagnostic.apiRequestStarted = true; diagnostic.apiRequestStarted = true; },
            onHttpResponse: (httpStatus) => { queryDiagnostic.httpStatus = httpStatus; diagnostic.httpStatus = httpStatus; },
            onProviderResponse: (providerDiagnostic) => {
              Object.assign(queryDiagnostic, providerDiagnostic);
              diagnostic.httpStatus = providerDiagnostic.httpStatus;
              diagnostic.rootStatusCode = providerDiagnostic.rootStatusCode;
              diagnostic.rootStatusMessage = providerDiagnostic.rootStatusMessage;
              diagnostic.taskStatusCode = providerDiagnostic.taskStatusCode;
              diagnostic.taskStatusMessage = providerDiagnostic.taskStatusMessage;
              diagnostic.taskCount = providerDiagnostic.taskCount;
              diagnostic.resultCount = providerDiagnostic.resultCount;
              diagnostic.itemsCount = providerDiagnostic.itemsCount;
            },
            onNormalizationSucceeded: () => { queryDiagnostic.normalizationSucceeded = true; diagnostic.normalizationSucceeded = true; },
          });
          queryDiagnostic.internalCode = diagnosticCodeFor(queryDiagnostic);
          await recordSerpUsage({ articleId, keywordId: keyword.id, resultStatus: "succeeded" });
          return buildSiloCandidateSerpEvidence({ brandId: parsed.data.brandId, createdBy: profile.userId, keywordDnaSnapshot, snapshot });
        } catch (error) {
          queryDiagnostic.internalCode = diagnosticCodeFor(queryDiagnostic);
          if (error instanceof DataForSeoSerpError) {
            queryDiagnostic.internalCode = error.code === "dataforseo_task_failed"
              ? "SERP_TASK_ERROR"
              : error.code === "dataforseo_http" || error.code === "dataforseo_timeout"
                ? "SERP_PROVIDER_RESPONSE_ERROR"
                : "SERP_NORMALIZATION_FAILED";
            await recordSerpUsage({ articleId, keywordId: keyword.id, resultStatus: "failed", errorCode: error.code });
          }
          return buildSiloCandidateSerpEvidence({ brandId: parsed.data.brandId, createdBy: profile.userId, keywordDnaSnapshot, snapshot: null });
        }
      }));
    /**
     * A evidência vira artefato remoto ANTES de a rota responder.
     *
     * Enquanto ela vivia só no navegador, era um cache com cara de contrato:
     * outra máquina, outro ator, e a mesa continuaria capaz de dizer
     * "SERP atual" sobre uma evidência que não existia em lugar nenhum.
     *
     * O parecer é interpretado aqui, dos resultados observados — e não da
     * intenção que o Minerador declarou, que pode legitimamente ser unknown.
     */
    const persisted: { candidateRef: string; verdict: string; workflowItemId: string }[] = [];
    for (const assessment of assessments) {
      const group = groups.find(item => (item.publishedAnchorId || item.id) === assessment.articleId);
      const territoryRef = group ? (group as { territoryRef?: string }).territoryRef : null;
      const formationBaseHash = parsed.data.formationBaseHashes?.[assessment.articleId];
      // Sem pai declarado ou sem base, a evidência não teria como provar que
      // descreve esta composição: melhor não gravar do que gravar sem prova.
      if (!group || !territoryRef || !formationBaseHash) continue;

      const members: KeywordSerpFacts[] = group.keywords.map(keyword => ({
        keywordId: String(keyword.id),
        keyword: String(keyword.keyword),
        role: String(keyword.id) === group.principalSuggestion.keywordId
          ? "principal" as const
          : (group.roles || {})[String(keyword.id)] === "reforco_narrativo" ? "reforco" as const : "secundaria" as const,
        results: (assessment.snapshots.find(snapshot => snapshot.keywordId === String(keyword.id))?.organicResults || [])
          .map(result => ({
            position: result.position, title: result.title, url: result.url,
            domain: result.domain, snippet: result.snippet, inferredType: result.manualType || result.inferredType,
          })),
      }));

      const interpretation = interpretArticleSerp({
        candidateRef: assessment.articleId,
        members,
        principalKeywordId: group.principalSuggestion.keywordId,
      });

      const saved = await saveArticleFormationSerpAssessment(pipelineContext, {
        candidateRef: assessment.articleId,
        territoryRef,
        formationBaseHash,
        verdict: interpretation.verdict,
        assessment,
        operationRequestId,
        interpretation: {
          principalVerdict: interpretation.principal.kind,
          principalAlternativeKeywordId: interpretation.principal.principalAlternativeKeywordId,
          principalReason: interpretation.principal.reason,
          groupVerdict: interpretation.group.kind,
          groupReason: interpretation.group.reason,
          outsiders: interpretation.group.outsiders.map(item => ({ ...item })),
          observedIntent: interpretation.observedIntent,
          dominantType: interpretation.dominantType,
          viability: interpretation.viability.level,
          viabilityText: interpretation.viability.text,
          distinctDomains: interpretation.viability.distinctDomains,
          converging: interpretation.group.converging,
          total: interpretation.group.total,
          recommendation: interpretation.recommendation,
        },
      });
      // Gravar não é sucesso: sucesso é o remoto devolver o que foi gravado.
      const lido = await readbackArticleFormationSerpAssessment(pipelineContext, assessment.articleId);
      if (lido.payload.formationBaseHash !== formationBaseHash) {
        throw new Error(`O readback do parecer ${assessment.articleId} não devolveu a composição gravada.`);
      }
      persisted.push({ candidateRef: saved.candidateRef, verdict: lido.payload.verdict, workflowItemId: saved.workflowItemId });
    }

    diagnostic.assessmentSucceeded = assessments.length > 0;
    diagnostic.stage = failures.length && !assessments.length ? "assessment" : "completed";
    if (failures.length) diagnostic.internalCode = failures[0].code as SerpOperationDiagnostic["internalCode"];
    return NextResponse.json({ success: true, data: { assessments, persisted, failures, summary: { requestedArticles: groups.length, completedArticles: assessments.length, failedArticles: failures.length }, siloCandidateEvidence, queryCount: assessments.reduce((total, assessment) => total + assessment.queryCount, 0), candidateQueryCount: siloCandidateEvidence.filter(item => item.snapshot).length, requestedKeywordCount: totalKeywords, mode: "keyword_individual" }, diagnostic });
  } catch (error) {
    if (error instanceof DataForSeoCanonicalError || error instanceof DataForSeoSerpError) {
      if (!diagnostic.internalCode) diagnostic.internalCode = error instanceof DataForSeoCanonicalError ? "SERP_CONNECTION_RESOLUTION_FAILED" : "SERP_REQUEST_FAILED";
      logSerpFailure(diagnostic, error);
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code,
        diagnostic,
      }, { status: error.status });
    }
    if (error instanceof IntegrationRuntimeError) {
      const mapped = integrationRuntimeErrorResponse(error);
      diagnostic.stage = "connection_resolution";
      diagnostic.internalCode = "SERP_CONNECTION_RESOLUTION_FAILED";
      logSerpFailure(diagnostic, error);
      return NextResponse.json({ success: false, error: mapped.message, code: mapped.code, diagnostic }, { status: mapped.status });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
