-- MANUAL, WRITING. Execute only after the new Admin smoke test and runtime ADMIN_EMAIL retirement.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.perfis, public.agencies, public.agency_memberships, public.agency_brands, public.marcas, public.brand_memberships IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_scalbeto_id uuid := NULL;
  v_adalba_user_id uuid := NULL;
  v_adalba_brand_id uuid := NULL;
  v_lindisse_brand_id uuid := NULL;
  v_agency_id uuid;
  v_owner_before text;
  v_memberships_before text;
BEGIN
  IF v_scalbeto_id IS NULL OR v_adalba_user_id IS NULL OR v_adalba_brand_id IS NULL OR v_lindisse_brand_id IS NULL THEN RAISE EXCEPTION 'AGENCY_DEMOTION_INPUT_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_scalbeto_id AND lower(email) = 'scalbeto@gmail.com') OR NOT EXISTS (SELECT 1 FROM public.perfis WHERE id = v_scalbeto_id AND role = 'admin') THEN RAISE EXCEPTION 'AGENCY_DEMOTION_NEW_ADMIN_NOT_READY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_adalba_user_id AND lower(email) = 'adalbapro@gmail.com') OR NOT EXISTS (SELECT 1 FROM public.perfis WHERE id = v_adalba_user_id AND role = 'admin') THEN RAISE EXCEPTION 'AGENCY_DEMOTION_CURRENT_ADMIN_NOT_READY'; END IF;
  IF (SELECT count(*) FROM public.perfis WHERE role = 'admin') < 2 THEN RAISE EXCEPTION 'AGENCY_DEMOTION_LAST_ADMIN_GUARD'; END IF;
  SELECT id INTO v_agency_id FROM public.agencies WHERE lower(slug) = 'agencia-adalba' AND status = 'active' FOR UPDATE;
  IF v_agency_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.agency_memberships WHERE agency_id = v_agency_id AND user_id = v_adalba_user_id AND role = 'agency_admin' AND status = 'active') OR (SELECT count(*) FROM public.agency_brands WHERE agency_id = v_agency_id AND brand_id IN (v_adalba_brand_id, v_lindisse_brand_id) AND status = 'active') <> 2 THEN RAISE EXCEPTION 'AGENCY_DEMOTION_AGENCY_PRECONDITION_FAILED'; END IF;
  SELECT md5(coalesce(string_agg(id::text || ':' || coalesce(owner_user_id::text, ''), ',' ORDER BY id), '')) INTO v_owner_before FROM public.marcas;
  SELECT md5(coalesce(string_agg(to_jsonb(m)::text, ',' ORDER BY m.id), '')) INTO v_memberships_before FROM public.brand_memberships m;
  UPDATE public.perfis SET role = 'cliente' WHERE id = v_adalba_user_id AND role = 'admin';
  IF NOT EXISTS (SELECT 1 FROM public.perfis WHERE id = v_scalbeto_id AND role = 'admin') OR EXISTS (SELECT 1 FROM public.perfis WHERE id = v_adalba_user_id AND role = 'admin') OR (SELECT count(*) FROM public.perfis WHERE role = 'admin') < 1 THEN RAISE EXCEPTION 'AGENCY_DEMOTION_POSTCONDITION_FAILED'; END IF;
  IF (SELECT md5(coalesce(string_agg(id::text || ':' || coalesce(owner_user_id::text, ''), ',' ORDER BY id), '')) FROM public.marcas) IS DISTINCT FROM v_owner_before THEN RAISE EXCEPTION 'AGENCY_DEMOTION_OWNER_CHANGED'; END IF;
  IF (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, ',' ORDER BY m.id), '')) FROM public.brand_memberships m) IS DISTINCT FROM v_memberships_before THEN RAISE EXCEPTION 'AGENCY_DEMOTION_BRAND_MEMBERSHIPS_CHANGED'; END IF;
END $$;
COMMIT;
