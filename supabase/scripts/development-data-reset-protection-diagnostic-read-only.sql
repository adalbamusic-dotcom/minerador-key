-- DEVELOPMENT DATA RESET protection diagnostic (read-only), version 2026-08-12-v2.
-- One sanitized result set. It reads catalog metadata only.
WITH expected AS (
  SELECT * FROM (VALUES
    ('minerador_keywords', 'trg_protect_published_keyword'),
    ('minerador_keyword_lists', 'trg_protect_published_lista'),
    ('marcas', 'trg_protect_marca_with_published'),
    ('minerador_discovery_runs', 'minerador_discovery_run_immutable'),
    ('editorial_artifact_versions', 'editorial_artifact_versions_append_only_trg'),
    ('editorial_serp_snapshots', 'editorial_serp_snapshots_append_only_trg'),
    ('editorial_serp_reviews', 'editorial_serp_reviews_append_only_trg'),
    ('content_document_versions', 'content_document_versions_append_only_trg'),
    ('integration_usage_events', 'trg_integration_usage_events_append_only_0024'),
    ('brand_exceptional_operation_execution_events', 'brand_exceptional_operation_execution_events_append_only_trg_0030')
  ) AS value(table_name, trigger_name)
), checks AS (
  SELECT 1 AS sort_order, 'script_version'::text AS check_name,
    '2026-08-12-v2'::text AS expected, '2026-08-12-v2'::text AS observed, 'INFO'::text AS verdict
  UNION ALL
  SELECT 10, 'trigger:' || e.table_name || ':' || e.trigger_name,
    'present and enabled (O, R or A)',
    CASE t.tgenabled
      WHEN 'O' THEN 'enabled_origin'
      WHEN 'R' THEN 'enabled_replica'
      WHEN 'A' THEN 'enabled_always'
      WHEN 'D' THEN 'disabled'
      ELSE 'missing'
    END,
    CASE WHEN t.oid IS NOT NULL AND t.tgenabled IN ('O', 'R', 'A') THEN 'PASS' ELSE 'FAIL' END
  FROM expected e
  LEFT JOIN pg_catalog.pg_trigger t
    ON t.tgrelid = to_regclass('public.' || e.table_name)
    AND t.tgname = e.trigger_name
    AND NOT t.tgisinternal
  UNION ALL
  SELECT 15,
    'catalog:brand_exceptional_operation_execution_events:trigger:' || t.tgname,
    'catalog inventory only',
    'enabled=' || CASE t.tgenabled
      WHEN 'O' THEN 'origin'
      WHEN 'R' THEN 'replica'
      WHEN 'A' THEN 'always'
      WHEN 'D' THEN 'disabled'
      ELSE 'unknown'
    END || ';function=' || coalesce(p.proname, 'unresolved'),
    'INFO'
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public'
    AND c.relname = 'brand_exceptional_operation_execution_events'
    AND NOT t.tgisinternal
  UNION ALL
  SELECT 16,
    'function:brand_exceptional_operation_execution_events:append_only_guard',
    'pipeline_editorial_protect_append_only present',
    CASE WHEN to_regprocedure('public.pipeline_editorial_protect_append_only()') IS NULL THEN 'missing' ELSE 'present' END,
    CASE WHEN to_regprocedure('public.pipeline_editorial_protect_append_only()') IS NULL THEN 'FAIL' ELSE 'PASS' END
  UNION ALL
  SELECT 20, 'trigger:briefings_artigos:trg_protect_published_briefing',
    'not applicable when table is absent; otherwise present and enabled (O, R or A)',
    CASE
      WHEN to_regclass('public.briefings_artigos') IS NULL THEN 'table_absent'
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid = 'public.briefings_artigos'::regclass
          AND t.tgname = 'trg_protect_published_briefing' AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'R', 'A')
      ) THEN 'enabled'
      ELSE 'missing_or_disabled'
    END,
    CASE
      WHEN to_regclass('public.briefings_artigos') IS NULL THEN 'INFO'
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid = 'public.briefings_artigos'::regclass
          AND t.tgname = 'trg_protect_published_briefing' AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'R', 'A')
      ) THEN 'PASS'
      ELSE 'FAIL'
    END
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY sort_order, check_name;
