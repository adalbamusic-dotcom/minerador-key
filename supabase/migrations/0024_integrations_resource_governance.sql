-- Schema mínimo local para governança de providers, connections, grants,
-- bindings, quotas e usage. Não contém seed, segredo, backfill ou adaptação
-- de consumidores legados.
-- Aplicação remota manual somente após o gate de revisão e os verificadores.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.integration_providers') IS NOT NULL
    OR to_regclass('public.integration_capabilities') IS NOT NULL
    OR to_regclass('public.integration_connections') IS NOT NULL
    OR to_regclass('public.integration_grants') IS NOT NULL
    OR to_regclass('public.integration_bindings') IS NOT NULL
    OR to_regclass('public.integration_quota_policies') IS NOT NULL
    OR to_regclass('public.integration_usage_events') IS NOT NULL
    OR to_regprocedure('public.integration_grants_validate_scope()') IS NOT NULL
    OR to_regprocedure('public.integration_bindings_validate_scope()') IS NOT NULL
    OR to_regprocedure('public.integration_usage_events_prevent_mutation()') IS NOT NULL THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_RELATION_CONFLICT: tabela de governança já existe';
  END IF;
END $$;

CREATE TABLE public.integration_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL CHECK (provider_key = lower(btrim(provider_key)) AND provider_key ~ '^[a-z0-9][a-z0-9_]*$'),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'legacy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_integration_providers_key_0024 UNIQUE (provider_key)
);

CREATE TABLE public.integration_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL CHECK (capability_key = lower(btrim(capability_key)) AND capability_key ~ '^[a-z0-9][a-z0-9_.-]*$'),
  operation_kind text NOT NULL CHECK (operation_kind IN ('ai_generation', 'keyword_discovery', 'keyword_metrics', 'allintitle', 'transactional_email')),
  environment text NOT NULL CHECK (environment IN ('development', 'test', 'staging', 'production')),
  unit_name text NOT NULL CHECK (char_length(btrim(unit_name)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'legacy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_integration_capabilities_key_0024 UNIQUE (capability_key)
);

CREATE TABLE public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.integration_providers(id) ON DELETE RESTRICT,
  owner_scope_type text NOT NULL CHECK (owner_scope_type IN ('platform', 'agency', 'brand')),
  owner_agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT,
  owner_brand_id uuid REFERENCES public.marcas(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('development', 'test', 'staging', 'production')),
  lifecycle_status text NOT NULL DEFAULT 'draft' CHECK (lifecycle_status IN ('draft', 'pending', 'ready', 'error', 'disabled', 'revoked')),
  secret_ref text CHECK (secret_ref IS NULL OR char_length(btrim(secret_ref)) BETWEEN 1 AND 512),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_integration_connections_id_provider_0024 UNIQUE (id, provider_id),
  CONSTRAINT ck_integration_connections_owner_scope_0024 CHECK (
    (owner_scope_type = 'platform' AND owner_agency_id IS NULL AND owner_brand_id IS NULL)
    OR (owner_scope_type = 'agency' AND owner_agency_id IS NOT NULL AND owner_brand_id IS NULL)
    OR (owner_scope_type = 'brand' AND owner_agency_id IS NULL AND owner_brand_id IS NOT NULL)
  )
);

CREATE TABLE public.integration_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id uuid NOT NULL REFERENCES public.integration_capabilities(id) ON DELETE RESTRICT,
  target_scope_type text NOT NULL CHECK (target_scope_type IN ('agency', 'brand')),
  target_agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT,
  target_brand_id uuid REFERENCES public.marcas(id) ON DELETE RESTRICT,
  source_scope_type text NOT NULL CHECK (source_scope_type IN ('platform', 'agency')),
  source_agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('development', 'test', 'staging', 'production')),
  lifecycle_status text NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'revoked', 'expired')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  reason text CHECK (reason IS NULL OR char_length(btrim(reason)) <= 1000),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_integration_grants_target_scope_0024 CHECK (
    (target_scope_type = 'agency' AND target_agency_id IS NOT NULL AND target_brand_id IS NULL)
    OR (target_scope_type = 'brand' AND target_agency_id IS NULL AND target_brand_id IS NOT NULL)
  ),
  CONSTRAINT ck_integration_grants_source_scope_0024 CHECK (
    (source_scope_type = 'platform' AND source_agency_id IS NULL)
    OR (source_scope_type = 'agency' AND source_agency_id IS NOT NULL)
  ),
  CONSTRAINT ck_integration_grants_hierarchy_0024 CHECK (
    (target_scope_type = 'agency' AND source_scope_type = 'platform')
    OR (target_scope_type = 'brand' AND source_scope_type IN ('platform', 'agency'))
  ),
  CONSTRAINT ck_integration_grants_dates_0024 CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT ck_integration_grants_status_dates_0024 CHECK (lifecycle_status <> 'expired' OR ends_at IS NOT NULL)
);

CREATE TABLE public.integration_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id uuid NOT NULL REFERENCES public.integration_capabilities(id) ON DELETE RESTRICT,
  target_scope_type text NOT NULL CHECK (target_scope_type IN ('agency', 'brand')),
  target_agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT,
  target_brand_id uuid REFERENCES public.marcas(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('development', 'test', 'staging', 'production')),
  source_kind text NOT NULL CHECK (source_kind IN ('platform_granted', 'agency_owned', 'agency_granted', 'brand_owned', 'unavailable')),
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE RESTRICT,
  grant_id uuid REFERENCES public.integration_grants(id) ON DELETE RESTRICT,
  external_account_ref text CHECK (external_account_ref IS NULL OR char_length(btrim(external_account_ref)) BETWEEN 1 AND 256),
  lifecycle_status text NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'disabled', 'revoked')),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_integration_bindings_target_scope_0024 CHECK (
    (target_scope_type = 'agency' AND target_agency_id IS NOT NULL AND target_brand_id IS NULL)
    OR (target_scope_type = 'brand' AND target_agency_id IS NULL AND target_brand_id IS NOT NULL)
  ),
  CONSTRAINT ck_integration_bindings_source_0024 CHECK (
    (source_kind = 'unavailable' AND connection_id IS NULL AND grant_id IS NULL)
    OR (source_kind IN ('agency_owned', 'brand_owned') AND connection_id IS NOT NULL AND grant_id IS NULL)
    OR (source_kind IN ('platform_granted', 'agency_granted') AND connection_id IS NOT NULL AND grant_id IS NOT NULL)
  ),
  CONSTRAINT ck_integration_bindings_target_source_0024 CHECK (
    (target_scope_type = 'agency' AND source_kind IN ('platform_granted', 'agency_owned', 'unavailable'))
    OR (target_scope_type = 'brand' AND source_kind IN ('platform_granted', 'agency_granted', 'brand_owned', 'unavailable'))
  )
);

CREATE TABLE public.integration_quota_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id uuid NOT NULL REFERENCES public.integration_capabilities(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'agency', 'brand')),
  agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT,
  brand_id uuid REFERENCES public.marcas(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('development', 'test', 'staging', 'production')),
  window_kind text NOT NULL CHECK (window_kind IN ('none', 'calendar_day', 'calendar_month', 'rolling')),
  limit_units numeric(20, 6) CHECK (limit_units IS NULL OR limit_units >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  period_started_at timestamptz,
  period_ends_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_integration_quota_scope_0024 CHECK (
    (scope_type = 'platform' AND agency_id IS NULL AND brand_id IS NULL)
    OR (scope_type = 'agency' AND agency_id IS NOT NULL AND brand_id IS NULL)
    OR (scope_type = 'brand' AND agency_id IS NULL AND brand_id IS NOT NULL)
  ),
  CONSTRAINT ck_integration_quota_period_0024 CHECK (
    (window_kind = 'none' AND period_started_at IS NULL AND period_ends_at IS NULL)
    OR (window_kind <> 'none' AND period_started_at IS NOT NULL AND period_ends_at IS NOT NULL AND period_ends_at > period_started_at)
  )
);

CREATE TABLE public.integration_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES public.integration_providers(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE RESTRICT,
  capability_id uuid NOT NULL REFERENCES public.integration_capabilities(id) ON DELETE RESTRICT,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT,
  brand_id uuid REFERENCES public.marcas(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL CHECK (operation_kind IN ('connection_test', 'health_check', 'administrative_validation', 'module_operation')),
  module text CHECK (module IS NULL OR char_length(btrim(module)) BETWEEN 1 AND 80),
  environment text NOT NULL CHECK (environment IN ('development', 'test', 'staging', 'production')),
  units numeric(20, 6) NOT NULL DEFAULT 0 CHECK (units >= 0),
  unit_name text NOT NULL CHECK (char_length(btrim(unit_name)) BETWEEN 1 AND 80),
  cost_amount numeric(20, 8) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  currency_code text CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  result_status text NOT NULL CHECK (result_status IN ('started', 'succeeded', 'failed', 'blocked')),
  error_code text CHECK (error_code IS NULL OR char_length(btrim(error_code)) BETWEEN 1 AND 160),
  provider_request_ref text CHECK (provider_request_ref IS NULL OR char_length(btrim(provider_request_ref)) BETWEEN 1 AND 256),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 256),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_integration_usage_connection_provider_0024 FOREIGN KEY (connection_id, provider_id)
    REFERENCES public.integration_connections(id, provider_id) ON DELETE RESTRICT,
  CONSTRAINT ck_integration_usage_module_scope_0024 CHECK (
    (operation_kind = 'module_operation' AND brand_id IS NOT NULL AND module IS NOT NULL)
    OR operation_kind <> 'module_operation'
  ),
  CONSTRAINT uq_integration_usage_events_idempotency_0024 UNIQUE (connection_id, idempotency_key)
);

CREATE UNIQUE INDEX uq_integration_connections_active_owner_0024
  ON public.integration_connections (provider_id, owner_scope_type, COALESCE(owner_agency_id, owner_brand_id, '00000000-0000-0000-0000-000000000000'::uuid), environment)
  WHERE lifecycle_status NOT IN ('revoked');

CREATE UNIQUE INDEX uq_integration_grants_active_target_0024
  ON public.integration_grants (capability_id, target_scope_type, COALESCE(target_agency_id, target_brand_id), environment)
  WHERE lifecycle_status = 'active';

CREATE UNIQUE INDEX uq_integration_bindings_active_target_0024
  ON public.integration_bindings (capability_id, target_scope_type, COALESCE(target_agency_id, target_brand_id), environment)
  WHERE lifecycle_status = 'active';

CREATE UNIQUE INDEX uq_integration_quota_active_scope_0024
  ON public.integration_quota_policies (capability_id, scope_type, COALESCE(agency_id, brand_id, '00000000-0000-0000-0000-000000000000'::uuid), environment, window_kind)
  WHERE status = 'active';

CREATE INDEX ix_integration_connections_provider_status_0024
  ON public.integration_connections (provider_id, lifecycle_status, environment);
CREATE INDEX ix_integration_grants_source_agency_0024
  ON public.integration_grants (source_agency_id, lifecycle_status) WHERE source_agency_id IS NOT NULL;
CREATE INDEX ix_integration_bindings_connection_0024
  ON public.integration_bindings (connection_id, lifecycle_status);
CREATE INDEX ix_integration_usage_events_scope_time_0024
  ON public.integration_usage_events (agency_id, brand_id, occurred_at DESC);
CREATE INDEX ix_integration_usage_events_provider_time_0024
  ON public.integration_usage_events (provider_id, connection_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.integration_grants_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.source_scope_type = 'agency'
    AND NOT EXISTS (
      SELECT 1
      FROM public.agency_brands link
      WHERE link.agency_id = NEW.source_agency_id
        AND link.brand_id = NEW.target_brand_id
        AND link.status = 'active'
    ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_GRANT_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_integration_grants_validate_scope_0024
  BEFORE INSERT OR UPDATE ON public.integration_grants
  FOR EACH ROW EXECUTE FUNCTION public.integration_grants_validate_scope();

CREATE OR REPLACE FUNCTION public.integration_bindings_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  selected_connection record;
  selected_grant record;
BEGIN
  IF NEW.source_kind = 'unavailable' THEN
    RETURN NEW;
  END IF;

  SELECT conn_row.owner_scope_type, conn_row.owner_agency_id, conn_row.owner_brand_id,
         conn_row.lifecycle_status
  INTO selected_connection
  FROM public.integration_connections AS conn_row
  WHERE conn_row.id = NEW.connection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_CONNECTION_INVALID';
  END IF;
  IF selected_connection.lifecycle_status = 'revoked' THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_CONNECTION_INVALID';
  END IF;

  IF NEW.source_kind = 'agency_owned'
    AND NOT (
      NEW.target_scope_type = 'agency'
      AND selected_connection.owner_scope_type = 'agency'
      AND selected_connection.owner_agency_id = NEW.target_agency_id
    ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_AGENCY_CONNECTION_MISMATCH';
  END IF;

  IF NEW.source_kind = 'brand_owned'
    AND NOT (
      NEW.target_scope_type = 'brand'
      AND selected_connection.owner_scope_type = 'brand'
      AND selected_connection.owner_brand_id = NEW.target_brand_id
    ) THEN
    RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_BRAND_CONNECTION_MISMATCH';
  END IF;

  IF NEW.source_kind IN ('platform_granted', 'agency_granted') THEN
    SELECT grant_record.target_scope_type, grant_record.target_agency_id,
           grant_record.target_brand_id, grant_record.source_scope_type,
           grant_record.source_agency_id, grant_record.lifecycle_status
    INTO selected_grant
    FROM public.integration_grants grant_record
    WHERE grant_record.id = NEW.grant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_GRANT_TARGET_MISMATCH';
    END IF;
    IF selected_grant.lifecycle_status <> 'active'
      OR selected_grant.target_scope_type <> NEW.target_scope_type
      OR selected_grant.target_agency_id IS DISTINCT FROM NEW.target_agency_id
      OR selected_grant.target_brand_id IS DISTINCT FROM NEW.target_brand_id THEN
      RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_GRANT_TARGET_MISMATCH';
    END IF;

    IF NEW.source_kind = 'platform_granted'
      AND NOT (selected_grant.source_scope_type = 'platform' AND selected_connection.owner_scope_type = 'platform') THEN
      RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_PLATFORM_SOURCE_MISMATCH';
    END IF;

    IF NEW.source_kind = 'agency_granted'
      AND NOT (
        NEW.target_scope_type = 'brand'
        AND selected_grant.source_scope_type = 'agency'
        AND selected_connection.owner_scope_type = 'agency'
        AND selected_connection.owner_agency_id = selected_grant.source_agency_id
        AND EXISTS (
          SELECT 1
          FROM public.agency_brands link
          WHERE link.agency_id = selected_grant.source_agency_id
            AND link.brand_id = NEW.target_brand_id
            AND link.status = 'active'
        )
      ) THEN
      RAISE EXCEPTION 'INTEGRATIONS_0024_BINDING_AGENCY_SOURCE_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_integration_bindings_validate_scope_0024
  BEFORE INSERT OR UPDATE ON public.integration_bindings
  FOR EACH ROW EXECUTE FUNCTION public.integration_bindings_validate_scope();

CREATE OR REPLACE FUNCTION public.integration_usage_events_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'INTEGRATION_USAGE_APPEND_ONLY';
END;
$$;

CREATE TRIGGER trg_integration_usage_events_append_only_0024
  BEFORE UPDATE OR DELETE ON public.integration_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.integration_usage_events_prevent_mutation();

ALTER TABLE public.integration_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_quota_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_providers_select_0024
  ON public.integration_providers FOR SELECT TO authenticated USING (true);
CREATE POLICY integration_capabilities_select_0024
  ON public.integration_capabilities FOR SELECT TO authenticated USING (true);
CREATE POLICY integration_connections_select_0024
  ON public.integration_connections FOR SELECT TO authenticated USING (
    (owner_scope_type = 'platform' AND public.is_global_admin())
    OR (owner_scope_type = 'agency' AND owner_agency_id IS NOT NULL AND public.can_access_agency(owner_agency_id))
    OR (owner_scope_type = 'brand' AND owner_brand_id IS NOT NULL AND public.can_access_brand(owner_brand_id))
  );
CREATE POLICY integration_grants_select_0024
  ON public.integration_grants FOR SELECT TO authenticated USING (
    public.is_global_admin()
    OR (target_agency_id IS NOT NULL AND public.can_access_agency(target_agency_id))
    OR (target_brand_id IS NOT NULL AND public.can_access_brand(target_brand_id))
    OR (source_agency_id IS NOT NULL AND public.can_access_agency(source_agency_id))
  );
CREATE POLICY integration_bindings_select_0024
  ON public.integration_bindings FOR SELECT TO authenticated USING (
    (target_agency_id IS NOT NULL AND public.can_access_agency(target_agency_id))
    OR (target_brand_id IS NOT NULL AND public.can_access_brand(target_brand_id))
  );
CREATE POLICY integration_quota_policies_select_0024
  ON public.integration_quota_policies FOR SELECT TO authenticated USING (
    public.is_global_admin()
    OR (agency_id IS NOT NULL AND public.can_access_agency(agency_id))
    OR (brand_id IS NOT NULL AND public.can_access_brand(brand_id))
  );
CREATE POLICY integration_usage_events_select_0024
  ON public.integration_usage_events FOR SELECT TO authenticated USING (
    public.is_global_admin()
    OR (agency_id IS NOT NULL AND public.can_access_agency(agency_id))
    OR (brand_id IS NOT NULL AND public.can_access_brand(brand_id))
  );

REVOKE ALL PRIVILEGES ON TABLE
  public.integration_providers,
  public.integration_capabilities,
  public.integration_connections,
  public.integration_grants,
  public.integration_bindings,
  public.integration_quota_policies,
  public.integration_usage_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.integration_providers,
  public.integration_capabilities,
  public.integration_connections,
  public.integration_grants,
  public.integration_bindings,
  public.integration_quota_policies,
  public.integration_usage_events
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.integration_providers,
  public.integration_capabilities,
  public.integration_connections,
  public.integration_grants,
  public.integration_bindings,
  public.integration_quota_policies
TO service_role;
GRANT SELECT, INSERT ON TABLE public.integration_usage_events TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.integration_grants_validate_scope(), public.integration_bindings_validate_scope(), public.integration_usage_events_prevent_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integration_grants_validate_scope(), public.integration_bindings_validate_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.integration_usage_events_prevent_mutation() TO service_role;

COMMENT ON TABLE public.integration_providers IS 'Catálogo de providers sem credenciais ou segredos.';
COMMENT ON TABLE public.integration_capabilities IS 'Catálogo de capacidades independente de provider; o provider efetivo vem da connection do binding.';
COMMENT ON TABLE public.integration_connections IS 'Connection com owner explícito; secret_ref é somente referência server-side ao Vault/secret manager.';
COMMENT ON COLUMN public.integration_connections.secret_ref IS 'Referência protegida ao segredo; nunca armazena o segredo bruto.';
COMMENT ON COLUMN public.integration_connections.metadata IS 'Metadados operacionais sanitizados; não armazenar credenciais, tokens ou payloads sensíveis.';
COMMENT ON TABLE public.integration_grants IS 'Concessão de capability independente de membership, role, plano ou credencial.';
COMMENT ON TABLE public.integration_bindings IS 'Escolha explícita da origem efetiva; não existe fallback automático.';
COMMENT ON COLUMN public.integration_bindings.external_account_ref IS 'Identificador externo sanitizado, como customer/account id; não é credencial.';
COMMENT ON TABLE public.integration_quota_policies IS 'Limite independente de entitlement; uso efetivo vem do ledger de usage.';
COMMENT ON TABLE public.integration_usage_events IS 'Ledger append-only de consumo e auditoria sanitizada.';
COMMENT ON COLUMN public.integration_usage_events.provider_request_ref IS 'Correlação sanitizada do provider; não armazenar token, segredo ou payload completo.';

COMMIT;
