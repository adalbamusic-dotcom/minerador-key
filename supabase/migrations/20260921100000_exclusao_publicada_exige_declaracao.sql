-- ---------------------------------------------------------------------------
-- Exclusao de publicada: permitida, mas so por decisao DECLARADA.
--
-- O QUE EU QUEBREI EM 20260921040000
--
-- Interpretei "nao pode apagar de jeito nenhum qualquer keyword publicado"
-- como recusa total e troquei o soft delete de 24 horas por um RAISE. So que
-- o contrato preve a exclusao de publicada: ela sai da operacao, fica
-- restauravel por 24 horas e so entao e purgada. O dialogo "Remover keywords
-- publicadas por 24 horas" continua na tela oferecendo exatamente isso -- e
-- desde 040000 ele falharia, sem nunca chegar ao banco, porque a rota tambem
-- ganhou uma guarda 409.
--
-- O mecanismo de resgate EXISTE e esta completo: rotas `recoverable`,
-- `restore` e `purge`, RPCs correspondentes, e a tela chamando as duas
-- primeiras. Nunca foi visto porque nunca houve uma linha com `deleted_at`.
--
-- A RECONCILIACAO
--
-- As duas falas nao se contradizem quando se separa INTENCAO de ACIDENTE:
--
--   apagar de proposito, com confirmacao ...... permitido, janela de 24h
--   sumir por efeito colateral ................ recusado
--
-- A diferenca e a DECLARACAO, e esse desenho ja existiu aqui: a migration
-- 0046 tinha `p_allow_recoverable` e o codigo
-- `KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW`. Em algum momento o parametro
-- sumiu e a RPC passou a soft-deletar sempre, sem pedir declaracao nenhuma.
-- Esta migration o traz de volta.
--
-- O corpo abaixo e a definicao VIVA lida do banco ANTES de 040000, com o
-- soft delete intacto, mais a exigencia da declaracao.
--
-- DROP antes do CREATE: acrescentar um parametro cria uma SOBRECARGA, nao
-- substitui. As duas conviveriam e uma chamada de tres argumentos ficaria
-- ambigua. Com a versao de quatro (o ultimo com DEFAULT), a chamada antiga de
-- tres argumentos continua resolvendo -- entao a rota nao quebra enquanto o
-- codigo novo nao sobe.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid);

CREATE OR REPLACE FUNCTION public.lifecycle_delete_minerador_keywords(p_brand_id uuid, p_keyword_ids uuid[], p_actor_user_id uuid, p_allow_recoverable boolean DEFAULT false)
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

  -- PAGINA NO AR SO SAI POR DECISAO DECLARADA.
  --
  -- Apagar uma publicada e permitido -- o contrato preve a janela de 24 horas
  -- com restauracao. O que nao e permitido e ela sumir por EFEITO COLATERAL:
  -- dedupe, processamento, volume baixo, zero resultados. Foi assim que uma
  -- publicacao desapareceu da tela em 2026-09-21.
  --
  -- A diferenca entre as duas coisas e a DECLARACAO. Quem chama precisa dizer
  -- que sabe que ha publicada no lote e que quer a janela; na tela, isso e o
  -- dialogo que exige digitar o nome da keyword. Sem a declaracao, o lote
  -- inteiro e recusado.
  --
  -- Recusar o lote inteiro e deliberado: apagar "as outras" e falar da
  -- publicada depois deixaria o humano sem saber o que aconteceu com o que.
  IF NOT coalesce(p_allow_recoverable, false) THEN
    PERFORM public.lifecycle_assert_keywords_not_published(p_brand_id, target_ids);
  END IF;

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


-- A trava passa a falar a lingua certa: nao e "publicada nunca sai", e
-- "publicada exige o fluxo recuperavel". O codigo ja existia no mapa de erros
-- da rota desde antes.
CREATE OR REPLACE FUNCTION public.lifecycle_assert_keywords_not_published(
  p_brand_id uuid,
  p_keyword_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  protegidas text;
BEGIN
  SELECT string_agg(k.keyword, ', ' ORDER BY k.keyword)
  INTO protegidas
  FROM public.minerador_keywords k
  WHERE k.brand_id = p_brand_id
    AND k.id = ANY(p_keyword_ids)
    AND k.deleted_at IS NULL
    AND public.lifecycle_keyword_is_published(p_brand_id, k.id);

  IF protegidas IS NOT NULL THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW: %', protegidas
      USING HINT = 'Pagina publicada so sai por decisao declarada, com a janela de 24 horas. Use a exclusao com confirmacao, ou "Desvincular publicacao".';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.lifecycle_assert_keywords_not_published(uuid, uuid[]) IS
  'Recusa o lote quando ha publicada e o chamador NAO declarou o fluxo recuperavel. Nenhum volume, KGR ou resultado justifica uma pagina no ar sair por efeito colateral.';
