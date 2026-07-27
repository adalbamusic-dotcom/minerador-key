import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("429 do provedor encerra a coleta sem expor quota nem iniciar retry", async () => {
  const route = await readFile(new URL("../app/api/volume/route.ts", import.meta.url), "utf8");
  assert.match(route, /response\.status === 429/);
  assert.match(route, /code: "provider_quota_exceeded"/);
  assert.match(route, /error: "Não foi possível coletar volume\."/);
  assert.match(route, /status: 429/);
  assert.match(route, /status: "not_processed"/);
  assert.match(route, /not_processed_quota_exceeded/);
  assert.doesNotMatch(route, /retry/i);
  assert.doesNotMatch(route, /quota.*\$|requests.*hour|limite.*hora/i);
});

test("a interface reduz o 429 à mensagem externa e preserva o fluxo local", async () => {
  const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /if \(resData\?\.code === "provider_quota_exceeded"\)/);
  assert.match(workspace, /showNotification\("info", "Não foi possível coletar volume\. Tente novamente mais tarde\."/);
  assert.match(workspace, /resData\?\.code === "provider_quota_exceeded"/);
  assert.match(workspace, /code === "provider_quota_exceeded"/);
  const quotaBranchStart = workspace.indexOf('if (resData?.code === "provider_quota_exceeded")');
  const quotaBranchEnd = workspace.indexOf('if (!response.ok || !resData?.success)', quotaBranchStart);
  assert.ok(quotaBranchStart >= 0 && quotaBranchEnd > quotaBranchStart);
  assert.doesNotMatch(workspace.slice(quotaBranchStart, quotaBranchEnd), /new Error/);
  assert.doesNotMatch(workspace.slice(quotaBranchStart, quotaBranchEnd), /console\.error/);
  assert.doesNotMatch(workspace, /provider_quota_exceeded[\s\S]{0,500}startAllintitleMeasurement/);
});
