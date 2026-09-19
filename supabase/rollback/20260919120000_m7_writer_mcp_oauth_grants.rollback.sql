-- =============================================================================
-- M7 · ROLLBACK — remove writer_mcp_grants e writer_mcp_call_events.grant_id
-- =============================================================================
--
-- Só roda quando não há dado a perder: nenhum evento de chamada apontando para
-- um grant e nenhum grant gravado. Com dados, aborta com a contagem e a decisão
-- volta ao humano (exportar antes, ou manter a tabela).
--
-- Rollback OPERACIONAL, sem SQL: MCP_OAUTH_ENABLED=false na Vercel. O servidor
-- passa a recusar JWT, `.well-known` e `/oauth/consent` respondem 404 e os
-- grants ficam intactos para uma reativação posterior.
--
-- Executar: npx supabase db query --linked -f supabase/rollback/20260919120000_m7_writer_mcp_oauth_grants.rollback.sql
-- Depois: npx supabase migration repair --status reverted 20260919120000 --linked
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_events bigint;
  v_grants bigint;
  v_null_delegations bigint;
BEGIN
  IF to_regclass('public.writer_mcp_grants') IS NULL THEN
    RAISE EXCEPTION 'M7 rollback: public.writer_mcp_grants não existe; nada a reverter.';
  END IF;

  SELECT count(*) INTO v_events FROM public.writer_mcp_call_events WHERE grant_id IS NOT NULL;
  IF v_events > 0 THEN
    RAISE EXCEPTION 'M7 rollback bloqueado: % evento(s) de chamada apontam para grants. Exportar antes de reverter.', v_events;
  END IF;

  SELECT count(*) INTO v_grants FROM public.writer_mcp_grants;
  IF v_grants > 0 THEN
    RAISE EXCEPTION 'M7 rollback bloqueado: % grant(s) gravado(s). Exportar antes de reverter.', v_grants;
  END IF;

  SELECT count(*) INTO v_null_delegations FROM public.writer_mcp_call_events WHERE delegation_id IS NULL;
  IF v_null_delegations > 0 THEN
    RAISE EXCEPTION 'M7 rollback bloqueado: % evento(s) sem delegation_id; NOT NULL não pode ser restaurado.', v_null_delegations;
  END IF;
END $$;

ALTER TABLE public.writer_mcp_call_events DROP CONSTRAINT IF EXISTS writer_mcp_call_events_principal_check;
DROP INDEX IF EXISTS public.writer_mcp_call_events_grant_idx;
ALTER TABLE public.writer_mcp_call_events DROP COLUMN IF EXISTS grant_id;
ALTER TABLE public.writer_mcp_call_events ALTER COLUMN delegation_id SET NOT NULL;

DROP TABLE public.writer_mcp_grants;

COMMIT;
