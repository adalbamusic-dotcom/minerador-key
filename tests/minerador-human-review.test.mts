import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyHumanReviewField,
  applyHumanReviewKgrApplicability,
  canCompleteHumanReview,
  completeHumanReview,
  humanReviewFieldDecision,
  humanReviewRecord,
  isHumanReviewCompleted,
} from "../lib/minerador/human-review.ts";
import { calculateKgrFromMetrics, kgrTechnicalTone, readKgrApplicability } from "../lib/minerador/kgr-applicability.ts";

const aiReview = {
  schemaVersion: "r5",
  status: "completed",
  reviewStatus: "completed",
  overallVerdict: "DIVERGE",
  fieldReviews: [{
    field: "intenção",
    logicalValue: "Informativa",
    verdict: "DIVERGE",
    rationale: "A expressão contém sinal de contratação.",
    evidenceUsed: ["logical", "googleAds", "dataForSeo", "kgr"],
  }],
  semanticEnrichment: {},
};

function semantic() {
  return {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    nicho: "Serviços condominiais",
    funnel: "TOFU",
    funnel_source: "qualificacao_logica",
    dna_revisao_humana: "pendente",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-18T12:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 336, measuredAt: "2026-08-18T12:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
  };
}

test("R6 calcula o KGR somente dos fatos medidos e conserva zero/allintitle", () => {
  assert.equal(calculateKgrFromMetrics(90, 336), 3.7333);
  assert.equal(calculateKgrFromMetrics(90, 0), 0);
  assert.equal(calculateKgrFromMetrics(null, 336), null);
  assert.equal(calculateKgrFromMetrics(0, 336), null);
  assert.equal(kgrTechnicalTone(3.7333, 90), "danger");
  assert.equal(kgrTechnicalTone(0, 90), "success");
});

test("a aplicabilidade KGR usa estados canônicos, não toca score nem métricas", () => {
  const original = semantic();
  const next = applyHumanReviewKgrApplicability({ semantic: original, applicability: "not_applicable", actorId: "human-1", decidedAt: "2026-08-18T12:03:00.000Z" });
  assert.equal(readKgrApplicability(next), "not_applicable");
  assert.equal(next.kgr_score, undefined);
  assert.equal((next.volume_measurement as { averageMonthlySearches: number }).averageMonthlySearches, 90);
  assert.equal((next.allintitle_measurement as { resultsAllintitle: number }).resultsAllintitle, 336);
  assert.equal((next.human_review as { kgrDecisionReviewed: boolean }).kgrDecisionReviewed, true);
});

test("R6 permite concluir sem decisão e preserva a lógica escolhida por default", () => {
  const original = semantic();
  const pending = canCompleteHumanReview(original);
  assert.equal(pending.ok, true);
  assert.deepEqual(pending.pendingFields, []);
  const selected = applyHumanReviewField({
    semantic: original,
    intent: "Informativa",
    field: "intenção",
    logicalValue: "Informativa",
    decision: "keep_logic",
    actorId: "human-1",
    decidedAt: "2026-08-18T12:04:00.000Z",
  });
  assert.equal(canCompleteHumanReview(selected.semantic).ok, true);
  assert.equal(canCompleteHumanReview(selected.semantic, { hasOpenEdit: true }).ok, true);
  const completed = completeHumanReview({ semantic: selected.semantic, actorId: "human-1", completedAt: "2026-08-18T12:05:00.000Z" });
  assert.equal(completed.dna_revisao_humana, "aprovado");
  assert.equal(isHumanReviewCompleted(completed), true);
  const record = completed.human_review as { status: string; completedBy: string; fieldDecisions: Array<{ field: string; decision: string; source: string }> };
  assert.equal(record.status, "completed");
  assert.equal(record.completedBy, "human-1");
  assert.deepEqual(record.fieldDecisions.map(entry => [entry.field, entry.decision, entry.source]), [["intenção", "keep_logic", "logical"]]);
});

test("campos estratégicos sem evidência exigem confirmação humana explícita, inclusive para manter desconhecido", () => {
  const original = {
    dna_origem: "logico_deterministico",
    dna_revisao_humana: "pendente",
    ai_review: {
      ...aiReview,
      overallVerdict: "EVIDÊNCIA INSUFICIENTE",
      fieldReviews: [],
      semanticEnrichment: {},
    },
  };
  const pending = canCompleteHumanReview(original);
  assert.equal(pending.ok, true);
  assert.deepEqual(pending.pendingFields, ["Intenção (confirmar desconhecido)", "Nicho (confirmar desconhecido)", "Funil (confirmar desconhecido)"]);

  const intent = applyHumanReviewField({ semantic: original, intent: null, field: "intent", logicalValue: null, decision: "confirm_unknown", actorId: "human-1", decidedAt: "2026-08-18T12:05:00.000Z" }).semantic;
  const niche = applyHumanReviewField({ semantic: intent, intent: null, field: "niche", logicalValue: null, decision: "confirm_unknown", actorId: "human-1", decidedAt: "2026-08-18T12:05:01.000Z" }).semantic;
  const resolved = applyHumanReviewField({ semantic: niche, intent: null, field: "funnel", logicalValue: null, decision: "confirm_unknown", actorId: "human-1", decidedAt: "2026-08-18T12:05:02.000Z" }).semantic;
  assert.equal(canCompleteHumanReview(resolved).ok, true);
  const completed = completeHumanReview({ semantic: resolved, actorId: "human-1", completedAt: "2026-08-18T12:05:03.000Z" });
  assert.equal(isHumanReviewCompleted(completed), true);
});

test("R6 conclusão global aplica defaults conservadores sem sobrescrever escolhas humanas", () => {
  // A decisão humana explícita sobre um campo sobrevive à conclusão global:
  // ela não é recalculada nem substituída pelo default conservador.
  const explicitField = applyHumanReviewField({
    semantic: semantic(),
    intent: "Informativa",
    field: "intenção",
    logicalValue: "Informativa",
    decision: "keep_logic",
    actorId: "human-1",
    decidedAt: "2026-08-18T12:08:00.000Z",
  }).semantic;
  assert.equal(canCompleteHumanReview(explicitField).ok, true);
  const completed = completeHumanReview({ semantic: explicitField, actorId: "human-1", completedAt: "2026-08-18T12:10:00.000Z" });
  const record = humanReviewRecord(completed);
  assert.deepEqual(record.fieldDecisions.map(entry => [entry.field, entry.decision]), [["intenção", "keep_logic"]]);
  assert.equal(record.status, "completed");
});

test("R6 conclui uma revisão sem respostas com keep_logic, ignore e confirm_unknown auditáveis", () => {
  const review = {
    ...aiReview,
    overallVerdict: "DIVERGE",
    fieldReviews: [{
      field: "intenção",
      logicalValue: "Informativa",
      verdict: "DIVERGE",
      rationale: "Sinal insuficiente para substituir a hipótese lógica sem decisão humana.",
      evidenceUsed: ["logical"],
    }],
    semanticEnrichment: { searchNeed: "Comparar alternativas." },
  };
  const original = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    funnel: "TOFU",
  };
  const completed = completeHumanReview({ semantic: original, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-18T12:11:00.000Z" });
  const record = humanReviewRecord(completed);
  assert.equal(record.status, "completed");
  assert.deepEqual(record.fieldDecisions.map(entry => [entry.field, entry.decision]), [["niche", "confirm_unknown"]]);
  assert.deepEqual(record.fieldDecisions.filter(entry => entry.decision === "confirm_unknown").map(entry => entry.field).sort(), ["niche"]);
  assert.equal(completed.dna_revisao_humana, "aprovado");
  assert.equal((completed as Record<string, unknown>).intencao_principal, "Informativa");
});

test("R6.1 mantém KGR como gate independente da semântica", () => {
  const review = {
    ...aiReview,
    overallVerdict: "CONCORDA",
    fieldReviews: [{
      field: "intenção",
      logicalValue: "Informativa",
      verdict: "CONCORDA",
      rationale: "Sem divergência.",
      evidenceUsed: ["logical"],
    }],
  };
  const pendingKgr = { ...semantic(), ai_review: review, kgr_aplicabilidade: "pending" };
  // The KGR decision remains a human gate, but it is reported instead of
  // disabling the command upfront.
  assert.equal(canCompleteHumanReview(pendingKgr).pendingKgrDecision, true);
  assert.match(canCompleteHumanReview(pendingKgr).reason || "", /KGR/);
  assert.throws(() => completeHumanReview({ semantic: pendingKgr, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-18T12:20:00.000Z" }), /KGR/);
  const notApplicable = { ...pendingKgr, kgr_aplicabilidade: "not_applicable" };
  assert.equal(canCompleteHumanReview(notApplicable).ok, true);
  assert.equal(canCompleteHumanReview(notApplicable).pendingKgrDecision, undefined);
});

test("a interface expõe fatos read-only, revisão humana e ausência de botão KGR", () => {
  const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.match(panel, /data-keyword-human-review/);
  assert.match(panel, /FATOS MEDIDOS · somente leitura/);
  assert.match(panel, /Aplicabilidade do KGR/);
  assert.match(panel, /Concluir revisão/);
  // O painel reporta pendência real, vinda da própria conclusão.
  assert.match(panel, /pendingHumanDecisions = completion\.pendingFields\.length/);
  assert.match(panel, /Decisões pendentes: \{pendingHumanDecisions\}/);
  assert.match(panel, /Nenhuma decisão humana pendente\./);
  assert.match(workspace, /onHumanReviewAction=\{\(action\) => handleHumanReviewAction/);
  assert.doesNotMatch(workspace, /handleBatchKgrDecision/);
  // Nada de IA: sem concordância, correção proposta ou enriquecimento.
  for (const dead of ["CONCORDÂNCIAS", "CORREÇÕES PROPOSTAS", "ENRIQUECIMENTOS", "Aceitar IA", "IA concorda com a lógica", "Sugestão IA"]) {
    assert.ok(!panel.includes(dead), `"${dead}" saiu com a IA`);
  }
});

test("R6 comunica o processo na faixa sem transformar estado em veto de decisão", () => {
  const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const steps = panel.slice(panel.indexOf("const profileSteps"), panel.indexOf("return <section data-keyword-profile"));
  for (const label of ["Lógica", "Volume", "Resultados", "KGR", "Revisão"]) assert.match(steps, new RegExp(label));
  assert.doesNotMatch(steps, /Google Ads|DataForSEO|Humano/);
  assert.match(steps, /value: processStates\.kgr\.complete \? kgrScore : null/);
  // A faixa comunica o processo; nenhuma decisão final depende dela. Aprovar
  // e rejeitar são decisões humanas sobre o estado atual da keyword.
  const statusHandler = workspace.slice(workspace.indexOf("const handleUpdateStatus"), workspace.indexOf("const handleBatchStatus"));
  assert.ok(!statusHandler.includes('["aprovado", "rejeitado"]'), "aprovar e rejeitar não passam por gate de revisão");
  assert.ok(!workspace.includes("Conclua a revisão do DNA antes da decisão final."));
});
