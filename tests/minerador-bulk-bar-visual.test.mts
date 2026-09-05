import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readWorkspace() {
  return readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
}

async function readShell() {
  return readFile(new URL("../modules/minerador/keyword-table/keyword-table-bulk-bar-shell.tsx", import.meta.url), "utf8");
}

test("bulk bar preserva uma linha de 44px e usa tipografia normal", async () => {
  const [page, shell] = await Promise.all([readWorkspace(), readShell()]);
  const start = page.indexOf("{/* FOOTER BATCH ACTIONS BAR */}");
  const end = page.indexOf("</KeywordTableBulkBarShell>", start);
  const bulkBar = page.slice(start, end);
  const coreStart = bulkBar.indexOf("data-bulk-workflow-core");
  const coreEnd = bulkBar.indexOf("data-bulk-workflow-secondary", coreStart);
  const core = bulkBar.slice(coreStart, coreEnd);

  assert.match(shell, /h-11 min-h-11/);
  assert.match(shell, /flex-nowrap/);
  assert.match(shell, /overflow-hidden/);
  assert.match(bulkBar, /<KeywordTableBulkBarShell className="font-sans">/);
  assert.doesNotMatch(bulkBar, /font-mono/);
  assert.match(core, /text-sm font-medium/);
  assert.doesNotMatch(core, /font-semibold/);
  assert.doesNotMatch(bulkBar, /basis-full/);
});

test("bulk bar organiza contexto, workflow, secundárias, destrutivo e progresso", async () => {
  const page = await readWorkspace();
  const start = page.indexOf("{/* FOOTER BATCH ACTIONS BAR */}");
  const end = page.indexOf("</KeywordTableBulkBarShell>", start);
  const bulkBar = page.slice(start, end);
  const order = ["ariaLabel=\"Conferir site\"", "ariaLabel=\"Lógica\"", "ariaLabel=\"Volume\"", "ariaLabel=\"Resultados\"", "ariaLabel=\"IA\"", "ariaLabel=\"Revisar\"", "aria-label=\"Status\"", "aria-label=\"Mais ações\"", "aria-label=\"Excluir\""];
  let previous = -1;
  for (const label of order) {
    const current = bulkBar.indexOf(label);
    assert.ok(current > previous, `${label} deve seguir a sequência visual do workflow`);
    previous = current;
  }

  assert.match(bulkBar, /data-bulk-workflow-core/);
  assert.match(bulkBar, /data-bulk-workflow-secondary/);
  assert.match(bulkBar, /data-minerador-bulk-progress/);
  assert.match(bulkBar, /ml-auto min-w-0 w-28 shrink-0 rounded border px-2 py-0\.5 sm:w-44 lg:w-56/);
  assert.match(bulkBar, /BarChart3/);
  assert.match(bulkBar, /Search/);
  assert.match(bulkBar, /Sparkles/);
  assert.match(bulkBar, /Check/);
  assert.doesNotMatch(page, /data-minerador-qualification-results/);
  assert.doesNotMatch(page, /Resultado do processamento lógico/);
  assert.match(page, /data-minerador-bulk-progress/);
});

test("seleção controla a bulk bar sem renderizar resultado global persistente", async () => {
  const page = await readWorkspace();
  assert.doesNotMatch(page, /data-minerador-qualification-results/);
  assert.doesNotMatch(page, /Resultado do processamento lógico/);
  assert.match(page, /selectedIds\.size > 0 && \(/);
  assert.match(page, /<KeywordTableBulkBarShell className="font-sans">/);
  assert.match(page, /setQualificationResults/);
});
