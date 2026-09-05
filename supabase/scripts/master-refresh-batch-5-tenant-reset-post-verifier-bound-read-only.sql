-- MASTER REFRESH BATCH 5 - bound read-only post-verifier
BEGIN TRANSACTION READ ONLY;
WITH
ta(id) AS (VALUES
 ('1febb431-4e44-49e9-b8cd-12115f4ad999'::uuid),('3cc14013-3296-4094-80de-712abc4ceae8'::uuid),
 ('cd84f5ee-b939-4b05-afa4-52aabb8c9aa4'::uuid),('ae851a64-5bff-449b-865c-ec6aa950be38'::uuid)
), tb(id) AS (VALUES
 ('f514a553-ce4a-472e-9aec-c3fecff375f1'::uuid),('033b0cde-6e00-472c-b9d6-3c10ad33ae61'::uuid)
), defs AS (
 SELECT 'relation' kind,format('%s|%s|%s|%s|%s|%s',c.oid::regclass,c.relkind,pg_get_userbyid(c.relowner),coalesce(c.relacl::text,''),c.relrowsecurity,c.relforcerowsecurity) val FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','S')
 UNION ALL SELECT 'column',format('%s|%s|%s|%s|%s|%s',table_name,ordinal_position,column_name,data_type,is_nullable,coalesce(column_default,'')) FROM information_schema.columns WHERE table_schema='public'
 UNION ALL SELECT 'constraint',format('%s|%s|%s|%s',conrelid::regclass,conname,convalidated,pg_get_constraintdef(oid,true)) FROM pg_constraint WHERE connamespace='public'::regnamespace
 UNION ALL SELECT 'index',format('%s|%s|%s',tablename,indexname,indexdef) FROM pg_indexes WHERE schemaname='public'
 UNION ALL SELECT 'trigger',format('%s|%s|%s|%s|%s',t.tgrelid::regclass,t.tgname,t.tgenabled,t.tgtype,t.tgfoid::regprocedure) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
 UNION ALL SELECT 'policy',format('%s|%s|%s|%s|%s|%s|%s',tablename,policyname,permissive,roles,cmd,coalesce(qual,''),coalesce(with_check,'')) FROM pg_policies WHERE schemaname='public'
 UNION ALL SELECT 'function',format('%s|%s|%s|%s|%s',p.oid::regprocedure,pg_get_userbyid(p.proowner),p.prosecdef,coalesce(p.proacl::text,''),md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
), checks(check_name, pass, observed) AS (
 SELECT 'test_agencies_zero',count(*)=0,count(*)::text FROM public.agencies WHERE id IN (SELECT id FROM ta)
 UNION ALL SELECT 'test_brands_zero',count(*)=0,count(*)::text FROM public.marcas WHERE id IN (SELECT id FROM tb)
 UNION ALL SELECT 'test_usage_zero',count(*)=0,count(*)::text FROM public.integration_usage_events WHERE agency_id IN (SELECT id FROM ta) AND brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'test_grants_zero',count(*)=0,count(*)::text FROM public.integration_grants WHERE source_agency_id IN (SELECT id FROM ta) OR target_agency_id IN (SELECT id FROM ta) OR target_brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'test_bindings_zero',count(*)=0,count(*)::text FROM public.integration_bindings WHERE target_agency_id IN (SELECT id FROM ta) OR target_brand_id IN (SELECT id FROM tb)
 UNION ALL SELECT 'test_minerador_zero',count(*)=0,count(*)::text FROM (
   SELECT id FROM public.minerador_keywords WHERE brand_id IN (SELECT id FROM tb)
   UNION ALL SELECT id FROM public.minerador_discovery_runs WHERE brand_id IN (SELECT id FROM tb)
   UNION ALL SELECT id FROM public.minerador_discovery_candidates WHERE brand_id IN (SELECT id FROM tb)
   UNION ALL SELECT id FROM public.minerador_discovery_import_batches WHERE brand_id IN (SELECT id FROM tb)
   UNION ALL SELECT id FROM public.minerador_discovery_keyword_origins WHERE brand_id IN (SELECT id FROM tb)
 ) x
 UNION ALL SELECT 'test_editorial_zero',count(*)=0,count(*)::text FROM (
   SELECT version_id::text FROM public.editorial_artifact_versions WHERE marca_id IN (SELECT id FROM tb)
   UNION ALL SELECT id::text FROM public.editorial_workflow_items WHERE marca_id IN (SELECT id FROM tb)
   UNION ALL SELECT id::text FROM public.editorial_serp_snapshots WHERE marca_id IN (SELECT id FROM tb)
   UNION ALL SELECT id::text FROM public.editorial_serp_reviews WHERE marca_id IN (SELECT id FROM tb)
   UNION ALL SELECT id::text FROM public.content_documents WHERE marca_id IN (SELECT id FROM tb)
   UNION ALL SELECT id::text FROM public.publication_records WHERE marca_id IN (SELECT id FROM tb)
 ) x
 UNION ALL SELECT 'global_admin_preserved',count(*)=1,count(*)::text FROM public.perfis p JOIN auth.users u ON u.id=p.id WHERE lower(u.email)='adalbapro@gmail.com' AND lower(p.role)='admin'
 UNION ALL SELECT 'auth_users_preserved',count(*)=4,count(*)::text FROM auth.users
 UNION ALL SELECT 'auth_users_fingerprint',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='653fd98baacff90426ecb9eb31e76230',count(*)::text FROM auth.users t
 UNION ALL SELECT 'perfis_fingerprint',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='f85a3988eb1fd6b2bd86ea294275c206',count(*)::text FROM public.perfis t
 UNION ALL SELECT 'connections_preserved',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='4fc9f863bb77fa665942107a88bd94c8',count(*)::text FROM public.integration_connections t
 UNION ALL SELECT 'dataforseo_preserved',(SELECT md5(row_to_json(x)::text) FROM (SELECT c.* FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id WHERE p.provider_key='dataforseo') x)='5183efa362a9c42bf70fa610790a8ccb','1'
 UNION ALL SELECT 'openrouter_preserved',(SELECT md5(row_to_json(x)::text) FROM (SELECT c.* FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id WHERE p.provider_key='openrouter') x)='f68619ff1d436331127bcbde173cd33b','1'
 UNION ALL SELECT 'vault_preserved',count(*)=4 AND md5(coalesce(string_agg(md5(jsonb_build_object('id',id,'name',name,'description',description)::text),'' ORDER BY id::text),''))='96f757bda7ddb6d1fb84c1f9eb060b9a',count(*)::text FROM vault.secrets
 UNION ALL SELECT 'non_target_invitation_preserved',count(*)=1 AND md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)))='cce99a69df3f0cea439e85e3b3e24878',count(*)::text FROM public.agency_invitations t
 UNION ALL SELECT 'non_target_token_preserved',count(*)=1 AND md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)))='f894df2933a8838b94e2244ec08cb17b',count(*)::text FROM public.agency_invitation_token_generations t
 UNION ALL SELECT 'non_target_message_preserved',count(*)=1 AND md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)))='560a49310cf629a1a5d1cf16a39d7970',count(*)::text FROM public.communication_messages t
 UNION ALL SELECT 'append_only_guards_restored',
   md5((SELECT prosrc FROM pg_proc WHERE oid='public.integration_usage_events_prevent_mutation()'::regprocedure))='95941662d9e63448cfab04c2ea04979e'
   AND md5((SELECT prosrc FROM pg_proc WHERE oid='public.minerador_discovery_run_immutable()'::regprocedure))='cc6380c7066bf7f5f0b9385e20ed06d6','2'
 UNION ALL SELECT 'canonical_schema_preserved',count(*)=1368 AND md5(string_agg(kind||':'||val,E'\n' ORDER BY kind,val))='f058b86b56e6d99ab24dac967241c221',count(*)::text FROM defs
 UNION ALL SELECT 'orphan_agency_memberships',count(*)=0,count(*)::text FROM public.agency_memberships m LEFT JOIN public.agencies a ON a.id=m.agency_id WHERE a.id IS NULL
 UNION ALL SELECT 'orphan_brand_links',count(*)=0,count(*)::text FROM public.agency_brands ab LEFT JOIN public.agencies a ON a.id=ab.agency_id LEFT JOIN public.marcas m ON m.id=ab.brand_id WHERE a.id IS NULL OR m.id IS NULL
)
SELECT check_name,CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END verdict,observed FROM checks
UNION ALL SELECT 'BATCH_5_POST_VERIFIER',CASE WHEN bool_and(pass) THEN 'PASS' ELSE 'FAIL' END,count(*) FILTER (WHERE NOT pass)::text FROM checks
ORDER BY check_name;
ROLLBACK;
