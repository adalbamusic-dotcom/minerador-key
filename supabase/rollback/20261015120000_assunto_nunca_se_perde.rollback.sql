-- =============================================================================
-- ROLLBACK de 20261015120000_assunto_nunca_se_perde.sql
-- SDD: docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md, §11.3
--
-- Só pelo dono. Tira os dois gatilhos e as duas funções. Nenhum dado é
-- alterado: as linhas `preservedBy: "database"` que o gatilho acrescentou ao
-- `keyword_subject_history` ficam (histórico é append-only); o marcador
-- `keyword_subject_release` gravado por "Tirar do plano" fica (o código o lê).
--
-- ORDEM: o código desta entrega continua funcionando sem os gatilhos (a guarda
-- no código e o marcador de "Tirar do plano" não dependem deles). Sem os
-- gatilhos, só a cópia velha da tela, script ou SQL volta a poder apagar o
-- Assunto — exatamente o que eles fecham.
--
-- ENSAIO (não apaga nada): copie, troque o `COMMIT;` do fim por
--   DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;
-- e rode a cópia com `npx supabase db query --linked -f <copia>`.
--
-- APLICAR:
--   npx supabase db query --linked -f supabase/rollback/20261015120000_assunto_nunca_se_perde.rollback.sql
--   npx supabase migration repair --status reverted 20261015120000 --linked
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS minerador_keywords_preserva_assunto ON public.minerador_keywords;
DROP TRIGGER IF EXISTS minerador_keywords_recusa_exclusao_com_assunto ON public.minerador_keywords;
DROP FUNCTION IF EXISTS public.minerador_keywords_preserva_assunto();
DROP FUNCTION IF EXISTS public.minerador_keywords_recusa_exclusao_com_assunto();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal
             AND tgname IN ('minerador_keywords_preserva_assunto', 'minerador_keywords_recusa_exclusao_com_assunto')) THEN
    RAISE EXCEPTION 'ASSUNTO_ROLLBACK_POS: um gatilho ainda existe.';
  END IF;
  IF to_regprocedure('public.minerador_keywords_preserva_assunto()') IS NOT NULL
     OR to_regprocedure('public.minerador_keywords_recusa_exclusao_com_assunto()') IS NOT NULL THEN
    RAISE EXCEPTION 'ASSUNTO_ROLLBACK_POS: uma função ainda existe.';
  END IF;
  -- Os gatilhos de antes continuam lá.
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.minerador_keywords'::regclass AND NOT tgisinternal
      AND tgname IN ('minerador_keywords_preserva_series', 'minerador_keywords_trava_identidade_publicada',
                     'trg_protect_published_keyword', 'trg_tenant_0005_validate_keyword_brand')) <> 4 THEN
    RAISE EXCEPTION 'ASSUNTO_ROLLBACK_POS: um gatilho anterior sumiu.';
  END IF;
END $$;

COMMIT;
