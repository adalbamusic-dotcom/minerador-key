import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { beginRadarSerpReviewReadback, beginRadarSerpReviewWrite, canApplyRadarSerpReviewReadback, EMPTY_RADAR_SERP_REVIEW_SYNC_STATE, finishRadarSerpReviewWrite, radarSerpReviewReadbackFingerprint } from "../lib/radar/serp-review-readback.ts";
import { deriveRadarSerpReviewState, radarSerpReviewSelectionFingerprint } from "../lib/radar/serp-review-state.ts";

const review = (overrides: Record<string, unknown> = {}) => ({
  id: "serp-review:review-1",
  brandId: "brand-1",
  articleId: "article-1",
  snapshotId: "serp:article-1:snapshot-1",
  status: "approved" as const,
  notes: "Aprovação vinculada ao snapshot serp:article-1:snapshot-1; seleção humana: organic:2|organic:4|organic:5|organic:7.",
  reviewedBy: "reviewer-1",
  reviewedAt: "2026-08-27T04:52:54.627Z",
  ...overrides,
});

test("readback de revisão não aplica uma resposta antiga depois de write ou de novo readback", () => {
  const first = beginRadarSerpReviewReadback(EMPTY_RADAR_SERP_REVIEW_SYNC_STATE);
  const duringWrite = beginRadarSerpReviewWrite(first.state);
  assert.equal(canApplyRadarSerpReviewReadback(duringWrite, first.token), false);
  const afterWrite = finishRadarSerpReviewWrite(duringWrite);
  assert.equal(canApplyRadarSerpReviewReadback(afterWrite, first.token), false);
  const second = beginRadarSerpReviewReadback(afterWrite);
  assert.equal(canApplyRadarSerpReviewReadback(second.state, second.token), true);
});

test("fingerprint de readback inclui artigo, versão, lock e identidade do snapshot", () => {
  const item = { id: "radar:article-1", brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "dna-1", lockVersion: 1 };
  const record = { id: "serp:article-1:snapshot-1", research: { version: 3, contentHash: "hash-1" } };
  const base = radarSerpReviewReadbackFingerprint({ item, record });
  assert.notEqual(base, radarSerpReviewReadbackFingerprint({ item: { ...item, articleDnaVersionId: "dna-2" }, record }));
  assert.notEqual(base, radarSerpReviewReadbackFingerprint({ item: { ...item, lockVersion: 2 }, record }));
  assert.notEqual(base, radarSerpReviewReadbackFingerprint({ item, record: { ...record, id: "serp:article-1:snapshot-2" } }));
  assert.notEqual(base, radarSerpReviewReadbackFingerprint({ item, record: { ...record, research: { version: 4, contentHash: "hash-2" } } }));
});

test("aprovação remota só fecha a revisão quando o snapshot e a curadoria são atuais", () => {
  const current = deriveRadarSerpReviewState({ reviews: [review()], snapshotId: "serp:article-1:snapshot-1", selectedCompetitorIds: ["organic:7", "organic:5", "organic:4", "organic:2"] });
  assert.equal(current.currentness, "current");

  const reopened = deriveRadarSerpReviewState({ reviews: [review()], snapshotId: "serp:article-1:snapshot-1", selectedCompetitorIds: ["organic:2", "organic:4"] });
  assert.equal(reopened.currentness, "reopened");

  const newSnapshot = deriveRadarSerpReviewState({ reviews: [review()], snapshotId: "serp:article-1:snapshot-2", selectedCompetitorIds: ["organic:2", "organic:4", "organic:5", "organic:7"] });
  assert.equal(newSnapshot.currentness, "none");
  assert.equal(newSnapshot.review, null);
});

test("aprovação histórica sem fingerprint permanece preservada, mas não vira aprovação atual", () => {
  const state = deriveRadarSerpReviewState({ reviews: [review({ notes: "" })], snapshotId: "serp:article-1:snapshot-1", selectedCompetitorIds: ["organic:2"] });
  assert.equal(state.currentness, "unknown");
  assert.equal(state.review?.status, "approved");
  assert.equal(radarSerpReviewSelectionFingerprint("seleção humana: organic:4|organic:2."), "organic:2|organic:4");
});

test("readback usa rota estreita e confirmação por snapshot, sem coleta de provider", () => {
  const route = readFileSync(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");
  const getRoute = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  const context = readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(getRoute, /repository\.list\(input\.brandId, input\.articleId\)/);
  assert.match(getRoute, /repository\.listReviews\(input\.brandId, input\.articleId\)/);
  assert.doesNotMatch(getRoute, /collectDataForSeoSerpSnapshot/);
  assert.match(context, /serpReviewReadbackSnapshotIds/);
  assert.match(page, /serpReviewReadbackSnapshotIds\.includes/);
});
