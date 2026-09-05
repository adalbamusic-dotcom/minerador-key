import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeTypedConfirmation, typedConfirmationMatches } from "../lib/lifecycle/typed-confirmation.ts";

const deleteUi = readFileSync(new URL("../components/lifecycle/delete-confirmation.tsx", import.meta.url), "utf8");
const mineradorWorkspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const architectDangerAdapter = readFileSync(new URL("../components/editorial/danger-approval-dialog.tsx", import.meta.url), "utf8");

test("confirmação digitada normaliza trim e caixa sem aceitar nome vazio", () => {
  assert.equal(normalizeTypedConfirmation("  Gel de Unha Volia  "), "gel de unha volia");
  assert.equal(typedConfirmationMatches("  GEL DE UNHA VOLIA ", "Gel de Unha Volia"), true);
  assert.equal(typedConfirmationMatches("Gel de Unha Volia extra", "Gel de Unha Volia"), false);
  assert.equal(typedConfirmationMatches("qualquer coisa", ""), false);
  assert.equal(typedConfirmationMatches("", "Gel de Unha Volia"), false);
});

test("hard e recoverable usam o campo compartilhado e resetam ao desmontar", () => {
  assert.match(deleteUi, /export function DeleteConfirmation/);
  assert.match(deleteUi, /export function PublishedDeleteConfirmation/);
  assert.match(deleteUi, /if \(!props\.open\) return null/);
  assert.match(deleteUi, /disabled=\{!matches \|\| confirming\}/);
  assert.match(deleteUi, /event\.key === "Enter" && matches/);
  assert.doesNotMatch(deleteUi, /type="checkbox"|acknowledged/);
  assert.match(mineradorWorkspace, /confirmationName=\{deleteReview\?\.confirmationName \|\| ""\}/);
  assert.match(architectDangerAdapter, /<DeleteConfirmation/);
  assert.doesNotMatch(architectDangerAdapter, /type="checkbox"|acknowledged/);
});
