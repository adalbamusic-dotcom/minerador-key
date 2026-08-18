-- Rollback separado e guarded da migration 0041.
-- Nao executar automaticamente.
-- O rollback restaura exatamente as duas CHECKs anteriores, mas bloqueia se
-- ja houver Discovery Google Ads valido sem metadata de anunciante.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.minerador_discovery_runs
    WHERE source = 'google_ads'
      AND (currency_code IS NULL OR time_zone IS NULL)
  ) OR EXISTS (
    SELECT 1
    FROM public.minerador_discovery_candidates
    WHERE source = 'google_ads'
      AND (currency_code IS NULL OR time_zone IS NULL)
  ) THEN
    RAISE EXCEPTION 'GOOGLE_ADS_RESEARCH_CONSTRAINT_ROLLBACK_BLOCKED: null metadata rows exist';
  END IF;
END;
$$;

BEGIN;

ALTER TABLE public.minerador_discovery_runs
  DROP CONSTRAINT minerador_discovery_runs_source_contract_check,
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
  DROP CONSTRAINT minerador_discovery_candidates_source_contract_check,
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

COMMIT;
