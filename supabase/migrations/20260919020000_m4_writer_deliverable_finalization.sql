-- =============================================================================
-- M4 — RASCUNHO NÃO VERSIONA; FINALIZAÇÃO SIM
-- =============================================================================
--
-- ================== O DEFEITO QUE ESTA MIGRATION FECHA ==================
--
-- Hoje `writer_save_deliverable` insere em `writer_deliverable_versions` a CADA
-- save alterado, com `change_reason = 'Revisão do rascunho.'`, e move
-- `current_version_id` junto. Ou seja: salvar rascunho de roteiro ou carrossel
-- cria versão histórica — exatamente o contrário da regra que o artigo segue.
--
-- E não existe autoridade de finalização: a RPC não recebe status, só IMPEDE
-- editar o que já está `approved`. Resultado prático: o único jeito de um
-- entregável entrar no lifecycle M2 é pelo caminho que não deveria versionar.
--
-- ================== A INVARIANTE QUE ELA ESTABELECE ==================
--
--   autosave / salvar rascunho  → só estado corrente, ZERO versões
--   primeira finalização        → versão A, current_version_id = A
--   reabrir                     → volta a draft, sem tocar em versões
--   refinalizar com mudança     → versão B, B.previous = A, current = B
--                                 A entra em retenção só após readback
--
-- `writer_deliverable_versions` passa a significar **versões finalizadas**.
--
-- ================== O QUE ELA NÃO FAZ ==================
--
-- * Não cria status novo: `approved` já é o estado final canônico do CHECK
--   `writer_deliverables_status_check` (draft | in_review | approved).
-- * Não reescreve nem apaga histórico. As 2 versões legadas de rascunho ficam
--   exatamente como estão — ver "DADOS EXISTENTES".
-- * Não duplica autoridade por tipo: roteiro e carrossel usam a MESMA RPC, como
--   já usam a mesma tabela.
-- * Não toca em Minerador, Arquiteto, Radar, ArticleDNA, SERP, mídia M3, purge
--   nem Publicações. Finalizar não cria `publication_record`.
-- * Não mexe em `lock_version`: quem o incrementa é o trigger
--   `writer_deliverables_touch_trg` → `pipeline_editorial_touch_lock_version`.
--
-- ================== DADOS EXISTENTES ==================
--
-- writer_deliverables            2 linhas, ambas status='draft', lock_version=1
-- writer_deliverable_versions    2 linhas, version_number=1, previous=NULL,
--                                change_reason='Rascunho inicial.', nenhuma
--                                superseded, ambas apontadas por current_version_id
--
-- São LEGACY_DRAFT_VERSION: nasceram do comportamento antigo e NÃO são
-- finalizações. Esta migration não as converte, não as apaga e não as renomeia.
--
-- O QUE ELA FAZ com elas está na seção 0: tira o PONTEIRO. `current_version_id`
-- volta a NULL nos entregáveis nunca finalizados, e as linhas ficam intactas.
--
-- Assim a primeira finalização cria `FINAL_A` com `previous_version_id = NULL`,
-- e nenhuma versão legada entra no lifecycle M2 — nem agora, nem depois. Elas
-- ficam onde estão, sem retenção e sem janela, até alguém decidir o que fazer
-- com elas por um ato próprio.
--
-- ================== SEGURANÇA ==================
--
-- Todas as funções: SECURITY DEFINER, `search_path = public, pg_temp`,
-- REVOKE de PUBLIC/anon/authenticated/service_role e GRANT só a service_role —
-- o mesmo padrão de `writer_save_deliverable` e das funções da M2/M3. O ator
-- chega por parâmetro, derivado da sessão no servidor; o navegador nunca o
-- escolhe.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. PRÉ-FLIGHT E NORMALIZAÇÃO DAS VERSÕES LEGADAS DE RASCUNHO
-- =============================================================================
-- DECISÃO CANÔNICA desta rodada:
--
--   DRAFT_IS_HISTORY = NO
--   FIRST_FINAL_VERSION_PREVIOUS_ID = NULL
--   LEGACY_DRAFT_VERSION_ENTERS_M2 = NO
--
-- Rascunho não é história. Uma versão criada pelo save antigo é um artefato do
-- defeito, não uma finalização — e por isso **não pode ser predecessora da
-- primeira versão final**. Se fosse, ela entraria na janela de 48h como se
-- tivesse sido substituída, e o lifecycle M2 passaria a carregar um snapshot
-- que nunca representou uma decisão editorial.
--
-- A correção é tirar o PONTEIRO, não a linha. `current_version_id` volta a NULL
-- nos entregáveis nunca finalizados; as linhas de versão ficam exatamente como
-- estão, com id, payload, hash, previous, superseded e purge intactos.
--
-- O `UPDATE` carrega o critério inteiro no próprio `WHERE` — nunca finalizado,
-- status não aprovado, ponteiro para versão do mesmo entregável, versão
-- reconhecida como rascunho legado, sem `superseded_at` e sem `purge_after`:
--
--   NORMALIZATION_DML_SCOPE = LEGACY_DRAFT_ONLY
--
-- A partir daí `current_version_id` passa a significar uma coisa só:
-- **a última versão FINALIZADA**. Nunca um rascunho.
--
-- -----------------------------------------------------------------------------
-- O QUE FOI AUDITADO EM 2026-09-19, antes de escrever isto:
--
--   writer_deliverables          2 linhas, ambas status='draft', lock_version=1,
--                                ambas com current_version_id preenchido
--   writer_deliverable_versions  2 linhas, version_number=1, previous=NULL,
--                                change_reason='Rascunho inicial.',
--                                superseded_at=NULL, purge_after=NULL
--   aprovados 0 · em retenção 0 · órfãs 0
--
-- O bloco abaixo ABORTA a transação inteira se a forma encontrada divergir
-- disso. Contagem maior é tolerada — saves adicionais antes da aplicação criam
-- mais versões legadas, e isso é o defeito em ação, não uma surpresa. O que não
-- é tolerado é qualquer sinal de que o mundo mudou de natureza.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_aprovados integer;
  v_em_retencao integer;
  v_correntes_nao_legadas integer;
  v_a_normalizar integer;
  v_versoes integer;
BEGIN
  -- Guarda 1: ninguém pode estar finalizado. Se estiver, a finalização
  -- aconteceu por um caminho que não existe, e normalizar seria adivinhar.
  SELECT count(*) INTO v_aprovados FROM public.writer_deliverables WHERE status = 'approved';
  IF v_aprovados > 0 THEN
    RAISE EXCEPTION 'm4_preflight_ha_entregavel_aprovado: %', v_aprovados;
  END IF;

  -- Guarda 2: nada pode estar em retenção. Mexer no ponteiro com janela aberta
  -- deixaria uma versão substituída sem sucessora declarada.
  SELECT count(*) INTO v_em_retencao FROM public.writer_deliverable_versions
    WHERE superseded_at IS NOT NULL OR purge_after IS NOT NULL OR superseded_by_version_id IS NOT NULL;
  IF v_em_retencao > 0 THEN
    RAISE EXCEPTION 'm4_preflight_ha_versao_em_retencao: %', v_em_retencao;
  END IF;

  -- Guarda 3: toda corrente apontada tem que ser reconhecivelmente um rascunho
  -- legado — do próprio entregável, sem retenção, com o motivo que o save
  -- antigo escrevia. Uma corrente que não bate com isso é situação diferente da
  -- auditada, e a migration para.
  SELECT count(*) INTO v_correntes_nao_legadas
    FROM public.writer_deliverables d
    JOIN public.writer_deliverable_versions v ON v.version_id = d.current_version_id
   WHERE d.current_version_id IS NOT NULL
     AND NOT (
       v.deliverable_id = d.id
       AND v.superseded_at IS NULL
       AND v.purge_after IS NULL
       AND v.change_reason IN ('Rascunho inicial.', 'Revisão do rascunho.')
     );
  IF v_correntes_nao_legadas > 0 THEN
    RAISE EXCEPTION 'm4_preflight_corrente_nao_reconhecida: %', v_correntes_nao_legadas;
  END IF;

  -- Guarda 4: ponteiro apontando para versão inexistente ou de outro dono.
  IF EXISTS (
    SELECT 1 FROM public.writer_deliverables d
     WHERE d.current_version_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.writer_deliverable_versions v
                        WHERE v.version_id = d.current_version_id AND v.deliverable_id = d.id)
  ) THEN
    RAISE EXCEPTION 'm4_preflight_corrente_orfa';
  END IF;

  SELECT count(*) INTO v_a_normalizar FROM public.writer_deliverables WHERE current_version_id IS NOT NULL;
  SELECT count(*) INTO v_versoes FROM public.writer_deliverable_versions;
  RAISE NOTICE 'M4 preflight OK · entregaveis a normalizar=% · versoes legadas preservadas=%', v_a_normalizar, v_versoes;

  -- ---------------------------------------------------------------------------
  -- NORMALIZAÇÃO: só o ponteiro, e só onde o critério se sustenta sozinho.
  --
  -- NORMALIZATION_DML_SCOPE = LEGACY_DRAFT_ONLY
  --
  -- O `WHERE` repete inteiro o critério da guarda 3 em vez de confiar nela. Isso
  -- é de propósito: uma guarda que passou é uma afirmação sobre o passado, e o
  -- `UPDATE` é uma escrita no presente. Se alguma guarda for afrouxada, removida
  -- ou reordenada um dia, este comando continua incapaz de atingir um entregável
  -- finalizado ou uma versão que não seja rascunho legado — ele não depende de
  -- ninguém para ser seguro.
  --
  -- A redundância tem custo zero e a guarda 5 logo abaixo cobra o resultado: se
  -- este `WHERE` deixar de fora um ponteiro que a guarda 3 considerou legado, a
  -- migration aborta em vez de aplicar pela metade.
  -- ---------------------------------------------------------------------------
  UPDATE public.writer_deliverables d
     SET current_version_id = NULL
   WHERE d.current_version_id IS NOT NULL
     AND d.status <> 'approved'
     AND EXISTS (
       SELECT 1 FROM public.writer_deliverable_versions v
        WHERE v.version_id = d.current_version_id
          AND v.deliverable_id = d.id
          AND v.superseded_at IS NULL
          AND v.purge_after IS NULL
          AND v.change_reason IN ('Rascunho inicial.', 'Revisão do rascunho.')
     );

  -- Guarda 5: depois disto, nenhum entregável pode ter corrente. Como o `UPDATE`
  -- acima tem critério próprio, esta guarda deixou de ser tautologia: ela confere
  -- que o critério estreito e o da guarda 3 concordam. Discordância aborta.
  IF EXISTS (SELECT 1 FROM public.writer_deliverables WHERE current_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'm4_normalizacao_incompleta';
  END IF;

  -- Guarda 6: e nenhuma versão pode ter sido alterada pela normalização.
  IF (SELECT count(*) FROM public.writer_deliverable_versions) <> v_versoes THEN
    RAISE EXCEPTION 'm4_normalizacao_alterou_versoes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.writer_deliverable_versions
              WHERE superseded_at IS NOT NULL OR purge_after IS NOT NULL OR superseded_by_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'm4_normalizacao_iniciou_retencao';
  END IF;
END $$;

-- =============================================================================
-- 1. SAVE DE RASCUNHO — ESTADO CORRENTE, E SÓ
-- =============================================================================
-- Mantém assinatura, validações de escopo, guarda de `approved` e optimistic
-- lock idênticos. O que sai são as três linhas que versionavam:
--
--   * INSERT em writer_deliverable_versions
--   * current_version_id = v_version_id
--   * o version_id no recibo de criação
--
-- Um entregável nunca finalizado passa a poder ter, depois de N saves:
--   status = 'draft'  e  current_version_id IS NULL
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.writer_save_deliverable(
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
    -- Finalizado não se edita direto: reabra primeiro. Ver §3.
    IF v_current.status = 'approved' THEN
      RAISE EXCEPTION 'writer_approved_immutable' USING ERRCODE = 'P0001';
    END IF;

    IF v_current.content_hash = p_content_hash THEN
      RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
        'lockVersion', v_current.lock_version, 'updatedAt', v_current.updated_at,
        'versionId', v_current.current_version_id, 'status', v_current.status, 'unchanged', true);
    END IF;

    IF p_expected_lock IS DISTINCT FROM v_current.lock_version THEN
      RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001';
    END IF;

    -- SEM versão, SEM tocar current_version_id. Rascunho é estado corrente.
    UPDATE public.writer_deliverables
       SET title = p_payload->>'title', payload = p_payload,
           content_hash = p_content_hash, source_document_hash = v_document.content_hash,
           updated_by = p_actor_id
     WHERE id = v_current.id RETURNING * INTO v_current;
  ELSE
    IF p_expected_lock IS NOT NULL THEN RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001'; END IF;

    -- Nasce como rascunho puro: nenhuma versão, `current_version_id` nulo.
    INSERT INTO public.writer_deliverables (marca_id, document_id, kind, title,
      source_document_hash, payload, content_hash, current_version_id, created_by, updated_by)
    VALUES (p_brand_id, p_document_id, p_kind, p_payload->>'title', v_document.content_hash,
      p_payload, p_content_hash, NULL, p_actor_id, p_actor_id) RETURNING * INTO v_current;
  END IF;

  RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
    'lockVersion', v_current.lock_version, 'updatedAt', v_current.updated_at,
    'versionId', v_current.current_version_id, 'status', v_current.status, 'unchanged', false);
END;
$$;

-- =============================================================================
-- 2. FINALIZAÇÃO — A ÚNICA AUTORIDADE QUE CRIA VERSÃO
-- =============================================================================
-- Não recebe payload. Ela FOTOGRAFA o que já está gravado em
-- `writer_deliverables.payload`, e por isso não existe segunda fonte de verdade:
-- o que foi salvo é o que é finalizado. Quem quer finalizar salva antes.
--
-- Idempotência pelo mecanismo que o projeto já usa: `content_hash`. Finalizar
-- de novo sem mudança material encontra `status='approved'` e o hash igual ao
-- da versão corrente, e devolve a MESMA versão, sem inserir nada.
--
-- `previous_version_id` recebe o `current_version_id` de antes — NULL na
-- primeira finalização de um entregável criado depois desta migration.
-- -----------------------------------------------------------------------------
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

-- =============================================================================
-- 3. REABERTURA — O CONTRATO QUE TORNA A REFINALIZAÇÃO POSSÍVEL
-- =============================================================================
-- Sem isto, `approved` seria uma parede: o save recusa, e não haveria caminho
-- de volta. Improvisar um "reopen" dentro do save seria pior — editar um
-- finalizado sem dizer que ele deixou de ser finalizado.
--
-- Reabrir NÃO toca em versões nem em `current_version_id`: a versão finalizada
-- continua sendo a corrente enquanto a próxima não existir. O que muda é só o
-- status, que volta a `draft` e libera o save.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.writer_reopen_deliverable(
  p_brand_id uuid,
  p_document_id text,
  p_kind text,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.writer_deliverables%ROWTYPE;
BEGIN
  SELECT * INTO v_current FROM public.writer_deliverables
    WHERE marca_id = p_brand_id AND document_id = p_document_id AND kind = p_kind FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'writer_deliverable_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_current.status <> 'approved' THEN
    RETURN jsonb_build_object('id', v_current.id, 'status', v_current.status,
      'lockVersion', v_current.lock_version, 'unchanged', true);
  END IF;

  UPDATE public.writer_deliverables
     SET status = 'draft', updated_by = p_actor_id
   WHERE id = v_current.id RETURNING * INTO v_current;

  RETURN jsonb_build_object('id', v_current.id, 'status', v_current.status,
    'currentVersionId', v_current.current_version_id,
    'lockVersion', v_current.lock_version, 'unchanged', false);
END;
$$;

-- =============================================================================
-- 4. GRANTS
-- =============================================================================
REVOKE ALL ON FUNCTION public.writer_save_deliverable(uuid,text,text,jsonb,text,integer,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.writer_reopen_deliverable(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.writer_save_deliverable(uuid,text,text,jsonb,text,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.writer_reopen_deliverable(uuid,text,text,uuid) TO service_role;

COMMENT ON FUNCTION public.writer_finalize_deliverable(uuid,text,text,integer,uuid)
  IS 'Unica autoridade que cria versao de entregavel. Fotografa o payload gravado; nao recebe payload. Idempotente por content_hash. Nao marca predecessor: isso e do readback.';
COMMENT ON FUNCTION public.writer_reopen_deliverable(uuid,text,text,uuid)
  IS 'approved -> draft, sem tocar em versoes nem em current_version_id. Torna a refinalizacao possivel sem editar finalizado.';

COMMIT;

-- =============================================================================
-- READBACK PÓS-APLICAÇÃO — rodar depois, nunca antes
-- =============================================================================
-- 1) As três funções existem, SECURITY DEFINER, e só service_role executa:
--
-- SELECT p.proname, p.prosecdef,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
--        has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('writer_save_deliverable','writer_finalize_deliverable','writer_reopen_deliverable');
-- ESPERADO: 3 linhas, prosecdef=true, anon=false, authenticated=false, service_role=true
--
-- 2) O save não versiona mais — conferir que o corpo não insere em versions:
--
-- SELECT prosrc ILIKE '%INSERT INTO public.writer_deliverable_versions%' AS ainda_versiona
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='writer_save_deliverable';
-- ESPERADO: false
--
-- 3) A normalização aconteceu e os dados legados continuam intactos:
--
-- SELECT count(*) FROM public.writer_deliverables WHERE current_version_id IS NOT NULL; -- ESPERADO: 0
-- SELECT count(*) FROM public.writer_deliverable_versions;                 -- ESPERADO: 2 (preservadas)
-- SELECT count(*) FROM public.writer_deliverables WHERE status='approved'; -- ESPERADO: 0
-- SELECT count(*) FROM public.writer_deliverable_versions
--  WHERE superseded_at IS NOT NULL OR purge_after IS NOT NULL;             -- ESPERADO: 0
--
-- E as duas legadas seguem com id, payload, hash e previous originais:
-- SELECT version_id, version_number, previous_version_id, change_reason,
--        superseded_at, purge_after
--   FROM public.writer_deliverable_versions ORDER BY created_at;
-- ESPERADO: version_number=1, previous=NULL, 'Rascunho inicial.', ambos NULL
--
-- 4) Smoke transacional sugerido (BEGIN ... ROLLBACK), com fixture própria:
--    save × 3  → versions permanece 0 e current_version_id permanece NULL
--    reopen    → status='draft', current continua A
--    save × N  → current continua A e nenhuma versão nova
--    finalize  → 1 version, previous=NULL, current=A, status='approved'
--    finalize  → unchanged=true, continua 1 version
--    reopen    → status='draft', current continua A
--    save      → versions continua 1
--    finalize  → version B, B.previous=A, current=B
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Esta migration só substitui e cria funções; nenhuma tabela, coluna, constraint
-- ou linha é alterada. Reverter é restaurar o corpo anterior de
-- `writer_save_deliverable` — o que está em
-- `supabase/scripts/2026-09-19-m4-rollback-writer-save-deliverable.sql` — e
-- derrubar as duas funções novas:
--
-- DROP FUNCTION IF EXISTS public.writer_finalize_deliverable(uuid,text,text,integer,uuid);
-- DROP FUNCTION IF EXISTS public.writer_reopen_deliverable(uuid,text,text,uuid);
--
-- Atenção ao reverter DEPOIS de alguém ter finalizado: as versões criadas pela
-- finalização permanecem, e o save antigo voltaria a versionar por cima delas.
-- O rollback é seguro enquanto nenhuma finalização tiver acontecido.
--
-- SOBRE A NORMALIZAÇÃO DA SEÇÃO 0: o rollback NÃO repõe os ponteiros anulados,
-- e não deveria. Repô-los seria recriar o defeito — um rascunho voltando a ser
-- "versão corrente". O save antigo, se restaurado, torna a preencher
-- `current_version_id` no próximo save alterado, e as linhas legadas continuam
-- todas lá, intactas. Nada se perde com a anulação do ponteiro: ela é
-- reversível pelo próprio uso.
