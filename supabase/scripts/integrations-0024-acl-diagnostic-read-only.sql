-- Diagnóstico catalog-only da ACL da 0024.
-- Um único result set; não lê linhas das tabelas e não altera objetos ou dados.

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
    CASE WHEN c.oid IS NULL THEN 'missing' ELSE coalesce(array_to_string(c.relacl, ', '), 'NULL (owner/default)') END AS relation_acl,
    CASE WHEN c.oid IS NULL THEN 'not observable' WHEN c.relacl IS NULL THEN 'owner/default ACL at relation creation' ELSE 'explicit relation ACL present' END AS grant_origin_observable
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_class c
    ON c.oid = to_regclass('public.' || e.table_name)
),
default_acl_catalog AS (
  SELECT
    d.defaclnamespace,
    string_agg(
      pg_get_userbyid(d.defaclrole) || '=' || coalesce(array_to_string(d.defaclacl, ', '), 'NULL'),
      ' | ' ORDER BY pg_get_userbyid(d.defaclrole)
    ) AS relevant_default_acl
  FROM pg_catalog.pg_default_acl d
  JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND d.defaclobjtype = 'r'
    AND pg_get_userbyid(d.defaclrole) IN ('postgres', 'supabase_admin')
  GROUP BY d.defaclnamespace
),
service_role_memberships AS (
  SELECT coalesce(string_agg(parent.rolname, ', ' ORDER BY parent.rolname), 'none observed') AS inherited_roles
  FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles member ON member.oid = m.member
  JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
  WHERE member.rolname = 'service_role'
),
privilege_catalog AS (
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
    END AS service_maintain,
    has_table_privilege('anon', r.oid, 'SELECT') AS anon_select,
    has_table_privilege('anon', r.oid, 'INSERT') AS anon_insert,
    has_table_privilege('anon', r.oid, 'UPDATE') AS anon_update,
    has_table_privilege('anon', r.oid, 'DELETE') AS anon_delete,
    has_table_privilege('authenticated', r.oid, 'SELECT') AS authenticated_select,
    has_table_privilege('authenticated', r.oid, 'INSERT') AS authenticated_insert,
    has_table_privilege('authenticated', r.oid, 'UPDATE') AS authenticated_update,
    has_table_privilege('authenticated', r.oid, 'DELETE') AS authenticated_delete,
    d.relevant_default_acl,
    s.inherited_roles
  FROM relation_catalog r
  LEFT JOIN default_acl_catalog d ON true
  CROSS JOIN service_role_memberships s
),
diagnostic_rows AS (
  SELECT
    'script_version'::text AS check_name,
    '2026-08-11-integrations-0024-acl-diagnostic-v1'::text AS expected,
    '2026-08-11-integrations-0024-acl-diagnostic-v1'::text AS observed,
    'INFO'::text AS verdict
  UNION ALL
  SELECT
    'acl:' || table_name,
    table_kind || '; service_role contract by table kind',
    'owner=' || owner_role
      || '; rls=' || coalesce(rls_enabled::text, 'missing')
      || '; service_role(select=' || coalesce(service_select::text, 'missing')
      || ',insert=' || coalesce(service_insert::text, 'missing')
      || ',update=' || coalesce(service_update::text, 'missing')
      || ',delete=' || coalesce(service_delete::text, 'missing')
      || ',truncate=' || coalesce(service_truncate::text, 'missing')
      || ',references=' || coalesce(service_references::text, 'missing')
      || ',trigger=' || coalesce(service_trigger::text, 'missing')
      || ',maintain=' || coalesce(service_maintain::text, 'unsupported')
      || ')'
      || '; anon(select=' || coalesce(anon_select::text, 'missing')
      || ',insert=' || coalesce(anon_insert::text, 'missing')
      || ',update=' || coalesce(anon_update::text, 'missing')
      || ',delete=' || coalesce(anon_delete::text, 'missing')
      || ')'
      || '; authenticated(select=' || coalesce(authenticated_select::text, 'missing')
      || ',insert=' || coalesce(authenticated_insert::text, 'missing')
      || ',update=' || coalesce(authenticated_update::text, 'missing')
      || ',delete=' || coalesce(authenticated_delete::text, 'missing')
      || ')'
      || '; acl=' || relation_acl
      || '; origin=' || grant_origin_observable
      || '; service_role_inherited_roles=' || inherited_roles
      || '; default_acl=' || coalesce(relevant_default_acl, 'none observed for postgres/supabase_admin'),
    CASE
      WHEN oid IS NULL THEN 'FAIL'
      WHEN table_kind = 'catalog'
        AND service_select AND service_insert AND service_update
        AND NOT service_delete AND NOT service_truncate THEN 'PASS'
      WHEN table_kind = 'ledger'
        AND service_select AND service_insert
        AND NOT service_update AND NOT service_delete AND NOT service_truncate THEN 'PASS'
      ELSE 'FAIL'
    END
  FROM privilege_catalog
)
SELECT check_name, expected, observed, verdict
FROM diagnostic_rows
ORDER BY check_name;
