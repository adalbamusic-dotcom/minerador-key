-- Read-only preflight for migration 0032 structural cleanup.
-- Version: 2026-08-12-0032-structural-cleanup-preflight-v1
-- One final result set; catalog-only and self-contained.
-- The shared append-only function is a preservation target, never a drop target.

WITH
metadata AS (
  SELECT '2026-08-12-0032-structural-cleanup-preflight-v1'::text AS script_version
),
target_tables(object_name, schema_name, table_name) AS (
  VALUES
    ('public.brand_exceptional_operation_grants'::text, 'public'::text, 'brand_exceptional_operation_grants'::text),
    ('public.brand_exceptional_operation_execution_events'::text, 'public'::text, 'brand_exceptional_operation_execution_events'::text),
    ('public.tenant_0016_agency_role_rollback'::text, 'public'::text, 'tenant_0016_agency_role_rollback'::text)
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
target_catalog AS (
  SELECT
    target_table.object_name,
    target_table.schema_name,
    target_table.table_name,
    target_class.oid AS relation_oid,
    target_class.relname::text AS catalog_name,
    pg_catalog.pg_get_userbyid(target_class.relowner)::text AS owner_name,
    target_class.relrowsecurity,
    target_class.relforcerowsecurity,
    coalesce(pg_catalog.array_to_string(target_class.relacl, ' | '), 'NULL/default') AS acl_text
  FROM target_tables AS target_table
  LEFT JOIN pg_catalog.pg_namespace AS target_namespace
    ON target_namespace.nspname::text = target_table.schema_name
  LEFT JOIN pg_catalog.pg_class AS target_class
    ON target_class.relnamespace = target_namespace.oid
   AND target_class.relname::text = target_table.table_name
   AND target_class.relkind::text IN ('r', 'p')
),
row_counts AS (
  SELECT 'public.brand_exceptional_operation_grants'::text AS object_name, count(*)::bigint AS row_count
  FROM public.brand_exceptional_operation_grants
  UNION ALL
  SELECT 'public.brand_exceptional_operation_execution_events'::text, count(*)::bigint
  FROM public.brand_exceptional_operation_execution_events
  UNION ALL
  SELECT 'public.tenant_0016_agency_role_rollback'::text, count(*)::bigint
  FROM public.tenant_0016_agency_role_rollback
),
policy_summary AS (
  SELECT
    target_table.object_name,
    count(policy_catalog.policyname)::integer AS policy_count,
    coalesce(string_agg(
      policy_catalog.policyname::text
        || '; roles=' || pg_catalog.array_to_string(policy_catalog.roles, ',')
        || '; cmd=' || policy_catalog.cmd::text
        || '; qual=' || coalesce(policy_catalog.qual::text, '')
        || '; with_check=' || coalesce(policy_catalog.with_check::text, ''),
      ' | ' ORDER BY policy_catalog.policyname::text
    ), 'none') AS policy_details
  FROM target_tables AS target_table
  LEFT JOIN pg_catalog.pg_policies AS policy_catalog
    ON policy_catalog.schemaname::text = target_table.schema_name
   AND policy_catalog.tablename::text = target_table.table_name
  GROUP BY target_table.object_name
),
index_summary AS (
  SELECT
    target_table.object_name,
    count(index_catalog.indexname)::integer AS index_count,
    coalesce(string_agg(
      index_catalog.indexname::text || '; ' || index_catalog.indexdef::text,
      ' | ' ORDER BY index_catalog.indexname::text
    ), 'none') AS index_details
  FROM target_tables AS target_table
  LEFT JOIN pg_catalog.pg_indexes AS index_catalog
    ON index_catalog.schemaname::text = target_table.schema_name
   AND index_catalog.tablename::text = target_table.table_name
  GROUP BY target_table.object_name
),
constraint_summary AS (
  SELECT
    target_table.object_name,
    count(constraint_catalog.oid)::integer AS constraint_count,
    coalesce(string_agg(
      constraint_catalog.conname::text
        || '; type=' || constraint_catalog.contype::text
        || '; ' || pg_catalog.pg_get_constraintdef(constraint_catalog.oid, true)::text,
      ' | ' ORDER BY constraint_catalog.conname::text
    ), 'none') AS constraint_details
  FROM target_tables AS target_table
  LEFT JOIN target_catalog AS target_row ON target_row.object_name = target_table.object_name
  LEFT JOIN pg_catalog.pg_constraint AS constraint_catalog
    ON constraint_catalog.conrelid = target_row.relation_oid
  GROUP BY target_table.object_name
),
foreign_key_inventory AS (
  SELECT
    target_row.object_name,
    CASE WHEN foreign_key.confrelid = target_row.relation_oid THEN 'incoming'::text ELSE 'outgoing'::text END AS direction,
    foreign_key.conname::text AS constraint_name,
    foreign_key.conrelid AS child_relation_oid,
    foreign_key.conrelid::regclass::text AS child_object,
    foreign_key.confrelid::regclass::text AS parent_object,
    CASE foreign_key.confdeltype::text
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE 'UNKNOWN'
    END AS on_delete,
    pg_catalog.pg_get_constraintdef(foreign_key.oid, true)::text AS definition
  FROM target_catalog AS target_row
  JOIN pg_catalog.pg_constraint AS foreign_key
    ON foreign_key.contype::text = 'f'
   AND (foreign_key.confrelid = target_row.relation_oid OR foreign_key.conrelid = target_row.relation_oid)
  WHERE target_row.relation_oid IS NOT NULL
),
foreign_key_summary AS (
  SELECT
    target_row.object_name,
    count(foreign_key_row.constraint_name) FILTER (WHERE foreign_key_row.direction = 'incoming')::integer AS incoming_count,
    count(foreign_key_row.constraint_name) FILTER (WHERE foreign_key_row.direction = 'outgoing')::integer AS outgoing_count,
    count(foreign_key_row.constraint_name) FILTER (
      WHERE foreign_key_row.direction = 'incoming'
        AND NOT EXISTS (
          SELECT 1 FROM target_catalog AS known_target
          WHERE known_target.relation_oid = foreign_key_row.child_relation_oid
        )
    )::integer AS external_incoming_count,
    coalesce(string_agg(
      foreign_key_row.direction || '; ' || foreign_key_row.child_object
        || ' -> ' || foreign_key_row.parent_object
        || '; constraint=' || foreign_key_row.constraint_name
        || '; on_delete=' || foreign_key_row.on_delete,
      ' | ' ORDER BY foreign_key_row.direction, foreign_key_row.constraint_name
    ), 'none') AS relationship_details
  FROM target_catalog AS target_row
  LEFT JOIN foreign_key_inventory AS foreign_key_row
    ON foreign_key_row.object_name = target_row.object_name
  GROUP BY target_row.object_name
),
table_dependency_rows AS (
  SELECT
    target_row.object_name,
    dependency_row.deptype::text AS dependency_type,
    dependency_row.classid::regclass::text AS related_class,
    pg_catalog.pg_describe_object(dependency_row.classid, dependency_row.objid, dependency_row.objsubid)::text AS related_object,
    CASE
      WHEN dependency_row.deptype::text = 'i' THEN true
      WHEN dependency_row.classid = 'pg_class'::regclass
       AND (dependent_index.indrelid = target_row.relation_oid
         OR dependent_class.oid IN (SELECT relation_oid FROM target_catalog WHERE relation_oid IS NOT NULL)) THEN true
      WHEN dependency_row.classid = 'pg_constraint'::regclass
       AND dependent_constraint.conrelid = target_row.relation_oid THEN true
      WHEN dependency_row.classid = 'pg_trigger'::regclass
       AND dependent_trigger.tgrelid = target_row.relation_oid THEN true
      WHEN dependency_row.classid = 'pg_rewrite'::regclass
       AND dependent_rewrite.ev_class = target_row.relation_oid THEN true
      WHEN dependency_row.classid = 'pg_policy'::regclass
       AND dependent_policy.polrelid = target_row.relation_oid THEN true
      WHEN dependency_row.classid = 'pg_proc'::regclass
       AND dependent_function.oid = (SELECT function_oid FROM helper_target) THEN true
      ELSE false
    END AS is_internal_candidate_dependency
  FROM target_catalog AS target_row
  JOIN pg_catalog.pg_depend AS dependency_row
    ON dependency_row.refclassid = 'pg_class'::regclass
   AND dependency_row.refobjid = target_row.relation_oid
  LEFT JOIN pg_catalog.pg_class AS dependent_class
    ON dependency_row.classid = 'pg_class'::regclass
   AND dependent_class.oid = dependency_row.objid
  LEFT JOIN pg_catalog.pg_index AS dependent_index
    ON dependent_index.indexrelid = dependent_class.oid
  LEFT JOIN pg_catalog.pg_constraint AS dependent_constraint
    ON dependency_row.classid = 'pg_constraint'::regclass
   AND dependent_constraint.oid = dependency_row.objid
  LEFT JOIN pg_catalog.pg_trigger AS dependent_trigger
    ON dependency_row.classid = 'pg_trigger'::regclass
   AND dependent_trigger.oid = dependency_row.objid
  LEFT JOIN pg_catalog.pg_rewrite AS dependent_rewrite
    ON dependency_row.classid = 'pg_rewrite'::regclass
   AND dependent_rewrite.oid = dependency_row.objid
  LEFT JOIN pg_catalog.pg_policy AS dependent_policy
    ON dependency_row.classid = 'pg_policy'::regclass
   AND dependent_policy.oid = dependency_row.objid
  LEFT JOIN pg_catalog.pg_proc AS dependent_function
    ON dependency_row.classid = 'pg_proc'::regclass
   AND dependent_function.oid = dependency_row.objid
  WHERE target_row.relation_oid IS NOT NULL
),
table_external_dependency_rows AS (
  SELECT DISTINCT
    dependency_row.object_name,
    dependency_row.dependency_type,
    dependency_row.related_class,
    dependency_row.related_object
  FROM table_dependency_rows AS dependency_row
  WHERE NOT dependency_row.is_internal_candidate_dependency
),
table_external_dependency_summary AS (
  SELECT
    target_row.object_name,
    count(dependency_row.related_object)::integer AS external_count,
    coalesce(string_agg(
      dependency_row.related_class || '; deptype=' || dependency_row.dependency_type || '; object=' || dependency_row.related_object,
      ' | ' ORDER BY dependency_row.related_class, dependency_row.related_object
    ), 'none') AS external_details
  FROM target_catalog AS target_row
  LEFT JOIN table_external_dependency_rows AS dependency_row
    ON dependency_row.object_name = target_row.object_name
  GROUP BY target_row.object_name
),
event_trigger_match AS (
  SELECT
    count(event_trigger.oid)::integer AS trigger_count,
    count(event_trigger.oid) FILTER (WHERE event_trigger.tgname::text = 'brand_exceptional_operation_execution_events_append_only_trg_00')::integer AS exact_name_count,
    count(event_trigger.oid) FILTER (WHERE event_trigger.tgfoid = (SELECT function_oid FROM shared_target))::integer AS exact_function_count,
    count(event_trigger.oid) FILTER (WHERE event_trigger.tgtype::integer = 27)::integer AS exact_event_shape_count,
    count(event_trigger.oid) FILTER (WHERE event_trigger.tgname::text = 'brand_exceptional_operation_execution_events_append_only_trg_00'
      AND event_trigger.tgfoid = (SELECT function_oid FROM shared_target)
      AND event_trigger.tgtype::integer = 27)::integer AS exact_match_count,
    max(CASE WHEN event_trigger.tgname::text = 'brand_exceptional_operation_execution_events_append_only_trg_00'
      AND event_trigger.tgfoid = (SELECT function_oid FROM shared_target)
      AND event_trigger.tgtype::integer = 27 THEN event_trigger.tgenabled::text END) AS exact_enabled_state,
    coalesce(string_agg(
      event_trigger.tgname::text || '; enabled=' || event_trigger.tgenabled::text || '; tgtype=' || event_trigger.tgtype::integer::text,
      ' | ' ORDER BY event_trigger.tgname::text
    ), 'none') AS observed_details
  FROM pg_catalog.pg_trigger AS event_trigger
  WHERE event_trigger.tgrelid = (
    SELECT target_row.relation_oid FROM target_catalog AS target_row
    WHERE target_row.object_name = 'public.brand_exceptional_operation_execution_events'
  )
    AND NOT event_trigger.tgisinternal
),
helper_dependency_rows AS (
  SELECT DISTINCT
    'function'::text AS dependency_kind,
    dependent_namespace.nspname::text || '.' || dependent_function.proname::text
      || '(' || pg_catalog.pg_get_function_identity_arguments(dependent_function.oid)::text || ')' AS dependency_name
  FROM helper_target AS helper_row
  JOIN pg_catalog.pg_depend AS helper_dependency
    ON helper_dependency.refclassid = 'pg_proc'::regclass
   AND helper_dependency.refobjid = helper_row.function_oid
   AND helper_dependency.classid = 'pg_proc'::regclass
  JOIN pg_catalog.pg_proc AS dependent_function ON dependent_function.oid = helper_dependency.objid
  JOIN pg_catalog.pg_namespace AS dependent_namespace ON dependent_namespace.oid = dependent_function.pronamespace
  WHERE dependent_function.oid <> helper_row.function_oid
    AND dependent_namespace.nspname::text NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  SELECT DISTINCT
    'view'::text,
    view_namespace.nspname::text || '.' || view_class.relname::text
  FROM helper_target AS helper_row
  JOIN pg_catalog.pg_depend AS helper_dependency
    ON helper_dependency.refclassid = 'pg_proc'::regclass
   AND helper_dependency.refobjid = helper_row.function_oid
   AND helper_dependency.classid = 'pg_rewrite'::regclass
  JOIN pg_catalog.pg_rewrite AS view_rewrite ON view_rewrite.oid = helper_dependency.objid
  JOIN pg_catalog.pg_class AS view_class ON view_class.oid = view_rewrite.ev_class AND view_class.relkind::text IN ('v', 'm')
  JOIN pg_catalog.pg_namespace AS view_namespace ON view_namespace.oid = view_class.relnamespace
  UNION ALL
  SELECT DISTINCT
    'trigger'::text,
    trigger_namespace.nspname::text || '.' || trigger_class.relname::text || ':' || helper_trigger.tgname::text
  FROM helper_target AS helper_row
  JOIN pg_catalog.pg_trigger AS helper_trigger ON helper_trigger.tgfoid = helper_row.function_oid AND NOT helper_trigger.tgisinternal
  JOIN pg_catalog.pg_class AS trigger_class ON trigger_class.oid = helper_trigger.tgrelid
  JOIN pg_catalog.pg_namespace AS trigger_namespace ON trigger_namespace.oid = trigger_class.relnamespace
),
helper_dependency_summary AS (
  SELECT
    count(dependency_row.dependency_name)::integer AS external_count,
    coalesce(string_agg(dependency_row.dependency_kind || '; ' || dependency_row.dependency_name,
      ' | ' ORDER BY dependency_row.dependency_kind, dependency_row.dependency_name), 'none') AS dependency_details
  FROM helper_dependency_rows AS dependency_row
),
shared_expected_consumers(object_name, trigger_name) AS (
  VALUES
    ('public.content_document_versions'::text, 'content_document_versions_append_only_trg'::text),
    ('public.editorial_artifact_versions'::text, 'editorial_artifact_versions_append_only_trg'::text),
    ('public.editorial_serp_reviews'::text, 'editorial_serp_reviews_append_only_trg'::text),
    ('public.editorial_serp_snapshots'::text, 'editorial_serp_snapshots_append_only_trg'::text)
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
        WHERE actual_row.object_name = expected_row.object_name AND actual_row.trigger_name = expected_row.trigger_name)) AS missing_count,
    (SELECT count(*)::integer FROM shared_actual_consumers AS actual_row
      WHERE NOT EXISTS (SELECT 1 FROM shared_expected_consumers AS expected_row
        WHERE expected_row.object_name = actual_row.object_name AND expected_row.trigger_name = actual_row.trigger_name)) AS unexpected_count,
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
final_gate AS (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM target_catalog WHERE relation_oid IS NULL) THEN 'FAIL'
    WHEN EXISTS (SELECT 1 FROM row_counts WHERE row_count <> 0) THEN 'FAIL'
    WHEN EXISTS (SELECT 1 FROM foreign_key_summary WHERE external_incoming_count <> 0) THEN 'FAIL'
    WHEN EXISTS (SELECT 1 FROM table_external_dependency_summary WHERE external_count <> 0) THEN 'FAIL'
    WHEN (SELECT function_oid FROM helper_target) IS NULL THEN 'FAIL'
    WHEN (SELECT external_count FROM helper_dependency_summary) <> 0 THEN 'FAIL'
    WHEN (SELECT trigger_count FROM event_trigger_match) <> 1 THEN 'FAIL'
    WHEN (SELECT exact_match_count FROM event_trigger_match) <> 1 THEN 'FAIL'
    WHEN (SELECT expected_count FROM shared_consumer_summary) <> 4 THEN 'FAIL'
    WHEN (SELECT missing_count FROM shared_consumer_summary) <> 0 THEN 'FAIL'
    WHEN (SELECT unexpected_count FROM shared_consumer_summary) <> 0 THEN 'FAIL'
    ELSE 'PASS'
  END AS verdict
),
checks(check_name, object_name, observed, verdict) AS (
  SELECT 'script_version', 'script', metadata_row.script_version, 'INFO' FROM metadata AS metadata_row
  UNION ALL
  SELECT 'table:existence', target_row.object_name,
    CASE WHEN target_row.relation_oid IS NULL THEN 'missing' ELSE 'present; catalog=' || target_row.catalog_name END,
    CASE WHEN target_row.relation_oid IS NULL THEN 'FAIL' ELSE 'PASS' END
  FROM target_catalog AS target_row
  UNION ALL
  SELECT 'table:empty', count_row.object_name, count_row.row_count::text,
    CASE WHEN count_row.row_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM row_counts AS count_row
  UNION ALL
  SELECT 'table:owner_rls_acl', target_row.object_name,
    'owner=' || coalesce(target_row.owner_name, 'missing') || '; rls=' || coalesce(target_row.relrowsecurity::text, 'missing')
      || '; force_rls=' || coalesce(target_row.relforcerowsecurity::text, 'missing') || '; acl=' || target_row.acl_text,
    'INFO'
  FROM target_catalog AS target_row
  UNION ALL
  SELECT 'table:policies', policy_row.object_name, 'count=' || policy_row.policy_count::text || '; ' || policy_row.policy_details, 'INFO'
  FROM policy_summary AS policy_row
  UNION ALL
  SELECT 'table:indexes', index_row.object_name, 'count=' || index_row.index_count::text || '; ' || index_row.index_details, 'INFO'
  FROM index_summary AS index_row
  UNION ALL
  SELECT 'table:constraints', constraint_row.object_name, 'count=' || constraint_row.constraint_count::text || '; ' || constraint_row.constraint_details, 'INFO'
  FROM constraint_summary AS constraint_row
  UNION ALL
  SELECT 'table:foreign_keys', foreign_row.object_name,
    'incoming=' || foreign_row.incoming_count::text || '; outgoing=' || foreign_row.outgoing_count::text
      || '; external_incoming=' || foreign_row.external_incoming_count::text || '; ' || foreign_row.relationship_details,
    CASE WHEN foreign_row.external_incoming_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM foreign_key_summary AS foreign_row
  UNION ALL
  SELECT 'table:external_pg_depend', dependency_row.object_name,
    'count=' || dependency_row.external_count::text || '; ' || dependency_row.external_details,
    CASE WHEN dependency_row.external_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM table_external_dependency_summary AS dependency_row
  UNION ALL
  SELECT 'helper:existence', helper_row.object_name,
    CASE WHEN helper_row.function_oid IS NULL THEN 'missing' ELSE 'present' END,
    CASE WHEN helper_row.function_oid IS NULL THEN 'FAIL' ELSE 'PASS' END
  FROM helper_target AS helper_row
  UNION ALL
  SELECT 'helper:external_dependents', 'public.canonical_actor_can_execute_brand_exceptional_operation(uuid,uuid,text)',
    'count=' || helper_row.external_count::text || '; ' || helper_row.dependency_details,
    CASE WHEN helper_row.external_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM helper_dependency_summary AS helper_row
  UNION ALL
  SELECT 'helper:metadata_acl', helper_row.object_name,
    'owner=' || coalesce(pg_catalog.pg_get_userbyid(helper_function.proowner)::text, 'missing')
      || '; security_definer=' || coalesce(helper_function.prosecdef::text, 'missing')
      || '; volatility=' || coalesce(helper_function.provolatile::text, 'missing')
      || '; acl=' || coalesce(pg_catalog.array_to_string(helper_function.proacl, ' | '), 'NULL/default'),
    'INFO'
  FROM helper_target AS helper_row
  LEFT JOIN pg_catalog.pg_proc AS helper_function ON helper_function.oid = helper_row.function_oid
  UNION ALL
  SELECT 'trigger:0030_identity', 'public.brand_exceptional_operation_execution_events',
    'trigger_count=' || trigger_row.trigger_count::text || '; exact_name=' || trigger_row.exact_name_count::text
      || '; exact_function=' || trigger_row.exact_function_count::text || '; exact_events=' || trigger_row.exact_event_shape_count::text
      || '; exact_match=' || trigger_row.exact_match_count::text || '; enabled=' || coalesce(trigger_row.exact_enabled_state, 'missing')
      || '; observed=' || trigger_row.observed_details,
    CASE WHEN trigger_row.trigger_count = 1 AND trigger_row.exact_match_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM event_trigger_match AS trigger_row
  UNION ALL
  SELECT 'shared_function:consumers', 'public.pipeline_editorial_protect_append_only()',
    'expected=' || shared_row.expected_count::text || '; missing=' || shared_row.missing_count::text
      || '; unexpected=' || shared_row.unexpected_count::text || '; actual=' || shared_row.actual_details,
    CASE WHEN shared_row.expected_count = 4 AND shared_row.missing_count = 0 AND shared_row.unexpected_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM shared_consumer_summary AS shared_row
  UNION ALL
  SELECT 'preserved_catalog_fingerprint', 'public/non-target-catalog', preserved_row.fingerprint, 'INFO'
  FROM preserved_fingerprint AS preserved_row
  UNION ALL
  SELECT 'STRUCTURAL_CLEANUP_0032_PRECHECK', 'structural_cleanup', 'all required preconditions evaluated', final_row.verdict
  FROM final_gate AS final_row
)
SELECT check_name, object_name, observed, verdict
FROM checks
ORDER BY check_name, object_name;
