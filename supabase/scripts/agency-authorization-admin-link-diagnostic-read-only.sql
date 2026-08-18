-- Diagnóstico read-only do vínculo explícito de Admin global com Agency.
-- Saída sanitizada: não projeta IDs técnicos, e-mails ou credenciais.

WITH global_admins AS (
  SELECT p.id AS admin_user_id
  FROM public.perfis p
  WHERE p.role = 'admin'
),
explicit_links AS (
  SELECT
    ga.admin_user_id,
    a.id AS agency_id,
    a.name AS agency_name,
    a.slug AS agency_slug,
    a.status AS agency_status,
    'OWNER'::text AS link_source,
    NULL::text AS membership_status,
    (a.status = 'active') AS runtime_operational
  FROM global_admins ga
  JOIN public.agencies a ON a.owner_user_id = ga.admin_user_id

  UNION ALL

  SELECT
    ga.admin_user_id,
    a.id AS agency_id,
    a.name AS agency_name,
    a.slug AS agency_slug,
    a.status AS agency_status,
    'MEMBERSHIP'::text AS link_source,
    am.status AS membership_status,
    (a.status = 'active' AND am.status = 'active') AS runtime_operational
  FROM global_admins ga
  JOIN public.agency_memberships am ON am.user_id = ga.admin_user_id
  JOIN public.agencies a ON a.id = am.agency_id
),
classified_links AS (
  SELECT
    agency_id,
    agency_name,
    agency_slug,
    agency_status,
    bool_or(link_source = 'OWNER') AS has_owner,
    bool_or(link_source = 'MEMBERSHIP') AS has_membership,
    string_agg(DISTINCT membership_status, ', ' ORDER BY membership_status) FILTER (WHERE membership_status IS NOT NULL) AS membership_status,
    count(DISTINCT admin_user_id)::bigint AS global_admin_count,
    count(DISTINCT admin_user_id) FILTER (WHERE runtime_operational)::bigint AS runtime_operational_admin_count,
    count(DISTINCT admin_user_id) FILTER (WHERE runtime_operational)::bigint AS preflight_counted_admin_count
  FROM explicit_links
  GROUP BY agency_id, agency_name, agency_slug, agency_status
),
classified_output AS (
  SELECT
    CASE
      WHEN has_owner AND has_membership THEN 'OWNER_AND_MEMBERSHIP'
      WHEN has_owner THEN 'OWNER'
      WHEN has_membership THEN 'MEMBERSHIP'
      ELSE 'OTHER'
    END AS link_type,
    agency_name,
    agency_slug,
    agency_status,
    membership_status,
    global_admin_count,
    runtime_operational_admin_count,
    preflight_counted_admin_count,
    CASE
      WHEN runtime_operational_admin_count > 0 THEN 'INCOMPATIBLE_ACTIVE'
      ELSE 'LEGACY_OR_INCOMPATIBLE_INACTIVE'
    END AS compatibility_class
  FROM classified_links
)
SELECT
  'SUMMARY'::text AS row_kind,
  NULL::text AS link_type,
  NULL::text AS agency_name,
  NULL::text AS agency_slug,
  NULL::text AS agency_status,
  NULL::text AS membership_status,
  count(DISTINCT admin_user_id)::bigint AS global_admin_count,
  count(DISTINCT agency_id)::bigint AS agency_count,
  count(DISTINCT admin_user_id) FILTER (WHERE runtime_operational)::bigint AS runtime_operational_admin_count,
  count(DISTINCT admin_user_id) FILTER (WHERE runtime_operational)::bigint AS preflight_counted_admin_count,
  CASE WHEN count(DISTINCT admin_user_id) > 0 THEN 'MIGRATION_0021_CONFLICT' ELSE 'NO_ADMIN_LINK' END AS compatibility_class
FROM explicit_links

UNION ALL

SELECT
  'DETAIL'::text AS row_kind,
  link_type,
  agency_name,
  agency_slug,
  agency_status,
  membership_status,
  global_admin_count,
  1::bigint AS agency_count,
  runtime_operational_admin_count,
  preflight_counted_admin_count,
  compatibility_class
FROM classified_output

ORDER BY row_kind, agency_name, link_type;
