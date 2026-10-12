import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * 2026-10-12 · pedido do dono: o CSV "Para escrever" de UM artigo traz no nome a
 * posição dele no Silo, o papel e o slug, para reconhecer o arquivo de relance.
 */

const { radarWritingExportBatchFilename } = await import("../lib/radar/portable-writing-export.ts");
const HOJE = "2026-10-12T12:00:00.000Z";

test("um artigo do Silo: posição com dois dígitos, papel e slug", () => {
  assert.equal(radarWritingExportBatchFilename({ articles: [{ slug: "qualificados", keyword: "leads qualificados", position: 1, role: "Pilar" }], today: HOJE }), "01-pilar-qualificados-para-escrever.csv");
  assert.equal(radarWritingExportBatchFilename({ articles: [{ slug: "como-atrair-um-cliente", keyword: "como atrair um cliente", position: 8, role: "Suporte" }], today: HOJE }), "08-suporte-como-atrair-um-cliente-para-escrever.csv");
  assert.equal(radarWritingExportBatchFilename({ articles: [{ slug: "x-y", keyword: null, position: 3, role: "Reforço narrativo" }], today: HOJE }), "03-reforco-narrativo-x-y-para-escrever.csv");
});

test("sem Silo, o nome de antes; vários artigos, o nome do lote de antes", () => {
  assert.equal(radarWritingExportBatchFilename({ articles: [{ slug: "como-atrair-um-cliente", keyword: "como atrair um cliente" }], today: HOJE }), "artigo-como-atrair-um-cliente-para-escrever.csv");
  assert.equal(radarWritingExportBatchFilename({ articles: [{ slug: "a", keyword: null, position: 1, role: "Pilar" }, { slug: "b", keyword: null, position: 2, role: "Suporte" }], today: HOJE }), "artigos-para-escrever-2026-10-12.csv");
});

test("o lote passa a posição e o papel do membro do Silo", () => {
  const fonte = readFileSync(new URL("../lib/radar/portable-writing-batch.ts", import.meta.url), "utf8");
  assert.match(fonte, /position: membro\?\.position \?\? null, role: membro\?\.role \?\? null/);
});
