/**
 * ===== RADAR_VISUAL_CONTRACT_1 · a planilha e o Radar no contrato visual =====
 *
 * O guard (`scripts/check-visual-system.mjs`) é a autoridade: este teste o
 * executa em modo estrito sobre os arquivos que o Radar renderiza e pina os
 * pontos do contrato da planilha (operational-grid-layout.md) que a limpeza
 * de cor não pode desfazer por acidente.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/* Os arquivos que a tela do Radar e a rota de análise renderizam, mais os helpers compartilhados que eles consomem. */
const ARQUIVOS = [
  "components/editorial/operational-data-grid.tsx",
  "components/editorial/operational-screen-shared.tsx",
  "app/(brand)/[brandRef]/radar/[articleId]/page.tsx",
  "modules/radar/radar-page.tsx",
  "modules/radar/radar-r3-workbench.tsx",
  "modules/radar/radar-r3-serp-panel.tsx",
  "modules/radar/radar-r3-content-dossier.tsx",
  "modules/radar/radar-r3-blueprint.tsx",
  "modules/radar/radar-r3-research-details.tsx",
  "modules/radar/radar-r3-videos-panel.tsx",
  "modules/radar/radar-r3-amazon-panel.tsx",
  "modules/radar/radar-r3-profile-mirror.tsx",
  "modules/radar/radar-expert-brief-panel.tsx",
  "modules/radar/radar-profile-blueprint.tsx",
  "modules/radar/radar-activity-summary.tsx",
  "modules/radar/radar-workbench.tsx",
  "modules/radar/radar-article-model.tsx",
  "modules/radar/competitive-report-panel.tsx",
  "modules/radar/radar-analysis-page.tsx",
];

test("A · o guard visual passa em modo ESTRITO nos arquivos do Radar e da planilha compartilhada", () => {
  const raiz = new URL("..", import.meta.url);
  const r = spawnSync(process.execPath, ["scripts/check-visual-system.mjs", "--files", ...ARQUIVOS], { cwd: raiz, encoding: "utf8" });
  const saida = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.status, 0, `o guard encontrou dívida visual:\n${saida.split("\n").filter(l => /:\d+ /.test(l)).map(l => l.slice(0, 160)).join("\n")}`);
});

test("B · a planilha compartilhada segue o contrato do Operational Grid", async () => {
  const grid = semComentarios(await fonte("../components/editorial/operational-data-grid.tsx"));
  /* texto de célula em 14px, nunca no piso nem abaixo dele */
  assert.match(grid, /<table className="w-full table-fixed border-collapse text-sm"/);
  /* cabeçalho sticky em surface-subtle com label em text-muted */
  assert.match(grid, /<thead className="sticky top-0 z-30 bg-surface-subtle text-text-muted">/);
  /* o painel da linha aberta carrega a faixa de module-accent no próprio <td> */
  assert.match(grid, /<td colSpan=\{[^}]+\} className="border-l-2 border-l-module-accent bg-background p-4">\{renderExpanded\(row\)\}/);
  /* erro é danger, e não vermelho cru */
  assert.match(grid, /border-danger\/45 bg-danger-soft p-4 text-sm text-danger/);
  /* nenhum valor bruto, nenhuma classe crua, nenhum tom inexistente, nenhuma fonte abaixo do piso */
  assert.equal(/#[0-9a-fA-F]{6}|slate-\d+|text-white|bg-black|text-\[(8|9|10|11)px\]/.test(grid), false);
});

test("C · os helpers compartilhados que o Radar consome não escolhem cor", async () => {
  const shared = semComentarios(await fonte("../components/editorial/operational-screen-shared.tsx"));
  assert.match(shared, /export const card = "rounded-lg border border-divider bg-surface-subtle p-4";/);
  /* valor essencial em foreground, label em text-muted (operational-grid-layout §5) */
  assert.match(shared, /export const Field = [\s\S]*?<dt className="text-\[12px\] font-bold uppercase tracking-wider text-text-muted">/);
  assert.equal(/slate-\d+|text-white|#[0-9a-fA-F]{6}|text-\[(8|9|10|11)px\]/.test(shared), false);
});

test("D · status no Radar usa a semântica do contrato, não cores de biblioteca", async () => {
  for (const caminho of ["../modules/radar/radar-page.tsx", "../modules/radar/competitive-report-panel.tsx", "../modules/radar/radar-analysis-page.tsx"]) {
    const texto = semComentarios(await fonte(caminho));
    assert.equal(/(text|border|bg|ring)-(slate|teal|emerald|amber|orange|red|rose|sky|cyan|gray|zinc)-\d+/.test(texto), false, `${caminho} ainda escolhe cor de biblioteca`);
    assert.equal(/text-white|bg-black|#[0-9a-fA-F]{6}/.test(texto), false, `${caminho} ainda usa valor bruto`);
  }
});
