-- Minerador / homologacao: purge administrativo controlado de dados de teste.
--
-- ESTE ARQUIVO NAO E MIGRATION E NAO E CHAMADO PELO RUNTIME.
-- Execute manualmente somente depois de revisar o PURGE_PLAN read-only:
--   1. troque test_purge_enabled para true;
--   2. informe o contexto exato e o approvedPlanHash;
--   3. confirme os keywordIds por UUID.
--
-- O placeholder permanece bloqueante. Nao usar texto, slug, nome de Brand,
-- CASCADE generico, TRUNCATE ou disable de FK/trigger.

DROP TABLE IF EXISTS pg_temp.minerador_test_data_purge_results;
DROP TABLE IF EXISTS pg_temp.minerador_test_data_purge_plan;

BEGIN;

SELECT set_config('minerador.test_purge_enabled', 'false', true);
SELECT set_config('minerador.test_purge_environment', 'homologation', true);
SELECT set_config('minerador.test_purge_confirmation', 'REPLACE_ME', true);
SELECT set_config('minerador.test_purge_request_json', $purge_request$
{
  "brandId": "00000000-0000-0000-0000-000000000000",
  "actorUserId": "00000000-0000-0000-0000-000000000000",
  "executionRequestId": "00000000-0000-0000-0000-000000000000",
  "environment": "homologation",
  "approvedPlanHash": "REPLACE_WITH_REVIEWED_PURGE_PLAN_HASH",
  "keywordIds": ["00000000-0000-0000-0000-000000000000"]
}
$purge_request$, true);

CREATE TEMP TABLE pg_temp.minerador_test_data_purge_plan
ON COMMIT PRESERVE ROWS
AS
WITH request AS (
  SELECT current_setting('minerador.test_purge_request_json', true)::jsonb AS payload
),
requested_targets(brand_id, keyword_id) AS (
  SELECT
    (request.payload ->> 'brandId')::uuid,
    keyword_value.value::uuid
  FROM request
  CROSS JOIN LATERAL jsonb_array_elements_text(request.payload -> 'keywordIds') keyword_value(value)
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

SELECT fingerprints.*, plan_summary.plan_hash
FROM fingerprints
CROSS JOIN plan_summary;

CREATE TEMP TABLE pg_temp.minerador_test_data_purge_results (
  execution_request_id uuid NOT NULL,
  brand_id uuid,
  keyword_id uuid,
  status text NOT NULL,
  blocker_reason text,
  deleted_measurements bigint NOT NULL DEFAULT 0,
  deleted_discovery_origins bigint NOT NULL DEFAULT 0,
  deleted_current_metrics bigint NOT NULL DEFAULT 0,
  deleted_import_batches bigint NOT NULL DEFAULT 0,
  deleted_discovery_candidates bigint NOT NULL DEFAULT 0,
  deleted_current_metrics_history bigint NOT NULL DEFAULT 0,
  deleted_site_import_items bigint NOT NULL DEFAULT 0,
  deleted_site_candidates bigint NOT NULL DEFAULT 0,
  deleted_keyword bigint NOT NULL DEFAULT 0,
  readback_residual_count bigint NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
) ON COMMIT PRESERVE ROWS;


DO $purge$
DECLARE
  request_payload jsonb := current_setting('minerador.test_purge_request_json', true)::jsonb;
  target_brand_id uuid := NULLIF(request_payload ->> 'brandId', '')::uuid;
  target_actor_user_id uuid := NULLIF(request_payload ->> 'actorUserId', '')::uuid;
  execution_request_id uuid := NULLIF(request_payload ->> 'executionRequestId', '')::uuid;
  approved_plan_hash text := NULLIF(btrim(request_payload ->> 'approvedPlanHash'), '');
  target_keyword_ids uuid[];
  actual_plan_hash text;
  target_count bigint;
  brand_count bigint;
  current_brand_id uuid;
  current_status text;
  current_updated_at timestamptz;
  current_semantic jsonb;
  check_measurements bigint;
  check_candidates bigint;
  check_origins bigint;
  check_current_metrics bigint;
  check_history bigint;
  check_batches bigint;
  check_mixed_batches bigint;
  check_site_candidates bigint;
  check_site_items bigint;
  check_site_events bigint;
  check_workflow bigint;
  check_artifacts bigint;
  check_decisions bigint;
  check_publications bigint;
  check_site_import_batches bigint;
  check_serp_snapshots bigint;
  check_serp_reviews bigint;
  check_content_documents bigint;
  check_content_document_versions bigint;
  check_content_document_comments bigint;
  check_version_status_events bigint;
  deleted_measurements bigint;
  deleted_origins bigint;
  deleted_current_metrics bigint;
  deleted_history bigint;
  deleted_batches bigint;
  deleted_candidates bigint;
  deleted_site_items bigint;
  deleted_site_candidates bigint;
  deleted_keyword bigint;
  residual_count bigint;
  error_code text;
  error_message text;
  item record;
BEGIN
  IF current_setting('minerador.test_purge_enabled', true) <> 'true' THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_DISABLED';
  END IF;
  IF current_setting('minerador.test_purge_environment', true) <> 'homologation'
     OR lower(coalesce(current_setting('app.environment', true), '')) IN ('production', 'prod') THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_ENVIRONMENT_BLOCKED';
  END IF;
  IF current_setting('minerador.test_purge_confirmation', true) <> 'PURGE_TEST_DATA_CONFIRMED' THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_CONFIRMATION_REQUIRED';
  END IF;
  IF request_payload ->> 'environment' <> 'homologation'
     OR target_brand_id IS NULL
     OR target_actor_user_id IS NULL
     OR execution_request_id IS NULL
     OR approved_plan_hash IS NULL THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_EXACT_CONTEXT_REQUIRED';
  END IF;
  IF jsonb_typeof(request_payload -> 'keywordIds') <> 'array' THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_KEYWORD_IDS_REQUIRED';
  END IF;

  SELECT coalesce(array_agg(ids.keyword_id ORDER BY ids.keyword_id), '{}'::uuid[])
  INTO target_keyword_ids
  FROM (
    SELECT DISTINCT value::uuid AS keyword_id
    FROM jsonb_array_elements_text(request_payload -> 'keywordIds') values(value)
  ) ids;

  IF cardinality(target_keyword_ids) IS NULL
     OR cardinality(target_keyword_ids) = 0
     OR cardinality(target_keyword_ids) > 100 THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_KEYWORD_IDS_INVALID';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = target_actor_user_id)
     OR NOT EXISTS (SELECT 1 FROM public.perfis profile WHERE profile.id = target_actor_user_id AND profile.role = 'admin') THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_GLOBAL_ADMIN_REQUIRED';
  END IF;

  SELECT count(*) INTO brand_count
  FROM public.marcas brand
  WHERE brand.id = target_brand_id;
  IF brand_count <> 1 THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_BRAND_NOT_FOUND';
  END IF;

  SELECT max(plan_hash), count(*)
  INTO actual_plan_hash, target_count
  FROM pg_temp.minerador_test_data_purge_plan;
  IF target_count <> cardinality(target_keyword_ids) THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_PLAN_TARGET_COUNT_CHANGED';
  END IF;
  IF actual_plan_hash IS DISTINCT FROM approved_plan_hash
     AND EXISTS (
       SELECT 1
       FROM pg_temp.minerador_test_data_purge_plan plan
       WHERE plan.purge_status <> 'already_absent'
     ) THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_PLAN_HASH_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.minerador_test_data_purge_plan plan
    CROSS JOIN LATERAL jsonb_array_elements(plan.incoming_keyword_fks) fk
    WHERE fk ->> 'child_table' NOT IN (
      'public.minerador_keyword_metric_measurements',
      'public.minerador_discovery_candidates',
      'public.minerador_discovery_keyword_origins',
      'public.minerador_discovery_candidate_current_metrics',
      'public.minerador_discovery_candidate_metric_history'
    )
  ) THEN
    RAISE EXCEPTION 'TEST_DATA_PURGE_UNKNOWN_KEYWORD_FK';
  END IF;

  FOR item IN
    SELECT *
    FROM pg_temp.minerador_test_data_purge_plan
    ORDER BY requested_keyword_id
  LOOP
    IF item.purge_status = 'already_absent' THEN
      INSERT INTO pg_temp.minerador_test_data_purge_results (
        execution_request_id, brand_id, keyword_id, status, blocker_reason
      ) VALUES (
        execution_request_id, target_brand_id, item.requested_keyword_id,
        'already_absent', 'keyword ausente no readback do plano'
      );
      CONTINUE;
    END IF;

    IF item.purge_status <> 'ready' THEN
      INSERT INTO pg_temp.minerador_test_data_purge_results (
        execution_request_id, brand_id, keyword_id, status, blocker_reason
      ) VALUES (
        execution_request_id, target_brand_id, item.requested_keyword_id,
        'blocked', item.blocker_reason
      );
      CONTINUE;
    END IF;

    BEGIN
      SELECT keyword.brand_id, keyword.status, keyword.updated_at, keyword.analise_semantica
      INTO current_brand_id, current_status, current_updated_at, current_semantic
      FROM public.minerador_keywords keyword
      WHERE keyword.id = item.actual_keyword_id
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO pg_temp.minerador_test_data_purge_results (
          execution_request_id, brand_id, keyword_id, status, blocker_reason
        ) VALUES (
          execution_request_id, target_brand_id, item.requested_keyword_id,
          'already_absent', 'keyword ausente antes do savepoint'
        );
        CONTINUE;
      END IF;

      IF current_brand_id IS DISTINCT FROM target_brand_id
         OR current_brand_id IS DISTINCT FROM item.actual_brand_id THEN
        RAISE EXCEPTION 'TEST_DATA_PURGE_CROSS_BRAND_BLOCKED';
      END IF;
      IF current_updated_at IS DISTINCT FROM item.keyword_updated_at
         OR current_status IS DISTINCT FROM item.editorial_status
         OR current_semantic IS DISTINCT FROM item.analise_semantica THEN
        RAISE EXCEPTION 'TEST_DATA_PURGE_PLAN_STALE';
      END IF;
      IF lower(coalesce(current_status, '')) IN ('publicado', 'published') THEN
        RAISE EXCEPTION 'TEST_DATA_PURGE_PUBLICATION_GUARD';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.publication_records publication
        WHERE publication.marca_id = target_brand_id
          AND (
            publication.article_id = item.actual_keyword_id::text
            OR strpos(coalesce(publication.payload::text, ''), item.actual_keyword_id::text) > 0
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.editorial_workflow_items workflow
        WHERE workflow.marca_id = target_brand_id
          AND (
            (workflow.subject_type = 'keyword' AND workflow.subject_id = item.actual_keyword_id::text)
            OR workflow.source_entity_id = item.actual_keyword_id::text
            OR strpos(coalesce(workflow.payload::text, ''), item.actual_keyword_id::text) > 0
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.editorial_artifact_versions artifact
        WHERE artifact.marca_id = target_brand_id
          AND strpos(coalesce(artifact.payload::text, ''), item.actual_keyword_id::text) > 0
      ) OR EXISTS (
        SELECT 1
        FROM public.editorial_decision_events decision_event
        WHERE decision_event.marca_id = target_brand_id
          AND strpos(coalesce(decision_event.payload::text, ''), item.actual_keyword_id::text) > 0
      ) OR EXISTS (
        SELECT 1
        FROM public.brand_site_events site_event
        WHERE site_event.marca_id = target_brand_id
          AND (
            site_event.entity_id = item.actual_keyword_id::text
            OR strpos(coalesce(site_event.payload::text, ''), item.actual_keyword_id::text) > 0
          )
      ) THEN
        RAISE EXCEPTION 'TEST_DATA_PURGE_PROTECTED_REFERENCE_GUARD';
      END IF;

      SELECT
        (SELECT count(*)::bigint FROM public.minerador_keyword_metric_measurements measurement WHERE measurement.brand_id = target_brand_id AND measurement.keyword_id = item.actual_keyword_id),
        (SELECT count(*)::bigint FROM public.minerador_discovery_candidates candidate WHERE candidate.brand_id = target_brand_id AND (candidate.existing_keyword_id = item.actual_keyword_id OR candidate.imported_keyword_id = item.actual_keyword_id)),
        (SELECT count(*)::bigint FROM public.minerador_discovery_keyword_origins origin WHERE origin.brand_id = target_brand_id AND origin.keyword_id = item.actual_keyword_id),
        (SELECT count(*)::bigint FROM public.minerador_discovery_candidate_current_metrics metric WHERE metric.brand_id = target_brand_id AND metric.keyword_id = item.actual_keyword_id),
        (SELECT count(*)::bigint FROM public.minerador_discovery_candidate_metric_history metric WHERE metric.brand_id = target_brand_id AND (metric.keyword_id = item.actual_keyword_id OR metric.candidate_id = ANY(item.discovery_candidate_ids))),
        (SELECT count(*)::bigint FROM public.minerador_discovery_import_batches batch WHERE batch.brand_id = target_brand_id AND batch.candidate_ids && item.discovery_candidate_ids),
        (SELECT count(*) FILTER (WHERE NOT batch.candidate_ids <@ item.discovery_candidate_ids)::bigint FROM public.minerador_discovery_import_batches batch WHERE batch.brand_id = target_brand_id AND batch.candidate_ids && item.discovery_candidate_ids),
        (SELECT count(*)::bigint FROM public.brand_site_keyword_candidates candidate WHERE candidate.marca_id = target_brand_id AND candidate.minerador_keyword_id = item.actual_keyword_id),
        (SELECT count(*)::bigint FROM public.brand_site_import_items site_item WHERE site_item.marca_id = target_brand_id AND site_item.candidate_id = ANY(item.site_candidate_ids)),
        (SELECT count(*)::bigint FROM public.brand_site_events site_event WHERE site_event.marca_id = target_brand_id AND (site_event.entity_id = item.actual_keyword_id::text OR strpos(coalesce(site_event.payload::text, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.editorial_workflow_items workflow WHERE workflow.marca_id = target_brand_id AND ((workflow.subject_type = 'keyword' AND workflow.subject_id = item.actual_keyword_id::text) OR workflow.source_entity_id = item.actual_keyword_id::text OR strpos(coalesce(workflow.payload::text, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.editorial_artifact_versions artifact WHERE artifact.marca_id = target_brand_id AND (artifact.entity_id = item.actual_keyword_id::text OR strpos(coalesce(artifact.payload::text, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.editorial_decision_events decision_event WHERE decision_event.marca_id = target_brand_id AND strpos(coalesce(decision_event.payload::text, ''), item.actual_keyword_id::text) > 0),
        (SELECT count(*)::bigint FROM public.publication_records publication WHERE publication.marca_id = target_brand_id AND (publication.article_id = item.actual_keyword_id::text OR strpos(coalesce(publication.payload::text, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.brand_site_import_batches batch WHERE batch.marca_id = target_brand_id AND (strpos(coalesce(batch.snapshot::text, ''), item.actual_keyword_id::text) > 0 OR strpos(coalesce(batch.summary::text, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.editorial_serp_snapshots snapshot WHERE snapshot.marca_id = target_brand_id AND (snapshot.article_id = item.actual_keyword_id::text OR strpos(coalesce(snapshot.payload::text, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.editorial_serp_reviews review WHERE review.marca_id = target_brand_id AND (review.article_id = item.actual_keyword_id::text OR strpos(coalesce(review.payload::text, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.content_documents document WHERE document.marca_id = target_brand_id AND (document.article_id = item.actual_keyword_id::text OR strpos(coalesce(document.payload::text, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.content_document_versions version JOIN public.content_documents document ON document.id = version.document_id WHERE document.marca_id = target_brand_id AND strpos(coalesce(version.payload::text, ''), item.actual_keyword_id::text) > 0),
        (SELECT count(*)::bigint FROM public.content_document_comments comment JOIN public.content_documents document ON document.id = comment.document_id WHERE document.marca_id = target_brand_id AND (comment.block_id = item.actual_keyword_id::text OR strpos(coalesce(comment.body, ''), item.actual_keyword_id::text) > 0)),
        (SELECT count(*)::bigint FROM public.editorial_version_status_events status_event JOIN public.editorial_artifact_versions artifact ON artifact.version_id = status_event.version_id WHERE artifact.marca_id = target_brand_id AND (artifact.entity_id = item.actual_keyword_id::text OR strpos(coalesce(artifact.payload::text, ''), item.actual_keyword_id::text) > 0 OR strpos(coalesce(status_event.reason, ''), item.actual_keyword_id::text) > 0))
      INTO check_measurements, check_candidates, check_origins, check_current_metrics, check_history,
        check_batches, check_mixed_batches, check_site_candidates, check_site_items, check_site_events,
        check_workflow, check_artifacts, check_decisions, check_publications, check_site_import_batches,
        check_serp_snapshots, check_serp_reviews, check_content_documents, check_content_document_versions,
        check_content_document_comments, check_version_status_events;

      IF check_measurements IS DISTINCT FROM item.google_ads_measurement_count
         OR check_candidates IS DISTINCT FROM item.discovery_candidate_count
         OR check_origins IS DISTINCT FROM item.discovery_origin_count
         OR check_current_metrics IS DISTINCT FROM item.discovery_current_metric_count
         OR check_history IS DISTINCT FROM item.discovery_metric_history_count
         OR check_batches IS DISTINCT FROM item.discovery_import_batch_count
         OR check_mixed_batches IS DISTINCT FROM item.discovery_import_batch_mixed_count
         OR check_site_candidates IS DISTINCT FROM item.site_keyword_candidate_count
         OR check_site_items IS DISTINCT FROM item.site_import_item_count
         OR check_site_events IS DISTINCT FROM item.site_event_count
         OR check_workflow IS DISTINCT FROM item.workflow_reference_count
         OR check_artifacts IS DISTINCT FROM item.artifact_reference_count
         OR check_decisions IS DISTINCT FROM item.decision_event_reference_count
         OR check_publications IS DISTINCT FROM item.publication_record_count
         OR check_site_import_batches IS DISTINCT FROM item.site_import_batch_reference_count
         OR check_serp_snapshots IS DISTINCT FROM item.serp_snapshot_reference_count
         OR check_serp_reviews IS DISTINCT FROM item.serp_review_reference_count
         OR check_content_documents IS DISTINCT FROM item.content_document_reference_count
         OR check_content_document_versions IS DISTINCT FROM item.content_document_version_reference_count
         OR check_content_document_comments IS DISTINCT FROM item.content_document_comment_reference_count
         OR check_version_status_events IS DISTINCT FROM item.editorial_version_status_event_reference_count THEN
        RAISE EXCEPTION 'TEST_DATA_PURGE_DEPENDENCY_PLAN_STALE';
      END IF;

      deleted_measurements := 0;
      deleted_origins := 0;
      deleted_current_metrics := 0;
      deleted_history := 0;
      deleted_batches := 0;
      deleted_candidates := 0;
      deleted_site_items := 0;
      deleted_site_candidates := 0;
      deleted_keyword := 0;

      DELETE FROM public.brand_site_import_items site_item
      WHERE site_item.marca_id = target_brand_id
        AND site_item.candidate_id = ANY(item.site_candidate_ids);
      GET DIAGNOSTICS deleted_site_items = ROW_COUNT;

      DELETE FROM public.brand_site_keyword_candidates candidate
      WHERE candidate.marca_id = target_brand_id
        AND candidate.id = ANY(item.site_candidate_ids);
      GET DIAGNOSTICS deleted_site_candidates = ROW_COUNT;

      DELETE FROM public.minerador_discovery_keyword_origins origin
      WHERE origin.brand_id = target_brand_id
        AND origin.keyword_id = item.actual_keyword_id;
      GET DIAGNOSTICS deleted_origins = ROW_COUNT;

      DELETE FROM public.minerador_discovery_candidate_current_metrics metric
      WHERE metric.brand_id = target_brand_id
        AND (metric.keyword_id = item.actual_keyword_id OR metric.candidate_id = ANY(item.discovery_candidate_ids));
      GET DIAGNOSTICS deleted_current_metrics = ROW_COUNT;

      DELETE FROM public.minerador_discovery_candidate_metric_history metric
      WHERE metric.brand_id = target_brand_id
        AND (metric.keyword_id = item.actual_keyword_id OR metric.candidate_id = ANY(item.discovery_candidate_ids));
      GET DIAGNOSTICS deleted_history = ROW_COUNT;

      DELETE FROM public.minerador_discovery_import_batches batch
      WHERE batch.brand_id = target_brand_id
        AND batch.candidate_ids && item.discovery_candidate_ids
        AND batch.candidate_ids <@ item.discovery_candidate_ids;
      GET DIAGNOSTICS deleted_batches = ROW_COUNT;

      DELETE FROM public.minerador_discovery_candidates candidate
      WHERE candidate.brand_id = target_brand_id
        AND candidate.id = ANY(item.discovery_candidate_ids);
      GET DIAGNOSTICS deleted_candidates = ROW_COUNT;

      DELETE FROM public.minerador_keyword_metric_measurements measurement
      WHERE measurement.brand_id = target_brand_id
        AND measurement.keyword_id = item.actual_keyword_id;
      GET DIAGNOSTICS deleted_measurements = ROW_COUNT;

      DELETE FROM public.minerador_keywords keyword
      WHERE keyword.id = item.actual_keyword_id
        AND keyword.brand_id = target_brand_id;
      GET DIAGNOSTICS deleted_keyword = ROW_COUNT;
      IF deleted_keyword <> 1 THEN
        RAISE EXCEPTION 'TEST_DATA_PURGE_KEYWORD_DELETE_NOT_EXACT';
      END IF;

      SELECT
        (SELECT count(*)::bigint FROM public.minerador_keywords keyword WHERE keyword.id = item.actual_keyword_id AND keyword.brand_id = target_brand_id)
        + (SELECT count(*)::bigint FROM public.minerador_keyword_metric_measurements measurement WHERE measurement.brand_id = target_brand_id AND measurement.keyword_id = item.actual_keyword_id)
        + (SELECT count(*)::bigint FROM public.minerador_discovery_candidates candidate WHERE candidate.brand_id = target_brand_id AND candidate.id = ANY(item.discovery_candidate_ids))
        + (SELECT count(*)::bigint FROM public.minerador_discovery_keyword_origins origin WHERE origin.brand_id = target_brand_id AND origin.keyword_id = item.actual_keyword_id)
        + (SELECT count(*)::bigint FROM public.minerador_discovery_candidate_current_metrics metric WHERE metric.brand_id = target_brand_id AND (metric.keyword_id = item.actual_keyword_id OR metric.candidate_id = ANY(item.discovery_candidate_ids)))
        + (SELECT count(*)::bigint FROM public.minerador_discovery_candidate_metric_history metric WHERE metric.brand_id = target_brand_id AND (metric.keyword_id = item.actual_keyword_id OR metric.candidate_id = ANY(item.discovery_candidate_ids)))
        + (SELECT count(*)::bigint FROM public.minerador_discovery_import_batches batch WHERE batch.brand_id = target_brand_id AND batch.candidate_ids && item.discovery_candidate_ids)
        + (SELECT count(*)::bigint FROM public.brand_site_keyword_candidates candidate WHERE candidate.marca_id = target_brand_id AND candidate.id = ANY(item.site_candidate_ids))
        + (SELECT count(*)::bigint FROM public.brand_site_import_items site_item WHERE site_item.marca_id = target_brand_id AND site_item.candidate_id = ANY(item.site_candidate_ids))
      INTO residual_count;

      IF residual_count <> 0 THEN
        RAISE EXCEPTION 'TEST_DATA_PURGE_READBACK_FAILED';
      END IF;

      INSERT INTO pg_temp.minerador_test_data_purge_results (
        execution_request_id, brand_id, keyword_id, status,
        deleted_measurements, deleted_discovery_origins, deleted_current_metrics,
        deleted_current_metrics_history, deleted_import_batches, deleted_discovery_candidates,
        deleted_site_import_items, deleted_site_candidates, deleted_keyword,
        readback_residual_count
      ) VALUES (
        execution_request_id, target_brand_id, item.actual_keyword_id, 'success',
        deleted_measurements, deleted_origins, deleted_current_metrics,
        deleted_history, deleted_batches, deleted_candidates,
        deleted_site_items, deleted_site_candidates, deleted_keyword,
        residual_count
      );
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS error_code = RETURNED_SQLSTATE, error_message = MESSAGE_TEXT;
      INSERT INTO pg_temp.minerador_test_data_purge_results (
        execution_request_id, brand_id, keyword_id, status, error_code, error_message
      ) VALUES (
        execution_request_id, target_brand_id, item.actual_keyword_id, 'failed',
        error_code,
        left(regexp_replace(coalesce(error_message, 'falha sem mensagem'), '[[:cntrl:]]+', ' ', 'g'), 240)
      );
    END;
  END LOOP;
END
$purge$;

COMMIT;

SELECT
  execution_request_id,
  brand_id,
  keyword_id,
  status,
  blocker_reason,
  deleted_measurements,
  deleted_discovery_origins,
  deleted_current_metrics,
  deleted_current_metrics_history,
  deleted_import_batches,
  deleted_discovery_candidates,
  deleted_site_import_items,
  deleted_site_candidates,
  deleted_keyword,
  readback_residual_count,
  error_code,
  error_message,
  created_at
FROM pg_temp.minerador_test_data_purge_results
ORDER BY keyword_id;
