import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveArchitectDeepLink, sameStringSet } from "../lib/arquiteto/deep-link.ts";

const article = { id: "pub-k-principal", provisionalGroupId: "pub-b-artigo", clusterId: "cluster-1" };

test("deep-link encontra artigo publicado e produz a linha correta", () => {
  assert.deepEqual(resolveArchitectDeepLink([article], "pub-b-artigo", "brand-1", null), { requestKey: "brand-1:pub-b-artigo", articleRowId: "art-cluster-1" });
  assert.deepEqual(resolveArchitectDeepLink([article], "pub-k-principal", "brand-1", null)?.articleRowId, "art-cluster-1");
});

test("deep-link consumido não processa o mesmo ID novamente e ID ausente não atualiza estado", () => {
  assert.equal(resolveArchitectDeepLink([article], "pub-b-artigo", "brand-1", "brand-1:pub-b-artigo"), null);
  assert.equal(resolveArchitectDeepLink([article], "missing", "brand-1", null), null);
  assert.equal(resolveArchitectDeepLink([{ id: "no-cluster" }], "no-cluster", "brand-1", null), null);
});

test("comparação de Set evita setter quando expansão e seleção já estão corretas", () => {
  const current = new Set(["art-cluster-1"]);
  assert.equal(sameStringSet(current, ["art-cluster-1"]), true);
  assert.equal(sameStringSet(current, ["art-cluster-2"]), false);
  assert.equal(sameStringSet(new Set(["art-cluster-1", "other"]), ["art-cluster-1"]), false);
});

test("Radar mantém Abrir no próprio módulo e separa a navegação para o Arquiteto", () => {
  const source = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  assert.match(source, /Abrir no Radar/);
  assert.match(source, /Ver no Arquiteto/);
  assert.doesNotMatch(source, /<Link className=\{btn\} href=\{`\/arquiteto\?articleId=\$\{row\.articleId\}`\}>Abrir<\/Link>/);
});

test("Radar usa a GlobalTopbar sem duplicar busca, histórico ou estado de grid", () => {
  const source = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../components/editorial/operational-data-grid.tsx", import.meta.url), "utf8");
  assert.match(source, /topbar=\{\{ moduleId: "radar"/);
  assert.match(source, /renderTopbarActions/);
  assert.match(source, /GLOBAL_TOPBAR_ACTION_CONTROL/);
  assert.match(source, /grid\.setFilter/);
  assert.match(source, /grid\.exportRows\(grid\.queriedRows, "planilha"\)/);
  assert.match(source, /grid\.toggleColumns/);
  assert.match(source, /grid\.setOrderMode/);
  assert.match(source, /grid\.setPageSize/);
  assert.match(source, /<HistoryControls[^>]+moduleId="radar" showHistory=\{false\} showUndoRedo=\{false\}/);
  assert.doesNotMatch(source, /<OperationalDataGrid[^>]+toolbar=\{/);
  assert.doesNotMatch(source, /router\.(back|forward)\(|window\.history\.(back|forward)\(/);
  assert.match(grid, /topbar\?: OperationalDataGridTopbar/);
  assert.match(grid, /search: \{ getValue: \(\) => search, setValue: setSearch \}/);
  assert.match(grid, /data-operational-topbar-actions/);
  assert.match(grid, /overflow-x-auto xl:overflow-visible/);
});

test("pagina propria do Radar declara cinco areas e navega por articleId", () => {
  const page = readFileSync(new URL("../modules/radar/radar-analysis-page.tsx", import.meta.url), "utf8");
  assert.match(page, /const tabs: RadarTab\[\] = \["resumo", "selecionar-referencias", "analise-amostra", "relatorio", "historico"\]/);
  assert.match(page, /const tab: Tab = resolveRadarTab\(requestedTab\)/);
  assert.match(page, /Selecionar referências/);
  assert.match(page, /Análise da amostra/);
  assert.match(page, /Relatório/);
  assert.match(page, /\/api\/editorial\/radar-analysis\/extract/);
  assert.match(page, /site_url.*article\.payload\.canonical/);
  assert.match(page, /tab === "selecionar-referencias" && renderSelection\(\)/);
  assert.match(page, /tab === "analise-amostra" && renderSample\(\)/);
  assert.match(page, /tab === "relatorio" && renderReport\(\)/);
  assert.match(page, /tab === "resumo" && renderFlowProgress\(\)/);
  assert.doesNotMatch(page, /\n\s*\{renderFlowProgress\(\)\}/);
  assert.match(page, /Analisar referências selecionadas/);
  assert.doesNotMatch(page, /Analisar esta página/);
  assert.doesNotMatch(page, /adalbapro\.com\.br/);
});

test("listas de semântica e entidades usam chaves únicas quando os valores se repetem", () => {
  const page = readFileSync(new URL("../modules/radar/radar-analysis-page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /frequentEntities\.map\(entity =>/);
  assert.doesNotMatch(page, /semanticTerms\.map\(term =>/);
  assert.match(page, /frequentEntities\.map\(\(entity, index\) =>[\s\S]*key=\{`\$\{entity\}:\$\{index\}`\}/);
  assert.match(page, /semanticPresentation\.relevant\.map\(\(term, index\) =>[\s\S]*key=\{`\$\{term\.term\}:\$\{term\.pageIds\.join\("\\|"\)\}:\$\{index\}`\}/);
});
