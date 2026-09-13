import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { architectFunctionalErrorMessage } from "../lib/arquiteto/functional-messages.ts";
import { classifyArchitectDeepSeekFailure } from "../lib/arquiteto/deepseek-diagnostics.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

const serpBoundary = await read("lib/arquiteto/dataforseo-serp-compatibility.ts");
const serpRoute = await read("app/api/arquiteto/serp/route.ts");
const aiRoute = await read("app/api/revalidate-structure/route.ts");
const aiArchitectureReview = await read("lib/arquiteto/ai-architecture-review.ts");
/** Contrato do request compartilhado por rota, cliente e testes. */
const aiRequestContract = await read("lib/arquiteto/ai-strategic-payload.ts");
const consolidation = await read("lib/arquiteto/article-consolidation.ts");
const workspace = await read("modules/arquiteto/arquiteto-workspace.tsx");
const functionalMessages = await read("lib/arquiteto/functional-messages.ts");

test("SERP do Arquiteto usa a Connection global DataForSEO sem capability específica de SERP", () => {
  assert.match(serpBoundary, /resolveDataForSeoCanonicalConfig/);
  assert.doesNotMatch(serpBoundary, /resolveDataForSeoCanonicalSerpCompatibilityConfig/);
  assert.doesNotMatch(serpBoundary, /dataforseo\.serp_compatibility|serp_compatibility/);
  assert.doesNotMatch(serpBoundary, /\bSerper\b|RapidAPI|OpenRouter/i);
  assert.doesNotMatch(serpBoundary, /DATAFORSEO_SERP_OPERATION_UNAVAILABLE/);
  assert.doesNotMatch(serpRoute, /\bSerper\b|RapidAPI|OpenRouter/i);
  assert.doesNotMatch(serpRoute, /DATAFORSEO_SERP_OPERATION_UNAVAILABLE/);
  assert.doesNotMatch(serpRoute, /serp_compatibility/);
  assert.match(serpBoundary, /operationRequestId/);
  assert.match(serpRoute, /serp_validation/);
  assert.match(serpRoute, /recordIntegrationUsage/);
});

test("Revisar com IA usa o resolver global DeepSeek e preserva falha sem fallback", () => {
  assert.match(aiRoute, /resolveDeepSeekCanonicalConfig/);
  assert.match(aiRoute, /generateStructuredAI/);
  assert.match(aiRoute, /maxTokens:\s*4_000/);
  assert.match(aiRoute, /thinkingMode:\s*"disabled"/);
  assert.match(aiRoute, /DeepSeekCanonicalError/);
  assert.match(aiRoute, /modelResolved/);
  // A SERP compacta é validada pelo contrato estratégico compartilhado, nunca
  // pelo assessment integral — reusá-lo aqui foi a origem do HTTP 400.
  assert.match(aiRoute, /parseStructureReviewRequest/);
  assert.match(aiRoute, /strategicSerpGate/);
  assert.doesNotMatch(aiRoute, /SerpFormationAssessmentSchema/);
  assert.match(aiRequestContract, /StrategicSerpAssessmentSchema/);
  assert.match(aiRequestContract, /SERP_REQUIRED/);
  assert.match(aiRoute, /failureStage/);
  assert.doesNotMatch(aiRoute, /OpenRouter|openrouter|requestProviderContent/);
  assert.match(aiRoute, /keywordDnaSnapshot/);
  assert.match(aiRequestContract, /serpAssessments/);
  assert.match(aiRequestContract, /publishedProtections/);
  assert.match(aiRoute, /buildAiArchitectureReviewPlan/);
  assert.match(aiRoute, /enrichAiArchitectureReview/);
  for (const stage of ["diagnosticar_grupos", "revisar_pertencimento", "revisar_papeis", "revisar_canibalizacao", "consolidar_proposta"])
    assert.match(aiArchitectureReview, new RegExp(stage));
  assert.match(aiRoute, /Nada e aplicado ou aprovado automaticamente/);
  assert.match(workspace, /setPendingKeywordReview\(\{ review: result\.review/);
  assert.match(workspace, /applyPendingKeywordReview/);
  assert.match(workspace, /Aplicar proposta para revisar/);
  // "Nada foi alterado" migrou para o fechamento do lote, junto da contagem e da severidade.
  assert.match(aiRequestContract, /Nada foi alterado/);
  assert.doesNotMatch(workspace, /const next = applyKeywordArticleReview\(currentMasterList, result\.review\)/);
});

test("a proposta da IA só chega inteira e admite rejeição antes da aplicação", () => {
  assert.match(workspace, /const envelope = await callStrategicApiEnvelope<KeywordArticleReview>\("\/api\/revalidate-structure", strategicPayload, "ai"\);/);
  assert.match(workspace, /reviews\.push\(review\);/);
  assert.match(workspace, /review: mergeKeywordArticleReviews\(reviews\)/);
  assert.match(workspace, /setRejectedKeywordReviewIds\(new Set\(\)\)/);
  assert.match(workspace, /toggleRejectedKeywordReview/);
  assert.match(workspace, /decisions: acceptedDecisions/);
  assert.match(workspace, /const persisted = await persistWorkingCopyAssignmentsRef/);
  assert.match(workspace, /pushMasterHistory\(current, "Aplicar proposta de repartição da IA para revisão humana"\)/);
});

test("a experiência do Arquiteto apresenta ações funcionais sem infraestrutura", () => {
  assert.match(workspace, /Validar SERP/);
  assert.match(workspace, /Revisar com IA/);
  assert.match(workspace, /const handleValidateSerp/);
  assert.match(workspace, /void confirmSerpValidation\(groups\)/);
  assert.doesNotMatch(workspace, /serpPreview|Nenhuma validação realizada ainda/);
  assert.doesNotMatch(workspace, /Ação explícita com DataForSEO|Aviso de crédito|retries pagos|title="[^"]*(?:DataForSEO|DeepSeek|Connection|conexão oficial)/i);
  assert.doesNotMatch(workspace, /Confirmar validação SERP/);
  assert.match(workspace, /callStrategicApi<[\s\S]*?\}, "serp"\)/);
  assert.match(workspace, /callStrategicApiEnvelope<[\s\S]*?, "ai"\)/);
  // A confirmação em lote da fase Artigos é `Concluir formação`; o atalho do
  // painel chama a MESMA função, nunca um segundo caminho de aprovação.
  assert.match(workspace, /confirmArticleFormation/);
  assert.match(workspace, /handleManualKeywordRoleChange/);
});

test("a confirmação do ArticleDNA é protegida, lê o canônico e não envia ao Radar", () => {
  assert.match(consolidation, /articleConsolidationIssues/);
  assert.match(consolidation, /articleDnaReadbackIssues/);
  assert.match(workspace, /readbackConfirmedArticleDnas/);
  // Aprovar ArticleDNA e enviar ao Radar são eventos distintos: a aprovação
  // não agenda handoff; o readback pertence ao envio explícito.
  assert.doesNotMatch(workspace, /setPendingRadarSmoke\(/);
  assert.match(workspace, /setPendingRadarSmokeReadback\(selectedArticleOperational/);
  assert.match(workspace, /serpAssessmentRefs/);
  /*
   * O readback do envio deixou de ser um "smoke" local.
   *
   * A frase antiga — "Smoke ArticleDNA → Radar" — acompanhava uma conferência
   * que comparava `radarItems` com ele mesmo. O que se afirma agora é mais
   * forte: o veredito vem de `verifyRadarHandoffReadback` sobre o que o
   * SERVIDOR devolveu, e é ele que a mensagem reporta.
   */
  assert.match(workspace, /RADAR_HANDOFF_CONFIRMED/);
  assert.match(workspace, /describeRadarReadback\(verdict\)/);
  const articleConfirmation = workspace.slice(workspace.indexOf("const readbackConfirmedArticleDnas"), workspace.indexOf("const sendSelectedToRadar"));
  assert.doesNotMatch(articleConfirmation, /InternalLinkGraph/);
});

test("falhas de SERP e IA são traduzidas para mensagens funcionais", () => {
  assert.equal(architectFunctionalErrorMessage("serp"), "Validação SERP indisponível no momento.");
  assert.equal(architectFunctionalErrorMessage("ai"), "Não foi possível concluir a revisão com IA.");
  assert.match(functionalMessages, /Validação SERP indisponível no momento\./);
  assert.match(functionalMessages, /Não foi possível concluir a revisão com IA\./);
  assert.doesNotMatch(functionalMessages, /DataForSEO|DeepSeek|Connection|quota|crédito/i);
  assert.match(serpRoute, /code/);
  assert.match(aiRoute, /DeepSeekCanonicalError/);
});

test("diagnóstico sanitizado da IA identifica a etapa real da resposta", () => {
  const base = {
    providerResolved: true,
    requestStarted: true,
    httpStatus: 200,
    finishReason: "stop",
    nativeFinishReason: null,
    contentPresent: false,
    reasoningPresent: false,
    jsonParsed: false,
    zodPassed: false,
    proposalValidated: false,
  } as const;
  assert.equal(classifyArchitectDeepSeekFailure(base), "content_empty");
  assert.equal(classifyArchitectDeepSeekFailure({ ...base, reasoningPresent: true }), "reasoning_only");
  assert.equal(classifyArchitectDeepSeekFailure({ ...base, contentPresent: true, finishReason: "length" }), "finish_reason_length");
  assert.equal(classifyArchitectDeepSeekFailure({ ...base, contentPresent: true }), "json_invalid_or_truncated");
  assert.equal(classifyArchitectDeepSeekFailure({ ...base, contentPresent: true, jsonParsed: true }), "zod_invalid");
  assert.equal(classifyArchitectDeepSeekFailure({ ...base, contentPresent: true, jsonParsed: true, zodPassed: true }), "proposal_invalid");
  assert.equal(classifyArchitectDeepSeekFailure({ ...base, contentPresent: true, reasoningPresent: true, jsonParsed: true, zodPassed: true, proposalValidated: true }), "unknown");
});
