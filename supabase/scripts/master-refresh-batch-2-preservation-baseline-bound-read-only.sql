-- Shared PRE/POST preservation proof for Master Refresh Batch 2 (read-only).
-- The migration intentionally changes only target ACL/proconfig and three policies.

WITH target_names(name) AS (VALUES
  ('canonical_apply_brand_agency_capability_restriction'),('canonical_assign_agency_owner'),
  ('canonical_revoke_brand_agency_capability_restriction'),('canonical_set_agency_brand_link'),
  ('canonical_set_agency_membership_status'),('canonical_upsert_agency_membership'),
  ('canonical_validate_single_operational_agency_actor'),('minerador_discovery_candidate_brand_guard'),
  ('minerador_discovery_import_brand_guard'),('minerador_discovery_run_immutable'),
  ('tenant_0005_protect_last_owner'),('tenant_0005_protect_owner_change'),
  ('canonical_capability_for_module'),('minerador_discovery_normalize_keyword'),
  ('protect_marca_with_published'),('protect_published_briefing'),
  ('protect_published_keyword'),('protect_published_lista')
), rels AS (
  SELECT c.oid,c.relname,pg_get_userbyid(c.relowner) owner_name,c.relrowsecurity,c.relforcerowsecurity,coalesce(array_to_string(c.relacl,','),'') acl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
), coldefs AS (
  SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) typ,a.attnotnull,a.attidentity,a.attgenerated,coalesce(pg_get_expr(d.adbin,d.adrelid),'') def
  FROM rels c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
), cons AS (
  SELECT conrelid::regclass::text rel,conname,contype,convalidated,pg_get_constraintdef(oid,true) def FROM pg_constraint WHERE connamespace='public'::regnamespace
), idx AS (
  SELECT indrelid::regclass::text rel,indexrelid::regclass::text name,pg_get_indexdef(indexrelid) def FROM pg_index WHERE indrelid IN (SELECT oid FROM rels)
), trg AS (
  SELECT tgrelid::regclass::text rel,tgname,tgenabled,pg_get_triggerdef(oid,true) def FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM rels) AND NOT tgisinternal
), pol AS (
  SELECT tablename,policyname,permissive,roles,cmd,coalesce(qual,'') qual,coalesce(with_check,'') with_check FROM pg_policies WHERE schemaname='public'
), funcs AS (
  SELECT p.proname,format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) signature,pg_get_userbyid(p.proowner) owner_name,p.prosecdef,p.provolatile,p.proconfig,coalesce(array_to_string(p.proacl,','),'') acl,p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
), checks AS (
  SELECT 'COLUMNS' check_name,(SELECT md5(string_agg(concat_ws(':',relname,attnum::text,attname,typ,attnotnull::text,attidentity::text,attgenerated::text,def),E'\n' ORDER BY relname,attnum)) FROM coldefs) observed,'693ddcde71879427efcbe27a6835c341' expected
  UNION ALL SELECT 'CONSTRAINTS',(SELECT md5(string_agg(concat_ws(':',rel,conname,contype::text,convalidated::text,def),E'\n' ORDER BY rel,conname)) FROM cons),'05d48280c73cd8581c5cfa4051c07a33'
  UNION ALL SELECT 'INDEXES',(SELECT md5(string_agg(concat_ws(':',rel,name,def),E'\n' ORDER BY rel,name)) FROM idx),'8d5d0d60ec7c67fce70fb1e8b214c76c'
  UNION ALL SELECT 'TRIGGERS',(SELECT md5(string_agg(concat_ws(':',rel,tgname,tgenabled::text,def),E'\n' ORDER BY rel,tgname)) FROM trg),'67954a22dc98d7221365bc0158b54965'
  UNION ALL SELECT 'NON_TARGET_RELATION_SECURITY',(SELECT md5(string_agg(concat_ws(':',relname,owner_name,relrowsecurity::text,relforcerowsecurity::text,acl),E'\n' ORDER BY relname)) FROM rels WHERE relname<>'briefings_artigos'),'0b4426de8faed58fe000ec43025099c2'
  UNION ALL SELECT 'NON_TARGET_POLICIES',(SELECT md5(string_agg(concat_ws(':',tablename,policyname,permissive,roles::text,cmd,qual,with_check),E'\n' ORDER BY tablename,policyname)) FROM pol WHERE NOT (tablename='brand_memberships' AND policyname='tenant_0005_memberships_select') AND NOT (tablename='marcas' AND policyname='tenant_0005_marcas_insert') AND NOT (tablename='minerador_discovery_runs' AND policyname='minerador_discovery_runs_insert')),'c47bbb05a0fc5ac19c52a83b246b30f8'
  UNION ALL SELECT 'NON_TARGET_FUNCTIONS',(SELECT md5(string_agg(concat_ws(':',signature,owner_name,prosecdef::text,provolatile::text,coalesce(array_to_string(proconfig,','),''),acl,prosrc),E'\n' ORDER BY signature)) FROM funcs WHERE proname NOT IN (SELECT name FROM target_names)),'2a75678236dd6bc65a9ba6be855a83d4'
)
SELECT check_name,CASE WHEN observed=expected THEN 'PASS' ELSE 'FAIL' END verdict,observed,expected FROM checks ORDER BY check_name;

WITH data AS (
  SELECT 'agencies' n,count(*) c,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) h FROM public.agencies t UNION ALL
  SELECT 'agency_access_periods',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.agency_access_periods t UNION ALL
  SELECT 'agency_applications',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.agency_applications t UNION ALL
  SELECT 'agency_brands',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.agency_brands t UNION ALL
  SELECT 'agency_invitation_token_generations',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.agency_invitation_token_generations t UNION ALL
  SELECT 'agency_invitations',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.agency_invitations t UNION ALL
  SELECT 'agency_membership_capabilities',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.agency_membership_capabilities t UNION ALL
  SELECT 'agency_memberships',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.agency_memberships t UNION ALL
  SELECT 'agency_onboardings',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.agency_onboardings t UNION ALL
  SELECT 'brand_agency_capability_restrictions',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.brand_agency_capability_restrictions t UNION ALL
  SELECT 'brand_member_permissions',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.brand_member_permissions t UNION ALL
  SELECT 'brand_memberships',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.brand_memberships t UNION ALL
  SELECT 'brand_roles',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.brand_roles t UNION ALL
  SELECT 'briefings_artigos',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.briefings_artigos t UNION ALL
  SELECT 'canonical_capabilities',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.canonical_capabilities t UNION ALL
  SELECT 'communication_delivery_events',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.communication_delivery_events t UNION ALL
  SELECT 'communication_messages',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.communication_messages t UNION ALL
  SELECT 'communication_templates',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.communication_templates t UNION ALL
  SELECT 'content_document_user_states',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.content_document_user_states t UNION ALL
  SELECT 'content_document_versions',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.content_document_versions t UNION ALL
  SELECT 'content_documents',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.content_documents t UNION ALL
  SELECT 'editorial_artifact_versions',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.editorial_artifact_versions t UNION ALL
  SELECT 'editorial_saved_views',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.editorial_saved_views t UNION ALL
  SELECT 'editorial_serp_reviews',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.editorial_serp_reviews t UNION ALL
  SELECT 'editorial_serp_snapshots',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.editorial_serp_snapshots t UNION ALL
  SELECT 'editorial_workflow_items',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.editorial_workflow_items t UNION ALL
  SELECT 'google_ads_binding_account_state',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.google_ads_binding_account_state t UNION ALL
  SELECT 'google_ads_binding_targeting',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.google_ads_binding_targeting t UNION ALL
  SELECT 'integration_bindings',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.integration_bindings t UNION ALL
  SELECT 'integration_capabilities',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.integration_capabilities t UNION ALL
  SELECT 'integration_connections',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.integration_connections t UNION ALL
  SELECT 'integration_grants',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.integration_grants t UNION ALL
  SELECT 'integration_providers',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.integration_providers t UNION ALL
  SELECT 'integration_quota_policies',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.integration_quota_policies t UNION ALL
  SELECT 'integration_usage_events',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.integration_usage_events t UNION ALL
  SELECT 'marcas',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.marcas t UNION ALL
  SELECT 'minerador_discovery_candidate_current_metrics',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_discovery_candidate_current_metrics t UNION ALL
  SELECT 'minerador_discovery_candidate_metric_history',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_discovery_candidate_metric_history t UNION ALL
  SELECT 'minerador_discovery_candidates',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_discovery_candidates t UNION ALL
  SELECT 'minerador_discovery_import_batches',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_discovery_import_batches t UNION ALL
  SELECT 'minerador_discovery_keyword_origins',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_discovery_keyword_origins t UNION ALL
  SELECT 'minerador_discovery_runs',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_discovery_runs t UNION ALL
  SELECT 'minerador_google_ads_connections',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_google_ads_connections t UNION ALL
  SELECT 'minerador_keyword_lists',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_keyword_lists t UNION ALL
  SELECT 'minerador_keyword_metric_measurements',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_keyword_metric_measurements t UNION ALL
  SELECT 'minerador_keywords',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.minerador_keywords t UNION ALL
  SELECT 'perfis',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.perfis t UNION ALL
  SELECT 'platform_communication_config',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.platform_communication_config t UNION ALL
  SELECT 'publication_records',count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public.publication_records t
), result AS (
  SELECT count(*) table_count,sum(c) total_rows,md5(string_agg(n||':'||c||':'||h,E'\n' ORDER BY n)) master_hash FROM data
)
SELECT 'PUBLIC_DATA_BASELINE' check_name,CASE WHEN table_count=49 AND total_rows=1095 AND master_hash='a544a58d954b7ba10bde6d5f4db3492b' THEN 'PASS' ELSE 'FAIL' END verdict,
  concat_ws(':',table_count,total_rows,master_hash) observed,'49:1095:a544a58d954b7ba10bde6d5f4db3492b' expected FROM result;
