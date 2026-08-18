-- PROTECTED ROLLBACK FOR THE SINGLE BOOTSTRAP RECORD.
-- Replace NULL with the exact access_period_id reported by the bootstrap notice.
-- This never deletes by Agency name or origin alone.

BEGIN;

SET LOCAL lock_timeout = '10s';

LOCK TABLE public.agency_access_periods IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_access_period_id constant uuid := NULL;
  v_target_email constant text := 'adalbapro@gmail.com';
  v_target_agency_slug constant text := 'adalbapro';
  v_actor_user_id uuid;
  v_agency_id uuid;
  v_target_agency_count integer;
  v_period_count integer;
  v_period_agency_id uuid;
  v_period_origin text;
  v_period_plan_code text;
  v_period_status text;
  v_period_starts_at timestamptz;
  v_period_ends_at timestamptz;
  v_period_source_application_id uuid;
  v_period_source_invitation_id uuid;
  v_period_activated_by uuid;
  v_period_revoked_at timestamptz;
  v_period_revoked_by uuid;
  v_period_revocation_reason text;
  v_deleted_count integer;
BEGIN
  IF v_access_period_id IS NULL THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_ROLLBACK_ID_REQUIRED: replace NULL with exact bootstrap access_period_id';
  END IF;

  SELECT auth_user.id
  INTO v_actor_user_id
  FROM auth.users AS auth_user
  WHERE lower(btrim(auth_user.email)) = lower(btrim(v_target_email))
    AND auth_user.email_confirmed_at IS NOT NULL;

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_ROLLBACK_IDENTITY_NOT_CONFIRMED';
  END IF;

  SELECT count(*)::integer, min(agency.id)
  INTO v_target_agency_count, v_agency_id
  FROM public.agencies AS agency
  WHERE lower(btrim(agency.slug)) = lower(btrim(v_target_agency_slug))
    AND agency.status = 'active'
    AND agency.owner_user_id = v_actor_user_id;

  IF v_target_agency_count <> 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_ROLLBACK_AGENCY_CONFLICT';
  END IF;

  SELECT count(*)::integer
  INTO v_period_count
  FROM public.agency_access_periods AS access_period
  WHERE access_period.id = v_access_period_id;

  IF v_period_count <> 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_ROLLBACK_RECORD_NOT_FOUND';
  END IF;

  SELECT
    access_period.agency_id,
    access_period.origin,
    access_period.plan_code,
    access_period.status,
    access_period.starts_at,
    access_period.ends_at,
    access_period.source_application_id,
    access_period.source_invitation_id,
    access_period.activated_by_actor_user_id,
    access_period.revoked_at,
    access_period.revoked_by_actor_user_id,
    access_period.revocation_reason
  INTO
    v_period_agency_id,
    v_period_origin,
    v_period_plan_code,
    v_period_status,
    v_period_starts_at,
    v_period_ends_at,
    v_period_source_application_id,
    v_period_source_invitation_id,
    v_period_activated_by,
    v_period_revoked_at,
    v_period_revoked_by,
    v_period_revocation_reason
  FROM public.agency_access_periods AS access_period
  WHERE access_period.id = v_access_period_id
  FOR UPDATE;

  IF v_period_agency_id IS DISTINCT FROM v_agency_id
    OR v_period_origin IS DISTINCT FROM 'PLATFORM_INTERNAL'
    OR v_period_plan_code IS DISTINCT FROM 'FREE'
    OR v_period_status IS DISTINCT FROM 'active'
    OR v_period_starts_at > current_timestamp
    OR v_period_ends_at IS NOT NULL
    OR v_period_source_application_id IS NOT NULL
    OR v_period_source_invitation_id IS NOT NULL
    OR v_period_activated_by IS DISTINCT FROM v_actor_user_id
    OR v_period_revoked_at IS NOT NULL
    OR v_period_revoked_by IS NOT NULL
    OR v_period_revocation_reason IS NOT NULL THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_ROLLBACK_RECORD_CONFLICT';
  END IF;

  DELETE FROM public.agency_access_periods
  WHERE id = v_access_period_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION 'ADALBAPRO_PLATFORM_INTERNAL_ROLLBACK_DELETE_FAILED';
  END IF;
END;
$$;

COMMIT;
