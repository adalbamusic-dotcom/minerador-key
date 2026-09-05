import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveKeywordTableResponsiveWidths } from "../modules/minerador/keyword-table/use-keyword-table-responsive-widths.ts";

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const discovery = readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");

test("Resultados e Volume preservam o preset enquanto colunas secundárias cedem espaço", () => {
  const preferred = { keyword: 460, results: 128, volume: 120, kgr: 88, silo: 168 };
  const constraints = {
    keyword: { min: 240, flexible: true },
    results: { min: 115, priority: "protected" as const },
    volume: { min: 105, priority: "protected" as const },
    kgr: { min: 76 },
    silo: { min: 136, flexible: true },
  };
  // Enquanto as colunas secundárias têm folga, o preset protegido é mantido.
  const projected = resolveKeywordTableResponsiveWidths(preferred, constraints, 800);

  assert.equal(projected.results, preferred.results);
  assert.equal(projected.volume, preferred.volume);
  assert.ok(projected.keyword < preferred.keyword);
  assert.ok(projected.silo < preferred.silo);
});

test("colunas protegidas só cedem em último caso e nunca abaixo do próprio mínimo", () => {
  const preferred = { keyword: 460, results: 128, volume: 120, kgr: 88, silo: 168 };
  const constraints = {
    keyword: { min: 240, flexible: true },
    results: { min: 115, priority: "protected" as const },
    volume: { min: 105, priority: "protected" as const },
    kgr: { min: 76 },
    silo: { min: 136, flexible: true },
  };
  const projected = resolveKeywordTableResponsiveWidths(preferred, constraints, 600);

  assert.equal(projected.keyword, 240);
  assert.equal(projected.silo, 136);
  assert.equal(projected.kgr, 76);
  assert.ok(projected.results < preferred.results && projected.results >= 115);
  assert.ok(projected.volume <= preferred.volume && projected.volume >= 105);
});

test("as duas tabelas declaram preset protegido, mínimo e header sem quebra", () => {
  for (const source of [workspace, discovery]) {
    assert.match(source, /results: \{[^\n]*min: 104[^\n]*priority: "protected"/);
    assert.match(source, /volume: \{[^\n]*min: 96[^\n]*priority: "protected"/);
    assert.match(source, /whitespace-nowrap/);
  }
  // A largura mínima passou a ser derivada dos mínimos das colunas: a barra
  // horizontal só aparece quando nem os mínimos cabem na área disponível.
  assert.match(workspace, /minWidth: processorTableMinimumWidth/);
  assert.match(discovery, /minWidth: discoveryTableMinimumWidth/);
  assert.doesNotMatch(workspace, /min-w-\[\d+px\] table-fixed/);
  assert.doesNotMatch(discovery, /min-w-\[\d+px\]/);
});

test("o resize manual continua limitado pelos mínimos canônicos", () => {
  const resize = readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-resize.tsx", import.meta.url), "utf8");
  assert.match(resize, /constraints\.min \?\? 56/);
  assert.match(resize, /useKeywordTableColumnResize/);
});
