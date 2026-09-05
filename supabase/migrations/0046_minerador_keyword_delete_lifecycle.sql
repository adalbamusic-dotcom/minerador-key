-- 0046: ciclo de vida canônico da exclusão de keywords.
--
-- Preparação local. Não aplicar remotamente sem preflight, revisão manual,
-- janela autorizada e readback autenticado.
--
-- A operação não usa CASCADE como atalho. Dependências próprias são tratadas
-- explicitamente dentro de uma única transação; relações compartilhadas são
-- preservadas e apenas seus vínculos com a keyword são removidos.

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
    OR to_regclass('public.marcas') IS NULL THEN
    RAISE EXCEPTION 'MINERADOR_0046_PRECONDITION: relação canônica ausente';
  END IF;

  IF to_regprocedure('public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.protect_published_keyword()') IS NULL THEN
    RAISE EXCEPTION 'MINERADOR_0046_PRECONDITION: contrato de autorização/proteção ausente';
  END IF;
END $$;

ALTER TABLE public.minerador_keywords
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.minerador_keywords'::regclass
      AND attname IN ('deleted_at', 'purge_after')
      AND attnum > 0
      AND NOT attisdropped
  ) <> 2
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.minerador_keywords'::regclass
      AND attname IN ('deleted_at', 'purge_after')
      AND attnum > 0
      AND NOT attisdropped
      AND atttypid <> 'timestamptz'::regtype
  ) THEN
    RAISE EXCEPTION 'MINERADOR_0046_PRECONDITION: colunas de tombstone devem ser timestamptz';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.minerador_keywords
    WHERE (deleted_at IS NULL AND purge_after IS NOT NULL)
       OR (deleted_at IS NOT NULL AND purge_after IS NULL)
       OR (deleted_at IS NOT NULL AND purge_after IS DISTINCT FROM deleted_at + interval '24 hours')
  ) THEN
    RAISE EXCEPTION 'MINERADOR_0046_PRECONDITION: estado de tombstone inconsistente';
  END IF;
END $$;

ALTER TABLE public.minerador_keywords
  DROP CONSTRAINT IF EXISTS minerador_keywords_delete_lifecycle_check;

ALTER TABLE public.minerador_keywords
  ADD CONSTRAINT minerador_keywords_delete_lifecycle_check
  CHECK (
    (deleted_at IS NULL AND purge_after IS NULL)
    OR (deleted_at IS NOT NULL AND purge_after = deleted_at + interval '24 hours')
  );

CREATE INDEX IF NOT EXISTS minerador_keywords_recoverable_idx
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
AS $$
  SELECT
    (
      lower(coalesce(p_status, '')) = 'publicado'
      AND nullif(btrim(p_semantic #>> '{site_origin,publicationCorrectedAt}'), '') IS NULL
      AND nullif(btrim(p_semantic #>> '{site_origin,publicationUnlinkedAt}'), '') IS NULL
    )
    OR (
      lower(coalesce(p_semantic #>> '{site_origin,publicationStatus}')) = 'published'
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
        'accessible', 'canonical_confirmed', 'canonical_missing',
        'canonical_conflict', 'noindex'
      )
      AND nullif(btrim(p_semantic #>> '{site_origin,publicationConfirmedBy}'), '') IS NOT NULL
      AND nullif(btrim(p_semantic #>> '{site_origin,publicationConfirmedAt}'), '') IS NOT NULL
      AND nullif(btrim(p_semantic #>> '{site_origin,publicationCorrectedAt}'), '') IS NULL
      AND nullif(btrim(p_semantic #>> '{site_origin,publicationUnlinkedAt}'), '') IS NULL
    );
$$;

COMMENT ON FUNCTION public.minerador_keyword_is_published(text, jsonb) IS
  'Resolve publicação no servidor: vínculo de site formal ou status legado explícito; DNA, workflow, métricas e handoff não promovem publicação.';

-- A trigger histórica continua protegendo os campos publicados, mas permite
-- somente a transição interna do lifecycle e o purge de um tombstone vencido.
CREATE OR REPLACE FUNCTION public.protect_published_keyword()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  structural_changed boolean := false;
  old_json jsonb;
  new_json jsonb;
BEGIN
  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  IF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NOT NULL
      AND OLD.purge_after IS NOT NULL
      AND OLD.purge_after <= current_timestamp THEN
      RETURN OLD;
    END IF;

    IF public.minerador_keyword_is_published(OLD.status, OLD.analise_semantica) THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NOT NULL
      AND current_setting('minerador.keyword_lifecycle_operation', true) IS DISTINCT FROM 'internal' THEN
      RAISE EXCEPTION 'KEYWORD_RECOVERABLE_DELETE_FAILED';
    END IF;

    IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.purge_after IS DISTINCT FROM OLD.purge_after)
      AND current_setting('minerador.keyword_lifecycle_operation', true) IS DISTINCT FROM 'internal' THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
    END IF;

    IF public.minerador_keyword_is_published(OLD.status, OLD.analise_semantica) THEN
      IF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.keyword IS DISTINCT FROM OLD.keyword
        OR NEW.lista_id IS DISTINCT FROM OLD.lista_id THEN
        structural_changed := true;
      END IF;

      IF old_json ? 'location' AND (new_json->>'location') IS DISTINCT FROM (old_json->>'location') THEN
        structural_changed := true;
      END IF;
      IF old_json ? 'slug' AND (new_json->>'slug') IS DISTINCT FROM (old_json->>'slug') THEN
        structural_changed := true;
      END IF;
      IF old_json ? 'canonical' AND (new_json->>'canonical') IS DISTINCT FROM (old_json->>'canonical') THEN
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
$$;

ALTER FUNCTION public.protect_published_keyword() SET search_path TO pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.delete_minerador_keywords(
  p_brand_id uuid,
  p_keyword_ids uuid[],
  p_actor_user_id uuid,
  p_allow_recoverable boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target_ids uuid[];
  found_ids uuid[] := '{}'::uuid[];
  hard_deleted_ids uuid[] := '{}'::uuid[];
  recoverable_ids uuid[] := '{}'::uuid[];
  current_keyword record;
  target_count integer;
  deleted_count integer;
  is_published boolean;
BEGIN
  target_ids := ARRAY(
    SELECT DISTINCT value
    FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) AS input(value)
    WHERE value IS NOT NULL
    ORDER BY value
  );
  target_count := coalesce(cardinality(target_ids), 0);

  IF p_brand_id IS NULL OR p_actor_user_id IS NULL OR target_count = 0 THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_NOT_FOUND';
  END IF;

  IF NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.minerador_keywords k
    WHERE k.id = ANY(target_ids)
      AND k.brand_id IS DISTINCT FROM p_brand_id
  ) THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_BRAND_MISMATCH';
  END IF;

  FOR current_keyword IN
    SELECT k.id, k.brand_id, k.status, k.analise_semantica, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id
    FOR UPDATE
  LOOP
    found_ids := array_append(found_ids, current_keyword.id);
  END LOOP;

  IF cardinality(found_ids) IS DISTINCT FROM target_count THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_NOT_FOUND';
  END IF;

  -- The complete batch is checked before any mutation, so a published row
  -- cannot cause a partially hard-deleted mixed batch.
  FOR current_keyword IN
    SELECT k.id, k.status, k.analise_semantica, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id
  LOOP
    IF current_keyword.deleted_at IS NOT NULL
      AND current_keyword.purge_after IS NOT NULL
      AND current_keyword.purge_after <= current_timestamp THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
    END IF;

    is_published := public.minerador_keyword_is_published(current_keyword.status, current_keyword.analise_semantica);
    IF current_keyword.deleted_at IS NULL AND is_published AND NOT p_allow_recoverable THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW';
    END IF;
  END LOOP;

  PERFORM set_config('minerador.keyword_lifecycle_operation', 'internal', true);

  FOR current_keyword IN
    SELECT k.id, k.status, k.analise_semantica, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id
  LOOP
    IF current_keyword.deleted_at IS NOT NULL THEN
      recoverable_ids := array_append(recoverable_ids, current_keyword.id);
      CONTINUE;
    END IF;

    is_published := public.minerador_keyword_is_published(current_keyword.status, current_keyword.analise_semantica);
    IF is_published THEN
      UPDATE public.minerador_keywords
      SET deleted_at = current_timestamp,
          purge_after = current_timestamp + interval '24 hours'
      WHERE brand_id = p_brand_id AND id = current_keyword.id;
      recoverable_ids := array_append(recoverable_ids, current_keyword.id);
      CONTINUE;
    END IF;

    -- Own metric/provenance rows are removed explicitly. Shared Discovery
    -- candidates survive; only their reference to this keyword is cleared.
    DELETE FROM public.minerador_keyword_metric_measurements
    WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;

    DELETE FROM public.minerador_discovery_candidate_current_metrics
    WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;

    DELETE FROM public.minerador_discovery_candidate_metric_history
    WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;

    DELETE FROM public.minerador_discovery_keyword_origins
    WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;

    UPDATE public.minerador_discovery_candidates
    SET existing_keyword_id = CASE WHEN existing_keyword_id = current_keyword.id THEN NULL ELSE existing_keyword_id END,
        imported_keyword_id = CASE WHEN imported_keyword_id = current_keyword.id THEN NULL ELSE imported_keyword_id END,
        import_status = CASE WHEN imported_keyword_id = current_keyword.id THEN 'available' ELSE import_status END
    WHERE brand_id = p_brand_id
      AND (existing_keyword_id = current_keyword.id OR imported_keyword_id = current_keyword.id);

    -- Unreferenced workflow items owned by the Minerador subject may be
    -- removed. Items referenced by append-only decision events stay in place
    -- so historical evidence and its FK remain intact. Immutable editorial
    -- artifact versions and status/decision events always survive.
    DELETE FROM public.editorial_workflow_items AS workflow_item
    WHERE workflow_item.marca_id = p_brand_id
      AND workflow_item.subject_type = 'keyword'
      AND (workflow_item.subject_id = current_keyword.id::text OR workflow_item.source_entity_id = current_keyword.id::text)
      AND NOT EXISTS (
        SELECT 1
        FROM public.editorial_decision_events event
        WHERE event.workflow_item_id = workflow_item.id
      );

    DELETE FROM public.minerador_keywords
    WHERE brand_id = p_brand_id AND id = current_keyword.id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count <> 1 THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
    END IF;
    hard_deleted_ids := array_append(hard_deleted_ids, current_keyword.id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id
      AND k.id = ANY(target_ids)
      AND k.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
  END IF;

  RETURN jsonb_build_object(
    'hardDeletedIds', to_jsonb(hard_deleted_ids),
    'recoverableIds', to_jsonb(recoverable_ids),
    'partialDelete', false
  );
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_minerador_keyword(
  p_brand_id uuid,
  p_keyword_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.delete_minerador_keywords(
    p_brand_id,
    ARRAY[p_keyword_id]::uuid[],
    p_actor_user_id,
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.recover_minerador_keywords(
  p_brand_id uuid,
  p_keyword_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target_ids uuid[];
  current_keyword record;
  restored_ids uuid[] := '{}'::uuid[];
  found_count integer := 0;
BEGIN
  target_ids := ARRAY(
    SELECT DISTINCT value
    FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) AS input(value)
    WHERE value IS NOT NULL
    ORDER BY value
  );
  IF p_brand_id IS NULL OR p_actor_user_id IS NULL OR coalesce(cardinality(target_ids), 0) = 0 THEN
    RAISE EXCEPTION 'KEYWORD_RESTORE_FAILED';
  END IF;
  IF NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.minerador_keywords k
    WHERE k.id = ANY(target_ids) AND k.brand_id IS DISTINCT FROM p_brand_id
  ) THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_BRAND_MISMATCH';
  END IF;

  FOR current_keyword IN
    SELECT k.id, k.status, k.analise_semantica, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id
    FOR UPDATE
  LOOP
    found_count := found_count + 1;
    IF current_keyword.deleted_at IS NOT NULL
      AND current_keyword.purge_after <= current_timestamp THEN
      RAISE EXCEPTION 'KEYWORD_RESTORE_WINDOW_EXPIRED';
    END IF;
  END LOOP;

  IF found_count <> cardinality(target_ids) THEN
    RAISE EXCEPTION 'KEYWORD_RESTORE_FAILED';
  END IF;

  PERFORM set_config('minerador.keyword_lifecycle_operation', 'internal', true);
  FOR current_keyword IN
    SELECT k.id, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id
  LOOP
    IF current_keyword.deleted_at IS NOT NULL THEN
      UPDATE public.minerador_keywords
      SET deleted_at = NULL, purge_after = NULL
      WHERE brand_id = p_brand_id AND id = current_keyword.id;
    END IF;
    restored_ids := array_append(restored_ids, current_keyword.id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id
      AND k.id = ANY(target_ids)
      AND (k.deleted_at IS NOT NULL OR k.purge_after IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'KEYWORD_RESTORE_FAILED';
  END IF;

  RETURN jsonb_build_object('restoredIds', to_jsonb(restored_ids), 'partialDelete', false);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION 'KEYWORD_RESTORE_FAILED';
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_minerador_keyword(
  p_brand_id uuid,
  p_keyword_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.recover_minerador_keywords(p_brand_id, ARRAY[p_keyword_id]::uuid[], p_actor_user_id);
$$;

CREATE OR REPLACE FUNCTION public.purge_minerador_keywords(
  p_brand_id uuid,
  p_keyword_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  target_ids uuid[];
  current_keyword record;
  purged_ids uuid[] := '{}'::uuid[];
  found_count integer := 0;
  deleted_count integer;
BEGIN
  target_ids := ARRAY(
    SELECT DISTINCT value
    FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) AS input(value)
    WHERE value IS NOT NULL
    ORDER BY value
  );
  IF p_brand_id IS NULL OR p_actor_user_id IS NULL OR coalesce(cardinality(target_ids), 0) = 0 THEN
    RAISE EXCEPTION 'KEYWORD_PURGE_FAILED';
  END IF;
  IF NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.minerador_keywords k
    WHERE k.id = ANY(target_ids) AND k.brand_id IS DISTINCT FROM p_brand_id
  ) THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_BRAND_MISMATCH';
  END IF;

  FOR current_keyword IN
    SELECT k.id, k.deleted_at, k.purge_after
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id
    FOR UPDATE
  LOOP
    found_count := found_count + 1;
    IF current_keyword.deleted_at IS NULL OR current_keyword.purge_after IS NULL THEN
      RAISE EXCEPTION 'KEYWORD_PURGE_NOT_YET_ALLOWED';
    END IF;
    IF current_keyword.purge_after > current_timestamp THEN
      RAISE EXCEPTION 'KEYWORD_PURGE_NOT_YET_ALLOWED';
    END IF;
  END LOOP;
  IF found_count <> cardinality(target_ids) THEN
    RAISE EXCEPTION 'KEYWORD_PURGE_FAILED';
  END IF;

  PERFORM set_config('minerador.keyword_lifecycle_operation', 'internal', true);
  FOR current_keyword IN
    SELECT k.id
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
    ORDER BY k.id
  LOOP
    -- Published downstream artifacts and PublicationRecord are intentionally
    -- not touched. Only keyword-owned measurements and shared-link rows are
    -- removed before the expired tombstone itself.
    DELETE FROM public.minerador_keyword_metric_measurements
    WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_candidate_current_metrics
    WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_candidate_metric_history
    WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    DELETE FROM public.minerador_discovery_keyword_origins
    WHERE brand_id = p_brand_id AND keyword_id = current_keyword.id;
    UPDATE public.minerador_discovery_candidates
    SET existing_keyword_id = CASE WHEN existing_keyword_id = current_keyword.id THEN NULL ELSE existing_keyword_id END,
        imported_keyword_id = CASE WHEN imported_keyword_id = current_keyword.id THEN NULL ELSE imported_keyword_id END,
        import_status = CASE WHEN imported_keyword_id = current_keyword.id THEN 'available' ELSE import_status END
    WHERE brand_id = p_brand_id
      AND (existing_keyword_id = current_keyword.id OR imported_keyword_id = current_keyword.id);

    DELETE FROM public.minerador_keywords
    WHERE brand_id = p_brand_id AND id = current_keyword.id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count <> 1 THEN
      RAISE EXCEPTION 'KEYWORD_PURGE_FAILED';
    END IF;
    purged_ids := array_append(purged_ids, current_keyword.id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.minerador_keywords k
    WHERE k.brand_id = p_brand_id AND k.id = ANY(target_ids)
  ) THEN
    RAISE EXCEPTION 'KEYWORD_PURGE_FAILED';
  END IF;

  RETURN jsonb_build_object('purgedIds', to_jsonb(purged_ids), 'partialDelete', false);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION 'KEYWORD_PURGE_FAILED';
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_minerador_keyword(
  p_brand_id uuid,
  p_keyword_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.purge_minerador_keywords(p_brand_id, ARRAY[p_keyword_id]::uuid[], p_actor_user_id);
$$;

ALTER FUNCTION public.minerador_keyword_is_published(text, jsonb) SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.delete_minerador_keywords(uuid, uuid[], uuid, boolean) SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.delete_minerador_keyword(uuid, uuid, uuid) SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.recover_minerador_keywords(uuid, uuid[], uuid) SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.restore_minerador_keyword(uuid, uuid, uuid) SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.purge_minerador_keywords(uuid, uuid[], uuid) SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.purge_minerador_keyword(uuid, uuid, uuid) SET search_path TO pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.minerador_keyword_is_published(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_minerador_keywords(uuid, uuid[], uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_minerador_keyword(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_minerador_keywords(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_minerador_keyword(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_minerador_keywords(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_minerador_keyword(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_minerador_keywords(uuid, uuid[], uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_minerador_keyword(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_minerador_keywords(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_minerador_keyword(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_minerador_keywords(uuid, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_minerador_keyword(uuid, uuid, uuid) TO service_role;

-- The client must use the transactional RPC; direct table deletes would
-- bypass dependency ordering and the published/recoverable decision.
REVOKE DELETE ON TABLE public.minerador_keywords FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON COLUMN public.minerador_keywords.deleted_at IS
  'Tombstone temporário somente para keyword publicada; a linha sai da operação normal.';
COMMENT ON COLUMN public.minerador_keywords.purge_after IS
  'Momento em que o purge server-side pode destruir o tombstone publicado.';

COMMIT;
