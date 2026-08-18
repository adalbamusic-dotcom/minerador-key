import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Planejador usa a GlobalTopbar sem duplicar controles do grid", () => {
  const planner = readFileSync(new URL("../modules/planejador/planner-page.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../components/editorial/operational-data-grid.tsx", import.meta.url), "utf8");

  assert.match(planner, /GLOBAL_TOPBAR_ACTION_CONTROL/);
  assert.match(planner, /topbar=\{\{ moduleId: "planejador", renderActions: renderTopbarActions \}\}/);
  assert.match(planner, /grid\.exportRows\(grid\.queriedRows, "planilha"\)/);
  assert.match(planner, /grid\.toggleColumns/);
  assert.match(planner, /grid\.setOrderMode/);
  assert.match(planner, /grid\.setPageSize/);

  assert.doesNotMatch(planner, /title="Planejador"/);
  assert.doesNotMatch(planner, /description="Cockpit editorial/);
  assert.doesNotMatch(planner, /HistoryControls|useLocalHistory|ContentPlanEditor/);
  assert.doesNotMatch(planner, /router\.(back|forward)\(|window\.history\.(back|forward)\(/);

  assert.match(grid, /topbar\?: OperationalDataGridTopbar/);
  assert.match(grid, /search: \{ getValue: \(\) => search, setValue: setSearch \}/);
  assert.match(grid, /data-operational-topbar-actions/);
});
