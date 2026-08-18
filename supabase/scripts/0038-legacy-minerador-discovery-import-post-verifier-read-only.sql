/*
  0038 post-verifier: execute after the reviewed manual DROP.

  READ-ONLY. No TEMP, DDL, DML, ACL, RLS or remote write is performed.
  The preserved-catalog and preserved-data CTEs intentionally mirror the
  preflight scope and serialization. The expected values below are the
  captured PRECHECK baseline and are not recalculated after the DROP.

  This verifier does not recreate or harden the removed RPC.
*/

WITH
expected AS (
  SELECT
    'public.minerador_discovery_candidate_current_metrics=0;public.minerador_discovery_candidate_metric_history=0;public.minerador_discovery_candidates=0;public.minerador_discovery_import_batches=0;public.minerador_discovery_keyword_origins=0;public.minerador_discovery_runs=0;public.minerador_keyword_lists=0;public.minerador_keyword_metric_measurements=0;public.minerador_keywords=0'::text AS data_row_counts,
    '337'::text AS catalog_rows,
    'a6637a34f1f988f580fd1ddde603d268'::text AS catalog_fingerprint
),
target AS (
  SELECT
    to_regprocedure(
      'public.import_minerador_discovery_candidates(uuid,uuid,uuid,uuid[])'
    )::oid AS function_oid
),
preserved_relation_names(schema_name, relation_name) AS (
  VALUES
    ('public'::text, 'minerador_keywords'::text),
    ('public'::text, 'minerador_keyword_lists'::text),
    ('public'::text, 'minerador_discovery_runs'::text),
    ('public'::text, 'minerador_discovery_candidates'::text),
    ('public'::text, 'minerador_discovery_import_batches'::text),
    ('public'::text, 'minerador_discovery_keyword_origins'::text),
    ('public'::text, 'minerador_discovery_candidate_current_metrics'::text),
    ('public'::text, 'minerador_discovery_candidate_metric_history'::text),
    ('public'::text, 'minerador_keyword_metric_measurements'::text)
),
preserved_relations AS (
  SELECT
    n.nspname::text AS schema_name,
    c.relname::text AS relation_name,
    c.oid,
    c.relkind::text AS relkind,
    pg_get_userbyid(c.relowner)::text AS owner_name,
    c.relrowsecurity::text AS rls_enabled,
    c.relforcerowsecurity::text AS rls_forced,
    coalesce(array_to_string(c.relacl, ','), '<NULL>')::text AS acl_text
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN preserved_relation_names AS expected_relation
    ON expected_relation.schema_name = n.nspname::text
   AND expected_relation.relation_name = c.relname::text
),
preserved_data_rows(relation_name, row_count) AS (
  SELECT 'public.minerador_keywords'::text, count(*)::bigint FROM public.minerador_keywords
  UNION ALL SELECT 'public.minerador_keyword_lists'::text, count(*)::bigint FROM public.minerador_keyword_lists
  UNION ALL SELECT 'public.minerador_discovery_runs'::text, count(*)::bigint FROM public.minerador_discovery_runs
  UNION ALL SELECT 'public.minerador_discovery_candidates'::text, count(*)::bigint FROM public.minerador_discovery_candidates
  UNION ALL SELECT 'public.minerador_discovery_import_batches'::text, count(*)::bigint FROM public.minerador_discovery_import_batches
  UNION ALL SELECT 'public.minerador_discovery_keyword_origins'::text, count(*)::bigint FROM public.minerador_discovery_keyword_origins
  UNION ALL SELECT 'public.minerador_discovery_candidate_current_metrics'::text, count(*)::bigint FROM public.minerador_discovery_candidate_current_metrics
  UNION ALL SELECT 'public.minerador_discovery_candidate_metric_history'::text, count(*)::bigint FROM public.minerador_discovery_candidate_metric_history
  UNION ALL SELECT 'public.minerador_keyword_metric_measurements'::text, count(*)::bigint FROM public.minerador_keyword_metric_measurements
),
preserved_data_snapshot AS (
  SELECT coalesce(string_agg(
    format('%s=%s', relation_name, row_count::text),
    ';' ORDER BY relation_name
  ), '<none>')::text AS snapshot
  FROM preserved_data_rows
),
preserved_relation_rows AS (
  SELECT format(
    'relation|%s.%s|kind=%s|owner=%s|rls=%s|forced=%s|acl=%s',
    r.schema_name,
    r.relation_name,
    r.relkind,
    r.owner_name,
    r.rls_enabled,
    r.rls_forced,
    r.acl_text
  )::text AS row_data
  FROM preserved_relations AS r
),
preserved_columns AS (
  SELECT format(
    'column|%s.%s|%s|%s|%s|%s|%s|%s',
    r.schema_name,
    r.relation_name,
    a.attnum::text,
    a.attname::text,
    format_type(a.atttypid, a.atttypmod),
    a.attnotnull::text,
    a.attidentity::text,
    a.attgenerated::text
  )::text AS row_data
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = r.oid
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
preserved_constraints AS (
  SELECT format(
    'constraint|%s.%s|%s|%s|%s|%s',
    n.nspname::text,
    rel.relname::text,
    c.conname::text,
    c.contype::text,
    c.convalidated::text,
    pg_get_constraintdef(c.oid, true)
  )::text AS row_data
  FROM pg_catalog.pg_constraint AS c
  JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
  JOIN preserved_relations AS r ON r.oid = c.conrelid
),
preserved_indexes AS (
  SELECT format(
    'index|%s.%s|%s|%s|%s|%s',
    n.nspname::text,
    rel.relname::text,
    idx.relname::text,
    i.indisunique::text,
    i.indisvalid::text,
    pg_get_indexdef(i.indexrelid)
  )::text AS row_data
  FROM pg_catalog.pg_index AS i
  JOIN pg_catalog.pg_class AS rel ON rel.oid = i.indrelid
  JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
  JOIN preserved_relations AS r ON r.oid = i.indrelid
),
preserved_policies AS (
  SELECT format(
    'policy|%s.%s|%s|%s|%s|%s|%s|%s',
    p.schemaname::text,
    p.tablename::text,
    p.policyname::text,
    p.cmd::text,
    p.permissive::text,
    coalesce(array_to_string(p.roles::text[], ','), '<NULL>'),
    coalesce(p.qual, '<NULL>'),
    coalesce(p.with_check, '<NULL>')
  )::text AS row_data
  FROM pg_catalog.pg_policies AS p
  JOIN preserved_relation_names AS expected_relation
    ON expected_relation.schema_name = p.schemaname::text
   AND expected_relation.relation_name = p.tablename::text
),
preserved_triggers AS (
  SELECT format(
    'trigger|%s.%s|%s|enabled=%s|definition=%s',
    n.nspname::text,
    r.relation_name,
    tg.tgname::text,
    tg.tgenabled::text,
    pg_get_triggerdef(tg.oid, true)
  )::text AS row_data
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_trigger AS tg ON tg.tgrelid = r.oid
  JOIN pg_catalog.pg_namespace AS n ON n.nspname = r.schema_name
  WHERE NOT tg.tgisinternal
),
preserved_function_names(function_identity) AS (
  VALUES
    ('public.minerador_discovery_normalize_keyword(text)'::text),
    ('public.minerador_discovery_import_brand_guard()'::text),
    ('public.minerador_discovery_candidate_brand_guard()'::text),
    ('public.minerador_discovery_run_immutable()'::text),
    ('public.persist_minerador_discovery_run(jsonb,jsonb)'::text),
    ('public.can_access_list(uuid)'::text)
),
preserved_functions AS (
  SELECT format(
    'routine|%s|owner=%s|security_definer=%s|config=%s|acl=%s|definition_md5=%s',
    expected_function.function_identity,
    coalesce(pg_get_userbyid(p.proowner), '<absent>'),
    coalesce(p.prosecdef::text, '<absent>'),
    coalesce(array_to_string(p.proconfig, ','), '<NULL>'),
    coalesce(array_to_string(p.proacl, ','), '<NULL>'),
    coalesce(md5(pg_get_functiondef(p.oid)), '<absent>')
  )::text AS row_data
  FROM preserved_function_names AS expected_function
  LEFT JOIN pg_catalog.pg_proc AS p
    ON p.oid = to_regprocedure(expected_function.function_identity)::oid
),
preserved_catalog_rows AS (
  SELECT row_data FROM preserved_relation_rows
  UNION ALL SELECT row_data FROM preserved_columns
  UNION ALL SELECT row_data FROM preserved_constraints
  UNION ALL SELECT row_data FROM preserved_indexes
  UNION ALL SELECT row_data FROM preserved_policies
  UNION ALL SELECT row_data FROM preserved_triggers
  UNION ALL SELECT row_data FROM preserved_functions
),
preserved_catalog AS (
  SELECT
    count(*)::bigint AS row_count,
    md5(coalesce(string_agg(row_data, E'\n' ORDER BY row_data), ''))::text AS fingerprint
  FROM preserved_catalog_rows
),
required_relations AS (
  SELECT
    count(*) FILTER (WHERE current_relation.oid IS NOT NULL)::integer AS present_count,
    coalesce(string_agg(
      expected_relation.schema_name || '.' || expected_relation.relation_name,
      ',' ORDER BY expected_relation.schema_name, expected_relation.relation_name
    ) FILTER (WHERE current_relation.oid IS NULL), '<none>')::text AS missing
  FROM preserved_relation_names AS expected_relation
  LEFT JOIN preserved_relations AS current_relation
    ON current_relation.schema_name = expected_relation.schema_name
   AND current_relation.relation_name = expected_relation.relation_name
),
required_routines AS (
  SELECT
    count(*) FILTER (WHERE current_routine.row_data NOT LIKE '%owner=<absent>%')::integer AS present_count,
    coalesce(string_agg(expected_function.function_identity, ',' ORDER BY expected_function.function_identity)
      FILTER (WHERE current_routine.row_data LIKE '%owner=<absent>%'), '<none>')::text AS missing
  FROM preserved_function_names AS expected_function
  JOIN preserved_functions AS current_routine
    ON current_routine.row_data LIKE 'routine|' || expected_function.function_identity || '|%'
),
legacy_reference_counts AS (
  SELECT
    (
      SELECT count(*)::bigint
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE p.prokind IN ('f', 'p')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND pg_get_functiondef(p.oid) ILIKE '%import_minerador_discovery_candidates%'
    ) AS function_references,
    (
      SELECT count(*)::bigint
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('v', 'm')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND pg_get_viewdef(c.oid, true) ILIKE '%import_minerador_discovery_candidates%'
    ) AS view_references
),
checks AS (
  SELECT
    'TARGET_FUNCTION_ABSENT'::text AS check_name,
    'public.import_minerador_discovery_candidates(uuid,uuid,uuid,uuid[])'::text AS object_name,
    CASE WHEN target.function_oid IS NULL THEN 'absent' ELSE format('present;oid=%s', target.function_oid) END::text AS observed,
    CASE WHEN target.function_oid IS NULL THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  FROM target

  UNION ALL

  SELECT
    'CANONICAL_RELATIONS'::text,
    'Minerador/Discovery preserved relations'::text,
    format('present=%s/9;missing=%s', required.present_count, required.missing)::text,
    CASE WHEN required.present_count = 9 THEN 'PASS' ELSE 'FAIL' END::text
  FROM required_relations AS required

  UNION ALL

  SELECT
    'CANONICAL_ROUTINES'::text,
    'Discovery and access routines preserved'::text,
    format('present=%s/6;missing=%s', required.present_count, required.missing)::text,
    CASE WHEN required.present_count = 6 THEN 'PASS' ELSE 'FAIL' END::text
  FROM required_routines AS required

  UNION ALL

  SELECT
    'LEGACY_DATABASE_REFERENCES'::text,
    'current functions and views'::text,
    format('functions=%s;views=%s', legacy_refs.function_references, legacy_refs.view_references)::text,
    CASE WHEN legacy_refs.function_references + legacy_refs.view_references = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM legacy_reference_counts AS legacy_refs

  UNION ALL

  SELECT
    'PRESERVED_DATA_ROW_COUNTS'::text,
    'Minerador/Discovery data snapshot'::text,
    current_snapshot.snapshot::text,
    CASE WHEN current_snapshot.snapshot = expected.data_row_counts THEN 'PASS' ELSE 'FAIL' END::text
  FROM preserved_data_snapshot AS current_snapshot
  CROSS JOIN expected

  UNION ALL

  SELECT
    'PRESERVED_CATALOG_ROWS'::text,
    'focused catalog snapshot excluding target RPC'::text,
    catalog_snapshot.row_count::text,
    CASE WHEN catalog_snapshot.row_count::text = expected.catalog_rows THEN 'PASS' ELSE 'FAIL' END::text
  FROM preserved_catalog AS catalog_snapshot
  CROSS JOIN expected

  UNION ALL

  SELECT
    'PRESERVED_CATALOG_FINGERPRINT'::text,
    'focused catalog snapshot excluding target RPC'::text,
    catalog_snapshot.fingerprint::text,
    CASE WHEN catalog_snapshot.fingerprint = expected.catalog_fingerprint THEN 'PASS' ELSE 'FAIL' END::text
  FROM preserved_catalog AS catalog_snapshot
  CROSS JOIN expected
),
final_result AS (
  SELECT check_name, object_name, observed, verdict FROM checks

  UNION ALL

  SELECT
    'POST_VERIFIER_GATE'::text,
    '0038_remove_legacy_minerador_discovery_import_rpc'::text,
    CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0
      THEN 'PASS_WITH_CANONICAL_IMPORT_FLOW_PRESERVED'
      ELSE 'BLOCKED'
    END::text,
    CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM checks
)
SELECT check_name, object_name, observed, verdict
FROM final_result
ORDER BY check_name, object_name;
