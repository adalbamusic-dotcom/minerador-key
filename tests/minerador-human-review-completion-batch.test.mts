import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { describeHumanReviewCompletionBatch, planHumanReviewCompletionBatch } from "../lib/minerador/human-review-completion-batch.ts";
import { humanReviewRecord, isHumanReviewCompleted } from "../lib/minerador/human-review.ts";
import { readKgrApplicability } from "../lib/minerador/kgr-applicability.ts";

const context = { actorId: "revisor@example.com", completedAt: "2026-09-03T21:00:00.000Z" };

function semantic(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function keyword(id: string, analise_semantica: Record<string, unknown> | null, intent: string | null = "Informativa") {
  return { id, keyword: `kw ${id}`, intent, analise_semantica };
}

test("conclusão em lote usa o contrato individual e confirma o DNA sem tocar em status ou métricas", () => {
  const rows = [
    keyword("a", semantic()),
    keyword("b", semantic({ ...measured, kgr_aplicabilidade: "applicable", kgr_score: 0.13 })),
  ];
  const plan = planHumanReviewCompletionBatch(rows, context);
  assert.deepEqual(plan.updates.map(update => update.id), ["a", "b"]);
  for (const update of plan.updates) {
    assert.equal(isHumanReviewCompleted(update.semantic), true);
    assert.equal(humanReviewRecord(update.semantic).status, "completed");
    assert.equal(humanReviewRecord(update.semantic).completedBy, context.actorId);
    assert.equal(humanReviewRecord(update.semantic).completedAt, context.completedAt);
    assert.equal(update.semantic.dna_revisao_humana, "aprovado");
    assert.equal("status" in update.semantic, false);
  }
  assert.equal(update(plan, "b").kgr_score, 0.13);
  assert.equal(readKgrApplicability(update(plan, "b")), "applicable");
  assert.deepEqual(update(plan, "b").volume_measurement, measured.volume_measurement);
  // As linhas originais permanecem intactas até a persistência confirmar.
  assert.equal(isHumanReviewCompleted(rows[0].analise_semantica), false);
});

test("KGR pendente com cálculo possível, revisão concluída e revisão em edição ficam fora do lote", () => {
  const completed = semantic({ dna_revisao_humana: "aprovado", human_review: { schemaVersion: "r6", status: "completed", decision: "completed", fieldDecisions: [], completedAt: "2026-09-01T00:00:00.000Z", completedBy: "x" } });
  const rows = [
    keyword("kgr", semantic({ ...measured, kgr_aplicabilidade: "pending" })),
    keyword("done", completed),
    keyword("done", completed),
    keyword("draft", semantic()),
    keyword("ok", semantic()),
  ];
  const plan = planHumanReviewCompletionBatch(rows, { ...context, openDraftIds: ["draft"] });
  assert.deepEqual(plan.pendingKgrIds, ["kgr"]);
  assert.deepEqual(plan.alreadyCompletedIds, ["done"]);
  assert.deepEqual(plan.draftIds, ["draft"]);
  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(plan.updates.map(item => item.id), ["ok"]);
  // Revisão concluída não ganha versão artificial.
  assert.equal(humanReviewRecord(completed).completedAt, "2026-09-01T00:00:00.000Z");
});

test("resumo da conclusão em lote conta somente o que aconteceu", () => {
  const plan = planHumanReviewCompletionBatch([
    keyword("a", semantic()),
    keyword("kgr", semantic({ ...measured, kgr_aplicabilidade: "pending" })),
    keyword("draft", semantic()),
  ], { ...context, openDraftIds: ["draft"] });
  assert.equal(describeHumanReviewCompletionBatch(plan), "Revisão humana concluída para 1 keyword(s); o DNA foi confirmado. 1 aguarda(m) a Aplicabilidade do KGR antes de concluir. 1 com revisão em edição foi(ram) ignorada(s); conclua ou cancele a edição no painel.");
  assert.equal(describeHumanReviewCompletionBatch(planHumanReviewCompletionBatch([], context), 0), "Nenhuma revisão humana precisou ser concluída.");
});

test("barra inferior oferece Concluir revisão entre o KGR e o Status, sem gate de status", () => {
  const page = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const secondary = page.slice(page.indexOf("data-bulk-workflow-secondary"), page.indexOf('aria-label="Mais ações"'));
  const kgrIndex = secondary.indexOf('aria-label="Aplicabilidade do KGR das selecionadas"');
  const completeIndex = secondary.indexOf('ariaLabel="Concluir revisão das selecionadas"');
  const statusIndex = secondary.indexOf('aria-label="Status"');
  assert.ok(kgrIndex >= 0 && completeIndex > kgrIndex && statusIndex > completeIndex, "ordem esperada: KGR → Concluir revisão → Status");
  assert.match(secondary, /onClick=\{\(\) => void handleBatchCompleteHumanReview\(\)\}/);
  assert.match(page, /const handleBatchCompleteHumanReview = async \(\)/);
  assert.match(page, /planHumanReviewCompletionBatch\(/);
  assert.match(page, /humanReviewRecord\(row\.analise_semantica\)\.status !== "completed"/);
  // Mudar status continua sem exigir revisão concluída (adendo de 2026-08-29).
  const statusHandler = page.slice(page.indexOf("const handleUpdateStatus = async"), page.indexOf("const handleBatchStatus = async"));
  assert.doesNotMatch(statusHandler, /isHumanReviewCompleted|humanReviewRecord|review\.complete/);
});

function update(plan: ReturnType<typeof planHumanReviewCompletionBatch>, id: string): Record<string, unknown> {
  const found = plan.updates.find(item => item.id === id);
  assert.ok(found, `update ${id} ausente`);
  return found.semantic;
}
