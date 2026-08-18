import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/editorial/danger-approval-dialog.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0008_minerador_keyword_measurement_delete_cascade.sql", import.meta.url), "utf8");

test("falha de exclusão fecha o diálogo e informa um motivo sanitizado", () => {
  const start = workspace.indexOf("const handleBatchDelete");
  const end = workspace.indexOf("const selectedDeletableCount", start);
  const handler = workspace.slice(start, end);

  assert.match(handler, /setDeleteApprovalOpen\(false\);/);
  assert.match(handler, /errorCode === "23503"/);
  assert.match(handler, /errorCode === "42501"/);
  assert.match(handler, /return false;/);
  assert.match(handler, /return true;/);
  assert.doesNotMatch(handler, /console\.error\(err\)/);
});

test("diálogo sempre encerra o estado de confirmação", () => {
  assert.match(dialog, /try \{/);
  assert.match(dialog, /const result = await onConfirm\(\);/);
  assert.match(dialog, /finally \{\s*setConfirming\(false\);\s*\}/);
});

test("migration troca apenas a FK das métricas pela exclusão atômica", () => {
  assert.match(migration, /FOREIGN KEY \(keyword_id\) REFERENCES public\.keywords_kgr\(id\) ON DELETE CASCADE/);
  assert.match(migration, /esperada uma única FK de métricas para keyword/);
  assert.doesNotMatch(migration, /DELETE FROM public\.keywords_kgr/);
});
