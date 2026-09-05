-- Master Refresh Batch 6 - bound read-only post-verifier.
BEGIN TRANSACTION READ ONLY;
WITH public_defs AS (
 SELECT 'relation' kind,format('%s|%s|%s|%s|%s|%s',c.oid::regclass,c.relkind,pg_get_userbyid(c.relowner),coalesce(c.relacl::text,''),c.relrowsecurity,c.relforcerowsecurity) val FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','S')
 UNION ALL SELECT 'column',format('%s|%s|%s|%s|%s|%s',table_name,ordinal_position,column_name,data_type,is_nullable,coalesce(column_default,'')) FROM information_schema.columns WHERE table_schema='public'
 UNION ALL SELECT 'constraint',format('%s|%s|%s|%s',conrelid::regclass,conname,convalidated,pg_get_constraintdef(oid,true)) FROM pg_constraint WHERE connamespace='public'::regnamespace
 UNION ALL SELECT 'index',format('%s|%s|%s',tablename,indexname,indexdef) FROM pg_indexes WHERE schemaname='public'
 UNION ALL SELECT 'trigger',format('%s|%s|%s|%s|%s',t.tgrelid::regclass,t.tgname,t.tgenabled,t.tgtype,t.tgfoid::regprocedure) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
 UNION ALL SELECT 'policy',format('%s|%s|%s|%s|%s|%s|%s',tablename,policyname,permissive,roles,cmd,coalesce(qual,''),coalesce(with_check,'')) FROM pg_policies WHERE schemaname='public'
 UNION ALL SELECT 'function',format('%s|%s|%s|%s|%s',p.oid::regprocedure,pg_get_userbyid(p.proowner),p.prosecdef,coalesce(p.proacl::text,''),md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
), checks(check_name,pass,observed) AS (
 SELECT 'migration_backup_tables_zero',count(*)=0,count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='migration_backup' AND c.relkind IN ('r','p')
 UNION ALL SELECT 'migration_backup_schema_absent',NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='migration_backup'),CASE WHEN EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='migration_backup') THEN 'present' ELSE 'absent' END
 UNION ALL SELECT 'public_catalog_preserved',count(*)=1368 AND md5(string_agg(kind||':'||val,E'\n' ORDER BY kind,val))='f058b86b56e6d99ab24dac967241c221',count(*)::text FROM public_defs
 UNION ALL SELECT 'auth_users_preserved',count(*)=4 AND md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='653fd98baacff90426ecb9eb31e76230',count(*)::text FROM auth.users t
 UNION ALL SELECT 'perfis_preserved',count(*)=1 AND md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='f85a3988eb1fd6b2bd86ea294275c206',count(*)::text FROM public.perfis t
 UNION ALL SELECT 'connections_preserved',count(*)=3 AND md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='4fc9f863bb77fa665942107a88bd94c8',count(*)::text FROM public.integration_connections t
 UNION ALL SELECT 'providers_preserved',count(*)=3 AND md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='08c1b555b2250c875cb876f4504937d9',count(*)::text FROM public.integration_providers t
 UNION ALL SELECT 'integration_capabilities_preserved',count(*)=4 AND md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='c39931ee2aefdcc998950aaad01d618a',count(*)::text FROM public.integration_capabilities t
 UNION ALL SELECT 'integration_quotas_preserved',count(*)=2 AND md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='0b6265310b75f45c5536cf6cbb4e379b',count(*)::text FROM public.integration_quota_policies t
 UNION ALL SELECT 'canonical_capabilities_preserved',count(*)=11 AND md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='58b87e497d472413e89035d69cdef7db',count(*)::text FROM public.canonical_capabilities t
 UNION ALL SELECT 'vault_preserved',count(*)=4 AND md5(coalesce(string_agg(md5(jsonb_build_object('id',id,'name',name,'description',description)::text),'' ORDER BY id::text),''))='96f757bda7ddb6d1fb84c1f9eb060b9a',count(*)::text FROM vault.secrets
 UNION ALL SELECT 'google_ads_legacy_absent',to_regclass('public.minerador_google_ads_connections') IS NULL AND to_regclass('public.google_ads_binding_targeting') IS NULL AND to_regclass('public.google_ads_binding_account_state') IS NULL AND to_regprocedure('public.google_ads_binding_configuration_validate()') IS NULL,'four objects absent'
 UNION ALL SELECT 'briefings_compatibility_preserved',to_regclass('public.briefings_artigos') IS NOT NULL AND to_regprocedure('public.protect_published_briefing()') IS NOT NULL,'table and trigger function present'
)
SELECT check_name,CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END verdict,observed FROM checks
UNION ALL SELECT 'BATCH_6_POST_VERIFIER',CASE WHEN bool_and(pass) THEN 'PASS' ELSE 'FAIL' END,count(*) FILTER(WHERE NOT pass)::text FROM checks
ORDER BY check_name;
ROLLBACK;
