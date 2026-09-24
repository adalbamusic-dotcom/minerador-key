import assert from "node:assert/strict";
import test from "node:test";
import { parseDiscoveryCsvRecords, parseDiscoveryCsvRows } from "../lib/minerador/discovery-sources.ts";

/**
 * ALIASES DA FRASE NO CSV DE ASSUNTOS (SDD 2026-09-24, F1.3 + F1b).
 *
 * Com `subjectColumns`, a coluna da frase também atende por "assunto",
 * "assuntos", "tema", "titulo" e "título", além de keyword/termo/query. Sem a
 * opção, o Descobrir fica idêntico: esses cabeçalhos continuam ignorados.
 */

const SUBJECT_HEADERS = ["assunto", "Assunto", "ASSUNTOS", "tema", "Tema", "titulo", "Título", "TÍTULO"];

test("com subjectColumns, cada alias novo vira a coluna da frase e conta como reconhecido", () => {
  for (const header of SUBJECT_HEADERS) {
    const parsed = parseDiscoveryCsvRecords([{ [header]: "SEO para clínicas", Nota: "Para donos de clínica" }], { subjectColumns: true });
    assert.equal(parsed.entries[0].keyword, "SEO para clínicas", header);
    assert.equal(parsed.entries[0].note, "Para donos de clínica", header);
    assert.ok(parsed.recognizedFields.includes(header), header);
    assert.deepEqual(parsed.ignoredFields, [], header);
  }
});

test("com subjectColumns, keyword/termo/query continuam valendo e vêm antes dos aliases novos", () => {
  for (const header of ["keyword", "Termo", "query"]) {
    const [entry] = parseDiscoveryCsvRecords([{ [header]: "frase" }], { subjectColumns: true }).entries;
    assert.equal(entry.keyword, "frase", header);
  }
  const both = parseDiscoveryCsvRecords([{ Tema: "tema da pauta", Keyword: "frase da keyword" }], { subjectColumns: true });
  assert.equal(both.entries[0].keyword, "frase da keyword");
  assert.deepEqual(both.ignoredFields, ["Tema"]);
});

test("'Assunto nota' continua sendo a nota, não a frase", () => {
  const parsed = parseDiscoveryCsvRecords([{ Assunto: "SEO para clínicas", "Assunto nota": "Para clínicas pequenas" }], { subjectColumns: true });
  assert.equal(parsed.entries[0].keyword, "SEO para clínicas");
  assert.equal(parsed.entries[0].note, "Para clínicas pequenas");
});

test("CSV rico com cabeçalho Assunto/Tema: linhas lidas pela coluna certa", () => {
  const parsed = parseDiscoveryCsvRows([
    ["Tema", "Nota", "Página"],
    ["SEO para clínicas", "Para donos de clínica", "https://exemplo.com.br/seo"],
    ["tráfego pago clínica estética", "", ""],
  ], { subjectColumns: true });
  assert.equal(parsed.rowCount, 2);
  assert.deepEqual(parsed.entries.map(entry => entry.keyword), ["SEO para clínicas", "tráfego pago clínica estética"]);
  assert.equal(parsed.entries[0].destinationUrl, "https://exemplo.com.br/seo");
});

test("lista de uma coluna: a primeira linha que é só o cabeçalho não vira frase", () => {
  for (const header of [...SUBJECT_HEADERS, "Keyword", "termo"]) {
    const parsed = parseDiscoveryCsvRows([[header], ["SEO para clínicas"], ["marketing para clínicas"]], { subjectColumns: true });
    assert.deepEqual(parsed.entries.map(entry => entry.keyword), ["SEO para clínicas", "marketing para clínicas"], header);
    assert.equal(parsed.rowCount, 2, header);
  }
  const bare = parseDiscoveryCsvRows([["SEO para clínicas"], ["marketing para clínicas"]], { subjectColumns: true });
  assert.deepEqual(bare.entries.map(entry => entry.keyword), ["SEO para clínicas", "marketing para clínicas"]);
});

test("sem subjectColumns, o Descobrir fica idêntico: os aliases novos são ignorados (deepEqual)", () => {
  const records = [{ Assunto: "SEO para clínicas", Tema: "t", "Título": "x" }];
  assert.deepEqual(parseDiscoveryCsvRecords(records), {
    entries: [{
      keyword: undefined,
      listaReference: undefined,
      location: undefined,
      intent: undefined,
      funnel: undefined,
      importedMetrics: { averageMonthlySearches: null, cpc: null, competition: null, competitionIndex: null, resultsAllintitle: null },
      recognizedFields: [],
      ignoredFields: ["Assunto", "Tema", "Título"],
    }],
    recognizedFields: [],
    ignoredFields: ["Assunto", "Tema", "Título"],
  });
  assert.deepEqual(parseDiscoveryCsvRecords(records), parseDiscoveryCsvRecords(records, {}));

  // Lista de uma coluna no Descobrir: "Tema" na primeira linha é tratado como dado, como sempre foi.
  assert.deepEqual(parseDiscoveryCsvRows([["Tema"], ["seo"]]), {
    entries: [{ keyword: "Tema", recognizedFields: ["Keyword"] }, { keyword: "seo", recognizedFields: ["Keyword"] }],
    recognizedFields: ["Keyword"],
    ignoredFields: [],
    rowCount: 2,
  });
  assert.deepEqual(parseDiscoveryCsvRows([["Keyword"], ["seo"]]), {
    entries: [{ keyword: "seo", recognizedFields: ["Keyword"] }],
    recognizedFields: ["Keyword"],
    ignoredFields: [],
    rowCount: 1,
  });

  const rich = [["Keyword", "Assunto", "Volume"], ["seo", "x", "1.200"]];
  assert.deepEqual(parseDiscoveryCsvRows(rich), parseDiscoveryCsvRows(rich, {}));
  const [entry] = parseDiscoveryCsvRows(rich).entries;
  assert.equal(entry.keyword, "seo");
  assert.equal(entry.importedMetrics?.averageMonthlySearches, 1200);
  assert.deepEqual(entry.ignoredFields, ["Assunto"]);
  assert.equal("note" in entry, false);
});
