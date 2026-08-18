BEGIN;

CREATE TABLE IF NOT EXISTS public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agencies_slug_0014 ON public.agencies (lower(slug));

CREATE TABLE IF NOT EXISTS public.agency_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('agency_admin', 'operator', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_agency_memberships_user_status_0014
  ON public.agency_memberships (user_id, status);

CREATE TABLE IF NOT EXISTS public.agency_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_brands_active_brand_0014
  ON public.agency_brands (brand_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_brands_pair_0014
  ON public.agency_brands (agency_id, brand_id);
CREATE INDEX IF NOT EXISTS ix_agency_brands_agency_status_0014
  ON public.agency_brands (agency_id, status);

CREATE OR REPLACE FUNCTION public.can_access_agency(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.is_global_admin()
      OR EXISTS (
        SELECT 1
        FROM public.agency_memberships membership
        WHERE membership.agency_id = target_agency_id
          AND membership.user_id = auth.uid()
          AND membership.status = 'active'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_agency(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.is_global_admin()
      OR EXISTS (
        SELECT 1
        FROM public.agency_memberships membership
        WHERE membership.agency_id = target_agency_id
          AND membership.user_id = auth.uid()
          AND membership.status = 'active'
          AND membership.role = 'agency_admin'
      )
    );
$$;

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_brands ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE existing_policy record;
BEGIN
  -- Existing policies are accepted only when they still enforce the 0014 contract.
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agencies' AND policyname = 'agency_0014_agencies_select';
  IF FOUND THEN
    IF existing_policy.cmd <> 'SELECT' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_access_agency%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: agencies_select'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_agencies_select ON public.agencies FOR SELECT TO authenticated USING (public.can_access_agency(id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agencies' AND policyname = 'agency_0014_agencies_insert';
  IF FOUND THEN
    IF existing_policy.cmd <> 'INSERT' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.with_check, '') NOT ILIKE '%is_global_admin%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: agencies_insert'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_agencies_insert ON public.agencies FOR INSERT TO authenticated WITH CHECK (public.is_global_admin())'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agencies' AND policyname = 'agency_0014_agencies_update';
  IF FOUND THEN
    IF existing_policy.cmd <> 'UPDATE' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_manage_agency%' OR coalesce(existing_policy.with_check, '') NOT ILIKE '%can_manage_agency%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: agencies_update'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_agencies_update ON public.agencies FOR UPDATE TO authenticated USING (public.can_manage_agency(id)) WITH CHECK (public.can_manage_agency(id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_memberships' AND policyname = 'agency_0014_memberships_select';
  IF FOUND THEN
    IF existing_policy.cmd <> 'SELECT' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_access_agency%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: memberships_select'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_memberships_select ON public.agency_memberships FOR SELECT TO authenticated USING (public.can_access_agency(agency_id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_memberships' AND policyname = 'agency_0014_memberships_insert';
  IF FOUND THEN
    IF existing_policy.cmd <> 'INSERT' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.with_check, '') NOT ILIKE '%can_manage_agency%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: memberships_insert'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_memberships_insert ON public.agency_memberships FOR INSERT TO authenticated WITH CHECK (public.can_manage_agency(agency_id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_memberships' AND policyname = 'agency_0014_memberships_update';
  IF FOUND THEN
    IF existing_policy.cmd <> 'UPDATE' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_manage_agency%' OR coalesce(existing_policy.with_check, '') NOT ILIKE '%can_manage_agency%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: memberships_update'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_memberships_update ON public.agency_memberships FOR UPDATE TO authenticated USING (public.can_manage_agency(agency_id)) WITH CHECK (public.can_manage_agency(agency_id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_memberships' AND policyname = 'agency_0014_memberships_delete';
  IF FOUND THEN
    IF existing_policy.cmd <> 'DELETE' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_manage_agency%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: memberships_delete'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_memberships_delete ON public.agency_memberships FOR DELETE TO authenticated USING (public.can_manage_agency(agency_id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_brands' AND policyname = 'agency_0014_brands_select';
  IF FOUND THEN
    IF existing_policy.cmd <> 'SELECT' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_access_agency%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: brands_select'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_brands_select ON public.agency_brands FOR SELECT TO authenticated USING (public.can_access_agency(agency_id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_brands' AND policyname = 'agency_0014_brands_insert';
  IF FOUND THEN
    IF existing_policy.cmd <> 'INSERT' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.with_check, '') NOT ILIKE '%can_manage_agency%' OR coalesce(existing_policy.with_check, '') NOT ILIKE '%can_manage_brand%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: brands_insert'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_brands_insert ON public.agency_brands FOR INSERT TO authenticated WITH CHECK (public.can_manage_agency(agency_id) AND public.can_manage_brand(brand_id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_brands' AND policyname = 'agency_0014_brands_update';
  IF FOUND THEN
    IF existing_policy.cmd <> 'UPDATE' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_manage_agency%' OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_manage_brand%' OR coalesce(existing_policy.with_check, '') NOT ILIKE '%can_manage_agency%' OR coalesce(existing_policy.with_check, '') NOT ILIKE '%can_manage_brand%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: brands_update'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_brands_update ON public.agency_brands FOR UPDATE TO authenticated USING (public.can_manage_agency(agency_id) AND public.can_manage_brand(brand_id)) WITH CHECK (public.can_manage_agency(agency_id) AND public.can_manage_brand(brand_id))'; END IF;
  SELECT * INTO existing_policy FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'agency_brands' AND policyname = 'agency_0014_brands_delete';
  IF FOUND THEN
    IF existing_policy.cmd <> 'DELETE' OR existing_policy.roles <> ARRAY['authenticated']::name[] OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_manage_agency%' OR coalesce(existing_policy.qual, '') NOT ILIKE '%can_manage_brand%' THEN RAISE EXCEPTION 'AGENCY_0014_POLICY_CONFLICT: brands_delete'; END IF;
  ELSE EXECUTE 'CREATE POLICY agency_0014_brands_delete ON public.agency_brands FOR DELETE TO authenticated USING (public.can_manage_agency(agency_id) AND public.can_manage_brand(brand_id))'; END IF;
END $$;

REVOKE ALL ON TABLE public.agencies, public.agency_memberships, public.agency_brands FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.agencies, public.agency_memberships, public.agency_brands FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agencies, public.agency_memberships, public.agency_brands TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_agency(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_agency(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_manage_agency(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_agency(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_agency(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_agency(uuid) TO authenticated, service_role;

COMMIT;
