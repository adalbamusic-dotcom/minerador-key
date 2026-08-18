-- Google Ads canonical binding configuration.
-- Candidate only: apply remotely after the dedicated preflight and approval.
-- It does not copy, backfill, dual-write or remove minerador_google_ads_connections.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.google_ads_binding_targeting') IS NOT NULL
    OR to_regclass('public.google_ads_binding_account_state') IS NOT NULL
    OR to_regprocedure('public.google_ads_binding_configuration_validate()') IS NOT NULL THEN
    RAISE EXCEPTION 'GOOGLE_ADS_0033_RELATION_CONFLICT';
  END IF;
END;
$$;

CREATE TABLE public.google_ads_binding_targeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL UNIQUE
    REFERENCES public.integration_bindings(id) ON DELETE RESTRICT,
  language_constant text NOT NULL
    CHECK (language_constant ~ '^languageConstants/[0-9]+$'),
  geo_target_constants text[] NOT NULL
    CHECK (
      cardinality(geo_target_constants) BETWEEN 1 AND 10
      AND array_position(geo_target_constants, NULL) IS NULL
      AND array_position(geo_target_constants, '') IS NULL
    ),
  keyword_plan_network text NOT NULL
    CHECK (keyword_plan_network IN ('GOOGLE_SEARCH', 'GOOGLE_SEARCH_AND_PARTNERS')),
  include_adult_keywords boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.google_ads_binding_account_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL UNIQUE
    REFERENCES public.integration_bindings(id) ON DELETE RESTRICT,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  time_zone text NOT NULL
    CHECK (char_length(btrim(time_zone)) BETWEEN 1 AND 160),
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('validated', 'invalid', 'pending', 'disabled')),
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_google_ads_account_state_validated_at_0033
    CHECK (validation_status <> 'validated' OR validated_at IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.google_ads_binding_configuration_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  binding_row record;
BEGIN
  SELECT b.target_scope_type, b.target_brand_id, b.lifecycle_status
  INTO binding_row
  FROM public.integration_bindings AS b
  WHERE b.id = NEW.binding_id;

  IF NOT FOUND
    OR binding_row.target_scope_type <> 'brand'
    OR binding_row.target_brand_id IS NULL
    OR binding_row.lifecycle_status <> 'active' THEN
    RAISE EXCEPTION 'GOOGLE_ADS_0033_BINDING_MUST_BE_ACTIVE_BRAND';
  END IF;

  IF TG_TABLE_NAME = 'google_ads_binding_targeting'
    AND (
      SELECT count(*)
      FROM unnest(NEW.geo_target_constants) AS geo_target(value)
    ) <> (
      SELECT count(DISTINCT geo_target.value)
      FROM unnest(NEW.geo_target_constants) AS geo_target(value)
    ) THEN
    RAISE EXCEPTION 'GOOGLE_ADS_0033_TARGETING_DUPLICATE_GEO_TARGET';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER google_ads_binding_targeting_validate_trg_0033
  BEFORE INSERT OR UPDATE ON public.google_ads_binding_targeting
  FOR EACH ROW
  EXECUTE FUNCTION public.google_ads_binding_configuration_validate();

CREATE TRIGGER google_ads_binding_account_state_validate_trg_0033
  BEFORE INSERT OR UPDATE ON public.google_ads_binding_account_state
  FOR EACH ROW
  EXECUTE FUNCTION public.google_ads_binding_configuration_validate();

ALTER TABLE public.google_ads_binding_targeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_binding_account_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_ads_binding_targeting_select_0033
  ON public.google_ads_binding_targeting
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.integration_bindings AS b
      WHERE b.id = google_ads_binding_targeting.binding_id
        AND b.target_scope_type = 'brand'
        AND b.target_brand_id IS NOT NULL
        AND public.can_access_brand(b.target_brand_id)
    )
  );

CREATE POLICY google_ads_binding_account_state_select_0033
  ON public.google_ads_binding_account_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.integration_bindings AS b
      WHERE b.id = google_ads_binding_account_state.binding_id
        AND b.target_scope_type = 'brand'
        AND b.target_brand_id IS NOT NULL
        AND public.can_access_brand(b.target_brand_id)
    )
  );

REVOKE ALL PRIVILEGES ON TABLE
  public.google_ads_binding_targeting,
  public.google_ads_binding_account_state
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.google_ads_binding_targeting,
  public.google_ads_binding_account_state
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.google_ads_binding_targeting,
  public.google_ads_binding_account_state
TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.google_ads_binding_configuration_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_ads_binding_configuration_validate() TO service_role;

COMMENT ON TABLE public.google_ads_binding_targeting IS
  'Parametros tipados de targeting Google Ads por binding ativo de Brand; nao armazena credenciais, MCC ou usage.';
COMMENT ON TABLE public.google_ads_binding_account_state IS
  'Estado corrente validado da conta externa Google Ads por binding; nao substitui o ledger de usage.';
COMMENT ON COLUMN public.google_ads_binding_targeting.binding_id IS
  'Binding canonico da Brand; Customer ID permanece em integration_bindings.external_account_ref.';
COMMENT ON COLUMN public.google_ads_binding_account_state.validated_at IS
  'Instante da ultima validacao bem-sucedida da associacao Brand-Customer pela connection Platform.';

COMMIT;
