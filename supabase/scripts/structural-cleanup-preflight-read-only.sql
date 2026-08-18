-- Structural cleanup preflight, catalog/data-read only.
-- Version: 2026-08-12-structural-cleanup-preflight-v3
-- One final result set. No schema, ACL, RLS, policy or data mutation.
--
-- The three candidate relations are expected to exist because migrations 0016
-- and 0030 are already applied. Exact row counts are intentionally explicit;
-- a missing relation must not be silently treated as an empty relation.

WITH
metadata AS (
  SELECT '2026-08-12-structural-cleanup-preflight-v3'::text AS script_version
),
candidate_tables(source_migration, object_name, schema_name, table_name, purpose) AS (
  VALUES
    ('0030', 'public.brand_exceptional_operation_grants', 'public', 'brand_exceptional_operation_grants', 'exclusive exceptional-operation grants'),
    ('0030', 'public.brand_exceptional_operation_execution_events', 'public', 'brand_exceptional_operation_execution_events', 'exclusive exceptional-operation audit events'),
    ('0016', 'public.tenant_0016_agency_role_rollback', 'public', 'tenant_0016_agency_role_rollback', 'historical role-bridge rollback capture')
),
candidate_names AS (
  SELECT table_name FROM candidate_tables
),
candidate_relations AS (
  SELECT
    ct.*,
    c.oid,
    c.relkind::text AS relkind,
    c.relrowsecurity,
    c.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(c.relowner)::text AS owner_role,
    coalesce(pg_catalog.array_to_string(c.relacl, ' | '), 'NULL/default') AS acl_text
  FROM candidate_tables AS ct
  LEFT JOIN pg_catalog.pg_namespace AS n
    ON n.nspname::text = ct.schema_name
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname::text = ct.table_name
   AND c.relkind::text IN ('r', 'p')
),
row_counts AS (
  SELECT 'brand_exceptional_operation_grants'::text AS table_name, count(*)::bigint AS row_count
  FROM public.brand_exceptional_operation_grants
  UNION ALL
  SELECT 'brand_exceptional_operation_execution_events'::text, count(*)::bigint
  FROM public.brand_exceptional_operation_execution_events
  UNION ALL
  SELECT 'tenant_0016_agency_role_rollback'::text, count(*)::bigint
  FROM public.tenant_0016_agency_role_rollback
),
candidate_functions(function_name, function_signature, purpose) AS (
  VALUES
    ('public.canonical_actor_can_execute_brand_exceptional_operation', 'public.canonical_actor_can_execute_brand_exceptional_operation(uuid,uuid,text)', 'exclusive 0030 authorization helper')
),
function_metadata AS (
  SELECT
    cf.function_name,
    cf.function_signature,
    cf.purpose,
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner)::text AS owner_role,
    p.prosecdef,
    p.provolatile::text AS provolatile,
    coalesce(pg_catalog.array_to_string(p.proconfig, ' | '), 'NULL') AS proconfig,
    coalesce(
      string_agg(
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END
          || ':' || a.privilege_type::text,
        ' | ' ORDER BY a.grantee, a.privilege_type
      ),
      'none'
    ) AS execute_acl
  FROM candidate_functions AS cf
  LEFT JOIN pg_catalog.pg_proc AS p
    ON p.oid = pg_catalog.to_regprocedure(cf.function_signature)
  LEFT JOIN LATERAL pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) AS a ON true
  GROUP BY cf.function_name, cf.function_signature, cf.purpose, p.oid, p.proowner,
    p.prosecdef, p.provolatile, p.proconfig
),
candidate_function_oids AS (
  SELECT oid FROM function_metadata WHERE oid IS NOT NULL
),
foreign_key_edges AS (
  SELECT
    con.oid,
    con.conname::text AS conname,
    child_ns.nspname::text || '.' || child.relname::text AS child_object,
    child.relname::text AS child_table,
    parent_ns.nspname::text || '.' || parent.relname::text AS parent_object,
    parent.relname::text AS parent_table,
    CASE con.confdeltype::text
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE 'UNKNOWN'
    END AS on_delete,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS child ON child.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
  JOIN pg_catalog.pg_class AS parent ON parent.oid = con.confrelid
  JOIN pg_catalog.pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
  WHERE con.contype::text = 'f'
    AND child_ns.nspname::text = 'public'
    AND parent_ns.nspname::text = 'public'
    AND (
      child.relname::text IN (SELECT table_name FROM candidate_names)
      OR parent.relname::text IN (SELECT table_name FROM candidate_names)
    )
),
foreign_key_summary AS (
  SELECT
    cn.table_name,
    count(fk.conname) FILTER (
      WHERE fk.parent_table = cn.table_name
        AND fk.child_table NOT IN (SELECT table_name FROM candidate_names)
    )::integer AS external_incoming_count,
    count(fk.conname) FILTER (WHERE fk.parent_table = cn.table_name)::integer AS incoming_count,
    count(fk.conname) FILTER (WHERE fk.child_table = cn.table_name)::integer AS outgoing_count,
    coalesce(
      string_agg(
        fk.child_object || ' -> ' || fk.parent_object || '; ' || fk.conname || '; ON DELETE ' || fk.on_delete,
        ' | ' ORDER BY fk.child_object, fk.conname
      ) FILTER (WHERE fk.parent_table = cn.table_name),
      'none'
    ) AS incoming_details,
    coalesce(
      string_agg(
        fk.child_object || ' -> ' || fk.parent_object || '; ' || fk.conname || '; ON DELETE ' || fk.on_delete,
        ' | ' ORDER BY fk.child_object, fk.conname
      ) FILTER (WHERE fk.child_table = cn.table_name),
      'none'
    ) AS outgoing_details
  FROM candidate_names AS cn
  LEFT JOIN foreign_key_edges AS fk
    ON fk.child_table = cn.table_name OR fk.parent_table = cn.table_name
  GROUP BY cn.table_name
),
dependency_inventory AS (
  SELECT
    cr.table_name,
    d.deptype::text AS deptype,
    CASE
      WHEN dep_rel.oid IS NOT NULL THEN 'relation'
      WHEN dep_proc.oid IS NOT NULL THEN 'function'
      WHEN dep_con.oid IS NOT NULL THEN 'constraint'
      WHEN dep_trigger.oid IS NOT NULL THEN 'trigger'
      WHEN dep_rewrite.oid IS NOT NULL THEN 'rewrite/view'
      ELSE d.classid::regclass::text
    END AS dependency_kind,
    CASE
      WHEN dep_rel.oid IS NOT NULL THEN dep_rel_ns.nspname::text || '.' || dep_rel.relname::text
      WHEN dep_proc.oid IS NOT NULL THEN dep_proc_ns.nspname::text || '.' || dep_proc.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(dep_proc.oid)::text || ')'
      WHEN dep_con.oid IS NOT NULL THEN dep_con.conname::text
      WHEN dep_trigger.oid IS NOT NULL THEN dep_trigger.tgname::text
      WHEN dep_rewrite.oid IS NOT NULL THEN dep_rewrite_ns.nspname::text || '.' || dep_rewrite_rel.relname::text
      ELSE d.classid::regclass::text
    END AS dependency_name,
    (
      (dep_rel.oid IS NOT NULL AND (
        dep_rel.relname::text IN (SELECT table_name FROM candidate_names)
        OR dep_index.indrelid IN (SELECT oid FROM candidate_relations WHERE oid IS NOT NULL)
      ))
      OR (dep_proc.oid IS NOT NULL AND dep_proc.oid IN (SELECT oid FROM candidate_function_oids))
      OR (dep_con.oid IS NOT NULL AND dep_con.conrelid IN (SELECT oid FROM candidate_relations WHERE oid IS NOT NULL))
      OR (dep_trigger.oid IS NOT NULL AND dep_trigger.tgrelid IN (SELECT oid FROM candidate_relations WHERE oid IS NOT NULL))
      OR (dep_rewrite.oid IS NOT NULL AND dep_rewrite.ev_class IN (SELECT oid FROM candidate_relations WHERE oid IS NOT NULL))
    ) AS is_internal_candidate_dependency
  FROM candidate_relations AS cr
  JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_class'::regclass
   AND d.refobjid = cr.oid
  LEFT JOIN pg_catalog.pg_class AS dep_rel
    ON d.classid = 'pg_class'::regclass AND dep_rel.oid = d.objid
  LEFT JOIN pg_catalog.pg_namespace AS dep_rel_ns
    ON dep_rel_ns.oid = dep_rel.relnamespace
  LEFT JOIN pg_catalog.pg_index AS dep_index
    ON dep_index.indexrelid = dep_rel.oid
  LEFT JOIN pg_catalog.pg_proc AS dep_proc
    ON d.classid = 'pg_proc'::regclass AND dep_proc.oid = d.objid
  LEFT JOIN pg_catalog.pg_namespace AS dep_proc_ns
    ON dep_proc_ns.oid = dep_proc.pronamespace
  LEFT JOIN pg_catalog.pg_constraint AS dep_con
    ON d.classid = 'pg_constraint'::regclass AND dep_con.oid = d.objid
  LEFT JOIN pg_catalog.pg_trigger AS dep_trigger
    ON d.classid = 'pg_trigger'::regclass AND dep_trigger.oid = d.objid
  LEFT JOIN pg_catalog.pg_rewrite AS dep_rewrite
    ON d.classid = 'pg_rewrite'::regclass AND dep_rewrite.oid = d.objid
  LEFT JOIN pg_catalog.pg_class AS dep_rewrite_rel
    ON dep_rewrite_rel.oid = dep_rewrite.ev_class
  LEFT JOIN pg_catalog.pg_namespace AS dep_rewrite_ns
    ON dep_rewrite_ns.oid = dep_rewrite_rel.relnamespace
  WHERE cr.oid IS NOT NULL
    AND d.deptype::text <> 'i'
),
external_dependency_summary AS (
  SELECT
    di.table_name,
    count(*) FILTER (WHERE NOT di.is_internal_candidate_dependency)::integer AS external_count,
    coalesce(
      string_agg(
        di.dependency_kind::text || ':' || di.dependency_name::text || '; deptype=' || di.deptype::text,
        ' | ' ORDER BY di.dependency_kind, di.dependency_name
      ) FILTER (WHERE NOT di.is_internal_candidate_dependency),
      'none'
    ) AS external_details
  FROM dependency_inventory AS di
  GROUP BY di.table_name
),
view_dependents AS (
  SELECT
    cr.table_name,
    count(DISTINCT view_rel.oid)::integer AS dependent_count,
    coalesce(
      string_agg(DISTINCT view_ns.nspname::text || '.' || view_rel.relname::text, ' | ' ORDER BY view_ns.nspname::text || '.' || view_rel.relname::text),
      'none'
    ) AS dependent_names
  FROM candidate_relations AS cr
  LEFT JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_class'::regclass AND d.refobjid = cr.oid
  LEFT JOIN pg_catalog.pg_rewrite AS rw
    ON d.classid = 'pg_rewrite'::regclass AND rw.oid = d.objid
  LEFT JOIN pg_catalog.pg_class AS view_rel
    ON view_rel.oid = rw.ev_class AND view_rel.relkind::text IN ('v', 'm')
  LEFT JOIN pg_catalog.pg_namespace AS view_ns
    ON view_ns.oid = view_rel.relnamespace
  WHERE cr.oid IS NOT NULL
    AND view_rel.oid IS NOT NULL
    AND view_rel.oid NOT IN (SELECT oid FROM candidate_relations WHERE oid IS NOT NULL)
  GROUP BY cr.table_name
),
function_dependents AS (
  SELECT
    cr.table_name,
    count(DISTINCT p.oid)::integer AS dependent_count,
    coalesce(
      string_agg(DISTINCT pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')', ' | ' ORDER BY pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')'),
      'none'
    ) AS dependent_names
  FROM candidate_relations AS cr
  LEFT JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_class'::regclass AND d.refobjid = cr.oid AND d.classid = 'pg_proc'::regclass
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = d.objid
  LEFT JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  WHERE cr.oid IS NOT NULL
    AND p.oid IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM candidate_function_oids AS cfo WHERE cfo.oid = p.oid)
  GROUP BY cr.table_name
),
-- Supplemental evidence only: prosrc text matches never produce BLOCKED.
function_source_matches AS (
  SELECT
    cr.table_name,
    count(DISTINCT p.oid)::integer AS match_count,
    coalesce(
      string_agg(DISTINCT pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')', ' | ' ORDER BY pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')'),
      'none'
    ) AS match_names
  FROM candidate_relations AS cr
  LEFT JOIN pg_catalog.pg_proc AS p
    ON pg_catalog.strpos(coalesce(p.prosrc, ''), cr.table_name) > 0
  LEFT JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  WHERE p.oid IS NOT NULL
    AND pn.nspname::text NOT IN ('pg_catalog', 'information_schema')
    AND NOT EXISTS (SELECT 1 FROM candidate_function_oids AS cfo WHERE cfo.oid = p.oid)
  GROUP BY cr.table_name
),
table_policies AS (
  SELECT
    p.tablename::text AS table_name,
    count(*)::integer AS policy_count,
    coalesce(
      string_agg(p.policyname::text || '; roles=' || pg_catalog.array_to_string(p.roles, ',') || '; cmd=' || p.cmd::text, ' | ' ORDER BY p.policyname::text),
      'none'
    ) AS policy_details
  FROM pg_catalog.pg_policies AS p
  WHERE p.schemaname::text = 'public'
    AND p.tablename::text IN (SELECT table_name FROM candidate_names)
  GROUP BY p.tablename
),
table_indexes AS (
  SELECT
    i.tablename::text AS table_name,
    count(*)::integer AS index_count,
    coalesce(string_agg(i.indexname::text || '; ' || i.indexdef::text, ' | ' ORDER BY i.indexname::text), 'none') AS index_details
  FROM pg_catalog.pg_indexes AS i
  WHERE i.schemaname::text = 'public'
    AND i.tablename::text IN (SELECT table_name FROM candidate_names)
  GROUP BY i.tablename
),
table_constraints AS (
  SELECT
    c.relname::text AS table_name,
    count(con.oid)::integer AS constraint_count,
    coalesce(
      string_agg(con.conname::text || '; type=' || con.contype::text || '; ' || pg_catalog.pg_get_constraintdef(con.oid, true)::text, ' | ' ORDER BY con.conname::text),
      'none'
    ) AS constraint_details
  FROM candidate_relations AS c
  LEFT JOIN pg_catalog.pg_constraint AS con ON con.conrelid = c.oid
  WHERE c.oid IS NOT NULL
  GROUP BY c.relname
),
table_triggers AS (
  SELECT
    cr.table_name,
    count(t.oid)::integer AS user_trigger_count,
    coalesce(
      string_agg(
        t.tgname::text || '; enabled=' || CASE t.tgenabled::text WHEN 'O' THEN 'origin' WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always' WHEN 'D' THEN 'disabled' ELSE 'unknown' END
          || '; tgtype=' || t.tgtype::integer
          || '; function=' || coalesce(pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')', 'unresolved'),
        ' | ' ORDER BY t.tgname::text
      ),
      'none'
    ) AS trigger_details
  FROM candidate_relations AS cr
  LEFT JOIN pg_catalog.pg_trigger AS t
    ON t.tgrelid = cr.oid AND NOT t.tgisinternal
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
  LEFT JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  GROUP BY cr.table_name
),
shared_append_only_consumers AS (
  SELECT
    count(t.oid) FILTER (WHERE c.relname::text <> 'brand_exceptional_operation_execution_events')::integer AS external_consumer_count,
    count(t.oid)::integer AS total_consumer_count,
    coalesce(
      string_agg(
        n.nspname::text || '.' || c.relname::text || ':' || t.tgname::text
          || '; enabled=' || CASE t.tgenabled::text WHEN 'O' THEN 'origin' WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always' WHEN 'D' THEN 'disabled' ELSE 'unknown' END
          || '; tgtype=' || t.tgtype::integer,
        ' | ' ORDER BY n.nspname::text, c.relname::text, t.tgname::text
      ),
      'none'
    ) AS consumer_details
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
    AND p.oid = pg_catalog.to_regprocedure('public.pipeline_editorial_protect_append_only()')
),
execution_trigger_match AS (
  SELECT
    count(t.oid)::integer AS exact_match_count,
    coalesce(
      string_agg(
        t.tgname::text || '; function=' || n.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')'
          || '; enabled=' || CASE t.tgenabled::text WHEN 'O' THEN 'origin' WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always' WHEN 'D' THEN 'disabled' ELSE 'unknown' END
          || '; tgtype=' || t.tgtype::integer,
        ' | ' ORDER BY t.tgname::text
      ),
      'none'
    ) AS match_details
  FROM candidate_relations AS cr
  LEFT JOIN pg_catalog.pg_trigger AS t
    ON t.tgrelid = cr.oid
   AND NOT t.tgisinternal
   AND t.tgfoid = pg_catalog.to_regprocedure('public.pipeline_editorial_protect_append_only()')
   AND t.tgtype::integer = 27
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE cr.table_name = 'brand_exceptional_operation_execution_events'
),
candidate_function_dependents AS (
  SELECT
    fm.function_name,
    count(DISTINCT p.oid)::integer AS dependent_count,
    coalesce(
      string_agg(DISTINCT pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')', ' | ' ORDER BY pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')'),
      'none'
    ) AS dependent_names
  FROM function_metadata AS fm
  LEFT JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = fm.oid AND d.classid = 'pg_proc'::regclass
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = d.objid AND p.oid <> fm.oid
  LEFT JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  WHERE fm.oid IS NOT NULL
  GROUP BY fm.function_name
),
-- Supplemental evidence only: catalog dependencies, views and triggers take precedence.
candidate_function_source_consumers AS (
  SELECT
    fm.function_name,
    count(DISTINCT p.oid)::integer AS match_count,
    coalesce(
      string_agg(DISTINCT pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')', ' | ' ORDER BY pn.nspname::text || '.' || p.proname::text || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid)::text || ')'),
      'none'
    ) AS match_names
  FROM function_metadata AS fm
  LEFT JOIN pg_catalog.pg_proc AS p
    ON pg_catalog.strpos(coalesce(p.prosrc, ''), split_part(fm.function_name, '.', 2)) > 0
  LEFT JOIN pg_catalog.pg_namespace AS pn ON pn.oid = p.pronamespace
  WHERE p.oid IS NOT NULL
    AND p.oid <> fm.oid
    AND pn.nspname::text NOT IN ('pg_catalog', 'information_schema')
  GROUP BY fm.function_name
),
candidate_function_trigger_consumers AS (
  SELECT
    fm.function_name,
    count(t.oid)::integer AS consumer_count,
    coalesce(string_agg(n.nspname::text || '.' || c.relname::text || ':' || t.tgname::text, ' | ' ORDER BY n.nspname::text, c.relname::text, t.tgname::text), 'none') AS consumer_names
  FROM function_metadata AS fm
  LEFT JOIN pg_catalog.pg_trigger AS t
    ON t.tgfoid = fm.oid
   AND NOT t.tgisinternal
   AND NOT EXISTS (
     SELECT 1
     FROM candidate_relations AS cr
     WHERE cr.table_name = 'brand_exceptional_operation_execution_events'
       AND cr.oid = t.tgrelid
   )
  LEFT JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  GROUP BY fm.function_name
),
table_classification AS (
  SELECT
    r.table_name,
    CASE
      WHEN r.oid IS NULL THEN 'INVESTIGATE'
      WHEN rc.row_count <> 0 THEN 'BLOCKED'
      WHEN coalesce(fk.external_incoming_count, 0) > 0 THEN 'BLOCKED'
      WHEN coalesce(vd.dependent_count, 0) > 0 THEN 'BLOCKED'
      WHEN coalesce(fd.dependent_count, 0) > 0 THEN 'BLOCKED'
      WHEN coalesce(fsm.match_count, 0) > 0 THEN 'INVESTIGATE'
      WHEN coalesce(ed.external_count, 0) > 0 THEN 'INVESTIGATE'
      WHEN r.table_name = 'brand_exceptional_operation_execution_events'
        AND (coalesce(tt.user_trigger_count, 0) <> 1 OR coalesce(et.exact_match_count, 0) <> 1) THEN 'INVESTIGATE'
      WHEN r.table_name <> 'brand_exceptional_operation_execution_events'
        AND coalesce(tt.user_trigger_count, 0) <> 0 THEN 'INVESTIGATE'
      ELSE 'DROP_SAFE'
    END AS verdict
  FROM candidate_relations AS r
  JOIN row_counts AS rc ON rc.table_name = r.table_name
  LEFT JOIN foreign_key_summary AS fk ON fk.table_name = r.table_name
  LEFT JOIN view_dependents AS vd ON vd.table_name = r.table_name
  LEFT JOIN function_dependents AS fd ON fd.table_name = r.table_name
  LEFT JOIN function_source_matches AS fsm ON fsm.table_name = r.table_name
  LEFT JOIN external_dependency_summary AS ed ON ed.table_name = r.table_name
  LEFT JOIN table_triggers AS tt ON tt.table_name = r.table_name
  CROSS JOIN execution_trigger_match AS et
),
function_classification AS (
  SELECT
    fm.function_name,
    CASE
      WHEN fm.oid IS NULL THEN 'INVESTIGATE'
      WHEN coalesce(fd.dependent_count, 0) > 0 THEN 'BLOCKED'
      WHEN coalesce(fs.match_count, 0) > 0 THEN 'INVESTIGATE'
      WHEN coalesce(ft.consumer_count, 0) > 0 THEN 'BLOCKED'
      WHEN EXISTS (
        SELECT 1
        FROM table_classification AS tc
        WHERE tc.verdict <> 'DROP_SAFE'
      ) THEN 'INVESTIGATE'
      ELSE 'DROP_SAFE'
    END AS verdict
  FROM function_metadata AS fm
  LEFT JOIN candidate_function_dependents AS fd ON fd.function_name = fm.function_name
  LEFT JOIN candidate_function_source_consumers AS fs ON fs.function_name = fm.function_name
  LEFT JOIN candidate_function_trigger_consumers AS ft ON ft.function_name = fm.function_name
),
trigger_classification AS (
  SELECT
    'brand_exceptional_operation_execution_events:exclusive_trigger'::text AS object_name,
    CASE
      WHEN tc.verdict = 'DROP_SAFE' AND et.exact_match_count = 1 THEN 'DROP_SAFE'
      WHEN tc.verdict = 'BLOCKED' THEN 'BLOCKED'
      ELSE 'INVESTIGATE'
    END AS verdict
  FROM table_classification AS tc
  CROSS JOIN execution_trigger_match AS et
  WHERE tc.table_name = 'brand_exceptional_operation_execution_events'
),
overall_decision AS (
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM table_classification WHERE verdict = 'BLOCKED')
        OR EXISTS (SELECT 1 FROM function_classification WHERE verdict = 'BLOCKED')
        OR EXISTS (SELECT 1 FROM trigger_classification WHERE verdict = 'BLOCKED') THEN 'BLOCKED'
      WHEN EXISTS (SELECT 1 FROM table_classification WHERE verdict = 'INVESTIGATE')
        OR EXISTS (SELECT 1 FROM function_classification WHERE verdict = 'INVESTIGATE')
        OR EXISTS (SELECT 1 FROM trigger_classification WHERE verdict = 'INVESTIGATE') THEN 'INVESTIGATE'
      ELSE 'DROP_SAFE'
    END AS verdict
),
checks(sort_order, object_name, check_name, expected, observed, verdict) AS (
  SELECT 10, 'script', 'script_version', 'fixed structural cleanup preflight version', m.script_version, 'INFO'
  FROM metadata AS m
  UNION ALL
  SELECT 20, 'migration numbering', 'next_migration_number', '0031 is not reusable; next eligible successor is 0032', 'highest local migration=0030; 0031 absent and reserved', 'INFO'
  UNION ALL
  SELECT 30, r.object_name, 'existence_owner_rls', 'relation present; owner and RLS reported without assuming safety',
    CASE WHEN r.oid IS NULL THEN 'missing' ELSE 'present; owner=' || r.owner_role || '; relkind=' || r.relkind || '; rls=' || r.relrowsecurity::text || '; force_rls=' || r.relforcerowsecurity::text END,
    CASE WHEN r.oid IS NULL THEN 'INVESTIGATE' ELSE 'INFO' END
  FROM candidate_relations AS r
  UNION ALL
  SELECT 40, r.object_name, 'row_count', '0 rows after development reset', rc.row_count::text,
    CASE WHEN rc.row_count = 0 THEN 'DROP_SAFE' ELSE 'BLOCKED' END
  FROM candidate_relations AS r
  JOIN row_counts AS rc ON rc.table_name = r.table_name
  UNION ALL
  SELECT 50, r.object_name, 'candidate_classification', 'DROP_SAFE only with zero rows and no unknown/external dependency', tc.verdict, tc.verdict
  FROM candidate_relations AS r
  JOIN table_classification AS tc ON tc.table_name = r.table_name
  UNION ALL
  SELECT 60, r.object_name, 'foreign_keys', 'incoming and outgoing FKs with ON DELETE must be cataloged; external incoming blocks removal',
    'incoming=' || coalesce(fk.incoming_details, 'none') || '; outgoing=' || coalesce(fk.outgoing_details, 'none'),
    CASE WHEN coalesce(fk.external_incoming_count, 0) = 0 THEN 'INFO' ELSE 'BLOCKED' END
  FROM candidate_relations AS r
  LEFT JOIN foreign_key_summary AS fk ON fk.table_name = r.table_name
  UNION ALL
  SELECT 70, r.object_name, 'pg_depend', 'no external catalog dependency left unresolved',
    'external_count=' || coalesce(ed.external_count, 0)::text || '; ' || coalesce(ed.external_details, 'none'),
    CASE WHEN coalesce(ed.external_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'INVESTIGATE' END
  FROM candidate_relations AS r
  LEFT JOIN external_dependency_summary AS ed ON ed.table_name = r.table_name
  UNION ALL
  SELECT 80, r.object_name, 'views_materialized_views', 'no dependent view or materialized view',
    'count=' || coalesce(vd.dependent_count, 0)::text || '; ' || coalesce(vd.dependent_names, 'none'),
    CASE WHEN coalesce(vd.dependent_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'BLOCKED' END
  FROM candidate_relations AS r
  LEFT JOIN view_dependents AS vd ON vd.table_name = r.table_name
  UNION ALL
  SELECT 90, r.object_name, 'function_procedure_dependents', 'no external function/procedure dependency',
    'catalog_count=' || coalesce(fd.dependent_count, 0)::text || '; ' || coalesce(fd.dependent_names, 'none') || '; source_matches=' || coalesce(fsm.match_count, 0)::text || '; ' || coalesce(fsm.match_names, 'none'),
    CASE WHEN coalesce(fd.dependent_count, 0) = 0 AND coalesce(fsm.match_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'INVESTIGATE' END
  FROM candidate_relations AS r
  LEFT JOIN function_dependents AS fd ON fd.table_name = r.table_name
  LEFT JOIN function_source_matches AS fsm ON fsm.table_name = r.table_name
  UNION ALL
  SELECT 100, r.object_name, 'indexes', 'indexes are exclusive metadata of the candidate relation', coalesce(ti.index_details, 'none'), 'INFO'
  FROM candidate_relations AS r
  LEFT JOIN table_indexes AS ti ON ti.table_name = r.table_name
  UNION ALL
  SELECT 110, r.object_name, 'constraints', 'constraints are cataloged; external incoming FKs are evaluated separately', coalesce(tc.constraint_details, 'none'), 'INFO'
  FROM candidate_relations AS r
  LEFT JOIN table_constraints AS tc ON tc.table_name = r.table_name
  UNION ALL
  SELECT 120, r.object_name, 'rls_policies_acl', 'RLS, policies, owner and ACL are reported; exclusive metadata may be removed with the relation',
    'rls=' || coalesce(r.relrowsecurity::text, 'missing') || '; policies=' || coalesce(tp.policy_details, 'none') || '; owner=' || coalesce(r.owner_role, 'missing') || '; acl=' || coalesce(r.acl_text, 'missing'),
    'INFO'
  FROM candidate_relations AS r
  LEFT JOIN table_policies AS tp ON tp.table_name = r.table_name
  UNION ALL
  SELECT 130, r.object_name, 'triggers', 'execution-events has exactly one exclusive append-only trigger; other candidates have no user trigger', coalesce(tt.trigger_details, 'none'),
    CASE
      WHEN r.table_name = 'brand_exceptional_operation_execution_events' AND coalesce(et.exact_match_count, 0) = 1 AND coalesce(tt.user_trigger_count, 0) = 1 THEN 'DROP_SAFE'
      WHEN r.table_name <> 'brand_exceptional_operation_execution_events' AND coalesce(tt.user_trigger_count, 0) = 0 THEN 'DROP_SAFE'
      ELSE 'INVESTIGATE'
    END
  FROM candidate_relations AS r
  LEFT JOIN table_triggers AS tt ON tt.table_name = r.table_name
  CROSS JOIN execution_trigger_match AS et
  UNION ALL
  SELECT 140, 'public.brand_exceptional_operation_execution_events', 'trigger:actual_catalog_identity', 'one BEFORE UPDATE OR DELETE trigger using public.pipeline_editorial_protect_append_only()', 'exact_match_count=' || et.exact_match_count::text || '; ' || et.match_details, CASE WHEN et.exact_match_count = 1 THEN 'DROP_SAFE' ELSE 'INVESTIGATE' END
  FROM execution_trigger_match AS et
  UNION ALL
  SELECT 150, fm.function_name, 'function:metadata', 'exclusive helper; owner, SECURITY DEFINER, volatility, search_path and EXECUTE ACL reported',
    CASE WHEN fm.oid IS NULL THEN 'missing' ELSE 'present; owner=' || fm.owner_role || '; security_definer=' || fm.prosecdef::text || '; volatility=' || fm.provolatile::text || '; config=' || fm.proconfig || '; acl=' || fm.execute_acl END,
    fc.verdict
  FROM function_metadata AS fm
  JOIN function_classification AS fc ON fc.function_name = fm.function_name
  UNION ALL
  SELECT 160, fm.function_name, 'function:dependents', 'no external function, trigger or source consumer',
    'catalog_dependents=' || coalesce(fd.dependent_count, 0)::text || '; ' || coalesce(fd.dependent_names, 'none') || '; trigger_consumers=' || coalesce(ft.consumer_count, 0)::text || '; ' || coalesce(ft.consumer_names, 'none') || '; source_consumers=' || coalesce(fs.match_count, 0)::text || '; ' || coalesce(fs.match_names, 'none'),
    CASE WHEN coalesce(fd.dependent_count, 0) = 0 AND coalesce(ft.consumer_count, 0) = 0 AND coalesce(fs.match_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'INVESTIGATE' END
  FROM function_metadata AS fm
  LEFT JOIN candidate_function_dependents AS fd ON fd.function_name = fm.function_name
  LEFT JOIN candidate_function_trigger_consumers AS ft ON ft.function_name = fm.function_name
  LEFT JOIN candidate_function_source_consumers AS fs ON fs.function_name = fm.function_name
  UNION ALL
  SELECT 170, 'public.pipeline_editorial_protect_append_only()', 'shared_function:canonical_consumers', 'preserve; at least one external canonical trigger consumer outside 0030',
    'function=' || CASE WHEN pg_catalog.to_regprocedure('public.pipeline_editorial_protect_append_only()') IS NULL THEN 'missing' ELSE 'present' END || '; external_consumers=' || sac.external_consumer_count::text || '; total_consumers=' || sac.total_consumer_count::text || '; ' || sac.consumer_details,
    CASE WHEN sac.external_consumer_count > 0 THEN 'INFO' ELSE 'INVESTIGATE' END
  FROM shared_append_only_consumers AS sac
  UNION ALL
  SELECT 180, 'public.tenant_0016_agency_role_rollback', 'tenant_0016:runtime_structural_references', 'no incoming FK/view/function/trigger consumer; outgoing agency_memberships FK is known and does not make the child table authoritative',
    'incoming_fk=' || coalesce(fk.incoming_details, 'none') || '; outgoing_fk=' || coalesce(fk.outgoing_details, 'none') || '; pg_depend_external=' || coalesce(ed.external_count, 0)::text || '; views=' || coalesce(vd.dependent_count, 0)::text || '; functions=' || coalesce(fd.dependent_count, 0)::text || '; source_matches=' || coalesce(fsm.match_count, 0)::text || '; user_triggers=' || coalesce(tt.user_trigger_count, 0)::text,
    CASE WHEN coalesce(fk.external_incoming_count, 0) = 0 AND coalesce(ed.external_count, 0) = 0 AND coalesce(vd.dependent_count, 0) = 0 AND coalesce(fd.dependent_count, 0) = 0 AND coalesce(fsm.match_count, 0) = 0 AND coalesce(tt.user_trigger_count, 0) = 0 THEN 'DROP_SAFE' ELSE 'INVESTIGATE' END
  FROM candidate_relations AS r
  LEFT JOIN foreign_key_summary AS fk ON fk.table_name = r.table_name
  LEFT JOIN external_dependency_summary AS ed ON ed.table_name = r.table_name
  LEFT JOIN view_dependents AS vd ON vd.table_name = r.table_name
  LEFT JOIN function_dependents AS fd ON fd.table_name = r.table_name
  LEFT JOIN function_source_matches AS fsm ON fsm.table_name = r.table_name
  LEFT JOIN table_triggers AS tt ON tt.table_name = r.table_name
  WHERE r.table_name = 'tenant_0016_agency_role_rollback'
  UNION ALL
  SELECT 190, 'future_successor_snapshot', 'snapshot_plan', 'capture public objects, ACL, RLS, policies, functions, triggers, constraints/FKs and indexes before any successor migration', 'not captured by this diagnostic; this result is not a persisted baseline', 'INFO'
  UNION ALL
  SELECT 200, 'future_successor_migration', 'conceptual_drop_order', 'determine from catalog after all gates; do not use CASCADE', '0030 trigger -> execution_events -> exclusive helper/grants/objects; 0016 rollback table; order remains pending catalog review', 'INFO'
  UNION ALL
  SELECT 210, 'structural_cleanup', 'overall_candidate_decision', 'all candidate tables, helper and exclusive trigger must be DROP_SAFE', od.verdict, od.verdict
  FROM overall_decision AS od
)
SELECT
  m.script_version,
  c.object_name,
  c.check_name,
  c.expected,
  c.observed,
  c.verdict
FROM metadata AS m
CROSS JOIN checks AS c
ORDER BY c.sort_order, c.object_name, c.check_name;
