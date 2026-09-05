import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isEditorialKeywordStatus, isLegacyPublishedStatus, resolveEditorialKeywordStatus } from "../lib/minerador/editorial-status.ts";

test("resolver aceita somente os estados editoriais ativos do Minerador", () => {
  assert.deepEqual(resolveEditorialKeywordStatus("bruto"), { kind: "resolved", status: "bruto", label: "Bruto", rawStatus: "bruto" });
  assert.deepEqual(resolveEditorialKeywordStatus("APROVADO"), { kind: "resolved", status: "aprovado", label: "Aprovado", rawStatus: "aprovado" });
  assert.deepEqual(resolveEditorialKeywordStatus("rejeitado"), { kind: "resolved", status: "rejeitado", label: "Rejeitado", rawStatus: "rejeitado" });
  assert.equal(resolveEditorialKeywordStatus(null).status, "bruto");
  assert.equal(isEditorialKeywordStatus("bruto"), true);
  assert.equal(isEditorialKeywordStatus("publicado"), false);
});

test("published/publicado legado fica sem estado editorial resolvido", () => {
  assert.equal(isLegacyPublishedStatus("publicado"), true);
  assert.equal(isLegacyPublishedStatus("published"), true);
  assert.equal(resolveEditorialKeywordStatus("publicado").kind, "legacyEditorialStatusUnresolved");
  assert.equal(resolveEditorialKeywordStatus("published").label, "Status a definir");
  assert.equal(resolveEditorialKeywordStatus("publicado").status, null);
});

test("renderer do Minerador não usa status legado como value nem oferece Published", async () => {
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const statusCell = workspace.slice(workspace.indexOf("{/* Status Dropdown */}"), workspace.indexOf("<KeywordTableRowResizeHandle", workspace.indexOf("{/* Status Dropdown */}")));
  assert.match(workspace, /resolveEditorialKeywordStatus\(item\.status\)/);
  assert.match(statusCell, /Status a definir/);
  assert.doesNotMatch(statusCell, /Publicado\s*<\/span>/);
  assert.doesNotMatch(statusCell, /value=\{item\.status/);
  assert.doesNotMatch(statusCell, /value="published"/);
  assert.doesNotMatch(statusCell, /value="publicado"/);
  assert.match(statusCell, /Escolher status/);
  assert.match(workspace, /payload\.status = requestedEditorialStatus/);
  assert.match(workspace, /select\("id,brand_id,status,analise_semantica"\)/);
});

test("painel expandido preserva status editorial real da publicação formal", async () => {
  const panel = await readFile(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  assert.match(panel, /const editorialStatus = resolveEditorialKeywordStatus\(keyword\.status\)/);
  assert.match(panel, /editorialStatus\.label/);
  assert.match(panel, /value=\{editorialStatus\.status \|\| "bruto"\}/);
  assert.match(panel, /Status a definir/);
});
