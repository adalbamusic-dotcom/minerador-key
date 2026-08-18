-- Google Ads 0034 preflight. Catalog/data evidence only; no provisioning.
-- Execute as one read-only statement before any manual application.

WITH
script_version AS (
  SELECT '2026-08-13-google-ads-0034-preflight-v1'::text AS value
),
binding_constraints AS (
  SELECT
    c.conname,
    pg_catalog.pg_get_constraintdef(c.oid, true)::text AS definition
  FROM pg_catalog.pg_constraint AS c
  JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'integration_bindings'
    AND c.conname IN ('ck_integration_bindings_source_0024', 'ck_integration_bindings_target_source_0024')
),
binding_data AS (
  SELECT
    count(*)::bigint AS binding_count,
    count(*) FILTER (WHERE b.source_kind = 'agency_distributed')::bigint AS agency_distributed_count,
    count(*) FILTER (WHERE b.source_kind NOT IN ('platform_granted', 'agency_owned', 'agency_granted', 'brand_owned', 'unavailable'))::bigint AS unknown_source_count
  FROM public.integration_bindings AS b
),
vault_catalog AS (
  SELECT
    pg_catalog.to_regnamespace('vault') IS NOT NULL AS vault_namespace,
    pg_catalog.to_regclass('vault.decrypted_secrets') IS NOT NULL AS decrypted_secrets,
    COALESCE(bool_or(p.proname = 'create_secret'), false) AS create_secret,
    COALESCE(bool_or(p.proname = 'update_secret'), false) AS update_secret
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'vault'
    AND p.proname IN ('create_secret', 'update_secret')
),
existing_functions AS (
  SELECT
    pg_catalog.to_regprocedure('public.integration_bindings_validate_scope()') IS NOT NULL AS binding_validator,
    pg_catalog.to_regprocedure('public.integration_secret_resolve(text)') IS NOT NULL AS secret_resolve,
    pg_catalog.to_regprocedure('public.integration_secret_store_upsert(text,text,text,text)') IS NOT NULL AS secret_store_upsert
),
checks AS (
  SELECT 'script_version'::text AS check_name, '2026-08-13-google-ads-0034-preflight-v1'::text AS expected,
    (SELECT value FROM script_version) AS observed, 'PASS'::text AS verdict
  UNION ALL
  SELECT 'required_relation:integration_bindings', 'present',
    CASE WHEN pg_catalog.to_regclass('public.integration_bindings') IS NULL THEN 'missing' ELSE 'present' END,
    CASE WHEN pg_catalog.to_regclass('public.integration_bindings') IS NULL THEN 'FAIL' ELSE 'PASS' END
  UNION ALL
  SELECT 'required_relation:google_ads_0033_configuration', 'targeting and account_state present',
    format('targeting=%s; account_state=%s',
      CASE WHEN pg_catalog.to_regclass('public.google_ads_binding_targeting') IS NULL THEN 'missing' ELSE 'present' END,
      CASE WHEN pg_catalog.to_regclass('public.google_ads_binding_account_state') IS NULL THEN 'missing' ELSE 'present' END),
    CASE WHEN pg_catalog.to_regclass('public.google_ads_binding_targeting') IS NOT NULL
       AND pg_catalog.to_regclass('public.google_ads_binding_account_state') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'legacy_constraint:source_0024', 'present before replacement',
    CASE WHEN EXISTS (SELECT 1 FROM binding_constraints WHERE conname = 'ck_integration_bindings_source_0024') THEN 'present' ELSE 'missing' END,
    CASE WHEN EXISTS (SELECT 1 FROM binding_constraints WHERE conname = 'ck_integration_bindings_source_0024') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'legacy_constraint:target_source_0024', 'present before replacement',
    CASE WHEN EXISTS (SELECT 1 FROM binding_constraints WHERE conname = 'ck_integration_bindings_target_source_0024') THEN 'present' ELSE 'missing' END,
    CASE WHEN EXISTS (SELECT 1 FROM binding_constraints WHERE conname = 'ck_integration_bindings_target_source_0024') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'legacy_constraints:agency_distributed_absent', 'no agency_distributed in existing definitions',
    COALESCE((SELECT string_agg(bc.conname || ': agency_distributed present', ' | ' ORDER BY bc.conname) FROM binding_constraints AS bc WHERE bc.definition ILIKE '%agency_distributed%'), 'none'),
    CASE WHEN EXISTS (SELECT 1 FROM binding_constraints WHERE definition ILIKE '%agency_distributed%') THEN 'FAIL' ELSE 'PASS' END
  UNION ALL
  SELECT 'binding_data:existing_rows', 'metadata only',
    format('bindings=%s; agency_distributed=%s; unknown_source_kind=%s', bd.binding_count, bd.agency_distributed_count, bd.unknown_source_count),
    CASE WHEN bd.unknown_source_count = 0 AND bd.agency_distributed_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM binding_data AS bd
  UNION ALL
  SELECT 'vault:shared_secret_primitives', 'vault namespace + decrypted_secrets + create_secret + update_secret',
    format('namespace=%s; decrypted_secrets=%s; create_secret=%s; update_secret=%s', vc.vault_namespace, vc.decrypted_secrets, vc.create_secret, vc.update_secret),
    CASE WHEN vc.vault_namespace AND vc.decrypted_secrets AND vc.create_secret AND vc.update_secret THEN 'PASS' ELSE 'FAIL' END
  FROM vault_catalog AS vc
  UNION ALL
  SELECT 'function:binding_validator', 'existing 0024 validator', existing_functions.binding_validator::text,
    CASE WHEN existing_functions.binding_validator THEN 'PASS' ELSE 'FAIL' END
  FROM existing_functions
  UNION ALL
  SELECT 'function_conflict:integration_secret_resolve', 'absent before 0034', existing_functions.secret_resolve::text,
    CASE WHEN NOT existing_functions.secret_resolve THEN 'PASS' ELSE 'FAIL' END
  FROM existing_functions
  UNION ALL
  SELECT 'function_conflict:integration_secret_store_upsert', 'absent before 0034', existing_functions.secret_store_upsert::text,
    CASE WHEN NOT existing_functions.secret_store_upsert THEN 'PASS' ELSE 'FAIL' END
  FROM existing_functions
  UNION ALL
  SELECT 'secret_ref_contract', 'integration_connections.secret_ref is a reference column, not a payload column',
    format('type=%s; max_length=%s', c.data_type, COALESCE(c.character_maximum_length::text, 'unbounded')),
    CASE WHEN c.data_type = 'text' AND c.column_name = 'secret_ref' THEN 'PASS' ELSE 'FAIL' END
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public' AND c.table_name = 'integration_connections' AND c.column_name = 'secret_ref'
  UNION ALL
  SELECT 'migration_scope', 'only binding constraints/validator and shared secret-store RPCs',
    'no provider, connection, grant, binding or secret data provisioning in migration', 'INFO'
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY check_name;
