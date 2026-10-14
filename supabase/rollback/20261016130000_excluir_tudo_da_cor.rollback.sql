-- =============================================================================
-- ROLLBACK de 20261016130000_excluir_tudo_da_cor.sql (M-E)
-- SDD: docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md, §11.2 e §18.7
--
-- Só pelo dono. A ORDEM NÃO IMPORTA: sem as funções, a rota da F7 responde
-- 409 GROUP_DELETE_NOT_AVAILABLE e a tela mostra o botão "Excluir tudo da cor"
-- desabilitado com a explicação (a prévia continua). A exclusão comum
-- (lifecycle_delete_minerador_keywords), a restauração e a purga não mudam.
--
-- NADA VOLTA: exclusão definitiva não tem rollback. O que a operação já
-- excluiu continua excluído; o que foi para a lixeira de 24 h continua
-- restaurável pelo caminho de sempre; o histórico do grupo fica.
--
-- ENSAIO (não apaga nada): copie, troque o `COMMIT;` do fim por
--   DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;
-- e rode a cópia com `npx supabase db query --linked -f <copia>`.
--
-- APLICAR:
--   npx supabase db query --linked -f supabase/rollback/20261016130000_excluir_tudo_da_cor.rollback.sql
--   npx supabase migration repair --status reverted 20261016130000 --linked
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.lifecycle_delete_group_keywords_contract();

DO $$
BEGIN
  IF to_regprocedure('public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean)') IS NOT NULL
     OR to_regprocedure('public.lifecycle_delete_group_keywords_contract()') IS NOT NULL THEN
    RAISE EXCEPTION 'COR_ROLLBACK: uma função ainda existe.';
  END IF;
  -- A exclusão comum continua de pé.
  IF to_regprocedure('public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'COR_ROLLBACK: a exclusão comum sumiu.';
  END IF;
END $$;

COMMIT;
