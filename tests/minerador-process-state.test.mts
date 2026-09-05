import assert from "node:assert/strict";
import test from "node:test";
import { buildLogicalOutputContract, buildLogicalProcessorMetadata } from "../lib/minerador/logical-processor.ts";
import { mineradorProcessPresentation, resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { buildSemanticReviewContext, semanticReviewInputHash } from "../lib/minerador/semantic-review.ts";

const logicalInput = {
  keywordId: "keyword-1",
  keyword: "campanha de trafego pago",
  location: null,
  niche: "Marketing",
};

function row(attempts?: Parameters<typeof resolveMineradorProcessState>[0]["attempts"]) {
  return {
    id: logicalInput.keywordId,
    keyword: logicalInput.keyword,
    location: null,
    intent: "Comercial investigativa",
    volume_search: 90,
    results_allintitle: 0,
    attempts,
    analise_semantica: {
      dna_origem: "logico_deterministico",
      nicho: "Marketing",
      intencao_principal: "Comercial investigativa",
      logical_output_contract: buildLogicalOutputContract({
        semantic: { intencao_principal: "Comercial investigativa", nicho: "Marketing", funnel: "MOFU" },
        intent: "Comercial investigativa",
        niche: "Marketing",
        funnel: "MOFU",
      }),
      funnel: "MOFU",
      ...buildLogicalProcessorMetadata(logicalInput, "2026-08-20T00:00:00.000Z"),
      volume_measurement: {
        provider: "google_ads",
        averageMonthlySearches: 90,
        measuredAt: "2026-08-20T00:01:00.000Z",
      },
      allintitle_measurement: {
        provider: "dataforseo",
        resultsAllintitle: 0,
        measuredAt: "2026-08-20T00:02:00.000Z",
      },
    },
  };
}

function rowWithCurrentAi() {
  const current = row();
  const semantic = current.analise_semantica as Record<string, unknown>;
  const inputHash = semanticReviewInputHash(buildSemanticReviewContext({
    keyword: current.keyword,
    intent: current.intent,
    volume_search: current.volume_search,
    results_allintitle: current.results_allintitle,
    kgr_score: null,
    analise_semantica: semantic,
  }));
  semantic.ai_review = {
    schemaVersion: "r5",
    status: "completed",
    reviewStatus: "completed",
    overallVerdict: "CONCORDA",
    fieldReviews: [],
    semanticEnrichment: {},
    inputHash,
  };
  semantic.human_review = { status: "completed", decision: "completed", fieldDecisions: [], aiInputHash: inputHash };
  return current;
}

test("resolver confirma artefatos atuais e KGR automático sem depender de presença de valores", () => {
  const states = resolveMineradorProcessState(row());
  assert.equal(states.logic.complete, true);
  assert.equal(states.volume.complete, true);
  assert.equal(states.results.complete, true);
  assert.equal(states.kgr.complete, true);
  assert.equal(states.kgr.artifactState, "current_valid");
  assert.equal(states.ai.complete, false);
  assert.equal(states.review.complete, false);
});

test("falha de revalidação preserva o artefato anterior e comunica a tentativa separadamente", () => {
  const states = resolveMineradorProcessState(row({ volume: { state: "failed" } }));
  assert.equal(states.volume.artifactState, "current_valid");
  assert.equal(states.volume.complete, true);
  assert.equal(states.volume.attemptState, "failed");
  assert.equal(mineradorProcessPresentation(states.volume), "failed");
  assert.equal(states.kgr.complete, true);
  assert.equal(mineradorProcessPresentation(states.kgr), "current");
});

test("mudança da Lógica não propaga stale para IA, Revisão, Volume, Resultados ou KGR", () => {
  const changed = rowWithCurrentAi();
  changed.keyword = "campanha de tráfego pago atualizada";
  const states = resolveMineradorProcessState(changed);
  assert.equal(states.logic.artifactState, "stale");
  assert.equal(states.volume.artifactState, "current_valid");
  assert.equal(states.results.artifactState, "current_valid");
  assert.equal(states.kgr.artifactState, "current_valid");
  assert.equal(states.ai.artifactState, "current_valid");
  assert.equal(states.review.artifactState, "current_valid");
  assert.equal(mineradorProcessPresentation(states.ai), "current");
  assert.equal(mineradorProcessPresentation(states.review), "current");
});

test("reprocessar Volume ou Resultados preserva IA e Revisão e recalcula somente o KGR", () => {
  const volumeChanged = rowWithCurrentAi();
  volumeChanged.volume_search = 110;
  (volumeChanged.analise_semantica as Record<string, unknown>).volume_measurement = {
    ...((volumeChanged.analise_semantica as Record<string, unknown>).volume_measurement as Record<string, unknown>),
    averageMonthlySearches: 110,
    measuredAt: "2026-08-20T00:03:00.000Z",
  };
  const volumeStates = resolveMineradorProcessState(volumeChanged);
  assert.equal(volumeStates.logic.artifactState, "current_valid");
  assert.equal(volumeStates.volume.artifactState, "current_valid");
  assert.equal(volumeStates.results.artifactState, "current_valid");
  assert.equal(volumeStates.kgr.artifactState, "current_valid");
  assert.equal(volumeStates.ai.artifactState, "current_valid");
  assert.equal(volumeStates.review.artifactState, "current_valid");

  const resultsChanged = rowWithCurrentAi();
  resultsChanged.results_allintitle = 12;
  (resultsChanged.analise_semantica as Record<string, unknown>).allintitle_measurement = {
    ...((resultsChanged.analise_semantica as Record<string, unknown>).allintitle_measurement as Record<string, unknown>),
    resultsAllintitle: 12,
    measuredAt: "2026-08-20T00:04:00.000Z",
  };
  const resultsStates = resolveMineradorProcessState(resultsChanged);
  assert.equal(resultsStates.logic.artifactState, "current_valid");
  assert.equal(resultsStates.volume.artifactState, "current_valid");
  assert.equal(resultsStates.results.artifactState, "current_valid");
  assert.equal(resultsStates.kgr.artifactState, "current_valid");
  assert.equal(resultsStates.ai.artifactState, "current_valid");
  assert.equal(resultsStates.review.artifactState, "current_valid");
});

test("reprocessar IA preserva a Revisão humana concluída", () => {
  const current = rowWithCurrentAi();
  const semantic = current.analise_semantica as Record<string, unknown>;
  semantic.ai_review = {
    ...(semantic.ai_review as Record<string, unknown>),
    inputHash: "r5-fnv1a-new-snapshot",
  };
  const states = resolveMineradorProcessState(current);
  assert.equal(states.ai.artifactState, "current_valid");
  assert.equal(states.review.artifactState, "current_valid");
  assert.equal(states.review.complete, true);
});

test("tentativa lógica falha sem tornar stale a IA e a revisão já atuais", () => {
  const states = resolveMineradorProcessState(rowWithCurrentAi());
  const failed = resolveMineradorProcessState({
    ...rowWithCurrentAi(),
    attempts: { logic: { state: "failed" } },
  });
  assert.equal(states.logic.artifactState, "current_valid");
  assert.equal(states.ai.artifactState, "current_valid");
  assert.equal(states.review.artifactState, "current_valid");
  assert.equal(failed.logic.artifactState, "current_valid");
  assert.equal(failed.logic.complete, true);
  assert.equal(failed.ai.artifactState, "current_valid");
  assert.equal(failed.review.artifactState, "current_valid");
  assert.equal(mineradorProcessPresentation(failed.logic), "failed");
});

test("tentativa da IA falha preservando a IA anterior e a Revisão anterior", () => {
  const failed = resolveMineradorProcessState({
    ...rowWithCurrentAi(),
    attempts: { ai: { state: "failed" } },
  });
  assert.equal(failed.ai.artifactState, "current_valid");
  assert.equal(failed.ai.complete, true);
  assert.equal(failed.review.artifactState, "current_valid");
  assert.equal(failed.review.complete, true);
  assert.equal(mineradorProcessPresentation(failed.ai), "failed");
});

test("decisão humana não altera a entrada corrente da IA nem torna R5 stale", () => {
  const current = rowWithCurrentAi();
  const semantic = current.analise_semantica as Record<string, unknown>;
  semantic.intencao_humana = "Comercial";
  semantic.intencao_revisada = "Comercial";
  semantic.nicho_humano = "Varejo";
  semantic.funnel_humano = "BOFU";
  semantic.human_review = {
    status: "completed",
    decision: "completed",
    overrides: { intent: "Comercial", niche: "Varejo", funnel: "BOFU" },
    fieldDecisions: [
      { field: "intent", canonicalField: "intent", selectedValue: "Comercial", decision: "accept_ai" },
      { field: "niche", canonicalField: "niche", selectedValue: "Varejo", decision: "edit" },
      { field: "funnel", canonicalField: "funnel", selectedValue: "BOFU", decision: "edit" },
    ],
    aiInputHash: (semantic.ai_review as Record<string, unknown>).inputHash,
  };

  const states = resolveMineradorProcessState(current);
  assert.equal(states.ai.artifactState, "current_valid");
  assert.equal(states.ai.complete, true);
  assert.equal(states.review.artifactState, "current_valid");
  assert.equal(states.review.complete, true);
});

test("valor zero de Resultado é uma medição válida e não vira ausência", () => {
  const states = resolveMineradorProcessState(row());
  assert.equal(states.results.artifactState, "current_valid");
  assert.equal(states.results.complete, true);
});
