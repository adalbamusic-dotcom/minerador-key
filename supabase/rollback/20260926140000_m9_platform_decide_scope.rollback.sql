-- =============================================================================
-- M9 · ROLLBACK — remove platform.decide from scope checks
-- =============================================================================
--
-- Só executar depois de revogar grants/delegações com `platform.decide`. Este
-- rollback preserva a auditoria (incluindo human_confirmation) e não reverte
-- decisões já registradas no domínio.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_grants bigint;
  v_delegations bigint;
BEGIN
  SELECT count(*) INTO v_grants
  FROM public.writer_mcp_grants
  WHERE scopes @> ARRAY['platform.decide']::text[];
  SELECT count(*) INTO v_delegations
  FROM public.writer_mcp_delegations
  WHERE scopes @> ARRAY['platform.decide']::text[];
  IF v_grants > 0 OR v_delegations > 0 THEN
    RAISE EXCEPTION 'M9 rollback abortado: % grant(s) e % delegação(ões) ainda usam platform.decide. Revogue esses acessos antes.', v_grants, v_delegations;
  END IF;
END $$;

ALTER TABLE public.writer_mcp_grants
  DROP CONSTRAINT IF EXISTS writer_mcp_grants_scopes_check;
ALTER TABLE public.writer_mcp_grants
  ADD CONSTRAINT writer_mcp_grants_scopes_check CHECK (
    cardinality(scopes) > 0 AND
    scopes <@ ARRAY[
      'writer.read', 'writer.draft.write', 'writer.media.brief',
      'platform.read', 'minerador.write', 'arquiteto.write', 'radar.write', 'provider.spend'
    ]::text[]
  );

ALTER TABLE public.writer_mcp_delegations
  DROP CONSTRAINT IF EXISTS writer_mcp_delegations_scopes_check;
ALTER TABLE public.writer_mcp_delegations
  ADD CONSTRAINT writer_mcp_delegations_scopes_check CHECK (
    cardinality(scopes) > 0 AND
    scopes <@ ARRAY[
      'writer.read', 'writer.draft.write', 'writer.media.brief',
      'platform.read', 'minerador.write', 'arquiteto.write', 'radar.write', 'provider.spend'
    ]::text[]
  );

COMMIT;
