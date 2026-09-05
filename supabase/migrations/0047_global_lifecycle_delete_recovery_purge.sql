-- 0047: lifecycle global da Plataforma.
--
-- Preparação local. Aplicar somente depois do preflight read-only,
-- snapshot/fingerprint, drift check e autorização operacional da tarefa.
-- A migration usa funções tipadas; não aceita tabela/coluna nem SQL dinâmico.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.minerador_keywords') IS NULL
    OR to_regclass('public.minerador_keyword_metric_measurements') IS NULL
    OR to_regclass('public.minerador_discovery_keyword_origins') IS NULL
    OR to_regclass('public.minerador_discovery_candidates') IS NULL
    OR to_regclass('public.minerador_discovery_candidate_current_metrics') IS NULL
    OR to_regclass('public.minerador_discovery_candidate_metric_history') IS NULL
    OR to_regclass('public.editorial_artifact_versions') IS NULL
    OR to_regclass('public.editorial_workflow_items') IS NULL
    OR to_regclass('public.editorial_decision_events') IS NULL
    OR to_regclass('public.publication_records') IS NULL
    OR to_regclass('public.marcas') IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_0047_PRECONDITION: relação canônica ausente';
  END IF;

  IF to_regprocedure('public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE_0047_PRECONDITION: helper canônico de autorização ausente';
  END IF;

  IF to_regprocedure('public.lifecycle_delete_minerador_keywords(uuid,uuid[],uuid)') IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute
      WHERE attrelid = 'public.minerador_keywords'::regclass
        AND attname = 'deleted_by'
        AND attnum > 0
        AND NOT attisdropped
    ) THEN
    RAISE EXCEPTION 'LIFECYCLE_0047_PRECONDITION: migration já aplicada ou estado parcial detectado';
  END IF;
END $$;

ALTER TABLE public.minerador_keywords
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN purge_after timestamptz,
  ADD COLUMN deleted_by uuid;

ALTER TABLE public.minerador_keywords
  ADD CONSTRAINT minerador_keywords_global_lifecycle_check
  CHECK (
    (deleted_at IS NULL AND purge_after IS NULL AND deleted_by IS NULL)
    OR (deleted_at IS NOT NULL AND purge_after = deleted_at + interval '24 hours' AND deleted_by IS NOT NULL)
  );

CREATE INDEX minerador_keywords_global_recoverable_idx
  ON public.minerador_keywords (brand_id, purge_after)
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.minerador_keyword_is_published(
  p_status text,
  p_semantic jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT lower(coalesce(p_semantic #>> '{site_origin,publicationStatus}', '')) = 'published'
    AND (
      nullif(btrim(p_semantic #>> '{site_origin,resolvedUrl}'), '') IS NOT NULL
      OR nullif(btrim(p_semantic #>> '{site_origin,sourceUrl}'), '') IS NOT NULL
      OR nullif(btrim(p_semantic #>> '{site_origin,declaredCanonicalUrl}'), '') IS NOT NULL
    )
    AND (
      nullif(btrim(p_semantic #>> '{site_origin,lastCheckedAt}'), '') IS NOT NULL
      OR nullif(btrim(p_semantic #>> '{site_origin,verifiedAt}'), '') IS NOT NULL
      OR nullif(btrim(p_semantic #>> '{site_origin,lastVerifiedAt}'), '') IS NOT NULL
    )
    AND lower(coalesce(p_semantic #>> '{site_origin,urlSituation}', '')) IN (
      'accessible', 'canonical_confirmed', 'canonical_missing', 'canonical_conflict', 'noindex'
    )
    AND nullif(btrim(p_semantic #>> '{site_origin,publicationConfirmedBy}'), '') IS NOT NULL
    AND nullif(btrim(p_semantic #>> '{site_origin,publicationConfirmedAt}'), '') IS NOT NULL
    AND nullif(btrim(p_semantic #>> '{site_origin,publicationCorrectedAt}'), '') IS NULL
    AND nullif(btrim(p_semantic #>> '{site_origin,publicationUnlinkedAt}'), '') IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.lifecycle_keyword_is_published(
  p_brand_id uuid,
  p_keyword_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
WITH keyword_row AS (
  SELECT k.id, k.brand_id, k.analise_semantica
  FROM public.minerador_keywords k
  WHERE k.id = p_keyword_id
    AND k.brand_id = p_brand_id
), article_refs AS (
  SELECT av.version_id, av.entity_id
  FROM public.editorial_artifact_versions av
  CROSS JOIN keyword_row k
  WHERE av.marca_id = k.brand_id
    AND av.artifact_type = 'article_dna'
    AND (
      av.payload->>'principalKeywordId' = k.id::text
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(av.payload->'keywordReferences') = 'array'
            THEN av.payload->'keywordReferences'
            ELSE '[]'::jsonb
          END
        ) AS reference
        WHERE reference->>'keywordId' = k.id::text
      )
    )
), plan_refs AS (
  SELECT plan.version_id
  FROM public.editorial_artifact_versions plan
  WHERE plan.marca_id = p_brand_id
    AND plan.artifact_type = 'content_plan'
    AND (
      plan.source_version_id IN (SELECT version_id FROM article_refs)
      OR plan.payload->>'articleDnaVersionId' IN (SELECT version_id FROM article_refs)
      OR plan.payload->>'articleId' IN (SELECT entity_id FROM article_refs)
    )
), document_refs AS (
  SELECT document.id, document.content_plan_version_id
  FROM public.content_documents document
  WHERE document.marca_id = p_brand_id
    AND (
      document.article_dna_version_id IN (SELECT version_id FROM article_refs)
      OR document.article_id IN (SELECT entity_id FROM article_refs)
      OR document.content_plan_version_id IN (SELECT version_id FROM plan_refs)
    )
), formal_site AS (
  SELECT 1
  FROM keyword_row k
  WHERE public.minerador_keyword_is_published(NULL, k.analise_semantica)
), published_record AS (
  SELECT 1
  FROM public.publication_records publication
  WHERE publication.marca_id = p_brand_id
    AND publication.status = 'published'
    AND (
      publication.article_id IN (SELECT entity_id FROM article_refs)
      OR publication.content_plan_version_id IN (SELECT version_id FROM plan_refs)
      OR publication.document_id IN (SELECT id FROM document_refs)
      OR publication.content_plan_version_id IN (SELECT content_plan_version_id FROM document_refs WHERE content_plan_version_id IS NOT NULL)
    )
)
SELECT EXISTS (SELECT 1 FROM formal_site)
  OR EXISTS (SELECT 1 FROM published_record);
$function$;

COMMENT ON FUNCTION public.lifecycle_keyword_is_published(uuid, uuid) IS
  'Resolver server-side: somente vínculo formal de site ou linhagem real até publication_records.status=published. Status legado, DNA, workflow, aprovação, métricas e handoff não são publicação.';

CREATE OR REPLACE FUNCTION public.protect_published_keyword()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  structural_changed boolean := false;
  old_json jsonb;
  new_json jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('lifecycle.keyword_operation', true) = 'purge'
      AND OLD.deleted_at IS NOT NULL
      AND OLD.purge_after IS NOT NULL
      AND OLD.purge_after <= current_timestamp THEN
      RETURN OLD;
    END IF;
    IF public.lifecycle_keyword_is_published(OLD.brand_id, OLD.id) THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NOT NULL
      AND current_setting('lifecycle.keyword_operation', true) IS DISTINCT FROM 'internal' THEN
      RAISE EXCEPTION 'KEYWORD_RECOVERABLE_DELETE_FAILED';
    END IF;

    IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.purge_after IS DISTINCT FROM OLD.purge_after
      OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by)
      AND current_setting('lifecycle.keyword_operation', true) IS DISTINCT FROM 'internal' THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
    END IF;

    IF public.lifecycle_keyword_is_published(OLD.brand_id, OLD.id) THEN
      old_json := to_jsonb(OLD);
      new_json := to_jsonb(NEW);
      IF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.keyword IS DISTINCT FROM OLD.keyword
        OR NEW.lista_id IS DISTINCT FROM OLD.lista_id
        OR (old_json ? 'location' AND new_json->>'location' IS DISTINCT FROM old_json->>'location')
        OR (old_json ? 'slug' AND new_json->>'slug' IS DISTINCT FROM old_json->>'slug')
        OR (old_json ? 'canonical' AND new_json->>'canonical' IS DISTINCT FROM old_json->>'canonical') THEN
        structural_changed := true;
      END IF;
      IF structural_changed THEN
        RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: campos estruturais de keywords publicadas nao podem ser alterados.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

ALTER FUNCTION public.protect_published_keyword() SET search_path TO pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.lifecycle_keyword_deletion_impact(
  p_brand_id uuid,
  p_keyword_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  keyword_row record;
  published boolean;
  article_count integer;
  document_count integer;
  publication_count integer;
  decision_count integer;
BEGIN
  IF p_brand_id IS NULL OR p_keyword_id IS NULL OR p_actor_user_id IS NULL
    OR NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED';
  END IF;

  SELECT k.id, k.brand_id, k.keyword, k.status, k.analise_semantica, k.deleted_at, k.purge_after
  INTO keyword_row
  FROM public.minerador_keywords k
  WHERE k.id = p_keyword_id AND k.brand_id = p_brand_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KEYWORD_DELETE_NOT_FOUND'; END IF;

  published := public.lifecycle_keyword_is_published(p_brand_id, p_keyword_id);

  SELECT count(*)::integer INTO article_count
  FROM public.editorial_artifact_versions av
  WHERE av.marca_id = p_brand_id AND av.artifact_type = 'article_dna'
    AND (
      av.payload->>'principalKeywordId' = p_keyword_id::text
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(av.payload->'keywordReferences') = 'array' THEN av.payload->'keywordReferences' ELSE '[]'::jsonb END
        ) AS reference WHERE reference->>'keywordId' = p_keyword_id::text
      )
    );

  SELECT count(*)::integer INTO document_count
  FROM public.content_documents document
  WHERE document.marca_id = p_brand_id
    AND (
      document.article_id = p_keyword_id::text
      OR document.article_dna_version_id IN (
        SELECT av.version_id FROM public.editorial_artifact_versions av
        WHERE av.marca_id = p_brand_id AND av.artifact_type = 'article_dna'
          AND (av.payload->>'principalKeywordId' = p_keyword_id::text OR av.payload::text LIKE '%' || p_keyword_id::text || '%')
      )
    );

  SELECT count(*)::integer INTO publication_count
  FROM public.publication_records publication
  WHERE publication.marca_id = p_brand_id
    AND publication.status = 'published'
    AND (
      publication.article_id = p_keyword_id::text
      OR publication.payload::text LIKE '%' || p_keyword_id::text || '%'
    );

  SELECT count(*)::integer INTO decision_count
  FROM public.editorial_decision_events event
  JOIN public.editorial_workflow_items workflow_item ON workflow_item.id = event.workflow_item_id
  WHERE workflow_item.marca_id = p_brand_id
    AND (workflow_item.subject_id = p_keyword_id::text OR workflow_item.source_entity_id = p_keyword_id::text);

  RETURN jsonb_build_object(
    'root', jsonb_build_object('type', 'minerador_keyword', 'id', keyword_row.id, 'brandId', keyword_row.brand_id, 'label', keyword_row.keyword, 'status', keyword_row.status),
    'isPublished', published,
    'mode', CASE WHEN published THEN 'recoverable' WHEN document_count > 0 THEN 'blocked' ELSE 'hard' END,
    'recoveryState', CASE WHEN published THEN 'recoverable' ELSE 'active' END,
    'ownedChildren', jsonb_build_array(
      jsonb_build_object('key', 'keyword_metric_measurements', 'label', 'medições próprias', 'count', (SELECT count(*) FROM public.minerador_keyword_metric_measurements WHERE brand_id = p_brand_id AND keyword_id = p_keyword_id), 'classification', 'OWNED_CHILD', 'behavior', 'delete'),
      jsonb_build_object('key', 'discovery_origins', 'label', 'origens de Discovery', 'count', (SELECT count(*) FROM public.minerador_discovery_keyword_origins WHERE brand_id = p_brand_id AND keyword_id = p_keyword_id), 'classification', 'OWNED_CHILD', 'behavior', 'delete'),
      jsonb_build_object('key', 'discovery_current_metrics', 'label', 'métricas atuais de Discovery', 'count', (SELECT count(*) FROM public.minerador_discovery_candidate_current_metrics WHERE brand_id = p_brand_id AND keyword_id = p_keyword_id), 'classification', 'OWNED_CHILD', 'behavior', 'delete'),
      jsonb_build_object('key', 'discovery_metric_history', 'label', 'histórico de métricas de Discovery', 'count', (SELECT count(*) FROM public.minerador_discovery_candidate_metric_history WHERE brand_id = p_brand_id AND keyword_id = p_keyword_id), 'classification', 'OWNED_CHILD', 'behavior', 'delete')
    ),
    'downstreamDrafts', jsonb_build_array(
      jsonb_build_object('key', 'article_dna', 'label', 'ArticleDNA em histórico canônico', 'count', article_count, 'classification', 'CANONICAL_HISTORY', 'behavior', 'preserve'),
      jsonb_build_object('key', 'content_documents', 'label', 'ContentDocument downstream', 'count', document_count, 'classification', 'DRAFT_DESCENDANT', 'behavior', CASE WHEN document_count > 0 THEN 'block' ELSE 'delete' END),
      jsonb_build_object('key', 'decision_events', 'label', 'eventos de decisão', 'count', decision_count, 'classification', 'CANONICAL_HISTORY', 'behavior', 'preserve')
    ),
    'sharedReferences', jsonb_build_array(
      jsonb_build_object('key', 'discovery_candidates', 'label', 'vínculos compartilhados de Discovery', 'count', (SELECT count(*) FROM public.minerador_discovery_candidates WHERE brand_id = p_brand_id AND (existing_keyword_id = p_keyword_id OR imported_keyword_id = p_keyword_id)), 'classification', 'SHARED_REFERENCE', 'behavior', 'unlink'),
      jsonb_build_object('key', 'workflow_items', 'label', 'itens operacionais de handoff', 'count', (SELECT count(*) FROM public.editorial_workflow_items WHERE marca_id = p_brand_id AND (subject_id = p_keyword_id::text OR source_entity_id = p_keyword_id::text)), 'classification', 'SHARED_REFERENCE', 'behavior', CASE WHEN decision_count > 0 THEN 'preserve' ELSE 'delete' END)
    ),
    'publishedReferences', jsonb_build_array(
      jsonb_build_object('key', 'publication_records', 'label', 'PublicationRecord publicado', 'count', publication_count + CASE WHEN public.minerador_keyword_is_published(keyword_row.status, keyword_row.analise_semantica) THEN 1 ELSE 0 END, 'classification', 'PUBLISHED_REFERENCE', 'behavior', 'preserve')
    ),
    'partialDelete', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.lifecycle_preview_minerador_keywords(
  p_brand_id uuid,
  p_keyword_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
WITH requested AS (
  SELECT DISTINCT value AS id
  FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) input(value)
  WHERE value IS NOT NULL
), impacts AS (
  SELECT requested.id, public.lifecycle_keyword_deletion_impact(p_brand_id, requested.id, p_actor_user_id) AS impact
  FROM requested
)
SELECT jsonb_build_object(
  'items', coalesce(jsonb_agg(impact ORDER BY id), '[]'::jsonb),
  'publishedIds', coalesce(jsonb_agg(to_jsonb(id)) FILTER (WHERE impact->>'mode' = 'recoverable'), '[]'::jsonb),
  'hardDeleteIds', coalesce(jsonb_agg(to_jsonb(id)) FILTER (WHERE impact->>'mode' = 'hard'), '[]'::jsonb),
  'blockedIds', coalesce(jsonb_agg(to_jsonb(id)) FILTER (WHERE impact->>'mode' = 'blocked'), '[]'::jsonb),
  'partialDelete', false
)
FROM impacts;
$function$;

CREATE OR REPLACE FUNCTION public.lifecycle_delete_minerador_keywords(
  p_brand_id uuid,
  p_keyword_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  target_ids uuid[];
  found_ids uuid[] := '{}'::uuid[];
  hard_deleted_ids uuid[] := '{}'::uuid[];
  recoverable_ids uuid[] := '{}'::uuid[];
  current_keyword record;
  impact jsonb;
  target_count integer;
  deleted_count integer;
BEGIN
  target_ids := ARRAY(SELECT DISTINCT value FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) input(value) WHERE value IS NOT NULL ORDER BY value);
  target_count := coalesce(cardinality(target_ids), 0);
  IF p_brand_id IS NULL OR p_actor_user_id IS NULL OR target_count = 0 THEN RAISE EXCEPTION 'KEYWORD_DELETE_NOT_FOUND'; END IF;
  IF NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED'; END IF;

  FOR current_keyword IN
    SELECT k.id FROM public.minerador_keywords k WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids) ORDER BY k.id FOR UPDATE
  LOOP
    found_ids := array_append(found_ids, current_keyword.id);
  END LOOP;
  IF cardinality(found_ids) IS DISTINCT FROM target_count THEN RAISE EXCEPTION 'KEYWORD_DELETE_NOT_FOUND'; END IF;

  -- Primeiro resolve todo o lote. Nenhuma mutação ocorre antes de todos os
  -- subjects estarem autorizados e sem downstream operacional bloqueante.
  FOR current_keyword IN SELECT id FROM unnest(target_ids) input(id) ORDER BY id LOOP
    impact := public.lifecycle_keyword_deletion_impact(p_brand_id, current_keyword.id, p_actor_user_id);
    IF impact->>'mode' = 'blocked' THEN RAISE EXCEPTION 'LIFECYCLE_DRAFT_DESCENDANT_REQUIRES_OWNER'; END IF;
  END LOOP;

  PERFORM set_config('lifecycle.keyword_operation', 'internal', true);
  FOR current_keyword IN
    SELECT k.id, k.status, k.analise_semantica, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id
  LOOP
    IF current_keyword.deleted_at IS NOT NULL THEN
      IF current_keyword.purge_after <= current_timestamp THEN RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED'; END IF;
      recoverable_ids := array_append(recoverable_ids, current_keyword.id);
      CONTINUE;
    END IF;

    IF public.lifecycle_keyword_is_published(p_brand_id, current_keyword.id) THEN
      UPDATE public.minerador_keywords
      SET deleted_at = current_timestamp, purge_after = current_timestamp + interval '24 hours', deleted_by = p_actor_user_id
      WHERE brand_id = p_brand_id AND id = current_keyword.id;
      recoverable_ids := array_append(recoverable_ids, current_keyword.id);
      CONTINUE;
    END IF;

    DELETE FROM public.minerador_keyword_metric_measurements WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_candidate_current_metrics WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_candidate_metric_history WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_keyword_origins WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    UPDATE public.minerador_discovery_candidates
    SET existing_keyword_id = CASE WHEN existing_keyword_id = current_keyword.id THEN NULL ELSE existing_keyword_id END,
        imported_keyword_id = CASE WHEN imported_keyword_id = current_keyword.id THEN NULL ELSE imported_keyword_id END,
        import_status = CASE WHEN imported_keyword_id = current_keyword.id THEN 'available' ELSE import_status END
    WHERE brand_id = p_brand_id AND (existing_keyword_id = current_keyword.id OR imported_keyword_id = current_keyword.id);
    DELETE FROM public.editorial_workflow_items workflow_item
    WHERE workflow_item.marca_id = p_brand_id
      AND (workflow_item.subject_id = current_keyword.id::text OR workflow_item.source_entity_id = current_keyword.id::text)
      AND NOT EXISTS (SELECT 1 FROM public.editorial_decision_events event WHERE event.workflow_item_id = workflow_item.id);
    DELETE FROM public.minerador_keywords WHERE brand_id = p_brand_id AND id = current_keyword.id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count <> 1 THEN RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED'; END IF;
    hard_deleted_ids := array_append(hard_deleted_ids, current_keyword.id);
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.minerador_keywords k WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids) AND k.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
  END IF;
  RETURN jsonb_build_object('hardDeletedIds', to_jsonb(hard_deleted_ids), 'recoverableIds', to_jsonb(recoverable_ids), 'partialDelete', false);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0001' THEN RAISE; END IF;
  RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
END;
$function$;

CREATE OR REPLACE FUNCTION public.lifecycle_restore_minerador_keywords(
  p_brand_id uuid,
  p_keyword_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  target_ids uuid[];
  current_keyword record;
  restored_ids uuid[] := '{}'::uuid[];
BEGIN
  target_ids := ARRAY(SELECT DISTINCT value FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) input(value) WHERE value IS NOT NULL ORDER BY value);
  IF p_brand_id IS NULL OR p_actor_user_id IS NULL OR coalesce(cardinality(target_ids), 0) = 0 THEN RAISE EXCEPTION 'KEYWORD_RESTORE_FAILED'; END IF;
  IF NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED'; END IF;
  PERFORM set_config('lifecycle.keyword_operation', 'internal', true);
  FOR current_keyword IN
    SELECT k.id, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id FOR UPDATE
  LOOP
    IF current_keyword.deleted_at IS NULL OR current_keyword.purge_after IS NULL THEN
      restored_ids := array_append(restored_ids, current_keyword.id);
    ELSIF current_keyword.purge_after <= current_timestamp THEN
      RAISE EXCEPTION 'KEYWORD_RESTORE_WINDOW_EXPIRED';
    ELSE
      UPDATE public.minerador_keywords SET deleted_at = NULL, purge_after = NULL, deleted_by = NULL WHERE brand_id = p_brand_id AND id = current_keyword.id;
      restored_ids := array_append(restored_ids, current_keyword.id);
    END IF;
  END LOOP;
  IF cardinality(restored_ids) IS DISTINCT FROM cardinality(target_ids) THEN RAISE EXCEPTION 'KEYWORD_RESTORE_FAILED'; END IF;
  RETURN jsonb_build_object('restoredIds', to_jsonb(restored_ids), 'partialDelete', false);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0001' THEN RAISE; END IF;
  RAISE EXCEPTION 'KEYWORD_RESTORE_FAILED';
END;
$function$;

CREATE OR REPLACE FUNCTION public.lifecycle_purge_minerador_keywords(
  p_brand_id uuid,
  p_keyword_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  target_ids uuid[];
  purged_ids uuid[] := '{}'::uuid[];
  current_keyword record;
  deleted_count integer;
BEGIN
  target_ids := ARRAY(SELECT DISTINCT value FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) input(value) WHERE value IS NOT NULL ORDER BY value);
  IF p_brand_id IS NULL OR p_actor_user_id IS NULL OR coalesce(cardinality(target_ids), 0) = 0 THEN RAISE EXCEPTION 'KEYWORD_PURGE_FAILED'; END IF;
  IF NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED'; END IF;
  PERFORM set_config('lifecycle.keyword_operation', 'purge', true);
  FOR current_keyword IN
    SELECT k.id, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id FOR UPDATE
  LOOP
    IF current_keyword.deleted_at IS NULL OR current_keyword.purge_after IS NULL OR current_keyword.purge_after > current_timestamp THEN RAISE EXCEPTION 'KEYWORD_PURGE_NOT_YET_ALLOWED'; END IF;
    DELETE FROM public.minerador_keyword_metric_measurements WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_candidate_current_metrics WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_candidate_metric_history WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_keyword_origins WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    UPDATE public.minerador_discovery_candidates
    SET existing_keyword_id = CASE WHEN existing_keyword_id = current_keyword.id THEN NULL ELSE existing_keyword_id END,
        imported_keyword_id = CASE WHEN imported_keyword_id = current_keyword.id THEN NULL ELSE imported_keyword_id END,
        import_status = CASE WHEN imported_keyword_id = current_keyword.id THEN 'available' ELSE import_status END
    WHERE brand_id = p_brand_id AND (existing_keyword_id = current_keyword.id OR imported_keyword_id = current_keyword.id);
    DELETE FROM public.editorial_workflow_items workflow_item
    WHERE workflow_item.marca_id = p_brand_id
      AND (workflow_item.subject_id = current_keyword.id::text OR workflow_item.source_entity_id = current_keyword.id::text)
      AND NOT EXISTS (SELECT 1 FROM public.editorial_decision_events event WHERE event.workflow_item_id = workflow_item.id);
    DELETE FROM public.minerador_keywords WHERE brand_id = p_brand_id AND id = current_keyword.id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count <> 1 THEN RAISE EXCEPTION 'KEYWORD_PURGE_FAILED'; END IF;
    purged_ids := array_append(purged_ids, current_keyword.id);
  END LOOP;
  RETURN jsonb_build_object('purgedIds', to_jsonb(purged_ids), 'partialDelete', false);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0001' THEN RAISE; END IF;
  RAISE EXCEPTION 'KEYWORD_PURGE_FAILED';
END;
$function$;

-- Compatibility names remain typed and point to the shared implementation.
CREATE OR REPLACE FUNCTION public.delete_minerador_keywords(uuid, uuid[], uuid, boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
BEGIN
  IF NOT $4 AND EXISTS (
    SELECT 1 FROM unnest($2) input(id) WHERE public.lifecycle_keyword_is_published($1, input.id)
  ) THEN RAISE EXCEPTION 'KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW'; END IF;
  RETURN public.lifecycle_delete_minerador_keywords($1, $2, $3);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_minerador_keyword(uuid, uuid, uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
  SELECT public.lifecycle_delete_minerador_keywords($1, ARRAY[$2]::uuid[], $3);
$function$;

CREATE OR REPLACE FUNCTION public.recover_minerador_keywords(uuid, uuid[], uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
  SELECT public.lifecycle_restore_minerador_keywords($1, $2, $3);
$function$;

CREATE OR REPLACE FUNCTION public.restore_minerador_keyword(uuid, uuid, uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
  SELECT public.lifecycle_restore_minerador_keywords($1, ARRAY[$2]::uuid[], $3);
$function$;

CREATE OR REPLACE FUNCTION public.purge_minerador_keywords(uuid, uuid[], uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
  SELECT public.lifecycle_purge_minerador_keywords($1, $2, $3);
$function$;

REVOKE DELETE ON TABLE public.minerador_keywords FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.minerador_keyword_is_published(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_keyword_is_published(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_keyword_deletion_impact(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_preview_minerador_keywords(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_restore_minerador_keywords(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lifecycle_purge_minerador_keywords(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_minerador_keywords(uuid, uuid[], uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_minerador_keyword(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_minerador_keywords(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_minerador_keyword(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_minerador_keywords(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lifecycle_keyword_deletion_impact(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_preview_minerador_keywords(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_restore_minerador_keywords(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_purge_minerador_keywords(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_minerador_keywords(uuid, uuid[], uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_minerador_keyword(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_minerador_keywords(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_minerador_keyword(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_minerador_keywords(uuid, uuid[], uuid) TO service_role;

COMMIT;
