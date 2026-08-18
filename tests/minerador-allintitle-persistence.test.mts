import assert from "node:assert/strict";
import test from "node:test";
import { AllintitlePersistenceRequestSchema, allintitlePersistenceDecision } from "../lib/minerador/allintitle-persistence.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const item = (status: "success" | "zero_results" | "unavailable" | "captcha" | "blocked" | "error" | "timeout" | "cancelled", value?: number | null) => ({ requestId: uuid, keywordId: "22222222-2222-4222-8222-222222222222", status, resultsAllintitle: value, measuredAt: "2026-07-29T12:00:00.000Z" });

test("contrato de allintitle limita o lote e exige IDs UUID", () => {
  const parsed = AllintitlePersistenceRequestSchema.parse({ operationRequestId: uuid, batchId: "33333333-3333-4333-8333-333333333333", results: [item("success", 12)] });
  assert.equal(parsed.results.length, 1);
  assert.throws(() => AllintitlePersistenceRequestSchema.parse({ operationRequestId: "not-a-uuid", batchId: uuid, results: [item("success", 1)] }));
  assert.throws(() => AllintitlePersistenceRequestSchema.parse({ operationRequestId: uuid, batchId: uuid, results: Array.from({ length: 11 }, () => item("success", 1)) }));
});

test("somente medições confirmadas substituem o valor atual", () => {
  assert.deepEqual(allintitlePersistenceDecision(item("success", 18)), { outcome: "persisted", value: 18 });
  assert.deepEqual(allintitlePersistenceDecision(item("zero_results", 0)), { outcome: "persisted", value: 0 });
  assert.deepEqual(allintitlePersistenceDecision(item("success", null)), { outcome: "rejected", reason: "confirmed_value_required" });
  assert.deepEqual(allintitlePersistenceDecision(item("zero_results", 2)), { outcome: "rejected", reason: "zero_value_required" });
});

test("falha ou bloqueio preserva a medição anterior", () => {
  for (const status of ["error", "unavailable", "captcha", "blocked", "timeout", "cancelled"] as const) assert.deepEqual(allintitlePersistenceDecision(item(status, null)), { outcome: "preserved", reason: "measurement_not_confirmed" });
});
