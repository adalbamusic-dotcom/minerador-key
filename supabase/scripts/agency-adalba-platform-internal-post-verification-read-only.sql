-- READ-ONLY POST-VERIFIER. Execute after the explicit bootstrap.
-- It verifies the current canonical state and does not infer access from Admin alone.

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
profile AS (
  SELECT count(*)::integer AS global_admin_count
  FROM public.perfis AS profile_row
  CROSS JOIN identity
  WHERE profile_row.id = identity.actor_user_id
    AND profile_row.role = 'admin'
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
    (array_agg(target_row.slug ORDER BY target_row.id))[1] AS agency_slug,
    (array_agg(target_row.status ORDER BY target_row.id))[1] AS agency_status,
    (array_agg(target_row.owner_user_id ORDER BY target_row.id))[1] AS owner_user_id
  FROM target_agency_rows AS target_row
),
membership AS (
  SELECT
    count(*)::integer AS membership_count,
    coalesce(bool_and(
      agency_membership.role IN ('agency_admin', 'owner')
      AND agency_membership.status = 'active'
    ), false) AS compatible
  FROM public.agency_memberships AS agency_membership
  CROSS JOIN identity
  CROSS JOIN target_agency
  WHERE agency_membership.agency_id = target_agency.agency_id
    AND agency_membership.user_id = identity.actor_user_id
),
period_state AS (
  SELECT
    count(*)::integer AS total_period_count,
    count(*) FILTER (
      WHERE access_period.origin = 'PLATFORM_INTERNAL'
        AND access_period.status = 'active'
    )::integer AS platform_internal_active_count,
    count(*) FILTER (
      WHERE access_period.origin = 'PLATFORM_INTERNAL'
        AND access_period.status = 'active'
        AND access_period.plan_code = 'FREE'
        AND access_period.starts_at <= current_timestamp
        AND access_period.ends_at IS NULL
        AND access_period.source_application_id IS NULL
        AND access_period.source_invitation_id IS NULL
        AND access_period.activated_by_actor_user_id = identity.actor_user_id
        AND access_period.revoked_at IS NULL
        AND access_period.revoked_by_actor_user_id IS NULL
        AND access_period.revocation_reason IS NULL
    )::integer AS platform_internal_contract_count,
    count(*) FILTER (WHERE access_period.status = 'active' AND access_period.origin <> 'PLATFORM_INTERNAL')::integer AS other_active_count
  FROM public.agency_access_periods AS access_period
  CROSS JOIN target_agency
  CROSS JOIN identity
  WHERE access_period.agency_id = target_agency.agency_id
),
other_platform_internal AS (
  SELECT count(*)::integer AS other_platform_internal_active_count
  FROM public.agency_access_periods AS access_period
  CROSS JOIN target_agency
  WHERE access_period.origin = 'PLATFORM_INTERNAL'
    AND access_period.status = 'active'
    AND access_period.agency_id IS DISTINCT FROM target_agency.agency_id
),
checks(check_order, check_name, expected, observed, verdict) AS (
  SELECT 10, 'script_version', '2026-08-13-platform-internal-post-v2', '2026-08-13-platform-internal-post-v2', 'INFO'
  UNION ALL SELECT 11, 'session:current_user', 'catalog role captured', current_user::text, 'INFO'
  UNION ALL SELECT 12, 'session:session_user', 'catalog role captured', session_user::text, 'INFO'
  UNION ALL SELECT 13, 'session:current_role', 'catalog role captured', current_role::text, 'INFO'
  UNION ALL
  SELECT 20, 'post:identity', 'exactly one confirmed identity', format('count=%s;confirmed=%s', identity.identity_count, identity.email_confirmed),
    CASE WHEN identity.identity_count = 1 AND identity.email_confirmed THEN 'PASS' ELSE 'FAIL' END
  FROM identity
  UNION ALL
  SELECT 21, 'post:global_admin_independent', 'resolved identity remains perfis.role = admin', profile.global_admin_count::text,
    CASE WHEN identity.identity_count = 1 AND profile.global_admin_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM profile CROSS JOIN identity
  UNION ALL
  SELECT 30, 'post:agency_exactly_one', 'one active AdalbaPro/adalbapro Agency owned by resolved identity',
    format('count=%s;name=%s;slug=%s;status=%s;owner_matches=%s',
      target_agency.agency_count,
      coalesce(target_agency.agency_name, '<absent>'),
      coalesce(target_agency.agency_slug, '<absent>'),
      coalesce(target_agency.agency_status, '<absent>'),
      (target_agency.owner_user_id = identity.actor_user_id)::text),
    CASE WHEN target_agency.agency_count = 1
      AND target_agency.agency_name = params.target_agency_name
      AND target_agency.agency_slug = params.target_agency_slug
      AND target_agency.agency_status = 'active'
      AND target_agency.owner_user_id = identity.actor_user_id THEN 'PASS' ELSE 'FAIL' END
  FROM target_agency CROSS JOIN identity CROSS JOIN params
  UNION ALL
  SELECT 31, 'post:owner_membership', 'one active agency_admin/owner membership for same identity',
    format('count=%s;compatible=%s', membership.membership_count, membership.compatible),
    CASE WHEN membership.membership_count = 1 AND membership.compatible THEN 'PASS' ELSE 'FAIL' END
  FROM membership
  UNION ALL
  SELECT 40, 'post:platform_internal_exactly_one', 'exactly one active valid PLATFORM_INTERNAL period',
    format('agency_periods=%s;internal_active=%s;valid_contract=%s;other_active=%s',
      period_state.total_period_count,
      period_state.platform_internal_active_count,
      period_state.platform_internal_contract_count,
      period_state.other_active_count),
    CASE WHEN period_state.platform_internal_active_count = 1
      AND period_state.platform_internal_contract_count = 1
      AND period_state.other_active_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM period_state
  UNION ALL
  SELECT 41, 'post:no_platform_internal_duplicate', 'one active PLATFORM_INTERNAL period only', period_state.platform_internal_active_count::text,
    CASE WHEN period_state.platform_internal_active_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM period_state
  UNION ALL
  SELECT 42, 'post:no_other_agency_platform_internal', '0 active PLATFORM_INTERNAL periods outside target', other_platform_internal.other_platform_internal_active_count::text,
    CASE WHEN other_platform_internal.other_platform_internal_active_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM other_platform_internal
  UNION ALL
  SELECT 100, 'post:verdict', 'all post-bootstrap gates pass',
    format('identity=%s;admin=%s;agency=%s;membership=%s;internal=%s;other_internal=%s',
      identity.identity_count,
      profile.global_admin_count,
      target_agency.agency_count,
      membership.membership_count,
      period_state.platform_internal_active_count,
      other_platform_internal.other_platform_internal_active_count),
    CASE WHEN identity.identity_count = 1
      AND identity.email_confirmed
      AND profile.global_admin_count = 1
      AND target_agency.agency_count = 1
      AND target_agency.agency_name = params.target_agency_name
      AND target_agency.agency_slug = params.target_agency_slug
      AND target_agency.agency_status = 'active'
      AND target_agency.owner_user_id = identity.actor_user_id
      AND membership.membership_count = 1
      AND membership.compatible
      AND period_state.platform_internal_active_count = 1
      AND period_state.platform_internal_contract_count = 1
      AND period_state.other_active_count = 0
      AND other_platform_internal.other_platform_internal_active_count = 0
      THEN 'PASS' ELSE 'FAIL' END
  FROM identity
  CROSS JOIN profile
  CROSS JOIN target_agency
  CROSS JOIN membership
  CROSS JOIN period_state
  CROSS JOIN other_platform_internal
  CROSS JOIN params
),
summary AS (
  SELECT count(*) FILTER (WHERE checks.verdict = 'FAIL')::integer AS fail_count
  FROM checks
),
final_result AS (
  SELECT check_order, check_name, expected, observed, verdict FROM checks
  UNION ALL
  SELECT 1000, 'final_classification', 'ADALBAPRO_PLATFORM_INTERNAL_BOOTSTRAP_VERIFIED',
    CASE WHEN summary.fail_count = 0 THEN 'ADALBAPRO_PLATFORM_INTERNAL_BOOTSTRAP_VERIFIED' ELSE 'BLOCKED' END,
    CASE WHEN summary.fail_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM summary
)
SELECT check_name, expected, observed, verdict
FROM final_result
ORDER BY check_order, check_name;
