-- PIPELINE GOLDEN PATH TRACE
-- script_version: 2026-08-11-pipeline-golden-path-v1
-- READ-ONLY. Executar somente depois do catalog diagnostic confirmar as tabelas.
-- Retorna metadados sanitizados; nao retorna payload, documentos, prompts ou dados pessoais.
-- Uma unica consulta/result set.

WITH
targets(target_label, normalized_keyword) AS (
  VALUES
    ('seo_para_clinicas', 'seo para clinicas'),
    ('trafego_pago_vs_organico_clinica_estetica', 'tráfego pago vs orgânico para clínica de estética')
),
keyword_hits AS (
  SELECT
    t.target_label,
    k.id::text AS keyword_id,
    k.brand_id::text AS brand_id,
    lower(regexp_replace(btrim(k.keyword), '\s+', ' ', 'g')) AS normalized_keyword,
    k.keyword
  FROM targets t
  JOIN public.minerador_keywords k
    ON lower(regexp_replace(btrim(k.keyword), '\s+', ' ', 'g')) = t.normalized_keyword
),
linked_artifacts AS (
  SELECT
    h.target_label,
    h.keyword_id,
    h.brand_id,
    v.artifact_type,
    v.entity_id::text AS entity_id,
    v.version_id::text AS version_id,
    v.version_number,
    CASE
      WHEN v.entity_id::text = h.keyword_id THEN 'entity_id'
      WHEN v.payload::text ILIKE '%' || h.keyword_id || '%' THEN 'payload_keyword_id'
      WHEN v.payload::text ILIKE '%' || h.keyword || '%' THEN 'payload_keyword_text'
      ELSE 'brand_only'
    END AS link_basis
  FROM keyword_hits h
  JOIN public.editorial_artifact_versions v
    ON v.marca_id::text = h.brand_id
   AND (
     v.entity_id::text = h.keyword_id
     OR v.payload::text ILIKE '%' || h.keyword_id || '%'
     OR v.payload::text ILIKE '%' || h.keyword || '%'
   )
),
artifact_statuses AS (
  SELECT DISTINCT
    l.target_label,
    l.keyword_id,
    l.brand_id,
    l.artifact_type,
    l.version_id,
    e.status
  FROM linked_artifacts l
  JOIN public.editorial_version_status_events e
    ON e.version_id = l.version_id
),
article_entities AS (
  SELECT DISTINCT target_label, keyword_id, brand_id, entity_id AS article_id
  FROM linked_artifacts
  WHERE artifact_type = 'article_dna'
),
workflow_matches AS (
  SELECT DISTINCT
    h.target_label,
    h.keyword_id,
    h.brand_id,
    w.id::text AS workflow_item_id,
    w.stage,
    w.state
  FROM keyword_hits h
  JOIN public.editorial_workflow_items w
    ON w.marca_id::text = h.brand_id
   AND (
     EXISTS (SELECT 1 FROM article_entities a WHERE a.target_label = h.target_label AND a.keyword_id = h.keyword_id AND a.brand_id = h.brand_id AND a.article_id = w.article_id::text)
     OR w.article_id::text = h.keyword_id
     OR w.payload::text ILIKE '%' || h.keyword_id || '%'
     OR w.payload::text ILIKE '%' || h.keyword || '%'
   )
),
serp_matches AS (
  SELECT DISTINCT h.target_label, h.keyword_id, h.brand_id, s.id::text AS snapshot_id
  FROM keyword_hits h
  JOIN public.editorial_serp_snapshots s
    ON s.marca_id::text = h.brand_id
   AND (
     EXISTS (SELECT 1 FROM article_entities a WHERE a.target_label = h.target_label AND a.keyword_id = h.keyword_id AND a.brand_id = h.brand_id AND a.article_id = s.article_id::text)
     OR s.article_id::text = h.keyword_id
   )
),
document_matches AS (
  SELECT DISTINCT h.target_label, h.keyword_id, h.brand_id, d.id::text AS document_id
  FROM keyword_hits h
  JOIN public.content_documents d
    ON d.marca_id::text = h.brand_id
   AND (
     EXISTS (SELECT 1 FROM article_entities a WHERE a.target_label = h.target_label AND a.keyword_id = h.keyword_id AND a.brand_id = h.brand_id AND a.article_id = d.article_id::text)
     OR d.article_id::text = h.keyword_id
     OR d.payload::text ILIKE '%' || h.keyword_id || '%'
     OR d.payload::text ILIKE '%' || h.keyword || '%'
   )
),
publication_matches AS (
  SELECT DISTINCT h.target_label, h.keyword_id, h.brand_id, p.id::text AS publication_record_id
  FROM keyword_hits h
  JOIN public.publication_records p
    ON p.marca_id::text = h.brand_id
   AND (
     EXISTS (SELECT 1 FROM article_entities a WHERE a.target_label = h.target_label AND a.keyword_id = h.keyword_id AND a.brand_id = h.brand_id AND a.article_id = p.article_id::text)
     OR p.article_id::text = h.keyword_id
     OR p.payload::text ILIKE '%' || h.keyword_id || '%'
     OR p.payload::text ILIKE '%' || h.keyword || '%'
   )
),
summary AS (
  SELECT
    t.target_label,
    h.keyword_id,
    h.brand_id,
    CASE WHEN h.keyword_id IS NULL THEN 'NOT_FOUND' ELSE 'FOUND' END AS keyword_status,
    COALESCE((SELECT string_agg(DISTINCT a.article_id, ', ' ORDER BY a.article_id) FROM article_entities a WHERE a.target_label = t.target_label AND a.keyword_id = h.keyword_id AND a.brand_id = h.brand_id), '(none)') AS successor_entity_ids,
    COALESCE((SELECT string_agg(DISTINCT l.artifact_type || ':v' || l.version_number::text, ', ' ORDER BY l.artifact_type || ':v' || l.version_number::text) FROM linked_artifacts l WHERE l.target_label = t.target_label AND l.keyword_id = h.keyword_id AND l.brand_id = h.brand_id), '(none)') AS artifact_type_versions,
    COALESCE((SELECT string_agg(DISTINCT s.artifact_type || ':' || s.status, ', ' ORDER BY s.artifact_type || ':' || s.status) FROM artifact_statuses s WHERE s.target_label = t.target_label AND s.keyword_id = h.keyword_id AND s.brand_id = h.brand_id), '(none)') AS artifact_statuses,
    COALESCE((SELECT string_agg(DISTINCT w.workflow_item_id || ':' || w.stage || ':' || w.state, ', ' ORDER BY w.workflow_item_id || ':' || w.stage || ':' || w.state) FROM workflow_matches w WHERE w.target_label = t.target_label AND w.keyword_id = h.keyword_id AND w.brand_id = h.brand_id), '(none)') AS workflow_items,
    CASE WHEN EXISTS (SELECT 1 FROM linked_artifacts l WHERE l.target_label = t.target_label AND l.keyword_id = h.keyword_id AND l.brand_id = h.brand_id AND l.artifact_type = 'silo_dna') THEN 'true' ELSE 'false' END AS silo_dna_exists,
    CASE WHEN EXISTS (SELECT 1 FROM linked_artifacts l WHERE l.target_label = t.target_label AND l.keyword_id = h.keyword_id AND l.brand_id = h.brand_id AND l.artifact_type = 'silo_page') THEN 'true' ELSE 'false' END AS silo_page_artifact_exists,
    CASE WHEN EXISTS (SELECT 1 FROM serp_matches s WHERE s.target_label = t.target_label AND s.keyword_id = h.keyword_id AND s.brand_id = h.brand_id) THEN 'true' ELSE 'false' END AS serp_exists,
    CASE WHEN EXISTS (SELECT 1 FROM linked_artifacts l WHERE l.target_label = t.target_label AND l.keyword_id = h.keyword_id AND l.brand_id = h.brand_id AND l.artifact_type = 'content_plan') THEN 'true' ELSE 'false' END AS content_plan_exists,
    CASE WHEN EXISTS (SELECT 1 FROM document_matches d WHERE d.target_label = t.target_label AND d.keyword_id = h.keyword_id AND d.brand_id = h.brand_id) THEN 'true' ELSE 'false' END AS content_document_exists,
    CASE WHEN EXISTS (SELECT 1 FROM publication_matches p WHERE p.target_label = t.target_label AND p.keyword_id = h.keyword_id AND p.brand_id = h.brand_id) THEN 'true' ELSE 'false' END AS publication_record_exists
  FROM targets t
  LEFT JOIN keyword_hits h ON h.target_label = t.target_label
)
SELECT
  '2026-08-11-pipeline-golden-path-v1' AS script_version,
  target_label,
  keyword_status,
  keyword_id,
  brand_id,
  successor_entity_ids,
  artifact_type_versions,
  artifact_statuses,
  workflow_items,
  silo_dna_exists,
  silo_page_artifact_exists,
  serp_exists,
  content_plan_exists,
  content_document_exists,
  publication_record_exists
FROM summary
ORDER BY target_label, keyword_id NULLS FIRST;
