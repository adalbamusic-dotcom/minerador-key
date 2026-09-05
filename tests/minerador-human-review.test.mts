import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyHumanReviewEnrichment,
  applyHumanReviewField,
  applyHumanReviewKgrApplicability,
  canCompleteHumanReview,
  classifyHumanReviewField,
  completeHumanReview,
  humanReviewEnrichmentRows,
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
    aiSuggestion: "Comercial",
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
    ai_review: aiReview,
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

test("aceitar IA cria override humano sem apagar a proposta lógica ou a ai_review", () => {
  const original = semantic();
  const result = applyHumanReviewField({
    semantic: original,
    intent: "Informativa",
    field: "intenção",
    logicalValue: "Informativa",
    aiSuggestion: "Comercial",
    decision: "accept_ai",
    actorId: "human-1",
    decidedAt: "2026-08-18T12:02:00.000Z",
  });

  assert.equal(result.intent, "Comercial");
  assert.equal(result.semantic.intencao_principal, "Informativa");
  assert.equal(result.semantic.intencao_humana, "Comercial");
  assert.equal((result.semantic.ai_review as typeof aiReview).fieldReviews[0].aiSuggestion, "Comercial");
  assert.equal((result.semantic.human_review as { fieldDecisions: Array<{ decision: string; source: string }> }).fieldDecisions[0].decision, "accept_ai");
  assert.equal((result.semantic.human_review as { fieldDecisions: Array<{ decision: string; source: string }> }).fieldDecisions[0].source, "ai");
  assert.equal(result.semantic.volume_measurement && (result.semantic.volume_measurement as { averageMonthlySearches: number }).averageMonthlySearches, 90);
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

test("R6 permite concluir divergência sem resposta e preserva a lógica escolhida por default", () => {
  const original = semantic();
  const pending = canCompleteHumanReview(original);
  assert.equal(pending.ok, true);
  assert.deepEqual(pending.pendingFields, ["intenção"]);
  const selected = applyHumanReviewField({
    semantic: original,
    intent: "Informativa",
    field: "intenção",
    logicalValue: "Informativa",
    aiSuggestion: "Comercial",
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

test("R6.1 resolve concordâncias automaticamente e não cria aceitação humana da IA", () => {
  const review = {
    ...aiReview,
    overallVerdict: "CONCORDA",
    fieldReviews: [{
      field: "entidade central",
      logicalValue: "campanha de tráfego pago",
      aiSuggestion: "campanha de trafego pago",
      verdict: "CONCORDA",
      rationale: "A leitura lógica está consistente.",
      evidenceUsed: ["logical", "googleAds"],
    }],
  };
  const original = { ...semantic(), ai_review: review };
  assert.equal(classifyHumanReviewField(review.fieldReviews[0]), "agreement");
  assert.equal(humanReviewFieldDecision(original, "entidade central"), null);
  assert.equal(canCompleteHumanReview(original).ok, true);
  assert.equal(humanReviewRecord(original).fieldDecisions.length, 0);

  const partial = { ...review.fieldReviews[0], verdict: "CONCORDA PARCIALMENTE", aiSuggestion: "outra leitura" };
  assert.equal(classifyHumanReviewField(partial), "divergence");
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

  const intent = applyHumanReviewField({ semantic: original, intent: null, field: "intent", logicalValue: null, aiSuggestion: null, decision: "confirm_unknown", actorId: "human-1", decidedAt: "2026-08-18T12:05:00.000Z" }).semantic;
  const niche = applyHumanReviewField({ semantic: intent, intent: null, field: "niche", logicalValue: null, aiSuggestion: null, decision: "confirm_unknown", actorId: "human-1", decidedAt: "2026-08-18T12:05:01.000Z" }).semantic;
  const resolved = applyHumanReviewField({ semantic: niche, intent: null, field: "funnel", logicalValue: null, aiSuggestion: null, decision: "confirm_unknown", actorId: "human-1", decidedAt: "2026-08-18T12:05:02.000Z" }).semantic;
  assert.equal(canCompleteHumanReview(resolved).ok, true);
  const completed = completeHumanReview({ semantic: resolved, actorId: "human-1", completedAt: "2026-08-18T12:05:03.000Z" });
  assert.equal(isHumanReviewCompleted(completed), true);
});

test("R6.1 exige checklist para cada enriquecimento e preserva origem IA + decisão humana", () => {
  const review = {
    ...aiReview,
    overallVerdict: "CONCORDA",
    fieldReviews: [{
      field: "intenção",
      logicalValue: "Informativa",
      aiSuggestion: "Informativa",
      verdict: "CONCORDA",
      rationale: "Sem divergência.",
      evidenceUsed: ["logical"],
    }],
    semanticEnrichment: {
      searchNeed: "Comparar alternativas antes de contratar.",
      probableObjective: "Escolher uma solução adequada.",
    },
  };
  const original = { ...semantic(), ai_review: review };
  assert.equal(humanReviewEnrichmentRows(original, review).length, 2);
  const pending = canCompleteHumanReview(original);
  assert.equal(pending.ok, true);
  assert.deepEqual(pending.pendingEnrichments, ["Necessidade implícita", "Objetivo provável"]);

  const included = applyHumanReviewEnrichment({
    semantic: original,
    field: "searchNeed",
    value: review.semanticEnrichment.searchNeed,
    decision: "include",
    actorId: "human-1",
    decidedAt: "2026-08-18T12:06:00.000Z",
  }).semantic;
  const resolved = applyHumanReviewEnrichment({
    semantic: included,
    field: "probableObjective",
    value: review.semanticEnrichment.probableObjective,
    decision: "ignore",
    actorId: "human-1",
    decidedAt: "2026-08-18T12:07:00.000Z",
  }).semantic;
  const record = humanReviewRecord(resolved);
  assert.equal(canCompleteHumanReview(resolved).ok, true);
  assert.deepEqual(record.enrichmentDecisions?.map(entry => [entry.field, entry.decision, entry.source]), [
    ["searchNeed", "include", "ai"],
    ["probableObjective", "ignore", "ai"],
  ]);
});

test("R6 conclusão global aplica defaults conservadores sem sobrescrever escolhas humanas", () => {
  const review = {
    ...aiReview,
    overallVerdict: "DIVERGE",
    fieldReviews: [{
      field: "intenção",
      logicalValue: "Informativa",
      aiSuggestion: "Comercial",
      verdict: "DIVERGE",
      rationale: "Sinal de contratação.",
      evidenceUsed: ["logical"],
    }],
    semanticEnrichment: {
      searchNeed: "Comparar alternativas.",
      probableObjective: "Escolher uma solução.",
    },
  };
  const original = { ...semantic(), ai_review: review };
  const explicitField = applyHumanReviewField({
    semantic: original,
    intent: "Informativa",
    field: "intenção",
    logicalValue: "Informativa",
    aiSuggestion: "Comercial",
    decision: "keep_logic",
    actorId: "human-1",
    decidedAt: "2026-08-18T12:08:00.000Z",
  }).semantic;
  const explicitEnrichment = applyHumanReviewEnrichment({
    semantic: explicitField,
    field: "searchNeed",
    value: review.semanticEnrichment.searchNeed,
    decision: "ignore",
    actorId: "human-1",
    decidedAt: "2026-08-18T12:09:00.000Z",
  }).semantic;
  assert.equal(canCompleteHumanReview(explicitEnrichment).ok, true);
  assert.deepEqual(canCompleteHumanReview(explicitEnrichment).pendingEnrichments, ["Objetivo provável"]);
  const completed = completeHumanReview({ semantic: explicitEnrichment, actorId: "human-1", completedAt: "2026-08-18T12:10:00.000Z" });
  const record = humanReviewRecord(completed);
  assert.deepEqual(record.fieldDecisions.map(entry => [entry.field, entry.decision]), [["intenção", "keep_logic"]]);
  assert.deepEqual(record.enrichmentDecisions?.map(entry => [entry.field, entry.decision]), [["searchNeed", "ignore"], ["probableObjective", "ignore"]]);
  assert.equal(record.status, "completed");
});

test("R6 conclui uma revisão sem respostas com keep_logic, ignore e confirm_unknown auditáveis", () => {
  const review = {
    ...aiReview,
    overallVerdict: "DIVERGE",
    fieldReviews: [{
      field: "intenção",
      logicalValue: "Informativa",
      aiSuggestion: "Comercial",
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
    ai_review: review,
  };
  const completed = completeHumanReview({ semantic: original, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-18T12:11:00.000Z" });
  const record = humanReviewRecord(completed);
  assert.equal(record.status, "completed");
  assert.deepEqual(record.fieldDecisions.map(entry => [entry.field, entry.decision]), [["intenção", "keep_logic"], ["niche", "confirm_unknown"]]);
  assert.deepEqual(record.enrichmentDecisions?.map(entry => [entry.field, entry.decision]), [["searchNeed", "ignore"]]);
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
      aiSuggestion: "Informativa",
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
  const spec = readFileSync(new URL("../docs/03-minerador/spec.md", import.meta.url), "utf8");
  assert.match(panel, /data-keyword-human-review/);
  assert.match(panel, /FATOS MEDIDOS · somente leitura/);
  assert.match(panel, /Concordâncias:/);
  assert.match(panel, /data-human-review-agreements/);
  assert.match(panel, /CONCORDÂNCIAS ·/);
  assert.match(panel, /✓ \{agreementRows\.length\} campos confirmados pela IA/);
  assert.match(panel, /CORREÇÕES PROPOSTAS ·/);
  assert.match(panel, /DECISÕES PENDENTES ·/);
  assert.match(panel, /data-human-review-pending-decisions/);
  assert.match(panel, /data-human-review-row="unresolved"/);
  assert.match(panel, /const allFieldRows = fieldRows;/);
  assert.doesNotMatch(panel, /const allFieldRows = \[\.\.\.fieldRows, \.\.\.strategicUnknownRows\]/);
  assert.match(panel, /semanticEvidenceDisplayValue/);
  assert.match(panel, /Indefinido/);
  assert.match(panel, /Divergências pendentes:/);
  assert.match(panel, /data-human-review-row="agreement"/);
  assert.match(panel, /data-human-review-row="divergence"/);
  assert.match(panel, /data-human-review-row="enrichment"/);
  assert.match(panel, /IA concorda com a lógica/);
  assert.match(panel, /Aplicabilidade do KGR/);
  assert.match(panel, /Manter lógica/);
  assert.match(panel, /Aceitar IA/);
  assert.match(panel, /Editar/);
  assert.match(panel, /Concluir revisão/);
  assert.match(spec, /Regra permanente do R6 — divergência real separada de decisão pendente/);
  assert.match(spec, /DECISÕES PENDENTES/);
  assert.match(workspace, /applyHumanReviewEnrichment/);
  assert.match(workspace, /action\.type === "enrichment"/);
  assert.match(workspace, /onHumanReviewAction=\{\(action\) => handleHumanReviewAction/);
  assert.doesNotMatch(workspace, /handleBatchKgrDecision/);
});

test("R6 comunica o processo na faixa sem transformar estado em veto de decisão", () => {
  const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const steps = panel.slice(panel.indexOf("const profileSteps"), panel.indexOf("return <section data-keyword-profile"));
  for (const label of ["Lógica", "Volume", "Resultados", "KGR", "IA", "Revisão"]) assert.match(steps, new RegExp(label));
  assert.doesNotMatch(steps, /Google Ads|DataForSEO|Humano/);
  assert.match(steps, /value: processStates\.kgr\.complete \? kgrScore : null/);
  // A faixa comunica o processo; nenhuma decisão final depende dela. Aprovar
  // e rejeitar são decisões humanas sobre o estado atual da keyword.
  const statusHandler = workspace.slice(workspace.indexOf("const handleUpdateStatus"), workspace.indexOf("const handleBatchStatus"));
  assert.ok(!statusHandler.includes('["aprovado", "rejeitado"]'), "aprovar e rejeitar não passam por gate de revisão");
  assert.ok(!workspace.includes("Conclua a revisão do DNA antes da decisão final."));
});
