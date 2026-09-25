import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProcessor() {
  return readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
}

test("bulk bar expõe área acessível de progresso para as etapas", async () => {
  const page = await readProcessor();
  const labels = [
    "Conferindo site...",
    "Processando lógica...",
    "Medindo volume...",
    "Medindo resultados...",
    "Aplicando revisão...",
  ];

  assert.match(page, /data-minerador-bulk-progress/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /role="progressbar"/);
  assert.match(page, /bulkProgressPercentage/);
  for (const label of labels) assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("progresso por item é alimentado pela Lógica e as demais etapas usam fallback indeterminado", async () => {
  const page = await readProcessor();

  assert.match(page, /updateBulkProgress\(index \+ 1, sourceKeywords\.length\)/);
  assert.match(page, /startBulkProgress\("site"/);
  assert.match(page, /startBulkProgress\("volume"/);
  assert.match(page, /startBulkProgress\("results"/);
  assert.match(page, /bulkProgressDisplayPercentage === null \? "—"/);
  assert.match(page, /motion-safe:animate-pulse/);
});

test("lock local impede concorrência, bloqueia os controles e destaca a etapa ativa", async () => {
  const page = await readProcessor();

  assert.match(page, /bulkProgressLockRef/);
  assert.match(page, /if \(bulkProgressLockRef\.current\) return false/);
  assert.match(page, /const bulkActionProcessing = bulkProgress\.status === "processing"/);
  for (const step of ["site", "logic", "volume", "results", "review"]) {
    assert.match(page, new RegExp(`bulkActionStateClass\\("${step}"\\)`));
  }
  assert.match(page, /disabled=\{bulkActionProcessing \|\| updating/);
});

test("feedback final distingue sucesso e falha e retorna ao estado idle", async () => {
  const page = await readProcessor();

  assert.match(page, /finishBulkProgress\("success"/);
  assert.match(page, /finishBulkProgress\(outcome\)/);
  assert.match(page, /bulkProgressDisplayPercentage = bulkProgress\.status === "success" \? 100/);
  assert.match(page, /bulkProgress\.status === "success" \? "Concluído" : "Falhou"/);
  assert.match(page, /setBulkProgress\(initialBulkProgressState\)/);
  assert.match(page, /}, 1800\)/);
});

// Atualizado em 2026-09-24 a pedido do dono: o andamento do lote passou a ser
// texto vivo ("Processando 5 de 30 · faltam 25"), legível. O cartão saiu dos
// 11px (abaixo do piso de 14px do sistema visual) para text-sm e ficou mais
// largo para caber a frase; continua no extremo direito do rodapé (o ml-auto
// foi para o invólucro que também leva Parar, Ver falhas e Fechar).
test("o layout mantém o feedback no extremo direito e prevê compressão responsiva", async () => {
  const page = await readProcessor();
  const progressStart = page.indexOf("data-minerador-bulk-progress");
  const wrapperStart = page.lastIndexOf("<div", page.lastIndexOf("<div", progressStart) - 1);
  const wrapper = page.slice(wrapperStart, progressStart);
  const progressBlock = page.slice(progressStart, progressStart + 2600);

  assert.ok(progressStart >= 0);
  assert.match(wrapper, /ml-auto flex min-w-0 shrink-0 items-center gap-1/);
  assert.match(progressBlock, /rounded border/);
  assert.match(progressBlock, /px-2 py-0\.5/);
  assert.match(progressBlock, /w-36/);
  assert.match(progressBlock, /sm:w-64/);
  assert.match(progressBlock, /lg:w-80/);
  assert.match(progressBlock, /truncate/);
  assert.match(progressBlock, /text-sm font-semibold leading-4/);
  assert.match(progressBlock, /text-sm leading-4 text-text-muted/);
  assert.doesNotMatch(progressBlock, /text-\[1[01]px\]/);
  assert.doesNotMatch(progressBlock, /hidden shrink-0 text-sm text-text-muted sm:inline/);
});
