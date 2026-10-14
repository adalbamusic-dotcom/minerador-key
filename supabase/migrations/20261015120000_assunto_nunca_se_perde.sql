-- =============================================================================
-- O ASSUNTO NUNCA SE PERDE — gatilhos de minerador_keywords
-- Ordem do dono (2026-10-13), literal: "não podem perder o assunto de jeito nenhum".
-- SDD: docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md,
--      adendo §11.3 "O Assunto nunca se perde" (dono do módulo: Minerador).
--
-- CASO REAL: as 7 keywords do Silo azul da WifiConecta (grupo
-- 07fec332-4b0a-43cb-af19-cedfd9b24897) perderam `analise_semantica.keyword_subject`
-- pelo antigo "Vínculo das selecionadas → Assunto: Não" (6 pelo lote, 1 pela
-- Revisão Humana). O código daquela porta já saiu; este arquivo põe a garantia
-- no BANCO, abaixo de qualquer escritor (tela, servidor, MCP, script).
--
-- ESTADO: NÃO APLICADA. O código funciona sem ela (a guarda do código recusa a
-- retirada sem liberação e "Tirar do plano" já grava o marcador); ela só fecha
-- a porta para escritas que a guarda do código não vê (cópia velha da tela,
-- script, SQL).
--
-- APLICAÇÃO (somente pelo dono, nesta ordem; pode ser antes ou depois do deploy):
--
--   1. Ensaio (não grava nada): copie este arquivo, troque o `COMMIT;` do fim
--      por
--        DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;
--      e rode a cópia com `npx supabase db query --linked -f <copia>`. O erro
--      'ENSAIO' prova que guardas, criação e pós-checagem (inclusive o ensaio
--      funcional da seção 5, que mexe numa keyword real e DESFAZ) passaram;
--      tudo é desfeito (a transação inteira volta).
--   2. npx supabase db query --linked -f supabase/migrations/20261015120000_assunto_nunca_se_perde.sql
--   3. npx supabase migration repair --status applied 20261015120000 --linked
--   4. Conferência (só leitura; arquivo, porque inline multilinha falha):
--        SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--         WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal ORDER BY tgname;
--
-- Nunca `supabase db push` (só parte das migrations consta no histórico remoto).
-- Rollback: supabase/rollback/20261015120000_assunto_nunca_se_perde.rollback.sql
--
-- O QUE FAZ
--   (a) minerador_keywords_preserva_assunto — BEFORE UPDATE, quando
--       analise_semantica muda. Se o OLD tem `keyword_subject` declarado
--       (declared = true, com ou sem plan/entry) e o NEW o remove, anula,
--       desdeclara ou perde o `plan`/`entry` que tinha, SEM trazer na MESMA
--       escrita um marcador de liberação NOVO
--         analise_semantica.keyword_subject_release =
--           { requestId, reason, actorId, at, via: "tirar_do_plano" | "conversao" | "excluir_cor" }
--       ("excluir_cor" fica RESERVADO para a operação futura "Excluir tudo da
--       cor X", de outra SDD: hoje nenhum código o grava. Ela libera o Assunto
--       numa escrita com o marcador e só então exclui, na MESMA operação
--       confirmada — ver (b).)
--       (diferente do gravado no OLD), o gatilho REPÕE o `keyword_subject`
--       antigo (e ator/data/origem dele) no NEW e acrescenta ao
--       `keyword_subject_history` uma linha `preservedBy: "database"` com o que
--       a escrita tentou gravar. Nunca derruba a escrita das outras colunas nem
--       das outras chaves do jsonb.
--       Também mantém o `keyword_subject_history` append-only: linha gravada que
--       a escrita omitir (cópia velha) volta, com as novas depois.
--   (b) minerador_keywords_recusa_exclusao_com_assunto — BEFORE DELETE e
--       BEFORE UPDATE OF deleted_at (a ida para a lixeira recuperável). Recusa
--       (RAISE 'KEYWORD_DELETE_SUBJECT_PROTECTED: …') apagar a keyword que
--       carrega Assunto declarado COM plano, ou com título cadastrado (`entry`)
--       ainda não liberado por "Tirar do plano" (ou, no futuro, "excluir_cor").
--       A rota de exclusão já mapeia o código para a mensagem da tela.
--       Encaixe da exclusão futura por cor (outra SDD; NÃO feita aqui): dentro
--       da mesma operação confirmada (uma transação/RPC), primeiro um UPDATE
--       que tira o `plan` com o marcador `via: "excluir_cor"` (o gatilho (a)
--       aceita; o histórico guarda o que saiu), depois o DELETE (este gatilho
--       vê o plano fora e o marcador "excluir_cor" e deixa passar). Os
--       contratos globais de exclusão (publicada só pela janela de 24 h,
--       descendentes, nome digitado) continuam nas funções de ciclo de vida.
--
-- O QUE NÃO FAZ
--   Não muda nenhum dado existente (as 7 keywords do azul continuam sem
--   Assunto: a restauração é pelo card "Cadastrar Assuntos → Silo existente",
--   com as linhas recuperadas do histórico). Não mexe em
--   `keyword_declared_principal` (a marca de principal), nem no `plan.lock`
--   (a trava grava `plan` inteiro, que continua objeto: passa). Não muda RLS,
--   grants de tabela nem os gatilhos existentes. A purga de tenant de teste
--   (que desliga os gatilhos de usuário) não é afetada.
--
-- ORDEM DOS GATILHOS (BEFORE, mesmo evento, ordem alfabética):
--   minerador_keywords_preserva_assunto        (novo)
--   minerador_keywords_preserva_series
--   minerador_keywords_recusa_exclusao_com_assunto (novo; DELETE / UPDATE OF deleted_at)
--   minerador_keywords_trava_identidade_publicada
--   trg_protect_published_keyword
--   trg_tenant_0005_validate_keyword_brand
--   (zz_minerador_keywords_row_version, quando 20260923140000 for aplicada, segue por último)
--   Conferido por SELECT em 2026-10-13: só os 4 gatilhos acima existem hoje.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Guardas
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.minerador_keywords') IS NULL THEN
    RAISE EXCEPTION 'ASSUNTO_PRE: public.minerador_keywords ausente.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'minerador_keywords'
                 AND column_name = 'analise_semantica' AND data_type = 'jsonb') THEN
    RAISE EXCEPTION 'ASSUNTO_PRE: minerador_keywords.analise_semantica não é jsonb.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'minerador_keywords'
                 AND column_name = 'deleted_at') THEN
    RAISE EXCEPTION 'ASSUNTO_PRE: minerador_keywords.deleted_at ausente.';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'ASSUNTO_PRE: auth.uid() ausente.';
  END IF;
  IF to_regprocedure('public.minerador_keywords_preserva_assunto()') IS NOT NULL
     OR to_regprocedure('public.minerador_keywords_recusa_exclusao_com_assunto()') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSUNTO_PRE: as funções já existem (migration aplicada?).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal
             AND tgname IN ('minerador_keywords_preserva_assunto', 'minerador_keywords_recusa_exclusao_com_assunto')) THEN
    RAISE EXCEPTION 'ASSUNTO_PRE: os gatilhos já existem (migration aplicada?).';
  END IF;
  -- Nenhuma keyword na lixeira carrega Assunto com plano: a purga agendada
  -- nunca vai esbarrar na recusa (conferido por SELECT em 2026-10-13: 0).
  IF EXISTS (SELECT 1 FROM public.minerador_keywords
             WHERE deleted_at IS NOT NULL
               AND jsonb_typeof(analise_semantica -> 'keyword_subject') = 'object'
               AND analise_semantica -> 'keyword_subject' -> 'declared' = 'true'::jsonb
               AND jsonb_typeof(analise_semantica -> 'keyword_subject' -> 'plan') = 'object') THEN
    RAISE EXCEPTION 'ASSUNTO_PRE: há keyword na lixeira com Assunto do plano; a purga seria recusada. Resolva antes.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. (a) Preservar o Assunto
-- SECURITY DEFINER e search_path fixo: a regra dos gatilhos vizinhos
-- (20260921090000; tests/minerador-gatilhos-security-definer.test.mts). Só
-- transforma NEW; a RLS do UPDATE continua sendo a de quem escreve.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minerador_keywords_preserva_assunto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  antes jsonb := OLD.analise_semantica;
  tentado jsonb := NEW.analise_semantica;
  resultado jsonb;
  mudou boolean := false;
  assunto_antes jsonb;
  assunto_depois jsonb;
  liberacao jsonb;
  perdeu boolean;
  liberado boolean;
  hist_antes jsonb;
  hist_depois jsonb;
  hist jsonb;
  plano jsonb;
  chave text;
  agora text := to_char(current_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF jsonb_typeof(antes) IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;
  resultado := CASE WHEN jsonb_typeof(tentado) = 'object' THEN tentado ELSE '{}'::jsonb END;

  -- 1. O histórico do Assunto é append-only (é a fonte da recuperação).
  hist_antes := CASE WHEN jsonb_typeof(antes -> 'keyword_subject_history') = 'array'
    THEN antes -> 'keyword_subject_history' ELSE '[]'::jsonb END;
  IF jsonb_array_length(hist_antes) > 0 THEN
    hist_depois := CASE WHEN jsonb_typeof(resultado -> 'keyword_subject_history') = 'array'
      THEN resultado -> 'keyword_subject_history' ELSE '[]'::jsonb END;
    IF NOT (hist_depois @> hist_antes) THEN
      SELECT hist_antes || coalesce(jsonb_agg(elemento ORDER BY ordem), '[]'::jsonb)
        INTO hist
        FROM jsonb_array_elements(hist_depois) WITH ORDINALITY AS linha(elemento, ordem)
       WHERE NOT (hist_antes @> jsonb_build_array(elemento));
      resultado := jsonb_set(resultado, ARRAY['keyword_subject_history'], hist, true);
      mudou := true;
    END IF;
  END IF;

  -- 2. O Assunto declarado não sai sem liberação nova na mesma escrita.
  assunto_antes := antes -> 'keyword_subject';
  IF jsonb_typeof(assunto_antes) = 'object' AND (assunto_antes -> 'declared') = 'true'::jsonb THEN
    assunto_depois := resultado -> 'keyword_subject';
    perdeu := jsonb_typeof(assunto_depois) IS DISTINCT FROM 'object'
      OR (assunto_depois -> 'declared') IS DISTINCT FROM 'true'::jsonb
      OR (jsonb_typeof(assunto_antes -> 'plan') = 'object' AND jsonb_typeof(assunto_depois -> 'plan') IS DISTINCT FROM 'object')
      OR (jsonb_typeof(assunto_antes -> 'entry') = 'object' AND jsonb_typeof(assunto_depois -> 'entry') IS DISTINCT FROM 'object');
    IF perdeu THEN
      liberacao := resultado -> 'keyword_subject_release';
      liberado := jsonb_typeof(liberacao) = 'object'
        AND liberacao IS DISTINCT FROM (antes -> 'keyword_subject_release')
        AND (liberacao ->> 'via') IN ('tirar_do_plano', 'conversao', 'excluir_cor')
        AND coalesce(btrim(liberacao ->> 'requestId'), '') <> ''
        AND coalesce(btrim(liberacao ->> 'reason'), '') <> ''
        AND coalesce(btrim(liberacao ->> 'actorId'), '') <> ''
        AND coalesce(btrim(liberacao ->> 'at'), '') <> '';
      IF NOT liberado THEN
        resultado := jsonb_set(resultado, ARRAY['keyword_subject'], assunto_antes, true);
        FOREACH chave IN ARRAY ARRAY['keyword_subject_actor', 'keyword_subject_at', 'keyword_subject_origin'] LOOP
          IF antes ? chave THEN
            resultado := jsonb_set(resultado, ARRAY[chave], antes -> chave, true);
          ELSE
            resultado := resultado - chave;
          END IF;
        END LOOP;
        plano := CASE WHEN jsonb_typeof(assunto_antes -> 'plan') = 'object' THEN jsonb_build_object(
          'groupId', assunto_antes -> 'plan' -> 'groupId',
          'planVersion', assunto_antes -> 'plan' -> 'planVersion',
          'order', assunto_antes -> 'plan' -> 'order',
          'role', assunto_antes -> 'plan' -> 'role',
          'declaredPrincipalKeywordId', assunto_antes -> 'plan' -> 'declaredPrincipal' -> 'keywordId',
          'lock', coalesce(assunto_antes -> 'plan' -> 'lock', 'null'::jsonb),
          'scope', assunto_antes -> 'plan' -> 'scope') ELSE NULL END;
        hist := CASE WHEN jsonb_typeof(resultado -> 'keyword_subject_history') = 'array'
          THEN resultado -> 'keyword_subject_history' ELSE '[]'::jsonb END;
        hist := hist || jsonb_build_array(
          jsonb_build_object(
            'previous', 'declared',
            'next', 'declared',
            'note', coalesce(assunto_antes -> 'note', 'null'::jsonb),
            'destinationUrl', coalesce(assunto_antes -> 'destinationUrl', 'null'::jsonb),
            'actorId', coalesce(to_jsonb(auth.uid()::text), CASE WHEN jsonb_typeof(tentado) = 'object' THEN tentado -> 'keyword_subject_actor' END, 'null'::jsonb),
            'changedAt', agora,
            'origin', coalesce(antes -> 'keyword_subject_origin', 'null'::jsonb),
            'preservedBy', 'database',
            'attempted', jsonb_build_object(
              'keywordSubject', coalesce(assunto_depois, 'null'::jsonb),
              'origin', coalesce(CASE WHEN jsonb_typeof(tentado) = 'object' THEN tentado -> 'keyword_subject_origin' END, 'null'::jsonb),
              'actorId', coalesce(CASE WHEN jsonb_typeof(tentado) = 'object' THEN tentado -> 'keyword_subject_actor' END, 'null'::jsonb),
              'at', coalesce(CASE WHEN jsonb_typeof(tentado) = 'object' THEN tentado -> 'keyword_subject_at' END, 'null'::jsonb))
          )
          || CASE WHEN plano IS NOT NULL THEN jsonb_build_object('plan', plano) ELSE '{}'::jsonb END
          || CASE WHEN jsonb_typeof(assunto_antes -> 'entry' -> 'title') = 'string'
               THEN jsonb_build_object('entryTitle', assunto_antes -> 'entry' -> 'title') ELSE '{}'::jsonb END
        );
        resultado := jsonb_set(resultado, ARRAY['keyword_subject_history'], hist, true);
        mudou := true;
      END IF;
    END IF;
  END IF;

  IF mudou THEN
    NEW.analise_semantica := resultado;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.minerador_keywords_preserva_assunto() IS
  'O Assunto nunca se perde (ordem do dono, 2026-10-13): repõe keyword_subject declarado que uma escrita remove/anula/desdeclara ou cujo plan/entry perde sem marcador keyword_subject_release novo (via tirar_do_plano|conversao|excluir_cor), registra a tentativa no keyword_subject_history (preservedBy=database) e mantém o histórico append-only. Nunca derruba a escrita.';

REVOKE ALL ON FUNCTION public.minerador_keywords_preserva_assunto() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER minerador_keywords_preserva_assunto
  BEFORE UPDATE ON public.minerador_keywords
  FOR EACH ROW
  WHEN (OLD.analise_semantica IS DISTINCT FROM NEW.analise_semantica)
  EXECUTE FUNCTION public.minerador_keywords_preserva_assunto();

-- -----------------------------------------------------------------------------
-- 3. (b) Recusar a exclusão da keyword que carrega Assunto do plano
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minerador_keywords_recusa_exclusao_com_assunto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  assunto jsonb := OLD.analise_semantica -> 'keyword_subject';
  protegido boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  protegido := jsonb_typeof(assunto) = 'object'
    AND (assunto -> 'declared') = 'true'::jsonb
    AND (
      jsonb_typeof(assunto -> 'plan') = 'object'
      OR (jsonb_typeof(assunto -> 'entry') = 'object'
          AND coalesce(OLD.analise_semantica -> 'keyword_subject_release' ->> 'via', '') NOT IN ('tirar_do_plano', 'excluir_cor'))
    );
  IF protegido THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_SUBJECT_PROTECTED: a keyword "%" carrega o Assunto "%" do plano do Silo. Tire-a do plano antes ("Tirar do plano" no card Cadastrar Assuntos).',
      OLD.keyword, coalesce(assunto -> 'entry' ->> 'title', OLD.keyword);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.minerador_keywords_recusa_exclusao_com_assunto() IS
  'O Assunto nunca se perde (2026-10-13): recusa DELETE e a ida para a lixeira (deleted_at) de keyword com Assunto declarado com plano, ou com título cadastrado não liberado por Tirar do plano. Código KEYWORD_DELETE_SUBJECT_PROTECTED.';

REVOKE ALL ON FUNCTION public.minerador_keywords_recusa_exclusao_com_assunto() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER minerador_keywords_recusa_exclusao_com_assunto
  BEFORE DELETE OR UPDATE OF deleted_at ON public.minerador_keywords
  FOR EACH ROW
  EXECUTE FUNCTION public.minerador_keywords_recusa_exclusao_com_assunto();

-- -----------------------------------------------------------------------------
-- 4. Pós-checagem estrutural
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal
                 AND tgname = 'minerador_keywords_preserva_assunto' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'ASSUNTO_POS: gatilho de preservação ausente ou desligado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal
                 AND tgname = 'minerador_keywords_recusa_exclusao_com_assunto' AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'ASSUNTO_POS: gatilho de exclusão ausente ou desligado.';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.minerador_keywords_preserva_assunto()'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.minerador_keywords_recusa_exclusao_com_assunto()'::regprocedure) THEN
    RAISE EXCEPTION 'ASSUNTO_POS: função sem SECURITY DEFINER.';
  END IF;
  -- Os gatilhos de antes continuam lá.
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal
      AND tgname IN ('minerador_keywords_preserva_series', 'minerador_keywords_trava_identidade_publicada',
                     'trg_protect_published_keyword', 'trg_tenant_0005_validate_keyword_brand')) <> 4 THEN
    RAISE EXCEPTION 'ASSUNTO_POS: um gatilho anterior sumiu.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Ensaio funcional numa keyword REAL, desfeito no fim (subtransação).
-- Escolhe uma keyword viva com Assunto declarado e plano. Sem nenhuma, avisa e
-- segue (a pós-checagem estrutural acima continua valendo). O bloco interno
-- termina com RAISE 'ASSUNTO_ENSAIO_OK', que desfaz tudo o que ele gravou.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  alvo uuid;
  original jsonb;
  lido jsonb;
  tamanho integer;
BEGIN
  SELECT id, analise_semantica INTO alvo, original
    FROM public.minerador_keywords
   WHERE deleted_at IS NULL
     AND jsonb_typeof(analise_semantica -> 'keyword_subject') = 'object'
     AND analise_semantica -> 'keyword_subject' -> 'declared' = 'true'::jsonb
     AND jsonb_typeof(analise_semantica -> 'keyword_subject' -> 'plan') = 'object'
   ORDER BY id
   LIMIT 1;
  IF alvo IS NULL THEN
    RAISE NOTICE 'ASSUNTO_ENSAIO: nenhuma keyword viva com Assunto e plano; ensaio funcional pulado.';
    RETURN;
  END IF;
  tamanho := CASE WHEN jsonb_typeof(original -> 'keyword_subject_history') = 'array'
    THEN jsonb_array_length(original -> 'keyword_subject_history') ELSE 0 END;

  BEGIN
    -- 5.1 sem marcador: anular o Assunto não pega; a linha do banco aparece.
    UPDATE public.minerador_keywords SET analise_semantica = jsonb_set(analise_semantica, '{keyword_subject}', 'null'::jsonb) WHERE id = alvo;
    SELECT analise_semantica INTO lido FROM public.minerador_keywords WHERE id = alvo;
    IF lido -> 'keyword_subject' IS DISTINCT FROM original -> 'keyword_subject' THEN
      RAISE EXCEPTION 'ASSUNTO_POS: o Assunto anulado sem marcador não foi reposto.';
    END IF;
    IF jsonb_array_length(lido -> 'keyword_subject_history') <> tamanho + 1
       OR (lido -> 'keyword_subject_history' -> -1 ->> 'preservedBy') IS DISTINCT FROM 'database' THEN
      RAISE EXCEPTION 'ASSUNTO_POS: a preservação não registrou a linha do banco no histórico.';
    END IF;

    -- 5.2 cópia sem o plano: o plano volta.
    UPDATE public.minerador_keywords SET analise_semantica = analise_semantica #- '{keyword_subject,plan}' WHERE id = alvo;
    SELECT analise_semantica INTO lido FROM public.minerador_keywords WHERE id = alvo;
    IF jsonb_typeof(lido -> 'keyword_subject' -> 'plan') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'ASSUNTO_POS: o plano retirado sem marcador não foi reposto.';
    END IF;

    -- 5.3 histórico truncado (cópia velha): as linhas gravadas voltam.
    UPDATE public.minerador_keywords SET analise_semantica = jsonb_set(analise_semantica, '{keyword_subject_history}', '[]'::jsonb) WHERE id = alvo;
    SELECT analise_semantica INTO lido FROM public.minerador_keywords WHERE id = alvo;
    IF jsonb_array_length(lido -> 'keyword_subject_history') < tamanho + 1 THEN
      RAISE EXCEPTION 'ASSUNTO_POS: o histórico truncado não foi reposto.';
    END IF;

    -- 5.4 a trava (plan.lock) passa: o plano continua objeto.
    UPDATE public.minerador_keywords SET analise_semantica = jsonb_set(analise_semantica, '{keyword_subject,plan,lock}', '"locked"'::jsonb) WHERE id = alvo;
    SELECT analise_semantica INTO lido FROM public.minerador_keywords WHERE id = alvo;
    IF (lido -> 'keyword_subject' -> 'plan' ->> 'lock') IS DISTINCT FROM 'locked' THEN
      RAISE EXCEPTION 'ASSUNTO_POS: a trava do plano foi bloqueada.';
    END IF;

    -- 5.5 exclusão recusada.
    BEGIN
      DELETE FROM public.minerador_keywords WHERE id = alvo;
      RAISE EXCEPTION 'ASSUNTO_POS: a exclusão da keyword com Assunto do plano passou.';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'KEYWORD_DELETE_SUBJECT_PROTECTED:%' THEN RAISE; END IF;
    END;

    -- 5.6 com marcador novo ("Tirar do plano"): o plano sai.
    UPDATE public.minerador_keywords
       SET analise_semantica = (analise_semantica #- '{keyword_subject,plan}')
         || jsonb_build_object('keyword_subject_release', jsonb_build_object(
              'requestId', 'ensaio-' || gen_random_uuid()::text, 'reason', 'ensaio da migration',
              'actorId', '00000000-0000-0000-0000-000000000000', 'at', '2026-10-15T12:00:00.000Z', 'via', 'tirar_do_plano'))
     WHERE id = alvo;
    SELECT analise_semantica INTO lido FROM public.minerador_keywords WHERE id = alvo;
    IF jsonb_typeof(lido -> 'keyword_subject' -> 'plan') = 'object' THEN
      RAISE EXCEPTION 'ASSUNTO_POS: o plano não saiu com o marcador de liberação novo.';
    END IF;

    -- 5.7 o MESMO marcador de novo não libera (a entrada/título fica).
    IF jsonb_typeof(lido -> 'keyword_subject' -> 'entry') = 'object' THEN
      UPDATE public.minerador_keywords SET analise_semantica = analise_semantica #- '{keyword_subject,entry}' WHERE id = alvo;
      SELECT analise_semantica INTO lido FROM public.minerador_keywords WHERE id = alvo;
      IF jsonb_typeof(lido -> 'keyword_subject' -> 'entry') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'ASSUNTO_POS: o marcador repetido liberou a retirada do título.';
      END IF;
    END IF;

    RAISE EXCEPTION 'ASSUNTO_ENSAIO_OK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ASSUNTO_ENSAIO_OK' THEN RAISE; END IF;
  END;

  -- Desfeito: a keyword do ensaio está como estava.
  SELECT analise_semantica INTO lido FROM public.minerador_keywords WHERE id = alvo;
  IF lido IS DISTINCT FROM original THEN
    RAISE EXCEPTION 'ASSUNTO_POS: o ensaio funcional deixou resíduo na keyword %.', alvo;
  END IF;
END $$;

COMMIT;
