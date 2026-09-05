import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/editorial/danger-approval-dialog.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/0046_minerador_keyword_delete_lifecycle.sql", import.meta.url), "utf8");

test("falha de exclusão fecha o diálogo e preserva a atomicidade no cliente", () => {
  const start = workspace.indexOf("const handleBatchDelete");
  const end = workspace.indexOf("const organizeFilterLabels", start);
  const handler = workspace.slice(start, end);

  assert.match(handler, /setDeleteApprovalOpen\(false\);/);
  assert.match(workspace, /Nada foi apagado/);
  assert.match(handler, /requestKeywordDeletePreview/);
  assert.match(handler, /executeKeywordDeletion/);
  assert.doesNotMatch(handler, /\.delete\(\)/);
  assert.match(handler, /return false;/);
  assert.match(handler, /return completed;/);
});

test("diálogo sempre encerra o estado de confirmação", () => {
  assert.match(dialog, /try \{/);
  assert.match(dialog, /const result = await onConfirm\(\);/);
  assert.match(dialog, /finally \{\s*setConfirming\(false\);\s*\}/);
});

test("migration prepara lifecycle, RPCs e nenhum delete genérico por CASCADE", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS deleted_at timestamptz/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS purge_after timestamptz/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.delete_minerador_keywords/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.recover_minerador_keywords/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.purge_minerador_keywords/);
  assert.match(migration, /partialDelete.*false/);
  assert.match(migration, /REVOKE DELETE ON TABLE public\.minerador_keywords/);
  assert.doesNotMatch(migration, /DELETE FROM public\.minerador_keywords[\s\S]{0,240}CASCADE/i);
  assert.doesNotMatch(migration, /DROP TABLE[\s\S]*CASCADE/i);
});

test("migration preserva artefatos editoriais imutáveis e eventos append-only", () => {
  assert.match(migration, /Immutable editorial[\s\S]{0,180}status\/decision events always survive/);
  assert.doesNotMatch(migration, /DELETE FROM public\.editorial_artifact_versions/);
  assert.doesNotMatch(migration, /DELETE FROM public\.editorial_version_status_events/);
  assert.doesNotMatch(migration, /DELETE FROM public\.editorial_decision_events/);
});
