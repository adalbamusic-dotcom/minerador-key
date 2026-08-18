import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../modules/minerador/discovery/discovery-keywords-page.tsx", import.meta.url), "utf8");
const search = readFileSync(new URL("../modules/minerador/discovery/discovery-search-row.tsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../modules/minerador/minerador-section-tabs.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/editorial/operational-screen-shared.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-shell.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");

test("a página e os controles da Descoberta não ampliam o documento", () => {
  assert.match(page, /w-full min-w-0 max-w-\[1800px\].*overflow-x-clip/);
  assert.match(search, /section className="min-w-0 max-w-full/);
  assert.match(search, /grid min-w-0/);
  assert.doesNotMatch(search, /xl:grid-cols-\[minmax\(20rem/);
  assert.match(header, /max-w-full items-center justify-between gap-2 overflow-hidden/);
  assert.match(tabs, /sm:hidden/);
  assert.doesNotMatch(tabs, /overflow-x-auto/);
});

test("somente o shell da tabela da Descoberta recebe rolagem horizontal", () => {
  assert.match(shell, /scroll\?: "both" \| "x"/);
  assert.match(shell, /overflow-x-auto overflow-y-visible/);
  assert.match(table, /<KeywordTableShell scroll="x"/);
  assert.match(table, /min-w-\[1530px\]/);
});

test("Estados/UF usa popover ancorado e limitado à viewport", () => {
  assert.match(search, /useRef<HTMLButtonElement>/);
  assert.match(search, /statesPopoverOpen/);
  assert.match(search, /<AnchoredPopover open=\{statesPopoverOpen\}/);
  assert.match(search, /onClose=\{\(\) => setStatesPopoverOpen\(false\)\}/);
  assert.match(search, /max-h-\[min\(60vh,26rem\)\]/);
  assert.doesNotMatch(search, /<details/);
  assert.doesNotMatch(search, /absolute z-30/);
});
