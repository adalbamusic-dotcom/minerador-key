import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { describeKgrApplicabilityBatch, planKgrApplicabilityBatch } from "../lib/minerador/kgr-applicability-batch.ts";
import { readKgrApplicability } from "../lib/minerador/kgr-applicability.ts";
import { humanReviewRecord } from "../lib/minerador/human-review.ts";

const context = { actorId: "revisor@example.com", decidedAt: "2026-09-03T20:00:00.000Z" };

function keyword(id: string, semantic: Record<string, unknown> | null = null) {
  return { id, keyword: `kw ${id}`, analise_semantica: semantic };
}

test("decisão em lote aplica o contrato humano em cada keyword sem tocar nas métricas", () => {
  const rows = [
    keyword("a", { kgr_score: 0.12, volume_search: 50, results_allintitle: 6 }),
    keyword("b", { kgr_score: 0.9, volume_search: 10, results_allintitle: 9, kgr_aplicabilidade: "not_applicable", kgr_decisao_origem: "human" }),
  ];
  const plan = planKgrApplicabilityBatch(rows, "applicable", context);
  assert.deepEqual(plan.updates.map(update => update.id), ["a", "b"]);
  assert.deepEqual(plan.updates.map(update => update.previous), ["pending", "not_applicable"]);
  for (const update of plan.updates) {
    assert.equal(readKgrApplicability(update.semantic), "applicable");
    assert.equal(update.semantic.kgr_decisao, "SIM");
    assert.equal(update.semantic.kgr_decisao_origem, "human");
    assert.equal(update.semantic.kgr_decidido_por, context.actorId);
    assert.equal(update.semantic.kgr_decidido_em, context.decidedAt);
    assert.equal(humanReviewRecord(update.semantic)?.kgrApplicability, "applicable");
    assert.equal(humanReviewRecord(update.semantic)?.kgrDecisionReviewed, true);
  }
  assert.equal(plan.updates[0].semantic.kgr_score, 0.12);
  assert.equal(plan.updates[0].semantic.volume_search, 50);
  assert.equal(plan.updates[0].semantic.results_allintitle, 6);
  assert.equal(plan.updates[1].semantic.kgr_decisao_versao, 1);
  assert.deepEqual(JSON.parse(String(plan.updates[1].semantic.kgr_decisao_historico)).map((entry: { applicability: string }) => entry.applicability), ["not_applicable"]);
  // As linhas originais permanecem intactas: a persistência decide quando aplicar.
  assert.equal(readKgrApplicability(rows[0].analise_semantica), "pending");
  assert.equal(readKgrApplicability(rows[1].analise_semantica), "not_applicable");
});

test("keywords já na decisão alvo, duplicadas ou com revisão em edição não entram no lote", () => {
  const completed = { kgr_aplicabilidade: "applicable", kgr_decisao_origem: "human", kgr_decisao_versao: 1, human_review: { schemaVersion: "r6", status: "completed", decision: "completed", fieldDecisions: [], kgrApplicability: "applicable", completedAt: "2026-09-01T00:00:00.000Z", completedBy: "x" } };
  const rows = [keyword("same", completed), keyword("same", completed), keyword("draft"), keyword("changed")];
  const plan = planKgrApplicabilityBatch(rows, "applicable", { ...context, openDraftIds: ["draft"] });
  assert.deepEqual(plan.unchangedIds, ["same"]);
  assert.deepEqual(plan.draftIds, ["draft"]);
  assert.deepEqual(plan.updates.map(update => update.id), ["changed"]);
  // Repetir a decisão não reabre revisão concluída nem cria versão artificial.
  assert.equal(humanReviewRecord(completed)?.status, "completed");
  assert.equal(completed.kgr_decisao_versao, 1);
});

test("resumo da decisão em lote conta somente o que aconteceu", () => {
  const plan = planKgrApplicabilityBatch([keyword("a"), keyword("b", { kgr_aplicabilidade: "not_applicable" }), keyword("c")], "not_applicable", { ...context, openDraftIds: ["c"] });
  assert.equal(describeKgrApplicabilityBatch(plan), "Aplicabilidade do KGR definida como Não aplicável para 1 keyword(s). 1 já estava(m) como Não aplicável. 1 com revisão em edição foi(ram) ignorada(s); conclua ou cancele a edição antes.");
  assert.equal(describeKgrApplicabilityBatch(planKgrApplicabilityBatch([], "applicable", context), 0), "Nenhuma keyword precisou mudar para Aplicável.");
});

test("planilha expõe o seletor de aplicabilidade por linha e a decisão em lote na barra inferior", () => {
  const page = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const kgrCell = page.slice(page.indexOf("{/* KGR — score técnico + decisão humana de aplicabilidade */}"), page.indexOf("{/* CPC — mesma evidência Google Ads da etapa Volume */}"));
  assert.match(kgrCell, /aria-label="Aplicabilidade do KGR"/);
  assert.match(kgrCell, /handleHumanReviewAction\(item\.id, \{ type: "kgr", applicability: event\.target\.value as KgrApplicability \}\)/);
  assert.match(kgrCell, /<span className=\{kgrColor\}>\{kgrText\}<\/span>/);
  assert.match(kgrCell, /<option value="pending">Pendente<\/option>/);
  assert.match(kgrCell, /<option value="applicable">Aplicável<\/option>/);
  assert.match(kgrCell, /<option value="not_applicable">Não aplicável<\/option>/);
  assert.equal((page.match(/aria-label="Aplicabilidade do KGR das selecionadas"/g) || []).length, 2, "seletor em lote no rodapé desktop e no menu compacto");
  assert.match(page, /const handleBatchKgrApplicability = async \(applicability: KgrApplicability\)/);
  assert.match(page, /planKgrApplicabilityBatch\(/);
  assert.match(page, /readCanonicalKeywordRows\(persistedIds\)/);
  assert.doesNotMatch(page, /Aprovar como KGR/);
});
