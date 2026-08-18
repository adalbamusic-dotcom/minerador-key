-- Preflight read-only da 0042. Retorna um unico result set de baseline
-- deterministico. Falha fechado se o contrato atual divergir do esperado.
-- Nao persiste baseline, nao chama provider e nao le Vault/secret_ref.

WITH
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
target_snapshot AS (
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
non_target_snapshot AS (
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
usage_by_provider_rows AS (
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
usage_by_provider AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'provider', provider,
    'events', events,
    'connection_backed', connection_backed,
    'infrastructure_backed', infrastructure_backed,
    'succeeded', succeeded
  ) ORDER BY provider), '[]'::jsonb) AS value
  FROM usage_by_provider_rows
),
data_snapshot AS (
  SELECT jsonb_build_object(
    'total_events', (SELECT count(*)::bigint FROM public.integration_usage_events),
    'events_with_null_connection', (SELECT count(*)::bigint FROM public.integration_usage_events WHERE connection_id IS NULL),
    'events_with_null_capability', (SELECT count(*)::bigint FROM public.integration_usage_events WHERE capability_id IS NULL),
    'by_provider', (SELECT value FROM usage_by_provider),
    'google_ads_historical_connection_refs', (SELECT count(*)::bigint
      FROM public.integration_usage_events u JOIN public.integration_providers p ON p.id = u.provider_id
      WHERE p.provider_key = 'google_ads' AND u.connection_id IS NOT NULL)
  ) AS value
),
fingerprints AS (
  SELECT jsonb_build_object(
    'target_structure', md5((SELECT value::text FROM target_snapshot)),
    'non_target_structure', md5((SELECT value::text FROM non_target_snapshot)),
    'columns', md5((SELECT value::text FROM columns_snapshot)),
    'constraints', md5((SELECT value::text FROM constraints_snapshot)),
    'indexes', md5((SELECT value::text FROM indexes_snapshot)),
    'triggers', md5((SELECT value::text FROM triggers_snapshot)),
    'policies', md5((SELECT value::text FROM policies_snapshot)),
    'acl', md5((SELECT value::text FROM acl_snapshot))
  ) AS value
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
guard AS (
  SELECT
    (SELECT count(*) = 1 FROM usage_relation) AS relation_exists,
    COALESCE((SELECT a.attnotnull FROM usage_relation r JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid WHERE a.attname = 'connection_id' AND a.attnum > 0), false) AS connection_not_null,
    COALESCE((SELECT a.attnotnull FROM usage_relation r JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid WHERE a.attname = 'capability_id' AND a.attnum > 0), false) AS capability_not_null,
    EXISTS (SELECT 1 FROM usage_relation r JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid WHERE c.conname = 'uq_integration_usage_events_idempotency_0024' AND c.contype = 'u') AS connection_unique_exists,
    COALESCE((SELECT code = 's' FROM composite_fk_match), false) AS composite_fk_match_simple,
    EXISTS (SELECT 1 FROM usage_relation r JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid WHERE c.contype = 'f' AND c.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = r.oid AND attname = 'provider_id')]) AS provider_fk_exists,
    EXISTS (SELECT 1 FROM usage_relation r JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid WHERE c.contype = 'f' AND c.conkey = ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = r.oid AND attname = 'capability_id')]) AS capability_fk_exists,
    NOT EXISTS (SELECT 1 FROM public.integration_usage_events WHERE connection_id IS NULL),
    NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'uq_integration_usage_events_infrastructure_idempotency_0042')
)
SELECT
  CASE WHEN relation_exists AND connection_not_null AND capability_not_null
    AND connection_unique_exists AND composite_fk_match_simple AND provider_fk_exists AND capability_fk_exists
    AND NOT EXISTS (SELECT 1 FROM public.integration_usage_events WHERE connection_id IS NULL)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'uq_integration_usage_events_infrastructure_idempotency_0042')
    THEN 'PASS' ELSE 'FAIL' END AS preflight_status,
  '0042-google-ads-infrastructure-usage-preflight-v1'::text AS evidence_version,
  (SELECT value FROM target_snapshot) AS target_structure,
  (SELECT value FROM non_target_snapshot) AS non_target_structure,
  (SELECT value FROM data_snapshot) AS data_snapshot,
  (SELECT value FROM fingerprints) AS fingerprints,
  COALESCE((SELECT code FROM composite_fk_match), 'MISSING') AS composite_fk_match_type_code,
  COALESCE((SELECT label FROM composite_fk_match), 'MISSING') AS composite_fk_match_type,
  jsonb_build_object(
    'connection_id_not_null', connection_not_null,
    'capability_id_not_null', capability_not_null,
    'connection_backed_unique', connection_unique_exists,
    'composite_connection_provider_fk_match_simple', composite_fk_match_simple,
    'composite_fk_match_type_code', COALESCE((SELECT code FROM composite_fk_match), 'MISSING'),
    'composite_fk_match_type', COALESCE((SELECT label FROM composite_fk_match), 'MISSING'),
    'provider_fk', provider_fk_exists,
    'capability_fk', capability_fk_exists,
    'null_connection_rows', NOT EXISTS (SELECT 1 FROM public.integration_usage_events WHERE connection_id IS NULL),
    'target_index_absent', NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'uq_integration_usage_events_infrastructure_idempotency_0042'),
    'historical_google_ads_connection_refs', (SELECT value->'google_ads_historical_connection_refs' FROM data_snapshot),
    'drift_policy', 'FAIL_CLOSED'
  ) AS checks,
  jsonb_build_object(
    'evidence_version', '0042-google-ads-infrastructure-usage-preflight-v1',
    'target_structure', (SELECT value FROM target_snapshot),
    'non_target_structure', (SELECT value FROM non_target_snapshot),
    'data_snapshot', (SELECT value FROM data_snapshot),
    'fingerprints', (SELECT value FROM fingerprints)
  ) AS evidence_json
FROM guard;
