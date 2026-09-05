-- Minerador / homologacao: plano de purge de dados de teste.
-- Somente WITH/SELECT. Nao executar provider, DML, DDL ou RPC.
--
-- Edite SOMENTE os valores de requested_targets. UUIDs nulos/zero produzem
-- um plano sem alvo real e nao removem nada.

WITH requested_targets(brand_id, keyword_id) AS (
  VALUES
    (NULL::uuid, NULL::uuid)
),
targets AS (
  SELECT
    requested.brand_id AS requested_brand_id,
    requested.keyword_id AS requested_keyword_id,
    keyword.id AS actual_keyword_id,
    keyword.brand_id AS actual_brand_id,
    keyword.keyword,
    keyword.status AS editorial_status,
    keyword.updated_at AS keyword_updated_at,
    keyword.volume_search,
    keyword.results_allintitle,
    keyword.volume_source,
    keyword.analise_semantica
  FROM requested_targets requested
  LEFT JOIN public.minerador_keywords keyword
    ON keyword.id = requested.keyword_id
),
dependency_counts AS (
  SELECT
    target.*,
    discovery.candidate_ids AS discovery_candidate_ids,
    discovery.discovery_candidate_count,
    discovery_origins.discovery_origin_count,
    discovery_current.discovery_current_metric_count,
    discovery_history.discovery_metric_history_count,
    discovery_batches.discovery_import_batch_count,
    discovery_batches.discovery_import_batch_mixed_count,
    google_measurements.google_ads_measurement_count,
    site_candidates.site_candidate_ids,
    site_candidates.site_keyword_candidate_count,
    site_imports.site_import_item_count,
    site_events.site_event_count,
    workflow.workflow_reference_count,
    artifacts.artifact_reference_count,
    decisions.decision_event_reference_count,
    publications.publication_record_count,
    site_import_batches.site_import_batch_reference_count,
    serp_snapshots.serp_snapshot_reference_count,
    serp_reviews.serp_review_reference_count,
    content_documents.content_document_reference_count,
    content_document_versions.content_document_version_reference_count,
    content_document_comments.content_document_comment_reference_count,
    version_status_events.editorial_version_status_event_reference_count,
    CASE
      WHEN target.actual_keyword_id IS NOT NULL
       AND (
         target.volume_source = 'google_ads'
         OR target.analise_semantica -> 'volume_measurement' ->> 'provider' = 'google_ads'
       ) THEN 1::bigint
      ELSE 0::bigint
    END AS google_ads_embedded_measurement_count,
    CASE
      WHEN target.actual_keyword_id IS NOT NULL
       AND (
         target.results_allintitle IS NOT NULL
         OR target.analise_semantica ? 'allintitle_measurement'
         OR target.analise_semantica ? 'allintitle_measurement_history'
         OR target.analise_semantica ? 'dataforseo_keyword_overview'
       ) THEN 1::bigint
      ELSE 0::bigint
    END AS dataforseo_embedded_measurement_count,
    CASE
      WHEN jsonb_typeof(target.analise_semantica) = 'object'
       AND target.analise_semantica <> '{}'::jsonb THEN 1::bigint
      ELSE 0::bigint
    END AS keyword_dna_semantic_count,
    CASE
      WHEN target.analise_semantica ? 'kgr_score_history' THEN 1::bigint
      ELSE 0::bigint
    END AS kgr_history_count
  FROM targets target
  LEFT JOIN LATERAL (
    SELECT
      coalesce(array_agg(candidate.id ORDER BY candidate.id), '{}'::uuid[]) AS candidate_ids,
      count(candidate.id)::bigint AS discovery_candidate_count
    FROM public.minerador_discovery_candidates candidate
    WHERE candidate.brand_id = target.actual_brand_id
      AND (
        candidate.existing_keyword_id = target.actual_keyword_id
        OR candidate.imported_keyword_id = target.actual_keyword_id
      )
  ) discovery ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS discovery_origin_count
    FROM public.minerador_discovery_keyword_origins origin
    WHERE origin.brand_id = target.actual_brand_id
      AND origin.keyword_id = target.actual_keyword_id
  ) discovery_origins ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS discovery_current_metric_count
    FROM public.minerador_discovery_candidate_current_metrics metric
    WHERE metric.brand_id = target.actual_brand_id
      AND (
        metric.keyword_id = target.actual_keyword_id
        OR metric.candidate_id = ANY(discovery.candidate_ids)
      )
  ) discovery_current ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS discovery_metric_history_count
    FROM public.minerador_discovery_candidate_metric_history metric
    WHERE metric.brand_id = target.actual_brand_id
      AND (
        metric.keyword_id = target.actual_keyword_id
        OR metric.candidate_id = ANY(discovery.candidate_ids)
      )
  ) discovery_history ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::bigint AS discovery_import_batch_count,
      count(*) FILTER (WHERE NOT batch.candidate_ids <@ discovery.candidate_ids)::bigint AS discovery_import_batch_mixed_count
    FROM public.minerador_discovery_import_batches batch
    WHERE batch.brand_id = target.actual_brand_id
      AND batch.candidate_ids && discovery.candidate_ids
  ) discovery_batches ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS google_ads_measurement_count
    FROM public.minerador_keyword_metric_measurements measurement
    WHERE measurement.brand_id = target.actual_brand_id
      AND measurement.keyword_id = target.actual_keyword_id
  ) google_measurements ON true
  LEFT JOIN LATERAL (
    SELECT
      coalesce(array_agg(candidate.id ORDER BY candidate.id), '{}'::uuid[]) AS site_candidate_ids,
      count(candidate.id)::bigint AS site_keyword_candidate_count
    FROM public.brand_site_keyword_candidates candidate
    WHERE candidate.marca_id = target.actual_brand_id
      AND candidate.minerador_keyword_id = target.actual_keyword_id
  ) site_candidates ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS site_import_item_count
    FROM public.brand_site_import_items item
    WHERE item.marca_id = target.actual_brand_id
      AND item.candidate_id = ANY(site_candidates.site_candidate_ids)
  ) site_imports ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS site_event_count
    FROM public.brand_site_events event
    WHERE event.marca_id = target.actual_brand_id
      AND (
        event.entity_id = target.actual_keyword_id::text
        OR strpos(coalesce(event.payload::text, ''), target.actual_keyword_id::text) > 0
      )
  ) site_events ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS workflow_reference_count
    FROM public.editorial_workflow_items item
    WHERE item.marca_id = target.actual_brand_id
      AND (
        (item.subject_type = 'keyword' AND item.subject_id = target.actual_keyword_id::text)
        OR item.source_entity_id = target.actual_keyword_id::text
        OR strpos(coalesce(item.payload::text, ''), target.actual_keyword_id::text) > 0
      )
  ) workflow ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS artifact_reference_count
    FROM public.editorial_artifact_versions artifact
    WHERE artifact.marca_id = target.actual_brand_id
      AND (
        artifact.entity_id = target.actual_keyword_id::text
        OR strpos(coalesce(artifact.payload::text, ''), target.actual_keyword_id::text) > 0
      )
  ) artifacts ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS decision_event_reference_count
    FROM public.editorial_decision_events event
    WHERE event.marca_id = target.actual_brand_id
      AND strpos(coalesce(event.payload::text, ''), target.actual_keyword_id::text) > 0
  ) decisions ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS publication_record_count
    FROM public.publication_records publication
    WHERE publication.marca_id = target.actual_brand_id
      AND (
        publication.article_id = target.actual_keyword_id::text
       OR strpos(coalesce(publication.payload::text, ''), target.actual_keyword_id::text) > 0
       )
  ) publications ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS site_import_batch_reference_count
    FROM public.brand_site_import_batches batch
    WHERE batch.marca_id = target.actual_brand_id
      AND (
        strpos(coalesce(batch.snapshot::text, ''), target.actual_keyword_id::text) > 0
        OR strpos(coalesce(batch.summary::text, ''), target.actual_keyword_id::text) > 0
      )
  ) site_import_batches ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS serp_snapshot_reference_count
    FROM public.editorial_serp_snapshots snapshot
    WHERE snapshot.marca_id = target.actual_brand_id
      AND (
        snapshot.article_id = target.actual_keyword_id::text
        OR strpos(coalesce(snapshot.payload::text, ''), target.actual_keyword_id::text) > 0
      )
  ) serp_snapshots ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS serp_review_reference_count
    FROM public.editorial_serp_reviews review
    WHERE review.marca_id = target.actual_brand_id
      AND (
        review.article_id = target.actual_keyword_id::text
        OR strpos(coalesce(review.payload::text, ''), target.actual_keyword_id::text) > 0
      )
  ) serp_reviews ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS content_document_reference_count
    FROM public.content_documents document
    WHERE document.marca_id = target.actual_brand_id
      AND (
        document.article_id = target.actual_keyword_id::text
        OR strpos(coalesce(document.payload::text, ''), target.actual_keyword_id::text) > 0
      )
  ) content_documents ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS content_document_version_reference_count
    FROM public.content_document_versions version
    JOIN public.content_documents document ON document.id = version.document_id
    WHERE document.marca_id = target.actual_brand_id
      AND strpos(coalesce(version.payload::text, ''), target.actual_keyword_id::text) > 0
  ) content_document_versions ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS content_document_comment_reference_count
    FROM public.content_document_comments comment
    JOIN public.content_documents document ON document.id = comment.document_id
    WHERE document.marca_id = target.actual_brand_id
      AND (
        comment.block_id = target.actual_keyword_id::text
        OR strpos(coalesce(comment.body, ''), target.actual_keyword_id::text) > 0
      )
  ) content_document_comments ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS editorial_version_status_event_reference_count
    FROM public.editorial_version_status_events status_event
    JOIN public.editorial_artifact_versions artifact ON artifact.version_id = status_event.version_id
    WHERE artifact.marca_id = target.actual_brand_id
      AND (
        artifact.entity_id = target.actual_keyword_id::text
        OR strpos(coalesce(artifact.payload::text, ''), target.actual_keyword_id::text) > 0
        OR strpos(coalesce(status_event.reason, ''), target.actual_keyword_id::text) > 0
      )
  ) version_status_events ON true
),
keyword_fk_inventory AS (
  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'child_table', child_namespace.nspname || '.' || child_table.relname,
          'constraint', constraint_row.conname,
          'columns', fk_columns.columns,
          'on_delete', CASE constraint_row.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            ELSE constraint_row.confdeltype::text
          END,
          'on_update', CASE constraint_row.confupdtype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            ELSE constraint_row.confupdtype::text
          END
        ) ORDER BY constraint_row.conname
      ),
      '[]'::jsonb
    ) AS incoming_keyword_fks
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class child_table ON child_table.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace child_namespace ON child_namespace.oid = child_table.relnamespace
  CROSS JOIN LATERAL (
    SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality) AS columns
    FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_position(attnum, ordinality)
    JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid = constraint_row.conrelid
     AND attribute.attnum = key_position.attnum
     AND NOT attribute.attisdropped
  ) fk_columns
  WHERE constraint_row.contype = 'f'
    AND constraint_row.confrelid = 'public.minerador_keywords'::regclass
),
classified AS (
  SELECT
    dependency_counts.*,
    left(regexp_replace(coalesce(dependency_counts.keyword, '<ausente>'), '[[:cntrl:]]+', ' ', 'g'), 120) AS keyword_text_sanitized,
    coalesce(
      nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'declaredCanonicalUrl'), ''),
      nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'resolvedUrl'), ''),
      nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'sourceUrl'), '')
    ) AS publication_link,
    CASE
      WHEN dependency_counts.actual_keyword_id IS NULL THEN 'already_absent'
      WHEN dependency_counts.actual_brand_id IS DISTINCT FROM dependency_counts.requested_brand_id THEN 'cross_brand'
      WHEN dependency_counts.publication_record_count > 0 THEN 'publication_record'
      WHEN lower(coalesce(dependency_counts.analise_semantica -> 'site_origin' ->> 'publicationStatus', '')) = 'published'
       AND coalesce(nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'declaredCanonicalUrl'), ''), nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'resolvedUrl'), ''), nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'sourceUrl'), '')) IS NOT NULL
       AND coalesce(nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'lastCheckedAt'), ''), nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'verifiedAt'), ''), nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'lastVerifiedAt'), '')) IS NOT NULL
       AND lower(coalesce(dependency_counts.analise_semantica -> 'site_origin' ->> 'urlSituation', '')) IN ('accessible', 'canonical_confirmed', 'canonical_missing', 'canonical_conflict', 'noindex')
       AND nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'publicationConfirmedBy'), '') IS NOT NULL
       AND nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'publicationConfirmedAt'), '') IS NOT NULL
       AND nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'publicationCorrectedAt'), '') IS NULL
       AND nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'publicationUnlinkedAt'), '') IS NULL
        THEN 'published'
      WHEN lower(coalesce(dependency_counts.editorial_status, '')) IN ('publicado', 'published')
       AND nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'publicationCorrectedAt'), '') IS NULL
       AND nullif(btrim(dependency_counts.analise_semantica -> 'site_origin' ->> 'publicationUnlinkedAt'), '') IS NULL
        THEN 'legacy_unverified'
      ELSE 'not_formally_published'
    END AS publication_link_state
  FROM dependency_counts
),
classified_with_status AS (
  SELECT
    classified.*,
    CASE
      WHEN classified.actual_keyword_id IS NULL THEN 'already_absent'
      WHEN classified.actual_brand_id IS DISTINCT FROM classified.requested_brand_id THEN 'blocked_cross_brand'
      WHEN classified.publication_record_count > 0 OR classified.publication_link_state IN ('published', 'legacy_unverified', 'publication_record') THEN 'blocked_publication'
      WHEN classified.workflow_reference_count > 0
        OR classified.artifact_reference_count > 0
        OR classified.decision_event_reference_count > 0
        OR classified.site_event_count > 0
        OR classified.site_import_batch_reference_count > 0
        OR classified.serp_snapshot_reference_count > 0
        OR classified.serp_review_reference_count > 0
        OR classified.content_document_reference_count > 0
        OR classified.content_document_version_reference_count > 0
        OR classified.content_document_comment_reference_count > 0
        OR classified.editorial_version_status_event_reference_count > 0
        OR classified.discovery_import_batch_mixed_count > 0 THEN 'blocked_protected_history'
      ELSE 'ready'
    END AS purge_status,
    concat_ws('; ',
      CASE WHEN classified.actual_keyword_id IS NULL THEN 'already_absent' END,
      CASE WHEN classified.actual_brand_id IS DISTINCT FROM classified.requested_brand_id AND classified.actual_keyword_id IS NOT NULL THEN 'keyword pertence a outra Brand' END,
      CASE WHEN classified.publication_record_count > 0 OR classified.publication_link_state IN ('published', 'legacy_unverified', 'publication_record') THEN 'publicacao protegida ou legado nao corrigido' END,
      CASE WHEN classified.workflow_reference_count > 0 THEN 'workflow/handoff' END,
      CASE WHEN classified.artifact_reference_count > 0 THEN 'versionamento/artifact' END,
      CASE WHEN classified.decision_event_reference_count > 0 THEN 'historico de decisao' END,
      CASE WHEN classified.site_event_count > 0 THEN 'historico do site' END,
      CASE WHEN classified.site_import_batch_reference_count > 0 OR classified.serp_snapshot_reference_count > 0 OR classified.serp_review_reference_count > 0 OR classified.content_document_reference_count > 0 OR classified.content_document_version_reference_count > 0 OR classified.content_document_comment_reference_count > 0 OR classified.editorial_version_status_event_reference_count > 0 THEN 'historico editorial/protegido' END,
      CASE WHEN classified.discovery_import_batch_mixed_count > 0 THEN 'batch de descoberta compartilhado' END
    ) AS blocker_reason
  FROM classified
),
fingerprints AS (
  SELECT
    classified_with_status.*,
    keyword_fk_inventory.incoming_keyword_fks,
    md5(concat_ws('|',
      coalesce(classified_with_status.requested_brand_id::text, '<NULL>'),
      coalesce(classified_with_status.requested_keyword_id::text, '<NULL>'),
      coalesce(classified_with_status.actual_brand_id::text, '<ABSENT>'),
      coalesce(classified_with_status.keyword_text_sanitized, ''),
      coalesce(classified_with_status.editorial_status, ''),
      classified_with_status.purge_status,
      classified_with_status.publication_link_state,
      classified_with_status.google_ads_measurement_count::text,
      classified_with_status.discovery_candidate_count::text,
      classified_with_status.discovery_origin_count::text,
      classified_with_status.discovery_current_metric_count::text,
      classified_with_status.discovery_metric_history_count::text,
      classified_with_status.discovery_import_batch_count::text,
      classified_with_status.discovery_import_batch_mixed_count::text,
      classified_with_status.site_keyword_candidate_count::text,
      classified_with_status.site_import_item_count::text,
      classified_with_status.workflow_reference_count::text,
      classified_with_status.artifact_reference_count::text,
      classified_with_status.decision_event_reference_count::text,
      classified_with_status.publication_record_count::text,
      classified_with_status.site_event_count::text,
      classified_with_status.site_import_batch_reference_count::text,
      classified_with_status.serp_snapshot_reference_count::text,
      classified_with_status.serp_review_reference_count::text,
      classified_with_status.content_document_reference_count::text,
      classified_with_status.content_document_version_reference_count::text,
      classified_with_status.content_document_comment_reference_count::text,
      classified_with_status.editorial_version_status_event_reference_count::text,
      classified_with_status.keyword_updated_at::text
    )) AS item_fingerprint
   FROM classified_with_status
   CROSS JOIN keyword_fk_inventory
),
plan_summary AS (
  SELECT md5(coalesce(string_agg(item_fingerprint, '|' ORDER BY requested_brand_id::text, requested_keyword_id::text), '')) AS plan_hash
  FROM fingerprints
)
SELECT
  'PURGE_PLAN'::text AS report,
  plan_summary.plan_hash,
  fingerprints.requested_brand_id AS brand_id,
  fingerprints.requested_keyword_id AS keyword_id,
  fingerprints.actual_brand_id,
  fingerprints.keyword_text_sanitized,
  fingerprints.publication_link,
  fingerprints.editorial_status,
  fingerprints.publication_link_state,
  fingerprints.purge_status,
  fingerprints.blocker_reason,
  fingerprints.google_ads_measurement_count,
  fingerprints.google_ads_embedded_measurement_count,
  fingerprints.dataforseo_embedded_measurement_count,
  fingerprints.keyword_dna_semantic_count,
  fingerprints.kgr_history_count,
  fingerprints.discovery_candidate_count,
  fingerprints.discovery_origin_count,
  fingerprints.discovery_current_metric_count,
  fingerprints.discovery_metric_history_count,
  fingerprints.discovery_import_batch_count,
  fingerprints.discovery_import_batch_mixed_count,
  fingerprints.site_keyword_candidate_count,
  fingerprints.site_import_item_count,
  fingerprints.workflow_reference_count,
  fingerprints.artifact_reference_count,
  fingerprints.decision_event_reference_count,
  fingerprints.site_event_count,
   fingerprints.publication_record_count,
   fingerprints.incoming_keyword_fks,
   jsonb_build_object(
     'minerador_keyword_metric_measurements', fingerprints.google_ads_measurement_count,
     'google_ads_embedded_measurements', fingerprints.google_ads_embedded_measurement_count,
     'dataforseo_embedded_measurements', fingerprints.dataforseo_embedded_measurement_count,
     'keyword_dna_or_semantic_state', fingerprints.keyword_dna_semantic_count,
     'kgr_score_history', fingerprints.kgr_history_count,
     'minerador_discovery_candidates', fingerprints.discovery_candidate_count,
     'minerador_discovery_keyword_origins', fingerprints.discovery_origin_count,
     'minerador_discovery_candidate_current_metrics', fingerprints.discovery_current_metric_count,
     'minerador_discovery_candidate_metric_history', fingerprints.discovery_metric_history_count,
     'minerador_discovery_import_batches', fingerprints.discovery_import_batch_count,
     'minerador_discovery_import_batches_mixed', fingerprints.discovery_import_batch_mixed_count,
     'brand_site_keyword_candidates', fingerprints.site_keyword_candidate_count,
     'brand_site_import_items', fingerprints.site_import_item_count,
     'brand_site_events', fingerprints.site_event_count,
     'editorial_workflow_items', fingerprints.workflow_reference_count,
     'editorial_artifact_versions', fingerprints.artifact_reference_count,
     'editorial_decision_events', fingerprints.decision_event_reference_count,
     'publication_records', fingerprints.publication_record_count,
     'brand_site_import_batches', fingerprints.site_import_batch_reference_count,
     'editorial_serp_snapshots', fingerprints.serp_snapshot_reference_count,
     'editorial_serp_reviews', fingerprints.serp_review_reference_count,
     'content_documents', fingerprints.content_document_reference_count,
     'content_document_versions', fingerprints.content_document_version_reference_count,
     'content_document_comments', fingerprints.content_document_comment_reference_count,
     'editorial_version_status_events', fingerprints.editorial_version_status_event_reference_count
   ) AS dependency_graph,
   fingerprints.keyword_updated_at
FROM fingerprints
CROSS JOIN plan_summary
ORDER BY fingerprints.requested_brand_id, fingerprints.requested_keyword_id;
