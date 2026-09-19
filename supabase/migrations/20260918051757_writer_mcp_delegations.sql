BEGIN;

-- Hash only; the bearer secret is shown once to the issuing human.
CREATE TABLE public.writer_mcp_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_name text NOT NULL CHECK (char_length(btrim(client_name)) BETWEEN 1 AND 120),
  token_prefix text NOT NULL CHECK (char_length(token_prefix) BETWEEN 8 AND 32),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  scopes text[] NOT NULL CHECK (
    cardinality(scopes) > 0 AND
    scopes <@ ARRAY['writer.read', 'writer.draft.write', 'writer.media.brief']::text[]
  ),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT writer_mcp_delegations_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX writer_mcp_delegations_actor_idx ON public.writer_mcp_delegations
  (actor_user_id, marca_id, expires_at DESC);

CREATE TABLE public.writer_mcp_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES public.writer_mcp_delegations(id) ON DELETE RESTRICT,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  document_id text,
  tool_name text NOT NULL CHECK (char_length(btrim(tool_name)) > 0),
  result_code text NOT NULL CHECK (char_length(btrim(result_code)) > 0),
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX writer_mcp_call_events_delegation_idx ON public.writer_mcp_call_events
  (delegation_id, occurred_at DESC);

CREATE TRIGGER writer_mcp_call_events_append_only_trg BEFORE UPDATE OR DELETE ON public.writer_mcp_call_events
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();

ALTER TABLE public.writer_mcp_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writer_mcp_call_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.writer_mcp_delegations, public.writer_mcp_call_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.writer_mcp_delegations TO service_role;
GRANT SELECT, INSERT ON TABLE public.writer_mcp_call_events TO service_role;

COMMIT;
