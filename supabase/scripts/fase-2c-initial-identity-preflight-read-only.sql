-- FASE 2C / SOMENTE LEITURA.
-- Substitua somente __BOOTSTRAP_EMAIL__. Nenhum e-mail, UUID, token ou dado
-- editorial e retornado. Este preflight aceita a Agencia Adalba ausente.
WITH input AS (
  SELECT nullif(lower(btrim('__BOOTSTRAP_EMAIL__')), '__bootstrap_email__') AS requested_email
), actor AS (
  SELECT count(*) AS matches,
         bool_or(u.email_confirmed_at IS NOT NULL OR u.confirmed_at IS NOT NULL) AS confirmed
  FROM auth.users u
  CROSS JOIN input i
  WHERE lower(coalesce(u.email, '')) = i.requested_email
), target_brands AS (
  SELECT id, owner_user_id
  FROM public.marcas
  WHERE status = 'active' AND lower(nome) IN ('adalba', 'lindisse')
), facts AS (
  SELECT
    (SELECT count(*) FROM target_brands) AS target_brand_count,
    (SELECT count(*) FROM target_brands b WHERE b.owner_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.owner_user_id)) AS brands_with_valid_owner,
    (SELECT count(*) FROM public.agencies WHERE lower(slug) = 'agencia-adalba') AS agency_count,
    (SELECT count(*) FROM public.agencies WHERE lower(slug) = 'agencia-adalba' AND status = 'active') AS active_agency_count,
    (SELECT count(*) FROM public.agencies WHERE lower(slug) = 'agencia-adalba' AND name <> U&'Ag\00EAncia Adalba') AS agency_identity_conflicts,
    (SELECT count(*) FROM public.agency_brands ab JOIN target_brands b ON b.id = ab.brand_id WHERE ab.status = 'active' AND ab.agency_id NOT IN (SELECT id FROM public.agencies WHERE lower(slug) = 'agencia-adalba')) AS active_links_to_other_agencies,
    (SELECT count(*) FROM (SELECT ab.brand_id FROM public.agency_brands ab JOIN target_brands b ON b.id = ab.brand_id WHERE ab.status = 'active' GROUP BY ab.brand_id HAVING count(*) > 1) duplicated) AS duplicate_active_brand_links,
    to_regclass('public.agencies') IS NOT NULL
      AND to_regclass('public.agency_memberships') IS NOT NULL
      AND to_regclass('public.agency_brands') IS NOT NULL
      AND to_regclass('public.brand_memberships') IS NOT NULL
      AND to_regclass('public.brand_member_permissions') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'owner_user_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'canonical_role') AS canonical_structure_present
)
SELECT
  CASE
    WHEN (SELECT requested_email FROM input) IS NULL THEN 'INPUT_REQUIRED'
    WHEN actor.matches <> 1 THEN 'ACTOR_NOT_UNIQUE_OR_MISSING'
    WHEN NOT coalesce(actor.confirmed, false) THEN 'ACTOR_EMAIL_NOT_CONFIRMED'
    WHEN NOT facts.canonical_structure_present THEN 'CANONICAL_STRUCTURE_MISSING'
    WHEN facts.target_brand_count <> 2 THEN 'REQUIRED_BRANDS_NOT_UNIQUE_OR_MISSING'
    WHEN facts.brands_with_valid_owner <> 2 THEN 'BRAND_OWNER_MISSING_OR_INVALID'
    WHEN facts.agency_count > 1 OR facts.active_agency_count > 1 OR (facts.agency_count = 1 AND facts.active_agency_count <> 1) OR facts.agency_identity_conflicts <> 0 THEN 'AGENCY_ADALBA_CONFLICT'
    WHEN facts.active_links_to_other_agencies <> 0 OR facts.duplicate_active_brand_links <> 0 THEN 'ACTIVE_AGENCY_LINK_CONFLICT'
    ELSE 'READY_FOR_MANUAL_BOOTSTRAP'
  END AS preflight_status,
  CASE WHEN actor.matches = 1 THEN 'FOUND_EXACTLY_ONE' ELSE 'NOT_READY' END AS identity_status,
  CASE WHEN coalesce(actor.confirmed, false) THEN 'CONFIRMED' ELSE 'NOT_READY' END AS confirmation_status,
  facts.target_brand_count AS target_brand_count,
  CASE WHEN facts.brands_with_valid_owner = 2 THEN 'PRESENT' ELSE 'BLOCKED' END AS brand_owners_status,
  facts.agency_count AS agency_count,
  CASE WHEN facts.agency_count = 0 THEN 'ABSENT_WILL_BE_CREATED' WHEN facts.agency_count = 1 AND facts.active_agency_count = 1 THEN 'EXISTING_ACTIVE' ELSE 'BLOCKED' END AS agency_status,
  facts.active_links_to_other_agencies AS active_links_to_other_agencies,
  facts.duplicate_active_brand_links AS duplicate_active_brand_links,
  CASE WHEN facts.canonical_structure_present THEN 'READY' ELSE 'MISSING_OR_PARTIAL' END AS canonical_contract_status
FROM actor
CROSS JOIN facts;
