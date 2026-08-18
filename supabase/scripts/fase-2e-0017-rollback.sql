-- FASE 2E / 0017. ROLLBACK POSTERIOR ESTRUTURAL. EXECUCAO MANUAL.
-- Este script nao restaura valores removidos. Para recuperar user_key,
-- perfis.marca_id ou canonical_role historicos, restaure o snapshot pre-0017.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.brand_memberships') IS NULL
    OR to_regclass('public.perfis') IS NULL
    OR to_regclass('public.agency_memberships') IS NULL THEN
    RAISE EXCEPTION 'PHASE_2E_0017_ROLLBACK_BLOCKED: relacoes esperadas ausentes';
  END IF;
END $$;

ALTER TABLE public.brand_memberships ADD COLUMN IF NOT EXISTS user_key text;
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS marca_id uuid;
ALTER TABLE public.agency_memberships ADD COLUMN IF NOT EXISTS canonical_role text;

COMMIT;

-- A estrutura acima e apenas uma ponte de emergencia sem valores, indices,
-- constraints, policies ou autorizacao legada. Nao reintroduza compatibilidade
-- por texto; a recuperacao completa exige o snapshot pre-0017 aprovado.
