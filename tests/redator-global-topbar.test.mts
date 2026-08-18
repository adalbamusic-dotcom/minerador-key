import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Redator registra a operação na GlobalTopbar e preserva a toolbar do editor", () => {
  const writer = readFileSync(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");

  assert.match(writer, /useGlobalTopbarControlsRegistration/);
  assert.match(writer, /moduleId: "redator"/);
  assert.match(writer, /data-redator-topbar-actions/);
  assert.match(writer, /useLocalHistory\("redator"/);
  assert.equal((writer.match(/useLocalHistory\("redator"/g) || []).length, 1, "o Redator mantém uma única pilha de histórico operacional");
  assert.doesNotMatch(writer, /topbarHistoryHandlersRef/);
  assert.match(writer, /<HistoryControls moduleId="redator" showHistory=\{false\} showUndoRedo=\{false\}/);
  assert.match(writer, /global-topbar-history/);

  assert.match(writer, /setImportOpen\(true\)/);
  assert.match(writer, /setFullscreen\(value => !value\)/);
  assert.match(writer, /href="\/publicacoes"/);
  assert.match(writer, /WorkflowStatusBadge status=\{selected\.status\}/);
  assert.match(writer, /wordCount} palavras/);

  assert.match(writer, /<Toolbar editor=\{editor\}/);
  assert.match(writer, /canUndo: \(\) => Boolean\(editor\?\.can\(\)\.chain\(\)\.undo\(\)\.run\(\)\)/);
  assert.match(writer, /canRedo: \(\) => Boolean\(editor\?\.can\(\)\.chain\(\)\.redo\(\)\.run\(\)\)/);
  assert.match(writer, /undo: \(\) => \{ editor\?\.chain\(\)\.focus\(\)\.undo\(\)\.run\(\); \}/);
  assert.match(writer, /redo: \(\) => \{ editor\?\.chain\(\)\.focus\(\)\.redo\(\)\.run\(\); \}/);
  assert.match(writer, /undoLabel: "Desfazer edição"/);
  assert.match(writer, /redoLabel: "Refazer edição"/);
  assert.match(writer, /historyLabel: "Histórico do documento"/);
  assert.doesNotMatch(writer, /action\("Desfazer", <Undo2/);
  assert.doesNotMatch(writer, /action\("Refazer", <Redo2/);
  assert.match(writer, /action\(`H\$\{level\}`/);
  assert.match(writer, /action\("Localizar", <Search/);

  assert.doesNotMatch(writer, /<header className="flex h-11/);
  assert.doesNotMatch(writer, /router\.(back|forward)\(|window\.history\.(back|forward)\(/);
});

test("Redator não registra uma busca de área na GlobalTopbar", () => {
  const writer = readFileSync(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  const registration = writer.slice(writer.indexOf("const globalTopbarControls ="), writer.indexOf("const globalTopbarControlsRef"));

  assert.doesNotMatch(registration, /\bsearch\s*:/);
  assert.doesNotMatch(registration, /history\.(undo|redo)\b/);
  assert.match(registration, /Importar do Planejador/);
  assert.match(registration, /Tela cheia/);
  assert.match(registration, /Publicações/);
});

test("GlobalTopbar permite semântica separada para edição e histórico operacional", () => {
  const topbar = readFileSync(new URL("../components/global-topbar.tsx", import.meta.url), "utf8");

  assert.match(topbar, /undoLabel\?: string/);
  assert.match(topbar, /redoLabel\?: string/);
  assert.match(topbar, /historyLabel\?: string/);
  assert.match(topbar, /undoTitle\?: string/);
  assert.match(topbar, /historyTitle\?: \(count: number\) => string/);
  assert.match(topbar, /aria-label=\{moduleControls\.history\.undoLabel \|\| "Desfazer"\}/);
  assert.match(topbar, /aria-label=\{moduleControls\.history\.historyLabel \|\| "Histórico"\}/);
});
