-- Google Ads 0033 post-verifier.
-- Read-only, one result set, intended only after 0033 is applied.
--
-- Before the first post-apply execution, replace the baseline literal with
-- the PRE_0033_PRESERVED_CATALOG_FINGERPRINT emitted by the v2 preflight.
-- The placeholder produces EVIDENCE_GAP, never a structural FAIL.

WITH
metadata(script_version) AS (
  VALUES ('2026-08-12-google-ads-0033-post-v2'::text)
),
baseline(expected_fingerprint) AS (
  VALUES ('585a1424c29f0e813c34034aa39eadd4'::text)
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
expected_columns(table_name, column_name) AS (
  VALUES
    ('google_ads_binding_targeting'::text, 'id'::text),
    ('google_ads_binding_targeting'::text, 'binding_id'::text),
    ('google_ads_binding_targeting'::text, 'language_constant'::text),
    ('google_ads_binding_targeting'::text, 'geo_target_constants'::text),
    ('google_ads_binding_targeting'::text, 'keyword_plan_network'::text),
    ('google_ads_binding_targeting'::text, 'include_adult_keywords'::text),
    ('google_ads_binding_account_state'::text, 'id'::text),
    ('google_ads_binding_account_state'::text, 'binding_id'::text),
    ('google_ads_binding_account_state'::text, 'currency_code'::text),
    ('google_ads_binding_account_state'::text, 'time_zone'::text),
    ('google_ads_binding_account_state'::text, 'validation_status'::text),
    ('google_ads_binding_account_state'::text, 'validated_at'::text)
),
column_catalog AS (
  SELECT
    expected.table_name,
    expected.column_name,
    columns.column_name IS NOT NULL AS present,
    columns.data_type::text AS data_type
  FROM expected_columns AS expected
  LEFT JOIN information_schema.columns AS columns
    ON columns.table_schema = 'public'
   AND columns.table_name = expected.table_name
   AND columns.column_name = expected.column_name
),
table_catalog AS (
  SELECT
    expected.table_name,
    relation.oid AS relation_oid,
    relation.relrowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner)::text AS owner_name,
    coalesce(pg_catalog.array_to_string(relation.relacl, ' | '), 'NULL/default') AS acl_text
  FROM (VALUES
    ('google_ads_binding_targeting'::text),
    ('google_ads_binding_account_state'::text)
  ) AS expected(table_name)
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = 'public'::regnamespace
   AND relation.relname::text = expected.table_name
   AND relation.relkind::text IN ('r', 'p')
),
row_counts AS (
  SELECT 'google_ads_binding_targeting'::text AS table_name, count(*)::bigint AS row_count
  FROM public.google_ads_binding_targeting
  UNION ALL
  SELECT 'google_ads_binding_account_state'::text, count(*)::bigint
  FROM public.google_ads_binding_account_state
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
fk_checks AS (
  SELECT
    count(*) FILTER (WHERE constraint_row.conrelid = 'public.google_ads_binding_targeting'::regclass AND constraint_row.confrelid = 'public.integration_bindings'::regclass)::integer AS targeting_fk_count,
    count(*) FILTER (WHERE constraint_row.conrelid = 'public.google_ads_binding_account_state'::regclass AND constraint_row.confrelid = 'public.integration_bindings'::regclass)::integer AS state_fk_count,
    count(*) FILTER (WHERE constraint_row.conrelid IN ('public.google_ads_binding_targeting'::regclass, 'public.google_ads_binding_account_state'::regclass) AND constraint_row.confdeltype = 'r')::integer AS restrict_fk_count
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.contype = 'f'
),
policy_checks AS (
  SELECT
    count(*) FILTER (WHERE policy.schemaname = 'public' AND policy.tablename = 'google_ads_binding_targeting')::integer AS targeting_policy_count,
    count(*) FILTER (WHERE policy.schemaname = 'public' AND policy.tablename = 'google_ads_binding_account_state')::integer AS state_policy_count,
    count(*) FILTER (WHERE policy.cmd = 'SELECT' AND 'authenticated'::name = ANY(policy.roles))::integer AS authenticated_select_count,
    count(*) FILTER (WHERE policy.cmd <> 'SELECT')::integer AS write_policy_count,
    coalesce(string_agg(policy.schemaname::text || '.' || policy.tablename::text || ':' || policy.policyname::text || '; cmd=' || policy.cmd::text, ' | ' ORDER BY policy.tablename::text, policy.policyname::text), 'none') AS details
  FROM pg_catalog.pg_policies AS policy
  WHERE policy.schemaname = 'public'
    AND policy.tablename IN ('google_ads_binding_targeting', 'google_ads_binding_account_state')
),
constraint_checks AS (
  SELECT
    count(*) FILTER (WHERE constraint_row.conrelid = 'public.google_ads_binding_targeting'::regclass AND constraint_row.contype = 'c')::integer AS targeting_check_count,
    count(*) FILTER (WHERE constraint_row.conrelid = 'public.google_ads_binding_account_state'::regclass AND constraint_row.contype = 'c')::integer AS state_check_count,
    coalesce(string_agg(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), ' | ' ORDER BY constraint_row.conrelid::text, constraint_row.conname::text), 'none') AS definitions
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid IN ('public.google_ads_binding_targeting'::regclass, 'public.google_ads_binding_account_state'::regclass)
),
unique_checks AS (
  SELECT
    count(*) FILTER (WHERE constraint_row.conrelid = 'public.google_ads_binding_targeting'::regclass AND constraint_row.contype = 'u')::integer AS targeting_binding_unique_count,
    count(*) FILTER (WHERE constraint_row.conrelid = 'public.google_ads_binding_account_state'::regclass AND constraint_row.contype = 'u')::integer AS state_binding_unique_count
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid IN ('public.google_ads_binding_targeting'::regclass, 'public.google_ads_binding_account_state'::regclass)
),
sensitive_columns AS (
  SELECT
    coalesce(string_agg(columns.table_name::text || '.' || columns.column_name::text, ' | ' ORDER BY columns.table_name::text, columns.column_name::text), 'none') AS forbidden_columns,
    count(*)::integer AS forbidden_column_count
  FROM information_schema.columns AS columns
  WHERE columns.table_schema = 'public'
    AND columns.table_name IN ('google_ads_binding_targeting', 'google_ads_binding_account_state')
    AND columns.column_name ~* '(secret|token|customer|mcc|credential|provider|grant|quota|usage)'
),
table_privileges AS (
  SELECT
    expected.table_name,
    pg_catalog.has_table_privilege('anon'::name, format('public.%I', expected.table_name), 'SELECT') AS anon_select,
    pg_catalog.has_table_privilege('authenticated'::name, format('public.%I', expected.table_name), 'SELECT') AS authenticated_select,
    pg_catalog.has_table_privilege('authenticated'::name, format('public.%I', expected.table_name), 'INSERT') AS authenticated_insert,
    pg_catalog.has_table_privilege('authenticated'::name, format('public.%I', expected.table_name), 'UPDATE') AS authenticated_update,
    pg_catalog.has_table_privilege('authenticated'::name, format('public.%I', expected.table_name), 'DELETE') AS authenticated_delete,
    pg_catalog.has_table_privilege('service_role'::name, format('public.%I', expected.table_name), 'SELECT') AS service_select,
    pg_catalog.has_table_privilege('service_role'::name, format('public.%I', expected.table_name), 'INSERT') AS service_insert,
    pg_catalog.has_table_privilege('service_role'::name, format('public.%I', expected.table_name), 'UPDATE') AS service_update
  FROM (VALUES
    ('google_ads_binding_targeting'::text),
    ('google_ads_binding_account_state'::text)
  ) AS expected(table_name)
),
trigger_function AS (
  SELECT
    function_target.function_oid,
    pg_catalog.array_to_string(function_row.proconfig, ' | ') AS config,
    function_row.prosecdef,
    function_row.provolatile,
    count(trigger_row.oid)::integer AS trigger_count
  FROM (SELECT to_regprocedure('public.google_ads_binding_configuration_validate()') AS function_oid) AS function_target
  LEFT JOIN pg_catalog.pg_proc AS function_row
    ON function_row.oid = function_target.function_oid
  LEFT JOIN pg_catalog.pg_trigger AS trigger_row
    ON trigger_row.tgfoid = function_row.oid
   AND NOT trigger_row.tgisinternal
  GROUP BY function_target.function_oid, function_row.proconfig, function_row.prosecdef, function_row.provolatile
),
trigger_identity AS (
  SELECT
    count(*) FILTER (WHERE trigger_namespace.nspname = 'public' AND trigger_class.relname = 'google_ads_binding_targeting' AND trigger_row.tgname = 'google_ads_binding_targeting_validate_trg_0033')::integer AS targeting_trigger_count,
    count(*) FILTER (WHERE trigger_namespace.nspname = 'public' AND trigger_class.relname = 'google_ads_binding_account_state' AND trigger_row.tgname = 'google_ads_binding_account_state_validate_trg_0033')::integer AS state_trigger_count,
    coalesce(string_agg(trigger_namespace.nspname::text || '.' || trigger_class.relname::text || ':' || trigger_row.tgname::text, ' | ' ORDER BY trigger_namespace.nspname::text, trigger_class.relname::text, trigger_row.tgname::text), 'none') AS details
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS trigger_class ON trigger_class.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS trigger_namespace ON trigger_namespace.oid = trigger_class.relnamespace
  WHERE NOT trigger_row.tgisinternal
    AND trigger_namespace.nspname = 'public'
    AND trigger_class.relname IN ('google_ads_binding_targeting', 'google_ads_binding_account_state')
),
checks(check_name, object_name, observed, verdict) AS (
  SELECT 'script_version', 'script', metadata_row.script_version, 'INFO'
  FROM metadata AS metadata_row
  UNION ALL
  SELECT 'table:existence', table_row.table_name,
    CASE WHEN table_row.relation_oid IS NULL THEN 'missing' ELSE 'present' END,
    CASE WHEN table_row.relation_oid IS NULL THEN 'FAIL' ELSE 'PASS' END
  FROM table_catalog AS table_row
  UNION ALL
  SELECT 'table:rows', count_row.table_name, count_row.row_count::text, 'INFO'
  FROM row_counts AS count_row
  UNION ALL
  SELECT 'columns:required', column_row.table_name || '.' || column_row.column_name,
    CASE WHEN column_row.present THEN 'present; type=' || coalesce(column_row.data_type, 'unknown') ELSE 'missing' END,
    CASE WHEN column_row.present THEN 'PASS' ELSE 'FAIL' END
  FROM column_catalog AS column_row
  UNION ALL
  SELECT 'table:rls_acl', table_row.table_name,
    'rls=' || table_row.relrowsecurity::text || '; owner=' || coalesce(table_row.owner_name, 'missing') || '; acl=' || table_row.acl_text,
    CASE WHEN table_row.relrowsecurity THEN 'PASS' ELSE 'FAIL' END
  FROM table_catalog AS table_row
  UNION ALL
  SELECT 'policies', 'google_ads_binding_configuration',
    'targeting=' || policy_row.targeting_policy_count::text || '; state=' || policy_row.state_policy_count::text || '; authenticated_select=' || policy_row.authenticated_select_count::text || '; write_policies=' || policy_row.write_policy_count::text || '; ' || policy_row.details,
    CASE WHEN policy_row.targeting_policy_count = 1 AND policy_row.state_policy_count = 1 AND policy_row.authenticated_select_count = 2 AND policy_row.write_policy_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM policy_checks AS policy_row
  UNION ALL
  SELECT 'constraints', 'google_ads_binding_configuration',
    'targeting_checks=' || constraint_row.targeting_check_count::text || '; state_checks=' || constraint_row.state_check_count::text || '; definitions=' || constraint_row.definitions,
    CASE WHEN constraint_row.targeting_check_count >= 3 AND constraint_row.state_check_count >= 4 THEN 'PASS' ELSE 'FAIL' END
  FROM constraint_checks AS constraint_row
  UNION ALL
  SELECT 'binding_uniqueness', 'google_ads_binding_configuration',
    'targeting_binding_unique=' || unique_row.targeting_binding_unique_count::text || '; state_binding_unique=' || unique_row.state_binding_unique_count::text,
    CASE WHEN unique_row.targeting_binding_unique_count = 1 AND unique_row.state_binding_unique_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM unique_checks AS unique_row
  UNION ALL
  SELECT 'columns:no_sensitive_duplicates', 'google_ads_binding_configuration', sensitive_row.forbidden_columns,
    CASE WHEN sensitive_row.forbidden_column_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM sensitive_columns AS sensitive_row
  UNION ALL
  SELECT 'privileges', privilege_row.table_name,
    'anon_select=' || privilege_row.anon_select::text || '; authenticated_select=' || privilege_row.authenticated_select::text || '; authenticated_write=' || (privilege_row.authenticated_insert OR privilege_row.authenticated_update OR privilege_row.authenticated_delete)::text || '; service_select_insert_update=' || (privilege_row.service_select AND privilege_row.service_insert AND privilege_row.service_update)::text,
    CASE WHEN NOT privilege_row.anon_select AND privilege_row.authenticated_select AND NOT privilege_row.authenticated_insert AND NOT privilege_row.authenticated_update AND NOT privilege_row.authenticated_delete AND privilege_row.service_select AND privilege_row.service_insert AND privilege_row.service_update THEN 'PASS' ELSE 'FAIL' END
  FROM table_privileges AS privilege_row
  UNION ALL
  SELECT 'foreign_keys', 'integration_bindings',
    'targeting=' || fk_row.targeting_fk_count::text || '; state=' || fk_row.state_fk_count::text || '; on_delete_restrict=' || fk_row.restrict_fk_count::text,
    CASE WHEN fk_row.targeting_fk_count = 1 AND fk_row.state_fk_count = 1 AND fk_row.restrict_fk_count >= 2 THEN 'PASS' ELSE 'FAIL' END
  FROM fk_checks AS fk_row
  UNION ALL
  SELECT 'validator:function', 'public.google_ads_binding_configuration_validate()',
    CASE WHEN function_row.function_oid IS NULL THEN 'missing' ELSE 'present; security_definer=' || function_row.prosecdef::text || '; volatility=' || function_row.provolatile::text || '; config=' || coalesce(function_row.config, 'NULL') || '; triggers=' || function_row.trigger_count::text END,
    CASE WHEN function_row.function_oid IS NOT NULL AND NOT function_row.prosecdef AND function_row.provolatile = 'v' AND function_row.config = 'search_path=pg_catalog, public, pg_temp' AND function_row.trigger_count = 2 THEN 'PASS' ELSE 'FAIL' END
  FROM trigger_function AS function_row
  UNION ALL
  SELECT 'validator:triggers', 'google_ads_binding_configuration', trigger_row.details,
    CASE WHEN trigger_row.targeting_trigger_count = 1 AND trigger_row.state_trigger_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM trigger_identity AS trigger_row
  UNION ALL
  SELECT 'preserved_catalog_fingerprint', 'public/non-0033-catalog-v1',
    'expected=' || baseline_row.expected_fingerprint
      || '; observed=' || coalesce(fingerprint_row.fingerprint, 'NULL')
      || '; entries=' || fingerprint_row.entry_count::text
      || '; algorithm=md5(string_agg(canonical_line,''|'' ORDER BY canonical_line))',
    CASE
      WHEN baseline_row.expected_fingerprint IS NULL OR baseline_row.expected_fingerprint = '' THEN 'EVIDENCE_GAP'
      WHEN baseline_row.expected_fingerprint = fingerprint_row.fingerprint THEN 'PASS'
      ELSE 'FAIL'
    END
  FROM baseline AS baseline_row
  CROSS JOIN preserved_catalog_fingerprint AS fingerprint_row
  UNION ALL
  SELECT 'legacy_table_evidence', 'public.minerador_google_ads_connections',
    CASE WHEN legacy_row.relation_oid IS NULL THEN 'missing' ELSE 'present; row_count=' || legacy_row.row_count::text END,
    CASE WHEN legacy_row.relation_oid IS NULL THEN 'FAIL' ELSE 'PASS' END
  FROM legacy_table_evidence AS legacy_row
  UNION ALL
  SELECT 'legacy_table_preserved', 'public.minerador_google_ads_connections',
    CASE WHEN to_regclass('public.minerador_google_ads_connections') IS NULL THEN 'missing' ELSE 'present; untouched by 0033' END,
    'INFO'
  UNION ALL
  SELECT 'legacy_runtime_reads_writes', 'runtime', 'proved locally by source audit, not by SQL catalog', 'INFO'
),
summary AS (
  SELECT
    count(*) FILTER (WHERE check_row.verdict = 'FAIL')::integer AS fail_count,
    count(*) FILTER (WHERE check_row.verdict = 'EVIDENCE_GAP')::integer AS evidence_gap_count
  FROM checks AS check_row
)
SELECT check_name, object_name, observed, verdict
FROM checks
UNION ALL
SELECT 'GOOGLE_ADS_0033_POST_VERIFICATION', 'post-apply',
  'fail_count=' || summary_row.fail_count::text || '; evidence_gap_count=' || summary_row.evidence_gap_count::text,
  CASE
    WHEN summary_row.fail_count > 0 THEN 'FAIL'
    WHEN summary_row.evidence_gap_count > 0 THEN 'PASS_WITH_DOCUMENTED_FINGERPRINT_EVIDENCE_GAP'
    ELSE 'PASS'
  END
FROM summary AS summary_row
ORDER BY check_name, object_name;
