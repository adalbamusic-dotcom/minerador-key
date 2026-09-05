import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clusterSource = await readFile(new URL("../components/inline-label-cluster.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const infoHintSource = await readFile(new URL("../components/info-hint.tsx", import.meta.url), "utf8");
const processSource = await readFile(new URL("../modules/minerador/minerador-process-action.tsx", import.meta.url), "utf8");
const processorSource = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const discoverySource = await readFile(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");

test("InlineLabelCluster expõe slots para label, InfoHint e controle", () => {
  assert.match(clusterSource, /label: ReactNode/);
  assert.match(clusterSource, /info\?: ReactNode/);
  assert.match(clusterSource, /trailing\?: ReactNode/);
  assert.match(clusterSource, /inline-label-cluster__label/);
  assert.match(clusterSource, /inline-label-cluster__info/);
  assert.match(clusterSource, /inline-label-cluster__control/);
});

test("tokens e composição são globais, atômicos e sem quebra", () => {
  assert.match(cssSource, /--ui-label-info-gap:\s*2px/);
  assert.match(cssSource, /--ui-label-control-gap:\s*4px/);
  assert.match(cssSource, /\.inline-label-cluster\s*\{[\s\S]*display:\s*inline-flex[\s\S]*align-items:\s*center[\s\S]*white-space:\s*nowrap/);
  assert.match(cssSource, /\.inline-label-cluster__info\s*\{[\s\S]*margin-inline-start:\s*var\(--ui-label-info-gap\)/);
  assert.match(cssSource, /\.inline-label-cluster__control\s*\{[\s\S]*margin-inline-start:\s*var\(--ui-label-control-gap\)/);
  assert.doesNotMatch(clusterSource, /absolute|justify-between|flex-grow|flex-1/);
});

test("InfoHint preserva trigger acessível e hit-area compacta sem botão aninhado", () => {
  assert.match(infoHintSource, /<Tooltip\.Trigger type="button"/);
  assert.match(infoHintSource, /aria-label=\{triggerLabel\}/);
  assert.match(infoHintSource, /info-hint-inline-trigger/);
  assert.match(cssSource, /\.info-hint-inline-trigger::before/);
  assert.match(processSource, /<InfoHint title=\{title\} description=\{description\}>[\s\S]*<InlineLabelCluster[\s\S]*info=\{<span[\s\S]*<InfoHintGlyph \/>/);
  assert.match(processSource, /\{icon\}[\s\S]*<InlineLabelCluster/);
  assert.equal((processSource.match(/<button/g) || []).length, 1);
});

test("mesas principais usam label + controle no cluster e preservam sort", () => {
  assert.match(processorSource, /<InlineLabelCluster label="Palavra-Chave" trailing=\{renderSortIcon\("keyword"\)\}/);
  assert.match(processorSource, /label="Resultados"[\s\S]*info=\{[\s\S]*trailing=\{renderSortIcon\("results_allintitle"\)\}/);
  assert.match(processorSource, /label="KGR"[\s\S]*info=\{[\s\S]*trailing=\{renderSortIcon\("kgr_score"\)\}/);
  assert.doesNotMatch(processorSource, /renderSortIcon\("keyword"\)[^\n]*ml-1/);
  assert.match(discoverySource, /<InlineLabelCluster[\s\S]*trailing=\{sortIcon\}/);
  assert.match(discoverySource, /onKeyDown=\{event =>/);
  assert.match(discoverySource, /onClick=\{onClick\}/);
});
