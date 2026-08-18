-- PIPELINE PERSISTENCE BRAND COUNTS
-- script_version: 2026-08-11-pipeline-brand-counts-v1
-- READ-ONLY. Executar somente depois de o catalog diagnostic confirmar
-- as relacoes usadas abaixo. Nao retorna UUID, payload ou conteudo editorial.
-- Uma unica consulta/result set.

WITH
brand_rows AS (
  SELECT
    m.id::text AS brand_id,
    left(regexp_replace(COALESCE(m.nome, '(sem nome)'), '\s+', ' ', 'g'), 80) AS brand_label,
    m.status::text AS brand_status
  FROM public.marcas m
),
counts AS (
  SELECT b.brand_id, b.brand_label, b.brand_status, 'minerador_keywords' AS entity_name, count(k.id)::text AS observed_count
  FROM brand_rows b
  LEFT JOIN public.minerador_keywords k ON k.brand_id::text = b.brand_id
  GROUP BY b.brand_id, b.brand_label, b.brand_status
  UNION ALL
  SELECT b.brand_id, b.brand_label, b.brand_status, 'article_dna' AS entity_name, count(v.version_id) FILTER (WHERE v.artifact_type = 'article_dna')::text
  FROM brand_rows b
  LEFT JOIN public.editorial_artifact_versions v ON v.marca_id::text = b.brand_id
  GROUP BY b.brand_id, b.brand_label, b.brand_status
  UNION ALL
  SELECT b.brand_id, b.brand_label, b.brand_status, 'silo_dna' AS entity_name, count(v.version_id) FILTER (WHERE v.artifact_type = 'silo_dna')::text
  FROM brand_rows b
  LEFT JOIN public.editorial_artifact_versions v ON v.marca_id::text = b.brand_id
  GROUP BY b.brand_id, b.brand_label, b.brand_status
  UNION ALL
  SELECT b.brand_id, b.brand_label, b.brand_status, 'silo_page' AS entity_name, 'NOT_AVAILABLE_WITHOUT_VERIFIED_RELATION'
  FROM brand_rows b
  UNION ALL
  SELECT b.brand_id, b.brand_label, b.brand_status, 'content_plan' AS entity_name, count(v.version_id) FILTER (WHERE v.artifact_type = 'content_plan')::text
  FROM brand_rows b
  LEFT JOIN public.editorial_artifact_versions v ON v.marca_id::text = b.brand_id
  GROUP BY b.brand_id, b.brand_label, b.brand_status
  UNION ALL
  SELECT b.brand_id, b.brand_label, b.brand_status, 'editorial_workflow_items' AS entity_name, count(w.id)::text
  FROM brand_rows b
  LEFT JOIN public.editorial_workflow_items w ON w.marca_id::text = b.brand_id
  GROUP BY b.brand_id, b.brand_label, b.brand_status
  UNION ALL
  SELECT b.brand_id, b.brand_label, b.brand_status, 'editorial_serp_snapshots' AS entity_name, count(s.id)::text
  FROM brand_rows b
  LEFT JOIN public.editorial_serp_snapshots s ON s.marca_id::text = b.brand_id
  GROUP BY b.brand_id, b.brand_label, b.brand_status
  UNION ALL
  SELECT b.brand_id, b.brand_label, b.brand_status, 'content_documents' AS entity_name, count(d.id)::text
  FROM brand_rows b
  LEFT JOIN public.content_documents d ON d.marca_id::text = b.brand_id
  GROUP BY b.brand_id, b.brand_label, b.brand_status
  UNION ALL
  SELECT b.brand_id, b.brand_label, b.brand_status, 'publication_records' AS entity_name, count(p.id)::text
  FROM brand_rows b
  LEFT JOIN public.publication_records p ON p.marca_id::text = b.brand_id
  GROUP BY b.brand_id, b.brand_label, b.brand_status
)
SELECT
  '2026-08-11-pipeline-brand-counts-v1' AS script_version,
  'count:' || entity_name || ':' || brand_label AS check_name,
  'sanitized row count for Brand; no row contents' AS expected,
  'status=' || COALESCE(brand_status, '(null)') || '; count=' || observed_count AS observed,
  'INFO' AS verdict
FROM counts
ORDER BY brand_label, entity_name;
