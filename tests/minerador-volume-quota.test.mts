import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("endpoint legado de volume falha fechado após a migração para Google Ads", async () => {
  const route = await readFile(new URL("../app/api/volume/route.ts", import.meta.url), "utf8");
  assert.match(route, /VOLUME_MOVED_TO_GOOGLE_ADS/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /rapidapi|provider_quota_exceeded|retry/i);
});

test("a interface usa a rota Google Ads e não expõe quota da rota legada", async () => {
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /google-ads\/metricas-keywords/);
  assert.match(workspace, /Atualizar métricas/);
  assert.doesNotMatch(workspace, /provider_quota_exceeded|rapidapi/i);
});
