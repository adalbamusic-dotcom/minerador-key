-- =============================================================================
-- EXCLUIR TUDO DA COR (M-E) — a exclusão do Minerador por cor, numa transação
-- SDD: docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md,
--      item 6 (§10), §11.2 e F7 (§16, §18.7). Decisões D6, D7 e D8.
-- Pedido do dono (2026-10-13): "também tem que ter a opção de poder eliminar
-- tudo que estiver dentro de uma tag, de acordo aos contratos que já temos a
-- nível global". Autorização para concluir: 2026-10-14 ("pode concluir as
-- pendências").
--
-- ESTADO: NÃO APLICADA. O código da F7 funciona SEM ela: a prévia (grátis)
-- aparece, e o botão "Excluir tudo da cor" fica DESABILITADO com a explicação
-- (a rota sonda `lifecycle_delete_group_keywords_contract()`; sem a função,
-- responde 409 GROUP_DELETE_NOT_AVAILABLE). O deploy não quebra. A exclusão
-- comum (selecionar → Excluir) continua como sempre.
--
-- PRÉ-REQUISITO: 20261015120000_assunto_nunca_se_perde (os gatilhos do Assunto).
-- Conferido por SELECT em 2026-10-14: aplicada (os dois gatilhos existem e
-- constam no histórico remoto). A ordem com a M-L (20261016120000_listas_leves)
-- NÃO importa: uma não usa nada da outra.
--
-- APLICAÇÃO (somente pelo dono, nesta ordem; pode ser antes ou depois do deploy):
--
--   1. Ensaio (não grava nada): copie este arquivo, troque o `COMMIT;` do fim por
--        DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;
--      e rode a cópia com `npx supabase db query --linked -f <copia>`. O erro
--      'ENSAIO' prova que guardas, criação, pós-checagem e o ensaio funcional
--      (seção 5: exclui DE VERDADE uma keyword real com Assunto do plano dentro
--      de uma subtransação e DESFAZ) passaram; tudo volta.
--   2. npx supabase db query --linked -f supabase/migrations/20261016130000_excluir_tudo_da_cor.sql
--   3. npx supabase migration repair --status applied 20261016130000 --linked
--   4. Conferência (só leitura; arquivo, porque inline multilinha falha):
--        npx supabase db query --linked -f supabase/scripts/20261016130000-excluir-tudo-da-cor-post-verifier-read-only.sql
--
-- Nunca `supabase db push` (só parte das migrations consta no histórico remoto).
-- Rollback: supabase/rollback/20261016130000_excluir_tudo_da_cor.rollback.sql
--
-- O QUE CRIA (nenhuma tabela, gatilho, policy ou dado muda):
--
--   (1) public.lifecycle_delete_group_keywords(p_brand_id, p_group_id,
--       p_keyword_ids, p_actor_user_id, p_request_id, p_allow_recoverable):
--       a. confere a entrada (1 a 100 ids), o ator (mesma permissão da exclusão
--          comum: minerador:manage; com JWT, o ator tem de ser quem chama), a
--          marca, o grupo (desta marca) e que TODOS os ids são keywords VIVAS
--          deste grupo desta marca (senão recusa o bloco inteiro);
--       b. LIBERA o Assunto das que o carregam, como "Tirar do plano" faria, com
--          o marcador NOVO `keyword_subject_release.via = "excluir_cor"` (o
--          gatilho minerador_keywords_preserva_assunto aceita): tira
--          `keyword_subject.plan` e a marca de principal declarada
--          (`keyword_declared_principal`) e acrescenta uma linha ao
--          `keyword_subject_history` (o que saiu: plano e título);
--       c. chama `lifecycle_delete_minerador_keywords` DE SEMPRE, na MESMA
--          transação. Qualquer recusa dela (publicada sem a declaração,
--          documento no Redator, Assunto ainda protegido, permissão) desfaz
--          TAMBÉM a liberação: nunca sobra Assunto liberado sem exclusão.
--       Não cria poder novo de exclusão: não publicada = DELETE definitivo
--       (como sempre); publicada = lixeira de 24 h, só com a declaração
--       `p_allow_recoverable` (D6); descendente bloqueia; mesma permissão.
--   (2) public.lifecycle_delete_group_keywords_contract(): só leitura; diz que a
--       operação existe (a rota usa para habilitar o botão).
--
-- O QUE NÃO FAZ: não toca no plano do grupo (`editorial_groups.plan`), no
-- histórico do grupo nem no arquivamento da cor — isso é do código da F7, pelos
-- repositórios de sempre, DEPOIS da exclusão e da releitura (D7). Não muda a
-- exclusão comum, a restauração nem a purga. Não dá acesso a `anon`,
-- `authenticated` ou PUBLIC: só `service_role` (a rota chama depois de
-- `requireTenantPermission(minerador:manage)`), como as RPCs vizinhas
-- (lifecycle_preview/restore/purge).
--
-- CONFERIDO POR SELECT (2026-10-14, só leitura):
--   - lifecycle_delete_minerador_keywords(uuid, uuid[], uuid, boolean) existe,
--     SECURITY DEFINER, com a declaração da publicada;
--   - minerador_keywords_trava_identidade_publicada NÃO recusa o UPDATE de
--     `analise_semantica` de publicada (só repõe slug e endereço);
--     trg_protect_published_keyword só recusa campos estruturais (keyword,
--     lista, local, despromoção de status legado): a liberação do Assunto de uma
--     publicada passa, e a publicada vai para a lixeira de 24 h pela RPC de sempre;
--   - editorial_group_events.event_type aceita keywords_unassigned,
--     plan_changed e archived (usados pelo código).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Guardas
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'COR_PRE: lifecycle_delete_minerador_keywords(uuid, uuid[], uuid, boolean) ausente.';
  END IF;
  IF to_regprocedure('public.canonical_actor_can_use_brand_action(uuid, uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'COR_PRE: canonical_actor_can_use_brand_action(uuid, uuid, text, text) ausente.';
  END IF;
  IF to_regprocedure('public.minerador_keywords_preserva_assunto()') IS NULL
     OR to_regprocedure('public.minerador_keywords_recusa_exclusao_com_assunto()') IS NULL THEN
    RAISE EXCEPTION 'COR_PRE: aplique 20261015120000_assunto_nunca_se_perde antes.';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal AND tgenabled = 'O'
      AND tgname IN ('minerador_keywords_preserva_assunto', 'minerador_keywords_recusa_exclusao_com_assunto')) <> 2 THEN
    RAISE EXCEPTION 'COR_PRE: os gatilhos do Assunto não estão ligados.';
  END IF;
  IF to_regclass('public.editorial_groups') IS NULL OR to_regclass('public.minerador_keywords') IS NULL THEN
    RAISE EXCEPTION 'COR_PRE: editorial_groups ou minerador_keywords ausente.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'minerador_keywords' AND column_name = 'group_id') THEN
    RAISE EXCEPTION 'COR_PRE: minerador_keywords.group_id ausente.';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'COR_PRE: auth.uid() ausente.';
  END IF;
  IF to_regprocedure('public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean)') IS NOT NULL
     OR to_regprocedure('public.lifecycle_delete_group_keywords_contract()') IS NOT NULL THEN
    RAISE EXCEPTION 'COR_PRE: as funções já existem (migration aplicada?).';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. A operação
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.lifecycle_delete_group_keywords(
  p_brand_id uuid,
  p_group_id uuid,
  p_keyword_ids uuid[],
  p_actor_user_id uuid,
  p_request_id uuid,
  p_allow_recoverable boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  alvo uuid[];
  total integer;
  liberadas uuid[];
  resultado jsonb;
  agora text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  marcador jsonb;
BEGIN
  alvo := ARRAY(SELECT DISTINCT v FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) AS entrada(v) WHERE v IS NOT NULL ORDER BY v);
  total := coalesce(cardinality(alvo), 0);
  IF p_brand_id IS NULL OR p_group_id IS NULL OR p_actor_user_id IS NULL OR p_request_id IS NULL OR total = 0 OR total > 100 THEN
    RAISE EXCEPTION 'GROUP_DELETE_INVALID';
  END IF;
  -- Com JWT (chamada direta), o ator declarado tem de ser quem chama. A rota usa
  -- o service_role (sem JWT) depois de conferir minerador:manage do ator.
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED';
  END IF;
  IF NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.editorial_groups g WHERE g.id = p_group_id AND g.marca_id = p_brand_id) THEN
    RAISE EXCEPTION 'GROUP_DELETE_OUTSIDE_GROUP';
  END IF;
  -- Só keywords VIVAS desta cor (grupo) desta marca; trava as linhas do bloco.
  PERFORM 1 FROM public.minerador_keywords k WHERE k.brand_id = p_brand_id AND k.id = ANY(alvo) ORDER BY k.id FOR UPDATE;
  IF (SELECT count(*) FROM public.minerador_keywords k
       WHERE k.brand_id = p_brand_id AND k.id = ANY(alvo) AND k.group_id = p_group_id AND k.deleted_at IS NULL) <> total THEN
    RAISE EXCEPTION 'GROUP_DELETE_OUTSIDE_GROUP';
  END IF;

  marcador := jsonb_build_object(
    'requestId', p_request_id::text,
    'reason', 'Excluir tudo da cor',
    'actorId', p_actor_user_id::text,
    'at', agora,
    'via', 'excluir_cor');

  -- 1. Libera o Assunto como "Tirar do plano" faria, com o marcador via "excluir_cor".
  --    A linha do histórico guarda o que saiu (o plano e o título), no formato do
  --    `keyword_subject_history` (lib/minerador/keyword-subject.ts).
  WITH liberacao AS (
    UPDATE public.minerador_keywords k
       SET analise_semantica =
             ((k.analise_semantica #- '{keyword_subject,plan}') - 'keyword_declared_principal')
             || jsonb_build_object('keyword_subject_release', marcador)
             || CASE
                  WHEN jsonb_typeof(k.analise_semantica -> 'keyword_subject') = 'object'
                   AND (k.analise_semantica -> 'keyword_subject' -> 'declared') = 'true'::jsonb
                  THEN jsonb_build_object('keyword_subject_history',
                    CASE WHEN jsonb_typeof(k.analise_semantica -> 'keyword_subject_history') = 'array'
                         THEN k.analise_semantica -> 'keyword_subject_history' ELSE '[]'::jsonb END
                    || jsonb_build_array(
                      jsonb_build_object(
                        'previous', 'declared',
                        'next', 'declared',
                        'note', coalesce(k.analise_semantica -> 'keyword_subject' -> 'note', 'null'::jsonb),
                        'destinationUrl', coalesce(k.analise_semantica -> 'keyword_subject' -> 'destinationUrl', 'null'::jsonb),
                        'actorId', p_actor_user_id::text,
                        'changedAt', agora,
                        'origin', 'review',
                        'release', marcador)
                      || CASE WHEN jsonb_typeof(k.analise_semantica -> 'keyword_subject' -> 'plan') = 'object' THEN jsonb_build_object('plan', jsonb_build_object(
                           'groupId', k.analise_semantica -> 'keyword_subject' -> 'plan' -> 'groupId',
                           'planVersion', k.analise_semantica -> 'keyword_subject' -> 'plan' -> 'planVersion',
                           'order', k.analise_semantica -> 'keyword_subject' -> 'plan' -> 'order',
                           'role', k.analise_semantica -> 'keyword_subject' -> 'plan' -> 'role',
                           'declaredPrincipalKeywordId', coalesce(k.analise_semantica -> 'keyword_subject' -> 'plan' -> 'declaredPrincipal' -> 'keywordId', 'null'::jsonb),
                           'lock', coalesce(k.analise_semantica -> 'keyword_subject' -> 'plan' -> 'lock', 'null'::jsonb),
                           'scope', k.analise_semantica -> 'keyword_subject' -> 'plan' -> 'scope')) ELSE '{}'::jsonb END
                      || CASE WHEN jsonb_typeof(k.analise_semantica -> 'keyword_subject' -> 'entry' -> 'title') = 'string'
                           THEN jsonb_build_object('entryTitle', k.analise_semantica -> 'keyword_subject' -> 'entry' -> 'title') ELSE '{}'::jsonb END
                    ))
                  ELSE '{}'::jsonb
                END
     WHERE k.brand_id = p_brand_id
       AND k.id = ANY(alvo)
       AND jsonb_typeof(k.analise_semantica) = 'object'
       AND (jsonb_typeof(k.analise_semantica #> '{keyword_subject,plan}') = 'object'
         OR jsonb_typeof(k.analise_semantica #> '{keyword_subject,entry}') = 'object'
         OR k.analise_semantica ? 'keyword_declared_principal')
    RETURNING k.id
  )
  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) INTO liberadas FROM liberacao;

  -- 2. A exclusão de sempre. Qualquer recusa (publicada sem declaração,
  --    descendente, Assunto ainda protegido, permissão) desfaz TAMBÉM a
  --    liberação acima: é a mesma transação.
  resultado := public.lifecycle_delete_minerador_keywords(p_brand_id, alvo, p_actor_user_id, coalesce(p_allow_recoverable, false));
  RETURN resultado || jsonb_build_object(
    'releasedSubjectIds', to_jsonb(liberadas),
    'requestId', p_request_id,
    'groupId', p_group_id,
    'via', 'excluir_cor');
END;
$function$;

COMMENT ON FUNCTION public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean) IS
  'Excluir tudo da cor (SDD 2026-10-13 item 6, F7): libera o Assunto com keyword_subject_release.via = excluir_cor e chama lifecycle_delete_minerador_keywords na mesma transação. Até 100 ids, todos keywords vivas do grupo e da marca. Nenhum poder novo: publicada só com p_allow_recoverable (lixeira de 24 h), descendente bloqueia, minerador:manage.';

REVOKE ALL ON FUNCTION public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. O contrato (só leitura): a rota habilita o botão quando isto responde.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.lifecycle_delete_group_keywords_contract()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT jsonb_build_object('operation', 'lifecycle_delete_group_keywords', 'version', 1, 'maxIds', 100, 'via', 'excluir_cor');
$function$;

COMMENT ON FUNCTION public.lifecycle_delete_group_keywords_contract() IS
  'Excluir tudo da cor (F7): só leitura. Responde quando lifecycle_delete_group_keywords existe; a rota usa para habilitar o botão.';

REVOKE ALL ON FUNCTION public.lifecycle_delete_group_keywords_contract() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_delete_group_keywords_contract() TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Pós-checagem estrutural
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  funcao text;
BEGIN
  FOREACH funcao IN ARRAY ARRAY['public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean)', 'public.lifecycle_delete_group_keywords_contract()'] LOOP
    IF to_regprocedure(funcao) IS NULL THEN
      RAISE EXCEPTION 'COR_POS: % ausente.', funcao;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(funcao)) THEN
      RAISE EXCEPTION 'COR_POS: % sem SECURITY DEFINER.', funcao;
    END IF;
    IF has_function_privilege('anon', to_regprocedure(funcao), 'EXECUTE')
       OR has_function_privilege('authenticated', to_regprocedure(funcao), 'EXECUTE') THEN
      RAISE EXCEPTION 'COR_POS: % executável por anon/authenticated.', funcao;
    END IF;
    IF NOT has_function_privilege('service_role', to_regprocedure(funcao), 'EXECUTE') THEN
      RAISE EXCEPTION 'COR_POS: % sem EXECUTE para service_role.', funcao;
    END IF;
  END LOOP;
  -- A exclusão comum continua lá, com a mesma assinatura.
  IF to_regprocedure('public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'COR_POS: a exclusão comum sumiu.';
  END IF;
  -- Os gatilhos de minerador_keywords continuam os mesmos seis.
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal
      AND tgname IN ('minerador_keywords_preserva_assunto', 'minerador_keywords_preserva_series', 'minerador_keywords_recusa_exclusao_com_assunto',
                     'minerador_keywords_trava_identidade_publicada', 'trg_protect_published_keyword', 'trg_tenant_0005_validate_keyword_brand')) <> 6 THEN
    RAISE EXCEPTION 'COR_POS: um gatilho de minerador_keywords sumiu.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Ensaio funcional numa keyword REAL, desfeito no fim (subtransação).
-- Escolhe uma keyword VIVA, NÃO publicada, sem documento no Redator, com
-- Assunto declarado e plano DO PRÓPRIO grupo, e o dono da marca como ator.
-- 5.1 prova que, SEM a liberação, o gatilho recusa a exclusão;
-- 5.2 chama a função e confere que a linha sumiu e que o Assunto foi liberado;
-- 5.3 (se houver) uma PUBLICADA com Assunto do plano: vai para a lixeira de 24 h
--     com a declaração e é recusada sem ela.
-- Cada bloco termina com RAISE '…_OK', que desfaz tudo o que ele gravou. Sem
-- candidata, avisa e segue (a pós-checagem estrutural acima continua valendo).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  alvo record;
  pub record;
  achou boolean;
  original jsonb;
  resposta jsonb;
  lido jsonb;
BEGIN
  SELECT k.id, k.brand_id, k.group_id, m.owner_user_id AS ator INTO alvo
    FROM public.minerador_keywords k
    JOIN public.marcas m ON m.id = k.brand_id
   WHERE k.deleted_at IS NULL
     AND k.group_id IS NOT NULL
     AND m.owner_user_id IS NOT NULL
     AND jsonb_typeof(k.analise_semantica -> 'keyword_subject') = 'object'
     AND k.analise_semantica -> 'keyword_subject' -> 'declared' = 'true'::jsonb
     AND jsonb_typeof(k.analise_semantica -> 'keyword_subject' -> 'plan') = 'object'
     AND k.analise_semantica -> 'keyword_subject' -> 'plan' ->> 'groupId' = k.group_id::text
     AND NOT public.lifecycle_keyword_is_published(k.brand_id, k.id)
     AND public.canonical_actor_can_use_brand_action(k.brand_id, m.owner_user_id, 'minerador', 'manage')
     AND (public.lifecycle_keyword_deletion_impact(k.brand_id, k.id, m.owner_user_id) ->> 'mode') = 'hard'
   ORDER BY k.id
   LIMIT 1;
  achou := FOUND;
  IF NOT achou THEN
    RAISE NOTICE 'COR_ENSAIO: nenhuma keyword viva não publicada com Assunto do plano do próprio grupo; ensaio funcional 5.1/5.2 pulado.';
  ELSE
    SELECT analise_semantica INTO original FROM public.minerador_keywords WHERE id = alvo.id;
    BEGIN
      -- 5.1 sem a liberação, o gatilho do Assunto recusa a exclusão de sempre.
      BEGIN
        PERFORM public.lifecycle_delete_minerador_keywords(alvo.brand_id, ARRAY[alvo.id], alvo.ator, false);
        RAISE EXCEPTION 'COR_POS: a exclusão comum apagou a keyword com Assunto do plano.';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'KEYWORD_DELETE_SUBJECT_PROTECTED:%' THEN RAISE; END IF;
      END;

      -- 5.2 a exclusão da cor libera e exclui na mesma chamada.
      resposta := public.lifecycle_delete_group_keywords(alvo.brand_id, alvo.group_id, ARRAY[alvo.id], alvo.ator, gen_random_uuid(), false);
      IF NOT (resposta -> 'hardDeletedIds') @> to_jsonb(ARRAY[alvo.id::text]) THEN
        RAISE EXCEPTION 'COR_POS: a função não devolveu a keyword em hardDeletedIds: %', resposta;
      END IF;
      IF NOT (resposta -> 'releasedSubjectIds') @> to_jsonb(ARRAY[alvo.id::text]) THEN
        RAISE EXCEPTION 'COR_POS: a função não devolveu o Assunto liberado: %', resposta;
      END IF;
      IF EXISTS (SELECT 1 FROM public.minerador_keywords WHERE id = alvo.id) THEN
        RAISE EXCEPTION 'COR_POS: a keyword do ensaio continua na tabela.';
      END IF;

      -- Fora do grupo: recusa o bloco inteiro.
      BEGIN
        PERFORM public.lifecycle_delete_group_keywords(alvo.brand_id, gen_random_uuid(), ARRAY[alvo.id], alvo.ator, gen_random_uuid(), false);
        RAISE EXCEPTION 'COR_POS: a função aceitou um grupo de outra marca/inexistente.';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'GROUP_DELETE_OUTSIDE_GROUP' THEN RAISE; END IF;
      END;

      RAISE EXCEPTION 'COR_ENSAIO_OK';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'COR_ENSAIO_OK' THEN RAISE; END IF;
    END;
    SELECT analise_semantica INTO lido FROM public.minerador_keywords WHERE id = alvo.id;
    IF lido IS NULL OR lido IS DISTINCT FROM original THEN
      RAISE EXCEPTION 'COR_POS: o ensaio funcional deixou resíduo na keyword %.', alvo.id;
    END IF;
  END IF;

  -- 5.3 publicada com Assunto do plano (opcional).
  SELECT k.id, k.brand_id, k.group_id, m.owner_user_id AS ator INTO pub
    FROM public.minerador_keywords k
    JOIN public.marcas m ON m.id = k.brand_id
   WHERE k.deleted_at IS NULL
     AND k.group_id IS NOT NULL
     AND m.owner_user_id IS NOT NULL
     AND jsonb_typeof(k.analise_semantica -> 'keyword_subject' -> 'plan') = 'object'
     AND public.lifecycle_keyword_is_published(k.brand_id, k.id)
     AND public.canonical_actor_can_use_brand_action(k.brand_id, m.owner_user_id, 'minerador', 'manage')
   ORDER BY k.id
   LIMIT 1;
  achou := FOUND;
  IF NOT achou THEN
    RAISE NOTICE 'COR_ENSAIO: nenhuma publicada com Assunto do plano; ensaio 5.3 pulado.';
  ELSE
    SELECT analise_semantica INTO original FROM public.minerador_keywords WHERE id = pub.id;
    BEGIN
      BEGIN
        PERFORM public.lifecycle_delete_group_keywords(pub.brand_id, pub.group_id, ARRAY[pub.id], pub.ator, gen_random_uuid(), false);
        RAISE EXCEPTION 'COR_POS: a publicada saiu sem a declaração.';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW%' THEN RAISE; END IF;
      END;
      IF (SELECT analise_semantica FROM public.minerador_keywords WHERE id = pub.id) IS DISTINCT FROM original THEN
        RAISE EXCEPTION 'COR_POS: a recusa da publicada deixou o Assunto liberado.';
      END IF;
      resposta := public.lifecycle_delete_group_keywords(pub.brand_id, pub.group_id, ARRAY[pub.id], pub.ator, gen_random_uuid(), true);
      IF NOT (resposta -> 'recoverableIds') @> to_jsonb(ARRAY[pub.id::text]) THEN
        RAISE EXCEPTION 'COR_POS: a publicada não foi para a lixeira de 24 h: %', resposta;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.minerador_keywords WHERE id = pub.id AND deleted_at IS NOT NULL AND purge_after IS NOT NULL) THEN
        RAISE EXCEPTION 'COR_POS: a publicada não ficou na lixeira.';
      END IF;
      RAISE EXCEPTION 'COR_ENSAIO_PUBLICADA_OK';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'COR_ENSAIO_PUBLICADA_OK' THEN RAISE; END IF;
    END;
    IF (SELECT analise_semantica FROM public.minerador_keywords WHERE id = pub.id AND deleted_at IS NULL) IS DISTINCT FROM original THEN
      RAISE EXCEPTION 'COR_POS: o ensaio da publicada deixou resíduo na keyword %.', pub.id;
    END IF;
  END IF;
END $$;

COMMIT;
