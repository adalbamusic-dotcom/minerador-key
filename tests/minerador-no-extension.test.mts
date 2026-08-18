import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const workspacePage = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const discoveryPage = await readFile(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
const processorRoute = await readFile(new URL("../app/(brand)/[brandRef]/minerador/page.tsx", import.meta.url), "utf8");
const discoveryRoute = await readFile(new URL("../app/(brand)/[brandRef]/minerador/descobrir/page.tsx", import.meta.url), "utf8");
const importCore = await readFile(new URL("../lib/minerador/keyword-import-core.ts", import.meta.url), "utf8");
const metrics = await readFile(new URL("../lib/minerador/discovery-current-metrics.ts", import.meta.url), "utf8");
const metricsMigration = await readFile(new URL("../supabase/migrations/0013_minerador_discovery_candidate_current_metrics.sql", import.meta.url), "utf8");

async function emptyDirectory(path: URL) {
  try {
    const entries = await readdir(path);
    assert.equal(entries.length, 0);
  } catch {
    // The directory may be absent after the extension source removal.
  }
}

test("artefatos físicos e rotas produtivas da Extensão não existem", async () => {
  await emptyDirectory(new URL("../minerador-extensao/", import.meta.url));
  await emptyDirectory(new URL("../app/api/extensao/", import.meta.url));
  await assert.rejects(readFile(new URL("../lib/server/extension-auth.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../lib/server/extension-api.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../lib/server/extension-rate-limit.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../lib/minerador/extension-handshake.ts", import.meta.url)));
});

test("Processador e Descoberta carregam sem transporte Chrome e usam DataForSEO", () => {
  const productivePages = `${workspacePage}\n${discoveryPage}\n${processorRoute}\n${discoveryRoute}`;
  assert.doesNotMatch(productivePages, /chrome\.runtime|chrome\.storage|window\.postMessage|minerador-extension-relay|extension_page_reload_required|MineradorExtensionHandshakeResponder/);
  assert.match(workspacePage, /dataforseo\/allintitle/);
  assert.match(workspacePage, /Medir resultados|Atualizar resultados/);
  assert.match(discoveryPage, /dataforseo\/allintitle/);
  assert.match(discoveryPage, /Medir resultados|Atualizar resultados/);
  assert.match(workspacePage, /google-ads\/metricas-keywords/);
  assert.match(discoveryPage, /google-ads\/metricas-keywords/);
});

test("domínio de métricas atuais e importador compartilhado continuam presentes", () => {
  assert.match(importCore, /export async function importKeywordsWithCore/);
  assert.match(importCore, /normalizeKeyword/);
  assert.match(metricsMigration, /minerador_discovery_candidate_current_metrics/);
  assert.match(metrics, /DiscoveryCandidateCurrentMetrics/);
  assert.match(metrics, /buildDiscoveryAllintitleCurrentPatch/);
});
