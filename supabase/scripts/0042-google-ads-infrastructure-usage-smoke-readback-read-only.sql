-- Diagnóstico read-only do primeiro smoke Google Ads Discovery
-- infrastructure-backed após a migration 0042.
--
-- Antes de executar, preencha SOMENTE target_operation_request_id com o UUID
-- retornado/persistido pelo smoke. Como fallback controlado, deixe o UUID
-- nulo e preencha reference_executed_at com o instante mostrado pela UI. O
-- fallback considera somente a janela de +/- 5 segundos e falha fechado se
-- encontrar zero ou mais de um run. Quando conhecidos, os três totais da UI
-- devem ser preenchidos para confirmar o candidato sem escolhê-lo em empate.
--
-- Este arquivo contém apenas SELECT/CTE. Não chama provider, não executa RPC,
-- DML ou DDL e não altera schema nem dados.

WITH
parameters AS (
  SELECT
    NULL::uuid AS target_operation_request_id,
    NULL::timestamptz AS reference_executed_at,
    NULL::bigint AS expected_received_count,
    NULL::bigint AS expected_approved_count,
    NULL::bigint AS expected_filtered_count
),
runs_by_operation_request_id AS (
  SELECT
    r.id,
    r.brand_id,
    r.actor_user_id,
    r.operation_request_id,
    r.source,
    r.provider,
    r.provider_version,
    r.status,
    r.received_count,
    r.normalized_count,
    r.approved_count,
    r.filtered_count,
    r.executed_at,
    r.completed_at
  FROM public.minerador_discovery_runs AS r
  CROSS JOIN parameters AS p
  WHERE p.target_operation_request_id IS NOT NULL
    AND r.operation_request_id = p.target_operation_request_id
    AND r.source = 'google_ads'
    AND r.provider = 'google_ads'
),
runs_by_reference_window AS (
  SELECT
    r.id,
    r.brand_id,
    r.actor_user_id,
    r.operation_request_id,
    r.source,
    r.provider,
    r.provider_version,
    r.status,
    r.received_count,
    r.normalized_count,
    r.approved_count,
    r.filtered_count,
    r.executed_at,
    r.completed_at
  FROM public.minerador_discovery_runs AS r
  CROSS JOIN parameters AS p
  WHERE p.target_operation_request_id IS NULL
    AND p.reference_executed_at IS NOT NULL
    AND r.executed_at BETWEEN p.reference_executed_at - interval '5 seconds'
                          AND p.reference_executed_at + interval '5 seconds'
    AND (p.expected_received_count IS NULL OR r.received_count = p.expected_received_count)
    AND (p.expected_approved_count IS NULL OR r.approved_count = p.expected_approved_count)
    AND (p.expected_filtered_count IS NULL OR r.filtered_count = p.expected_filtered_count)
    AND r.source = 'google_ads'
    AND r.provider = 'google_ads'
),
selected_runs AS (
  SELECT * FROM runs_by_operation_request_id
  UNION ALL
  SELECT * FROM runs_by_reference_window
),
verified_selected_run AS (
  SELECT sr.*
  FROM selected_runs AS sr
  WHERE (SELECT count(*) FROM selected_runs) = 1
),
run_summary_counts AS (
  SELECT
    count(*)::bigint AS discovery_run_count,
    CASE WHEN count(*) = 1 THEN 'YES' ELSE 'NO' END::text AS discovery_run_found,
    max(id::text) AS run_id,
    max(brand_id::text) AS brand_id,
    max(actor_user_id::text) AS actor_user_id,
    max(operation_request_id::text) AS operation_request_id,
    max(source) AS source,
    max(provider) AS provider,
    max(provider_version) AS provider_version,
    max(status) AS status,
    max(received_count) AS received_count,
    max(normalized_count) AS normalized_count,
    max(approved_count) AS approved_count,
    max(filtered_count) AS filtered_count,
    max(executed_at) AS executed_at,
    max(completed_at) AS completed_at
  FROM selected_runs
),
run_summary AS (
  SELECT
    rsc.*,
    CASE
      WHEN rsc.discovery_run_count = 1 AND p.target_operation_request_id IS NOT NULL THEN 'OPERATION_REQUEST_ID'
      WHEN rsc.discovery_run_count = 1 AND p.reference_executed_at IS NOT NULL THEN 'TIME_WINDOW'
      WHEN rsc.discovery_run_count = 0 THEN 'NOT_FOUND'
      ELSE 'AMBIGUOUS'
    END::text AS run_locator_status
  FROM run_summary_counts AS rsc
  CROSS JOIN parameters AS p
),
authorized_agency_context AS (
  SELECT
    r.id AS run_id,
    count(*) FILTER (WHERE ab.status = 'active')::bigint AS active_agency_count,
    min(ab.agency_id::text) FILTER (WHERE ab.status = 'active') AS active_agency_id
  FROM verified_selected_run AS r
  LEFT JOIN public.agency_brands AS ab
    ON ab.brand_id = r.brand_id
  GROUP BY r.id
),
correlated_usage_events AS (
  SELECT
    r.id AS run_id,
    r.brand_id AS run_brand_id,
    r.actor_user_id AS run_actor_user_id,
    r.operation_request_id,
    u.id AS usage_event_id,
    u.actor_user_id AS usage_actor_user_id,
    u.agency_id AS usage_agency_id,
    u.brand_id AS usage_brand_id,
    u.connection_id,
    u.capability_id,
    u.operation_kind,
    u.module,
    u.environment,
    u.result_status,
    u.idempotency_key,
    p.provider_key AS usage_provider,
    cap.capability_key,
    cap.operation_kind AS capability_operation_kind
  FROM verified_selected_run AS r
  JOIN public.integration_usage_events AS u
    ON u.idempotency_key = 'google_ads:' || r.operation_request_id::text || ':keyword_discovery'
  JOIN public.integration_providers AS p
    ON p.id = u.provider_id
   AND p.provider_key = 'google_ads'
  LEFT JOIN public.integration_capabilities AS cap
    ON cap.id = u.capability_id
),
usage_summary AS (
  SELECT
    count(cue.usage_event_id)::bigint AS usage_event_count,
    count(cue.usage_event_id) FILTER (WHERE cue.result_status = 'succeeded')::bigint AS succeeded_event_count,
    count(cue.usage_event_id) FILTER (WHERE cue.connection_id IS NULL)::bigint AS infrastructure_backed_event_count,
    count(cue.usage_event_id) FILTER (WHERE cue.connection_id IS NOT NULL)::bigint AS legacy_connection_event_count,
    count(cue.usage_event_id) FILTER (WHERE cue.capability_id IS NOT NULL)::bigint AS capability_present_event_count,
    count(cue.usage_event_id) FILTER (
      WHERE cue.capability_key = 'google_ads_keyword_discovery'
        AND cue.capability_operation_kind = 'keyword_discovery'
        AND cue.operation_kind = 'module_operation'
        AND cue.module = 'minerador'
    )::bigint AS technical_operation_match_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_actor_user_id = r.actor_user_id)::bigint AS actor_match_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_brand_id = r.brand_id)::bigint AS brand_match_count,
    count(cue.usage_event_id) FILTER (
      WHERE cue.usage_agency_id::text = aac.active_agency_id
        AND aac.active_agency_count = 1
    )::bigint AS agency_match_count,
    max(cue.result_status) AS usage_status,
    max(cue.usage_provider) AS usage_provider,
    max(cue.environment) AS usage_environment,
    max(cue.capability_key) AS usage_capability,
    max(cue.capability_operation_kind) AS usage_capability_operation,
    max(cue.operation_kind) AS usage_operation,
    max(cue.module) AS usage_module,
    max(cue.idempotency_key) AS usage_idempotency_key,
    max(cue.usage_actor_user_id::text) AS usage_actor_user_id,
    max(cue.usage_agency_id::text) AS usage_agency_id,
    max(cue.usage_brand_id::text) AS usage_brand_id
  FROM verified_selected_run AS r
  LEFT JOIN authorized_agency_context AS aac
    ON aac.run_id = r.id
  LEFT JOIN correlated_usage_events AS cue
    ON cue.run_id = r.id
  GROUP BY r.id, r.actor_user_id, r.brand_id, aac.active_agency_count, aac.active_agency_id
),
infrastructure_idempotency_scope AS (
  SELECT
    cue.run_id,
    cue.environment,
    cue.idempotency_key,
    count(*)::bigint AS scope_event_count
  FROM correlated_usage_events AS cue
  WHERE cue.connection_id IS NULL
  GROUP BY cue.run_id, cue.environment, cue.idempotency_key
),
idempotency_summary AS (
  SELECT
    coalesce(max(scope_event_count), 0)::bigint AS scope_event_count,
    greatest(coalesce(max(scope_event_count), 0)::bigint - 1, 0)::bigint AS duplicate_usage_events
  FROM infrastructure_idempotency_scope
),
historical_google_ads_connection_backed_count AS (
  SELECT count(*)::bigint AS event_count
  FROM public.integration_usage_events AS u
  JOIN public.integration_providers AS p
    ON p.id = u.provider_id
  WHERE p.provider_key = 'google_ads'
    AND u.connection_id IS NOT NULL
),
final_diagnostic AS (
  SELECT
    rs.*,
    coalesce(us.usage_event_count, 0)::bigint AS usage_event_count,
    coalesce(us.succeeded_event_count, 0)::bigint AS succeeded_event_count,
    coalesce(us.infrastructure_backed_event_count, 0)::bigint AS infrastructure_backed_event_count,
    coalesce(us.legacy_connection_event_count, 0)::bigint AS legacy_connection_event_count,
    coalesce(us.capability_present_event_count, 0)::bigint AS capability_present_event_count,
    coalesce(us.technical_operation_match_count, 0)::bigint AS technical_operation_match_count,
    coalesce(us.actor_match_count, 0)::bigint AS actor_match_count,
    coalesce(us.agency_match_count, 0)::bigint AS agency_match_count,
    coalesce(us.brand_match_count, 0)::bigint AS brand_match_count,
    us.usage_status,
    us.usage_provider,
    us.usage_environment,
    us.usage_capability,
    us.usage_capability_operation,
    us.usage_operation,
    us.usage_module,
    us.usage_idempotency_key,
    us.usage_actor_user_id,
    us.usage_agency_id,
    us.usage_brand_id,
    ids.scope_event_count,
    ids.duplicate_usage_events,
    h.event_count AS historical_google_ads_connection_backed_event_count
  FROM run_summary AS rs
  LEFT JOIN usage_summary AS us
    ON rs.discovery_run_count = 1
  CROSS JOIN idempotency_summary AS ids
  CROSS JOIN historical_google_ads_connection_backed_count AS h
)
SELECT
  discovery_run_found AS "DISCOVERY_RUN_FOUND",
  discovery_run_count AS "DISCOVERY_RUN_COUNT",
  run_locator_status AS "RUN_LOCATOR_STATUS",
  source AS "SOURCE",
  provider AS "PROVIDER",
  provider_version AS "PROVIDER_VERSION",
  status AS "STATUS",
  received_count AS "RECEIVED_COUNT",
  normalized_count AS "NORMALIZED_COUNT",
  approved_count AS "APPROVED_COUNT",
  filtered_count AS "FILTERED_COUNT",
  operation_request_id AS "OPERATION_REQUEST_ID",
  brand_id AS "RUN_BRAND_ID",
  actor_user_id AS "RUN_ACTOR_USER_ID",
  CASE WHEN usage_event_count = 1 THEN 'YES' ELSE 'NO' END AS "USAGE_EVENT_FOUND",
  usage_event_count AS "USAGE_EVENT_COUNT",
  usage_status AS "USAGE_STATUS",
  CASE WHEN usage_event_count = 1 AND infrastructure_backed_event_count = 1 THEN 'YES' ELSE 'NO' END AS "USAGE_CONNECTION_ID_IS_NULL",
  CASE WHEN usage_event_count = 1 AND capability_present_event_count = 1 THEN 'YES' ELSE 'NO' END AS "USAGE_CAPABILITY_PRESENT",
  usage_provider AS "USAGE_PROVIDER",
  usage_environment AS "USAGE_ENVIRONMENT",
  usage_capability AS "USAGE_CAPABILITY_IDENTIFICATION",
  usage_capability_operation AS "USAGE_CAPABILITY_OPERATION_IDENTIFICATION",
  usage_operation AS "USAGE_OPERATION",
  usage_module AS "USAGE_MODULE",
  CASE WHEN usage_event_count = 1 AND actor_match_count = 1 THEN 'YES' ELSE 'NO' END AS "ACTOR_MATCH",
  CASE WHEN usage_event_count = 1 AND agency_match_count = 1 THEN 'YES' ELSE 'NO' END AS "AGENCY_MATCH",
  CASE WHEN usage_event_count = 1 AND brand_match_count = 1 THEN 'YES' ELSE 'NO' END AS "BRAND_MATCH",
  CASE
    WHEN usage_event_count = 1
      AND usage_idempotency_key = 'google_ads:' || operation_request_id || ':keyword_discovery'
      AND scope_event_count = 1
    THEN 'PASS'
    ELSE 'FAIL'
  END AS "IDEMPOTENCY_MATCH",
  duplicate_usage_events AS "DUPLICATE_USAGE_EVENTS",
  CASE WHEN legacy_connection_event_count > 0 THEN 'YES' ELSE 'NO' END AS "LEGACY_CONNECTION_USED_BY_NEW_EVENT",
  historical_google_ads_connection_backed_event_count AS "HISTORICAL_GOOGLE_ADS_CONNECTION_BACKED_EVENT_COUNT",
  CASE
    WHEN discovery_run_count = 1
      AND source = 'google_ads'
      AND provider = 'google_ads'
      AND status = 'completed'
      AND usage_event_count = 1
      AND succeeded_event_count = 1
      AND infrastructure_backed_event_count = 1
      AND capability_present_event_count = 1
      AND technical_operation_match_count = 1
      AND actor_match_count = 1
      AND agency_match_count = 1
      AND brand_match_count = 1
      AND scope_event_count = 1
      AND duplicate_usage_events = 0
      AND legacy_connection_event_count = 0
    THEN 'PASS'
    ELSE 'FAIL'
  END AS "REMOTE_READBACK",
  '0'::text AS "REAL_PROVIDER_CALLS",
  'NO'::text AS "REMOTE_WRITES"
FROM final_diagnostic;
