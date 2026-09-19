import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Barra do Processador depois da remoção da IA (2026-09-18).
 *
 * O arquivo nasceu afirmando que o botão IA disparava o R5. Depois passou a
 * afirmar que disparava a Apresentação Contextual. Agora não existe botão de
 * IA: o Minerador tem seis processos e nenhum deles chama provider de IA.
 */

async function readProcessor() {
  return readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
}

async function readBulkBar() {
  const page = await readProcessor();
  const start = page.indexOf("{/* FOOTER BATCH ACTIONS BAR */}");
  const end = page.indexOf("{/* Excluir */}", start);
  assert.ok(start >= 0, "a barra de ações em lote precisa existir");
  assert.ok(end > start, "a barra precisa terminar antes de Excluir");
  return { page, bulkBar: page.slice(start, end) };
}

test("a barra tem seis processos e nenhum deles é IA", async () => {
  const { page, bulkBar } = await readBulkBar();
  assert.match(page, /\{selectedIds\.size > 0 && \(/);
  for (const label of ['label="Conferir site"', 'label="Lógica"', 'label="Volume"', 'label="Resultados"', 'label="Revisar"']) {
    assert.ok(bulkBar.includes(label), `${label} precisa continuar na barra`);
  }
  assert.ok(!bulkBar.includes('label="IA"'), "o botão IA saiu da barra");
  assert.ok(!bulkBar.includes('ariaLabel="IA"'));
  assert.match(bulkBar, /onClick=\{handleOpenHumanReview\}/);
});

test("a ordem inicial inclui Conferir site e depois Lógica, sempre determinística", async () => {
  const { page, bulkBar } = await readBulkBar();
  const order = [
    'label="Conferir site"',
    "onClick={handleQualifySelected}",
    "onClick={handleBatchQualify}",
    "onClick={handleBatchAllintitle}",
    'label="Revisar"',
    'aria-label="Status"',
  ];
  let previous = -1;
  for (const label of order) {
    const current = bulkBar.indexOf(label);
    assert.ok(current > previous, `${label} deve respeitar a ordem da barra`);
    previous = current;
  }
  assert.match(page, /Analisa a keyword de forma determinística[\s\S]{0,200}Não consulta APIs externas\./);
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

test("nenhum caminho de IA sobrevive no Processador", async () => {
  const page = await readProcessor();
  const dead = [
    "handleBatchSemanticReview",
    "handleBatchAnalyze",
    "readSemanticReviewResponse",
    "handleBatchContextualPresentation",
    "runContextualPresentation",
    "presentationBrief",
    "/api/process-intent-niche",
    "/api/analyze",
    "brief-apresentacao",
    "semantic-review",
    "keyword-contextual-presentation",
  ];
  for (const needle of dead) {
    assert.ok(!page.includes(needle), `"${needle}" deveria ter saído com a IA`);
  }
  // A mecânica de lote continua viva para os processos que sobraram.
  assert.match(page, /startBulkProgress\("results"/);
  assert.match(page, /finishBulkProgress\(/);
});
