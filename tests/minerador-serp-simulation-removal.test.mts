import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
const consolidation = panel.slice(
  panel.indexOf("function SemanticConsolidationPanel"),
  panel.indexOf("function HumanReviewPanel"),
);

test("a Qualificação Semântica não oferece mais a ação simulada de SERP", () => {
  assert.doesNotMatch(consolidation, /Validar na SERP/);
  assert.doesNotMatch(consolidation, /applyLocalSerpFixture/);
  assert.doesNotMatch(panel, /applyLocalSerpFixture/);
  assert.doesNotMatch(consolidation, /Prévia local · nenhuma chamada DataForSEO é executada/);
  assert.doesNotMatch(consolidation, /nenhuma chamada DataForSEO/);
});

test("o estado da SERP reflete a coleta real do processo Resultados", () => {
  assert.ok(consolidation.includes("serpCollectionLabel(serpState)"));
  assert.ok(consolidation.includes("SERP não coletada. Execute o processo Resultados"));
  assert.doesNotMatch(consolidation, /SERP · Ainda não coletada/);
  assert.doesNotMatch(consolidation, /Aguardando evidência externa/);
  assert.doesNotMatch(consolidation, /Ainda não validada/);
});

test("o painel não declara o KeywordDNA pronto para o handoff", () => {
  assert.match(consolidation, /PRÉVIA DO KEYWORDDNA/);
  assert.doesNotMatch(consolidation, /KEYWORDDNA A ENVIAR/);
  assert.match(consolidation, /Prévia local · ainda não persistida/);
  assert.doesNotMatch(consolidation, /KeywordDNA persistido/);
});

test("o accordion de evidências só existe quando há snapshot de SERP", () => {
  assert.match(consolidation, /\{draft\.serpSnapshotRef && <details data-semantic-consolidation-evidence/);
  assert.doesNotMatch(consolidation, /Nenhum snapshot de SERP nesta prévia/);
});

test("a Qualificação Semântica consome a evidência, mas nunca chama provider", () => {
  // A coleta vive no processo Resultados; o painel só lê a working copy.
  for (const forbidden of ["fetch(", "/api/"]) {
    assert.ok(!consolidation.includes(forbidden), `A Qualificação Semântica não pode chamar ${forbidden}.`);
  }
  assert.ok(!consolidation.includes("Analisar SERP"), "não existe botão próprio de SERP");
});
