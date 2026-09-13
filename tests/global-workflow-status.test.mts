import test from "node:test";
import assert from "node:assert/strict";
import { globalWorkflowStatus, radarReadbackMatches, GLOBAL_WORKFLOW_STATUSES } from "../lib/editorial/global-workflow-status.ts";
import { validateReadyForRadarClaims, readyBaseMatchesCurrent, type CanonicalApprovalIndex } from "../lib/arquiteto/operational-status.ts";
import { persistGlobalTransition } from "../lib/server/global-workflow-transition.ts";

const claim = { articleId: "article", articleDnaVersionId: "a1", siloDnaVersionId: "s1", siloPageVersionId: "p1", internalLinkGraphVersionId: "g1" };
function canonical(): CanonicalApprovalIndex {
  return { approvedArticleVersions: new Set(["a1"]), approvedSiloVersions: new Set(["s1"]),
    approvedSiloPageVersions: new Set(["p1"]), approvedGraphVersions: new Set(["g1"]),
    articleIdByVersion: new Map([["a1", "article"]]),
    graphBases: new Map([["g1", { siloDnaVersionId: "s1", siloPageVersionId: "p1", articleVersionIds: ["a1"] }]]) };
}

test("global vocabulary never promotes artifact approval or local completion", () => {
  assert.equal(globalWorkflowStatus(null), "RASCUNHO");
  for (const value of ["approved", "APROVADO", "CONCLUIDO", "formed"]) assert.equal(globalWorkflowStatus(value), "EM_PROCESSO");
  for (const status of GLOBAL_WORKFLOW_STATUSES) assert.equal(globalWorkflowStatus(status), status);
});
test("canonical matching base is eligible, independent from global status", () => {
  assert.equal(validateReadyForRadarClaims({ claims: [claim], canonical: canonical() }).accepted.length, 1);
});
test("batch preserves valid articles and names wrong ownership", () => {
  const result = validateReadyForRadarClaims({ claims: [claim, { ...claim, articleId: "another" }], canonical: canonical() });
  assert.deepEqual(result.accepted, [claim]);
  assert.equal(result.refused[0].articleId, "another");
});
test("approved graph of another silo cannot support readiness", () => {
  const index = canonical();
  index.graphBases = new Map([["g1", { siloDnaVersionId: "other", siloPageVersionId: "p1", articleVersionIds: ["a1"] }]]);
  assert.equal(validateReadyForRadarClaims({ claims: [claim], canonical: index }).accepted.length, 0);
  assert.equal(readyBaseMatchesCurrent({ base: claim, canonical: index }).matches, false);
});
test("missing article membership and missing canonical approval both block", () => {
  const index = canonical();
  index.graphBases = new Map([["g1", { siloDnaVersionId: "s1", siloPageVersionId: "p1", articleVersionIds: [] }]]);
  assert.equal(validateReadyForRadarClaims({ claims: [claim], canonical: index }).accepted.length, 0);
  index.approvedSiloPageVersions = new Set();
  assert.ok(validateReadyForRadarClaims({ claims: [claim], canonical: index }).refused[0].blockers.length >= 2);
});
test("Radar readback requires matching tenant, stage, article, version and hash", () => {
  const row = { marca_id: "brand", stage: "radar", article_id: "article", source_version_id: "a1", source_content_hash: "hash" };
  assert.equal(radarReadbackMatches(row, "brand", "article", "a1", "hash"), true);
  for (const field of Object.keys(row)) assert.equal(radarReadbackMatches({ ...row, [field]: "wrong" }, "brand", "article", "a1", "hash"), false);
  assert.equal(radarReadbackMatches(null, "brand", "article", "a1", "hash"), false);
});

// Scripted PostgREST responses exercise failure boundaries without network writes.
function database(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: { table: string; operations: Array<[string, ...unknown[]]> }[] = [];
  const db = { from(table: string) {
    const entry = { table, operations: [] as Array<[string, ...unknown[]]> }; calls.push(entry);
    const chain: Record<string, unknown> = {};
    for (const method of ["insert", "update", "select", "eq"]) chain[method] = (...args: unknown[]) => { entry.operations.push([method, ...args]); return chain; };
    for (const method of ["single", "maybeSingle"]) chain[method] = () => Promise.resolve(responses.shift());
    return chain;
  } };
  return { db: db as unknown as Parameters<typeof persistGlobalTransition>[0], calls };
}
const previous = { id: "w", state: "EM_PROCESSO", lock_version: 1, payload: {} };
const written = { ...previous, state: "PRONTO_PARA_RADAR", lock_version: 2, payload: claim };
const input = { brandId: "brand", articleId: "article", actorId: "actor", target: "PRONTO_PARA_RADAR", previous, payload: claim };
const ok = (data: unknown) => ({ data, error: null });
test("status succeeds only after both state and event readback", async () => {
  const { db, calls } = database([ok(written), ok({ id: "event" }), ok(written), ok({ id: "event", to_state: input.target })]);
  assert.equal((await persistGlobalTransition(db, input)).lock_version, 2);
  assert.deepEqual(calls.map(call => call.table), ["editorial_workflow_items", "editorial_decision_events", "editorial_workflow_items", "editorial_decision_events"]);
  assert.ok(calls[0].operations.some(op => op[0] === "eq" && op[1] === "lock_version" && op[2] === 1));
});
test("concurrent write refuses before creating history", async () => {
  const { db, calls } = database([ok(null)]);
  await assert.rejects(persistGlobalTransition(db, input), /outra sessão/);
  assert.equal(calls.length, 1);
});
test("event failure compensates only its own lock and never returns success", async () => {
  const { db, calls } = database([ok(written), { data: null, error: new Error("failed") }, ok({ id: "w" })]);
  await assert.rejects(persistGlobalTransition(db, input), /revertida/);
  assert.ok(calls[2].operations.some(op => op[0] === "eq" && op[1] === "lock_version" && op[2] === 2));
  assert.ok(calls[2].operations.some(op => op[0] === "update" && (op[1] as {state: string}).state === "EM_PROCESSO"));
});
test("failed compensation names reconciliation instead of success", async () => {
  const { db } = database([ok(written), { data: null, error: new Error("failed") }, ok(null)]);
  await assert.rejects(persistGlobalTransition(db, input), /reconciliação/);
});
test("divergent state or event readback refuses the transition", async () => {
  for (const mismatch of ["state", "history"]) {
    const { db } = database([ok(written), ok({ id: "event" }), ok(mismatch === "state" ? previous : written), ok({ id: "event", to_state: mismatch === "history" ? "RASCUNHO" : input.target })]);
    await assert.rejects(persistGlobalTransition(db, input), /readback/);
  }
});
