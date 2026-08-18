BEGIN;

CREATE TABLE IF NOT EXISTS public.minerador_discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_request_id uuid NOT NULL,
  seed_original text NOT NULL CHECK (btrim(seed_original) <> ''),
  seed_canonical text NOT NULL CHECK (btrim(seed_canonical) <> ''),
  relationship_mode text NOT NULL,
  preliminary_intent text NOT NULL,
  preliminary_funnel text NOT NULL,
  language text NOT NULL,
  country_code text NOT NULL CHECK (country_code = 'BR'),
  country_label text NOT NULL,
  language_constant text NOT NULL,
  selected_states text[] NOT NULL DEFAULT '{}'::text[],
  state_labels text[] NOT NULL DEFAULT '{}'::text[],
  geo_target_constants text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(geo_target_constants) BETWEEN 1 AND 10),
  keyword_plan_network text NOT NULL CHECK (keyword_plan_network IN ('GOOGLE_SEARCH', 'GOOGLE_SEARCH_AND_PARTNERS')),
  include_adult_keywords boolean NOT NULL DEFAULT false,
  volume_filter text NOT NULL,
  cpc_filter text NOT NULL,
  include_terms text NOT NULL DEFAULT '',
  exclude_terms text NOT NULL DEFAULT '',
  provider text NOT NULL CHECK (provider = 'google_ads'),
  provider_version text NOT NULL CHECK (provider_version = 'v25'),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  time_zone text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'partial', 'failed')),
  received_count integer NOT NULL DEFAULT 0 CHECK (received_count >= 0),
  normalized_count integer NOT NULL DEFAULT 0 CHECK (normalized_count >= 0),
  approved_count integer NOT NULL DEFAULT 0 CHECK (approved_count >= 0),
  filtered_count integer NOT NULL DEFAULT 0 CHECK (filtered_count >= 0),
  response_truncated boolean NOT NULL DEFAULT false,
  executed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, operation_request_id)
);

CREATE TABLE IF NOT EXISTS public.minerador_discovery_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_run_id uuid NOT NULL REFERENCES public.minerador_discovery_runs(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  candidate_key text NOT NULL CHECK (btrim(candidate_key) <> ''),
  keyword_original text NOT NULL CHECK (btrim(keyword_original) <> ''),
  canonical_keyword text NOT NULL CHECK (btrim(canonical_keyword) <> ''),
  relation text NOT NULL CHECK (relation IN ('exact', 'phrase', 'broad', 'related')),
  average_monthly_searches bigint,
  has_average_monthly_searches boolean NOT NULL,
  monthly_search_volumes jsonb NOT NULL DEFAULT '[]'::jsonb,
  competition text,
  competition_index integer,
  low_top_of_page_bid_micros text,
  high_top_of_page_bid_micros text,
  average_cpc_micros text,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  time_zone text NOT NULL,
  provider text NOT NULL CHECK (provider = 'google_ads'),
  provider_version text NOT NULL CHECK (provider_version = 'v25'),
  targeting jsonb NOT NULL,
  preliminary_intent text NOT NULL,
  preliminary_funnel text NOT NULL,
  filter_outcome text NOT NULL CHECK (filter_outcome IN ('approved', 'out_of_relation', 'out_of_volume', 'out_of_cpc', 'missing_include_term', 'excluded_term', 'duplicate_consolidated', 'partial_normalization_failure')),
  filter_reasons text[] NOT NULL DEFAULT '{}'::text[],
  existing_keyword_id uuid REFERENCES public.keywords_kgr(id) ON DELETE RESTRICT,
  import_status text NOT NULL DEFAULT 'available' CHECK (import_status IN ('available', 'already_exists', 'selected', 'imported', 'import_failed')),
  imported_keyword_id uuid REFERENCES public.keywords_kgr(id) ON DELETE RESTRICT,
  measured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discovery_run_id, candidate_key),
  UNIQUE (discovery_run_id, canonical_keyword)
);

CREATE INDEX IF NOT EXISTS idx_minerador_discovery_runs_brand_executed
  ON public.minerador_discovery_runs (brand_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_minerador_discovery_candidates_brand_run
  ON public.minerador_discovery_candidates (brand_id, discovery_run_id, filter_outcome);

CREATE OR REPLACE FUNCTION public.minerador_discovery_candidate_brand_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  run_brand_id uuid;
BEGIN
  SELECT brand_id INTO run_brand_id
  FROM public.minerador_discovery_runs
  WHERE id = NEW.discovery_run_id;
  IF run_brand_id IS NULL OR run_brand_id <> NEW.brand_id THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_TENANT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS minerador_discovery_candidate_brand_guard ON public.minerador_discovery_candidates;
CREATE TRIGGER minerador_discovery_candidate_brand_guard
  BEFORE INSERT OR UPDATE ON public.minerador_discovery_candidates
  FOR EACH ROW EXECUTE FUNCTION public.minerador_discovery_candidate_brand_guard();

CREATE OR REPLACE FUNCTION public.minerador_discovery_run_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_RUN_IMMUTABLE';
  END IF;
  IF OLD.status IN ('completed', 'partial') THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_RUN_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS minerador_discovery_run_immutable ON public.minerador_discovery_runs;
CREATE TRIGGER minerador_discovery_run_immutable
  BEFORE UPDATE OR DELETE ON public.minerador_discovery_runs
  FOR EACH ROW EXECUTE FUNCTION public.minerador_discovery_run_immutable();

CREATE OR REPLACE FUNCTION public.persist_minerador_discovery_run(p_run jsonb, p_candidates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  run_id uuid;
  existing_run_id uuid;
  candidate jsonb;
BEGIN
  IF jsonb_typeof(p_run) <> 'object' OR jsonb_typeof(COALESCE(p_candidates, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_INVALID_PAYLOAD';
  END IF;

  run_id := NULLIF(p_run->>'id', '')::uuid;
  SELECT id INTO existing_run_id
  FROM public.minerador_discovery_runs
  WHERE brand_id = (p_run->>'brand_id')::uuid
    AND operation_request_id = (p_run->>'operation_request_id')::uuid;
  IF existing_run_id IS NOT NULL THEN
    RETURN jsonb_build_object('runId', existing_run_id, 'idempotent', true);
  END IF;

  INSERT INTO public.minerador_discovery_runs (
    id, brand_id, actor_user_id, operation_request_id, seed_original, seed_canonical,
    relationship_mode, preliminary_intent, preliminary_funnel, language, language_constant, country_code,
    country_label, selected_states, state_labels, geo_target_constants, keyword_plan_network,
    include_adult_keywords, volume_filter, cpc_filter, include_terms, exclude_terms,
    provider, provider_version, currency_code, time_zone, status, received_count,
    normalized_count, approved_count, filtered_count, response_truncated, executed_at,
    created_at, completed_at, updated_at
  ) VALUES (
    run_id, (p_run->>'brand_id')::uuid, (p_run->>'actor_user_id')::uuid,
    (p_run->>'operation_request_id')::uuid, p_run->>'seed_original', p_run->>'seed_canonical',
    p_run->>'relationship_mode', p_run->>'preliminary_intent', p_run->>'preliminary_funnel',
    p_run->>'language', p_run->>'language_constant', p_run->>'country_code', p_run->>'country_label',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_run->'selected_states', '[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_run->'state_labels', '[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_run->'geo_target_constants', '[]'::jsonb))),
    p_run->>'keyword_plan_network', COALESCE((p_run->>'include_adult_keywords')::boolean, false),
    p_run->>'volume_filter', p_run->>'cpc_filter', COALESCE(p_run->>'include_terms', ''),
    COALESCE(p_run->>'exclude_terms', ''), p_run->>'provider', p_run->>'provider_version',
    p_run->>'currency_code', p_run->>'time_zone', p_run->>'status',
    COALESCE((p_run->>'received_count')::integer, 0), COALESCE((p_run->>'normalized_count')::integer, 0),
    COALESCE((p_run->>'approved_count')::integer, 0), COALESCE((p_run->>'filtered_count')::integer, 0),
    COALESCE((p_run->>'response_truncated')::boolean, false), (p_run->>'executed_at')::timestamptz,
    COALESCE((p_run->>'created_at')::timestamptz, now()), (p_run->>'completed_at')::timestamptz, now()
  ) ON CONFLICT (brand_id, operation_request_id) DO NOTHING
  RETURNING id INTO run_id;

  IF run_id IS NULL THEN
    SELECT id INTO run_id
    FROM public.minerador_discovery_runs
    WHERE brand_id = (p_run->>'brand_id')::uuid
      AND operation_request_id = (p_run->>'operation_request_id')::uuid;
    RETURN jsonb_build_object('runId', run_id, 'idempotent', true);
  END IF;

  FOR candidate IN SELECT value FROM jsonb_array_elements(p_candidates)
  LOOP
    INSERT INTO public.minerador_discovery_candidates (
      discovery_run_id, brand_id, candidate_key, keyword_original, canonical_keyword, relation,
      average_monthly_searches, has_average_monthly_searches, monthly_search_volumes,
      competition, competition_index, low_top_of_page_bid_micros, high_top_of_page_bid_micros,
      average_cpc_micros, currency_code, time_zone, provider, provider_version, targeting, preliminary_intent,
      preliminary_funnel, filter_outcome, filter_reasons, existing_keyword_id, import_status,
      measured_at
    ) VALUES (
      run_id, (p_run->>'brand_id')::uuid, candidate->>'candidate_key', candidate->>'keyword_original',
      candidate->>'canonical_keyword', candidate->>'relation', NULLIF(candidate->>'average_monthly_searches', '')::bigint,
      COALESCE((candidate->>'has_average_monthly_searches')::boolean, false),
      COALESCE(candidate->'monthly_search_volumes', '[]'::jsonb), candidate->>'competition',
      NULLIF(candidate->>'competition_index', '')::integer, candidate->>'low_top_of_page_bid_micros',
      candidate->>'high_top_of_page_bid_micros', candidate->>'average_cpc_micros', candidate->>'currency_code',
      candidate->>'time_zone', candidate->>'provider', candidate->>'provider_version', COALESCE(candidate->'targeting', '{}'::jsonb), candidate->>'preliminary_intent',
      candidate->>'preliminary_funnel', candidate->>'filter_outcome',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(candidate->'filter_reasons', '[]'::jsonb))),
      NULLIF(candidate->>'existing_keyword_id', '')::uuid, COALESCE(candidate->>'import_status', 'available'),
      (candidate->>'measured_at')::timestamptz
    ) ON CONFLICT (discovery_run_id, candidate_key) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('runId', run_id, 'idempotent', false);
END;
$$;

ALTER TABLE public.minerador_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minerador_discovery_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minerador_discovery_runs_select ON public.minerador_discovery_runs;
CREATE POLICY minerador_discovery_runs_select ON public.minerador_discovery_runs
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS minerador_discovery_runs_insert ON public.minerador_discovery_runs;
CREATE POLICY minerador_discovery_runs_insert ON public.minerador_discovery_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit') AND (actor_user_id = auth.uid() OR public.is_global_admin()));

DROP POLICY IF EXISTS minerador_discovery_candidates_select ON public.minerador_discovery_candidates;
CREATE POLICY minerador_discovery_candidates_select ON public.minerador_discovery_candidates
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS minerador_discovery_candidates_insert ON public.minerador_discovery_candidates;
CREATE POLICY minerador_discovery_candidates_insert ON public.minerador_discovery_candidates
  FOR INSERT TO authenticated WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'));
DROP POLICY IF EXISTS minerador_discovery_candidates_update ON public.minerador_discovery_candidates;
CREATE POLICY minerador_discovery_candidates_update ON public.minerador_discovery_candidates
  FOR UPDATE TO authenticated
  USING (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'))
  WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'));

REVOKE ALL PRIVILEGES ON TABLE public.minerador_discovery_runs, public.minerador_discovery_candidates FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.persist_minerador_discovery_run(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.minerador_discovery_runs, public.minerador_discovery_candidates TO authenticated;
GRANT EXECUTE ON FUNCTION public.persist_minerador_discovery_run(jsonb, jsonb) TO service_role;

COMMENT ON TABLE public.minerador_discovery_runs IS 'Execucoes tenantizadas e auditaveis da descoberta de keywords; nao substitui keywords_kgr.';
COMMENT ON TABLE public.minerador_discovery_candidates IS 'Todas as candidatas normalizadas de uma descoberta, inclusive filtradas; importacao e fluxo separado.';

COMMIT;
