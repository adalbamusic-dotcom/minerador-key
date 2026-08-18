BEGIN;

-- Snapshot de uma DiscoveryRun permanece imutável. Esta tabela representa somente
-- a projeção operacional atual da candidata e aceita no máximo uma linha por ela.
CREATE TABLE IF NOT EXISTS public.minerador_discovery_candidate_current_metrics (
  candidate_id uuid PRIMARY KEY REFERENCES public.minerador_discovery_candidates(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  keyword_id uuid REFERENCES public.keywords_kgr(id) ON DELETE RESTRICT,
  results_allintitle integer CHECK (results_allintitle IS NULL OR results_allintitle >= 0),
  allintitle_status text NOT NULL DEFAULT 'not_measured' CHECK (allintitle_status IN ('not_measured', 'queued', 'measuring', 'paused', 'captcha', 'measured', 'failed')),
  allintitle_measured_at timestamptz,
  allintitle_provider text,
  allintitle_executor text,
  allintitle_error_code text,
  allintitle_error_message text,
  volume_search bigint CHECK (volume_search IS NULL OR volume_search >= 0),
  monthly_search_volumes jsonb NOT NULL DEFAULT '[]'::jsonb,
  low_top_of_page_bid_micros text,
  high_top_of_page_bid_micros text,
  average_cpc_micros text,
  competition text,
  competition_index integer,
  currency_code text CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  targeting jsonb,
  metrics_measured_at timestamptz,
  metrics_provider text,
  metrics_provider_version text,
  allintitle_operation_request_id uuid,
  allintitle_batch_id uuid,
  google_ads_request_id text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, brand_id)
);

CREATE TABLE IF NOT EXISTS public.minerador_discovery_candidate_metric_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  candidate_id uuid NOT NULL REFERENCES public.minerador_discovery_candidates(id) ON DELETE RESTRICT,
  keyword_id uuid REFERENCES public.keywords_kgr(id) ON DELETE RESTRICT,
  metric_type text NOT NULL CHECK (metric_type IN ('allintitle', 'google_ads')),
  previous_value jsonb,
  new_value jsonb,
  provider text,
  provider_version text,
  targeting jsonb,
  measured_at timestamptz NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operation_request_id uuid,
  batch_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('success', 'partial', 'failed')),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minerador_discovery_candidate_current_metrics_brand
  ON public.minerador_discovery_candidate_current_metrics (brand_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_minerador_discovery_candidate_current_metrics_keyword
  ON public.minerador_discovery_candidate_current_metrics (brand_id, keyword_id)
  WHERE keyword_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_minerador_discovery_candidate_metric_history_brand_candidate
  ON public.minerador_discovery_candidate_metric_history (brand_id, candidate_id, created_at DESC);

ALTER TABLE public.minerador_discovery_candidate_current_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minerador_discovery_candidate_metric_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minerador_discovery_candidate_current_metrics_select ON public.minerador_discovery_candidate_current_metrics;
CREATE POLICY minerador_discovery_candidate_current_metrics_select
  ON public.minerador_discovery_candidate_current_metrics FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS minerador_discovery_candidate_current_metrics_manage ON public.minerador_discovery_candidate_current_metrics;
CREATE POLICY minerador_discovery_candidate_current_metrics_manage
  ON public.minerador_discovery_candidate_current_metrics FOR ALL TO authenticated
  USING (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'))
  WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'));

DROP POLICY IF EXISTS minerador_discovery_candidate_metric_history_select ON public.minerador_discovery_candidate_metric_history;
CREATE POLICY minerador_discovery_candidate_metric_history_select
  ON public.minerador_discovery_candidate_metric_history FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS minerador_discovery_candidate_metric_history_insert ON public.minerador_discovery_candidate_metric_history;
CREATE POLICY minerador_discovery_candidate_metric_history_insert
  ON public.minerador_discovery_candidate_metric_history FOR INSERT TO authenticated
  WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'));

REVOKE ALL PRIVILEGES ON TABLE public.minerador_discovery_candidate_current_metrics, public.minerador_discovery_candidate_metric_history FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.minerador_discovery_candidate_current_metrics, public.minerador_discovery_candidate_metric_history FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.minerador_discovery_candidate_current_metrics TO authenticated;
GRANT SELECT, INSERT ON TABLE public.minerador_discovery_candidate_metric_history TO authenticated;

COMMIT;
