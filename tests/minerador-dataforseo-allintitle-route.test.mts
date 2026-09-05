import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rota mede novamente alvos já medidos e diferencia primeiras medições de atualizações", async () => {
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /currentOperationId\(target\) === input\.operationRequestId/);
  assert.match(route, /const measurementKind = hasCurrentAllintitle\(target\) \? "updated"/);
  assert.match(route, /firstMeasurements/);
  assert.match(route, /updatedMeasurements/);
  assert.match(route, /measureDataForSeoAllintitle/);
  assert.match(route, /measureDataForSeoKeywordOverview/);
  assert.match(route, /DATAFORSEO_OVERVIEW_PARTIAL/);
});

test("rota usa upsert para a projeção atual da candidata e não bloqueia conflito existente", async () => {
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");
  assert.match(route, /minerador_discovery_candidate_current_metrics"\)\.upsert/);
  assert.match(route, /onConflict: "candidate_id"/);
  assert.doesNotMatch(route, /results_allintitle IS NULL/);
});

test("rota reserva quota por alvo e registra consumo após o provider iniciar", async () => {
  const route = await readFile(new URL("../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts", import.meta.url), "utf8");
  const overviewCore = await readFile(new URL("../lib/minerador/dataforseo-keyword-overview-core.ts", import.meta.url), "utf8");
  assert.match(route, /quotaUnits: targets\.length/);
  assert.match(route, /operation: "module_operation"/);
  assert.match(route, /module: "minerador"/);
  assert.match(route, /units: 1/);
  assert.match(route, /resultStatus: "succeeded"/);
  assert.match(route, /resultStatus: "failed"/);
  assert.match(route, /apiRequestStarted = true/);
  assert.match(overviewCore, /include_serp_info: false/);
  assert.match(overviewCore, /include_clickstream_data: false/);
  assert.match(route, /keywordDifficulty/);
});
