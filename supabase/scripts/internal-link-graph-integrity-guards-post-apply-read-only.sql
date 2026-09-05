-- Read-only post-apply readback for the InternalLinkGraph integrity guards.
-- It does not create fixtures and does not mutate the remote database.
WITH version_chain_function AS (
  SELECT
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner)::text AS owner_name,
    p.prosecdef,
    p.proconfig AS configuration,
    pg_catalog.pg_get_functiondef(p.oid)::text AS definition
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'internal_link_graph_validate_version_chain'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
),
working_copy_guard AS (
  SELECT
    p.oid,
    p.prosecdef,
    pg_catalog.pg_get_functiondef(p.oid)::text AS definition
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'internal_link_graph_validate_working_copy_references'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
),
working_copy_trigger AS (
  SELECT
    t.oid,
    t.tgfoid,
    pg_catalog.pg_get_triggerdef(t.oid, true)::text AS definition
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'internal_link_graph_working_copies'
    AND t.tgname = 'internal_link_graph_working_copies_validate_references_trg'
    AND NOT t.tgisinternal
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
append_only_triggers AS (
  SELECT
    expected.table_name,
    expected.trigger_name,
    count(t.oid)::bigint AS trigger_count,
    bool_and(t.tgenabled = 'O') FILTER (WHERE t.oid IS NOT NULL) AS enabled_as_origin
  FROM (
    VALUES
      ('internal_link_graphs'::text, 'internal_link_graphs_append_only_trg'::text),
      ('internal_link_graph_nodes'::text, 'internal_link_graph_nodes_append_only_trg'::text),
      ('internal_link_graph_edges'::text, 'internal_link_graph_edges_append_only_trg'::text)
  ) AS expected(table_name, trigger_name)
  LEFT JOIN pg_catalog.pg_class AS c ON c.relname = expected.table_name
  LEFT JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
   AND n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_trigger AS t
    ON n.oid IS NOT NULL
   AND t.tgrelid = c.oid
   AND t.tgname = expected.trigger_name
   AND NOT t.tgisinternal
  GROUP BY expected.table_name, expected.trigger_name
),
checks AS (
  SELECT
    'VERSION_CHAIN_FUNCTION'::text AS check_name,
    'public.internal_link_graph_validate_version_chain()'::text AS object_name,
    format('present=%s; owner=%s; security_definer=%s',
      (SELECT count(*) > 0 FROM version_chain_function),
      coalesce((SELECT owner_name FROM version_chain_function), '<absent>'),
      coalesce((SELECT prosecdef FROM version_chain_function), false))::text AS observed,
    CASE WHEN (SELECT count(*) > 0 FROM version_chain_function)
              AND NOT coalesce((SELECT prosecdef FROM version_chain_function), true)
         THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  UNION ALL
  SELECT
    'VERSION_CHAIN_FOR_SHARE'::text,
    'public.internal_link_graph_validate_version_chain()'::text,
    format('for_share=%s; advisory_lock=%s',
      coalesce((SELECT definition ILIKE '%FOR SHARE%' FROM version_chain_function), false),
      coalesce((SELECT definition ILIKE '%pg_advisory_xact_lock%' FROM version_chain_function), false))::text,
    CASE WHEN NOT coalesce((SELECT definition ILIKE '%FOR SHARE%' FROM version_chain_function), true)
              AND coalesce((SELECT definition ILIKE '%pg_advisory_xact_lock%' FROM version_chain_function), false)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'VERSION_CHAIN_SEARCH_PATH'::text,
    'public.internal_link_graph_validate_version_chain()'::text,
    coalesce((SELECT array_to_string(configuration, ';') FROM version_chain_function), '<absent>')::text,
    CASE WHEN coalesce((SELECT configuration @> ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
                        FROM version_chain_function), false)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'WORKING_COPY_DB_GUARD_PRESENT'::text,
    'public.internal_link_graph_validate_working_copy_references()'::text,
    format('function=%s; invoker=%s; references=%s',
      (SELECT count(*) > 0 FROM working_copy_guard),
      NOT coalesce((SELECT prosecdef FROM working_copy_guard), true),
      coalesce((SELECT definition ILIKE '%silo_dna%'
                         AND definition ILIKE '%silo_page%'
                         AND definition ILIKE '%article_dna%'
                         AND definition ILIKE '%NEW.marca_id%'
                FROM working_copy_guard), false))::text,
    CASE WHEN (SELECT count(*) > 0 FROM working_copy_guard)
              AND NOT coalesce((SELECT prosecdef FROM working_copy_guard), true)
              AND coalesce((SELECT definition ILIKE '%silo_dna%'
                                     AND definition ILIKE '%silo_page%'
                                     AND definition ILIKE '%article_dna%'
                                     AND definition ILIKE '%NEW.marca_id%'
                            FROM working_copy_guard), false)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'WORKING_COPY_DB_GUARD_TRIGGER'::text,
    'public.internal_link_graph_working_copies'::text,
    format('present=%s; function_match=%s',
      (SELECT count(*) > 0 FROM working_copy_trigger),
      coalesce((SELECT tgfoid = (SELECT oid FROM working_copy_guard) FROM working_copy_trigger), false))::text,
    CASE WHEN (SELECT count(*) > 0 FROM working_copy_trigger)
              AND coalesce((SELECT tgfoid = (SELECT oid FROM working_copy_guard) FROM working_copy_trigger), false)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'WORKING_COPY_DB_GUARD_EVENTS'::text,
    'internal_link_graph_working_copies INSERT/UPDATE'::text,
    coalesce((SELECT definition FROM working_copy_trigger), '<absent>')::text,
    CASE WHEN coalesce((SELECT definition ILIKE '%BEFORE INSERT OR UPDATE%'
                                  AND definition ILIKE '%EXECUTE FUNCTION%internal_link_graph_validate_working_copy_references%'
                        FROM working_copy_trigger), false)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'SERVICE_ROLE_UPDATE'::text,
    'public.internal_link_graphs/nodes/edges'::text,
    format('graphs=%s; nodes=%s; edges=%s',
      (SELECT graphs_update FROM table_privileges),
      (SELECT nodes_update FROM table_privileges),
      (SELECT edges_update FROM table_privileges))::text,
    CASE WHEN NOT (SELECT graphs_update OR nodes_update OR edges_update FROM table_privileges)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'SERVICE_ROLE_DELETE'::text,
    'public.internal_link_graphs/nodes/edges'::text,
    format('graphs=%s; nodes=%s; edges=%s',
      (SELECT graphs_delete FROM table_privileges),
      (SELECT nodes_delete FROM table_privileges),
      (SELECT edges_delete FROM table_privileges))::text,
    CASE WHEN NOT (SELECT graphs_delete OR nodes_delete OR edges_delete FROM table_privileges)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'SERVICE_ROLE_SELECT_INSERT'::text,
    'public.internal_link_graphs/nodes/edges'::text,
    format('graphs=%s/%s; nodes=%s/%s; edges=%s/%s',
      (SELECT graphs_select FROM table_privileges), (SELECT graphs_insert FROM table_privileges),
      (SELECT nodes_select FROM table_privileges), (SELECT nodes_insert FROM table_privileges),
      (SELECT edges_select FROM table_privileges), (SELECT edges_insert FROM table_privileges))::text,
    CASE WHEN (SELECT graphs_select AND graphs_insert AND nodes_select AND nodes_insert AND edges_select AND edges_insert FROM table_privileges)
         THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'APPEND_ONLY_TRIGGERS'::text,
    'public.internal_link_graphs/nodes/edges'::text,
    format('triggers=%s; enabled=%s',
      (SELECT string_agg(format('%s=%s', table_name, trigger_count), ',' ORDER BY table_name) FROM append_only_triggers),
      (SELECT bool_and(coalesce(enabled_as_origin, false)) FROM append_only_triggers))::text,
    CASE WHEN (SELECT bool_and(trigger_count = 1 AND enabled_as_origin) FROM append_only_triggers)
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
  'POST_APPLY_GATE'::text,
  'internal_link_graph_integrity_guards'::text,
  format('failed_checks=%s', failures)::text,
  CASE WHEN failures = 0 THEN 'PASS' ELSE 'FAIL' END::text
FROM gate;
