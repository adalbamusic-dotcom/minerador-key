-- Exact function/ACL/trigger inventory for Master Refresh Batch 2 (read-only).
WITH scoped_names(name) AS (VALUES
  ('canonical_capability_for_module'),('minerador_discovery_normalize_keyword'),
  ('protect_marca_with_published'),('protect_published_briefing'),
  ('protect_published_keyword'),('protect_published_lista')
), inventory AS (
  SELECT p.oid,
    format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) signature,
    p.proname,pg_get_userbyid(p.proowner) owner_name,l.lanname AS language,p.prosecdef,
    CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END security_mode,
    p.proconfig,
    EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_exec,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_exec,
    has_function_privilege('service_role',p.oid,'EXECUTE') service_role_exec,
    coalesce((SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'trigger',t.tgname,'enabled',t.tgenabled) ORDER BY t.tgrelid::regclass::text,t.tgname) FROM pg_trigger t WHERE t.tgfoid=p.oid AND NOT t.tgisinternal),'[]'::jsonb) trigger_consumers
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND (p.prosecdef OR p.proname IN (SELECT name FROM scoped_names))
)
SELECT signature,owner_name,language,security_mode,proconfig,public_exec,anon_exec,authenticated_exec,service_role_exec,trigger_consumers,
  CASE
    WHEN proname IN ('canonical_apply_brand_agency_capability_restriction','canonical_assign_agency_owner','canonical_revoke_brand_agency_capability_restriction','canonical_set_agency_brand_link','canonical_set_agency_membership_status','canonical_upsert_agency_membership') THEN 'NECESSARY_EXPOSURE_AUTHENTICATED_SERVICE_ROLE'
    WHEN proname IN ('canonical_capability_for_module','minerador_discovery_normalize_keyword') THEN 'HARDEN_SEARCH_PATH_REMOVE_PUBLIC_ANON'
    WHEN jsonb_array_length(trigger_consumers)>0 THEN 'REMOVE_DIRECT_ROLE_EXECUTE'
    WHEN public_exec OR anon_exec THEN 'INVESTIGATE'
    ELSE 'NECESSARY_EXPOSURE_PRESERVE'
  END classification
FROM inventory ORDER BY signature;
