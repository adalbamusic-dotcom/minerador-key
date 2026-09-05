import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readDiscoveryTable() {
  return readFile(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
}

test("bulk bar da Descoberta usa a ordem de triagem aprovada", async () => {
  const table = await readDiscoveryTable();
  const start = table.indexOf("data-discovery-bulk-context");
  const end = table.indexOf("data-discovery-bulk-clear", start);
  assert.ok(start >= 0 && end > start);
  const workflow = table.slice(start, end);

  const order = ["Atualizar métricas", "Medir resultados", "Enviar selecionadas ao Processador"];
  let previous = -1;
  for (const label of order) {
    const current = workflow.indexOf(label);
    assert.ok(current > previous, `${label} deve respeitar a ordem da Descoberta`);
    previous = current;
  }
  assert.match(table, /data-discovery-bulk-clear/);
  assert.match(table, /Limpar seleção/);
  assert.doesNotMatch(table, /Exportar/);
});

test("as medições continuam explícitas e o envio não exige evidência prévia", async () => {
  const table = await readDiscoveryTable();
  const importStart = table.indexOf("const importSelected = async () =>");
  const renderStart = table.indexOf("\n  return <section", importStart);
  assert.ok(importStart >= 0 && renderStart > importStart);
  const importLogic = table.slice(importStart, renderStart);

  assert.doesNotMatch(importLogic, /volumeMeasuring|allintitleMeasuring|resultsAllintitle|keywordDifficulty/);
  assert.match(table, /onClick=\{\(\) => void measureVolume\(\)\}/);
  assert.match(table, /onClick=\{\(\) => void measureAllintitle\(\)\}/);
  assert.match(table, /google-ads\/metricas-keywords/);
  assert.match(table, /dataforseo\/allintitle/);
  assert.match(table, /onClick=\{\(\) => void importSelected\(\)\} disabled=\{importing\}/);
});
