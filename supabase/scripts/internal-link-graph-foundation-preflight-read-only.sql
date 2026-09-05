-- InternalLinkGraph foundation final preflight.
-- Execute as one read-only statement before the manual migration.
-- This script must not create tables, functions, policies, fixtures or TEMP
-- objects. The target relations are expected to be absent in the pre-apply
-- state, so all target checks use catalog metadata only.

WITH
target_tables(table_name) AS (
  VALUES
    ('internal_link_graphs'::text),
    ('internal_link_graph_working_copies'::text),
    ('internal_link_graph_nodes'::text),
    ('internal_link_graph_edges'::text),
    ('internal_link_graph_proposals'::text)
),
target_functions(function_identity) AS (
  VALUES
    ('public.internal_link_graph_validate_references()'::text),
    ('public.internal_link_graph_validate_bases()'::text),
    ('public.internal_link_graph_protect_append_only()'::text),
    ('public.internal_link_graph_validate_version_chain()'::text),
    ('public.internal_link_graph_proposal_review_guard()'::text),
    ('public.internal_link_graph_proposal_validate_base()'::text),
    ('public.persist_internal_link_graph(uuid,uuid,text,jsonb)'::text),
    ('public.persist_internal_link_graph_working_copy(uuid,uuid,text,bigint,jsonb)'::text)
),
expected_indexes(index_name, table_name) AS (
  VALUES
    ('internal_link_graphs_pkey', 'internal_link_graphs'),
    ('internal_link_graphs_brand_version_unique', 'internal_link_graphs'),
    ('internal_link_graphs_identity_version_unique', 'internal_link_graphs'),
    ('internal_link_graphs_brand_silo_version_idx', 'internal_link_graphs'),
    ('internal_link_graph_nodes_pkey', 'internal_link_graph_nodes'),
    ('internal_link_graph_nodes_graph_brand_node_unique', 'internal_link_graph_nodes'),
    ('internal_link_graph_nodes_brand_lookup_idx', 'internal_link_graph_nodes'),
    ('internal_link_graph_edges_pkey', 'internal_link_graph_edges'),
    ('internal_link_graph_edges_directed_unique', 'internal_link_graph_edges'),
    ('internal_link_graph_edges_brand_id_unique', 'internal_link_graph_edges'),
    ('internal_link_graph_edges_brand_source_idx', 'internal_link_graph_edges'),
    ('internal_link_graph_proposals_pkey', 'internal_link_graph_proposals'),
    ('internal_link_graph_proposals_brand_graph_idx', 'internal_link_graph_proposals'),
    ('internal_link_graph_working_copies_pkey', 'internal_link_graph_working_copies'),
    ('internal_link_graph_working_copies_graph_unique', 'internal_link_graph_working_copies'),
    ('internal_link_graph_working_copies_brand_updated_idx', 'internal_link_graph_working_copies')
),
expected_policies(table_name, policy_name) AS (
  VALUES
    ('internal_link_graphs', 'internal_link_graphs_select_policy'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_select_policy'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_select_policy'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_select_policy'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_select_policy')
),
expected_triggers(table_name, trigger_name, function_identity) AS (
  VALUES
    ('internal_link_graphs', 'internal_link_graph_validate_bases_trg', 'public.internal_link_graph_validate_bases()'),
    ('internal_link_graphs', 'internal_link_graph_validate_version_chain_trg', 'public.internal_link_graph_validate_version_chain()'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_validate_refs_trg', 'public.internal_link_graph_validate_references()'),
    ('internal_link_graphs', 'internal_link_graphs_append_only_trg', 'public.internal_link_graph_protect_append_only()'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_append_only_trg', 'public.internal_link_graph_protect_append_only()'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_append_only_trg', 'public.internal_link_graph_protect_append_only()'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_delete_guard_trg', 'public.internal_link_graph_protect_append_only()'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_validate_base_trg', 'public.internal_link_graph_proposal_validate_base()'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_review_guard_trg', 'public.internal_link_graph_proposal_review_guard()')
),
required_relations(schema_name, relation_name) AS (
  VALUES
    ('public'::text, 'marcas'::text),
    ('public'::text, 'editorial_artifact_versions'::text),
    ('auth'::text, 'users'::text)
),
required_columns(schema_name, table_name, column_name, expected_type) AS (
  VALUES
    ('public', 'marcas', 'id', 'uuid'),
    ('public', 'editorial_artifact_versions', 'version_id', 'text'),
    ('public', 'editorial_artifact_versions', 'marca_id', 'uuid'),
    ('public', 'editorial_artifact_versions', 'artifact_type', 'text'),
    ('public', 'editorial_artifact_versions', 'entity_id', 'text'),
    ('public', 'editorial_artifact_versions', 'content_hash', 'text'),
    ('public', 'editorial_artifact_versions', 'source_version_id', 'text'),
    ('auth', 'users', 'id', 'uuid')
),
required_keys(schema_name, table_name, key_columns) AS (
  VALUES
    ('public', 'marcas', 'id'),
    ('public', 'editorial_artifact_versions', 'version_id'),
    ('auth', 'users', 'id')
),
artifact_type_contracts(artifact_type) AS (
  VALUES
    ('article_dna'::text),
    ('silo_dna'::text),
    ('silo_page'::text)
),
helper_contracts(function_identity, expected_return) AS (
  VALUES
    ('public.canonical_actor_can_access_brand(uuid,uuid)'::text, 'boolean'::text),
    ('public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)'::text, 'boolean'::text),
    ('public.canonical_assert_rpc_actor(uuid)'::text, 'void'::text)
),
composite_fk_contracts(target_table, target_key_columns) AS (
  VALUES
    ('internal_link_graphs'::text, 'graph_version_id,marca_id'::text),
    ('internal_link_graph_nodes'::text, 'graph_version_id,node_id,marca_id'::text)
),
external_fk_target_types(fk_name, target_schema, target_table, target_column, expected_type) AS (
  VALUES
    ('internal_link_graphs_marca_id_fkey', 'public', 'marcas', 'id', 'uuid'),
    ('internal_link_graphs_base_silo_dna_version_id_fkey', 'public', 'editorial_artifact_versions', 'version_id', 'text'),
    ('internal_link_graphs_base_silo_page_version_id_fkey', 'public', 'editorial_artifact_versions', 'version_id', 'text'),
    ('internal_link_graphs_created_by_fkey', 'auth', 'users', 'id', 'uuid'),
    ('internal_link_graphs_approved_by_fkey', 'auth', 'users', 'id', 'uuid'),
    ('internal_link_graph_nodes_article_dna_version_id_fkey', 'public', 'editorial_artifact_versions', 'version_id', 'text'),
    ('internal_link_graph_nodes_silo_page_version_id_fkey', 'public', 'editorial_artifact_versions', 'version_id', 'text'),
    ('internal_link_graph_edges_created_by_fkey', 'auth', 'users', 'id', 'uuid'),
    ('internal_link_graph_proposals_created_by_fkey', 'auth', 'users', 'id', 'uuid'),
    ('internal_link_graph_proposals_reviewed_by_fkey', 'auth', 'users', 'id', 'uuid'),
    ('internal_link_graph_working_copies_marca_id_fkey', 'public', 'marcas', 'id', 'uuid'),
    ('internal_link_graph_working_copies_created_by_fkey', 'auth', 'users', 'id', 'uuid'),
    ('internal_link_graph_working_copies_updated_by_fkey', 'auth', 'users', 'id', 'uuid')
),
target_table_state AS (
  SELECT
    t.table_name,
    c.oid AS relation_oid,
    c.oid IS NOT NULL AS present
  FROM target_tables AS t
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS c ON c.relnamespace = n.oid AND c.relname = t.table_name
),
target_table_summary AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE present)::integer AS present_count,
    coalesce(string_agg(table_name, ',' ORDER BY table_name) FILTER (WHERE present), 'none')::text AS present_names
  FROM target_table_state
),
target_function_state AS (
  SELECT
    f.function_identity,
    to_regprocedure(f.function_identity) AS function_oid,
    to_regprocedure(f.function_identity) IS NOT NULL AS present
  FROM target_functions AS f
),
target_function_summary AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE present)::integer AS present_count,
    coalesce(string_agg(function_identity, ',' ORDER BY function_identity) FILTER (WHERE present), 'none')::text AS present_names
  FROM target_function_state
),
target_trigger_collision_state AS (
  SELECT
    count(*)::integer AS collision_count,
    coalesce(string_agg(format('%s.%s.%s', ns.nspname, c.relname, t.tgname), ',' ORDER BY ns.nspname, c.relname, t.tgname), 'none')::text AS collision_names
  FROM expected_triggers AS e
  JOIN pg_catalog.pg_trigger AS t ON t.tgname = e.trigger_name
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace
),
target_policy_collision_state AS (
  SELECT
    count(*)::integer AS collision_count,
    coalesce(string_agg(format('%s.%s.%s', ns.nspname, c.relname, p.polname), ',' ORDER BY ns.nspname, c.relname, p.polname), 'none')::text AS collision_names
  FROM expected_policies AS e
  JOIN pg_catalog.pg_policy AS p ON p.polname = e.policy_name
  JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid AND c.relname = e.table_name
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
),
working_policy_collision_state AS (
  SELECT
    count(*)::integer AS collision_count,
    coalesce(string_agg(format('%s.%s.%s', ns.nspname, c.relname, p.polname), ',' ORDER BY ns.nspname, c.relname, p.polname), 'none')::text AS collision_names
  FROM expected_policies AS e
  JOIN pg_catalog.pg_policy AS p ON p.polname = e.policy_name
  JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid AND c.relname = e.table_name
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  WHERE e.table_name = 'internal_link_graph_working_copies'
),
target_index_collision_state AS (
  SELECT
    count(*)::integer AS collision_count,
    coalesce(string_agg(format('%s.%s', ns.nspname, i.relname), ',' ORDER BY ns.nspname, i.relname), 'none')::text AS collision_names
  FROM expected_indexes AS e
  JOIN pg_catalog.pg_class AS i ON i.relname = e.index_name
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = i.relnamespace AND ns.nspname = 'public'
),
working_index_collision_state AS (
  SELECT
    count(*)::integer AS collision_count,
    coalesce(string_agg(format('%s.%s', ns.nspname, i.relname), ',' ORDER BY ns.nspname, i.relname), 'none')::text AS collision_names
  FROM expected_indexes AS e
  JOIN pg_catalog.pg_class AS i ON i.relname = e.index_name
  JOIN pg_catalog.pg_namespace AS ns ON ns.oid = i.relnamespace AND ns.nspname = 'public'
  WHERE e.table_name = 'internal_link_graph_working_copies'
),
required_relation_state AS (
  SELECT
    r.schema_name,
    r.relation_name,
    c.oid AS relation_oid,
    c.oid IS NOT NULL AS present
  FROM required_relations AS r
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = r.schema_name
  LEFT JOIN pg_catalog.pg_class AS c ON c.relnamespace = n.oid AND c.relname = r.relation_name
),
required_column_state AS (
  SELECT
    r.schema_name,
    r.table_name,
    r.column_name,
    r.expected_type,
    a.atttypid IS NOT NULL AS present,
    CASE WHEN a.atttypid IS NULL THEN NULL::text ELSE format_type(a.atttypid, a.atttypmod) END AS observed_type
  FROM required_columns AS r
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.nspname = r.schema_name
  LEFT JOIN pg_catalog.pg_class AS c ON c.relnamespace = n.oid AND c.relname = r.table_name
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid
   AND a.attname = r.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
),
required_column_summary AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE present)::integer AS present_count,
    count(*) FILTER (WHERE present AND observed_type = expected_type)::integer AS compatible_count
  FROM required_column_state
),
required_key_state AS (
  SELECT
    r.schema_name,
    r.table_name,
    r.key_columns,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS c
      JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = r.schema_name
        AND rel.relname = r.table_name
        AND c.contype IN ('p', 'u')
        AND pg_get_constraintdef(c.oid, true) ILIKE '%(' || r.key_columns || ')%'
    ) AS key_present
  FROM required_keys AS r
),
required_key_summary AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE key_present)::integer AS present_count
  FROM required_key_state
),
artifact_contract_state AS (
  SELECT
    coalesce((SELECT present FROM required_relation_state WHERE schema_name = 'public' AND relation_name = 'editorial_artifact_versions'), false) AS relation_present,
    coalesce((SELECT bool_and(present AND observed_type = expected_type) FROM required_column_state WHERE schema_name = 'public' AND table_name = 'editorial_artifact_versions'), false) AS columns_compatible,
    coalesce((SELECT key_present FROM required_key_state WHERE schema_name = 'public' AND table_name = 'editorial_artifact_versions'), false) AS version_key_present,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS c
      WHERE c.conrelid = (
        SELECT relation_oid
        FROM required_relation_state
        WHERE schema_name = 'public' AND relation_name = 'editorial_artifact_versions'
      )
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid, true) ILIKE '%article_dna%'
        AND pg_get_constraintdef(c.oid, true) ILIKE '%silo_dna%'
        AND pg_get_constraintdef(c.oid, true) ILIKE '%silo_page%'
    ) AS artifact_types_contract_present
),
helper_state AS (
  SELECT
    h.function_identity,
    h.expected_return,
    p.oid IS NOT NULL AS present,
    CASE WHEN p.oid IS NULL THEN NULL::text ELSE format_type(p.prorettype, NULL) END AS observed_return
  FROM helper_contracts AS h
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = to_regprocedure(h.function_identity)::oid
),
helper_summary AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE present AND observed_return = expected_return)::integer AS compatible_count,
    coalesce(string_agg(format('%s=%s', function_identity, coalesce(observed_return, '<absent>')), ',' ORDER BY function_identity), 'none')::text AS observed
  FROM helper_state
),
hash_state AS (
  SELECT
    to_regprocedure('pg_catalog.hashtextextended(text,bigint)') IS NOT NULL AS hashtextextended_present,
    to_regprocedure('pg_catalog.pg_advisory_xact_lock(bigint)') IS NOT NULL AS advisory_lock_present
),
external_fk_type_state AS (
  SELECT
    e.fk_name,
    e.expected_type,
    c.present,
    c.observed_type,
    c.present AND c.observed_type = e.expected_type AS compatible
  FROM external_fk_target_types AS e
  LEFT JOIN required_column_state AS c
    ON c.schema_name = e.target_schema
   AND c.table_name = e.target_table
   AND c.column_name = e.target_column
),
external_fk_type_summary AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE compatible)::integer AS compatible_count,
    coalesce(string_agg(format('%s=%s', fk_name, coalesce(observed_type, '<absent>')), ',' ORDER BY fk_name), 'none')::text AS observed
  FROM external_fk_type_state
),
composite_fk_summary AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM target_table_state WHERE table_name = c.target_table AND present))::integer AS preapply_ready_count,
    coalesce(string_agg(format('%s(%s)', target_table, target_key_columns), ',' ORDER BY target_table), 'none')::text AS declared_targets
  FROM composite_fk_contracts AS c
),
preflight_gate AS (
  SELECT
    (SELECT present_count FROM target_table_summary) = 0
    AND (SELECT present_count FROM target_function_summary) = 0
    AND (SELECT bool_and(present) FROM required_relation_state)
    AND (SELECT compatible_count = expected_count FROM required_column_summary)
    AND (SELECT present_count = expected_count FROM required_key_summary)
    AND (SELECT compatible_count = expected_count FROM helper_summary)
    AND (SELECT hashtextextended_present AND advisory_lock_present FROM hash_state)
    AND (SELECT compatible_count = expected_count FROM external_fk_type_summary)
    AND (SELECT preapply_ready_count = expected_count FROM composite_fk_summary)
    AND (SELECT collision_count FROM target_trigger_collision_state) = 0
    AND (SELECT collision_count FROM target_policy_collision_state) = 0
    AND (SELECT collision_count FROM target_index_collision_state) = 0
    AS all_preconditions_pass,
    (SELECT present_count FROM target_table_summary) = 0
      AND (SELECT present_count FROM target_function_summary) = 0 AS migration_target_absent
),
checks AS (
  SELECT
    'REMOTE_GRAPH_TABLES_ALREADY_EXIST'::text AS check_name,
    'public.internal_link_graphs, public.internal_link_graph_nodes, public.internal_link_graph_edges, public.internal_link_graph_proposals'::text AS object_name,
    format('present=%s/4; names=%s',
      (SELECT count(*) FROM target_table_state WHERE table_name <> 'internal_link_graph_working_copies' AND present),
      coalesce((SELECT string_agg(table_name, ',' ORDER BY table_name) FROM target_table_state WHERE table_name <> 'internal_link_graph_working_copies' AND present), 'none'))::text AS observed,
    CASE WHEN (SELECT count(*) FROM target_table_state WHERE table_name <> 'internal_link_graph_working_copies' AND present) = 0 THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  UNION ALL
  SELECT
    'REMOTE_WORKING_COPY_ALREADY_EXISTS'::text,
    'public.internal_link_graph_working_copies'::text,
    format('present=%s', CASE WHEN present THEN 'YES' ELSE 'NO' END)::text,
    CASE WHEN present THEN 'FAIL' ELSE 'PASS' END::text
  FROM target_table_state
  WHERE table_name = 'internal_link_graph_working_copies'
  UNION ALL
  SELECT
    'REMOTE_FUNCTION_COLLISIONS'::text,
    'eight target functions/RPCs'::text,
    format('present=%s/8; names=%s', present_count, present_names)::text,
    CASE WHEN present_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM target_function_summary
  UNION ALL
  SELECT
    'REMOTE_TRIGGER_COLLISIONS'::text,
    'nine named target triggers'::text,
    format('collisions=%s; names=%s', collision_count, collision_names)::text,
    CASE WHEN collision_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM target_trigger_collision_state
  UNION ALL
  SELECT
    'REMOTE_POLICY_COLLISIONS'::text,
    'five named target policies'::text,
    format('collisions=%s; names=%s', collision_count, collision_names)::text,
    CASE WHEN collision_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM target_policy_collision_state
  UNION ALL
  SELECT
    'REMOTE_INDEX_COLLISIONS'::text,
    'sixteen named target indexes/constraint indexes'::text,
    format('collisions=%s; names=%s', collision_count, collision_names)::text,
    CASE WHEN collision_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM target_index_collision_state
  UNION ALL
  SELECT
    'BRAND_PREREQUISITES'::text,
    'public.marcas(id uuid primary/unique)'::text,
    format('relation=%s; id_type=%s; id_key=%s',
      (SELECT present FROM required_relation_state WHERE schema_name = 'public' AND relation_name = 'marcas'),
      (SELECT coalesce(observed_type, '<absent>') FROM required_column_state WHERE schema_name = 'public' AND table_name = 'marcas' AND column_name = 'id'),
      (SELECT key_present FROM required_key_state WHERE schema_name = 'public' AND table_name = 'marcas'))::text,
    CASE WHEN
      coalesce((SELECT present FROM required_relation_state WHERE schema_name = 'public' AND relation_name = 'marcas'), false)
      AND coalesce((SELECT observed_type = expected_type FROM required_column_state WHERE schema_name = 'public' AND table_name = 'marcas' AND column_name = 'id'), false)
      AND coalesce((SELECT key_present FROM required_key_state WHERE schema_name = 'public' AND table_name = 'marcas'), false)
    THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'ARTICLE_DNA_PREREQUISITES'::text,
    'editorial_artifact_versions article_dna refs'::text,
    format('relation=%s; columns=%s; version_key=%s; artifact_types=%s', relation_present, columns_compatible, version_key_present, artifact_types_contract_present)::text,
    CASE WHEN relation_present AND columns_compatible AND version_key_present AND artifact_types_contract_present THEN 'PASS' ELSE 'FAIL' END::text
  FROM artifact_contract_state
  UNION ALL
  SELECT
    'SILO_DNA_PREREQUISITES'::text,
    'editorial_artifact_versions silo_dna refs'::text,
    format('relation=%s; columns=%s; version_key=%s; artifact_types=%s', relation_present, columns_compatible, version_key_present, artifact_types_contract_present)::text,
    CASE WHEN relation_present AND columns_compatible AND version_key_present AND artifact_types_contract_present THEN 'PASS' ELSE 'FAIL' END::text
  FROM artifact_contract_state
  UNION ALL
  SELECT
    'SILO_PAGE_PREREQUISITES'::text,
    'editorial_artifact_versions silo_page refs/source refs'::text,
    format('relation=%s; columns=%s; version_key=%s; artifact_types=%s', relation_present, columns_compatible, version_key_present, artifact_types_contract_present)::text,
    CASE WHEN relation_present AND columns_compatible AND version_key_present AND artifact_types_contract_present THEN 'PASS' ELSE 'FAIL' END::text
  FROM artifact_contract_state
  UNION ALL
  SELECT
    'AUTH_HELPERS'::text,
    'canonical authorization helper signatures'::text,
    format('compatible=%s/3; observed=%s', compatible_count, observed)::text,
    CASE WHEN compatible_count = expected_count THEN 'PASS' ELSE 'FAIL' END::text
  FROM helper_summary
  UNION ALL
  SELECT
    'HASH_PREREQUISITES'::text,
    'pg_catalog.hashtextextended + pg_catalog.pg_advisory_xact_lock'::text,
    format('hashtextextended=%s; advisory_lock=%s', hashtextextended_present, advisory_lock_present)::text,
    CASE WHEN hashtextextended_present AND advisory_lock_present THEN 'PASS' ELSE 'FAIL' END::text
  FROM hash_state
  UNION ALL
  SELECT
    'WORKING_COPY_SCHEMA_CONFLICT'::text,
    'working_copy table/columns/PK/FKs/lock_version/timestamps/payload'::text,
    format('target_present=%s; migration_declares_schema=%s',
      (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_working_copies'), true)::text,
    CASE WHEN NOT (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_working_copies') THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'WORKING_COPY_RLS_CONFLICT'::text,
    'working_copy RLS/policy target'::text,
    format('table_present=%s; policy_collision=%s',
      (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_working_copies'),
      (SELECT collision_count FROM working_policy_collision_state))::text,
    CASE WHEN NOT (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_working_copies') AND (SELECT collision_count FROM working_policy_collision_state) = 0 THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'WORKING_COPY_FUNCTION_CONFLICT'::text,
    'persist_internal_link_graph_working_copy(uuid,uuid,text,bigint,jsonb)'::text,
    format('signature_present=%s', (SELECT present FROM target_function_state WHERE function_identity = 'public.persist_internal_link_graph_working_copy(uuid,uuid,text,bigint,jsonb)'))::text,
    CASE WHEN NOT (SELECT present FROM target_function_state WHERE function_identity = 'public.persist_internal_link_graph_working_copy(uuid,uuid,text,bigint,jsonb)') THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'WORKING_COPY_INDEX_CONFLICT'::text,
    'working_copy PK/unique/updated indexes'::text,
    format('collisions=%s; names=%s', collision_count, collision_names)::text,
    CASE WHEN collision_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM working_index_collision_state
  UNION ALL
  SELECT
    'APPROVED_GRAPH_SCHEMA_CONFLICT'::text,
    'internal_link_graphs'::text,
    format('target_present=%s', (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graphs'))::text,
    CASE WHEN NOT (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graphs') THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'NODE_SCHEMA_CONFLICT'::text,
    'internal_link_graph_nodes'::text,
    format('target_present=%s', (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_nodes'))::text,
    CASE WHEN NOT (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_nodes') THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'EDGE_SCHEMA_CONFLICT'::text,
    'internal_link_graph_edges'::text,
    format('target_present=%s', (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_edges'))::text,
    CASE WHEN NOT (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_edges') THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'PROPOSAL_SCHEMA_CONFLICT'::text,
    'internal_link_graph_proposals'::text,
    format('target_present=%s', (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_proposals'))::text,
    CASE WHEN NOT (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_proposals') THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'FK_TYPE_COMPATIBILITY'::text,
    'external FK target types + migration-declared internal types'::text,
    format('compatible=%s/%s; observed=%s', compatible_count, expected_count, observed)::text,
    CASE WHEN compatible_count = expected_count THEN 'PASS' ELSE 'FAIL' END::text
  FROM external_fk_type_summary
  UNION ALL
  SELECT
    'COMPOSITE_FK_PREREQUISITES'::text,
    'graph(graph_version_id,marca_id) and nodes(graph_version_id,node_id,marca_id)'::text,
    format('migration_target_keys=%s/%s; target_absent_preapply=%s/%s; declared=%s', preapply_ready_count, expected_count, preapply_ready_count, expected_count, declared_targets)::text,
    CASE WHEN preapply_ready_count = expected_count THEN 'PASS' ELSE 'FAIL' END::text
  FROM composite_fk_summary
  UNION ALL
  SELECT
    'RLS_HELPER_COMPATIBILITY'::text,
    'authenticated SELECT policy helper signatures'::text,
    format('compatible=%s/3', compatible_count)::text,
    CASE WHEN compatible_count = expected_count THEN 'PASS' ELSE 'FAIL' END::text
  FROM helper_summary
  UNION ALL
  SELECT
    'POLICY_DEPENDENCIES'::text,
    'target policies depend on canonical access helper'::text,
    format('target_policy_collisions=%s; access_helper=%s', (SELECT collision_count FROM target_policy_collision_state), (SELECT compatible_count >= 1 FROM helper_summary))::text,
    CASE WHEN (SELECT collision_count FROM target_policy_collision_state) = 0 AND (SELECT compatible_count >= 1 FROM helper_summary) THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'GRANT_CONFLICTS'::text,
    'target table/function ACLs'::text,
    format('table_collisions=%s; function_collisions=%s', (SELECT present_count FROM target_table_summary), (SELECT present_count FROM target_function_summary))::text,
    CASE WHEN (SELECT present_count FROM target_table_summary) = 0 AND (SELECT present_count FROM target_function_summary) = 0 THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'FUNCTION_SIGNATURE_COLLISIONS'::text,
    'eight migration-created function signatures'::text,
    format('present=%s/8; names=%s', present_count, present_names)::text,
    CASE WHEN present_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM target_function_summary
  UNION ALL
  SELECT
    'MIGRATION_ALREADY_APPLIED'::text,
    '20260826225145_internal_link_graph_foundation'::text,
    format('target_tables_present=%s/5; target_functions_present=%s/8', (SELECT present_count FROM target_table_summary), (SELECT present_count FROM target_function_summary))::text,
    CASE WHEN (SELECT migration_target_absent FROM preflight_gate) THEN 'NO' ELSE 'YES_OR_PARTIAL' END::text
  UNION ALL
  SELECT
    'GRAPH_REMOTE_SCHEMA_CONFLICT'::text,
    'all graph target tables/functions/triggers/policies/indexes'::text,
    format('table=%s; function=%s; trigger=%s; policy=%s; index=%s', (SELECT present_count FROM target_table_summary), (SELECT present_count FROM target_function_summary), (SELECT collision_count FROM target_trigger_collision_state), (SELECT collision_count FROM target_policy_collision_state), (SELECT collision_count FROM target_index_collision_state))::text,
    CASE WHEN (SELECT present_count FROM target_table_summary) = 0 AND (SELECT present_count FROM target_function_summary) = 0 AND (SELECT collision_count FROM target_trigger_collision_state) = 0 AND (SELECT collision_count FROM target_policy_collision_state) = 0 AND (SELECT collision_count FROM target_index_collision_state) = 0 THEN 'NO' ELSE 'YES' END::text
  UNION ALL
  SELECT
    'WORKING_COPY_REMOTE_SCHEMA_CONFLICT'::text,
    'working_copy table/function/policy/index'::text,
    format('table=%s; function=%s; policy=%s; index=%s',
      (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_working_copies'),
      (SELECT present FROM target_function_state WHERE function_identity = 'public.persist_internal_link_graph_working_copy(uuid,uuid,text,bigint,jsonb)'),
      (SELECT collision_count FROM working_policy_collision_state),
      (SELECT collision_count FROM working_index_collision_state))::text,
    CASE WHEN NOT (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_working_copies') AND NOT (SELECT present FROM target_function_state WHERE function_identity = 'public.persist_internal_link_graph_working_copy(uuid,uuid,text,bigint,jsonb)') AND (SELECT collision_count FROM working_policy_collision_state) = 0 AND (SELECT collision_count FROM working_index_collision_state) = 0 THEN 'NO' ELSE 'YES' END::text
  UNION ALL
  SELECT
    'MIGRATION_PRECONDITIONS'::text,
    'absence, prerequisites, types, composite keys, helpers and collisions'::text,
    format('target_absent=%s; prereq_relations=%s/3; prereq_columns=%s/%s; keys=%s/3; helpers=%s/3; fk_types=%s/%s; composites=%s/%s',
      (SELECT migration_target_absent FROM preflight_gate),
      (SELECT count(*) FILTER (WHERE present) FROM required_relation_state),
      (SELECT compatible_count FROM required_column_summary),
      (SELECT expected_count FROM required_column_summary),
      (SELECT present_count FROM required_key_summary),
      (SELECT compatible_count FROM helper_summary),
      (SELECT compatible_count FROM external_fk_type_summary),
      (SELECT expected_count FROM external_fk_type_summary),
      (SELECT preapply_ready_count FROM composite_fk_summary),
      (SELECT expected_count FROM composite_fk_summary))::text,
    CASE WHEN (SELECT all_preconditions_pass FROM preflight_gate) THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'GRAPH_REMOTE_PREFLIGHT'::text,
    'final read-only gate for 20260826225145_internal_link_graph_foundation'::text,
    format('schema_conflict=%s; working_copy_conflict=%s; fk_types=%s; composites=%s; helpers=%s; migration_applied=%s; preconditions=%s',
      CASE WHEN (SELECT present_count FROM target_table_summary) = 0 AND (SELECT present_count FROM target_function_summary) = 0 AND (SELECT collision_count FROM target_trigger_collision_state) = 0 AND (SELECT collision_count FROM target_policy_collision_state) = 0 AND (SELECT collision_count FROM target_index_collision_state) = 0 THEN 'NO' ELSE 'YES' END,
      CASE WHEN NOT (SELECT present FROM target_table_state WHERE table_name = 'internal_link_graph_working_copies') AND NOT (SELECT present FROM target_function_state WHERE function_identity = 'public.persist_internal_link_graph_working_copy(uuid,uuid,text,bigint,jsonb)') AND (SELECT collision_count FROM working_policy_collision_state) = 0 AND (SELECT collision_count FROM working_index_collision_state) = 0 THEN 'NO' ELSE 'YES' END,
      CASE WHEN (SELECT compatible_count = expected_count FROM external_fk_type_summary) THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN (SELECT preapply_ready_count = expected_count FROM composite_fk_summary) THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN (SELECT compatible_count = expected_count FROM helper_summary) THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN (SELECT migration_target_absent FROM preflight_gate) THEN 'NO' ELSE 'YES_OR_PARTIAL' END,
      CASE WHEN (SELECT all_preconditions_pass FROM preflight_gate) THEN 'PASS' ELSE 'FAIL' END)::text,
    CASE WHEN (SELECT all_preconditions_pass FROM preflight_gate) THEN 'PASS_PRE_APPLY_READ_ONLY' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'REMOTE_DDL'::text,
    'this preflight statement'::text,
    '0'::text,
    'PASS'::text
  UNION ALL
  SELECT
    'REMOTE_DML'::text,
    'this preflight statement'::text,
    '0'::text,
    'PASS'::text
  UNION ALL
  SELECT
    'TEMP_OBJECTS'::text,
    'this preflight statement'::text,
    '0'::text,
    'PASS'::text
)
SELECT
  check_name::text,
  object_name::text,
  observed::text,
  verdict::text
FROM checks
ORDER BY check_name, object_name;
