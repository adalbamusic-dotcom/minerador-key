-- Read-only post-verifier for migration 0032 structural cleanup.
-- Version: 2026-08-12-0032-structural-cleanup-post-verifier-v3
-- Replace the baseline literal only when a pre-apply v1 fingerprint for this
-- exact public/non-target-catalog set exists. Otherwise keep the placeholder:
-- the result is an evidence gap, never a structural failure.

WITH
metadata AS (
  SELECT '2026-08-12-0032-structural-cleanup-post-verifier-v3'::text AS script_version
),
baseline AS (
  SELECT '__PASTE_PRE_0032_PRESERVED_CATALOG_FINGERPRINT__'::text AS expected_fingerprint
),
removed_table_catalog(object_name, relation_oid) AS (
  SELECT 'public.brand_exceptional_operation_grants'::text,
    pg_catalog.to_regclass('public.brand_exceptional_operation_grants')::oid
  UNION ALL
  SELECT 'public.brand_exceptional_operation_execution_events'::text,
    pg_catalog.to_regclass('public.brand_exceptional_operation_execution_events')::oid
  UNION ALL
  SELECT 'public.tenant_0016_agency_role_rollback'::text,
    pg_catalog.to_regclass('public.tenant_0016_agency_role_rollback')::oid
),
helper_target AS (
  SELECT
    'public.canonical_actor_can_execute_brand_exceptional_operation(uuid,uuid,text)'::text AS object_name,
    pg_catalog.to_regprocedure('public.canonical_actor_can_execute_brand_exceptional_operation(uuid,uuid,text)')::oid AS function_oid
),
shared_target AS (
  SELECT
    'public.pipeline_editorial_protect_append_only()'::text AS object_name,
    pg_catalog.to_regprocedure('public.pipeline_editorial_protect_append_only()')::oid AS function_oid
),
removed_trigger_catalog AS (
  SELECT
    event_trigger.oid,
    event_trigger.tgfoid,
    event_trigger.tgenabled::text AS enabled_state
  FROM pg_catalog.pg_trigger AS event_trigger
  JOIN pg_catalog.pg_class AS event_class
    ON event_class.oid = event_trigger.tgrelid
  JOIN pg_catalog.pg_namespace AS event_namespace
    ON event_namespace.oid = event_class.relnamespace
  WHERE event_namespace.nspname::text = 'public'
    AND event_class.relname::text = 'brand_exceptional_operation_execution_events'
    AND event_trigger.tgname::text = 'brand_exceptional_operation_execution_events_append_only_trg_00'
    AND NOT event_trigger.tgisinternal
),
trigger_absence AS (
  SELECT
    count(removed_trigger.oid)::integer AS trigger_count,
    count(removed_trigger.oid) FILTER (
      WHERE removed_trigger.tgfoid = shared_row.function_oid
    )::integer AS exact_identity_count
  FROM removed_trigger_catalog AS removed_trigger
  CROSS JOIN shared_target AS shared_row
),
shared_expected_consumers(object_name, trigger_name, expected_enabled_state, expected_trigger_type) AS (
  VALUES
    ('public.content_document_versions'::text, 'content_document_versions_append_only_trg'::text, 'O'::text, 27),
    ('public.editorial_artifact_versions'::text, 'editorial_artifact_versions_append_only_trg'::text, 'O'::text, 27),
    ('public.editorial_serp_reviews'::text, 'editorial_serp_reviews_append_only_trg'::text, 'O'::text, 27),
    ('public.editorial_serp_snapshots'::text, 'editorial_serp_snapshots_append_only_trg'::text, 'O'::text, 27)
),
shared_actual_consumers AS (
  SELECT DISTINCT
    shared_namespace.nspname::text || '.' || shared_class.relname::text AS object_name,
    shared_trigger.tgname::text AS trigger_name,
    shared_trigger.tgenabled::text AS enabled_state,
    shared_trigger.tgtype::integer AS trigger_type
  FROM shared_target AS shared_row
  JOIN pg_catalog.pg_trigger AS shared_trigger
    ON shared_trigger.tgfoid = shared_row.function_oid
   AND NOT shared_trigger.tgisinternal
  JOIN pg_catalog.pg_class AS shared_class ON shared_class.oid = shared_trigger.tgrelid
  JOIN pg_catalog.pg_namespace AS shared_namespace ON shared_namespace.oid = shared_class.relnamespace
  WHERE NOT (shared_namespace.nspname::text = 'public'
    AND shared_class.relname::text = 'brand_exceptional_operation_execution_events')
),
shared_consumer_summary AS (
  SELECT
    (SELECT count(*)::integer FROM shared_expected_consumers) AS expected_count,
    (SELECT count(*)::integer FROM shared_expected_consumers AS expected_row
      WHERE NOT EXISTS (SELECT 1 FROM shared_actual_consumers AS actual_row
        WHERE actual_row.object_name = expected_row.object_name
          AND actual_row.trigger_name = expected_row.trigger_name)) AS missing_count,
    (SELECT count(*)::integer FROM shared_expected_consumers AS expected_row
      WHERE NOT EXISTS (SELECT 1 FROM shared_actual_consumers AS actual_row
        WHERE actual_row.object_name = expected_row.object_name
          AND actual_row.trigger_name = expected_row.trigger_name
          AND actual_row.enabled_state = expected_row.expected_enabled_state
          AND actual_row.trigger_type = expected_row.expected_trigger_type)) AS state_mismatch_count,
    (SELECT count(*)::integer FROM shared_actual_consumers AS actual_row
      WHERE NOT EXISTS (SELECT 1 FROM shared_expected_consumers AS expected_row
        WHERE expected_row.object_name = actual_row.object_name
          AND expected_row.trigger_name = actual_row.trigger_name)) AS unexpected_count,
    coalesce((SELECT string_agg(actual_row.object_name || ':' || actual_row.trigger_name
      || '; enabled=' || actual_row.enabled_state || '; tgtype=' || actual_row.trigger_type::text,
      ' | ' ORDER BY actual_row.object_name, actual_row.trigger_name)
      FROM shared_actual_consumers AS actual_row), 'none') AS actual_details
),
preserved_tables(schema_name, table_name) AS (
  VALUES
    ('auth'::text, 'users'::text),
    ('public'::text, 'perfis'::text),
    ('public'::text, 'agencies'::text),
    ('public'::text, 'agency_memberships'::text),
    ('public'::text, 'marcas'::text),
    ('public'::text, 'editorial_workflow_items'::text),
    ('public'::text, 'editorial_artifact_versions'::text),
    ('public'::text, 'editorial_serp_snapshots'::text),
    ('public'::text, 'editorial_serp_reviews'::text),
    ('public'::text, 'content_documents'::text),
    ('public'::text, 'content_document_versions'::text),
    ('public'::text, 'publication_records'::text)
),
preserved_table_catalog AS (
  SELECT
    preserved_table.schema_name,
    preserved_table.table_name,
    preserved_class.oid AS relation_oid,
    pg_catalog.pg_get_userbyid(preserved_class.relowner)::text AS owner_name,
    preserved_class.relrowsecurity,
    preserved_class.relforcerowsecurity,
    coalesce(pg_catalog.array_to_string(preserved_class.relacl, ' | '), 'NULL/default') AS acl_text
  FROM preserved_tables AS preserved_table
  LEFT JOIN pg_catalog.pg_namespace AS preserved_namespace
    ON preserved_namespace.nspname::text = preserved_table.schema_name
  LEFT JOIN pg_catalog.pg_class AS preserved_class
    ON preserved_class.relnamespace = preserved_namespace.oid
   AND preserved_class.relname::text = preserved_table.table_name
   AND preserved_class.relkind::text IN ('r', 'p')
),
preserved_policy_summary AS (
  SELECT
    preserved_table.schema_name,
    preserved_table.table_name,
    coalesce(string_agg(
      policy_catalog.policyname::text || '; roles=' || pg_catalog.array_to_string(policy_catalog.roles, ',')
        || '; cmd=' || policy_catalog.cmd::text || '; qual=' || coalesce(policy_catalog.qual::text, '')
        || '; with_check=' || coalesce(policy_catalog.with_check::text, ''),
      ' | ' ORDER BY policy_catalog.policyname::text), 'none') AS policy_details
  FROM preserved_tables AS preserved_table
  LEFT JOIN pg_catalog.pg_policies AS policy_catalog
    ON policy_catalog.schemaname::text = preserved_table.schema_name
   AND policy_catalog.tablename::text = preserved_table.table_name
  GROUP BY preserved_table.schema_name, preserved_table.table_name
),
preserved_catalog_lines AS (
  SELECT
    preserved_table.schema_name || '.' || preserved_table.table_name
      || '; exists=' || (preserved_table.relation_oid IS NOT NULL)::text
      || '; owner=' || coalesce(preserved_table.owner_name, 'missing')
      || '; rls=' || coalesce(preserved_table.relrowsecurity::text, 'missing')
      || '; force_rls=' || coalesce(preserved_table.relforcerowsecurity::text, 'missing')
      || '; acl=' || preserved_table.acl_text
      || '; policies=' || policy_row.policy_details AS line
  FROM preserved_table_catalog AS preserved_table
  JOIN preserved_policy_summary AS policy_row
    ON policy_row.schema_name = preserved_table.schema_name
   AND policy_row.table_name = preserved_table.table_name
  UNION ALL
  SELECT
    'function:public.pipeline_editorial_protect_append_only()'
      || '; exists=' || (shared_function.oid IS NOT NULL)::text
      || '; owner=' || coalesce(pg_catalog.pg_get_userbyid(shared_function.proowner)::text, 'missing')
      || '; security_definer=' || coalesce(shared_function.prosecdef::text, 'missing')
      || '; volatility=' || coalesce(shared_function.provolatile::text, 'missing')
      || '; config=' || coalesce(pg_catalog.array_to_string(shared_function.proconfig, ' | '), 'NULL')
      || '; acl=' || coalesce(pg_catalog.array_to_string(shared_function.proacl, ' | '), 'NULL/default')
      || '; definition_md5=' || coalesce(md5(pg_catalog.pg_get_functiondef(shared_function.oid)), 'missing') AS line
  FROM shared_target AS shared_target_row
  LEFT JOIN pg_catalog.pg_proc AS shared_function ON shared_function.oid = shared_target_row.function_oid
  UNION ALL
  SELECT
    'trigger:' || shared_row.object_name || ':' || shared_row.trigger_name
      || '; enabled=' || shared_row.enabled_state || '; tgtype=' || shared_row.trigger_type::text AS line
  FROM shared_actual_consumers AS shared_row
),
preserved_fingerprint AS (
  SELECT md5(string_agg(line, '|' ORDER BY line)) AS fingerprint
  FROM preserved_catalog_lines
),
preserved_presence AS (
  SELECT
    preserved_table.schema_name || '.' || preserved_table.table_name AS object_name,
    preserved_catalog.relation_oid,
    preserved_catalog.owner_name,
    preserved_catalog.relrowsecurity,
    preserved_catalog.relforcerowsecurity,
    preserved_catalog.acl_text,
    policy_row.policy_details
  FROM preserved_tables AS preserved_table
  JOIN preserved_table_catalog AS preserved_catalog
    ON preserved_catalog.schema_name = preserved_table.schema_name
   AND preserved_catalog.table_name = preserved_table.table_name
  JOIN preserved_policy_summary AS policy_row
    ON policy_row.schema_name = preserved_table.schema_name
   AND policy_row.table_name = preserved_table.table_name
),
fingerprint_gate AS (
  SELECT
    baseline_row.expected_fingerprint,
    current_row.fingerprint,
    CASE
      WHEN baseline_row.expected_fingerprint = '__PASTE_PRE_0032_PRESERVED_CATALOG_FINGERPRINT__' THEN 'EVIDENCE_GAP'
      WHEN baseline_row.expected_fingerprint = current_row.fingerprint THEN 'PASS'
      ELSE 'FAIL'
    END AS verdict
  FROM baseline AS baseline_row
  CROSS JOIN preserved_fingerprint AS current_row
),
preserved_table_summary AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE presence_row.relation_oid IS NOT NULL)::integer AS present_count
  FROM preserved_presence AS presence_row
),
checks(check_name, object_name, observed, verdict) AS (
  SELECT 'script_version', 'script', metadata_row.script_version, 'INFO'
  FROM metadata AS metadata_row
  UNION ALL
  SELECT 'removed_table_absent', target_row.object_name,
    CASE WHEN target_row.relation_oid IS NULL THEN 'absent' ELSE 'present' END,
    CASE WHEN target_row.relation_oid IS NULL THEN 'PASS' ELSE 'FAIL' END
  FROM removed_table_catalog AS target_row
  UNION ALL
  SELECT 'removed_helper_absent', helper_row.object_name,
    CASE WHEN helper_row.function_oid IS NULL THEN 'absent' ELSE 'present' END,
    CASE WHEN helper_row.function_oid IS NULL THEN 'PASS' ELSE 'FAIL' END
  FROM helper_target AS helper_row
  UNION ALL
  SELECT 'removed_trigger_absent',
    'public.brand_exceptional_operation_execution_events:brand_exceptional_operation_execution_events_append_only_trg_00',
    'named=' || trigger_row.trigger_count::text || '; exact_function=' || trigger_row.exact_identity_count::text,
    CASE WHEN trigger_row.trigger_count = 0 AND trigger_row.exact_identity_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM trigger_absence AS trigger_row
  UNION ALL
  SELECT 'shared_function_present', shared_row.object_name,
    CASE WHEN shared_function.oid IS NULL THEN 'missing'
      ELSE 'owner=' || pg_catalog.pg_get_userbyid(shared_function.proowner)::text
        || '; security_definer=' || shared_function.prosecdef::text
        || '; volatility=' || shared_function.provolatile::text
        || '; search_path=' || coalesce(pg_catalog.array_to_string(shared_function.proconfig, ' | '), 'NULL')
        || '; definition_md5=' || coalesce(md5(pg_catalog.pg_get_functiondef(shared_function.oid)), 'missing') END,
    CASE WHEN shared_function.oid IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  FROM shared_target AS shared_row
  LEFT JOIN pg_catalog.pg_proc AS shared_function ON shared_function.oid = shared_row.function_oid
  UNION ALL
  SELECT 'shared_consumers_intact', 'public.pipeline_editorial_protect_append_only()',
    'expected=' || consumer_row.expected_count::text
      || '; missing=' || consumer_row.missing_count::text
      || '; unexpected=' || consumer_row.unexpected_count::text
      || '; state_mismatch=' || consumer_row.state_mismatch_count::text
      || '; actual=' || consumer_row.actual_details,
    CASE WHEN consumer_row.expected_count = 4
      AND consumer_row.missing_count = 0
      AND consumer_row.unexpected_count = 0
      AND consumer_row.state_mismatch_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM shared_consumer_summary AS consumer_row
  UNION ALL
  SELECT 'preserved_table_present', presence_row.object_name,
    'owner=' || coalesce(presence_row.owner_name, 'missing')
      || '; rls=' || coalesce(presence_row.relrowsecurity::text, 'missing')
      || '; force_rls=' || coalesce(presence_row.relforcerowsecurity::text, 'missing')
      || '; acl=' || presence_row.acl_text
      || '; policies=' || presence_row.policy_details,
    CASE WHEN presence_row.relation_oid IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  FROM preserved_presence AS presence_row
  UNION ALL
  SELECT 'preserved_table_count', 'preserved_catalog',
    summary_row.present_count::text || '/' || summary_row.expected_count::text,
    CASE WHEN summary_row.expected_count = 12 AND summary_row.present_count = 12 THEN 'PASS' ELSE 'FAIL' END
  FROM preserved_table_summary AS summary_row
  UNION ALL
  SELECT 'preserved_catalog_fingerprint', 'public/non-target-catalog',
    CASE WHEN baseline_row.expected_fingerprint = '__PASTE_PRE_0032_PRESERVED_CATALOG_FINGERPRINT__'
      THEN 'current=' || fingerprint_row.fingerprint || '; expected=PRE_APPLY_BASELINE_NOT_CAPTURED'
      ELSE 'current=' || fingerprint_row.fingerprint || '; expected=' || baseline_row.expected_fingerprint END,
    gate_row.verdict
  FROM preserved_fingerprint AS fingerprint_row
  CROSS JOIN baseline AS baseline_row
  CROSS JOIN fingerprint_gate AS gate_row
  UNION ALL
  SELECT 'STRUCTURAL_CLEANUP_0032_POST_VERIFIER', 'structural_cleanup',
    'removed objects absent; preserved catalog/function/trigger checks evaluated',
    final_row.verdict
  FROM (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM removed_table_catalog WHERE relation_oid IS NOT NULL) THEN 'FAIL'
      WHEN (SELECT function_oid FROM helper_target) IS NOT NULL THEN 'FAIL'
      WHEN (SELECT trigger_count FROM trigger_absence) <> 0 THEN 'FAIL'
      WHEN (SELECT function_oid FROM shared_target) IS NULL THEN 'FAIL'
      WHEN (SELECT expected_count FROM shared_consumer_summary) <> 4 THEN 'FAIL'
      WHEN (SELECT missing_count FROM shared_consumer_summary) <> 0 THEN 'FAIL'
      WHEN (SELECT unexpected_count FROM shared_consumer_summary) <> 0 THEN 'FAIL'
      WHEN (SELECT state_mismatch_count FROM shared_consumer_summary) <> 0 THEN 'FAIL'
      WHEN EXISTS (SELECT 1 FROM preserved_presence WHERE relation_oid IS NULL) THEN 'FAIL'
      WHEN (SELECT present_count FROM preserved_table_summary) <> 12 THEN 'FAIL'
      WHEN (SELECT verdict FROM fingerprint_gate) = 'FAIL' THEN 'FAIL'
      WHEN (SELECT verdict FROM fingerprint_gate) = 'EVIDENCE_GAP'
        THEN 'PASS_WITH_DOCUMENTED_FINGERPRINT_EVIDENCE_GAP'
      ELSE 'PASS'
    END AS verdict
  ) AS final_row
)
SELECT check_name, object_name, observed, verdict
FROM checks
ORDER BY check_name, object_name;
