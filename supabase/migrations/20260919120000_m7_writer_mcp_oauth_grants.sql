-- =============================================================================
-- M7 — GRANTS OAUTH DO MCP DO REDATOR
-- =============================================================================
--
-- SDD: docs/07-redator/propostas/sdd-oauth-mcp-redator-2026-09-19.md
--
-- ================== O QUE ESTA MIGRATION CRIA ==================
--
-- O ChatGPT (e Claude, Gemini, outros clientes MCP remotos) só conecta por
-- OAuth 2.1. O token passa a ser emitido pelo OAuth Server do Supabase e
-- identifica o usuário (`sub`) e o cliente (`client_id`). O que esse cliente
-- pode fazer, e em quais Marcas, NÃO cabe no token: o Supabase só emite os
-- escopos OIDC. Fica em `writer_mcp_grants`, decidido pelo usuário na tela de
-- consentimento e revogável pela Agência ou por ele mesmo.
--
--   * `writer_mcp_grants`: uma linha por (usuário, cliente OAuth, Marca) ativa,
--     com os escopos `writer.*` escolhidos e a Agência dona da Marca.
--   * `writer_mcp_call_events.grant_id`: a trilha de chamadas passa a apontar
--     para um grant OU para uma delegação bearer, nunca os dois, nunca nenhum.
--
-- ================== O QUE ELA NÃO FAZ ==================
--
-- * NÃO toca `writer_mcp_delegations`: o bearer interno continua como
--   instrumento de diagnóstico, atrás de MCP_ALLOW_REMOTE_BEARER.
-- * NÃO faz backfill: delegações não viram grants.
-- * NÃO guarda token, refresh token, secret ou client_secret. `oauth_client_id`
--   é identificador público.
-- * NÃO cria policy: leitura e escrita são exclusivas de service_role no
--   servidor, como em `writer_mcp_delegations`.
--
-- ================== APLICAÇÃO ==================
--
-- `npx supabase db query --linked -f <este arquivo>` seguido de
-- `npx supabase migration repair --status applied 20260919120000 --linked`.
-- Nunca `db push`. Preflight e post-verifier em supabase/scripts/.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.writer_mcp_delegations') IS NULL THEN
    RAISE EXCEPTION 'M7 precondição: public.writer_mcp_delegations não existe.';
  END IF;
  IF to_regclass('public.writer_mcp_call_events') IS NULL THEN
    RAISE EXCEPTION 'M7 precondição: public.writer_mcp_call_events não existe.';
  END IF;
  IF to_regclass('public.integration_connections') IS NULL THEN
    RAISE EXCEPTION 'M7 precondição: public.integration_connections não existe.';
  END IF;
  IF to_regclass('public.writer_mcp_grants') IS NOT NULL THEN
    RAISE EXCEPTION 'M7 precondição: public.writer_mcp_grants já existe; migration já aplicada?';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'writer_mcp_call_events' AND column_name = 'grant_id'
  ) THEN
    RAISE EXCEPTION 'M7 precondição: writer_mcp_call_events.grant_id já existe.';
  END IF;
END $$;

CREATE TABLE public.writer_mcp_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id uuid NOT NULL,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  oauth_client_id text NOT NULL CHECK (char_length(btrim(oauth_client_id)) BETWEEN 1 AND 200),
  client_name text NOT NULL CHECK (char_length(btrim(client_name)) BETWEEN 1 AND 120),
  provider_connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  scopes text[] NOT NULL CHECK (
    cardinality(scopes) > 0 AND
    scopes <@ ARRAY['writer.read', 'writer.draft.write', 'writer.media.brief']::text[]
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  revoked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  CONSTRAINT writer_mcp_grants_revocation_check CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

COMMENT ON TABLE public.writer_mcp_grants IS
  'Autorização de um cliente OAuth (ChatGPT, Claude...) para operar o Redator de uma Marca em nome de um usuário. Escopos de produto vivem aqui, não no token.';

-- Um grant ativo por (usuário, cliente, Marca). Revogados não colidem.
CREATE UNIQUE INDEX writer_mcp_grants_active_uidx
  ON public.writer_mcp_grants (actor_user_id, oauth_client_id, marca_id)
  WHERE status = 'active';

CREATE INDEX writer_mcp_grants_agency_idx
  ON public.writer_mcp_grants (agency_id, created_at DESC);

CREATE INDEX writer_mcp_grants_actor_client_idx
  ON public.writer_mcp_grants (actor_user_id, oauth_client_id)
  WHERE status = 'active';

-- A trilha passa a aceitar grant OU delegação. Linhas antigas (só delegação) satisfazem o CHECK.
ALTER TABLE public.writer_mcp_call_events
  ALTER COLUMN delegation_id DROP NOT NULL;

ALTER TABLE public.writer_mcp_call_events
  ADD COLUMN grant_id uuid REFERENCES public.writer_mcp_grants(id) ON DELETE RESTRICT;

ALTER TABLE public.writer_mcp_call_events
  ADD CONSTRAINT writer_mcp_call_events_principal_check
  CHECK (num_nonnulls(delegation_id, grant_id) = 1);

CREATE INDEX writer_mcp_call_events_grant_idx
  ON public.writer_mcp_call_events (grant_id, occurred_at DESC);

ALTER TABLE public.writer_mcp_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.writer_mcp_grants FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.writer_mcp_grants TO service_role;

COMMIT;
