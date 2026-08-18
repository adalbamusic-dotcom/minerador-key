-- Preflight futuro, somente leitura, para a SDD de autorização
-- Pessoa -> Agency e Agency -> Brand.
-- Não executar como migration. Não imprime UUIDs, e-mails ou payloads.

WITH catalog_state AS (
  SELECT
    (to_regclass('public.agencies') IS NOT NULL)::int AS agencies_table,
    (to_regclass('public.agency_memberships') IS NOT NULL)::int AS memberships_table,
    (to_regclass('public.agency_brands') IS NOT NULL)::int AS agency_brands_table,
    (to_regclass('auth.users') IS NOT NULL)::int AS auth_users_table,
    (to_regclass('public.perfis') IS NOT NULL)::int AS profiles_table
),
column_state AS (
  SELECT
    count(*) FILTER (WHERE table_name = 'agencies' AND column_name = 'owner_user_id')::int AS agency_owner_column,
    count(*) FILTER (WHERE table_name = 'agency_memberships' AND column_name = 'user_id')::int AS membership_user_column,
    count(*) FILTER (WHERE table_name = 'agency_brands' AND column_name = 'agency_id')::int AS agency_brand_agency_column,
    count(*) FILTER (WHERE table_name = 'agency_brands' AND column_name = 'brand_id')::int AS agency_brand_brand_column
  FROM information_schema.columns
  WHERE table_schema = 'public'
),
index_state AS (
  SELECT
    count(*) FILTER (WHERE tablename = 'agency_brands' AND indexname = 'uq_agency_brands_active_brand_0014')::int AS active_brand_unique_index,
    count(*) FILTER (WHERE tablename = 'agency_memberships' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%agency_id%' AND indexdef ILIKE '%user_id%')::int AS membership_pair_unique_index,
    count(*) FILTER (WHERE tablename = 'agencies' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%owner_user_id%')::int AS owner_unique_index,
    count(*) FILTER (WHERE tablename = 'agency_memberships' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%user_id%' AND indexdef NOT ILIKE '%agency_id%')::int AS member_single_unique_index
  FROM pg_catalog.pg_indexes
  WHERE schemaname = 'public'
),
active_owner_records AS (
  SELECT a.owner_user_id AS actor_user_id, a.id AS agency_id
  FROM public.agencies AS a
  WHERE a.status = 'active'
),
active_member_records AS (
  SELECT am.user_id AS actor_user_id, am.agency_id
  FROM public.agency_memberships AS am
  JOIN public.agencies AS a ON a.id = am.agency_id
  WHERE am.status = 'active' AND a.status = 'active'
),
effective_records AS (
  SELECT actor_user_id, agency_id
  FROM active_owner_records
  UNION
  SELECT actor_user_id, agency_id
  FROM active_member_records
),
owner_duplicates AS (
  SELECT actor_user_id, count(DISTINCT agency_id) AS agency_count
  FROM active_owner_records
  GROUP BY actor_user_id
  HAVING count(DISTINCT agency_id) > 1
),
member_duplicates AS (
  SELECT actor_user_id, count(DISTINCT agency_id) AS agency_count
  FROM active_member_records
  GROUP BY actor_user_id
  HAVING count(DISTINCT agency_id) > 1
),
effective_multi_agency AS (
  SELECT actor_user_id, count(DISTINCT agency_id) AS agency_count
  FROM effective_records
  GROUP BY actor_user_id
  HAVING count(DISTINCT agency_id) > 1
),
missing_or_invalid_agencies AS (
  SELECT count(*)::bigint AS total
  FROM public.agencies AS a
  LEFT JOIN auth.users AS u ON u.id = a.owner_user_id
  WHERE a.owner_user_id IS NULL OR u.id IS NULL
),
inconsistent_memberships AS (
  SELECT count(*)::bigint AS total
  FROM public.agency_memberships AS am
  LEFT JOIN public.agencies AS a ON a.id = am.agency_id
  LEFT JOIN auth.users AS u ON u.id = am.user_id
  WHERE a.id IS NULL OR u.id IS NULL
     OR am.role NOT IN ('agency_admin', 'operator', 'viewer')
     OR am.status NOT IN ('active', 'suspended', 'removed')
),
inconsistent_agency_brands AS (
  SELECT count(*)::bigint AS total
  FROM public.agency_brands AS ab
  LEFT JOIN public.agencies AS a ON a.id = ab.agency_id
  LEFT JOIN public.marcas AS b ON b.id = ab.brand_id
  WHERE a.id IS NULL OR b.id IS NULL
     OR ab.status NOT IN ('active', 'inactive', 'removed')
),
admin_link_records AS (
  SELECT count(DISTINCT er.actor_user_id)::bigint AS total
  FROM effective_records AS er
  JOIN public.perfis AS p ON p.id = er.actor_user_id
  WHERE p.role = 'admin'
),
global_admin_single_agency_records AS (
  SELECT count(*)::bigint AS total
  FROM (
    SELECT er.actor_user_id
    FROM effective_records AS er
    JOIN public.perfis AS p ON p.id = er.actor_user_id
    WHERE p.role = 'admin'
    GROUP BY er.actor_user_id
    HAVING count(DISTINCT er.agency_id) = 1
  ) AS single_agency_admins
)
SELECT 'catalog_relations_present' AS check_name,
       (agencies_table + memberships_table + agency_brands_table + auth_users_table + profiles_table)::bigint AS observed_count,
       5::bigint AS expected_count
FROM catalog_state
UNION ALL
SELECT 'canonical_columns_present',
       (agency_owner_column + membership_user_column + agency_brand_agency_column + agency_brand_brand_column)::bigint,
       4::bigint
FROM column_state
UNION ALL
SELECT 'active_owner_duplicate_actors', count(*)::bigint, 0::bigint
FROM owner_duplicates
UNION ALL
SELECT 'active_member_duplicate_actors', count(*)::bigint, 0::bigint
FROM member_duplicates
UNION ALL
SELECT 'effective_multi_agency_actors', count(*)::bigint, 0::bigint
FROM effective_multi_agency
UNION ALL
SELECT 'agencies_without_valid_owner', total, 0::bigint
FROM missing_or_invalid_agencies
UNION ALL
SELECT 'inconsistent_memberships', total, 0::bigint
FROM inconsistent_memberships
UNION ALL
SELECT 'inconsistent_agency_brand_links', total, 0::bigint
FROM inconsistent_agency_brands
UNION ALL
SELECT 'global_admin_with_explicit_agency_link', total, NULL::bigint
FROM admin_link_records
UNION ALL
SELECT 'global_admin_with_single_operational_agency', total, NULL::bigint
FROM global_admin_single_agency_records
UNION ALL
SELECT 'active_brand_unique_index_present', active_brand_unique_index::bigint, 1::bigint
FROM index_state
UNION ALL
SELECT 'membership_pair_unique_index_present', membership_pair_unique_index::bigint, 1::bigint
FROM index_state
UNION ALL
SELECT 'owner_single_unique_index_present', owner_unique_index::bigint, 0::bigint
FROM index_state
UNION ALL
SELECT 'member_single_unique_index_present', member_single_unique_index::bigint, 0::bigint
FROM index_state;
