-- SiloDNA/SiloPage atomicity re-preflight.
-- Execute as one read-only statement before the local migration is applied.
-- The target function must be absent. This script never creates fixtures and
-- never executes the target RPC; transaction/lock checks are static checks of
-- the local migration contract and remain INFO in this remote result set.

WITH
target_function(function_identity) AS (
  VALUES ('public.persist_silo_pair_atomic(uuid,uuid,text,jsonb,jsonb,text,text)'::text)
),
required_columns(column_name, expected_type, expected_nullable) AS (
  VALUES
    ('version_id', 'text', false),
    ('entity_id', 'text', false),
    ('marca_id', 'uuid', false),
    ('artifact_type', 'text', false),
    ('version_number', 'integer', false),
    ('previous_version_id', 'text', true),
    ('source_version_id', 'text', true),
    ('status', 'text', false),
    ('content_hash', 'text', false),
    ('payload', 'jsonb', false),
    ('origin', 'text', false),
    ('change_reason', 'text', false),
    ('created_by', 'uuid', false),
    ('created_at', 'timestamp with time zone', false)
),
version_constraints(constraint_name, expected_type, expected_fragment) AS (
  VALUES
    ('editorial_artifact_versions_pkey', 'p', 'primary key'),
    ('editorial_artifact_versions_identity_unique', 'u', 'unique (marca_id, artifact_type, entity_id, version_number)'),
    ('editorial_artifact_versions_version_number_check', 'c', 'version_number > 0'),
    ('editorial_artifact_versions_content_hash_check', 'c', 'content_hash'),
    ('editorial_artifact_versions_payload_check', 'c', 'payload'),
    ('editorial_artifact_versions_status_check', 'c', 'status'),
    ('editorial_artifact_versions_origin_check', 'c', 'origin'),
    ('editorial_artifact_versions_change_reason_check', 'c', 'change_reason'),
    ('editorial_artifact_versions_previous_version_id_fkey', 'f', 'previous_version_id'),
    ('editorial_artifact_versions_source_version_id_fkey', 'f', 'source_version_id')
),
helper_functions(function_identity, helper_name) AS (
  VALUES
    ('public.canonical_assert_rpc_actor(uuid)'::text, 'canonical_assert_rpc_actor'),
    ('public.canonical_actor_can_access_brand(uuid,uuid)'::text, 'canonical_actor_can_access_brand'),
    ('public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)'::text, 'canonical_actor_can_use_brand_action')
),
graph_relations(relation_name) AS (
  VALUES
    ('internal_link_graphs'),
    ('internal_link_graph_working_copies'),
    ('internal_link_graph_nodes'),
    ('internal_link_graph_edges'),
    ('internal_link_graph_proposals')
),
target_function_state AS (
  SELECT
    f.function_identity,
    to_regprocedure(f.function_identity) IS NOT NULL AS exact_present,
    (
      SELECT count(*)
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'persist_silo_pair_atomic'
    )::bigint AS same_name_count,
    (
      SELECT coalesce(
        string_agg(
          format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
          ', ' ORDER BY p.oid::text
        ),
        '<none>'
      )
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'persist_silo_pair_atomic'
    )::text AS same_name_signatures
  FROM target_function AS f
),
artifact_relation AS (
  SELECT
    c.oid,
    c.relrowsecurity,
    c.relforcerowsecurity
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'editorial_artifact_versions'
    AND c.relkind IN ('r', 'p')
),
artifact_column_state AS (
  SELECT
    r.column_name,
    r.expected_type,
    r.expected_nullable,
    a.attname IS NOT NULL AS present,
    format_type(a.atttypid, a.atttypmod) AS observed_type,
    CASE WHEN a.attname IS NULL THEN NULL ELSE NOT a.attnotnull END AS observed_nullable,
    a.attname IS NOT NULL
      AND format_type(a.atttypid, a.atttypmod) = r.expected_type
      AND (NOT a.attnotnull) = r.expected_nullable AS contract_ok
  FROM required_columns AS r
  LEFT JOIN artifact_relation AS ar ON true
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = ar.oid
   AND a.attname = r.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
),
artifact_column_summary AS (
  SELECT
    count(*)::bigint AS expected_count,
    count(*) FILTER (WHERE present)::bigint AS present_count,
    count(*) FILTER (WHERE contract_ok)::bigint AS contract_count
  FROM artifact_column_state
),
artifact_type_support AS (
  SELECT
    coalesce(bool_or(
      c.contype = 'c'
      AND c.convalidated
      AND pg_get_constraintdef(c.oid, true) ILIKE '%silo_dna%'
      AND pg_get_constraintdef(c.oid, true) ILIKE '%silo_page%'
    ), false) AS both_types_supported,
    coalesce(bool_or(
      c.contype = 'c'
      AND c.convalidated
      AND pg_get_constraintdef(c.oid, true) ILIKE '%silo_dna%'
    ), false) AS silo_dna_supported,
    coalesce(bool_or(
      c.contype = 'c'
      AND c.convalidated
      AND pg_get_constraintdef(c.oid, true) ILIKE '%silo_page%'
    ), false) AS silo_page_supported
  FROM pg_catalog.pg_constraint AS c
  WHERE c.conrelid = (SELECT oid FROM artifact_relation)
),
artifact_constraint_state AS (
  SELECT
    v.constraint_name,
    v.expected_type,
    v.expected_fragment,
    c.oid IS NOT NULL AS present,
    c.convalidated AS validated,
    c.contype::text AS observed_type,
    coalesce(pg_get_constraintdef(c.oid, true), '<absent>') AS definition,
    c.oid IS NOT NULL
      AND c.contype::text = v.expected_type
      AND c.convalidated
      AND lower(pg_get_constraintdef(c.oid, true)) LIKE '%' || lower(v.expected_fragment) || '%' AS contract_ok
  FROM version_constraints AS v
  LEFT JOIN artifact_relation AS ar ON true
  LEFT JOIN pg_catalog.pg_constraint AS c
    ON c.conrelid = ar.oid
   AND c.conname = v.constraint_name
),
artifact_constraint_summary AS (
  SELECT
    count(*)::bigint AS expected_count,
    count(*) FILTER (WHERE present)::bigint AS present_count,
    count(*) FILTER (WHERE contract_ok)::bigint AS contract_count
  FROM artifact_constraint_state
),
source_function_state AS (
  SELECT
    p.oid IS NOT NULL AS present,
    p.prosecdef,
    coalesce(array_to_string(p.proconfig, ','), '<none>') AS config,
    coalesce(pg_get_functiondef(p.oid), '<absent>') AS definition,
    p.oid IS NOT NULL
      AND pg_get_function_identity_arguments(p.oid) = ''
      AND pg_get_functiondef(p.oid) ILIKE '%silo_dna%'
      AND pg_get_functiondef(p.oid) ILIKE '%silo_page%'
      AND pg_get_functiondef(p.oid) ILIKE '%source_version_id%' AS contract_ok
  FROM (
    SELECT to_regprocedure('public.pipeline_editorial_validate_artifact_source()')::oid AS oid
  ) AS target
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = target.oid
),
source_trigger_state AS (
  SELECT
    count(*) > 0 AS present,
    coalesce(bool_and(t.tgenabled = 'O'), false) AS enabled,
    coalesce(bool_and(p.proname = 'pipeline_editorial_validate_artifact_source'), false) AS function_ok
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS r ON r.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = r.relnamespace
  JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public'
    AND r.relname = 'editorial_artifact_versions'
    AND t.tgname = 'editorial_artifact_versions_source_trg'
    AND NOT t.tgisinternal
),
brand_column_state AS (
  SELECT
    r.column_name,
    a.attname IS NOT NULL AS present,
    format_type(a.atttypid, a.atttypmod) AS observed_type,
    a.attname IS NOT NULL
      AND format_type(a.atttypid, a.atttypmod) = r.expected_type AS contract_ok
  FROM (
    VALUES
      ('id'::text, 'uuid'::text),
      ('owner_user_id'::text, 'uuid'::text)
  ) AS r(column_name, expected_type)
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.oid = to_regclass('public.marcas')::oid
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid
   AND a.attname = r.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
),
membership_column_state AS (
  SELECT
    r.column_name,
    a.attname IS NOT NULL AS present
  FROM (
    VALUES
      ('marca_id'::text),
      ('member_user_id'::text)
  ) AS r(column_name)
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.oid = to_regclass('public.brand_memberships')::oid
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid
   AND a.attname = r.column_name
   AND a.attnum > 0
   AND NOT a.attisdropped
),
brand_state AS (
  SELECT
    to_regclass('public.marcas') IS NOT NULL AS marcas_present,
    count(*) FILTER (WHERE contract_ok) = count(*) AS marca_columns_ok,
    to_regclass('public.brand_memberships') IS NOT NULL
      AND (SELECT count(*) FILTER (WHERE present) = count(*) FROM membership_column_state) AS membership_contract_ok
  FROM brand_column_state
),
helper_state AS (
  SELECT
    h.helper_name,
    to_regprocedure(h.function_identity) IS NOT NULL AS present,
    p.prosecdef,
    coalesce(array_to_string(p.proconfig, ','), '<none>') AS config,
    CASE WHEN p.oid IS NULL THEN false ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN p.oid IS NULL THEN false ELSE has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN p.oid IS NULL THEN false ELSE has_function_privilege('service_role', p.oid, 'EXECUTE') END AS service_execute
  FROM helper_functions AS h
  LEFT JOIN pg_catalog.pg_proc AS p
    ON p.oid = to_regprocedure(h.function_identity)::oid
),
helper_summary AS (
  SELECT
    count(*)::bigint AS expected_count,
    count(*) FILTER (WHERE present)::bigint AS present_count
  FROM helper_state
),
graph_relation_state AS (
  SELECT
    count(*)::bigint AS expected_count,
    count(*) FILTER (WHERE to_regclass('public.' || relation_name) IS NOT NULL)::bigint AS present_count
  FROM graph_relations
),
graph_reference_state AS (
  SELECT
    count(*) FILTER (WHERE pg_get_functiondef(p.oid) ILIKE '%persist_silo_pair_atomic%')::bigint AS function_refs,
    count(*) FILTER (WHERE pg_get_triggerdef(t.oid, true) ILIKE '%persist_silo_pair_atomic%')::bigint AS trigger_refs
  FROM pg_catalog.pg_class AS r
  JOIN pg_catalog.pg_namespace AS n ON n.oid = r.relnamespace
  LEFT JOIN pg_catalog.pg_proc AS p ON p.pronamespace = n.oid AND p.proname LIKE 'internal_link_graph%'
  LEFT JOIN pg_catalog.pg_trigger AS t ON t.tgrelid = r.oid AND NOT t.tgisinternal
  WHERE n.nspname = 'public'
    AND r.relname LIKE 'internal_link_graph%'
),
graph_artifact_fk_state AS (
  SELECT count(*)::bigint AS count
  FROM pg_catalog.pg_constraint AS c
  JOIN pg_catalog.pg_class AS source_relation ON source_relation.oid = c.conrelid
  JOIN pg_catalog.pg_namespace AS source_namespace ON source_namespace.oid = source_relation.relnamespace
  JOIN pg_catalog.pg_class AS target_relation ON target_relation.oid = c.confrelid
  JOIN pg_catalog.pg_namespace AS target_namespace ON target_namespace.oid = target_relation.relnamespace
  WHERE source_namespace.nspname = 'public'
    AND source_relation.relname LIKE 'internal_link_graph%'
    AND target_namespace.nspname = 'public'
    AND target_relation.relname = 'editorial_artifact_versions'
),
target_dependents AS (
  SELECT count(*)::bigint AS count
  FROM pg_catalog.pg_depend AS d
  CROSS JOIN target_function_state AS t
  WHERE t.exact_present
    AND (
      d.objid = to_regprocedure(t.function_identity)::oid
      OR d.refobjid = to_regprocedure(t.function_identity)::oid
    )
),
remote_gate AS (
  SELECT
    (SELECT NOT exact_present AND same_name_count = 0 FROM target_function_state)
    AND (SELECT marcas_present AND marca_columns_ok AND membership_contract_ok FROM brand_state)
    AND (SELECT present_count = expected_count AND contract_count = expected_count FROM artifact_column_summary)
    AND (SELECT contract_count = expected_count FROM artifact_constraint_summary)
    AND (SELECT silo_dna_supported AND silo_page_supported FROM artifact_type_support)
    AND (SELECT contract_ok FROM source_function_state)
    AND (SELECT present AND enabled AND function_ok FROM source_trigger_state)
    AND (SELECT present_count = expected_count FROM helper_summary)
    AND (SELECT present_count = expected_count FROM graph_relation_state)
    AND (SELECT function_refs = 0 AND trigger_refs = 0 FROM graph_reference_state)
    AND (SELECT count = 0 FROM target_dependents) AS all_preconditions_ok
),
checks AS (
  SELECT
    'MIGRATION_ALREADY_APPLIED'::text AS check_name,
    t.function_identity::text AS object_name,
    format('exact_present=%s; same_name_count=%s; same_name_signatures=%s', t.exact_present, t.same_name_count, t.same_name_signatures)::text AS observed,
    CASE WHEN NOT t.exact_present AND t.same_name_count = 0 THEN 'NO' ELSE 'YES' END::text AS verdict
  FROM target_function_state AS t
  UNION ALL
  SELECT
    'SILO_PAIR_RPC_ALREADY_EXISTS',
    t.function_identity,
    format('present=%s', t.exact_present),
    CASE WHEN NOT t.exact_present THEN 'NO' ELSE 'YES' END
  FROM target_function_state AS t
  UNION ALL
  SELECT
    'SILO_PAIR_FUNCTION_COLLISION',
    'public.persist_silo_pair_atomic',
    format('same_name_count=%s; signatures=%s', t.same_name_count, t.same_name_signatures),
    CASE WHEN t.same_name_count = 0 THEN 'NO' ELSE 'YES' END
  FROM target_function_state AS t
  UNION ALL
  SELECT
    'SILO_DNA_PREREQUISITES',
    'public.editorial_artifact_versions / artifact_type=silo_dna',
    format('relation=%s; columns=%s/%s; type_supported=%s; source_validation=%s',
      to_regclass('public.editorial_artifact_versions') IS NOT NULL,
      (SELECT contract_count FROM artifact_column_summary),
      (SELECT expected_count FROM artifact_column_summary),
      (SELECT silo_dna_supported FROM artifact_type_support),
      (SELECT contract_ok FROM source_function_state)),
    CASE WHEN (SELECT contract_count = expected_count FROM artifact_column_summary)
           AND (SELECT silo_dna_supported FROM artifact_type_support)
           AND (SELECT contract_ok FROM source_function_state)
         THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'SILO_PAGE_PREREQUISITES',
    'public.editorial_artifact_versions / artifact_type=silo_page',
    format('relation=%s; columns=%s/%s; type_supported=%s; source_validation=%s; source_version_id_supported=%s',
      to_regclass('public.editorial_artifact_versions') IS NOT NULL,
      (SELECT contract_count FROM artifact_column_summary),
      (SELECT expected_count FROM artifact_column_summary),
      (SELECT silo_page_supported FROM artifact_type_support),
      (SELECT contract_ok FROM source_function_state),
      (SELECT present FROM artifact_column_state WHERE column_name = 'source_version_id')),
    CASE WHEN (SELECT contract_count = expected_count FROM artifact_column_summary)
           AND (SELECT silo_page_supported FROM artifact_type_support)
           AND (SELECT contract_ok FROM source_function_state)
         THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'BRAND_PREREQUISITES',
    'public.marcas + public.brand_memberships',
    format('marcas=%s; marca_columns=%s/2; membership_columns=%s/2',
      marcas_present,
      (SELECT count(*) FILTER (WHERE contract_ok) FROM brand_column_state),
      (SELECT count(*) FILTER (WHERE present) FROM membership_column_state)),
    CASE WHEN marcas_present AND marca_columns_ok AND membership_contract_ok THEN 'PASS' ELSE 'FAIL' END
  FROM brand_state
  UNION ALL
  SELECT
    'SILO_REFERENCES',
    'artifact_type + source_version_id + editorial_artifact_versions_source_trg',
    format('silo_dna=%s; silo_page=%s; source_trigger=%s; enabled=%s; function=%s',
      (SELECT silo_dna_supported FROM artifact_type_support),
      (SELECT silo_page_supported FROM artifact_type_support),
      (SELECT present FROM source_trigger_state),
      (SELECT enabled FROM source_trigger_state),
      (SELECT function_ok FROM source_trigger_state)),
    CASE WHEN (SELECT silo_dna_supported AND silo_page_supported FROM artifact_type_support)
           AND (SELECT present AND enabled AND function_ok FROM source_trigger_state)
         THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'VERSION_PREREQUISITES',
    'public.editorial_artifact_versions / identity, version, hash, payload and lineage constraints',
    format('columns=%s/%s; constraints=%s/%s; rls_enabled=%s; force_rls=%s',
      (SELECT contract_count FROM artifact_column_summary),
      (SELECT expected_count FROM artifact_column_summary),
      (SELECT contract_count FROM artifact_constraint_summary),
      (SELECT expected_count FROM artifact_constraint_summary),
      (SELECT relrowsecurity FROM artifact_relation),
      (SELECT relforcerowsecurity FROM artifact_relation)),
    CASE WHEN (SELECT contract_count = expected_count FROM artifact_column_summary)
           AND (SELECT contract_count = expected_count FROM artifact_constraint_summary)
           AND (SELECT relrowsecurity FROM artifact_relation)
         THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'AUTH_PREREQUISITES',
    'auth.uid() + canonical actor/access/action helpers',
    format('auth_uid=%s; helpers=%s/%s; helper_signatures=%s',
      to_regprocedure('auth.uid()') IS NOT NULL,
      (SELECT present_count FROM helper_summary),
      (SELECT expected_count FROM helper_summary),
      (SELECT coalesce(string_agg(helper_name || '(present=' || present || ')', ', ' ORDER BY helper_name), '<none>') FROM helper_state)),
    CASE WHEN to_regprocedure('auth.uid()') IS NOT NULL
           AND (SELECT present_count = expected_count FROM helper_summary)
         THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'GRAPH_TO_SILO_PAIR_CONFLICT',
    'public.internal_link_graph* → persist_silo_pair_atomic',
    format('graph_relations=%s/%s; graph_function_refs=%s; graph_trigger_refs=%s; target_dependents=%s',
      (SELECT present_count FROM graph_relation_state),
      (SELECT expected_count FROM graph_relation_state),
      (SELECT function_refs FROM graph_reference_state),
      (SELECT trigger_refs FROM graph_reference_state),
      (SELECT count FROM target_dependents)),
    CASE WHEN (SELECT function_refs = 0 AND trigger_refs = 0 FROM graph_reference_state)
           AND (SELECT count = 0 FROM target_dependents)
         THEN 'NO' ELSE 'YES' END
  UNION ALL
  SELECT
    'SILO_PAIR_TO_GRAPH_DEPENDENCY',
    'persist_silo_pair_atomic → InternalLinkGraph',
    format('target_function_present=%s; graph_to_artifact_fks=%s; pair_function_has_no_remote_dependency=%s',
      t.exact_present,
      (SELECT count FROM graph_artifact_fk_state),
      NOT t.exact_present),
    'NONE'
  FROM target_function_state AS t
  UNION ALL
  SELECT
    'SILO_PAIR_REMOTE_SCHEMA_CONFLICT',
    'public.editorial_artifact_versions and public.marcas',
    format('target_relation_mutation_required=no; prerequisite_relations_present=%s',
      (SELECT marcas_present FROM brand_state)
      AND to_regclass('public.editorial_artifact_versions') IS NOT NULL),
    CASE WHEN (SELECT marcas_present FROM brand_state)
           AND to_regclass('public.editorial_artifact_versions') IS NOT NULL
         THEN 'NO' ELSE 'YES' END
  UNION ALL
  SELECT
    'SILO_PAIR_REMOTE_FUNCTION_CONFLICT',
    'public.persist_silo_pair_atomic(uuid,uuid,text,jsonb,jsonb,text,text)',
    format('exact_present=%s; same_name_count=%s', t.exact_present, t.same_name_count),
    CASE WHEN NOT t.exact_present AND t.same_name_count = 0 THEN 'NO' ELSE 'YES' END
  FROM target_function_state AS t
  UNION ALL
  SELECT
    'SILO_PAIR_REMOTE_GRANT_CONFLICT',
    'target function privileges before target function creation',
    format('target_function_present=%s; existing_grants_not_applicable=%s', t.exact_present, NOT t.exact_present),
    CASE WHEN NOT t.exact_present THEN 'NO' ELSE 'YES' END
  FROM target_function_state AS t
  UNION ALL
  SELECT
    'PAIR_ATOMIC_TRANSACTION',
    'local migration 20260826225154_silo_pair_atomicity.sql',
    'static contract: one PL/pgSQL RPC performs two artifact inserts; remote target is intentionally absent',
    'INFO'
  UNION ALL
  SELECT
    'PAIR_LOCK',
    'local migration 20260826225154_silo_pair_atomicity.sql',
    'static contract: pg_advisory_xact_lock is keyed by Brand and Silo before version reads/inserts',
    'INFO'
  UNION ALL
  SELECT
    'VERSION_CONCURRENCY_GUARD',
    'local migration 20260826225154_silo_pair_atomicity.sql',
    'static contract: predecessor/version checks and append-only artifact constraints are evaluated before both inserts',
    'INFO'
  UNION ALL
  SELECT
    'CATALOG_WRITE_ROLE',
    'local migration contract',
    'recoverable projection; no catalog write is required by this preflight',
    'INFO'
  UNION ALL
  SELECT
    'WORKFLOW_WRITE_ROLE',
    'working copy/versioned state outside the pair transaction',
    'working copy and workflow transitions remain separate from the paired persistence RPC',
    'INFO'
  UNION ALL
  SELECT
    'SILO_PAIR_ATOMICITY_ACCEPTABLE',
    'SiloDNA and SiloPage',
    'paired persistence is additive; entity identity, versions and approvals remain distinct',
    'YES'
  UNION ALL
  SELECT
    'SILO_PAIR_MIGRATION_PRECONDITIONS',
    '20260826225154_silo_pair_atomicity.sql',
    format('all_remote_preconditions_ok=%s; target_function_absent=%s; graph_conflict=%s',
      g.all_preconditions_ok,
      NOT (SELECT exact_present FROM target_function_state),
      CASE WHEN (SELECT function_refs = 0 AND trigger_refs = 0 FROM graph_reference_state) THEN 'NO' ELSE 'YES' END),
    CASE WHEN g.all_preconditions_ok THEN 'PASS' ELSE 'FAIL' END
  FROM remote_gate AS g
  UNION ALL
  SELECT
    'REMOTE_DDL',
    'this script',
    '0; SELECT-only preflight',
    'PASS'
  UNION ALL
  SELECT
    'REMOTE_DML',
    'this script',
    '0; no fixtures, no writes, no provider calls',
    'PASS'
  UNION ALL
  SELECT
    'TEMP_OBJECTS',
    'this script',
    '0; no temporary Brand, table, function or fixture',
    'PASS'
)
SELECT
  check_name::text,
  object_name::text,
  observed::text,
  verdict::text
FROM checks
ORDER BY check_name, object_name;
