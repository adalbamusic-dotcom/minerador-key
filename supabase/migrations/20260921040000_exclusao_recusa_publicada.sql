-- ---------------------------------------------------------------------------
-- A recusa passa a existir no caminho real de exclusao.
--
-- `lifecycle_assert_keywords_not_published` foi criada em 2026-09-21 e
-- NENHUMA funcao a chamava. A trava estava escrita, correta, e morta: a RPC
-- `lifecycle_delete_minerador_keywords` continuava fazendo SOFT DELETE de 24
-- horas na keyword publicada, exatamente como antes.
--
-- A unica protecao viva era a guarda na rota (2026-09-21), que cobre os
-- cliques da tela. Uma chamada direta a RPC -- de outro caminho de codigo, de
-- um job, do proprio painel do Supabase -- passava reto.
--
-- Esta migration liga a trava em duas barreiras:
--   1. `PERFORM lifecycle_assert_keywords_not_published` antes de qualquer
--      mutacao, recusando o LOTE INTEIRO;
--   2. o ramo do publicado deixa de soft-deletar e passa a abortar, para o
--      caso de a primeira barreira algum dia nao pegar.
--
-- Recusar o lote inteiro e deliberado: apagar "as outras" e falar da
-- publicada depois deixaria o humano sem saber o que aconteceu com o que.
--
-- O corpo abaixo foi extraido da definicao VIVA no banco e alterado apenas
-- nesses dois pontos -- nenhuma migration local tinha a versao fiel.
--
-- P0001: o handler final da funcao reergue `raise_exception` sem traduzir,
-- entao a recusa chega a rota com o codigo proprio em vez de virar um
-- TRANSACTION_FAILED generico.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lifecycle_delete_minerador_keywords(p_brand_id uuid, p_keyword_ids uuid[], p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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

  -- PAGINA NO AR NAO SE APAGA.
  --
  -- Primeira barreira, antes de QUALQUER mutacao e para o lote inteiro. A
  -- funcao existia desde 2026-09-21 e nao era chamada por ninguem: a recusa
  -- estava escrita e o caminho real de exclusao passava ao largo dela.
  PERFORM public.lifecycle_assert_keywords_not_published(p_brand_id, target_ids);

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

    -- Segunda barreira. Aqui ficava o SOFT DELETE de 24 horas: a publicada
    -- sumia da operacao, recuperavel, e depois sumia de vez. Nao e o
    -- contrato. Volume baixo, KGR ausente, zero resultados -- nada disso e
    -- motivo; para desfazer o vinculo existe acao propria.
    --
    -- Nao pode virar CONTINUE nem cair adiante: logo abaixo comeca o DELETE
    -- fisico em cascata. Se esta linha for alcancada, a primeira barreira
    -- falhou, e o certo e abortar a transacao inteira.
    IF public.lifecycle_keyword_is_published(p_brand_id, current_keyword.id) THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_PUBLICATION_PROTECTED: %', current_keyword.id
        USING HINT = 'Pagina publicada nao e apagada. Use "Desvincular publicacao" antes, se for mesmo o caso.';
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
