import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("background propaga requestId e termina erro, timeout, cancelamento e conclusão", async () => {
  const background = await readFile(new URL("../minerador-extensao/background.js", import.meta.url), "utf8");
  assert.match(background, /ALLINTITLE_ITEM_TIMEOUT_MS/);
  assert.match(background, /ALLINTITLE_TOTAL_TIMEOUT_MS/);
  assert.match(background, /withAllintitleTimeout/);
  assert.match(background, /terminalAllintitleResult/);
  assert.match(background, /requestId: state\.requestId/);
  assert.match(background, /type: 'batch_started', requestId: state\.requestId, batchId: state\.batchId, brandId: state\.brandId/);
  assert.match(background, /type: 'batch_completed', requestId: state\.requestId, batchId: state\.batchId, brandId: state\.brandId/);
  assert.match(background, /type: 'batch_cancelled', requestId: state\.requestId, batchId, brandId: state\.brandId/);
  assert.match(background, /typeof payload\?\.requestId !== 'string'/);
  assert.doesNotMatch(background, /requestId: typeof payload\.requestId === 'string' \? payload\.requestId : crypto\.randomUUID\(\)/);
  assert.match(background, /return \{ \.\.\.parsed, type: 'minerador\.allintitle\.result\.v1', batchId: state\.batchId, requestId: state\.requestId/);
  assert.match(background, /error\?\.stage === 'timeout'/);
  assert.match(background, /type: 'batch_completed', requestId: state\.requestId/);
  assert.match(background, /status, source: 'google_search_extension'/);
});

test("reader sempre devolve resposta estruturada e o bridge não deixa callback vazio pendente", async () => {
  const reader = await readFile(new URL("../minerador-extensao/allintitle-google-reader.js", import.meta.url), "utf8");
  const bridge = await readFile(new URL("../minerador-extensao/minerador-panel-bridge.js", import.meta.url), "utf8");
  assert.match(reader, /requestId: message\.requestId/);
  assert.match(reader, /status: "error"/);
  assert.match(reader, /reader_error/);
  assert.match(bridge, /bridge_empty_response/);
  assert.match(bridge, /bridge_unavailable/);
  assert.match(bridge, /\.\.\.response, requestId: detail\.requestId/);
  assert.doesNotMatch(bridge, /requestId: detail\.requestId, \.\.\.response/);
});

test("workspace encerra execução individual em erro, resposta ausente ou resposta divergente", async () => {
  const page = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.match(page, /response_missing/);
  assert.match(page, /response_missing_request_id/);
  assert.match(page, /request_mismatch/);
  assert.match(page, /keyword_mismatch/);
  assert.match(page, /bridge_error/);
  assert.match(page, /batch_completed/);
  assert.match(page, /retryAllintitleIds/);
  assert.match(page, /ALLINTITLE_TOTAL_TIMEOUT_MS \+ 5000/);
  assert.match(page, /closeAllintitleRun\(\)/);
  assert.match(page, /stale_response/);
  assert.match(page, /expectedBatchId/);
  assert.match(page, /actualBrandId/);
});

test("estados terminais não alteram o patch de métricas quando não são sucesso ou zero", async () => {
  const source = await readFile(new URL("../lib/minerador/allintitle.ts", import.meta.url), "utf8");
  assert.match(source, /"timeout"/);
  assert.match(source, /status === "success"/);
  assert.match(source, /status === "zero_results"/);
  assert.doesNotMatch(source, /status === "timeout".*results_allintitle/);
});
