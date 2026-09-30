-- =============================================================================
-- ROLLBACK — parecer direto do especialista (canal "platform")
-- =============================================================================
--
-- Só é aplicável se NÃO houver linha com provider = 'platform': apagar parecer
-- de especialista é exclusão de dado e não acontece por rollback. Havendo
-- linhas, a transação aborta e nada muda; a decisão sobre elas é do dono.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.expert_contributions WHERE provider = 'platform') THEN
    RAISE EXCEPTION 'Há pareceres gravados pela plataforma: rollback recusado para não apagar dado.';
  END IF;
END $$;

ALTER TABLE public.expert_contributions
  DROP CONSTRAINT IF EXISTS ck_expert_contribution_platform_authorship;
ALTER TABLE public.expert_contributions
  DROP COLUMN IF EXISTS authored_by;
ALTER TABLE public.expert_contributions
  DROP CONSTRAINT IF EXISTS expert_contributions_provider_check;
ALTER TABLE public.expert_contributions
  ADD CONSTRAINT expert_contributions_provider_check CHECK (provider = 'telegram');

COMMIT;
