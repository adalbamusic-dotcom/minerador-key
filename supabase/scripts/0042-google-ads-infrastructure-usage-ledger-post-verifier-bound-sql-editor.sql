-- Runner self-contained do post-verifier 0042 para o Supabase SQL Editor.
-- O baseline oficial permanece somente na sessao atual; nao ha DDL, DML, RPC ou provider.
SELECT set_config(
  'minerador.baseline_0042_json',
  $baseline_0042$
{"fingerprints":{"acl":"936acc782c4ac5c6ed19e3ed3770907e","columns":"4e473f705080a4ab561ebbadf816c4e6","indexes":"5f8a9f0788f660560963cbee0faa049a","policies":"2a53c6ce80c3d43ca75d396d9ada02bd","triggers":"3e747af4070adf2e9904512025ff9eea","constraints":"d13568f8e9080c93c4fc04f5ee1e4a34","target_structure":"0058ff421ef1fe91ebfb1288514a33b5","non_target_structure":"52903a6d682fa9fe27890b5fbf91d12f"},"data_snapshot":{"by_provider":[{"events":4,"provider":"dataforseo","succeeded":4,"connection_backed":4,"infrastructure_backed":0},{"events":4,"provider":"google_ads","succeeded":0,"connection_backed":4,"infrastructure_backed":0},{"events":3,"provider":"openrouter","succeeded":3,"connection_backed":3,"infrastructure_backed":0}],"total_events":11,"events_with_null_capability":0,"events_with_null_connection":0,"google_ads_historical_connection_refs":4},"evidence_version":"0042-google-ads-infrastructure-usage-preflight-v1","target_structure":{"connection_id":{"type":"uuid","not_null":true},"infrastructure_partial_index_present":false},"non_target_structure":{"acl":[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"MAINTAIN"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"SELECT"}],"rls":{"forced":false,"enabled":true},"owner":"postgres","columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","ordinal":1,"identity":"","not_null":true,"generated":""},{"name":"actor_user_id","type":"uuid","default":null,"ordinal":2,"identity":"","not_null":true,"generated":""},{"name":"provider_id","type":"uuid","default":null,"ordinal":3,"identity":"","not_null":true,"generated":""},{"name":"capability_id","type":"uuid","default":null,"ordinal":5,"identity":"","not_null":true,"generated":""},{"name":"agency_id","type":"uuid","default":null,"ordinal":6,"identity":"","not_null":false,"generated":""},{"name":"brand_id","type":"uuid","default":null,"ordinal":7,"identity":"","not_null":false,"generated":""},{"name":"operation_kind","type":"text","default":null,"ordinal":8,"identity":"","not_null":true,"generated":""},{"name":"module","type":"text","default":null,"ordinal":9,"identity":"","not_null":false,"generated":""},{"name":"environment","type":"text","default":null,"ordinal":10,"identity":"","not_null":true,"generated":""},{"name":"units","type":"numeric(20,6)","default":"0","ordinal":11,"identity":"","not_null":true,"generated":""},{"name":"unit_name","type":"text","default":null,"ordinal":12,"identity":"","not_null":true,"generated":""},{"name":"cost_amount","type":"numeric(20,8)","default":null,"ordinal":13,"identity":"","not_null":false,"generated":""},{"name":"currency_code","type":"text","default":null,"ordinal":14,"identity":"","not_null":false,"generated":""},{"name":"result_status","type":"text","default":null,"ordinal":15,"identity":"","not_null":true,"generated":""},{"name":"error_code","type":"text","default":null,"ordinal":16,"identity":"","not_null":false,"generated":""},{"name":"provider_request_ref","type":"text","default":null,"ordinal":17,"identity":"","not_null":false,"generated":""},{"name":"idempotency_key","type":"text","default":null,"ordinal":18,"identity":"","not_null":true,"generated":""},{"name":"metadata","type":"jsonb","default":"'{}'::jsonb","ordinal":19,"identity":"","not_null":true,"generated":""},{"name":"occurred_at","type":"timestamp with time zone","default":"now()","ordinal":20,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","ordinal":21,"identity":"","not_null":true,"generated":""}],"indexes":[{"name":"integration_usage_events_pkey","ready":true,"valid":true,"unique":true,"primary":true,"predicate":null,"definition":"CREATE UNIQUE INDEX integration_usage_events_pkey ON public.integration_usage_events USING btree (id)"},{"name":"ix_integration_usage_events_provider_time_0024","ready":true,"valid":true,"unique":false,"primary":false,"predicate":null,"definition":"CREATE INDEX ix_integration_usage_events_provider_time_0024 ON public.integration_usage_events USING btree (provider_id, connection_id, occurred_at DESC)"},{"name":"ix_integration_usage_events_scope_time_0024","ready":true,"valid":true,"unique":false,"primary":false,"predicate":null,"definition":"CREATE INDEX ix_integration_usage_events_scope_time_0024 ON public.integration_usage_events USING btree (agency_id, brand_id, occurred_at DESC)"},{"name":"uq_integration_usage_events_idempotency_0024","ready":true,"valid":true,"unique":true,"primary":false,"predicate":null,"definition":"CREATE UNIQUE INDEX uq_integration_usage_events_idempotency_0024 ON public.integration_usage_events USING btree (connection_id, idempotency_key)"}],"policies":[{"name":"integration_usage_events_select_0024","roles":["authenticated"],"using":"(is_global_admin() OR ((agency_id IS NOT NULL) AND can_access_agency(agency_id)) OR ((brand_id IS NOT NULL) AND can_access_brand(brand_id)))","command":"SELECT","permissive":"PERMISSIVE","with_check":null}],"triggers":[{"name":"trg_integration_usage_events_append_only_0024","enabled":"O","definition":"CREATE TRIGGER trg_integration_usage_events_append_only_0024 BEFORE DELETE OR UPDATE ON integration_usage_events FOR EACH ROW EXECUTE FUNCTION integration_usage_events_prevent_mutation()","function_identity":"","function_definition":"CREATE OR REPLACE FUNCTION public.integration_usage_events_prevent_mutation()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO 'pg_catalog', 'public', 'pg_temp'\nAS $function$\r\nBEGIN\r\n  RAISE EXCEPTION 'INTEGRATION_USAGE_APPEND_ONLY';\r\nEND;\r\n$function$\n"}],"constraints":[{"name":"ck_integration_usage_module_scope_0024","type":"c","columns":[8,7,9],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (operation_kind = 'module_operation'::text AND brand_id IS NOT NULL AND module IS NOT NULL OR operation_kind <> 'module_operation'::text)","match_type":" ","referenced_columns":null},{"name":"fk_integration_usage_connection_provider_0024","type":"f","columns":[4,3],"deferred":false,"on_delete":"r","on_update":"a","validated":true,"deferrable":false,"definition":"FOREIGN KEY (connection_id, provider_id) REFERENCES integration_connections(id, provider_id) ON DELETE RESTRICT","match_type":"s","referenced_columns":[1,2]},{"name":"integration_usage_events_actor_user_id_fkey","type":"f","columns":[2],"deferred":false,"on_delete":"r","on_update":"a","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT","match_type":"s","referenced_columns":[2]},{"name":"integration_usage_events_agency_id_fkey","type":"f","columns":[6],"deferred":false,"on_delete":"r","on_update":"a","validated":true,"deferrable":false,"definition":"FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT","match_type":"s","referenced_columns":[1]},{"name":"integration_usage_events_brand_id_fkey","type":"f","columns":[7],"deferred":false,"on_delete":"r","on_update":"a","validated":true,"deferrable":false,"definition":"FOREIGN KEY (brand_id) REFERENCES marcas(id) ON DELETE RESTRICT","match_type":"s","referenced_columns":[1]},{"name":"integration_usage_events_capability_id_fkey","type":"f","columns":[5],"deferred":false,"on_delete":"r","on_update":"a","validated":true,"deferrable":false,"definition":"FOREIGN KEY (capability_id) REFERENCES integration_capabilities(id) ON DELETE RESTRICT","match_type":"s","referenced_columns":[1]},{"name":"integration_usage_events_connection_id_fkey","type":"f","columns":[4],"deferred":false,"on_delete":"r","on_update":"a","validated":true,"deferrable":false,"definition":"FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE RESTRICT","match_type":"s","referenced_columns":[1]},{"name":"integration_usage_events_cost_amount_check","type":"c","columns":[13],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (cost_amount IS NULL OR cost_amount >= 0::numeric)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_currency_code_check","type":"c","columns":[14],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'::text)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_environment_check","type":"c","columns":[10],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (environment = ANY (ARRAY['development'::text, 'test'::text, 'staging'::text, 'production'::text]))","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_error_code_check","type":"c","columns":[16],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (error_code IS NULL OR char_length(btrim(error_code)) >= 1 AND char_length(btrim(error_code)) <= 160)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_idempotency_key_check","type":"c","columns":[18],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (char_length(btrim(idempotency_key)) >= 1 AND char_length(btrim(idempotency_key)) <= 256)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_metadata_check","type":"c","columns":[19],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (jsonb_typeof(metadata) = 'object'::text)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_module_check","type":"c","columns":[9],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (module IS NULL OR char_length(btrim(module)) >= 1 AND char_length(btrim(module)) <= 80)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_operation_kind_check","type":"c","columns":[8],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (operation_kind = ANY (ARRAY['connection_test'::text, 'health_check'::text, 'administrative_validation'::text, 'module_operation'::text]))","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_pkey","type":"p","columns":[1],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_provider_id_fkey","type":"f","columns":[3],"deferred":false,"on_delete":"r","on_update":"a","validated":true,"deferrable":false,"definition":"FOREIGN KEY (provider_id) REFERENCES integration_providers(id) ON DELETE RESTRICT","match_type":"s","referenced_columns":[1]},{"name":"integration_usage_events_provider_request_ref_check","type":"c","columns":[17],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (provider_request_ref IS NULL OR char_length(btrim(provider_request_ref)) >= 1 AND char_length(btrim(provider_request_ref)) <= 256)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_result_status_check","type":"c","columns":[15],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (result_status = ANY (ARRAY['started'::text, 'succeeded'::text, 'failed'::text, 'blocked'::text]))","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_unit_name_check","type":"c","columns":[12],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (char_length(btrim(unit_name)) >= 1 AND char_length(btrim(unit_name)) <= 80)","match_type":" ","referenced_columns":null},{"name":"integration_usage_events_units_check","type":"c","columns":[11],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"CHECK (units >= 0::numeric)","match_type":" ","referenced_columns":null},{"name":"uq_integration_usage_events_idempotency_0024","type":"u","columns":[4,18],"deferred":false,"on_delete":" ","on_update":" ","validated":true,"deferrable":false,"definition":"UNIQUE (connection_id, idempotency_key)","match_type":" ","referenced_columns":null}]}}
  $baseline_0042$,
  false
);

-- Post-verifier read-only da 0042.
-- Exige o evidence_json integral do preflight na mesma sessao:
--   SELECT set_config('minerador.baseline_0042_json', <evidence_json>, false);
-- Nao persiste o baseline e nao executa DDL, DML, RPC ou provider.

WITH
baseline_source AS (
  SELECT NULLIF(current_setting('minerador.baseline_0042_json', true), '') AS raw
),
baseline AS (
  SELECT CASE WHEN raw IS NULL THEN '{}'::jsonb ELSE raw::jsonb END AS value, raw IS NOT NULL AS bound
  FROM baseline_source
),
usage_relation AS (
  SELECT c.oid, c.relowner, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'integration_usage_events' AND c.relkind = 'r'
),
columns_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ordinal', a.attnum, 'name', a.attname,
    'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull,
    'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
    'identity', a.attidentity, 'generated', a.attgenerated
  ) ORDER BY a.attnum), '[]'::jsonb) AS value
  FROM usage_relation r
  JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
constraints_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', c.conname, 'type', c.contype,
    'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
    'validated', c.convalidated, 'deferrable', c.condeferrable,
    'deferred', c.condeferred, 'match_type', c.confmatchtype,
    'columns', to_jsonb(c.conkey), 'referenced_columns', to_jsonb(c.confkey),
    'on_delete', c.confdeltype, 'on_update', c.confupdtype
  ) ORDER BY c.conname), '[]'::jsonb) AS value
  FROM usage_relation r
  JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid
),
indexes_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', ic.relname, 'definition', pg_catalog.pg_get_indexdef(i.indexrelid),
    'unique', i.indisunique, 'primary', i.indisprimary,
    'valid', i.indisvalid, 'ready', i.indisready,
    'predicate', pg_catalog.pg_get_expr(i.indpred, i.indrelid)
  ) ORDER BY ic.relname), '[]'::jsonb) AS value
  FROM usage_relation r
  JOIN pg_catalog.pg_index i ON i.indrelid = r.oid
  JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
),
triggers_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', t.tgname, 'enabled', t.tgenabled,
    'definition', pg_catalog.pg_get_triggerdef(t.oid, true),
    'function_identity', pg_catalog.pg_get_function_identity_arguments(t.tgfoid),
    'function_definition', pg_catalog.pg_get_functiondef(t.tgfoid)
  ) ORDER BY t.tgname), '[]'::jsonb) AS value
  FROM usage_relation r
  JOIN pg_catalog.pg_trigger t ON t.tgrelid = r.oid
  WHERE NOT t.tgisinternal
),
policies_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', p.policyname, 'permissive', p.permissive,
    'roles', to_jsonb(p.roles), 'command', p.cmd,
    'using', p.qual, 'with_check', p.with_check
  ) ORDER BY p.policyname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = 'integration_usage_events'
),
acl_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'grantor', pg_catalog.pg_get_userbyid(x.grantor),
    'grantee', CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
    'privilege', x.privilege_type, 'grantable', x.is_grantable
  ) ORDER BY x.grantee, x.privilege_type, x.is_grantable, x.grantor), '[]'::jsonb) AS value
  FROM usage_relation r
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE((SELECT c.relacl FROM pg_catalog.pg_class c WHERE c.oid = r.oid), pg_catalog.acldefault('r', r.relowner))) x
),
current_target AS (
  SELECT jsonb_build_object(
    'connection_id', (SELECT jsonb_build_object('type', pg_catalog.format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull)
      FROM usage_relation r JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
      WHERE a.attname = 'connection_id' AND a.attnum > 0 AND NOT a.attisdropped),
    'infrastructure_partial_index_present', EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'uq_integration_usage_events_infrastructure_idempotency_0042'
    )
  ) AS value
),
current_non_target AS (
  SELECT jsonb_build_object(
    'columns', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'ordinal')::int)
      FROM jsonb_array_elements((SELECT value FROM columns_snapshot)) item
      WHERE item->>'name' <> 'connection_id'), '[]'::jsonb),
    'constraints', (SELECT value FROM constraints_snapshot),
    'indexes', COALESCE((SELECT jsonb_agg(item ORDER BY item->>'name')
      FROM jsonb_array_elements((SELECT value FROM indexes_snapshot)) item
      WHERE item->>'name' <> 'uq_integration_usage_events_infrastructure_idempotency_0042'), '[]'::jsonb),
    'triggers', (SELECT value FROM triggers_snapshot),
    'rls', (SELECT jsonb_build_object('enabled', relrowsecurity, 'forced', relforcerowsecurity) FROM usage_relation),
    'policies', (SELECT value FROM policies_snapshot),
    'owner', (SELECT pg_catalog.pg_get_userbyid(relowner) FROM usage_relation),
    'acl', (SELECT value FROM acl_snapshot)
  ) AS value
),
current_usage_by_provider_rows AS (
  SELECT
    p.provider_key AS provider,
    count(*)::bigint AS events,
    count(*) FILTER (WHERE u.connection_id IS NOT NULL)::bigint AS connection_backed,
    count(*) FILTER (WHERE u.connection_id IS NULL)::bigint AS infrastructure_backed,
    count(*) FILTER (WHERE u.result_status = 'succeeded')::bigint AS succeeded
  FROM public.integration_usage_events u
  JOIN public.integration_providers p ON p.id = u.provider_id
  GROUP BY p.provider_key
),
current_usage_by_provider AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'provider', provider,
    'events', events,
    'connection_backed', connection_backed,
    'infrastructure_backed', infrastructure_backed,
    'succeeded', succeeded
  ) ORDER BY provider), '[]'::jsonb) AS value
  FROM current_usage_by_provider_rows
),
current_data AS (
  SELECT jsonb_build_object(
    'total_events', (SELECT count(*)::bigint FROM public.integration_usage_events),
    'events_with_null_connection', (SELECT count(*)::bigint FROM public.integration_usage_events WHERE connection_id IS NULL),
    'events_with_null_capability', (SELECT count(*)::bigint FROM public.integration_usage_events WHERE capability_id IS NULL),
    'by_provider', (SELECT value FROM current_usage_by_provider),
    'google_ads_historical_connection_refs', (SELECT count(*)::bigint
      FROM public.integration_usage_events u JOIN public.integration_providers p ON p.id = u.provider_id
      WHERE p.provider_key = 'google_ads' AND u.connection_id IS NOT NULL)
  ) AS value
),
target_index AS (
  SELECT
    i.indisunique,
    i.indisvalid,
    i.indisready,
    pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS predicate,
    ARRAY(SELECT a.attname::text
      FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      WHERE k.attnum > 0 ORDER BY k.ord) AS columns
  FROM usage_relation r
  JOIN pg_catalog.pg_index i ON i.indrelid = r.oid
  JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'uq_integration_usage_events_infrastructure_idempotency_0042'
),
composite_fk_match AS (
  SELECT c.confmatchtype AS code,
    CASE c.confmatchtype
      WHEN 's' THEN 'SIMPLE'
      WHEN 'f' THEN 'FULL'
      WHEN 'p' THEN 'PARTIAL'
      ELSE 'UNKNOWN'
    END AS label
  FROM usage_relation r
  JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid
  WHERE c.conname = 'fk_integration_usage_connection_provider_0024' AND c.contype = 'f'
),
checks AS (
  SELECT
    b.bound,
    b.value->>'evidence_version' = '0042-google-ads-infrastructure-usage-preflight-v1' AS baseline_version_ok,
    b.value->'target_structure'->'connection_id'->>'not_null' = 'true' AS baseline_connection_was_not_null,
    b.value->'target_structure'->>'infrastructure_partial_index_present' = 'false' AS baseline_index_was_absent,
    (SELECT value->'connection_id'->>'not_null' = 'false' FROM current_target) AS connection_now_nullable,
    COALESCE((SELECT indisunique AND indisvalid AND indisready
      AND columns = ARRAY['provider_id', 'environment', 'idempotency_key']::text[]
      AND predicate = '(connection_id IS NULL)' FROM target_index), false) AS infrastructure_partial_unique_ok,
    md5((SELECT value::text FROM current_non_target)) = COALESCE(b.value->'fingerprints'->>'non_target_structure', '') AS non_target_unchanged,
    (SELECT value FROM current_data) = COALESCE(b.value->'data_snapshot', '{}'::jsonb) AS data_delta_zero,
    COALESCE((SELECT a.attnotnull FROM usage_relation r JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid WHERE a.attname = 'capability_id' AND a.attnum > 0), false) AS capability_still_required,
    EXISTS (SELECT 1 FROM usage_relation r JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid WHERE c.conname = 'uq_integration_usage_events_idempotency_0024' AND c.contype = 'u') AS connection_unique_preserved,
    COALESCE((SELECT code = 's' FROM composite_fk_match), false) AS composite_fk_preserved,
    EXISTS (SELECT 1 FROM usage_relation r JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid WHERE c.contype = 'f' AND c.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = r.oid AND attname = 'provider_id')]) AS provider_fk_preserved,
    EXISTS (SELECT 1 FROM usage_relation r JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid WHERE c.contype = 'f' AND c.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = r.oid AND attname = 'capability_id')]) AS capability_fk_preserved,
    (SELECT value->'google_ads_historical_connection_refs' FROM current_data)
      = COALESCE(b.value->'data_snapshot'->'google_ads_historical_connection_refs', 'null'::jsonb)
      AS historical_google_ads_refs_preserved
  FROM baseline b
)
SELECT
  CASE WHEN bound AND baseline_version_ok AND baseline_connection_was_not_null AND baseline_index_was_absent
    AND connection_now_nullable AND infrastructure_partial_unique_ok AND non_target_unchanged AND data_delta_zero
    AND capability_still_required AND connection_unique_preserved AND composite_fk_preserved
    AND provider_fk_preserved AND capability_fk_preserved AND historical_google_ads_refs_preserved
    THEN 'PASS' ELSE 'FAIL' END AS post_verifier_status,
  '0042-google-ads-infrastructure-usage-post-v1'::text AS verifier_version,
  bound AS baseline_bound,
  connection_now_nullable,
  infrastructure_partial_unique_ok,
  connection_unique_preserved,
  composite_fk_preserved,
  COALESCE((SELECT code FROM composite_fk_match), 'MISSING') AS composite_fk_match_type_code,
  COALESCE((SELECT label FROM composite_fk_match), 'MISSING') AS composite_fk_match_type,
  provider_fk_preserved,
  capability_fk_preserved,
  capability_still_required,
  non_target_unchanged,
  data_delta_zero,
  historical_google_ads_refs_preserved,
  jsonb_build_object(
    'baseline_version_ok', baseline_version_ok,
    'baseline_connection_was_not_null', baseline_connection_was_not_null,
    'baseline_index_was_absent', baseline_index_was_absent,
    'composite_fk_match_type_code', COALESCE((SELECT code FROM composite_fk_match), 'MISSING'),
    'composite_fk_match_type', COALESCE((SELECT label FROM composite_fk_match), 'MISSING'),
    'current_target', (SELECT value FROM current_target),
    'current_data', (SELECT value FROM current_data),
    'non_target_fingerprint', md5((SELECT value::text FROM current_non_target))
  ) AS evidence_json
FROM checks;

