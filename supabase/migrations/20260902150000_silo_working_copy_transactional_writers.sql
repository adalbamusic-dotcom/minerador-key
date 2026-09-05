BEGIN;

-- =============================================================================
-- FASE 2C.4 — WRITERS TRANSACIONAIS DA SILOWORKINGCOPY
--
-- Duas corridas foram provadas em codigo na auditoria 2C.4.0:
--
--   1. WORKING COPY OBSOLETA VIRA SILO CONSOLIDADO.
--      `persist_silo_pair_and_consolidate_territory_atomic` nao tem parametro de
--      working copy, nao trava a linha dela e nao compara `lock_version`. Entre
--      a decisao humana e o commit, outro request pode alterar a WC e os
--      artefatos sao gravados a partir de uma versao que nao existe mais.
--
--   2. WORKING COPY ALTERADA DEPOIS DA CONSOLIDACAO.
--      O writer atual faz TRES requisicoes PostgREST — SELECT da WC, SELECT do
--      territorio, UPDATE — ou seja tres transacoes. O guard de editabilidade e
--      a escrita ficam em transacoes diferentes, entao o territorio pode virar
--      `consolidated` entre elas e o UPDATE ainda commita.
--
-- Esta migration cria os DOIS writers transacionais que fecham as duas.
--
-- ORDEM GLOBAL DE LOCKS — invariante de prevencao de deadlock:
--
--     1. Territory  2. SiloWorkingCopy  3. advisory do Silo  4. artifacts
--
--   RPC B (writer da WC):    Territory -> WC
--   RPC A (consolidacao):    Territory -> WC -> [2C.1: advisory -> artifacts]
--
-- Nenhum writer canonico adquire a WC antes do Territorio, entao nao ha ciclo.
-- Retravar o Territorio dentro da 2C.1 e inocuo: locks de linha sao reentrantes
-- na mesma transacao.
--
-- ATOMICIDADE. Nenhuma das duas funcoes tem bloco `EXCEPTION`, deliberadamente:
-- em plpgsql a subtransacao so nasce de `BEGIN ... EXCEPTION`, e sem ela todo
-- RAISE posterior a uma chamada aninhada desfaz tambem o que ela escreveu.
-- Acrescentar um handler aqui quebraria essa garantia.
--
-- ESCOPO. Nenhuma migration historica e editada. Nenhuma tabela, coluna, indice
-- ou gatilho novo: STORAGE_SCHEMA_DDL = 0, FUNCTION_DDL = 2.
-- =============================================================================

DO $precondition$
BEGIN
  IF to_regclass('public.editorial_workflow_items') IS NULL THEN
    RAISE EXCEPTION 'editorial_workflow_items ausente: aplique as migrations anteriores';
  END IF;
  IF to_regclass('public.editorial_artifact_versions') IS NULL THEN
    RAISE EXCEPTION 'editorial_artifact_versions ausente: aplique as migrations anteriores';
  END IF;
  IF to_regprocedure(
    'public.persist_silo_pair_and_consolidate_territory_atomic(uuid,uuid,text,uuid,integer,jsonb,jsonb,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'persist_silo_pair_and_consolidate_territory_atomic ausente ou com assinatura diferente: aplique a migration 20260902140000 antes';
  END IF;
  IF to_regprocedure('public.canonical_assert_rpc_actor(uuid)') IS NULL
     OR to_regprocedure('public.canonical_actor_can_access_brand(uuid,uuid)') IS NULL
     OR to_regprocedure('public.canonical_actor_can_use_brand_action(uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'helpers canonicos de autorizacao ausentes ou com assinatura diferente: aplique 0021 antes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'editorial_workflow_items'
      AND t.tgname = 'editorial_workflow_items_touch_trg'
  ) THEN
    RAISE EXCEPTION 'gatilho de lock_version ausente em editorial_workflow_items';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'editorial_workflow_items_subject_stage_unique'
      AND conrelid = 'public.editorial_workflow_items'::regclass
  ) THEN
    RAISE EXCEPTION 'UNIQUE editorial_workflow_items_subject_stage_unique ausente';
  END IF;
END
$precondition$;

-- =============================================================================
-- RPC B — WRITER CANONICO DA SILOWORKINGCOPY (create + update)
--
-- CREATE tambem entra aqui: a criacao atual faz `read Territorio -> INSERT` em
-- transacoes diferentes. A identidade deterministica da 2C.3A resolveu a
-- duplicacao, mas nao o guard territorial TOCTOU.
-- =============================================================================

CREATE FUNCTION public.persist_silo_working_copy_atomic(
  p_marca_id                   uuid,
  p_actor_user_id              uuid,
  p_action                     text,
  p_territory_workflow_item_id uuid,
  p_working_copy_expected_lock integer,
  p_working_copy               jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  territory_row public.editorial_workflow_items%ROWTYPE;
  territory_object jsonb;
  territory_ref text;
  lifecycle text;
  working_copy_ref text;
  existing_row public.editorial_workflow_items%ROWTYPE;
  existing_state jsonb;
  next_payload jsonb;
  written public.editorial_workflow_items%ROWTYPE;
BEGIN
  IF p_marca_id IS NULL OR p_actor_user_id IS NULL OR p_territory_workflow_item_id IS NULL THEN
    RAISE EXCEPTION 'working copy write requires Brand, actor and territory item';
  END IF;
  IF p_action NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'working copy write action is not allowed';
  END IF;
  IF jsonb_typeof(p_working_copy) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'working copy state must be an object';
  END IF;
  IF p_action = 'create' AND p_working_copy_expected_lock IS NOT NULL THEN
    RAISE EXCEPTION 'create does not take an expected lock';
  END IF;
  IF p_action = 'edit' AND (p_working_copy_expected_lock IS NULL OR p_working_copy_expected_lock < 1) THEN
    RAISE EXCEPTION 'edit requires a positive expected lock';
  END IF;

  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT public.canonical_actor_can_access_brand(p_marca_id, p_actor_user_id)
     OR NOT public.canonical_actor_can_use_brand_action(p_marca_id, p_actor_user_id, 'arquiteto', p_action) THEN
    RAISE EXCEPTION 'working copy actor is not authorized for this Brand and action';
  END IF;

  -- ---------------------------------------------------- 1. Territory FOR UPDATE
  SELECT * INTO territory_row
  FROM public.editorial_workflow_items
  WHERE id = p_territory_workflow_item_id
    AND marca_id = p_marca_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'territory item does not exist for this Brand';
  END IF;

  territory_object := territory_row.payload->'territory';
  IF jsonb_typeof(territory_object) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INCOHERENT_TERRITORY_RECORD: payload does not carry a territory object';
  END IF;
  territory_ref := territory_object->>'territoryRef';

  IF territory_row.subject_type IS DISTINCT FROM 'territory'
     OR territory_row.stage IS DISTINCT FROM 'architect'
     OR territory_row.subject_id IS DISTINCT FROM territory_ref
     OR territory_row.source_entity_id IS DISTINCT FROM territory_ref
     OR territory_row.article_id IS NOT NULL
     OR territory_row.payload->>'contractVersion' IS DISTINCT FROM 'territory-record-v1'
     OR territory_object->>'brandId' IS DISTINCT FROM p_marca_id::text
     OR territory_row.state IS DISTINCT FROM territory_object->>'lifecycleStatus' THEN
    RAISE EXCEPTION 'INCOHERENT_TERRITORY_RECORD: territory row failed the canonical guards';
  END IF;

  -- Editabilidade NA MESMA TRANSACAO em que a escrita acontece. E isto que fecha
  -- a corrida 2: nao ha janela entre provar e gravar.
  lifecycle := territory_object->>'lifecycleStatus';
  IF lifecycle = 'consolidated' THEN
    RAISE EXCEPTION 'WORKING_COPY_ALREADY_CONSUMED: territory is consolidated';
  END IF;
  IF lifecycle IN ('rejected', 'superseded', 'archived') THEN
    RAISE EXCEPTION 'TERRITORY_NOT_EDITABLE: territory lifecycle is %', lifecycle;
  END IF;

  -- ------------------------------------------- 2. identidade derivada e estado
  working_copy_ref := 'silo-working-copy:' || territory_ref;
  IF p_working_copy->>'territoryRef' IS DISTINCT FROM territory_ref THEN
    RAISE EXCEPTION 'TERRITORY_REF_MISMATCH: working copy declares a different territory';
  END IF;
  IF p_working_copy->>'brandId' IS DISTINCT FROM p_marca_id::text THEN
    RAISE EXCEPTION 'BRAND_MISMATCH: working copy declares a different Brand';
  END IF;
  IF p_working_copy->>'workingCopyRef' IS DISTINCT FROM working_copy_ref THEN
    RAISE EXCEPTION 'IDENTITY_IS_IMMUTABLE: workingCopyRef is derived from the territory';
  END IF;
  IF COALESCE(p_working_copy->>'formationStatus', '') NOT IN ('draft', 'ready_for_review') THEN
    RAISE EXCEPTION 'working copy formationStatus is invalid';
  END IF;

  next_payload := jsonb_build_object(
    'contractVersion', 'silo-working-copy-v1',
    'workingCopyRef', working_copy_ref,
    'workingCopy', p_working_copy
  );

  -- ------------------------------------------ 3. SiloWorkingCopy FOR UPDATE
  SELECT * INTO existing_row
  FROM public.editorial_workflow_items
  WHERE marca_id = p_marca_id
    AND subject_type = 'silo_working_copy'
    AND stage = 'architect'
    AND subject_id = working_copy_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_action = 'edit' THEN
      RAISE EXCEPTION 'working copy does not exist for this territory';
    END IF;

    INSERT INTO public.editorial_workflow_items (
      marca_id, subject_type, subject_id, article_id, stage, state,
      source_entity_id, source_version_id, source_content_hash, payload,
      created_by, updated_by
    ) VALUES (
      p_marca_id, 'silo_working_copy', working_copy_ref, NULL, 'architect',
      p_working_copy->>'formationStatus', working_copy_ref, NULL, NULL, next_payload,
      p_actor_user_id, p_actor_user_id
    )
    RETURNING * INTO written;

    RETURN jsonb_build_object(
      'atomicity', 'TRANSACTIONAL_RPC',
      'outcome', 'inserted',
      'idempotentReplay', false,
      'workingCopy', to_jsonb(written)
    );
  END IF;

  -- Integridade da linha existente, sem autocorrecao.
  existing_state := existing_row.payload->'workingCopy';
  IF existing_row.source_entity_id IS DISTINCT FROM working_copy_ref
     OR existing_row.article_id IS NOT NULL
     OR existing_row.payload->>'contractVersion' IS DISTINCT FROM 'silo-working-copy-v1'
     OR existing_row.payload->>'workingCopyRef' IS DISTINCT FROM working_copy_ref
     OR jsonb_typeof(existing_state) IS DISTINCT FROM 'object'
     OR existing_state->>'workingCopyRef' IS DISTINCT FROM working_copy_ref
     OR existing_state->>'territoryRef' IS DISTINCT FROM territory_ref
     OR existing_state->>'brandId' IS DISTINCT FROM p_marca_id::text
     OR existing_row.state IS DISTINCT FROM existing_state->>'formationStatus' THEN
    RAISE EXCEPTION 'SILO_WORKING_COPY_RECORD_INCOHERENT: stored row failed the canonical guards';
  END IF;

  IF p_action = 'create' THEN
    -- CREATE nunca vira UPDATE. Mesmo estado material devolve replay sem
    -- escrever; estado diferente e conflito, porque sobrescrever apagaria a
    -- decisao humana de quem chegou primeiro.
    IF existing_state IS NOT DISTINCT FROM p_working_copy THEN
      RETURN jsonb_build_object(
        'atomicity', 'TRANSACTIONAL_RPC',
        'outcome', 'idempotent_replay',
        'idempotentReplay', true,
        'workingCopy', to_jsonb(existing_row)
      );
    END IF;
    RAISE EXCEPTION 'WORKING_COPY_ALREADY_EXISTS: a different working copy already exists for this territory';
  END IF;

  IF existing_row.lock_version IS DISTINCT FROM p_working_copy_expected_lock THEN
    RAISE EXCEPTION 'working copy update lost the optimistic lock';
  END IF;

  -- `lock_version` nao e atribuido: o gatilho
  -- editorial_workflow_items_touch_trg incrementa a partir de OLD.
  UPDATE public.editorial_workflow_items
     SET state = p_working_copy->>'formationStatus',
         payload = next_payload,
         updated_by = p_actor_user_id
   WHERE id = existing_row.id
     AND marca_id = p_marca_id
     AND lock_version = p_working_copy_expected_lock
  RETURNING * INTO written;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'working copy update lost the optimistic lock';
  END IF;

  RETURN jsonb_build_object(
    'atomicity', 'TRANSACTIONAL_RPC',
    'outcome', 'updated',
    'idempotentReplay', false,
    'workingCopy', to_jsonb(written)
  );
END;
$function$;

-- =============================================================================
-- RPC A — ENTRYPOINT CANONICO DA CONSOLIDACAO SILO-FIRST
--
-- Compoe `persist_silo_pair_and_consolidate_territory_atomic` — nao copia o
-- corpo dela. Aquela funcao passa a ser primitive interno deste fluxo.
--
-- NAO muta a working copy: nao troca state, nao incrementa lock, nao grava
-- `consumed`. A prova de consumo e `Territory.lifecycleStatus = consolidated` +
-- `Territory.consolidation`, e a protecao pos-consolidacao vem da RPC B.
-- =============================================================================

CREATE FUNCTION public.persist_silo_from_working_copy_atomic(
  p_marca_id                   uuid,
  p_actor_user_id              uuid,
  p_action                     text,
  p_territory_workflow_item_id uuid,
  p_territory_expected_lock    integer,
  p_working_copy_expected_lock integer,
  p_silo_dna                   jsonb,
  p_silo_page                  jsonb,
  p_silo_dna_status            text,
  p_silo_page_status           text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  territory_row public.editorial_workflow_items%ROWTYPE;
  territory_object jsonb;
  territory_ref text;
  lifecycle text;
  working_copy_ref text;
  wc_row public.editorial_workflow_items%ROWTYPE;
  wc_state jsonb;
  declared_ref text;
  declared_lock integer;
  persisted_lock integer;
  persisted_dna jsonb;
  inner_result jsonb;
BEGIN
  IF p_marca_id IS NULL OR p_actor_user_id IS NULL OR p_territory_workflow_item_id IS NULL THEN
    RAISE EXCEPTION 'silo consolidation requires Brand, actor and territory item';
  END IF;
  IF p_action NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'silo consolidation action is not allowed';
  END IF;
  IF jsonb_typeof(p_silo_dna) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_silo_page) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_silo_dna->'payload') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_silo_page->'payload') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'silo consolidation envelopes must be objects';
  END IF;

  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT public.canonical_actor_can_access_brand(p_marca_id, p_actor_user_id)
     OR NOT public.canonical_actor_can_use_brand_action(p_marca_id, p_actor_user_id, 'arquiteto', p_action) THEN
    RAISE EXCEPTION 'silo consolidation actor is not authorized for this Brand and action';
  END IF;

  -- ---------------------------------------------------- 1. Territory FOR UPDATE
  SELECT * INTO territory_row
  FROM public.editorial_workflow_items
  WHERE id = p_territory_workflow_item_id
    AND marca_id = p_marca_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'territory item does not exist for this Brand';
  END IF;

  territory_object := territory_row.payload->'territory';
  IF jsonb_typeof(territory_object) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INCOHERENT_TERRITORY_RECORD: payload does not carry a territory object';
  END IF;
  territory_ref := territory_object->>'territoryRef';

  IF territory_row.subject_type IS DISTINCT FROM 'territory'
     OR territory_row.stage IS DISTINCT FROM 'architect'
     OR territory_row.subject_id IS DISTINCT FROM territory_ref
     OR territory_row.source_entity_id IS DISTINCT FROM territory_ref
     OR territory_row.article_id IS NOT NULL
     OR territory_row.payload->>'contractVersion' IS DISTINCT FROM 'territory-record-v1'
     OR territory_object->>'brandId' IS DISTINCT FROM p_marca_id::text
     OR territory_row.state IS DISTINCT FROM territory_object->>'lifecycleStatus' THEN
    RAISE EXCEPTION 'INCOHERENT_TERRITORY_RECORD: territory row failed the canonical guards';
  END IF;

  -- ------------------------------------------ 2. SiloWorkingCopy FOR UPDATE
  -- O ref e DERIVADO, nunca recebido: aceita-lo do chamador permitiria apontar a
  -- consolidacao para outra working copy.
  working_copy_ref := 'silo-working-copy:' || territory_ref;

  SELECT * INTO wc_row
  FROM public.editorial_workflow_items
  WHERE marca_id = p_marca_id
    AND subject_type = 'silo_working_copy'
    AND stage = 'architect'
    AND subject_id = working_copy_ref
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKING_COPY_NOT_FOUND: no working copy for this territory';
  END IF;

  wc_state := wc_row.payload->'workingCopy';
  IF wc_row.source_entity_id IS DISTINCT FROM working_copy_ref
     OR wc_row.article_id IS NOT NULL
     OR wc_row.payload->>'contractVersion' IS DISTINCT FROM 'silo-working-copy-v1'
     OR wc_row.payload->>'workingCopyRef' IS DISTINCT FROM working_copy_ref
     OR jsonb_typeof(wc_state) IS DISTINCT FROM 'object'
     OR wc_state->>'workingCopyRef' IS DISTINCT FROM working_copy_ref
     OR wc_state->>'territoryRef' IS DISTINCT FROM territory_ref
     OR wc_state->>'brandId' IS DISTINCT FROM p_marca_id::text
     OR wc_row.state IS DISTINCT FROM wc_state->>'formationStatus' THEN
    RAISE EXCEPTION 'SILO_WORKING_COPY_RECORD_INCOHERENT: stored row failed the canonical guards';
  END IF;

  declared_ref := p_silo_dna->'payload'->>'workingCopyRef';
  declared_lock := CASE
    WHEN COALESCE(p_silo_dna->'payload'->>'workingCopyLockVersion', '') ~ '^[0-9]+$'
      THEN (p_silo_dna->'payload'->>'workingCopyLockVersion')::integer
    ELSE NULL
  END;
  lifecycle := territory_object->>'lifecycleStatus';

  -- ------------------------------------------------------ 3. ramo de replay
  -- Avaliado ANTES da checagem de p_working_copy_expected_lock: um retry chega
  -- com o lock que leu antes da primeira execucao, e exigi-lo aqui mataria o
  -- retry exatamente no caso que a idempotencia existe para cobrir. Como esta
  -- funcao nao fencea a WC, o lock persistido continua valendo como prova.
  IF lifecycle = 'consolidated' THEN
    IF declared_ref IS NULL OR declared_lock IS NULL THEN
      RAISE EXCEPTION 'PROVENANCE_MISSING: replayed SiloDNA does not carry working copy provenance';
    END IF;

    SELECT e.payload INTO persisted_dna
    FROM public.editorial_artifact_versions e
    WHERE e.marca_id = p_marca_id
      AND e.artifact_type = 'silo_dna'
      AND e.entity_id = p_silo_dna->>'entityId'
      AND e.version_id = p_silo_dna->>'versionId';
    IF persisted_dna IS NULL THEN
      RAISE EXCEPTION 'STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR: no persisted SiloDNA carries this identity';
    END IF;

    -- A proveniencia persistida precisa ser materialmente valida antes de servir
    -- de prova: ref nao vazio e lock inteiro positivo.
    IF COALESCE(persisted_dna->>'workingCopyRef', '') = ''
       OR COALESCE(persisted_dna->>'workingCopyLockVersion', '') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'PROVENANCE_MISSING: the persisted SiloDNA does not carry valid working copy provenance';
    END IF;
    persisted_lock := (persisted_dna->>'workingCopyLockVersion')::integer;

    -- IGUALDADE DE TRES PONTAS:
    --   REQUEST = SILODNA PERSISTIDO = WORKING COPY HISTORICA TRAVADA
    --
    -- A terceira perna e o que impede replay sobre uma working copy alterada
    -- depois da consolidacao. `p_working_copy_expected_lock` continua fora daqui
    -- de proposito — ele e a expectativa do request original, nao prova duravel
    -- do snapshot consolidado; usa-lo como gate mataria o retry legitimo.
    IF persisted_dna->>'workingCopyRef' IS DISTINCT FROM working_copy_ref
       OR persisted_dna->>'workingCopyRef' IS DISTINCT FROM declared_ref
       OR persisted_lock IS DISTINCT FROM declared_lock
       OR persisted_lock IS DISTINCT FROM wc_row.lock_version THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: the persisted Silo came from a different working copy version';
    END IF;

    -- A comparacao material do par fica com a 2C.1, que ja compara o payload
    -- inteiro — e portanto ja cobre a proveniencia, sem logica nova aqui.
    inner_result := public.persist_silo_pair_and_consolidate_territory_atomic(
      p_marca_id, p_actor_user_id, p_action,
      p_territory_workflow_item_id, p_territory_expected_lock,
      p_silo_dna, p_silo_page, p_silo_dna_status, p_silo_page_status
    );
    RETURN inner_result || jsonb_build_object(
      'entrypoint', 'persist_silo_from_working_copy_atomic',
      'workingCopy', to_jsonb(wc_row)
    );
  END IF;

  -- ------------------------------------------------- 4. primeira consolidacao
  IF p_working_copy_expected_lock IS NULL OR p_working_copy_expected_lock < 1 THEN
    RAISE EXCEPTION 'silo consolidation requires a positive working copy expected lock';
  END IF;
  IF declared_ref IS NULL OR declared_lock IS NULL THEN
    RAISE EXCEPTION 'PROVENANCE_MISSING: a Silo-first SiloDNA must carry workingCopyRef and workingCopyLockVersion';
  END IF;

  -- Lock antes de proveniencia: se a working copy mudou, o que o chamador
  -- declarou descreve uma versao que nao existe mais.
  IF wc_row.lock_version IS DISTINCT FROM p_working_copy_expected_lock THEN
    RAISE EXCEPTION 'STALE_WORKING_COPY: the working copy changed after the human decision';
  END IF;
  IF declared_ref IS DISTINCT FROM working_copy_ref
     OR declared_lock IS DISTINCT FROM wc_row.lock_version THEN
    RAISE EXCEPTION 'PROVENANCE_MISMATCH: SiloDNA provenance does not match the locked working copy';
  END IF;

  inner_result := public.persist_silo_pair_and_consolidate_territory_atomic(
    p_marca_id, p_actor_user_id, p_action,
    p_territory_workflow_item_id, p_territory_expected_lock,
    p_silo_dna, p_silo_page, p_silo_dna_status, p_silo_page_status
  );

  RETURN inner_result || jsonb_build_object(
    'entrypoint', 'persist_silo_from_working_copy_atomic',
    'workingCopy', to_jsonb(wc_row)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_silo_working_copy_atomic(uuid, uuid, text, uuid, integer, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_silo_working_copy_atomic(uuid, uuid, text, uuid, integer, jsonb)
TO service_role;

REVOKE ALL ON FUNCTION public.persist_silo_from_working_copy_atomic(uuid, uuid, text, uuid, integer, integer, jsonb, jsonb, text, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_silo_from_working_copy_atomic(uuid, uuid, text, uuid, integer, integer, jsonb, jsonb, text, text)
TO service_role;

COMMENT ON FUNCTION public.persist_silo_working_copy_atomic(uuid, uuid, text, uuid, integer, jsonb)
IS 'Writer transacional da SiloWorkingCopy: trava o Territorio, prova editabilidade na mesma transacao e faz create idempotente ou update com expectedLock.';

COMMENT ON FUNCTION public.persist_silo_from_working_copy_atomic(uuid, uuid, text, uuid, integer, integer, jsonb, jsonb, text, text)
IS 'Entrypoint canonico da consolidacao Silo-first: trava Territorio e SiloWorkingCopy, valida snapshot e proveniencia, e compoe persist_silo_pair_and_consolidate_territory_atomic.';

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- Remove APENAS as duas funcoes novas. As primitivas
-- `persist_silo_pair_atomic` e
-- `persist_silo_pair_and_consolidate_territory_atomic`, as tabelas, os indices e
-- todo o historico permanecem intactos. Working copies e territorios ja gravados
-- continuam legiveis: o rollback remove o caminho transacional, nao desfaz
-- decisao editorial tomada.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.persist_silo_from_working_copy_atomic(
--   uuid, uuid, text, uuid, integer, integer, jsonb, jsonb, text, text
-- );
-- DROP FUNCTION IF EXISTS public.persist_silo_working_copy_atomic(
--   uuid, uuid, text, uuid, integer, jsonb
-- );
-- COMMIT;
-- =============================================================================
