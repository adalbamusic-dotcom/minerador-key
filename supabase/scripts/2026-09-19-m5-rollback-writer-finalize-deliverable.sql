-- =============================================================================
-- M5 · ROLLBACK — restaura o corpo da M4 de writer_finalize_deliverable
-- =============================================================================
--
-- O corpo abaixo foi EXTRAÍDO do arquivo da M4
-- (20260919020000_m4_writer_deliverable_finalization.sql), não reescrito de
-- memória. Ele é a finalização SEM o caminho B: depois de reverter, reabrir e
-- finalizar sem editar volta a criar uma versão duplicada.
--
-- ================== O QUE REVERTER SIGNIFICA ==================
--
-- A M5 não escreve dado nenhum — ela substitui uma função. Reverter é, por
-- isso, limpo em qualquer momento: nenhuma linha precisa ser desfeita.
--
-- O que NÃO se desfaz sozinho são as consequências de já ter usado o caminho B.
-- Um entregável que voltou a `approved` reusando a versão A continua assim
-- depois do rollback, e está correto: A é uma finalização canônica, é a
-- corrente, e nada foi duplicado. O rollback só reabre a porta para a
-- duplicação futura.
--
-- ================== O CLIENTE PRECISA VOLTAR JUNTO ==================
--
-- O wrapper `finalizeWriterDeliverable` deixou de recusar 409
-- `finalization_without_change` quando a M5 entrou. Se esta função voltar ao
-- corpo da M4 e o wrapper continuar sem a recusa, reabrir e finalizar sem
-- editar volta a duplicar versão e a abrir janela de 48h sobre a versão boa.
--
-- Reverter a M5 exige reverter TAMBÉM a remoção da pré-checagem em
-- `lib/server/writer-deliverables.ts`. Um sem o outro é pior que nenhum dos
-- dois.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.writer_finalize_deliverable(
  p_brand_id uuid,
  p_document_id text,
  p_kind text,
  p_expected_lock integer,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.writer_deliverables%ROWTYPE;
  v_corrente public.writer_deliverable_versions%ROWTYPE;
  v_version_id uuid;
  v_version_number integer;
BEGIN
  IF p_kind NOT IN ('video_script', 'carousel') THEN
    RAISE EXCEPTION 'writer_kind_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_current FROM public.writer_deliverables
    WHERE marca_id = p_brand_id AND document_id = p_document_id AND kind = p_kind FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'writer_deliverable_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_current.current_version_id IS NOT NULL THEN
    SELECT * INTO v_corrente FROM public.writer_deliverable_versions
      WHERE version_id = v_current.current_version_id;
  END IF;

  -- ---------------------------------------------------------------------------
  -- IDEMPOTÊNCIA: já finalizado e sem mudança material devolve o que existe.
  -- ---------------------------------------------------------------------------
  IF v_current.status = 'approved' THEN
    IF v_corrente.version_id IS NOT NULL AND v_corrente.content_hash = v_current.content_hash THEN
      RETURN jsonb_build_object('id', v_current.id, 'versionId', v_corrente.version_id,
        'versionNumber', v_corrente.version_number, 'previousVersionId', v_corrente.previous_version_id,
        'contentHash', v_current.content_hash, 'lockVersion', v_current.lock_version,
        'status', v_current.status, 'unchanged', true);
    END IF;
    -- Aprovado com hash divergente da versão corrente é estado que o save não
    -- consegue produzir. Se aparecer, é corrupção — não se finaliza por cima.
    RAISE EXCEPTION 'writer_finalized_state_inconsistent' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_lock IS DISTINCT FROM v_current.lock_version THEN
    RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001';
  END IF;

  -- ---------------------------------------------------------------------------
  -- SÓ UMA VERSÃO FINAL CANÔNICA PODE SER PREDECESSORA
  --
  -- Depois da normalização da seção 0, `current_version_id` só é preenchido por
  -- esta própria função — logo, quando existe, ele já é uma final. A conferência
  -- abaixo é defesa em profundidade: se um rascunho legado voltar a ser apontado
  -- por qualquer caminho futuro, a finalização para em vez de o promover a
  -- predecessor e arrastá-lo para a janela de 48h.
  -- ---------------------------------------------------------------------------
  IF v_corrente.version_id IS NOT NULL THEN
    IF v_corrente.deliverable_id IS DISTINCT FROM v_current.id
       OR v_corrente.superseded_at IS NOT NULL
       OR v_corrente.change_reason <> 'Finalização do entregável.' THEN
      RAISE EXCEPTION 'writer_predecessor_nao_e_final' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO v_version_number
    FROM public.writer_deliverable_versions WHERE deliverable_id = v_current.id;

  INSERT INTO public.writer_deliverable_versions (deliverable_id, version_number,
    previous_version_id, payload, content_hash, change_reason, created_by)
  VALUES (v_current.id, v_version_number, v_current.current_version_id,
    v_current.payload, v_current.content_hash, 'Finalização do entregável.', p_actor_id)
  RETURNING version_id INTO v_version_id;

  UPDATE public.writer_deliverables
     SET status = 'approved', current_version_id = v_version_id, updated_by = p_actor_id
   WHERE id = v_current.id RETURNING * INTO v_current;

  -- O predecessor NÃO é marcado aqui. Quem marca é
  -- `writer_mark_deliverable_version_superseded`, depois do readback confirmar
  -- que a sucessora é a corrente — a mesma ordem da M2 para o artigo.
  RETURN jsonb_build_object('id', v_current.id, 'versionId', v_version_id,
    'versionNumber', v_version_number, 'previousVersionId', v_corrente.version_id,
    'contentHash', v_current.content_hash, 'lockVersion', v_current.lock_version,
    'status', v_current.status, 'unchanged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid) TO service_role;

COMMENT ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid)
  IS 'Unica autoridade que cria versao de entregavel. Fotografa o payload gravado; nao recebe payload. Idempotente por content_hash. Nao marca predecessor: isso e do readback.';

COMMIT;
