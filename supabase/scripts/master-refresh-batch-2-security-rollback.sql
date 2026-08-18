-- Contingency only. DO NOT execute during preparation or normal Batch 2 apply.
-- This restores the exact effective ACL/search_path/policy baseline captured on 2026-08-17.
BEGIN;

DO $rollback_guard$
BEGIN
  IF has_table_privilege('anon', 'public.briefings_artigos', 'SELECT')
     OR has_table_privilege('authenticated', 'public.briefings_artigos', 'SELECT') THEN
    RAISE EXCEPTION 'BATCH_2_ROLLBACK_POST_STATE_NOT_CONFIRMED';
  END IF;
  IF has_function_privilege('anon', 'public.canonical_assign_agency_owner(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'BATCH_2_ROLLBACK_POST_STATE_NOT_CONFIRMED';
  END IF;
END
$rollback_guard$;

GRANT ALL PRIVILEGES ON TABLE public.briefings_artigos TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.canonical_apply_brand_agency_capability_restriction(uuid, uuid, uuid, text, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_assign_agency_owner(uuid, uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_revoke_brand_agency_capability_restriction(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_set_agency_brand_link(uuid, uuid, uuid, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_set_agency_membership_status(uuid, uuid, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_upsert_agency_membership(uuid, uuid, uuid, text, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_validate_single_operational_agency_actor() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.minerador_discovery_candidate_brand_guard() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.minerador_discovery_import_brand_guard() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.minerador_discovery_run_immutable() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_capability_for_module(text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.minerador_discovery_normalize_keyword(text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_marca_with_published() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_published_briefing() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_published_keyword() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_published_lista() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_0005_protect_last_owner() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_0005_protect_owner_change() TO anon, authenticated, service_role;

ALTER FUNCTION public.canonical_capability_for_module(text) RESET search_path;
ALTER FUNCTION public.minerador_discovery_normalize_keyword(text) RESET search_path;
ALTER FUNCTION public.protect_marca_with_published() RESET search_path;
ALTER FUNCTION public.protect_published_briefing() RESET search_path;
ALTER FUNCTION public.protect_published_keyword() RESET search_path;
ALTER FUNCTION public.protect_published_lista() RESET search_path;

ALTER POLICY tenant_0005_memberships_select ON public.brand_memberships
  USING (is_global_admin() OR member_user_id = auth.uid() OR can_access_brand(marca_id));
ALTER POLICY tenant_0005_marcas_insert ON public.marcas
  WITH CHECK (is_global_admin() OR owner_user_id = auth.uid());
ALTER POLICY minerador_discovery_runs_insert ON public.minerador_discovery_runs
  WITH CHECK (tenant_actor_has_permission(brand_id, 'minerador', 'edit') AND (actor_user_id = auth.uid() OR is_global_admin()));

COMMIT;
