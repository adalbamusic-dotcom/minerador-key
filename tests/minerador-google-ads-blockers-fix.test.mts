import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE,
  chunkDiscoveryCandidateIds,
  readDiscoveryCurrentMetricsInChunks,
} from "../lib/minerador/discovery-current-metrics-readback.ts";
import { buildDiscoveryPostPersistenceWarning } from "../lib/minerador/google-ads-discovery-diagnostics.ts";

const ids = (count: number) => Array.from({ length: count }, (_, index) => `candidate-${index + 1}`);

test("readback cobre zero, um, lote pequeno, limite e limite + 1", () => {
  assert.deepEqual(chunkDiscoveryCandidateIds([]), []);
  assert.deepEqual(chunkDiscoveryCandidateIds(ids(1)).map(chunk => chunk.length), [1]);
  assert.deepEqual(chunkDiscoveryCandidateIds(ids(3)).map(chunk => chunk.length), [3]);
  assert.deepEqual(chunkDiscoveryCandidateIds(ids(DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE)).map(chunk => chunk.length), [DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE]);
  assert.deepEqual(chunkDiscoveryCandidateIds(ids(DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE + 1)).map(chunk => chunk.length), [DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE, 1]);
});

test("readback de 500 IDs não perde nem duplica resultados", async () => {
  const candidateIds = ids(500);
  const calls: string[][] = [];
  const result = await readDiscoveryCurrentMetricsInChunks({
    candidateIds,
    readChunk: async chunk => {
      calls.push([...chunk]);
      return { data: [...chunk, chunk[0]].map(candidate_id => ({ candidate_id })), error: null };
    },
  });
  assert.equal(calls.length, 5);
  assert.ok(calls.every(chunk => chunk.length <= DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE));
  assert.equal(result.rows.length, 500);
  assert.deepEqual(result.rows.map(row => row.candidate_id), candidateIds);
  assert.equal(new Set(result.rows.map(row => row.candidate_id)).size, 500);
});

test("falha de um chunk interrompe o readback com erro diagnosticável", async () => {
  const failure = { code: "PGRST_CLIENT_FETCH", message: "authorization: Bearer secret-token" };
  let callCount = 0;
  await assert.rejects(
    readDiscoveryCurrentMetricsInChunks({
      candidateIds: ids(DISCOVERY_CURRENT_METRICS_READ_CHUNK_SIZE + 1),
      readChunk: async candidateIds => {
        callCount += 1;
        return callCount === 2 ? { data: null, error: failure } : { data: candidateIds.map(candidate_id => ({ candidate_id })), error: null };
      },
    }),
    error => error === failure,
  );
  const warning = buildDiscoveryPostPersistenceWarning(failure, { internalStage: "readback_current_metrics", providerRequestId: "request-1" });
  assert.equal(warning.persisted, true);
  assert.equal(warning.postPersistenceWarning, true);
  assert.equal(warning.internalErrorCode, "PGRST_CLIENT_FETCH");
  assert.match(String(warning.internalErrorMessage), /authorization=\[redacted\]/i);
  assert.doesNotMatch(JSON.stringify(warning), /secret-token/);
});

test("rota preserva sucesso parcial quando a persistência principal terminou", async () => {
  const [route, page] = await Promise.all([
    readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../modules/minerador/discovery/discovery-keywords-page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /success:\s*true,\s*partial:\s*true/);
  assert.match(route, /A pesquisa foi salva, mas a sincronização das métricas atuais não foi concluída/);
  assert.match(route, /buildDiscoveryPostPersistenceWarning/);
  assert.match(route, /postPersistenceStage = internalStage/);
  assert.match(page, /payload\.partial \? "WARNING" : "SUCCESS"/);
  assert.doesNotMatch(page, /payload\.partial \? "ERROR"/);
});

test("UPSERT de métricas atuais permanece no corpo POST sem mudança preventiva", async () => {
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts", import.meta.url), "utf8");
  assert.match(route, /minerador_discovery_candidate_current_metrics"\)\.upsert\(rows, \{ onConflict: "candidate_id" \}\)/);
  assert.doesNotMatch(route, /chunkDiscoveryCurrentMetricsUpsert|UPSERT_CHUNK_SIZE/);
});

test("0044 altera somente time_zone NOT NULL para NULLABLE", async () => {
  const [migration, preflight, rollback, verifier, contract] = await Promise.all([
    readFile(new URL("../supabase/migrations/0044_google_ads_metrics_time_zone_compatibility.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/scripts/0044-google-ads-metrics-time-zone-compatibility-preflight-read-only.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/scripts/0044-google-ads-metrics-time-zone-compatibility-rollback.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/scripts/0044-google-ads-metrics-time-zone-compatibility-post-verifier-bound-read-only.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/scripts/0044-google-ads-metrics-time-zone-compatibility-contract-test-local.sql", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /ALTER TABLE public\.minerador_keyword_metric_measurements\s+ALTER COLUMN time_zone DROP NOT NULL/i);
  assert.doesNotMatch(migration, /\b(?:currency_code|INSERT|UPDATE|DELETE|DROP TABLE|ADD COLUMN)\b/i);
  assert.match(preflight, /time_zone NOT NULL -> NULLABLE/);
  assert.match(rollback, /WHERE time_zone IS NULL/);
  assert.match(rollback, /ALTER COLUMN time_zone SET NOT NULL/);
  assert.match(verifier, /target_now_nullable/);
  assert.doesNotMatch(verifier, /BASELINE_BOUND_PLACEHOLDER/);
  assert.match(contract, /VALUES \(NULL\)/);
  assert.match(contract, /America\/Sao_Paulo/);
  assert.match(contract, /ROLLBACK/);
});
