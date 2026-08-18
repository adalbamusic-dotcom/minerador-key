-- Bound post-verifier for Master Refresh Batch 4.
BEGIN TRANSACTION READ ONLY;

DO $$
BEGIN
  IF to_regclass('public.minerador_google_ads_connections') IS NOT NULL
    OR to_regclass('public.google_ads_binding_targeting') IS NOT NULL
    OR to_regclass('public.google_ads_binding_account_state') IS NOT NULL
    OR to_regprocedure('public.google_ads_binding_configuration_validate()') IS NOT NULL THEN
    RAISE EXCEPTION 'GOOGLE_ADS_DYNAMIC_CONNECTION_LEGACY_NOT_ZERO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.integration_grants g JOIN public.integration_capabilities c ON c.id=g.capability_id WHERE c.capability_key LIKE 'google_ads_%')
    OR EXISTS (SELECT 1 FROM public.integration_bindings b JOIN public.integration_capabilities c ON c.id=b.capability_id WHERE c.capability_key LIKE 'google_ads_%')
    OR EXISTS (SELECT 1 FROM public.integration_quota_policies q JOIN public.integration_capabilities c ON c.id=q.capability_id WHERE c.capability_key LIKE 'google_ads_%') THEN
    RAISE EXCEPTION 'GOOGLE_ADS_SHARED_DYNAMIC_LEGACY_NOT_ZERO';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id
    WHERE c.id='9360a075-cb90-4771-8dfd-56729263fe3a'::uuid AND p.provider_key='google_ads' AND c.lifecycle_status='revoked'
  ) THEN RAISE EXCEPTION 'GOOGLE_ADS_HISTORICAL_CONNECTION_NOT_PRESERVED_REVOKED'; END IF;
END;
$$;

WITH defs AS (
 SELECT 'column' kind, c.table_name||'.'||c.column_name||':'||c.ordinal_position||':'||c.data_type||':'||c.is_nullable||':'||coalesce(c.column_default,'') val
 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name LIKE 'integration_%'
 UNION ALL SELECT 'constraint', con.conrelid::regclass::text||'.'||con.conname||':'||pg_get_constraintdef(con.oid,true) FROM pg_constraint con WHERE con.connamespace='public'::regnamespace AND con.conrelid::regclass::text LIKE 'integration_%'
 UNION ALL SELECT 'index', schemaname||'.'||tablename||'.'||indexname||':'||indexdef FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'integration_%'
 UNION ALL SELECT 'trigger', event_object_table||'.'||trigger_name||':'||action_timing||':'||event_manipulation||':'||action_statement FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table LIKE 'integration_%'
 UNION ALL SELECT 'policy', schemaname||'.'||tablename||'.'||policyname||':'||coalesce(cmd,'')||':'||coalesce(qual,'')||':'||coalesce(with_check,'') FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'integration_%'
 UNION ALL SELECT 'owner_acl', c.relname||':'||pg_get_userbyid(c.relowner)||':'||coalesce(c.relacl::text,'') FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname LIKE 'integration_%'
), ga_caps AS (SELECT id FROM public.integration_capabilities WHERE capability_key LIKE 'google_ads_%'), checks AS (
 SELECT
  (SELECT md5(row_to_json(x)::text) FROM (SELECT p.* FROM public.integration_providers p WHERE p.provider_key='google_ads') x)='4d8f5ff2f83600c9cb6e0c8c26b7de07' AS provider_preserved,
  (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT c.* FROM public.integration_capabilities c WHERE c.id IN (SELECT id FROM ga_caps)) x)='11e8455d68e5c9eb87a85570b165295d' AS capabilities_preserved,
  (SELECT count(*) FROM public.integration_usage_events WHERE capability_id IN (SELECT id FROM ga_caps))=11 AS usage_count_preserved,
  (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT u.* FROM public.integration_usage_events u WHERE u.capability_id IN (SELECT id FROM ga_caps)) x)='b5a6391e881c7e3f8e4cd645112b3707' AS usage_fp_preserved,
  (SELECT md5(row_to_json(x)::text) FROM (SELECT c.id,c.provider_id,c.owner_scope_type,c.owner_agency_id,c.owner_brand_id,c.environment,c.secret_ref,c.metadata,c.created_by_user_id,c.created_at FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id WHERE p.provider_key='google_ads') x)='dc61b9e948a9bf29d8aa43c034aaf87a' AS historical_connection_payload_preserved,
  (SELECT md5(row_to_json(x)::text) FROM (SELECT c.* FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id WHERE p.provider_key='dataforseo') x)='5183efa362a9c42bf70fa610790a8ccb' AS dataforseo_connection_preserved,
  (SELECT md5(row_to_json(x)::text) FROM (SELECT c.* FROM public.integration_connections c JOIN public.integration_providers p ON p.id=c.provider_id WHERE p.provider_key='openrouter') x)='f68619ff1d436331127bcbde173cd33b' AS openrouter_connection_preserved,
  (SELECT count(*)=220 AND md5(string_agg(kind||':'||val,E'\n' ORDER BY kind,val))='b50e60b6cc64aa2d7636f676069d0a19' FROM defs) AS integration_shared_schema_preserved
)
SELECT *, provider_preserved AND capabilities_preserved AND usage_count_preserved AND usage_fp_preserved
  AND historical_connection_payload_preserved AND dataforseo_connection_preserved AND openrouter_connection_preserved
  AND integration_shared_schema_preserved AS batch_4_post_verifier_pass
FROM checks;

ROLLBACK;
