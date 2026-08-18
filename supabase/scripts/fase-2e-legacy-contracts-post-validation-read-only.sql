-- FASE 2E. SOMENTE LEITURA. Execute somente apos a aplicacao manual da 0017.
-- Nao retorna e-mails, UUIDs, tokens, segredos, keywords, URLs ou conteudo.

WITH legacy_columns AS (
  SELECT * FROM (VALUES
    ('brand_memberships'::text, 'user_key'::text, 'user_key_column'::text),
    ('perfis'::text, 'marca_id'::text, 'perfis_marca_id_column'::text),
    ('agency_memberships'::text, 'canonical_role'::text, 'canonical_role_column'::text)
  ) AS value(table_name, column_name, gate_name)
), column_facts AS (
  SELECT
    count(*) FILTER (
      WHERE legacy.gate_name = 'user_key_column'
        AND EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = legacy.table_name
          AND column_info.column_name = legacy.column_name
      )
    ) AS user_key_column_remaining,
    count(*) FILTER (
      WHERE legacy.gate_name = 'perfis_marca_id_column'
        AND EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = legacy.table_name
          AND column_info.column_name = legacy.column_name
      )
    ) AS perfis_marca_id_column_remaining,
    count(*) FILTER (
      WHERE legacy.gate_name = 'canonical_role_column'
        AND EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = legacy.table_name
          AND column_info.column_name = legacy.column_name
      )
    ) AS canonical_role_column_remaining
  FROM legacy_columns legacy
), membership_facts AS (
  SELECT
    count(*) FILTER (
      WHERE membership.member_user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = membership.member_user_id)
    ) AS invalid_brand_memberships
  FROM public.brand_memberships membership
), agency_facts AS (
  SELECT
    count(*) FILTER (
      WHERE membership.role IS NULL OR membership.role NOT IN ('agency_admin', 'agency_member')
    ) AS invalid_agency_roles,
    count(*) FILTER (
      WHERE membership.user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = membership.user_id)
    ) AS invalid_agency_memberships
  FROM public.agency_memberships membership
), owner_facts AS (
  SELECT
    count(*) FILTER (
      WHERE brand.owner_user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = brand.owner_user_id)
    ) AS invalid_brand_owners
  FROM public.marcas brand
), agency_owner_facts AS (
  SELECT
    count(*) FILTER (
      WHERE agency.owner_user_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = agency.owner_user_id)
    ) AS invalid_agency_owners
  FROM public.agencies agency
), function_facts AS (
  SELECT
    count(*) FILTER (
      WHERE procedure.proname IN (
        'canonical_is_platform_admin',
        'canonical_can_access_brand',
        'canonical_can_manage_brand',
        'canonical_can_access_agency',
        'canonical_can_manage_agency'
      )
    ) AS canonical_identity_functions_found,
    count(*) FILTER (
      WHERE procedure.proname IN ('editorial_current_actor_id', 'editorial_has_permission')
    ) AS canonical_editorial_functions_found,
    count(*) FILTER (
      WHERE pg_get_functiondef(procedure.oid) ~* '\muser_key\M'
         OR pg_get_functiondef(procedure.oid) ~* '\mcanonical_role\M'
         OR pg_get_functiondef(procedure.oid) ILIKE '%perfis.marca_id%'
    ) AS legacy_function_references,
    count(*) FILTER (
      WHERE procedure.proname IN (
        'canonical_is_platform_admin',
        'canonical_can_access_brand',
        'canonical_can_manage_brand',
        'canonical_can_access_agency',
        'canonical_can_manage_agency'
      )
      AND (
        procedure.prosecdef IS NOT TRUE
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(coalesce(procedure.proconfig, '{}'::text[])) setting_value
          WHERE setting_value = 'search_path=pg_catalog, public, pg_temp'
        )
      )
    ) AS invalid_canonical_identity_function_security,
    count(*) FILTER (
      WHERE (procedure.proname = 'editorial_current_actor_id' AND procedure.prosecdef IS TRUE)
         OR (procedure.proname = 'editorial_has_permission' AND procedure.prosecdef IS NOT TRUE)
         OR (
           procedure.proname IN ('editorial_current_actor_id', 'editorial_has_permission')
           AND NOT EXISTS (
             SELECT 1
             FROM unnest(coalesce(procedure.proconfig, '{}'::text[])) setting_value
             WHERE setting_value = 'search_path=pg_catalog, public, pg_temp'
           )
         )
    ) AS invalid_canonical_editorial_function_security
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
), policy_facts AS (
  SELECT count(*) AS legacy_policy_references
  FROM pg_catalog.pg_policies policy
  WHERE policy.schemaname = 'public'
    AND (
      coalesce(policy.qual, '') ~* '\muser_key\M'
      OR coalesce(policy.with_check, '') ~* '\muser_key\M'
      OR coalesce(policy.qual, '') ~* '\mcanonical_role\M'
      OR coalesce(policy.with_check, '') ~* '\mcanonical_role\M'
      OR (
        policy.tablename = 'perfis'
        AND (
          coalesce(policy.qual, '') ~* '\mmarca_id\M'
          OR coalesce(policy.with_check, '') ~* '\mmarca_id\M'
        )
      )
      OR coalesce(policy.qual, '') ILIKE '%perfis.marca_id%'
      OR coalesce(policy.with_check, '') ILIKE '%perfis.marca_id%'
    )
), rls_facts AS (
  SELECT
    count(*) FILTER (WHERE relation.relrowsecurity IS NOT TRUE) AS private_tables_without_rls
  FROM pg_catalog.pg_class relation
  WHERE relation.oid IN (
    'public.marcas'::regclass,
    'public.brand_memberships'::regclass,
    'public.agencies'::regclass,
    'public.agency_memberships'::regclass,
    'public.minerador_keyword_lists'::regclass,
    'public.minerador_keywords'::regclass
  )
)
SELECT
  CASE WHEN column_facts.user_key_column_remaining = 0 THEN 'ABSENT' ELSE 'PRESENT' END AS user_key_column,
  CASE WHEN column_facts.perfis_marca_id_column_remaining = 0 THEN 'ABSENT' ELSE 'PRESENT' END AS perfis_marca_id_column,
  CASE WHEN column_facts.canonical_role_column_remaining = 0 THEN 'ABSENT' ELSE 'PRESENT' END AS canonical_role_column,
  CASE WHEN membership_facts.invalid_brand_memberships = 0 THEN 'OK' ELSE 'BLOCKED' END AS member_user_id_contract,
  CASE WHEN agency_facts.invalid_agency_roles = 0 THEN 'OK' ELSE 'BLOCKED' END AS agency_role_contract,
  agency_facts.invalid_agency_roles,
  CASE
    WHEN function_facts.canonical_identity_functions_found = 5
      AND function_facts.legacy_function_references = 0
      AND function_facts.invalid_canonical_identity_function_security = 0
    THEN 'OK' ELSE 'BLOCKED'
  END AS canonical_identity_functions,
  CASE
    WHEN function_facts.canonical_editorial_functions_found = 2
      AND function_facts.legacy_function_references = 0
      AND function_facts.invalid_canonical_editorial_function_security = 0
    THEN 'OK' ELSE 'BLOCKED'
  END AS canonical_editorial_functions,
  CASE
    WHEN rls_facts.private_tables_without_rls = 0 AND policy_facts.legacy_policy_references = 0
    THEN 'OK' ELSE 'BLOCKED'
  END AS canonical_rls,
  CASE WHEN owner_facts.invalid_brand_owners = 0 THEN 'OK' ELSE 'BLOCKED' END AS brand_owner_contract,
  CASE WHEN membership_facts.invalid_brand_memberships = 0 THEN 'OK' ELSE 'BLOCKED' END AS brand_memberships_contract,
  CASE WHEN agency_owner_facts.invalid_agency_owners = 0 THEN 'OK' ELSE 'BLOCKED' END AS agency_owner_contract,
  CASE
    WHEN agency_facts.invalid_agency_memberships = 0 AND agency_facts.invalid_agency_roles = 0
    THEN 'OK' ELSE 'BLOCKED'
  END AS agency_memberships_contract,
  column_facts.user_key_column_remaining
    + column_facts.perfis_marca_id_column_remaining
    + column_facts.canonical_role_column_remaining AS legacy_identity_columns_remaining,
  'PENDING_SEPARATE_HARDENING' AS legacy_security_debt,
  CASE
    WHEN column_facts.user_key_column_remaining = 0
      AND column_facts.perfis_marca_id_column_remaining = 0
      AND column_facts.canonical_role_column_remaining = 0
      AND membership_facts.invalid_brand_memberships = 0
      AND agency_facts.invalid_agency_roles = 0
      AND agency_facts.invalid_agency_memberships = 0
      AND owner_facts.invalid_brand_owners = 0
      AND agency_owner_facts.invalid_agency_owners = 0
      AND function_facts.canonical_identity_functions_found = 5
      AND function_facts.canonical_editorial_functions_found = 2
      AND function_facts.legacy_function_references = 0
      AND function_facts.invalid_canonical_identity_function_security = 0
      AND function_facts.invalid_canonical_editorial_function_security = 0
      AND policy_facts.legacy_policy_references = 0
      AND rls_facts.private_tables_without_rls = 0
    THEN 'READY' ELSE 'BLOCKED'
  END AS post_migration_status
FROM column_facts
CROSS JOIN membership_facts
CROSS JOIN agency_facts
CROSS JOIN owner_facts
CROSS JOIN agency_owner_facts
CROSS JOIN function_facts
CROSS JOIN policy_facts
CROSS JOIN rls_facts;
