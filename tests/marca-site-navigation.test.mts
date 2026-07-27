import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(brand)/[brandRef]/page.tsx", "utf8");
const entry = readFileSync("modules/marca/marca-page-entry.tsx", "utf8");
const panel = readFileSync("modules/marca/site-sitemap-panel.tsx", "utf8");

test("Marca Site usa URL como fonte da seção e preserva o painel de revisão", () => {
  assert.match(page, /painel\?: string/);
  assert.match(page, /initialPanel/);
  assert.match(entry, /buildTenantPath/);
  assert.match(entry, /secao=\$\{id\}/);
  assert.match(entry, /overflow-y-auto/);
  assert.match(panel, /router\.replace\(`\$\{marcaPath\}\?secao=site&painel=/);
  assert.match(panel, /initialPanel/);
});

test("revisão de importação exige seleções explícitas e separa conteúdo de keyword", () => {
  assert.match(panel, /id="revisao-importacao"/);
  assert.match(panel, /Keywords para o Minerador/);
  assert.match(panel, /Conteúdos publicados/);
  assert.match(panel, /contentSelection/);
  assert.match(panel, /setCandidateSelection\(new Set\(\)\)/);
  assert.match(panel, /Selecionar principais sugeridas/);
  assert.match(panel, /Selecionar somente novas/);
  assert.match(panel, /Registrar .*conteúdos como legados/);
  assert.match(panel, /type="button"/);
});

test("ações locais da aba não forçam reload nem refresh global", () => {
  assert.doesNotMatch(entry, /window\.location\.reload|router\.refresh/);
  assert.doesNotMatch(panel, /window\.location\.reload|router\.refresh/);
});
