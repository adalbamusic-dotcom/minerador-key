-- Pós-verificação da 0021. Somente catálogo, grants e contagens sanitizadas.
-- Não imprime UUIDs, e-mails, tokens, hashes, payloads ou conteúdo.

WITH checks AS (
  SELECT 'table_canonical_capabilities' AS check_name,
         (to_regclass('public.canonical_capabilities') IS NOT NULL)::int AS observed,
         1 AS expected
  UNION ALL SELECT 'table_agency_membership_capabilities', (to_regclass('public.agency_membership_capabilities') IS NOT NULL)::int, 1
  UNION ALL SELECT 'table_brand_agency_capability_restrictions', (to_regclass('public.brand_agency_capability_restrictions') IS NOT NULL)::int, 1
  UNION ALL SELECT 'index_active_agency_owner', (to_regclass('public.uq_agencies_active_owner_0021') IS NOT NULL)::int, 1
  UNION ALL SELECT 'index_active_agency_member', (to_regclass('public.uq_agency_memberships_active_user_0021') IS NOT NULL)::int, 1
  UNION ALL SELECT 'index_active_restriction', (to_regclass('public.uq_brand_agency_capability_restriction_active_0021') IS NOT NULL)::int, 1
  UNION ALL SELECT 'trigger_agency_deferred', (SELECT count(*)::int FROM pg_catalog.pg_trigger WHERE tgname = 'canonical_0021_agencies_actor_guard' AND tgdeferrable AND tginitdeferred), 1
  UNION ALL SELECT 'trigger_membership_deferred', (SELECT count(*)::int FROM pg_catalog.pg_trigger WHERE tgname = 'canonical_0021_memberships_actor_guard' AND tgdeferrable AND tginitdeferred), 1
  UNION ALL SELECT 'rls_capabilities', (SELECT relrowsecurity::int FROM pg_catalog.pg_class WHERE oid = 'public.canonical_capabilities'::regclass), 1
  UNION ALL SELECT 'rls_membership_capabilities', (SELECT relrowsecurity::int FROM pg_catalog.pg_class WHERE oid = 'public.agency_membership_capabilities'::regclass), 1
  UNION ALL SELECT 'rls_restrictions', (SELECT relrowsecurity::int FROM pg_catalog.pg_class WHERE oid = 'public.brand_agency_capability_restrictions'::regclass), 1
  UNION ALL SELECT 'policy_no_direct_agency_membership_insert', (SELECT (NOT has_table_privilege('authenticated', 'public.agency_memberships', 'INSERT'))::int), 1
  UNION ALL SELECT 'policy_no_direct_agency_brand_insert', (SELECT (NOT has_table_privilege('authenticated', 'public.agency_brands', 'INSERT'))::int), 1
  UNION ALL SELECT 'anon_no_capability_select', (SELECT (NOT has_table_privilege('anon', 'public.canonical_capabilities', 'SELECT'))::int), 1
  UNION ALL SELECT 'rpc_upsert_membership', (to_regprocedure('public.canonical_upsert_agency_membership(uuid,uuid,uuid,text,text)') IS NOT NULL)::int, 1
  UNION ALL SELECT 'rpc_assign_owner', (to_regprocedure('public.canonical_assign_agency_owner(uuid,uuid,uuid)') IS NOT NULL)::int, 1
  UNION ALL SELECT 'rpc_apply_restriction', (to_regprocedure('public.canonical_apply_brand_agency_capability_restriction(uuid,uuid,uuid,text,text)') IS NOT NULL)::int, 1
  UNION ALL SELECT 'rpc_revoke_restriction', (to_regprocedure('public.canonical_revoke_brand_agency_capability_restriction(uuid,uuid)') IS NOT NULL)::int, 1
  UNION ALL SELECT 'function_search_path_restricted', (
    SELECT count(*)::int
    FROM pg_catalog.pg_proc p
    WHERE p.oid IN (
      'public.canonical_can_access_brand(uuid)'::regprocedure,
      'public.canonical_can_access_agency(uuid)'::regprocedure,
      'public.canonical_actor_can_use_brand_capability(uuid,uuid,text)'::regprocedure,
      'public.canonical_upsert_agency_membership(uuid,uuid,uuid,text,text)'::regprocedure
    )
      AND p.prosecdef
      AND coalesce(array_to_string(p.proconfig, ','), '') ILIKE '%search_path=pg_catalog, public, pg_temp%'
  ), 4
), data_counts AS (
  SELECT 'capability_catalog_rows' AS check_name, count(*)::bigint AS observed, 11::bigint AS expected FROM public.canonical_capabilities
  UNION ALL SELECT 'membership_capability_rows', count(*)::bigint, NULL::bigint FROM public.agency_membership_capabilities
  UNION ALL SELECT 'restriction_rows', count(*)::bigint, NULL::bigint FROM public.brand_agency_capability_restrictions
  UNION ALL SELECT 'active_restriction_rows', count(*)::bigint, NULL::bigint FROM public.brand_agency_capability_restrictions WHERE status = 'active'
), effective_records AS (
  SELECT a.owner_user_id AS actor_user_id, a.id AS agency_id
  FROM public.agencies AS a
  WHERE a.status = 'active' AND a.owner_user_id IS NOT NULL
  UNION
  SELECT am.user_id AS actor_user_id, am.agency_id
  FROM public.agency_memberships AS am
  JOIN public.agencies AS a ON a.id = am.agency_id
  WHERE am.status = 'active' AND a.status = 'active'
), effective_multi_agency AS (
  SELECT count(*)::bigint AS total
  FROM (
    SELECT actor_user_id
    FROM effective_records
    GROUP BY actor_user_id
    HAVING count(DISTINCT agency_id) > 1
  ) AS conflicting_actors
), global_admin_single_agency AS (
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
SELECT check_name, expected, observed,
       CASE WHEN expected IS NULL OR observed = expected THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM checks
UNION ALL
SELECT check_name, expected, observed, 'INFO' FROM data_counts
UNION ALL
SELECT 'effective_multi_agency_actors', 0::bigint, total, CASE WHEN total = 0 THEN 'PASS' ELSE 'FAIL' END
FROM effective_multi_agency
UNION ALL
SELECT 'global_admin_with_single_operational_agency', NULL::bigint, total, 'INFO'
FROM global_admin_single_agency
ORDER BY check_name;
