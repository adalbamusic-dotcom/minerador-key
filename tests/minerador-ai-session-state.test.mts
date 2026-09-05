import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  contextualPresentationDecisionLabel,
  contextualPresentationProcessState,
  deriveContextualPresentationUiState,
} from "../lib/minerador/contextual-presentation-ui-state.ts";
import { mineradorProcessPresentation } from "../lib/minerador/process-state.ts";
import { buildKeywordDecisionSummary } from "../lib/minerador/keyword-decision-summary.ts";
import { canCompleteHumanReview, completeHumanReview, humanReviewRecord } from "../lib/minerador/human-review.ts";
import { evaluateMineradorArquitetoHandoff } from "../lib/minerador/arquiteto-handoff-gates.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";

/**
 * Estado visual da Apresentação Contextual. A fonte é sempre a working copy da
 * sessão; o ai_review R5 persistido não produz check verde.
 * REAL_AI_CALLS_IN_TESTS = 0.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

const batchHandler = workspace.slice(
  workspace.indexOf("const handleBatchContextualPresentation"),
  workspace.indexOf("const handleOpenHumanReview"),
);

function decisionAiValue(state: ReturnType<typeof deriveContextualPresentationUiState>) {
  const summary = buildKeywordDecisionSummary({
    aiExecuted: state !== "not_executed",
    aiVerdict: contextualPresentationDecisionLabel(state),
    dnaMaturity: "PARCIAL",
  } as Parameters<typeof buildKeywordDecisionSummary>[0]);
  return summary.states.find(item => item.key === "ai")?.value;
}

test("A · sem working copy o estado é opcional, nunca pendência obrigatória", () => {
  const state = deriveContextualPresentationUiState({ hasSessionPresentation: false });
  assert.equal(state, "not_executed");
  const process = contextualPresentationProcessState(state);
  assert.equal(process.complete, false);
  assert.equal(process.artifactState, "missing");
  assert.equal(mineradorProcessPresentation(process), "missing");
  assert.match(process.reason, /opcional e não bloqueia/);
  assert.equal(decisionAiValue(state), "Opcional");
});

test("B · artifact persistido dá check verde; sessão sem write é declarada", () => {
  const persisted = deriveContextualPresentationUiState({ hasPersistedPresentation: true, hasSessionPresentation: true });
  assert.equal(persisted, "success_persisted");
  const persistedProcess = contextualPresentationProcessState(persisted);
  assert.equal(persistedProcess.complete, true);
  assert.equal(mineradorProcessPresentation(persistedProcess), "current");
  assert.equal(persistedProcess.artifactState, "current_valid");
  assert.equal(decisionAiValue(persisted), "Persistida");

  // Geração sem write confirmado nunca alega persistência.
  const sessionOnly = deriveContextualPresentationUiState({ hasSessionPresentation: true });
  assert.equal(sessionOnly, "success_session_unpersisted");
  const sessionProcess = contextualPresentationProcessState(sessionOnly);
  assert.equal(sessionProcess.complete, true);
  assert.equal(sessionProcess.artifactState, "missing");
  assert.match(sessionProcess.reason, /não foi possível persistir/);
  assert.equal(decisionAiValue(sessionOnly), "Sessão");
});

test("C · execução em andamento tem estado próprio", () => {
  const state = deriveContextualPresentationUiState({ hasSessionPresentation: false, running: true });
  assert.equal(state, "running");
  assert.equal(mineradorProcessPresentation(contextualPresentationProcessState(state)), "running");
  assert.equal(decisionAiValue(state), "Executando");
});

test("D · falha de reexecução preserva a última versão persistida", () => {
  const state = deriveContextualPresentationUiState({ hasPersistedPresentation: true, hasSessionPresentation: false, lastAttemptFailed: true });
  assert.equal(state, "failed_with_previous_persisted");
  const process = contextualPresentationProcessState(state);
  assert.equal(process.complete, true, "a versão anterior continua disponível");
  assert.equal(process.artifactState, "current_valid");
  assert.equal(decisionAiValue(state), "Persistida");
});

test("E · falha sem resultado anterior é falha honesta e não bloqueia", () => {
  const state = deriveContextualPresentationUiState({ hasSessionPresentation: false, lastAttemptFailed: true });
  assert.equal(state, "failed_without_result");
  const process = contextualPresentationProcessState(state);
  assert.equal(process.complete, false);
  assert.equal(mineradorProcessPresentation(process), "failed");
  assert.match(process.reason, /opcional e não bloqueia/);
  assert.equal(decisionAiValue(state), "Falhou");
});

test("F · nova sessão sem working copy não recupera o check", () => {
  assert.equal(deriveContextualPresentationUiState({ hasSessionPresentation: false }), "not_executed");
  assert.match(workspace, /const \[presentationBriefs, setPresentationBriefs\] = useState<Record<string, KeywordPresentationBrief>>\(\{\}\)/);
  assert.ok(!workspace.includes('localStorage.setItem("presentationBriefs'));
});

test("G · um ai_review R5 antigo sem working copy não gera check verde", () => {
  // O helper só conhece a sessão: não existe entrada para artefato persistido.
  const state = deriveContextualPresentationUiState({ hasSessionPresentation: false });
  assert.equal(contextualPresentationProcessState(state).complete, false);
  const uiStateHelper = readFileSync(new URL("../lib/minerador/contextual-presentation-ui-state.ts", import.meta.url), "utf8");
  const helperCode = uiStateHelper.split("*/").slice(1).join("*/");
  for (const legacy of ["ai_review", "isCompletedSemanticReview", "processStates.ai"]) {
    assert.ok(!helperCode.includes(legacy), `o estado visual não pode consultar ${legacy}`);
  }
  // Os consumidores visuais usam o helper, não o processo canônico.
  assert.match(panel, /const contextualPresentationUiState = deriveContextualPresentationUiState\(\{/);
  assert.match(panel, /hasPersistedPresentation: Boolean\(presentationBrief\?\.persisted\)/);
  assert.match(panel, /hasSessionPresentation: Boolean\(presentationBrief\)/);
  assert.match(panel, /const aiSessionState = contextualPresentationProcessState\(contextualPresentationUiState\);/);
  assert.match(panel, /\{ label: "IA", complete: aiSessionState\.complete, state: aiSessionState, title: aiSessionState\.reason \}/);
  assert.match(panel, /aiExecuted: contextualPresentationUiState !== "not_executed"/);
  assert.match(panel, /aiVerdict: contextualPresentationDecisionLabel\(contextualPresentationUiState\)/);
});

test("H+I · o lote marca só as keywords bem-sucedidas e não mexe na tela", () => {
  for (const forbidden of ["setExpandedRowId", "scrollIntoView", "setSelectedIds", "focus()"]) {
    assert.ok(!batchHandler.includes(forbidden), `o lote não pode chamar ${forbidden}`);
  }
  assert.match(batchHandler, /setProcessAttempt\(\[item\.id\], "ai", "success", executionRequestId\)/);
  assert.match(batchHandler, /setProcessAttempt\(\[item\.id\], "ai", "failed", executionRequestId\)/);
  // Três ramos exclusivos: persistida, gerada sem persistir, ou falha.
  assert.equal((batchHandler.match(/showNotification\(/g) || []).length, 3, "um aviso por desfecho, nunca dois no mesmo caminho");
  assert.ok(batchHandler.includes("if (failures.length === 0 && unpersistedCount === 0) {"));
  assert.ok(batchHandler.includes("} else if (failures.length === 0) {"));
  assert.ok(!batchHandler.includes("Promise.all"), "o lote continua sequencial");
});

test("J · o check é visual: nenhum gate depende dele", () => {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    funnel: "TOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-28T10:01:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-28T10:02:00.000Z" },
    kgr_aplicabilidade: "applicable",
    logical_output_contract: buildLogicalOutputContract({ semantic: { intencao_principal: "Informativa", funnel: "TOFU" }, intent: "Informativa", funnel: "TOFU" }),
  };
  assert.equal(canCompleteHumanReview(semantic, { intent: "Informativa" }).ok, true);
  const completed = completeHumanReview({ semantic, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-28T15:05:00.000Z" });
  assert.equal(humanReviewRecord(completed).status, "completed");
  const gate = evaluateMineradorArquitetoHandoff({
    id: "88888888-8888-4888-8888-888888888888",
    keyword: "serum principia niacinamida",
    brand_id: "brand-a",
    status: "aprovado",
    volume_search: 90,
    results_allintitle: 12,
    analise_semantica: completed,
  }, "brand-a");
  assert.equal(gate.aiCompleted, false);
  assert.doesNotMatch(gate.reason || "", /IA/);
  assert.equal(gate.humanReviewCompleted, true);
  // E a revisão, concluída ou não, também não é gate: a aprovação na
  // planilha não consulta o estado de revisão de nenhuma keyword.
  const statusHandler = workspace.slice(workspace.indexOf("const handleUpdateStatus"), workspace.indexOf("const handleBatchStatus"));
  assert.ok(!statusHandler.includes("isHumanReviewCompleted"));
});
