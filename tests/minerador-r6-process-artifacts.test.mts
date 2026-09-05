import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCompleteHumanReview, completeHumanReview, humanReviewRecord } from "../lib/minerador/human-review.ts";
import { buildLogicalOutputContract, buildLogicalProcessorMetadata } from "../lib/minerador/logical-processor.ts";
import { mineradorProcessPresentation, resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { buildSemanticReviewContext, semanticReviewInputHash } from "../lib/minerador/semantic-review.ts";

const logicalInput = {
  keywordId: "keyword-r6",
  keyword: "gestao de condominio digital",
  location: null,
  niche: "Serviços condominiais",
};

type Row = ReturnType<typeof currentRow>;

function currentRow() {
  const row = {
    id: logicalInput.keywordId,
    keyword: logicalInput.keyword,
    location: null as string | null,
    intent: "Informativa" as string | null,
    volume_search: 90 as number | null,
    results_allintitle: 12 as number | null,
    analise_semantica: {
      dna_origem: "logico_deterministico",
      nicho: logicalInput.niche,
      intencao_principal: "Informativa",
      funnel: "TOFU",
      logical_output_contract: buildLogicalOutputContract({
        semantic: { intencao_principal: "Informativa", nicho: logicalInput.niche, funnel: "TOFU" },
        intent: "Informativa",
        niche: logicalInput.niche,
        funnel: "TOFU",
      }),
      ...buildLogicalProcessorMetadata(logicalInput, "2026-08-24T10:00:00.000Z"),
      volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-24T10:01:00.000Z" },
      allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-24T10:02:00.000Z" },
      kgr_aplicabilidade: "applicable",
    } as Record<string, unknown>,
  };
  const inputHash = semanticReviewInputHash(buildSemanticReviewContext({
    keyword: row.keyword,
    intent: row.intent,
    volume_search: row.volume_search,
    results_allintitle: row.results_allintitle,
    kgr_score: null,
    analise_semantica: row.analise_semantica,
  }));
  row.analise_semantica.ai_review = {
    schemaVersion: "r5",
    status: "completed",
    reviewStatus: "completed",
    overallVerdict: "CONCORDA",
    fieldReviews: [],
    semanticEnrichment: {},
    inputHash,
  };
  row.analise_semantica.human_review = {
    schemaVersion: "r6",
    status: "completed",
    decision: "completed",
    fieldDecisions: [],
    aiInputHash: inputHash,
    completedAt: "2026-08-24T10:05:00.000Z",
    completedBy: "human-1",
  };
  return row;
}

function rerunLogic(row: Row, processedAt: string): Row {
  Object.assign(row.analise_semantica, buildLogicalProcessorMetadata({ ...logicalInput, keyword: row.keyword }, processedAt));
  return row;
}

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

test("R6 mantém cada processo independente: refazer Lógica não altera nenhum outro artefato", () => {
  const row = currentRow();
  const validated = { site: "missing", logic: "current_valid", volume: "current_valid", results: "current_valid", kgr: "current_valid", ai: "current_valid", review: "current_valid" };
  const before = resolveMineradorProcessState(row);
  assert.deepEqual(Object.fromEntries(Object.entries(before).map(([name, state]) => [name, state.artifactState])), validated);

  row.keyword = "gestao de condominio digital para sindicos";
  const after = resolveMineradorProcessState(rerunLogic(row, "2026-08-24T11:00:00.000Z"));
  // Provenance changed (the AI consumed the previous logical snapshot), but
  // provenance is not freshness: every other artifact stays validated.
  assert.deepEqual(Object.fromEntries(Object.entries(after).map(([name, state]) => [name, state.artifactState])), validated);
  const updateBadges = Object.values(after).filter(state => mineradorProcessPresentation(state) === "stale").length;
  assert.equal(updateBadges, 0);
  assert.equal(after.ai.complete, true);
  assert.equal(after.review.complete, true);
});

test("R6 mantém IA e Revisão validadas quando IA é reexecutada sobre outro snapshot", () => {
  const row = currentRow();
  row.analise_semantica.ai_review = { ...(row.analise_semantica.ai_review as Record<string, unknown>), inputHash: "r5-fnv1a-novo-snapshot" };
  const states = resolveMineradorProcessState(row);
  assert.equal(states.ai.artifactState, "current_valid");
  assert.equal(states.review.artifactState, "current_valid");
  assert.equal(states.review.complete, true);
  assert.equal(mineradorProcessPresentation(states.review), "current");
});

test("R6 preserva tudo quando uma tentativa falha e nunca invalida dependentes pelo candidate", () => {
  const row = currentRow();
  const states = resolveMineradorProcessState({ ...row, attempts: { logic: { state: "failed" }, ai: { state: "failed" } } });
  assert.equal(states.logic.artifactState, "current_valid");
  assert.equal(states.logic.complete, true);
  assert.equal(states.volume.artifactState, "current_valid");
  assert.equal(states.results.artifactState, "current_valid");
  assert.equal(states.kgr.artifactState, "current_valid");
  assert.equal(states.ai.artifactState, "current_valid");
  assert.equal(states.review.artifactState, "current_valid");
  assert.equal(mineradorProcessPresentation(states.logic), "failed");
  assert.equal(mineradorProcessPresentation(states.ai), "failed");
});

test("R6 recalcula o KGR somente com Volume e Resultado promovidos", () => {
  const volumeRerun = currentRow();
  volumeRerun.volume_search = 140;
  volumeRerun.analise_semantica.volume_measurement = { provider: "google_ads", averageMonthlySearches: 140, measuredAt: "2026-08-24T12:00:00.000Z" };
  const volumeStates = resolveMineradorProcessState(volumeRerun);
  assert.equal(volumeStates.kgr.complete, true);
  assert.equal(volumeStates.logic.artifactState, "current_valid");
  assert.equal(volumeStates.results.artifactState, "current_valid");
  assert.equal(volumeStates.ai.artifactState, "current_valid");
  assert.equal(volumeStates.review.artifactState, "current_valid");

  const logicRerun = resolveMineradorProcessState(rerunLogic(currentRow(), "2026-08-24T12:30:00.000Z"));
  assert.equal(logicRerun.kgr.complete, true);
  assert.equal(logicRerun.kgr.artifactState, "current_valid");
});

test("R6 reprojeta os mesmos estados após reload, sem tentativa local persistida", () => {
  const row = currentRow();
  row.keyword = "gestao de condominio digital com app";
  rerunLogic(row, "2026-08-24T13:00:00.000Z");
  const running = resolveMineradorProcessState({ ...row, attempts: { ai: { state: "running" } } });
  const reloaded = resolveMineradorProcessState(row);
  for (const name of ["site", "logic", "volume", "results", "kgr", "ai", "review"] as const) {
    assert.equal(reloaded[name].artifactState, running[name].artifactState);
    assert.equal(reloaded[name].attemptState, "not_run");
  }
  assert.equal(reloaded.volume.artifactState, "current_valid");
  assert.equal(reloaded.ai.artifactState, "current_valid");
  assert.equal(reloaded.review.artifactState, "current_valid");
  assert.equal(Object.values(reloaded).filter(state => mineradorProcessPresentation(state) === "stale").length, 0);
  assert.equal(mineradorProcessPresentation(running.ai), "running");
});

test("R6 mantém Concluir revisão acionável com pendências e aplica defaults conservadores", () => {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    funnel: "TOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-24T10:01:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-24T10:02:00.000Z" },
    kgr_aplicabilidade: "applicable",
    ai_review: {
      schemaVersion: "r5",
      status: "completed",
      reviewStatus: "completed",
      overallVerdict: "DIVERGE",
      fieldReviews: [{ field: "intenção", logicalValue: "Informativa", aiSuggestion: "Comercial", verdict: "DIVERGE", rationale: "Sinal comercial.", evidenceUsed: ["logical"] }],
      semanticEnrichment: { searchNeed: "Comparar alternativas." },
    },
  };
  const completion = canCompleteHumanReview(semantic, { intent: "Informativa" });
  assert.equal(completion.ok, true);
  assert.ok(completion.pendingFields.length > 0);
  assert.ok((completion.pendingEnrichments || []).length > 0);

  const completed = completeHumanReview({ semantic, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-24T14:00:00.000Z" });
  const record = humanReviewRecord(completed);
  assert.equal(record.status, "completed");
  assert.equal(record.fieldDecisions.find(entry => entry.field === "intenção")?.decision, "keep_logic");
  assert.equal(record.fieldDecisions.find(entry => entry.field === "niche")?.decision, "confirm_unknown");
  assert.equal(record.enrichmentDecisions?.find(entry => entry.field === "searchNeed")?.decision, "ignore");
  // Conservative defaults never accept the AI suggestion nor invent a value.
  assert.equal((completed as Record<string, unknown>).intencao_principal, "Informativa");
  assert.equal((completed as Record<string, unknown>).intencao_humana, "Informativa");
  assert.equal((completed as Record<string, unknown>).nicho_humano, undefined);
  assert.equal((completed as Record<string, unknown>).nicho_override, undefined);
});

test("R6 não cria versão falsa e não bloqueia o botão por pendências decisórias", () => {
  assert.match(workspace, /wasAlreadyCompleted && !draftHasChanges/);
  assert.match(workspace, /a consolidação existente foi mantida/);
  const conclude = panel.slice(panel.indexOf("void onAction?.({ type: \"complete\" })"), panel.indexOf("Concluir revisão</button>"));
  assert.match(conclude, /disabled=\{statusUpdating \|\| !onAction\}/);
  assert.doesNotMatch(conclude, /pendingDivergenceRows|pendingEnrichmentRows|pendingStrategicRows|completion\.ok|aiReview/);
});

test("R6 apresenta Atualizar apenas por artefato próprio, sem desabilitar a etapa nem tocar o GlobalTopbar", () => {
  const strip = panel.slice(panel.indexOf("function ProfileStepStrip"), panel.indexOf("function ProfileBento"));
  assert.match(strip, /· Atualizar/);
  assert.match(strip, /· Falhou/);
  assert.match(strip, /data-process-artifact-state=\{step\.state\.artifactState\}/);
  assert.match(strip, /data-process-attempt-state=\{step\.state\.attemptState\}/);
  assert.doesNotMatch(strip, /disabled/);
  // The review panel never derives an "update" state from another process.
  assert.doesNotMatch(panel, /aiStale|reviewStale|IA · Atualizar|Revisão · Atualizar/);
  assert.match(panel, />Revisar novamente<\/button>/);
});

test("R6 não dispara provider automaticamente e preserva o escopo por marca na revisão", () => {
  // O recorte termina no próximo handler declarado após a revisão humana.
  const reviewHandlerStart = workspace.indexOf("const handleHumanReviewAction");
  const reviewHandlerEnd = Math.min(
    ...["const runContextualPresentation", "const handleOpenHumanReview"]
      .map(marker => workspace.indexOf(marker, reviewHandlerStart))
      .filter(index => index > reviewHandlerStart),
  );
  const reviewHandler = workspace.slice(reviewHandlerStart, reviewHandlerEnd);
  for (const forbidden of ["handleBatchAnalyze", "handleBatchSemanticReview", "handleBatchAllintitle", "handleCheckWithSite", "fetch("]) {
    assert.ok(!reviewHandler.includes(forbidden), `A revisão humana não pode acionar ${forbidden}.`);
  }
  assert.match(reviewHandler, /\.eq\("brand_id", selectedBrandId\)/);
  assert.match(reviewHandler, /readCanonicalKeywordRows\(\[keywordId\]\)/);
  assert.match(reviewHandler, /persistedReview\.status !== "completed"/);
});
