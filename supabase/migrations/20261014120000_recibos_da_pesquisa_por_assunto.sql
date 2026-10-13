-- =============================================================================
-- RECIBOS DA PESQUISA POR ASSUNTO — M-A
-- SDD: docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md, §6
-- (aprovada pelo dono em 2026-10-13; itens 7 e 8, dono do módulo: Minerador).
-- ADR: docs/00-produto/decisoes/ADR-020-kgr-slug-e-formacao-de-artigos.md
-- (adendo 2026-10-13 — Volume da Pesquisa por Assunto).
--
-- ESTADO: NÃO APLICADA. O código da F3 funciona sem ela: sem a tabela, a
-- pesquisa responde sem recibo (aviso na tela) e o import chega sem volume,
-- como antes — o Volume é medido pelo botão "Volume" do Processador.
--
-- APLICAÇÃO (somente pelo dono, nesta ordem, ANTES do deploy da F3):
--
--   1. Ensaio (não grava nada): copie este arquivo, troque o `COMMIT;` do fim
--      por
--        DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;
--      e rode a cópia com `npx supabase db query --linked -f <copia>`. O erro
--      'ENSAIO' prova que guardas, criação e pós-checagem passaram; tudo é
--      desfeito (a transação inteira volta).
--   2. npx supabase db query --linked -f supabase/migrations/20261014120000_recibos_da_pesquisa_por_assunto.sql
--   3. npx supabase migration repair --status applied 20261014120000 --linked
--   4. Conferência (só leitura):
--        npx supabase db query --linked "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.minerador_subject_search_receipts'::regclass"
--        npx supabase db query --linked "SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'minerador_subject_search_receipts'"
--
-- Nunca `supabase db push` (só parte das migrations consta no histórico remoto).
-- Rollback: supabase/rollback/20261014120000_recibos_da_pesquisa_por_assunto.rollback.sql
--
-- O QUE FAZ
--   Cria a tabela APPEND-ONLY com o que o Google Ads devolveu em cada execução
--   da Pesquisa por Assunto (média mensal e métricas por candidata). É a fonte
--   do Volume validado das sustentações importadas: o navegador nunca é fonte
--   de volume (Q11). Escrita só pelo servidor (service_role, só INSERT);
--   `authenticated` só lê, pela RLS da marca; `anon` não lê nada.
--
-- O QUE NÃO FAZ
--   Não muda minerador_keywords, nem RLS/grants de outra tabela, nem dado
--   existente. `subject_keyword_id` não tem FK de propósito: a exclusão
--   definitiva de keyword não publicada não pode ser bloqueada por um recibo.
--   Sem expurgo por idade (linhas pequenas; até 600 candidatas por execução).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Guardas: as dependências existem e a tabela ainda não existe.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.marcas') IS NULL THEN
    RAISE EXCEPTION 'RECIBOS_PRE: public.marcas ausente.';
  END IF;
  IF to_regprocedure('public.can_access_brand(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RECIBOS_PRE: public.can_access_brand(uuid) ausente.';
  END IF;
  IF to_regclass('public.minerador_subject_search_receipts') IS NOT NULL THEN
    RAISE EXCEPTION 'RECIBOS_PRE: minerador_subject_search_receipts já existe (migration aplicada?).';
  END IF;
  IF to_regprocedure('public.minerador_subject_search_receipts_append_only()') IS NOT NULL THEN
    RAISE EXCEPTION 'RECIBOS_PRE: a função minerador_subject_search_receipts_append_only() já existe.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. A tabela.
-- -----------------------------------------------------------------------------
CREATE TABLE public.minerador_subject_search_receipts (
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  operation_request_id uuid NOT NULL,
  batch_id uuid NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subject_keyword_id uuid NULL,
  phrase text NOT NULL CHECK (char_length(btrim(phrase)) BETWEEN 1 AND 200),
  provider text NOT NULL CHECK (provider = 'google_ads'),
  provider_version text NOT NULL CHECK (char_length(btrim(provider_version)) BETWEEN 1 AND 20),
  targeting jsonb NOT NULL CHECK (jsonb_typeof(targeting) = 'object'),
  google_ads_request_ids text[] NOT NULL DEFAULT '{}'::text[],
  executed_at timestamptz NOT NULL,
  -- { "<keyword normalizada>": { keyword, averageMonthlySearches, competition,
  --   competitionIndex, averageCpcMicros, lowTopOfPageBidMicros,
  --   highTopOfPageBidMicros, currencyCode } }
  candidates jsonb NOT NULL CHECK (jsonb_typeof(candidates) = 'object'),
  candidate_count integer NOT NULL CHECK (candidate_count BETWEEN 0 AND 600),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marca_id, operation_request_id)
);

CREATE INDEX ix_minerador_subject_search_receipts_executed
  ON public.minerador_subject_search_receipts (marca_id, executed_at DESC);
CREATE INDEX ix_minerador_subject_search_receipts_batch
  ON public.minerador_subject_search_receipts (marca_id, batch_id)
  WHERE batch_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Só inclusões: UPDATE e DELETE recusados pelo gatilho (além dos grants).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minerador_subject_search_receipts_append_only()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'minerador_subject_search_receipts_is_append_only';
END;
$$;
REVOKE ALL ON FUNCTION public.minerador_subject_search_receipts_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER minerador_subject_search_receipts_append_only
  BEFORE UPDATE OR DELETE ON public.minerador_subject_search_receipts
  FOR EACH ROW EXECUTE FUNCTION public.minerador_subject_search_receipts_append_only();

-- -----------------------------------------------------------------------------
-- 4. RLS e grants: o servidor inclui; quem tem acesso à marca lê.
-- -----------------------------------------------------------------------------
ALTER TABLE public.minerador_subject_search_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.minerador_subject_search_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.minerador_subject_search_receipts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.minerador_subject_search_receipts TO service_role;

CREATE POLICY minerador_subject_search_receipts_select ON public.minerador_subject_search_receipts
  FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));

COMMENT ON TABLE public.minerador_subject_search_receipts IS
  'Recibo append-only da Pesquisa por Assunto (Google Ads). Fonte do Volume validado das sustentações importadas (SDD 2026-10-13 acelerar-fluxo §6).';

-- -----------------------------------------------------------------------------
-- 5. Pós-checagem: qualquer falha desfaz tudo.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.minerador_subject_search_receipts'::regclass) THEN
    RAISE EXCEPTION 'RECIBOS_POS: RLS desligada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'minerador_subject_search_receipts'
                 AND policyname = 'minerador_subject_search_receipts_select') THEN
    RAISE EXCEPTION 'RECIBOS_POS: policy de leitura ausente.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'minerador_subject_search_receipts') <> 1 THEN
    RAISE EXCEPTION 'RECIBOS_POS: esperava exatamente uma policy (só leitura).';
  END IF;
  IF has_table_privilege('anon', 'public.minerador_subject_search_receipts', 'SELECT') THEN
    RAISE EXCEPTION 'RECIBOS_POS: anon lê a tabela.';
  END IF;
  IF has_table_privilege('authenticated', 'public.minerador_subject_search_receipts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.minerador_subject_search_receipts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.minerador_subject_search_receipts', 'DELETE') THEN
    RAISE EXCEPTION 'RECIBOS_POS: authenticated escreve na tabela.';
  END IF;
  IF has_table_privilege('service_role', 'public.minerador_subject_search_receipts', 'UPDATE')
     OR has_table_privilege('service_role', 'public.minerador_subject_search_receipts', 'DELETE') THEN
    RAISE EXCEPTION 'RECIBOS_POS: service_role altera ou apaga recibo.';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.minerador_subject_search_receipts', 'INSERT') THEN
    RAISE EXCEPTION 'RECIBOS_POS: service_role não inclui recibo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.minerador_subject_search_receipts'::regclass
                 AND tgname = 'minerador_subject_search_receipts_append_only' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'RECIBOS_POS: gatilho append-only ausente.';
  END IF;
END $$;

COMMIT;
