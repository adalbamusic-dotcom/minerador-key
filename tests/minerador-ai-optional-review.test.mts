import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCompleteHumanReview, completeHumanReview, humanReviewRecord, isHumanReviewCompleted } from "../lib/minerador/human-review.ts";
import { evaluateMineradorArquitetoHandoff } from "../lib/minerador/arquiteto-handoff-gates.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";

const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

function semanticWithoutAi(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    nicho: "Serviços condominiais",
    funnel: "TOFU",
    dna_revisao_humana: "pendente",
    ...overrides,
  };
}

const measured = {
  volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-24T10:01:00.000Z" },
  allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-24T10:02:00.000Z" },
};

test("A — sem ai_review a conclusão da revisão humana continua acionável", () => {
  const completion = canCompleteHumanReview(semanticWithoutAi(), { intent: "Informativa" });
  assert.equal(completion.ok, true);
  assert.equal(completion.pendingKgrDecision, undefined);
  assert.doesNotMatch(completion.reason || "", /IA|semântica com IA/);
});

test("B — sem IA e com KGR não calculável a revisão conclui e persiste", () => {
  const completed = completeHumanReview({
    semantic: semanticWithoutAi(),
    intent: "Informativa",
    actorId: "human-1",
    completedAt: "2026-08-24T14:00:00.000Z",
  });
  assert.equal(humanReviewRecord(completed).status, "completed");
  assert.equal(isHumanReviewCompleted(completed), true);
  assert.equal(resolveMineradorProcessState({
    id: "keyword-1",
    keyword: "gestao de condominio digital",
    intent: "Informativa",
    analise_semantica: completed,
  }).review.complete, true);
});

test("C — sem IA e com KGR calculável já decidido a revisão conclui", () => {
  const semantic = semanticWithoutAi({ ...measured, kgr_aplicabilidade: "applicable" });
  assert.equal(canCompleteHumanReview(semantic).ok, true);
  assert.equal(canCompleteHumanReview(semantic).pendingKgrDecision, undefined);
  const completed = completeHumanReview({ semantic, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-24T14:05:00.000Z" });
  assert.equal(humanReviewRecord(completed).status, "completed");
  assert.equal(humanReviewRecord(completed).kgrApplicability, "applicable");
});

test("C.1 — KGR calculável sem decisão reporta a pendência sem desabilitar nem inventar valor", () => {
  const semantic = semanticWithoutAi({ ...measured, kgr_aplicabilidade: "pending" });
  const completion = canCompleteHumanReview(semantic);
  assert.equal(completion.ok, true);
  assert.equal(completion.pendingKgrDecision, true);
  assert.match(completion.reason || "", /KGR/);
  assert.throws(() => completeHumanReview({ semantic, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-24T14:10:00.000Z" }), /KGR/);
  // The click points to the applicability field instead of blocking upfront.
  assert.match(workspace, /completion\.pendingKgrDecision/);
  assert.match(workspace, /Aplicabilidade do KGR no painel de Revisão Humana/);
});

test("D — com IA executada o fluxo R6 de divergências e enriquecimentos segue igual", () => {
  const semantic = semanticWithoutAi({
    ...measured,
    kgr_aplicabilidade: "applicable",
    ai_review: {
      schemaVersion: "r5",
      status: "completed",
      reviewStatus: "completed",
      overallVerdict: "DIVERGE",
      fieldReviews: [{ field: "intenção", logicalValue: "Informativa", aiSuggestion: "Comercial", verdict: "DIVERGE", rationale: "Sinal comercial.", evidenceUsed: ["logical"] }],
      semanticEnrichment: { searchNeed: "Comparar alternativas." },
    },
  });
  const completion = canCompleteHumanReview(semantic, { intent: "Informativa" });
  assert.equal(completion.ok, true);
  assert.ok(completion.pendingFields.length > 0);
  assert.ok((completion.pendingEnrichments || []).length > 0);
  const record = humanReviewRecord(completeHumanReview({ semantic, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-24T14:15:00.000Z" }));
  assert.equal(record.fieldDecisions.find(entry => entry.field === "intenção")?.decision, "keep_logic");
  assert.equal(record.enrichmentDecisions?.find(entry => entry.field === "searchNeed")?.decision, "ignore");
});

test("E — sem IA nenhuma divergência, enriquecimento ou ai_review sintético é criado", () => {
  const completion = canCompleteHumanReview(semanticWithoutAi(), { intent: "Informativa" });
  assert.deepEqual(completion.pendingFields, []);
  assert.deepEqual(completion.pendingEnrichments, []);
  const completed = completeHumanReview({ semantic: semanticWithoutAi(), intent: "Informativa", actorId: "human-1", completedAt: "2026-08-24T14:20:00.000Z" });
  assert.equal(completed.ai_review, undefined);
  const record = humanReviewRecord(completed);
  assert.deepEqual(record.fieldDecisions, []);
  assert.equal(record.enrichmentDecisions, undefined);
});

test("F — IA ausente não bloqueia o envio ao Arquiteto nem depende de freshness cruzada", () => {
  const keyword = {
    id: "keyword-1",
    keyword: "gestao de condominio digital",
    brand_id: "brand-1",
    status: "aprovado",
    volume_search: 90,
    results_allintitle: 12,
    analise_semantica: completeHumanReview({
      semantic: semanticWithoutAi({
        ...measured,
        kgr_aplicabilidade: "applicable",
        logical_output_contract: { schemaVersion: "r1", status: "completed", intent: "Informativa", niche: "Serviços condominiais", funnel: "TOFU" },
      }),
      intent: "Informativa",
      actorId: "human-1",
      completedAt: "2026-08-24T14:25:00.000Z",
    }),
  };
  const gate = evaluateMineradorArquitetoHandoff(keyword, "brand-1");
  assert.equal(gate.aiCompleted, false);
  assert.doesNotMatch(gate.reason || "", /IA/);
});

test("a interface apresenta a IA como aporte opcional e nunca como bloqueio", () => {
  // O selo vem do helper canônico, que separa opcional de falhou.
  assert.ok(panel.includes("contextualPresentationStatePill(presentationState)"));
  const uiState = readFileSync(new URL("../lib/minerador/contextual-presentation-ui-state.ts", import.meta.url), "utf8");
  assert.ok(uiState.includes('{ label: "IA · Opcional", tone: "neutral" }'));
  assert.ok(uiState.includes('{ label: "IA · Falhou", tone: "warning" }'));
  // O texto "opcional" agora vem do helper, não literal no painel.
  assert.ok(uiState.includes("aporte da IA opcional"));
  assert.ok(uiState.includes("A IA é opcional e não bloqueia nenhuma etapa"));
  assert.doesNotMatch(panel, /A IA precisa ser executada antes da conclusão/);
  assert.doesNotMatch(panel, /IA pendente/);
});
