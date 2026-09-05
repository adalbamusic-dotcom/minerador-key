-- Preflight remoto da sucessora do lock de runtime do InternalLinkGraph.
-- Execute como uma única consulta antes da aplicação manual.
-- Somente catálogo/privilegios; não cria fixtures e não altera o banco.
-- O estado esperado é a definição antiga da RPC, ainda com FOR UPDATE.

WITH
target_function AS (
  SELECT
    p.oid,
    p.oid::regprocedure::text AS signature,
    pg_catalog.pg_get_userbyid(p.proowner)::text AS owner_name,
    p.prosecdef,
    p.proconfig,
    p.proacl::text AS acl,
    pg_catalog.pg_get_functiondef(p.oid)::text AS definition,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'persist_internal_link_graph'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_marca_id uuid, p_actor_user_id uuid, p_action text, p_graph jsonb'
),
target_tables(table_name) AS (
  VALUES
    ('internal_link_graphs'::text),
    ('internal_link_graph_nodes'::text),
    ('internal_link_graph_edges'::text)
),
table_privileges AS (
  SELECT
    table_name,
    has_table_privilege('service_role', 'public.' || table_name, 'SELECT') AS service_select,
    has_table_privilege('service_role', 'public.' || table_name, 'INSERT') AS service_insert,
    has_table_privilege('service_role', 'public.' || table_name, 'UPDATE') AS service_update,
    has_table_privilege('service_role', 'public.' || table_name, 'DELETE') AS service_delete
  FROM target_tables
),
target_triggers AS (
  SELECT
    e.table_name,
    e.trigger_name,
    t.oid,
    t.tgenabled::text AS enabled,
    CASE WHEN t.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_triggerdef(t.oid, true)::text END AS definition
  FROM (VALUES
    ('internal_link_graphs'::text, 'internal_link_graphs_append_only_trg'::text),
    ('internal_link_graph_nodes'::text, 'internal_link_graph_nodes_append_only_trg'::text),
    ('internal_link_graph_edges'::text, 'internal_link_graph_edges_append_only_trg'::text)
  ) AS e(table_name, trigger_name)
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = 'public'::regnamespace
   AND c.relname = e.table_name
  LEFT JOIN pg_catalog.pg_trigger AS t
    ON t.tgrelid = c.oid
   AND t.tgname = e.trigger_name
   AND NOT t.tgisinternal
),
migration_catalog AS (
  SELECT
    to_regclass('supabase_migrations.schema_migrations')::text AS history_relation,
    EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'supabase_migrations'
        AND table_name = 'schema_migrations'
    ) AS history_table_visible
),
function_gate AS (
  SELECT bool_and(
    oid IS NOT NULL
    AND owner_name IS NOT NULL
    AND NOT prosecdef
    AND coalesce(proconfig::text, '') = '{"search_path=pg_catalog, public, pg_temp"}'
    AND definition ILIKE '%pg_advisory_xact_lock%'
    AND definition ILIKE '%FOR UPDATE%'
    AND service_execute
    AND NOT authenticated_execute
    AND NOT anon_execute
  ) AS ok
  FROM target_function
),
table_gate AS (
  SELECT bool_and(
    service_select
    AND service_insert
    AND NOT service_update
    AND NOT service_delete
  ) AS ok
  FROM table_privileges
),
trigger_gate AS (
  SELECT bool_and(
    oid IS NOT NULL
    AND enabled = 'O'
    AND definition ILIKE ('%BEFORE DELETE OR UPDATE ON ' || table_name || '%')
    AND definition ILIKE '%internal_link_graph_protect_append_only%'
  ) AS ok
  FROM target_triggers
)
SELECT
  'CURRENT_RPC'::text AS check_name,
  'public.persist_internal_link_graph(uuid,uuid,text,jsonb)'::text AS object_name,
  coalesce((SELECT jsonb_build_object(
    'owner', owner_name,
    'security', CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END,
    'search_path', proconfig,
    'advisory_lock', definition ILIKE '%pg_advisory_xact_lock%',
    'for_update', definition ILIKE '%FOR UPDATE%',
    'acl', acl,
    'service_role_execute', service_execute,
    'authenticated_execute', authenticated_execute,
    'anon_execute', anon_execute
  )::text FROM target_function), 'ABSENT')::text AS observed,
  CASE WHEN (SELECT ok FROM function_gate) THEN 'PASS' ELSE 'FAIL' END::text AS verdict
UNION ALL
SELECT
  'CURRENT_TABLE_PRIVILEGES'::text,
  table_name::text,
  format('service_role: select=%s; insert=%s; update=%s; delete=%s', service_select, service_insert, service_update, service_delete)::text,
  CASE WHEN service_select AND service_insert AND NOT service_update AND NOT service_delete THEN 'PASS' ELSE 'FAIL' END::text
FROM table_privileges
UNION ALL
SELECT
  'CURRENT_APPEND_ONLY_TRIGGERS'::text,
  table_name || '.' || trigger_name,
  coalesce(definition, 'ABSENT')::text,
  CASE WHEN oid IS NOT NULL AND enabled = 'O' AND definition ILIKE ('%BEFORE DELETE OR UPDATE ON ' || table_name || '%') AND definition ILIKE '%internal_link_graph_protect_append_only%' THEN 'PASS' ELSE 'FAIL' END::text
FROM target_triggers
UNION ALL
SELECT
  'CURRENT_RPC_FOR_UPDATE_PRESENT'::text,
  'public.persist_internal_link_graph'::text,
  coalesce((SELECT (definition ILIKE '%FOR UPDATE%')::text FROM target_function), 'ABSENT')::text,
  CASE WHEN coalesce((SELECT definition ILIKE '%FOR UPDATE%' FROM target_function), false) THEN 'PASS' ELSE 'FAIL' END::text
UNION ALL
SELECT
  'ADVISORY_LOCK_PREREQUISITE'::text,
  'brand_id + graph_id'::text,
  coalesce((SELECT (definition ILIKE '%pg_advisory_xact_lock%')::text FROM target_function), 'ABSENT')::text,
  CASE WHEN coalesce((SELECT definition ILIKE '%pg_advisory_xact_lock%' FROM target_function), false) THEN 'PASS' ELSE 'FAIL' END::text
UNION ALL
SELECT
  'SUCCESSOR_REMOTE_CONFLICT'::text,
  '20260827032222_internal_link_graph_runtime_advisory_lock'::text,
  format(
    'migration_history=%s; history_table_visible=%s; successor_applied_by_current_definition=%s',
    coalesce((SELECT history_relation FROM migration_catalog), 'ABSENT'),
    (SELECT history_table_visible FROM migration_catalog),
    coalesce(NOT (SELECT definition ILIKE '%FOR UPDATE%' FROM target_function), false)
  )::text,
  CASE
    WHEN coalesce((SELECT definition ILIKE '%FOR UPDATE%' FROM target_function), false)
      THEN 'PASS'
    ELSE 'FAIL'
  END::text
UNION ALL
SELECT
  'REMOTE_PREFLIGHT_GATE'::text,
  'runtime lock successor'::text,
  format('function=%s; tables=%s; triggers=%s; successor_prestate=%s', (SELECT ok FROM function_gate), (SELECT ok FROM table_gate), (SELECT ok FROM trigger_gate), coalesce((SELECT definition ILIKE '%FOR UPDATE%' FROM target_function), false))::text,
  CASE WHEN (SELECT ok FROM function_gate)
          AND (SELECT ok FROM table_gate)
          AND (SELECT ok FROM trigger_gate)
          AND coalesce((SELECT definition ILIKE '%FOR UPDATE%' FROM target_function), false)
       THEN 'PASS' ELSE 'FAIL' END::text;
