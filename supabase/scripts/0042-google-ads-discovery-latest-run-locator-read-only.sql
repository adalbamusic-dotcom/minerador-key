-- Localizador read-only dos últimos Google Ads Discovery runs.
--
-- Use este result set para obter operation_request_id antes de executar o
-- diagnóstico de Usage infrastructure-backed da 0042. Não resolve tenant por
-- nome ou slug e não chama provider, RPC, DML ou DDL.

WITH latest_google_ads_discovery_runs AS (
  SELECT
    r.id,
    r.operation_request_id,
    r.brand_id,
    r.actor_user_id,
    r.source,
    r.provider,
    r.provider_version,
    r.status,
    r.received_count,
    r.normalized_count,
    r.approved_count,
    r.filtered_count,
    r.executed_at,
    r.completed_at,
    r.created_at
  FROM public.minerador_discovery_runs AS r
  WHERE r.source = 'google_ads'
    AND r.provider = 'google_ads'
  ORDER BY r.executed_at DESC, r.id DESC
  LIMIT 5
)
SELECT
  id AS "RUN_ID",
  operation_request_id AS "OPERATION_REQUEST_ID",
  brand_id AS "BRAND_ID",
  actor_user_id AS "ACTOR_USER_ID",
  source AS "SOURCE",
  provider AS "PROVIDER",
  provider_version AS "PROVIDER_VERSION",
  status AS "STATUS",
  received_count AS "RECEIVED_COUNT",
  normalized_count AS "NORMALIZED_COUNT",
  approved_count AS "APPROVED_COUNT",
  filtered_count AS "FILTERED_COUNT",
  executed_at AS "EXECUTED_AT",
  completed_at AS "COMPLETED_AT",
  created_at AS "CREATED_AT"
FROM latest_google_ads_discovery_runs;
