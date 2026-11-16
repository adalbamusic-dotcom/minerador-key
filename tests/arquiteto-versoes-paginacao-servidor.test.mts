import assert from "node:assert/strict";
import test from "node:test";
import { listArquitetoVersionMeta, readArquitetoVersionRows } from "../lib/server/arquiteto-persistence.ts";

const row = (id: number) => ({ artifact_type: "article_dna", version_id: `version-${id}`, entity_id: `article-${id}`, version_number: 1, status: "approved", b: "brand", aid: `article-${id}`, principal: null, secondary: [], reinforcement: [], subject: null });
function context(input: { rows: ReturnType<typeof row>[]; cap: number; missingCount?: boolean; stuck?: boolean }) {
  const offsets: number[] = [];
  const client = { from(table: string) {
    assert.equal(table, "editorial_artifact_versions");
    let offset = 0;
    const query = { select() { return query; }, eq() { return query; }, in() { return query; }, order() { return query; }, range(start: number) { offset = start; offsets.push(start); return query; }, then(resolve: (value: unknown) => void) { const start = input.stuck ? 0 : offset; resolve({ data: input.rows.slice(start, start + input.cap), count: input.missingCount ? null : input.rows.length, error: null }); } };
    return query;
  } };
  return { value: { brandId: "brand", supabase: client }, offsets };
}

test("acervo é lido inteiro mesmo com limite do servidor menor que a página pedida", async () => {
  const f = context({ rows: [row(1), row(2), row(3)], cap: 1 });
  const result = await listArquitetoVersionMeta(f.value as never);
  assert.deepEqual(result.map(item => item.versionId), ["version-1", "version-2", "version-3"]);
  assert.deepEqual(f.offsets, [0, 1, 2]);
});

test("payloads das versões também são lidos integralmente sob limite menor", async () => {
  const f = context({ rows: [row(1), row(2), row(3)], cap: 1 });
  const result = await readArquitetoVersionRows(f.value as never, ["version-1", "version-2", "version-3"]);
  assert.deepEqual([...result.keys()], ["version-1", "version-2", "version-3"]);
  assert.deepEqual(f.offsets, [0, 1, 2]);
  await assert.rejects(readArquitetoVersionRows(context({ rows: [row(1), row(2)], cap: 1, stuck: true }).value as never, ["version-1", "version-2"]), /incompleta/);
});

test("contagem ausente ou leitura repetida não viram acervo parcial", async () => {
  for (const input of [
    { rows: [row(1)], cap: 1, missingCount: true },
    { rows: [row(1), row(2)], cap: 1, stuck: true },
  ]) await assert.rejects(listArquitetoVersionMeta(context(input).value as never), /contagem|incompleta/);
  const large = context({ rows: Array.from({ length: 101 }, (_, index) => row(index)), cap: 1 });
  assert.equal((await listArquitetoVersionMeta(large.value as never)).length, 101);
});
