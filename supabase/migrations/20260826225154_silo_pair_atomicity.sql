BEGIN;

-- The pair is persisted through one server-side transaction.  The function is
-- SECURITY INVOKER on purpose: only the server's service_role receives
-- EXECUTE, while the canonical actor/Brand checks still run for the explicit
-- actor supplied by the application.
CREATE FUNCTION public.persist_silo_pair_atomic(
  p_marca_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_silo_dna jsonb,
  p_silo_page jsonb,
  p_silo_dna_status text,
  p_silo_page_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  dna_version_id text;
  dna_entity_id text;
  dna_version_number integer;
  dna_previous_version_id text;
  dna_content_hash text;
  dna_origin text;
  dna_change_reason text;
  dna_created_at timestamptz;
  dna_payload jsonb;
  page_version_id text;
  page_entity_id text;
  page_version_number integer;
  page_previous_version_id text;
  page_content_hash text;
  page_origin text;
  page_change_reason text;
  page_created_at timestamptz;
  page_payload jsonb;
  page_dna_ref jsonb;
  latest_dna_version_id text;
  latest_dna_version_number integer;
  latest_page_version_id text;
  latest_page_version_number integer;
  dna_row public.editorial_artifact_versions%ROWTYPE;
  page_row public.editorial_artifact_versions%ROWTYPE;
BEGIN
  IF p_marca_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'silo pair requires Brand and actor';
  END IF;
  IF p_action NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'silo pair action is not allowed';
  END IF;
  IF jsonb_typeof(p_silo_dna) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_silo_page) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'silo pair envelopes must be objects';
  END IF;

  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT public.canonical_actor_can_access_brand(p_marca_id, p_actor_user_id)
     OR NOT public.canonical_actor_can_use_brand_action(p_marca_id, p_actor_user_id, 'arquiteto', p_action) THEN
    RAISE EXCEPTION 'silo pair actor is not authorized for this Brand and action';
  END IF;

  IF p_silo_dna->>'payload' IS NULL
     OR p_silo_page->>'payload' IS NULL
     OR jsonb_typeof(p_silo_dna->'payload') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_silo_page->'payload') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'silo pair payloads are invalid';
  END IF;
  IF COALESCE(p_silo_dna->>'versionId', '') = ''
     OR COALESCE(p_silo_dna->>'entityId', '') = ''
     OR COALESCE(p_silo_dna->>'versionNumber', '') !~ '^[0-9]+$'
     OR COALESCE(p_silo_dna->>'contentHash', '') = ''
     OR COALESCE(p_silo_dna->>'origin', '') = ''
     OR COALESCE(p_silo_dna->>'changeReason', '') = ''
     OR COALESCE(p_silo_dna->>'createdAt', '') = ''
     OR COALESCE(p_silo_page->>'versionId', '') = ''
     OR COALESCE(p_silo_page->>'entityId', '') = ''
     OR COALESCE(p_silo_page->>'versionNumber', '') !~ '^[0-9]+$'
     OR COALESCE(p_silo_page->>'contentHash', '') = ''
     OR COALESCE(p_silo_page->>'origin', '') = ''
     OR COALESCE(p_silo_page->>'changeReason', '') = ''
     OR COALESCE(p_silo_page->>'createdAt', '') = '' THEN
    RAISE EXCEPTION 'silo pair envelope fields are incomplete';
  END IF;
  IF p_silo_dna->>'createdBy' IS DISTINCT FROM p_actor_user_id::text
     OR p_silo_page->>'createdBy' IS DISTINCT FROM p_actor_user_id::text THEN
    RAISE EXCEPTION 'silo pair actor does not match envelope creator';
  END IF;
  IF p_silo_dna_status IS NULL OR btrim(p_silo_dna_status) = ''
     OR p_silo_page_status IS NULL OR btrim(p_silo_page_status) = '' THEN
    RAISE EXCEPTION 'silo pair statuses are required';
  END IF;
  IF p_silo_dna_status NOT IN ('draft', 'proposed', 'approved', 'rejected', 'superseded')
     OR p_silo_page_status NOT IN ('draft', 'proposed', 'approved', 'rejected', 'superseded') THEN
    RAISE EXCEPTION 'silo pair statuses are invalid';
  END IF;

  dna_version_id := p_silo_dna->>'versionId';
  dna_entity_id := p_silo_dna->>'entityId';
  dna_version_number := (p_silo_dna->>'versionNumber')::integer;
  dna_previous_version_id := NULLIF(p_silo_dna->>'previousVersionId', '');
  dna_content_hash := p_silo_dna->>'contentHash';
  dna_origin := p_silo_dna->>'origin';
  dna_change_reason := p_silo_dna->>'changeReason';
  dna_created_at := (p_silo_dna->>'createdAt')::timestamptz;
  dna_payload := p_silo_dna->'payload';

  page_version_id := p_silo_page->>'versionId';
  page_entity_id := p_silo_page->>'entityId';
  page_version_number := (p_silo_page->>'versionNumber')::integer;
  page_previous_version_id := NULLIF(p_silo_page->>'previousVersionId', '');
  page_content_hash := p_silo_page->>'contentHash';
  page_origin := p_silo_page->>'origin';
  page_change_reason := p_silo_page->>'changeReason';
  page_created_at := (p_silo_page->>'createdAt')::timestamptz;
  page_payload := p_silo_page->'payload';
  page_dna_ref := p_silo_page->'payload'->'siloDnaRef';

  IF dna_version_number < 1 OR page_version_number < 1
     OR dna_payload->>'brandId' IS DISTINCT FROM p_marca_id::text
     OR dna_payload->>'siloId' IS DISTINCT FROM dna_entity_id
     OR page_payload->>'brandId' IS DISTINCT FROM p_marca_id::text
     OR page_payload->>'siloId' IS DISTINCT FROM dna_entity_id
     OR page_payload->>'siloPageId' IS DISTINCT FROM page_entity_id
     OR page_entity_id IS DISTINCT FROM 'silo-page:' || dna_entity_id
     OR jsonb_typeof(page_dna_ref) IS DISTINCT FROM 'object'
     OR page_dna_ref->>'entityId' IS DISTINCT FROM dna_entity_id
     OR page_dna_ref->>'versionId' IS DISTINCT FROM dna_version_id
     OR page_dna_ref->>'contentHash' IS DISTINCT FROM dna_content_hash THEN
    RAISE EXCEPTION 'silo pair identity or source reference is inconsistent';
  END IF;

  -- A per-Brand/Silo lock makes the version-slot check and both inserts one
  -- serializable unit without holding locks across unrelated Silos.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_marca_id::text || ':' || dna_entity_id || ':silo-pair', 0));

  SELECT e.version_id, e.version_number
    INTO latest_dna_version_id, latest_dna_version_number
  FROM public.editorial_artifact_versions e
  WHERE e.marca_id = p_marca_id
    AND e.artifact_type = 'silo_dna'
    AND e.entity_id = dna_entity_id
  ORDER BY e.version_number DESC
  LIMIT 1
  FOR UPDATE;

  IF latest_dna_version_id IS NULL THEN
    IF dna_version_number <> 1 OR dna_previous_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'initial SiloDNA pair must use version 1 without predecessor';
    END IF;
  ELSIF dna_version_number <> latest_dna_version_number + 1
     OR dna_previous_version_id IS DISTINCT FROM latest_dna_version_id THEN
    RAISE EXCEPTION 'SiloDNA successor is not the next canonical version';
  END IF;

  SELECT e.version_id, e.version_number
    INTO latest_page_version_id, latest_page_version_number
  FROM public.editorial_artifact_versions e
  WHERE e.marca_id = p_marca_id
    AND e.artifact_type = 'silo_page'
    AND e.entity_id = page_entity_id
  ORDER BY e.version_number DESC
  LIMIT 1
  FOR UPDATE;

  IF latest_page_version_id IS NULL THEN
    IF page_version_number <> 1 OR page_previous_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'initial SiloPage pair must use version 1 without predecessor';
    END IF;
  ELSIF page_version_number <> latest_page_version_number + 1
     OR page_previous_version_id IS DISTINCT FROM latest_page_version_id THEN
    RAISE EXCEPTION 'SiloPage successor is not the next canonical version';
  END IF;

  INSERT INTO public.editorial_artifact_versions (
    version_id, entity_id, marca_id, artifact_type, version_number,
    previous_version_id, source_version_id, status, content_hash, payload,
    origin, change_reason, created_by, created_at
  ) VALUES (
    dna_version_id, dna_entity_id, p_marca_id, 'silo_dna', dna_version_number,
    dna_previous_version_id, NULL, p_silo_dna_status, dna_content_hash,
    dna_payload, dna_origin, dna_change_reason, p_actor_user_id, dna_created_at
  )
  RETURNING * INTO dna_row;

  INSERT INTO public.editorial_artifact_versions (
    version_id, entity_id, marca_id, artifact_type, version_number,
    previous_version_id, source_version_id, status, content_hash, payload,
    origin, change_reason, created_by, created_at
  ) VALUES (
    page_version_id, page_entity_id, p_marca_id, 'silo_page', page_version_number,
    page_previous_version_id, dna_version_id, p_silo_page_status, page_content_hash,
    page_payload, page_origin, page_change_reason, p_actor_user_id, page_created_at
  )
  RETURNING * INTO page_row;

  RETURN jsonb_build_object(
    'atomicity', 'TRANSACTIONAL_RPC',
    'siloDna', to_jsonb(dna_row),
    'siloPage', to_jsonb(page_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.persist_silo_pair_atomic(uuid, uuid, text, jsonb, jsonb, text, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_silo_pair_atomic(uuid, uuid, text, jsonb, jsonb, text, text)
TO service_role;

COMMENT ON FUNCTION public.persist_silo_pair_atomic(uuid, uuid, text, jsonb, jsonb, text, text)
IS 'Persiste SiloDNA e SiloPage pareados na mesma transacao; a aprovacao e os artefatos continuam distintos.';

COMMIT;
