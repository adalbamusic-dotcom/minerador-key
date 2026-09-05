-- Master Refresh Batch 7 - canonical final baseline and closure (read-only).
-- DATABASE_CANONICAL_BASELINE_DATE = 2026-08-17.
-- The remote migration ledger is intentionally outside this proof contract.
BEGIN TRANSACTION READ ONLY;

WITH
relations AS (
  SELECT c.oid,c.relname,c.relkind,pg_get_userbyid(c.relowner) owner_name,
    coalesce(c.relacl::text,'') acl,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c
  WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','S')
), structure_items(kind,val) AS (
  SELECT 'relation',format('%s|%s|%s|%s|%s|%s',oid::regclass,relkind,owner_name,acl,relrowsecurity,relforcerowsecurity) FROM relations
  UNION ALL SELECT 'column',format('%s|%s|%s|%s|%s|%s',table_name,ordinal_position,column_name,data_type,is_nullable,coalesce(column_default,'')) FROM information_schema.columns WHERE table_schema='public'
  UNION ALL SELECT 'constraint',format('%s|%s|%s|%s',conrelid::regclass,conname,convalidated,pg_get_constraintdef(oid,true)) FROM pg_constraint WHERE connamespace='public'::regnamespace
  UNION ALL SELECT 'index',format('%s|%s|%s',tablename,indexname,indexdef) FROM pg_indexes WHERE schemaname='public'
  UNION ALL SELECT 'trigger',format('%s|%s|%s|%s|%s',t.tgrelid::regclass,t.tgname,t.tgenabled,t.tgtype,t.tgfoid::regprocedure) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
  UNION ALL SELECT 'policy',format('%s|%s|%s|%s|%s|%s|%s',tablename,policyname,permissive,roles,cmd,coalesce(qual,''),coalesce(with_check,'')) FROM pg_policies WHERE schemaname='public'
  UNION ALL SELECT 'function',format('%s|%s|%s|%s|%s',p.oid::regprocedure,pg_get_userbyid(p.proowner),p.prosecdef,coalesce(p.proacl::text,''),md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
), structure_categories AS (
  SELECT kind,count(*) item_count,md5(string_agg(val,E'\n' ORDER BY val)) fingerprint
  FROM structure_items GROUP BY kind
), table_stats AS (
  SELECT r.relname table_name,
    (xpath('/row/c/text()',query_to_xml(format('select count(*) c from public.%I',r.relname),false,true,'')))[1]::text::bigint row_count,
    (xpath('/row/f/text()',query_to_xml(format($q$select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) f from public.%I t$q$,r.relname),false,true,'')))[1]::text row_fingerprint
  FROM relations r WHERE r.relkind IN ('r','p')
), security_targets(name) AS (VALUES
  ('canonical_apply_brand_agency_capability_restriction'),('canonical_assign_agency_owner'),
  ('canonical_revoke_brand_agency_capability_restriction'),('canonical_set_agency_brand_link'),
  ('canonical_set_agency_membership_status'),('canonical_upsert_agency_membership'),
  ('canonical_capability_for_module'),('minerador_discovery_normalize_keyword'),
  ('canonical_validate_single_operational_agency_actor'),('minerador_discovery_candidate_brand_guard'),
  ('minerador_discovery_import_brand_guard'),('minerador_discovery_run_immutable'),
  ('tenant_0005_protect_last_owner'),('tenant_0005_protect_owner_change'),
  ('protect_marca_with_published'),('protect_published_briefing'),
  ('protect_published_keyword'),('protect_published_lista')
), scoped_functions AS (
  SELECT p.oid,p.proname,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
    EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_exec
  FROM pg_proc p JOIN security_targets s ON s.name=p.proname
  WHERE p.pronamespace='public'::regnamespace
), test_agencies(id) AS (VALUES
  ('1febb431-4e44-49e9-b8cd-12115f4ad999'::uuid),('3cc14013-3296-4094-80de-712abc4ceae8'::uuid),
  ('cd84f5ee-b939-4b05-afa4-52aabb8c9aa4'::uuid),('ae851a64-5bff-449b-865c-ec6aa950be38'::uuid)
), test_brands(id) AS (VALUES
  ('f514a553-ce4a-472e-9aec-c3fecff375f1'::uuid),('033b0cde-6e00-472c-b9d6-3c10ad33ae61'::uuid)
), google_caps AS (
  SELECT id FROM public.integration_capabilities WHERE capability_key LIKE 'google_ads_%'
), checks(check_name,pass,observed) AS (
  SELECT 'canonical_public_catalog',count(*)=1368 AND md5(string_agg(kind||':'||val,E'\n' ORDER BY kind,val))='f058b86b56e6d99ab24dac967241c221',format('items=%s fp=%s',count(*),md5(string_agg(kind||':'||val,E'\n' ORDER BY kind,val))) FROM structure_items
  UNION ALL SELECT 'auth_users_preserved',count(*)=4 AND md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))='653fd98baacff90426ecb9eb31e76230',count(*)::text FROM auth.users t
  UNION ALL SELECT 'global_admin_preserved',count(*)=1,count(*)::text FROM public.perfis p JOIN auth.users u ON u.id=p.id WHERE lower(u.email)='adalbapro@gmail.com' AND lower(p.role)='admin'
  UNION ALL SELECT 'test_agencies_zero',count(*)=0,count(*)::text FROM public.agencies WHERE id IN (SELECT id FROM test_agencies)
  UNION ALL SELECT 'test_brands_zero',count(*)=0,count(*)::text FROM public.marcas WHERE id IN (SELECT id FROM test_brands)
  UNION ALL SELECT 'all_agencies_empty',count(*)=0,count(*)::text FROM public.agencies
  UNION ALL SELECT 'all_brands_empty',count(*)=0,count(*)::text FROM public.marcas
  UNION ALL SELECT 'usage_homologation_zero',count(*)=0,count(*)::text FROM public.integration_usage_events
  UNION ALL SELECT 'orphan_agency_owners',count(*)=0,count(*)::text FROM public.agencies a LEFT JOIN auth.users u ON u.id=a.owner_user_id WHERE u.id IS NULL
  UNION ALL SELECT 'orphan_brand_owners',count(*)=0,count(*)::text FROM public.marcas b LEFT JOIN auth.users u ON u.id=b.owner_user_id WHERE b.owner_user_id IS NOT NULL AND u.id IS NULL
  UNION ALL SELECT 'orphan_agency_memberships',count(*)=0,count(*)::text FROM public.agency_memberships m LEFT JOIN public.agencies a ON a.id=m.agency_id LEFT JOIN auth.users u ON u.id=m.user_id WHERE a.id IS NULL OR u.id IS NULL
  UNION ALL SELECT 'orphan_brand_memberships',count(*)=0,count(*)::text FROM public.brand_memberships m LEFT JOIN public.marcas b ON b.id=m.marca_id LEFT JOIN auth.users u ON u.id=m.member_user_id WHERE b.id IS NULL OR u.id IS NULL
  UNION ALL SELECT 'orphan_agency_brand_links',count(*)=0,count(*)::text FROM public.agency_brands ab LEFT JOIN public.agencies a ON a.id=ab.agency_id LEFT JOIN public.marcas b ON b.id=ab.brand_id WHERE a.id IS NULL OR b.id IS NULL
  UNION ALL SELECT 'all_public_tables_rls',count(*)=0,count(*)::text FROM relations WHERE relkind IN ('r','p') AND NOT relrowsecurity
  UNION ALL SELECT 'dangerous_anon_acl',count(*)=0,count(*)::text FROM relations r CROSS JOIN LATERAL aclexplode(coalesce(NULLIF(r.acl,'')::aclitem[],acldefault('r',(SELECT relowner FROM pg_class WHERE oid=r.oid)))) a WHERE r.relkind IN ('r','p') AND a.grantee IN (0,'anon'::regrole)
  UNION ALL SELECT 'unintended_public_function_execute',count(*)=0,count(*)::text FROM scoped_functions WHERE public_exec OR anon_exec
  UNION ALL SELECT 'security_definer_anon_public_exposure',count(*)=0,count(*)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef AND (has_function_privilege('anon',p.oid,'EXECUTE') OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
  UNION ALL SELECT 'search_path_fixes_preserved',count(*)=6,count(*)::text FROM scoped_functions WHERE proname IN ('canonical_capability_for_module','minerador_discovery_normalize_keyword','protect_marca_with_published','protect_published_briefing','protect_published_keyword','protect_published_lista') AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
  UNION ALL SELECT 'briefings_hardening_preserved',
    c.relrowsecurity AND NOT c.relforcerowsecurity AND (SELECT count(*)=0 FROM pg_policies WHERE schemaname='public' AND tablename='briefings_artigos')
      AND NOT has_table_privilege('anon','public.briefings_artigos','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      AND NOT has_table_privilege('authenticated','public.briefings_artigos','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
    format('rls=%s forced=%s policies=%s',c.relrowsecurity,c.relforcerowsecurity,(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='briefings_artigos'))
    FROM pg_class c WHERE c.oid='public.briefings_artigos'::regclass
  UNION ALL SELECT 'google_ads_dynamic_legacy_absent',to_regclass('public.minerador_google_ads_connections') IS NULL AND to_regclass('public.google_ads_binding_targeting') IS NULL AND to_regclass('public.google_ads_binding_account_state') IS NULL AND to_regprocedure('public.google_ads_binding_configuration_validate()') IS NULL,'four objects absent'
  UNION ALL SELECT 'google_ads_commercial_materialization_zero',
    NOT EXISTS(SELECT 1 FROM public.integration_grants WHERE capability_id IN (SELECT id FROM google_caps))
      AND NOT EXISTS(SELECT 1 FROM public.integration_bindings WHERE capability_id IN (SELECT id FROM google_caps))
      AND NOT EXISTS(SELECT 1 FROM public.integration_quota_policies WHERE capability_id IN (SELECT id FROM google_caps)),
    format('grants=%s bindings=%s quotas=%s',(SELECT count(*) FROM public.integration_grants WHERE capability_id IN (SELECT id FROM google_caps)),(SELECT count(*) FROM public.integration_bindings WHERE capability_id IN (SELECT id FROM google_caps)),(SELECT count(*) FROM public.integration_quota_policies WHERE capability_id IN (SELECT id FROM google_caps)))
  UNION ALL SELECT 'google_ads_provider_preserved',(SELECT md5(row_to_json(x)::text) FROM (SELECT p.* FROM public.integration_providers p WHERE p.provider_key='google_ads') x)='4d8f5ff2f83600c9cb6e0c8c26b7de07','provider fingerprint'
  UNION ALL SELECT 'google_ads_capabilities_preserved',(SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT c.* FROM public.integration_capabilities c WHERE c.id IN (SELECT id FROM google_caps)) x)='11e8455d68e5c9eb87a85570b165295d','capability fingerprint'
  UNION ALL SELECT 'dataforseo_connection_preserved',(SELECT md5(row_to_json(x)::text) FROM (SELECT c.* FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id WHERE p.provider_key='dataforseo') x)='5183efa362a9c42bf70fa610790a8ccb','connection fingerprint'
  UNION ALL SELECT 'openrouter_connection_preserved',(SELECT md5(row_to_json(x)::text) FROM (SELECT c.* FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id WHERE p.provider_key='openrouter') x)='f68619ff1d436331127bcbde173cd33b','connection fingerprint'
  UNION ALL SELECT 'vault_preserved',count(*)=4 AND md5(coalesce(string_agg(md5(jsonb_build_object('id',id,'name',name,'description',description)::text),'' ORDER BY id::text),''))='96f757bda7ddb6d1fb84c1f9eb060b9a',count(*)::text FROM vault.secrets
  UNION ALL SELECT 'minerador_relations_preserved',count(*)=10,count(*)::text FROM relations WHERE relkind IN ('r','p') AND relname IN ('minerador_discovery_candidate_current_metrics','minerador_discovery_candidate_metric_history','minerador_discovery_candidates','minerador_discovery_import_batches','minerador_discovery_keyword_origins','minerador_discovery_runs','minerador_keyword_lists','minerador_keyword_metric_measurements','minerador_keywords','briefings_artigos')
  UNION ALL SELECT 'currency_code_contract_preserved',
    EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.minerador_keyword_metric_measurements'::regclass AND attname='currency_code' AND NOT attnotnull AND atttypid='text'::regtype)
      AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.minerador_keyword_metric_measurements'::regclass AND convalidated AND pg_get_constraintdef(oid,true) LIKE '%currency_code ~ ''^[A-Z]{3}$''%'),
    'text nullable; validated ISO-like CHECK'
  UNION ALL SELECT 'editorial_relations_preserved',count(*)=10,count(*)::text FROM relations WHERE relkind IN ('r','p') AND relname IN ('editorial_artifact_versions','editorial_workflow_items','editorial_serp_snapshots','editorial_serp_reviews','editorial_version_status_events','editorial_decision_events','content_documents','content_document_versions','content_document_user_states','publication_records')
  UNION ALL SELECT 'brand_dna_contract_preserved',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.editorial_artifact_versions'::regclass AND conname='editorial_artifact_versions_artifact_type_check' AND convalidated AND pg_get_constraintdef(oid,true)='CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text, ''brand_dna''::text]))'),'five canonical artifact types'
  UNION ALL SELECT 'editorial_event_ledgers_preserved',
    to_regclass('public.editorial_version_status_events') IS NOT NULL AND to_regclass('public.editorial_decision_events') IS NOT NULL
      AND (SELECT count(*)=2 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('editorial_version_status_events_append_only_trg','editorial_decision_events_append_only_trg') AND pg_get_triggerdef(oid,true) LIKE '%pipeline_editorial_protect_append_only%'),
    'two ledgers and two append-only triggers'
  UNION ALL SELECT 'migration_backup_absent',NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='migration_backup'),'schema absent'
), verdict AS (
  SELECT bool_and(pass) all_pass,count(*) FILTER(WHERE NOT pass) failures FROM checks
)
SELECT jsonb_build_object(
  'baseline_date','2026-08-17',
  'project','hjjlntdpdgvpnazdztqw',
  'ledger_in_proof_contract',false,
  'public_structure',jsonb_build_object(
    'item_count',(SELECT count(*) FROM structure_items),
    'fingerprint',(SELECT md5(string_agg(kind||':'||val,E'\n' ORDER BY kind,val)) FROM structure_items),
    'categories',(SELECT jsonb_agg(jsonb_build_object('kind',kind,'count',item_count,'fingerprint',fingerprint) ORDER BY kind) FROM structure_categories)
  ),
  'public_table_data',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'rows',row_count,'fingerprint',row_fingerprint) ORDER BY table_name) FROM table_stats),
  'checks',(SELECT jsonb_agg(jsonb_build_object('check',check_name,'verdict',CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END,'observed',observed) ORDER BY check_name) FROM checks),
  'batch_7_verdict',CASE WHEN all_pass THEN 'PASS' ELSE 'FAIL' END,
  'failed_checks',failures
) AS canonical_baseline
FROM verdict;

ROLLBACK;
