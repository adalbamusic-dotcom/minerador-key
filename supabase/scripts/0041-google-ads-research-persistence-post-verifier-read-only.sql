-- Post-verifier read-only da migration 0041.
--
-- BASELINE OBRIGATORIO:
--   SELECT set_config('minerador.baseline_0041_json', '<evidence_json preservado do preflight>', false);
--
-- O SET acima altera somente a sessao do cliente SQL; nao grava no banco.
-- Sem ele, este verifier retorna FAIL fechado. O script nao tenta reconstruir
-- baseline e nao consulta evidencias historicas de 0036/0038.
--
-- POST_VERIFIER_BASELINE_BINDING_REQUIRED = YES
-- TARGET DELTA permitido: somente as duas CHECKs 0041.

WITH
baseline_binding AS (
  SELECT NULLIF(current_setting('minerador.baseline_0041_json', true), '')::jsonb AS baseline_json
),
expected_relations(table_name) AS (
  VALUES ('minerador_discovery_runs'::text), ('minerador_discovery_candidates'::text)
),
target_names(table_name, constraint_name) AS (
  VALUES
    ('minerador_discovery_runs', 'minerador_discovery_runs_source_contract_check'),
    ('minerador_discovery_candidates', 'minerador_discovery_candidates_source_contract_check')
),
expected_target_constraints(table_name, constraint_name, expected_fingerprint) AS (
  VALUES
    ('minerador_discovery_runs', 'minerador_discovery_runs_source_contract_check', 'ac3ed8d96da0eefcac555a1b25f68277'),
    ('minerador_discovery_candidates', 'minerador_discovery_candidates_source_contract_check', '05ec1957e0fc2900224e7d7e1afb1cc1')
),
relations AS (
  SELECT e.table_name, to_regclass(format('public.%I', e.table_name)) AS relation_oid,
         to_regclass(format('public.%I', e.table_name)) IS NOT NULL AS exists
  FROM expected_relations e
),
target_evidence AS (
  SELECT e.*, c.oid IS NOT NULL AS constraint_exists, COALESCE(c.contype = 'c', false) AS is_check,
         COALESCE(c.convalidated, false) AS validated,
         pg_catalog.pg_get_constraintdef(c.oid, true) AS observed_definition,
         md5(pg_catalog.pg_get_constraintdef(c.oid, true)) AS observed_fingerprint,
         c.oid IS NOT NULL AND c.contype = 'c' AND c.convalidated
           AND md5(pg_catalog.pg_get_constraintdef(c.oid, true)) = e.expected_fingerprint AS ok
  FROM expected_target_constraints e
  LEFT JOIN pg_catalog.pg_constraint c
    ON c.conrelid = to_regclass(format('public.%I', e.table_name)) AND c.conname = e.constraint_name
),
table_snapshots AS (
  SELECT r.table_name, r.relation_oid,
    jsonb_build_object(
      'table_name', r.table_name,
      'columns', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'ordinal', a.attnum, 'name', a.attname, 'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull, 'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
        'identity', a.attidentity, 'generated', a.attgenerated,
        'collation', CASE WHEN a.attcollation = 0 THEN NULL ELSE format('%I.%I', ns.nspname, co.collname) END
      ) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        LEFT JOIN pg_catalog.pg_collation co ON co.oid = a.attcollation
        LEFT JOIN pg_catalog.pg_namespace ns ON ns.oid = co.collnamespace
        WHERE a.attrelid = r.relation_oid AND a.attnum > 0 AND NOT a.attisdropped), '[]'::jsonb),
      'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'name', c.conname, 'type', c.contype, 'validated', c.convalidated,
        'deferrable', c.condeferrable, 'deferred', c.condeferred,
        'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
        'columns', to_jsonb(c.conkey), 'referenced_columns', to_jsonb(c.confkey),
        'on_delete', CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE NULL END,
        'on_update', CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE NULL END
      ) ORDER BY c.conname) FROM pg_catalog.pg_constraint c
        WHERE c.conrelid = r.relation_oid AND NOT EXISTS (
          SELECT 1 FROM target_names t WHERE t.table_name = r.table_name AND t.constraint_name = c.conname
        )), '[]'::jsonb),
      'primary_keys', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', c.conname, 'definition', pg_catalog.pg_get_constraintdef(c.oid, true)) ORDER BY c.conname) FROM pg_catalog.pg_constraint c WHERE c.conrelid = r.relation_oid AND c.contype = 'p'), '[]'::jsonb),
      'unique_constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', c.conname, 'definition', pg_catalog.pg_get_constraintdef(c.oid, true)) ORDER BY c.conname) FROM pg_catalog.pg_constraint c WHERE c.conrelid = r.relation_oid AND c.contype = 'u'), '[]'::jsonb),
      'foreign_keys', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'name', c.conname, 'definition', pg_catalog.pg_get_constraintdef(c.oid, true),
        'on_delete', CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE NULL END,
        'on_update', CASE c.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE NULL END
      ) ORDER BY c.conname) FROM pg_catalog.pg_constraint c WHERE c.conrelid = r.relation_oid AND c.contype = 'f'), '[]'::jsonb),
      'indexes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'name', ic.relname, 'definition', pg_catalog.pg_get_indexdef(i.indexrelid), 'unique', i.indisunique,
        'primary', i.indisprimary, 'valid', i.indisvalid, 'ready', i.indisready,
        'predicate', pg_catalog.pg_get_expr(i.indpred, i.indrelid)
      ) ORDER BY ic.relname) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid WHERE i.indrelid = r.relation_oid), '[]'::jsonb),
      'triggers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'name', t.tgname, 'enabled', t.tgenabled, 'internal', t.tgisinternal,
        'definition', pg_catalog.pg_get_triggerdef(t.oid, true), 'function_oid', t.tgfoid,
        'function_identity_arguments', pg_catalog.pg_get_function_identity_arguments(t.tgfoid),
        'function_definition', pg_catalog.pg_get_functiondef(t.tgfoid)
      ) ORDER BY t.tgname) FROM pg_catalog.pg_trigger t WHERE t.tgrelid = r.relation_oid AND NOT t.tgisinternal), '[]'::jsonb),
      'rls', jsonb_build_object('enabled', COALESCE(c.relrowsecurity, false), 'forced', COALESCE(c.relforcerowsecurity, false)),
      'policies', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'name', p.policyname, 'permissive', p.permissive, 'roles', to_jsonb(p.roles), 'command', p.cmd,
        'using', p.qual, 'with_check', p.with_check
      ) ORDER BY p.policyname) FROM pg_catalog.pg_policies p WHERE p.schemaname = 'public' AND p.tablename = r.table_name), '[]'::jsonb),
      'owner', pg_catalog.pg_get_userbyid(c.relowner),
      'acl', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'grantor', pg_catalog.pg_get_userbyid(x.grantor),
        'grantee', CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
        'privilege', x.privilege_type, 'grantable', x.is_grantable
      ) ORDER BY x.grantee, x.privilege_type, x.is_grantable, x.grantor)
      FROM pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) x), '[]'::jsonb)
    ) AS structure
  FROM relations r LEFT JOIN pg_catalog.pg_class c ON c.oid = r.relation_oid
),
non_target AS (
  SELECT jsonb_build_object(
    'columns', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'columns') ORDER BY table_name), '[]'::jsonb),
    'constraints', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'constraints') ORDER BY table_name), '[]'::jsonb),
    'primary_keys', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'primary_keys') ORDER BY table_name), '[]'::jsonb),
    'unique_constraints', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'unique_constraints') ORDER BY table_name), '[]'::jsonb),
    'foreign_keys', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'foreign_keys') ORDER BY table_name), '[]'::jsonb),
    'indexes', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'indexes') ORDER BY table_name), '[]'::jsonb),
    'triggers', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'triggers') ORDER BY table_name), '[]'::jsonb),
    'rls', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'rls') ORDER BY table_name), '[]'::jsonb),
    'policies', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'policies') ORDER BY table_name), '[]'::jsonb),
    'owner', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'owner') ORDER BY table_name), '[]'::jsonb),
    'acl', COALESCE(jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'acl') ORDER BY table_name), '[]'::jsonb)
  ) AS snapshot
  FROM table_snapshots
),
target AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table_name', table_name, 'constraint_name', constraint_name, 'expected_fingerprint', expected_fingerprint,
    'constraint_exists', constraint_exists, 'is_check', is_check, 'validated', validated,
    'observed_definition', observed_definition, 'observed_fingerprint', observed_fingerprint, 'ok', ok
  ) ORDER BY table_name, constraint_name), '[]'::jsonb) AS snapshot
  FROM target_evidence
),
data AS (
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'minerador_discovery_runs', (SELECT count(*)::bigint FROM public.minerador_discovery_runs),
      'minerador_discovery_candidates', (SELECT count(*)::bigint FROM public.minerador_discovery_candidates)
    ),
    'by_source', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'table_name', table_name, 'source', source, 'rows', rows, 'currency_null', currency_null, 'time_zone_null', time_zone_null
    ) ORDER BY table_name, source) FROM (
      SELECT 'minerador_discovery_runs'::text AS table_name, source, count(*)::bigint AS rows,
        count(*) FILTER (WHERE currency_code IS NULL)::bigint AS currency_null,
        count(*) FILTER (WHERE time_zone IS NULL)::bigint AS time_zone_null
      FROM public.minerador_discovery_runs GROUP BY source
      UNION ALL
      SELECT 'minerador_discovery_candidates', source, count(*)::bigint,
        count(*) FILTER (WHERE currency_code IS NULL)::bigint,
        count(*) FILTER (WHERE time_zone IS NULL)::bigint
      FROM public.minerador_discovery_candidates GROUP BY source
    ) counts), '[]'::jsonb)
  ) AS snapshot
),
fingerprints AS (
  SELECT jsonb_build_object(
    'target_constraints', md5((SELECT snapshot::text FROM target)),
    'non_target_structure', md5((SELECT snapshot::text FROM non_target)),
    'columns', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'columns') ORDER BY table_name)::text FROM table_snapshots)),
    'constraints', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'constraints') ORDER BY table_name)::text FROM table_snapshots)),
    'primary_keys', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'primary_keys') ORDER BY table_name)::text FROM table_snapshots)),
    'unique_constraints', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'unique_constraints') ORDER BY table_name)::text FROM table_snapshots)),
    'foreign_keys', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'foreign_keys') ORDER BY table_name)::text FROM table_snapshots)),
    'indexes', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'indexes') ORDER BY table_name)::text FROM table_snapshots)),
    'triggers', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'triggers') ORDER BY table_name)::text FROM table_snapshots)),
    'rls', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'rls') ORDER BY table_name)::text FROM table_snapshots)),
    'policies', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'policies') ORDER BY table_name)::text FROM table_snapshots)),
    'owner', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'owner') ORDER BY table_name)::text FROM table_snapshots)),
    'acl', md5((SELECT jsonb_agg(jsonb_build_object('table_name', table_name, 'value', structure->'acl') ORDER BY table_name)::text FROM table_snapshots))
  ) AS snapshot
),
comparison AS (
  SELECT b.baseline_json,
    b.baseline_json IS NOT NULL AS baseline_present,
    b.baseline_json->>'evidence_version' = '0041-preflight-v2' AS baseline_version_ok,
    (SELECT count(*) = 2 AND count(*) FILTER (WHERE exists) = 2 FROM relations) AS relations_ok,
    (SELECT count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 FROM target_evidence) AS targets_ok,
    b.baseline_json->'non_target_structure' = n.snapshot AS non_target_ok,
    b.baseline_json->'data_snapshot' = d.snapshot AS data_ok,
    (b.baseline_json->'fingerprints'->>'columns' = f.snapshot->>'columns'
      AND b.baseline_json->'fingerprints'->>'constraints' = f.snapshot->>'constraints'
      AND b.baseline_json->'fingerprints'->>'primary_keys' = f.snapshot->>'primary_keys'
      AND b.baseline_json->'fingerprints'->>'unique_constraints' = f.snapshot->>'unique_constraints'
      AND b.baseline_json->'fingerprints'->>'foreign_keys' = f.snapshot->>'foreign_keys'
      AND b.baseline_json->'fingerprints'->>'indexes' = f.snapshot->>'indexes'
      AND b.baseline_json->'fingerprints'->>'triggers' = f.snapshot->>'triggers'
      AND b.baseline_json->'fingerprints'->>'rls' = f.snapshot->>'rls'
      AND b.baseline_json->'fingerprints'->>'policies' = f.snapshot->>'policies'
      AND b.baseline_json->'fingerprints'->>'owner' = f.snapshot->>'owner'
      AND b.baseline_json->'fingerprints'->>'acl' = f.snapshot->>'acl') AS category_fingerprints_ok
  FROM baseline_binding b CROSS JOIN non_target n CROSS JOIN data d CROSS JOIN fingerprints f
),
result AS (
  SELECT c.*,
    c.baseline_present AND c.baseline_version_ok AND c.relations_ok AND c.targets_ok
      AND c.non_target_ok AND c.data_ok AND c.category_fingerprints_ok AS all_checks_ok
  FROM comparison c
)
SELECT
  CASE WHEN all_checks_ok THEN 'PASS' ELSE 'FAIL' END AS post_verifier_status,
  '0041-post-verifier-v2'::text AS evidence_version,
  'YES'::text AS post_verifier_baseline_binding_required,
  jsonb_build_object(
    'baseline_present', baseline_present,
    'baseline_version', baseline_version_ok,
    'relations', relations_ok,
    'target_delta_only', targets_ok,
    'non_target_structure_unchanged', non_target_ok,
    'data_delta', CASE WHEN data_ok THEN 0 ELSE NULL END,
    'columns_types_defaults_nullability', category_fingerprints_ok,
    'constraints_non_target', category_fingerprints_ok,
    'primary_keys', category_fingerprints_ok,
    'unique_constraints', category_fingerprints_ok,
    'foreign_keys', category_fingerprints_ok,
    'indexes', category_fingerprints_ok,
    'triggers_and_functions', category_fingerprints_ok,
    'rls', category_fingerprints_ok,
    'policies', category_fingerprints_ok,
    'owner', category_fingerprints_ok,
    'acl_grants', category_fingerprints_ok,
    'fail_closed_without_baseline', true
  ) AS checks,
  jsonb_build_object(
    'observed_target_constraints', (SELECT snapshot FROM target),
    'observed_non_target_structure', (SELECT snapshot FROM non_target),
    'observed_data_snapshot', (SELECT snapshot FROM data),
    'observed_fingerprints', (SELECT snapshot FROM fingerprints)
  ) AS observed_evidence
FROM result;
