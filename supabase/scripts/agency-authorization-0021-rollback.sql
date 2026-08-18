-- Rollback guardado da 0021. Não executar sem incidente, snapshot e decisão
-- humana. Não faz correção de dados nem escolhe owner/membership.
-- A regra corrigida Admin global + uma Agency não exige tratamento especial
-- neste rollback: a restauração mantém owner/member como fontes operacionais.

BEGIN;

DROP POLICY IF EXISTS agency_0021_agencies_select ON public.agencies;
DROP POLICY IF EXISTS agency_0021_memberships_select ON public.agency_memberships;
DROP POLICY IF EXISTS agency_0021_brands_select ON public.agency_brands;
DROP POLICY IF EXISTS canonical_0021_capabilities_select ON public.canonical_capabilities;
DROP POLICY IF EXISTS canonical_0021_membership_capabilities_select ON public.agency_membership_capabilities;
DROP POLICY IF EXISTS canonical_0021_restrictions_select ON public.brand_agency_capability_restrictions;

DROP TRIGGER IF EXISTS canonical_0021_agencies_actor_guard ON public.agencies;
DROP TRIGGER IF EXISTS canonical_0021_memberships_actor_guard ON public.agency_memberships;

DROP FUNCTION IF EXISTS public.canonical_assign_agency_owner(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.canonical_upsert_agency_membership(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.canonical_set_agency_membership_status(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.canonical_set_agency_brand_link(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.canonical_apply_brand_agency_capability_restriction(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.canonical_revoke_brand_agency_capability_restriction(uuid, uuid);
DROP FUNCTION IF EXISTS public.canonical_assert_rpc_actor(uuid);
DROP FUNCTION IF EXISTS public.canonical_validate_single_operational_agency_actor();
DROP FUNCTION IF EXISTS public.canonical_capability_for_module(text);

DROP INDEX IF EXISTS public.uq_agencies_active_owner_0021;
DROP INDEX IF EXISTS public.uq_agency_memberships_active_user_0021;
DROP INDEX IF EXISTS public.uq_brand_agency_capability_restriction_active_0021;
DROP INDEX IF EXISTS public.ix_agency_membership_capabilities_capability_0021;
DROP INDEX IF EXISTS public.ix_brand_agency_capability_restrictions_agency_0021;

-- Restaura as decisões anteriores, sem fallback por e-mail/slug.
CREATE OR REPLACE FUNCTION public.canonical_can_access_brand(target_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.marcas b WHERE b.id = target_brand_id AND b.status = 'active'
      AND (b.owner_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.brand_memberships bm WHERE bm.marca_id = b.id AND bm.member_user_id = auth.uid() AND bm.status = 'active'))
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_manage_brand(target_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.marcas b WHERE b.id = target_brand_id AND (b.owner_user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.brand_memberships bm JOIN public.brand_member_permissions p ON p.membership_id = bm.id
      WHERE bm.marca_id = b.id AND bm.member_user_id = auth.uid() AND bm.status = 'active' AND p.module = 'marca' AND p.action = 'manage' AND p.granted
    ))
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_access_agency(target_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agencies a WHERE a.id = target_agency_id AND a.status = 'active'
      AND (a.owner_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.agency_memberships am WHERE am.agency_id = a.id AND am.user_id = auth.uid() AND am.status = 'active'))
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_manage_agency(target_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agencies a WHERE a.id = target_agency_id AND a.status = 'active'
      AND (a.owner_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.agency_memberships am WHERE am.agency_id = a.id AND am.user_id = auth.uid() AND am.status = 'active' AND am.role = 'agency_admin'))
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.can_access_brand(target_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ SELECT public.canonical_can_access_brand(target_brand_id); $$;
CREATE OR REPLACE FUNCTION public.can_manage_brand(target_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ SELECT public.canonical_can_manage_brand(target_brand_id); $$;
CREATE OR REPLACE FUNCTION public.can_access_agency(target_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ SELECT public.canonical_can_access_agency(target_agency_id); $$;
CREATE OR REPLACE FUNCTION public.can_manage_agency(target_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ SELECT public.canonical_can_manage_agency(target_agency_id); $$;
CREATE OR REPLACE FUNCTION public.tenant_actor_has_permission(target_brand_id uuid, requested_module text, requested_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT public.can_access_brand(target_brand_id) AND (
    EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = target_brand_id AND b.owner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.brand_memberships bm JOIN public.brand_member_permissions p ON p.membership_id = bm.id WHERE bm.marca_id = target_brand_id AND bm.member_user_id = auth.uid() AND bm.status = 'active' AND p.module = requested_module AND p.action = requested_action AND p.granted)
  );
$$;

DROP FUNCTION IF EXISTS public.canonical_actor_can_use_brand_action(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.canonical_actor_can_use_brand_capability(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.canonical_actor_can_access_brand(uuid, uuid);
DROP FUNCTION IF EXISTS public.canonical_actor_has_brand_restriction(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.canonical_actor_has_agency_capability(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.canonical_actor_can_manage_brand(uuid, uuid);
DROP FUNCTION IF EXISTS public.canonical_actor_can_manage_agency(uuid, uuid);
DROP FUNCTION IF EXISTS public.canonical_actor_is_global_admin(uuid);

DROP TABLE IF EXISTS public.brand_agency_capability_restrictions;
DROP TABLE IF EXISTS public.agency_membership_capabilities;
DROP TABLE IF EXISTS public.canonical_capabilities;

DROP POLICY IF EXISTS agency_0021_agencies_select ON public.agencies;
DROP POLICY IF EXISTS agency_0021_memberships_select ON public.agency_memberships;
DROP POLICY IF EXISTS agency_0021_brands_select ON public.agency_brands;
CREATE POLICY agency_0014_agencies_select ON public.agencies FOR SELECT TO authenticated USING (public.can_access_agency(id));
CREATE POLICY agency_0014_memberships_select ON public.agency_memberships FOR SELECT TO authenticated USING (public.can_access_agency(agency_id));
CREATE POLICY agency_0014_brands_select ON public.agency_brands FOR SELECT TO authenticated USING (public.can_access_agency(agency_id));
CREATE POLICY agency_0014_agencies_insert ON public.agencies FOR INSERT TO authenticated WITH CHECK (public.is_global_admin());
CREATE POLICY agency_0014_agencies_update ON public.agencies FOR UPDATE TO authenticated USING (public.can_manage_agency(id)) WITH CHECK (public.can_manage_agency(id));
CREATE POLICY agency_0014_memberships_insert ON public.agency_memberships FOR INSERT TO authenticated WITH CHECK (public.can_manage_agency(agency_id));
CREATE POLICY agency_0014_memberships_update ON public.agency_memberships FOR UPDATE TO authenticated USING (public.can_manage_agency(agency_id)) WITH CHECK (public.can_manage_agency(agency_id));
CREATE POLICY agency_0014_memberships_delete ON public.agency_memberships FOR DELETE TO authenticated USING (public.can_manage_agency(agency_id));
CREATE POLICY agency_0014_brands_insert ON public.agency_brands FOR INSERT TO authenticated WITH CHECK (public.can_manage_agency(agency_id) AND public.can_manage_brand(brand_id));
CREATE POLICY agency_0014_brands_update ON public.agency_brands FOR UPDATE TO authenticated USING (public.can_manage_agency(agency_id) AND public.can_manage_brand(brand_id)) WITH CHECK (public.can_manage_agency(agency_id) AND public.can_manage_brand(brand_id));
CREATE POLICY agency_0014_brands_delete ON public.agency_brands FOR DELETE TO authenticated USING (public.can_manage_agency(agency_id) AND public.can_manage_brand(brand_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agencies, public.agency_memberships, public.agency_brands TO authenticated;

COMMIT;
