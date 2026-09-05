import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function readWorkspace() {
  return readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
}

async function readDnaPanels() {
  return readFile(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
}

test("revisão concluída pode ser reaberta ou cancelada sem executar provider", async () => {
  const workspace = await readWorkspace();
  const panels = await readDnaPanels();
  const reopenStart = workspace.indexOf('if (action.type === "reopen")');
  const cancelStart = workspace.indexOf('if (action.type === "cancel")', reopenStart);
  const reopenBranch = workspace.slice(reopenStart, cancelStart);

  assert.ok(reopenStart >= 0);
  assert.ok(cancelStart > reopenStart);
  assert.match(workspace, /action\.type === "reopen"/);
  assert.match(workspace, /action\.type === "cancel"/);
  assert.match(panels, /Revisar novamente/);
  assert.match(panels, /onAction\?\.\(\{ type: "reopen" \}\)/);
  assert.match(panels, /onAction\?\.\(\{ type: "cancel" \}\)/);
  assert.match(panels, /reviewLocked/);
  assert.doesNotMatch(reopenBranch, /fetch\(|supabase\.from\(/);
  assert.match(reopenBranch, /setHumanReviewDrafts/);
});
