-- Pré-requisitos read-only do runtime de Usage Google Ads pós-0042.
--
-- O runtime atual procura provider_key=google_ads e a capability técnica
-- google_ads_keyword_discovery / keyword_discovery. O ambiente padrão do
-- runtime é production; altere expected_environment apenas se o processo
-- remoto usar GOOGLE_ADS_INTEGRATION_ENVIRONMENT explicitamente.
--
-- Somente WITH/SELECT: não consulta secrets, Vault ou Connection e não
-- executa RPC, DML ou DDL.

WITH
parameters AS (
  SELECT 'production'::text AS expected_environment
),
requested_operations(operation_request_id) AS (
  VALUES
    ('aed72e2c-8ac7-4fe4-9f9b-2aece66b92ba'::uuid),
    ('dc2a33f7-beab-474f-88fb-c6f046b49ff9'::uuid),
    ('e246be2e-331b-466b-8696-38e69c7cb097'::uuid)
),
runs AS (
  SELECT
    requested.operation_request_id,
    r.id AS run_id,
    r.actor_user_id,
    r.brand_id,
    r.source,
    r.provider,
    r.status
  FROM requested_operations AS requested
  LEFT JOIN public.minerador_discovery_runs AS r
    ON r.operation_request_id = requested.operation_request_id
),
run_context AS (
  SELECT
    count(*) FILTER (WHERE run_id IS NOT NULL)::bigint AS runs_found,
    count(DISTINCT actor_user_id)::bigint AS distinct_actor_count,
    count(DISTINCT brand_id)::bigint AS distinct_brand_count,
    min(actor_user_id::text) AS actor_user_id,
    min(brand_id::text) AS brand_id,
    bool_and(source = 'google_ads' AND provider = 'google_ads' AND status = 'completed')
      FILTER (WHERE run_id IS NOT NULL) AS all_runs_are_completed_google_ads
  FROM runs
),
expected_provider AS (
  SELECT
    count(*)::bigint AS provider_count,
    min(id::text) AS provider_id,
    min(status) AS provider_status
  FROM public.integration_providers
  WHERE provider_key = 'google_ads'
),
expected_capability AS (
  SELECT
    count(*)::bigint AS capability_count,
    min(c.id::text) AS capability_id,
    min(c.status) AS capability_status
  FROM public.integration_capabilities AS c
  CROSS JOIN parameters AS p
  WHERE c.capability_key = 'google_ads_keyword_discovery'
    AND c.operation_kind = 'keyword_discovery'
    AND c.environment = p.expected_environment
),
brand_and_actor AS (
  SELECT
    rc.actor_user_id,
    rc.brand_id,
    EXISTS (
      SELECT 1
      FROM public.marcas AS m
      WHERE m.id::text = rc.brand_id
    ) AS brand_exists,
    EXISTS (
      SELECT 1
      FROM public.marcas AS m
      WHERE m.id::text = rc.brand_id
        AND m.owner_user_id::text = rc.actor_user_id
    ) AS actor_is_brand_owner,
    EXISTS (
      SELECT 1
      FROM public.brand_memberships AS bm
      WHERE bm.marca_id::text = rc.brand_id
        AND bm.member_user_id::text = rc.actor_user_id
        AND bm.status = 'active'
    ) AS actor_has_active_brand_membership,
    EXISTS (
      SELECT 1
      FROM public.perfis AS perfis
      WHERE perfis.id::text = rc.actor_user_id
        AND perfis.role = 'admin'
    ) AS actor_is_platform_admin
  FROM run_context AS rc
),
agency_context AS (
  SELECT
    rc.brand_id,
    count(*) FILTER (WHERE ab.status = 'active')::bigint AS active_agency_count,
    min(ab.agency_id::text) FILTER (WHERE ab.status = 'active') AS agency_id,
    EXISTS (
      SELECT 1
      FROM public.agency_memberships AS am
      JOIN public.agency_brands AS linked
        ON linked.agency_id = am.agency_id
       AND linked.brand_id::text = rc.brand_id
       AND linked.status = 'active'
      WHERE am.user_id::text = rc.actor_user_id
        AND am.status = 'active'
    ) AS actor_has_active_agency_path
  FROM run_context AS rc
  LEFT JOIN public.agency_brands AS ab
    ON ab.brand_id::text = rc.brand_id
  GROUP BY rc.brand_id, rc.actor_user_id
),
writer_acl AS (
  SELECT has_table_privilege('service_role', 'public.integration_usage_events', 'INSERT') AS service_role_insert_allowed
),
checks AS (
  SELECT
    rc.runs_found,
    rc.distinct_actor_count,
    rc.distinct_brand_count,
    rc.actor_user_id,
    rc.brand_id,
    rc.all_runs_are_completed_google_ads,
    p.expected_environment,
    ep.provider_count,
    ep.provider_id,
    ep.provider_status,
    ec.capability_count,
    ec.capability_id,
    ec.capability_status,
    ba.brand_exists,
    ba.actor_is_brand_owner,
    ba.actor_has_active_brand_membership,
    ba.actor_is_platform_admin,
    ac.active_agency_count,
    ac.agency_id,
    ac.actor_has_active_agency_path,
    wa.service_role_insert_allowed
  FROM run_context AS rc
  CROSS JOIN parameters AS p
  CROSS JOIN expected_provider AS ep
  CROSS JOIN expected_capability AS ec
  CROSS JOIN brand_and_actor AS ba
  CROSS JOIN agency_context AS ac
  CROSS JOIN writer_acl AS wa
)
SELECT
  runs_found AS "RUNS_FOUND",
  distinct_actor_count AS "DISTINCT_ACTOR_COUNT",
  distinct_brand_count AS "DISTINCT_BRAND_COUNT",
  actor_user_id AS "ACTOR_USER_ID",
  brand_id AS "BRAND_ID",
  CASE WHEN all_runs_are_completed_google_ads THEN 'YES' ELSE 'NO' END AS "RUN_CONTEXT_IS_COMPLETED_GOOGLE_ADS",
  expected_environment AS "EXPECTED_ENVIRONMENT",
  provider_count AS "GOOGLE_ADS_PROVIDER_COUNT",
  provider_id AS "GOOGLE_ADS_PROVIDER_ID",
  provider_status AS "GOOGLE_ADS_PROVIDER_STATUS",
  CASE WHEN provider_count = 1 THEN 'YES' ELSE 'NO' END AS "PROVIDER_RESOLUTION_OK",
  capability_count AS "GOOGLE_ADS_DISCOVERY_CAPABILITY_COUNT",
  capability_id AS "GOOGLE_ADS_DISCOVERY_CAPABILITY_ID",
  capability_status AS "GOOGLE_ADS_DISCOVERY_CAPABILITY_STATUS",
  CASE WHEN capability_count = 1 THEN 'YES' ELSE 'NO' END AS "CAPABILITY_RESOLUTION_OK",
  active_agency_count AS "ACTIVE_AGENCY_COUNT_FOR_BRAND",
  agency_id AS "ACTIVE_AGENCY_ID_FOR_BRAND",
  CASE
    WHEN brand_exists
      AND (actor_is_brand_owner OR actor_has_active_brand_membership OR actor_has_active_agency_path OR actor_is_platform_admin)
      AND active_agency_count <= 1
    THEN 'YES'
    ELSE 'NO'
  END AS "ACTOR_AGENCY_BRAND_CONTEXT_OK",
  CASE WHEN service_role_insert_allowed THEN 'YES' ELSE 'NO' END AS "SERVICE_ROLE_USAGE_INSERT_ACL_OK",
  'NO'::text AS "GOOGLE_ADS_CONNECTION_REQUIRED_BY_RESOLVER",
  'NO'::text AS "GOOGLE_ADS_VAULT_REQUIRED_BY_RESOLVER",
  'NO'::text AS "LEGACY_GRANT_BINDING_REQUIRED_BY_RESOLVER",
  'NO'::text AS "GOOGLE_ADS_QUOTA_REQUIRED_BY_RESOLVER",
  'NO'::text AS "REMOTE_WRITES",
  '0'::text AS "REAL_PROVIDER_CALLS"
FROM checks;
