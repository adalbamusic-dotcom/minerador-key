-- Bound post-verifier for Master Refresh Batch 2 (read-only).
-- It expects the preflight baseline captured on 2026-08-17 and no data reset.

WITH target_names(name, exposure) AS (VALUES
  ('canonical_apply_brand_agency_capability_restriction','rpc'), ('canonical_assign_agency_owner','rpc'),
  ('canonical_revoke_brand_agency_capability_restriction','rpc'), ('canonical_set_agency_brand_link','rpc'),
  ('canonical_set_agency_membership_status','rpc'), ('canonical_upsert_agency_membership','rpc'),
  ('canonical_capability_for_module','helper'), ('minerador_discovery_normalize_keyword','helper'),
  ('canonical_validate_single_operational_agency_actor','trigger'), ('minerador_discovery_candidate_brand_guard','trigger'),
  ('minerador_discovery_import_brand_guard','trigger'), ('minerador_discovery_run_immutable','trigger'),
  ('tenant_0005_protect_last_owner','trigger'), ('tenant_0005_protect_owner_change','trigger'),
  ('protect_marca_with_published','trigger'), ('protect_published_briefing','trigger'),
  ('protect_published_keyword','trigger'), ('protect_published_lista','trigger')
), functions AS (
  SELECT p.oid, p.proname, t.exposure,
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS signature,
    pg_get_userbyid(p.proowner) AS owner_name, p.prosecdef, p.provolatile, p.proconfig,
    coalesce(array_to_string(p.proacl, ','), '') AS acl, l.lanname, p.prorettype::regtype::text AS return_type, p.prosrc,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
    has_function_privilege('service_role',p.oid,'EXECUTE') AS service_exec,
    EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang JOIN target_names t ON t.name=p.proname
  WHERE n.nspname='public'
), checks AS (
  SELECT 'DANGEROUS_ANON_ACL' check_name,
    NOT EXISTS (SELECT 1 FROM aclexplode((SELECT relacl FROM pg_class WHERE oid='public.briefings_artigos'::regclass)) a WHERE a.grantee='anon'::regrole) passed,
    (SELECT count(*)::text FROM aclexplode((SELECT relacl FROM pg_class WHERE oid='public.briefings_artigos'::regclass)) a WHERE a.grantee='anon'::regrole) observed, '0' expected
  UNION ALL SELECT 'AUTHENTICATED_BRIEFINGS_ACL', NOT EXISTS (SELECT 1 FROM aclexplode((SELECT relacl FROM pg_class WHERE oid='public.briefings_artigos'::regclass)) a WHERE a.grantee='authenticated'::regrole),
    (SELECT count(*)::text FROM aclexplode((SELECT relacl FROM pg_class WHERE oid='public.briefings_artigos'::regclass)) a WHERE a.grantee='authenticated'::regrole), '0'
  UNION ALL SELECT 'BRIEFINGS_DATA', (SELECT count(*)=0 FROM public.briefings_artigos), (SELECT count(*)::text FROM public.briefings_artigos), '0'
  UNION ALL SELECT 'BRIEFINGS_RLS_POLICIES', EXISTS (SELECT 1 FROM pg_class WHERE oid='public.briefings_artigos'::regclass AND relrowsecurity AND NOT relforcerowsecurity) AND (SELECT count(*)=0 FROM pg_policies WHERE schemaname='public' AND tablename='briefings_artigos'),
    (SELECT concat_ws(':',relrowsecurity,relforcerowsecurity,(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='briefings_artigos')) FROM pg_class WHERE oid='public.briefings_artigos'::regclass), 't:f:0'
  UNION ALL SELECT 'UNINTENDED_PUBLIC_FUNCTION_EXECUTE', NOT EXISTS (SELECT 1 FROM functions WHERE public_exec OR anon_exec), (SELECT count(*)::text FROM functions WHERE public_exec OR anon_exec), '0'
  UNION ALL SELECT 'CANONICAL_RPC_EXECUTE', NOT EXISTS (SELECT 1 FROM functions WHERE exposure='rpc' AND (NOT auth_exec OR NOT service_exec)), (SELECT count(*)::text FROM functions WHERE exposure='rpc' AND auth_exec AND service_exec), '6'
  UNION ALL SELECT 'HELPER_EXECUTE', NOT EXISTS (SELECT 1 FROM functions WHERE exposure='helper' AND (NOT auth_exec OR NOT service_exec)), (SELECT count(*)::text FROM functions WHERE exposure='helper' AND auth_exec AND service_exec), '2'
  UNION ALL SELECT 'TRIGGER_DIRECT_EXECUTE', NOT EXISTS (SELECT 1 FROM functions WHERE exposure='trigger' AND (auth_exec OR service_exec)), (SELECT count(*)::text FROM functions WHERE exposure='trigger' AND (auth_exec OR service_exec)), '0'
  UNION ALL SELECT 'SEARCH_PATH_FIXES', (SELECT count(*)=6 FROM functions WHERE proname IN ('canonical_capability_for_module','minerador_discovery_normalize_keyword','protect_marca_with_published','protect_published_briefing','protect_published_keyword','protect_published_lista') AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']),
    (SELECT count(*)::text FROM functions WHERE proname IN ('canonical_capability_for_module','minerador_discovery_normalize_keyword','protect_marca_with_published','protect_published_briefing','protect_published_keyword','protect_published_lista') AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']), '6'
  UNION ALL SELECT 'TARGET_FUNCTION_BODY_OWNER', (SELECT md5(string_agg(concat_ws(':',signature,owner_name,prosecdef::text,provolatile::text,lanname,return_type,prosrc),E'\n' ORDER BY signature))='f8ba0c721502551a5ed6706c304efe30' FROM functions),
    (SELECT md5(string_agg(concat_ws(':',signature,owner_name,prosecdef::text,provolatile::text,lanname,return_type,prosrc),E'\n' ORDER BY signature)) FROM functions), 'f8ba0c721502551a5ed6706c304efe30'
  UNION ALL SELECT 'RLS_AUTH_UID_INITPLAN', (SELECT count(*)=3 FROM pg_policies WHERE schemaname='public' AND (tablename,policyname) IN (('brand_memberships','tenant_0005_memberships_select'),('marcas','tenant_0005_marcas_insert'),('minerador_discovery_runs','minerador_discovery_runs_insert')) AND (coalesce(qual,'')||coalesce(with_check,'')) ~* 'select[[:space:]]+auth[.]uid[(][)]'),
    (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND (tablename,policyname) IN (('brand_memberships','tenant_0005_memberships_select'),('marcas','tenant_0005_marcas_insert'),('minerador_discovery_runs','minerador_discovery_runs_insert')) AND (coalesce(qual,'')||coalesce(with_check,'')) ~* 'select[[:space:]]+auth[.]uid[(][)]'), '3'
)
SELECT check_name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END verdict, observed, expected
FROM checks ORDER BY check_name;
