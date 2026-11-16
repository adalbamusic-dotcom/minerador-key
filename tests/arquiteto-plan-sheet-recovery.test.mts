import assert from "node:assert/strict";
import test from "node:test";
import { readAllPlanSheetRecoveryPages, recoverPlanSheetRuns } from "../lib/arquiteto/plan-sheet-recovery.ts";
import type { ImprovementRun } from "../lib/server/arquiteto-article-improvement.ts";

function run(id: string, targets: string[], extra: Partial<ImprovementRun> = {}): ImprovementRun {
  return { runId: id, state: "prepared", decisionHash: `hash-${id}`, proposals: targets.map(targetId => ({ targetId })), refusedTargets: [], acceptedIds: null, groupScope: { groupId: "blue" }, discovery: { requested: true }, ...extra } as ImprovementRun;
}

test("recovery mantém leituras separadas e o hash e substitui apenas o alvo reprocessado", () => {
  const actual = recoverPlanSheetRuns([run("new", ["b"]), run("old", ["a", "b"])]);
  assert.deepEqual(actual.drafts.map(item => [item.runId, item.decisionHash, item.proposals.map(p => p.targetId)]), [["old", "hash-old", ["a"]], ["new", "hash-new", ["b"]]]);
});

test("confirmação posterior invalida só seus alvos; prévia grátis sem aceite não apaga a leitura", () => {
  const actual = recoverPlanSheetRuns([
    run("preview", ["a"], { discovery: undefined }),
    run("complete", ["b"], { discovery: undefined, state: "complete", acceptedIds: ["b"] }),
    run("old", ["a", "b"]),
  ]);
  assert.deepEqual(actual.drafts.map(item => item.proposals.map(p => p.targetId)), [["a"]]);
});

test("coletas e gravações interrompidas não ressuscitam cópias antigas", () => {
  const actual = recoverPlanSheetRuns([
    run("applying", ["a"], { state: "applying", acceptedIds: ["a"] }),
    run("collecting", ["b"], { state: "collecting" }),
    run("old", ["a", "b", "c"]),
  ]);
  assert.deepEqual(actual.interrupted.map(item => item.runId), ["applying"]);
  assert.equal(actual.collecting, true);
  assert.deepEqual(actual.drafts.map(item => item.proposals.map(p => p.targetId)), [["c"]]);
});

test("várias gravações aceitas ficam disponíveis mesmo que haja leitura mais nova", () => {
  const actual = recoverPlanSheetRuns([
    run("newer", ["a", "c"]),
    run("write-two", ["b"], { state: "applying", acceptedIds: ["b"] }),
    run("write-one", ["a"], { state: "applying", acceptedIds: ["a"] }),
  ]);
  assert.deepEqual(actual.interrupted.map(item => item.runId), ["write-two", "write-one"]);
  assert.deepEqual(actual.drafts.map(item => item.proposals.map(p => p.targetId)), [["c"]]);
});

test("paginação segue após páginas curtas e desempata IDs com a mesma data", async () => {
  const time = "2026-11-01T10:00:00+00:00";
  const one = { created_at: time, id: "00000000-0000-4000-8000-000000000002" };
  const two = { created_at: time, id: "00000000-0000-4000-8000-000000000001" };
  const cursors: unknown[] = [];
  const result = await readAllPlanSheetRecoveryPages(async cursor => {
    cursors.push(cursor);
    return cursor === null ? [one] : cursor.id === one.id ? [two] : [];
  });
  assert.deepEqual(result, [one, two]);
  assert.deepEqual(cursors, [null, one, two]);
});

test("paginação que não avança ou excede limite falha sem retornar resultado parcial", async () => {
  const row = { created_at: "2026-11-01T10:00:00+00:00", id: "00000000-0000-4000-8000-000000000001" };
  await assert.rejects(readAllPlanSheetRecoveryPages(async () => [row]), /não avançou/);
  await assert.rejects(readAllPlanSheetRecoveryPages(async () => [row], 1), /nenhuma recuperação parcial/);
});
