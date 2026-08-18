-- Snapshot remoto read-only imediatamente anterior à 0024.
-- Um único result set; não retorna linhas de negócio, UUIDs, e-mails ou segredos.

WITH snapshot_metadata AS (
  SELECT
    'script_version'::text AS check_name,
    '2026-08-11-integrations-0024-pre-apply-snapshot-v1'::text AS expected,
    '2026-08-11-integrations-0024-pre-apply-snapshot-v1'::text AS observed,
    'INFO'::text AS verdict
),
expected_new_relations(relation_name) AS (
  VALUES
    ('integration_providers'),
    ('integration_capabilities'),
    ('integration_connections'),
    ('integration_grants'),
    ('integration_bindings'),
    ('integration_quota_policies'),
    ('integration_usage_events')
),
new_relation_snapshot AS (
  SELECT
    'pre0024:new_relation:' || relation_name AS check_name,
    'absent before 0024'::text AS expected,
    CASE WHEN to_regclass('public.' || relation_name) IS NULL THEN 'absent' ELSE 'present' END AS observed,
    'INFO'::text AS verdict
  FROM expected_new_relations
),
legacy_inventory(relation_name, role) AS (
  VALUES
    ('agencies', 'agency'),
    ('agency_memberships', 'agency'),
    ('agency_brands', 'agency'),
    ('marcas', 'brand'),
    ('brand_memberships', 'brand'),
    ('perfis', 'identity'),
    ('minerador_google_ads_connections', 'google_ads_legacy'),
    ('minerador_keyword_metric_measurements', 'google_ads_legacy'),
    ('platform_communication_config', 'communication_config'),
    ('communication_templates', 'communication'),
    ('communication_messages', 'communication'),
    ('communication_delivery_events', 'communication'),
    ('agency_invitation_token_generations', 'agency_invitation')
),
legacy_inventory_snapshot AS (
  SELECT
    'inventory:relation:' || relation_name AS check_name,
    role || ' relation catalog metadata' AS expected,
    CASE WHEN to_regclass('public.' || relation_name) IS NULL THEN 'absent' ELSE 'present' END AS observed,
    'INFO'::text AS verdict
  FROM legacy_inventory
),
unexpected_integration_relations AS (
  SELECT count(*)::integer AS observed_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'integration_%'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
),
unexpected_snapshot AS (
  SELECT
    'inventory:unexpected_integration_relations'::text AS check_name,
    '0 before 0024'::text AS expected,
    observed_count::text AS observed,
    CASE WHEN observed_count = 0 THEN 'PASS' ELSE 'INFO' END AS verdict
  FROM unexpected_integration_relations
),
catalog_security AS (
  SELECT
    c.relname AS relation_name,
    CASE WHEN c.relrowsecurity THEN 'RLS_ENABLED' ELSE 'RLS_DISABLED' END AS rls_state,
    count(p.policyname)::integer AS policy_count,
    pg_get_userbyid(c.relowner) AS relation_owner,
    has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
    has_table_privilege('authenticated', c.oid, 'INSERT') OR has_table_privilege('authenticated', c.oid, 'UPDATE') OR has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_write
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
  WHERE n.nspname = 'public'
    AND c.relname IN (SELECT relation_name FROM legacy_inventory)
    AND c.relkind IN ('r', 'p')
  GROUP BY c.relname, c.relrowsecurity, c.relowner, c.oid
),
security_snapshot AS (
  SELECT
    'security:relation:' || relation_name AS check_name,
    'catalog only: RLS/policies/ACL/owner'::text AS expected,
    rls_state || '; policies=' || policy_count::text || '; owner_role=' || relation_owner || '; anon_select=' || anon_select::text || '; authenticated_write=' || authenticated_write::text AS observed,
    'INFO'::text AS verdict
  FROM catalog_security
),
function_security AS (
  SELECT
    'security:function:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS check_name,
    'owner/definer/search_path/execute ACL metadata'::text AS expected,
    'owner_role=' || pg_get_userbyid(p.proowner)
      || '; ' || CASE WHEN p.prosecdef THEN 'SECURITY_DEFINER' ELSE 'SECURITY_INVOKER' END
      || '; search_path=' || CASE WHEN array_to_string(p.proconfig, ';') ILIKE '%search_path=pg_catalog, public, pg_temp%' THEN 'restricted' ELSE 'not_confirmed' END
      || '; anon_execute=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
      || '; authenticated_execute=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
      || '; service_role_execute=' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text AS observed,
    'INFO'::text AS verdict
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'vault')
    AND (
      p.proname ILIKE '%agency%'
      OR p.proname ILIKE '%communication%'
      OR p.proname ILIKE '%google%'
      OR p.proname ILIKE '%dataforseo%'
      OR p.proname ILIKE '%provider%'
      OR p.proname ILIKE '%quota%'
      OR p.proname ILIKE '%usage%'
      OR p.proname ILIKE '%integration%'
    )
),
function_snapshot AS (
  SELECT * FROM function_security
),
dataforseo_catalog AS (
  SELECT count(*)::integer AS relation_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname ILIKE '%dataforseo%'
),
ai_catalog AS (
  SELECT count(*)::integer AS relation_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname ILIKE '%ai%'
),
plan_usage_catalog AS (
  SELECT count(*)::integer AS relation_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (c.relname ILIKE '%plan%' OR c.relname ILIKE '%quota%' OR c.relname ILIKE '%usage%' OR c.relname ILIKE '%consum%')
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
),
catalog_family_snapshot AS (
  SELECT 'inventory:dataforseo_relations'::text AS check_name, 'catalog metadata only'::text AS expected, relation_count::text AS observed, 'INFO'::text AS verdict FROM dataforseo_catalog
  UNION ALL
  SELECT 'inventory:ai_relations', 'catalog metadata only', relation_count::text, 'INFO' FROM ai_catalog
  UNION ALL
  SELECT 'inventory:plan_quota_usage_relations', 'catalog metadata only', relation_count::text, 'INFO' FROM plan_usage_catalog
  UNION ALL
  SELECT 'inventory:vault_catalog', 'vault catalog presence only', CASE WHEN to_regclass('vault.decrypted_secrets') IS NULL THEN 'absent' ELSE 'present' END, 'INFO'
),
configuration_column_snapshot AS (
  SELECT 'inventory:provider_config_columns'::text AS check_name, 'column names/count only'::text AS expected, count(*)::text AS observed, 'INFO'::text AS verdict
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (lower(column_name) LIKE '%dataforseo%' OR lower(column_name) IN ('ai_provider', 'deepseek_model', 'openrouter_model'))
  UNION ALL
  SELECT 'inventory:secret_ref_columns', 'column names/count only', count(*)::text, 'INFO'
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'secret_ref'
),
count_snapshot AS (
  SELECT 'count:auth_users'::text AS check_name, 'sanitized count'::text AS expected, count(*)::text AS observed, 'INFO'::text AS verdict FROM auth.users
  UNION ALL SELECT 'count:agencies', 'sanitized count', count(*)::text, 'INFO' FROM public.agencies
  UNION ALL SELECT 'count:agency_memberships', 'sanitized count', count(*)::text, 'INFO' FROM public.agency_memberships
  UNION ALL SELECT 'count:agency_brands', 'sanitized count', count(*)::text, 'INFO' FROM public.agency_brands
  UNION ALL SELECT 'count:marcas', 'sanitized count', count(*)::text, 'INFO' FROM public.marcas
  UNION ALL SELECT 'count:brand_memberships', 'sanitized count', count(*)::text, 'INFO' FROM public.brand_memberships
  UNION ALL SELECT 'count:minerador_google_ads_connections', 'sanitized count', count(*)::text, 'INFO' FROM public.minerador_google_ads_connections
),
optional_catalog_estimates AS (
  SELECT 'catalog_estimate:' || relation_name AS check_name, 'catalog estimate; no row contents'::text AS expected, CASE WHEN c.oid IS NULL THEN 'absent' ELSE coalesce(round(c.reltuples)::bigint::text, 'unknown') END AS observed, 'INFO'::text AS verdict
  FROM (VALUES ('platform_communication_config'), ('communication_templates'), ('communication_messages'), ('communication_delivery_events'), ('agency_invitation_token_generations')) AS optional(relation_name)
  LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || optional.relation_name)
),
all_snapshot_rows AS (
  SELECT * FROM snapshot_metadata
  UNION ALL SELECT * FROM new_relation_snapshot
  UNION ALL SELECT * FROM legacy_inventory_snapshot
  UNION ALL SELECT * FROM unexpected_snapshot
  UNION ALL SELECT * FROM security_snapshot
  UNION ALL SELECT * FROM function_snapshot
  UNION ALL SELECT * FROM catalog_family_snapshot
  UNION ALL SELECT * FROM configuration_column_snapshot
  UNION ALL SELECT * FROM count_snapshot
  UNION ALL SELECT * FROM optional_catalog_estimates
)
SELECT check_name, expected, observed, verdict
FROM all_snapshot_rows
ORDER BY check_name;
