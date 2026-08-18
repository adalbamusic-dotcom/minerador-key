-- Post-verifier read-only da 0043, vinculado à baseline remota capturada em
-- 2026-08-17 pelo preflight-v1. Não persiste baseline nem modifica dados.

WITH
baseline AS (
  SELECT '{
    "evidence_version":"0043-google-ads-metrics-currency-compatibility-preflight-v1",
    "target_column_current_contract":{"name":"currency_code","type":"text","default":null,"identity":"","not_null":true,"generated":""},
    "data_snapshot":{"total_rows":0,"currency_codes":[],"currency_code_null_rows":0},
    "fingerprints":{
      "acl":"c943c5902e447a62196ed9edd3150836",
      "rls":"3154478ac268b0294052b64fe69e6b89",
      "owner":"b0d871bc119fd9f817d8ce97fae336eb",
      "indexes":"11b9e72ac93c3aeffd073b8b43c6d948",
      "policies":"d855e217aee4e7b7bd8f97dd386fdcfe",
      "triggers":"d751713988987e9331980363e24189ce",
      "constraints":"98b3f20f5a25101a47e7572d2c095919",
      "foreign_keys":"7d6f6ac525ddeb246f8a84a4f7ce6021",
      "non_target_structure":"37c11bb2a89996154f51dfeedc8f341c"
    }
  }'::jsonb AS value
),
target_relation AS (
  SELECT c.oid, c.relowner, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'minerador_keyword_metric_measurements'
    AND c.relkind = 'r'
),
columns_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ordinal', a.attnum,
    'name', a.attname,
    'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull,
    'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
    'identity', a.attidentity,
    'generated', a.attgenerated
  ) ORDER BY a.attnum), '[]'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
target_column_snapshot AS (
  SELECT COALESCE(jsonb_build_object(
    'name', a.attname,
    'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull,
    'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
    'identity', a.attidentity,
    'generated', a.attgenerated
  ), '{}'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attname = 'currency_code' AND a.attnum > 0 AND NOT a.attisdropped
),
constraints_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', c.conname,
    'type', c.contype,
    'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
    'validated', c.convalidated,
    'deferrable', c.condeferrable,
    'deferred', c.condeferred,
    'match_type', c.confmatchtype,
    'columns', to_jsonb(c.conkey),
    'referenced_columns', to_jsonb(c.confkey),
    'on_delete', c.confdeltype,
    'on_update', c.confupdtype
  ) ORDER BY c.conname), '[]'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid
),
foreign_keys_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', c.conname,
    'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
    'validated', c.convalidated,
    'deferrable', c.condeferrable,
    'deferred', c.condeferred,
    'match_type', c.confmatchtype,
    'on_delete', c.confdeltype,
    'on_update', c.confupdtype
  ) ORDER BY c.conname), '[]'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid
  WHERE c.contype = 'f'
),
indexes_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', ic.relname,
    'definition', pg_catalog.pg_get_indexdef(i.indexrelid),
    'unique', i.indisunique,
    'primary', i.indisprimary,
    'valid', i.indisvalid,
    'ready', i.indisready,
    'predicate', pg_catalog.pg_get_expr(i.indpred, i.indrelid)
  ) ORDER BY ic.relname), '[]'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_index i ON i.indrelid = r.oid
  JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
),
trigger_rows AS (
  SELECT t.tgname AS name,
    t.tgenabled AS enabled,
    pg_catalog.pg_get_triggerdef(t.oid, true) AS definition,
    pg_catalog.pg_get_function_identity_arguments(t.tgfoid) AS function_identity,
    pg_catalog.pg_get_functiondef(t.tgfoid) AS function_definition
  FROM target_relation r
  JOIN pg_catalog.pg_trigger t ON t.tgrelid = r.oid
  WHERE NOT t.tgisinternal
),
triggers_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', name,
    'enabled', enabled,
    'definition', definition,
    'function_identity', function_identity,
    'function_definition', function_definition
  ) ORDER BY name), '[]'::jsonb) AS value
  FROM trigger_rows
),
policies_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', p.policyname,
    'permissive', p.permissive,
    'roles', to_jsonb(p.roles),
    'command', p.cmd,
    'using', p.qual,
    'with_check', p.with_check
  ) ORDER BY p.policyname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'minerador_keyword_metric_measurements'
),
acl_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'grantor', pg_catalog.pg_get_userbyid(x.grantor),
    'grantee', CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
    'privilege', x.privilege_type,
    'grantable', x.is_grantable
  ) ORDER BY x.grantee, x.privilege_type, x.is_grantable, x.grantor), '[]'::jsonb) AS value
  FROM target_relation r
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      (SELECT c.relacl FROM pg_catalog.pg_class c WHERE c.oid = r.oid),
      pg_catalog.acldefault('r', r.relowner)
    )
  ) x
),
rls_snapshot AS (
  SELECT COALESCE(jsonb_build_object(
    'enabled', relrowsecurity,
    'forced', relforcerowsecurity
  ), '{}'::jsonb) AS value
  FROM target_relation
),
owner_snapshot AS (
  SELECT COALESCE(to_jsonb(pg_catalog.pg_get_userbyid(relowner)), 'null'::jsonb) AS value
  FROM target_relation
),
non_target_columns_snapshot AS (
  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'ordinal')::int), '[]'::jsonb) AS value
  FROM jsonb_array_elements((SELECT value FROM columns_snapshot)) item
  WHERE item->>'name' <> 'currency_code'
),
non_target_structure_snapshot AS (
  SELECT jsonb_build_object(
    'columns_excluding_target', (SELECT value FROM non_target_columns_snapshot),
    'constraints', (SELECT value FROM constraints_snapshot),
    'foreign_keys', (SELECT value FROM foreign_keys_snapshot),
    'indexes', (SELECT value FROM indexes_snapshot),
    'triggers', (SELECT value FROM triggers_snapshot),
    'rls', (SELECT value FROM rls_snapshot),
    'policies', (SELECT value FROM policies_snapshot),
    'owner', (SELECT value FROM owner_snapshot),
    'acl', (SELECT value FROM acl_snapshot)
  ) AS value
),
currency_code_rows AS (
  SELECT currency_code, count(*)::bigint AS rows
  FROM public.minerador_keyword_metric_measurements
  WHERE currency_code IS NOT NULL
  GROUP BY currency_code
),
currency_code_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'currency_code', currency_code,
    'rows', rows
  ) ORDER BY currency_code), '[]'::jsonb) AS value
  FROM currency_code_rows
),
data_snapshot AS (
  SELECT jsonb_build_object(
    'total_rows', (SELECT count(*)::bigint FROM public.minerador_keyword_metric_measurements),
    'currency_code_null_rows', (SELECT count(*)::bigint FROM public.minerador_keyword_metric_measurements WHERE currency_code IS NULL),
    'currency_codes', (SELECT value FROM currency_code_snapshot)
  ) AS value
),
current_fingerprints AS (
  SELECT jsonb_build_object(
    'constraints', md5((SELECT value::text FROM constraints_snapshot)),
    'foreign_keys', md5((SELECT value::text FROM foreign_keys_snapshot)),
    'indexes', md5((SELECT value::text FROM indexes_snapshot)),
    'triggers', md5((SELECT value::text FROM triggers_snapshot)),
    'policies', md5((SELECT value::text FROM policies_snapshot)),
    'rls', md5((SELECT value::text FROM rls_snapshot)),
    'owner', md5((SELECT value::text FROM owner_snapshot)),
    'acl', md5((SELECT value::text FROM acl_snapshot)),
    'non_target_structure', md5((SELECT value::text FROM non_target_structure_snapshot))
  ) AS value
),
checks AS (
  SELECT
    (SELECT count(*) = 1 FROM target_relation) AS relation_exists,
    b.value->>'evidence_version' = '0043-google-ads-metrics-currency-compatibility-preflight-v1' AS baseline_version_ok,
    b.value->'target_column_current_contract'->>'type' = 'text' AS baseline_type_text,
    (b.value->'target_column_current_contract'->>'not_null')::boolean AS baseline_was_not_null,
    (SELECT value->>'type' = 'text' FROM target_column_snapshot) AS target_type_preserved,
    NOT (SELECT (value->>'not_null')::boolean FROM target_column_snapshot) AS target_now_nullable,
    (SELECT value->>'default' IS NULL FROM target_column_snapshot) AS target_default_preserved,
    (SELECT value->>'identity' = '' AND value->>'generated' = '' FROM target_column_snapshot) AS target_generation_preserved,
    (SELECT value FROM current_fingerprints) = b.value->'fingerprints' AS invariant_fingerprints_preserved,
    (SELECT value FROM data_snapshot) = b.value->'data_snapshot' AS data_delta_zero
  FROM baseline b
)
SELECT
  CASE WHEN relation_exists
    AND baseline_version_ok
    AND baseline_type_text
    AND baseline_was_not_null
    AND target_type_preserved
    AND target_now_nullable
    AND target_default_preserved
    AND target_generation_preserved
    AND invariant_fingerprints_preserved
    AND data_delta_zero
    THEN 'PASS'
    ELSE 'FAIL_CLOSED'
  END AS post_verifier_status,
  '0043-google-ads-metrics-currency-compatibility-post-v1'::text AS verifier_version,
  true AS baseline_bound_to_remote_preflight,
  target_now_nullable,
  target_type_preserved,
  target_default_preserved,
  target_generation_preserved,
  invariant_fingerprints_preserved,
  data_delta_zero,
  jsonb_build_object(
    'baseline_version_ok', baseline_version_ok,
    'baseline_was_not_null', baseline_was_not_null,
    'current_target', (SELECT value FROM target_column_snapshot),
    'current_data', (SELECT value FROM data_snapshot),
    'current_fingerprints', (SELECT value FROM current_fingerprints),
    'expected_fingerprints', (SELECT value->'fingerprints' FROM baseline)
  ) AS evidence_json
FROM checks;
