-- FASE 2C / ESCRITA MANUAL E TRANSACIONAL.
-- Execute somente apos READY_FOR_MANUAL_BOOTSTRAP e snapshot aprovado.
-- Substitua somente __BOOTSTRAP_EMAIL__. Falhas revertem toda a transacao.
BEGIN;

SET LOCAL lock_timeout = '10s';
LOCK TABLE public.perfis, public.agencies, public.agency_memberships,
  public.agency_brands, public.marcas, public.brand_memberships,
  public.brand_member_permissions IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_requested_email text := nullif(lower(btrim('ADALBAPRO@GMAIL.COM')), '__bootstrap_email__');
  v_actor_user_id uuid;
  v_agency_id uuid;
  v_adalba_brand_id uuid;
  v_lindisse_brand_id uuid;
  v_brand_owner_fingerprint text;
  v_membership_id uuid;
BEGIN
  IF v_requested_email IS NULL THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_INPUT_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE lower(coalesce(email, '')) = v_requested_email) <> 1 THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_ACTOR_NOT_UNIQUE_OR_MISSING';
  END IF;
  SELECT id INTO v_actor_user_id FROM auth.users
  WHERE lower(coalesce(email, '')) = v_requested_email
    AND (email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL);
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_ACTOR_EMAIL_NOT_CONFIRMED';
  END IF;

  IF to_regclass('public.agencies') IS NULL OR to_regclass('public.agency_memberships') IS NULL
    OR to_regclass('public.agency_brands') IS NULL OR to_regclass('public.brand_memberships') IS NULL
    OR to_regclass('public.brand_member_permissions') IS NULL
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'owner_user_id')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'canonical_role') THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_CANONICAL_STRUCTURE_MISSING';
  END IF;

  IF (SELECT count(*) FROM public.marcas WHERE status = 'active' AND lower(nome) = 'adalba') <> 1
    OR (SELECT count(*) FROM public.marcas WHERE status = 'active' AND lower(nome) = 'lindisse') <> 1 THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_REQUIRED_BRANDS_NOT_UNIQUE_OR_MISSING';
  END IF;
  SELECT id INTO v_adalba_brand_id FROM public.marcas WHERE status = 'active' AND lower(nome) = 'adalba' FOR UPDATE;
  SELECT id INTO v_lindisse_brand_id FROM public.marcas WHERE status = 'active' AND lower(nome) = 'lindisse' FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.marcas m JOIN auth.users u ON u.id = m.owner_user_id WHERE m.id IN (v_adalba_brand_id, v_lindisse_brand_id)) THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_BRAND_OWNER_MISSING_OR_INVALID';
  END IF;
  IF (SELECT count(*) FROM public.marcas m JOIN auth.users u ON u.id = m.owner_user_id WHERE m.id IN (v_adalba_brand_id, v_lindisse_brand_id)) <> 2 THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_BRAND_OWNER_MISSING_OR_INVALID';
  END IF;
  SELECT md5(coalesce(string_agg(id::text || ':' || coalesce(owner_user_id::text, ''), ',' ORDER BY id), '')) INTO v_brand_owner_fingerprint
  FROM public.marcas WHERE id IN (v_adalba_brand_id, v_lindisse_brand_id);

  IF (SELECT count(*) FROM public.agencies WHERE lower(slug) = 'agencia-adalba') > 1 THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_AGENCY_ADALBA_CONFLICT';
  END IF;
  SELECT id INTO v_agency_id FROM public.agencies WHERE lower(slug) = 'agencia-adalba' FOR UPDATE;
  IF v_agency_id IS NULL THEN
    INSERT INTO public.agencies (name, slug, status, owner_user_id)
    VALUES (U&'Ag\00EAncia Adalba', 'agencia-adalba', 'active', v_actor_user_id)
    RETURNING id INTO v_agency_id;
  ELSIF NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = v_agency_id AND name = U&'Ag\00EAncia Adalba' AND status = 'active') THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_AGENCY_ADALBA_CONFLICT';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agency_brands ab WHERE ab.brand_id IN (v_adalba_brand_id, v_lindisse_brand_id) AND ab.status = 'active' AND ab.agency_id <> v_agency_id) THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_ACTIVE_AGENCY_LINK_CONFLICT';
  END IF;

  INSERT INTO public.perfis (id, role) VALUES (v_actor_user_id, 'admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin';
  UPDATE public.agencies SET owner_user_id = v_actor_user_id, updated_at = now() WHERE id = v_agency_id;
  INSERT INTO public.agency_memberships (agency_id, user_id, role, canonical_role, status)
  VALUES (v_agency_id, v_actor_user_id, 'agency_admin', 'agency_admin', 'active')
  ON CONFLICT (agency_id, user_id) DO UPDATE
  SET role = 'agency_admin', canonical_role = 'agency_admin', status = 'active', updated_at = now();
  INSERT INTO public.agency_brands (agency_id, brand_id, status)
  VALUES (v_agency_id, v_adalba_brand_id, 'active'), (v_agency_id, v_lindisse_brand_id, 'active')
  ON CONFLICT (agency_id, brand_id) DO UPDATE SET status = 'active', updated_at = now();

  INSERT INTO public.brand_memberships (marca_id, member_user_id, role, permissions, status)
  VALUES (v_adalba_brand_id, v_actor_user_id, 'brand_admin', '{}'::jsonb, 'active'), (v_lindisse_brand_id, v_actor_user_id, 'brand_admin', '{}'::jsonb, 'active')
  ON CONFLICT (marca_id, member_user_id) DO UPDATE
  SET role = CASE WHEN public.brand_memberships.role = 'owner' THEN 'owner' ELSE 'brand_admin' END,
      status = 'active', updated_at = now();
  FOR v_membership_id IN SELECT id FROM public.brand_memberships WHERE marca_id IN (v_adalba_brand_id, v_lindisse_brand_id) AND member_user_id = v_actor_user_id AND status = 'active'
  LOOP
    INSERT INTO public.brand_member_permissions (membership_id, module, action, granted, granted_by)
    SELECT v_membership_id, module_name, action_name, true, 'fase_2c_initial_identity'
    FROM (VALUES ('marca'), ('minerador'), ('arquiteto'), ('radar'), ('planejador'), ('redator'), ('publicacoes')) AS modules(module_name)
    CROSS JOIN (VALUES ('view'), ('comment'), ('create'), ('edit'), ('review'), ('approve'), ('export'), ('publish'), ('manage')) AS actions(action_name)
    ON CONFLICT (membership_id, module, action) DO UPDATE SET granted = true, updated_at = now();
  END LOOP;

  IF (SELECT md5(coalesce(string_agg(id::text || ':' || coalesce(owner_user_id::text, ''), ',' ORDER BY id), '')) FROM public.marcas WHERE id IN (v_adalba_brand_id, v_lindisse_brand_id)) IS DISTINCT FROM v_brand_owner_fingerprint THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_BRAND_OWNER_CHANGED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.perfis WHERE id = v_actor_user_id AND role = 'admin')
    OR (SELECT count(*) FROM public.agencies WHERE id = v_agency_id AND status = 'active' AND owner_user_id = v_actor_user_id) <> 1
    OR NOT EXISTS (SELECT 1 FROM public.agency_memberships WHERE agency_id = v_agency_id AND user_id = v_actor_user_id AND role = 'agency_admin' AND canonical_role = 'agency_admin' AND status = 'active')
    OR (SELECT count(*) FROM public.agency_brands WHERE agency_id = v_agency_id AND brand_id IN (v_adalba_brand_id, v_lindisse_brand_id) AND status = 'active') <> 2
    OR (SELECT count(*) FROM public.brand_memberships WHERE marca_id IN (v_adalba_brand_id, v_lindisse_brand_id) AND member_user_id = v_actor_user_id AND status = 'active') <> 2 THEN
    RAISE EXCEPTION 'FASE_2C_BOOTSTRAP_POSTCONDITION_FAILED';
  END IF;
END $$;

COMMIT;
