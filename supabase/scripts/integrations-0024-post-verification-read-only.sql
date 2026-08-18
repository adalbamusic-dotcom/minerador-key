-- Verificador remoto read-only da 0024. Retorna um único result set e não
-- expõe linhas, UUIDs, referências de segredo, metadados ou payloads.

WITH expected_tables(table_name) AS (
  VALUES
    ('integration_providers'),
    ('integration_capabilities'),
    ('integration_connections'),
    ('integration_grants'),
    ('integration_bindings'),
    ('integration_quota_policies'),
    ('integration_usage_events')
),
relation_oids AS (
  SELECT e.table_name, c.oid
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_class c
    ON c.oid = to_regclass('public.' || e.table_name)
),
existing_relation_oids AS (
  SELECT table_name, oid
  FROM relation_oids
  WHERE oid IS NOT NULL
),
expected_columns(table_name, column_name) AS (
  VALUES
    ('integration_providers', 'id'), ('integration_providers', 'provider_key'), ('integration_providers', 'display_name'), ('integration_providers', 'status'), ('integration_providers', 'created_at'), ('integration_providers', 'updated_at'),
    ('integration_capabilities', 'id'), ('integration_capabilities', 'capability_key'), ('integration_capabilities', 'operation_kind'), ('integration_capabilities', 'environment'), ('integration_capabilities', 'unit_name'), ('integration_capabilities', 'status'), ('integration_capabilities', 'created_at'), ('integration_capabilities', 'updated_at'),
    ('integration_connections', 'id'), ('integration_connections', 'provider_id'), ('integration_connections', 'owner_scope_type'), ('integration_connections', 'owner_agency_id'), ('integration_connections', 'owner_brand_id'), ('integration_connections', 'environment'), ('integration_connections', 'lifecycle_status'), ('integration_connections', 'secret_ref'), ('integration_connections', 'metadata'), ('integration_connections', 'created_by_user_id'), ('integration_connections', 'created_at'), ('integration_connections', 'updated_at'),
    ('integration_grants', 'id'), ('integration_grants', 'capability_id'), ('integration_grants', 'target_scope_type'), ('integration_grants', 'target_agency_id'), ('integration_grants', 'target_brand_id'), ('integration_grants', 'source_scope_type'), ('integration_grants', 'source_agency_id'), ('integration_grants', 'environment'), ('integration_grants', 'lifecycle_status'), ('integration_grants', 'starts_at'), ('integration_grants', 'ends_at'), ('integration_grants', 'reason'), ('integration_grants', 'created_by_user_id'), ('integration_grants', 'created_at'), ('integration_grants', 'updated_at'),
    ('integration_bindings', 'id'), ('integration_bindings', 'capability_id'), ('integration_bindings', 'target_scope_type'), ('integration_bindings', 'target_agency_id'), ('integration_bindings', 'target_brand_id'), ('integration_bindings', 'environment'), ('integration_bindings', 'source_kind'), ('integration_bindings', 'connection_id'), ('integration_bindings', 'grant_id'), ('integration_bindings', 'external_account_ref'), ('integration_bindings', 'lifecycle_status'), ('integration_bindings', 'created_by_user_id'), ('integration_bindings', 'created_at'), ('integration_bindings', 'updated_at'),
    ('integration_quota_policies', 'id'), ('integration_quota_policies', 'capability_id'), ('integration_quota_policies', 'scope_type'), ('integration_quota_policies', 'agency_id'), ('integration_quota_policies', 'brand_id'), ('integration_quota_policies', 'environment'), ('integration_quota_policies', 'window_kind'), ('integration_quota_policies', 'limit_units'), ('integration_quota_policies', 'status'), ('integration_quota_policies', 'period_started_at'), ('integration_quota_policies', 'period_ends_at'), ('integration_quota_policies', 'created_by_user_id'), ('integration_quota_policies', 'created_at'), ('integration_quota_policies', 'updated_at'),
    ('integration_usage_events', 'id'), ('integration_usage_events', 'actor_user_id'), ('integration_usage_events', 'provider_id'), ('integration_usage_events', 'connection_id'), ('integration_usage_events', 'capability_id'), ('integration_usage_events', 'agency_id'), ('integration_usage_events', 'brand_id'), ('integration_usage_events', 'operation_kind'), ('integration_usage_events', 'module'), ('integration_usage_events', 'environment'), ('integration_usage_events', 'units'), ('integration_usage_events', 'unit_name'), ('integration_usage_events', 'cost_amount'), ('integration_usage_events', 'currency_code'), ('integration_usage_events', 'result_status'), ('integration_usage_events', 'error_code'), ('integration_usage_events', 'provider_request_ref'), ('integration_usage_events', 'idempotency_key'), ('integration_usage_events', 'metadata'), ('integration_usage_events', 'occurred_at'), ('integration_usage_events', 'created_at')
),
column_summary AS (
  SELECT e.table_name, count(*)::integer AS expected_count, count(c.column_name)::integer AS observed_count
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.table_name
   AND c.column_name = e.column_name
  GROUP BY e.table_name
),
table_checks AS (
  SELECT
    'table:' || table_name AS check_name,
    'present'::text AS expected,
    CASE WHEN oid IS NULL THEN 'absent' ELSE 'present' END AS observed,
    CASE WHEN oid IS NULL THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM relation_oids
),
column_checks AS (
  SELECT
    'columns:' || table_name AS check_name,
    expected_count::text || ' expected' AS expected,
    observed_count::text || ' present' AS observed,
    CASE WHEN observed_count = expected_count THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM column_summary
),
rls_checks AS (
  SELECT
    'rls:' || r.table_name AS check_name,
    'enabled'::text AS expected,
    CASE WHEN c.relrowsecurity THEN 'enabled' ELSE 'disabled' END AS observed,
    CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM relation_oids r
  LEFT JOIN pg_catalog.pg_class c ON c.oid = r.oid
),
policy_summary AS (
  SELECT e.table_name, count(p.policyname)::integer AS observed_count
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_policies p
    ON p.schemaname = 'public' AND p.tablename = e.table_name
  GROUP BY e.table_name
),
policy_checks AS (
  SELECT
    'policies:' || table_name AS check_name,
    'at least 1'::text AS expected,
    observed_count::text AS observed,
    CASE WHEN observed_count >= 1 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM policy_summary
),
acl_checks AS (
  SELECT
    'acl:anon_no_select'::text AS check_name,
    '0 of 7 private tables grant SELECT'::text AS expected,
    count(*) FILTER (WHERE has_table_privilege('anon', oid, 'SELECT'))::text || ' grants' AS observed,
    CASE WHEN count(*) = 7 AND count(*) FILTER (WHERE has_table_privilege('anon', oid, 'SELECT')) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM existing_relation_oids
  UNION ALL
  SELECT
    'acl:authenticated_no_direct_write',
    '0 of 7 tables grant INSERT/UPDATE/DELETE',
    count(*) FILTER (WHERE has_table_privilege('authenticated', oid, 'INSERT') OR has_table_privilege('authenticated', oid, 'UPDATE') OR has_table_privilege('authenticated', oid, 'DELETE'))::text || ' writable',
    CASE WHEN count(*) = 7 AND count(*) FILTER (WHERE has_table_privilege('authenticated', oid, 'INSERT') OR has_table_privilege('authenticated', oid, 'UPDATE') OR has_table_privilege('authenticated', oid, 'DELETE')) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM existing_relation_oids
  UNION ALL
  SELECT
    'acl:service_role_catalog_write',
    '6 catalog tables grant SELECT/INSERT/UPDATE',
    count(*) FILTER (WHERE table_name <> 'integration_usage_events' AND has_table_privilege('service_role', oid, 'SELECT') AND has_table_privilege('service_role', oid, 'INSERT') AND has_table_privilege('service_role', oid, 'UPDATE'))::text || ' ready',
    CASE WHEN count(*) = 7 AND count(*) FILTER (WHERE table_name <> 'integration_usage_events' AND has_table_privilege('service_role', oid, 'SELECT') AND has_table_privilege('service_role', oid, 'INSERT') AND has_table_privilege('service_role', oid, 'UPDATE')) = 6 THEN 'PASS' ELSE 'FAIL' END
  FROM existing_relation_oids
  UNION ALL
  SELECT
    'acl:service_role_usage_append',
    'usage table grants SELECT/INSERT without UPDATE/DELETE',
    CASE WHEN has_table_privilege('service_role', oid, 'SELECT') AND has_table_privilege('service_role', oid, 'INSERT') AND NOT has_table_privilege('service_role', oid, 'UPDATE') AND NOT has_table_privilege('service_role', oid, 'DELETE') THEN 'ready' ELSE 'not ready' END,
    CASE WHEN has_table_privilege('service_role', oid, 'SELECT') AND has_table_privilege('service_role', oid, 'INSERT') AND NOT has_table_privilege('service_role', oid, 'UPDATE') AND NOT has_table_privilege('service_role', oid, 'DELETE') THEN 'PASS' ELSE 'FAIL' END
  FROM existing_relation_oids
  WHERE table_name = 'integration_usage_events'
),
fk_summary AS (
  SELECT count(*)::integer AS total_fks, count(*) FILTER (WHERE con.confdeltype = 'r')::integer AS restrict_fks
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
  WHERE con.contype = 'f' AND n.nspname = 'public' AND rel.relname IN (SELECT table_name FROM expected_tables)
),
fk_checks AS (
  SELECT
    'foreign_keys:on_delete_restrict'::text AS check_name,
    'all declared FKs use RESTRICT'::text AS expected,
    total_fks::text || ' total; ' || restrict_fks::text || ' RESTRICT' AS observed,
    CASE WHEN total_fks > 0 AND total_fks = restrict_fks THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM fk_summary
),
expected_constraints(constraint_name) AS (
  VALUES
    ('ck_integration_connections_owner_scope_0024'),
    ('ck_integration_grants_target_scope_0024'),
    ('ck_integration_grants_source_scope_0024'),
    ('ck_integration_grants_hierarchy_0024'),
    ('ck_integration_grants_dates_0024'),
    ('ck_integration_grants_status_dates_0024'),
    ('ck_integration_bindings_target_scope_0024'),
    ('ck_integration_bindings_source_0024'),
    ('ck_integration_bindings_target_source_0024'),
    ('ck_integration_quota_scope_0024'),
    ('ck_integration_quota_period_0024'),
    ('ck_integration_usage_module_scope_0024'),
    ('uq_integration_providers_key_0024'),
    ('uq_integration_capabilities_key_0024'),
    ('uq_integration_connections_id_provider_0024'),
    ('fk_integration_usage_connection_provider_0024'),
    ('uq_integration_usage_events_idempotency_0024')
),
constraint_checks AS (
  SELECT
    'constraints:named_contracts'::text AS check_name,
    (SELECT count(*) FROM expected_constraints)::text || ' expected' AS expected,
    count(c.conname)::text || ' present' AS observed,
    CASE WHEN count(c.conname) = (SELECT count(*) FROM expected_constraints) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM expected_constraints e
  LEFT JOIN pg_catalog.pg_constraint c ON c.conname = e.constraint_name
),
expected_indexes(index_name) AS (
  VALUES
    ('uq_integration_connections_active_owner_0024'),
    ('uq_integration_grants_active_target_0024'),
    ('uq_integration_bindings_active_target_0024'),
    ('uq_integration_quota_active_scope_0024'),
    ('ix_integration_connections_provider_status_0024'),
    ('ix_integration_grants_source_agency_0024'),
    ('ix_integration_bindings_connection_0024'),
    ('ix_integration_usage_events_scope_time_0024'),
    ('ix_integration_usage_events_provider_time_0024')
),
index_checks AS (
  SELECT
    'indexes:contract'::text AS check_name,
    (SELECT count(*) FROM expected_indexes)::text || ' expected' AS expected,
    count(i.indexname)::text || ' present' AS observed,
    CASE WHEN count(i.indexname) = (SELECT count(*) FROM expected_indexes) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM expected_indexes e
  LEFT JOIN pg_catalog.pg_indexes i ON i.schemaname = 'public' AND i.indexname = e.index_name
),
forbidden_columns AS (
  SELECT count(*)::integer AS observed_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN (SELECT table_name FROM expected_tables)
    AND lower(column_name) IN ('api_key', 'password', 'raw_token', 'token_plaintext', 'credential_plaintext', 'private_key')
),
secret_checks AS (
  SELECT
    'security:no_raw_secret_columns'::text AS check_name,
    '0 forbidden raw-secret columns'::text AS expected,
    observed_count::text AS observed,
    CASE WHEN observed_count = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM forbidden_columns
),
capability_provider_independence AS (
  SELECT
    'capability:provider_independence'::text AS check_name,
    'capability has no mandatory provider_id/FK'::text AS expected,
    CASE WHEN to_regclass('public.integration_capabilities') IS NULL THEN 'table absent' ELSE 'provider_id_columns=' || count(c.column_name)::text || '; provider_fks=' || (
      SELECT count(*)::text
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
      JOIN pg_catalog.pg_class target_rel ON target_rel.oid = c.confrelid
      WHERE rel.oid = to_regclass('public.integration_capabilities')
        AND target_rel.oid = to_regclass('public.integration_providers')
        AND c.contype = 'f'
    ) END AS observed,
    CASE WHEN to_regclass('public.integration_capabilities') IS NOT NULL AND count(c.column_name) = 0 AND (
      SELECT count(*)
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
      JOIN pg_catalog.pg_class target_rel ON target_rel.oid = c.confrelid
      WHERE rel.oid = to_regclass('public.integration_capabilities')
        AND target_rel.oid = to_regclass('public.integration_providers')
        AND c.contype = 'f'
    ) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM (SELECT 1 AS marker) seed
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = 'integration_capabilities' AND c.column_name = 'provider_id'
),
legacy_preservation AS (
  SELECT 'legacy:relation:' || relation_name AS check_name, 'present after 0024'::text AS expected, CASE WHEN to_regclass('public.' || relation_name) IS NULL THEN 'missing' ELSE 'present' END AS observed, CASE WHEN to_regclass('public.' || relation_name) IS NULL THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM (VALUES ('agencies'), ('marcas'), ('agency_memberships'), ('agency_brands'), ('brand_memberships'), ('minerador_google_ads_connections')) AS legacy(relation_name)
),
external_account_policy AS (
  SELECT
    'binding:external_account_ref_policy'::text AS check_name,
    'nullable; no global unique constraint'::text AS expected,
    CASE WHEN count(c.column_name) = 0 THEN 'column absent; unique_indexes=' || max(unique_index_count)::text ELSE 'nullable=' || max(c.is_nullable) || '; unique_indexes=' || max(unique_index_count)::text END AS observed,
    CASE WHEN max(c.is_nullable) = 'YES' AND max(unique_index_count) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM (SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'integration_bindings' AND column_name = 'external_account_ref') c
  RIGHT JOIN (
    SELECT count(*)::integer AS unique_index_count
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class index_rel ON index_rel.oid = i.indexrelid
    JOIN pg_catalog.pg_class table_rel ON table_rel.oid = i.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = table_rel.relnamespace
    WHERE n.nspname = 'public' AND table_rel.relname = 'integration_bindings' AND i.indisunique AND pg_catalog.pg_get_indexdef(i.indexrelid) ILIKE '%external_account_ref%'
  ) index_summary ON true
),
expected_functions(function_name) AS (
  VALUES ('integration_grants_validate_scope'), ('integration_bindings_validate_scope'), ('integration_usage_events_prevent_mutation')
),
function_checks AS (
  SELECT
    'function:' || e.function_name AS check_name,
    'present, SECURITY INVOKER, restricted search_path and service_role EXECUTE'::text AS expected,
    CASE
      WHEN p.oid IS NULL THEN 'absent'
      ELSE 'present; ' || CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END || '; search_path=' || CASE WHEN array_to_string(p.proconfig, ';') ILIKE '%search_path=pg_catalog, public, pg_temp%' THEN 'restricted' ELSE 'not_confirmed' END || '; anon_execute=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text || '; authenticated_execute=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '; service_role_execute=' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text
    END AS observed,
    CASE WHEN p.oid IS NOT NULL AND NOT p.prosecdef AND array_to_string(p.proconfig, ';') ILIKE '%search_path=pg_catalog, public, pg_temp%' AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') AND has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM expected_functions e
  LEFT JOIN pg_catalog.pg_proc p
    ON p.proname = e.function_name
   AND p.pronamespace = 'public'::regnamespace
),
expected_triggers(trigger_name, relation_name) AS (
  VALUES
    ('trg_integration_grants_validate_scope_0024', 'integration_grants'),
    ('trg_integration_bindings_validate_scope_0024', 'integration_bindings'),
    ('trg_integration_usage_events_append_only_0024', 'integration_usage_events')
),
trigger_checks AS (
  SELECT
    'trigger:' || e.trigger_name AS check_name,
    'present'::text AS expected,
    CASE WHEN t.oid IS NULL THEN 'absent' ELSE 'present' END AS observed,
    CASE WHEN t.oid IS NULL THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM expected_triggers e
  LEFT JOIN pg_catalog.pg_trigger t
    ON t.tgname = e.trigger_name
   AND t.tgrelid = to_regclass('public.' || e.relation_name)
   AND NOT t.tgisinternal
),
count_checks AS (
  SELECT 'count:' || table_name AS check_name, 'metadata only'::text AS expected, count(*)::text AS observed, 'INFO'::text AS verdict
  FROM public.integration_providers
  CROSS JOIN (SELECT 'integration_providers'::text AS table_name) names
  GROUP BY table_name
  UNION ALL
  SELECT 'count:integration_capabilities', 'metadata only', count(*)::text, 'INFO' FROM public.integration_capabilities
  UNION ALL
  SELECT 'count:integration_connections', 'metadata only', count(*)::text, 'INFO' FROM public.integration_connections
  UNION ALL
  SELECT 'count:integration_grants', 'metadata only', count(*)::text, 'INFO' FROM public.integration_grants
  UNION ALL
  SELECT 'count:integration_bindings', 'metadata only', count(*)::text, 'INFO' FROM public.integration_bindings
  UNION ALL
  SELECT 'count:integration_quota_policies', 'metadata only', count(*)::text, 'INFO' FROM public.integration_quota_policies
  UNION ALL
  SELECT 'count:integration_usage_events', 'metadata only', count(*)::text, 'INFO' FROM public.integration_usage_events
),
all_checks AS (
  SELECT 'script_version'::text AS check_name, '2026-08-11-integrations-0024-post-v1'::text AS expected, '2026-08-11-integrations-0024-post-v1'::text AS observed, 'INFO'::text AS verdict
  UNION ALL SELECT * FROM table_checks
  UNION ALL SELECT * FROM column_checks
  UNION ALL SELECT * FROM rls_checks
  UNION ALL SELECT * FROM policy_checks
  UNION ALL SELECT * FROM acl_checks
  UNION ALL SELECT * FROM fk_checks
  UNION ALL SELECT * FROM constraint_checks
  UNION ALL SELECT * FROM index_checks
  UNION ALL SELECT * FROM secret_checks
  UNION ALL SELECT * FROM capability_provider_independence
  UNION ALL SELECT * FROM legacy_preservation
  UNION ALL SELECT * FROM external_account_policy
  UNION ALL SELECT * FROM function_checks
  UNION ALL SELECT * FROM trigger_checks
  UNION ALL SELECT * FROM count_checks
)
SELECT check_name, expected, observed, verdict
FROM all_checks
ORDER BY CASE WHEN verdict = 'FAIL' THEN 0 WHEN verdict = 'PASS' THEN 1 ELSE 2 END, check_name;
