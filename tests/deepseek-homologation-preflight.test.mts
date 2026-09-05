import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptPath = new URL("../supabase/scripts/deepseek-homologation-preflight-read-only.sql", import.meta.url);

async function readScript() {
  return readFile(scriptPath, "utf8");
}

function executableLines(sql: string) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("DeepSeek preflight is a single four-column read-only report", async () => {
  const sql = await readScript();
  const executable = executableLines(sql);

  assert.match(sql, /SELECT check_name, expected, observed, verdict\s+FROM all_checks/);
  assert.equal((sql.match(/UNION ALL SELECT check_name, expected, observed, verdict/g) || []).length, 11);
  assert.doesNotMatch(executable, /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|BEGIN|COMMIT)\b/im);
  assert.doesNotMatch(executable, /\b(?:DEEPSEEK_API_KEY|OPENROUTER_API_KEY|decrypted_secrets)\b/i);
});

test("DeepSeek preflight preserves the canonical remote gates without writes", async () => {
  const sql = await readScript();

  assert.match(sql, /provider_key = 'deepseek'/);
  assert.match(sql, /unit_name = 'request'/);
  assert.match(sql, /OPENROUTER_CONFIGURATION_CONFLICT/);
  assert.match(sql, /integration_secret_store_upsert\(text,text,text,text\)/);
  assert.match(sql, /secret_store_acl_ok/);
  assert.match(sql, /usage_check/);
});
