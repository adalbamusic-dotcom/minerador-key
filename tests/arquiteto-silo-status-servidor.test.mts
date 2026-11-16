import assert from "node:assert/strict";
import test from "node:test";
import { loadArticleVersions } from "../lib/server/arquiteto-silo-consolidation-adapter.ts";
import { deriveTerritorialArticlesFromWorkingCopy } from "../lib/arquiteto/silo-dna-binding.ts";

const refs = [{ articleId: "article-1", articleDnaVersionId: "v1", articleDnaContentHash: "hash" }];
const copy = { articleRefs: refs, brandId: "brand-a", territoryRef: "territory-a" };

function fixture(input: { rowStatus?: string; events?: Array<{ id: string; status: string; occurred_at: string }>; eventError?: boolean; brand?: string }) {
  const rows = [{ version_id: "v1", entity_id: "article-1", content_hash: "hash", status: input.rowStatus ?? "proposed", marca_id: input.brand ?? "brand-a", payload: { brandId: "brand-a", territoryRef: "territory-a" } }];
  let queriedVersions: string[] = [];
  const supabase = { from(table: string) {
    const filters = new Map<string, unknown>();
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.set(key, value); return query; },
      in(key: string, value: string[]) { filters.set(key, value); return query; },
      order() { return query; },
      limit() { return query; },
      async maybeSingle() {
        const id = String(filters.get("version_id")); queriedVersions.push(id);
        if (input.eventError) return { data: null, error: { code: "unexpected", message: "failure" } };
        const latest = [...(input.events ?? [])].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id))[0];
        return { data: latest ? { status: latest.status } : null, error: null };
      },
      then(resolve: (value: unknown) => void) {
        assert.equal(table, "editorial_artifact_versions");
        const brand = filters.get("marca_id");
        const versions = filters.get("version_id") as string[];
        resolve({ data: rows.filter(row => row.marca_id === brand && versions.includes(row.version_id)), error: null });
      },
    };
    return query;
  } };
  return { context: { brandId: "brand-a", supabase }, queriedVersions: () => queriedVersions };
}

async function read(input: Parameters<typeof fixture>[0]) {
  const f = fixture(input);
  const loaded = await loadArticleVersions(f.context as never, copy as never);
  return { loaded, f, projected: deriveTerritorialArticlesFromWorkingCopy(copy as never, new Map(loaded.map(item => [item.versionId, item]))) };
}

test("evento aprovado permite aprovação; rejeição posterior prevalece", async () => {
  const approved = { id: "1", status: "approved", occurred_at: "2026-01-01" };
  assert.equal((await read({ events: [approved] })).projected[0].isHumanApproved, true);
  const rejected = { id: "2", status: "rejected", occurred_at: "2026-01-02" };
  assert.equal((await read({ rowStatus: "approved", events: [rejected, approved] })).projected[0].isHumanApproved, false);
});

test("sem evento respeita status da versão, sem aprovação por existência", async () => {
  assert.equal((await read({ rowStatus: "approved" })).projected[0].isHumanApproved, true);
  assert.equal((await read({ rowStatus: "proposed" })).projected[0].isHumanApproved, false);
});

test("falha na leitura do evento interrompe a consolidação", async () => {
  await assert.rejects(read({ eventError: true }));
});

test("versão de outra marca não autoriza consolidação", async () => {
  const { loaded, projected, f } = await read({ brand: "brand-b", rowStatus: "approved" });
  assert.equal(loaded.length, 0);
  assert.equal(projected[0].isHumanApproved, false);
  assert.deepEqual(f.queriedVersions(), []);
});
