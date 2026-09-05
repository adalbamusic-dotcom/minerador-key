import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyCatalogSync,
  canTransitionSyncRun,
  compareLocalAndRemoteCatalog,
  emptyBrandSiteSnapshot,
  resolveLastKnownGoodRun,
  runMayInferAbsence,
  type SiteCatalogEntryRecord,
  type SiteSyncRunRecord,
} from "../lib/marca/site-persistence-contracts.ts";
import { resolveSyncOutcome } from "../lib/marca/site-sync-finalization.ts";

/**
 * A2 — repositório remoto do Site da Marca.
 *
 * O remoto passa a ser autoridade; o local vira transição. Nenhuma migration
 * nova: as três tabelas e a RPC de finalização já existem.
 */

const BRAND = "brand-1";
const OTHER = "brand-2";

const run = (id: string, status: SiteSyncRunRecord["status"], overrides: Partial<SiteSyncRunRecord> = {}): SiteSyncRunRecord => ({
  id, brandId: BRAND, sitemapId: "sm-1", status,
  foundCount: 0, newCount: 0, updatedCount: 0, missingCount: 0, errorCount: 0, durationMs: 10,
  errorMessage: null,
  startedAt: "2026-09-03T12:00:00.000Z",
  completedAt: status === "running" ? null : "2026-09-03T12:00:05.000Z",
  ...overrides,
});

const entry = (url: string, overrides: Partial<SiteCatalogEntryRecord> = {}): SiteCatalogEntryRecord => ({
  id: `catalog:${url}`, brandId: BRAND,
  normalizedUrl: url, discoveredUrl: `https://marca.com${url}`,
  resolvedUrl: null, declaredCanonicalUrl: null, normalizedCanonicalUrl: null,
  title: null, h1: null, metaDescription: null,
  pageType: "unknown", indexability: "unknown", verificationStatus: "discovered",
  sourceSitemapId: "sm-1", sitemapLastmod: null,
  presenceState: "present",
  firstSeenAt: "2026-09-01T12:00:00.000Z", firstSeenRunId: "run-0",
  lastSeenAt: "2026-09-01T12:00:00.000Z", lastSeenRunId: "run-0",
  lastVerifiedAt: null,
  importStatus: "not_imported", origin: "sitemap", ignoredAt: null,
  ...overrides,
});

const observed = (url: string) => ({
  normalizedUrl: url, discoveredUrl: `https://marca.com${url}`, sourceSitemapId: "sm-1", sitemapLastmod: null,
});

test("Brand sem sitemap tem snapshot válido e vazio", () => {
  const snapshot = emptyBrandSiteSnapshot(BRAND, "https://marca.com");

  assert.equal(snapshot.brandId, BRAND);
  assert.deepEqual(snapshot.sitemaps, []);
  assert.equal(snapshot.lastSuccessfulRun, null);
  assert.equal(snapshot.freshness.neverSynced, true);
  assert.equal(snapshot.freshness.lastSyncedAt, null);
});

test("last known good sai da execução completa mais recente", () => {
  const runs = [
    run("run-3", "failed", { startedAt: "2026-09-03T14:00:00.000Z" }),
    run("run-2", "completed", { startedAt: "2026-09-03T13:00:00.000Z", completedAt: "2026-09-03T13:00:05.000Z" }),
    run("run-1", "completed", { startedAt: "2026-09-03T11:00:00.000Z", completedAt: "2026-09-03T11:00:05.000Z" }),
  ];

  assert.equal(resolveLastKnownGoodRun(runs)?.id, "run-2");
  // Parcial e falha não assumem o posto.
  assert.equal(resolveLastKnownGoodRun([run("r", "partial"), run("s", "failed")]), null);
});

test("sync falho não destrói o catálogo confirmado", () => {
  const existing = [entry("/cremes"), entry("/cremes/para-o-rosto")];

  const falho = applyCatalogSync({ existing, observed: [], run: run("run-9", "failed") });
  assert.equal(falho.applied, false);
  assert.equal(falho.refusal, "RUN_NOT_PROMOTABLE");
  assert.deepEqual(falho.entries.map(item => item.normalizedUrl), ["/cremes", "/cremes/para-o-rosto"]);
  assert.equal(falho.entries.every(item => item.presenceState === "present"), true);
});

test("só sync completo infere ausência; parcial nunca marca missing", () => {
  const existing = [entry("/cremes"), entry("/antigo")];

  const completo = applyCatalogSync({ existing, observed: [observed("/cremes")], run: run("run-10", "completed") });
  assert.equal(completo.absenceInferred, true);
  assert.equal(completo.entries.find(item => item.normalizedUrl === "/antigo")?.presenceState, "missing");
  // Ausente vira missing e NÃO é removida.
  assert.equal(completo.entries.length, 2);

  const parcial = applyCatalogSync({ existing, observed: [observed("/cremes")], run: run("run-11", "partial") });
  assert.equal(parcial.absenceInferred, false);
  assert.equal(parcial.entries.find(item => item.normalizedUrl === "/antigo")?.presenceState, "present");
  assert.equal(runMayInferAbsence(run("run-11", "partial")), false);
});

test("dois syncs sucessivos preservam decisão humana e primeira observação", () => {
  const humana = entry("/cremes", { importStatus: "keywords_sent", ignoredAt: null, firstSeenRunId: "run-0" });

  const primeiro = applyCatalogSync({ existing: [humana], observed: [observed("/cremes")], run: run("run-1", "completed") });
  const segundo = applyCatalogSync({ existing: primeiro.entries, observed: [observed("/cremes")], run: run("run-2", "completed") });
  const final = segundo.entries[0];

  assert.equal(final.importStatus, "keywords_sent", "decisão humana sobrevive ao sync");
  assert.equal(final.firstSeenRunId, "run-0", "primeira observação nunca é reescrita");
  assert.equal(final.lastSeenRunId, "run-2");
});

test("transição de execução respeita o contrato existente", () => {
  assert.equal(canTransitionSyncRun("running", "completed").allowed, true);
  assert.equal(canTransitionSyncRun("running", "failed").allowed, true);
  assert.equal(canTransitionSyncRun("completed", "running").allowed, false);
  assert.equal(canTransitionSyncRun("failed", "completed").allowed, false);
});

test("divergência local × remoto é devolvida para decisão humana", () => {
  const comparacao = compareLocalAndRemoteCatalog({
    localNormalizedUrls: ["/cremes", "/so-local"],
    remoteNormalizedUrls: ["/cremes", "/so-remoto"],
  });

  assert.deepEqual(comparacao.localOnlyUrls, ["/so-local"]);
  assert.deepEqual(comparacao.remoteOnlyUrls, ["/so-remoto"]);
  assert.equal(comparacao.needsHumanDecision, true, "nada é promovido nem apagado sozinho");
});

test("o leitor remoto é isolado por Brand e não abre migration", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");

  // Toda consulta amarra a Brand do contexto autenticado.
  for (const table of ["brand_site_sitemaps", "brand_site_sync_runs", "brand_site_catalog_entries"]) {
    assert.ok(store.includes(table), `tabela ausente no repositório: ${table}`);
  }
  // Toda leitura de brand_site_* é escopada, e toda escrita carimba a Brand.
  const leituras = (store.match(/\.from\("brand_site_[a-z_]+"\)\.select/g) || []).length;
  const escopos = (store.match(/\.eq\("marca_id", context\.brandId\)/g) || []).length;
  assert.ok(escopos >= leituras, `${leituras} leituras para ${escopos} escopos de Brand`);
  const escritas = (store.match(/\.(insert|upsert)\(/g) || []).length;
  const carimbos = (store.match(/marca_id: context\.brandId/g) || []).length;
  assert.equal(carimbos, escritas, "toda escrita carimba a Brand do contexto");
  assert.doesNotMatch(store, /brandId\s*=\s*input|req\.|body\./, "brandId nunca vem do cliente");
  // Nenhuma tabela nova, nenhuma regra duplicada.
  const codigo = store.split("\n").filter(line => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  }).join("\n");
  assert.doesNotMatch(codigo, /CREATE TABLE|migration|ALTER TABLE/i);
  assert.match(store, /resolveLastKnownGoodRun/);
  assert.doesNotMatch(store, /localStorage|IndexedDB/);
});

test("cross-brand não atravessa o mapeamento", () => {
  const runs = [run("run-1", "completed"), { ...run("run-2", "completed"), brandId: OTHER }];
  const doBrand = runs.filter(item => item.brandId === BRAND);

  assert.equal(resolveLastKnownGoodRun(doBrand)?.id, "run-1");
});

/* ------------------------------ writer remoto ---------------------------- */

test("a ordem canônica do writer é start → upsert → finalize → readback", () => {
  const route = readFileSync("app/api/marca/site/sitemap/sync/route.ts", "utf8");

  const ordem = ["startBrandSiteSync(", "crawlAuthorizedSitemap(", "upsertObservedCatalog(", "finalizeBrandSiteSync(", "readBrandSiteSnapshot("];
  let cursor = -1;
  for (const passo of ordem) {
    const posicao = route.indexOf(passo);
    assert.ok(posicao > cursor, `fora de ordem: ${passo}`);
    cursor = posicao;
  }
  // A rota não devolve mais URLs transitórias como estado final.
  assert.match(route, /snapshot,/);
  assert.match(route, /source: "CANONICAL_REMOTE"/);
});

test("a identidade do upsert é a constraint declarada na migration", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");

  assert.match(store, /onConflict: "marca_id,normalized_url"/);
  // Nada de aproximação por título, slug ou caminho.
  assert.doesNotMatch(store, /onConflict: "[^"]*(title|slug|path)/);
});

test("o writer carimba a execução corrente e preserva o histórico humano", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");

  assert.match(store, /last_seen_run_id: input\.runId/);
  assert.match(store, /first_seen_at: entry\.firstSeenAt/);
  assert.match(store, /first_seen_run_id: entry\.firstSeenRunId/);
  assert.match(store, /import_status: entry\.importStatus/);
  assert.match(store, /ignored_at: entry\.ignoredAt/);
  // Ausência é conclusão da RPC; a ingestão só declara presença observada.
  assert.match(store, /presence_state: "present"/);
  assert.doesNotMatch(store, /presence_state: "missing"/);
});

test("a finalização não escolhe o status: ele sai do que foi persistido", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");

  assert.match(store, /resolveSyncOutcome\(\{/);
  assert.match(store, /buildFinalizeSyncArgs\(\{/);
  assert.match(store, /parseFinalizeSyncResult\(result\.data\)/);
  // Divergência de conjunto é falha, nunca correção silenciosa.
  assert.match(store, /classifyFinalizeSyncError/);
  assert.doesNotMatch(store, /status: "completed"/);
});

test("ingestão incompleta impede completed", () => {
  // Contrato puro: com observação persistida mas execução não íntegra, o
  // resultado honesto é `partial` — nunca `completed`, nunca `failed`.
  const parcial = resolveSyncOutcome({ persistedObservedUrls: ["/a"], crawlErrorCount: 0, ingestionComplete: false });
  assert.equal(parcial.status, "partial");
  assert.equal(parcial.promotesLastKnownGood, false);
  assert.equal(parcial.infersAbsence, false);

  const comErroDeColeta = resolveSyncOutcome({ persistedObservedUrls: ["/a"], crawlErrorCount: 2, ingestionComplete: true });
  assert.equal(comErroDeColeta.status, "partial");

  const integro = resolveSyncOutcome({ persistedObservedUrls: ["/a"], crawlErrorCount: 0, ingestionComplete: true });
  assert.equal(integro.status, "completed");
  assert.equal(integro.promotesLastKnownGood, true);
});

test("falha sem observação persistida termina em failed e não promove nada", () => {
  const semNada = resolveSyncOutcome({ persistedObservedUrls: [], crawlErrorCount: 3, ingestionComplete: false });

  assert.equal(semNada.status, "failed");
  assert.equal(semNada.promotesLastKnownGood, false);
  // E o writer nunca força `failed` quando já houve observação carimbada.
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");
  assert.match(store, /ingestionComplete: false/);
});

test("execução concorrente é recusada no start", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");

  assert.match(store, /\.eq\("status", "running"\)/);
  assert.match(store, /Já existe uma sincronização em andamento/);
  // Guarda no servidor, não mutex em React.
  assert.doesNotMatch(store, /useRef|useState/);
});

test("o runId é emitido pelo banco e nunca vem do cliente", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");
  const route = readFileSync("app/api/marca/site/sitemap/sync/route.ts", "utf8");

  assert.match(store, /\.insert\(\{[\s\S]*?status: "running"/);
  assert.doesNotMatch(store, /id: input\.runId,\s*marca_id/);
  // A rota não aceita runId no corpo.
  assert.doesNotMatch(route, /runId: z\./);
  assert.match(route, /runId = opened\.runId/);
});

test("a rota encerra a execução aberta quando algo falha", () => {
  const route = readFileSync("app/api/marca/site/sitemap/sync/route.ts", "utf8");

  assert.match(route, /failBrandSiteSync\(context, \{/);
  assert.match(route, /if \(runId && context\)/);
});

test("o writer não abre migration, RLS nem grant", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8").split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    }).join("\n");

  assert.doesNotMatch(store, /CREATE TABLE|ALTER TABLE|CREATE POLICY|GRANT /i);
  assert.doesNotMatch(store, /localStorage|IndexedDB/);
});

/* --------------------- verificação de página (remoto) -------------------- */

test("a verificação atualiza a linha existente pela identidade canônica", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");

  assert.match(store, /export async function applyPageVerifications/);
  // Mesma constraint do A2; nunca uma segunda entrada para a mesma página.
  assert.equal((store.match(/onConflict: "marca_id,normalized_url"/g) || []).length, 2);
  assert.match(store, /refused\.push\(observation\.normalizedUrl\)/, "página fora do catálogo é recusada, não inventada");
});

test("a verificação grava só fato observado e preserva decisão humana", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");
  const bloco = store.slice(store.indexOf("export async function applyPageVerifications"));

  for (const observado of ["title: observation.title", "h1: observation.h1", "page_type: observation.pageType", "verification_status: observation.verificationStatus", "last_verified_at: observation.verifiedAt"]) {
    assert.ok(bloco.includes(observado), `fato observado ausente: ${observado}`);
  }
  // Decisão humana e histórico de coleta atravessam intactos.
  for (const preservado of ["import_status: current.importStatus", "ignored_at: current.ignoredAt", "first_seen_at: current.firstSeenAt", "first_seen_run_id: current.firstSeenRunId", "presence_state: current.presenceState", "discovered_url: current.discoveredUrl"]) {
    assert.ok(bloco.includes(preservado), `campo preservado ausente: ${preservado}`);
  }
});

test("a fila de verificação prioriza o que ainda não foi resolvido", () => {
  const store = readFileSync("lib/server/marca-site-store.ts", "utf8");

  assert.match(store, /export function catalogEntriesPendingVerification/);
  assert.match(store, /entry\.verificationStatus === "discovered" \|\| entry\.verificationStatus === "stale"/);
  // Ausente do site não entra na fila.
  assert.match(store, /if \(entry\.presenceState !== "present"\) return false/);
});

test("o runtime de verificação tem concorrência limitada e isola falha", () => {
  const route = readFileSync("app/api/marca/site/page/verify/route.ts", "utf8");

  assert.match(route, /const CONCURRENCY = \d+/);
  assert.match(route, /runBounded\(targets, CONCURRENCY/);
  // Falha de uma página vira observação daquela página.
  assert.match(route, /verificationStatus: status/);
  assert.match(route, /pageType: "unknown"/);
  // Readback antes de declarar sucesso.
  assert.ok(route.indexOf("applyPageVerifications") < route.indexOf("readBrandSiteSnapshot(context);\n    return NextResponse.json"));
});

test("os três estados de canonical saem da página verificada, nunca do sitemap", () => {
  const route = readFileSync("app/api/marca/site/page/verify/route.ts", "utf8");

  assert.match(route, /"canonical_missing"/);
  assert.match(route, /"canonical_confirmed"/);
  assert.match(route, /"canonical_conflict"/);
  // O sync de sitemap continua sem inferir canonical.
  const sync = readFileSync("app/api/marca/site/sitemap/sync/route.ts", "utf8");
  assert.doesNotMatch(sync, /canonical_confirmed|canonical_missing|canonical_conflict/);
});

test("o painel declara o estado remoto sem apagar o local", () => {
  const panel = readFileSync("modules/marca/site-sitemap-panel.tsx", "utf8");

  assert.match(panel, /marca-site-remote-summary/);
  assert.match(panel, /compareLocalAndRemoteCatalog\(/);
  // Nada de merge silencioso nem limpeza cega do local.
  assert.doesNotMatch(panel, /clearBrandSiteWorkspace|localStorage\.removeItem/);
});
