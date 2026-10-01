import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync("app/globals.css", "utf8");
const architect = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const miner = readFileSync("modules/minerador/minerador-workspace.tsx", "utf8");
const readonlyPanel = readFileSync("components/editorial/keyword-dna-readonly-panel.tsx", "utf8");
const dnaPanels = readFileSync("components/editorial/dna-panels.tsx", "utf8");
const visualSystem = readFileSync("docs/compartilhado/sistema-visual.md", "utf8");

test("os três papéis têm alias semântico central com o valor oficial", () => {
  assert.match(globals, /--identity-new: var\(--module-accent\);/);
  // Link publicado em blue-500 (dono, 2026-10-01): o action-accent da raiz não muda.
  assert.match(globals, /--identity-published: var\(--color-blue-500, oklch\(62\.3% 0\.214 259\.815\)\);/);
  assert.match(globals, /--keyword: #e0fbff;/);
  assert.match(globals, /--module-accent: #10DDE0;/);
  assert.match(globals, /--action-accent: #193cb8;/);
  for (const utility of ["--color-identity-new", "--color-identity-published", "--color-keyword"]) {
    assert.ok(globals.includes(utility), `utilitário ausente no @theme: ${utility}`);
  }
});

test("o valor da keyword é próprio e não alias de um estado", () => {
  // A keyword é o dado central do produto: não pode herdar a cor de um estado
  // (pending, warning, success…) que muda por outro motivo.
  assert.doesNotMatch(globals, /--keyword: var\(/);
  // Conta declarações, não menções em comentário.
  const declaracoes = globals.split(/\r?\n/).filter(line => /^\s*--[a-z-]+:\s*#e0fbff/i.test(line));
  assert.equal(declaracoes.length, 1, "#e0fbff deve ser declarado uma única vez");
  assert.match(declaracoes[0], /--keyword:/, "#e0fbff só pode pertencer ao token da keyword");
});

test("keyword usa a mesma cor na planilha, nos cards e nos painéis", () => {
  assert.match(architect, /text-keyword[^"]*" title=\{art\.keywordPrincipal\}/);
  assert.match(architect, /text-keyword">\{art\.keywordPrincipal\}/);
  assert.match(architect, /text-keyword">\{divergence\.keyword\}/);
  assert.match(architect, /text-keyword" title=\{keyword\.keyword\}/);
  assert.match(miner, /text-keyword/);
  assert.match(readonlyPanel, /text-base font-semibold text-keyword">\{projection\.keyword/);
  assert.match(dnaPanels, /text-keyword \[overflow-wrap:anywhere\]">\{keyword\.keyword\}/);
});

test("a keyword usa a cor oficial também fora do Minerador e do Arquiteto", () => {
  const discovery = readFileSync("modules/minerador/discovery/discovery-table-placeholder.tsx", "utf8");
  const radarWorkbench = readFileSync("modules/radar/radar-workbench.tsx", "utf8");
  const radarPage = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const radarMirror = readFileSync("modules/radar/radar-r3-profile-mirror.tsx", "utf8");
  const radarAnalysis = readFileSync("modules/radar/radar-analysis-page.tsx", "utf8");
  // Descobrir Keywords: a célula da keyword não pode voltar a text-foreground.
  assert.match(discovery, /const keywordCell = "[^"]*text-keyword/);
  // Componentes genéricos recebem tom opcional; só o campo da keyword o usa.
  assert.ok(radarWorkbench.includes('<ContextValue label="Keyword principal" value={model.keyword} tone="keyword"/>'));
  assert.ok(radarPage.includes('<span className="mt-1 block text-sm"><span className="text-keyword">{data.r3.keyword}</span>'));
  assert.ok(radarPage.includes('<Field label="Keyword principal" tone="keyword"'));
  assert.ok(radarMirror.includes('<Field label="Keyword principal" tone="keyword"'));
  assert.ok(radarAnalysis.includes('<Field label="Keyword principal" tone="keyword"'));
});

test("contagem e identificador NÃO recebem a cor de keyword", () => {
  const radarPage = readFileSync("modules/radar/radar-page.tsx", "utf8");
  const radarAnalysis = readFileSync("modules/radar/radar-analysis-page.tsx", "utf8");
  // "Keywords" com .length é contagem, não o valor textual da keyword.
  assert.ok(radarPage.includes('<Field label="Keywords" value={article.payload.keywordReferences.length}'));
  assert.ok(!radarPage.includes('<Field label="Keywords" tone="keyword"'));
  assert.ok(!radarAnalysis.includes('<Field label="Keyword principal de origem" tone="keyword"'));
});

test("slug, link e canonical separam identidade nova de identidade publicada", () => {
  assert.match(architect, /text-identity-new disabled:cursor-not-allowed disabled:opacity-70/);
  assert.match(architect, /text-identity-published underline decoration-identity-published/);
  assert.match(architect, /article\.isPublished \? "text-identity-published" : "text-identity-new"/);
  assert.match(miner, /text-identity-published/);
  assert.match(readonlyPanel, /"identity-new": "text-identity-new"/);
  assert.match(readonlyPanel, /"identity-published": "text-identity-published"/);
});

test("nenhum componente repete o valor bruto das três cores", () => {
  for (const [name, source] of [["arquiteto", architect], ["minerador", miner], ["painel readonly", readonlyPanel], ["dna-panels", dnaPanels]] as const) {
    for (const raw of ["#10DDE0", "#193cb8", "#e0fbff"]) {
      assert.equal(source.toLowerCase().includes(raw.toLowerCase()), false, `${name} repete o valor bruto ${raw}`);
    }
  }
});

test("keyword e slug nunca são cortados: regra raiz, fora de @layer, vence truncate e line-clamp (dono, 2026-10-01)", () => {
  const inicio = globals.indexOf(".text-keyword,");
  assert.ok(inicio >= 0, "regra raiz da keyword ausente");
  const bloco = globals.slice(inicio, globals.indexOf("}", inicio));
  assert.match(bloco, /\.text-identity-slug/);
  assert.match(bloco, /white-space: normal;/);
  assert.match(bloco, /text-overflow: clip;/);
  assert.match(bloco, /-webkit-line-clamp: unset;/);
  // Fora de @layer: nenhuma camada aberta antes da regra.
  // Sem comentários: o próprio comentário da regra cita "@layer".
  assert.doesNotMatch(globals.slice(0, inicio).replace(/\/\*[\s\S]*?\*\//g, ""), /@layer/);
  assert.match(visualSystem, /nunca aparecem cortados/);
});

test("a regra está registrada na fonte canônica do sistema visual", () => {
  assert.match(visualSystem, /identity-new/);
  assert.match(visualSystem, /identity-published/);
  assert.match(visualSystem, /toda keyword renderizada/);
  // O valor oficial e a exclusividade precisam estar escritos, não só no código.
  assert.match(visualSystem, /#e0fbff/);
  assert.match(visualSystem, /exclusivamente para a keyword/);
});

test("toda sobra de largura vai para a coluna da keyword: uma <col> por coluna no Arquiteto e fill no Radar (dono, 2026-10-01)", () => {
  // No Arquiteto, o cabeçalho tem uma <col> por coluna; "Papel no Silo" tinha ficado sem a sua.
  assert.match(architect, /siloRole: 104/);
  assert.match(architect, /keyword: \{ min: 240, max: 1600, flexible: true, fill: true \}/);
  assert.match(architect, /columnId="siloRole"/);
  const radarPage = readFileSync("modules/radar/radar-page.tsx", "utf8");
  assert.match(radarPage, /id: "article", header: "Artigo"[^\n]*fill: true/);
  const grid = readFileSync("components/editorial/operational-data-grid.tsx", "utf8");
  assert.match(grid, /column\.fill && !widths\[column\.id\] \? undefined/);
  assert.match(visualSystem, /toda sobra de largura de uma planilha vai para a coluna da keyword/);
});
