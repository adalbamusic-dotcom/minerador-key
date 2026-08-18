-- Diagnóstico read-only do smoke Google Ads Discovery já executado.
--
-- Escopo: somente SELECT/CTE. Este arquivo não chama provider, não executa
-- RPC e não altera schema ou dados.
--
-- A seleção usa o timestamp informado. Se não houver correspondência exata,
-- aceita somente um único run Google Ads no intervalo de +/- 5 minutos cuja
-- distância ao instante alvo seja única. Em caso de ambiguidade, o diagnóstico
-- não escolhe um run arbitrariamente.
--
-- Usage só é considerado correspondente quando o evento canônico contém uma
-- referência explícita ao run ou à operation_request_id no metadata. O schema
-- canônico de integration_usage_events não possui uma FK para Discovery.

WITH
parameters AS (
  SELECT timestamptz '2026-08-16T23:45:14.346Z' AS target_executed_at
),
exact_runs AS (
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
    r.completed_at,
    r.currency_code,
    r.time_zone,
    0::numeric AS distance_seconds
  FROM public.minerador_discovery_runs AS r
  CROSS JOIN parameters AS p
  WHERE r.source = 'google_ads'
    AND r.executed_at = p.target_executed_at
),
nearby_runs AS (
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
    r.completed_at,
    r.currency_code,
    r.time_zone,
    abs(extract(epoch FROM (r.executed_at - p.target_executed_at)))::numeric AS distance_seconds
  FROM public.minerador_discovery_runs AS r
  CROSS JOIN parameters AS p
  WHERE r.source = 'google_ads'
    AND r.executed_at BETWEEN p.target_executed_at - interval '5 minutes'
                          AND p.target_executed_at + interval '5 minutes'
),
nearest_distance AS (
  SELECT min(distance_seconds) AS distance_seconds
  FROM nearby_runs
),
nearest_unique_run AS (
  SELECT n.*
  FROM nearby_runs AS n
  CROSS JOIN nearest_distance AS d
  WHERE n.distance_seconds = d.distance_seconds
    AND (
      SELECT count(*)
      FROM nearby_runs AS same_distance
      WHERE same_distance.distance_seconds = d.distance_seconds
    ) = 1
),
selected_runs AS (
  SELECT e.*
  FROM exact_runs AS e
  UNION ALL
  SELECT n.*
  FROM nearest_unique_run AS n
  WHERE NOT EXISTS (SELECT 1 FROM exact_runs)
),
run_summary AS (
  SELECT
    count(*)::bigint AS discovery_run_count,
    CASE WHEN count(*) > 0 THEN 'YES' ELSE 'NO' END::text AS discovery_run_found,
    CASE WHEN count(*) = 1 THEN min(id::text) ELSE NULL END AS run_id,
    CASE WHEN count(*) = 1 THEN min(brand_id::text) ELSE NULL END AS brand_id,
    CASE WHEN count(*) = 1 THEN min(actor_user_id::text) ELSE NULL END AS actor_user_id,
    CASE WHEN count(*) = 1 THEN min(operation_request_id::text) ELSE NULL END AS operation_request_id,
    CASE WHEN count(*) = 1 THEN min(source) ELSE NULL END AS source,
    CASE WHEN count(*) = 1 THEN min(provider) ELSE NULL END AS provider,
    CASE WHEN count(*) = 1 THEN min(provider_version) ELSE NULL END AS provider_version,
    CASE WHEN count(*) = 1 THEN min(status) ELSE NULL END AS status,
    CASE WHEN count(*) = 1 THEN min(received_count) ELSE NULL END AS received_count,
    CASE WHEN count(*) = 1 THEN min(normalized_count) ELSE NULL END AS normalized_count,
    CASE WHEN count(*) = 1 THEN min(approved_count) ELSE NULL END AS approved_count,
    CASE WHEN count(*) = 1 THEN min(filtered_count) ELSE NULL END AS filtered_count,
    CASE WHEN count(*) = 1 THEN min(executed_at) ELSE NULL END AS executed_at,
    CASE WHEN count(*) = 1 THEN min(completed_at) ELSE NULL END AS completed_at,
    CASE WHEN count(*) = 1 THEN min(currency_code) ELSE NULL END AS currency_code,
    CASE WHEN count(*) = 1 THEN min(time_zone) ELSE NULL END AS time_zone
  FROM selected_runs
),
candidate_summary AS (
  SELECT
    count(c.id)::bigint AS candidates_total,
    count(c.id) FILTER (WHERE c.filter_outcome = 'approved')::bigint AS candidates_approved,
    count(c.id) FILTER (WHERE c.filter_outcome = 'out_of_relation')::bigint AS candidates_out_of_relation,
    count(c.id) FILTER (
      WHERE c.filter_outcome IS NOT NULL
        AND c.filter_outcome NOT IN ('approved', 'out_of_relation')
    )::bigint AS candidates_other_filter_outcomes,
    count(*) FILTER (
      WHERE c.id IS NOT NULL
        AND c.brand_id IS DISTINCT FROM r.brand_id
    )::bigint AS cross_brand_rows,
    CASE
      WHEN count(c.id) = 0 THEN 'YES'
      WHEN bool_and(c.brand_id = r.brand_id) THEN 'YES'
      ELSE 'NO'
    END::text AS tenant_match_all_candidates,
    coalesce(
      jsonb_object_agg(c.filter_outcome, outcome_counts.rows_count)
        FILTER (WHERE c.filter_outcome IS NOT NULL),
      '{}'::jsonb
    ) AS candidates_filter_outcomes,
    coalesce(array_agg(DISTINCT c.source) FILTER (WHERE c.id IS NOT NULL), ARRAY[]::text[]) AS candidate_source_values,
    coalesce(array_agg(DISTINCT c.provider) FILTER (WHERE c.id IS NOT NULL), ARRAY[]::text[]) AS candidate_provider_values,
    coalesce(array_agg(DISTINCT c.provider_version) FILTER (WHERE c.id IS NOT NULL), ARRAY[]::text[]) AS candidate_provider_version_values
  FROM selected_runs AS r
  LEFT JOIN public.minerador_discovery_candidates AS c
    ON c.discovery_run_id = r.id
  LEFT JOIN (
    SELECT
      c2.discovery_run_id,
      c2.filter_outcome,
      count(*)::bigint AS rows_count
    FROM public.minerador_discovery_candidates AS c2
    JOIN selected_runs AS r2 ON r2.id = c2.discovery_run_id
    GROUP BY c2.discovery_run_id, c2.filter_outcome
  ) AS outcome_counts
    ON outcome_counts.discovery_run_id = c.discovery_run_id
   AND outcome_counts.filter_outcome = c.filter_outcome
),
usage_matches AS (
  SELECT DISTINCT
    r.id AS run_id,
    u.id AS usage_event_id
  FROM selected_runs AS r
  JOIN public.integration_usage_events AS u
    ON u.brand_id = r.brand_id
   AND u.operation_kind = 'module_operation'
   AND u.module = 'minerador'
   AND (
     u.metadata ->> 'discovery_run_id' = r.id::text
     OR u.metadata ->> 'operation_request_id' = r.operation_request_id::text
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
    CASE
      WHEN (SELECT discovery_run_count FROM run_summary) <> 1 THEN 'NOT_VERIFIABLE'
      WHEN EXISTS (SELECT 1 FROM usage_matches) THEN 'YES'
      ELSE 'NO'
    END::text AS usage_recorded,
    count(*)::bigint AS explicit_usage_match_count
  FROM usage_matches
)
SELECT
  rs.discovery_run_found AS "DISCOVERY_RUN_FOUND",
  rs.discovery_run_count AS "DISCOVERY_RUN_COUNT",
  rs.run_id AS "RUN_ID",
  rs.brand_id AS "BRAND_ID",
  rs.actor_user_id AS "ACTOR_USER_ID",
  rs.operation_request_id AS "OPERATION_REQUEST_ID",
  rs.source AS "SOURCE",
  rs.provider AS "PROVIDER",
  rs.provider_version AS "PROVIDER_VERSION",
  rs.status AS "STATUS",
  rs.received_count AS "RECEIVED_COUNT",
  rs.normalized_count AS "NORMALIZED_COUNT",
  rs.approved_count AS "APPROVED_COUNT",
  rs.filtered_count AS "FILTERED_COUNT",
  rs.executed_at AS "EXECUTED_AT",
  rs.completed_at AS "COMPLETED_AT",
  rs.currency_code AS "CURRENCY_CODE",
  rs.time_zone AS "TIME_ZONE",
  cs.candidates_total AS "CANDIDATES_TOTAL",
  cs.candidates_approved AS "CANDIDATES_APPROVED",
  cs.candidates_out_of_relation AS "CANDIDATES_OUT_OF_RELATION",
  cs.candidates_other_filter_outcomes AS "CANDIDATES_OTHER_FILTER_OUTCOMES",
  cs.candidates_filter_outcomes AS "CANDIDATES_FILTER_OUTCOMES",
  cs.candidate_source_values AS "CANDIDATE_SOURCE_VALUES",
  cs.candidate_provider_values AS "CANDIDATE_PROVIDER_VALUES",
  cs.candidate_provider_version_values AS "CANDIDATE_PROVIDER_VERSION_VALUES",
  cs.tenant_match_all_candidates AS "TENANT_MATCH_ALL_CANDIDATES",
  cs.cross_brand_rows AS "CROSS_BRAND_ROWS",
  CASE
    WHEN rs.discovery_run_count = 1
      AND rs.source = 'google_ads'
      AND rs.provider = 'google_ads'
      AND cs.tenant_match_all_candidates = 'YES'
      AND cs.cross_brand_rows = 0
      AND cs.candidates_total = coalesce(rs.normalized_count, 0)
      AND cs.candidates_approved = coalesce(rs.approved_count, 0)
      AND cs.candidates_out_of_relation + cs.candidates_other_filter_outcomes
          = coalesce(rs.filtered_count, 0)
    THEN 'PASS'
    ELSE 'FAIL'
  END AS "REMOTE_READBACK",
  'NOT_VERIFIABLE'::text AS "UI_SUMMARY_MATCHES_REMOTE",
  us.usage_recorded AS "USAGE_RECORDED",
  us.explicit_usage_match_count AS "EXPLICIT_USAGE_MATCH_COUNT",
  'NO'::text AS "GOOGLE_ADS_CALLED_AGAIN",
  'NO'::text AS "REMOTE_WRITES"
FROM run_summary AS rs
CROSS JOIN candidate_summary AS cs
CROSS JOIN usage_summary AS us;
