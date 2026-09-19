-- =============================================================================
-- M6 · ROLLBACK — repõe o corpo ANTERIOR de writer_save_article_draft
-- =============================================================================
--
-- Corpo EXTRAÍDO de 20260918061000_writer_mcp_atomic_article_draft.sql, não
-- reescrito de memória. É a versão que CRIA histórico a cada save alterado do
-- MCP e move `current_version_id`.
--
-- ================== REVERTER SIGNIFICA REPOR O DEFEITO ==================
--
-- Este rollback existe para completude operacional, não porque reverter seja
-- desejável. O comportamento que ele repõe contraria a invariante do projeto:
--
--   AUTOSAVE_CREATES_HISTORY = NO
--   SAVE_DRAFT_CREATES_HISTORY = NO
--   FINALIZATION_CREATES_HISTORY = YES
--
-- ================== O CLIENTE PRECISA VOLTAR JUNTO ==================
--
-- A M6 veio acompanhada da remoção de `markArticlePredecessorSuperseded` do
-- caminho de save em `lib/server/writer-deliverables.ts`
-- (`saveWriterArticleDraft`). Se esta função voltar a versionar e o wrapper
-- continuar sem a marcação, cada save do MCP passa a criar versão SEM abrir a
-- janela de retenção do predecessor — o histórico cresce e nada nunca é
-- recolhido.
--
-- Reverter a M6 exige reverter TAMBÉM a mudança no wrapper. Um sem o outro é
-- pior que nenhum dos dois.
--
-- ================== O QUE NÃO SE DESFAZ ==================
--
-- A M6 não escreve dado nenhum, então não há linha a restaurar. As versões que
-- tiverem sido criadas antes dela continuam onde estão, com a retenção que
-- tiverem — o rollback não as toca.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.writer_save_article_draft(
  p_brand_id uuid,
  p_document_id text,
  p_payload jsonb,
  p_content_hash text,
  p_expected_lock integer,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.content_documents%ROWTYPE;
  v_previous_version_id text;
  v_version_id text;
  v_version_number integer;
BEGIN
  SELECT * INTO v_current FROM public.content_documents
    WHERE id = p_document_id AND marca_id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'writer_document_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_current.status = 'approved' OR v_current.payload->>'status' = 'aprovado' THEN
    RAISE EXCEPTION 'writer_approved_immutable' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR p_payload->>'id' IS DISTINCT FROM p_document_id
    OR p_payload->>'status' IS DISTINCT FROM 'escrevendo'
    OR nullif(btrim(p_content_hash), '') IS NULL
    OR (p_payload - 'blocks' - 'editorContent' - 'status')
       IS DISTINCT FROM (v_current.payload - 'blocks' - 'editorContent' - 'status') THEN
    RAISE EXCEPTION 'writer_draft_scope_invalid' USING ERRCODE = 'P0001';
  END IF;
  -- Repeating the same completed write is safe even if the caller still has
  -- the old lock. A different payload must match the current lock exactly.
  IF v_current.content_hash = p_content_hash THEN
    RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
      'lockVersion', v_current.lock_version, 'versionId', v_current.current_version_id,
      'unchanged', true);
  END IF;
  IF p_expected_lock IS DISTINCT FROM v_current.lock_version THEN
    RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT version_id, version_number INTO v_previous_version_id, v_version_number
    FROM public.content_document_versions WHERE document_id = p_document_id
    ORDER BY version_number DESC LIMIT 1;
  v_version_number := coalesce(v_version_number, 0) + 1;
  v_version_id := gen_random_uuid()::text;
  INSERT INTO public.content_document_versions (version_id, document_id, version_number,
    previous_version_id, payload, content_hash, change_reason, created_by)
  VALUES (v_version_id, p_document_id, v_version_number, v_previous_version_id,
    p_payload, p_content_hash, 'Rascunho salvo via MCP.', p_actor_id);
  UPDATE public.content_documents SET payload = p_payload, content_hash = p_content_hash,
    status = 'writing', current_version_id = v_version_id, updated_by = p_actor_id
    WHERE id = p_document_id RETURNING * INTO v_current;
  RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
    'lockVersion', v_current.lock_version, 'versionId', v_version_id,
    'versionNumber', v_version_number, 'unchanged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.writer_save_article_draft(uuid,text,jsonb,text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.writer_save_article_draft(uuid,text,jsonb,text,integer,uuid)
  TO service_role;

COMMENT ON FUNCTION public.writer_save_article_draft(uuid,text,jsonb,text,integer,uuid)
  IS 'Comportamento anterior a M6: cria content_document_versions a cada save alterado e move current_version_id.';

COMMIT;
