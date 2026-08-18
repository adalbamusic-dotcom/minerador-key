-- GOOGLE_ADS_INFRASTRUCTURE_USAGE_LEDGER_DIAGNOSTIC_V1
--
-- Diagnóstico remoto preparatório para uma SDD. Somente SELECT/CTE: não cria
-- objetos, não persiste baseline, não lê Vault e não chama provider.
-- A presença de secret_ref é devolvida somente como booleano sanitizado.
-- O único result set é sanitizado; IDs de Connection aparecem apenas mascarados.

WITH
target_relations AS (
  SELECT 'integration_usage_events'::text AS relation_name
  UNION ALL SELECT 'integration_connections'
  UNION ALL SELECT 'integration_providers'
  UNION ALL SELECT 'integration_capabilities'
),
relations AS (
  SELECT
    t.relation_name,
    c.oid,
    c.relowner,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relacl
  FROM target_relations AS t
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.oid = pg_catalog.to_regclass('public.' || t.relation_name)
),
usage_relation AS (
  SELECT * FROM relations WHERE relation_name = 'integration_usage_events'
),
connection_relation AS (
  SELECT * FROM relations WHERE relation_name = 'integration_connections'
),
column_snapshot AS (
  SELECT
    r.relation_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'ordinal', a.attnum,
      'name', a.attname,
      'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull,
      'default', pg_catalog.pg_get_expr(ad.adbin, ad.adrelid),
      'identity', a.attidentity,
      'generated', a.attgenerated
    ) ORDER BY a.attnum) FILTER (WHERE a.attname IS NOT NULL), '[]'::jsonb) AS value
  FROM relations AS r
  LEFT JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = r.oid
   AND a.attnum > 0
   AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS ad
    ON ad.adrelid = a.attrelid
   AND ad.adnum = a.attnum
  GROUP BY r.relation_name
),
constraint_snapshot AS (
  SELECT
    r.relation_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', c.conname,
      'type', c.contype,
      'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
      'validated', c.convalidated,
      'deferrable', c.condeferrable,
      'deferred', c.condeferred,
      'match_type', c.confmatchtype,
      'on_delete', c.confdeltype,
      'on_update', c.confupdtype
    ) ORDER BY c.conname) FILTER (WHERE c.oid IS NOT NULL), '[]'::jsonb) AS value
  FROM relations AS r
  LEFT JOIN pg_catalog.pg_constraint AS c
    ON c.conrelid = r.oid
  GROUP BY r.relation_name
),
index_snapshot AS (
  SELECT
    r.relation_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', index_rel.relname,
      'definition', pg_catalog.pg_get_indexdef(index_rel.oid),
      'unique', idx.indisunique,
      'primary', idx.indisprimary,
      'valid', idx.indisvalid,
      'predicate', pg_catalog.pg_get_expr(idx.indpred, idx.indrelid)
    ) ORDER BY index_rel.relname) FILTER (WHERE index_rel.oid IS NOT NULL), '[]'::jsonb) AS value
  FROM relations AS r
  LEFT JOIN pg_catalog.pg_index AS idx
    ON idx.indrelid = r.oid
  LEFT JOIN pg_catalog.pg_class AS index_rel
    ON index_rel.oid = idx.indexrelid
  GROUP BY r.relation_name
),
policy_snapshot AS (
  SELECT
    r.relation_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', p.policyname,
      'command', p.cmd,
      'roles', p.roles,
      'permissive', p.permissive,
      'using', p.qual,
      'with_check', p.with_check
    ) ORDER BY p.policyname) FILTER (WHERE p.policyname IS NOT NULL), '[]'::jsonb) AS value
  FROM relations AS r
  LEFT JOIN pg_catalog.pg_policies AS p
    ON p.schemaname = 'public'
   AND p.tablename = r.relation_name
  GROUP BY r.relation_name
),
trigger_snapshot AS (
  SELECT
    r.relation_name,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', t.tgname,
      'enabled', t.tgenabled,
      'definition', pg_catalog.pg_get_triggerdef(t.oid, true),
      'function', fn_ns.nspname || '.' || fn.proname || '(' || pg_catalog.pg_get_function_identity_arguments(fn.oid) || ')'
    ) ORDER BY t.tgname) FILTER (WHERE t.oid IS NOT NULL), '[]'::jsonb) AS value
  FROM relations AS r
  LEFT JOIN pg_catalog.pg_trigger AS t
    ON t.tgrelid = r.oid
   AND NOT t.tgisinternal
  LEFT JOIN pg_catalog.pg_proc AS fn
    ON fn.oid = t.tgfoid
  LEFT JOIN pg_catalog.pg_namespace AS fn_ns
    ON fn_ns.oid = fn.pronamespace
  GROUP BY r.relation_name
),
acl_snapshot AS (
  SELECT
    r.relation_name,
    jsonb_build_object(
      'owner', CASE WHEN r.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_userbyid(r.relowner) END,
      'acl', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'grantee', coalesce(grantee.rolname, 'PUBLIC'),
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        ) ORDER BY coalesce(grantee.rolname, 'PUBLIC'), acl.privilege_type)
        FROM pg_catalog.aclexplode(coalesce(r.relacl, pg_catalog.acldefault('r', r.relowner))) AS acl
        LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      ), '[]'::jsonb),
      'rls_enabled', coalesce(r.relrowsecurity, false),
      'rls_forced', coalesce(r.relforcerowsecurity, false)
    ) AS value
  FROM relations AS r
),
foreign_key_consumers AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', fk.conname,
    'source', src_ns.nspname || '.' || src.relname,
    'target', dst_ns.nspname || '.' || dst.relname,
    'definition', pg_catalog.pg_get_constraintdef(fk.oid, true)
  ) ORDER BY src_ns.nspname, src.relname, fk.conname), '[]'::jsonb) AS value
  FROM pg_catalog.pg_constraint AS fk
  JOIN pg_catalog.pg_class AS src ON src.oid = fk.conrelid
  JOIN pg_catalog.pg_namespace AS src_ns ON src_ns.oid = src.relnamespace
  JOIN pg_catalog.pg_class AS dst ON dst.oid = fk.confrelid
  JOIN pg_catalog.pg_namespace AS dst_ns ON dst_ns.oid = dst.relnamespace
  WHERE fk.contype = 'f'
    AND (
      fk.conrelid IN (SELECT oid FROM relations WHERE oid IS NOT NULL)
      OR fk.confrelid IN (SELECT oid FROM relations WHERE oid IS NOT NULL)
    )
),
function_consumers AS (
  SELECT coalesce(jsonb_agg(signature ORDER BY signature), '[]'::jsonb) AS value
  FROM (
    SELECT to_jsonb(fn_ns.nspname || '.' || fn.proname || '(' || pg_catalog.pg_get_function_identity_arguments(fn.oid) || ')') AS signature
    FROM pg_catalog.pg_proc AS fn
    JOIN pg_catalog.pg_namespace AS fn_ns ON fn_ns.oid = fn.pronamespace
    WHERE fn.prokind IN ('f', 'p')
      AND fn_ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND (
        pg_catalog.pg_get_functiondef(fn.oid) ILIKE '%integration_usage_events%'
        OR pg_catalog.pg_get_functiondef(fn.oid) ILIKE '%integration_connections%'
      )
  ) AS matches
),
usage_by_provider_rows AS (
  SELECT
    coalesce(p.provider_key, '<missing_provider>') AS provider_key,
    count(u.id)::bigint AS events,
    count(u.id) FILTER (WHERE u.result_status = 'succeeded')::bigint AS succeeded,
    count(u.id) FILTER (WHERE u.connection_id IS NOT NULL)::bigint AS connection_backed,
    count(u.id) FILTER (WHERE u.connection_id IS NULL)::bigint AS infrastructure_backed
  FROM public.integration_usage_events AS u
  LEFT JOIN public.integration_providers AS p ON p.id = u.provider_id
  GROUP BY coalesce(p.provider_key, '<missing_provider>')
),
usage_by_provider AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'provider', provider_key,
    'events', events,
    'succeeded', succeeded,
    'connection_backed', connection_backed,
    'infrastructure_backed', infrastructure_backed
  ) ORDER BY provider_key), '[]'::jsonb) AS value
  FROM usage_by_provider_rows
),
google_ads_connection_rows AS (
  SELECT
    c.id,
    c.environment,
    c.owner_scope_type,
    c.lifecycle_status,
    (c.secret_ref IS NOT NULL AND btrim(c.secret_ref) <> '') AS secret_ref_configured,
    count(u.id)::bigint AS usage_events_referencing_connection
  FROM public.integration_connections AS c
  JOIN public.integration_providers AS p
    ON p.id = c.provider_id
   AND p.provider_key = 'google_ads'
  LEFT JOIN public.integration_usage_events AS u
    ON u.connection_id = c.id
  GROUP BY c.id, c.environment, c.owner_scope_type, c.lifecycle_status, c.secret_ref
),
google_ads_connections AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'connection_ref', '…' || right(c.id::text, 8),
    'environment', c.environment,
    'owner_scope', c.owner_scope_type,
    'lifecycle', c.lifecycle_status,
    'secret_ref_configured', c.secret_ref_configured,
    'usage_events_referencing_connection', c.usage_events_referencing_connection
  ) ORDER BY c.environment, c.lifecycle_status, c.id), '[]'::jsonb) AS value
  FROM google_ads_connection_rows AS c
),
usage_totals AS (
  SELECT jsonb_build_object(
    'events_total', count(*),
    'google_ads_events_total', count(*) FILTER (WHERE p.provider_key = 'google_ads'),
    'google_ads_events_connection_backed', count(*) FILTER (WHERE p.provider_key = 'google_ads' AND u.connection_id IS NOT NULL),
    'google_ads_events_infrastructure_backed', count(*) FILTER (WHERE p.provider_key = 'google_ads' AND u.connection_id IS NULL),
    'events_with_null_connection', count(*) FILTER (WHERE u.connection_id IS NULL),
    'events_with_null_capability', count(*) FILTER (WHERE u.capability_id IS NULL)
  ) AS value
  FROM public.integration_usage_events AS u
  LEFT JOIN public.integration_providers AS p ON p.id = u.provider_id
),
fingerprints AS (
  SELECT jsonb_object_agg(
    r.relation_name,
    jsonb_build_object(
      'columns', md5(coalesce(columns.value::text, '[]')),
      'constraints', md5(coalesce(constraints.value::text, '[]')),
      'indexes', md5(coalesce(indexes.value::text, '[]')),
      'policies', md5(coalesce(policies.value::text, '[]')),
      'triggers', md5(coalesce(triggers.value::text, '[]')),
      'acl_rls_owner', md5(coalesce(acl.value::text, '{}'))
    )
  ) AS value
  FROM relations AS r
  LEFT JOIN column_snapshot AS columns ON columns.relation_name = r.relation_name
  LEFT JOIN constraint_snapshot AS constraints ON constraints.relation_name = r.relation_name
  LEFT JOIN index_snapshot AS indexes ON indexes.relation_name = r.relation_name
  LEFT JOIN policy_snapshot AS policies ON policies.relation_name = r.relation_name
  LEFT JOIN trigger_snapshot AS triggers ON triggers.relation_name = r.relation_name
  LEFT JOIN acl_snapshot AS acl ON acl.relation_name = r.relation_name
)
SELECT
  'google-ads-infrastructure-usage-ledger-diagnostic-v1'::text AS diagnostic_version,
  CASE
    WHEN (SELECT oid FROM usage_relation) IS NULL THEN 'FAIL_USAGE_LEDGER_MISSING'
    WHEN (SELECT oid FROM connection_relation) IS NULL THEN 'FAIL_CONNECTIONS_MISSING'
    ELSE 'PASS_READ_ONLY_INVENTORY'
  END::text AS diagnostic_status,
  jsonb_build_object(
    'structure', (
      SELECT jsonb_object_agg(
        r.relation_name,
        jsonb_build_object(
          'columns', columns.value,
          'constraints', constraints.value,
          'indexes', indexes.value,
          'policies', policies.value,
          'triggers', triggers.value,
          'acl_rls_owner', acl.value
        )
      )
      FROM relations AS r
      LEFT JOIN column_snapshot AS columns ON columns.relation_name = r.relation_name
      LEFT JOIN constraint_snapshot AS constraints ON constraints.relation_name = r.relation_name
      LEFT JOIN index_snapshot AS indexes ON indexes.relation_name = r.relation_name
      LEFT JOIN policy_snapshot AS policies ON policies.relation_name = r.relation_name
      LEFT JOIN trigger_snapshot AS triggers ON triggers.relation_name = r.relation_name
      LEFT JOIN acl_snapshot AS acl ON acl.relation_name = r.relation_name
    ),
    'fingerprints', (SELECT value FROM fingerprints),
    'usage_totals', (SELECT value FROM usage_totals),
    'usage_by_provider', (SELECT value FROM usage_by_provider),
    'google_ads_legacy_connections', (SELECT value FROM google_ads_connections),
    'relational_consumers', jsonb_build_object(
      'foreign_keys', (SELECT value FROM foreign_key_consumers),
      'functions', (SELECT value FROM function_consumers)
    )
  ) AS evidence_json,
  'NO'::text AS remote_writes,
  '0'::text AS real_provider_calls;
