-- Google Ads 0033 preflight.
-- Read-only, one result set, intended to run before the candidate migration.
--
-- The preserved-catalog fingerprint is deliberately computed from catalog
-- metadata only. It excludes only the relation/function object set that 0033
-- creates (including their dependent indexes, toast relations, policies,
-- constraints and triggers). The post-verifier contains the same canonical
-- line construction and md5(string_agg(... ORDER BY line)) algorithm.

WITH
metadata(script_version) AS (
  VALUES ('2026-08-12-google-ads-0033-preflight-v2'::text)
),
expected_tables(schema_name, table_name) AS (
  VALUES
    ('public'::text, 'google_ads_binding_targeting'::text),
    ('public'::text, 'google_ads_binding_account_state'::text)
),
target_relations AS (
  SELECT relation.oid AS relation_oid
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation.relnamespace
  WHERE namespace_row.nspname::text = 'public'
    AND relation.relname::text IN ('google_ads_binding_targeting', 'google_ads_binding_account_state')
),
excluded_relations AS (
  SELECT target_row.relation_oid
  FROM target_relations AS target_row
  UNION
  SELECT target_class.reltoastrelid
  FROM pg_catalog.pg_class AS target_class
  JOIN target_relations AS target_row
    ON target_row.relation_oid = target_class.oid
  WHERE target_class.reltoastrelid <> 0
  UNION
  SELECT index_row.indexrelid
  FROM pg_catalog.pg_index AS index_row
  JOIN target_relations AS target_row
    ON target_row.relation_oid = index_row.indrelid
),
target_function AS (
  SELECT pg_catalog.to_regprocedure('public.google_ads_binding_configuration_validate()')::oid AS function_oid
),
public_schema_line AS (
  SELECT format(
    'schema|public|owner=%s|acl=%s',
    pg_catalog.pg_get_userbyid(namespace_row.nspowner)::text,
    coalesce(pg_catalog.array_to_string(namespace_row.nspacl, ' | '), 'NULL/default')
  ) AS canonical_line
  FROM pg_catalog.pg_namespace AS namespace_row
  WHERE namespace_row.nspname::text = 'public'
),
public_relation_lines AS (
  SELECT format(
    'relation|%s.%s|relkind=%s|owner=%s|rls=%s|force_rls=%s|is_partition=%s|acl=%s|indexdef=%s|viewdef=%s',
    namespace_row.nspname::text,
    relation.relname::text,
    relation.relkind::text,
    pg_catalog.pg_get_userbyid(relation.relowner)::text,
    relation.relrowsecurity::text,
    relation.relforcerowsecurity::text,
    relation.relispartition::text,
    coalesce(pg_catalog.array_to_string(relation.relacl, ' | '), 'NULL/default'),
    CASE WHEN relation.relkind::text = 'i' THEN coalesce(pg_catalog.pg_get_indexdef(relation.oid), 'NULL') ELSE 'N/A' END,
    CASE WHEN relation.relkind::text IN ('v', 'm') THEN coalesce(pg_catalog.pg_get_viewdef(relation.oid, true), 'NULL') ELSE 'N/A' END
  ) AS canonical_line
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = relation.relnamespace
  WHERE namespace_row.nspname::text = 'public'
    AND NOT EXISTS (
      SELECT 1
      FROM excluded_relations AS excluded_row
      WHERE excluded_row.relation_oid = relation.oid
    )
),
public_function_lines AS (
  SELECT format(
    'function|%s.%s(%s)|result=%s|owner=%s|kind=%s|security_definer=%s|volatility=%s|config=%s|acl=%s|definition_md5=%s',
    namespace_row.nspname::text,
    function_row.proname::text,
    pg_catalog.pg_get_function_identity_arguments(function_row.oid)::text,
    coalesce(pg_catalog.pg_get_function_result(function_row.oid)::text, 'NULL'),
    pg_catalog.pg_get_userbyid(function_row.proowner)::text,
    function_row.prokind::text,
    function_row.prosecdef::text,
    function_row.provolatile::text,
    coalesce(pg_catalog.array_to_string(function_row.proconfig, ' | '), 'NULL'),
    coalesce(pg_catalog.array_to_string(function_row.proacl, ' | '), 'NULL/default'),
    md5(pg_catalog.pg_get_functiondef(function_row.oid))
  ) AS canonical_line
  FROM pg_catalog.pg_proc AS function_row
  JOIN pg_catalog.pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  CROSS JOIN target_function AS target_row
  WHERE namespace_row.nspname::text = 'public'
    AND (target_row.function_oid IS NULL OR function_row.oid <> target_row.function_oid)
),
public_trigger_lines AS (
  SELECT format(
    'trigger|%s.%s|%s|enabled=%s|tgtype=%s|function=%s.%s(%s)',
    table_namespace.nspname::text,
    table_class.relname::text,
    trigger_row.tgname::text,
    trigger_row.tgenabled::text,
    trigger_row.tgtype::text,
    function_namespace.nspname::text,
    function_row.proname::text,
    pg_catalog.pg_get_function_identity_arguments(function_row.oid)::text
  ) AS canonical_line
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS table_class
    ON table_class.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_class.relnamespace
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = trigger_row.tgfoid
  LEFT JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_row.pronamespace
  WHERE table_namespace.nspname::text = 'public'
    AND NOT trigger_row.tgisinternal
    AND NOT EXISTS (
      SELECT 1
      FROM excluded_relations AS excluded_row
      WHERE excluded_row.relation_oid = table_class.oid
    )
),
public_policy_lines AS (
  SELECT format(
    'policy|%s.%s|%s|permissive=%s|cmd=%s|roles=%s|qual=%s|with_check=%s',
    table_namespace.nspname::text,
    table_class.relname::text,
    policy_row.polname::text,
    policy_row.polpermissive::text,
    policy_row.polcmd::text,
    coalesce((
      SELECT string_agg(
        CASE WHEN role_entry.role_oid = 0 THEN 'PUBLIC'::text ELSE pg_catalog.pg_get_userbyid(role_entry.role_oid)::text END,
        ',' ORDER BY role_entry.role_oid
      )
      FROM unnest(policy_row.polroles) AS role_entry(role_oid)
    ), 'none'),
    coalesce(pg_catalog.pg_get_expr(policy_row.polqual, policy_row.polrelid, true), 'NULL'),
    coalesce(pg_catalog.pg_get_expr(policy_row.polwithcheck, policy_row.polrelid, true), 'NULL')
  ) AS canonical_line
  FROM pg_catalog.pg_policy AS policy_row
  JOIN pg_catalog.pg_class AS table_class
    ON table_class.oid = policy_row.polrelid
  JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_class.relnamespace
  WHERE table_namespace.nspname::text = 'public'
    AND NOT EXISTS (
      SELECT 1
      FROM excluded_relations AS excluded_row
      WHERE excluded_row.relation_oid = table_class.oid
    )
),
public_constraint_lines AS (
  SELECT format(
    'constraint|%s.%s|%s|type=%s|validated=%s|deferrable=%s|deferred=%s|definition=%s',
    table_namespace.nspname::text,
    table_class.relname::text,
    constraint_row.conname::text,
    constraint_row.contype::text,
    constraint_row.convalidated::text,
    constraint_row.condeferrable::text,
    constraint_row.condeferred::text,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, true)::text
  ) AS canonical_line
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS table_class
    ON table_class.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_class.relnamespace
  WHERE table_namespace.nspname::text = 'public'
    AND NOT EXISTS (
      SELECT 1
      FROM excluded_relations AS excluded_row
      WHERE excluded_row.relation_oid = table_class.oid
    )
),
preserved_catalog_lines AS (
  SELECT canonical_line FROM public_schema_line
  UNION ALL
  SELECT canonical_line FROM public_relation_lines
  UNION ALL
  SELECT canonical_line FROM public_function_lines
  UNION ALL
  SELECT canonical_line FROM public_trigger_lines
  UNION ALL
  SELECT canonical_line FROM public_policy_lines
  UNION ALL
  SELECT canonical_line FROM public_constraint_lines
),
preserved_catalog_fingerprint AS (
  SELECT
    count(*)::bigint AS entry_count,
    md5(string_agg(canonical_line, '|' ORDER BY canonical_line)) AS fingerprint
  FROM preserved_catalog_lines
),
integration_expected(table_name) AS (
  VALUES
    ('integration_providers'::text),
    ('integration_capabilities'::text),
    ('integration_connections'::text),
    ('integration_grants'::text),
    ('integration_bindings'::text),
    ('integration_quota_policies'::text),
    ('integration_usage_events'::text)
),
integration_acl_rls_snapshot AS (
  SELECT
    expected_row.table_name,
    relation.oid AS relation_oid,
    pg_catalog.pg_get_userbyid(relation.relowner)::text AS owner_name,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    coalesce(pg_catalog.array_to_string(relation.relacl, ' | '), 'NULL/default') AS acl_text,
    count(policy_row.oid)::integer AS policy_count,
    coalesce(string_agg(
      format(
        '%s; permissive=%s; cmd=%s; roles=%s; qual=%s; with_check=%s',
        policy_row.polname::text,
        policy_row.polpermissive::text,
        policy_row.polcmd::text,
        policy_row.polroles::text,
        coalesce(pg_catalog.pg_get_expr(policy_row.polqual, policy_row.polrelid, true), 'NULL'),
        coalesce(pg_catalog.pg_get_expr(policy_row.polwithcheck, policy_row.polrelid, true), 'NULL')
      ),
      ' | ' ORDER BY policy_row.polname::text
    ), 'none') AS policy_details
  FROM integration_expected AS expected_row
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = 'public'::regnamespace
   AND relation.relname::text = expected_row.table_name
   AND relation.relkind::text IN ('r', 'p')
  LEFT JOIN pg_catalog.pg_policy AS policy_row
    ON policy_row.polrelid = relation.oid
  GROUP BY
    expected_row.table_name,
    relation.oid,
    relation.relowner,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    relation.relacl
),
legacy_table_catalog AS (
  SELECT pg_catalog.to_regclass('public.minerador_google_ads_connections')::oid AS relation_oid
),
legacy_table_evidence AS (
  SELECT
    legacy_row.relation_oid,
    (SELECT count(*)::bigint FROM public.minerador_google_ads_connections) AS row_count
  FROM legacy_table_catalog AS legacy_row
),
base_table_checks AS (
  SELECT
    expected_row.table_name,
    pg_catalog.to_regclass('public.' || expected_row.table_name) IS NOT NULL AS present
  FROM integration_expected AS expected_row
),
function_check AS (
  SELECT pg_catalog.to_regprocedure('public.google_ads_binding_configuration_validate()') AS function_oid
),
checks(check_name, object_name, observed, verdict) AS (
  SELECT 'script_version', 'script', metadata_row.script_version, 'INFO'
  FROM metadata AS metadata_row
  UNION ALL
  SELECT 'candidate_table_absent', catalog_row.schema_name || '.' || catalog_row.table_name,
    CASE WHEN catalog_row.relation_oid IS NULL THEN 'absent' ELSE 'present' END,
    CASE WHEN catalog_row.relation_oid IS NULL THEN 'PASS' ELSE 'FAIL' END
  FROM (
    SELECT expected_row.schema_name, expected_row.table_name, relation.oid AS relation_oid
    FROM expected_tables AS expected_row
    LEFT JOIN pg_catalog.pg_namespace AS namespace_row
      ON namespace_row.nspname::text = expected_row.schema_name
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.relnamespace = namespace_row.oid
     AND relation.relname::text = expected_row.table_name
     AND relation.relkind::text IN ('r', 'p')
  ) AS catalog_row
  UNION ALL
  SELECT '0024_table_present', 'public.' || base_row.table_name,
    CASE WHEN base_row.present THEN 'present' ELSE 'missing' END,
    CASE WHEN base_row.present THEN 'PASS' ELSE 'FAIL' END
  FROM base_table_checks AS base_row
  UNION ALL
  SELECT 'candidate_validator_absent', 'public.google_ads_binding_configuration_validate()',
    CASE WHEN function_row.function_oid IS NULL THEN 'absent' ELSE 'present' END,
    CASE WHEN function_row.function_oid IS NULL THEN 'PASS' ELSE 'FAIL' END
  FROM function_check AS function_row
  UNION ALL
  SELECT 'PRE_0033_PRESERVED_CATALOG_FINGERPRINT', 'public/non-0033-catalog-v1',
    'fingerprint=' || coalesce(fingerprint_row.fingerprint, 'NULL')
      || '; entries=' || fingerprint_row.entry_count::text
      || '; algorithm=md5(string_agg(canonical_line,''|'' ORDER BY canonical_line))',
    CASE WHEN fingerprint_row.fingerprint IS NOT NULL AND fingerprint_row.entry_count > 0 THEN 'PASS' ELSE 'FAIL' END
  FROM preserved_catalog_fingerprint AS fingerprint_row
  UNION ALL
  SELECT 'PRE_0033_ACL_RLS_SNAPSHOT', 'public.' || snapshot_row.table_name,
    'owner=' || coalesce(snapshot_row.owner_name, 'missing')
      || '; rls=' || coalesce(snapshot_row.relrowsecurity::text, 'missing')
      || '; force_rls=' || coalesce(snapshot_row.relforcerowsecurity::text, 'missing')
      || '; policies=' || snapshot_row.policy_count::text
      || '; policy_details=' || snapshot_row.policy_details
      || '; acl=' || snapshot_row.acl_text,
    CASE WHEN snapshot_row.relation_oid IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  FROM integration_acl_rls_snapshot AS snapshot_row
  UNION ALL
  SELECT 'LEGACY_TABLE_EVIDENCE', 'public.minerador_google_ads_connections',
    CASE WHEN legacy_row.relation_oid IS NULL THEN 'missing' ELSE 'present; row_count=' || legacy_row.row_count::text END,
    CASE WHEN legacy_row.relation_oid IS NULL THEN 'FAIL' ELSE 'PASS' END
  FROM legacy_table_evidence AS legacy_row
  UNION ALL
  SELECT 'legacy_runtime_cutover', 'runtime', 'migration candidate does not contain legacy table writes or reads', 'INFO'
),
summary AS (
  SELECT count(*) FILTER (WHERE check_row.verdict = 'FAIL')::integer AS fail_count
  FROM checks AS check_row
)
SELECT check_name, object_name, observed, verdict
FROM checks
UNION ALL
SELECT 'GOOGLE_ADS_0033_PREFLIGHT', 'pre-apply',
  'fail_count=' || summary_row.fail_count::text,
  CASE WHEN summary_row.fail_count = 0 THEN 'PASS_READY_FOR_APPLY' ELSE 'FAIL' END
FROM summary AS summary_row
ORDER BY check_name, object_name;
