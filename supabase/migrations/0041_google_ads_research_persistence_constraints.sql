-- Compatibilidade do Google Ads Research com metadata de anunciante ausente.
-- Esta migration altera somente as duas source_contract CHECK constraints.
-- Nao altera colunas, linhas, RLS, policies, grants, owners, indices, triggers,
-- FKs, RPCs ou Usage.

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
