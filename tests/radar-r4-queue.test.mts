import assert from "node:assert/strict";
import test from "node:test";
import {
  availableBulkActions,
  createRadarR4LocalArticleState,
  createRadarR4SerpQueue,
  getRadarR4BulkEligibility,
  nextActionForArticle,
  prepareRadarR4Topics,
  prepareRadarR4TopicsFromContext,
  buildRadarR4ExpertContext,
  moveRadarR4Topic,
  removeRadarR4Topic,
  updateRadarR4Topic,
  updateRadarR4SerpQueueItem,
  type RadarR4BulkArticleSnapshot,
  type RadarR4LocalArticleState,
} from "../lib/radar/r4-queue.ts";

function snapshot(articleId: string, overrides: Partial<RadarR4BulkArticleSnapshot> = {}): RadarR4BulkArticleSnapshot {
  return {
    articleId,
    keywordReady: true,
    serpCollected: false,
    serpReviewed: false,
    analysisStarted: false,
    reportGenerated: false,
    reportApproved: false,
    sentToPlanner: false,
    rowState: "research_pending",
    topicsState: "NOT_PREPARED",
    topicsReviewed: false,
    specialistState: "NOT_REQUIRED",
    serpQueueState: null,
    amazonState: "AMAZON_NOT_APPLICABLE",
    ...overrides,
  };
}

test("R4 cria fila SERP deduplicada e mantém transição por artigo", () => {
  const queue = createRadarR4SerpQueue(["a", "b", "a"], "batch-test");
  assert.deepEqual(queue.articleIds, ["a", "b"]);
  assert.equal(queue.items.a.state, "QUEUED");
  assert.equal(queue.items.b.position, 2);
  const running = updateRadarR4SerpQueueItem(queue, "a", "RUNNING");
  const waiting = updateRadarR4SerpQueueItem(running, "a", "WAITING_REVIEW");
  assert.equal(waiting.items.a.state, "WAITING_REVIEW");
  assert.equal(waiting.items.b.state, "QUEUED");
});

test("R4 calcula elegibilidade sem misturar processos", () => {
  const selected = [
    snapshot("A", { serpCollected: true, serpQueueState: "WAITING_REVIEW", rowState: "researching" }),
    snapshot("B", { serpCollected: true, serpReviewed: true, analysisStarted: true, specialistState: "AWAITING_EXPERT", rowState: "needs_review" }),
    snapshot("C", { serpCollected: true, serpReviewed: true, analysisStarted: true, reportGenerated: true, reportApproved: true, rowState: "approved" }),
    snapshot("D"),
  ];
  const actions = availableBulkActions(selected);
  assert.deepEqual(actions.serp.alreadyDone, ["A", "B", "C"]);
  assert.deepEqual(actions.serp.eligible, ["D"]);
  assert.deepEqual(actions.specialist.alreadyDone, ["B"]);
  assert.deepEqual(actions.specialist.notApplicable, ["A", "C", "D"]);
  assert.deepEqual(actions.report.alreadyDone, ["C"]);
  assert.deepEqual(getRadarR4BulkEligibility([snapshot("blocked", { keywordReady: false })], "serp").blocked, ["blocked"]);
});

test("R4 preserva estados locais independentes para SERP, especialista, relatório e espera", () => {
  const local: Record<string, RadarR4LocalArticleState> = {
    A: { ...createRadarR4LocalArticleState(), serp: { state: "RUNNING", position: 1, total: 3, error: null } },
    B: { ...createRadarR4LocalArticleState(), specialist: "AWAITING_EXPERT" },
    C: { ...createRadarR4LocalArticleState(), report: "READY_FOR_REVIEW" },
    D: createRadarR4LocalArticleState(),
  };
  assert.equal(local.A.serp.state, "RUNNING");
  assert.equal(local.B.specialist, "AWAITING_EXPERT");
  assert.equal(local.C.report, "READY_FOR_REVIEW");
  assert.equal(local.D.serp.state, null);
  assert.notEqual(local.A, local.B);
  assert.notEqual(local.B, local.C);
});

test("R4 representa a fila multiartigo exigida sem misturar foco operacional", () => {
  const local: Record<string, RadarR4LocalArticleState> = {
    A: { ...createRadarR4LocalArticleState(), serp: { state: "WAITING_REVIEW", position: 1, total: 5, error: null } },
    B: { ...createRadarR4LocalArticleState(), serp: { state: "RUNNING", position: 2, total: 5, error: null } },
    C: { ...createRadarR4LocalArticleState(), specialist: "AWAITING_EXPERT" },
    D: { ...createRadarR4LocalArticleState(), specialist: "RECEIVED" },
    E: { ...createRadarR4LocalArticleState(), report: "READY_FOR_REVIEW" },
  };
  assert.equal(local.A.serp.state, "WAITING_REVIEW");
  assert.equal(local.B.serp.state, "RUNNING");
  assert.equal(local.C.specialist, "AWAITING_EXPERT");
  assert.equal(local.D.specialist, "RECEIVED");
  assert.equal(local.E.report, "READY_FOR_REVIEW");
  assert.equal(local.B.amazon, "AMAZON_NOT_APPLICABLE");
  assert.notEqual(local.A, local.B);
});

test("R4 prepara tópicos locais e mantém gate humano antes do especialista", () => {
  const topics = prepareRadarR4Topics({ articleId: "article-a", principal: "keyword principal", reportSummary: "Lacunas observadas", evidenceCount: 4 });
  assert.equal(topics.length, 3);
  assert.match(topics[0].text, /keyword principal/);
  assert.match(topics[1].text, /Lacunas observadas/);
  assert.deepEqual({ topicsState: "TOPICS_READY_FOR_REVIEW", specialistState: "TOPICS_READY" }, { topicsState: "TOPICS_READY_FOR_REVIEW", specialistState: "TOPICS_READY" });
});

test("R4 constrói contexto de SERP/Amazon/ArticleDNA e permite revisão local da pauta", () => {
  const context = buildRadarR4ExpertContext({ principal: "keyword principal", intent: "informacional", silo: "Silo A", serpNeeds: ["Responder a necessidade observada"], amazonCriteria: [], existingContent: "Material existente", openGaps: ["Lacuna aberta"] });
  const topics = prepareRadarR4TopicsFromContext({ articleId: "article-context", context, evidenceCount: 2 });
  assert.equal(topics[0].sourceType, "ArticleDNA");
  assert.equal(topics[1].sourceType, "SERP");
  assert.equal(topics[2].sourceType, "AMAZON");
  const edited = updateRadarR4Topic(topics, topics[0].id, "Pergunta revisada");
  const moved = moveRadarR4Topic(edited, topics[2].id, -1);
  const removed = removeRadarR4Topic(moved, topics[1].id);
  assert.equal(removed.length, 2);
  assert.equal(removed[0].text, "Pergunta revisada");
});

test("R4 separa próxima ação individual das ações coletivas", () => {
  const state = { ...createRadarR4LocalArticleState(), serp: { state: "WAITING_REVIEW" as const, position: 2, total: 4, error: null } };
  assert.match(nextActionForArticle({ baseAction: "Outra ação", localState: state }), /Revise a SERP/);
  assert.equal(nextActionForArticle({ baseAction: "Outra ação", localState: createRadarR4LocalArticleState() }), "Outra ação");
});
