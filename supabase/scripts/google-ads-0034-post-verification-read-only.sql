-- Google Ads 0034 post-verifier. One catalog-only result set.

WITH
binding_constraints AS (
  SELECT
    c.conname,
    pg_catalog.pg_get_constraintdef(c.oid, true)::text AS definition
  FROM pg_catalog.pg_constraint AS c
  JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'integration_bindings'
    AND c.conname IN ('ck_integration_bindings_source_0034', 'ck_integration_bindings_target_source_0034')
),
binding_validator AS (
  SELECT p.oid, p.prosecdef, p.provolatile, p.proconfig, pg_catalog.pg_get_functiondef(p.oid)::text AS definition
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('public.integration_bindings_validate_scope()')
),
secret_functions AS (
  SELECT p.oid, p.proname, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl,
    pg_catalog.pg_get_functiondef(p.oid)::text AS definition
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid IN (
    pg_catalog.to_regprocedure('public.integration_secret_resolve(text)'),
    pg_catalog.to_regprocedure('public.integration_secret_store_upsert(text,text,text,text)')
  )
),
secret_acl AS (
  SELECT
    sf.proname,
    EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(sf.proacl, pg_catalog.acldefault('f', sf.proowner))) AS ax
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = ax.grantee
      WHERE grantee.rolname = 'service_role' AND ax.privilege_type = 'EXECUTE'
    ) AS service_role_execute,
    EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(sf.proacl, pg_catalog.acldefault('f', sf.proowner))) AS ax
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = ax.grantee
      WHERE ax.privilege_type = 'EXECUTE'
        AND ax.grantee = 0
    ) AS public_execute,
    EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(sf.proacl, pg_catalog.acldefault('f', sf.proowner))) AS ax
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = ax.grantee
      WHERE ax.privilege_type = 'EXECUTE' AND grantee.rolname IN ('anon', 'authenticated')
    ) AS client_execute,
    EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(sf.proacl, pg_catalog.acldefault('f', sf.proowner))) AS ax
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = ax.grantee
      WHERE ax.privilege_type = 'EXECUTE'
        AND ax.grantee <> sf.proowner
        AND (ax.grantee = 0 OR grantee.rolname IS DISTINCT FROM 'service_role')
    ) AS unexpected_execute
  FROM secret_functions AS sf
),
shared_consumers AS (
  SELECT
    ns.nspname::text AS schema_name,
    rel.relname::text AS table_name,
    trg.tgname::text AS trigger_name,
    trg.tgenabled::text AS enabled
  FROM pg_catalog.pg_trigger AS trg
  JOIN pg_catalog.pg_class AS rel ON rel.oid = trg.tgrelid
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
  JOIN pg_catalog.pg_proc AS fn ON fn.oid = trg.tgfoid
  JOIN pg_catalog.pg_namespace AS fn_ns ON fn_ns.oid = fn.pronamespace
  WHERE NOT trg.tgisinternal
    AND fn_ns.nspname = 'public'
    AND fn.proname = 'pipeline_editorial_protect_append_only'
    AND (ns.nspname, rel.relname, trg.tgname) IN (
      ('public', 'content_document_versions', 'content_document_versions_append_only_trg'),
      ('public', 'editorial_artifact_versions', 'editorial_artifact_versions_append_only_trg'),
      ('public', 'editorial_serp_reviews', 'editorial_serp_reviews_append_only_trg'),
      ('public', 'editorial_serp_snapshots', 'editorial_serp_snapshots_append_only_trg')
    )
),
shared_function AS (
  SELECT p.oid
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'pipeline_editorial_protect_append_only'
),
preserved_relations AS (
  SELECT expected.table_name, pg_catalog.to_regclass('public.' || expected.table_name)::text AS relation_name
  FROM (VALUES
    ('integration_providers'::text),
    ('integration_capabilities'::text),
    ('integration_connections'::text),
    ('integration_grants'::text),
    ('integration_bindings'::text),
    ('integration_quota_policies'::text),
    ('integration_usage_events'::text),
    ('google_ads_binding_targeting'::text),
    ('google_ads_binding_account_state'::text),
    ('editorial_workflow_items'::text),
    ('editorial_artifact_versions'::text),
    ('agency_memberships'::text),
    ('marcas'::text),
    ('publication_records'::text)
  ) AS expected(table_name)
),
checks AS (
  SELECT 'script_version'::text AS check_name, '2026-08-13-google-ads-0034-post-v1'::text AS expected,
    '2026-08-13-google-ads-0034-post-v1'::text AS observed, 'PASS'::text AS verdict
  UNION ALL
  SELECT 'binding_constraint:source', 'present and includes agency_distributed',
    COALESCE((SELECT definition FROM binding_constraints WHERE conname = 'ck_integration_bindings_source_0034'), 'missing'),
    CASE WHEN EXISTS (SELECT 1 FROM binding_constraints WHERE conname = 'ck_integration_bindings_source_0034' AND definition ILIKE '%agency_distributed%') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'binding_constraint:target_source', 'present and permits agency_distributed only for Brand',
    COALESCE((SELECT definition FROM binding_constraints WHERE conname = 'ck_integration_bindings_target_source_0034'), 'missing'),
    CASE WHEN EXISTS (SELECT 1 FROM binding_constraints WHERE conname = 'ck_integration_bindings_target_source_0034' AND definition ILIKE '%agency_distributed%') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'binding_validator:distribution', 'validates Agency link and Platform/Agency connection ownership',
    CASE WHEN (SELECT count(*) FROM binding_validator WHERE definition ILIKE '%agency_distributed%' AND definition ILIKE '%agency_brands%') = 1 THEN 'agency_distributed + agency_brands present' ELSE 'validator evidence missing' END,
    CASE WHEN EXISTS (SELECT 1 FROM binding_validator WHERE definition ILIKE '%agency_distributed%' AND definition ILIKE '%agency_brands%' AND definition ILIKE '%owner_scope_type%') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'secret_function:resolve', 'present; SECURITY DEFINER; STABLE; restricted search_path',
    COALESCE((SELECT format('security_definer=%s; volatility=%s; search_path=%s', sf.prosecdef, sf.provolatile::text, COALESCE(array_to_string(sf.proconfig, ', '), 'NULL')) FROM secret_functions AS sf WHERE sf.proname = 'integration_secret_resolve'), 'missing'),
    CASE WHEN EXISTS (SELECT 1 FROM secret_functions AS sf WHERE sf.proname = 'integration_secret_resolve' AND sf.prosecdef AND sf.provolatile = 's' AND array_to_string(sf.proconfig, ',') LIKE '%search_path=pg_catalog, public, vault, pg_temp%') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'secret_function:store_upsert', 'present; SECURITY DEFINER; VOLATILE; restricted search_path',
    COALESCE((SELECT format('security_definer=%s; volatility=%s; search_path=%s', sf.prosecdef, sf.provolatile::text, COALESCE(array_to_string(sf.proconfig, ', '), 'NULL')) FROM secret_functions AS sf WHERE sf.proname = 'integration_secret_store_upsert'), 'missing'),
    CASE WHEN EXISTS (SELECT 1 FROM secret_functions AS sf WHERE sf.proname = 'integration_secret_store_upsert' AND sf.prosecdef AND sf.provolatile = 'v' AND array_to_string(sf.proconfig, ',') LIKE '%search_path=pg_catalog, public, vault, pg_temp%') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'secret_acl', 'service_role EXECUTE; no PUBLIC/anon/authenticated/other consumer EXECUTE',
    COALESCE((SELECT string_agg(format('%s:service=%s;public=%s;client=%s;unexpected=%s', sa.proname, sa.service_role_execute, sa.public_execute, sa.client_execute, sa.unexpected_execute), ' | ' ORDER BY sa.proname) FROM secret_acl AS sa), 'missing'),
    CASE WHEN (SELECT count(*) FROM secret_acl) = 2 AND NOT EXISTS (SELECT 1 FROM secret_acl WHERE NOT service_role_execute OR public_execute OR client_execute OR unexpected_execute) THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'shared_append_only_function', 'public.pipeline_editorial_protect_append_only present',
    CASE WHEN EXISTS (SELECT 1 FROM shared_function) THEN 'present' ELSE 'missing' END,
    CASE WHEN EXISTS (SELECT 1 FROM shared_function) THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'shared_append_only_consumers', 'four canonical editorial triggers intact',
    COALESCE((SELECT string_agg(format('%s.%s:%s:%s', sc.schema_name, sc.table_name, sc.trigger_name, sc.enabled), ' | ' ORDER BY sc.schema_name, sc.table_name, sc.trigger_name) FROM shared_consumers AS sc), 'none'),
    CASE WHEN (SELECT count(*) FROM shared_consumers) = 4 AND NOT EXISTS (SELECT 1 FROM shared_consumers WHERE enabled <> 'O') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'preserved_relation_count', 'all preserved integration/editorial/tenant relations present',
    format('%s/%s present', (SELECT count(*) FILTER (WHERE relation_name IS NOT NULL) FROM preserved_relations), (SELECT count(*) FROM preserved_relations)),
    CASE WHEN NOT EXISTS (SELECT 1 FROM preserved_relations WHERE relation_name IS NULL) THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'removed_relation_absence', '0034 does not remove existing canonical relations', 'no removal target in post-verifier', 'INFO'
  UNION ALL
  SELECT 'remote_operation', 'read-only catalog verification', 'no DDL/DML/provider call in this script', 'INFO'
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY check_name;
