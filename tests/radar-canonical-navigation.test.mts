import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { buildBrandRef } from "../lib/tenant-routing.ts";
import { buildRadarArticleHref, buildRadarArchitectHref, buildRadarModuleHref, radarCanonicalRouteKey } from "../lib/radar/route-resolution.ts";

const root = resolve(import.meta.dirname, "..");
const tenantId = "9f7b1d84-54a5-4bd2-aee0-1136d4a7f64f";
const brandRef = buildBrandRef("Adalba Pro", tenantId);

async function source(path: string) {
  return readFile(resolve(root, path), "utf8");
}

test("constrói somente a rota Radar tenantizada com brandRef e ID canônico", () => {
  assert.equal(buildRadarArticleHref({ brandRef, articleId: "article-dna-v1" }), `/${brandRef}/radar/article-dna-v1`);
  assert.equal(buildRadarArchitectHref({ brandRef, articleId: "article-1" }), `/${brandRef}/arquiteto?articleId=article-1`);
  assert.equal(buildRadarModuleHref({ brandRef, module: "planejador" }), `/${brandRef}/planejador`);
  assert.equal(buildRadarArticleHref({ brandRef: tenantId, articleId: "article-dna-v1" }), null);
  assert.equal(buildRadarArticleHref({ brandRef: "adalba-pro", articleId: "article-dna-v1" }), null);
});

test("o resolvedor mantém articleDnaVersionId como chave canônica e aliases apenas como compatibilidade", () => {
  const radarItem = { articleDnaVersionId: "article-dna-v1", articleId: "pub-k-keyword-1" } as Parameters<typeof radarCanonicalRouteKey>[0];
  const canonicalId = radarCanonicalRouteKey(radarItem);
  assert.equal(canonicalId, "article-dna-v1");
  assert.equal(buildRadarArticleHref({ brandRef, articleId: canonicalId }), `/${brandRef}/radar/article-dna-v1`);
});

test("a rota dinâmica valida o tenant antes de renderizar e recebe brandRef", async () => {
  const route = await source("app/(brand)/[brandRef]/radar/[articleId]/page.tsx");
  assert.match(route, /requireTenantModule\(brandRef, "radar"\)/);
  assert.match(route, /RadarAnalysisPage brandRef=\{brandRef\}/);
  assert.doesNotMatch(route, /workspace|ownerUserId/);
});

test("consumidores deixam de montar o detalhe global do Radar", async () => {
  const [radar, analysis, planner, dna, shared] = await Promise.all([
    source("modules/radar/radar-page.tsx"),
    source("modules/radar/radar-analysis-page.tsx"),
    source("modules/planejador/planner-page.tsx"),
    source("components/editorial/dna-panels.tsx"),
    source("components/editorial/operational-screen-shared.tsx"),
  ]);

  assert.match(radar, /buildRadarArticleHref\(\{ brandRef, articleId: radarCanonicalRouteKey\(row\) \}\)/);
  assert.match(analysis, /buildRadarArticleHref/);
  assert.match(planner, /buildRadarArticleHref/);
  assert.match(planner, /radarCanonicalRouteKey\(radar\)/);
  assert.match(dna, /buildRadarArticleHref\(\{ brandRef: activeBrandRef, articleId: radarCanonicalRouteKey\(radarItem\) \}\)/);
  assert.match(shared, /buildRadarArticleHref\(\{ brandRef: activeBrandRef, articleId: radarCanonicalRouteKey\(item\) \}\)/);

  for (const content of [radar, analysis, planner, dna, shared]) {
    assert.doesNotMatch(content, /\/radar\/\$\{encodeURIComponent\(/, "nenhum consumidor deve montar /radar/{id} global");
  }
});
