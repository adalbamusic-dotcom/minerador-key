-- Adalba editorial downstream inventory (read-only), version 2026-08-12-v2.
-- One sanitized result set. Target Brand is intentionally fixed for this gate.
WITH target AS (
  SELECT '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AS brand_id
),
current_article_dna AS (
  SELECT DISTINCT ON (v.marca_id, v.entity_id)
    v.marca_id,
    v.entity_id,
    v.version_id,
    v.payload
  FROM public.editorial_artifact_versions v
  JOIN target t ON t.brand_id = v.marca_id
  WHERE v.artifact_type = 'article_dna'
  ORDER BY v.marca_id, v.entity_id, v.version_number DESC
),
current_article_keyword_refs AS (
  SELECT DISTINCT a.marca_id, ref ->> 'keywordId' AS keyword_id
  FROM current_article_dna a
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(a.payload -> 'keywordReferences') = 'array'
      THEN a.payload -> 'keywordReferences'
      ELSE '[]'::jsonb
    END
  ) AS ref
  WHERE nullif(btrim(ref ->> 'keywordId'), '') IS NOT NULL
),
keyword_workflows AS (
  SELECT w.marca_id, w.subject_id AS keyword_id, w.state
  FROM public.editorial_workflow_items w
  JOIN target t ON t.brand_id = w.marca_id
  WHERE w.subject_type = 'keyword' AND w.stage = 'architect'
),
keyword_state_counts AS (
  SELECT
    count(*)::text AS total_keywords,
    count(*) FILTER (WHERE lower(coalesce(k.status, '')) = 'aprovado')::text AS approved_keywords,
    count(*) FILTER (WHERE lower(coalesce(k.status, '')) = 'publicado')::text AS published_keywords,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM keyword_workflows w
      WHERE w.marca_id = k.brand_id AND w.keyword_id = k.id::text AND w.state = 'received'
    ))::text AS canonical_received_keywords,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM current_article_keyword_refs r
      WHERE r.marca_id = k.brand_id AND r.keyword_id = k.id::text
    ))::text AS current_article_dna_keywords,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM keyword_workflows w
      WHERE w.marca_id = k.brand_id AND w.keyword_id = k.id::text AND w.state = 'historical_import_protected'
    ))::text AS historical_marker_keywords,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM keyword_workflows w
      WHERE w.marca_id = k.brand_id AND w.keyword_id = k.id::text
        AND w.state NOT IN ('received', 'historical_import_protected')
    ))::text AS other_workflow_keywords,
    count(*) FILTER (
      WHERE lower(coalesce(k.status, '')) IN ('aprovado', 'publicado')
        AND NOT EXISTS (
          SELECT 1 FROM keyword_workflows w
          WHERE w.marca_id = k.brand_id AND w.keyword_id = k.id::text AND w.state = 'received'
        )
        AND NOT EXISTS (
          SELECT 1 FROM current_article_keyword_refs r
          WHERE r.marca_id = k.brand_id AND r.keyword_id = k.id::text
        )
    )::text AS importable_without_new_canonical_block
  FROM public.minerador_keywords k
  JOIN target t ON t.brand_id = k.brand_id
),
publication_classes AS (
  SELECT
    CASE
      WHEN lower(coalesce(p.status, '')) IN ('publicado', 'published')
        OR nullif(btrim(p.published_url), '') IS NOT NULL
        OR nullif(btrim(p.canonical), '') IS NOT NULL THEN 'PRESERVAR'
      WHEN lower(coalesce(p.status, '')) ~ '(test|mock|fixture|homolog)' THEN 'RESETAR_CANDIDATE'
      ELSE 'INVESTIGAR'
    END AS classification,
    count(*)::text AS observed
  FROM public.publication_records p
  JOIN target t ON t.brand_id = p.marca_id
  GROUP BY 1
),
legacy_briefing_classes AS (
  SELECT
    CASE
      WHEN lower(coalesce(b.status, '')) IN ('publicado', 'published')
        OR nullif(btrim(to_jsonb(b) ->> 'canonical'), '') IS NOT NULL THEN 'PRESERVAR'
      WHEN lower(coalesce(b.status, '')) ~ '(test|mock|fixture|homolog)' THEN 'RESETAR_CANDIDATE'
      ELSE 'INVESTIGAR'
    END AS classification,
    count(*)::text AS observed
  FROM public.briefings_artigos b
  JOIN public.minerador_keyword_lists l ON l.id = b.silo_id
  JOIN target t ON t.brand_id = l.marca_id
  GROUP BY 1
),
checks AS (
  SELECT 1 AS sort_order, 'script_version'::text AS check_name, 'INFO'::text AS classification,
    'read-only inventory'::text AS data_type, 'catalog and count only'::text AS runtime_consumer,
    '2026-08-12-v2'::text AS observed, 'one result set with no identifiers URLs payloads or content'::text AS notes
  UNION ALL SELECT 2, 'target_brand', 'INFO', 'fixed canonical Brand', 'scope gate',
    'configured', '95bef1bb-0a3d-4218-a01f-ac7281c55e45 is intentionally not echoed by data rows'
  UNION ALL SELECT 10, 'minerador_keyword_lists', 'PRESERVAR', 'Minerador lists', 'Minerador runtime', count(*)::text,
    'never reset by this plan' FROM public.minerador_keyword_lists l JOIN target t ON t.brand_id = l.marca_id
  UNION ALL SELECT 11, 'minerador_keywords', 'PRESERVAR', 'Minerador keywords and strategic evidence', 'Minerador and handoff runtime', count(*)::text,
    'never reset and status plus strategic fields remain intact' FROM public.minerador_keywords k JOIN target t ON t.brand_id = k.brand_id
  UNION ALL SELECT 12, 'minerador_keywords:url-canonical-evidence', 'PRESERVAR', 'JSON site evidence', 'Minerador and ArticleDNA adapter',
    count(*) FILTER (WHERE nullif(btrim(coalesce(to_jsonb(k.analise_semantica) ->> 'site_origin', '')), '') IS NOT NULL)::text,
    'site origin evidence fields with no URL values printed' FROM public.minerador_keywords k JOIN target t ON t.brand_id = k.brand_id
  UNION ALL SELECT 20, 'editorial_workflow_items', 'INVESTIGAR', 'canonical Minerador to Arquiteto workflow', 'Arquiteto handoff/workspace', count(*)::text,
    'source version FK restricts removal and requires state classification first' FROM public.editorial_workflow_items w JOIN target t ON t.brand_id = w.marca_id
  UNION ALL SELECT 21, 'editorial_workflow_items:received', 'PRESERVAR', 'new canonical receipt', 'Arquiteto handoff/workspace', count(*)::text,
    'authoritative importability blocker in the new epoch' FROM public.editorial_workflow_items w JOIN target t ON t.brand_id = w.marca_id WHERE w.subject_type = 'keyword' AND w.stage = 'architect' AND w.state = 'received'
  UNION ALL SELECT 22, 'editorial_workflow_items:historical_import_protected', 'INVESTIGAR', 'legacy historical marker', 'no active 0030 writer found locally', count(*)::text,
    'not an ordinary import block by itself and receives no mutation in this gate' FROM public.editorial_workflow_items w JOIN target t ON t.brand_id = w.marca_id WHERE w.subject_type = 'keyword' AND w.stage = 'architect' AND w.state = 'historical_import_protected'
  UNION ALL SELECT 23, 'editorial_workflow_items:other-state', 'INVESTIGAR', 'workflow state requiring classification', 'Arquiteto runtime', count(*)::text,
    'not enough evidence to reset or preserve automatically' FROM public.editorial_workflow_items w JOIN target t ON t.brand_id = w.marca_id WHERE w.subject_type = 'keyword' AND w.stage = 'architect' AND w.state NOT IN ('received', 'historical_import_protected')
  UNION ALL SELECT 30, 'editorial_artifact_versions:article_dna', 'INVESTIGAR', 'append-only ArticleDNA versions', 'Arquiteto, Radar and downstream', count(*)::text,
    'payload may carry canonical identity and current means highest version number per entity' FROM public.editorial_artifact_versions v JOIN target t ON t.brand_id = v.marca_id WHERE v.artifact_type = 'article_dna'
  UNION ALL SELECT 31, 'editorial_artifact_versions:article_dna-current', 'PRESERVAR', 'current ArticleDNA', 'Arquiteto bootstrap and importability', count(*)::text,
    'authoritative importability blocker only when it references the keyword' FROM current_article_dna
  UNION ALL SELECT 32, 'editorial_artifact_versions:silo_dna', 'INVESTIGAR', 'append-only SiloDNA', 'Arquiteto and Radar', count(*)::text,
    'self FKs previous/source version RESTRICT' FROM public.editorial_artifact_versions v JOIN target t ON t.brand_id = v.marca_id WHERE v.artifact_type = 'silo_dna'
  UNION ALL SELECT 33, 'editorial_artifact_versions:silo_page', 'INVESTIGAR', 'append-only SiloPage', 'Arquiteto and downstream', count(*)::text,
    'self FKs previous/source version RESTRICT' FROM public.editorial_artifact_versions v JOIN target t ON t.brand_id = v.marca_id WHERE v.artifact_type = 'silo_page'
  UNION ALL SELECT 34, 'editorial_artifact_versions:content_plan', 'INVESTIGAR', 'append-only ContentPlan', 'Planejador/Redator/Publicacoes', count(*)::text,
    'referenced by content_documents and publication_records' FROM public.editorial_artifact_versions v JOIN target t ON t.brand_id = v.marca_id WHERE v.artifact_type = 'content_plan'
  UNION ALL SELECT 35, 'editorial_artifact_versions:url-canonical-evidence', 'PRESERVAR', 'ArticleDNA payload identity', 'ArticleDNA consumer/readback', count(*) FILTER (WHERE nullif(btrim(v.payload ->> 'canonical'), '') IS NOT NULL OR nullif(btrim(v.payload -> 'publishedIdentityRef' ->> 'canonical'), '') IS NOT NULL)::text,
    'only a count of versions carrying canonical evidence' FROM public.editorial_artifact_versions v JOIN target t ON t.brand_id = v.marca_id WHERE v.artifact_type = 'article_dna'
  UNION ALL SELECT 40, 'editorial_serp_snapshots', 'INVESTIGAR', 'SERP snapshot history', 'Radar runtime', count(*)::text,
    'reviews depend on snapshot and snapshots have self lineage plus source version FK' FROM public.editorial_serp_snapshots s JOIN target t ON t.brand_id = s.marca_id
  UNION ALL SELECT 41, 'editorial_serp_reviews', 'INVESTIGAR', 'SERP review history', 'Radar runtime', count(*)::text,
    'requires explicit snapshot classification before any future reset decision' FROM public.editorial_serp_reviews r JOIN target t ON t.brand_id = r.marca_id
  UNION ALL SELECT 50, 'content_documents', 'INVESTIGAR', 'canonical content document', 'Redator and Publicacoes', count(*)::text,
    'FKs article/content-plan versions and current document version are RESTRICT' FROM public.content_documents d JOIN target t ON t.brand_id = d.marca_id
  UNION ALL SELECT 51, 'content_document_versions', 'INVESTIGAR', 'document version history', 'Redator', count(*)::text,
    'depends on content documents and current version forms a reset order cycle' FROM public.content_document_versions dv JOIN public.content_documents d ON d.id = dv.document_id JOIN target t ON t.brand_id = d.marca_id
  UNION ALL SELECT 52, 'content_document_user_states', 'RESETAR_CANDIDATE', 'per-user editing state', 'Redator UX', count(*)::text,
    'not a strategic Minerador asset and tied only to selected documents' FROM public.content_document_user_states us JOIN public.content_documents d ON d.id = us.document_id JOIN target t ON t.brand_id = d.marca_id
  UNION ALL SELECT 53, 'editorial_saved_views', 'RESETAR_CANDIDATE', 'per-user saved view', 'editorial workspace UX', count(*)::text,
    'not a source of canonical article or publication identity' FROM public.editorial_saved_views sv JOIN target t ON t.brand_id = sv.marca_id
  UNION ALL SELECT 60, 'publication_records', 'INVESTIGAR', 'canonical publication record', 'Publicacoes runtime', count(*)::text,
    'content plan and document FKs restrict removal while URL canonical and published records stay preserved' FROM public.publication_records p JOIN target t ON t.brand_id = p.marca_id
  UNION ALL SELECT 61, 'publication_records:class', classification, 'publication classification', 'Publicacoes runtime', observed,
    'PRESERVAR includes published status or nonempty URL or canonical with no external crawler proof claimed' FROM publication_classes
  UNION ALL SELECT 70, 'briefings_artigos:brand-scoped', 'INVESTIGAR', 'legacy briefing via minerador_keyword_lists.silo_id', 'legacy Arquiteto/Publicacoes/Radar path', count(*)::text,
    'only rows linked to an Adalba list are in scope' FROM public.briefings_artigos b JOIN public.minerador_keyword_lists l ON l.id = b.silo_id JOIN target t ON t.brand_id = l.marca_id
  UNION ALL SELECT 71, 'briefings_artigos:class', classification, 'legacy briefing classification', 'legacy Arquiteto/Publicacoes/Radar path', observed,
    'PRESERVAR includes published status or canonical evidence' FROM legacy_briefing_classes
  UNION ALL SELECT 72, 'briefings_artigos:null-silo', 'INVESTIGAR', 'unscoped legacy briefing', 'legacy Arquiteto currently reads it', count(*)::text,
    'not attributable to Adalba and excluded from every reset manifest' FROM public.briefings_artigos b WHERE b.silo_id IS NULL
  UNION ALL SELECT 80, 'brand_site_catalog_entries', CASE WHEN to_regclass('public.brand_site_catalog_entries') IS NULL THEN 'INFO' ELSE 'PRESERVAR' END,
    'possible site URL/canonical catalog', 'Brand site evidence consumer', CASE WHEN to_regclass('public.brand_site_catalog_entries') IS NULL THEN 'relation_absent_or_unapplied' ELSE 'relation_present' END,
    'catalog presence only and no optional relation query' 
  UNION ALL SELECT 90, 'keyword_state:total', 'INFO', 'Minerador keyword state', 'handoff eligibility audit', total_keywords, 'all target Brand keywords' FROM keyword_state_counts
  UNION ALL SELECT 91, 'keyword_state:approved', 'INFO', 'Minerador keyword state', 'handoff eligibility audit', approved_keywords, 'published remains a separate operational status' FROM keyword_state_counts
  UNION ALL SELECT 92, 'keyword_state:published', 'INFO', 'Minerador keyword state', 'handoff eligibility audit', published_keywords, 'published does not itself block the new flow' FROM keyword_state_counts
  UNION ALL SELECT 93, 'keyword_state:canonical_received', 'INFO', 'canonical workflow', 'handoff eligibility audit', canonical_received_keywords, 'authoritative block' FROM keyword_state_counts
  UNION ALL SELECT 94, 'keyword_state:current_article_dna', 'INFO', 'current ArticleDNA reference', 'handoff eligibility audit', current_article_dna_keywords, 'authoritative block' FROM keyword_state_counts
  UNION ALL SELECT 95, 'keyword_state:historical_marker', 'INFO', 'legacy workflow marker', 'handoff eligibility audit', historical_marker_keywords, 'not an ordinary-import block by itself' FROM keyword_state_counts
  UNION ALL SELECT 96, 'keyword_state:other_workflow', 'INFO', 'other workflow state', 'handoff eligibility audit', other_workflow_keywords, 'requires runtime/contract classification before reset' FROM keyword_state_counts
  UNION ALL SELECT 97, 'keyword_state:importable_without_new_canonical_block', 'INFO', 'approved or published without received/current ArticleDNA', 'handoff eligibility audit', importable_without_new_canonical_block, 'candidate free entry count and final runtime must still report invalid input explicitly' FROM keyword_state_counts
)
SELECT check_name, classification, data_type, runtime_consumer, observed, notes
FROM checks
ORDER BY sort_order, check_name;
