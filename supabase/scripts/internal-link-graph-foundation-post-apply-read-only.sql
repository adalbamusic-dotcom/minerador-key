-- InternalLinkGraph foundation: readback pós-apply, somente leitura.
--
-- Este script não aplica migration, não cria fixtures e não altera o banco.
-- Ele confirma o contrato estrutural da migration
-- 20260826225145_internal_link_graph_foundation.sql.

WITH
target_tables(table_name) AS (
  VALUES
    ('internal_link_graphs'::text),
    ('internal_link_graph_working_copies'::text),
    ('internal_link_graph_nodes'::text),
    ('internal_link_graph_edges'::text),
    ('internal_link_graph_proposals'::text)
),
target_functions(signature, expected_result, expected_service_execute) AS (
  VALUES
    ('public.internal_link_graph_validate_references()'::text, 'trigger'::text, false),
    ('public.internal_link_graph_validate_bases()'::text, 'trigger'::text, false),
    ('public.internal_link_graph_protect_append_only()'::text, 'trigger'::text, false),
    ('public.internal_link_graph_validate_version_chain()'::text, 'trigger'::text, false),
    ('public.internal_link_graph_proposal_review_guard()'::text, 'trigger'::text, false),
    ('public.internal_link_graph_proposal_validate_base()'::text, 'trigger'::text, false),
    ('public.persist_internal_link_graph(uuid,uuid,text,jsonb)'::text, 'jsonb'::text, true),
    ('public.persist_internal_link_graph_working_copy(uuid,uuid,text,bigint,jsonb)'::text, 'jsonb'::text, true)
),
expected_columns(table_name, column_name, expected_type, expected_nullable) AS (
  VALUES
    ('internal_link_graphs', 'graph_version_id', 'text', false),
    ('internal_link_graphs', 'graph_id', 'text', false),
    ('internal_link_graphs', 'marca_id', 'uuid', false),
    ('internal_link_graphs', 'silo_id', 'text', false),
    ('internal_link_graphs', 'base_silo_dna_version_id', 'text', false),
    ('internal_link_graphs', 'base_silo_dna_content_hash', 'text', false),
    ('internal_link_graphs', 'base_silo_page_version_id', 'text', false),
    ('internal_link_graphs', 'base_silo_page_content_hash', 'text', false),
    ('internal_link_graphs', 'participating_article_dna_version_refs', 'jsonb', false),
    ('internal_link_graphs', 'version_number', 'integer', false),
    ('internal_link_graphs', 'previous_graph_version_id', 'text', true),
    ('internal_link_graphs', 'workflow_status', 'text', false),
    ('internal_link_graphs', 'basis_hash', 'text', false),
    ('internal_link_graphs', 'content_hash', 'text', false),
    ('internal_link_graphs', 'created_by', 'uuid', false),
    ('internal_link_graphs', 'created_at', 'timestamp with time zone', false),
    ('internal_link_graphs', 'approved_by', 'uuid', true),
    ('internal_link_graphs', 'approved_at', 'timestamp with time zone', true),
    ('internal_link_graphs', 'metadata', 'jsonb', false),
    ('internal_link_graphs', 'warnings', 'jsonb', false),
    ('internal_link_graphs', 'conflicts', 'jsonb', false),
    ('internal_link_graph_working_copies', 'working_copy_id', 'text', false),
    ('internal_link_graph_working_copies', 'graph_id', 'text', false),
    ('internal_link_graph_working_copies', 'marca_id', 'uuid', false),
    ('internal_link_graph_working_copies', 'silo_id', 'text', false),
    ('internal_link_graph_working_copies', 'base_graph_version_id', 'text', true),
    ('internal_link_graph_working_copies', 'base_graph_content_hash', 'text', true),
    ('internal_link_graph_working_copies', 'basis_hash', 'text', false),
    ('internal_link_graph_working_copies', 'content_hash', 'text', false),
    ('internal_link_graph_working_copies', 'working_copy_payload', 'jsonb', false),
    ('internal_link_graph_working_copies', 'created_by', 'uuid', false),
    ('internal_link_graph_working_copies', 'created_at', 'timestamp with time zone', false),
    ('internal_link_graph_working_copies', 'updated_by', 'uuid', false),
    ('internal_link_graph_working_copies', 'updated_at', 'timestamp with time zone', false),
    ('internal_link_graph_working_copies', 'lock_version', 'bigint', false),
    ('internal_link_graph_nodes', 'graph_version_id', 'text', false),
    ('internal_link_graph_nodes', 'node_id', 'text', false),
    ('internal_link_graph_nodes', 'marca_id', 'uuid', false),
    ('internal_link_graph_nodes', 'node_type', 'text', false),
    ('internal_link_graph_nodes', 'article_dna_version_id', 'text', true),
    ('internal_link_graph_nodes', 'article_dna_content_hash', 'text', true),
    ('internal_link_graph_nodes', 'silo_page_version_id', 'text', true),
    ('internal_link_graph_nodes', 'silo_page_content_hash', 'text', true),
    ('internal_link_graph_nodes', 'architectural_role', 'text', true),
    ('internal_link_graph_nodes', 'snapshot', 'jsonb', false),
    ('internal_link_graph_edges', 'graph_version_id', 'text', false),
    ('internal_link_graph_edges', 'edge_id', 'text', false),
    ('internal_link_graph_edges', 'marca_id', 'uuid', false),
    ('internal_link_graph_edges', 'source_node_id', 'text', false),
    ('internal_link_graph_edges', 'target_node_id', 'text', false),
    ('internal_link_graph_edges', 'relation_type', 'text', false),
    ('internal_link_graph_edges', 'reason', 'text', false),
    ('internal_link_graph_edges', 'priority', 'text', false),
    ('internal_link_graph_edges', 'anchor_concepts', 'jsonb', false),
    ('internal_link_graph_edges', 'origin', 'text', false),
    ('internal_link_graph_edges', 'created_by', 'uuid', false),
    ('internal_link_graph_edges', 'created_at', 'timestamp with time zone', false),
    ('internal_link_graph_edges', 'provenance', 'jsonb', false),
    ('internal_link_graph_proposals', 'proposal_id', 'text', false),
    ('internal_link_graph_proposals', 'graph_id', 'text', false),
    ('internal_link_graph_proposals', 'marca_id', 'uuid', false),
    ('internal_link_graph_proposals', 'base_graph_version_id', 'text', false),
    ('internal_link_graph_proposals', 'base_graph_content_hash', 'text', false),
    ('internal_link_graph_proposals', 'input_hash', 'text', false),
    ('internal_link_graph_proposals', 'output_hash', 'text', true),
    ('internal_link_graph_proposals', 'proposal_payload', 'jsonb', false),
    ('internal_link_graph_proposals', 'review_status', 'text', false),
    ('internal_link_graph_proposals', 'created_by', 'uuid', false),
    ('internal_link_graph_proposals', 'created_at', 'timestamp with time zone', false),
    ('internal_link_graph_proposals', 'reviewed_by', 'uuid', true),
    ('internal_link_graph_proposals', 'reviewed_at', 'timestamp with time zone', true),
    ('internal_link_graph_proposals', 'review_note', 'text', true),
    ('internal_link_graph_proposals', 'ai_execution_ref', 'text', true)
),
expected_primary_keys(table_name, constraint_name, definition) AS (
  VALUES
    ('internal_link_graphs', 'internal_link_graphs_pkey', 'PRIMARY KEY (graph_version_id)'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_pkey', 'PRIMARY KEY (working_copy_id)'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_pkey', 'PRIMARY KEY (graph_version_id, node_id)'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_pkey', 'PRIMARY KEY (graph_version_id, edge_id)'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_pkey', 'PRIMARY KEY (proposal_id)')
),
expected_unique_constraints(table_name, constraint_name) AS (
  VALUES
    ('internal_link_graphs', 'internal_link_graphs_brand_version_unique'),
    ('internal_link_graphs', 'internal_link_graphs_identity_version_unique'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_graph_unique'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_graph_brand_node_unique'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_directed_unique'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_brand_id_unique')
),
expected_foreign_keys(constraint_name, source_table, target_schema, target_table, delete_action) AS (
  VALUES
    ('internal_link_graphs_marca_id_fkey', 'internal_link_graphs', 'public', 'marcas', 'RESTRICT'),
    ('internal_link_graphs_base_silo_dna_version_id_fkey', 'internal_link_graphs', 'public', 'editorial_artifact_versions', 'RESTRICT'),
    ('internal_link_graphs_base_silo_page_version_id_fkey', 'internal_link_graphs', 'public', 'editorial_artifact_versions', 'RESTRICT'),
    ('internal_link_graphs_previous_graph_version_id_fkey', 'internal_link_graphs', 'public', 'internal_link_graphs', 'RESTRICT'),
    ('internal_link_graphs_created_by_fkey', 'internal_link_graphs', 'auth', 'users', 'RESTRICT'),
    ('internal_link_graphs_approved_by_fkey', 'internal_link_graphs', 'auth', 'users', 'RESTRICT'),
    ('internal_link_graph_working_copies_marca_id_fkey', 'internal_link_graph_working_copies', 'public', 'marcas', 'RESTRICT'),
    ('internal_link_graph_working_copies_base_graph_fk', 'internal_link_graph_working_copies', 'public', 'internal_link_graphs', 'RESTRICT'),
    ('internal_link_graph_working_copies_created_by_fkey', 'internal_link_graph_working_copies', 'auth', 'users', 'RESTRICT'),
    ('internal_link_graph_working_copies_updated_by_fkey', 'internal_link_graph_working_copies', 'auth', 'users', 'RESTRICT'),
    ('internal_link_graph_nodes_graph_brand_fk', 'internal_link_graph_nodes', 'public', 'internal_link_graphs', 'RESTRICT'),
    ('internal_link_graph_nodes_article_dna_version_id_fkey', 'internal_link_graph_nodes', 'public', 'editorial_artifact_versions', 'RESTRICT'),
    ('internal_link_graph_nodes_silo_page_version_id_fkey', 'internal_link_graph_nodes', 'public', 'editorial_artifact_versions', 'RESTRICT'),
    ('internal_link_graph_edges_graph_brand_fk', 'internal_link_graph_edges', 'public', 'internal_link_graphs', 'RESTRICT'),
    ('internal_link_graph_edges_source_fk', 'internal_link_graph_edges', 'public', 'internal_link_graph_nodes', 'RESTRICT'),
    ('internal_link_graph_edges_target_fk', 'internal_link_graph_edges', 'public', 'internal_link_graph_nodes', 'RESTRICT'),
    ('internal_link_graph_edges_created_by_fkey', 'internal_link_graph_edges', 'auth', 'users', 'RESTRICT'),
    ('internal_link_graph_proposals_graph_fk', 'internal_link_graph_proposals', 'public', 'internal_link_graphs', 'RESTRICT'),
    ('internal_link_graph_proposals_created_by_fkey', 'internal_link_graph_proposals', 'auth', 'users', 'RESTRICT'),
    ('internal_link_graph_proposals_reviewed_by_fkey', 'internal_link_graph_proposals', 'auth', 'users', 'RESTRICT')
),
expected_check_names(table_name, constraint_name) AS (
  VALUES
    ('internal_link_graphs', 'internal_link_graphs_graph_id_check'),
    ('internal_link_graphs', 'internal_link_graphs_silo_id_check'),
    ('internal_link_graphs', 'internal_link_graphs_base_silo_dna_content_hash_check'),
    ('internal_link_graphs', 'internal_link_graphs_base_silo_page_content_hash_check'),
    ('internal_link_graphs', 'internal_link_graphs_participating_article_dna_version_re_check'),
    ('internal_link_graphs', 'internal_link_graphs_version_number_check'),
    ('internal_link_graphs', 'internal_link_graphs_workflow_status_check'),
    ('internal_link_graphs', 'internal_link_graphs_basis_hash_check'),
    ('internal_link_graphs', 'internal_link_graphs_content_hash_check'),
    ('internal_link_graphs', 'internal_link_graphs_metadata_check'),
    ('internal_link_graphs', 'internal_link_graphs_warnings_check'),
    ('internal_link_graphs', 'internal_link_graphs_conflicts_check'),
    ('internal_link_graphs', 'internal_link_graphs_approval_consistency'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_working_copy_id_check'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_graph_id_check'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_silo_id_check'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_basis_hash_check'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_content_hash_check'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_lock_version_check'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_payload_ck'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_base_pair_ck'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_node_id_check'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_node_type_check'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_one_reference_ck'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_article_hash_ck'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_page_hash_ck'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_architectural_role_check'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_snapshot_check'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_type_reference_ck'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_edge_id_check'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_relation_type_check'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_reason_check'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_priority_check'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_anchor_concepts_check'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_anchor_concepts_ck'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_origin_check'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_provenance_check'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_no_self_link_ck'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_proposal_id_check'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_graph_id_check'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_base_graph_content_hash_check'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_input_hash_check'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_proposal_payload_check'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_review_status_check'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_review_consistency')
),
expected_indexes(index_name, table_name) AS (
  VALUES
    ('internal_link_graphs_pkey', 'internal_link_graphs'),
    ('internal_link_graphs_brand_version_unique', 'internal_link_graphs'),
    ('internal_link_graphs_identity_version_unique', 'internal_link_graphs'),
    ('internal_link_graphs_brand_silo_version_idx', 'internal_link_graphs'),
    ('internal_link_graph_working_copies_pkey', 'internal_link_graph_working_copies'),
    ('internal_link_graph_working_copies_graph_unique', 'internal_link_graph_working_copies'),
    ('internal_link_graph_working_copies_brand_updated_idx', 'internal_link_graph_working_copies'),
    ('internal_link_graph_nodes_pkey', 'internal_link_graph_nodes'),
    ('internal_link_graph_nodes_graph_brand_node_unique', 'internal_link_graph_nodes'),
    ('internal_link_graph_nodes_brand_lookup_idx', 'internal_link_graph_nodes'),
    ('internal_link_graph_edges_pkey', 'internal_link_graph_edges'),
    ('internal_link_graph_edges_directed_unique', 'internal_link_graph_edges'),
    ('internal_link_graph_edges_brand_id_unique', 'internal_link_graph_edges'),
    ('internal_link_graph_edges_brand_source_idx', 'internal_link_graph_edges'),
    ('internal_link_graph_proposals_pkey', 'internal_link_graph_proposals'),
    ('internal_link_graph_proposals_brand_graph_idx', 'internal_link_graph_proposals')
),
expected_defaults(table_name, column_name, expression) AS (
  VALUES
    ('internal_link_graphs', 'participating_article_dna_version_refs', '''[]''::jsonb'),
    ('internal_link_graphs', 'created_at', 'now()'),
    ('internal_link_graphs', 'metadata', '''{}''::jsonb'),
    ('internal_link_graphs', 'warnings', '''[]''::jsonb'),
    ('internal_link_graphs', 'conflicts', '''[]''::jsonb'),
    ('internal_link_graph_working_copies', 'created_at', 'now()'),
    ('internal_link_graph_working_copies', 'updated_at', 'now()'),
    ('internal_link_graph_working_copies', 'lock_version', '1'),
    ('internal_link_graph_nodes', 'snapshot', '''{}''::jsonb'),
    ('internal_link_graph_edges', 'created_at', 'now()'),
    ('internal_link_graph_proposals', 'created_at', 'now()')
),
expected_triggers(trigger_name, table_name, function_name) AS (
  VALUES
    ('internal_link_graph_validate_bases_trg', 'internal_link_graphs', 'public.internal_link_graph_validate_bases()'),
    ('internal_link_graph_validate_version_chain_trg', 'internal_link_graphs', 'public.internal_link_graph_validate_version_chain()'),
    ('internal_link_graphs_append_only_trg', 'internal_link_graphs', 'public.internal_link_graph_protect_append_only()'),
    ('internal_link_graph_nodes_validate_refs_trg', 'internal_link_graph_nodes', 'public.internal_link_graph_validate_references()'),
    ('internal_link_graph_nodes_append_only_trg', 'internal_link_graph_nodes', 'public.internal_link_graph_protect_append_only()'),
    ('internal_link_graph_edges_append_only_trg', 'internal_link_graph_edges', 'public.internal_link_graph_protect_append_only()'),
    ('internal_link_graph_proposals_delete_guard_trg', 'internal_link_graph_proposals', 'public.internal_link_graph_protect_append_only()'),
    ('internal_link_graph_proposals_validate_base_trg', 'internal_link_graph_proposals', 'public.internal_link_graph_proposal_validate_base()'),
    ('internal_link_graph_proposals_review_guard_trg', 'internal_link_graph_proposals', 'public.internal_link_graph_proposal_review_guard()')
),
expected_policies(table_name, policy_name) AS (
  VALUES
    ('internal_link_graphs', 'internal_link_graphs_select_policy'),
    ('internal_link_graph_working_copies', 'internal_link_graph_working_copies_select_policy'),
    ('internal_link_graph_nodes', 'internal_link_graph_nodes_select_policy'),
    ('internal_link_graph_edges', 'internal_link_graph_edges_select_policy'),
    ('internal_link_graph_proposals', 'internal_link_graph_proposals_select_policy')
),
expected_table_grants(table_name, service_insert, service_update) AS (
  VALUES
    ('internal_link_graphs', true, false),
    ('internal_link_graph_working_copies', true, true),
    ('internal_link_graph_nodes', true, false),
    ('internal_link_graph_edges', true, false),
    ('internal_link_graph_proposals', true, true)
),
relation_state AS (
  SELECT
    t.table_name,
    c.oid,
    c.relkind,
    c.relrowsecurity,
    c.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(c.relowner)::text AS owner_name,
    c.relacl
  FROM target_tables t
  LEFT JOIN pg_catalog.pg_class c
    ON c.relnamespace = 'public'::regnamespace
   AND c.relname = t.table_name
   AND c.relkind IN ('r', 'p')
),
column_state AS (
  SELECT
    e.table_name,
    e.column_name,
    e.expected_type,
    e.expected_nullable,
    a.attname IS NOT NULL AS present,
    CASE WHEN a.attname IS NULL THEN NULL ELSE pg_catalog.format_type(a.atttypid, a.atttypmod) END::text AS actual_type,
    CASE WHEN a.attname IS NULL THEN NULL ELSE NOT a.attnotnull END AS actual_nullable
  FROM expected_columns e
  LEFT JOIN pg_catalog.pg_class r
    ON r.relnamespace = 'public'::regnamespace
   AND r.relname = e.table_name
   AND r.relkind IN ('r', 'p')
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = r.oid
   AND a.attname = e.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
),
constraint_state AS (
  SELECT
    e.constraint_name,
    e.source_table,
    e.target_schema,
    e.target_table,
    e.delete_action,
    c.oid,
    c.convalidated,
    c.condeferrable,
    c.condeferred,
    CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_constraintdef(c.oid, true) END::text AS definition,
    CASE c.confdeltype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE c.confdeltype::text
    END::text AS actual_delete_action,
    target_ns.nspname::text AS actual_target_schema,
    target_rel.relname::text AS actual_target_table,
    source_rel.relname::text AS actual_source_table
  FROM expected_foreign_keys e
  LEFT JOIN pg_catalog.pg_constraint c
    ON c.conname = e.constraint_name
   AND c.conrelid = to_regclass('public.' || e.source_table)::oid
   AND c.contype = 'f'
  LEFT JOIN pg_catalog.pg_class source_rel ON source_rel.oid = c.conrelid
  LEFT JOIN pg_catalog.pg_class target_rel ON target_rel.oid = c.confrelid
  LEFT JOIN pg_catalog.pg_namespace target_ns ON target_ns.oid = target_rel.relnamespace
),
check_state AS (
  SELECT
    e.table_name,
    e.constraint_name,
    c.oid,
    c.convalidated,
    CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_constraintdef(c.oid, true) END::text AS definition
  FROM expected_check_names e
  LEFT JOIN pg_catalog.pg_constraint c
    ON c.conname = e.constraint_name
   AND c.conrelid = to_regclass('public.' || e.table_name)::oid
   AND c.contype = 'c'
),
index_state AS (
  SELECT
    e.index_name,
    e.table_name,
    i.oid,
    ix.indisvalid,
    ix.indisready,
    ix.indisunique,
    ix.indisprimary,
    CASE WHEN i.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_indexdef(i.oid) END::text AS definition
  FROM expected_indexes e
  LEFT JOIN pg_catalog.pg_class r
    ON r.relnamespace = 'public'::regnamespace
   AND r.relname = e.table_name
  LEFT JOIN pg_catalog.pg_class i
    ON i.relnamespace = 'public'::regnamespace
   AND i.relname = e.index_name
  LEFT JOIN pg_catalog.pg_index ix
    ON ix.indrelid = r.oid
   AND ix.indexrelid = i.oid
),
default_state AS (
  SELECT
    e.table_name,
    e.column_name,
    e.expression AS expected_expression,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid)::text AS actual_expression
  FROM expected_defaults e
  LEFT JOIN pg_catalog.pg_class r
    ON r.relnamespace = 'public'::regnamespace
   AND r.relname = e.table_name
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = r.oid
   AND a.attname = e.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = r.oid
   AND d.adnum = a.attnum
),
function_state AS (
  SELECT
    e.signature,
    e.expected_result,
    e.expected_service_execute,
    p.oid,
    pg_catalog.pg_get_userbyid(p.proowner)::text AS owner_name,
    pg_catalog.pg_get_function_result(p.oid)::text AS actual_result,
    CASE WHEN p.oid IS NULL THEN NULL WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END::text AS security_mode,
    coalesce((
      SELECT regexp_replace(lower(config_value), '\s+', '', 'g')
      FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
      WHERE lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
      ORDER BY config_value
      LIMIT 1
    ), '<none>')::text AS configured_search_path,
    CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_functiondef(p.oid) END::text AS definition,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('service_role', p.oid, 'EXECUTE') END AS service_execute,
    CASE WHEN p.oid IS NULL THEN NULL ELSE p.proacl::text END::text AS acl
  FROM target_functions e
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure(e.signature)
),
trigger_state AS (
  SELECT
    e.trigger_name,
    e.table_name,
    e.function_name,
    t.oid,
    t.tgenabled::text AS tgenabled,
    CASE WHEN t.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_triggerdef(t.oid, true) END::text AS definition,
    CASE WHEN p.oid IS NULL THEN NULL ELSE pn.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' END::text AS actual_function
  FROM expected_triggers e
  LEFT JOIN pg_catalog.pg_class r
    ON r.relnamespace = 'public'::regnamespace
   AND r.relname = e.table_name
  LEFT JOIN pg_catalog.pg_trigger t
    ON t.tgrelid = r.oid
   AND t.tgname = e.trigger_name
   AND NOT t.tgisinternal
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
),
policy_state AS (
  SELECT
    e.table_name,
    e.policy_name,
    p.oid,
    p.polcmd::text AS command,
    (SELECT string_agg(pg_catalog.pg_get_userbyid(role_oid), ',' ORDER BY pg_catalog.pg_get_userbyid(role_oid)) FROM unnest(p.polroles) AS role_oid)::text AS roles,
    CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_expr(p.polqual, p.polrelid) END::text AS using_expression,
    CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) END::text AS with_check_expression
  FROM expected_policies e
  LEFT JOIN pg_catalog.pg_class r
    ON r.relnamespace = 'public'::regnamespace
   AND r.relname = e.table_name
  LEFT JOIN pg_catalog.pg_policy p
    ON p.polrelid = r.oid
   AND p.polname = e.policy_name
),
table_grant_state AS (
  SELECT
    e.table_name,
    e.service_insert,
    e.service_update,
    r.oid,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('anon', r.oid, 'SELECT') END AS anon_select,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('authenticated', r.oid, 'SELECT') END AS authenticated_select,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('authenticated', r.oid, 'INSERT') END AS authenticated_insert,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('authenticated', r.oid, 'UPDATE') END AS authenticated_update,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('authenticated', r.oid, 'DELETE') END AS authenticated_delete,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('service_role', r.oid, 'SELECT') END AS service_select,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('service_role', r.oid, 'INSERT') END AS service_insert_actual,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('service_role', r.oid, 'UPDATE') END AS service_update_actual,
    CASE WHEN r.oid IS NULL THEN NULL ELSE has_table_privilege('service_role', r.oid, 'DELETE') END AS service_delete,
    CASE WHEN r.oid IS NULL THEN NULL ELSE NOT EXISTS (
      SELECT 1
      FROM aclexplode(r.relacl) AS acl
      WHERE acl.grantee = 0
    ) END AS no_public_acl
  FROM expected_table_grants e
  LEFT JOIN relation_state r ON r.table_name = e.table_name
),
target_counts(table_name, row_count) AS (
  SELECT 'internal_link_graphs'::text, count(*)::bigint FROM public.internal_link_graphs
  UNION ALL
  SELECT 'internal_link_graph_working_copies'::text, count(*)::bigint FROM public.internal_link_graph_working_copies
  UNION ALL
  SELECT 'internal_link_graph_nodes'::text, count(*)::bigint FROM public.internal_link_graph_nodes
  UNION ALL
  SELECT 'internal_link_graph_edges'::text, count(*)::bigint FROM public.internal_link_graph_edges
  UNION ALL
  SELECT 'internal_link_graph_proposals'::text, count(*)::bigint FROM public.internal_link_graph_proposals
),
relation_gate AS (
  SELECT bool_and(oid IS NOT NULL AND relkind IN ('r', 'p')) AS ok FROM relation_state
),
column_gate AS (
  SELECT bool_and(present AND actual_type = expected_type AND actual_nullable IS NOT DISTINCT FROM expected_nullable) AS ok FROM column_state
),
primary_gate AS (
  SELECT bool_and(oid IS NOT NULL AND definition = expected_definition) AS ok
  FROM (
    SELECT
      e.constraint_name,
      e.definition AS expected_definition,
      c.oid,
      CASE WHEN c.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_constraintdef(c.oid, true) END::text AS definition
    FROM expected_primary_keys e
    LEFT JOIN pg_catalog.pg_constraint c
      ON c.conname = e.constraint_name
     AND c.conrelid = to_regclass('public.' || e.table_name)::oid
     AND c.contype = 'p'
  ) p
),
unique_gate AS (
  SELECT bool_and(c.oid IS NOT NULL AND c.contype = 'u') AS ok
  FROM expected_unique_constraints e
  LEFT JOIN pg_catalog.pg_constraint c
    ON c.conname = e.constraint_name
   AND c.conrelid = to_regclass('public.' || e.table_name)::oid
),
foreign_gate AS (
  SELECT bool_and(
    oid IS NOT NULL
    AND actual_source_table = source_table
    AND actual_target_schema = target_schema
    AND actual_target_table = target_table
    AND actual_delete_action = delete_action
    AND convalidated
    AND NOT condeferrable
    AND NOT condeferred
  ) AS ok
  FROM constraint_state
),
check_gate AS (
  SELECT bool_and(oid IS NOT NULL AND convalidated) AS ok FROM check_state
),
index_gate AS (
  SELECT bool_and(oid IS NOT NULL AND indisvalid AND indisready) AS ok FROM index_state
),
default_gate AS (
  SELECT bool_and(
    actual_expression IS NOT NULL
    AND regexp_replace(lower(actual_expression), '\s+', '', 'g') = regexp_replace(lower(expected_expression), '\s+', '', 'g')
  ) AS ok FROM default_state
),
rls_gate AS (
  SELECT bool_and(oid IS NOT NULL AND relrowsecurity AND NOT relforcerowsecurity) AS ok FROM relation_state
),
policy_gate AS (
  SELECT bool_and(
    oid IS NOT NULL
    AND command = 'r'
    AND roles = 'authenticated'
    AND using_expression ILIKE '%canonical_actor_can_access_brand%'
    AND with_check_expression IS NULL
  ) AS ok FROM policy_state
),
table_grant_gate AS (
  SELECT bool_and(
    oid IS NOT NULL
    AND coalesce(anon_select, false) = false
    AND coalesce(authenticated_select, false)
    AND coalesce(authenticated_insert, false) = false
    AND coalesce(authenticated_update, false) = false
    AND coalesce(authenticated_delete, false) = false
    AND coalesce(service_select, false)
    AND coalesce(service_insert_actual, false) = service_insert
    AND coalesce(service_update_actual, false) = service_update
    AND coalesce(service_delete, false) = false
    AND coalesce(no_public_acl, false)
  ) AS ok FROM table_grant_state
),
function_gate AS (
  SELECT bool_and(
    oid IS NOT NULL
    AND owner_name IS NOT NULL
    AND actual_result = expected_result
    AND security_mode = 'SECURITY INVOKER'
    AND configured_search_path = 'search_path=pg_catalog,public,pg_temp'
    AND coalesce(anon_execute, false) = false
    AND coalesce(authenticated_execute, false) = false
    AND coalesce(service_execute, false) = expected_service_execute
    AND coalesce(definition, '') NOT ILIKE '%keywords_kgr%'
    AND coalesce(definition, '') NOT ILIKE '%listas_kgr%'
  ) AS ok FROM function_state
),
trigger_gate AS (
  SELECT bool_and(
    oid IS NOT NULL
    AND tgenabled = 'O'
    AND actual_function = function_name
  ) AS ok FROM trigger_state
),
checks AS (
  SELECT
    'REMOTE_GRAPH_RELATIONS'::text AS check_name,
    'public.internal_link_graphs, public.internal_link_graph_working_copies, public.internal_link_graph_nodes, public.internal_link_graph_edges, public.internal_link_graph_proposals'::text AS object_name,
    format('present=%s/5; owners=%s', count(*) FILTER (WHERE oid IS NOT NULL), coalesce(string_agg(table_name || '=' || coalesce(owner_name, '<absent>'), ';' ORDER BY table_name), '<none>'))::text AS observed,
    CASE WHEN (SELECT ok FROM relation_gate) THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  FROM relation_state
  UNION ALL
  SELECT
    'REMOTE_GRAPH_COLUMNS',
    'five InternalLinkGraph relations',
    format('matching=%s/%s; missing_or_mismatched=%s', count(*) FILTER (WHERE present AND actual_type = expected_type AND actual_nullable IS NOT DISTINCT FROM expected_nullable), count(*), coalesce(string_agg(CASE WHEN NOT (present AND actual_type = expected_type AND actual_nullable IS NOT DISTINCT FROM expected_nullable) THEN table_name || '.' || column_name || ' expected=' || expected_type || '/' || expected_nullable || ' observed=' || coalesce(actual_type, '<absent>') || '/' || coalesce(actual_nullable::text, '<absent>') END, ';' ORDER BY table_name, column_name) FILTER (WHERE NOT (present AND actual_type = expected_type AND actual_nullable IS NOT DISTINCT FROM expected_nullable)), '<none>'))::text,
    CASE WHEN (SELECT ok FROM column_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM column_state
  UNION ALL
  SELECT
    'REMOTE_GRAPH_PRIMARY_KEYS',
    'five canonical primary keys',
    format('matching=%s/5; definitions=%s', count(*) FILTER (WHERE oid IS NOT NULL AND definition = e.definition), coalesce(string_agg(e.constraint_name || '=' || coalesce(definition, '<absent>'), ';' ORDER BY e.constraint_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM primary_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM expected_primary_keys e
  LEFT JOIN pg_catalog.pg_constraint c ON c.conname = e.constraint_name AND c.conrelid = to_regclass('public.' || e.table_name)::oid AND c.contype = 'p'
  UNION ALL
  SELECT
    'REMOTE_GRAPH_UNIQUE_CONSTRAINTS',
    'six canonical UNIQUE constraints',
    format('present=%s/6; names=%s', count(*) FILTER (WHERE c.oid IS NOT NULL), coalesce(string_agg(e.constraint_name || '=' || coalesce(pg_catalog.pg_get_constraintdef(c.oid, true), '<absent>'), ';' ORDER BY e.constraint_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM unique_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM expected_unique_constraints e
  LEFT JOIN pg_catalog.pg_constraint c ON c.conname = e.constraint_name AND c.conrelid = to_regclass('public.' || e.table_name)::oid AND c.contype = 'u'
  UNION ALL
  SELECT
    'REMOTE_GRAPH_FOREIGN_KEYS',
    '20 canonical foreign keys',
    format('matching=%s/20; details=%s', count(*) FILTER (WHERE oid IS NOT NULL AND actual_source_table = source_table AND actual_target_schema = target_schema AND actual_target_table = target_table AND actual_delete_action = delete_action AND convalidated AND NOT condeferrable AND NOT condeferred), coalesce(string_agg(constraint_name || ' source=' || coalesce(actual_source_table, '<absent>') || ' target=' || coalesce(actual_target_schema || '.' || actual_target_table, '<absent>') || ' delete=' || coalesce(actual_delete_action, '<absent>'), ';' ORDER BY constraint_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM foreign_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM constraint_state
  UNION ALL
  SELECT
    'REMOTE_GRAPH_CHECKS',
    '45 canonical CHECK constraints',
    format('present=%s/45; validated=%s/45; definitions=%s', count(*) FILTER (WHERE oid IS NOT NULL), count(*) FILTER (WHERE oid IS NOT NULL AND convalidated), coalesce(string_agg(constraint_name || '=' || coalesce(definition, '<absent>'), ' | ' ORDER BY constraint_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM check_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM check_state
  UNION ALL
  SELECT
    'REMOTE_GRAPH_INDEXES',
    '16 canonical indexes',
    format('ready=%s/16; definitions=%s', count(*) FILTER (WHERE oid IS NOT NULL AND indisvalid AND indisready), coalesce(string_agg(index_name || '=' || coalesce(definition, '<absent>') || ';unique=' || coalesce(indisunique::text, '<absent>') || ';primary=' || coalesce(indisprimary::text, '<absent>'), ' | ' ORDER BY index_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM index_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM index_state
  UNION ALL
  SELECT
    'REMOTE_GRAPH_DEFAULTS',
    'canonical defaults',
    format('matching=%s/11; details=%s', count(*) FILTER (WHERE actual_expression IS NOT NULL AND regexp_replace(lower(actual_expression), '\s+', '', 'g') = regexp_replace(lower(expected_expression), '\s+', '', 'g')), coalesce(string_agg(table_name || '.' || column_name || '=' || coalesce(actual_expression, '<absent>'), ';' ORDER BY table_name, column_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM default_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM default_state
  UNION ALL
  SELECT
    'GRAPH_RLS',
    'five private graph relations',
    format('enabled=%s/5; forced=%s/5; details=%s', count(*) FILTER (WHERE relrowsecurity), count(*) FILTER (WHERE NOT relforcerowsecurity), coalesce(string_agg(table_name || '=enabled:' || coalesce(relrowsecurity::text, '<absent>') || ',forced:' || coalesce(relforcerowsecurity::text, '<absent>'), ';' ORDER BY table_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM rls_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM relation_state
  UNION ALL
  SELECT
    'GRAPH_POLICIES',
    'five authenticated tenantized SELECT policies',
    format('matching=%s/5; details=%s', count(*) FILTER (WHERE oid IS NOT NULL AND command = 'r' AND roles = 'authenticated' AND using_expression ILIKE '%canonical_actor_can_access_brand%' AND with_check_expression IS NULL), coalesce(string_agg(table_name || '.' || policy_name || '=' || coalesce(command, '<absent>') || ';roles=' || coalesce(roles, '<absent>') || ';using=' || coalesce(using_expression, '<absent>'), ' | ' ORDER BY table_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM policy_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM policy_state
  UNION ALL
  SELECT
    'GRAPH_GRANTS',
    'anon/authenticated/service_role table privileges',
    coalesce(string_agg(table_name || ';anon_select=' || coalesce(anon_select::text, '<absent>') || ';auth_select=' || coalesce(authenticated_select::text, '<absent>') || ';auth_write=' || coalesce((authenticated_insert OR authenticated_update OR authenticated_delete)::text, '<absent>') || ';service_select=' || coalesce(service_select::text, '<absent>') || ';service_insert=' || coalesce(service_insert_actual::text, '<absent>') || ';service_update=' || coalesce(service_update_actual::text, '<absent>') || ';service_delete=' || coalesce(service_delete::text, '<absent>') || ';public_acl=' || coalesce((NOT no_public_acl)::text, '<absent>'), ' | ' ORDER BY table_name), '<none>')::text,
    CASE WHEN (SELECT ok FROM table_grant_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM table_grant_state
  UNION ALL
  SELECT
    'REMOTE_GRAPH_FUNCTIONS',
    'eight canonical functions',
    format('matching=%s/8; details=%s', count(*) FILTER (WHERE oid IS NOT NULL AND actual_result = expected_result AND security_mode = 'SECURITY INVOKER' AND configured_search_path = 'search_path=pg_catalog,public,pg_temp' AND coalesce(anon_execute, false) = false AND coalesce(authenticated_execute, false) = false AND coalesce(service_execute, false) = expected_service_execute), coalesce(string_agg(signature || ';owner=' || coalesce(owner_name, '<absent>') || ';security=' || coalesce(security_mode, '<absent>') || ';search_path=' || coalesce(configured_search_path, '<absent>') || ';service_execute=' || coalesce(service_execute::text, '<absent>') || ';legacy=' || ((coalesce(definition, '') ILIKE '%keywords_kgr%') OR (coalesce(definition, '') ILIKE '%listas_kgr%'))::text || ';definition_bytes=' || coalesce(length(definition)::text, '<absent>') || ';acl=' || coalesce(acl, '<default>'), ' | ' ORDER BY signature), '<none>'))::text,
    CASE WHEN (SELECT ok FROM function_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM function_state
  UNION ALL
  SELECT
    'REMOTE_GRAPH_TRIGGERS',
    'nine enabled triggers bound to canonical functions',
    format('matching=%s/9; details=%s', count(*) FILTER (WHERE oid IS NOT NULL AND tgenabled = 'O' AND actual_function = function_name), coalesce(string_agg(trigger_name || ' on ' || table_name || ' -> ' || coalesce(actual_function, '<absent>') || ';enabled=' || coalesce(tgenabled, '<absent>'), ' | ' ORDER BY trigger_name), '<none>'))::text,
    CASE WHEN (SELECT ok FROM trigger_gate) THEN 'PASS' ELSE 'FAIL' END
  FROM trigger_state
  UNION ALL
  SELECT
    'TARGET_DATA_COUNTS',
    'InternalLinkGraph target relations',
    coalesce(string_agg(table_name || '=' || row_count::text, ';' ORDER BY table_name), '<none>')::text,
    'INFO'::text
  FROM target_counts
  UNION ALL
  SELECT
    'REMOTE_GRAPH_READBACK_GATE',
    '20260826225145_internal_link_graph_foundation',
    format('relations=%s; columns=%s; primary_keys=%s; unique=%s; foreign_keys=%s; checks=%s; indexes=%s; defaults=%s; rls=%s; policies=%s; grants=%s; functions=%s; triggers=%s', (SELECT ok FROM relation_gate), (SELECT ok FROM column_gate), (SELECT ok FROM primary_gate), (SELECT ok FROM unique_gate), (SELECT ok FROM foreign_gate), (SELECT ok FROM check_gate), (SELECT ok FROM index_gate), (SELECT ok FROM default_gate), (SELECT ok FROM rls_gate), (SELECT ok FROM policy_gate), (SELECT ok FROM table_grant_gate), (SELECT ok FROM function_gate), (SELECT ok FROM trigger_gate))::text,
    CASE WHEN (SELECT ok FROM relation_gate)
       AND (SELECT ok FROM column_gate)
       AND (SELECT ok FROM primary_gate)
       AND (SELECT ok FROM unique_gate)
       AND (SELECT ok FROM foreign_gate)
       AND (SELECT ok FROM check_gate)
       AND (SELECT ok FROM index_gate)
       AND (SELECT ok FROM default_gate)
       AND (SELECT ok FROM rls_gate)
       AND (SELECT ok FROM policy_gate)
       AND (SELECT ok FROM table_grant_gate)
       AND (SELECT ok FROM function_gate)
       AND (SELECT ok FROM trigger_gate)
      THEN 'PASS' ELSE 'FAIL' END::text
)
SELECT
  check_name::text,
  object_name::text,
  observed::text,
  verdict::text
FROM checks
ORDER BY check_name, object_name;
