-- Preflight read-only da futura 0043.
-- Executar manualmente antes de qualquer migration. Retorna um unico result set
-- com evidencia deterministica e falha fechado se o contrato atual divergir.
-- Este arquivo usa somente CTEs e SELECTs; nao persiste baseline nem modifica dados.

WITH
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
currency_checks_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', c.conname,
    'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
    'validated', c.convalidated
  ) ORDER BY c.conname), '[]'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid
  WHERE c.contype = 'c'
    AND pg_catalog.pg_get_constraintdef(c.oid, true) LIKE '%currency_code%'
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
fingerprints AS (
  SELECT jsonb_build_object(
    'target_column_current_contract', md5((SELECT value::text FROM target_column_snapshot)),
    'columns', md5((SELECT value::text FROM columns_snapshot)),
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
guard AS (
  SELECT
    (SELECT count(*) = 1 FROM target_relation) AS relation_exists,
    COALESCE((SELECT value->>'type' = 'text' FROM target_column_snapshot), false) AS currency_type_is_text,
    COALESCE((SELECT (value->>'not_null')::boolean FROM target_column_snapshot), false) AS currency_not_null,
    COALESCE((SELECT value->>'default' IS NULL FROM target_column_snapshot), false) AS currency_default_absent,
    COALESCE((SELECT jsonb_array_length(value) = 1 FROM currency_checks_snapshot), false) AS currency_check_count_expected,
    COALESCE((SELECT bool_and(
      (item->>'definition') LIKE '%currency_code%'
      AND (item->>'definition') LIKE '%^[A-Z]{3}$%'
    ) FROM jsonb_array_elements((SELECT value FROM currency_checks_snapshot)) item), false) AS currency_check_effective
)
SELECT
  CASE
    WHEN relation_exists
      AND currency_type_is_text
      AND currency_not_null
      AND currency_default_absent
      AND currency_check_count_expected
      AND currency_check_effective
    THEN 'PASS'
    ELSE 'FAIL_CLOSED'
  END AS preflight_status,
  '0043-google-ads-metrics-currency-compatibility-preflight-v1'::text AS evidence_version,
  (SELECT value FROM target_column_snapshot) AS target_column_current_contract,
  (SELECT value FROM currency_checks_snapshot) AS currency_code_checks,
  (SELECT value FROM data_snapshot) AS data_snapshot,
  (SELECT value FROM fingerprints) AS fingerprints,
  jsonb_build_object(
    'relation_exists', relation_exists,
    'currency_code_type_is_text', currency_type_is_text,
    'currency_code_not_null', currency_not_null,
    'currency_code_default_absent', currency_default_absent,
    'currency_code_check_count_expected', currency_check_count_expected,
    'currency_code_check_effective_for_non_null_values', currency_check_effective,
    'expected_schema_delta', 'currency_code NOT NULL -> NULLABLE',
    'drift_policy', 'FAIL_CLOSED'
  ) AS checks,
  jsonb_build_object(
    'evidence_version', '0043-google-ads-metrics-currency-compatibility-preflight-v1',
    'target_column_current_contract', (SELECT value FROM target_column_snapshot),
    'currency_code_checks', (SELECT value FROM currency_checks_snapshot),
    'columns', (SELECT value FROM columns_snapshot),
    'constraints', (SELECT value FROM constraints_snapshot),
    'foreign_keys', (SELECT value FROM foreign_keys_snapshot),
    'indexes', (SELECT value FROM indexes_snapshot),
    'triggers', (SELECT value FROM triggers_snapshot),
    'rls', (SELECT value FROM rls_snapshot),
    'policies', (SELECT value FROM policies_snapshot),
    'owner', (SELECT value FROM owner_snapshot),
    'acl', (SELECT value FROM acl_snapshot),
    'non_target_structure', (SELECT value FROM non_target_structure_snapshot),
    'data_snapshot', (SELECT value FROM data_snapshot),
    'fingerprints', (SELECT value FROM fingerprints)
  ) AS evidence_json
FROM guard;
