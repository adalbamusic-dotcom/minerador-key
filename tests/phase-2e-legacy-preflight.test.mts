import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("Fase 2E entrega somente preflight sanitizado e sem comandos de escrita", async () => {
  const [sql, documentation] = await Promise.all([
    read("supabase/scripts/fase-2e-legacy-contracts-preflight-read-only.sql"),
    read("docs/compartilhado/auditorias/fase-2e-legacy-contracts-preflight.md"),
  ]);
  for (const gate of [
    "user_key_runtime_consumers", "perfis_marca_id_runtime_consumers", "canonical_role_runtime_consumers",
    "functions_using_user_key", "functions_using_perfis_marca_id", "functions_using_canonical_role",
    "policies_using_user_key", "policies_using_perfis_marca_id", "policies_using_canonical_role",
    "triggers_using_legacy_contracts", "views_using_legacy_contracts", "invalid_final_agency_roles",
    "canonical_role_unique_information", "expected_drop_dependencies", "blocking_dependencies", "preflight_status",
  ]) assert.match(sql, new RegExp(gate));
  assert.match(sql, /READY_FOR_LEGACY_DROP/);
  assert.match(sql, /BLOCKING_FUNCTIONAL_DEPENDENCY/);
  assert.match(sql, /EXPECTED_DROP_DEPENDENCY/);
  assert.match(sql, /HISTORICAL_ONLY/);
  assert.match(sql, /SAFE/);
  assert.match(sql, /%perfis\.marca_id%/);
  assert.doesNotMatch(sql, /ILIKE '%'\s*\|\|\s*(?:attributes|contracts)\.column_name/i);
  const executable = sql.replace(/^--.*$/gm, "");
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i);
  assert.match(documentation, /migration 0017 foi preparada apenas localmente/i);
});
