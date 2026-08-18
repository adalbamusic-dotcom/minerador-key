import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProcessor() {
  return readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
}

test("ação de IA do Processador fica disponível diretamente na bulk bar", async () => {
  const page = await readProcessor();
  const bulkBarStart = page.indexOf("{/* FOOTER BATCH ACTIONS BAR */}");
  const bulkBarEnd = page.indexOf("{/* Excluir */}", bulkBarStart);
  const bulkBar = page.slice(bulkBarStart, bulkBarEnd);

  assert.ok(bulkBarStart >= 0);
  assert.ok(bulkBarEnd > bulkBarStart);
  assert.match(page, /\{selectedIds\.size > 0 && \(/);
  assert.match(bulkBar, /type="button"[\s\S]*onClick=\{handleBatchProcessIntentNiche\}/);
  assert.match(bulkBar, /Processar Nicho & Intenção/);
  assert.match(bulkBar, /disabled=\{updating \|\| queueProcessing \|\| dnaProcessing\}/);
  assert.equal((page.match(/onClick=\{handleBatchProcessIntentNiche\}/g) || []).length, 1);
});

test("Mais ações usa trigger de botão e menu funcional", async () => {
  const page = await readProcessor();
  const menuStart = page.indexOf('<div id="minerador-more-actions-menu"');
  const menu = page.slice(menuStart, page.indexOf("{/* Excluir */}", menuStart));

  assert.match(page, /<button[\s\S]*onClick=\{\(\) => setMoreActionsOpen\(current => !current\)\}[\s\S]*aria-expanded=\{moreActionsOpen\}/);
  assert.match(page, /aria-haspopup="menu"/);
  assert.ok(menuStart >= 0);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(page, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(page, /if \(event.key === "Escape"\) setMoreActionsOpen\(false\)/);
  assert.match(menu, /setMoreActionsOpen\(false\)/);
});

test("ação de IA preserva o handler, a rota interna e permite o runtime responder", async () => {
  const page = await readProcessor();
  assert.match(page, /const handleBatchProcessIntentNiche = async \(\) =>/);
  assert.match(page, /fetch\("\/api\/process-intent-niche",/);
  assert.match(page, /selectedIds\.size === 0\) return;/);
  assert.match(page, /setQueueProcessing\(true\)/);
  assert.match(page, /finally \{[\s\S]*setQueueProcessing\(false\)/);
});
