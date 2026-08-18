BEGIN;

CREATE TABLE IF NOT EXISTS public.minerador_google_ads_connections (
  brand_id uuid PRIMARY KEY REFERENCES public.marcas(id) ON DELETE RESTRICT,
  customer_id text NOT NULL CHECK (customer_id ~ '^[0-9]{10}$'),
  login_customer_id text CHECK (login_customer_id IS NULL OR login_customer_id ~ '^[0-9]{10}$'),
  language_constant text NOT NULL,
  geo_target_constants text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(geo_target_constants) <= 10),
  keyword_plan_network text NOT NULL CHECK (keyword_plan_network IN ('GOOGLE_SEARCH', 'GOOGLE_SEARCH_AND_PARTNERS')),
  include_adult_keywords boolean NOT NULL DEFAULT false,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  time_zone text NOT NULL,
  status text NOT NULL CHECK (status IN ('validated', 'invalid', 'pending', 'disabled')),
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minerador_keyword_metric_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  keyword_id uuid NOT NULL REFERENCES public.keywords_kgr(id) ON DELETE RESTRICT,
  operation_request_id uuid NOT NULL,
  requested_keyword text NOT NULL,
  canonical_keyword text NOT NULL,
  close_variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_requested_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  average_monthly_searches bigint,
  monthly_search_volumes jsonb NOT NULL DEFAULT '[]'::jsonb,
  competition text,
  competition_index integer,
  low_top_of_page_bid_micros text,
  high_top_of_page_bid_micros text,
  average_cpc_micros text,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  time_zone text NOT NULL,
  targeting jsonb NOT NULL,
  provider text NOT NULL CHECK (provider = 'google_ads'),
  provider_version text NOT NULL CHECK (provider_version = 'v25'),
  customer_id_ref text NOT NULL,
  login_customer_id_ref text,
  google_ads_request_id text,
  measured_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('received', 'persisted', 'projection_failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_request_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_minerador_keyword_metric_measurements_brand_keyword_measured
  ON public.minerador_keyword_metric_measurements (brand_id, keyword_id, measured_at DESC);

ALTER TABLE public.minerador_google_ads_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minerador_keyword_metric_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minerador_google_ads_connections_select ON public.minerador_google_ads_connections;
CREATE POLICY minerador_google_ads_connections_select ON public.minerador_google_ads_connections
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS minerador_google_ads_connections_manage ON public.minerador_google_ads_connections;
CREATE POLICY minerador_google_ads_connections_manage ON public.minerador_google_ads_connections
  FOR ALL TO authenticated
  USING (public.tenant_actor_has_permission(brand_id, 'minerador', 'manage'))
  WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'manage'));

DROP POLICY IF EXISTS minerador_keyword_metric_measurements_select ON public.minerador_keyword_metric_measurements;
CREATE POLICY minerador_keyword_metric_measurements_select ON public.minerador_keyword_metric_measurements
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS minerador_keyword_metric_measurements_insert ON public.minerador_keyword_metric_measurements;
CREATE POLICY minerador_keyword_metric_measurements_insert ON public.minerador_keyword_metric_measurements
  FOR INSERT TO authenticated WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'));
DROP POLICY IF EXISTS minerador_keyword_metric_measurements_update ON public.minerador_keyword_metric_measurements;
CREATE POLICY minerador_keyword_metric_measurements_update ON public.minerador_keyword_metric_measurements
  FOR UPDATE TO authenticated
  USING (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'))
  WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'));

REVOKE ALL PRIVILEGES ON TABLE public.minerador_google_ads_connections, public.minerador_keyword_metric_measurements FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.minerador_google_ads_connections, public.minerador_keyword_metric_measurements FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.minerador_google_ads_connections, public.minerador_keyword_metric_measurements TO authenticated;

COMMIT;
