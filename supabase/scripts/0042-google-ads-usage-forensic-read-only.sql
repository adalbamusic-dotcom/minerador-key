-- Diagnóstico forense read-only de Usage Google Ads pós-0042.
--
-- Retorna os 20 eventos Google Ads mais recentes e uma linha SUMMARY com
-- contagens globais e correlações das três operation_request_id investigadas.
-- A metadata é reduzida a campos de correlação e métricas não secretas.
-- Não consulta Vault, não chama provider, não executa RPC, DML ou DDL.

WITH
requested_operations(operation_request_id) AS (
  VALUES
    ('aed72e2c-8ac7-4fe4-9f9b-2aece66b92ba'::uuid),
    ('dc2a33f7-beab-474f-88fb-c6f046b49ff9'::uuid),
    ('e246be2e-331b-466b-8696-38e69c7cb097'::uuid)
),
requested_run_references AS (
  SELECT
    requested.operation_request_id,
    r.id AS discovery_run_id
  FROM requested_operations AS requested
  LEFT JOIN public.minerador_discovery_runs AS r
    ON r.operation_request_id = requested.operation_request_id
),
all_google_ads_usage_events AS (
  SELECT
    u.id,
    u.occurred_at,
    u.result_status,
    u.connection_id,
    u.capability_id,
    u.agency_id,
    u.brand_id,
    u.operation_kind,
    u.module,
    u.environment,
    u.idempotency_key,
    u.error_code,
    u.provider_request_ref,
    u.metadata
  FROM public.integration_usage_events AS u
  JOIN public.integration_providers AS p
    ON p.id = u.provider_id
  WHERE p.provider_key = 'google_ads'
),
recent_google_ads_usage_events AS (
  SELECT *
  FROM all_google_ads_usage_events
  ORDER BY occurred_at DESC, id DESC
  LIMIT 20
),
totals AS (
  SELECT
    (SELECT count(*)::bigint FROM public.integration_usage_events) AS total_usage_events_current,
    count(*)::bigint AS google_ads_usage_events_current,
    count(*) FILTER (WHERE connection_id IS NOT NULL)::bigint AS google_ads_connection_backed_current,
    count(*) FILTER (WHERE connection_id IS NULL)::bigint AS google_ads_infrastructure_backed_current
  FROM all_google_ads_usage_events
),
correlation_rows AS (
  SELECT
    requested.operation_request_id,
    count(events.id) FILTER (
      WHERE events.idempotency_key = 'google_ads:' || requested.operation_request_id::text || ':keyword_discovery'
    )::bigint AS exact_idempotency_key_matches,
    count(events.id) FILTER (
      WHERE events.metadata ->> 'operationRequestId' = requested.operation_request_id::text
         OR events.metadata ->> 'operation_request_id' = requested.operation_request_id::text
         OR events.metadata ->> 'discoveryRunId' = requested.operation_request_id::text
         OR events.metadata ->> 'discovery_run_id' = requested.operation_request_id::text
    )::bigint AS explicit_metadata_correlation_matches
  FROM requested_run_references AS requested
  LEFT JOIN all_google_ads_usage_events AS events
    ON events.idempotency_key = 'google_ads:' || requested.operation_request_id::text || ':keyword_discovery'
    OR events.metadata ->> 'operationRequestId' = requested.operation_request_id::text
    OR events.metadata ->> 'operation_request_id' = requested.operation_request_id::text
    OR events.metadata ->> 'discoveryRunId' = requested.discovery_run_id::text
    OR events.metadata ->> 'discovery_run_id' = requested.discovery_run_id::text
  GROUP BY requested.operation_request_id
),
correlation_summary AS (
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'operation_request_id', operation_request_id,
        'exact_idempotency_key_matches', exact_idempotency_key_matches,
        'explicit_metadata_correlation_matches', explicit_metadata_correlation_matches
      )
      ORDER BY operation_request_id
    ),
    '[]'::jsonb
  ) AS value
  FROM correlation_rows
),
recent_event_rows AS (
  SELECT
    'EVENT'::text AS row_kind,
    event.id::text AS usage_event_id,
    event.occurred_at,
    event.result_status,
    CASE WHEN event.connection_id IS NULL THEN 'YES' ELSE 'NO' END::text AS connection_id_is_null,
    event.capability_id::text AS capability_id,
    event.agency_id::text AS agency_id,
    event.brand_id::text AS brand_id,
    event.operation_kind,
    event.module,
    event.environment,
    event.idempotency_key,
    event.error_code,
    event.provider_request_ref,
    jsonb_strip_nulls(jsonb_build_object(
      'operationRequestId', event.metadata ->> 'operationRequestId',
      'operation_request_id', event.metadata ->> 'operation_request_id',
      'discoveryRunId', event.metadata ->> 'discoveryRunId',
      'discovery_run_id', event.metadata ->> 'discovery_run_id',
      'provider', event.metadata ->> 'provider',
      'providerVersion', event.metadata ->> 'providerVersion',
      'receivedCount', event.metadata ->> 'receivedCount',
      'normalizedCount', event.metadata ->> 'normalizedCount',
      'approvedCount', event.metadata ->> 'approvedCount',
      'filteredCount', event.metadata ->> 'filteredCount'
    )) AS sanitized_metadata
  FROM recent_google_ads_usage_events AS event
)
SELECT
  event.row_kind AS "ROW_KIND",
  event.usage_event_id AS "ID",
  event.occurred_at AS "OCCURRED_AT",
  event.result_status AS "RESULT_STATUS",
  event.connection_id_is_null AS "CONNECTION_ID_IS_NULL",
  event.capability_id AS "CAPABILITY_ID",
  event.agency_id AS "AGENCY_ID",
  event.brand_id AS "BRAND_ID",
  event.operation_kind AS "OPERATION_KIND",
  event.module AS "MODULE",
  event.environment AS "ENVIRONMENT",
  event.idempotency_key AS "IDEMPOTENCY_KEY",
  event.error_code AS "ERROR_CODE",
  event.provider_request_ref AS "PROVIDER_REQUEST_REF",
  event.sanitized_metadata AS "SANITIZED_METADATA",
  NULL::bigint AS "TOTAL_USAGE_EVENTS_CURRENT",
  NULL::bigint AS "GOOGLE_ADS_USAGE_EVENTS_CURRENT",
  NULL::bigint AS "GOOGLE_ADS_CONNECTION_BACKED_CURRENT",
  NULL::bigint AS "GOOGLE_ADS_INFRASTRUCTURE_BACKED_CURRENT",
  NULL::jsonb AS "CORRELATION_COUNTS"
FROM recent_event_rows AS event

UNION ALL

SELECT
  'SUMMARY'::text AS "ROW_KIND",
  NULL::text AS "ID",
  NULL::timestamptz AS "OCCURRED_AT",
  NULL::text AS "RESULT_STATUS",
  NULL::text AS "CONNECTION_ID_IS_NULL",
  NULL::text AS "CAPABILITY_ID",
  NULL::text AS "AGENCY_ID",
  NULL::text AS "BRAND_ID",
  NULL::text AS "OPERATION_KIND",
  NULL::text AS "MODULE",
  NULL::text AS "ENVIRONMENT",
  NULL::text AS "IDEMPOTENCY_KEY",
  NULL::text AS "ERROR_CODE",
  NULL::text AS "PROVIDER_REQUEST_REF",
  NULL::jsonb AS "SANITIZED_METADATA",
  totals.total_usage_events_current AS "TOTAL_USAGE_EVENTS_CURRENT",
  totals.google_ads_usage_events_current AS "GOOGLE_ADS_USAGE_EVENTS_CURRENT",
  totals.google_ads_connection_backed_current AS "GOOGLE_ADS_CONNECTION_BACKED_CURRENT",
  totals.google_ads_infrastructure_backed_current AS "GOOGLE_ADS_INFRASTRUCTURE_BACKED_CURRENT",
  correlation_summary.value AS "CORRELATION_COUNTS"
FROM totals
CROSS JOIN correlation_summary
ORDER BY "ROW_KIND", "OCCURRED_AT" DESC NULLS LAST, "ID" DESC NULLS LAST;
