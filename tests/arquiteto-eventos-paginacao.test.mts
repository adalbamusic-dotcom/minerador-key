import assert from "node:assert/strict";
import test from "node:test";
import { readArticleVersionEvents } from "../lib/server/arquiteto-workspace.ts";

function context(rows: Array<Record<string, unknown>>, options: { limit?: number; repeat?: boolean; noCount?: boolean } = {}) {
  const client = { from: () => {
    let from = 0;
    let selected: string[] = [];
    const query = {
      select: () => query,
      in: (_column: string, ids: string[]) => { selected = ids; return query; },
      order: () => query,
      range: (start: number) => { from = start; return query; },
      then: (resolve: (value: unknown) => void) => {
        const matches = rows.filter(row => selected.includes(String(row.version_id)));
        const start = options.repeat ? 0 : from;
        return Promise.resolve({ data: matches.slice(start, start + (options.limit ?? 1000)), count: options.noCount ? null : matches.length, error: null }).then(resolve);
      },
    };
    return query;
  } };
  return { supabase: client } as never;
}

test("eventos posteriores ao limite do servidor definem o estado atual", async () => {
  const rows = Array.from({ length: 1002 }, (_, i) => ({ id: `event-${i}`, version_id: "article-v1", status: i === 1001 ? "rejected" : "approved", occurred_at: new Date(1700000000000 + i * 1000).toISOString(), reason: "fixture" }));
  const events = await readArticleVersionEvents(context(rows, { limit: 137 }), ["article-v1"]);
  assert.equal(events.length, 1002);
  assert.equal(events.at(-1)?.status, "rejected");
});

test("eventos repetidos ou sem contagem não viram leitura parcial", async () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: `event-${i}`, version_id: "v1", status: "approved", occurred_at: null, reason: "fixture" }));
  await assert.rejects(readArticleVersionEvents(context(rows, { limit: 2, repeat: true }), ["v1"]), /incompleta ou repetida/);
  await assert.rejects(readArticleVersionEvents(context(rows, { noCount: true }), ["v1"]), /leitura integral/);
});
