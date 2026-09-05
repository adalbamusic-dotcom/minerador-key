import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireCanonicalSessionProfile,
  assertCanAccessMarca,
  assertKeywordBelongsToMarca,
  authzErrorResponse,
} from "@/lib/server/authz";
import { extractIntentNicheClassification } from "@/lib/minerador/intent-niche-response";
import { ProviderRequestError } from "@/lib/arquiteto/provider-client";
import { resolveDeepSeekCanonicalConfig, DeepSeekCanonicalError } from "@/lib/server/deepseek-canonical";
import { DeepSeekR5ResponseError } from "@/lib/minerador/deepseek-r5";
import { PhasedSemanticReviewError, runKeywordSemanticReview, type SemanticReviewPhaseUsageEvent } from "@/lib/minerador/semantic-review-orchestrator";
import { resolveMineradorProcessState } from "@/lib/minerador/process-state";
import { resolveLogicalProcessReadiness } from "@/lib/minerador/logical-processor";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createIntegrationRuntimeRepository, IntegrationRuntimeError, recordIntegrationUsageForResource } from "@/lib/server/integrations-runtime";
import { generateStructuredAI, StructuredAIError } from "@/lib/server/structured-ai";
import {
  buildSemanticReviewContext,
  buildSemanticReviewRecord,
  deriveDnaMaturity,
  SemanticReviewPreconditionError,
  type SemanticReviewContext,
} from "@/lib/minerador/semantic-review";

function isHumanConfirmed(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ["confirmada", "confirmado", "aprovada", "aprovado", "confirmed"].includes(normalized);
}

function buildSemanticReviewSessionId(brandId: string, keywordId: string, operationRequestId: string): string {
  return `minerador-r5:${brandId}:${keywordId}:${operationRequestId}`.slice(0, 256);
}

const IntentNicheProviderSchema = z.object({
  intent: z.string().trim().min(1).max(80),
  nicho: z.string().trim().min(1).max(120),
}).passthrough();

type SemanticReviewStreamInput = {
  profile: Awaited<ReturnType<typeof requireCanonicalSessionProfile>>;
  sourceKeyword: { brand_id: string; keyword?: unknown };
  semantic: Record<string, unknown>;
  context: SemanticReviewContext;
  canonicalAI: Awaited<ReturnType<typeof resolveDeepSeekCanonicalConfig>>;
  canonicalClient: ReturnType<typeof createCanonicalServiceClient>;
  operationRequestId: string;
  executionRequestId: string;
  sessionId: string;
  keywordId: string;
  mode: "semantic_review";
  userInitiated: boolean;
};

function streamSemanticReview(input: SemanticReviewStreamInput): Response {
  const encoder = new TextEncoder();
  const write = (controller: ReadableStreamDefaultController<Uint8Array>, event: Record<string, unknown>) => {
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
  };
  const phaseDiagnostics: Array<Record<string, unknown>> = [];
  const phaseUsageDependencies = {
    repository: createIntegrationRuntimeRepository(input.canonicalClient),
    authorizationRepository: createCanonicalAuthorizationRepository(input.canonicalClient),
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      write(controller, { type: "started", operationRequestId: input.operationRequestId, executionRequestId: input.executionRequestId });
      try {
        const phased = await runKeywordSemanticReview({
          context: input.context,
          provider: {
            apiUrl: input.canonicalAI.apiUrl,
            apiKey: input.canonicalAI.apiKey,
            model: input.canonicalAI.model,
            extraHeaders: input.canonicalAI.extraHeaders,
             responseFormatMode: input.canonicalAI.responseFormatMode,
             thinkingMode: input.canonicalAI.thinkingMode,
            sessionId: input.sessionId,
          },
          onPhaseStarted: (progress) => {
            write(controller, { type: "progress", ...progress });
          },
          userInitiated: input.userInitiated,
          onPhaseUsage: async (event: SemanticReviewPhaseUsageEvent) => {
            phaseDiagnostics.push({
              phase: event.phaseNumber,
              executionRequestId: input.executionRequestId,
              operationRequestId: input.operationRequestId,
              attempt: event.attempt,
              retry: event.retry === true,
              label: event.label,
              status: event.status,
              reasoningMode: event.diagnostic.reasoningMode,
              reasoningEffort: event.diagnostic.reasoningEffort,
              thinkingExplicitlyConfigured: event.diagnostic.thinkingExplicitlyConfigured,
              promptTokens: event.diagnostic.promptTokens,
              reasoningTokens: event.diagnostic.reasoningTokens,
              completionTokens: event.diagnostic.completionTokens,
              totalTokens: event.diagnostic.totalTokens,
              cost: event.diagnostic.cost,
              finishReason: event.diagnostic.finishReason,
              maxCompletionTokens: event.diagnostic.phaseMaxCompletionTokens,
              requestedMaxTokens: event.diagnostic.requestedMaxTokens,
              providerRequireParameters: event.diagnostic.providerRequireParameters,
              providerRequestRef: event.diagnostic.requestId,
              schemaIssuePaths: event.diagnostic.schemaIssuePaths,
              schemaIssues: event.diagnostic.schemaIssues,
              responseShape: event.diagnostic.responseShape,
              jsonParse: event.diagnostic.jsonParse,
              schemaValidation: event.diagnostic.schemaValidation,
              attemptLabel: event.phaseNumber === 3 && event.retry === true ? "repair_1" : `attempt_${event.attempt}`,
            });
            await recordIntegrationUsageForResource({
              resource: input.canonicalAI.resource,
              operation: "module_operation",
              module: "minerador",
              resultStatus: event.status,
              units: 1,
              idempotencyKey: `minerador:process-intent-niche:${input.operationRequestId}:phase-${event.phaseNumber}:attempt-${event.attempt}`,
              providerReference: event.diagnostic.requestId,
              errorCode: event.status === "failed" ? event.providerCode || "AI_PHASE_FAILED" : null,
              metadata: {
                operationRequestId: input.operationRequestId,
                executionRequestId: input.executionRequestId,
                keywordId: input.keywordId,
                mode: input.mode,
                phase: event.phaseNumber,
                phaseName: event.phase,
                attempt: event.attempt,
                retry: event.retry === true,
                model: input.canonicalAI.model,
                reasoningMode: event.diagnostic.reasoningMode,
                reasoningEffort: event.diagnostic.reasoningEffort,
                thinkingExplicitlyConfigured: event.diagnostic.thinkingExplicitlyConfigured,
                promptTokens: event.diagnostic.promptTokens,
                reasoningTokens: event.diagnostic.reasoningTokens,
                completionTokens: event.diagnostic.completionTokens,
                totalTokens: event.diagnostic.totalTokens,
                cost: event.diagnostic.cost,
                finishReason: event.diagnostic.finishReason,
                maxCompletionTokens: event.diagnostic.phaseMaxCompletionTokens,
                requestedMaxTokens: event.diagnostic.requestedMaxTokens,
                providerRequireParameters: event.diagnostic.providerRequireParameters,
                schemaIssuePaths: event.diagnostic.schemaIssuePaths,
                schemaIssues: event.diagnostic.schemaIssues,
                responseShape: event.diagnostic.responseShape,
                jsonParse: event.diagnostic.jsonParse,
                schemaValidation: event.diagnostic.schemaValidation,
                attemptLabel: event.phaseNumber === 3 && event.retry === true ? "repair_1" : `attempt_${event.attempt}`,
                sessionId: input.sessionId,
              },
            }, phaseUsageDependencies).catch((usageError) => {
              console.error("Não foi possível registrar o usage da fase R5.2:", usageError);
            });
          },
        });

        const review = buildSemanticReviewRecord({
          output: phased.output,
          context: input.context,
          generatedAt: new Date().toISOString(),
          model: input.canonicalAI.model,
          operationRequestId: input.operationRequestId,
        });
        if (phased.humanReviewNotes.length) review.humanReviewNotes = phased.humanReviewNotes;
        const updatedSemantic = { ...input.semantic, ai_review: review };
        const { error: updateError } = await input.profile.supabase
          .from("minerador_keywords")
          .update({ analise_semantica: updatedSemantic })
          .eq("id", input.keywordId)
          .eq("brand_id", input.sourceKeyword.brand_id)
          .is("deleted_at", null);
        if (updateError) throw updateError;
        const { data: readback, error: readbackError } = await input.profile.supabase
          .from("minerador_keywords")
          .select("id,brand_id,analise_semantica")
          .eq("id", input.keywordId)
          .eq("brand_id", input.sourceKeyword.brand_id)
          .is("deleted_at", null)
          .maybeSingle();
        if (readbackError) throw readbackError;
        const readbackSemantic = readback?.analise_semantica && typeof readback.analise_semantica === "object" && !Array.isArray(readback.analise_semantica)
          ? readback.analise_semantica as Record<string, unknown>
          : null;
        const readbackReview = readbackSemantic?.ai_review && typeof readbackSemantic.ai_review === "object" && !Array.isArray(readbackSemantic.ai_review)
          ? readbackSemantic.ai_review as Record<string, unknown>
          : null;
        if (!readback || readback.brand_id !== input.sourceKeyword.brand_id || readbackReview?.inputHash !== review.inputHash) {
          throw new Error("A revisão IA foi persistida, mas o readback do KeywordDNA atual não foi confirmado.");
        }

        const maturity = deriveDnaMaturity({
          logicalProcessed: input.context.logical.processed,
          googleAdsValid: input.context.googleAds.valid,
          dataForSeoValid: input.context.dataForSeo.valid,
          kgrTreated: input.context.kgr.treated,
          aiReviewCompleted: true,
          humanConfirmed: isHumanConfirmed(input.semantic.dna_revisao_humana),
        });
        write(controller, {
          type: "result",
          success: true,
          review,
          operationRequestId: input.operationRequestId,
          executionRequestId: input.executionRequestId,
          maturity,
          phaseDiagnostics,
          // Internal read-model telemetry only; it is correlated by the
          // executionRequestId and is deliberately not persisted in ai_review.
          valueTelemetry: phased.valueTelemetry,
        });
      } catch (error) {
        if (error instanceof PhasedSemanticReviewError) {
          write(controller, {
            type: "result",
            success: false,
            operationRequestId: input.operationRequestId,
            executionRequestId: input.executionRequestId,
            error: error.message,
            code: error.code,
            stage: `phase_${error.phaseNumber}`,
            diagnostic: { source: "canonical", providerCode: error.providerCode, ...error.diagnostic },
            phaseDiagnostics,
          });
        } else {
          write(controller, {
            type: "result",
            success: false,
            operationRequestId: input.operationRequestId,
            executionRequestId: input.executionRequestId,
            error: "Não foi possível concluir a revisão IA da keyword.",
            code: "AI_REVIEW_PERSISTENCE_FAILED",
            stage: "persistence",
            phaseDiagnostics,
          });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: Request) {
  let apiRequestStarted = false;
  let canonicalAI: Awaited<ReturnType<typeof resolveDeepSeekCanonicalConfig>> | null = null;
  let canonicalClient: ReturnType<typeof createCanonicalServiceClient> | null = null;
  const operationRequestId = crypto.randomUUID();
  let executionRequestId = operationRequestId;
  try {
    // 1. Autenticacao e autorizacao (ownership da keyword por marca)
    const profile = await requireCanonicalSessionProfile();

    const body = await req.json() as { keywordId?: unknown; keyword?: unknown; brandId?: unknown; mode?: unknown; userInitiated?: unknown; executionRequestId?: unknown };
    if (typeof body.executionRequestId === "string" && body.executionRequestId.trim()) {
      executionRequestId = body.executionRequestId.trim().slice(0, 256);
    }
    const keywordId = typeof body.keywordId === "string" ? body.keywordId : "";
    const keyword = typeof body.keyword === "string" ? body.keyword : "";
    const brandId = typeof body.brandId === "string" ? body.brandId : "";
    const mode = body.mode === "semantic_review" ? "semantic_review" : "legacy";
    if (!keywordId || !brandId || (mode === "legacy" && !keyword)) {
      return NextResponse.json(
        { success: false, error: "Parâmetros inválidos. É necessário informar keywordId e keyword." },
        { status: 400 }
      );
    }

    // 2. Confirma que a keyword pertence a marca permitida.
    //    intent e analise_semantica.nicho_override sao editoriais (permitidos em publicado).
    await assertCanAccessMarca(profile.userId, brandId, profile);
    await assertKeywordBelongsToMarca(keywordId, brandId, profile);

    if (mode === "semantic_review") {
      const { data: sourceKeyword, error: sourceKeywordError } = await profile.supabase
        .from("minerador_keywords")
        .select("id,brand_id,keyword,location,intent,volume_search,results_allintitle,kgr_score,analise_semantica")
        .eq("id", keywordId)
        .eq("brand_id", brandId)
        .is("deleted_at", null)
        .maybeSingle();

      if (sourceKeywordError || !sourceKeyword?.brand_id) {
        throw new Error("Não foi possível carregar a keyword canônica para a revisão.");
      }

      const semantic = sourceKeyword.analise_semantica && typeof sourceKeyword.analise_semantica === "object" && !Array.isArray(sourceKeyword.analise_semantica)
        ? sourceKeyword.analise_semantica as Record<string, unknown>
        : {};
      const context = buildSemanticReviewContext({
        keyword: typeof sourceKeyword.keyword === "string" ? sourceKeyword.keyword : keyword,
        intent: typeof sourceKeyword.intent === "string" ? sourceKeyword.intent : null,
        volume_search: typeof sourceKeyword.volume_search === "number" ? sourceKeyword.volume_search : null,
        results_allintitle: typeof sourceKeyword.results_allintitle === "number" ? sourceKeyword.results_allintitle : null,
        kgr_score: typeof sourceKeyword.kgr_score === "number" ? sourceKeyword.kgr_score : null,
        analise_semantica: semantic,
      });

      const logicalNiche = typeof semantic.nicho_override === "string"
        ? semantic.nicho_override
        : typeof semantic.nicho === "string"
          ? semantic.nicho
          : null;
      const logicReadiness = resolveLogicalProcessReadiness({
        keywordId,
        keyword: typeof sourceKeyword.keyword === "string" ? sourceKeyword.keyword : keyword,
        location: typeof sourceKeyword.location === "string" ? sourceKeyword.location : null,
        niche: logicalNiche,
        semantic,
      });

      const processState = resolveMineradorProcessState({
        id: keywordId,
        keyword: typeof sourceKeyword.keyword === "string" ? sourceKeyword.keyword : keyword,
        location: typeof sourceKeyword.location === "string" ? sourceKeyword.location : null,
        intent: typeof sourceKeyword.intent === "string" ? sourceKeyword.intent : null,
        volume_search: sourceKeyword.volume_search,
        results_allintitle: sourceKeyword.results_allintitle,
        analise_semantica: semantic,
        logicalNiche,
      });
      if (!processState.logic.complete) {
        throw new SemanticReviewPreconditionError("AI_REVIEW_LOGIC_REQUIRED", undefined, {
          logicReadiness,
          processState: processState.logic,
        });
      }
      if (!context.googleAds.valid || !context.dataForSeo.valid || !processState.volume.complete || !processState.results.complete) {
        throw new SemanticReviewPreconditionError("AI_REVIEW_QUANTITATIVE_EVIDENCE_REQUIRED");
      }

      canonicalClient = createCanonicalServiceClient();
       canonicalAI = await resolveDeepSeekCanonicalConfig({
        client: canonicalClient,
        actorUserId: profile.userId,
        brandId,
        quotaUnits: 3,
      });
      const sessionId = buildSemanticReviewSessionId(brandId, keywordId, operationRequestId);
      return streamSemanticReview({
        profile,
        sourceKeyword: { brand_id: sourceKeyword.brand_id, keyword: sourceKeyword.keyword },
        semantic,
        context,
        canonicalAI,
        canonicalClient,
        operationRequestId,
        executionRequestId,
        sessionId,
        keywordId,
        mode: "semantic_review",
        userInitiated: body.userInitiated === true,
      });
    }

    canonicalClient = createCanonicalServiceClient();
     canonicalAI = await resolveDeepSeekCanonicalConfig({
      client: canonicalClient,
      actorUserId: profile.userId,
      brandId,
      quotaUnits: 1,
    });
    apiRequestStarted = true;
    const classificationPayload = await generateStructuredAI({
      provider: canonicalAI,
      system: `Você é um Analista Forense de SEO e Comportamento de Busca especialista no Google Brasil.
Sua única função é realizar uma engenharia reversa do perfil do usuário brasileiro baseando-se estritamente na palavra-chave.
Retorne OBRIGATORIAMENTE um objeto JSON com as chaves exatas intent e nicho.
intent deve ser Informativo, Comercial ou Vendas. nicho deve ser uma classificação curta em português.`,
      user: `Classifique a intenção e o nicho da palavra-chave: "${keyword}"`,
      schema: IntentNicheProviderSchema,
      maxTokens: 500,
      thinkingMode: canonicalAI.thinkingMode,
    });

    const classification = extractIntentNicheClassification(classificationPayload);
    if (!classification) throw new Error("O JSON retornado não contém uma intenção e um nicho utilizáveis.");
    const { intent, nicho: niche } = classification;

    // 1. Obtém o registro existente para mesclar o nicho_override no analise_semantica
    const { data: existingWord } = await profile.supabase
      .from("minerador_keywords")
      .select("brand_id,analise_semantica")
      .eq("id", keywordId)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .single();

    if (!existingWord?.brand_id) throw new Error("Keyword sem tenant canônico.");

    const currentSemantic = existingWord?.analise_semantica || {};
    const updatedSemantic = {
      ...currentSemantic,
      nicho_override: niche
    };

    // 2. Salva no banco de dados Supabase
    const { error: updateError } = await profile.supabase
      .from("minerador_keywords")
      .update({
        intent: intent,
        analise_semantica: updatedSemantic
      })
      .eq("id", keywordId)
      .eq("brand_id", existingWord.brand_id)
      .is("deleted_at", null);

    if (updateError) throw updateError;

    if (canonicalAI) {
      await recordIntegrationUsageForResource({
        resource: canonicalAI.resource,
        operation: "module_operation",
        module: "minerador",
        resultStatus: "succeeded",
        units: 1,
        idempotencyKey: `minerador:process-intent-niche:${operationRequestId}`,
        metadata: { operationRequestId, executionRequestId, keywordId, model: canonicalAI.model },
      }, {
        repository: createIntegrationRuntimeRepository(canonicalClient),
        authorizationRepository: createCanonicalAuthorizationRepository(canonicalClient),
      });
    }

    return NextResponse.json({
      success: true,
      operationRequestId,
      executionRequestId,
      intent,
      nicho: niche
    });
  } catch (err) {
    if (apiRequestStarted && canonicalAI && canonicalClient) {
      await recordIntegrationUsageForResource({
        resource: canonicalAI.resource,
        operation: "module_operation",
        module: "minerador",
        resultStatus: "failed",
        units: 1,
        idempotencyKey: `minerador:process-intent-niche:${operationRequestId}`,
        errorCode: err instanceof Error && "code" in err ? String((err as Error & { code?: unknown }).code) : "AI_PROVIDER_ERROR",
        metadata: { operationRequestId, executionRequestId, model: canonicalAI.model },
      }, {
        repository: createIntegrationRuntimeRepository(canonicalClient),
        authorizationRepository: createCanonicalAuthorizationRepository(canonicalClient),
      }).catch(() => undefined);
    }
    if (err instanceof IntegrationRuntimeError) {
      return NextResponse.json({ success: false, operationRequestId, executionRequestId, error: err.message, code: err.code, stage: "integration_runtime", diagnostic: { apiRequestStarted, source: "canonical", runtime: err.diagnostic } }, { status: err.status });
    }
    if (err instanceof DeepSeekCanonicalError) {
      return NextResponse.json({ success: false, operationRequestId, executionRequestId, error: err.message, code: err.code, stage: "connection_resolution", diagnostic: { apiRequestStarted, source: "canonical" } }, { status: err.status });
    }
    if (err instanceof SemanticReviewPreconditionError) {
      return NextResponse.json({
        success: false,
        operationRequestId,
        executionRequestId,
        error: err.message,
        code: err.code,
        stage: "precondition",
        diagnostic: {
          apiRequestStarted,
          source: "canonical",
          ...(err.diagnostic ? { precondition: err.diagnostic } : {}),
        },
      }, { status: err.status });
    }
    if (err instanceof DeepSeekR5ResponseError) {
      return NextResponse.json({ success: false, operationRequestId, executionRequestId, error: err.message, code: err.code, stage: "provider_request", diagnostic: { apiRequestStarted, source: "canonical", ...err.diagnostic } }, { status: err.status });
    }
    if (err instanceof StructuredAIError) {
      return NextResponse.json({ success: false, operationRequestId, executionRequestId, error: err.message, code: err.code, stage: "provider_request", diagnostic: { apiRequestStarted, source: "canonical" } }, { status: err.status });
    }
    if (err instanceof PhasedSemanticReviewError) {
      return NextResponse.json({
        success: false,
        operationRequestId,
        executionRequestId,
        error: err.message,
        code: err.code,
        stage: `phase_${err.phaseNumber}`,
        diagnostic: { apiRequestStarted, source: "canonical", providerCode: err.providerCode, ...err.diagnostic },
      }, { status: err.status });
    }
    if (err instanceof ProviderRequestError) {
      return NextResponse.json({ success: false, operationRequestId, executionRequestId, error: err.message, code: err.code, stage: "provider_request", diagnostic: { apiRequestStarted, source: "canonical" } }, { status: err.status });
    }
    const mapped = authzErrorResponse(err);
    if (mapped.status === 500) console.error("Erro no process-intent-niche:", err);
    return NextResponse.json(
      { success: false, operationRequestId, executionRequestId, error: mapped.message || "Erro de processamento." },
      { status: mapped.status }
    );
  }
}
