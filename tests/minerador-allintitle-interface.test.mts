import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

test("uma keyword exige extensão disponível antes de criar execução allintitle", () => {
  const start = page.indexOf("const startAllintitleMeasurement");
  const end = page.indexOf("const handleCancelAllintitle", start);
  const handler = page.slice(start, end);
  assert.match(handler, /await confirmAllintitleExtensionConnection\(\)/);
  assert.match(handler, /const preflight = await confirmAllintitleExtensionConnection\(\)/);
  assert.match(handler, /if \(!preflight\.connected\)/);
  assert.match(handler, /preflight\.code/);
  assert.match(handler, /preflight\.diagnostic/);
  assert.match(handler, /setAllintitleMode\(items\.length === 1 \? "single" : "batch"\)/);
});

test("resultado individual persistível atualiza somente a keyword retornada e não abre painel", () => {
  const start = page.indexOf("const persistSingleAllintitleResult");
  const end = page.indexOf("useEffect(() =>", start);
  const handler = page.slice(start, end);
  assert.match(handler, /isPersistableAllintitleResult/);
  assert.match(handler, /selectedIds\.has\(item\.id\)/);
  assert.match(handler, /\.eq\("id", item\.id\)/);
  assert.match(handler, /setKeywords\(current => current\.map/);
  assert.equal(handler.includes("fetchData()"), false);
  assert.match(page, /allintitleMode === "batch" && allintitleBatchId/);
});

test("fluxo individual preserva retomada manual de CAPTCHA sem painel de lote", () => {
  assert.match(page, /allintitleMode === "single" && allintitleBatchId/);
  assert.match(page, /Allintitle pausado por CAPTCHA/);
  assert.match(page, /onClick=\{handleResumeAllintitle\}/);
});

test("lote múltiplo ainda mantém prévia e confirmação humana", () => {
  assert.match(page, /allintitleMode === "batch" && allintitleBatchId/);
  assert.match(page, /Confirmar resultados válidos/);
  assert.match(page, /allintitlePreview\.filter/);
});
