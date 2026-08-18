-- Minerador -> Arquiteto canonical rebaseline preflight (read-only), version 2026-08-12-v1.
-- Replace only REPLACE_WITH_BRAND_UUID with the canonical Brand UUID before execution.
WITH input AS (
  SELECT 'REPLACE_WITH_BRAND_UUID'::text AS target_brand_id_text
), target AS (
  SELECT CASE WHEN target_brand_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN target_brand_id_text::uuid ELSE NULL END AS brand_id
  FROM input
), keywords AS (
  SELECT k.id::text AS keyword_id, lower(btrim(coalesce(k.status, ''))) AS keyword_status
  FROM public.minerador_keywords k
  JOIN target t ON t.brand_id = k.brand_id
), workflows AS (
  SELECT w.id::text AS workflow_id, w.subject_id::text AS keyword_id, w.state
  FROM public.editorial_workflow_items w
  JOIN target t ON t.brand_id = w.marca_id
  WHERE w.subject_type = 'keyword' AND w.stage = 'architect'
), article_dna_keyword_ids AS (
  SELECT DISTINCT reference.value->>'keywordId' AS keyword_id
  FROM (
    SELECT v.*, row_number() OVER (PARTITION BY v.marca_id, v.entity_id ORDER BY v.version_number DESC) AS position
    FROM public.editorial_artifact_versions v
    JOIN target t ON t.brand_id = v.marca_id
    WHERE v.artifact_type = 'article_dna'
  ) v
  CROSS JOIN LATERAL jsonb_array_elements(CASE
    WHEN jsonb_typeof(v.payload->'keywordReferences') = 'array' THEN v.payload->'keywordReferences'
    ELSE '[]'::jsonb
  END) AS reference(value)
  WHERE v.position = 1
), classified AS (
  SELECT
    k.keyword_id,
    k.keyword_status,
    w.workflow_id,
    w.state AS workflow_state,
    CASE
      WHEN k.keyword_status NOT IN ('aprovado', 'publicado') THEN 'DISCARDED_OR_INVALID'
      WHEN a.keyword_id IS NOT NULL THEN 'ALREADY_ARTICLE_DNA'
      WHEN w.state = 'received' THEN 'ALREADY_RECEIVED'
      WHEN w.state = 'historical_import_protected' THEN 'REBASE_HISTORICAL_MARKER'
      WHEN w.workflow_id IS NOT NULL THEN 'INVESTIGATE_REMOTE_WORKFLOW'
      ELSE 'INSERT_RECEIVED'
    END AS disposition
  FROM keywords k
  LEFT JOIN workflows w ON w.keyword_id = k.keyword_id
  LEFT JOIN article_dna_keyword_ids a ON a.keyword_id = k.keyword_id
), counts AS (
  SELECT
    count(*)::integer AS total_keywords,
    count(*) FILTER (WHERE keyword_status IN ('aprovado', 'publicado'))::integer AS total_patrimony,
    count(*) FILTER (WHERE keyword_status = 'publicado')::integer AS published,
    count(*) FILTER (WHERE disposition = 'INSERT_RECEIVED')::integer AS insert_received,
    count(*) FILTER (WHERE disposition = 'REBASE_HISTORICAL_MARKER')::integer AS rebase_historical_marker,
    count(*) FILTER (WHERE disposition = 'ALREADY_RECEIVED')::integer AS already_received,
    count(*) FILTER (WHERE disposition = 'ALREADY_ARTICLE_DNA')::integer AS already_article_dna,
    count(*) FILTER (WHERE disposition = 'DISCARDED_OR_INVALID')::integer AS discarded_or_invalid,
    count(*) FILTER (WHERE disposition = 'INVESTIGATE_REMOTE_WORKFLOW')::integer AS investigate_remote_workflow
  FROM classified
), samples AS (
  SELECT disposition, string_agg(left(md5(keyword_id), 12), ',' ORDER BY keyword_id) AS fingerprints
  FROM (
    SELECT disposition, keyword_id, row_number() OVER (PARTITION BY disposition ORDER BY keyword_id) AS position
    FROM classified
  ) ranked
  WHERE position <= 5
  GROUP BY disposition
), relations AS (
  SELECT count(*)::integer AS present
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND c.relname IN ('minerador_keywords', 'editorial_workflow_items', 'editorial_artifact_versions')
), checks AS (
  SELECT 1 AS sort_order, 'script_version'::text AS check_name, '2026-08-12-v1'::text AS expected, '2026-08-12-v1'::text AS observed, 'INFO'::text AS verdict
  UNION ALL SELECT 2, 'target_brand_id', 'canonical UUID supplied', CASE WHEN brand_id IS NULL THEN 'replace_required' ELSE 'configured' END, CASE WHEN brand_id IS NULL THEN 'FAIL' ELSE 'PASS' END FROM target
  UNION ALL SELECT 3, 'relations:required', '3', present::text, CASE WHEN present = 3 THEN 'PASS' ELSE 'FAIL' END FROM relations
  UNION ALL SELECT 10, 'keywords:total', 'all statuses; no row content', total_keywords::text, 'INFO' FROM counts
  UNION ALL SELECT 11, 'keywords:valid_patrimony', 'approved + published', total_patrimony::text, 'INFO' FROM counts
  UNION ALL SELECT 12, 'keywords:published_protected', 'published retained as published', published::text, 'INFO' FROM counts
  UNION ALL SELECT 20, 'rebaseline:insert_received', 'new canonical workflow rows only', insert_received::text, 'INFO' FROM counts
  UNION ALL SELECT 21, 'rebaseline:historical_marker_to_received', 'existing legacy workflow transition only', rebase_historical_marker::text, 'INFO' FROM counts
  UNION ALL SELECT 22, 'rebaseline:already_received', 'no duplicate workflow', already_received::text, 'INFO' FROM counts
  UNION ALL SELECT 23, 'rebaseline:already_article_dna', 'no fabricated ArticleDNA', already_article_dna::text, 'INFO' FROM counts
  UNION ALL SELECT 24, 'rebaseline:discarded_or_invalid', 'no workflow operation', discarded_or_invalid::text, 'INFO' FROM counts
  UNION ALL SELECT 25, 'rebaseline:investigate_remote_workflow', '0 before execution', investigate_remote_workflow::text, CASE WHEN investigate_remote_workflow = 0 THEN 'PASS' ELSE 'FAIL' END FROM counts
  UNION ALL SELECT 30, 'sample:insert_received', 'up to 5 MD5 prefixes', coalesce((SELECT fingerprints FROM samples WHERE disposition = 'INSERT_RECEIVED'), 'none'), 'INFO'
  UNION ALL SELECT 31, 'sample:historical_marker_to_received', 'up to 5 MD5 prefixes', coalesce((SELECT fingerprints FROM samples WHERE disposition = 'REBASE_HISTORICAL_MARKER'), 'none'), 'INFO'
  UNION ALL SELECT 32, 'sample:investigate_remote_workflow', 'up to 5 MD5 prefixes', coalesce((SELECT fingerprints FROM samples WHERE disposition = 'INVESTIGATE_REMOTE_WORKFLOW'), 'none'), 'INFO'
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY sort_order;
