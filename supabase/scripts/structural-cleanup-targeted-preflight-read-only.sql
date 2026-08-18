-- Targeted structural cleanup preflight for the abandoned 0030/0016 objects.
-- Version: 2026-08-12-targeted-structural-cleanup-preflight-v1
-- One final result set. Catalog/data read-only; no dynamic SQL or persistent objects.
-- The shared append-only function is inspected only for preservation evidence.

WITH
metadata AS (
  SELECT '2026-08-12-targeted-structural-cleanup-preflight-v1'::text AS script_version
),
target_relations(object_name, relation_name, relation_oid) AS (
  SELECT 'public.brand_exceptional_operation_grants'::text, 'brand_exceptional_operation_grants'::text, pg_catalog.to_regclass('public.brand_exceptional_operation_grants')::oid
  UNION ALL
  SELECT 'public.brand_exceptional_operation_execution_events'::text, 'brand_exceptional_operation_execution_events'::text, pg_catalog.to_regclass('public.brand_exceptional_operation_execution_events')::oid
  UNION ALL
  SELECT 'public.tenant_0016_agency_role_rollback'::text, 'tenant_0016_agency_role_rollback'::text, pg_catalog.to_regclass('public.tenant_0016_agency_role_rollback')::oid
),
helper_target AS (
  SELECT
    'public.canonical_actor_can_execute_brand_exceptional_operation(uuid,uuid,text)'::text AS object_name,
    pg_catalog.to_regprocedure('public.canonical_actor_can_execute_brand_exceptional_operation(uuid,uuid,text)')::oid AS function_oid
),
shared_function_target AS (
  SELECT
    'public.pipeline_editorial_protect_append_only()'::text AS object_name,
    pg_catalog.to_regprocedure('public.pipeline_editorial_protect_append_only()')::oid AS function_oid
),
target_table_metadata AS (
  SELECT
    target_relation.object_name,
    target_relation.relation_oid,
    target_class.relname::text AS catalog_relation_name,
    pg_catalog.pg_get_userbyid(target_class.relowner)::text AS owner_name,
    target_class.relrowsecurity,
    target_class.relforcerowsecurity,
    coalesce(pg_catalog.array_to_string(target_class.relacl, ' | '), 'NULL/default') AS acl_text
  FROM target_relations AS target_relation
  LEFT JOIN pg_catalog.pg_class AS target_class
    ON target_class.oid = target_relation.relation_oid
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
    target_relation.object_name,
    count(policy_catalog.policyname)::integer AS policy_count,
    coalesce(string_agg(
      policy_catalog.policyname::text
        || '; roles=' || pg_catalog.array_to_string(policy_catalog.roles, ',')
        || '; cmd=' || policy_catalog.cmd::text,
      ' | ' ORDER BY policy_catalog.policyname::text
    ), 'none') AS policy_details
  FROM target_relations AS target_relation
  LEFT JOIN pg_catalog.pg_policies AS policy_catalog
    ON policy_catalog.schemaname::text = 'public'
   AND policy_catalog.tablename::text = target_relation.relation_name
  GROUP BY target_relation.object_name
),
index_summary AS (
  SELECT
    target_relation.object_name,
    count(index_catalog.indexname)::integer AS index_count,
    coalesce(string_agg(
      index_catalog.indexname::text || '; ' || index_catalog.indexdef::text,
      ' | ' ORDER BY index_catalog.indexname::text
    ), 'none') AS index_details
  FROM target_relations AS target_relation
  LEFT JOIN pg_catalog.pg_indexes AS index_catalog
    ON index_catalog.schemaname::text = 'public'
   AND index_catalog.tablename::text = target_relation.relation_name
  GROUP BY target_relation.object_name
),
constraint_summary AS (
  SELECT
    target_relation.object_name,
    count(constraint_catalog.oid)::integer AS constraint_count,
    coalesce(string_agg(
      constraint_catalog.conname::text
        || '; type=' || constraint_catalog.contype::text
        || '; ' || pg_catalog.pg_get_constraintdef(constraint_catalog.oid, true)::text,
      ' | ' ORDER BY constraint_catalog.conname::text
    ), 'none') AS constraint_details
  FROM target_relations AS target_relation
  LEFT JOIN pg_catalog.pg_constraint AS constraint_catalog
    ON constraint_catalog.conrelid = target_relation.relation_oid
  GROUP BY target_relation.object_name
),
foreign_key_inventory AS (
  SELECT
    target_relation.object_name,
    CASE WHEN foreign_key.confrelid = target_relation.relation_oid THEN 'incoming'::text ELSE 'outgoing'::text END AS direction,
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
  FROM target_relations AS target_relation
  JOIN pg_catalog.pg_constraint AS foreign_key
    ON foreign_key.contype::text = 'f'
   AND (foreign_key.confrelid = target_relation.relation_oid OR foreign_key.conrelid = target_relation.relation_oid)
),
foreign_key_summary AS (
  SELECT
    target_relation.object_name,
    count(foreign_key_row.constraint_name) FILTER (WHERE foreign_key_row.direction = 'incoming')::integer AS incoming_count,
    count(foreign_key_row.constraint_name) FILTER (WHERE foreign_key_row.direction = 'outgoing')::integer AS outgoing_count,
    count(foreign_key_row.constraint_name) FILTER (
      WHERE foreign_key_row.direction = 'incoming'
        AND NOT EXISTS (
          SELECT 1 FROM target_relations AS known_target
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
  FROM target_relations AS target_relation
  LEFT JOIN foreign_key_inventory AS foreign_key_row
    ON foreign_key_row.object_name = target_relation.object_name
  GROUP BY target_relation.object_name
),
relation_dependencies AS (
  SELECT
    target_relation.object_name,
    'dependent_on_table'::text AS direction,
    dependency_row.deptype::text AS dependency_type,
    dependency_row.classid::regclass::text AS related_class,
    pg_catalog.pg_describe_object(dependency_row.classid, dependency_row.objid, dependency_row.objsubid)::text AS related_object
  FROM target_relations AS target_relation
  JOIN pg_catalog.pg_depend AS dependency_row
    ON dependency_row.refclassid = 'pg_class'::regclass
   AND dependency_row.refobjid = target_relation.relation_oid
  UNION ALL
  SELECT
    target_relation.object_name,
    'table_depends_on'::text,
    dependency_row.deptype::text,
    dependency_row.refclassid::regclass::text,
    pg_catalog.pg_describe_object(dependency_row.refclassid, dependency_row.refobjid, dependency_row.refobjsubid)::text
  FROM target_relations AS target_relation
  JOIN pg_catalog.pg_depend AS dependency_row
    ON dependency_row.classid = 'pg_class'::regclass
   AND dependency_row.objid = target_relation.relation_oid
),
relation_dependency_summary AS (
  SELECT
    target_relation.object_name,
    count(dependency_row.related_object)::integer AS direct_count,
    count(dependency_row.related_object) FILTER (WHERE dependency_row.dependency_type <> 'i')::integer AS non_internal_count,
    coalesce(string_agg(
      dependency_row.direction || '; deptype=' || dependency_row.dependency_type
        || '; class=' || dependency_row.related_class
        || '; object=' || dependency_row.related_object,
      ' | ' ORDER BY dependency_row.direction, dependency_row.related_class, dependency_row.related_object
    ), 'none') AS dependency_details
  FROM target_relations AS target_relation
  LEFT JOIN relation_dependencies AS dependency_row
    ON dependency_row.object_name = target_relation.object_name
  GROUP BY target_relation.object_name
),
table_view_dependent_rows AS (
  SELECT DISTINCT
    target_relation.object_name,
    view_class.oid AS view_oid,
    view_namespace.nspname::text AS view_schema,
    view_class.relname::text AS view_name
  FROM target_relations AS target_relation
  JOIN pg_catalog.pg_depend AS view_dependency
    ON view_dependency.refclassid = 'pg_class'::regclass
   AND view_dependency.refobjid = target_relation.relation_oid
   AND view_dependency.classid = 'pg_rewrite'::regclass
  JOIN pg_catalog.pg_rewrite AS view_rewrite ON view_rewrite.oid = view_dependency.objid
  JOIN pg_catalog.pg_class AS view_class
    ON view_class.oid = view_rewrite.ev_class
   AND view_class.relkind::text IN ('v', 'm')
  JOIN pg_catalog.pg_namespace AS view_namespace ON view_namespace.oid = view_class.relnamespace
),
table_view_dependents AS (
  SELECT
    view_row.object_name,
    count(*)::integer AS dependent_count,
    coalesce(string_agg(view_row.view_schema || '.' || view_row.view_name,
      ' | ' ORDER BY view_row.view_schema, view_row.view_name), 'none') AS dependent_names
  FROM table_view_dependent_rows AS view_row
  GROUP BY view_row.object_name
),
table_function_dependent_rows AS (
  SELECT DISTINCT
    target_relation.object_name,
    dependent_function.oid AS function_oid,
    dependent_namespace.nspname::text || '.' || dependent_function.proname::text
      || '(' || pg_catalog.pg_get_function_identity_arguments(dependent_function.oid)::text || ')' AS function_signature
  FROM target_relations AS target_relation
  JOIN pg_catalog.pg_depend AS function_dependency
    ON function_dependency.refclassid = 'pg_class'::regclass
   AND function_dependency.refobjid = target_relation.relation_oid
   AND function_dependency.classid = 'pg_proc'::regclass
  JOIN pg_catalog.pg_proc AS dependent_function
    ON dependent_function.oid = function_dependency.objid
   AND dependent_function.oid <> (SELECT helper_row.function_oid FROM helper_target AS helper_row)
  JOIN pg_catalog.pg_namespace AS dependent_namespace ON dependent_namespace.oid = dependent_function.pronamespace
  WHERE dependent_namespace.nspname::text NOT IN ('pg_catalog', 'information_schema')
),
table_function_dependents AS (
  SELECT
    function_row.object_name,
    count(*)::integer AS dependent_count,
    coalesce(string_agg(function_row.function_signature,
      ' | ' ORDER BY function_row.function_signature), 'none') AS dependent_names
  FROM table_function_dependent_rows AS function_row
  GROUP BY function_row.object_name
),
target_trigger_inventory AS (
  SELECT
    target_relation.object_name,
    target_trigger.oid AS trigger_oid,
    target_trigger.tgname::text AS trigger_name,
    target_trigger.tgenabled::text AS enabled_state,
    target_trigger.tgtype::integer AS trigger_type,
    coalesce(trigger_namespace.nspname::text || '.' || trigger_function.proname::text
      || '(' || pg_catalog.pg_get_function_identity_arguments(trigger_function.oid)::text || ')', 'unresolved') AS function_signature
  FROM target_relations AS target_relation
  LEFT JOIN pg_catalog.pg_trigger AS target_trigger
    ON target_trigger.tgrelid = target_relation.relation_oid
   AND NOT target_trigger.tgisinternal
  LEFT JOIN pg_catalog.pg_proc AS trigger_function ON trigger_function.oid = target_trigger.tgfoid
  LEFT JOIN pg_catalog.pg_namespace AS trigger_namespace ON trigger_namespace.oid = trigger_function.pronamespace
),
target_trigger_summary AS (
  SELECT
    target_relation.object_name,
    count(trigger_row.trigger_oid)::integer AS trigger_count,
    coalesce(string_agg(trigger_row.trigger_name || '; enabled=' || trigger_row.enabled_state
      || '; tgtype=' || trigger_row.trigger_type::text || '; function=' || trigger_row.function_signature,
      ' | ' ORDER BY trigger_row.trigger_name), 'none') AS trigger_details
  FROM target_relations AS target_relation
  LEFT JOIN target_trigger_inventory AS trigger_row ON trigger_row.object_name = target_relation.object_name
  GROUP BY target_relation.object_name
),
event_trigger_match AS (
  SELECT
    count(event_trigger.oid)::integer AS total_trigger_count,
    count(event_trigger.oid) FILTER (WHERE event_trigger.tgname::text = 'brand_exceptional_operation_execution_events_append_only_trg_00')::integer AS actual_name_count,
    count(event_trigger.oid) FILTER (WHERE event_trigger.tgfoid = pg_catalog.to_regprocedure('public.pipeline_editorial_protect_append_only()')::oid)::integer AS function_count,
    count(event_trigger.oid) FILTER (WHERE event_trigger.tgtype::integer = 27)::integer AS event_shape_count,
    count(event_trigger.oid) FILTER (WHERE event_trigger.tgname::text = 'brand_exceptional_operation_execution_events_append_only_trg_00'
      AND event_trigger.tgfoid = pg_catalog.to_regprocedure('public.pipeline_editorial_protect_append_only()')::oid
      AND event_trigger.tgtype::integer = 27)::integer AS exact_match_count,
    max(CASE WHEN event_trigger.tgname::text = 'brand_exceptional_operation_execution_events_append_only_trg_00'
      AND event_trigger.tgfoid = pg_catalog.to_regprocedure('public.pipeline_editorial_protect_append_only()')::oid
      AND event_trigger.tgtype::integer = 27 THEN event_trigger.tgenabled::text END) AS exact_enabled_state,
    coalesce(string_agg(event_trigger.tgname::text || '; function=' || event_function_namespace.nspname::text
      || '.' || event_function.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(event_function.oid)::text || ')'
      || '; enabled=' || event_trigger.tgenabled::text || '; tgtype=' || event_trigger.tgtype::integer::text,
      ' | ' ORDER BY event_trigger.tgname::text), 'none') AS observed_details
  FROM pg_catalog.pg_trigger AS event_trigger
  LEFT JOIN pg_catalog.pg_proc AS event_function ON event_function.oid = event_trigger.tgfoid
  LEFT JOIN pg_catalog.pg_namespace AS event_function_namespace ON event_function_namespace.oid = event_function.pronamespace
  WHERE event_trigger.tgrelid = (SELECT event_relation.relation_oid FROM target_relations AS event_relation
    WHERE event_relation.object_name = 'public.brand_exceptional_operation_execution_events')
    AND NOT event_trigger.tgisinternal
),
helper_metadata AS (
  SELECT
    helper_row.object_name,
    helper_row.function_oid,
    pg_catalog.pg_get_userbyid(helper_function.proowner)::text AS owner_name,
    helper_function.prosecdef,
    helper_function.provolatile::text AS volatility,
    coalesce(pg_catalog.array_to_string(helper_function.proconfig, ' | '), 'NULL') AS search_path_config
  FROM helper_target AS helper_row
  LEFT JOIN pg_catalog.pg_proc AS helper_function ON helper_function.oid = helper_row.function_oid
),
helper_acl_summary AS (
  SELECT
    helper_row.object_name,
    coalesce(string_agg(CASE WHEN helper_acl.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(helper_acl.grantee)::text END
      || ':' || helper_acl.privilege_type::text, ' | ' ORDER BY helper_acl.grantee, helper_acl.privilege_type), 'none') AS execute_acl
  FROM helper_metadata AS helper_row
  LEFT JOIN pg_catalog.pg_proc AS helper_function ON helper_function.oid = helper_row.function_oid
  LEFT JOIN LATERAL pg_catalog.aclexplode(CASE WHEN helper_function.oid IS NULL THEN NULL::aclitem[]
    ELSE coalesce(helper_function.proacl, pg_catalog.acldefault('f', helper_function.proowner)) END) AS helper_acl ON true
  GROUP BY helper_row.object_name
),
helper_pg_depend_summary AS (
  SELECT
    helper_row.object_name,
    count(helper_dependency.deptype)::integer AS direct_count,
    coalesce(string_agg(
      CASE WHEN helper_dependency.refclassid = 'pg_proc'::regclass THEN 'dependent_on_helper' ELSE 'helper_depends_on' END
        || '; deptype=' || helper_dependency.deptype::text
        || '; class=' || CASE WHEN helper_dependency.refclassid = 'pg_proc'::regclass THEN helper_dependency.classid::regclass::text ELSE helper_dependency.refclassid::regclass::text END
        || '; object=' || CASE WHEN helper_dependency.refclassid = 'pg_proc'::regclass
          THEN pg_catalog.pg_describe_object(helper_dependency.classid, helper_dependency.objid, helper_dependency.objsubid)::text
          ELSE pg_catalog.pg_describe_object(helper_dependency.refclassid, helper_dependency.refobjid, helper_dependency.refobjsubid)::text END,
      ' | ' ORDER BY helper_dependency.deptype::text
    ), 'none') AS dependency_details
  FROM helper_metadata AS helper_row
  LEFT JOIN pg_catalog.pg_depend AS helper_dependency
    ON (helper_dependency.refclassid = 'pg_proc'::regclass AND helper_dependency.refobjid = helper_row.function_oid)
    OR (helper_dependency.classid = 'pg_proc'::regclass AND helper_dependency.objid = helper_row.function_oid)
  GROUP BY helper_row.object_name
),
helper_function_dependent_rows AS (
  SELECT DISTINCT
    helper_row.object_name,
    dependent_function.oid AS function_oid,
    dependent_namespace.nspname::text || '.' || dependent_function.proname::text
      || '(' || pg_catalog.pg_get_function_identity_arguments(dependent_function.oid)::text || ')' AS function_signature
  FROM helper_metadata AS helper_row
  JOIN pg_catalog.pg_depend AS helper_dependency
    ON helper_dependency.refclassid = 'pg_proc'::regclass
   AND helper_dependency.refobjid = helper_row.function_oid
   AND helper_dependency.classid = 'pg_proc'::regclass
  JOIN pg_catalog.pg_proc AS dependent_function
    ON dependent_function.oid = helper_dependency.objid
   AND dependent_function.oid <> helper_row.function_oid
  JOIN pg_catalog.pg_namespace AS dependent_namespace ON dependent_namespace.oid = dependent_function.pronamespace
  WHERE dependent_namespace.nspname::text NOT IN ('pg_catalog', 'information_schema')
),
helper_function_dependents AS (
  SELECT
    function_row.object_name,
    count(*)::integer AS dependent_count,
    coalesce(string_agg(function_row.function_signature,
      ' | ' ORDER BY function_row.function_signature), 'none') AS dependent_names
  FROM helper_function_dependent_rows AS function_row
  GROUP BY function_row.object_name
),
helper_view_dependent_rows AS (
  SELECT DISTINCT
    helper_row.object_name,
    view_class.oid AS view_oid,
    view_namespace.nspname::text AS view_schema,
    view_class.relname::text AS view_name
  FROM helper_metadata AS helper_row
  JOIN pg_catalog.pg_depend AS helper_dependency
    ON helper_dependency.refclassid = 'pg_proc'::regclass
   AND helper_dependency.refobjid = helper_row.function_oid
   AND helper_dependency.classid = 'pg_rewrite'::regclass
  JOIN pg_catalog.pg_rewrite AS view_rewrite ON view_rewrite.oid = helper_dependency.objid
  JOIN pg_catalog.pg_class AS view_class ON view_class.oid = view_rewrite.ev_class AND view_class.relkind::text IN ('v', 'm')
  JOIN pg_catalog.pg_namespace AS view_namespace ON view_namespace.oid = view_class.relnamespace
),
helper_view_dependents AS (
  SELECT
    view_row.object_name,
    count(*)::integer AS dependent_count,
    coalesce(string_agg(view_row.view_schema || '.' || view_row.view_name,
      ' | ' ORDER BY view_row.view_schema, view_row.view_name), 'none') AS dependent_names
  FROM helper_view_dependent_rows AS view_row
  GROUP BY view_row.object_name
),
helper_trigger_consumer_rows AS (
  SELECT DISTINCT
    helper_row.object_name,
    helper_trigger.oid AS trigger_oid,
    trigger_namespace.nspname::text AS trigger_schema,
    trigger_class.relname::text AS trigger_table,
    helper_trigger.tgname::text AS trigger_name
  FROM helper_metadata AS helper_row
  JOIN pg_catalog.pg_trigger AS helper_trigger ON helper_trigger.tgfoid = helper_row.function_oid AND NOT helper_trigger.tgisinternal
  JOIN pg_catalog.pg_class AS trigger_class ON trigger_class.oid = helper_trigger.tgrelid
  JOIN pg_catalog.pg_namespace AS trigger_namespace ON trigger_namespace.oid = trigger_class.relnamespace
),
helper_trigger_consumers AS (
  SELECT
    trigger_row.object_name,
    count(*)::integer AS consumer_count,
    coalesce(string_agg(trigger_row.trigger_schema || '.' || trigger_row.trigger_table || ':' || trigger_row.trigger_name,
      ' | ' ORDER BY trigger_row.trigger_schema, trigger_row.trigger_table, trigger_row.trigger_name), 'none') AS consumer_names
  FROM helper_trigger_consumer_rows AS trigger_row
  GROUP BY trigger_row.object_name
),
helper_decision AS (
  SELECT
    helper_row.object_name,
    CASE
      WHEN helper_row.function_oid IS NULL THEN 'INVESTIGATE'
      WHEN coalesce(function_row.dependent_count, 0) > 0 THEN 'BLOCKED'
      WHEN coalesce(view_row.dependent_count, 0) > 0 THEN 'BLOCKED'
      WHEN coalesce(trigger_row.consumer_count, 0) > 0 THEN 'BLOCKED'
      ELSE 'DROP_SAFE'
    END AS classification
  FROM helper_metadata AS helper_row
  LEFT JOIN helper_function_dependents AS function_row ON function_row.object_name = helper_row.object_name
  LEFT JOIN helper_view_dependents AS view_row ON view_row.object_name = helper_row.object_name
  LEFT JOIN helper_trigger_consumers AS trigger_row ON trigger_row.object_name = helper_row.object_name
),
shared_expected_consumers(object_name, trigger_name) AS (
  VALUES
    ('public.editorial_artifact_versions'::text, 'editorial_artifact_versions_append_only_trg'::text),
    ('public.editorial_serp_snapshots'::text, 'editorial_serp_snapshots_append_only_trg'::text),
    ('public.editorial_serp_reviews'::text, 'editorial_serp_reviews_append_only_trg'::text),
    ('public.content_document_versions'::text, 'content_document_versions_append_only_trg'::text)
),
shared_actual_consumers AS (
  SELECT
    shared_namespace.nspname::text || '.' || shared_class.relname::text AS object_name,
    shared_trigger.tgname::text AS trigger_name,
    shared_trigger.tgenabled::text AS enabled_state,
    shared_trigger.tgtype::integer AS trigger_type
  FROM shared_function_target AS shared_function_row
  JOIN pg_catalog.pg_trigger AS shared_trigger ON shared_trigger.tgfoid = shared_function_row.function_oid AND NOT shared_trigger.tgisinternal
  JOIN pg_catalog.pg_class AS shared_class ON shared_class.oid = shared_trigger.tgrelid
  JOIN pg_catalog.pg_namespace AS shared_namespace ON shared_namespace.oid = shared_class.relnamespace
  WHERE NOT (shared_namespace.nspname::text = 'public' AND shared_class.relname::text = 'brand_exceptional_operation_execution_events')
),
shared_consumer_summary AS (
  SELECT
    shared_function_row.object_name,
    (SELECT count(*)::integer FROM shared_expected_consumers) AS expected_count,
    (SELECT count(*)::integer FROM shared_expected_consumers AS expected_row
      WHERE NOT EXISTS (
        SELECT 1 FROM shared_actual_consumers AS actual_row
        WHERE actual_row.object_name = expected_row.object_name AND actual_row.trigger_name = expected_row.trigger_name
      )) AS missing_expected_count,
    (SELECT count(*)::integer FROM shared_actual_consumers AS actual_row
      WHERE NOT EXISTS (
        SELECT 1 FROM shared_expected_consumers AS expected_row
        WHERE expected_row.object_name = actual_row.object_name AND expected_row.trigger_name = actual_row.trigger_name
      )) AS unexpected_count,
    coalesce((SELECT string_agg(actual_row.object_name || ':' || actual_row.trigger_name || '; enabled=' || actual_row.enabled_state || '; tgtype=' || actual_row.trigger_type::text,
      ' | ' ORDER BY actual_row.object_name, actual_row.trigger_name) FROM shared_actual_consumers AS actual_row), 'none') AS actual_details
  FROM shared_function_target AS shared_function_row
),
shared_decision AS (
  SELECT
    summary_row.object_name,
    CASE
      WHEN shared_function_row.function_oid IS NULL THEN 'BLOCKED'
      WHEN summary_row.missing_expected_count = 0 AND summary_row.unexpected_count = 0 THEN 'KEEP_CANONICAL'
      ELSE 'INVESTIGATE'
    END AS classification
  FROM shared_consumer_summary AS summary_row
  CROSS JOIN shared_function_target AS shared_function_row
),
table_decisions AS (
  SELECT
    table_metadata_row.object_name,
    CASE
      WHEN table_metadata_row.relation_oid IS NULL THEN 'INVESTIGATE'
      WHEN row_count_row.row_count <> 0 THEN 'BLOCKED'
      WHEN foreign_key_row.external_incoming_count > 0 THEN 'BLOCKED'
      WHEN coalesce(view_row.dependent_count, 0) > 0 THEN 'BLOCKED'
      WHEN coalesce(function_row.dependent_count, 0) > 0 THEN 'BLOCKED'
      WHEN table_metadata_row.object_name = 'public.brand_exceptional_operation_execution_events'
       AND (event_row.exact_match_count <> 1 OR coalesce(trigger_row.trigger_count, 0) <> 1) THEN 'INVESTIGATE'
      WHEN table_metadata_row.object_name <> 'public.brand_exceptional_operation_execution_events' AND coalesce(trigger_row.trigger_count, 0) <> 0 THEN 'INVESTIGATE'
      ELSE 'DROP_SAFE'
    END AS classification
  FROM target_table_metadata AS table_metadata_row
  JOIN row_counts AS row_count_row ON row_count_row.object_name = table_metadata_row.object_name
  JOIN foreign_key_summary AS foreign_key_row ON foreign_key_row.object_name = table_metadata_row.object_name
  LEFT JOIN table_view_dependents AS view_row ON view_row.object_name = table_metadata_row.object_name
  LEFT JOIN table_function_dependents AS function_row ON function_row.object_name = table_metadata_row.object_name
  LEFT JOIN target_trigger_summary AS trigger_row ON trigger_row.object_name = table_metadata_row.object_name
  CROSS JOIN event_trigger_match AS event_row
),
trigger_decision AS (
  SELECT
    'public.brand_exceptional_operation_execution_events:brand_exceptional_operation_execution_events_append_only_trg_00'::text AS object_name,
    CASE WHEN event_row.exact_match_count = 1 AND event_row.total_trigger_count = 1 THEN 'DROP_SAFE' ELSE 'INVESTIGATE' END AS classification
  FROM event_trigger_match AS event_row
),
overall_decision AS (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM table_decisions WHERE classification = 'BLOCKED') THEN 'BLOCKED'
    WHEN EXISTS (SELECT 1 FROM table_decisions WHERE classification = 'INVESTIGATE') THEN 'INVESTIGATE'
    WHEN EXISTS (SELECT 1 FROM helper_decision WHERE classification = 'BLOCKED') THEN 'BLOCKED'
    WHEN EXISTS (SELECT 1 FROM helper_decision WHERE classification = 'INVESTIGATE') THEN 'INVESTIGATE'
    WHEN EXISTS (SELECT 1 FROM trigger_decision WHERE classification <> 'DROP_SAFE') THEN 'INVESTIGATE'
    WHEN EXISTS (SELECT 1 FROM shared_decision WHERE classification = 'BLOCKED') THEN 'BLOCKED'
    WHEN EXISTS (SELECT 1 FROM shared_decision WHERE classification <> 'KEEP_CANONICAL') THEN 'INVESTIGATE'
    ELSE 'DROP_SAFE'
  END AS classification
),
checks(check_name, object_name, observed, classification) AS (
  SELECT 'script_version'::text, 'script'::text, metadata_row.script_version, 'INFO'::text FROM metadata AS metadata_row
  UNION ALL
  SELECT 'table:existence', table_metadata_row.object_name,
    CASE WHEN table_metadata_row.relation_oid IS NULL THEN 'missing' ELSE 'present; catalog_name=' || coalesce(table_metadata_row.catalog_relation_name, 'unresolved') END,
    'INFO'
  FROM target_table_metadata AS table_metadata_row
  UNION ALL
  SELECT 'table:row_count', row_count_row.object_name, row_count_row.row_count::text,
    CASE WHEN row_count_row.row_count = 0 THEN 'DROP_SAFE' ELSE 'BLOCKED' END
  FROM row_counts AS row_count_row
  UNION ALL
  SELECT 'table:owner_rls_acl', table_metadata_row.object_name,
    CASE WHEN table_metadata_row.relation_oid IS NULL THEN 'missing' ELSE 'owner=' || coalesce(table_metadata_row.owner_name, 'unresolved')
      || '; rls=' || table_metadata_row.relrowsecurity::text || '; force_rls=' || table_metadata_row.relforcerowsecurity::text || '; acl=' || table_metadata_row.acl_text END,
    'INFO'
  FROM target_table_metadata AS table_metadata_row
  UNION ALL
  SELECT 'table:policies', policy_row.object_name, 'count=' || policy_row.policy_count::text || '; ' || policy_row.policy_details, 'INFO' FROM policy_summary AS policy_row
  UNION ALL
  SELECT 'table:indexes', index_row.object_name, 'count=' || index_row.index_count::text || '; ' || index_row.index_details, 'INFO' FROM index_summary AS index_row
  UNION ALL
  SELECT 'table:constraints', constraint_row.object_name, 'count=' || constraint_row.constraint_count::text || '; ' || constraint_row.constraint_details, 'INFO' FROM constraint_summary AS constraint_row
  UNION ALL
  SELECT 'table:foreign_keys', foreign_key_row.object_name,
    'incoming=' || foreign_key_row.incoming_count::text || '; outgoing=' || foreign_key_row.outgoing_count::text
      || '; external_incoming=' || foreign_key_row.external_incoming_count::text || '; ' || foreign_key_row.relationship_details,
    CASE WHEN foreign_key_row.external_incoming_count = 0 THEN 'INFO' ELSE 'BLOCKED' END
  FROM foreign_key_summary AS foreign_key_row
  UNION ALL
  SELECT 'table:pg_depend_direct', dependency_row.object_name,
    'direct=' || dependency_row.direct_count::text || '; non_internal=' || dependency_row.non_internal_count::text || '; ' || dependency_row.dependency_details,
    'INFO'
  FROM relation_dependency_summary AS dependency_row
  UNION ALL
  SELECT 'table:view_dependents', table_metadata_row.object_name,
    'count=' || coalesce(view_row.dependent_count, 0)::text || '; ' || coalesce(view_row.dependent_names, 'none'),
    CASE WHEN coalesce(view_row.dependent_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'BLOCKED' END
  FROM target_table_metadata AS table_metadata_row LEFT JOIN table_view_dependents AS view_row ON view_row.object_name = table_metadata_row.object_name
  UNION ALL
  SELECT 'table:function_dependents', table_metadata_row.object_name,
    'count=' || coalesce(function_row.dependent_count, 0)::text || '; ' || coalesce(function_row.dependent_names, 'none'),
    CASE WHEN coalesce(function_row.dependent_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'BLOCKED' END
  FROM target_table_metadata AS table_metadata_row LEFT JOIN table_function_dependents AS function_row ON function_row.object_name = table_metadata_row.object_name
  UNION ALL
  SELECT 'table:triggers', trigger_row.object_name, 'count=' || trigger_row.trigger_count::text || '; ' || trigger_row.trigger_details,
    CASE WHEN trigger_row.object_name = 'public.brand_exceptional_operation_execution_events' AND event_row.exact_match_count = 1 AND event_row.total_trigger_count = 1 THEN 'DROP_SAFE'
      WHEN trigger_row.object_name <> 'public.brand_exceptional_operation_execution_events' AND trigger_row.trigger_count = 0 THEN 'DROP_SAFE'
      ELSE 'INVESTIGATE' END
  FROM target_trigger_summary AS trigger_row CROSS JOIN event_trigger_match AS event_row
  UNION ALL
  SELECT 'trigger:0030_actual_catalog_identity', 'public.brand_exceptional_operation_execution_events',
    'expected_name=brand_exceptional_operation_execution_events_append_only_trg_00; total_trigger_count=' || event_row.total_trigger_count::text
      || '; name_count=' || event_row.actual_name_count::text
      || '; function_count=' || event_row.function_count::text || '; event_shape_count=' || event_row.event_shape_count::text
      || '; exact_match_count=' || event_row.exact_match_count::text || '; enabled=' || coalesce(event_row.exact_enabled_state, 'missing')
      || '; observed=' || event_row.observed_details,
    CASE WHEN event_row.exact_match_count = 1 THEN 'DROP_SAFE' ELSE 'INVESTIGATE' END
  FROM event_trigger_match AS event_row
  UNION ALL
  SELECT 'function:existence_metadata', helper_row.object_name,
    CASE WHEN helper_row.function_oid IS NULL THEN 'missing' ELSE 'present; owner=' || coalesce(helper_row.owner_name, 'unresolved')
      || '; security_definer=' || helper_row.prosecdef::text || '; volatility=' || helper_row.volatility || '; search_path=' || helper_row.search_path_config END,
    'INFO'
  FROM helper_metadata AS helper_row
  UNION ALL
  SELECT 'function:acl', helper_acl_row.object_name, helper_acl_row.execute_acl, 'INFO' FROM helper_acl_summary AS helper_acl_row
  UNION ALL
  SELECT 'function:pg_depend_direct', helper_dependence_row.object_name,
    'count=' || helper_dependence_row.direct_count::text || '; ' || helper_dependence_row.dependency_details,
    'INFO'
  FROM helper_pg_depend_summary AS helper_dependence_row
  UNION ALL
  SELECT 'function:function_dependents', helper_row.object_name,
    'count=' || coalesce(function_row.dependent_count, 0)::text || '; ' || coalesce(function_row.dependent_names, 'none'),
    CASE WHEN coalesce(function_row.dependent_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'BLOCKED' END
  FROM helper_metadata AS helper_row LEFT JOIN helper_function_dependents AS function_row ON function_row.object_name = helper_row.object_name
  UNION ALL
  SELECT 'function:view_dependents', helper_row.object_name,
    'count=' || coalesce(view_row.dependent_count, 0)::text || '; ' || coalesce(view_row.dependent_names, 'none'),
    CASE WHEN coalesce(view_row.dependent_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'BLOCKED' END
  FROM helper_metadata AS helper_row LEFT JOIN helper_view_dependents AS view_row ON view_row.object_name = helper_row.object_name
  UNION ALL
  SELECT 'function:trigger_consumers', helper_row.object_name,
    'count=' || coalesce(trigger_row.consumer_count, 0)::text || '; ' || coalesce(trigger_row.consumer_names, 'none'),
    CASE WHEN coalesce(trigger_row.consumer_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'BLOCKED' END
  FROM helper_metadata AS helper_row LEFT JOIN helper_trigger_consumers AS trigger_row ON trigger_row.object_name = helper_row.object_name
  UNION ALL
  SELECT 'function:decision', helper_decision_row.object_name, 'no external function/view/trigger consumer', helper_decision_row.classification FROM helper_decision AS helper_decision_row
  UNION ALL
  SELECT 'shared_function:canonical_consumers', summary_row.object_name,
    'expected=' || summary_row.expected_count::text || '; missing_expected=' || summary_row.missing_expected_count::text
      || '; unexpected=' || summary_row.unexpected_count::text || '; actual=' || summary_row.actual_details,
    shared_row.classification
  FROM shared_consumer_summary AS summary_row JOIN shared_decision AS shared_row ON shared_row.object_name = summary_row.object_name
  UNION ALL
  SELECT 'table:decision', table_decision_row.object_name, 'empty; no external incoming FK; no external view/function dependent; trigger condition satisfied when applicable', table_decision_row.classification FROM table_decisions AS table_decision_row
  UNION ALL
  SELECT 'trigger:decision', trigger_decision_row.object_name, 'exclusive 0030 execution-events trigger', trigger_decision_row.classification FROM trigger_decision AS trigger_decision_row
  UNION ALL
  SELECT 'STRUCTURAL_CLEANUP_DECISION', 'structural_cleanup', '0030 candidates plus 0016 rollback; shared append-only function preserved', overall_row.classification FROM overall_decision AS overall_row
)
SELECT check_name, object_name, observed, classification
FROM checks
ORDER BY check_name, object_name;
