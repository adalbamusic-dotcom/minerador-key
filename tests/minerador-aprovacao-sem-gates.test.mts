import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateMineradorArquitetoHandoff, evaluateMineradorArquitetoHandoffBatch } from "../lib/minerador/arquiteto-handoff-gates.ts";
import { buildKeywordSemanticQualification, isFullyConsolidatedQualification, qualificationConsolidatedAxes } from "../lib/minerador/keyword-semantic-qualification.ts";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";
import { completeHumanReview, isHumanReviewCompleted } from "../lib/minerador/human-review.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { deriveHumanReviewUiState, humanReviewStatePill, humanReviewStateSummary } from "../lib/minerador/human-review-ui-state.ts";
import { buildMineradorArquitetoHandoffPlan } from "../lib/arquiteto/minerador-handoff.ts";

/**
 * Aprovar é decisão humana; processos são independentes.
 *
 * Estado de processo (Lógica, Volume, Resultados, SERP, KGR, IA, Revisão)
 * é informação de leitura, nunca veto editorial. Reexecutar um processo cria
 * uma nova versão do artefato dele e não toca nos demais — a única dependência
 * legítima é Volume/Resultado → KGR.
 *
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const gatesModule = readFileSync(new URL("../lib/minerador/arquiteto-handoff-gates.ts", import.meta.url), "utf8");
const serverHandoff = readFileSync(new URL("../lib/server/arquiteto-workspace.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

const BRAND = "brand-a";
const KEYWORD = "77777777-7777-4777-8777-777777777777";
const statusHandler = workspace.slice(workspace.indexOf("const handleUpdateStatus"), workspace.indexOf("const handleBatchStatus"));

const measuredSemantic: Record<string, unknown> = {
  dna_origem: "logico_deterministico",
  intencao_principal: "Informativa",
  funnel: "TOFU",
  volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-28T10:01:00.000Z" },
  allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 12, measuredAt: "2026-08-28T10:02:00.000Z" },
  kgr_aplicabilidade: "applicable",
  logical_output_contract: buildLogicalOutputContract({ semantic: { intencao_principal: "Informativa", funnel: "TOFU" }, intent: "Informativa", funnel: "TOFU" }),
};

/** Keyword crua: nenhum processo executado além do texto. */
const rawSemantic: Record<string, unknown> = { intencao_principal: null };

function keywordRow(semantic: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: KEYWORD,
    keyword: "retinol principia antes e depois",
    brand_id: BRAND,
    status: "aprovado",
    volume_search: 90,
    results_allintitle: 12,
    analise_semantica: semantic,
    ...overrides,
  };
}

function reviewedSemantic() {
  return completeHumanReview({ semantic: { ...measuredSemantic }, intent: "Informativa", actorId: "human-1", completedAt: "2026-08-28T15:05:00.000Z" });
}

function evidenceFrom(items: Array<{ title: string; description?: string }>, keyword = "retinol principia antes e depois") {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-serp-1",
        status_code: 20000,
        result: [{
          keyword,
          location_code: 2076,
          language_code: "pt",
          items: items.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index + 1}.com.br`, ...item })),
        }],
      }],
    },
    keyword,
    locationCode: 2076,
    languageCode: "pt",
    providerRequestId: "task-serp-1",
    operationRequestId: "11111111-1111-4111-8111-111111111111",
    collectedAt: "2026-08-29T18:00:00.000Z",
  })!;
}

const conclusiveItems = Array.from({ length: 8 }, (_, index) => ({ title: `O que é retinol e como usar ${index + 1}`, description: "Guia passo a passo para entender o ativo." }));
/** SERP real do caso: metade informativa, metade transacional/local — mista. */
const mixedItems = [
  { title: "O que é retinol", description: "guia" },
  { title: "Como usar retinol à noite", description: "passo a passo" },
  { title: "Comprar retinol Principia", description: "preco e frete" },
  { title: "Retinol Principia com cupom", description: "desconto" },
  { title: "Melhor retinol 2026", description: "comparativo" },
  { title: "Review do retinol Principia", description: "resenha" },
  { title: "Clinica perto de mim", description: "agendar" },
  { title: "Unidades e endereco", description: "atendimento em SP" },
];

const qualificationOf = (items: Array<{ title: string; description?: string }>) =>
  buildKeywordSemanticQualification({ brandId: BRAND, keywordId: KEYWORD, evidence: evidenceFrom(items), createdBy: "user-1" });

test("A · aprovar não consulta SERP, revisão nem qualquer artefato de processo", () => {
  for (const forbidden of [
    "semanticQualifications[wordId]",
    "isFullyConsolidatedQualification",
    "isHumanReviewCompleted",
    "SERP_CANONICAL_BLOCKER_MESSAGE",
    "SERP_NOT_CONSOLIDATED_BLOCKER_MESSAGE",
    "Conclua a revisão do DNA",
  ]) {
    assert.ok(!statusHandler.includes(forbidden), `a aprovação não pode depender de ${forbidden}`);
  }
  // Sobra apenas integridade técnica: o vínculo de publicação legado.
  assert.ok(statusHandler.includes("isLegacyPublishedStatus(item?.status)"));
});

test("B · o vocabulário de impedimento semântico deixou de existir no produto", () => {
  for (const source of [workspace, gatesModule, serverHandoff]) {
    assert.ok(!source.includes("SERP_CANONICAL_BLOCKER_MESSAGE"));
    assert.ok(!source.includes("SERP_NOT_CONSOLIDATED_BLOCKER_MESSAGE"));
  }
  assert.ok(!gatesModule.includes("Conclua a revisão do DNA antes do envio."));
  assert.ok(!gatesModule.includes("Conclua o Processo Lógico"));
});

test("C · keyword crua, sem nenhum processo, já é enviável pelo humano", () => {
  const gate = evaluateMineradorArquitetoHandoff(keywordRow(rawSemantic, { volume_search: null, results_allintitle: null }), BRAND, null);
  assert.equal(gate.logicProcessed, false);
  assert.equal(gate.volumeValidated, false);
  assert.equal(gate.resultsValidated, false);
  assert.equal(gate.kgrReady, false);
  assert.equal(gate.aiCompleted, false);
  assert.equal(gate.humanReviewCompleted, false);
  assert.equal(gate.serpEvidencePersisted, false);
  assert.equal(gate.semanticAxesConsolidated, false);
  assert.equal(gate.ok, true, "nenhum processo é pré-requisito de envio");
  assert.equal(gate.reason, undefined);
});

test("D · SERP mista não bloqueia envio e não vira conclusiva", async () => {
  const mixed = await qualificationOf(mixedItems);
  assert.equal(isFullyConsolidatedQualification(mixed), false, "a SERP mista continua mista");
  const gate = evaluateMineradorArquitetoHandoff(keywordRow(measuredSemantic), BRAND, mixed);
  assert.equal(gate.serpEvidencePersisted, true);
  assert.equal(gate.semanticAxesConsolidated, false);
  assert.equal(gate.ok, true);
});

test("E · revisão humana não executada não impede envio", () => {
  const semantic = { ...measuredSemantic };
  assert.equal(isHumanReviewCompleted(semantic), false);
  assert.equal(evaluateMineradorArquitetoHandoff(keywordRow(semantic), BRAND, null).ok, true);
});

test("F · só status e Brand permanecem como integridade técnica", async () => {
  const consolidated = await qualificationOf(conclusiveItems);
  const wrongStatus = evaluateMineradorArquitetoHandoff(keywordRow(reviewedSemantic(), { status: "bruto" }), BRAND, consolidated);
  assert.equal(wrongStatus.ok, false);
  assert.match(wrongStatus.reason || "", /status/i);
  const wrongBrand = evaluateMineradorArquitetoHandoff(keywordRow(reviewedSemantic()), "brand-b", consolidated);
  assert.equal(wrongBrand.ok, false);
  assert.match(wrongBrand.reason || "", /Brand ativa/);
});

test("G · o lote só separa o que falha por status ou Brand", async () => {
  const mixed = await qualificationOf(mixedItems);
  const batch = evaluateMineradorArquitetoHandoffBatch({
    keywords: [keywordRow(rawSemantic), keywordRow(measuredSemantic, { id: "kw-2", status: "bruto" })],
    brandId: BRAND,
    qualifications: { [KEYWORD]: mixed },
  });
  assert.equal(batch.blocked.length, 1);
  assert.equal(batch.blocked[0]?.keywordId, "kw-2");
  assert.match(batch.reason, /status/i);
});

test("H · o handoff remoto não recusa mais por evidência semântica", () => {
  const prepare = serverHandoff.slice(serverHandoff.indexOf("async function prepareCanonicalHandoff"), serverHandoff.indexOf("async function persistCanonicalHandoff"));
  assert.ok(!prepare.includes('PipelineRuntimeError("INVALID_ARTIFACT"'));
  assert.ok(!prepare.includes("withoutCanonicalSerp"));
  assert.ok(!prepare.includes("withoutConsolidation"));
  // Continua lendo o artifact — como contexto, e sem reexecutar provider.
  assert.ok(prepare.includes("readCurrentKeywordSemanticQualifications("));
  for (const forbidden of ["executeDataForSeoSerpOperation", "deriveSerpSemanticEvidence", "semanticConsolidationDrafts"]) {
    assert.ok(!prepare.includes(forbidden), `o handoff não pode ${forbidden}`);
  }
});

test("I · o pacote transporta honestamente a SERP não conclusiva", async () => {
  const mixed = await qualificationOf(mixedItems);
  const axes = qualificationConsolidatedAxes(mixed);
  assert.equal(axes.intent, null);
  assert.equal(axes.funnel, null);
  const plan = buildMineradorArquitetoHandoffPlan({
    brandId: BRAND,
    existingKeywordIds: new Set<string>(),
    keywords: [{
      id: KEYWORD,
      brandId: BRAND,
      status: "aprovado",
      semanticQualification: {
        versionId: mixed.id,
        versionNumber: mixed.lifecycle.version,
        contentHash: mixed.lifecycle.contentHash,
        intent: axes.intent,
        funnel: axes.funnel,
        semanticState: "non_conclusive",
        collectedAt: mixed.source.collectedAt,
      },
    }],
  });
  const carried = (plan.rows[0]?.payload as { semanticQualification?: Record<string, unknown> }).semanticQualification;
  assert.equal(carried?.intent, null);
  assert.equal(carried?.funnel, null);
  assert.equal(carried?.semanticState, "non_conclusive");
  assert.equal(plan.rows[0]?.source_version_id, mixed.id);
  // O servidor deriva o mesmo rótulo a partir do artifact persistido.
  assert.ok(serverHandoff.includes('semanticState: isFullyConsolidatedQualification(qualification) ? "conclusive" : "non_conclusive"'));
});

test("J · reexecutar a IA não invalida Lógica, Volume, Resultados, KGR nem Revisão", () => {
  const semantic = reviewedSemantic();
  const before = resolveMineradorProcessState(keywordRow(semantic));
  const afterAiRerun = resolveMineradorProcessState({ ...keywordRow(semantic), attempts: { ai: { state: "success" } } });
  const afterAiFailure = resolveMineradorProcessState({ ...keywordRow(semantic), attempts: { ai: { state: "failed" } } });
  for (const process of ["volume", "results", "kgr", "review"] as const) {
    assert.equal(before[process].complete, true, `${process} começa completo`);
    assert.equal(afterAiRerun[process].complete, true, `a IA não pode invalidar ${process}`);
    assert.equal(afterAiFailure[process].complete, true, `a falha da IA não pode invalidar ${process}`);
  }
  // Lógica pode estar incompleta por conta própria; o que a IA não pode é
  // alterar esse estado em nenhuma direção.
  assert.deepEqual(afterAiRerun.logic, before.logic);
  assert.deepEqual(afterAiFailure.logic, before.logic);
  // A rota da IA grava o próprio artefato e nada mais.
  const aiRunner = workspace.slice(workspace.indexOf("const runContextualPresentation"), workspace.indexOf("const handleBatchContextualPresentation"));
  for (const forbidden of ["setKeywords", "setHumanReviewDrafts", "setSemanticQualifications", "setSemanticConsolidationDrafts", "handleUpdateStatus"]) {
    assert.ok(!aiRunner.includes(forbidden), `a IA não pode chamar ${forbidden}`);
  }
});

test("K · reexecutar SERP/Resultados não invalida Revisão, IA nem Status", () => {
  const semantic = reviewedSemantic();
  const running = resolveMineradorProcessState({ ...keywordRow(semantic), attempts: { results: { state: "running" } } });
  const failed = resolveMineradorProcessState({ ...keywordRow(semantic), attempts: { results: { state: "failed" } } });
  assert.equal(running.review.complete, true);
  assert.equal(failed.review.complete, true);
  assert.equal(failed.results.complete, true, "a tentativa falha preserva a medição atual");
  const batchResults = workspace.slice(workspace.indexOf("const handleBatchAllintitle"), workspace.indexOf("const handleBatchQualify"));
  for (const forbidden of ["setHumanReviewDrafts", "setPresentationBriefs", "handleUpdateStatus", "setExpandedRowId", "setSelectedIds"]) {
    assert.ok(!batchResults.includes(forbidden), `o lote de resultados não pode chamar ${forbidden}`);
  }
});

test("L · Volume e Resultado continuam podendo recalcular o KGR — a única dependência", () => {
  const complete = resolveMineradorProcessState(keywordRow(measuredSemantic));
  assert.equal(complete.kgr.complete, true);
  const withoutResults = { ...measuredSemantic };
  delete withoutResults.allintitle_measurement;
  const partial = resolveMineradorProcessState(keywordRow(withoutResults, { results_allintitle: null }));
  assert.equal(partial.results.complete, false);
  assert.equal(partial.kgr.complete, false, "sem Resultado o KGR deixa de ser atual");
  assert.equal(partial.volume.complete, true, "e o Volume permanece intocado");
});

test("M · aprovação e seleção sobrevivem à reexecução", () => {
  // Nenhum caminho de reprocesso rebaixa status: só handleUpdateStatus escreve.
  const writes = workspace.split(".update({ status:").length - 1;
  assert.equal(writes, 1, "existe um único ponto de escrita de status");
  assert.ok(statusHandler.includes(".update({ status: normalizedStatus })"));
  // Seleção e linha expandida só mudam por ação do usuário ou troca de Marca.
  for (const handler of ["const handleBatchContextualPresentation", "const handleBatchQualify", "const handleQualifySelected"]) {
    const start = workspace.indexOf(handler);
    assert.ok(start > 0, `${handler} existe`);
    const body = workspace.slice(start, workspace.indexOf("\n  };", start));
    assert.ok(!body.includes("setSelectedIds"), `${handler} não pode limpar a seleção`);
    assert.ok(!body.includes("setExpandedRowId"), `${handler} não pode mexer na linha expandida`);
  }
});

test("N · Revisão Humana sem decisão disponível não cobra pendência", () => {
  assert.equal(deriveHumanReviewUiState({ completed: false, pendingDecisions: 0 }), "no_decision_needed");
  assert.equal(humanReviewStatePill(deriveHumanReviewUiState({ completed: false, pendingDecisions: 0 })).label, "Sem decisões pendentes");
  assert.equal(humanReviewStatePill(deriveHumanReviewUiState({ completed: false, pendingDecisions: 1 })).label, "Decisão disponível");
  assert.equal(humanReviewStatePill(deriveHumanReviewUiState({ completed: true })).label, "Decisões registradas");
  assert.match(humanReviewStateSummary("no_decision_needed"), /sem decisões pendentes/);
  // O Perfil e o painel consomem o mesmo helper; "Revisão pendente" saiu da UI.
  assert.ok(panel.includes("humanReviewStatePill(reviewUiState)"));
  assert.ok(panel.includes("humanReviewStatePill(profileReviewUiState)"));
  assert.ok(!panel.includes('"Revisão pendente"'));
});

test("O · KGR pendente é decisão humana real e aparece como disponível", () => {
  assert.equal(deriveHumanReviewUiState({ completed: false, pendingDecisions: 1 }), "decision_available");
  assert.ok(panel.includes("completion.pendingKgrDecision ? 1 : 0"));
  // Concluída, a revisão é registro — não volta a pendente por outro processo.
  const reviewed = resolveMineradorProcessState({ ...keywordRow(reviewedSemantic()), attempts: { ai: { state: "failed" }, results: { state: "failed" } } });
  assert.equal(reviewed.review.complete, true);
  assert.equal(deriveHumanReviewUiState({ completed: reviewed.review.complete }), "decisions_recorded");
});

test("P · regressão 'retinol principia antes e depois': SERP mista, aprovação livre", async () => {
  const mixed = await qualificationOf(mixedItems);
  assert.equal(mixed.intent.strength === "conclusive", false);
  assert.equal(isFullyConsolidatedQualification(mixed), false);
  // Sem IA, sem revisão e com SERP mista, a decisão continua sendo do humano.
  const gate = evaluateMineradorArquitetoHandoff(keywordRow(measuredSemantic), BRAND, mixed);
  assert.equal(gate.aiCompleted, false);
  assert.equal(gate.humanReviewCompleted, false);
  assert.equal(gate.semanticAxesConsolidated, false);
  assert.equal(gate.ok, true);
  // E nada precisa ser apagado para repetir o teste: o artifact é versionado.
  const rerun = await qualificationOf(mixedItems);
  assert.equal(rerun.keywordId, mixed.keywordId);
  assert.equal(rerun.lifecycle.contentHash, mixed.lifecycle.contentHash);
});

test("Q · nenhuma chamada de provider nos testes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("REAL_PROVIDER_CALL"); }) as typeof fetch;
  try {
    const qualification = await qualificationOf(conclusiveItems);
    assert.equal(isFullyConsolidatedQualification(qualification), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
