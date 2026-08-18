-- MANUAL ROLLBACK ARTIFACT ONLY. Do not run as part of the bootstrap.
-- It removes only an otherwise unused AdalbaPro Agency and its one owner
-- membership. It never removes a profile, Brand, Brand membership, list,
-- keyword, or Agency->Brand link; any such state aborts the transaction.

BEGIN;

SET LOCAL lock_timeout = '10s';

LOCK TABLE public.agencies, public.agency_memberships, public.agency_brands IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_target_email constant text := 'adalbapro@gmail.com';
  v_target_agency_name constant text := 'AdalbaPro';
  v_target_agency_slug constant text := 'adalbapro';
  v_actor_user_id uuid;
  v_agency_id uuid;
  v_identity_count integer;
  v_agency_count integer;
  v_membership_count integer;
  v_brand_link_count integer;
BEGIN
  SELECT count(*)::integer INTO v_identity_count
  FROM auth.users AS auth_user
  WHERE lower(btrim(auth_user.email)) = lower(btrim(v_target_email));

  IF v_identity_count <> 1 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_ROLLBACK_IDENTITY_CONFLICT';
  END IF;

  SELECT auth_user.id INTO v_actor_user_id
  FROM auth.users AS auth_user
  WHERE lower(btrim(auth_user.email)) = lower(btrim(v_target_email))
    AND auth_user.email_confirmed_at IS NOT NULL;

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_ROLLBACK_IDENTITY_NOT_CONFIRMED';
  END IF;

  SELECT count(*)::integer INTO v_agency_count
  FROM public.agencies AS agency
  WHERE lower(btrim(agency.slug)) = lower(btrim(v_target_agency_slug));

  IF v_agency_count <> 1 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_ROLLBACK_AGENCY_NOT_UNIQUE';
  END IF;

  SELECT agency.id INTO v_agency_id
  FROM public.agencies AS agency
  WHERE lower(btrim(agency.slug)) = lower(btrim(v_target_agency_slug))
    AND agency.name = v_target_agency_name
    AND agency.status = 'active'
    AND agency.owner_user_id = v_actor_user_id
  FOR UPDATE;

  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_ROLLBACK_AGENCY_CONFLICT';
  END IF;

  SELECT count(*)::integer INTO v_membership_count
  FROM public.agency_memberships AS membership
  WHERE membership.agency_id = v_agency_id;

  IF v_membership_count <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.agency_memberships AS membership
    WHERE membership.agency_id = v_agency_id
      AND membership.user_id = v_actor_user_id
      AND membership.role = 'agency_admin'
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_ROLLBACK_MEMBERSHIP_CONFLICT';
  END IF;

  SELECT count(*)::integer INTO v_brand_link_count
  FROM public.agency_brands AS agency_brand
  WHERE agency_brand.agency_id = v_agency_id;

  IF v_brand_link_count <> 0 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_ROLLBACK_BRAND_LINK_EXISTS';
  END IF;

  DELETE FROM public.agency_memberships
  WHERE agency_id = v_agency_id
    AND user_id = v_actor_user_id;

  DELETE FROM public.agencies
  WHERE id = v_agency_id;
END
$$;

COMMIT;
