-- Preflight read-only da 0044. Produz a baseline que deve ser copiada
-- integralmente para o post-verifier antes de qualquer apply.

WITH
target_relation AS (
  SELECT c.oid, c.relowner, c.relrowsecurity, c.relforcerowsecurity, c.relacl
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
target_column AS (
  SELECT item AS value
  FROM columns_snapshot, LATERAL jsonb_array_elements(value) item
  WHERE item->>'name' = 'time_zone'
),
non_target_columns AS (
  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'ordinal')::int), '[]'::jsonb) AS value
  FROM columns_snapshot, LATERAL jsonb_array_elements(value) item
  WHERE item->>'name' <> 'time_zone'
),
constraints_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', c.conname,
    'type', c.contype,
    'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
    'validated', c.convalidated,
    'deferrable', c.condeferrable,
    'deferred', c.condeferred
  ) ORDER BY c.conname), '[]'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid
),
indexes_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', ic.relname,
    'definition', pg_catalog.pg_get_indexdef(i.indexrelid),
    'unique', i.indisunique,
    'primary', i.indisprimary,
    'valid', i.indisvalid
  ) ORDER BY ic.relname), '[]'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_index i ON i.indrelid = r.oid
  JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
),
triggers_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', t.tgname,
    'enabled', t.tgenabled,
    'definition', pg_catalog.pg_get_triggerdef(t.oid, true),
    'function_definition', pg_catalog.pg_get_functiondef(t.tgfoid)
  ) ORDER BY t.tgname), '[]'::jsonb) AS value
  FROM target_relation r
  JOIN pg_catalog.pg_trigger t ON t.tgrelid = r.oid
  WHERE NOT t.tgisinternal
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
  WHERE p.schemaname = 'public' AND p.tablename = 'minerador_keyword_metric_measurements'
),
acl_snapshot AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'grantor', pg_catalog.pg_get_userbyid(x.grantor),
    'grantee', CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
    'privilege', x.privilege_type,
    'grantable', x.is_grantable
  ) ORDER BY x.grantee, x.privilege_type, x.is_grantable, x.grantor), '[]'::jsonb) AS value
  FROM target_relation r
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(r.relacl, pg_catalog.acldefault('r', r.relowner))) x
),
relation_snapshot AS (
  SELECT jsonb_build_object(
    'rls_enabled', relrowsecurity,
    'rls_forced', relforcerowsecurity,
    'owner', pg_catalog.pg_get_userbyid(relowner)
  ) AS value
  FROM target_relation
),
data_snapshot AS (
  SELECT jsonb_build_object(
    'total_rows', count(*)::bigint,
    'time_zone_null_rows', count(*) FILTER (WHERE time_zone IS NULL)::bigint,
    'rows_fingerprint', md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), ''))
  ) AS value
  FROM public.minerador_keyword_metric_measurements t
),
baseline AS (
  SELECT jsonb_build_object(
    'evidence_version', '0044-google-ads-metrics-time-zone-compatibility-preflight-v1',
    'target_column', (SELECT value FROM target_column),
    'fingerprints', jsonb_build_object(
      'non_target_columns', md5((SELECT value::text FROM non_target_columns)),
      'constraints', md5((SELECT value::text FROM constraints_snapshot)),
      'indexes', md5((SELECT value::text FROM indexes_snapshot)),
      'triggers', md5((SELECT value::text FROM triggers_snapshot)),
      'policies', md5((SELECT value::text FROM policies_snapshot)),
      'acl', md5((SELECT value::text FROM acl_snapshot)),
      'relation', md5((SELECT value::text FROM relation_snapshot)),
      'data', md5((SELECT value::text FROM data_snapshot))
    ),
    'data_snapshot', (SELECT value FROM data_snapshot)
  ) AS value
),
guard AS (
  SELECT
    (SELECT count(*) = 1 FROM target_relation) AS relation_exists,
    COALESCE((SELECT value->>'type' = 'text' FROM target_column), false) AS type_is_text,
    COALESCE((SELECT (value->>'not_null')::boolean FROM target_column), false) AS currently_not_null,
    COALESCE((SELECT value->>'default' IS NULL FROM target_column), false) AS default_absent,
    COALESCE((SELECT (value->>'total_rows')::bigint = 0 FROM data_snapshot), false) AS table_empty
)
SELECT
  CASE WHEN relation_exists AND type_is_text AND currently_not_null AND default_absent AND table_empty
    THEN 'PASS' ELSE 'FAIL_CLOSED' END AS preflight_status,
  (SELECT value FROM baseline) AS baseline,
  jsonb_build_object(
    'relation_exists', relation_exists,
    'type_is_text', type_is_text,
    'currently_not_null', currently_not_null,
    'default_absent', default_absent,
    'table_empty', table_empty,
    'expected_delta', 'time_zone NOT NULL -> NULLABLE'
  ) AS checks
FROM guard;
