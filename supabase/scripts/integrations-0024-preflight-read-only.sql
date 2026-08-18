-- Preflight remoto read-only da 0024.
-- A ausência das sete tabelas novas é PASS antes da aplicação.
-- Um único result set; nenhum objeto é criado ou alterado.

WITH preflight_metadata AS (
  SELECT 'script_version'::text AS check_name, '2026-08-11-integrations-0024-preflight-v2'::text AS expected, '2026-08-11-integrations-0024-preflight-v2'::text AS observed, 'INFO'::text AS verdict
),
expected_relations(relation_name) AS (
  VALUES ('integration_providers'), ('integration_capabilities'), ('integration_connections'), ('integration_grants'), ('integration_bindings'), ('integration_quota_policies'), ('integration_usage_events')
),
relation_collision_checks AS (
  SELECT 'collision:relation:' || relation_name AS check_name, 'absent before 0024'::text AS expected, CASE WHEN to_regclass('public.' || relation_name) IS NULL THEN 'absent' ELSE 'present' END AS observed, CASE WHEN to_regclass('public.' || relation_name) IS NULL THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM expected_relations
),
expected_indexes(index_name) AS (
  VALUES ('uq_integration_connections_active_owner_0024'), ('uq_integration_grants_active_target_0024'), ('uq_integration_bindings_active_target_0024'), ('uq_integration_quota_active_scope_0024'), ('ix_integration_connections_provider_status_0024'), ('ix_integration_grants_source_agency_0024'), ('ix_integration_bindings_connection_0024'), ('ix_integration_usage_events_scope_time_0024'), ('ix_integration_usage_events_provider_time_0024')
),
index_collision_checks AS (
  SELECT 'collision:index:' || index_name AS check_name, 'absent before 0024'::text AS expected, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_indexes i WHERE i.schemaname = 'public' AND i.indexname = e.index_name) THEN 'present' ELSE 'absent' END AS observed, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_indexes i WHERE i.schemaname = 'public' AND i.indexname = e.index_name) THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM expected_indexes e
),
expected_constraints(constraint_name) AS (
  VALUES ('uq_integration_providers_key_0024'), ('uq_integration_capabilities_key_0024'), ('uq_integration_connections_id_provider_0024'), ('ck_integration_connections_owner_scope_0024'), ('ck_integration_grants_target_scope_0024'), ('ck_integration_grants_source_scope_0024'), ('ck_integration_grants_hierarchy_0024'), ('ck_integration_grants_dates_0024'), ('ck_integration_grants_status_dates_0024'), ('ck_integration_bindings_target_scope_0024'), ('ck_integration_bindings_source_0024'), ('ck_integration_bindings_target_source_0024'), ('ck_integration_quota_scope_0024'), ('ck_integration_quota_period_0024'), ('fk_integration_usage_connection_provider_0024'), ('ck_integration_usage_module_scope_0024'), ('uq_integration_usage_events_idempotency_0024')
),
constraint_collision_checks AS (
  SELECT 'collision:constraint:' || constraint_name AS check_name, 'absent before 0024'::text AS expected, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conname = e.constraint_name) THEN 'present' ELSE 'absent' END AS observed, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conname = e.constraint_name) THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM expected_constraints e
),
expected_functions(function_name, signature) AS (
  VALUES ('integration_grants_validate_scope', 'public.integration_grants_validate_scope()'), ('integration_bindings_validate_scope', 'public.integration_bindings_validate_scope()'), ('integration_usage_events_prevent_mutation', 'public.integration_usage_events_prevent_mutation()')
),
function_collision_checks AS (
  SELECT 'collision:function:' || function_name AS check_name, 'absent before 0024'::text AS expected, CASE WHEN to_regprocedure(signature) IS NULL THEN 'absent' ELSE 'present' END AS observed, CASE WHEN to_regprocedure(signature) IS NULL THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM expected_functions
),
related_types AS (
  SELECT count(*)::integer AS observed_count
  FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname LIKE 'integration_%'
),
type_checks AS (
  SELECT 'collision:integration_types'::text AS check_name, '0 related custom types before 0024'::text AS expected, observed_count::text AS observed, CASE WHEN observed_count = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM related_types
),
expected_dependencies(schema_name, relation_name, column_name) AS (
  VALUES ('auth', 'users', 'id'), ('public', 'agencies', 'id'), ('public', 'marcas', 'id'), ('public', 'agency_memberships', 'id'), ('public', 'agency_brands', 'agency_id'), ('public', 'brand_memberships', 'id')
),
dependency_checks AS (
  SELECT 'dependency:' || schema_name || '.' || relation_name || '.' || column_name AS check_name, 'present'::text AS expected, CASE WHEN to_regclass(schema_name || '.' || relation_name) IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = d.schema_name AND c.table_name = d.relation_name AND c.column_name = d.column_name) THEN 'present' ELSE 'missing' END AS observed, CASE WHEN to_regclass(schema_name || '.' || relation_name) IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = d.schema_name AND c.table_name = d.relation_name AND c.column_name = d.column_name) THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM expected_dependencies d
),
expected_authorization_functions(function_name, signature) AS (
  VALUES ('is_global_admin', 'public.is_global_admin()'), ('can_access_agency', 'public.can_access_agency(uuid)'), ('can_access_brand', 'public.can_access_brand(uuid)')
),
authorization_function_checks AS (
  SELECT 'dependency:function:' || function_name AS check_name, 'present'::text AS expected, CASE WHEN to_regprocedure(signature) IS NULL THEN 'missing' ELSE 'present' END AS observed, CASE WHEN to_regprocedure(signature) IS NULL THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM expected_authorization_functions
),
unexpected_relations AS (
  SELECT count(*)::integer AS observed_count
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'integration_%' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') AND c.relname NOT IN (SELECT relation_name FROM expected_relations)
),
unexpected_functions AS (
  SELECT count(*)::integer AS observed_count
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'integration_%' AND p.proname NOT IN (SELECT function_name FROM expected_functions)
),
unexpected_object_checks AS (
  SELECT 'unexpected:integration_relations'::text AS check_name, '0 objects outside 0024 catalog'::text AS expected, observed_count::text AS observed, CASE WHEN observed_count = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict FROM unexpected_relations
  UNION ALL
  SELECT 'unexpected:integration_functions', '0 functions outside 0024 catalog', observed_count::text, CASE WHEN observed_count = 0 THEN 'PASS' ELSE 'FAIL' END FROM unexpected_functions
),
legacy_relations(relation_name) AS (
  VALUES ('agencies'), ('marcas'), ('agency_memberships'), ('agency_brands'), ('brand_memberships'), ('minerador_google_ads_connections')
),
legacy_security AS (
  SELECT 'legacy_security:' || e.relation_name AS check_name, 'RLS enabled and anon SELECT denied'::text AS expected, CASE WHEN c.oid IS NULL THEN 'missing' ELSE CASE WHEN c.relrowsecurity THEN 'RLS_ENABLED' ELSE 'RLS_DISABLED' END || '; anon_select=' || has_table_privilege('anon', c.oid, 'SELECT')::text END AS observed, CASE WHEN c.oid IS NOT NULL AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid, 'SELECT') THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM legacy_relations e LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || e.relation_name)
),
legacy_counts AS (
  SELECT 'legacy_count:' || relation_name AS check_name, 'catalog estimate only'::text AS expected, coalesce(c.reltuples, 0)::bigint::text AS observed, 'INFO'::text AS verdict
  FROM legacy_relations e LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || e.relation_name)
),
all_checks AS (
  SELECT * FROM preflight_metadata
  UNION ALL SELECT * FROM relation_collision_checks
  UNION ALL SELECT * FROM index_collision_checks
  UNION ALL SELECT * FROM constraint_collision_checks
  UNION ALL SELECT * FROM function_collision_checks
  UNION ALL SELECT * FROM type_checks
  UNION ALL SELECT * FROM dependency_checks
  UNION ALL SELECT * FROM authorization_function_checks
  UNION ALL SELECT * FROM unexpected_object_checks
  UNION ALL SELECT * FROM legacy_security
  UNION ALL SELECT * FROM legacy_counts
)
SELECT check_name, expected, observed, verdict
FROM all_checks
ORDER BY CASE WHEN verdict = 'FAIL' THEN 0 WHEN verdict = 'PASS' THEN 1 ELSE 2 END, check_name;
