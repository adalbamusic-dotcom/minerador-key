-- Auditoria futura, somente leitura, do contrato de uma Agência operacional
-- por ator comum. Não executar como migration e não expõe UUIDs ou e-mails.
--
-- O catálogo remoto não foi consultado nesta tarefa. Esta consulta assume o
-- schema local auditado: agency_memberships.user_id e perfis.id = auth.users.id.

WITH active_owner_records AS (
  SELECT a.owner_user_id AS actor_user_id, a.id AS agency_id
  FROM public.agencies AS a
  WHERE a.status = 'active'
),
active_member_records AS (
  SELECT am.user_id AS actor_user_id, am.agency_id
  FROM public.agency_memberships AS am
  JOIN public.agencies AS a ON a.id = am.agency_id
  WHERE am.status = 'active'
    AND a.status = 'active'
),
all_active_records AS (
  SELECT actor_user_id, agency_id, 'OWNER'::text AS source
  FROM active_owner_records
  UNION ALL
  SELECT actor_user_id, agency_id, 'MEMBER'::text AS source
  FROM active_member_records
),
common_actor_records AS (
  SELECT r.*
  FROM all_active_records AS r
  LEFT JOIN public.perfis AS p ON p.id = r.actor_user_id
  WHERE coalesce(p.role, '') <> 'admin'
),
owner_violations AS (
  SELECT actor_user_id, count(DISTINCT agency_id) AS agency_count
  FROM active_owner_records
  GROUP BY actor_user_id
  HAVING count(DISTINCT agency_id) > 1
),
member_violations AS (
  SELECT actor_user_id, count(DISTINCT agency_id) AS agency_count
  FROM active_member_records
  GROUP BY actor_user_id
  HAVING count(DISTINCT agency_id) > 1
),
effective_violations AS (
  SELECT actor_user_id, count(DISTINCT agency_id) AS agency_count
  FROM common_actor_records
  GROUP BY actor_user_id
  HAVING count(DISTINCT agency_id) > 1
),
cross_role_violations AS (
  SELECT actor_user_id, count(DISTINCT agency_id) AS agency_count
  FROM common_actor_records
  GROUP BY actor_user_id
  HAVING count(DISTINCT agency_id) > 1
     AND bool_or(source = 'OWNER')
     AND bool_or(source = 'MEMBER')
),
admin_records AS (
  SELECT count(DISTINCT r.actor_user_id) AS admin_actor_count
  FROM all_active_records AS r
  JOIN public.perfis AS p ON p.id = r.actor_user_id
  WHERE p.role = 'admin'
)
SELECT 'common_owner_multiple_active_agencies' AS check_name,
       count(*)::bigint AS violating_actor_count,
       coalesce(sum(agency_count - 1), 0)::bigint AS excess_agency_count
FROM owner_violations AS v
LEFT JOIN public.perfis AS p ON p.id = v.actor_user_id
WHERE coalesce(p.role, '') <> 'admin'
UNION ALL
SELECT 'common_member_multiple_active_agencies',
       count(*)::bigint,
       coalesce(sum(agency_count - 1), 0)::bigint
FROM member_violations AS v
LEFT JOIN public.perfis AS p ON p.id = v.actor_user_id
WHERE coalesce(p.role, '') <> 'admin'
UNION ALL
SELECT 'common_effective_actor_multiple_active_agencies',
       count(*)::bigint,
       coalesce(sum(agency_count - 1), 0)::bigint
FROM effective_violations
UNION ALL
SELECT 'common_owner_member_cross_agency',
       count(*)::bigint,
       coalesce(sum(agency_count - 1), 0)::bigint
FROM cross_role_violations
UNION ALL
SELECT 'global_admin_with_active_agency_record', admin_actor_count, 0
FROM admin_records;
