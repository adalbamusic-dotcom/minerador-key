import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarWorkbenchStages, deriveRadarNextAction, resolveRadarWorkbenchArticleId, summarizeRadarReferenceCounts } from "../lib/radar/workbench.ts";

test("seleção e expansão resolvem o contexto ativo sem misturar artigos", () => {
  assert.equal(resolveRadarWorkbenchArticleId({ selectedId: "article-2", expandedId: "article-1", fallbackId: "article-1", rowIds: ["article-1", "article-2"] }), "article-2");
  assert.equal(resolveRadarWorkbenchArticleId({ selectedId: "missing", expandedId: "article-1", rowIds: ["article-1", "article-2"] }), "article-1");
  assert.equal(resolveRadarWorkbenchArticleId({ selectedId: "missing", expandedId: "also-missing", fallbackId: "missing", rowIds: ["article-1"] }), null);
  assert.equal(resolveRadarWorkbenchArticleId({ rowIds: ["article-1", "article-2"] }), null);
});

test("Workbench representa as seis etapas e não bloqueia o fluxo por evidência adicional opcional", () => {
  const references = summarizeRadarReferenceCounts([{ role: "primary" }, { role: "support" }, { role: "pending" }]);
  assert.deepEqual(references, { total: 3, primary: 1, support: 1, format: 0, pending: 1, excluded: 0, own: 0 });
  const stages = buildRadarWorkbenchStages({ serpCollected: true, serpResultCount: 8, referencesReviewed: true, referenceCounts: references, analysisStarted: true, pagesAnalyzed: 3, additionalEvidenceState: "not-needed", reportGenerated: false, reportApproved: false, sentToPlanner: false });
  assert.deepEqual(stages.map(stage => stage.label), ["SERP", "Referências", "Análise SERP", "Evidências adicionais", "Relatório", "Aprovação / Planejador"]);
  assert.equal(stages[2].state, "done");
  assert.equal(stages[3].state, "optional");
  assert.equal(stages[4].state, "current");
});

test("próxima ação respeita a sequência e só considera a consolidação depois da amostra", () => {
  const base = { identityReady: true, serpCollected: true, referencesPending: 0, analysisStarted: true, analysisQueue: 0, pagesAnalyzed: 0, reportGenerated: true, reportApproved: true, sentToPlanner: false, additionalEvidenceState: "not-started" as const };
  assert.match(deriveRadarNextAction(base), /formar a amostra/);
  assert.match(deriveRadarNextAction({ ...base, pagesAnalyzed: 2, reportGenerated: false }), /gere a prévia/);
  assert.match(deriveRadarNextAction({ ...base, pagesAnalyzed: 2, reportGenerated: true, reportApproved: true }), /Planejador/);
});

test("Radar conecta a seleção canônica, Workbench e Perfil sem ações fixas na extrema direita", () => {
  const page = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../components/editorial/operational-data-grid.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../modules/radar/radar-r3-profile-mirror.tsx", import.meta.url), "utf8");
  assert.match(page, /onBulkSelectionChange=\{handleBulkSelectionChange\}/);
  assert.match(page, /model=\{activeWorkbenchData\?\.r3 \|\| null\}/);
  assert.match(page, /<RadarWorkbench/);
  assert.match(profile, /Espelho do Radar Workbench/);
  assert.match(profile, /Proveniência e identidade técnica/);
  assert.match(page, /buildRadarR3Model/);
  assert.match(page, /onOpenDetail=\{openDetail\}/);
  assert.match(profile, /Amazon/);
  assert.match(profile, /Especialista/);
  assert.doesNotMatch(page, /renderActions=\{row =>/);
  assert.match(grid, /onSelectionChange\?: \(rowIds: string\[\]\) => void/);
  assert.match(grid, /onSelectionChange\?\.\(\[\.\.\.bulkSelected\]\)/);
  assert.match(grid, /bulkSelectedRowIds\?: ReadonlySet<string>/);
  assert.match(grid, /onBulkSelectionChange\?: \(rowIds: string\[\], change: OperationalGridBulkSelectionChange\) => void/);
  assert.match(grid, /const bulkSelected = bulkSelectedRowIds \|\| uncontrolledBulkSelected/);
  assert.match(grid, /onBulkSelectionChange\?\.\(\[\.\.\.next\], change\)/);
  assert.match(grid, /onRowActivate\?: \(row: T\) => void/);
  assert.match(grid, /activeRowId\?: string \| null/);
  assert.match(grid, /onRowActivate\(row\)/);
  assert.match(grid, /const \[uncontrolledBulkSelected, setUncontrolledBulkSelected\]/);
  assert.match(grid, /checked=\{bulkSelected\.has\(row\.id\)\}/);
  assert.match(grid, /onPointerDown=\{event => event\.stopPropagation\(\)\}/);
  assert.match(grid, /onClick=\{event => event\.stopPropagation\(\)\}/);
  assert.doesNotMatch(grid, /aria-selected=\{activeRowId/);
  assert.match(page, /createRadarSpreadsheetSelection/);
  assert.match(page, /activeArticleId/);
  assert.match(page, /selectedArticleIds/);
  assert.match(page, /selectAndActivateArticle/);
  assert.match(page, /setArticleSelection/);
  assert.doesNotMatch(page, /focusedArticleId/);
  assert.match(page, /rowIds: pipeline\.radarItems\.map\(row => row\.articleId\)/);
  assert.match(page, /find\(row => row\.articleId === resolvedActiveArticleId\)/);
  assert.match(page, /activeRowId=\{activeRadarRowId\}/);
  assert.match(page, /activeRowClassName="border-l-2 border-l-context-accent bg-surface-subtle\/55"/);
  assert.match(page, /bulkSelectedRowClassName="bg-positive-soft\/10"/);
  assert.match(page, /renderBulkBar=/);
  assert.match(grid, /renderBulkBar\?: \(selectedRows: T\[\]\) => React\.ReactNode/);
});

test("contribuição adicional explicita cobertura, conteúdo existente e separação da análise SERP", () => {
  const panel = readFileSync(new URL("../modules/radar/expert-contribution-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Cobertura/);
  assert.match(panel, /Aguardando análise/);
  assert.match(panel, /Conteúdo já produzido/);
  assert.match(panel, /Transcrição fiel/);
  assert.match(panel, /Organização da contribuição/);
  assert.match(panel, /serpAnalyzed/);
  assert.match(panel, /serpAnalyzed \? <div className=\{section\}/);
  assert.match(panel, /Visão geral/);
  assert.match(panel, /Solicitações/);
  assert.match(panel, /Telegram global/);
});
