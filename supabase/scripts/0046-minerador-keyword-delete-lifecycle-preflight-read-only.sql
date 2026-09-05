-- 0046 preflight — somente leitura.
-- Executar antes de qualquer apply manual. Este script não cria sessão,
-- tabela temporária, função, índice, coluna, linha ou alteração de ACL.

WITH target AS (
  SELECT c.oid, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'minerador_keywords'
    AND c.relkind IN ('r', 'p')
),
target_columns AS (
  SELECT
    count(*) FILTER (WHERE a.attname = 'deleted_at')::integer AS deleted_at_count,
    count(*) FILTER (WHERE a.attname = 'purge_after')::integer AS purge_after_count,
    max(format_type(a.atttypid, a.atttypmod)) FILTER (WHERE a.attname = 'deleted_at')::text AS deleted_at_type,
    max(format_type(a.atttypid, a.atttypmod)) FILTER (WHERE a.attname = 'purge_after')::text AS purge_after_type
  FROM target t
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid = t.oid
   AND a.attnum > 0
   AND NOT a.attisdropped
),
table_acl AS (
  SELECT coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner)) AS acl
  FROM target t
  JOIN pg_catalog.pg_class c ON c.oid = t.oid
),
expected_fk(conname, source_schema, source_table, target_schema, target_table, delete_action) AS (
  VALUES
    ('minerador_keyword_metric_measurements_keyword_id_fkey'::text, 'public'::text, 'minerador_keyword_metric_measurements'::text, 'public'::text, 'minerador_keywords'::text, 'CASCADE'::text),
    ('minerador_discovery_keyword_origins_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_keyword_origins'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text),
    ('minerador_discovery_candidates_existing_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidates'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text),
    ('minerador_discovery_candidates_imported_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidates'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text),
    ('minerador_discovery_candidate_current_metrics_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidate_current_metrics'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text),
    ('minerador_discovery_candidate_metric_history_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidate_metric_history'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text)
),
actual_fk AS (
  SELECT
    c.conname::text AS conname,
    sn.nspname::text AS source_schema,
    src.relname::text AS source_table,
    tn.nspname::text AS target_schema,
    target.relname::text AS target_table,
    CASE c.confdeltype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE 'UNKNOWN'
    END::text AS delete_action
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class src ON src.oid = c.conrelid
  JOIN pg_catalog.pg_namespace sn ON sn.oid = src.relnamespace
  JOIN pg_catalog.pg_class target ON target.oid = c.confrelid
  JOIN pg_catalog.pg_namespace tn ON tn.oid = target.relnamespace
  WHERE c.contype = 'f'
    AND tn.nspname = 'public'
    AND target.relname = 'minerador_keywords'
),
fk_summary AS (
  SELECT
    (SELECT count(*) FROM expected_fk)::integer AS expected_count,
    (SELECT count(*) FROM expected_fk e JOIN actual_fk a USING (conname, source_schema, source_table, target_schema, target_table, delete_action))::integer AS matched_count,
    (SELECT count(*) FROM actual_fk a LEFT JOIN expected_fk e USING (conname, source_schema, source_table, target_schema, target_table, delete_action) WHERE e.conname IS NULL)::integer AS unexpected_count
),
checks AS (
  SELECT
    'TARGET_TABLE'::text AS check_name,
    'public.minerador_keywords'::text AS object_name,
    CASE WHEN EXISTS (SELECT 1 FROM target) THEN 'present' ELSE 'absent' END::text AS observed,
    CASE WHEN EXISTS (SELECT 1 FROM target) THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  UNION ALL
  SELECT
    'TOMBSTONE_COLUMNS_PRESTATE'::text,
    'public.minerador_keywords'::text,
    format('deleted_at=%s(%s); purge_after=%s(%s)', deleted_at_count, coalesce(deleted_at_type, '<absent>'), purge_after_count, coalesce(purge_after_type, '<absent>'))::text,
    CASE
      WHEN deleted_at_count = 0 AND purge_after_count = 0 THEN 'PASS_EXPECTED_PRE_MIGRATION'
      WHEN deleted_at_count = 1 AND purge_after_count = 1 AND deleted_at_type = 'timestamp with time zone' AND purge_after_type = 'timestamp with time zone' THEN 'INFO_ALREADY_APPLIED'
      ELSE 'FAIL'
    END::text
  FROM target_columns
  UNION ALL
  SELECT
    'RLS'::text,
    'public.minerador_keywords'::text,
    format('enabled=%s; forced=%s', coalesce(relrowsecurity::text, '<absent>'), coalesce(relforcerowsecurity::text, '<absent>'))::text,
    CASE WHEN relrowsecurity IS TRUE AND relforcerowsecurity IS FALSE THEN 'PASS' ELSE 'FAIL' END::text
  FROM target
  UNION ALL
  SELECT
    'DEPENDENCY_RELATIONS'::text,
    '0046'::text,
    format('metrics=%s; origins=%s; candidates=%s; current_metrics=%s; metric_history=%s; workflow=%s; decision_events=%s',
      to_regclass('public.minerador_keyword_metric_measurements') IS NOT NULL,
      to_regclass('public.minerador_discovery_keyword_origins') IS NOT NULL,
      to_regclass('public.minerador_discovery_candidates') IS NOT NULL,
      to_regclass('public.minerador_discovery_candidate_current_metrics') IS NOT NULL,
      to_regclass('public.minerador_discovery_candidate_metric_history') IS NOT NULL,
      to_regclass('public.editorial_workflow_items') IS NOT NULL,
      to_regclass('public.editorial_decision_events') IS NOT NULL)::text,
    CASE WHEN to_regclass('public.minerador_keyword_metric_measurements') IS NOT NULL
      AND to_regclass('public.minerador_discovery_keyword_origins') IS NOT NULL
      AND to_regclass('public.minerador_discovery_candidates') IS NOT NULL
      AND to_regclass('public.minerador_discovery_candidate_current_metrics') IS NOT NULL
      AND to_regclass('public.minerador_discovery_candidate_metric_history') IS NOT NULL
      AND to_regclass('public.editorial_workflow_items') IS NOT NULL
      AND to_regclass('public.editorial_decision_events') IS NOT NULL
      THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'FOREIGN_KEYS'::text,
    'public.minerador_keywords'::text,
    format('expected=%s; matched=%s; unexpected=%s', expected_count, matched_count, unexpected_count)::text,
    CASE WHEN expected_count = matched_count AND unexpected_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM fk_summary
  UNION ALL
  SELECT
    'PUBLISHED_PROTECTION_TRIGGER'::text,
    'public.protect_published_keyword()'::text,
    CASE WHEN to_regprocedure('public.protect_published_keyword()') IS NULL THEN 'absent' ELSE 'present' END::text,
    CASE WHEN to_regprocedure('public.protect_published_keyword()') IS NULL THEN 'FAIL' ELSE 'PASS' END::text
  UNION ALL
  SELECT
    'CANONICAL_ACTOR_AUTHORIZATION'::text,
    'public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)'::text,
    CASE WHEN to_regprocedure('public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)') IS NULL THEN 'absent' ELSE 'present' END::text,
    CASE WHEN to_regprocedure('public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)') IS NULL THEN 'FAIL' ELSE 'PASS' END::text
  UNION ALL
  SELECT
    'DIRECT_DELETE_GRANT_PRESTATE'::text,
    'public.minerador_keywords'::text,
    format('PUBLIC=%s; anon=%s; authenticated=%s; service_role=%s',
       coalesce((SELECT bool_or(grantee = 0 AND privilege_type = 'DELETE') FROM table_acl, pg_catalog.aclexplode(table_acl.acl)), false),
      has_table_privilege('anon', 'public.minerador_keywords', 'DELETE'),
      has_table_privilege('authenticated', 'public.minerador_keywords', 'DELETE'),
      has_table_privilege('service_role', 'public.minerador_keywords', 'DELETE'))::text,
    'INFO_EXPECTED_TO_BE_REVOKED_BY_0046'::text
  UNION ALL
  SELECT
    'NEW_LIFECYCLE_FUNCTIONS'::text,
    'public.delete_minerador_keywords / recover_minerador_keywords / purge_minerador_keywords'::text,
    format('delete=%s; recover=%s; purge=%s',
      to_regprocedure('public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)') IS NOT NULL,
      to_regprocedure('public.recover_minerador_keywords(uuid,uuid[],uuid)') IS NOT NULL,
      to_regprocedure('public.purge_minerador_keywords(uuid,uuid[],uuid)') IS NOT NULL)::text,
    CASE WHEN to_regprocedure('public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)') IS NULL
      AND to_regprocedure('public.recover_minerador_keywords(uuid,uuid[],uuid)') IS NULL
      AND to_regprocedure('public.purge_minerador_keywords(uuid,uuid[],uuid)') IS NULL
      THEN 'PASS_EXPECTED_PRE_MIGRATION' ELSE 'INFO_ALREADY_APPLIED_OR_PARTIAL' END::text
)
SELECT check_name, object_name, observed, verdict
FROM checks
ORDER BY check_name, object_name;
