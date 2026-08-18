-- ONE-OFF ADMINISTRATIVE BOOTSTRAP.
-- Run the read-only preflight first. This script inserts only one access period.
-- It never creates or updates an Agency, membership, Brand, profile or Minerador row.

BEGIN;

SET LOCAL lock_timeout = '10s';

LOCK TABLE
  public.agencies,
  public.agency_memberships,
  public.agency_access_periods
IN SHARE MODE;

DO $$
DECLARE
  v_target_email constant text := 'adalbapro@gmail.com';
  v_target_agency_name constant text := 'AdalbaPro';
  v_target_agency_slug constant text := 'adalbapro';
  v_actor_user_id uuid;
  v_agency_id uuid;
  v_access_period_id uuid;
  v_identity_count integer;
  v_target_agency_count integer;
  v_target_membership_count integer;
  v_global_admin_count integer;
  v_other_operational_agency_count integer;
  v_platform_internal_active_count integer;
  v_platform_internal_contract_count integer;
  v_other_active_count integer;
  v_other_platform_internal_active_count integer;
  v_target_agency_name_actual text;
  v_target_agency_status text;
  v_target_agency_owner_user_id uuid;
  v_membership_role text;
  v_membership_status text;
  v_access_period_created boolean := false;
  v_bootstrap_starts_at timestamptz := statement_timestamp();
  v_agencies_before bigint;
  v_agencies_after bigint;
  v_memberships_before bigint;
  v_memberships_after bigint;
  v_access_periods_before bigint;
  v_access_periods_after bigint;
BEGIN
  IF to_regclass('auth.users') IS NULL
    OR to_regclass('public.perfis') IS NULL
    OR to_regclass('public.agencies') IS NULL
    OR to_regclass('public.agency_memberships') IS NULL
    OR to_regclass('public.agency_access_periods') IS NULL THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_FOUNDATION_MISSING';
  END IF;

  IF to_regprocedure('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_0037_RPC_MISSING';
  END IF;

  SELECT count(*)::integer
  INTO v_identity_count
  FROM auth.users AS auth_user
  WHERE lower(btrim(auth_user.email)) = lower(btrim(v_target_email));

  IF v_identity_count <> 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_IDENTITY_CONFLICT';
  END IF;

  SELECT auth_user.id
  INTO v_actor_user_id
  FROM auth.users AS auth_user
  WHERE lower(btrim(auth_user.email)) = lower(btrim(v_target_email))
    AND auth_user.email_confirmed_at IS NOT NULL;

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_IDENTITY_NOT_CONFIRMED';
  END IF;

  SELECT count(*)::integer
  INTO v_global_admin_count
  FROM public.perfis AS profile
  WHERE profile.id = v_actor_user_id
    AND profile.role = 'admin';

  IF v_global_admin_count <> 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_GLOBAL_ADMIN_REQUIRED';
  END IF;

  SELECT count(*)::integer
  INTO v_target_agency_count
  FROM public.agencies AS agency
  WHERE lower(btrim(agency.slug)) = lower(btrim(v_target_agency_slug));

  IF v_target_agency_count <> 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_TARGET_AGENCY_CONFLICT';
  END IF;

  SELECT agency.id, agency.name, agency.status, agency.owner_user_id
  INTO v_agency_id, v_target_agency_name_actual, v_target_agency_status, v_target_agency_owner_user_id
  FROM public.agencies AS agency
  WHERE lower(btrim(agency.slug)) = lower(btrim(v_target_agency_slug))
  FOR UPDATE;

  IF v_target_agency_name_actual IS DISTINCT FROM v_target_agency_name
    OR v_target_agency_status IS DISTINCT FROM 'active'
    OR v_target_agency_owner_user_id IS DISTINCT FROM v_actor_user_id THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_TARGET_AGENCY_CONFLICT';
  END IF;

  SELECT count(*)::integer
  INTO v_target_membership_count
  FROM public.agency_memberships AS membership
  WHERE membership.agency_id = v_agency_id
    AND membership.user_id = v_actor_user_id;

  IF v_target_membership_count <> 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_MEMBERSHIP_CONFLICT';
  END IF;

  SELECT membership.role, membership.status
  INTO v_membership_role, v_membership_status
  FROM public.agency_memberships AS membership
  WHERE membership.agency_id = v_agency_id
    AND membership.user_id = v_actor_user_id
  FOR UPDATE;

  IF v_membership_role NOT IN ('agency_admin', 'owner')
    OR v_membership_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_MEMBERSHIP_CONFLICT';
  END IF;

  SELECT count(*)::integer
  INTO v_other_operational_agency_count
  FROM (
    SELECT agency.id AS agency_id
    FROM public.agencies AS agency
    WHERE agency.status = 'active'
      AND agency.owner_user_id = v_actor_user_id
    UNION
    SELECT agency.id AS agency_id
    FROM public.agencies AS agency
    JOIN public.agency_memberships AS membership
      ON membership.agency_id = agency.id
    WHERE agency.status = 'active'
      AND membership.user_id = v_actor_user_id
      AND membership.status = 'active'
  ) AS operational_agencies
  WHERE operational_agencies.agency_id <> v_agency_id;

  IF v_other_operational_agency_count <> 0 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_OTHER_AGENCY_CONFLICT';
  END IF;

  SELECT count(*)::bigint INTO v_agencies_before FROM public.agencies;
  SELECT count(*)::bigint INTO v_memberships_before FROM public.agency_memberships;
  SELECT count(*)::bigint INTO v_access_periods_before FROM public.agency_access_periods;

  SELECT
    count(*) FILTER (WHERE access_period.origin = 'PLATFORM_INTERNAL' AND access_period.status = 'active')::integer,
    count(*) FILTER (
      WHERE access_period.origin = 'PLATFORM_INTERNAL'
        AND access_period.status = 'active'
        AND access_period.plan_code = 'FREE'
        AND access_period.starts_at <= v_bootstrap_starts_at
        AND access_period.ends_at IS NULL
        AND access_period.source_application_id IS NULL
        AND access_period.source_invitation_id IS NULL
        AND access_period.activated_by_actor_user_id = v_actor_user_id
        AND access_period.revoked_at IS NULL
        AND access_period.revoked_by_actor_user_id IS NULL
        AND access_period.revocation_reason IS NULL
    )::integer,
    count(*) FILTER (WHERE access_period.status = 'active' AND access_period.origin <> 'PLATFORM_INTERNAL')::integer
  INTO v_platform_internal_active_count, v_platform_internal_contract_count, v_other_active_count
  FROM public.agency_access_periods AS access_period
  WHERE access_period.agency_id = v_agency_id;

  IF v_platform_internal_active_count > 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_DUPLICATE';
  END IF;

  IF v_other_active_count <> 0 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_ACCESS_CONFLICT';
  END IF;

  IF v_platform_internal_active_count = 1 THEN
    IF v_platform_internal_contract_count <> 1 THEN
      RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_EXISTING_PERIOD_CONFLICT';
    END IF;

    SELECT access_period.id
    INTO v_access_period_id
    FROM public.agency_access_periods AS access_period
    WHERE access_period.agency_id = v_agency_id
      AND access_period.origin = 'PLATFORM_INTERNAL'
      AND access_period.status = 'active';
  ELSE
    INSERT INTO public.agency_access_periods (
      agency_id,
      plan_code,
      origin,
      starts_at,
      ends_at,
      status,
      source_application_id,
      source_invitation_id,
      activated_by_actor_user_id
    )
    VALUES (
      v_agency_id,
      'FREE',
      'PLATFORM_INTERNAL',
      v_bootstrap_starts_at,
      NULL,
      'active',
      NULL,
      NULL,
      v_actor_user_id
    )
    RETURNING id INTO v_access_period_id;

    v_access_period_created := true;
  END IF;

  SELECT
    count(*) FILTER (WHERE access_period.origin = 'PLATFORM_INTERNAL' AND access_period.status = 'active')::integer,
    count(*) FILTER (
      WHERE access_period.origin = 'PLATFORM_INTERNAL'
        AND access_period.status = 'active'
        AND access_period.plan_code = 'FREE'
        AND access_period.starts_at <= current_timestamp
        AND access_period.ends_at IS NULL
        AND access_period.source_application_id IS NULL
        AND access_period.source_invitation_id IS NULL
        AND access_period.activated_by_actor_user_id = v_actor_user_id
        AND access_period.revoked_at IS NULL
        AND access_period.revoked_by_actor_user_id IS NULL
        AND access_period.revocation_reason IS NULL
    )::integer,
    count(*) FILTER (WHERE access_period.status = 'active' AND access_period.origin <> 'PLATFORM_INTERNAL')::integer
  INTO v_platform_internal_active_count, v_platform_internal_contract_count, v_other_active_count
  FROM public.agency_access_periods AS access_period
  WHERE access_period.agency_id = v_agency_id;

  IF v_platform_internal_active_count <> 1
    OR v_platform_internal_contract_count <> 1
    OR v_other_active_count <> 0 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_POSTCONDITION_FAILED';
  END IF;

  SELECT count(*)::integer
  INTO v_target_agency_count
  FROM public.agencies AS agency
  WHERE agency.id = v_agency_id
    AND agency.name = v_target_agency_name
    AND agency.slug = v_target_agency_slug
    AND agency.status = 'active'
    AND agency.owner_user_id = v_actor_user_id;

  SELECT count(*)::integer
  INTO v_target_membership_count
  FROM public.agency_memberships AS membership
  WHERE membership.agency_id = v_agency_id
    AND membership.user_id = v_actor_user_id
    AND membership.role IN ('agency_admin', 'owner')
    AND membership.status = 'active';

  IF v_target_agency_count <> 1 OR v_target_membership_count <> 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_SCOPE_CHANGED';
  END IF;

  SELECT count(*)::integer
  INTO v_other_platform_internal_active_count
  FROM public.agency_access_periods AS access_period
  WHERE access_period.origin = 'PLATFORM_INTERNAL'
    AND access_period.status = 'active'
    AND access_period.agency_id <> v_agency_id;

  IF v_other_platform_internal_active_count <> 0 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_OTHER_PERIOD_CONFLICT';
  END IF;

  SELECT count(*)::bigint INTO v_agencies_after FROM public.agencies;
  SELECT count(*)::bigint INTO v_memberships_after FROM public.agency_memberships;
  SELECT count(*)::bigint INTO v_access_periods_after FROM public.agency_access_periods;

  IF v_agencies_after IS DISTINCT FROM v_agencies_before
    OR v_memberships_after IS DISTINCT FROM v_memberships_before
    OR v_access_periods_after IS DISTINCT FROM
      (
        v_access_periods_before
        + (CASE WHEN v_access_period_created THEN 1 ELSE 0 END)
      )
  THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_SCOPE_CHANGED';
  END IF;

  IF v_access_period_created THEN
    RAISE NOTICE 'ADALBAPRO_PLATFORM_INTERNAL_CREATED: access_period_id=%', v_access_period_id;
  ELSE
    RAISE NOTICE 'ADALBAPRO_PLATFORM_INTERNAL_ALREADY_PRESENT: access_period_id=%', v_access_period_id;
  END IF;
END;
$$;

COMMIT;

WITH
params AS (
  SELECT
    'adalbapro@gmail.com'::text AS target_email,
    'adalbapro'::text AS target_agency_slug
),
identity_state AS (
  SELECT
    count(*)::integer AS identity_count,
    (array_agg(auth_user.id ORDER BY auth_user.id))[1] AS actor_user_id
  FROM auth.users AS auth_user
  CROSS JOIN params
  WHERE lower(btrim(auth_user.email)) = lower(btrim(params.target_email))
),
target_agency AS (
  SELECT
    count(*)::integer AS agency_count,
    (array_agg(agency.id ORDER BY agency.id))[1] AS agency_id,
    (array_agg(agency.name ORDER BY agency.id))[1] AS agency_name,
    (array_agg(agency.slug ORDER BY agency.id))[1] AS agency_slug
  FROM public.agencies AS agency
  CROSS JOIN params
  WHERE lower(btrim(agency.slug)) = lower(btrim(params.target_agency_slug))
),
period_state AS (
  SELECT
    count(*)::integer AS access_period_count,
    count(*) FILTER (
      WHERE access_period.origin = 'PLATFORM_INTERNAL'
        AND access_period.status = 'active'
    )::integer AS platform_internal_active_count
  FROM public.agency_access_periods AS access_period
  CROSS JOIN target_agency
  WHERE access_period.agency_id = target_agency.agency_id
),
selected_period AS (
  SELECT
    access_period.id AS access_period_id,
    access_period.plan_code,
    access_period.origin,
    access_period.status,
    access_period.starts_at,
    access_period.ends_at,
    access_period.source_application_id,
    access_period.source_invitation_id
  FROM target_agency
  LEFT JOIN LATERAL (
    SELECT
      period.id,
      period.plan_code,
      period.origin,
      period.status,
      period.starts_at,
      period.ends_at,
      period.source_application_id,
      period.source_invitation_id
    FROM public.agency_access_periods AS period
    WHERE period.agency_id = target_agency.agency_id
    ORDER BY period.created_at DESC, period.id
    LIMIT 1
  ) AS access_period ON true
)
SELECT
  '2026-08-13-platform-internal-bootstrap-v3-observable'::text AS script_version,
  identity_state.actor_user_id,
  target_agency.agency_id,
  target_agency.agency_name,
  target_agency.agency_slug,
  period_state.access_period_count,
  period_state.platform_internal_active_count,
  selected_period.access_period_id,
  selected_period.plan_code,
  selected_period.origin,
  selected_period.status,
  selected_period.starts_at,
  selected_period.ends_at,
  selected_period.source_application_id,
  selected_period.source_invitation_id,
  CASE
    WHEN period_state.access_period_count = 0 THEN 'MISSING_AFTER_COMMIT'
    ELSE 'PRESENT_AFTER_COMMIT'
  END AS final_state
FROM identity_state
CROSS JOIN target_agency
CROSS JOIN period_state
CROSS JOIN selected_period;
