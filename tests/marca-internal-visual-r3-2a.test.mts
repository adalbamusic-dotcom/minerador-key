import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("R3.2A usa a fundação visual semântica na Visão geral", async () => {
  const page = await read("modules/marca/brand-page.tsx");
  const overview = page.slice(page.indexOf("function OperationalBrandHome"), page.indexOf("export function BrandPage"));

  assert.match(page, /const overviewSurface = .*border-divider/);
  assert.match(overview, /bg-surface-subtle/);
  assert.match(overview, /text-context-accent/);
  assert.match(overview, /bg-action-accent/);
  assert.match(overview, /text-success/);
  assert.doesNotMatch(overview, /purple|violet|indigo|fuchsia|lilac|lavender|border-white|bg-white|gradient/i);
});

test("R3.2A padroniza Site/Sitemap sem alterar seus contratos de interação", async () => {
  const [entry, panel] = await Promise.all([
    read("modules/marca/marca-page-entry.tsx"),
    read("modules/marca/site-sitemap-panel.tsx"),
  ]);

  for (const label of ["Conteúdos", "Keywords", "Importação e lotes"]) assert.match(panel, new RegExp(label));
  assert.match(panel, /border-divider/);
  assert.match(panel, /bg-surface-subtle/);
  assert.match(panel, /hover:border-module-accent/);
  assert.match(panel, /focus:border-module-accent/);
  assert.match(panel, /bg-warning-soft|bg-success-soft|bg-danger-soft/);
  assert.match(panel, /id="revisao-importacao"/);
  assert.match(panel, /router\.replace/);
  assert.match(entry, /onSave={saveSiteUrl}/);
  assert.match(entry, /Site e Sitemap/);
  assert.doesNotMatch(panel, /purple|violet|indigo|fuchsia|lilac|lavender|border-white|bg-white|gradient/i);
});
