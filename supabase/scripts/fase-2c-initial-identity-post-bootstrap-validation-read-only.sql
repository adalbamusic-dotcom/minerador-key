-- FASE 2C / SOMENTE LEITURA.
-- Substitua somente __BOOTSTRAP_EMAIL__. A saida e sanitizada.
WITH input AS (
  SELECT nullif(lower(btrim('adalbapro@gmail.com')), '__bootstrap_email__') AS requested_email
), actor AS (
  SELECT array_agg(u.id) AS user_ids
  FROM auth.users u CROSS JOIN input i
  WHERE lower(coalesce(u.email, '')) = i.requested_email
), target AS (
  SELECT
    (SELECT user_ids[1] FROM actor) AS actor_user_id,
    (SELECT id FROM public.agencies WHERE lower(slug) = 'agencia-adalba' AND status = 'active') AS agency_id,
    (SELECT count(*) FROM public.agencies WHERE lower(slug) = 'agencia-adalba' AND status = 'active') AS agency_count,
    (SELECT id FROM public.marcas WHERE status = 'active' AND lower(nome) = 'adalba') AS adalba_brand_id,
    (SELECT id FROM public.marcas WHERE status = 'active' AND lower(nome) = 'lindisse') AS lindisse_brand_id
), facts AS (
  SELECT
    (SELECT count(*) FROM public.marcas m JOIN auth.users u ON u.id = m.owner_user_id WHERE m.id IN (target.adalba_brand_id, target.lindisse_brand_id)) AS valid_brand_owners,
    (SELECT count(*) FROM public.brand_memberships WHERE marca_id IN (target.adalba_brand_id, target.lindisse_brand_id) AND member_user_id = target.actor_user_id AND status = 'active') AS explicit_editorial_access,
    (SELECT count(*) FROM public.brand_member_permissions p JOIN public.brand_memberships bm ON bm.id = p.membership_id WHERE bm.marca_id IN (target.adalba_brand_id, target.lindisse_brand_id) AND bm.member_user_id = target.actor_user_id AND bm.status = 'active' AND p.granted) AS granted_editorial_permissions,
    (SELECT count(*) FROM (SELECT lower(slug) FROM public.agencies WHERE lower(slug) = 'agencia-adalba' GROUP BY lower(slug) HAVING count(*) > 1) duplicate) AS duplicate_agencies,
    (SELECT count(*) FROM (SELECT brand_id FROM public.agency_brands WHERE brand_id IN (target.adalba_brand_id, target.lindisse_brand_id) AND status = 'active' GROUP BY brand_id HAVING count(*) > 1) duplicate) AS duplicate_active_brand_links
  FROM target
)
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM public.perfis WHERE id = target.actor_user_id AND role = 'admin') THEN 'OK' ELSE 'BLOCKED' END AS global_admin_role,
  target.agency_count,
  CASE WHEN EXISTS (SELECT 1 FROM public.agencies WHERE id = target.agency_id AND owner_user_id = target.actor_user_id) THEN 'OK' ELSE 'BLOCKED' END AS agency_owner,
  CASE WHEN EXISTS (SELECT 1 FROM public.agency_memberships WHERE agency_id = target.agency_id AND user_id = target.actor_user_id AND role = 'agency_admin' AND canonical_role = 'agency_admin' AND status = 'active') THEN 'OK' ELSE 'BLOCKED' END AS agency_admin_membership,
  (SELECT count(*) FROM public.agency_brands WHERE agency_id = target.agency_id AND brand_id IN (target.adalba_brand_id, target.lindisse_brand_id) AND status = 'active') AS active_agency_brand_links,
  CASE WHEN facts.valid_brand_owners = 2 THEN 'OK' ELSE 'BLOCKED' END AS brand_owners_preserved,
  facts.explicit_editorial_access,
  facts.duplicate_agencies,
  facts.duplicate_active_brand_links,
  CASE
    WHEN (SELECT requested_email FROM input) IS NULL OR coalesce(cardinality((SELECT user_ids FROM actor)), 0) <> 1 THEN 'ACTOR_NOT_UNIQUE_OR_MISSING'
    WHEN NOT EXISTS (SELECT 1 FROM public.perfis WHERE id = target.actor_user_id AND role = 'admin') THEN 'GLOBAL_ADMIN_MISSING'
    WHEN target.agency_count <> 1 OR target.agency_id IS NULL THEN 'AGENCY_NOT_READY'
    WHEN NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = target.agency_id AND owner_user_id = target.actor_user_id) THEN 'AGENCY_OWNER_MISSING'
    WHEN NOT EXISTS (SELECT 1 FROM public.agency_memberships WHERE agency_id = target.agency_id AND user_id = target.actor_user_id AND role = 'agency_admin' AND canonical_role = 'agency_admin' AND status = 'active') THEN 'AGENCY_ADMIN_MEMBERSHIP_MISSING'
    WHEN (SELECT count(*) FROM public.agency_brands WHERE agency_id = target.agency_id AND brand_id IN (target.adalba_brand_id, target.lindisse_brand_id) AND status = 'active') <> 2 THEN 'ACTIVE_BRAND_LINKS_INCOMPLETE'
    WHEN facts.valid_brand_owners <> 2 THEN 'BRAND_OWNERS_NOT_PRESERVED'
    WHEN facts.explicit_editorial_access <> 2 OR facts.granted_editorial_permissions <> 126 THEN 'EXPLICIT_EDITORIAL_ACCESS_INCOMPLETE'
    WHEN facts.duplicate_agencies <> 0 OR facts.duplicate_active_brand_links <> 0 THEN 'DUPLICATE_STRUCTURE_CONFLICT'
    ELSE 'READY'
  END AS post_bootstrap_status
FROM target CROSS JOIN facts;
