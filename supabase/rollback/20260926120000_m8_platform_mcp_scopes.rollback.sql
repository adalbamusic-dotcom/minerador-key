-- =============================================================================
-- M8 · ROLLBACK — volta os escopos do MCP aos três do Redator
-- =============================================================================
--
-- Só roda quando nenhum grant ou delegação ativo usa escopo novo: com eles, o
-- CHECK antigo não seria satisfeito e a decisão volta ao humano (revogar os
-- grants na Conta → Conexões de IA, ou manter a m8).
--
-- `human_confirmation` NÃO é removida: é trilha de auditoria. Apagar a coluna
-- apagaria o registro de quem aceitou o quê.
--
-- Rollback OPERACIONAL, sem SQL: tirar `registerPlatformTools` da rota do MCP.
--
-- Executar: npx supabase db query --linked -f supabase/rollback/20260926120000_m8_platform_mcp_scopes.rollback.sql
-- Depois:   npx supabase migration repair --status reverted 20260926120000 --linked
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_grants bigint;
  v_delegations bigint;
  v_old text[] := ARRAY['writer.read', 'writer.draft.write', 'writer.media.brief']::text[];
BEGIN
  SELECT count(*) INTO v_grants FROM public.writer_mcp_grants WHERE NOT (scopes <@ v_old);
  SELECT count(*) INTO v_delegations FROM public.writer_mcp_delegations WHERE NOT (scopes <@ v_old);
  IF v_grants > 0 OR v_delegations > 0 THEN
    RAISE EXCEPTION 'M8 rollback abortado: % grant(s) e % delegação(ões) usam escopos da plataforma. Revogue antes.', v_grants, v_delegations;
  END IF;
END $$;

ALTER TABLE public.writer_mcp_grants DROP CONSTRAINT IF EXISTS writer_mcp_grants_scopes_check;
ALTER TABLE public.writer_mcp_grants ADD CONSTRAINT writer_mcp_grants_scopes_check CHECK (
  cardinality(scopes) > 0 AND scopes <@ ARRAY['writer.read', 'writer.draft.write', 'writer.media.brief']::text[]
);

ALTER TABLE public.writer_mcp_delegations DROP CONSTRAINT IF EXISTS writer_mcp_delegations_scopes_check;
ALTER TABLE public.writer_mcp_delegations ADD CONSTRAINT writer_mcp_delegations_scopes_check CHECK (
  cardinality(scopes) > 0 AND scopes <@ ARRAY['writer.read', 'writer.draft.write', 'writer.media.brief']::text[]
);

COMMIT;
