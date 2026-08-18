-- Diagnostico somente leitura para o contrato multi-source da Descoberta.
--
-- Execute manualmente no SQL Editor do projeto Supabase correto depois do
-- reset. Este arquivo nao cria, altera ou remove objetos e nao le dados de
-- outras marcas alem de contagens agregadas.

WITH expected(schema_name, table_name, role_name) AS (
  VALUES
    ('public'::text, 'minerador_discovery_runs'::text, 'DiscoveryRun'),
    ('public'::text, 'minerador_discovery_candidates'::text, 'DiscoveryCandidate'),
    ('public'::text, 'minerador_discovery_candidate_current_metrics'::text, 'DiscoveryCandidateCurrentMetrics'),
    ('public'::text, 'minerador_discovery_candidate_metric_history'::text, 'DiscoveryCandidateMetricHistory'),
    ('public'::text, 'minerador_keywords'::text, 'official_keyword_successor'),
    ('public'::text, 'keywords_kgr'::text, 'official_keyword_legacy'),
    ('public'::text, 'minerador_keyword_lists'::text, 'official_list_successor'),
    ('public'::text, 'listas_kgr'::text, 'official_list_legacy'),
    ('public'::text, 'editorial_workflow_items'::text, 'processor_handoff')
), resolved AS (
  SELECT
    e.schema_name,
    e.table_name,
    e.role_name,
    to_regclass(format('%I.%I', e.schema_name, e.table_name)) AS relation_oid
  FROM expected e
)
SELECT
  'relation_presence'::text AS result_set,
  schema_name || '.' || table_name AS object_name,
  role_name AS object_role,
  relation_oid IS NOT NULL AS relation_exists,
  NULL::text AS detail
FROM resolved
ORDER BY object_name;

WITH expected(schema_name, table_name) AS (
  VALUES
    ('public'::text, 'minerador_discovery_runs'::text),
    ('public'::text, 'minerador_discovery_candidates'::text),
    ('public'::text, 'minerador_discovery_candidate_current_metrics'::text),
    ('public'::text, 'minerador_discovery_candidate_metric_history'::text),
    ('public'::text, 'minerador_keywords'::text),
    ('public'::text, 'keywords_kgr'::text),
    ('public'::text, 'minerador_keyword_lists'::text),
    ('public'::text, 'listas_kgr'::text),
    ('public'::text, 'editorial_workflow_items'::text)
), relations AS (
  SELECT e.schema_name, e.table_name, to_regclass(format('%I.%I', e.schema_name, e.table_name)) AS relation_oid
  FROM expected e
)
SELECT
  'columns'::text AS result_set,
  r.schema_name || '.' || r.table_name AS object_name,
  a.attnum AS ordinal_position,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  NOT a.attnotnull AS is_nullable,
  pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS default_expression,
  CASE
    WHEN a.attname IN (
      'source', 'provider', 'provider_version', 'seed', 'seed_original',
      'seed_canonical', 'targeting', 'currency_code', 'time_zone',
      'measured_at', 'average_monthly_searches', 'volume_search',
      'monthly_search_volumes', 'average_cpc_micros', 'competition',
      'competition_index', 'results_allintitle', 'lista_id', 'silo_id'
    ) THEN true
    ELSE false
  END AS multi_source_relevant
FROM relations r
JOIN pg_catalog.pg_attribute a ON a.attrelid = r.relation_oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE r.relation_oid IS NOT NULL
ORDER BY object_name, a.attnum;

WITH expected(schema_name, table_name) AS (
  VALUES
    ('public'::text, 'minerador_discovery_runs'::text),
    ('public'::text, 'minerador_discovery_candidates'::text),
    ('public'::text, 'minerador_discovery_candidate_current_metrics'::text),
    ('public'::text, 'minerador_discovery_candidate_metric_history'::text),
    ('public'::text, 'minerador_keywords'::text),
    ('public'::text, 'keywords_kgr'::text),
    ('public'::text, 'minerador_keyword_lists'::text),
    ('public'::text, 'listas_kgr'::text),
    ('public'::text, 'editorial_workflow_items'::text)
), relations AS (
  SELECT e.schema_name, e.table_name, to_regclass(format('%I.%I', e.schema_name, e.table_name)) AS relation_oid
  FROM expected e
)
SELECT
  'constraints'::text AS result_set,
  r.schema_name || '.' || r.table_name AS object_name,
  c.conname AS constraint_name,
  CASE c.contype
    WHEN 'c' THEN 'check'
    WHEN 'f' THEN 'foreign_key'
    WHEN 'p' THEN 'primary_key'
    WHEN 'u' THEN 'unique'
    WHEN 'x' THEN 'exclusion'
    ELSE c.contype::text
  END AS constraint_type,
  pg_catalog.pg_get_constraintdef(c.oid, true) AS definition
FROM relations r
JOIN pg_catalog.pg_constraint c ON c.conrelid = r.relation_oid
WHERE r.relation_oid IS NOT NULL
ORDER BY object_name, constraint_name;

WITH expected(schema_name, table_name) AS (
  VALUES
    ('public'::text, 'minerador_discovery_runs'::text),
    ('public'::text, 'minerador_discovery_candidates'::text),
    ('public'::text, 'minerador_discovery_candidate_current_metrics'::text),
    ('public'::text, 'minerador_discovery_candidate_metric_history'::text),
    ('public'::text, 'minerador_keywords'::text),
    ('public'::text, 'keywords_kgr'::text),
    ('public'::text, 'minerador_keyword_lists'::text),
    ('public'::text, 'listas_kgr'::text),
    ('public'::text, 'editorial_workflow_items'::text)
), relations AS (
  SELECT e.schema_name, e.table_name, to_regclass(format('%I.%I', e.schema_name, e.table_name)) AS relation_oid
  FROM expected e
)
SELECT
  'indexes'::text AS result_set,
  r.schema_name || '.' || r.table_name AS object_name,
  idx.relname AS index_name,
  pg_catalog.pg_get_indexdef(i.indexrelid) AS definition,
  i.indisunique AS is_unique,
  i.indisprimary AS is_primary
FROM relations r
JOIN pg_catalog.pg_index i ON i.indrelid = r.relation_oid
JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
WHERE r.relation_oid IS NOT NULL
ORDER BY object_name, index_name;

WITH expected(schema_name, table_name) AS (
  VALUES
    ('public'::text, 'minerador_discovery_runs'::text),
    ('public'::text, 'minerador_discovery_candidates'::text),
    ('public'::text, 'minerador_discovery_candidate_current_metrics'::text),
    ('public'::text, 'minerador_discovery_candidate_metric_history'::text),
    ('public'::text, 'minerador_keywords'::text),
    ('public'::text, 'keywords_kgr'::text),
    ('public'::text, 'minerador_keyword_lists'::text),
    ('public'::text, 'listas_kgr'::text),
    ('public'::text, 'editorial_workflow_items'::text)
), relations AS (
  SELECT e.schema_name, e.table_name, to_regclass(format('%I.%I', e.schema_name, e.table_name)) AS relation_oid
  FROM expected e
)
SELECT
  'rls_and_counts'::text AS result_set,
  r.schema_name || '.' || r.table_name AS object_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  c.reltuples::bigint AS estimated_row_count,
  c.relkind
FROM relations r
LEFT JOIN pg_catalog.pg_class c ON c.oid = r.relation_oid;

SELECT
  'policies'::text AS result_set,
  schemaname || '.' || tablename AS object_name,
  policyname,
  permissive,
  roles::text AS roles,
  cmd,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'minerador_discovery_runs',
    'minerador_discovery_candidates',
    'minerador_discovery_candidate_current_metrics',
    'minerador_discovery_candidate_metric_history',
    'minerador_keywords',
    'keywords_kgr',
    'minerador_keyword_lists',
    'listas_kgr',
    'editorial_workflow_items'
  )
ORDER BY object_name, policyname;

SELECT
  'table_grants'::text AS result_set,
  table_schema || '.' || table_name AS object_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'minerador_discovery_runs',
    'minerador_discovery_candidates',
    'minerador_discovery_candidate_current_metrics',
    'minerador_discovery_candidate_metric_history',
    'minerador_keywords',
    'keywords_kgr',
    'minerador_keyword_lists',
    'listas_kgr',
    'editorial_workflow_items'
  )
ORDER BY object_name, grantee, privilege_type;

SELECT
  'functions'::text AS result_set,
  n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS signature,
  p.prosecdef AS security_definer,
  pg_catalog.pg_get_function_result(p.oid) AS return_type,
  CASE
    WHEN p.prosrc ILIKE '%minerador_discovery_runs%'
      OR p.prosrc ILIKE '%minerador_discovery_candidates%'
      OR p.prosrc ILIKE '%keywords_kgr%'
      OR p.prosrc ILIKE '%minerador_keywords%'
    THEN true ELSE false
  END AS references_minerador_entities
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private')
  AND (
    p.prosrc ILIKE '%minerador_discovery_runs%'
    OR p.prosrc ILIKE '%minerador_discovery_candidates%'
    OR p.prosrc ILIKE '%keywords_kgr%'
    OR p.prosrc ILIKE '%minerador_keywords%'
  )
ORDER BY signature;

-- Verificacao objetiva da lacuna multi-source. Esta consulta nao grava nada.
WITH run_columns AS (
  SELECT a.attname, NOT a.attnotnull AS nullable
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = to_regclass('public.minerador_discovery_runs')
    AND a.attnum > 0
    AND NOT a.attisdropped
), candidate_columns AS (
  SELECT a.attname, NOT a.attnotnull AS nullable
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = to_regclass('public.minerador_discovery_candidates')
    AND a.attnum > 0
    AND NOT a.attisdropped
), run_provider_checks AS (
  SELECT bool_or(pg_catalog.pg_get_constraintdef(c.oid, true) ILIKE '%provider = ''google_ads''%') AS google_only_provider,
         bool_or(pg_catalog.pg_get_constraintdef(c.oid, true) ILIKE '%provider_version = ''v25''%') AS v25_only_provider
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = to_regclass('public.minerador_discovery_runs')
    AND c.contype = 'c'
), candidate_provider_checks AS (
  SELECT bool_or(pg_catalog.pg_get_constraintdef(c.oid, true) ILIKE '%provider = ''google_ads''%') AS google_only_provider,
         bool_or(pg_catalog.pg_get_constraintdef(c.oid, true) ILIKE '%provider_version = ''v25''%') AS v25_only_provider
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = to_regclass('public.minerador_discovery_candidates')
    AND c.contype = 'c'
)
SELECT
  'multi_source_gap_summary'::text AS result_set,
  to_regclass('public.minerador_discovery_runs') IS NOT NULL AS discovery_run_exists,
  to_regclass('public.minerador_discovery_candidates') IS NOT NULL AS discovery_candidate_exists,
  COALESCE((SELECT NOT nullable FROM run_columns WHERE attname = 'provider'), false) AS run_provider_required,
  COALESCE((SELECT NOT nullable FROM run_columns WHERE attname = 'provider_version'), false) AS run_provider_version_required,
  COALESCE((SELECT NOT nullable FROM run_columns WHERE attname = 'currency_code'), false) AS run_currency_required,
  COALESCE((SELECT NOT nullable FROM run_columns WHERE attname = 'time_zone'), false) AS run_timezone_required,
  COALESCE((SELECT NOT nullable FROM candidate_columns WHERE attname = 'provider'), false) AS candidate_provider_required,
  COALESCE((SELECT NOT nullable FROM candidate_columns WHERE attname = 'provider_version'), false) AS candidate_provider_version_required,
  COALESCE((SELECT NOT nullable FROM candidate_columns WHERE attname = 'targeting'), false) AS candidate_targeting_required,
  COALESCE((SELECT NOT nullable FROM candidate_columns WHERE attname = 'currency_code'), false) AS candidate_currency_required,
  COALESCE((SELECT NOT nullable FROM candidate_columns WHERE attname = 'time_zone'), false) AS candidate_timezone_required,
  COALESCE((SELECT NOT nullable FROM candidate_columns WHERE attname = 'measured_at'), false) AS candidate_measured_at_required,
  COALESCE((SELECT google_only_provider FROM run_provider_checks), false) AS run_provider_google_only,
  COALESCE((SELECT v25_only_provider FROM run_provider_checks), false) AS run_provider_v25_only,
  COALESCE((SELECT google_only_provider FROM candidate_provider_checks), false) AS candidate_provider_google_only,
  COALESCE((SELECT v25_only_provider FROM candidate_provider_checks), false) AS candidate_provider_v25_only,
  CASE
    WHEN to_regclass('public.minerador_discovery_runs') IS NULL
      OR to_regclass('public.minerador_discovery_candidates') IS NULL
    THEN 'SCHEMA_MISSING'
    WHEN EXISTS (SELECT 1 FROM run_columns WHERE attname IN ('provider', 'provider_version', 'currency_code', 'time_zone') AND NOT nullable)
      OR EXISTS (SELECT 1 FROM candidate_columns WHERE attname IN ('provider', 'provider_version', 'targeting', 'currency_code', 'time_zone', 'measured_at') AND NOT nullable)
      OR COALESCE((SELECT google_only_provider FROM run_provider_checks), false)
      OR COALESCE((SELECT google_only_provider FROM candidate_provider_checks), false)
    THEN 'SCHEMA_CHANGE_REQUIRED_FOR_MULTI_SOURCE'
    ELSE 'NO_REQUIRED_MULTI_SOURCE_GAP_DETECTED_BY_THIS_CHECK'
  END AS classification;
