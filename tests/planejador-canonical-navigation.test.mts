import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("o botão Abrir cockpit usa a rota tenantizada e a página valida o tenant", async () => {
  const [planner, cockpitRoute] = await Promise.all([
    readFile(resolve(root, "modules/planejador/planner-page.tsx"), "utf8"),
    readFile(resolve(root, "app/(brand)/[brandRef]/planejador/[contentPlanId]/page.tsx"), "utf8"),
  ]);
  assert.match(planner, /activeBrandRef/);
  assert.match(planner, /cockpitHref/);
  assert.match(planner, /cockpitHref = activeBrandRef && plan/);
  assert.match(planner, /planejador\/\$\{encodeURIComponent\(plan\.versionId\)\}/);
  assert.doesNotMatch(planner, /href=\{`\/planejador\/\$\{encodeURIComponent\(/);
  assert.match(cockpitRoute, /requireTenantModule\(brandRef, "planejador"\)/);
});
