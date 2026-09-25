import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyBatchOutcomes,
  BATCH_NO_RESPONSE_REASON,
  BATCH_STOPPED_BY_USER_REASON,
  batchProgressPercent,
  chunkBatchItems,
  createBatchProgress,
  formatBatchFailures,
  formatBatchProgress,
  formatBatchProgressDetail,
  formatBatchSummary,
  reclassifyBatchItemsAsFailed,
  runProgressiveBatch,
  type BatchItemOutcome,
  type BatchProgressSnapshot,
} from "../lib/ui/batch-progress.ts";
import {
  NOTICE_AUTO_OPEN_PREVIEW,
  NOTICE_TOAST_ENABLED,
  noticeBadgeTone,
} from "../lib/visual-notice-contract.ts";

// Pedido do dono (2026-09-24): lote grande anda em blocos, não trava, conta
// cada item ("Processando 5 de 30 · faltam 25"), segue depois de falha e
// fecha com "Concluído: X ok, Y com falha"; o sino só marca, sem cards.

const ids = (count: number) => Array.from({ length: count }, (_, index) => `kw-${index + 1}`);
const ok = (chunk: readonly string[]): BatchItemOutcome[] => chunk.map(id => ({ id, status: "succeeded" }));
const noYield = async () => {};

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map(line => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
const noticeCenter = stripComments(readFileSync(new URL("../components/global-notice-center.tsx", import.meta.url), "utf8"));

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `trecho ${start} … ${end}`);
  return source.slice(from, to);
}

test("divide em blocos e conta cada item que volta, com o texto vivo", async () => {
  assert.deepEqual(chunkBatchItems(ids(12), 5).map(chunk => chunk.length), [5, 5, 2]);
  assert.deepEqual(chunkBatchItems(ids(2), 0).map(chunk => chunk.length), [1, 1], "bloco mínimo 1");

  const seen: BatchProgressSnapshot[] = [];
  const final = await runProgressiveBatch({
    label: "Resultados",
    items: ids(30),
    itemId: id => id,
    chunkSize: 5,
    runChunk: async chunk => ok(chunk),
    onProgress: snapshot => seen.push(snapshot),
    yieldToUi: noYield,
  });

  const texts = seen.map(formatBatchProgress);
  assert.equal(texts[0], "Processando 0 de 30 · faltam 30");
  assert.ok(texts.includes("Processando 5 de 30 · faltam 25"));
  assert.ok(texts.includes("Processando 25 de 30 · faltam 5"));
  const doneSeries = seen.filter(snapshot => snapshot.status === "running").map(snapshot => snapshot.done);
  assert.deepEqual([...new Set(doneSeries)], [0, 5, 10, 15, 20, 25, 30], "a barra avança bloco a bloco, não só no começo e no fim");
  assert.equal(final.status, "completed");
  assert.equal(formatBatchProgress(final), "Concluído: 30 ok, 0 com falha");
  assert.equal(batchProgressPercent(final), 100);
  assert.equal(final.remaining, 0);
  assert.equal(final.chunkCount, 6);
});

test("falha de um bloco é contada e o lote continua", async () => {
  const calls: number[] = [];
  const final = await runProgressiveBatch({
    label: "Volume",
    items: ids(30),
    itemId: id => id,
    chunkSize: 5,
    runChunk: async (chunk, context) => {
      calls.push(context.chunkIndex);
      if (context.chunkIndex === 1) throw new Error("Google Ads respondeu 500");
      return ok(chunk);
    },
    yieldToUi: noYield,
  });
  assert.deepEqual(calls, [0, 1, 2, 3, 4, 5], "nenhum bloco é pulado nem repetido");
  assert.equal(final.status, "partial");
  assert.equal(final.succeeded, 25);
  assert.equal(final.failed, 5);
  assert.deepEqual(final.failures.map(failure => failure.id), ["kw-6", "kw-7", "kw-8", "kw-9", "kw-10"]);
  assert.ok(final.failures.every(failure => failure.reason === "Google Ads respondeu 500"));
  assert.equal(formatBatchProgress(final), "Concluído: 25 ok, 5 com falha");
  assert.equal(formatBatchProgressDetail({ ...final, status: "running" }), "Volume · bloco 6 de 6 · 5 com falha");
  assert.equal(formatBatchProgressDetail({ ...createBatchProgress("KGR", 30, 30), chunksStarted: 7 }), "KGR", "bloco de um item não vira ruído");
});

test("resposta por item: sem resposta vira falha, id estranho e repetido não contam", async () => {
  const final = await runProgressiveBatch({
    label: "KGR",
    items: ["a", "b", "c"],
    itemId: id => id,
    chunkSize: 3,
    runChunk: async () => [
      { id: "a", status: "succeeded" },
      { id: "a", status: "failed", reason: "repetido" },
      { id: "zzz", status: "succeeded" },
      { id: "b", status: "empty", reason: "sem média oficial" },
    ],
    yieldToUi: noYield,
  });
  assert.equal(final.succeeded, 1);
  assert.equal(final.empty, 1);
  assert.equal(final.failed, 1);
  assert.equal(final.done, 3);
  assert.deepEqual(final.failures, [{ id: "c", reason: BATCH_NO_RESPONSE_REASON }]);
  assert.equal(formatBatchProgress(final), "Concluído: 2 ok (1 sem dado), 1 com falha");
});

test("falha que vale para o lote (cota, permissão) para antes do próximo bloco", async () => {
  const calls: number[] = [];
  const final = await runProgressiveBatch({
    label: "Volume",
    items: ids(20),
    itemId: id => id,
    chunkSize: 5,
    runChunk: async (chunk, context) => {
      calls.push(context.chunkIndex);
      if (context.chunkIndex === 1) return { outcomes: chunk.map(id => ({ id, status: "failed" as const, reason: "cota" })), stop: "O limite temporário da Google Ads API foi atingido." };
      return ok(chunk);
    },
    yieldToUi: noYield,
  });
  assert.deepEqual(calls, [0, 1]);
  assert.equal(final.status, "stopped");
  assert.equal(final.remaining, 10);
  assert.equal(formatBatchProgress(final), "Parado: 5 ok, 5 com falha, 10 não iniciadas · O limite temporário da Google Ads API foi atingido.");
});

test("Parar termina o bloco em curso e não começa outro; nada é desfeito", async () => {
  let stop: string | null = null;
  const calls: number[] = [];
  const final = await runProgressiveBatch({
    label: "Resultados",
    items: ids(15),
    itemId: id => id,
    chunkSize: 5,
    shouldStop: () => stop,
    runChunk: async (chunk, context) => {
      calls.push(context.chunkIndex);
      stop = BATCH_STOPPED_BY_USER_REASON;
      return ok(chunk);
    },
    yieldToUi: noYield,
  });
  assert.deepEqual(calls, [0]);
  assert.equal(final.succeeded, 5);
  assert.equal(final.status, "stopped");
  assert.match(formatBatchProgress(final), /^Parado: 5 ok, 0 com falha, 10 não iniciadas · Parado por você$/);
});

test("concorrência limitada e a vez devolvida à tela entre blocos", async () => {
  let inFlight = 0;
  let peak = 0;
  let yields = 0;
  const final = await runProgressiveBatch({
    label: "Vínculo",
    items: ids(12),
    itemId: id => id,
    chunkSize: 1,
    concurrency: 3,
    runChunk: async chunk => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 2));
      inFlight -= 1;
      return ok(chunk);
    },
    yieldToUi: async () => { yields += 1; },
  });
  assert.equal(peak, 3, "nunca mais que 3 ao mesmo tempo");
  assert.equal(yields, 12, "uma pausa para a tela depois de cada bloco");
  assert.equal(final.succeeded, 12);
});

test("lote vazio fecha na hora, sem bloco", async () => {
  let called = false;
  const final = await runProgressiveBatch({ label: "Lógica", items: [], itemId: (id: string) => id, chunkSize: 5, runChunk: async () => { called = true; return []; }, yieldToUi: noYield });
  assert.equal(called, false);
  assert.equal(final.status, "completed");
  assert.equal(formatBatchProgress(final), "Concluído: 0 ok, 0 com falha");
  assert.equal(batchProgressPercent(final), null);
});

test("conferência depois do lote move o não confirmado para falha, sem contar duas vezes", () => {
  let snapshot = createBatchProgress("KGR", 4, 4);
  snapshot = applyBatchOutcomes(snapshot, ["a", "b", "c", "d"], [
    { id: "a", status: "succeeded" },
    { id: "b", status: "succeeded" },
    { id: "c", status: "succeeded" },
    { id: "d", status: "failed", reason: "RLS" },
  ]);
  const closed = { ...snapshot, status: "completed" as const };
  const reclassified = reclassifyBatchItemsAsFailed(closed, ["b", "d", "b"], "gravado, mas o readback não confirmou");
  assert.equal(reclassified.succeeded, 2);
  assert.equal(reclassified.failed, 2);
  assert.equal(reclassified.status, "partial");
  assert.deepEqual(reclassified.failures.map(failure => failure.id), ["d", "b"]);
  assert.equal(reclassifyBatchItemsAsFailed(closed, [], "x"), closed);
});

test("resumo por contagens e lista de falhas com nome legível", () => {
  assert.equal(formatBatchSummary({ total: 30, succeeded: 28, failed: 2 }), "Concluído: 28 ok, 2 com falha");
  assert.equal(formatBatchSummary({ total: 10, succeeded: 4, failed: 6, stoppedReason: "Parado por você" }), "Parado: 4 ok, 6 com falha · Parado por você");
  assert.equal(formatBatchSummary({ total: 3, succeeded: 2, failed: 0, skipped: 1 }), "Concluído: 2 ok, 0 com falha, 1 pulada");
  const failures = { failures: [{ id: "kw-1", reason: "RLS" }, { id: "kw-2", reason: "timeout" }, { id: "kw-3", reason: "x" }] };
  assert.deepEqual(formatBatchFailures(failures, new Map([["kw-1", "tênis de corrida"]]), 2), ["tênis de corrida: RLS", "kw-2: timeout", "e mais 1 falha."]);
});

test("sino sem cards: aviso só marca o contador, e o erro não lido pinta o marcador", () => {
  assert.equal(NOTICE_AUTO_OPEN_PREVIEW, false);
  assert.equal(NOTICE_TOAST_ENABLED, false);
  assert.equal(noticeBadgeTone([]), "none");
  assert.equal(noticeBadgeTone([{ severity: "INFO", readState: "unread" }]), "accent");
  assert.equal(noticeBadgeTone([{ severity: "ERROR", readState: "read" }, { severity: "SUCCESS", readState: "unread" }]), "accent");
  assert.equal(noticeBadgeTone([{ severity: "SUCCESS", readState: "unread" }, { severity: "ERROR", readState: "unread" }]), "danger");

  const publish = between(noticeCenter, "const publishNotice = useCallback", "const markNoticeRead = useCallback");
  assert.match(publish, /setNotices\(\(current\) => \[record, \.\.\.current\]\)/, "o aviso continua indo para a lista do sino");
  assert.match(publish, /if \(NOTICE_AUTO_OPEN_PREVIEW\) setAutoOpenNotice\(record\);/);
  assert.match(publish, /if \(NOTICE_TOAST_ENABLED\) setToast\(/);
  assert.doesNotMatch(publish.replace(/if \(NOTICE_AUTO_OPEN_PREVIEW\) setAutoOpenNotice\(record\);/, ""), /setAutoOpenNotice\(/, "nenhuma abertura automática fora da constante");
  assert.match(noticeCenter, /const badgeTone = noticeBadgeTone\(notices\);/);
  assert.match(noticeCenter, /badgeTone === "danger" \? "bg-danger" : "bg-context-accent"/);
  assert.match(noticeCenter, /inclui erro/);
});

test("Processador: todas as ações em grupo passam pelo lote progressivo", () => {
  for (const [name, label] of [
    ["handleBatchVinculo", "Vínculo"],
    ["handleBatchKgrApplicability", "KGR"],
    ["handleBatchCompleteHumanReview", "Revisão"],
    ["handleBatchAllintitle", "Resultados"],
    ["handleBatchQualify", "Volume"],
    ["processLogicalKeywordDna", "Lógica"],
  ] as const) {
    const start = workspace.indexOf(`const ${name} = async`);
    assert.ok(start >= 0, name);
    const body = workspace.slice(start, workspace.indexOf("\n  };", start));
    assert.match(body, new RegExp(`runBulkBatch\\(\\{\\s*label: "${label}"`), `${name} usa o runner`);
    assert.doesNotMatch(body, /if \(error\) throw error;\s*persistedIds\.push/, `${name} não para na primeira falha`);
  }
  assert.doesNotMatch(workspace, /offset \+= 20/, "a gravação da Lógica não é mais um laço mudo de 20 em 20");

  const results = between(workspace, "const handleBatchAllintitle = async", "const handleBatchQualify = async");
  const volume = between(workspace, "const handleBatchQualify = async", "const handleBatchDelete = async");
  for (const [name, body, size] of [["Resultados", results, "RESULTS_BATCH_CHUNK_SIZE"], ["Volume", volume, "VOLUME_BATCH_CHUNK_SIZE"]] as const) {
    assert.match(body, new RegExp(`chunkSize: ${size},\\s*concurrency: 1,`), `${name}: rota paga, um bloco por vez`);
    assert.match(body, /body: JSON\.stringify\(\{ keywordIds: chunkIds, operationRequestId: chunkRequestId \}\)/, `${name}: cada bloco com o seu pedido`);
    assert.equal((body.match(/await fetch\(/g) || []).length, 1, `${name}: uma chamada por bloco, sem nova tentativa`);
    assert.match(body, /clearProcessAttempt\(keywordIds\.filter\(id => !touchedIds\.has\(id\)\)/, `${name}: não iniciada não fica "rodando"`);
  }
  assert.match(results, /keywordIds\.length > RESULTS_BATCH_MAX_TARGETS/, "o limite de 1.000 alvos continua valendo para o lote");
  assert.doesNotMatch(workspace, /Medindo resultados allintitle: |Consultando Google Ads\.\.\./, "o andamento não vai para o sino");
  assert.match(workspace, /const RESULTS_BATCH_MAX_TARGETS = 1000;/);
});

test("rodapé: texto vivo, Parar, lista de falhas e resumo que não some com falha", () => {
  // Atualizado pelo corretor (2026-09-24): no cartão estreito a primeira
  // linha é a curta ("5 de 30 · faltam 25"), para o "faltam N" nunca ser
  // cortado; o texto longo segue nos avisos do fim do lote.
  assert.match(workspace, /message: snapshot\.status === "running" \? formatBatchProgressCompact\(snapshot\) : "Conferindo a gravação…"/);
  assert.match(workspace, /shouldStop: \(\) => bulkStopRequestRef\.current/);
  assert.match(workspace, /onClick=\{requestBulkStop\}/);
  assert.match(workspace, />\s*Parar\s*</);
  assert.match(workspace, /Ver falhas \(\{bulkProgress\.failures\.length\}\)/);
  assert.match(workspace, /data-minerador-bulk-failures/);
  assert.match(workspace, /if \(failures && failures\.length > 0\) return;/, "com falha o resumo fica até o humano fechar");
  assert.match(workspace, /aria-label="Fechar o resumo do lote"/);
  const failuresPanel = between(workspace, "data-minerador-bulk-failures", "</ul>");
  assert.doesNotMatch(failuresPanel, /text-\[1[0-3]px\]|#[0-9a-f]{3,6}\b|slate-/i);
  assert.match(failuresPanel, /text-keyword/);
});
