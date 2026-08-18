-- Minerador -> Arquiteto runtime diagnostic (read-only) -- version 2026-08-12-v1
-- Antes de executar, substitua somente o UUID abaixo pelo brandId canônico da Brand.
-- Não use nome, slug, e-mail ou owner para selecionar o tenant.
WITH input AS (
  SELECT 'REPLACE_WITH_BRAND_UUID'::text AS target_brand_id_text
), target AS (
  SELECT CASE
    WHEN target_brand_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN target_brand_id_text::uuid
    ELSE NULL
  END AS brand_id
  FROM input
), workflow AS (
  SELECT w.*
  FROM public.editorial_workflow_items w
  JOIN target t ON t.brand_id = w.marca_id
  WHERE w.stage = 'architect'
), keyword_counts AS (
  SELECT
    count(*)::integer AS total,
    count(*) FILTER (WHERE lower(k.status) = 'aprovado')::integer AS approved,
    count(*) FILTER (
      WHERE lower(k.status) = 'aprovado'
        AND NOT EXISTS (
          SELECT 1 FROM workflow w
          WHERE w.subject_type = 'keyword' AND w.subject_id = k.id::text
        )
    )::integer AS eligible_for_new_handoff
  FROM public.minerador_keywords k
  JOIN target t ON t.brand_id = k.brand_id
), workflow_counts AS (
  SELECT
    count(*)::integer AS total,
    count(*) FILTER (WHERE subject_type = 'keyword' AND state = 'received')::integer AS received_keywords,
    count(*) FILTER (WHERE subject_type = 'keyword' AND state = 'historical_import_protected')::integer AS historical_protected_keywords
  FROM workflow
), workflow_by_subject_type AS (
  SELECT coalesce(jsonb_object_agg(subject_type, total ORDER BY subject_type), '{}'::jsonb) AS value
  FROM (SELECT subject_type, count(*)::integer AS total FROM workflow GROUP BY subject_type) counts
), workflow_by_state AS (
  SELECT coalesce(jsonb_object_agg(state, total ORDER BY state), '{}'::jsonb) AS value
  FROM (SELECT state, count(*)::integer AS total FROM workflow GROUP BY state) counts
), artifact_counts AS (
  SELECT
    count(*) FILTER (WHERE artifact_type = 'article_dna')::integer AS article_dna_versions,
    count(*) FILTER (WHERE artifact_type = 'article_dna' AND previous_version_id IS NULL)::integer AS article_dna_entities_with_initial_version,
    count(*)::integer AS total_versions
  FROM public.editorial_artifact_versions a
  JOIN target t ON t.brand_id = a.marca_id
), relation_metadata AS (
  SELECT count(*)::integer AS present
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relname IN ('minerador_keywords', 'editorial_workflow_items', 'editorial_artifact_versions')
)
SELECT 'script_version'::text AS check_name, '2026-08-12-v1'::text AS observed, 'INFO'::text AS verdict
UNION ALL
SELECT 'target_brand_id', CASE WHEN brand_id IS NULL THEN 'replace_required' ELSE 'configured' END, CASE WHEN brand_id IS NULL THEN 'FAIL' ELSE 'PASS' END FROM target
UNION ALL
SELECT 'minerador_keywords:total', total::text, 'INFO' FROM keyword_counts
UNION ALL
SELECT 'minerador_keywords:approved', approved::text, 'INFO' FROM keyword_counts
UNION ALL
SELECT 'minerador_keywords:eligible_for_new_handoff', eligible_for_new_handoff::text, 'INFO' FROM keyword_counts
UNION ALL
SELECT 'editorial_workflow_items:architect_total', total::text, 'INFO' FROM workflow_counts
UNION ALL
SELECT 'editorial_workflow_items:architect_received_keywords', received_keywords::text, 'INFO' FROM workflow_counts
UNION ALL
SELECT 'editorial_workflow_items:historical_import_protected_keywords', historical_protected_keywords::text, 'INFO' FROM workflow_counts
UNION ALL
SELECT 'editorial_workflow_items:architect_by_subject_type', value::text, 'INFO' FROM workflow_by_subject_type
UNION ALL
SELECT 'editorial_workflow_items:architect_by_state', value::text, 'INFO' FROM workflow_by_state
UNION ALL
SELECT 'editorial_artifact_versions:article_dna_versions', article_dna_versions::text, 'INFO' FROM artifact_counts
UNION ALL
SELECT 'editorial_artifact_versions:article_dna_initial_versions', article_dna_entities_with_initial_version::text, 'INFO' FROM artifact_counts
UNION ALL
SELECT 'editorial_artifact_versions:total_versions', total_versions::text, 'INFO' FROM artifact_counts
UNION ALL
SELECT 'repositories:required_relations_present', present::text, CASE WHEN present = 3 THEN 'PASS' ELSE 'FAIL' END FROM relation_metadata
ORDER BY check_name;
