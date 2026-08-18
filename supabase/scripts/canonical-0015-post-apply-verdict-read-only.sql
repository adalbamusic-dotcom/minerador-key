-- Fase 1 / 0015: parecer unificado pós-aplicação.
-- SOMENTE LEITURA. Não retorna dados pessoais, UUIDs, tokens ou conteúdo editorial.

WITH schema_state AS (
  SELECT
    count(*) FILTER (WHERE table_name = 'brand_memberships' AND column_name = 'user_id') AS competing_brand_user_id_columns,
    count(*) FILTER (WHERE table_name = 'agencies' AND column_name = 'owner_user_id' AND is_nullable = 'NO') AS canonical_owner_columns,
    count(*) FILTER (WHERE table_name = 'agency_memberships' AND column_name = 'canonical_role' AND is_nullable = 'NO') AS canonical_role_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'brand_memberships' AND column_name = 'user_id')
      OR (table_name = 'agencies' AND column_name = 'owner_user_id')
      OR (table_name = 'agency_memberships' AND column_name = 'canonical_role')
    )
), data_state AS (
  SELECT
    (SELECT count(*) FROM public.brand_memberships WHERE member_user_id IS NULL) AS memberships_without_canonical_uuid,
    (SELECT count(*) FROM public.agencies a
     WHERE nullif(to_jsonb(a) ->> 'owner_user_id', '') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = nullif(to_jsonb(a) ->> 'owner_user_id', '')::uuid
        )
    ) AS invalid_agency_owners,
    (SELECT count(*) FROM public.agency_memberships am
     WHERE nullif(to_jsonb(am) ->> 'canonical_role', '') NOT IN ('agency_admin', 'agency_member')
        OR nullif(to_jsonb(am) ->> 'canonical_role', '') IS NULL
    ) AS invalid_canonical_roles,
    (SELECT count(*) FROM (
       SELECT brand_id FROM public.agency_brands
       WHERE status = 'active'
       GROUP BY brand_id HAVING count(*) > 1
     ) duplicate_active_link
    ) AS duplicate_active_agency_brands
), index_state AS (
  SELECT count(*) FILTER (
    WHERE indexname = 'uq_agency_brands_active_brand_0014'
      AND indexdef ILIKE '%UNIQUE INDEX%'
      AND indexdef ILIKE '%ON public.agency_brands%'
      AND indexdef ILIKE '%(brand_id)%'
      AND indexdef ILIKE '%WHERE (status = ''active''%'
  ) AS expected_0014_indexes
  FROM pg_catalog.pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'agency_brands'
), function_state AS (
  SELECT
    count(*) AS canonical_functions_found,
    count(*) FILTER (
      WHERE NOT p.prosecdef
         OR NOT EXISTS (
           SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting_value
           WHERE setting_value = 'search_path=pg_catalog, public, pg_temp'
         )
         OR has_function_privilege('anon', p.oid, 'EXECUTE')
         OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
         OR pg_get_functiondef(p.oid) ILIKE '%user_key%'
         OR pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
         OR pg_get_functiondef(p.oid) ILIKE '%is_global_admin()%'
         OR (p.proname IN ('canonical_can_access_brand', 'canonical_can_manage_brand')
             AND pg_get_functiondef(p.oid) NOT ILIKE '%member_user_id = auth.uid()%')
         OR (p.proname IN ('canonical_can_access_brand', 'canonical_can_manage_brand', 'canonical_can_access_agency', 'canonical_can_manage_agency')
             AND pg_get_functiondef(p.oid) ILIKE '%canonical_is_platform_admin%')
    ) AS canonical_function_contract_failures
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN (
      'canonical_is_platform_admin',
      'canonical_can_access_brand',
      'canonical_can_manage_brand',
      'canonical_can_access_agency',
      'canonical_can_manage_agency'
    )
)
SELECT
  CASE WHEN s.canonical_owner_columns = 1 AND s.canonical_role_columns = 1
         THEN 'POST_MIGRATION_SCHEMA_PRESENT' ELSE 'BLOCKED' END AS validation_phase,
  s.competing_brand_user_id_columns,
  d.memberships_without_canonical_uuid,
  d.invalid_agency_owners,
  d.invalid_canonical_roles,
  i.expected_0014_indexes,
  d.duplicate_active_agency_brands,
  f.canonical_functions_found,
  f.canonical_function_contract_failures,
  CASE WHEN f.canonical_functions_found = 5 AND f.canonical_function_contract_failures = 0
         THEN 'OK' ELSE 'BLOCKED' END AS canonical_functions_security,
  CASE WHEN f.canonical_functions_found = 5 AND f.canonical_function_contract_failures = 0
         THEN 'OK' ELSE 'BLOCKED' END AS public_execute_revoked,
  CASE WHEN f.canonical_functions_found = 5 AND f.canonical_function_contract_failures = 0
         THEN 'OK' ELSE 'BLOCKED' END AS authenticated_grants,
  CASE WHEN f.canonical_functions_found = 5 AND f.canonical_function_contract_failures = 0
         THEN 'OK' ELSE 'BLOCKED' END AS service_role_grants,
  CASE WHEN f.canonical_functions_found = 5 AND f.canonical_function_contract_failures = 0
         THEN 'OK' ELSE 'BLOCKED' END AS admin_without_editorial_access,
  CASE
    WHEN s.canonical_owner_columns = 1
     AND s.canonical_role_columns = 1
     AND s.competing_brand_user_id_columns = 0
     AND d.memberships_without_canonical_uuid = 0
     AND d.invalid_agency_owners = 0
     AND d.invalid_canonical_roles = 0
     AND i.expected_0014_indexes = 1
     AND d.duplicate_active_agency_brands = 0
     AND f.canonical_functions_found = 5
     AND f.canonical_function_contract_failures = 0
    THEN 'OK' ELSE 'BLOCKED' END AS post_migration_validation
FROM schema_state s
CROSS JOIN data_state d
CROSS JOIN index_state i
CROSS JOIN function_state f;
