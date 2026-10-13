-- =============================================================================
-- ROLLBACK de 20261014120000_recibos_da_pesquisa_por_assunto.sql (M-A)
-- SDD: docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md, §6.2
--
-- Só pelo dono. ORDEM: o CÓDIGO volta antes (deploy sem leitor/escritor da
-- tabela) — mas o código da F3 também tolera a ausência da tabela (pesquisa sem
-- recibo, import sem volume), então a ordem inversa não quebra a tela.
--
-- As medições já gravadas em minerador_keywords continuam válidas (formato de
-- sempre do Google Ads); o `receiptRef` delas fica sem destino (a tela diz
-- "recibo indisponível"). Nenhuma keyword é apagada nem alterada aqui.
--
-- ANTES, salve o retrato dos recibos (só leitura):
--   npx supabase db query --linked --output-format json "SELECT * FROM public.minerador_subject_search_receipts"
--
-- ENSAIO (não apaga nada): copie, troque o `COMMIT;` do fim por
--   DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;
-- e rode a cópia com `npx supabase db query --linked -f <copia>`.
--
-- APLICAR:
--   npx supabase db query --linked -f supabase/rollback/20261014120000_recibos_da_pesquisa_por_assunto.rollback.sql
--   npx supabase migration repair --status reverted 20261014120000 --linked
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.minerador_subject_search_receipts') IS NULL THEN
    RAISE NOTICE 'RECIBOS_ROLLBACK: a tabela não existe (migration não aplicada); nada a desfazer.';
  END IF;
END $$;

-- O gatilho sai junto com a tabela (DROP TABLE derruba os gatilhos dela).
DROP TABLE IF EXISTS public.minerador_subject_search_receipts;
DROP FUNCTION IF EXISTS public.minerador_subject_search_receipts_append_only();

DO $$
BEGIN
  IF to_regclass('public.minerador_subject_search_receipts') IS NOT NULL THEN
    RAISE EXCEPTION 'RECIBOS_ROLLBACK_POS: a tabela ainda existe.';
  END IF;
  IF to_regprocedure('public.minerador_subject_search_receipts_append_only()') IS NOT NULL THEN
    RAISE EXCEPTION 'RECIBOS_ROLLBACK_POS: a função append-only ainda existe.';
  END IF;
END $$;

COMMIT;
