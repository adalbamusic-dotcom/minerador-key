-- ONE-OFF ADMINISTRATIVE BOOTSTRAP. Review the read-only precheck first.
-- The operation resolves the real UUID from auth.users by exact normalized email.
-- It creates only the Agency and its owner membership.
-- It never creates or updates profiles, Brands, memberships of Brands, lists,
-- keywords, or any Minerador/editorial data.

BEGIN;

SET LOCAL lock_timeout = '10s';

LOCK TABLE
  public.perfis,
  public.agencies,
  public.agency_memberships,
  public.agency_brands,
  public.marcas,
  public.brand_memberships,
  public.minerador_keyword_lists,
  public.minerador_keywords
IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_target_email constant text := 'adalbapro@gmail.com';
  v_target_agency_name constant text := 'AdalbaPro';
  v_target_agency_slug constant text := 'adalbapro';
  v_actor_user_id uuid;
  v_agency_id uuid;
  v_identity_count integer;
  v_target_agency_count integer;
  v_target_membership_count integer;
  v_global_admin_count integer;
  v_other_operational_agency_count integer;
  v_name_conflict_count integer;
  v_target_agency_name_actual text;
  v_target_agency_status text;
  v_target_agency_owner_user_id uuid;
  v_membership_role text;
  v_membership_status text;
  v_agency_created boolean := false;
  v_membership_created boolean := false;
  v_agencies_before bigint;
  v_agencies_after bigint;
  v_memberships_before bigint;
  v_memberships_after bigint;
  v_marcas_before bigint;
  v_marcas_after bigint;
  v_brand_memberships_before bigint;
  v_brand_memberships_after bigint;
  v_agency_brands_before bigint;
  v_agency_brands_after bigint;
  v_listas_before bigint;
  v_listas_after bigint;
  v_keywords_before bigint;
  v_keywords_after bigint;
  v_global_admin_before integer;
  v_global_admin_after integer;
  v_expected_agencies_after bigint;
  v_expected_memberships_after bigint;
BEGIN
  IF to_regclass('auth.users') IS NULL
    OR to_regclass('public.perfis') IS NULL
    OR to_regclass('public.agencies') IS NULL
    OR to_regclass('public.agency_memberships') IS NULL
    OR to_regclass('public.agency_brands') IS NULL
    OR to_regclass('public.marcas') IS NULL
    OR to_regclass('public.brand_memberships') IS NULL
    OR to_regclass('public.minerador_keyword_lists') IS NULL
    OR to_regclass('public.minerador_keywords') IS NULL THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_FOUNDATION_MISSING: required relation absent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'agencies'
      AND column_info.column_name = 'owner_user_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'agency_memberships'
      AND column_info.column_name = 'user_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'agency_memberships'
      AND column_info.column_name = 'role'
  ) THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_FOUNDATION_MISSING: canonical UUID columns absent';
  END IF;

  IF to_regprocedure('public.canonical_actor_is_global_admin(uuid)') IS NULL
    OR to_regprocedure('public.canonical_actor_can_manage_agency(uuid,uuid)') IS NULL
    OR to_regprocedure('public.canonical_can_access_agency(uuid)') IS NULL
    OR to_regprocedure('public.canonical_can_manage_agency(uuid)') IS NULL THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_FOUNDATION_MISSING: canonical authorization helper absent';
  END IF;

  SELECT count(*)::bigint INTO v_agencies_before FROM public.agencies;
  SELECT count(*)::bigint INTO v_memberships_before FROM public.agency_memberships;
  SELECT count(*)::bigint INTO v_marcas_before FROM public.marcas;
  SELECT count(*)::bigint INTO v_brand_memberships_before FROM public.brand_memberships;
  SELECT count(*)::bigint INTO v_agency_brands_before FROM public.agency_brands;
  SELECT count(*)::bigint INTO v_listas_before FROM public.minerador_keyword_lists;
  SELECT count(*)::bigint INTO v_keywords_before FROM public.minerador_keywords;
  SELECT count(*)::integer INTO v_global_admin_before
  FROM public.perfis AS profile
  WHERE profile.role = 'admin';

  SELECT count(*)::integer
  INTO v_identity_count
  FROM auth.users AS auth_user
  WHERE lower(btrim(auth_user.email)) = lower(btrim(v_target_email));

  IF v_identity_count <> 1 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_IDENTITY_CONFLICT: expected exactly one confirmed identity';
  END IF;

  SELECT auth_user.id
  INTO v_actor_user_id
  FROM auth.users AS auth_user
  WHERE lower(btrim(auth_user.email)) = lower(btrim(v_target_email))
    AND auth_user.email_confirmed_at IS NOT NULL;

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_IDENTITY_NOT_CONFIRMED';
  END IF;

  SELECT count(*)::integer
  INTO v_global_admin_count
  FROM public.perfis AS profile
  WHERE profile.id = v_actor_user_id
    AND profile.role = 'admin';

  IF v_global_admin_count <> 1 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_GLOBAL_ADMIN_REQUIRED';
  END IF;

  SELECT count(*)::integer
  INTO v_name_conflict_count
  FROM public.agencies AS agency
  WHERE lower(btrim(agency.name)) = lower(btrim(v_target_agency_name))
    AND lower(btrim(agency.slug)) <> lower(btrim(v_target_agency_slug));

  IF v_name_conflict_count <> 0 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_NAME_CONFLICT: target name belongs to another slug';
  END IF;

  SELECT count(*)::integer
  INTO v_target_agency_count
  FROM public.agencies AS agency
  WHERE lower(btrim(agency.slug)) = lower(btrim(v_target_agency_slug));

  IF v_target_agency_count > 1 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_AGENCY_CONFLICT: target slug is not unique';
  ELSIF v_target_agency_count = 1 THEN
    SELECT
      agency.id,
      agency.name,
      agency.status,
      agency.owner_user_id
    INTO
      v_agency_id,
      v_target_agency_name_actual,
      v_target_agency_status,
      v_target_agency_owner_user_id
    FROM public.agencies AS agency
    WHERE lower(btrim(agency.slug)) = lower(btrim(v_target_agency_slug))
    FOR UPDATE;

    IF v_target_agency_name_actual IS DISTINCT FROM v_target_agency_name
      OR v_target_agency_status IS DISTINCT FROM 'active'
      OR v_target_agency_owner_user_id IS DISTINCT FROM v_actor_user_id THEN
      RAISE EXCEPTION 'AGENCY_BOOTSTRAP_AGENCY_CONFLICT: existing target is incompatible';
    END IF;
  ELSE
    INSERT INTO public.agencies (name, slug, status, owner_user_id)
    VALUES (v_target_agency_name, v_target_agency_slug, 'active', v_actor_user_id)
    RETURNING id INTO v_agency_id;
    v_agency_created := true;
  END IF;

  SELECT count(*)::integer
  INTO v_target_membership_count
  FROM public.agency_memberships AS membership
  WHERE membership.agency_id = v_agency_id
    AND membership.user_id = v_actor_user_id;

  IF v_target_membership_count > 1 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_MEMBERSHIP_CONFLICT: target membership is not unique';
  ELSIF v_target_membership_count = 1 THEN
    SELECT membership.role, membership.status
    INTO v_membership_role, v_membership_status
    FROM public.agency_memberships AS membership
    WHERE membership.agency_id = v_agency_id
      AND membership.user_id = v_actor_user_id
    FOR UPDATE;

    IF v_membership_role IS DISTINCT FROM 'agency_admin'
      OR v_membership_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'AGENCY_BOOTSTRAP_MEMBERSHIP_CONFLICT: existing membership is incompatible';
    END IF;
  ELSE
    IF NOT v_agency_created THEN
      RAISE EXCEPTION 'ADALBAPRO_BOOTSTRAP_PARTIAL_STATE_DETECTED: target Agency exists without its owner membership';
    END IF;
    INSERT INTO public.agency_memberships (agency_id, user_id, role, status)
    VALUES (v_agency_id, v_actor_user_id, 'agency_admin', 'active');
    v_membership_created := true;
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
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_OPERATIONAL_CONFLICT: actor has another active Agency';
  END IF;

  SELECT count(*)::integer
  INTO v_target_agency_count
  FROM public.agencies AS agency
  WHERE lower(btrim(agency.slug)) = lower(btrim(v_target_agency_slug))
    AND agency.name = v_target_agency_name
    AND agency.status = 'active'
    AND agency.owner_user_id = v_actor_user_id;

  SELECT count(*)::integer
  INTO v_target_membership_count
  FROM public.agency_memberships AS membership
  WHERE membership.agency_id = v_agency_id
    AND membership.user_id = v_actor_user_id
    AND membership.role = 'agency_admin'
    AND membership.status = 'active';

  IF v_target_agency_count <> 1 OR v_target_membership_count <> 1 THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_POSTCONDITION_FAILED: target Agency or membership mismatch';
  END IF;

  SELECT count(*)::bigint INTO v_agencies_after FROM public.agencies;
  SELECT count(*)::bigint INTO v_memberships_after FROM public.agency_memberships;
  SELECT count(*)::bigint INTO v_marcas_after FROM public.marcas;
  SELECT count(*)::bigint INTO v_brand_memberships_after FROM public.brand_memberships;
  SELECT count(*)::bigint INTO v_agency_brands_after FROM public.agency_brands;
  SELECT count(*)::bigint INTO v_listas_after FROM public.minerador_keyword_lists;
  SELECT count(*)::bigint INTO v_keywords_after FROM public.minerador_keywords;
  SELECT count(*)::integer INTO v_global_admin_after
  FROM public.perfis AS profile
  WHERE profile.role = 'admin';

  v_expected_agencies_after := v_agencies_before;
  IF v_agency_created THEN
    v_expected_agencies_after := v_expected_agencies_after + 1;
  END IF;

  v_expected_memberships_after := v_memberships_before;
  IF v_membership_created THEN
    v_expected_memberships_after := v_expected_memberships_after + 1;
  END IF;

  IF v_agencies_after IS DISTINCT FROM v_expected_agencies_after
    OR v_memberships_after IS DISTINCT FROM v_expected_memberships_after
    OR v_marcas_after IS DISTINCT FROM v_marcas_before
    OR v_brand_memberships_after IS DISTINCT FROM v_brand_memberships_before
    OR v_agency_brands_after IS DISTINCT FROM v_agency_brands_before
    OR v_listas_after IS DISTINCT FROM v_listas_before
    OR v_keywords_after IS DISTINCT FROM v_keywords_before
    OR v_global_admin_after IS DISTINCT FROM v_global_admin_before
  THEN
    RAISE EXCEPTION 'AGENCY_BOOTSTRAP_SCOPE_CHANGED: only the Agency owner relation may change';
  END IF;
END;
$$;

COMMIT;
