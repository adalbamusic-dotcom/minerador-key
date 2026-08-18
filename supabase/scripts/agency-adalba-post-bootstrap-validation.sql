-- READ-ONLY POSTCHECK. Run immediately after the bootstrap and before creating
-- the first Brand. It resolves the same identity by email and exposes no secret.

WITH
params AS (
  SELECT
    'adalbapro@gmail.com'::text AS target_email,
    'AdalbaPro'::text AS target_agency_name,
    'adalbapro'::text AS target_agency_slug
),
identity_rows AS (
  SELECT auth_user.id, auth_user.email_confirmed_at
  FROM auth.users AS auth_user
  CROSS JOIN params
  WHERE lower(btrim(auth_user.email)) = lower(btrim(params.target_email))
),
identity AS (
  SELECT
    count(*)::integer AS identity_count,
    (array_agg(identity_row.id ORDER BY identity_row.id))[1] AS actor_user_id,
    coalesce(bool_and(identity_row.email_confirmed_at IS NOT NULL), false) AS email_confirmed
  FROM identity_rows AS identity_row
),
target_agency_rows AS (
  SELECT agency.id, agency.name, agency.slug, agency.status, agency.owner_user_id
  FROM public.agencies AS agency
  CROSS JOIN params
  WHERE lower(btrim(agency.slug)) = lower(btrim(params.target_agency_slug))
),
target_agency AS (
  SELECT
    count(*)::integer AS agency_count,
    (array_agg(target_row.id ORDER BY target_row.id))[1] AS agency_id,
    (array_agg(target_row.name ORDER BY target_row.id))[1] AS agency_name,
    (array_agg(target_row.status ORDER BY target_row.id))[1] AS agency_status,
    (array_agg(target_row.owner_user_id ORDER BY target_row.id))[1] AS owner_user_id
  FROM target_agency_rows AS target_row
),
membership AS (
  SELECT
    count(*)::integer AS membership_count,
    coalesce(bool_and(
      agency_membership.role = 'agency_admin'
      AND agency_membership.status = 'active'
    ), false) AS compatible
  FROM public.agency_memberships AS agency_membership
  CROSS JOIN identity
  CROSS JOIN target_agency
  WHERE agency_membership.agency_id = target_agency.agency_id
    AND agency_membership.user_id = identity.actor_user_id
),
profile AS (
  SELECT count(*)::integer AS global_admin_count
  FROM public.perfis AS profile_row
  CROSS JOIN identity
  WHERE profile_row.id = identity.actor_user_id
    AND profile_row.role = 'admin'
),
active_actor_agencies AS (
  SELECT agency.id AS agency_id
  FROM public.agencies AS agency
  CROSS JOIN identity
  WHERE agency.status = 'active'
    AND agency.owner_user_id = identity.actor_user_id
  UNION
  SELECT agency.id AS agency_id
  FROM public.agencies AS agency
  JOIN public.agency_memberships AS agency_membership
    ON agency_membership.agency_id = agency.id
  CROSS JOIN identity
  WHERE agency.status = 'active'
    AND agency_membership.user_id = identity.actor_user_id
    AND agency_membership.status = 'active'
),
other_operational AS (
  SELECT count(*)::integer AS other_agency_count
  FROM active_actor_agencies AS actor_agency
  CROSS JOIN target_agency
  WHERE actor_agency.agency_id IS DISTINCT FROM target_agency.agency_id
),
scope_counts AS (
  SELECT
    (SELECT count(*) FROM public.marcas)::bigint AS marcas_count,
    (SELECT count(*) FROM public.brand_memberships)::bigint AS brand_memberships_count,
    (SELECT count(*) FROM public.agency_brands)::bigint AS agency_brands_count,
    (SELECT count(*) FROM public.minerador_keyword_lists)::bigint AS listas_count,
    (SELECT count(*) FROM public.minerador_keywords)::bigint AS keywords_count
),
checks AS (
  SELECT
    'script_version'::text AS check_name,
    '2026-08-13-agency-adalba-bootstrap-post-v2'::text AS expected,
    '2026-08-13-agency-adalba-bootstrap-post-v2'::text AS observed,
    'INFO'::text AS verdict,
    identity.actor_user_id,
    target_agency.agency_id
  FROM identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'post:identity'::text,
    'exactly one confirmed identity'::text,
    format('count=%s; confirmed=%s', identity.identity_count, identity.email_confirmed),
    CASE WHEN identity.identity_count = 1 AND identity.email_confirmed THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'post:global_admin_preserved'::text,
    'resolved identity remains perfis.role = admin'::text,
    profile.global_admin_count::text,
    CASE WHEN identity.identity_count = 1 AND profile.global_admin_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM profile
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'post:agency_exactly_one'::text,
    'one active AdalbaPro agency owned by the resolved identity'::text,
    format('count=%s; name=%s; status=%s; owner_matches=%s',
      target_agency.agency_count,
      coalesce(target_agency.agency_name, '<absent>'),
      coalesce(target_agency.agency_status, '<absent>'),
      (target_agency.owner_user_id = identity.actor_user_id)::text),
    CASE
      WHEN target_agency.agency_count = 1
        AND target_agency.agency_name = params.target_agency_name
        AND target_agency.agency_status = 'active'
        AND target_agency.owner_user_id = identity.actor_user_id THEN 'PASS'
      ELSE 'FAIL'
    END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM target_agency
  CROSS JOIN identity
  CROSS JOIN params

  UNION ALL
  SELECT
    'post:owner_membership'::text,
    'one active agency_admin membership for the same identity'::text,
    format('count=%s; compatible=%s', membership.membership_count, membership.compatible),
    CASE WHEN membership.membership_count = 1 AND membership.compatible THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM membership
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'post:no_second_operational_agency'::text,
    '0 active Agency outside the target'::text,
    other_operational.other_agency_count::text,
    CASE WHEN other_operational.other_agency_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM other_operational
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'post:no_brand_or_minerador_bootstrap_data'::text,
    'all five counts remain 0 before the first Brand smoke'::text,
    format('marcas=%s; brand_memberships=%s; agency_brands=%s; listas=%s; keywords=%s',
      scope_counts.marcas_count,
      scope_counts.brand_memberships_count,
      scope_counts.agency_brands_count,
      scope_counts.listas_count,
      scope_counts.keywords_count),
    CASE
      WHEN scope_counts.marcas_count = 0
        AND scope_counts.brand_memberships_count = 0
        AND scope_counts.agency_brands_count = 0
        AND scope_counts.listas_count = 0
        AND scope_counts.keywords_count = 0 THEN 'PASS'
      ELSE 'FAIL'
    END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM scope_counts
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'post:verdict'::text,
    'all post-bootstrap gates pass'::text,
    format('identity=%s; admin=%s; agency=%s; membership=%s; other_agencies=%s; clean_scope=%s',
      identity.identity_count,
      profile.global_admin_count,
      target_agency.agency_count,
      membership.membership_count,
      other_operational.other_agency_count,
      (
        scope_counts.marcas_count = 0
        AND scope_counts.brand_memberships_count = 0
        AND scope_counts.agency_brands_count = 0
        AND scope_counts.listas_count = 0
        AND scope_counts.keywords_count = 0
      )::text),
    CASE
      WHEN identity.identity_count = 1
        AND identity.email_confirmed
        AND profile.global_admin_count = 1
        AND target_agency.agency_count = 1
        AND target_agency.agency_name = params.target_agency_name
        AND target_agency.agency_status = 'active'
        AND target_agency.owner_user_id = identity.actor_user_id
        AND membership.membership_count = 1
        AND membership.compatible
        AND other_operational.other_agency_count = 0
        AND scope_counts.marcas_count = 0
        AND scope_counts.brand_memberships_count = 0
        AND scope_counts.agency_brands_count = 0
        AND scope_counts.listas_count = 0
        AND scope_counts.keywords_count = 0 THEN 'PASS'
      ELSE 'FAIL'
    END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM identity
  CROSS JOIN profile
  CROSS JOIN target_agency
  CROSS JOIN membership
  CROSS JOIN other_operational
  CROSS JOIN scope_counts
  CROSS JOIN params
)
SELECT
  checks.check_name,
  checks.expected,
  checks.observed,
  checks.verdict,
  checks.actor_user_id,
  checks.agency_id
FROM checks
ORDER BY checks.check_name;
