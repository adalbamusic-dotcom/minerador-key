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
