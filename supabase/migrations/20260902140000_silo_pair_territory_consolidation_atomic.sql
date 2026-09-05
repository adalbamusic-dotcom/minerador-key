BEGIN;

-- =============================================================================
-- ADENDO 2C.1 — CONSOLIDACAO TERRITORIAL ATOMICA
--
-- Problema. `persist_silo_pair_atomic` grava SiloDNA e SiloPage numa transacao,
-- mas nao toca `editorial_workflow_items`, onde vive o Territory. O runtime fala
-- por PostgREST, que abre UMA transacao por request. Consolidar em duas chamadas
-- deixa dois estados finais ruins e nenhum se auto-cura:
--
--   par primeiro  -> se a segunda chamada falhar, o par existe e o Territory
--                    segue `confirmed`; o retry NAO funciona, porque o slot de
--                    versao ja esta ocupado e a RPC recusa com "initial SiloDNA
--                    pair must use version 1 without predecessor";
--   Territory 1o  -> se a segunda falhar, o Territory fica `consolidated` com
--                    `consolidation` apontando para versoes que nao existem.
--
-- Esta funcao ORQUESTRA: valida o Territory, CHAMA a funcao existente e so
-- entao atualiza o Territory. Tudo no mesmo commit.
--
-- ATOMICIDADE — por que a composicao funciona. `persist_silo_pair_atomic` e
-- plpgsql SECURITY INVOKER. Uma chamada de funcao plpgsql NAO abre
-- subtransacao: subtransacao so nasce de um bloco `BEGIN ... EXCEPTION`. Esta
-- funcao nao possui NENHUM handler de excecao, deliberadamente. Portanto todo
-- RAISE posterior a chamada aninhada aborta a transacao inteira e desfaz TAMBEM
-- os dois INSERT do par. Acrescentar um `EXCEPTION WHEN ...` aqui quebraria essa
-- garantia — nao acrescentar.
--
-- ESCOPO. A funcao historica 20260826225154 nao e editada nem substituida.
-- Nenhuma tabela, coluna ou indice novo.
-- =============================================================================

DO $precondition$
BEGIN
  IF to_regclass('public.editorial_workflow_items') IS NULL THEN
    RAISE EXCEPTION 'editorial_workflow_items ausente: aplique as migrations anteriores';
  END IF;
  IF to_regclass('public.editorial_artifact_versions') IS NULL THEN
    RAISE EXCEPTION 'editorial_artifact_versions ausente: aplique as migrations anteriores';
  END IF;
  -- Pergunta a assinatura DIRETAMENTE ao resolvedor do PostgreSQL. A versao
  -- anterior comparava `pg_get_function_identity_arguments(p.oid)` com uma
  -- string de tipos, e essa funcao inclui os NOMES dos parametros na saida
  -- ('p_marca_id uuid, p_actor_user_id uuid, ...'), entao a comparacao textual
  -- falhava mesmo com a funcao presente e correta. `to_regprocedure` resolve a
  -- assinatura pelos tipos e devolve NULL quando ela nao existe.
  IF to_regprocedure(
    'public.persist_silo_pair_atomic(uuid,uuid,text,jsonb,jsonb,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'persist_silo_pair_atomic(uuid,uuid,text,jsonb,jsonb,text,text) ausente ou com assinatura diferente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'canonical_assert_rpc_actor'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'canonical_actor_can_access_brand'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'canonical_actor_can_use_brand_action'
  ) THEN
    RAISE EXCEPTION 'helpers canonicos de autorizacao ausentes: aplique 0021 antes';
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
END
$precondition$;

CREATE FUNCTION public.persist_silo_pair_and_consolidate_territory_atomic(
  p_marca_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_territory_workflow_item_id uuid,
  p_territory_expected_lock integer,
  p_silo_dna jsonb,
  p_silo_page jsonb,
  p_silo_dna_status text,
  p_silo_page_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  territory_row public.editorial_workflow_items%ROWTYPE;
  updated_territory public.editorial_workflow_items%ROWTYPE;
  territory_payload jsonb;
  original_territory jsonb;
  next_territory jsonb;
  next_payload jsonb;
  territory_ref text;
  pending_operation jsonb;
  stored_consolidation jsonb;
  dna_entity_id text;
  dna_version_id text;
  dna_version_number integer;
  dna_content_hash text;
  page_entity_id text;
  page_version_id text;
  page_version_number integer;
  page_content_hash text;
  pair jsonb;
  dna_row jsonb;
  page_row jsonb;
  consolidation jsonb;
  consolidated_at text;
BEGIN
  -- ---------------------------------------------------------------- guardas
  IF p_marca_id IS NULL OR p_actor_user_id IS NULL OR p_territory_workflow_item_id IS NULL THEN
    RAISE EXCEPTION 'territory consolidation requires Brand, actor and territory item';
  END IF;
  IF p_action NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'territory consolidation action is not allowed';
  END IF;
  IF p_territory_expected_lock IS NULL OR p_territory_expected_lock < 1 THEN
    RAISE EXCEPTION 'territory consolidation requires a positive expected lock';
  END IF;
  IF jsonb_typeof(p_silo_dna) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_silo_page) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_silo_dna->'payload') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_silo_page->'payload') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'territory consolidation envelopes must be objects';
  END IF;
  IF p_silo_dna_status IS NULL OR btrim(p_silo_dna_status) = ''
     OR p_silo_page_status IS NULL OR btrim(p_silo_page_status) = '' THEN
    RAISE EXCEPTION 'territory consolidation requires both artifact statuses';
  END IF;

  -- Autorizacao PROPRIA. Nao delegada a funcao aninhada: esta operacao muda o
  -- Territory, que aquela funcao nem enxerga.
  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT public.canonical_actor_can_access_brand(p_marca_id, p_actor_user_id)
     OR NOT public.canonical_actor_can_use_brand_action(p_marca_id, p_actor_user_id, 'arquiteto', p_action) THEN
    RAISE EXCEPTION 'territory consolidation actor is not authorized for this Brand and action';
  END IF;

  dna_entity_id := p_silo_dna->>'entityId';
  dna_version_id := p_silo_dna->>'versionId';
  dna_content_hash := p_silo_dna->>'contentHash';
  page_entity_id := p_silo_page->>'entityId';
  page_version_id := p_silo_page->>'versionId';
  page_content_hash := p_silo_page->>'contentHash';
  IF COALESCE(dna_entity_id, '') = '' OR COALESCE(dna_version_id, '') = '' OR COALESCE(dna_content_hash, '') = ''
     OR COALESCE(page_entity_id, '') = '' OR COALESCE(page_version_id, '') = '' OR COALESCE(page_content_hash, '') = ''
     OR COALESCE(p_silo_dna->>'versionNumber', '') !~ '^[0-9]+$'
     OR COALESCE(p_silo_page->>'versionNumber', '') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'territory consolidation pair identity is incomplete';
  END IF;
  dna_version_number := (p_silo_dna->>'versionNumber')::integer;
  page_version_number := (p_silo_page->>'versionNumber')::integer;

  -- ------------------------------------------------- trava e le o Territory
  SELECT * INTO territory_row
  FROM public.editorial_workflow_items
  WHERE id = p_territory_workflow_item_id
    AND marca_id = p_marca_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'territory item does not exist for this Brand';
  END IF;

  IF territory_row.subject_type IS DISTINCT FROM 'territory' THEN
    RAISE EXCEPTION 'workflow item is not a territory record';
  END IF;
  IF territory_row.stage IS DISTINCT FROM 'architect' THEN
    RAISE EXCEPTION 'territory record is not in the architect stage';
  END IF;

  territory_payload := territory_row.payload;
  original_territory := territory_payload->'territory';
  IF jsonb_typeof(original_territory) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'territory payload does not carry a territory object';
  END IF;

  territory_ref := original_territory->>'territoryRef';
  IF territory_ref IS DISTINCT FROM territory_row.subject_id THEN
    RAISE EXCEPTION 'territory subject_id does not match the payload territoryRef';
  END IF;
  IF original_territory->>'brandId' IS DISTINCT FROM p_marca_id::text THEN
    RAISE EXCEPTION 'territory payload belongs to a different Brand';
  END IF;
  IF territory_row.state IS DISTINCT FROM original_territory->>'lifecycleStatus' THEN
    RAISE EXCEPTION 'territory row state does not mirror the payload lifecycleStatus';
  END IF;

  -- ------------------------------------------- integridade da LINHA territorial
  -- Valem para os DOIS caminhos — primeira consolidacao e replay — e vem antes
  -- do branch de replay, do expectedLock e de qualquer escrita. Uma linha
  -- estruturalmente errada nao consolida, e tambem nao e corrigida aqui.

  -- `source_entity_id` E o proprio territoryRef, por decisao de contrato da 2A.2.
  -- As RPCs de purga de keyword (0046 e 0047) apagam itens de workflow com
  -- `source_entity_id = keyword.id::text`, e em 0047 esse DELETE NAO filtra por
  -- `subject_type`. O prefixo `territory:` torna a colisao estruturalmente
  -- impossivel. Consolidar sobre uma linha que divergiu disso reabriria o risco
  -- de o territorio ser apagado junto com uma keyword sem relacao com ele.
  IF territory_row.source_entity_id IS DISTINCT FROM territory_ref THEN
    RAISE EXCEPTION 'INCOHERENT_TERRITORY_RECORD: source_entity_id (%) does not match the territoryRef',
      territory_row.source_entity_id;
  END IF;

  -- O Territory record nao possui historico anterior a este contrato: qualquer
  -- outra versao e payload desconhecido, e payload desconhecido nao se interpreta.
  IF territory_payload->>'contractVersion' IS DISTINCT FROM 'territory-record-v1' THEN
    RAISE EXCEPTION 'INCOHERENT_TERRITORY_RECORD: unsupported contractVersion (%)',
      COALESCE(territory_payload->>'contractVersion', '<ausente>');
  END IF;

  -- Territorio nao e Article. `article_id` nulo e contrato, nao acaso; uma linha
  -- que mistura os dois nao serve de base para consolidacao.
  IF territory_row.article_id IS NOT NULL THEN
    RAISE EXCEPTION 'INCOHERENT_TERRITORY_RECORD: territory record carries an article_id (%)',
      territory_row.article_id;
  END IF;

  -- O par TEM de declarar o mesmo territorio. Nao ha fallback por siloId,
  -- lista_id, articleId ou slug: nenhum deles e territorio.
  IF p_silo_dna->'payload'->>'territoryRef' IS DISTINCT FROM territory_ref THEN
    RAISE EXCEPTION 'SiloDNA territoryRef does not match the territory being consolidated';
  END IF;
  IF p_silo_page->'payload'->>'territoryRef' IS DISTINCT FROM territory_ref THEN
    RAISE EXCEPTION 'SiloPage territoryRef does not match the territory being consolidated';
  END IF;

  -- ------------------------------------------------------ replay idempotente
  -- Resposta perdida nao pode virar versao nova nem erro indistinguivel. Este
  -- ramo NAO chama persist_silo_pair_atomic e nao escreve nada.
  --
  -- ORDEM DELIBERADA: o replay e avaliado ANTES da checagem de
  -- p_territory_expected_lock. Quem reenvia a mesma consolidacao carrega o lock
  -- que leu ANTES da primeira execucao; exigir o lock novo faria o retry falhar
  -- exatamente no caso que a idempotencia existe para cobrir. O lock so protege
  -- a PRIMEIRA transicao confirmed -> consolidated.
  IF original_territory->>'lifecycleStatus' = 'consolidated' THEN
    stored_consolidation := original_territory->'consolidation';

    -- Estado incoerente: consolidated sem registro completo do que o consolidou.
    -- Nao e "estrutura diferente" — e um territorio que nao sabe dizer de onde veio.
    -- Os dois refs sao COMPLETOS: entityId, versionId, versionNumber e contentHash.
    IF jsonb_typeof(stored_consolidation) IS DISTINCT FROM 'object'
       OR COALESCE(stored_consolidation->>'siloId', '') = ''
       OR COALESCE(stored_consolidation->>'consolidatedAt', '') = ''
       OR jsonb_typeof(stored_consolidation->'siloDnaVersionRef') IS DISTINCT FROM 'object'
       OR jsonb_typeof(stored_consolidation->'siloPageVersionRef') IS DISTINCT FROM 'object'
       OR COALESCE(stored_consolidation->'siloDnaVersionRef'->>'entityId', '') = ''
       OR COALESCE(stored_consolidation->'siloDnaVersionRef'->>'versionId', '') = ''
       OR COALESCE(stored_consolidation->'siloDnaVersionRef'->>'contentHash', '') = ''
       OR jsonb_typeof(stored_consolidation->'siloDnaVersionRef'->'versionNumber') IS DISTINCT FROM 'number'
       OR COALESCE(stored_consolidation->'siloPageVersionRef'->>'entityId', '') = ''
       OR COALESCE(stored_consolidation->'siloPageVersionRef'->>'versionId', '') = ''
       OR COALESCE(stored_consolidation->'siloPageVersionRef'->>'contentHash', '') = ''
       OR jsonb_typeof(stored_consolidation->'siloPageVersionRef'->'versionNumber') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'INCOHERENT_TERRITORY_STATE: consolidated territory without a complete consolidation record';
    END IF;

    IF stored_consolidation->>'siloId' IS DISTINCT FROM dna_entity_id
       OR stored_consolidation->'siloDnaVersionRef'->>'entityId' IS DISTINCT FROM dna_entity_id
       OR stored_consolidation->'siloDnaVersionRef'->>'versionId' IS DISTINCT FROM dna_version_id
       OR (stored_consolidation->'siloDnaVersionRef'->>'versionNumber')::integer IS DISTINCT FROM dna_version_number
       OR stored_consolidation->'siloDnaVersionRef'->>'contentHash' IS DISTINCT FROM dna_content_hash
       OR stored_consolidation->'siloPageVersionRef'->>'entityId' IS DISTINCT FROM page_entity_id
       OR stored_consolidation->'siloPageVersionRef'->>'versionId' IS DISTINCT FROM page_version_id
       OR (stored_consolidation->'siloPageVersionRef'->>'versionNumber')::integer IS DISTINCT FROM page_version_number
       OR stored_consolidation->'siloPageVersionRef'->>'contentHash' IS DISTINCT FROM page_content_hash THEN
      RAISE EXCEPTION 'STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR: territory is already consolidated with a different structure';
    END IF;

    -- A linha e localizada pela IDENTIDADE e depois conferida MATERIALMENTE. O
    -- passo separado existe para distinguir "nao existe versao com essa
    -- identidade" de "existe, mas o conteudo pedido e outro".
    --
    -- `contentHash` chega do caller e o banco NAO o recomputa: confiar nele como
    -- prova de igualdade de payload seria aceitar a palavra de quem esta pedindo
    -- o replay. Por isso o payload e comparado inteiro, com igualdade semantica
    -- de jsonb (independente da ordem das chaves).
    SELECT to_jsonb(e.*) INTO dna_row
    FROM public.editorial_artifact_versions e
    WHERE e.marca_id = p_marca_id
      AND e.artifact_type = 'silo_dna'
      AND e.entity_id = dna_entity_id
      AND e.version_id = dna_version_id;
    IF dna_row IS NULL THEN
      RAISE EXCEPTION 'STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR: no persisted SiloDNA carries this identity';
    END IF;
    IF (dna_row->>'version_number')::integer IS DISTINCT FROM dna_version_number
       OR dna_row->>'content_hash' IS DISTINCT FROM dna_content_hash
       OR dna_row->>'status' IS DISTINCT FROM p_silo_dna_status
       OR dna_row->>'origin' IS DISTINCT FROM p_silo_dna->>'origin'
       OR dna_row->>'change_reason' IS DISTINCT FROM p_silo_dna->>'changeReason'
       OR dna_row->>'previous_version_id' IS DISTINCT FROM NULLIF(p_silo_dna->>'previousVersionId', '')
       OR dna_row->>'created_by' IS DISTINCT FROM p_actor_user_id::text
       OR (dna_row->>'created_at')::timestamptz IS DISTINCT FROM (p_silo_dna->>'createdAt')::timestamptz
       OR dna_row->>'source_version_id' IS NOT NULL
       OR (dna_row->'payload') IS DISTINCT FROM (p_silo_dna->'payload') THEN
      RAISE EXCEPTION 'REPLAY_CONFLICT: persisted SiloDNA differs materially from the replayed request';
    END IF;

    SELECT to_jsonb(e.*) INTO page_row
    FROM public.editorial_artifact_versions e
    WHERE e.marca_id = p_marca_id
      AND e.artifact_type = 'silo_page'
      AND e.entity_id = page_entity_id
      AND e.version_id = page_version_id;
    IF page_row IS NULL THEN
      RAISE EXCEPTION 'STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR: no persisted SiloPage carries this identity';
    END IF;
    IF (page_row->>'version_number')::integer IS DISTINCT FROM page_version_number
       OR page_row->>'content_hash' IS DISTINCT FROM page_content_hash
       OR page_row->>'status' IS DISTINCT FROM p_silo_page_status
       OR page_row->>'origin' IS DISTINCT FROM p_silo_page->>'origin'
       OR page_row->>'change_reason' IS DISTINCT FROM p_silo_page->>'changeReason'
       OR page_row->>'previous_version_id' IS DISTINCT FROM NULLIF(p_silo_page->>'previousVersionId', '')
       OR page_row->>'created_by' IS DISTINCT FROM p_actor_user_id::text
       OR (page_row->>'created_at')::timestamptz IS DISTINCT FROM (p_silo_page->>'createdAt')::timestamptz
       OR page_row->>'source_version_id' IS DISTINCT FROM dna_version_id
       OR (page_row->'payload') IS DISTINCT FROM (p_silo_page->'payload') THEN
      RAISE EXCEPTION 'REPLAY_CONFLICT: persisted SiloPage differs materially from the replayed request';
    END IF;

    RETURN jsonb_build_object(
      'atomicity', 'TRANSACTIONAL_RPC',
      'idempotentReplay', true,
      'territory', to_jsonb(territory_row),
      'siloDna', dna_row,
      'siloPage', page_row
    );
  END IF;

  -- ------------------------------------------------------- caminho canonico
  IF original_territory->>'lifecycleStatus' IS DISTINCT FROM 'confirmed'
     OR original_territory->>'decisionState' IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'only a confirmed territory can be consolidated';
  END IF;

  -- Estado incoerente simetrico: confirmed que ja carrega consolidacao. Ou o
  -- territorio foi consolidado e o lifecycle nao acompanhou, ou alguem escreveu
  -- `consolidation` fora desta funcao. Recusar; nao limpar.
  --
  -- No TerritoryCandidateSchema o campo e `.nullable()` e NAO `.optional()`:
  -- a serializacao canonica sempre emite a chave, como objeto ou como JSON null.
  -- Portanto `confirmed` so aceita AUSENTE (tolerado, nao canonico) ou JSON null.
  -- Qualquer outro valor material — object, array, string, number, boolean — e
  -- corrupcao e nao pode ser sobrescrita em silencio.
  IF original_territory ? 'consolidation'
     AND jsonb_typeof(original_territory->'consolidation') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'INCOHERENT_TERRITORY_STATE: confirmed territory carries a consolidation value of type %',
      jsonb_typeof(original_territory->'consolidation');
  END IF;

  -- Operacao de membership nao resolvida bloqueia a consolidacao, ANTES de
  -- qualquer escrita. Consolidar congela a membership: fazer isso sobre um lote
  -- que falhou pela metade grava a metade como se fosse a decisao inteira.
  -- A operacao NAO e limpa, corrigida nem ignorada aqui.
  pending_operation := original_territory->'pendingOperation';
  IF jsonb_typeof(pending_operation) = 'object' THEN
    IF jsonb_array_length(COALESCE(pending_operation->'failedKeywordIds', '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'PARTIAL_OPERATION_PENDING: territory has a partial membership operation';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        COALESCE(pending_operation->'intendedKeywordIds', '[]'::jsonb)
      ) AS intended(keyword_id)
      WHERE NOT jsonb_exists(
        COALESCE(pending_operation->'appliedKeywordIds', '[]'::jsonb),
        intended.keyword_id
      )
    ) THEN
      RAISE EXCEPTION 'PARTIAL_OPERATION_PENDING: territory has an unfinished membership operation';
    END IF;
  END IF;

  IF territory_row.lock_version IS DISTINCT FROM p_territory_expected_lock THEN
    RAISE EXCEPTION 'territory consolidation lost the optimistic lock';
  END IF;

  -- Persiste o par. Falha aqui aborta tudo; falha DEPOIS daqui tambem desfaz o
  -- par, porque nao existe subtransacao entre as duas escritas.
  pair := public.persist_silo_pair_atomic(
    p_marca_id, p_actor_user_id, p_action,
    p_silo_dna, p_silo_page, p_silo_dna_status, p_silo_page_status
  );
  dna_row := pair->'siloDna';
  page_row := pair->'siloPage';
  IF jsonb_typeof(dna_row) IS DISTINCT FROM 'object' OR jsonb_typeof(page_row) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'silo pair readback is incomplete';
  END IF;

  -- `consolidation` sai do READBACK REAL, nunca do que o chamador declarou.
  -- Os refs sao COMPLETOS: entityId, versionId, versionNumber e contentHash.
  -- `versionNumber` vem de `version_number` da linha inserida — nao do envelope —
  -- porque e a linha que diz qual passo da cadeia de sucessao consolidou.
  consolidated_at := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  consolidation := jsonb_build_object(
    'siloId', dna_row->>'entity_id',
    'siloDnaVersionRef', jsonb_build_object(
      'entityId', dna_row->>'entity_id',
      'versionId', dna_row->>'version_id',
      'versionNumber', (dna_row->>'version_number')::integer,
      'contentHash', dna_row->>'content_hash'
    ),
    'siloPageVersionRef', jsonb_build_object(
      'entityId', page_row->>'entity_id',
      'versionId', page_row->>'version_id',
      'versionNumber', (page_row->>'version_number')::integer,
      'contentHash', page_row->>'content_hash'
    ),
    'consolidatedAt', consolidated_at
  );

  next_territory := jsonb_set(original_territory, '{lifecycleStatus}', '"consolidated"'::jsonb, true);
  next_territory := jsonb_set(next_territory, '{consolidation}', consolidation, true);

  -- Consolidacao NAO e endpoint generico de edicao: nada alem destes dois
  -- campos pode ter mudado. As duas checagens tornam a garantia verificavel, em
  -- vez de mera consequencia da forma como os objetos foram montados.
  IF (next_territory - 'lifecycleStatus' - 'consolidation')
     IS DISTINCT FROM (original_territory - 'lifecycleStatus' - 'consolidation') THEN
    RAISE EXCEPTION 'territory consolidation may not change any other territorial decision';
  END IF;

  next_payload := jsonb_set(territory_payload, '{territory}', next_territory, true);
  IF (next_payload - 'territory') IS DISTINCT FROM (territory_payload - 'territory') THEN
    RAISE EXCEPTION 'territory consolidation may not change any other payload field';
  END IF;

  -- `lock_version` NAO e atribuido aqui: o gatilho
  -- editorial_workflow_items_touch_trg incrementa a partir de OLD. Setar aqui
  -- causaria incremento duplo.
  UPDATE public.editorial_workflow_items
     SET state = 'consolidated',
         payload = next_payload,
         updated_by = p_actor_user_id
   WHERE id = territory_row.id
     AND marca_id = p_marca_id
     AND lock_version = p_territory_expected_lock
  RETURNING * INTO updated_territory;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'territory consolidation lost the optimistic lock';
  END IF;

  RETURN jsonb_build_object(
    'atomicity', 'TRANSACTIONAL_RPC',
    'idempotentReplay', false,
    'territory', to_jsonb(updated_territory),
    'siloDna', dna_row,
    'siloPage', page_row
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_silo_pair_and_consolidate_territory_atomic(uuid, uuid, text, uuid, integer, jsonb, jsonb, text, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_silo_pair_and_consolidate_territory_atomic(uuid, uuid, text, uuid, integer, jsonb, jsonb, text, text)
TO service_role;

COMMENT ON FUNCTION public.persist_silo_pair_and_consolidate_territory_atomic(uuid, uuid, text, uuid, integer, jsonb, jsonb, text, text)
IS 'Consolida o Territory e persiste o par SiloDNA/SiloPage na mesma transacao, compondo persist_silo_pair_atomic; replay identico devolve idempotentReplay sem escrever.';

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- Remove APENAS a funcao nova. `persist_silo_pair_atomic`, tabelas, indices e
-- todo o historico permanecem intactos. Territorios ja consolidados por esta
-- funcao continuam consolidados: o rollback tira o caminho, nao desfaz decisao
-- editorial tomada.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.persist_silo_pair_and_consolidate_territory_atomic(
--   uuid, uuid, text, uuid, integer, jsonb, jsonb, text, text
-- );
-- COMMIT;
-- =============================================================================
