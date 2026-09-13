import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRadarR4SerpQueue, updateRadarR4SerpQueueItem } from "../lib/radar/r4-queue.ts";
import {
  areRadarR5TopicsReviewed,
  buildRadarR5QueueProgress,
  classifyRadarR5SerpArticle,
  deriveRadarR5PersistedSerpState,
  latestRadarR5SerpRecord,
  topicSuggestionsToRadarTopics,
  type RadarR5TopicSuggestion,
} from "../lib/radar/r5-sequential.ts";
import type { SerpCollectionRecord, SerpReviewRecord } from "../lib/editorial/contracts.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function realRecord(articleId: string, id: string, version = 1): SerpCollectionRecord {
  return {
    id,
    input: { keyword: `keyword-${articleId}`, articleId, location: "Brasil", language: "pt-BR", device: "desktop" },
    status: "needs_review",
    provider: "dataforseo",
    origin: "real",
    isMock: false,
    snapshot: null,
    cost: null,
    error: null,
    dnaIntent: "informacional",
    conflictReason: null,
    humanDecisionRequired: true,
    research: { version, collectedAt: `2026-08-26T12:0${version}:00.000Z` } as unknown as SerpCollectionRecord["research"],
    persistenceMode: "local",
    resolutionMode: "local_recovery",
    canonicalRemoteVerified: false,
  };
}

function review(snapshotId: string, status: "approved" | "rejected"): SerpReviewRecord {
  return { id: `review-${snapshotId}`, brandId: "brand-1", articleId: "article-1", snapshotId, status, notes: "decisão humana", reviewedBy: "user-1", reviewedAt: "2026-08-26T13:00:00.000Z" };
}

test("R5 recupera a etapa SERP de snapshots e reviews existentes sem inventar execução", () => {
  const empty = deriveRadarR5PersistedSerpState({ articleId: "article-1", records: [], reviews: [] });
  assert.equal(empty.state, null);
  const pending = deriveRadarR5PersistedSerpState({ articleId: "article-1", records: [realRecord("article-1", "snapshot-1")], reviews: [] });
  assert.equal(pending.state, "WAITING_REVIEW");
  const done = deriveRadarR5PersistedSerpState({ articleId: "article-1", records: [realRecord("article-1", "snapshot-1")], reviews: [review("snapshot-1", "approved")] });
  assert.equal(done.state, "COMPLETED");
  const rejected = deriveRadarR5PersistedSerpState({ articleId: "article-1", records: [realRecord("article-1", "snapshot-1")], reviews: [review("snapshot-1", "rejected")] });
  assert.match(rejected.error || "", /rejeitada/i);
});

test("R5 impede reprocessamento implícito e separa refresh explícito", () => {
  const record = realRecord("article-1", "snapshot-1");
  assert.equal(classifyRadarR5SerpArticle({ keywordReady: true, latestRecord: record }), "ALREADY_DONE");
  assert.equal(classifyRadarR5SerpArticle({ keywordReady: true, latestRecord: record, mode: "explicit_refresh" }), "ELIGIBLE");
  assert.equal(classifyRadarR5SerpArticle({ keywordReady: false, latestRecord: null }), "BLOCKED");
  assert.equal(classifyRadarR5SerpArticle({ keywordReady: true, latestRecord: null, currentState: "FAILED_RETRYABLE" }), "ELIGIBLE");
  assert.equal(classifyRadarR5SerpArticle({ keywordReady: true, latestRecord: record, currentState: "FAILED_FINAL", mode: "explicit_refresh" }), "BLOCKED");
});

test("R5 mantém fila sequencial, progresso compacto e falhas isoladas por artigo", () => {
  let queue = createRadarR4SerpQueue(["a", "b", "c"], "r5-batch");
  queue = updateRadarR4SerpQueueItem(queue, "a", "COMPLETED");
  queue = updateRadarR4SerpQueueItem(queue, "b", "FAILED_RETRYABLE", "retry");
  queue = updateRadarR4SerpQueueItem(queue, "c", "WAITING_REVIEW");
  const progress = buildRadarR5QueueProgress(queue);
  assert.deepEqual(progress, { total: 3, queued: 0, running: 0, waitingReview: 1, completed: 1, failedRetryable: 1, failedFinal: 0, active: true });
  queue = updateRadarR4SerpQueueItem(queue, "b", "COMPLETED");
  queue = updateRadarR4SerpQueueItem(queue, "c", "COMPLETED");
  assert.equal(buildRadarR5QueueProgress(queue).active, false);
});

test("R5 preserva contexto e gate individual das pautas DeepSeek", () => {
  const suggestions: RadarR5TopicSuggestion[] = [
    { text: "Pergunta SERP", origin: "SERP", justification: "Lacuna observada na SERP", need: "Explicar a necessidade observada" },
    { text: "Pergunta ArticleDNA", origin: "ArticleDNA", justification: "Intenção do ArticleDNA", need: "Cobrir a intenção" },
    { text: "Pergunta conteúdo", origin: "Conteúdo existente", justification: "Material associado", need: "Aprofundar o material" },
  ];
  const topics = topicSuggestionsToRadarTopics("article-1", suggestions);
  assert.equal(topics.length, 3);
  assert.equal(topics[0].sourceType, "SERP");
  assert.equal(topics[0].need, suggestions[0].need);
  assert.equal(areRadarR5TopicsReviewed(topics, topics.slice(0, 2).map(topic => topic.id)), false);
  assert.equal(areRadarR5TopicsReviewed(topics, topics.map(topic => topic.id)), true);
});

test("R5 mantém a operação no consumidor canônico e não chama provider no render", () => {
  const page = read("../modules/radar/radar-page.tsx");
  const route = read("../app/api/editorial/radar-topics/route.ts");
  assert.match(page, /pipeline\.collectSerp/);
  assert.match(page, /pipeline\.reviewSerp/);
  assert.match(page, /for \(const id of queue\.articleIds\)/);
  assert.match(page, /\/api\/editorial\/radar-topics/);
  /*
   * NENHUM EFEITO DE RENDER COLETA SERP.
   *
   * A asserção é por CORPO de efeito, não pelo arquivo: a forma antiga
   * (`useEffect\([^]*collectSerp`) casava qualquer efeito seguido, em qualquer
   * ponto do arquivo, de uma menção a `collectSerp` — e passava só porque a
   * página não tinha efeito nenhum.
   */
  for (const efeito of page.match(/useEffect\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/g) || []) {
    assert.equal(/collectSerp|pipeline\.collect/.test(efeito), false, "nenhum useEffect pode coletar SERP");
  }
  assert.match(route, /resolveDeepSeekCanonicalConfig/);
  assert.match(route, /generateStructuredAI/);
  assert.match(route, /humanDecisionRequired: true/);
  assert.doesNotMatch(route, /SerpSnapshotRepository|Telegram/);
  assert.equal(latestRadarR5SerpRecord([realRecord("article-2", "snapshot-2")], "article-1"), null);
});
