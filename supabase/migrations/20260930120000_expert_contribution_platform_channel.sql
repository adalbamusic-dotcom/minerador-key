-- =============================================================================
-- PARECER DIRETO DO ESPECIALISTA NA PLATAFORMA (canal "platform")
-- =============================================================================
--
-- SDD: docs/05-radar/sdd-google-base-e-parecer-direto-2026-09-30.md, Parte B
-- (aprovada pelo dono em 2026-09-30, D3).
--
-- Hoje `expert_contributions` só aceita respostas que chegam pelo Telegram
-- (`provider = 'telegram'`). O especialista com acesso à plataforma passa a
-- poder escrever o parecer direto na aba Especialista do Radar. O parecer
-- segue a MESMA revisão humana das respostas do Telegram (D2): entra como
-- "Contribuição a revisar" e só vai ao pacote depois de aceito.
--
-- O que muda:
--   1. `provider` aceita 'telegram' e 'platform'.
--   2. Coluna `authored_by` (auth.users.id), preenchida SÓ no canal da
--      plataforma — quem escreveu o texto.
--   3. No canal da plataforma, texto obrigatório e autor obrigatório; nada de
--      arquivo do Telegram.
--   `external_update_id` continua obrigatório e com o índice único
--   (provider, bot_key, external_update_id): no canal da plataforma ele recebe
--   a chave de idempotência gerada no servidor.
--
-- O que NÃO muda: RLS e grants (a escrita continua só pelo servidor, com
-- service_role), linhas existentes, as demais tabelas do especialista.
--
-- APLICAÇÃO: pelo dono, com `npx supabase db query --linked -f <este arquivo>`
-- seguido de `npx supabase migration repair --status applied 20260930120000 --linked`.
-- Nunca `supabase db push`. O código da Parte B só vai ao ar depois disto.
-- Rollback: supabase/rollback/20260930120000_expert_contribution_platform_channel.rollback.sql
-- =============================================================================

BEGIN;

ALTER TABLE public.expert_contributions
  DROP CONSTRAINT IF EXISTS expert_contributions_provider_check;
ALTER TABLE public.expert_contributions
  ADD CONSTRAINT expert_contributions_provider_check
  CHECK (provider IN ('telegram', 'platform'));

ALTER TABLE public.expert_contributions
  ADD COLUMN IF NOT EXISTS authored_by uuid NULL REFERENCES auth.users (id) ON DELETE RESTRICT;

ALTER TABLE public.expert_contributions
  DROP CONSTRAINT IF EXISTS ck_expert_contribution_platform_authorship;
ALTER TABLE public.expert_contributions
  ADD CONSTRAINT ck_expert_contribution_platform_authorship CHECK (
    (provider = 'telegram' AND authored_by IS NULL)
    OR (
      provider = 'platform'
      AND authored_by IS NOT NULL
      AND source_type = 'TEXT'
      AND original_text IS NOT NULL
      AND char_length(btrim(original_text)) BETWEEN 1 AND 20000
      AND telegram_file_id IS NULL
    )
  );

COMMENT ON COLUMN public.expert_contributions.authored_by IS
  'Canal platform: quem escreveu o parecer na plataforma (auth.users.id). Nulo no canal telegram.';

-- Readback dentro da transação: sem os dois, nada é gravado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expert_contributions'::regclass
      AND conname = 'expert_contributions_provider_check'
      AND pg_get_constraintdef(oid) LIKE '%platform%'
  ) THEN
    RAISE EXCEPTION 'provider_check não aceita platform';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expert_contributions' AND column_name = 'authored_by'
  ) THEN
    RAISE EXCEPTION 'coluna authored_by ausente';
  END IF;
END $$;

COMMIT;
