import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CanonicalSiteKeyError,
  brandCanonicalSiteKey,
  brandCanonicalSiteKeyFromSlug,
  canonicalSiteKey,
  canonicalSiteKeyOrNull,
  isBrandSiteHost,
  resolveBrandSiteOrigin,
  sameBrandSiteUrl,
} from "../lib/marca/site-canonical-url.ts";
import {
  CRAWLER_OBSERVED_CATALOG_FIELDS,
  HUMAN_PROTECTED_CATALOG_FIELDS,
  SiteCatalogEntryRecordSchema,
  SiteSyncRunRecordSchema,
  applyCatalogSync,
  canTransitionSyncRun,
  resolveNextLastSuccessfulRunId,
  runMayBecomeLastKnownGood,
  runMayInferAbsence,
  compareLocalAndRemoteCatalog,
  emptyBrandSiteSnapshot,
  resolveLastKnownGoodRun,
  runMayPromoteObservations,
  type ObservedSiteUrl,
  type SiteCatalogEntryRecord,
  type SiteSyncRunRecord,
} from "../lib/marca/site-persistence-contracts.ts";
import { reconcileSiteWithEditorialState } from "../lib/marca/site-publication-reconciliation.ts";
import { normalizeSiteUrl } from "../lib/marca/site-domain.ts";

const BRAND = "brand-1";
const SITE = "https://marca.com";
const T1 = "2026-09-01T10:00:00.000Z";
const T2 = "2026-09-02T10:00:00.000Z";

/* ------------------- identidade canônica de URL (§3/§6) ------------------ */

test("a barra final deixa de duplicar identidade — defeito que motivou a função", () => {
  assert.equal(canonicalSiteKey("https://marca.com/a"), canonicalSiteKey("https://marca.com/a/"));
  assert.equal(canonicalSiteKey("https://marca.com/a/"), "https://marca.com/a");
  // A função antiga continua divergindo: por isso ela não serve como chave.
  assert.notEqual(normalizeSiteUrl("https://marca.com/a"), normalizeSiteUrl("https://marca.com/a/"));
  assert.equal(canonicalSiteKey("https://marca.com"), "https://marca.com/");
  assert.equal(canonicalSiteKey("https://marca.com/"), "https://marca.com/");
});

test("a chave conservadora NÃO colapsa www nem protocolo sem contexto de Marca", () => {
  // Sem saber qual origem a Brand declara, tratar as duas como a mesma coisa
  // seria heurística: a equivalência de AUTORIZAÇÃO não prova identidade.
  assert.notEqual(canonicalSiteKey("https://www.marca.com/a"), canonicalSiteKey("https://marca.com/a"));
  assert.notEqual(canonicalSiteKey("http://marca.com/a"), canonicalSiteKey("https://marca.com/a"));
});

test("fragmento e porta padrão saem da chave; host é minúsculo", () => {
  assert.equal(canonicalSiteKey("https://marca.com/a#secao"), "https://marca.com/a");
  assert.equal(canonicalSiteKey("https://marca.com:443/a"), "https://marca.com/a");
  assert.equal(canonicalSiteKey("http://marca.com:80/a"), "http://marca.com/a");
  assert.equal(canonicalSiteKey("https://MARCA.com/a"), "https://marca.com/a");
  assert.equal(canonicalSiteKey("https://marca.com./a"), "https://marca.com/a");
});

test("query é preservada e ordenada; caixa do path e encoding intactos", () => {
  assert.equal(canonicalSiteKey("https://marca.com/a?b=1&c=2"), "https://marca.com/a?b=1&c=2");
  assert.equal(canonicalSiteKey("https://marca.com/a?c=2&b=1"), "https://marca.com/a?b=1&c=2");
  assert.notEqual(canonicalSiteKey("https://marca.com/a?b=1"), canonicalSiteKey("https://marca.com/a"));
  assert.notEqual(canonicalSiteKey("https://marca.com/A"), canonicalSiteKey("https://marca.com/a"));
  assert.equal(canonicalSiteKey("https://marca.com/Barreira-Cutanea"), "https://marca.com/Barreira-Cutanea");
  assert.equal(canonicalSiteKey("https://marca.com/a%20b"), "https://marca.com/a%20b");
});

test("entrada inválida é recusada e a variante tolerante devolve ausência", () => {
  assert.throws(() => canonicalSiteKey("ftp://marca.com/a"), CanonicalSiteKeyError);
  assert.throws(() => canonicalSiteKey("https://user:pass@marca.com/a"), CanonicalSiteKeyError);
  assert.throws(() => canonicalSiteKey(""), CanonicalSiteKeyError);
  assert.equal(canonicalSiteKeyOrNull(null), null);
  assert.equal(canonicalSiteKeyOrNull("ftp://marca.com"), null);
});

test("identidade editorial é ANCORADA em marcas.site_url, não numa regra global", () => {
  const origin = resolveBrandSiteOrigin(SITE)!;
  assert.deepEqual(origin, { protocol: "https:", host: "marca.com" });
  assert.equal(isBrandSiteHost("www.marca.com", origin), true);
  assert.equal(isBrandSiteHost("marca.com", origin), true);
  assert.equal(isBrandSiteHost("blog.marca.com", origin), false, "subdomínio é outra origem");
  assert.equal(isBrandSiteHost("outra.com", origin), false);

  // Ancorado na Brand, www/apex e http/https colapsam — e a chave usa o host
  // EXATAMENTE como a Brand o declarou.
  assert.equal(brandCanonicalSiteKey(SITE, "https://www.marca.com/a/"), "marca.com/a");
  assert.equal(brandCanonicalSiteKey(SITE, "http://marca.com/a"), "marca.com/a");
  assert.equal(brandCanonicalSiteKey("https://www.marca.com", "https://marca.com/a"), "www.marca.com/a");
  assert.equal(sameBrandSiteUrl(SITE, "https://marca.com/a/", "http://www.marca.com/a"), true);
  assert.equal(sameBrandSiteUrl(SITE, "https://marca.com/a", "https://marca.com/b"), false);
});

test("URL fora do site da Brand não recebe identidade e não entra no catálogo", () => {
  assert.equal(brandCanonicalSiteKey(SITE, "https://outra.com/a"), null);
  assert.equal(brandCanonicalSiteKey(SITE, "https://blog.marca.com/a"), null);
  // Sem site cadastrado não existe identidade editorial — nada é inventado.
  assert.equal(brandCanonicalSiteKey(null, "https://marca.com/a"), null);
  assert.equal(brandCanonicalSiteKey(SITE, "ftp://marca.com/a"), null);
  assert.equal(sameBrandSiteUrl(SITE, null, null), false, "ausência não é igualdade");
});

test("colisão de identidade fica contida na origem declarada pela Brand", () => {
  const chaves = [
    "https://marca.com/a", "https://marca.com/a/", "http://marca.com/a",
    "https://www.marca.com/a", "http://www.marca.com/a/",
  ].map(url => brandCanonicalSiteKey(SITE, url));

  assert.equal(new Set(chaves).size, 1, "as cinco formas da mesma página colapsam em uma chave");
  // E páginas diferentes continuam diferentes.
  assert.notEqual(brandCanonicalSiteKey(SITE, "https://marca.com/a"), brandCanonicalSiteKey(SITE, "https://marca.com/a?x=1"));
  assert.notEqual(brandCanonicalSiteKey(SITE, "https://marca.com/a"), brandCanonicalSiteKey(SITE, "https://marca.com/A"));
});

test("chave a partir de site + slug só existe com os dois lados", () => {
  assert.equal(brandCanonicalSiteKeyFromSlug(SITE, "barreira-cutanea"), "marca.com/barreira-cutanea");
  assert.equal(brandCanonicalSiteKeyFromSlug(SITE, "/barreira-cutanea/"), "marca.com/barreira-cutanea");
  assert.equal(brandCanonicalSiteKeyFromSlug(null, "x"), null);
  assert.equal(brandCanonicalSiteKeyFromSlug(SITE, null), null);
  assert.equal(brandCanonicalSiteKeyFromSlug(SITE, "/"), null);
});

/* ----------------------- catálogo, presença e LKG ------------------------ */

const run = (overrides: Partial<SiteSyncRunRecord> = {}): SiteSyncRunRecord => ({
  id: "run-1",
  brandId: BRAND,
  sitemapId: "sitemap-1",
  status: "completed",
  foundCount: 0,
  newCount: 0,
  updatedCount: 0,
  missingCount: 0,
  errorCount: 0,
  durationMs: 10,
  errorMessage: null,
  startedAt: T1,
  completedAt: T1,
  ...overrides,
});

const observed = (normalizedUrl: string): ObservedSiteUrl => ({
  normalizedUrl,
  discoveredUrl: `https://marca.com${normalizedUrl.replace("marca.com", "")}`,
  sourceSitemapId: "sitemap-1",
  sitemapLastmod: null,
});

const entry = (overrides: Partial<SiteCatalogEntryRecord> = {}): SiteCatalogEntryRecord =>
  SiteCatalogEntryRecordSchema.parse({
    id: "catalog:marca.com/a",
    brandId: BRAND,
    normalizedUrl: "marca.com/a",
    discoveredUrl: "https://marca.com/a",
    resolvedUrl: null,
    declaredCanonicalUrl: null,
    normalizedCanonicalUrl: null,
    title: null,
    h1: null,
    metaDescription: null,
    pageType: "unknown",
    indexability: "unknown",
    verificationStatus: "discovered",
    sourceSitemapId: "sitemap-1",
    sitemapLastmod: null,
    presenceState: "present",
    firstSeenAt: T1,
    firstSeenRunId: "run-1",
    lastSeenAt: T1,
    lastSeenRunId: "run-1",
    lastVerifiedAt: null,
    importStatus: "not_imported",
    origin: "sitemap",
    ignoredAt: null,
    ...overrides,
  });

test("sync válido registra primeira aparição e reobservação sem perder histórico", () => {
  const primeiro = applyCatalogSync({ existing: [entry()], observed: [observed("marca.com/a"), observed("marca.com/b")], run: run({ id: "run-2", completedAt: T2 }) });

  assert.equal(primeiro.applied, true);
  assert.equal(primeiro.summary.newCount, 1);
  assert.equal(primeiro.summary.updatedCount, 1);

  const reobservada = primeiro.entries.find(item => item.normalizedUrl === "marca.com/a")!;
  assert.equal(reobservada.firstSeenAt, T1, "primeira aparição nunca é reescrita");
  assert.equal(reobservada.firstSeenRunId, "run-1");
  assert.equal(reobservada.lastSeenAt, T2);
  assert.equal(reobservada.lastSeenRunId, "run-2");

  const nova = primeiro.entries.find(item => item.normalizedUrl === "marca.com/b")!;
  assert.equal(nova.firstSeenAt, T2);
  assert.equal(nova.firstSeenRunId, "run-2");
  assert.equal(nova.presenceState, "present");
});

test("URL ausente vira missing e NUNCA é apagada", () => {
  const resultado = applyCatalogSync({
    existing: [entry(), entry({ id: "catalog:marca.com/b", normalizedUrl: "marca.com/b", discoveredUrl: "https://marca.com/b" })],
    observed: [observed("marca.com/a")],
    run: run({ id: "run-2", completedAt: T2 }),
  });

  assert.equal(resultado.entries.length, 2, "nenhuma linha é removida");
  const ausente = resultado.entries.find(item => item.normalizedUrl === "marca.com/b")!;
  assert.equal(ausente.presenceState, "missing");
  assert.equal(ausente.lastSeenAt, T1, "lastSeen preserva quando foi vista pela última vez");
  assert.equal(ausente.lastSeenRunId, "run-1");
  assert.equal(resultado.summary.missingCount, 1);
});

test("sync que falha ou está em andamento não toca o catálogo", () => {
  const antes = [entry()];

  for (const status of ["failed", "running"] as const) {
    const recusado = applyCatalogSync({
      existing: antes,
      observed: [observed("marca.com/nova")],
      run: run({ id: "run-3", status, completedAt: status === "running" ? null : T2, errorMessage: status === "failed" ? "timeout" : null }),
    });
    assert.equal(recusado.applied, false, status);
    assert.equal(recusado.refusal, "RUN_NOT_PROMOTABLE", status);
    assert.equal(recusado.absenceInferred, false, status);
    assert.deepEqual(recusado.entries, antes, "estado válido não é substituído por vazio");
    assert.deepEqual(recusado.summary, { foundCount: 0, newCount: 0, updatedCount: 0, missingCount: 0 });
  }
});

test("política por estado: promover, inferir ausência e mover LKG são independentes", () => {
  const matriz = {
    completed: { promote: true, absence: true, lkg: true },
    partial: { promote: true, absence: false, lkg: false },
    failed: { promote: false, absence: false, lkg: false },
    running: { promote: false, absence: false, lkg: false },
  } as const;

  for (const [status, esperado] of Object.entries(matriz)) {
    const alvo = { status } as Pick<SiteSyncRunRecord, "status">;
    assert.equal(runMayPromoteObservations(alvo), esperado.promote, `promote/${status}`);
    assert.equal(runMayInferAbsence(alvo), esperado.absence, `absence/${status}`);
    assert.equal(runMayBecomeLastKnownGood(alvo), esperado.lkg, `lkg/${status}`);
  }
});

test("PARTIAL grava o que observou e NUNCA conclui ausência", () => {
  const existentes = [
    entry(),
    entry({ id: "catalog:marca.com/b", normalizedUrl: "marca.com/b", discoveredUrl: "https://marca.com/b" }),
  ];

  // Só /a foi observada; /b ficou de fora porque um sitemap falhou.
  const parcial = applyCatalogSync({
    existing: existentes,
    observed: [observed("marca.com/a"), observed("marca.com/nova")],
    run: run({ id: "run-parcial", status: "partial", completedAt: T2, errorCount: 1 }),
  });

  assert.equal(parcial.applied, true, "URL vista É prova de presença");
  assert.equal(parcial.absenceInferred, false);
  assert.equal(parcial.summary.newCount, 1, "parcial pode inserir URL nova");
  assert.equal(parcial.summary.updatedCount, 1, "e atualizar campos observados da que viu");
  assert.equal(parcial.summary.missingCount, 0);

  const ausente = parcial.entries.find(item => item.normalizedUrl === "marca.com/b")!;
  assert.equal(ausente.presenceState, "present", "não ter aparecido numa coleta incompleta não é sumiço");
  assert.equal(ausente.lastSeenAt, T1, "e o carimbo anterior permanece intacto");

  const vista = parcial.entries.find(item => item.normalizedUrl === "marca.com/a")!;
  assert.equal(vista.lastSeenRunId, "run-parcial");
  assert.equal(vista.lastSeenAt, T2);

  // E a parcial não vira last-known-good.
  assert.equal(resolveNextLastSuccessfulRunId("run-1", { id: "run-parcial", status: "partial" }), "run-1");
  assert.equal(resolveLastKnownGoodRun([run({ id: "run-1", status: "completed", completedAt: T1 }), run({ id: "run-parcial", status: "partial", completedAt: T2 })])?.id, "run-1");
});

test("last-known-good é a última execução válida, mesmo com falha posterior", () => {
  const runs = [
    run({ id: "run-1", status: "completed", completedAt: T1 }),
    run({ id: "run-2", status: "partial", completedAt: T2 }),
    run({ id: "run-3", status: "failed", completedAt: "2026-09-03T10:00:00.000Z" }),
  ];

  assert.equal(resolveLastKnownGoodRun(runs)?.id, "run-1", "parcial não vira last-known-good");
  assert.equal(resolveLastKnownGoodRun([run({ status: "failed" })]), null);
  assert.equal(resolveLastKnownGoodRun([]), null);
});

test("decisão humana sobre a URL sobrevive a qualquer sync", () => {
  const ignorada = entry({ importStatus: "ignored", ignoredAt: T1, origin: "manual" });

  const resultado = applyCatalogSync({ existing: [ignorada], observed: [observed("marca.com/a")], run: run({ id: "run-2", completedAt: T2 }) });

  const depois = resultado.entries[0];
  assert.equal(depois.importStatus, "ignored");
  assert.equal(depois.ignoredAt, T1);
  assert.equal(depois.origin, "manual");
});

test("Brand sem sync produz snapshot vazio e válido, sem coleta", () => {
  const snapshot = emptyBrandSiteSnapshot(BRAND, SITE);

  assert.deepEqual(snapshot.catalog, []);
  assert.equal(snapshot.lastSuccessfulRun, null);
  assert.equal(snapshot.freshness.neverSynced, true);
  assert.equal(snapshot.freshness.lastSyncedAt, null);
  assert.equal(snapshot.siteUrl, SITE);
});

/* ------------------ sync run: escrita e imutabilidade (§2) --------------- */

test("a execução nasce running e recebe UMA transição terminal", () => {
  assert.equal(canTransitionSyncRun("running", "completed").allowed, true);
  assert.equal(canTransitionSyncRun("running", "partial").allowed, true);
  assert.equal(canTransitionSyncRun("running", "failed").allowed, true);
  assert.equal(canTransitionSyncRun("running", "running").allowed, false);
  // Estado terminal nunca é reescrito, nem para outro terminal.
  assert.equal(canTransitionSyncRun("completed", "failed").allowed, false);
  assert.equal(canTransitionSyncRun("failed", "completed").allowed, false);
  assert.equal(canTransitionSyncRun("partial", "completed").allowed, false);
});

test("coerência de conclusão espelha o CHECK do banco", () => {
  assert.equal(SiteSyncRunRecordSchema.safeParse(run({ status: "running", completedAt: null })).success, true);
  assert.equal(SiteSyncRunRecordSchema.safeParse(run({ status: "running", completedAt: T2 })).success, false);
  assert.equal(SiteSyncRunRecordSchema.safeParse(run({ status: "completed", completedAt: null })).success, false);
  assert.equal(SiteSyncRunRecordSchema.safeParse(run({ status: "failed", completedAt: T2 })).success, true);
});

const MIGRATION_PATH = "supabase/migrations/20260902120000_brand_site_canonical_persistence.sql";
/** Espaços colapsados: o DDL é multilinha e a asserção não deve depender de layout. */
const migrationText = () => readFileSync(MIGRATION_PATH, "utf8").replace(/\s+/g, " ");

test("o guard de transição existe no DDL e o append-only incondicional não é usado", () => {
  const sql = migrationText();

  assert.ok(sql.includes("CREATE FUNCTION public.brand_site_sync_run_guard()"));
  assert.ok(sql.includes("brand_site_sync_runs_terminal_transition_trg"));
  assert.ok(sql.includes("append-only: delete refused"));
  assert.ok(sql.includes("terminal record cannot be changed"));
  // Reutilizar o append-only incondicional aqui tornaria a transição impossível.
  assert.ok(!sql.includes("BEFORE UPDATE OR DELETE ON public.brand_site_sync_runs FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only()"));
  // E service_role precisa de UPDATE só por causa dessa transição.
  assert.ok(sql.includes("GRANT SELECT, INSERT, UPDATE ON TABLE public.brand_site_sync_runs TO service_role"));
  // DELETE não é concedido a ninguém, em nenhuma das três tabelas.
  assert.ok(!/GRANT[^;]*DELETE[^;]*ON TABLE public\.brand_site/.test(sql));
});

test("o guard usa allowlist: campo fora da conclusão é bloqueado por padrão", () => {
  const sql = migrationText();

  assert.ok(sql.includes("allows only completion fields to change"));
  // Comparação por diferença de jsonb: coluna futura nasce congelada.
  assert.ok(/to_jsonb\(NEW\).{0,400}IS DISTINCT FROM.{0,400}to_jsonb\(OLD\)/.test(sql));
  for (const mutavel of ["status", "completed_at", "found_count", "new_count", "updated_count", "missing_count", "error_count", "duration_ms", "error_message"]) {
    assert.ok(sql.includes(`- '${mutavel}'`), `campo de conclusão ausente da allowlist: ${mutavel}`);
  }
  for (const congelado of ["id", "marca_id", "sitemap_id", "started_at", "created_by"]) {
    assert.ok(!sql.includes(`- '${congelado}'`), `campo de início não pode ser mutável: ${congelado}`);
  }
});

test("last_successful_run_id é amarrado à Brand E ao próprio sitemap", () => {
  const sql = migrationText();

  assert.ok(sql.includes("CONSTRAINT brand_site_sync_runs_sitemap_scope_unique UNIQUE (id, marca_id, sitemap_id)"));
  assert.ok(sql.includes("FOREIGN KEY (last_successful_run_id, marca_id, id) REFERENCES public.brand_site_sync_runs(id, marca_id, sitemap_id)"));
  // A versão de duas colunas deixaria um sitemap apontar para a execução de outro.
  assert.ok(!sql.includes("FOREIGN KEY (last_successful_run_id, marca_id) REFERENCES"));
});

test("last_successful_run_id exige execução COMPLETED, não só mesma Brand/sitemap", () => {
  const sql = migrationText();

  assert.ok(sql.includes("CREATE FUNCTION public.brand_site_sitemap_last_known_good_guard()"));
  assert.ok(sql.includes("BEFORE INSERT OR UPDATE OF last_successful_run_id ON public.brand_site_sitemaps"));
  assert.ok(sql.includes("requires a completed run"));
  // O guard compara com 'completed' e nada mais: partial, failed e running caem.
  assert.ok(sql.includes("IS DISTINCT FROM 'completed'"));
  // NULL é o estado legítimo de quem nunca teve coleta íntegra.
  assert.ok(sql.includes("IF NEW.last_successful_run_id IS NULL THEN"));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.brand_site_sitemap_last_known_good_guard()"));
});

test("o catálogo não materializa referência editorial genérica", () => {
  const sql = migrationText();

  assert.ok(!sql.includes("publication_ref"), "referência opaca não pode ser coluna");
  const contrato = readFileSync("lib/marca/site-persistence-contracts.ts", "utf8");
  assert.ok(!/publicationRef:/.test(contrato), "nem campo do registro persistido");
  // E a reconciliação continua funcionando pelos passos derivados.
  const derivado = reconcileSiteWithEditorialState({
    siteUrl: SITE,
    catalog: [{ entryId: "c-1", normalizedUrl: "marca.com/pagina", normalizedCanonicalUrl: null, publicationRef: null }],
    editorial: [{ editorialRef: "silo-1", kind: "silo_page", publishedUrl: "https://marca.com/pagina", canonical: null, slug: null }],
  });
  assert.equal(derivado.summary.matched, 1);
  assert.equal(derivado.entries[0].matchedBy, "published_url");
});

test("um sitemap não é pai de si mesmo", () => {
  const sql = migrationText();

  assert.ok(sql.includes("CONSTRAINT brand_site_sitemaps_parent_not_self CHECK ( parent_sitemap_id IS NULL OR parent_sitemap_id <> id )"));
});

test("toda referência interna carrega marca_id: cross-brand é erro de banco", () => {
  const sql = migrationText();

  for (const fk of [
    "FOREIGN KEY (parent_sitemap_id, marca_id) REFERENCES public.brand_site_sitemaps(id, marca_id)",
    "FOREIGN KEY (sitemap_id, marca_id) REFERENCES public.brand_site_sitemaps(id, marca_id)",
    "FOREIGN KEY (source_sitemap_id, marca_id) REFERENCES public.brand_site_sitemaps(id, marca_id)",
    "FOREIGN KEY (first_seen_run_id, marca_id) REFERENCES public.brand_site_sync_runs(id, marca_id)",
    "FOREIGN KEY (last_seen_run_id, marca_id) REFERENCES public.brand_site_sync_runs(id, marca_id)",
  ]) {
    assert.ok(sql.includes(fk), `FK sem amarração de tenant: ${fk}`);
  }
  // Nenhuma FK interna de coluna única sobrou.
  assert.ok(!sql.includes("REFERENCES public.brand_site_sitemaps(id)"));
  assert.ok(!sql.includes("REFERENCES public.brand_site_sync_runs(id)"));
});

test("o rollback documentado derruba a função, único objeto que sobrevive a DROP TABLE", () => {
  const sql = migrationText();

  assert.ok(sql.includes("DROP FUNCTION IF EXISTS public.brand_site_sync_run_guard();"));
  assert.ok(sql.includes("DROP FUNCTION IF EXISTS public.brand_site_sitemap_last_known_good_guard();"));
  for (const tabela of ["brand_site_catalog_entries", "brand_site_sync_runs", "brand_site_sitemaps"]) {
    assert.ok(sql.includes(`DROP TABLE IF EXISTS public.${tabela};`), tabela);
  }
  // O rollback não pode tocar em nada preexistente.
  for (const preexistente of ["marcas", "minerador_keywords", "publication_records", "editorial_artifact_versions", "pipeline_editorial_touch"]) {
    assert.ok(!new RegExp(`DROP [A-Z ]*${preexistente}`).test(sql), preexistente);
  }
});

test("execução falha não move o ponteiro de last-known-good", () => {
  assert.equal(resolveNextLastSuccessfulRunId("run-1", { id: "run-2", status: "failed" }), "run-1");
  assert.equal(resolveNextLastSuccessfulRunId(null, { id: "run-2", status: "failed" }), null);
  assert.equal(resolveNextLastSuccessfulRunId("run-1", { id: "run-2", status: "running" }), "run-1");
  assert.equal(resolveNextLastSuccessfulRunId("run-1", { id: "run-2", status: "completed" }), "run-2");
  assert.equal(resolveNextLastSuccessfulRunId("run-1", { id: "run-2", status: "partial" }), "run-1");
});

/* -------------- campos observados × campos humanos (§7) ------------------ */

test("nenhum campo humano é sobrescrito por sync; nenhum campo é esquecido", () => {
  const humano = entry({ importStatus: "ignored", ignoredAt: T1, origin: "manual" });

  const depois = applyCatalogSync({
    existing: [humano],
    observed: [observed("marca.com/a")],
    run: run({ id: "run-2", completedAt: T2 }),
  }).entries[0];

  for (const field of HUMAN_PROTECTED_CATALOG_FIELDS) {
    assert.deepEqual(depois[field], humano[field], `campo humano alterado: ${field}`);
  }
  // As duas listas cobrem o registro inteiro, sem sobreposição.
  const declarados = new Set<string>([...CRAWLER_OBSERVED_CATALOG_FIELDS, ...HUMAN_PROTECTED_CATALOG_FIELDS]);
  assert.equal(declarados.size, CRAWLER_OBSERVED_CATALOG_FIELDS.length + HUMAN_PROTECTED_CATALOG_FIELDS.length, "sem campo em duas listas");
  const estruturais = new Set(["id", "brandId", "normalizedUrl"]);
  for (const field of Object.keys(humano)) {
    assert.ok(declarados.has(field) || estruturais.has(field), `campo não classificado: ${field}`);
  }
});

/* ------------------------- reconciliação (§7) ---------------------------- */

test("ordem de correspondência: ref declarada, canonical, publishedUrl, site+slug", () => {
  const catalog = [
    { entryId: "c-ref", normalizedUrl: "marca.com/por-ref", normalizedCanonicalUrl: null, publicationRef: "pub-ref" },
    { entryId: "c-canon", normalizedUrl: "marca.com/por-canonical", normalizedCanonicalUrl: "marca.com/por-canonical", publicationRef: null },
    { entryId: "c-url", normalizedUrl: "marca.com/por-url", normalizedCanonicalUrl: null, publicationRef: null },
    { entryId: "c-slug", normalizedUrl: "marca.com/por-slug", normalizedCanonicalUrl: null, publicationRef: null },
  ];
  const editorial = [
    { editorialRef: "pub-ref", kind: "publication_record" as const, publishedUrl: null, canonical: null, slug: null },
    { editorialRef: "silo-1", kind: "silo_page" as const, publishedUrl: null, canonical: "https://marca.com/por-canonical/", slug: null },
    { editorialRef: "art-1", kind: "article_dna" as const, publishedUrl: "https://www.marca.com/por-url", canonical: null, slug: null },
    { editorialRef: "pub-2", kind: "publication_record" as const, publishedUrl: null, canonical: null, slug: "por-slug" },
  ];

  const resultado = reconcileSiteWithEditorialState({ siteUrl: SITE, catalog, editorial });
  const by = new Map(resultado.entries.map(item => [item.editorialRef, item]));

  assert.equal(by.get("pub-ref")?.matchedBy, "declared_ref");
  assert.equal(by.get("silo-1")?.matchedBy, "canonical");
  assert.equal(by.get("art-1")?.matchedBy, "published_url");
  assert.equal(by.get("pub-2")?.matchedBy, "site_url_slug");
  assert.equal(resultado.summary.matched, 4);
  assert.equal(resultado.summary.site_only, 0);
});

test("site_only, database_only e conflicting são achados, sem autocorreção", () => {
  const resultado = reconcileSiteWithEditorialState({
    siteUrl: SITE,
    catalog: [
      { entryId: "c-orfa", normalizedUrl: "marca.com/so-no-site", normalizedCanonicalUrl: null, publicationRef: null },
      { entryId: "c-conflito", normalizedUrl: "marca.com/conflito", normalizedCanonicalUrl: "outro.com/conflito", publicationRef: null },
    ],
    editorial: [
      { editorialRef: "pub-sem-url", kind: "publication_record", publishedUrl: null, canonical: null, slug: "so-no-banco" },
      { editorialRef: "silo-conflito", kind: "silo_page", publishedUrl: "https://marca.com/conflito", canonical: "https://marca.com/conflito", slug: null },
    ],
  });

  const by = new Map(resultado.entries.map(item => [item.editorialRef ?? item.catalogEntryId, item]));
  assert.equal(by.get("c-orfa")?.state, "site_only");
  assert.equal(by.get("pub-sem-url")?.state, "database_only");
  const conflito = by.get("silo-conflito")!;
  assert.equal(conflito.state, "conflicting");
  assert.equal(conflito.detail, "outro.com/conflito ≠ marca.com/conflito");
  assert.deepEqual(resultado.summary, { matched: 0, site_only: 1, database_only: 1, conflicting: 1 });
});

test("correspondência nunca é por substring", () => {
  const resultado = reconcileSiteWithEditorialState({
    siteUrl: SITE,
    catalog: [{ entryId: "c-1", normalizedUrl: "marca.com/barreira-cutanea-avancada", normalizedCanonicalUrl: null, publicationRef: null }],
    editorial: [{ editorialRef: "silo-1", kind: "silo_page", publishedUrl: "https://marca.com/barreira-cutanea", canonical: null, slug: null }],
  });

  assert.equal(resultado.summary.matched, 0);
  assert.equal(resultado.summary.site_only, 1);
  assert.equal(resultado.summary.database_only, 1);
});

/* --------------------- transição do estado local ------------------------- */

test("divergência local × remoto é reportada, nunca promovida", () => {
  const comparacao = compareLocalAndRemoteCatalog({
    localNormalizedUrls: ["marca.com/a", "marca.com/b"],
    remoteNormalizedUrls: ["marca.com/a", "marca.com/c"],
  });

  assert.equal(comparacao.code, "LOCAL_STATE_NEEDS_RECONCILIATION");
  assert.deepEqual(comparacao.localOnlyUrls, ["marca.com/b"]);
  assert.deepEqual(comparacao.remoteOnlyUrls, ["marca.com/c"]);
  assert.equal(comparacao.needsHumanDecision, true);

  const alinhado = compareLocalAndRemoteCatalog({ localNormalizedUrls: ["marca.com/a"], remoteNormalizedUrls: ["marca.com/a"] });
  assert.equal(alinhado.needsHumanDecision, false);
});

/* -------------------------- limites desta fase --------------------------- */

test("Fase 1 é domínio puro: sem banco, sem rede, sem crawler", () => {
  for (const file of [
    "lib/marca/site-canonical-url.ts",
    "lib/marca/site-persistence-contracts.ts",
    "lib/marca/site-publication-reconciliation.ts",
  ]) {
    const modulo = readFileSync(file, "utf8");
    assert.doesNotMatch(modulo, /fetch\(|supabase|crawlAuthorizedSitemap|node:dns/, file);
    assert.doesNotMatch(modulo, /CREATE TABLE|localStorage|indexedDB/i, file);
    assert.doesNotMatch(modulo, /localhost|care-glow/i, file);
  }
});
