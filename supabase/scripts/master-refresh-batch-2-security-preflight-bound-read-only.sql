-- Bound remote preflight for Master Refresh Batch 2 (read-only).
-- Project: hjjlntdpdgvpnazdztqw
-- Baseline captured: 2026-08-17 America/Sao_Paulo.

WITH target_names(name) AS (VALUES
  ('canonical_apply_brand_agency_capability_restriction'), ('canonical_assign_agency_owner'),
  ('canonical_revoke_brand_agency_capability_restriction'), ('canonical_set_agency_brand_link'),
  ('canonical_set_agency_membership_status'), ('canonical_upsert_agency_membership'),
  ('canonical_validate_single_operational_agency_actor'), ('minerador_discovery_candidate_brand_guard'),
  ('minerador_discovery_import_brand_guard'), ('minerador_discovery_run_immutable'),
  ('tenant_0005_protect_last_owner'), ('tenant_0005_protect_owner_change'),
  ('canonical_capability_for_module'), ('minerador_discovery_normalize_keyword'),
  ('protect_marca_with_published'), ('protect_published_briefing'),
  ('protect_published_keyword'), ('protect_published_lista')
), functions AS (
  SELECT p.oid, p.proname,
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS signature,
    pg_get_userbyid(p.proowner) AS owner_name, p.prosecdef, p.provolatile, p.proconfig,
    coalesce(array_to_string(p.proacl, ','), '') AS acl, l.lanname, p.prorettype::regtype::text AS return_type, p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
), checks AS (
  SELECT 'briefings_exists' AS check_name,
    (to_regclass('public.briefings_artigos') IS NOT NULL) AS passed,
    to_regclass('public.briefings_artigos')::text AS observed, 'briefings_artigos' AS expected
  UNION ALL SELECT 'briefings_rows', (SELECT count(*) = 0 FROM public.briefings_artigos),
    (SELECT count(*)::text FROM public.briefings_artigos), '0'
  UNION ALL SELECT 'briefings_rls_owner', EXISTS (
    SELECT 1 FROM pg_class c WHERE c.oid = 'public.briefings_artigos'::regclass
      AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner) = 'postgres'
  ), (SELECT concat_ws(':', relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner)) FROM pg_class WHERE oid = 'public.briefings_artigos'::regclass), 't:f:postgres'
  UNION ALL SELECT 'briefings_policy_count', (SELECT count(*) = 0 FROM pg_policies WHERE schemaname='public' AND tablename='briefings_artigos'),
    (SELECT count(*)::text FROM pg_policies WHERE schemaname='public' AND tablename='briefings_artigos'), '0'
  UNION ALL SELECT 'briefings_anon_full_acl', (
    SELECT count(*) = 8 FROM aclexplode((SELECT relacl FROM pg_class WHERE oid='public.briefings_artigos'::regclass)) a
    WHERE a.grantee='anon'::regrole AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  ), (SELECT count(*)::text FROM aclexplode((SELECT relacl FROM pg_class WHERE oid='public.briefings_artigos'::regclass)) a WHERE a.grantee='anon'::regrole), '8'
  UNION ALL SELECT 'security_definer_count', (SELECT count(*)=54 FROM functions WHERE prosecdef), (SELECT count(*)::text FROM functions WHERE prosecdef), '54'
  UNION ALL SELECT 'security_definer_anon_execute', (SELECT count(*)=12 FROM functions WHERE prosecdef AND has_function_privilege('anon',oid,'EXECUTE')), (SELECT count(*)::text FROM functions WHERE prosecdef AND has_function_privilege('anon',oid,'EXECUTE')), '12'
  UNION ALL SELECT 'security_definer_public_execute', (SELECT count(*)=10 FROM functions f WHERE prosecdef AND EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=f.oid)))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')), (SELECT count(*)::text FROM functions f WHERE prosecdef AND EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',(SELECT proowner FROM pg_proc WHERE oid=f.oid)))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')), '10'
  UNION ALL SELECT 'target_function_count', (SELECT count(*)=18 FROM functions WHERE proname IN (SELECT name FROM target_names)), (SELECT count(*)::text FROM functions WHERE proname IN (SELECT name FROM target_names)), '18'
  UNION ALL SELECT 'target_function_body_hash', (SELECT md5(string_agg(concat_ws(':',signature,owner_name,prosecdef::text,provolatile::text,lanname,return_type,prosrc), E'\n' ORDER BY signature))='f8ba0c721502551a5ed6706c304efe30' FROM functions WHERE proname IN (SELECT name FROM target_names)), (SELECT md5(string_agg(concat_ws(':',signature,owner_name,prosecdef::text,provolatile::text,lanname,return_type,prosrc), E'\n' ORDER BY signature)) FROM functions WHERE proname IN (SELECT name FROM target_names)), 'f8ba0c721502551a5ed6706c304efe30'
  UNION ALL SELECT 'target_acl_config_hash', (SELECT md5(string_agg(concat_ws(':',signature,coalesce(array_to_string(proconfig,','),''),acl),E'\n' ORDER BY signature))='845514870bad9870e1e608bea1df8399' FROM functions WHERE proname IN (SELECT name FROM target_names)), (SELECT md5(string_agg(concat_ws(':',signature,coalesce(array_to_string(proconfig,','),''),acl),E'\n' ORDER BY signature)) FROM functions WHERE proname IN (SELECT name FROM target_names)), '845514870bad9870e1e608bea1df8399'
  UNION ALL SELECT 'non_target_function_hash', (SELECT md5(string_agg(concat_ws(':',signature,owner_name,prosecdef::text,provolatile::text,coalesce(array_to_string(proconfig,','),''),acl,prosrc),E'\n' ORDER BY signature))='2a75678236dd6bc65a9ba6be855a83d4' FROM functions WHERE proname NOT IN (SELECT name FROM target_names)), (SELECT md5(string_agg(concat_ws(':',signature,owner_name,prosecdef::text,provolatile::text,coalesce(array_to_string(proconfig,','),''),acl,prosrc),E'\n' ORDER BY signature)) FROM functions WHERE proname NOT IN (SELECT name FROM target_names)), '2a75678236dd6bc65a9ba6be855a83d4'
)
SELECT check_name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS verdict, observed, expected
FROM checks ORDER BY check_name;
