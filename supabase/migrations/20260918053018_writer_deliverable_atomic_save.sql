BEGIN;

-- One transaction owns the current row and its immutable version snapshot.
CREATE FUNCTION public.writer_save_deliverable(
  p_brand_id uuid,
  p_document_id text,
  p_kind text,
  p_payload jsonb,
  p_content_hash text,
  p_expected_lock integer,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_document public.content_documents%ROWTYPE;
  v_current public.writer_deliverables%ROWTYPE;
  v_previous_version_id uuid;
  v_version_id uuid;
  v_version_number integer;
BEGIN
  SELECT * INTO v_document FROM public.content_documents
    WHERE id = p_document_id AND marca_id = p_brand_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'writer_document_not_found' USING ERRCODE = 'P0001'; END IF;
  IF p_kind NOT IN ('video_script', 'carousel')
    OR p_payload->>'kind' IS DISTINCT FROM p_kind
    OR p_payload->>'documentId' IS DISTINCT FROM p_document_id
    OR p_payload->>'sourceDocumentHash' IS DISTINCT FROM v_document.content_hash
    OR nullif(btrim(p_payload->>'title'), '') IS NULL
    OR nullif(btrim(p_content_hash), '') IS NULL THEN
    RAISE EXCEPTION 'writer_payload_invalid_or_stale' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_current FROM public.writer_deliverables
    WHERE marca_id = p_brand_id AND document_id = p_document_id AND kind = p_kind FOR UPDATE;
  IF FOUND THEN
    IF v_current.status = 'approved' THEN RAISE EXCEPTION 'writer_approved_immutable' USING ERRCODE = 'P0001'; END IF;
    IF v_current.content_hash = p_content_hash THEN
      RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
        'lockVersion', v_current.lock_version, 'updatedAt', v_current.updated_at, 'unchanged', true);
    END IF;
    IF p_expected_lock IS DISTINCT FROM v_current.lock_version THEN
      RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.writer_deliverables SET title = p_payload->>'title', payload = p_payload,
      content_hash = p_content_hash, source_document_hash = v_document.content_hash,
      updated_by = p_actor_id WHERE id = v_current.id RETURNING * INTO v_current;
  ELSE
    IF p_expected_lock IS NOT NULL THEN RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO public.writer_deliverables (marca_id, document_id, kind, title,
      source_document_hash, payload, content_hash, created_by, updated_by)
    VALUES (p_brand_id, p_document_id, p_kind, p_payload->>'title', v_document.content_hash,
      p_payload, p_content_hash, p_actor_id, p_actor_id) RETURNING * INTO v_current;
  END IF;

  SELECT version_id, version_number INTO v_previous_version_id, v_version_number
    FROM public.writer_deliverable_versions WHERE deliverable_id = v_current.id
    ORDER BY version_number DESC LIMIT 1;
  v_version_number := coalesce(v_version_number, 0) + 1;
  INSERT INTO public.writer_deliverable_versions (deliverable_id, version_number,
    previous_version_id, payload, content_hash, change_reason, created_by)
  VALUES (v_current.id, v_version_number, v_previous_version_id, p_payload,
    p_content_hash, CASE WHEN v_version_number = 1 THEN 'Rascunho inicial.' ELSE 'Revisão do rascunho.' END, p_actor_id)
  RETURNING version_id INTO v_version_id;

  RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
    'lockVersion', v_current.lock_version, 'updatedAt', v_current.updated_at,
    'versionId', v_version_id, 'versionNumber', v_version_number, 'unchanged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.writer_save_deliverable(uuid,text,text,jsonb,text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.writer_save_deliverable(uuid,text,text,jsonb,text,integer,uuid)
  TO service_role;

COMMIT;
