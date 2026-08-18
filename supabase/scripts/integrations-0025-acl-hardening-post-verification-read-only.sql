-- Pós-verificador read-only da 0025.
-- Prova a ACL final sem ler linhas privadas e sem alterar objetos ou dados.
-- Um único result set; DATA_DELTA esperado = 0.

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
  SELECT e.table_name, e.table_kind, c.oid, pg_get_userbyid(c.relowner) AS owner_role, c.relrowsecurity
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || e.table_name)
),
policy_counts AS (
  SELECT e.table_name, count(p.policyname)::integer AS policy_count
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_policies p ON p.schemaname = 'public' AND p.tablename = e.table_name
  GROUP BY e.table_name
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
    CASE WHEN current_setting('server_version_num')::integer >= 150000 THEN has_table_privilege('service_role', r.oid, 'MAINTAIN') ELSE NULL END AS service_maintain,
    has_table_privilege('authenticated', r.oid, 'SELECT') AS authenticated_select,
    has_table_privilege('authenticated', r.oid, 'INSERT') AS authenticated_insert,
    has_table_privilege('authenticated', r.oid, 'UPDATE') AS authenticated_update,
    has_table_privilege('authenticated', r.oid, 'DELETE') AS authenticated_delete,
    has_table_privilege('anon', r.oid, 'SELECT') AS anon_select,
    has_table_privilege('anon', r.oid, 'INSERT') AS anon_insert,
    has_table_privilege('anon', r.oid, 'UPDATE') AS anon_update,
    has_table_privilege('anon', r.oid, 'DELETE') AS anon_delete
  FROM relation_catalog r
),
expected_constraints(constraint_name) AS (
  VALUES
    ('ck_integration_connections_owner_scope_0024'), ('ck_integration_grants_target_scope_0024'), ('ck_integration_grants_source_scope_0024'), ('ck_integration_grants_hierarchy_0024'), ('ck_integration_grants_dates_0024'), ('ck_integration_grants_status_dates_0024'), ('ck_integration_bindings_target_scope_0024'), ('ck_integration_bindings_source_0024'), ('ck_integration_bindings_target_source_0024'), ('ck_integration_quota_scope_0024'), ('ck_integration_quota_period_0024'), ('ck_integration_usage_module_scope_0024'), ('uq_integration_providers_key_0024'), ('uq_integration_capabilities_key_0024'), ('uq_integration_connections_id_provider_0024'), ('fk_integration_usage_connection_provider_0024'), ('uq_integration_usage_events_idempotency_0024')
),
expected_indexes(index_name) AS (
  VALUES
    ('uq_integration_connections_active_owner_0024'), ('uq_integration_grants_active_target_0024'), ('uq_integration_bindings_active_target_0024'), ('uq_integration_quota_active_scope_0024'), ('ix_integration_connections_provider_status_0024'), ('ix_integration_grants_source_agency_0024'), ('ix_integration_bindings_connection_0024'), ('ix_integration_usage_events_scope_time_0024'), ('ix_integration_usage_events_provider_time_0024')
),
checks AS (
  SELECT 'script_version'::text AS check_name, '2026-08-11-integrations-0025-acl-hardening-post-v1'::text AS expected, '2026-08-11-integrations-0025-acl-hardening-post-v1'::text AS observed, 'INFO'::text AS verdict
  UNION ALL
  SELECT 'table:' || table_name, 'present; owner=postgres; RLS enabled; policy present', CASE WHEN r.oid IS NULL THEN 'missing' ELSE 'owner=' || r.owner_role || '; rls=' || r.relrowsecurity::text || '; policies=' || p.policy_count::text END, CASE WHEN r.oid IS NOT NULL AND r.owner_role = 'postgres' AND r.relrowsecurity AND p.policy_count >= 1 THEN 'PASS' ELSE 'FAIL' END FROM relation_catalog r JOIN policy_counts p USING (table_name)
  UNION ALL
  SELECT 'acl:' || table_name, CASE WHEN table_kind = 'catalog' THEN 'service_role SELECT/INSERT/UPDATE only' ELSE 'service_role SELECT/INSERT only' END, 'service_role(select=' || service_select::text || ',insert=' || service_insert::text || ',update=' || service_update::text || ',delete=' || service_delete::text || ',truncate=' || service_truncate::text || ',references=' || service_references::text || ',trigger=' || service_trigger::text || ',maintain=' || coalesce(service_maintain::text, 'unsupported') || '); authenticated(select=' || authenticated_select::text || ',insert=' || authenticated_insert::text || ',update=' || authenticated_update::text || ',delete=' || authenticated_delete::text || '); anon(select=' || anon_select::text || ',insert=' || anon_insert::text || ',update=' || anon_update::text || ',delete=' || anon_delete::text || ')', CASE WHEN oid IS NOT NULL AND ((table_kind = 'catalog' AND service_select AND service_insert AND service_update AND NOT service_delete AND NOT service_truncate AND NOT service_references AND NOT service_trigger AND (service_maintain IS FALSE OR current_setting('server_version_num')::integer < 150000)) OR (table_kind = 'ledger' AND service_select AND service_insert AND NOT service_update AND NOT service_delete AND NOT service_truncate AND NOT service_references AND NOT service_trigger AND (service_maintain IS FALSE OR current_setting('server_version_num')::integer < 150000))) AND authenticated_select AND NOT authenticated_insert AND NOT authenticated_update AND NOT authenticated_delete AND NOT anon_select AND NOT anon_insert AND NOT anon_update AND NOT anon_delete THEN 'PASS' ELSE 'FAIL' END FROM privileges
  UNION ALL
  SELECT 'fk:on_delete_restrict', 'all 0024 declared FKs remain RESTRICT', count(*)::text || ' total; ' || count(*) FILTER (WHERE con.confdeltype = 'r')::text || ' RESTRICT', CASE WHEN count(*) > 0 AND count(*) = count(*) FILTER (WHERE con.confdeltype = 'r') THEN 'PASS' ELSE 'FAIL' END FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace WHERE con.contype = 'f' AND n.nspname = 'public' AND rel.relname IN (SELECT table_name FROM expected_tables)
  UNION ALL
  SELECT 'constraints:0024_preserved', '17 named constraints present', count(c.conname)::text, CASE WHEN count(c.conname) = (SELECT count(*) FROM expected_constraints) THEN 'PASS' ELSE 'FAIL' END FROM expected_constraints e LEFT JOIN pg_catalog.pg_constraint c ON c.conname = e.constraint_name
  UNION ALL
  SELECT 'indexes:0024_preserved', '9 named indexes present', count(i.indexname)::text, CASE WHEN count(i.indexname) = (SELECT count(*) FROM expected_indexes) THEN 'PASS' ELSE 'FAIL' END FROM expected_indexes e LEFT JOIN pg_catalog.pg_indexes i ON i.schemaname = 'public' AND i.indexname = e.index_name
  UNION ALL
  SELECT 'trigger:grant_scope', 'present', CASE WHEN to_regclass('public.integration_grants') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trg_integration_grants_validate_scope_0024') THEN 'present' ELSE 'missing' END, CASE WHEN to_regclass('public.integration_grants') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trg_integration_grants_validate_scope_0024') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'trigger:binding_scope', 'present', CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trg_integration_bindings_validate_scope_0024') THEN 'present' ELSE 'missing' END, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trg_integration_bindings_validate_scope_0024') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'trigger:usage_append_only', 'present', CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trg_integration_usage_events_append_only_0024') AND to_regprocedure('public.integration_usage_events_prevent_mutation()') IS NOT NULL THEN 'present' ELSE 'missing' END, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trg_integration_usage_events_append_only_0024') AND to_regprocedure('public.integration_usage_events_prevent_mutation()') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'data_delta:0025', '0 rows changed by 0025; all seven tables remain empty baseline', sum(row_count)::text, CASE WHEN sum(row_count) = 0 THEN 'PASS' ELSE 'FAIL' END FROM (SELECT count(*)::bigint AS row_count FROM public.integration_providers UNION ALL SELECT count(*) FROM public.integration_capabilities UNION ALL SELECT count(*) FROM public.integration_connections UNION ALL SELECT count(*) FROM public.integration_grants UNION ALL SELECT count(*) FROM public.integration_bindings UNION ALL SELECT count(*) FROM public.integration_quota_policies UNION ALL SELECT count(*) FROM public.integration_usage_events) counts
  UNION ALL
  SELECT 'usage:idempotency_append_only', 'idempotency constraint and append-only trigger preserved', CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'uq_integration_usage_events_idempotency_0024') AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trg_integration_usage_events_append_only_0024') THEN 'present' ELSE 'missing' END, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'uq_integration_usage_events_idempotency_0024') AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'trg_integration_usage_events_append_only_0024') THEN 'PASS' ELSE 'FAIL' END
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY CASE WHEN verdict = 'FAIL' THEN 0 WHEN verdict = 'PASS' THEN 1 ELSE 2 END, check_name;
