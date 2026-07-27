import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const volumeRoute = readFileSync(new URL("../app/api/volume/route.ts", import.meta.url), "utf8");
const lastOrganization = readFileSync(new URL("../lib/minerador/last-organization.ts", import.meta.url), "utf8");

test("interface do Minerador mantém KGR e intenção somente informativos", () => {
  assert.equal(page.includes("handleKgrDecision"), false);
  assert.equal(page.includes("handleUpdateIntent"), false);
  assert.match(page, /Aprovar como KGR/);
  assert.match(page, /Marcar não aplicável/);
  assert.match(page, /mineradorOrganizationButtonSummary/);
  assert.match(lastOrganization, /return "Organizar"/);
  assert.match(page, /Métricas/);
  assert.match(page, /Estratégia KGR/);
  assert.match(page, /Decisão humana/);
  assert.match(page, /KGR calculado:.*Não utilizado/);
  assert.match(page, /kgrApplicability === "not_applicable"[\s\S]*"Não aplicável"/);
  assert.doesNotMatch(page, /Diagnóstico de medição: volume e KGR/);
  assert.match(page, /Medir resultados/);
  assert.match(page, /Medindo resultados\.\.\./);
  assert.match(page, /Medir volume/);
  assert.match(page, /Medindo volume\.\.\./);
  assert.match(page, /Decisão KGR/);
  assert.match(page, /Consulta a quantidade de resultados allintitle usando a extensão\./);
  assert.match(page, /Consulta o volume da keyword no provedor configurado\./);
  const legacyLabels = [
    ["Medir", "allintitle"].join(" "),
    ["Qualificar volume (", "KGR calculado)"].join(""),
    ["Qualificar (Volume ", "& KGR)"].join(""),
  ];
  for (const legacyLabel of legacyLabels) assert.equal(page.includes(legacyLabel), false, `rótulo legado encontrado: ${legacyLabel}`);
});

test("conferência Site/Sitemap fica na barra selecionada e exige seleção", () => {
  assert.equal((page.match(/Conferir com o site/g) || []).length, 1);
  const handlerStart = page.indexOf("const handleCheckWithSite");
  const handlerEnd = page.indexOf("const handleConfirmSiteSync", handlerStart);
  const handler = page.slice(handlerStart, handlerEnd);
  assert.match(handler, /selectedIds\.size === 0/);
  assert.match(page, /onClick=\{handleCheckWithSite\}/);
  assert.equal(page.includes("bg-emerald-950\/10 px-4 py-2"), false);
});

test("qualificação local não refaz carregamento nem grava nulos após falha", () => {
  const start = page.indexOf("const handleBatchQualify");
  const end = page.indexOf("const handleBatchDelete", start);
  const handler = page.slice(start, end);
  assert.equal(handler.includes("fetchData()"), false);
  assert.equal(handler.includes("setSelectedIds(new Set())"), false);
  assert.match(handler, /!response\.ok \|\| !resData\?\.success/);
  assert.match(handler, /buildVolumeMetricPatch/);
  assert.equal(handler.includes("volume_search: null"), false);
  assert.equal(handler.includes('volume_source: "estimado"'), false);
});

test("volume usa Google Keyword Insight por GET e parâmetros de query", () => {
  assert.match(volumeRoute, /SEO_KEYWORD_RESEARCH_HOST = "seo-keyword-research8\.p\.rapidapi\.com"/);
  assert.match(volumeRoute, /SEO_KEYWORD_RESEARCH_URL = `https:\/\/\$\{SEO_KEYWORD_RESEARCH_HOST\}\/keyword-research`/);
  assert.match(volumeRoute, /url\.searchParams\.set\("keyword", keyword\)/);
  assert.match(volumeRoute, /url\.searchParams\.set\("country", SEO_KEYWORD_RESEARCH_COUNTRY\)/);
  assert.match(volumeRoute, /method: "GET"/);
  assert.match(volumeRoute, /status: "error"/);
  assert.match(volumeRoute, /providerErrorMessage/);
  assert.match(volumeRoute, /RapidAPI respondeu HTTP \$\{response\.status\}/);
  assert.match(volumeRoute, /normalizeSeoKeywordResearchResponse/);
  assert.match(volumeRoute, /source: "seo-keyword-research8"/);
  assert.match(volumeRoute, /measuredAt: new Date\(\)\.toISOString\(\)/);
  assert.match(volumeRoute, /match: "exact"/);
  assert.match(volumeRoute, /data: results/);
  assert.equal(volumeRoute.includes('JSON.stringify({ keywords, country: "br" })'), false);
});
