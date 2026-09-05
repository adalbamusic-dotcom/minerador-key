import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("keyword que virou Article não perde a membership do Silo", () => {
  const source = readFileSync("lib/arquiteto/canonical-bootstrap.ts", "utf8");
  const inicio = source.indexOf("const assignmentKeys");
  const linha = source.slice(inicio, source.indexOf(";", inicio));
  // O ArticleDNA não carrega membership: se ela não for preservada no overlay,
  // toda keyword materializada volta a parecer "sem Silo".
  for (const chave of ["territoryRef", "territoryAssignment", "articleFormationRef", "articleFormationDecision"]) {
    assert.ok(linha.includes(`"${chave}"`), `assignmentKeys precisa preservar ${chave}`);
  }
});

test("keyword que virou Article continua tendo endereço de escrita", () => {
  const source = readFileSync("lib/arquiteto/canonical-bootstrap.ts", "utf8");
  const inicio = source.indexOf("const assignmentKeys");
  const linha = source.slice(inicio, source.indexOf(";", inicio));
  /**
   * `canonicalWorkflow` carrega o id do item e o `lock_version`: é por ele que
   * toda decisão humana é gravada. Perdê-lo no overlay não deixava a mesa
   * "errada" — deixava a revisão IMPOSSÍVEL nos artigos já materializados,
   * porque mover, separar, juntar e trocar a Principal recusavam com "a
   * keyword não tem item canônico para receber a decisão".
   */
  assert.ok(linha.includes('"canonicalWorkflow"'), "assignmentKeys precisa preservar canonicalWorkflow");
});
