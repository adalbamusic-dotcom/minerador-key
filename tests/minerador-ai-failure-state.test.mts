import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  contextualPresentationDecisionLabel,
  contextualPresentationStatePill,
  contextualPresentationStateSummary,
  deriveContextualPresentationUiState,
} from "../lib/minerador/contextual-presentation-ui-state.ts";
import { ContextualPresentationModelSchema, parseContextualPresentation } from "../lib/minerador/presentation-brief.ts";

/**
 * Falha da IA: estágios e estado visual.
 *
 * Execução real c6505322 (ledger): provider chamado, HTTP 200,
 * thinkingMode=disabled, finishReason=stop, contentLength=2457, reasoning=0,
 * providerDurationMs=15495 — o texto foi gerado e o parser o rejeitou por
 * exceder o teto. A rota reportava isso como "pedido inválido".
 * REAL_DEEPSEEK_CALLS_IN_TESTS = 0.
 */

const route = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

test("o texto real de 2.457 e 2.862 caracteres passa a ser aceito", () => {
  assert.doesNotThrow(() => ContextualPresentationModelSchema.parse({ text: "a".repeat(2457) }));
  assert.doesNotThrow(() => ContextualPresentationModelSchema.parse({ text: "a".repeat(2862) }));
  // Continua sendo apresentação compacta: texto sem fim é rejeitado.
  assert.throws(() => ContextualPresentationModelSchema.parse({ text: "a".repeat(4000) }));
  assert.equal(parseContextualPresentation({ text: "Apresentação válida." }).presentation.text, "Apresentação válida.");
});

test("resposta fora do contrato não é mais reportada como pedido inválido", () => {
  // Request e resposta têm try/catch próprios e stages distintos.
  assert.ok(route.includes('stage: "request_validation"'));
  assert.ok(route.includes('stage: "response_validation"'));
  assert.ok(route.includes('failure("AI_PRESENTATION_RESPONSE_INVALID"'));
  assert.ok(route.includes("[contextual-presentation] resposta do modelo rejeitada"));
  assert.ok(route.includes("[contextual-presentation] request inválido"));
  // O catch externo deixou de transformar qualquer ZodError em pedido inválido.
  const outerCatch = route.slice(route.lastIndexOf("} catch (error) {"));
  assert.ok(!outerCatch.includes("AI_PRESENTATION_REQUEST_INVALID"));
  // O diagnóstico interno diz qual campo falhou, sem expor conteúdo.
  assert.ok(route.includes("issues"));
  // O log não carrega o texto gerado, só tamanho e issues.
  assert.ok(route.includes("contentLength: generated.length"));
  const responseCatch = route.slice(route.indexOf("resposta do modelo rejeitada"), route.indexOf("resposta do modelo rejeitada") + 400);
  assert.ok(!responseCatch.includes("text: generated"), "o diagnóstico não expõe o conteúdo");
});

test("o payload do botão IA continua compatível com o schema da rota", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.ok(workspace.includes("JSON.stringify({ keywordId, executionRequestId })"));
  assert.ok(route.includes("keywordId: z.string().uuid()"));
  assert.ok(route.includes("executionRequestId: z.string().uuid().optional()"));
  // A rota resolve o resto server-side: o corpo enviado só tem identificadores.
  const body = workspace.slice(workspace.indexOf("body: JSON.stringify({ keywordId, executionRequestId })"), workspace.indexOf("body: JSON.stringify({ keywordId, executionRequestId })") + 120);
  for (const forbidden of ["brandContext", "appliedSkillRefs", "brandDna", "analise_semantica"]) {
    assert.ok(!body.includes(forbidden), );
  }
});

test("falhou nunca é apresentado como não executada", () => {
  const failed = deriveContextualPresentationUiState({ hasSessionPresentation: false, lastAttemptFailed: true });
  assert.equal(failed, "failed_without_result");
  assert.equal(contextualPresentationStatePill(failed).label, "IA · Falhou");
  assert.equal(contextualPresentationDecisionLabel(failed), "Falhou");
  assert.match(contextualPresentationStateSummary(failed), /última tentativa falhou/);
  assert.doesNotMatch(contextualPresentationStateSummary(failed), /não executada/i);

  const never = deriveContextualPresentationUiState({ hasSessionPresentation: false });
  assert.equal(contextualPresentationStatePill(never).label, "IA · Opcional");
  assert.match(contextualPresentationStateSummary(never), /aporte da IA opcional/);

  const persisted = deriveContextualPresentationUiState({ hasPersistedPresentation: true, hasSessionPresentation: true });
  assert.match(contextualPresentationStateSummary(persisted, true, 2), /persistida · v2/);

  const failedOverPersisted = deriveContextualPresentationUiState({ hasPersistedPresentation: true, hasSessionPresentation: false, lastAttemptFailed: true });
  assert.match(contextualPresentationStateSummary(failedOverPersisted, true, 2), /nova tentativa falhou · versão persistida v2 preservada/);
});

test("o Perfil consome o estado canônico em vez de deduzir da working copy", () => {
  const humanReview = panel.slice(panel.indexOf("function HumanReviewPanel"));
  assert.ok(humanReview.includes("contextualPresentationStateSummary(presentationState"));
  assert.ok(humanReview.includes("contextualPresentationStatePill(presentationState)"));
  assert.ok(humanReview.includes('presentationState === "failed_without_result"'));
  assert.ok(humanReview.includes("A última tentativa falhou."));
  assert.ok(panel.includes("presentationState={contextualPresentationUiState}"));
  // O estado vem do mesmo helper que alimenta o chip do Processador.
  assert.ok(panel.includes('lastAttemptFailed: processAttempts?.ai?.state === "failed"'));
});
