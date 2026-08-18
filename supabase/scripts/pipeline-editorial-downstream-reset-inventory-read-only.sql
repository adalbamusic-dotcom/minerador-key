-- Arquiteto downstream reset inventory (read-only), version 2026-08-12-v1.
-- Replace only REPLACE_WITH_BRAND_UUID with the canonical Brand UUID before execution.
WITH input AS (
  SELECT 'REPLACE_WITH_BRAND_UUID'::text AS target_brand_id_text
), target AS (
  SELECT CASE WHEN target_brand_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN target_brand_id_text::uuid ELSE NULL END AS brand_id
  FROM input
), inventory AS (
  SELECT 'minerador_keywords'::text AS object_name, 'PRESERVAR'::text AS classification, 'Minerador strategic source'::text AS data_type, 'Minerador runtime'::text AS consumer, 'Never reset in this plan'::text AS deletion_risk, count(*)::text AS observed
  FROM public.minerador_keywords k JOIN target t ON t.brand_id = k.brand_id
  UNION ALL
  SELECT 'minerador_keyword_lists', 'PRESERVAR', 'Minerador strategic source', 'Minerador runtime', 'Never reset in this plan', count(*)::text
  FROM public.minerador_keyword_lists l JOIN target t ON t.brand_id = l.brand_id
  UNION ALL
  SELECT 'editorial_workflow_items', 'INVESTIGAR', 'Canonical handoff/workflow', 'Arquiteto runtime', 'May include new canonical entries', count(*)::text
  FROM public.editorial_workflow_items w JOIN target t ON t.brand_id = w.marca_id
  UNION ALL
  SELECT 'editorial_artifact_versions:article_dna', 'INVESTIGAR', 'Canonical ArticleDNA versions', 'Arquiteto and downstream runtime', 'May include newly valid ArticleDNA', count(*)::text
  FROM public.editorial_artifact_versions v JOIN target t ON t.brand_id = v.marca_id WHERE v.artifact_type = 'article_dna'
  UNION ALL
  SELECT 'editorial_artifact_versions:other', 'INVESTIGAR', 'SiloDNA/SiloPage/ContentPlan versions', 'Arquiteto and downstream runtime', 'Requires provenance review', count(*)::text
  FROM public.editorial_artifact_versions v JOIN target t ON t.brand_id = v.marca_id WHERE v.artifact_type <> 'article_dna'
  UNION ALL
  SELECT 'editorial_serp_snapshots', 'RESETAR_CANDIDATE', 'Radar snapshots', 'Radar runtime', 'Dependent reviews must be inventoried first', count(*)::text
  FROM public.editorial_serp_snapshots s JOIN target t ON t.brand_id = s.marca_id
  UNION ALL
  SELECT 'editorial_serp_reviews', 'RESETAR_CANDIDATE', 'Radar reviews', 'Radar runtime', 'Depends on snapshot lineage', count(*)::text
  FROM public.editorial_serp_reviews s JOIN target t ON t.brand_id = s.marca_id
  UNION ALL
  SELECT 'content_documents', 'INVESTIGAR', 'Content document', 'Redator and Publicações runtime', 'May be operational content', count(*)::text
  FROM public.content_documents d JOIN target t ON t.brand_id = d.marca_id
  UNION ALL
  SELECT 'content_document_versions', 'RESETAR_CANDIDATE', 'Document version history', 'Redator runtime', 'Depends on content document review', count(*)::text
  FROM public.content_document_versions v JOIN public.content_documents d ON d.id = v.document_id JOIN target t ON t.brand_id = d.marca_id
  UNION ALL
  SELECT 'content_document_user_states', 'RESETAR_CANDIDATE', 'Per-user workspace state', 'Redator runtime', 'Depends on content document review', count(*)::text
  FROM public.content_document_user_states s JOIN public.content_documents d ON d.id = s.document_id JOIN target t ON t.brand_id = d.marca_id
  UNION ALL
  SELECT 'editorial_saved_views', 'RESETAR_CANDIDATE', 'Saved view/user state', 'Cross-module workspace runtime', 'Review active user preferences first', count(*)::text
  FROM public.editorial_saved_views v JOIN target t ON t.brand_id = v.marca_id
  UNION ALL
  SELECT 'publication_records', 'INVESTIGAR', 'Publication history', 'Publicações runtime', 'Each real publication requires human decision', count(*)::text
  FROM public.publication_records p JOIN target t ON t.brand_id = p.marca_id
), checks AS (
  SELECT 1 AS sort_order, 'script_version'::text AS object_name, 'INFO'::text AS classification, 'fixed version'::text AS data_type, 'catalog-only'::text AS consumer, 'none'::text AS deletion_risk, '2026-08-12-v1'::text AS observed
  UNION ALL
  SELECT 2, 'target_brand_id', CASE WHEN brand_id IS NULL THEN 'FAIL' ELSE 'PASS' END, 'canonical UUID required', 'scope gate', 'no inventory if invalid', CASE WHEN brand_id IS NULL THEN 'replace_required' ELSE 'configured' END FROM target
  UNION ALL
  SELECT 10, object_name, classification, data_type, consumer, deletion_risk, observed FROM inventory
)
SELECT object_name, classification, data_type, consumer, deletion_risk, observed
FROM checks
ORDER BY sort_order, object_name;
