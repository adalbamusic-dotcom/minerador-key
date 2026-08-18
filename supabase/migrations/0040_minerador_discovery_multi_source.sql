BEGIN;

-- Fase multi-source localmente preparada. Esta migration ainda nao foi aplicada
-- ao banco remoto. O default preserva todas as execucoes Google Ads existentes.
ALTER TABLE public.minerador_discovery_runs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'google_ads',
  ADD COLUMN IF NOT EXISTS source_data jsonb;

ALTER TABLE public.minerador_discovery_candidates
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'google_ads',
  ADD COLUMN IF NOT EXISTS source_data jsonb;

ALTER TABLE public.minerador_discovery_runs
  ALTER COLUMN seed_original DROP NOT NULL,
  ALTER COLUMN seed_canonical DROP NOT NULL,
  ALTER COLUMN relationship_mode DROP NOT NULL,
  ALTER COLUMN language DROP NOT NULL,
  ALTER COLUMN country_code DROP NOT NULL,
  ALTER COLUMN country_label DROP NOT NULL,
  ALTER COLUMN language_constant DROP NOT NULL,
  ALTER COLUMN selected_states DROP NOT NULL,
  ALTER COLUMN state_labels DROP NOT NULL,
  ALTER COLUMN geo_target_constants DROP NOT NULL,
  ALTER COLUMN keyword_plan_network DROP NOT NULL,
  ALTER COLUMN include_adult_keywords DROP NOT NULL,
  ALTER COLUMN provider DROP NOT NULL,
  ALTER COLUMN provider_version DROP NOT NULL,
  ALTER COLUMN currency_code DROP NOT NULL,
  ALTER COLUMN time_zone DROP NOT NULL;

ALTER TABLE public.minerador_discovery_candidates
  ALTER COLUMN relation DROP NOT NULL,
  ALTER COLUMN currency_code DROP NOT NULL,
  ALTER COLUMN time_zone DROP NOT NULL,
  ALTER COLUMN provider DROP NOT NULL,
  ALTER COLUMN provider_version DROP NOT NULL,
  ALTER COLUMN targeting DROP NOT NULL,
  ALTER COLUMN measured_at DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.minerador_discovery_runs'::regclass
      AND pg_get_constraintdef(c.oid) LIKE '%provider = ''google_ads''%'
  LOOP
    EXECUTE format('ALTER TABLE public.minerador_discovery_runs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.minerador_discovery_runs'::regclass
      AND pg_get_constraintdef(c.oid) LIKE '%provider_version = ''v25''%'
  LOOP
    EXECUTE format('ALTER TABLE public.minerador_discovery_runs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.minerador_discovery_candidates'::regclass
      AND pg_get_constraintdef(c.oid) LIKE '%provider = ''google_ads''%'
  LOOP
    EXECUTE format('ALTER TABLE public.minerador_discovery_candidates DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.minerador_discovery_candidates'::regclass
      AND pg_get_constraintdef(c.oid) LIKE '%provider_version = ''v25''%'
  LOOP
    EXECUTE format('ALTER TABLE public.minerador_discovery_candidates DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE public.minerador_discovery_runs
  ADD CONSTRAINT minerador_discovery_runs_source_check
  CHECK (source IN ('google_ads', 'manual', 'csv')),
  ADD CONSTRAINT minerador_discovery_runs_source_contract_check
  CHECK (
    (
      source = 'google_ads'
      AND provider = 'google_ads'
      AND provider_version = 'v25'
      AND seed_original IS NOT NULL
      AND seed_canonical IS NOT NULL
      AND relationship_mode IS NOT NULL
      AND language IS NOT NULL
      AND country_code IS NOT NULL
      AND country_label IS NOT NULL
      AND language_constant IS NOT NULL
      AND selected_states IS NOT NULL
      AND state_labels IS NOT NULL
      AND geo_target_constants IS NOT NULL
      AND keyword_plan_network IS NOT NULL
      AND include_adult_keywords IS NOT NULL
      AND currency_code IS NOT NULL
      AND time_zone IS NOT NULL
    )
    OR (
      source IN ('manual', 'csv')
      AND provider IS NULL
      AND provider_version IS NULL
      AND seed_original IS NULL
      AND seed_canonical IS NULL
      AND relationship_mode IS NULL
      AND language IS NULL
      AND country_code IS NULL
      AND country_label IS NULL
      AND language_constant IS NULL
      AND selected_states IS NULL
      AND state_labels IS NULL
      AND geo_target_constants IS NULL
      AND keyword_plan_network IS NULL
      AND include_adult_keywords IS NULL
      AND currency_code IS NULL
      AND time_zone IS NULL
    )
  );

ALTER TABLE public.minerador_discovery_candidates
  ADD CONSTRAINT minerador_discovery_candidates_source_check
  CHECK (source IN ('google_ads', 'manual', 'csv')),
  ADD CONSTRAINT minerador_discovery_candidates_source_contract_check
  CHECK (
    (
      source = 'google_ads'
      AND provider = 'google_ads'
      AND provider_version = 'v25'
      AND currency_code IS NOT NULL
      AND time_zone IS NOT NULL
      AND targeting IS NOT NULL
      AND measured_at IS NOT NULL
    )
    OR (
      source IN ('manual', 'csv')
      AND provider IS NULL
      AND provider_version IS NULL
      AND currency_code IS NULL
      AND time_zone IS NULL
      AND targeting IS NULL
      AND measured_at IS NULL
      AND average_monthly_searches IS NULL
      AND monthly_search_volumes = '[]'::jsonb
      AND competition IS NULL
      AND competition_index IS NULL
      AND low_top_of_page_bid_micros IS NULL
      AND high_top_of_page_bid_micros IS NULL
      AND average_cpc_micros IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_minerador_discovery_runs_brand_source_executed
  ON public.minerador_discovery_runs (brand_id, source, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_minerador_discovery_candidates_brand_source
  ON public.minerador_discovery_candidates (brand_id, source, discovery_run_id);

CREATE OR REPLACE FUNCTION public.persist_minerador_discovery_source_run(p_run jsonb, p_candidates jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  run_id uuid;
  existing_run_id uuid;
  candidate jsonb;
  source_value text;
  selected_states text[];
  state_labels text[];
  geo_targets text[];
  filter_reasons text[];
BEGIN
  IF jsonb_typeof(p_run) <> 'object' OR jsonb_typeof(COALESCE(p_candidates, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_INVALID_PAYLOAD';
  END IF;

  source_value := p_run->>'source';
  IF source_value NOT IN ('manual', 'csv') THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_SOURCE_NOT_SUPPORTED';
  END IF;

  SELECT id INTO existing_run_id
  FROM public.minerador_discovery_runs
  WHERE brand_id = (p_run->>'brand_id')::uuid
    AND operation_request_id = (p_run->>'operation_request_id')::uuid;
  IF existing_run_id IS NOT NULL THEN
    RETURN jsonb_build_object('runId', existing_run_id, 'idempotent', true);
  END IF;

  selected_states := CASE WHEN jsonb_typeof(p_run->'selected_states') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_run->'selected_states')) ELSE '{}'::text[] END;
  state_labels := CASE WHEN jsonb_typeof(p_run->'state_labels') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_run->'state_labels')) ELSE '{}'::text[] END;
  geo_targets := CASE WHEN jsonb_typeof(p_run->'geo_target_constants') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(p_run->'geo_target_constants')) ELSE '{}'::text[] END;

  INSERT INTO public.minerador_discovery_runs (
    id, brand_id, actor_user_id, operation_request_id, seed_original, seed_canonical,
    relationship_mode, preliminary_intent, preliminary_funnel, language, language_constant,
    country_code, country_label, selected_states, state_labels, geo_target_constants,
    keyword_plan_network, include_adult_keywords, volume_filter, cpc_filter, include_terms,
    exclude_terms, source, provider, provider_version, currency_code, time_zone, status,
    received_count, normalized_count, approved_count, filtered_count, response_truncated,
    executed_at, created_at, completed_at, source_data
  ) VALUES (
    NULLIF(p_run->>'id', '')::uuid, (p_run->>'brand_id')::uuid, (p_run->>'actor_user_id')::uuid,
    (p_run->>'operation_request_id')::uuid, NULLIF(p_run->>'seed_original', ''), NULLIF(p_run->>'seed_canonical', ''),
    NULLIF(p_run->>'relationship_mode', ''), COALESCE(NULLIF(p_run->>'preliminary_intent', ''), 'Não definida'),
    COALESCE(NULLIF(p_run->>'preliminary_funnel', ''), 'Não definido'), NULLIF(p_run->>'language', ''),
    NULLIF(p_run->>'language_constant', ''), NULLIF(p_run->>'country_code', ''), NULLIF(p_run->>'country_label', ''),
    NULLIF(selected_states, '{}'), NULLIF(state_labels, '{}'), NULLIF(geo_targets, '{}'),
    NULLIF(p_run->>'keyword_plan_network', ''), NULLIF(p_run->>'include_adult_keywords', '')::boolean,
    COALESCE(NULLIF(p_run->>'volume_filter', ''), 'Todos'), COALESCE(NULLIF(p_run->>'cpc_filter', ''), 'Todos'),
    COALESCE(p_run->>'include_terms', ''), COALESCE(p_run->>'exclude_terms', ''), source_value,
    NULL, NULL, NULL, NULL, 'completed', COALESCE((p_run->>'received_count')::integer, 0),
    COALESCE((p_run->>'normalized_count')::integer, 0), COALESCE((p_run->>'approved_count')::integer, 0),
    COALESCE((p_run->>'filtered_count')::integer, 0), false, (p_run->>'executed_at')::timestamptz,
    COALESCE((p_run->>'created_at')::timestamptz, now()), (p_run->>'completed_at')::timestamptz,
    CASE WHEN jsonb_typeof(p_run->'source_data') = 'object' THEN p_run->'source_data' ELSE NULL END
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
    filter_reasons := CASE WHEN jsonb_typeof(candidate->'filter_reasons') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(candidate->'filter_reasons')) ELSE '{}'::text[] END;
    INSERT INTO public.minerador_discovery_candidates (
      discovery_run_id, brand_id, candidate_key, keyword_original, canonical_keyword, relation,
      average_monthly_searches, has_average_monthly_searches, monthly_search_volumes, competition,
      competition_index, low_top_of_page_bid_micros, high_top_of_page_bid_micros, average_cpc_micros,
      currency_code, time_zone, provider, provider_version, targeting, preliminary_intent,
      preliminary_funnel, filter_outcome, filter_reasons, existing_keyword_id, import_status,
      measured_at, source, source_data
    ) VALUES (
      run_id, (p_run->>'brand_id')::uuid, candidate->>'candidate_key', candidate->>'keyword_original',
      candidate->>'canonical_keyword', NULLIF(candidate->>'relation', ''), NULL, false, '[]'::jsonb,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      COALESCE(NULLIF(candidate->>'preliminary_intent', ''), p_run->>'preliminary_intent', 'Não definida'),
      COALESCE(NULLIF(candidate->>'preliminary_funnel', ''), p_run->>'preliminary_funnel', 'Não definido'),
      'approved', filter_reasons, NULLIF(candidate->>'existing_keyword_id', '')::uuid,
      COALESCE(NULLIF(candidate->>'import_status', ''), 'available'), NULL,
      source_value, CASE WHEN jsonb_typeof(candidate->'source_data') = 'object' THEN candidate->'source_data' ELSE NULL END
    ) ON CONFLICT (discovery_run_id, candidate_key) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('runId', run_id, 'idempotent', false);
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.persist_minerador_discovery_source_run(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_minerador_discovery_source_run(jsonb, jsonb) TO service_role;

COMMENT ON COLUMN public.minerador_discovery_runs.source IS 'Origem da descoberta: google_ads, manual ou csv; nao substitui provider.';
COMMENT ON COLUMN public.minerador_discovery_candidates.source_data IS 'Somente campos reconhecidos da origem manual/CSV; nao e evidencia de provider.';

COMMIT;
