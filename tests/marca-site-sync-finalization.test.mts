import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FINALIZE_SYNC_ERROR_CODES,
  canonicalObservedSetPayload,
  FINALIZE_SYNC_RPC,
  buildFinalizeSyncArgs,
  classifyFinalizeSyncError,
  parseFinalizeSyncResult,
  resolveSyncOutcome,
} from "../lib/marca/site-sync-finalization.ts";

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ACTOR = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";

const MIGRATION_PATH = "supabase/migrations/20260902130000_brand_site_sync_finalization_atomic.sql";
const migrationText = () => readFileSync(MIGRATION_PATH, "utf8").replace(/\s+/g, " ");
/** SQL sem linhas de comentário: usado quando a asserção não pode ser satisfeita por prosa. */
const executableSql = () => readFileSync(MIGRATION_PATH, "utf8")
  .split(/\r?\n/)
  .filter(line => !line.trim().startsWith("--"))
  .join("\n")
  .replace(/\s+/g, " ");

/* --------------------------- decisão do status --------------------------- */

test("coleta e ingestão íntegras produzem completed", () => {
  const outcome = resolveSyncOutcome({ persistedObservedUrls: ["marca.com/a", "marca.com/b"], crawlErrorCount: 0, ingestionComplete: true });

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.infersAbsence, true);
  assert.equal(outcome.promotesLastKnownGood, true);
});

test("observação válida com erro de coleta produz partial, nunca failed", () => {
  const comErro = resolveSyncOutcome({ persistedObservedUrls: ["marca.com/a"], crawlErrorCount: 2, ingestionComplete: true });
  assert.equal(comErro.status, "partial");
  assert.equal(comErro.infersAbsence, false);
  assert.equal(comErro.promotesLastKnownGood, false);

  const ingestaoIncompleta = resolveSyncOutcome({ persistedObservedUrls: ["marca.com/a"], crawlErrorCount: 0, ingestionComplete: false });
  assert.equal(ingestaoIncompleta.status, "partial", "material gravado nunca vira failed");
});

test("nada persistido com erro produz failed; sitemap vazio íntegro produz completed", () => {
  const falhou = resolveSyncOutcome({ persistedObservedUrls: [], crawlErrorCount: 1, ingestionComplete: false });
  assert.equal(falhou.status, "failed");
  assert.equal(falhou.infersAbsence, false);
  assert.equal(falhou.promotesLastKnownGood, false);

  const vazioIntegro = resolveSyncOutcome({ persistedObservedUrls: [], crawlErrorCount: 0, ingestionComplete: true });
  assert.equal(vazioIntegro.status, "completed", "sitemap sem URLs é resultado legítimo");
});

/* ---------------------------- argumentos da RPC -------------------------- */

const args = (overrides: Partial<Parameters<typeof buildFinalizeSyncArgs>[0]> = {}) => buildFinalizeSyncArgs({
  brandId: BRAND,
  actorUserId: ACTOR,
  runId: RUN,
  outcome: resolveSyncOutcome({ persistedObservedUrls: ["marca.com/b", "marca.com/a"], crawlErrorCount: 0, ingestionComplete: true }),
  persistedObservedUrls: ["marca.com/b", "marca.com/a", "marca.com/b"],
  foundCount: 2,
  newCount: 1,
  updatedCount: 1,
  durationMs: 1200,
  crawlErrorCount: 0,
  errorMessage: null,
  ...overrides,
});

test("os argumentos são determinísticos e sem missing_count", () => {
  const payload = args();

  assert.deepEqual(payload.p_observed_urls, ["marca.com/a", "marca.com/b"], "ordenado e sem duplicata");
  assert.equal(payload.p_status, "completed");
  assert.equal(payload.p_marca_id, BRAND);
  assert.equal(payload.p_run_id, RUN);
  // Quem conta ausência é o banco, dentro da transação.
  assert.equal("p_missing_count" in payload, false);
  assert.equal(payload.p_error_message, null);
});

test("failed não carrega observação e mensagem em branco vira ausência", () => {
  const payload = args({
    outcome: resolveSyncOutcome({ persistedObservedUrls: [], crawlErrorCount: 1, ingestionComplete: false }),
    persistedObservedUrls: [],
    crawlErrorCount: 1,
    errorMessage: "   ",
  });

  assert.equal(payload.p_status, "failed");
  assert.deepEqual(payload.p_observed_urls, []);
  assert.equal(payload.p_error_message, null);
});

test("contagens negativas ou fracionárias são normalizadas", () => {
  const payload = args({ foundCount: -3, newCount: 2.7, updatedCount: -0.2, durationMs: -1 });

  assert.equal(payload.p_found_count, 0);
  assert.equal(payload.p_new_count, 2);
  assert.equal(payload.p_updated_count, 0);
  assert.equal(payload.p_duration_ms, 0);
});

/* -------------------------------- readback ------------------------------- */

const HASH = "a".repeat(64);

const readback = (overrides: Record<string, unknown> = {}) => ({
  atomicity: "TRANSACTIONAL_RPC",
  idempotentReplay: false,
  status: "completed",
  observedCount: 2,
  observedSetHash: HASH,
  missingCount: 1,
  lastKnownGoodPromoted: true,
  isCurrentLastKnownGood: true,
  run: { id: RUN, status: "completed" },
  sitemap: { id: "sitemap-1", status: "synced" },
  ...overrides,
});

test("readback coerente é aceito; incoerente é recusado", () => {
  assert.equal(parseFinalizeSyncResult(readback()).missingCount, 1);
  assert.equal(parseFinalizeSyncResult(readback()).observedSetHash, HASH);

  assert.throws(
    () => parseFinalizeSyncResult(readback({ status: "partial", lastKnownGoodPromoted: true, isCurrentLastKnownGood: false, missingCount: 0 })),
    /promoção de last-known-good fora/,
  );
  assert.throws(
    () => parseFinalizeSyncResult(readback({ status: "partial", lastKnownGoodPromoted: false, isCurrentLastKnownGood: false, missingCount: 3 })),
    /ausência inferida fora/,
  );
  assert.throws(
    () => parseFinalizeSyncResult(readback({ status: "partial", lastKnownGoodPromoted: false, isCurrentLastKnownGood: true, missingCount: 0 })),
    /vigente sem ter promovido/,
  );
  assert.throws(() => parseFinalizeSyncResult({ ...readback(), atomicity: "SEQUENTIAL" }));
  assert.throws(() => parseFinalizeSyncResult({ ...readback(), observedSetHash: "curto" }));
});

test("replay depois de um sync mais novo separa evento histórico de estado corrente", () => {
  // A execução promoveu o LKG quando ocorreu — isso não deixa de ser verdade.
  // Mas outro sync assumiu o posto: o estado corrente é falso.
  const replay = parseFinalizeSyncResult(readback({
    idempotentReplay: true,
    status: "completed",
    lastKnownGoodPromoted: true,
    isCurrentLastKnownGood: false,
  }));

  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.lastKnownGoodPromoted, true, "evento histórico permanece verdadeiro");
  assert.equal(replay.isCurrentLastKnownGood, false, "estado corrente já avançou");
});

/* --------------------------- contrato do DDL ----------------------------- */

test("a função é chamada por RPC, com EXECUTE só para service_role", () => {
  const sql = migrationText();

  assert.equal(FINALIZE_SYNC_RPC, "finalize_brand_site_sync");
  assert.ok(sql.includes("CREATE FUNCTION public.finalize_brand_site_sync("));
  assert.ok(sql.includes("SECURITY INVOKER"));
  assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.finalize_brand_site_sync"));
  assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.finalize_brand_site_sync"));
  assert.ok(/GRANT EXECUTE[^;]*TO service_role/.test(sql));
  assert.ok(!/GRANT EXECUTE[^;]*TO (anon|authenticated)/.test(sql));
  // Autorização canônica dentro da função, como em persist_silo_pair_atomic.
  assert.ok(sql.includes("PERFORM public.canonical_assert_rpc_actor(p_actor_user_id)"));
  assert.ok(sql.includes("canonical_actor_can_use_brand_action(p_marca_id, p_actor_user_id, 'marca', 'manage')"));
});

test("a finalização trava run e depois sitemap, ambos da mesma Brand", () => {
  const sql = migrationText();

  assert.ok(sql.includes("WHERE id = p_run_id AND marca_id = p_marca_id FOR UPDATE"));
  assert.ok(sql.includes("WHERE id = v_run.sitemap_id AND marca_id = p_marca_id FOR UPDATE"));
  assert.ok(sql.includes("run not found for this Brand"));
  assert.ok(sql.includes("sitemap not found for this Brand"));
  // Ordem canônica: o lock do run precede o do sitemap.
  assert.ok(sql.indexOf("FROM public.brand_site_sync_runs WHERE id = p_run_id") < sql.indexOf("FROM public.brand_site_sitemaps WHERE id = v_run.sitemap_id"));
});

test("B/C/D · retry sobre execução terminal é idempotente, sem mutação", () => {
  const sql = migrationText();

  assert.ok(sql.includes("IF v_run.status <> 'running' THEN"));
  assert.ok(sql.includes("'idempotentReplay', true"));
  assert.ok(sql.includes("FINALIZATION_STATE_CONFLICT"));
  assert.ok(sql.includes("FINALIZATION_REPLAY_CONFLICT"));
  const replay = sql.slice(sql.indexOf("IF v_run.status <> 'running' THEN"), sql.indexOf("'idempotentReplay', true"));
  assert.ok(!replay.includes("UPDATE "), "o branch de replay não pode conter UPDATE");
  // `missing_count` não vem do caller e por isso não entra na comparação.
  assert.ok(!replay.includes("missing_count IS DISTINCT FROM"), "missing_count não é input comparável");
  for (const campo of ["observed_count", "observed_set_hash", "found_count", "new_count", "updated_count", "error_count", "duration_ms", "error_message"]) {
    assert.ok(replay.includes(`v_run.${campo} IS DISTINCT FROM`), `campo ausente na comparação de replay: ${campo}`);
  }
});

test("C · o replay NÃO consulta o catálogo — idempotência é durável, não temporal", () => {
  const sql = migrationText();
  const replay = sql.slice(sql.indexOf("IF v_run.status <> 'running' THEN"), sql.indexOf("'idempotentReplay', true"));

  // Depois que um run posterior reobserva as mesmas URLs, `last_seen_run_id`
  // deixa de apontar para o run antigo. Um replay legítimo não pode falhar por
  // isso — por isso a comparação usa o fingerprint gravado na própria execução.
  assert.ok(!replay.includes("brand_site_catalog_entries"), "replay não pode depender do catálogo");
  assert.ok(!replay.includes("last_seen_run_id"), "replay não pode depender de estado temporal");
  assert.ok(replay.includes("v_run.observed_set_hash IS DISTINCT FROM v_input_hash"));

  // A prova contra o catálogo existe só na PRIMEIRA finalização.
  const primeira = sql.slice(sql.indexOf("SELECT count(*) INTO v_db_observed_count"));
  assert.ok(primeira.includes("c.last_seen_run_id = p_run_id"));
});

test("F · o fingerprint é imutável depois da transição terminal", () => {
  const sql = migrationText();

  // Entra na allowlist do guard — logo só muda na única transição permitida.
  assert.ok(sql.includes("- 'observed_count' - 'observed_set_hash'"));
  assert.ok(sql.includes("terminal transition requires observed_set_hash"));
  // E o CHECK amarra presença do hash ao estado terminal.
  assert.ok(sql.includes("CONSTRAINT brand_site_sync_runs_fingerprint_coherent CHECK ( (status = 'running' AND observed_set_hash IS NULL) OR (status <> 'running' AND observed_set_hash IS NOT NULL) )"));
  // As proteções anteriores continuam.
  for (const protecao of ["append-only: delete refused", "terminal record cannot be changed", "terminal transition requires completed_at", "allows only completion fields to change"]) {
    assert.ok(sql.includes(protecao), `proteção removida do guard: ${protecao}`);
  }
});

test("o fingerprint é por BYTES, de núcleo, e cobre o conjunto vazio", () => {
  const sql = migrationText();

  assert.ok(sql.includes("CREATE FUNCTION public.brand_site_observed_set_fingerprint(p_urls text[])"));
  assert.ok(sql.includes("RETURNS TABLE (observed_count integer, observed_set_hash text)"));
  assert.ok(sql.includes("IMMUTABLE"));
  // 6 · Identidade em BYTEA: DISTINCT e ORDER BY sobre bytes, nunca sobre text.
  assert.ok(sql.includes("SELECT DISTINCT convert_to(t.u, 'UTF8') AS url_bytes"));
  assert.ok(sql.includes("string_agg(encode(c.url_bytes, 'hex'), ':' ORDER BY c.url_bytes)"));
  const executavel = executableSql();
  // Nem texto cru, nem hex, participam de igualdade ou ordenação.
  assert.ok(!executavel.includes("DISTINCT encode("), "DISTINCT não pode ser sobre text");
  assert.ok(!executavel.includes("ORDER BY c.encoded_url"), "ORDER BY não pode ser sobre text");
  assert.ok(!executavel.includes('COLLATE "C"'), "nenhuma collation participa da identidade");
  assert.ok(!executavel.includes("count(DISTINCT u)"));
  assert.ok(!executavel.includes("DISTINCT t.u"), "o texto cru não participa da identidade");
  // sha256(bytea) é função de núcleo desde a PG 11; nenhuma extensão é instalada.
  assert.ok(sql.includes("encode( sha256("));
  assert.ok(sql.includes("to_regprocedure('pg_catalog.sha256(bytea)') IS NULL"));
  assert.ok(!/CREATE EXTENSION|pgcrypto|digest\(/.test(executableSql()), "sem dependência de extensão");
  // Conjunto vazio tem representação canônica — nunca NULL.
  assert.ok(sql.includes("COALESCE(p_urls, ARRAY[]::text[])"));
});

test("A/B/C/D/F · propriedades da serialização canônica", () => {
  const payload = (urls: string[]) => canonicalObservedSetPayload(urls).payload;

  // A · o separador não pode aparecer dentro do elemento: hex resolve.
  assert.notEqual(payload(["a\nb", "c"]), payload(["a", "b\nc"]));
  assert.notEqual(payload(["a:b", "c"]), payload(["a", "b:c"]));
  // B · mesma coleção em ordem diferente → mesmo payload.
  assert.equal(payload(["marca.com/b", "marca.com/a"]), payload(["marca.com/a", "marca.com/b"]));
  // C · texto idêntico em bytes → mesmo payload, inclusive fora do ASCII.
  assert.equal(payload(["marca.com/ação"]), payload(["marca.com/ação"]));
  // ...e formas Unicode diferentes NÃO são o mesmo conjunto: bytes diferentes.
  assert.notEqual(payload(["marca.com/ação"]), payload(["marca.com/ação"]));
  // D · mesma quantidade, URLs diferentes → payload diferente.
  assert.notEqual(payload(["marca.com/a", "marca.com/b"]), payload(["marca.com/a", "marca.com/c"]));
  // F · conjunto vazio é determinístico e não é string vazia.
  assert.equal(payload([]), "0:");
  assert.equal(payload([]), payload([]));
  // O payload só contém hex e o separador.
  assert.match(payload(["marca.com/a", "marca.com/b"]), /^\d+(:[0-9a-f]+)*$/);
});

test("E · a guarda de duplicata usa a MESMA identidade do fingerprint", () => {
  const sql = migrationText();

  // Uma só definição devolve contagem e hash: não há como as duas regras divergirem.
  assert.ok(sql.includes("SELECT f.observed_count, f.observed_set_hash INTO v_input_distinct_count, v_input_hash FROM public.brand_site_observed_set_fingerprint(v_urls) AS f"));
  assert.ok(sql.includes("IF v_input_count <> v_input_distinct_count THEN"));
  assert.ok(sql.includes("OBSERVED_SET_MISMATCH: duplicate URL declared"));

  // E o espelho concorda: duplicata bytewise reduz a contagem.
  assert.equal(canonicalObservedSetPayload(["marca.com/a", "marca.com/a"]).count, 1);
  assert.equal(canonicalObservedSetPayload(["marca.com/a", "marca.com/A"]).count, 2, "caixa diferente é URL diferente");
});

test("a resposta separa evento histórico de estado corrente do last-known-good", () => {
  const sql = migrationText();

  assert.ok(sql.includes("'lastKnownGoodPromoted', v_run.status = 'completed'"));
  assert.ok(sql.includes("'isCurrentLastKnownGood', v_sitemap.last_successful_run_id = v_run.id"));
  // A versão anterior devolvia a promoção condicionada ao sitemap atual, o que
  // tornava a resposta historicamente contraditória num replay.
  assert.ok(!sql.includes("'lastKnownGoodPromoted', v_run.status = 'completed' AND v_sitemap.last_successful_run_id"));
});

test("o conjunto observado precisa ser IGUAL ao persistido, não apenas contido", () => {
  const sql = migrationText();

  assert.ok(sql.includes("OBSERVED_SET_INVALID_VALUE"));
  assert.ok(sql.includes("WHERE u IS NULL OR btrim(u) = ''"));
  assert.ok(sql.includes("INTO v_input_distinct_count, v_input_hash FROM public.brand_site_observed_set_fingerprint(v_urls)"));
  assert.ok(sql.includes("IF v_input_count <> v_input_distinct_count THEN"));
  // Três contagens: declarado, persistido pela execução e interseção.
  assert.ok(sql.includes("SELECT count(*) INTO v_db_observed_count"));
  assert.ok(sql.includes("SELECT count(*) INTO v_matched_count"));
  assert.ok(sql.includes("IF v_input_count <> v_db_observed_count OR v_input_count <> v_matched_count THEN"));
  assert.ok(sql.includes("OBSERVED_SET_MISMATCH: input=% db=% matched=%"));
  // p_found_count é metadado do run e não participa da prova de ingestão.
  // A checagem ignora comentários: só o SQL executável conta.
  const executavel = readFileSync(MIGRATION_PATH, "utf8")
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ");
  const prova = executavel.slice(
    executavel.indexOf("v_input_count := COALESCE"),
    executavel.indexOf("IF v_run.status <> 'running' THEN"),
  );
  assert.ok(prova.length > 0);
  assert.ok(!prova.includes("p_found_count"), "p_found_count não pode provar ingestão");
});

test("J/K · failed não aceita observação declarada nem persistida", () => {
  const sql = migrationText();

  assert.ok(sql.includes("IF p_status = 'failed' AND v_input_count > 0 THEN"));
  assert.ok(sql.includes("failed does not accept observed URLs"));
  assert.ok(sql.includes("IF p_status = 'failed' AND v_db_observed_count > 0 THEN"));
  assert.ok(sql.includes("use partial instead of failed"));
  // As duas guardas de failed precedem a comparação genérica, para dar a
  // mensagem que diz o que fazer em vez de só acusar diferença.
  assert.ok(sql.indexOf("use partial instead of failed") < sql.indexOf("OBSERVED_SET_MISMATCH: input=%"));
});

test("higiene e fingerprint do input precedem os dois branches", () => {
  const sql = migrationText();
  const posHigiene = sql.indexOf("OBSERVED_SET_INVALID_VALUE");
  const posDuplicata = sql.indexOf("OBSERVED_SET_MISMATCH: duplicate URL declared");
  const posHash = sql.indexOf("FROM public.brand_site_observed_set_fingerprint(v_urls) AS f");
  const posReplay = sql.indexOf("IF v_run.status <> 'running' THEN");
  const posPrimeira = sql.indexOf("SELECT count(*) INTO v_db_observed_count");

  assert.ok([posHigiene, posDuplicata, posHash, posReplay, posPrimeira].every(pos => pos > 0));
  // O replay também precisa descrever o mesmo resultado material: por isso a
  // higiene e o hash do input rodam antes de escolher o branch.
  assert.ok(posHigiene < posReplay && posDuplicata < posReplay && posHash < posReplay);
  // A prova contra o catálogo é exclusiva da primeira finalização.
  assert.ok(posReplay < posPrimeira, "a contagem no catálogo não pode rodar no replay");
});

test("os códigos de erro da RPC são classificáveis pelo chamador", () => {
  assert.equal(classifyFinalizeSyncError("OBSERVED_SET_MISMATCH: input=90 db=100 matched=90"), "OBSERVED_SET_MISMATCH");
  assert.equal(classifyFinalizeSyncError("FINALIZATION_STATE_CONFLICT: run is completed but partial was requested"), "FINALIZATION_STATE_CONFLICT");
  assert.equal(classifyFinalizeSyncError("FINALIZATION_REPLAY_CONFLICT: payload differs"), "FINALIZATION_REPLAY_CONFLICT");
  assert.equal(classifyFinalizeSyncError("OBSERVED_SET_INVALID_VALUE: null or empty"), "OBSERVED_SET_INVALID_VALUE");
  assert.equal(classifyFinalizeSyncError("timeout"), null);
  assert.equal(classifyFinalizeSyncError(null), null);

  const sql = migrationText();
  for (const code of FINALIZE_SYNC_ERROR_CODES) {
    assert.ok(sql.includes(code), `código ausente no DDL: ${code}`);
  }
});

test("replay de partial/failed nunca reporta promoção nem estado vigente", () => {
  const parcial = parseFinalizeSyncResult(readback({
    idempotentReplay: true,
    status: "partial",
    missingCount: 0,
    lastKnownGoodPromoted: false,
    isCurrentLastKnownGood: false,
  }));

  assert.equal(parcial.lastKnownGoodPromoted, false);
  assert.equal(parcial.isCurrentLastKnownGood, false);
});

test("ausência e last-known-good só existem em completed", () => {
  const sql = migrationText();

  assert.ok(sql.includes("IF p_status = 'completed' THEN UPDATE public.brand_site_catalog_entries"));
  assert.ok(sql.includes("SET presence_state = 'missing'"));
  // Escopo da ausência é o próprio sitemap: outro sitemap e origem manual ficam intactos.
  assert.ok(sql.includes("c.last_seen_run_id IS NOT NULL"));
  assert.ok(sql.includes("WHERE r.id = c.last_seen_run_id AND r.sitemap_id = v_run.sitemap_id"));
  assert.ok(sql.includes("last_successful_run_id = CASE WHEN p_status = 'completed' THEN p_run_id ELSE last_successful_run_id END"));
  // Nenhum DELETE em nenhum caminho.
  assert.ok(!/DELETE FROM public\.brand_site/.test(sql));
});

test("o run transiciona antes do sitemap, porque o guard de LKG exige completed", () => {
  const sql = migrationText();
  const posRun = sql.indexOf("UPDATE public.brand_site_sync_runs SET status = p_status");
  const posSitemap = sql.indexOf("UPDATE public.brand_site_sitemaps SET status = v_sitemap_status");

  assert.ok(posRun > 0 && posSitemap > 0);
  assert.ok(posRun < posSitemap, "ordem invertida quebraria brand_site_sitemaps_last_known_good_trg");
});

test("a coleta não entra no banco; o rollback restaura sem destruir histórico", () => {
  const executavel = executableSql();
  const sql = migrationText();

  // Nenhum acesso de rede a partir do Postgres.
  assert.ok(!/pg_net|dblink|COPY |http_get/i.test(executavel));
  // Esta migration acrescenta duas colunas e substitui um guard; ela NÃO cria
  // nem derruba tabela, policy, índice ou gatilho.
  assert.ok(!/CREATE TABLE|CREATE POLICY|CREATE INDEX|CREATE TRIGGER|DROP TABLE/.test(executavel));
  assert.ok(executavel.includes("ALTER TABLE public.brand_site_sync_runs ADD COLUMN observed_count"));
  assert.ok(executavel.includes("CREATE OR REPLACE FUNCTION public.brand_site_sync_run_guard()"));

  // Rollback: derruba o que foi acrescentado e RESTAURA o guard anterior.
  for (const passo of [
    "DROP FUNCTION IF EXISTS public.finalize_brand_site_sync",
    "DROP FUNCTION IF EXISTS public.brand_site_observed_set_fingerprint",
    "DROP CONSTRAINT IF EXISTS brand_site_sync_runs_fingerprint_coherent",
    "DROP COLUMN IF EXISTS observed_set_hash",
    "DROP COLUMN IF EXISTS observed_count",
    "CREATE OR REPLACE FUNCTION public.brand_site_sync_run_guard()",
  ]) {
    assert.ok(sql.includes(passo), `passo ausente no rollback: ${passo}`);
  }
  // As tabelas já existem no remoto: o rollback não pode derrubá-las.
  assert.ok(!sql.includes("DROP TABLE"), "nenhum histórico anterior é destruído");
});
