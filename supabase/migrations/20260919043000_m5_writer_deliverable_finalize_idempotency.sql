-- =============================================================================
-- M5 — FINALIZAR DEPOIS DE REABRIR, SEM MUDANÇA, NÃO DUPLICA VERSÃO
-- =============================================================================
--
-- ================== O DEFEITO QUE ESTA MIGRATION FECHA ==================
--
-- `writer_finalize_deliverable` é idempotente por `content_hash` APENAS no ramo
-- `approved`. No ramo `draft` ela insere versão SEMPRE. Consequência:
--
--   FINAL_A → reopen → (nada editado) → finalize
--
-- criava um B de conteúdo IDÊNTICO a A, com `B.previous = A`. Pior: o readback
-- confirmaria B como corrente e a retenção abriria uma janela de 48h sobre A —
-- marcando uma versão boa para exclusão por causa de um clique em "Reabrir" que
-- ninguém aproveitou.
--
-- O Corte 6A.1 tapou isso no cliente, com uma recusa 409 antes da chamada. Era
-- remendo: a autoridade é do banco, e cliente nenhum deveria precisar saber que
-- a RPC duplicaria. A M5 move a regra para onde ela pertence, e o 409 sai.
--
-- ================== OS TRÊS CAMINHOS, DEPOIS DESTA MIGRATION ==================
--
--   A · nunca finalizado     draft + current_version_id NULL
--                            → cria FINAL_A · previous = NULL · corrente = A
--                            → status = approved
--
--   B · reaberto SEM mudança draft + corrente A + hash(payload) = A.content_hash
--                            → NÃO cria versão
--                            → status = approved · corrente continua A
--                            → nenhuma retenção
--
--   C · reaberto COM mudança draft + corrente A + hash(payload) <> A.content_hash
--                            → cria B · B.previous = A · corrente = B
--                            → status = approved
--                            → retenção de A SÓ depois do readback confirmar B
--
-- O caminho já existente de `approved` → finalizar de novo continua igual:
-- devolve a mesma versão, sem inserir nada.
--
-- ================== O RECIBO NÃO GANHA CONTRATO NOVO ==================
--
-- O caminho B devolve `unchanged: true` — o MESMO campo que o ramo `approved`
-- já usava para dizer "nenhuma versão foi criada, esta é a que existe". É essa
-- a única informação de que o chamador precisa para decidir não marcar
-- predecessor nenhum. Um campo `reused` seria um segundo jeito de dizer a mesma
-- coisa, e o dia em que os dois discordassem alguém teria de escolher qual
-- acreditar.
--
-- ================== O QUE ELA NÃO FAZ ==================
--
-- * Não cria, altera ou remove tabela, coluna, enum, índice, constraint ou
--   trigger. Substitui UMA função.
-- * Não toca `writer_save_deliverable` nem `writer_reopen_deliverable`.
-- * Não toca contratos de mídia, purge, M1/M2/M3, Minerador, Arquiteto, Radar,
--   ArticleDNA, SERP ou Publicações.
-- * Não escreve em dado nenhum: nenhum INSERT, UPDATE ou DELETE fora do corpo
--   da própria função.
-- * Não mexe em `lock_version`: quem o incrementa é o trigger
--   `writer_deliverables_touch_trg`.
--
-- ================== SEGURANÇA ==================
--
-- Mesma assinatura, mesmo `SECURITY DEFINER`, mesmo
-- `search_path = public, pg_temp`, mesmos REVOKE/GRANT — só `service_role`
-- executa. O ator continua chegando por parâmetro, derivado da sessão no
-- servidor.
--
-- Rollback: supabase/scripts/2026-09-19-m5-rollback-writer-finalize-deliverable.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. PRÉ-FLIGHT
-- =============================================================================
-- A M5 não escreve dado, então não há o que normalizar. As guardas aqui existem
-- para recusar um mundo em que a substituição seria arriscada: se a M4 não
-- estiver de pé, substituir a função por uma versão que assume o vocabulário
-- dela seria escrever em cima de outra coisa.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_m4 integer;
  v_corrente_nao_final integer;
BEGIN
  -- Guarda 1: a M4 precisa estar aplicada. Sem ela não existe a função que
  -- estamos substituindo, nem o vocabulário que o novo corpo usa.
  SELECT count(*) INTO v_m4 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'writer_finalize_deliverable';
  IF v_m4 <> 1 THEN
    RAISE EXCEPTION 'm5_preflight_m4_ausente: writer_finalize_deliverable encontrada % vez(es)', v_m4;
  END IF;

  -- Guarda 2: toda corrente apontada tem que ser uma final canônica do próprio
  -- entregável e não substituída. É a precondição do caminho B: reusar uma
  -- versão que não seja final seria promover rascunho legado a finalização.
  SELECT count(*) INTO v_corrente_nao_final
    FROM public.writer_deliverables d
    JOIN public.writer_deliverable_versions v ON v.version_id = d.current_version_id
   WHERE d.current_version_id IS NOT NULL
     AND NOT (v.deliverable_id = d.id
              AND v.superseded_at IS NULL
              AND v.change_reason = 'Finalização do entregável.');
  IF v_corrente_nao_final > 0 THEN
    RAISE EXCEPTION 'm5_preflight_corrente_nao_e_final: %', v_corrente_nao_final;
  END IF;

  RAISE NOTICE 'M5 preflight OK';
END $$;

-- =============================================================================
-- 1. A FINALIZAÇÃO, COM O CAMINHO B
-- =============================================================================
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
  -- JÁ FINALIZADO: devolve o que existe, sem inserir nada.
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
  -- SÓ UMA VERSÃO FINAL CANÔNICA PODE SER PREDECESSORA — OU SER REUSADA
  --
  -- Esta guarda protege os dois caminhos que vêm depois. No caminho C ela
  -- impede que um rascunho legado vire predecessor e seja arrastado para a
  -- janela de 48h. No caminho B ela impede algo pior: reusar uma versão que não
  -- é finalização, promovendo rascunho a final sem que ninguém tenha finalizado.
  -- ---------------------------------------------------------------------------
  IF v_corrente.version_id IS NOT NULL THEN
    IF v_corrente.deliverable_id IS DISTINCT FROM v_current.id
       OR v_corrente.superseded_at IS NOT NULL
       OR v_corrente.change_reason <> 'Finalização do entregável.' THEN
      RAISE EXCEPTION 'writer_predecessor_nao_e_final' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- CAMINHO B · REABERTO SEM MUDANÇA — A M5 EM UMA COMPARAÇÃO
  --
  -- O conteúdo gravado é byte a byte o da versão corrente, que a guarda acima
  -- já confirmou ser uma final canônica não substituída. Criar uma versão aqui
  -- seria registrar como "decisão editorial" um reopen que não produziu nada, e
  -- condenar A a uma janela de 48h.
  --
  -- Então: só o status volta. Nenhuma linha em `writer_deliverable_versions`,
  -- `current_version_id` intocado, e o recibo diz `unchanged: true` — o mesmo
  -- campo que o ramo `approved` acima usa para dizer exatamente isso.
  -- ---------------------------------------------------------------------------
  IF v_corrente.version_id IS NOT NULL AND v_corrente.content_hash = v_current.content_hash THEN
    UPDATE public.writer_deliverables
       SET status = 'approved', updated_by = p_actor_id
     WHERE id = v_current.id RETURNING * INTO v_current;

    RETURN jsonb_build_object('id', v_current.id, 'versionId', v_corrente.version_id,
      'versionNumber', v_corrente.version_number, 'previousVersionId', v_corrente.previous_version_id,
      'contentHash', v_current.content_hash, 'lockVersion', v_current.lock_version,
      'status', v_current.status, 'unchanged', true);
  END IF;

  -- ---------------------------------------------------------------------------
  -- CAMINHOS A e C · NASCE UMA VERSÃO FINAL
  --
  -- A: sem corrente  → previous = NULL
  -- C: corrente = A  → previous = A
  -- ---------------------------------------------------------------------------
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

-- =============================================================================
-- 2. GRANTS — inalterados, reafirmados
-- =============================================================================
-- `CREATE OR REPLACE` preserva os privilégios existentes. Reafirmá-los custa
-- nada e fecha a porta para a função nascer aberta caso um dia ela precise ser
-- recriada em vez de substituída.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid) TO service_role;

COMMENT ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid)
  IS 'Unica autoridade que cria versao de entregavel. Tres caminhos: sem corrente cria a primeira; corrente com hash igual apenas volta a approved reusando a versao (unchanged=true, sem versao nova); corrente com hash diferente cria a sucessora. Nao recebe payload. Nao marca predecessor: isso e do readback.';

-- =============================================================================
-- 3. READBACK — para rodar DEPOIS do COMMIT
-- =============================================================================
-- 1) A função existe, com a assinatura e a segurança de sempre:
--
-- SELECT p.oid::regprocedure::text, p.prosecdef, array_to_string(p.proconfig, ' | ')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'writer_finalize_deliverable';
-- ESPERADO: writer_finalize_deliverable(uuid,text,text,integer,uuid) | t | search_path=public, pg_temp
--
-- 2) O caminho B está no corpo efetivo (comentários removidos antes de buscar):
--
-- SELECT position('v_corrente.content_hash = v_current.content_hash' in
--          regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g')) > 0
--   FROM pg_proc WHERE proname = 'writer_finalize_deliverable';
-- ESPERADO: true, e a comparação deve aparecer DUAS vezes: ramo approved e caminho B.
--
-- 3) Nenhum dado foi tocado:
--
-- SELECT count(*) FROM public.writer_deliverable_versions;                    -- ESPERADO: 2
-- SELECT count(*) FROM public.writer_deliverables WHERE status = 'approved';  -- ESPERADO: 0
-- SELECT count(*) FROM public.writer_deliverables WHERE current_version_id IS NOT NULL; -- ESPERADO: 0
-- SELECT count(*) FROM public.writer_deliverable_versions
--  WHERE superseded_at IS NOT NULL OR purge_after IS NOT NULL;                -- ESPERADO: 0
--
-- 4) Smoke com fixture própria, em transação abortada:
--    draft → finalize → A · approved · corrente = A · 1 versão
--    reopen → finalize sem editar → approved · corrente = A · 1 versão · A sem retenção
--    reopen → editar → save → finalize → B · previous = A · 2 versões
--    → readback confirma B → só então A superseded com purge_after = +48h
-- =============================================================================

COMMIT;
