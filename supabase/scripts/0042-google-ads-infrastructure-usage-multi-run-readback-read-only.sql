-- Diagnóstico read-only de Usage infrastructure-backed para três runs Google Ads Discovery pós-0042.
--
-- Uma linha é retornada para cada operation_request_id solicitado. Os campos
-- de resumo são repetidos em cada linha para preservar um único result set.
-- Não chama provider, não executa RPC, DML ou DDL e não altera schema ou dados.

WITH
requested_operation_ids AS (
  SELECT unnest(ARRAY[
    'aed72e2c-8ac7-4fe4-9f9b-2aece66b92ba',
    'dc2a33f7-beab-474f-88fb-c6f046b49ff9',
    'e246be2e-331b-466b-8696-38e69c7cb097'
  ]::uuid[]) AS operation_request_id
),
target_runs AS (
  SELECT
    requested.operation_request_id,
    r.id AS run_id,
    r.brand_id AS run_brand_id,
    r.actor_user_id AS run_actor_user_id,
    r.source AS run_source,
    r.provider AS run_provider,
    r.provider_version AS run_provider_version,
    r.status AS run_status,
    r.received_count,
    r.approved_count,
    r.filtered_count
  FROM requested_operation_ids AS requested
  LEFT JOIN public.minerador_discovery_runs AS r
    ON r.operation_request_id = requested.operation_request_id
),
authorized_agency_context AS (
  SELECT
    r.operation_request_id,
    count(*) FILTER (WHERE ab.status = 'active')::bigint AS active_agency_count,
    min(ab.agency_id::text) FILTER (WHERE ab.status = 'active') AS active_agency_id
  FROM target_runs AS r
  LEFT JOIN public.agency_brands AS ab
    ON ab.brand_id = r.run_brand_id
  GROUP BY r.operation_request_id
),
correlated_usage_events AS (
  SELECT
    r.operation_request_id,
    u.id AS usage_event_id,
    u.actor_user_id AS usage_actor_user_id,
    u.agency_id AS usage_agency_id,
    u.brand_id AS usage_brand_id,
    u.provider_id AS usage_provider_id,
    u.connection_id AS usage_connection_id,
    u.capability_id AS usage_capability_id,
    u.result_status AS usage_status,
    u.environment AS usage_environment,
    u.idempotency_key AS usage_idempotency_key,
    p.provider_key AS usage_provider,
    cap.capability_key,
    cap.operation_kind AS capability_operation_kind,
    u.operation_kind,
    u.module
  FROM target_runs AS r
  LEFT JOIN public.integration_usage_events AS u
    ON r.run_id IS NOT NULL
   AND u.idempotency_key = 'google_ads:' || r.operation_request_id::text || ':keyword_discovery'
  LEFT JOIN public.integration_providers AS p
    ON p.id = u.provider_id
  LEFT JOIN public.integration_capabilities AS cap
    ON cap.id = u.capability_id
),
usage_summary AS (
  SELECT
    r.operation_request_id,
    count(cue.usage_event_id)::bigint AS usage_event_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_status = 'succeeded')::bigint AS succeeded_usage_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_provider = 'google_ads')::bigint AS google_ads_provider_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_connection_id IS NULL)::bigint AS null_connection_usage_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_connection_id IS NOT NULL)::bigint AS legacy_connection_usage_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_capability_id IS NOT NULL)::bigint AS capability_present_count,
    count(cue.usage_event_id) FILTER (
      WHERE cue.capability_key = 'google_ads_keyword_discovery'
        AND cue.capability_operation_kind = 'keyword_discovery'
        AND cue.operation_kind = 'module_operation'
        AND cue.module = 'minerador'
    )::bigint AS technical_operation_match_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_actor_user_id = r.run_actor_user_id)::bigint AS actor_match_count,
    count(cue.usage_event_id) FILTER (WHERE cue.usage_brand_id = r.run_brand_id)::bigint AS brand_match_count,
    count(cue.usage_event_id) FILTER (
      WHERE cue.usage_agency_id::text = aac.active_agency_id
        AND aac.active_agency_count = 1
    )::bigint AS agency_match_count,
    max(cue.usage_status) AS usage_status,
    max(cue.usage_provider) AS usage_provider,
    max(cue.usage_connection_id::text) AS usage_connection_id,
    max(cue.usage_capability_id::text) AS usage_capability_id,
    max(cue.usage_actor_user_id::text) AS usage_actor_user_id,
    max(cue.usage_agency_id::text) AS usage_agency_id,
    max(cue.usage_brand_id::text) AS usage_brand_id,
    max(cue.usage_environment) AS usage_environment,
    max(cue.usage_idempotency_key) AS usage_idempotency_key
  FROM target_runs AS r
  LEFT JOIN authorized_agency_context AS aac
    ON aac.operation_request_id = r.operation_request_id
  LEFT JOIN correlated_usage_events AS cue
    ON cue.operation_request_id = r.operation_request_id
  GROUP BY r.operation_request_id, r.run_actor_user_id, r.run_brand_id, aac.active_agency_count, aac.active_agency_id
),
infrastructure_idempotency_scope_rows AS (
  SELECT
    cue.operation_request_id,
    cue.usage_provider_id,
    cue.usage_environment,
    cue.usage_idempotency_key,
    count(*)::bigint AS events_in_scope
  FROM correlated_usage_events AS cue
  WHERE cue.usage_event_id IS NOT NULL
    AND cue.usage_connection_id IS NULL
  GROUP BY cue.operation_request_id, cue.usage_provider_id, cue.usage_environment, cue.usage_idempotency_key
),
idempotency_summary AS (
  SELECT
    requested.operation_request_id,
    coalesce(max(scope.events_in_scope), 0)::bigint AS infrastructure_scope_event_count,
    coalesce(sum(greatest(scope.events_in_scope - 1, 0)), 0)::bigint AS duplicate_usage_events
  FROM requested_operation_ids AS requested
  LEFT JOIN infrastructure_idempotency_scope_rows AS scope
    ON scope.operation_request_id = requested.operation_request_id
  GROUP BY requested.operation_request_id
),
per_run AS (
  SELECT
    r.*,
    us.usage_event_count,
    us.succeeded_usage_count,
    us.google_ads_provider_count,
    us.null_connection_usage_count,
    us.legacy_connection_usage_count,
    us.capability_present_count,
    us.technical_operation_match_count,
    us.actor_match_count,
    us.brand_match_count,
    us.agency_match_count,
    us.usage_status,
    us.usage_provider,
    us.usage_connection_id,
    us.usage_capability_id,
    us.usage_actor_user_id,
    us.usage_agency_id,
    us.usage_brand_id,
    us.usage_environment,
    us.usage_idempotency_key,
    ids.infrastructure_scope_event_count,
    ids.duplicate_usage_events,
    CASE
      WHEN r.run_id IS NOT NULL
        AND r.run_source = 'google_ads'
        AND r.run_provider = 'google_ads'
        AND r.run_status = 'completed'
        AND us.usage_event_count = 1
        AND us.succeeded_usage_count = 1
        AND us.google_ads_provider_count = 1
        AND us.null_connection_usage_count = 1
        AND us.legacy_connection_usage_count = 0
        AND us.capability_present_count = 1
        AND us.technical_operation_match_count = 1
        AND us.actor_match_count = 1
        AND us.brand_match_count = 1
        AND us.agency_match_count = 1
        AND ids.infrastructure_scope_event_count = 1
        AND ids.duplicate_usage_events = 0
      THEN 'PASS'
      ELSE 'FAIL'
    END AS run_contract_status
  FROM target_runs AS r
  JOIN usage_summary AS us
    ON us.operation_request_id = r.operation_request_id
  JOIN idempotency_summary AS ids
    ON ids.operation_request_id = r.operation_request_id
),
summary AS (
  SELECT
    count(*)::bigint AS runs_checked,
    count(*) FILTER (WHERE usage_event_count = 1)::bigint AS runs_with_usage,
    count(*) FILTER (WHERE succeeded_usage_count = 1)::bigint AS runs_with_succeeded_usage,
    count(*) FILTER (WHERE null_connection_usage_count = 1)::bigint AS runs_with_null_connection_usage,
    count(*) FILTER (WHERE duplicate_usage_events > 0)::bigint AS runs_with_duplicate_usage,
    count(*) FILTER (WHERE legacy_connection_usage_count > 0)::bigint AS runs_using_legacy_connection,
    CASE WHEN count(*) = 3 AND bool_and(run_contract_status = 'PASS') THEN 'PASS' ELSE 'FAIL' END AS remote_readback
  FROM per_run
)
SELECT
  pr.operation_request_id AS "OPERATION_REQUEST_ID",
  pr.run_id AS "RUN_ID",
  pr.run_status AS "RUN_STATUS",
  pr.received_count AS "RECEIVED_COUNT",
  pr.approved_count AS "APPROVED_COUNT",
  pr.filtered_count AS "FILTERED_COUNT",
  pr.usage_event_count AS "USAGE_EVENT_COUNT",
  pr.usage_status AS "USAGE_STATUS",
  pr.usage_provider AS "USAGE_PROVIDER",
  pr.usage_connection_id AS "USAGE_CONNECTION_ID",
  CASE WHEN pr.usage_event_count = 1 AND pr.null_connection_usage_count = 1 THEN 'YES' ELSE 'NO' END AS "USAGE_CONNECTION_ID_IS_NULL",
  pr.usage_capability_id AS "USAGE_CAPABILITY_ID",
  CASE WHEN pr.usage_event_count = 1 AND pr.capability_present_count = 1 THEN 'YES' ELSE 'NO' END AS "USAGE_CAPABILITY_PRESENT",
  pr.usage_actor_user_id AS "USAGE_ACTOR_USER_ID",
  pr.usage_agency_id AS "USAGE_AGENCY_ID",
  pr.usage_brand_id AS "USAGE_BRAND_ID",
  pr.usage_environment AS "USAGE_ENVIRONMENT",
  pr.usage_idempotency_key AS "USAGE_IDEMPOTENCY_KEY",
  CASE WHEN pr.usage_event_count = 1 AND pr.actor_match_count = 1 THEN 'YES' ELSE 'NO' END AS "ACTOR_MATCH",
  CASE WHEN pr.usage_event_count = 1 AND pr.brand_match_count = 1 THEN 'YES' ELSE 'NO' END AS "BRAND_MATCH",
  CASE WHEN pr.usage_event_count = 1 AND pr.agency_match_count = 1 THEN 'YES' ELSE 'NO' END AS "AGENCY_MATCH",
  CASE
    WHEN pr.usage_event_count = 1
      AND pr.usage_idempotency_key = 'google_ads:' || pr.operation_request_id::text || ':keyword_discovery'
      AND pr.infrastructure_scope_event_count = 1
      AND pr.duplicate_usage_events = 0
    THEN 'PASS'
    ELSE 'FAIL'
  END AS "IDEMPOTENCY_MATCH",
  pr.duplicate_usage_events AS "DUPLICATE_USAGE_EVENTS",
  CASE WHEN pr.legacy_connection_usage_count > 0 THEN 'YES' ELSE 'NO' END AS "LEGACY_CONNECTION_USED",
  pr.run_contract_status AS "RUN_CONTRACT_STATUS",
  s.runs_checked AS "RUNS_CHECKED",
  s.runs_with_usage AS "RUNS_WITH_USAGE",
  s.runs_with_succeeded_usage AS "RUNS_WITH_SUCCEEDED_USAGE",
  s.runs_with_null_connection_usage AS "RUNS_WITH_NULL_CONNECTION_USAGE",
  s.runs_with_duplicate_usage AS "RUNS_WITH_DUPLICATE_USAGE",
  s.runs_using_legacy_connection AS "RUNS_USING_LEGACY_CONNECTION",
  s.remote_readback AS "REMOTE_READBACK",
  '0'::text AS "REAL_PROVIDER_CALLS",
  'NO'::text AS "REMOTE_WRITES"
FROM per_run AS pr
CROSS JOIN summary AS s
ORDER BY pr.operation_request_id;
