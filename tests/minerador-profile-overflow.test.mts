import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { keywordTableMinimumWidth, resolveKeywordTableResponsiveWidths } from "../modules/minerador/keyword-table/use-keyword-table-responsive-widths.ts";

/**
 * Overflow horizontal da planilha.
 *
 * Medição real no browser (2026-08-29, container 1868px):
 *   sem Perfil ............................. scroll 1868 · sem barra
 *   Perfil expandido, conteúdo comum ....... scroll 1868 · sem barra
 *   Perfil + token técnico longo (nowrap) .. scroll 2035 · BARRA
 *   mesmo conteúdo com whitespace-normal ... scroll 1868 · sem barra
 *
 * Com `table-layout: fixed` o conteúdo comum não alarga a tabela; o que vaza é
 * string longa sem ponto de quebra herdando `white-space: nowrap` do <table>.
 * São exatamente os ids de versão/hashes que o Perfil passou a exibir.
 */

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

test("a célula do Perfil expandido reseta o nowrap herdado da tabela", () => {
  assert.match(workspace, /<table data-keyword-table="processor"[^>]*whitespace-nowrap/);
  const cell = workspace.slice(workspace.indexOf("<td id={`keyword-dna-"), workspace.indexOf("colSpan={15}") + 400);
  assert.ok(cell.includes("whitespace-normal"), "sem o reset, um id de versão longo alarga o scrollWidth");
  assert.ok(cell.includes("[overflow-wrap:anywhere]"), "tokens técnicos precisam de ponto de quebra");
  assert.ok(cell.includes("min-w-0") && cell.includes("max-w-full"));
});

test("a barra horizontal continua legítima quando as colunas realmente não cabem", () => {
  const constraints = { a: { min: 400 }, b: { min: 400 }, c: { min: 400 } };
  const preferred = { a: 600, b: 600, c: 600 };
  assert.equal(keywordTableMinimumWidth(constraints), 1200);
  // Espaço suficiente: nada encolhe.
  assert.deepEqual(resolveKeywordTableResponsiveWidths(preferred, constraints, 1800), preferred);
  // Espaço apertado: encolhe até o mínimo e a barra passa a ser necessária.
  const tight = resolveKeywordTableResponsiveWidths(preferred, constraints, 1000);
  assert.equal(Object.values(tight).reduce((total, value) => total + value, 0), 1200);
});

test("expandir e fechar o Perfil não altera largura, seleção nem scroll", () => {
  const rowBlock = workspace.slice(workspace.indexOf("aria-controls={`keyword-dna-"), workspace.indexOf("aria-controls={`keyword-dna-") + 700);
  // O toggle só muda a linha expandida.
  assert.ok(rowBlock.includes("setExpandedRowId(isExpanded ? null : item.id)"));
  for (const forbidden of ["scrollIntoView", "setSelectedIds", "scrollTo", "focus()"]) {
    assert.ok(!rowBlock.includes(forbidden), `expandir o Perfil não pode chamar ${forbidden}`);
  }
});
