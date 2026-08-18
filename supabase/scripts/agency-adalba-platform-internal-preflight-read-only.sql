-- READ-ONLY PREFLIGHT. Execute the complete file as one statement.
-- This checks the existing AdalbaPro Agency before the explicit bootstrap.
-- It resolves the actor by normalized email and never prints UUIDs or email.

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
access_state AS (
  SELECT
    count(*)::integer AS agency_access_period_count,
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
    count(*) FILTER (
      WHERE access_period.status = 'active'
        AND access_period.origin <> 'PLATFORM_INTERNAL'
    )::integer AS other_active_count
  FROM public.agency_access_periods AS access_period
  CROSS JOIN target_agency
  CROSS JOIN identity
  WHERE access_period.agency_id = target_agency.agency_id
),
other_platform_internal AS (
  SELECT count(*)::integer AS other_platform_internal_active_count
  FROM public.agency_access_periods AS access_period
  JOIN public.agencies AS agency ON agency.id = access_period.agency_id
  CROSS JOIN target_agency
  WHERE access_period.origin = 'PLATFORM_INTERNAL'
    AND access_period.status = 'active'
    AND agency.id IS DISTINCT FROM target_agency.agency_id
),
foundation AS (
  SELECT
    to_regclass('public.agency_access_periods') IS NOT NULL AS access_periods_present,
    to_regprocedure('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)') IS NOT NULL AS core_rpc_present,
    to_regprocedure('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)') IS NOT NULL AS authenticated_rpc_present
),
checks(check_order, check_name, expected, observed, verdict) AS (
  SELECT 10, 'script_version', '2026-08-13-platform-internal-preflight-v2', '2026-08-13-platform-internal-preflight-v2', 'INFO'
  UNION ALL SELECT 11, 'session:current_user', 'catalog role captured', current_user::text, 'INFO'
  UNION ALL SELECT 12, 'session:session_user', 'catalog role captured', session_user::text, 'INFO'
  UNION ALL SELECT 13, 'session:current_role', 'catalog role captured', current_role::text, 'INFO'
  UNION ALL
  SELECT 20, 'identity:unique', 'exactly one identity resolved by email', identity.identity_count::text,
    CASE WHEN identity.identity_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM identity
  UNION ALL
  SELECT 21, 'identity:confirmed', 'email_confirmed_at IS NOT NULL', identity.email_confirmed::text,
    CASE WHEN identity.identity_count = 1 AND identity.email_confirmed THEN 'PASS' ELSE 'FAIL' END
  FROM identity
  UNION ALL
  SELECT 22, 'identity:global_admin_independent', 'resolved identity has perfis.role = admin', profile.global_admin_count::text,
    CASE WHEN identity.identity_count = 1 AND profile.global_admin_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM identity CROSS JOIN profile
  UNION ALL
  SELECT 30, 'foundation:agency_access_periods', 'present', foundation.access_periods_present::text,
    CASE WHEN foundation.access_periods_present THEN 'PASS' ELSE 'FAIL' END
  FROM foundation
  UNION ALL
  SELECT 31, 'foundation:successor_rpcs', '2/2 present',
    (foundation.core_rpc_present::integer + foundation.authenticated_rpc_present::integer)::text || '/2',
    CASE WHEN foundation.core_rpc_present AND foundation.authenticated_rpc_present THEN 'PASS' ELSE 'FAIL' END
  FROM foundation
  UNION ALL
  SELECT 40, 'agency:target', 'exactly one active AdalbaPro/adalbapro owned by resolved identity',
    format('count=%s;name=%s;slug=%s;status=%s;owner_matches=%s',
      target_agency.agency_count,
      coalesce(target_agency.agency_name, '<absent>'),
      coalesce(target_agency.agency_slug, '<absent>'),
      coalesce(target_agency.agency_status, '<absent>'),
      (target_agency.owner_user_id = identity.actor_user_id)::text),
    CASE
      WHEN target_agency.agency_count = 1
        AND target_agency.agency_name = params.target_agency_name
        AND target_agency.agency_slug = params.target_agency_slug
        AND target_agency.agency_status = 'active'
        AND target_agency.owner_user_id = identity.actor_user_id THEN 'PASS'
      ELSE 'FAIL'
    END
  FROM target_agency CROSS JOIN identity CROSS JOIN params
  UNION ALL
  SELECT 41, 'agency:membership', 'exactly one active agency_admin/owner membership',
    format('count=%s;compatible=%s', membership.membership_count, membership.compatible),
    CASE WHEN membership.membership_count = 1 AND membership.compatible THEN 'PASS' ELSE 'FAIL' END
  FROM membership
  UNION ALL
  SELECT 42, 'actor:no_second_operational_agency', '0 active Agency outside target', other_operational.other_agency_count::text,
    CASE WHEN other_operational.other_agency_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM other_operational
  UNION ALL
  SELECT 50, 'access:current_state', '0 or 1 active PLATFORM_INTERNAL; no other active origin',
    format('all=%s;platform_internal_active=%s;valid_contract=%s;other_active=%s',
      access_state.agency_access_period_count,
      access_state.platform_internal_active_count,
      access_state.platform_internal_contract_count,
      access_state.other_active_count),
    CASE
      WHEN access_state.platform_internal_active_count = 0
        AND access_state.other_active_count = 0 THEN 'PASS'
      WHEN access_state.platform_internal_active_count = 1
        AND access_state.platform_internal_contract_count = 1
        AND access_state.other_active_count = 0 THEN 'PASS'
      ELSE 'FAIL'
    END
  FROM access_state
  UNION ALL
  SELECT 51, 'access:no_platform_internal_duplicate', 'at most 1 active PLATFORM_INTERNAL', access_state.platform_internal_active_count::text,
    CASE WHEN access_state.platform_internal_active_count <= 1 THEN 'PASS' ELSE 'FAIL' END
  FROM access_state
  UNION ALL
  SELECT 52, 'access:no_other_agency_platform_internal', '0 active PLATFORM_INTERNAL outside target', other_platform_internal.other_platform_internal_active_count::text,
    CASE WHEN other_platform_internal.other_platform_internal_active_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM other_platform_internal
  UNION ALL
  SELECT 100, 'bootstrap:ready', 'all identity, Agency, membership, foundation and access gates pass',
    format('identity=%s;confirmed=%s;admin=%s;agency=%s;membership=%s;other_agencies=%s;access_internal=%s;access_other=%s',
      identity.identity_count,
      identity.email_confirmed,
      profile.global_admin_count,
      target_agency.agency_count,
      membership.membership_count,
      other_operational.other_agency_count,
      access_state.platform_internal_active_count,
      access_state.other_active_count),
    CASE
      WHEN identity.identity_count = 1
        AND identity.email_confirmed
        AND profile.global_admin_count = 1
        AND foundation.access_periods_present
        AND foundation.core_rpc_present
        AND foundation.authenticated_rpc_present
        AND target_agency.agency_count = 1
        AND target_agency.agency_name = params.target_agency_name
        AND target_agency.agency_slug = params.target_agency_slug
        AND target_agency.agency_status = 'active'
        AND target_agency.owner_user_id = identity.actor_user_id
        AND membership.membership_count = 1
        AND membership.compatible
        AND other_operational.other_agency_count = 0
        AND other_platform_internal.other_platform_internal_active_count = 0
        AND (
          (access_state.platform_internal_active_count = 0 AND access_state.other_active_count = 0)
          OR
          (access_state.platform_internal_active_count = 1
            AND access_state.platform_internal_contract_count = 1
            AND access_state.other_active_count = 0)
        ) THEN 'PASS'
      ELSE 'FAIL'
    END
  FROM identity
  CROSS JOIN profile
  CROSS JOIN foundation
  CROSS JOIN target_agency
  CROSS JOIN membership
  CROSS JOIN other_operational
  CROSS JOIN access_state
  CROSS JOIN other_platform_internal
  CROSS JOIN params
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY check_order, check_name;
