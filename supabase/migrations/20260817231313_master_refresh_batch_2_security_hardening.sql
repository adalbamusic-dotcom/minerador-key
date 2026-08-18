-- Master Refresh Batch 2: security hardening only.
-- No table data, ownership, RLS enablement, trigger, index, or constraint changes.

DO $batch_2_preconditions$
BEGIN
  IF to_regclass('public.briefings_artigos') IS NULL THEN
    RAISE EXCEPTION 'BATCH_2_PREFLIGHT_BRIEFINGS_MISSING';
  END IF;

  IF (SELECT count(*) FROM public.briefings_artigos) <> 0 THEN
    RAISE EXCEPTION 'BATCH_2_PREFLIGHT_BRIEFINGS_DATA_DRIFT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.briefings_artigos'::regclass
      AND c.relrowsecurity
      AND NOT c.relforcerowsecurity
      AND pg_get_userbyid(c.relowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'BATCH_2_PREFLIGHT_BRIEFINGS_STRUCTURE_DRIFT';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'briefings_artigos') <> 0 THEN
    RAISE EXCEPTION 'BATCH_2_PREFLIGHT_BRIEFINGS_POLICY_DRIFT';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef) <> 54 THEN
    RAISE EXCEPTION 'BATCH_2_PREFLIGHT_SECURITY_DEFINER_DRIFT';
  END IF;
END
$batch_2_preconditions$;

-- briefings_artigos remains a server-side compatibility table. Canonical working
-- consumers use server-side authorization/service_role. The legacy browser path
-- is already denied by enabled RLS plus zero policies, so there is no functioning
-- direct authenticated Data API contract to preserve.
REVOKE ALL PRIVILEGES ON TABLE public.briefings_artigos FROM anon, authenticated;

-- Canonical administrative RPCs remain callable by authenticated/service_role.
REVOKE ALL ON FUNCTION public.canonical_apply_brand_agency_capability_restriction(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_assign_agency_owner(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_revoke_brand_agency_capability_restriction(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_set_agency_brand_link(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_set_agency_membership_status(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_upsert_agency_membership(uuid, uuid, uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.canonical_apply_brand_agency_capability_restriction(uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_assign_agency_owner(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_revoke_brand_agency_capability_restriction(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_set_agency_brand_link(uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_set_agency_membership_status(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_upsert_agency_membership(uuid, uuid, uuid, text, text) TO authenticated, service_role;

-- Helpers are consumed by authenticated authorization/RLS paths; anon/PUBLIC is
-- unnecessary. Their fixed search_path removes caller-controlled resolution.
ALTER FUNCTION public.canonical_capability_for_module(text) SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.minerador_discovery_normalize_keyword(text) SET search_path TO pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.canonical_capability_for_module(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.minerador_discovery_normalize_keyword(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canonical_capability_for_module(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.minerador_discovery_normalize_keyword(text) TO authenticated, service_role;

-- Trigger functions are invoked by their triggers and require no direct role access.
ALTER FUNCTION public.protect_marca_with_published() SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.protect_published_briefing() SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.protect_published_keyword() SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.protect_published_lista() SET search_path TO pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.canonical_validate_single_operational_agency_actor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.minerador_discovery_candidate_brand_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.minerador_discovery_import_brand_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.minerador_discovery_run_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tenant_0005_protect_last_owner() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tenant_0005_protect_owner_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_marca_with_published() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_published_briefing() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_published_keyword() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_published_lista() FROM PUBLIC, anon, authenticated, service_role;

-- Mechanical auth.uid() init-plan fixes outside the editorial pipeline.
ALTER POLICY tenant_0005_memberships_select ON public.brand_memberships
  USING (is_global_admin() OR member_user_id = (SELECT auth.uid()) OR can_access_brand(marca_id));

ALTER POLICY tenant_0005_marcas_insert ON public.marcas
  WITH CHECK (is_global_admin() OR owner_user_id = (SELECT auth.uid()));

ALTER POLICY minerador_discovery_runs_insert ON public.minerador_discovery_runs
  WITH CHECK (
    tenant_actor_has_permission(brand_id, 'minerador', 'edit')
    AND (actor_user_id = (SELECT auth.uid()) OR is_global_admin())
  );
