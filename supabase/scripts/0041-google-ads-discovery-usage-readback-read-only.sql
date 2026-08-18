-- Diagnóstico read-only do Usage do próximo smoke Google Ads Discovery.
--
-- Executar somente depois do smoke. O alvo é o run Google Ads concluído mais
-- recente; a correlação é feita pelo operation_request_id persistido no run e
-- pelo metadata/connection do evento canônico de Usage.
--
-- Este arquivo contém somente SELECT/CTE. Não chama provider, não executa RPC,
-- não usa DML/DDL e não altera schema ou dados.

WITH
latest_run AS (
  SELECT
    r.id,
    r.brand_id,
    r.actor_user_id,
    r.operation_request_id,
    r.source,
    r.provider,
    r.provider_version,
    r.status,
    r.executed_at,
    r.completed_at
  FROM public.minerador_discovery_runs AS r
  WHERE r.source = 'google_ads'
    AND r.status IN ('completed', 'partial')
  ORDER BY r.executed_at DESC, r.id DESC
  LIMIT 1
),
active_agencies AS (
  SELECT
    r.id AS run_id,
    count(DISTINCT ab.agency_id)::bigint AS agency_count,
    coalesce(array_agg(DISTINCT ab.agency_id::text) FILTER (WHERE ab.agency_id IS NOT NULL), ARRAY[]::text[]) AS agency_ids
  FROM latest_run AS r
  LEFT JOIN public.agency_brands AS ab
    ON ab.brand_id = r.brand_id
   AND ab.status = 'active'
  GROUP BY r.id
),
usage_matches AS (
  SELECT DISTINCT
    r.id AS run_id,
    r.brand_id AS run_brand_id,
    r.actor_user_id AS run_actor_user_id,
    r.operation_request_id,
    u.id AS usage_event_id,
    u.actor_user_id,
    u.agency_id,
    u.brand_id,
    u.operation_kind,
    u.module,
    u.environment,
    u.units,
    u.unit_name,
    u.result_status,
    u.error_code,
    u.provider_request_ref,
    u.idempotency_key,
    u.metadata,
    u.occurred_at,
    p.provider_key,
    cap.capability_key,
    cap.operation_kind AS capability_operation_kind
  FROM latest_run AS r
  JOIN public.integration_usage_events AS u
    ON u.brand_id = r.brand_id
   AND u.operation_kind = 'module_operation'
   AND u.module = 'minerador'
   AND (
     u.metadata ->> 'operationRequestId' = r.operation_request_id::text
     OR u.metadata ->> 'operation_request_id' = r.operation_request_id::text
     OR u.metadata ->> 'discoveryRunId' = r.id::text
     OR u.metadata ->> 'discovery_run_id' = r.id::text
   )
  JOIN public.integration_providers AS p
    ON p.id = u.provider_id
   AND p.provider_key = 'google_ads'
  JOIN public.integration_capabilities AS cap
    ON cap.id = u.capability_id
   AND cap.capability_key = 'google_ads_keyword_discovery'
   AND cap.operation_kind = 'keyword_discovery'
),
usage_summary AS (
  SELECT
    count(u.usage_event_id)::bigint AS usage_event_count,
    count(u.usage_event_id) FILTER (WHERE u.result_status = 'succeeded')::bigint AS succeeded_event_count,
    count(u.usage_event_id) FILTER (WHERE u.idempotency_key = 'google_ads:' || r.operation_request_id::text || ':keyword_discovery')::bigint AS expected_idempotency_key_count,
    max(u.actor_user_id::text) AS usage_actor_user_id,
    max(u.agency_id::text) AS usage_agency_id,
    max(u.brand_id::text) AS usage_brand_id,
    max(u.provider_key) AS usage_provider,
    max(u.metadata ->> 'providerVersion') AS usage_provider_version,
    max(u.capability_key) AS usage_capability,
    max(u.capability_operation_kind) AS usage_capability_operation,
    max(u.operation_kind) AS usage_operation,
    max(u.module) AS usage_module,
    max(u.environment) AS usage_environment,
    max(u.units)::numeric AS usage_units,
    max(u.unit_name) AS usage_unit_name,
    max(u.result_status) AS usage_status,
    max(u.error_code) AS usage_error_code,
    max(u.provider_request_ref) AS usage_provider_request_ref,
    max(u.idempotency_key) AS usage_idempotency_key,
    max(u.occurred_at) AS usage_occurred_at,
    CASE
      WHEN count(u.usage_event_id) = 0 THEN 'NOT_VERIFIABLE'
      WHEN count(u.usage_event_id) > 1 THEN 'NO'
      WHEN max(u.actor_user_id::text) = r.actor_user_id::text THEN 'YES'
      ELSE 'NO'
    END::text AS actor_match,
    CASE
      WHEN count(u.usage_event_id) = 0 OR max(aa.agency_count) = 0 THEN 'NOT_VERIFIABLE'
      WHEN max(u.agency_id::text) = ANY(aa.agency_ids) THEN 'YES'
      ELSE 'NO'
    END::text AS agency_match,
    CASE
      WHEN count(u.usage_event_id) = 0 THEN 'NOT_VERIFIABLE'
      WHEN max(u.brand_id::text) = r.brand_id::text THEN 'YES'
      ELSE 'NO'
    END::text AS brand_match,
    CASE
      WHEN count(u.usage_event_id) = 0 THEN 'NOT_VERIFIABLE'
      WHEN count(u.usage_event_id) = 1
       AND max(u.result_status) = 'succeeded'
       AND count(u.usage_event_id) FILTER (WHERE u.idempotency_key = 'google_ads:' || r.operation_request_id::text || ':keyword_discovery') = 1
      THEN 'YES'
      ELSE 'NO'
    END::text AS usage_recorded
  FROM latest_run AS r
  LEFT JOIN active_agencies AS aa
    ON aa.run_id = r.id
  LEFT JOIN usage_matches AS u
    ON u.run_id = r.id
  GROUP BY r.id, r.operation_request_id, r.actor_user_id, r.brand_id, aa.agency_count, aa.agency_ids
),
final_diagnostic AS (
  SELECT
    CASE WHEN count(r.id) = 1 THEN 'YES' ELSE 'NO' END::text AS discovery_run_found,
    count(r.id)::bigint AS discovery_run_count,
    max(r.id::text) AS run_id,
    max(r.operation_request_id::text) AS operation_request_id,
    max(r.brand_id::text) AS run_brand_id,
    max(r.actor_user_id::text) AS run_actor_user_id,
    max(r.source) AS run_source,
    max(r.provider) AS run_provider,
    max(r.provider_version) AS run_provider_version,
    max(r.status) AS run_status,
    max(r.executed_at) AS run_executed_at,
    max(r.completed_at) AS run_completed_at,
    coalesce(
      (SELECT agency_ids FROM active_agencies LIMIT 1),
      ARRAY[]::text[]
    ) AS run_active_agency_ids,
    coalesce(max(us.usage_event_count), 0)::bigint AS usage_event_count,
    coalesce(max(us.succeeded_event_count), 0)::bigint AS succeeded_event_count,
    coalesce(max(us.expected_idempotency_key_count), 0)::bigint AS expected_idempotency_key_count,
    max(us.usage_actor_user_id) AS usage_actor_user_id,
    max(us.usage_agency_id) AS usage_agency_id,
    max(us.usage_brand_id) AS usage_brand_id,
    max(us.usage_provider) AS usage_provider,
    max(us.usage_provider_version) AS usage_provider_version,
    max(us.usage_capability) AS usage_capability,
    max(us.usage_capability_operation) AS usage_capability_operation,
    max(us.usage_operation) AS usage_operation,
    max(us.usage_module) AS usage_module,
    max(us.usage_environment) AS usage_environment,
    max(us.usage_units) AS usage_units,
    max(us.usage_unit_name) AS usage_unit_name,
    max(us.usage_status) AS usage_status,
    max(us.usage_error_code) AS usage_error_code,
    max(us.usage_provider_request_ref) AS usage_provider_request_ref,
    max(us.usage_idempotency_key) AS usage_idempotency_key,
    max(us.usage_occurred_at) AS usage_occurred_at,
    coalesce(max(us.actor_match), 'NOT_VERIFIABLE') AS actor_match,
    coalesce(max(us.agency_match), 'NOT_VERIFIABLE') AS agency_match,
    coalesce(max(us.brand_match), 'NOT_VERIFIABLE') AS brand_match,
    coalesce(max(us.usage_recorded), 'NOT_VERIFIABLE') AS usage_recorded
  FROM latest_run AS r
  LEFT JOIN active_agencies AS aa
    ON aa.run_id = r.id
  LEFT JOIN usage_summary AS us
    ON us.run_id = r.id
)
SELECT
  discovery_run_found AS "DISCOVERY_RUN_FOUND",
  discovery_run_count AS "DISCOVERY_RUN_COUNT",
  run_id AS "RUN_ID",
  operation_request_id AS "OPERATION_REQUEST_ID",
  run_brand_id AS "RUN_BRAND_ID",
  run_actor_user_id AS "RUN_ACTOR_USER_ID",
  run_source AS "RUN_SOURCE",
  run_provider AS "RUN_PROVIDER",
  run_provider_version AS "RUN_PROVIDER_VERSION",
  run_status AS "RUN_STATUS",
  run_executed_at AS "RUN_EXECUTED_AT",
  run_completed_at AS "RUN_COMPLETED_AT",
  run_active_agency_ids AS "RUN_ACTIVE_AGENCY_IDS",
  usage_event_count AS "USAGE_EVENT_COUNT",
  succeeded_event_count AS "USAGE_SUCCEEDED_EVENT_COUNT",
  CASE
    WHEN usage_event_count > 1 THEN usage_event_count - 1
    ELSE 0
  END::bigint AS "DUPLICATE_USAGE_EVENTS",
  usage_recorded AS "USAGE_RECORDED",
  usage_status AS "USAGE_STATUS",
  usage_actor_user_id AS "USAGE_ACTOR_USER_ID",
  usage_agency_id AS "USAGE_AGENCY_ID",
  usage_brand_id AS "USAGE_BRAND_ID",
  usage_provider AS "USAGE_PROVIDER",
  usage_provider_version AS "USAGE_PROVIDER_VERSION",
  usage_capability AS "USAGE_CAPABILITY_IDENTIFICATION",
  usage_capability_operation AS "USAGE_CAPABILITY_OPERATION_IDENTIFICATION",
  usage_operation AS "USAGE_OPERATION",
  usage_module AS "USAGE_MODULE",
  usage_environment AS "USAGE_ENVIRONMENT",
  usage_units AS "USAGE_UNITS",
  usage_unit_name AS "USAGE_UNIT_NAME",
  usage_idempotency_key AS "USAGE_IDEMPOTENCY_KEY",
  CASE
    WHEN usage_event_count <> 1 THEN 'NOT_VERIFIABLE'
    WHEN expected_idempotency_key_count = 1 THEN 'YES'
    ELSE 'NO'
  END AS "IDEMPOTENCY_KEY_MATCH",
  actor_match AS "ACTOR_MATCH",
  agency_match AS "AGENCY_MATCH",
  brand_match AS "BRAND_MATCH",
  CASE
    WHEN usage_event_count <> 1 THEN 'NOT_VERIFIABLE'
    WHEN usage_provider = 'google_ads'
     AND usage_capability = 'google_ads_keyword_discovery'
     AND usage_capability_operation = 'keyword_discovery'
    THEN 'YES'
    ELSE 'NO'
  END AS "PROVIDER_AND_OPERATION_MATCH",
  usage_error_code AS "USAGE_ERROR_CODE",
  usage_provider_request_ref AS "USAGE_PROVIDER_REQUEST_REF",
  usage_occurred_at AS "USAGE_OCCURRED_AT",
  CASE
    WHEN discovery_run_count = 1
     AND usage_event_count = 1
     AND succeeded_event_count = 1
     AND usage_recorded = 'YES'
     AND actor_match = 'YES'
     AND agency_match = 'YES'
     AND brand_match = 'YES'
     AND expected_idempotency_key_count = 1
     AND usage_provider = 'google_ads'
     AND usage_capability = 'google_ads_keyword_discovery'
     AND usage_capability_operation = 'keyword_discovery'
     AND usage_operation = 'module_operation'
     AND usage_module = 'minerador'
    THEN 'PASS'
    ELSE 'FAIL'
  END AS "USAGE_READBACK",
  'NO'::text AS "REMOTE_WRITES",
  '0'::text AS "REAL_PROVIDER_CALLS"
FROM final_diagnostic;
