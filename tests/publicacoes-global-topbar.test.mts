import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Publicações usa a GlobalTopbar sem duplicar a barra operacional local", () => {
  const source = readFileSync(new URL("../modules/publicacoes/publications-workspace.tsx", import.meta.url), "utf8");

  assert.match(source, /OperationalDataGridTopbarApi/);
  assert.match(source, /GLOBAL_TOPBAR_ACTION_CONTROL/);
  assert.match(source, /topbar=\{\{ moduleId: "publicacoes"/);
  assert.match(source, /renderTopbarActions/);
  assert.match(source, /grid\.exportRows\(grid\.queriedRows, "planilha"\)/);
  assert.match(source, /grid\.toggleColumns/);
  assert.match(source, /grid\.setOrderMode/);
  assert.match(source, /grid\.setPageSize/);
  assert.match(source, /onClick=\{exportManifest\}/);
  assert.match(source, /Importar aprovados/);
  assert.match(source, /Biblioteca/);
  assert.match(source, /Fila/);
  assert.match(source, /Publicados/);
  assert.match(source, /Atualizações/);

  assert.match(source, /useLocalHistory\("publicacoes"/);
  assert.match(source, /<HistoryControls[^>]+moduleId="publicacoes" showHistory=\{false\} showUndoRedo=\{false\}/);
  assert.match(source, /global-topbar-history/);
  assert.match(source, /undoLabel: "Desfazer publicação"/);
  assert.match(source, /redoLabel: "Refazer publicação"/);
  assert.match(source, /historyLabel: "Histórico de Publicações"/);

  assert.doesNotMatch(source, /<OperationalDataGrid[^>]+title="Publicações"/);
  assert.doesNotMatch(source, /<OperationalDataGrid[^>]+description="Biblioteca/);
  assert.doesNotMatch(source, /<OperationalDataGrid[^>]+toolbar=\{/);
  assert.doesNotMatch(source, /const toolbar =/);
  assert.doesNotMatch(source, /router\.(back|forward)\(|window\.history\.(back|forward)\(/);
});

test("Publicações não cria estados paralelos para busca, histórico ou undo/redo", () => {
  const source = readFileSync(new URL("../modules/publicacoes/publications-workspace.tsx", import.meta.url), "utf8");

  assert.equal((source.match(/useLocalHistory\(/g) || []).length, 1);
  assert.equal((source.match(/useState\([^\n]*search/gi) || []).length, 0);
  assert.doesNotMatch(source, /setSearch|searchQuery/);
  assert.doesNotMatch(source, /useReducer\([^\n]*(undo|redo|history)/i);
});
