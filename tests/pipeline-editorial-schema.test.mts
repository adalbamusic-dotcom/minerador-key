import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationsDir = join(root, "supabase", "migrations");
const scriptsDir = join(root, "supabase", "scripts");
const migrationNames = [
  "0027_editorial_artifacts_workflow_serp.sql",
  "0028_editorial_documents_and_views.sql",
  "0029_editorial_publication_records.sql",
];
const migrationSql = migrationNames.map((name) => readFileSync(join(migrationsDir, name), "utf8"));
const combinedMigrations = migrationSql.join("\n");
const targetTables = [
  "editorial_artifact_versions",
  "editorial_workflow_items",
  "editorial_serp_snapshots",
  "editorial_serp_reviews",
  "content_documents",
  "content_document_versions",
  "content_document_user_states",
  "editorial_saved_views",
  "publication_records",
];

function stripSqlCommentsAndStrings(sql: string) {
  return sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "$$ $$");
}

function readOnlyScript(name: string) {
  return readFileSync(join(scriptsDir, name), "utf8");
}

type CatalogFunctionFixture = {
  oid: number;
  schema: string;
  name: string;
  identityArguments: string;
  argumentTypes: string[];
  kind?: "f" | "p";
};

function matchesExactCatalogSignature(row: CatalogFunctionFixture, schema: string, name: string, argumentTypes: string[]) {
  return row.schema === schema && row.name === name && row.argumentTypes.join(",") === argumentTypes.join(",");
}

function resolveProcedureByIdentity(rows: CatalogFunctionFixture[], signature: string) {
  const match = /^([^.]+)\.([^()]+)\((.*)\)$/.exec(signature);
  assert.ok(match, `invalid test signature: ${signature}`);
  const [, schema, name, argumentText] = match;
  const expectedTypes = argumentText === "" ? [] : argumentText.split(",");
  return rows.find((row) =>
    row.schema === schema
    && row.name === name
    && (row.kind ?? "f") === "f"
    && row.argumentTypes.join(",") === expectedTypes.join(","),
  )?.oid ?? null;
}

type HelperContractFixture = CatalogFunctionFixture & {
  owner: string;
  returnsBoolean: boolean;
  securityDefiner: boolean;
  stable: boolean;
  searchPath: string;
  anonExecute: boolean;
  authenticatedExecute: boolean;
  serviceRoleExecute: boolean;
};

function evaluateHelper(rows: HelperContractFixture[], signature: string) {
  const resolvedOid = resolveProcedureByIdentity(rows, signature);
  const row = rows.find((candidate) => candidate.oid === resolvedOid);
  if (!row) return { presence: "FAIL", contract: "INFO", acl: "NOT_EVALUATED" };

  const contract = row.owner === "postgres"
    && row.returnsBoolean
    && row.securityDefiner
    && row.stable
    && row.searchPath === "pg_catalog, public, pg_temp";
  const acl = !row.anonExecute && row.authenticatedExecute && row.serviceRoleExecute;
  return { presence: "PASS", contract: contract && acl ? "PASS" : "FAIL", acl: acl ? "PASS" : "FAIL" };
}

test("editorial schema uses the next free migration numbers and leaves historical files untouched", () => {
  const numbers = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, 4)));

  assert.equal(new Set(numbers).size, numbers.length);
  assert.ok(numbers.includes(26));
  assert.deepEqual(migrationNames.map((name) => Number(name.slice(0, 4))), [27, 28, 29]);
  assert.doesNotMatch(combinedMigrations, /0002|0003|0026_public_default_acl/i);
});

test("canonical editorial tables and contracts are present in the local migrations", () => {
  for (const table of targetTables) {
    assert.match(combinedMigrations, new RegExp(`CREATE TABLE public\\.${table}\\b`));
    assert.match(combinedMigrations, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }

  assert.match(combinedMigrations, /artifact_type text NOT NULL CHECK \([\s\S]*?artifact_type IN \('article_dna', 'silo_dna', 'silo_page', 'content_plan'\)/);
  assert.match(combinedMigrations, /source_version_id text REFERENCES public\.editorial_artifact_versions/);
  assert.match(combinedMigrations, /CREATE TABLE public\.content_document_user_states \(\s*document_id text[\s\S]*?user_id uuid[\s\S]*?REFERENCES auth\.users\(id\)/);
  assert.match(combinedMigrations, /CREATE TABLE public\.editorial_saved_views \([\s\S]*?user_id uuid[\s\S]*?REFERENCES auth\.users\(id\)/);
  assert.match(combinedMigrations, /stage IN \('minerador', 'architect', 'radar', 'planner', 'writer', 'publications'\)/);
  assert.doesNotMatch(combinedMigrations, /\buser_key\b/i);
  assert.doesNotMatch(combinedMigrations, /ON DELETE CASCADE/i);
});

test("editorial ACLs are explicit and do not grant destructive table privileges", () => {
  const serviceRolePrivileges: Record<string, string> = {
    editorial_artifact_versions: "SELECT, INSERT",
    editorial_workflow_items: "SELECT, INSERT, UPDATE",
    editorial_serp_snapshots: "SELECT, INSERT",
    editorial_serp_reviews: "SELECT, INSERT",
    content_documents: "SELECT, INSERT, UPDATE",
    content_document_versions: "SELECT, INSERT",
    content_document_user_states: "SELECT, INSERT, UPDATE",
    editorial_saved_views: "SELECT, INSERT, UPDATE",
    publication_records: "SELECT, INSERT, UPDATE",
  };

  for (const table of targetTables) {
    assert.match(combinedMigrations, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE[\\s\\S]*?public\\.${table}`));
    assert.match(combinedMigrations, new RegExp(`GRANT SELECT ON TABLE public\\.${table} TO authenticated;`));
    assert.match(combinedMigrations, new RegExp(`GRANT ${serviceRolePrivileges[table]} ON TABLE public\\.${table} TO service_role;`));
  }

  const normalized = stripSqlCommentsAndStrings(combinedMigrations);
  assert.doesNotMatch(normalized, /\bGRANT\s+[^;]*(DELETE|TRUNCATE|REFERENCES|TRIGGER|MAINTAIN)/i);
  assert.doesNotMatch(normalized, /\bGRANT\s+[^;]*\bTO\s+(anon|PUBLIC)\b/i);
  assert.doesNotMatch(combinedMigrations, /FOR (INSERT|UPDATE) TO authenticated/i);
  assert.match(combinedMigrations, /canonical_actor_can_access_brand\(marca_id, auth\.uid\(\)/);
});

test("append-only and trigger functions are restricted and not public RPCs", () => {
  for (const functionName of [
    "pipeline_editorial_protect_append_only",
    "pipeline_editorial_touch_updated_at",
    "pipeline_editorial_touch_lock_version",
    "pipeline_editorial_validate_artifact_source",
  ]) {
    assert.match(combinedMigrations, new RegExp(`CREATE FUNCTION public\\.${functionName}`));
    const functionStart = combinedMigrations.indexOf(`CREATE FUNCTION public.${functionName}`);
    const functionEnd = combinedMigrations.indexOf("$$;", functionStart);
    const definition = combinedMigrations.slice(functionStart, functionEnd + 3);
    assert.match(definition, /SECURITY INVOKER/);
    assert.match(definition, /SET search_path = pg_catalog, public, pg_temp/);
    assert.match(combinedMigrations, new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}\\(\\)`));
  }
});

test("read-only verifiers are fixed-version single-result catalog checks", () => {
  const names = [
    "pipeline-editorial-schema-preflight-read-only.sql",
    "pipeline-editorial-schema-post-verifier-read-only.sql",
    "canonical-brand-authorization-diagnostic-read-only.sql",
  ];

  for (const name of names) {
    const sql = readOnlyScript(name);
    const normalized = stripSqlCommentsAndStrings(sql);
    assert.equal((normalized.match(/;/g) ?? []).length, 1, `${name} must contain one statement`);
    assert.doesNotMatch(normalized, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i, name);
    assert.match(sql, /script_version/);
    if (name.startsWith("pipeline-editorial")) assert.match(sql, /FROM checks\s+ORDER BY/i);
    else assert.match(sql, /FROM\s*\(\s*SELECT \* FROM summary_rows/i);
    if (name.startsWith("pipeline-editorial")) {
      for (const table of targetTables) assert.match(sql, new RegExp(table));
    }
  }

  const fixedVersions: Record<string, string> = {
    "pipeline-editorial-schema-preflight-read-only.sql": "2026-08-11-pipeline-editorial-schema-preflight-v4",
    "pipeline-editorial-schema-post-verifier-read-only.sql": "2026-08-11-pipeline-editorial-schema-post-verifier-v2",
    "canonical-brand-authorization-diagnostic-read-only.sql": "2026-08-11-canonical-brand-authorization-diagnostic-v2",
  };
  for (const [name, version] of Object.entries(fixedVersions)) {
    const sql = readOnlyScript(name);
    assert.match(sql, new RegExp(version));
    assert.ok((sql.match(new RegExp(version, "g")) ?? []).length >= 2, `${name} must expose its fixed version in output`);
  }
});

test("to_regprocedure-style resolution ignores parameter names and rejects wrong schemas and overloads", () => {
  const access = {
    oid: 101,
    schema: "public",
    name: "canonical_actor_can_access_brand",
    identityArguments: "target_brand_id uuid, target_actor_user_id uuid",
    argumentTypes: ["uuid", "uuid"],
  } satisfies CatalogFunctionFixture;
  const action = {
    oid: 102,
    schema: "public",
    name: "canonical_actor_can_use_brand_action",
    identityArguments: "target_brand_id uuid, target_actor_user_id uuid, requested_module text, requested_action text",
    argumentTypes: ["uuid", "uuid", "text", "text"],
  } satisfies CatalogFunctionFixture;

  assert.match(access.identityArguments, /target_brand_id uuid/);
  assert.equal(matchesExactCatalogSignature(access, "public", "canonical_actor_can_access_brand", ["uuid", "uuid"]), true);
  assert.equal(matchesExactCatalogSignature(action, "public", "canonical_actor_can_use_brand_action", ["uuid", "uuid", "text", "text"]), true);
  assert.equal(matchesExactCatalogSignature(access, "public", "canonical_actor_can_access_brand", ["uuid", "text"]), false);
  assert.equal(matchesExactCatalogSignature(access, "private", "canonical_actor_can_access_brand", ["uuid", "uuid"]), false);
  assert.equal(matchesExactCatalogSignature({ ...access, argumentTypes: ["uuid", "uuid", "text"] }, "public", access.name, ["uuid", "uuid"]), false);

  const catalogRows = [
    access,
    action,
    { ...access, oid: 103, argumentTypes: ["uuid", "uuid", "text"] },
    { ...access, oid: 104, schema: "private" },
    { ...access, oid: 105, kind: "p" as const },
  ];
  assert.equal(resolveProcedureByIdentity(catalogRows, "public.canonical_actor_can_access_brand(uuid,uuid)"), 101);
  assert.equal(resolveProcedureByIdentity(catalogRows, "public.canonical_actor_can_access_brand(uuid,text)"), null);
  assert.equal(resolveProcedureByIdentity(catalogRows, "public.canonical_actor_can_access_brand(uuid,uuid,text)"), 103);
  assert.equal(resolveProcedureByIdentity(catalogRows.filter((row) => row.oid === 103), "public.canonical_actor_can_access_brand(uuid,uuid)"), null);
  assert.equal(resolveProcedureByIdentity(catalogRows.filter((row) => row.oid === 104), "public.canonical_actor_can_access_brand(uuid,uuid)"), null);
  assert.equal(resolveProcedureByIdentity(catalogRows.filter((row) => row.oid === 105), "public.canonical_actor_can_access_brand(uuid,uuid)"), null);
  assert.equal(resolveProcedureByIdentity(catalogRows, "public.canonical_actor_can_access_brand(uuid,uuid,boolean)"), null);

  const contractRows: HelperContractFixture[] = [
    {
      ...access,
      owner: "postgres",
      returnsBoolean: true,
      securityDefiner: true,
      stable: true,
      searchPath: "pg_catalog, public, pg_temp",
      anonExecute: false,
      authenticatedExecute: true,
      serviceRoleExecute: true,
    },
    {
      ...action,
      owner: "wrong_owner",
      returnsBoolean: true,
      securityDefiner: true,
      stable: true,
      searchPath: "pg_catalog, public, pg_temp",
      anonExecute: false,
      authenticatedExecute: true,
      serviceRoleExecute: true,
    },
  ];
  assert.deepEqual(evaluateHelper(contractRows, "public.canonical_actor_can_access_brand(uuid,uuid)"), { presence: "PASS", contract: "PASS", acl: "PASS" });
  assert.deepEqual(evaluateHelper(contractRows, "public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)"), { presence: "PASS", contract: "FAIL", acl: "PASS" });
  assert.deepEqual(evaluateHelper(contractRows, "public.canonical_actor_can_access_brand(uuid,text)"), { presence: "FAIL", contract: "INFO", acl: "NOT_EVALUATED" });

  const preflight = readOnlyScript("pipeline-editorial-schema-preflight-read-only.sql");
  const diagnostic = readOnlyScript("canonical-brand-authorization-diagnostic-read-only.sql");
  assert.match(preflight, /to_regprocedure\('public\.canonical_actor_can_access_brand\(uuid,uuid\)'\)::oid/);
  assert.match(preflight, /to_regprocedure\('public\.canonical_actor_can_use_brand_action\(uuid,uuid,text,text\)'\)::oid/);
  assert.match(preflight, /LEFT JOIN pg_proc p ON p\.oid = h\.resolved_oid/);
  assert.doesNotMatch(preflight, /proargtypes/);
  assert.doesNotMatch(preflight, /pg_get_function_identity_arguments\(p\.oid\)/);
  assert.match(diagnostic, /p\.proargtypes::oid\[\]\s+AS argument_type_oids/);
});

test("migrations contain no data backfill, provider, runtime, or consumer adaptation", () => {
  const normalized = stripSqlCommentsAndStrings(combinedMigrations);
  assert.doesNotMatch(normalized, /\b(INSERT\s+INTO|UPDATE\s+[^;]*\s+SET|DELETE\s+FROM|MERGE\s+INTO)\b/i);
  assert.doesNotMatch(combinedMigrations, /https?:\/\//i);
  assert.doesNotMatch(combinedMigrations, /resend|vault|dataforseo|google_ads|openrouter|deepseek/i);
  assert.doesNotMatch(combinedMigrations, /CREATE\s+(OR\s+REPLACE\s+)?(VIEW|PROCEDURE)/i);
});
