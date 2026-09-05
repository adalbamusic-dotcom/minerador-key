import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { requireTenantPermission } from "@/lib/server/tenant-context";
import { isTenantId } from "@/lib/tenant-routing";
import { createCanonicalAuthorizationRepository, createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { createIntegrationRuntimeRepository, recordIntegrationUsageForResource } from "@/lib/server/integrations-runtime";
import { resolveDeepSeekCanonicalConfig, DeepSeekCanonicalError } from "@/lib/server/deepseek-canonical";
import { generatePlainTextAI, MAX_PROVIDER_ATTEMPTS_PER_OPERATION, StructuredAIError, type StructuredAIDiagnostic } from "@/lib/server/structured-ai";
import { listPersistedBrandSkills } from "@/lib/server/brand-skills";
import { getApprovedBrandDna } from "@/lib/server/brand-dna";
import { getBrandContextPack } from "@/lib/marca/brand-context-pack";
import { buildBrandAIContextForPresentation } from "@/lib/marca/brand-ai-context";
import { buildKeywordContextualPresentation } from "@/lib/minerador/keyword-contextual-presentation";
import { classifyArtifactPersistenceError } from "@/lib/minerador/keyword-contextual-presentation-row";
import { KeywordContextualPresentationPersistenceError, persistKeywordContextualPresentation, readCurrentKeywordContextualPresentations } from "@/lib/server/keyword-contextual-presentation-store";
import {
  buildContextualPresentationPrompt,
  buildKeywordDnaPresentationContext,
  CONTEXTUAL_PRESENTATION_SYSTEM_PROMPT,
  parseContextualPresentation,
} from "@/lib/minerador/presentation-brief";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RequestSchema = z.object({
  keywordId: z.string().uuid(),
  executionRequestId: z.string().uuid().optional(),
});

function failure(code: string, message: string, status: number, operationRequestId: string, diagnostic?: Record<string, unknown> | null, stage?: string) {
  return NextResponse.json({ success: false, code, error: message, operationRequestId, ...(stage ? { stage } : {}), ...(diagnostic ? { diagnostic } : {}) }, { status });
}

/** Diagnóstico sanitizado da execução: nunca inclui chave, prompt ou conteúdo. */
function sanitizedDiagnostic(diagnostic: StructuredAIDiagnostic | null): Record<string, unknown> | null {
  if (!diagnostic) return null;
  return {
    attempt: diagnostic.attempt ?? 1,
    model: diagnostic.model,
    thinkingMode: diagnostic.thinkingMode,
    httpStatus: diagnostic.httpStatus,
    finishReason: diagnostic.finishReason,
    nativeFinishReason: diagnostic.nativeFinishReason,
    contentPresent: diagnostic.contentPresent,
    contentLength: diagnostic.contentLength,
    reasoningPresent: diagnostic.reasoningPresent,
    reasoningLength: diagnostic.reasoningLength ?? null,
    completionTokens: diagnostic.completionTokens ?? null,
    reasoningTokens: diagnostic.reasoningTokens ?? null,
    promptTokens: diagnostic.promptTokens ?? null,
    providerDurationMs: diagnostic.providerDurationMs ?? null,
    jsonParsed: diagnostic.jsonParsed,
    zodPassed: diagnostic.zodPassed,
  };
}

/**
 * Gera uma apresentação contextual não canônica para a keyword atual.
 * A rota lê KeywordDNA, BrandDNA e Skills correntes da mesma Brand, mas nunca
 * grava no registro canônico nem decide intenção, funil, SERP, KGR ou aprovação.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const operationRequestId = crypto.randomUUID();
  let canonicalClient: ReturnType<typeof createCanonicalServiceClient> | null = null;
  let canonicalAI: Awaited<ReturnType<typeof resolveDeepSeekCanonicalConfig>> | null = null;
  let executionRequestId = operationRequestId;
  let providerRequestStarted = false;
  let providerDiagnostic: StructuredAIDiagnostic | null = null;
  // Uma ação humana = um operationRequestId, com até duas tentativas de provider.
  let providerAttempts = 0;
  /** Ledger canônico da plataforma; nunca cria quota nem contabiliza duas vezes. */
  const recordPresentationUsage = async (resultStatus: "succeeded" | "failed", errorCode: string | null) => {
    if (!providerRequestStarted || !canonicalAI || !canonicalClient) return;
    providerRequestStarted = false;
    // O ledger é contabilidade, não caminho crítico: uma falha aqui não pode
    // derrubar a resposta e virar "falha de geração" na UI.
    try {
      await recordIntegrationUsageForResource({
      resource: canonicalAI.resource,
      operation: "module_operation",
      module: "minerador",
      resultStatus,
      // O ledger reflete o consumo real: uma unidade por tentativa executada.
      units: Math.max(1, providerAttempts),
      idempotencyKey: `minerador:contextual-presentation:${operationRequestId}`,
      ...(errorCode ? { errorCode } : {}),
      metadata: { operationRequestId, executionRequestId, model: canonicalAI.model, ...(sanitizedDiagnostic(providerDiagnostic) || {}) },
      }, {
        repository: createIntegrationRuntimeRepository(canonicalClient),
        authorizationRepository: createCanonicalAuthorizationRepository(canonicalClient),
      });
    } catch (usageError) {
      console.error("[contextual-presentation] usage não registrado", {
        operationRequestId,
        executionRequestId,
        message: usageError instanceof Error ? usageError.message.slice(0, 200) : "erro desconhecido",
      });
    }
  };
  try {
    const { brandId } = await params;
    if (!isTenantId(brandId)) return failure("BRAND_NOT_FOUND", "Marca inválida.", 404, operationRequestId);
    let input: z.infer<typeof RequestSchema>;
    try {
      input = RequestSchema.parse(await request.json());
    } catch (requestError) {
      // Só o corpo da requisição responde por "pedido inválido".
      const issues = requestError instanceof ZodError
        ? requestError.issues.map(issue => `${issue.path.join(".") || "(raiz)"}: ${issue.code}`)
        : ["corpo ilegível"];
      console.error("[contextual-presentation] request inválido", { operationRequestId, stage: "request_validation", issues });
      return failure("AI_PRESENTATION_REQUEST_INVALID", "Pedido de apresentação inválido.", 400, operationRequestId, { issues }, "request_validation");
    }
    executionRequestId = input.executionRequestId || operationRequestId;
    const profile = await requireCanonicalSessionProfile();
    await requireTenantPermission({ brandId, actorUserId: profile.userId, module: "minerador", action: "edit", profile });

    const keywordResult = await profile.supabase
      .from("minerador_keywords")
      .select("id,brand_id,keyword,location,intent,volume_search,results_allintitle,kgr_score,analise_semantica")
      .eq("id", input.keywordId)
      .eq("brand_id", brandId)
      .is("deleted_at", null)
      .maybeSingle();
    const keyword = keywordResult.data as {
      id: string;
      brand_id: string;
      keyword: string;
      location: string | null;
      intent: string | null;
      volume_search: unknown;
      results_allintitle: unknown;
      kgr_score: unknown;
      analise_semantica: Record<string, unknown> | null;
    } | null;
    if (keywordResult.error || !keyword || keyword.brand_id !== brandId) {
      return failure("KEYWORD_NOT_FOUND", "A keyword não pertence à Marca ativa.", 404, operationRequestId, null, "keyword_read");
    }

    let skills;
    try {
      skills = (await listPersistedBrandSkills(brandId)).map(item => item.skill).filter(skill => skill.definitionKey === "brand_voice");
    } catch {
      return failure("BRAND_SKILLS_LOAD_FAILED", "Não foi possível ler as Skills desta Marca.", 502, operationRequestId, null, "brand_context");
    }

    let approvedBrandDna;
    try {
      approvedBrandDna = await getApprovedBrandDna(brandId);
    } catch {
      return failure("BRAND_DNA_LOAD_FAILED", "Não foi possível ler o BrandDNA aprovado desta Marca.", 502, operationRequestId, null, "brand_context");
    }

    const contextPack = getBrandContextPack({
      brandId,
      module: "minerador",
      purpose: "keyword-contextual-presentation",
      approvedBrandDna,
      skills,
    });
    const brandContext = buildBrandAIContextForPresentation(contextPack);
    const keywordDna = buildKeywordDnaPresentationContext({
      id: keyword.id,
      brand_id: keyword.brand_id,
      keyword: keyword.keyword,
      location: keyword.location,
      intent: keyword.intent,
      volume_search: keyword.volume_search,
      results_allintitle: keyword.results_allintitle,
      kgr_score: keyword.kgr_score,
      analise_semantica: keyword.analise_semantica,
    });

    canonicalClient = createCanonicalServiceClient();
    const provider = await resolveDeepSeekCanonicalConfig({
      actorUserId: profile.userId,
      brandId,
      client: canonicalClient,
    });
    canonicalAI = provider;
    providerRequestStarted = true;
    // O modelo devolve texto puro; o contrato { text } é montado pela aplicação.
    const generated = await generatePlainTextAI({
      provider,
      system: CONTEXTUAL_PRESENTATION_SYSTEM_PROMPT,
      user: buildContextualPresentationPrompt({ keywordDna, brandContext }),
      // Medição real (2026-08-29): com o thinking do provider, 82% do completion
      // ia para raciocínio (2.017 de 2.453 tokens), estourando o teto e forçando
      // retry. A apresentação é redação curta e não precisa de raciocínio longo.
      // O default global do DeepSeek continua intacto: isto vale só nesta operação.
      thinkingMode: "disabled",
      maxTokens: 2600,
      onDiagnostic: diagnostic => {
        providerDiagnostic = diagnostic;
        providerAttempts = Math.min(diagnostic.attempt || 1, MAX_PROVIDER_ATTEMPTS_PER_OPERATION);
      },
    });
    // A validação do texto gerado é outro domínio de falha: não é pedido inválido.
    let parsed: ReturnType<typeof parseContextualPresentation>;
    try {
      parsed = parseContextualPresentation({ text: generated });
    } catch (responseError) {
      const issues = responseError instanceof ZodError
        ? responseError.issues.map(issue => `${issue.path.join(".") || "text"}: ${issue.code}`)
        : ["formato inesperado"];
      console.error("[contextual-presentation] resposta do modelo rejeitada", {
        operationRequestId,
        executionRequestId,
        stage: "response_validation",
        contentLength: generated.length,
        issues,
      });
      await recordPresentationUsage("failed", "AI_PRESENTATION_RESPONSE_INVALID");
      return failure("AI_PRESENTATION_RESPONSE_INVALID", "A IA respondeu fora do contrato da apresentação contextual.", 502, operationRequestId, { issues, contentLength: generated.length }, "response_validation");
    }
    const contextualPresentation = {
      text: parsed.presentation.text,
      generatedAt: new Date().toISOString(),
      provider: provider.provider,
      model: provider.model,
      status: "generated" as const,
      inputKeywordDnaRef: keywordDna.inputKeywordDnaRef,
      appliedSkillRefs: brandContext.appliedSkillRefs,
    };
    const brandVoiceApplied = brandContext.appliedSkillRefs.some(ref => ref.definitionKey === "brand_voice");
    await recordPresentationUsage("succeeded", null);

    // Persistência canônica: a apresentação deixa de ser working copy de sessão.
    // O sucesso do provider nunca é relatado como "persistida" antes do write.
    let persistedPresentation: { versionId: string; version: number } | null = null;
    let persistenceFailure: { classification: string; code: string } | null = null;
    try {
      const previous = (await readCurrentKeywordContextualPresentations({ brandId, keywordIds: [input.keywordId] })).get(input.keywordId) || null;
      const artifact = await buildKeywordContextualPresentation({
        brandId,
        keywordId: input.keywordId,
        keyword: keyword.keyword,
        presentation: contextualPresentation,
        operationRequestId,
        executionRequestId,
        actorUserId: profile.userId,
        previous,
      });
      const stored = await persistKeywordContextualPresentation({
        brandId,
        keywordId: input.keywordId,
        presentation: artifact,
        changeReason: `Apresentação contextual gerada pela IA do Minerador (${operationRequestId}).`,
      });
      persistedPresentation = { versionId: stored.versionId, version: stored.presentation.lifecycle.version };
    } catch (error) {
      const diagnostic = error instanceof KeywordContextualPresentationPersistenceError
        ? error.diagnostic
        : classifyArtifactPersistenceError(error);
      console.error("[contextual-presentation] persistência rejeitada", {
        operationRequestId,
        executionRequestId,
        brandId,
        keywordId: input.keywordId,
        classification: diagnostic.classification,
        code: diagnostic.code,
        message: diagnostic.message,
        details: diagnostic.details,
        constraint: diagnostic.constraint,
        column: diagnostic.column,
      });
      persistenceFailure = { classification: diagnostic.classification, code: diagnostic.code };
    }

    return NextResponse.json({
      success: true,
      operationRequestId,
      executionRequestId,
      brandId,
      keywordId: input.keywordId,
      contextualPresentation,
      brandVoiceApplied,
      appliedSkillRefs: brandContext.appliedSkillRefs,
      // Lacunas honestas do contexto aprovado: BrandDNA ou Voz da Marca ausentes
      // são informados, nunca preenchidos com fallback.
      contextMissing: contextPack.missing,
      discardedAuthorityFields: parsed.discardedAuthorityFields,
      // A apresentação é persistida como artifact próprio; o KeywordDNA continua
      // intocado e a IA segue sem autoridade semântica.
      persisted: Boolean(persistedPresentation),
      presentationVersionId: persistedPresentation?.versionId || null,
      presentationVersion: persistedPresentation?.version || null,
      persistenceFailure,
    });
  } catch (error) {
    await recordPresentationUsage("failed", error instanceof StructuredAIError ? error.code : "AI_CONTEXTUAL_PRESENTATION_FAILED");
    const diagnostic = sanitizedDiagnostic(providerDiagnostic);
    if (diagnostic) console.error("[contextual-presentation] execução rejeitada", { operationRequestId, executionRequestId, ...diagnostic });
    // Nenhum ZodError chega aqui: request e resposta têm tratamento próprio.
    if (error instanceof StructuredAIError) return failure(error.code || "AI_CONTEXTUAL_PRESENTATION_FAILED", error.message, error.status, operationRequestId, diagnostic, "provider_generation");
    if (error instanceof DeepSeekCanonicalError) return failure(error.code, error.message, error.status, operationRequestId, null, "provider_configuration");
    const mapped = authzErrorResponse(error);
    // Nenhum caminho de persistência chega aqui: o write tem catch próprio.
    return failure("AI_CONTEXTUAL_PRESENTATION_FAILED", mapped.message, mapped.status, operationRequestId, diagnostic, "authorization_or_context");
  }
}
