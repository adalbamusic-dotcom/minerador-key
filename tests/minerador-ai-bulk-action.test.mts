import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readProcessor() {
  return readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
}

test("IA e Revisar ficam disponíveis diretamente na bulk bar", async () => {
  const page = await readProcessor();
  const bulkBarStart = page.indexOf("{/* FOOTER BATCH ACTIONS BAR */}");
  const bulkBarEnd = page.indexOf("{/* Excluir */}", bulkBarStart);
  const bulkBar = page.slice(bulkBarStart, bulkBarEnd);

  assert.ok(bulkBarStart >= 0);
  assert.ok(bulkBarEnd > bulkBarStart);
  assert.match(page, /\{selectedIds\.size > 0 && \(/);
  assert.match(bulkBar, /type="button"[\s\S]*onClick=\{handleBatchSemanticReview\}/);
  assert.match(bulkBar, /aria-label="IA"/);
  assert.match(bulkBar, /<span className="hidden lg:inline">IA<\/span>/);
  assert.match(bulkBar, /onClick=\{handleOpenHumanReview\}/);
  assert.match(bulkBar, /disabled=\{bulkActionProcessing \|\| updating \|\| queueProcessing \|\| dnaProcessing\}/);
  assert.equal((page.match(/onClick=\{handleBatchSemanticReview\}/g) || []).length, 1);
});

test("a ordem inicial inclui Conferir site e depois Lógica sem usar IA na lógica", async () => {
  const page = await readProcessor();
  const bulkBarStart = page.indexOf("{/* FOOTER BATCH ACTIONS BAR */}");
  const bulkBarEnd = page.indexOf("{/* Excluir */}", bulkBarStart);
  const bulkBar = page.slice(bulkBarStart, bulkBarEnd);

  const order = ["Conferir site", "onClick={handleQualifySelected}", "onClick={handleBatchQualify}", "onClick={handleBatchAllintitle}", "aria-label=\"IA\"", "aria-label=\"Revisar\"", "aria-label=\"Status\""];
  let previous = -1;
  for (const label of order) {
    const current = bulkBar.indexOf(label);
    assert.ok(current > previous, `${label} deve respeitar a ordem R6`);
    previous = current;
  }
  assert.match(bulkBar, /onClick=\{handleQualifySelected\}/);
  assert.match(page, /Interpreta a identidade lógica da keyword sem usar IA ou APIs externas\./);
  assert.doesNotMatch(bulkBar, /fetch\("\/api\/process-intent-niche"/);
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
  assert.match(page, /const handleBatchSemanticReview = async \(\) =>/);
  assert.match(page, /fetch\("\/api\/process-intent-niche",/);
  assert.match(page, /mode: "semantic_review"/);
  assert.doesNotMatch(page.slice(page.indexOf("const handleBatchSemanticReview"), page.indexOf("const handleBatchSemanticReview") + 7000), /\/api\/analyze/);
  assert.match(page, /selectedIds\.size === 0\) return;/);
  assert.match(page, /setQueueProcessing\(true\)/);
  assert.match(page, /finally \{[\s\S]*setQueueProcessing\(false\)/);
});
