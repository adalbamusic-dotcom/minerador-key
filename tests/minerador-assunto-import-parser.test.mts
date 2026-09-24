import assert from "node:assert/strict";
import test from "node:test";
import { parseDiscoveryCsvRecords, parseDiscoveryCsvRows, parseManualKeywords, parseManualSubjects } from "../lib/minerador/discovery-sources.ts";

/**
 * IMPORT DE ASSUNTOS — PARSER (SDD 2026-09-24, F1.3).
 *
 * As colunas `nota` e `pagina` só existem para o import de Assunto. Sem a
 * opção, o parser devolve exatamente o que devolvia: o Descobrir continua igual.
 */

const RICH = [
  ["Keyword", "Nota", "Página destino", "Lista"],
  ["SEO para clínicas", "Para donos de clínica", "https://exemplo.com.br/seo-clinicas", "Clínicas"],
  ["tráfego pago clínica estética", "", "", ""],
];

test("com subjectColumns, nota e página entram na entrada e contam como reconhecidas", () => {
  const parsed = parseDiscoveryCsvRows(RICH, { subjectColumns: true });
  assert.equal(parsed.rowCount, 2);
  assert.equal(parsed.entries[0].keyword, "SEO para clínicas");
  assert.equal(parsed.entries[0].note, "Para donos de clínica");
  assert.equal(parsed.entries[0].destinationUrl, "https://exemplo.com.br/seo-clinicas");
  assert.equal(parsed.entries[0].listaReference, "Clínicas");
  assert.deepEqual(parsed.ignoredFields, []);
  assert.ok(parsed.recognizedFields.includes("Nota"));
  assert.ok(parsed.recognizedFields.includes("Página destino"));
});

test("todos os aliases da SDD são reconhecidos", () => {
  for (const header of ["nota", "Assunto nota", "para_quem", "PARA QUEM"]) {
    const [entry] = parseDiscoveryCsvRecords([{ keyword: "x", [header]: "n" }], { subjectColumns: true }).entries;
    assert.equal(entry.note, "n", header);
  }
  for (const header of ["pagina", "Página", "pagina destino", "destino", "Landing"]) {
    const [entry] = parseDiscoveryCsvRecords([{ keyword: "x", [header]: "https://a.com/p" }], { subjectColumns: true }).entries;
    assert.equal(entry.destinationUrl, "https://a.com/p", header);
  }
});

test("sem a opção (Descobrir e Keyword), a saída é a mesma de antes: nota e página são ignoradas", () => {
  const without = parseDiscoveryCsvRows(RICH);
  assert.deepEqual(without, parseDiscoveryCsvRows(RICH, {}));
  assert.deepEqual(without.ignoredFields.sort(), ["Nota", "Página destino"].sort());
  for (const entry of without.entries) {
    assert.equal("note" in entry, false);
    assert.equal("destinationUrl" in entry, false);
  }
});

test("CSV de uma coluna, só títulos, continua válido com e sem cabeçalho", () => {
  const headed = parseDiscoveryCsvRows([["Keyword"], ["SEO para clínicas"], ["marketing para clínicas"]], { subjectColumns: true });
  assert.deepEqual(headed.entries.map(entry => entry.keyword), ["SEO para clínicas", "marketing para clínicas"]);
  const bare = parseDiscoveryCsvRows([["SEO para clínicas"], ["marketing para clínicas"]], { subjectColumns: true });
  assert.deepEqual(bare.entries.map(entry => entry.keyword), ["SEO para clínicas", "marketing para clínicas"]);
  assert.equal(bare.entries[0].note, undefined);
});

test("lista colada de Assuntos: um por linha, vírgula faz parte da frase", () => {
  const entries = parseManualSubjects("SEO para clínicas, em São Paulo\n\n  estratégias de tráfego; 2026  \r\n");
  assert.deepEqual(entries.map(entry => entry.keyword), ["SEO para clínicas, em São Paulo", "  estratégias de tráfego; 2026  "]);
  // A lista de keywords do Descobrir continua separando por vírgula.
  assert.equal(parseManualKeywords("a, b; c").length, 3);
});
