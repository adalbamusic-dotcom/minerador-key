-- Preflight read-only da 0025.
-- Confirma a pré-condição ACL ampla e que o hardening ainda não foi aplicado.
-- Um único result set; não lê linhas de negócio e não altera objetos ou dados.

WITH expected_tables(table_name, table_kind) AS (
  VALUES
    ('integration_providers', 'catalog'),
    ('integration_capabilities', 'catalog'),
    ('integration_connections', 'catalog'),
    ('integration_grants', 'catalog'),
    ('integration_bindings', 'catalog'),
    ('integration_quota_policies', 'catalog'),
    ('integration_usage_events', 'ledger')
),
relation_catalog AS (
  SELECT
    e.table_name,
    e.table_kind,
    c.oid,
    CASE WHEN c.oid IS NULL THEN 'missing' ELSE pg_get_userbyid(c.relowner) END AS owner_role,
    CASE WHEN c.oid IS NULL THEN NULL ELSE c.relrowsecurity END AS rls_enabled,
    CASE WHEN c.oid IS NULL THEN 0 ELSE count(p.policyname)::integer END AS policy_count,
    CASE WHEN c.oid IS NULL THEN 'missing' ELSE coalesce(array_to_string(c.relacl, ', '), 'NULL (owner/default)') END AS relation_acl
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_class c
    ON c.oid = to_regclass('public.' || e.table_name)
  LEFT JOIN pg_catalog.pg_policies p
    ON p.schemaname = 'public' AND p.tablename = e.table_name
  GROUP BY e.table_name, e.table_kind, c.oid, c.relowner, c.relrowsecurity, c.relacl
),
privileges AS (
  SELECT
    r.*,
    has_table_privilege('service_role', r.oid, 'SELECT') AS service_select,
    has_table_privilege('service_role', r.oid, 'INSERT') AS service_insert,
    has_table_privilege('service_role', r.oid, 'UPDATE') AS service_update,
    has_table_privilege('service_role', r.oid, 'DELETE') AS service_delete,
    has_table_privilege('service_role', r.oid, 'TRUNCATE') AS service_truncate,
    has_table_privilege('service_role', r.oid, 'REFERENCES') AS service_references,
    has_table_privilege('service_role', r.oid, 'TRIGGER') AS service_trigger,
    CASE
      WHEN current_setting('server_version_num')::integer >= 150000
        THEN has_table_privilege('service_role', r.oid, 'MAINTAIN')
      ELSE NULL
    END AS service_maintain
  FROM relation_catalog r
),
default_acl AS (
  SELECT coalesce(string_agg(
    pg_get_userbyid(d.defaclrole) || '=' || coalesce(array_to_string(d.defaclacl, ', '), 'NULL'),
    ' | ' ORDER BY pg_get_userbyid(d.defaclrole)
  ), 'none observed for postgres/supabase_admin') AS observed
  FROM pg_catalog.pg_default_acl d
  JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND d.defaclobjtype = 'r'
    AND pg_get_userbyid(d.defaclrole) IN ('postgres', 'supabase_admin')
),
preflight_rows AS (
  SELECT
    'script_version'::text AS check_name,
    '2026-08-11-integrations-0025-acl-hardening-preflight-v1'::text AS expected,
    '2026-08-11-integrations-0025-acl-hardening-preflight-v1'::text AS observed,
    'INFO'::text AS verdict
  UNION ALL
  SELECT
    'precondition:table:' || table_name,
    'present; owner=postgres; RLS enabled; policy present',
    CASE WHEN oid IS NULL THEN 'missing'
      ELSE 'owner=' || owner_role || '; rls=' || rls_enabled::text || '; policies=' || policy_count::text
    END,
    CASE WHEN oid IS NOT NULL AND owner_role = 'postgres' AND rls_enabled AND policy_count >= 1 THEN 'PASS' ELSE 'FAIL' END
  FROM privileges
  UNION ALL
  SELECT
    'precondition:acl:' || table_name,
    'service_role currently broad on 0024 table',
    CASE WHEN oid IS NULL THEN 'missing'
      ELSE 'select=' || service_select::text || '; insert=' || service_insert::text
        || '; update=' || service_update::text || '; delete=' || service_delete::text
        || '; truncate=' || service_truncate::text || '; references=' || service_references::text
        || '; trigger=' || service_trigger::text || '; maintain=' || coalesce(service_maintain::text, 'unsupported')
        || '; acl=' || relation_acl
    END,
    CASE WHEN oid IS NOT NULL
      AND service_select AND service_insert AND service_update AND service_delete
      AND service_truncate AND service_references AND service_trigger
      AND (service_maintain OR current_setting('server_version_num')::integer < 150000)
      THEN 'PASS' ELSE 'FAIL' END
  FROM privileges
  UNION ALL
  SELECT
    'precondition:0025_not_applied',
    '0 tables already match final 0025 service_role contract',
    count(*) FILTER (WHERE oid IS NOT NULL AND (
      (table_kind = 'catalog' AND service_select AND service_insert AND service_update AND NOT service_delete AND NOT service_truncate AND NOT service_references AND NOT service_trigger AND (service_maintain IS FALSE OR current_setting('server_version_num')::integer < 150000))
      OR (table_kind = 'ledger' AND service_select AND service_insert AND NOT service_update AND NOT service_delete AND NOT service_truncate AND NOT service_references AND NOT service_trigger AND (service_maintain IS FALSE OR current_setting('server_version_num')::integer < 150000))
    ))::text,
    CASE WHEN count(*) FILTER (WHERE oid IS NOT NULL AND (
      (table_kind = 'catalog' AND service_select AND service_insert AND service_update AND NOT service_delete AND NOT service_truncate AND NOT service_references AND NOT service_trigger AND (service_maintain IS FALSE OR current_setting('server_version_num')::integer < 150000))
      OR (table_kind = 'ledger' AND service_select AND service_insert AND NOT service_update AND NOT service_delete AND NOT service_truncate AND NOT service_references AND NOT service_trigger AND (service_maintain IS FALSE OR current_setting('server_version_num')::integer < 150000))
    )) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM privileges
  UNION ALL
  SELECT 'precondition:default_acl'::text, 'catalog only; unchanged by 0025'::text, observed, 'INFO'::text FROM default_acl
)
SELECT check_name, expected, observed, verdict
FROM preflight_rows
ORDER BY CASE WHEN verdict = 'FAIL' THEN 0 WHEN verdict = 'PASS' THEN 1 ELSE 2 END, check_name;
