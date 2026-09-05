-- Read-only preflight for the successor that protects Graph version lineage
-- and working-copy artifact references. It describes the current pre-state;
-- it does not apply or simulate the migration.
WITH target_tables AS (
  SELECT
    c.relname,
    c.oid,
    c.relrowsecurity,
    c.relforcerowsecurity
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'internal_link_graphs',
      'internal_link_graph_nodes',
      'internal_link_graph_edges',
      'internal_link_graph_working_copies'
    )
    AND c.relkind IN ('r', 'p')
),
version_chain_function AS (
  SELECT
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner)::text AS owner_name,
    p.prosecdef,
    pg_catalog.pg_get_functiondef(p.oid)::text AS definition
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'internal_link_graph_validate_version_chain'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
),
successor_function_collision AS (
  SELECT count(*)::bigint AS function_count
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'internal_link_graph_validate_working_copy_references'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
),
successor_trigger_collision AS (
  SELECT count(*)::bigint AS trigger_count
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'internal_link_graph_working_copies'
    AND t.tgname = 'internal_link_graph_working_copies_validate_references_trg'
    AND NOT t.tgisinternal
),
append_only_triggers AS (
  SELECT
    expected.table_name,
    expected.trigger_name,
    count(t.oid)::bigint AS trigger_count,
    bool_and(t.tgenabled = 'O') FILTER (WHERE t.oid IS NOT NULL) AS enabled_as_origin,
    bool_and(NOT t.tgisinternal) FILTER (WHERE t.oid IS NOT NULL) AS user_trigger
  FROM (
    VALUES
      ('internal_link_graphs'::text, 'internal_link_graphs_append_only_trg'::text),
      ('internal_link_graph_nodes'::text, 'internal_link_graph_nodes_append_only_trg'::text),
      ('internal_link_graph_edges'::text, 'internal_link_graph_edges_append_only_trg'::text)
  ) AS expected(table_name, trigger_name)
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relname = expected.table_name
  LEFT JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
   AND n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_trigger AS t
    ON t.tgrelid = c.oid
   AND n.oid IS NOT NULL
   AND t.tgname = expected.trigger_name
   AND NOT t.tgisinternal
  GROUP BY expected.table_name, expected.trigger_name
),
table_privileges AS (
  SELECT
    has_table_privilege('service_role', 'public.internal_link_graphs', 'SELECT') AS graphs_select,
    has_table_privilege('service_role', 'public.internal_link_graphs', 'INSERT') AS graphs_insert,
    has_table_privilege('service_role', 'public.internal_link_graphs', 'UPDATE') AS graphs_update,
    has_table_privilege('service_role', 'public.internal_link_graphs', 'DELETE') AS graphs_delete,
    has_table_privilege('service_role', 'public.internal_link_graph_nodes', 'SELECT') AS nodes_select,
    has_table_privilege('service_role', 'public.internal_link_graph_nodes', 'INSERT') AS nodes_insert,
    has_table_privilege('service_role', 'public.internal_link_graph_nodes', 'UPDATE') AS nodes_update,
    has_table_privilege('service_role', 'public.internal_link_graph_nodes', 'DELETE') AS nodes_delete,
    has_table_privilege('service_role', 'public.internal_link_graph_edges', 'SELECT') AS edges_select,
    has_table_privilege('service_role', 'public.internal_link_graph_edges', 'INSERT') AS edges_insert,
    has_table_privilege('service_role', 'public.internal_link_graph_edges', 'UPDATE') AS edges_update,
    has_table_privilege('service_role', 'public.internal_link_graph_edges', 'DELETE') AS edges_delete
),
checks AS (
  SELECT
    'CURRENT_VERSION_CHAIN_FOR_SHARE'::text AS check_name,
    'public.internal_link_graph_validate_version_chain()'::text AS object_name,
    format('present=%s; for_share=%s; security_definer=%s; owner=%s',
      (SELECT count(*) > 0 FROM version_chain_function),
      coalesce((SELECT definition ILIKE '%FOR SHARE%' FROM version_chain_function), false),
      coalesce((SELECT prosecdef FROM version_chain_function), false),
      coalesce((SELECT owner_name FROM version_chain_function), '<absent>'))::text AS observed,
    CASE WHEN (SELECT count(*) > 0 FROM version_chain_function)
              AND coalesce((SELECT definition ILIKE '%FOR SHARE%' FROM version_chain_function), false)
              AND NOT coalesce((SELECT prosecdef FROM version_chain_function), true)
         THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  UNION ALL
  SELECT
    'CURRENT_VERSION_CHAIN_ADVISORY_LOCK'::text,
    'public.internal_link_graph_validate_version_chain()'::text,
    format('advisory_lock=%s; lock_scope=brand_id+graph_id',
      coalesce((SELECT definition ILIKE '%pg_advisory_xact_lock%' FROM version_chain_function), false))::text,
    CASE WHEN NOT coalesce((SELECT definition ILIKE '%pg_advisory_xact_lock%' FROM version_chain_function), false)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'CURRENT_SERVICE_ROLE_UPDATE'::text,
    'public.internal_link_graphs/nodes/edges'::text,
    format('graphs=%s; nodes=%s; edges=%s',
      (SELECT graphs_update FROM table_privileges),
      (SELECT nodes_update FROM table_privileges),
      (SELECT edges_update FROM table_privileges))::text,
    CASE WHEN NOT (SELECT graphs_update OR nodes_update OR edges_update FROM table_privileges)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'CURRENT_SERVICE_ROLE_DELETE'::text,
    'public.internal_link_graphs/nodes/edges'::text,
    format('graphs=%s; nodes=%s; edges=%s',
      (SELECT graphs_delete FROM table_privileges),
      (SELECT nodes_delete FROM table_privileges),
      (SELECT edges_delete FROM table_privileges))::text,
    CASE WHEN NOT (SELECT graphs_delete OR nodes_delete OR edges_delete FROM table_privileges)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'CURRENT_SERVICE_ROLE_SELECT_INSERT'::text,
    'public.internal_link_graphs/nodes/edges'::text,
    format('graphs=%s/%s; nodes=%s/%s; edges=%s/%s',
      (SELECT graphs_select FROM table_privileges), (SELECT graphs_insert FROM table_privileges),
      (SELECT nodes_select FROM table_privileges), (SELECT nodes_insert FROM table_privileges),
      (SELECT edges_select FROM table_privileges), (SELECT edges_insert FROM table_privileges))::text,
    CASE WHEN (SELECT graphs_select AND graphs_insert AND nodes_select AND nodes_insert AND edges_select AND edges_insert FROM table_privileges)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'CURRENT_APPROVED_GRAPH_APPEND_ONLY'::text,
    format('%s/%s/%s',
      'public.internal_link_graphs',
      'public.internal_link_graph_nodes',
      'public.internal_link_graph_edges')::text,
    format('triggers=%s; enabled=%s; user_triggers=%s',
      (SELECT string_agg(format('%s=%s', table_name, trigger_count), ',' ORDER BY table_name) FROM append_only_triggers),
      (SELECT bool_and(coalesce(enabled_as_origin, false)) FROM append_only_triggers),
      (SELECT bool_and(coalesce(user_trigger, false)) FROM append_only_triggers))::text,
    CASE WHEN (SELECT bool_and(trigger_count = 1 AND enabled_as_origin AND user_trigger) FROM append_only_triggers)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'CURRENT_RLS'::text,
    'public.internal_link_graph*'::text,
    format('tables=%s/4; enabled=%s; forced=%s',
      (SELECT count(*) FROM target_tables),
      (SELECT bool_and(relrowsecurity) FROM target_tables),
      (SELECT bool_or(relforcerowsecurity) FROM target_tables))::text,
    CASE WHEN (SELECT count(*) = 4 AND bool_and(relrowsecurity) AND NOT bool_or(relforcerowsecurity) FROM target_tables)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'CURRENT_WORKING_COPY_CROSS_BRAND_DB_GUARD'::text,
    'public.internal_link_graph_working_copies'::text,
    format('guard_function=%s; guard_trigger=%s; current_state=expected_missing_before_successor',
      (SELECT function_count FROM successor_function_collision),
      (SELECT trigger_count FROM successor_trigger_collision))::text,
    CASE WHEN (SELECT function_count = 0 FROM successor_function_collision)
              AND (SELECT trigger_count = 0 FROM successor_trigger_collision)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'SUCCESSOR_COLLISION'::text,
    'function + trigger names/signatures of successor'::text,
    format('function_collision=%s; trigger_collision=%s',
      (SELECT function_count FROM successor_function_collision),
      (SELECT trigger_count FROM successor_trigger_collision))::text,
    CASE WHEN (SELECT function_count = 0 FROM successor_function_collision)
              AND (SELECT trigger_count = 0 FROM successor_trigger_collision)
         THEN 'PASS' ELSE 'FAIL' END::text
),
gate AS (
  SELECT count(*) FILTER (WHERE verdict = 'FAIL')::bigint AS failures
  FROM checks
)
SELECT check_name::text, object_name::text, observed::text, verdict::text
FROM checks
UNION ALL
SELECT
  'REMOTE_PREFLIGHT_GATE'::text,
  'internal_link_graph_integrity_guards successor'::text,
  format('failed_checks=%s; current_state=pre-successor', failures)::text,
  CASE WHEN failures = 0 THEN 'PASS' ELSE 'FAIL' END::text
FROM gate;
