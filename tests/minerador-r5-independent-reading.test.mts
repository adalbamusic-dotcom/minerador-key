import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSemanticReviewPhase1Input,
  buildSemanticReviewPhase2Input,
  buildSemanticReviewPhase3Input,
  normalizePhasedSemanticReviewOutput,
  type SemanticReviewPhase1Output,
  type SemanticReviewPhase2Output,
  type SemanticReviewPhase3Output,
} from "../lib/minerador/semantic-review-phases.ts";
import type { SemanticReviewContext } from "../lib/minerador/semantic-review.ts";

const emptyPhase2: SemanticReviewPhase2Output = {
  supportingEvidence: [],
  contradictingEvidence: [],
  quantitativeWarnings: [],
  opportunitySignals: [],
  insufficientEvidence: [],
};

const basePhase3: SemanticReviewPhase3Output = {
  reviewStatus: "completed",
  overallVerdict: "CONCORDA",
  divergences: [],
  enrichments: [],
  remainingAmbiguities: [],
  humanReviewNotes: [],
};

function contextFor(keyword: string, fields: Record<string, unknown>): SemanticReviewContext {
  return {
    keyword,
    logical: { processed: true, dnaOrigin: "logico_deterministico", fields },
    googleAds: {
      valid: true,
      validationState: "validated",
      source: "processor",
      volume: 90,
      history: [],
      trend: "Estável",
      measurement: { averageMonthlySearches: 90 },
      eligibility: "eligible",
      measuredAt: "2026-08-21T00:00:00.000Z",
      targeting: { countryCode: "BR" },
    },
    dataForSeo: {
      valid: true,
      validationState: "validated",
      source: "processor",
      allintitle: 336,
      keywordDifficulty: 42,
      measurement: { resultsAllintitle: 336 },
      query: "allintitle:" + keyword,
      measuredAt: "2026-08-21T00:01:00.000Z",
      targeting: { countryCode: "BR" },
    },
    kgr: {
      volumeUsed: 90,
      allintitleUsed: 336,
      score: 3.733,
      persistedScore: 3.733,
      calculable: true,
      calculationState: "calculable",
      inputSource: "processor",
      applicability: "applicable",
      applicabilityLabel: "Aplicável",
      decision: "Pendente",
      treated: true,
    },
    evidenceReferences: { logical: [], googleAds: [], dataForSeo: [], kgr: [] },
  };
}

function review(
  context: SemanticReviewContext,
  phase1: SemanticReviewPhase1Output,
  phase3: SemanticReviewPhase3Output = basePhase3,
) {
  return normalizePhasedSemanticReviewOutput({ context, phase1, phase2: emptyPhase2, phase3 });
}

test("R5 expõe a keyword original e separa hipótese lógica nas três entradas", () => {
  const context = contextFor("manicure perto de mim", { intent: "Ambíguo", funnel: "TOFU", niche: "Estética" });
  const phase1 = buildSemanticReviewPhase1Input(context);
  const phase2 = buildSemanticReviewPhase2Input(context);
  const phase3 = buildSemanticReviewPhase3Input({
    context,
    phase1: { agreementFields: [], divergences: [], semanticEnrichments: [], remainingAmbiguities: [] },
    phase2: emptyPhase2,
  });

  assert.equal(phase1.rawKeyword, "manicure perto de mim");
  assert.deepEqual(phase1.logicHypothesis, { intent: "Ambíguo", niche: "Estética", funnel: "TOFU" });
  assert.equal("keyword" in phase1, false);
  assert.equal(phase2.rawKeyword, "manicure perto de mim");
  assert.equal(phase3.rawKeyword, "manicure perto de mim");
  assert.deepEqual(phase3.logicalHypothesis, { intent: "Ambíguo", niche: "Estética", funnel: "TOFU" });
  assert.equal("independentSemanticReview" in phase3, true);
  assert.equal("externalEvidence" in phase3, true);
  assert.equal("phase1" in phase3, false);
  assert.equal("phase2" in phase3, false);
});

test("R5 remove no-op de estados desconhecidos sem criar correção", () => {
  const result = review(
    contextFor("servico de manicure", { intent: "Não informado" }),
    {
      agreementFields: [],
      divergences: [{ field: "intent", suggestion: "N/A", rationale: "Estados equivalentes.", evidenceUsed: ["n/a"] }],
      semanticEnrichments: [],
      remainingAmbiguities: [],
    },
  );

  assert.equal(result.output.fieldReviews.length, 0);
  assert.equal(result.valueTelemetry.rawDivergencesCount, 1);
  assert.equal(result.valueTelemetry.acceptedDivergencesCount, 0);
  assert.equal(result.valueTelemetry.droppedNoOpCount, 1);
});

test("R5 descarta BOFU especulativo baseado somente em termo específico", () => {
  const result = review(
    contextFor("unhas em acrilico", { intent: "Ambíguo", funnel: "TOFU" }),
    {
      agreementFields: [],
      divergences: [{
        field: "funnel",
        suggestion: "BOFU",
        rationale: "Termo específico pode indicar serviço ou profissional.",
        evidenceUsed: ["termo específico"],
      }],
      semanticEnrichments: [],
      remainingAmbiguities: [],
    },
  );

  assert.equal(result.output.fieldReviews.length, 0);
  assert.equal(result.valueTelemetry.acceptedDivergencesCount, 0);
  assert.equal(result.valueTelemetry.droppedLowEvidenceCount, 1);
});

test("R5 preserva BOFU quando a própria keyword traz sinal local explícito", () => {
  const result = review(
    contextFor("manicure perto de mim", { intent: "Ambíguo", funnel: "TOFU" }),
    {
      agreementFields: [],
      divergences: [{
        field: "funnel",
        suggestion: "BOFU",
        rationale: "O sinal local explícito aproxima a busca de uma contratação.",
        evidenceUsed: ["perto de mim"],
      }],
      semanticEnrichments: [],
      remainingAmbiguities: [],
    },
    { ...basePhase3, overallVerdict: "DIVERGE" },
  );

  assert.deepEqual(result.output.fieldReviews.map(field => [field.field, field.aiSuggestion, field.verdict]), [["funnel", "BOFU", "DIVERGE"]]);
  assert.equal(result.valueTelemetry.acceptedDivergencesCount, 1);
  assert.equal(result.valueTelemetry.droppedLowEvidenceCount, 0);
});

test("R5 ancora a correção no sinal bruto mesmo quando a hipótese lógica está errada", () => {
  const context = contextFor("manicure perto de mim", { intent: "Informativa", funnel: "TOFU" });
  const phase1 = buildSemanticReviewPhase1Input(context);
  const result = review(
    context,
    {
      agreementFields: [],
      divergences: [{
        field: "funnel",
        suggestion: "BOFU",
        rationale: "A expressão local explícita indica proximidade de encontrar ou contratar um serviço.",
        evidenceUsed: ["perto de mim"],
      }],
      semanticEnrichments: [],
      remainingAmbiguities: [],
    },
    { ...basePhase3, overallVerdict: "DIVERGE" },
  );

  assert.equal(phase1.rawKeyword, "manicure perto de mim");
  assert.equal((phase1.logicHypothesis as Record<string, unknown>).funnel, "TOFU");
  assert.deepEqual(result.output.fieldReviews.map(field => [field.field, field.logicalValue, field.aiSuggestion]), [
    ["funnel", "TOFU", "BOFU"],
  ]);
  assert.equal(result.valueTelemetry.acceptedDivergencesCount, 1);
});

test("R5 preserva MOFU quando a keyword contém comparação explícita", () => {
  const result = review(
    contextFor("gel ou acrilico qual é melhor", { intent: "Ambíguo", funnel: "TOFU" }),
    {
      agreementFields: [],
      divergences: [{
        field: "funnel",
        suggestion: "MOFU",
        rationale: "A pergunta explícita compara alternativas.",
        evidenceUsed: ["qual é melhor"],
      }],
      semanticEnrichments: [],
      remainingAmbiguities: [],
    },
    { ...basePhase3, overallVerdict: "DIVERGE" },
  );

  assert.equal(result.output.fieldReviews[0]?.aiSuggestion, "MOFU");
  assert.equal(result.valueTelemetry.acceptedDivergencesCount, 1);
});

test("R5 aceita ambíguo + TOFU sem forçar divergência", () => {
  const result = review(
    contextFor("unhas em acrilico", { intent: "Ambíguo", funnel: "TOFU" }),
    { agreementFields: ["intent", "funnel"], divergences: [], semanticEnrichments: [], remainingAmbiguities: [] },
  );

  assert.deepEqual(result.output.fieldReviews.map(field => field.verdict), ["CONCORDA", "CONCORDA"]);
  assert.equal(result.valueTelemetry.acceptedDivergencesCount, 0);
  assert.equal(result.valueTelemetry.rawDivergencesCount, 0);
});
