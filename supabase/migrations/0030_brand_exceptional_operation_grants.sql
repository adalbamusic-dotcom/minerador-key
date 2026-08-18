BEGIN;

-- Exceptional, brand-scoped authorization for the historical Minerador -> Arquiteto recovery.
-- This migration creates no grants, execution events, workflow items, or historical guards.

CREATE TABLE public.brand_exceptional_operation_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  granted_by_actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  CONSTRAINT ck_brand_exceptional_operation_grants_operation_0030
    CHECK (operation = 'historical_import_recovery:execute'),
  CONSTRAINT ck_brand_exceptional_operation_grants_status_0030
    CHECK (status IN ('active', 'expired', 'revoked')),
  CONSTRAINT ck_brand_exceptional_operation_grants_expiry_0030
    CHECK (expires_at > granted_at),
  CONSTRAINT ck_brand_exceptional_operation_grants_revocation_0030
    CHECK (
      (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_actor_user_id IS NOT NULL)
      OR (status IN ('active', 'expired') AND revoked_at IS NULL AND revoked_by_actor_user_id IS NULL)
    ),
  CONSTRAINT ck_brand_exceptional_operation_grants_reason_0030
    CHECK (reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 500),
  CONSTRAINT uq_brand_exceptional_operation_grants_context_0030
    UNIQUE (id, marca_id, actor_user_id, operation)
);

CREATE UNIQUE INDEX uq_brand_exceptional_operation_grants_active_0030
  ON public.brand_exceptional_operation_grants (marca_id, actor_user_id, operation)
  WHERE status = 'active';

CREATE INDEX ix_brand_exceptional_operation_grants_lookup_0030
  ON public.brand_exceptional_operation_grants (marca_id, actor_user_id, operation, status, expires_at);

CREATE TABLE public.brand_exceptional_operation_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_request_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  marca_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  operation text NOT NULL,
  workflow_item_id uuid NOT NULL REFERENCES public.editorial_workflow_items(id) ON DELETE RESTRICT,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_brand_exceptional_operation_execution_events_operation_0030
    CHECK (operation = 'historical_import_recovery:execute'),
  CONSTRAINT ck_brand_exceptional_operation_execution_events_result_0030
    CHECK (result IN ('created', 'already_protected')),
  CONSTRAINT fk_brand_exceptional_operation_execution_events_grant_context_0030
    FOREIGN KEY (grant_id, marca_id, actor_user_id, operation)
    REFERENCES public.brand_exceptional_operation_grants (id, marca_id, actor_user_id, operation)
    ON DELETE RESTRICT,
  CONSTRAINT uq_brand_exceptional_operation_execution_events_request_workflow_0030
    UNIQUE (execution_request_id, workflow_item_id)
);

CREATE INDEX ix_brand_exceptional_operation_execution_events_grant_0030
  ON public.brand_exceptional_operation_execution_events (grant_id, created_at DESC);

CREATE TRIGGER brand_exceptional_operation_execution_events_append_only_trg_0030
  BEFORE UPDATE OR DELETE ON public.brand_exceptional_operation_execution_events
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();

ALTER TABLE public.brand_exceptional_operation_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_exceptional_operation_execution_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.brand_exceptional_operation_grants,
  public.brand_exceptional_operation_execution_events
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.brand_exceptional_operation_grants TO service_role;
GRANT SELECT, INSERT ON TABLE public.brand_exceptional_operation_execution_events TO service_role;

CREATE FUNCTION public.canonical_actor_can_execute_brand_exceptional_operation(
  target_brand_id uuid,
  target_actor_user_id uuid,
  target_operation text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT target_brand_id IS NOT NULL
    AND target_actor_user_id IS NOT NULL
    AND target_operation = 'historical_import_recovery:execute'
    AND public.canonical_actor_can_access_brand(target_brand_id, target_actor_user_id)
    AND EXISTS (
      SELECT 1
      FROM public.brand_exceptional_operation_grants grant_record
      WHERE grant_record.marca_id = target_brand_id
        AND grant_record.actor_user_id = target_actor_user_id
        AND grant_record.operation = target_operation
        AND grant_record.status = 'active'
        AND grant_record.revoked_at IS NULL
        AND grant_record.expires_at > now()
    );
$$;

REVOKE ALL ON FUNCTION public.canonical_actor_can_execute_brand_exceptional_operation(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_actor_can_execute_brand_exceptional_operation(uuid, uuid, text)
  TO service_role;

COMMIT;
