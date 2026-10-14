-- =============================================================================
-- ROLLBACK de 20261016120000_listas_leves.sql (M-L)
-- SDD: docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md, §11.1 e §18.6
--
-- Só pelo dono. A ORDEM NÃO IMPORTA: o código da F6 cai sozinho para a leitura
-- de antes quando a view some (42P01 / PGRST205) — o Processador volta para
-- `minerador_keywords_listagem`, o Arquiteto volta a projetar o parecer no Node.
-- Nenhuma tabela, gatilho ou dado é tocado: só as três views e as funções puras
-- que elas usam saem.
--
-- ENSAIO (não apaga nada): copie, troque o `COMMIT;` do fim por
--   DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;
-- e rode a cópia com `npx supabase db query --linked -f <copia>`.
--
-- APLICAR:
--   npx supabase db query --linked -f supabase/rollback/20261016120000_listas_leves.rollback.sql
--   npx supabase migration repair --status reverted 20261016120000 --linked
-- =============================================================================

BEGIN;

DROP VIEW IF EXISTS public.editorial_article_dna_lista_leve;
DROP VIEW IF EXISTS public.arquiteto_formation_serp_lista_leve;
DROP VIEW IF EXISTS public.minerador_keywords_lista_leve;
DROP FUNCTION IF EXISTS public.arquiteto_serp_parecer_leve(jsonb);
DROP FUNCTION IF EXISTS public.arquiteto_serp_dna_ref_leve(jsonb);
DROP FUNCTION IF EXISTS public.arquiteto_serp_consulta_leve(jsonb);
DROP FUNCTION IF EXISTS public.arquiteto_serp_organico_leve(jsonb);
DROP FUNCTION IF EXISTS public.minerador_keyword_analise_leve(jsonb);
DROP FUNCTION IF EXISTS public.minerador_jsonb_por_formato(jsonb, jsonb);

DO $$
BEGIN
  IF to_regclass('public.minerador_keywords_lista_leve') IS NOT NULL
     OR to_regclass('public.arquiteto_formation_serp_lista_leve') IS NOT NULL
     OR to_regclass('public.editorial_article_dna_lista_leve') IS NOT NULL
     OR to_regprocedure('public.minerador_jsonb_por_formato(jsonb, jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'LEVE_ROLLBACK: objetos ainda presentes.';
  END IF;
  -- As leituras de antes continuam de pé.
  IF to_regclass('public.minerador_keywords_listagem') IS NULL THEN
    RAISE EXCEPTION 'LEVE_ROLLBACK: minerador_keywords_listagem ausente (não deveria ter sido tocada).';
  END IF;
END $$;

COMMIT;
