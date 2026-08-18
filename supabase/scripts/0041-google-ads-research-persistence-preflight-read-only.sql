-- Preflight read-only da migration 0041.
--
-- Retorna um unico result set com o snapshot PRE-APPLY que deve ser
-- preservado como evidencia. Nao cria tabela temporaria, nao persiste
-- baseline e nao altera schema, dados, ACL ou RLS.
--
-- TARGET_CONSTRAINTS e NON_TARGET_STRUCTURE sao separados para que o
-- post-verifier prove que somente as duas CHECKs alvo mudaram. O guard das
-- CHECKs antigas e fail-closed. 0036 e 0038 sao historicos fechados e nao
-- sao reconstruidos por este script.

WITH
expected_relations(table_name) AS (
  VALUES ('minerador_discovery_runs'::text), ('minerador_discovery_candidates'::text)
),
target_names(table_name, constraint_name) AS (
  VALUES
    ('minerador_discovery_runs', 'minerador_discovery_runs_source_contract_check'),
    ('minerador_discovery_candidates', 'minerador_discovery_candidates_source_contract_check')
),
expected_target_constraints(table_name, constraint_name, expected_fingerprint, expected_definition) AS (
  VALUES
    (
      'minerador_discovery_runs',
      'minerador_discovery_runs_source_contract_check',
      '821f77570a9bcc3b19b4505de0a4be39',
      $$source = 'google_ads'::text AND provider = 'google_ads'::text AND provider_version = 'v25'::text AND seed_original IS NOT NULL AND seed_canonical IS NOT NULL AND relationship_mode IS NOT NULL AND language IS NOT NULL AND country_code IS NOT NULL AND country_label IS NOT NULL AND language_constant IS NOT NULL AND selected_states IS NOT NULL AND state_labels IS NOT NULL AND geo_target_constants IS NOT NULL AND keyword_plan_network IS NOT NULL AND include_adult_keywords IS NOT NULL AND currency_code IS NOT NULL AND time_zone IS NOT NULL OR (source = ANY (ARRAY['manual'::text, 'csv'::text])) AND provider IS NULL AND provider_version IS NULL AND seed_original IS NULL AND seed_canonical IS NULL AND relationship_mode IS NULL AND language IS NULL AND country_code IS NULL AND country_label IS NULL AND language_constant IS NULL AND selected_states IS NULL AND state_labels IS NULL AND geo_target_constants IS NULL AND keyword_plan_network IS NULL AND include_adult_keywords IS NULL AND currency_code IS NULL AND time_zone IS NULL$$
    ),
    (
      'minerador_discovery_candidates',
      'minerador_discovery_candidates_source_contract_check',
      'de59d81acc1f4f6d71f4cd79e5bbff14',
      $$source = 'google_ads'::text AND provider = 'google_ads'::text AND provider_version = 'v25'::text AND currency_code IS NOT NULL AND time_zone IS NOT NULL AND targeting IS NOT NULL AND measured_at IS NOT NULL OR (source = ANY (ARRAY['manual'::text, 'csv'::text])) AND provider IS NULL AND provider_version IS NULL AND currency_code IS NULL AND time_zone IS NULL AND targeting IS NULL AND measured_at IS NULL AND average_monthly_searches IS NULL AND monthly_search_volumes = '[]'::jsonb AND competition IS NULL AND competition_index IS NULL AND low_top_of_page_bid_micros IS NULL AND high_top_of_page_bid_micros IS NULL AND average_cpc_micros IS NULL$$
    )
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
    'table_name', table_name, 'constraint_name', constraint_name, 'expected_definition', expected_definition,
    'expected_fingerprint', expected_fingerprint, 'constraint_exists', constraint_exists, 'is_check', is_check,
    'validated', validated, 'observed_definition', observed_definition, 'observed_fingerprint', observed_fingerprint, 'ok', ok
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
guard AS (
  SELECT
    (SELECT count(*) = 2 AND count(*) FILTER (WHERE exists) = 2 FROM relations) AS relations_ok,
    (SELECT count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 FROM target_evidence) AS targets_ok,
    (SELECT count(*) = 2 AND count(*) FILTER (WHERE relation_oid IS NOT NULL AND jsonb_typeof(structure->'columns') = 'array' AND jsonb_typeof(structure->'constraints') = 'array' AND jsonb_typeof(structure->'primary_keys') = 'array' AND jsonb_typeof(structure->'unique_constraints') = 'array' AND jsonb_typeof(structure->'foreign_keys') = 'array' AND jsonb_typeof(structure->'indexes') = 'array' AND jsonb_typeof(structure->'triggers') = 'array' AND jsonb_typeof(structure->'policies') = 'array' AND jsonb_typeof(structure->'acl') = 'array') = 2 FROM table_snapshots) AS snapshot_ok
)
SELECT
  CASE WHEN g.relations_ok AND g.targets_ok AND g.snapshot_ok THEN 'PASS' ELSE 'FAIL' END AS preflight_status,
  '0041-preflight-v2'::text AS evidence_version,
  'TARGET_CONSTRAINTS'::text AS target_scope,
  'NON_TARGET_STRUCTURE'::text AS non_target_scope,
  t.snapshot AS target_constraints,
  n.snapshot AS non_target_structure,
  d.snapshot AS data_snapshot,
  f.snapshot AS fingerprints,
  jsonb_build_object('relations', g.relations_ok, 'target_constraints_exact_old', g.targets_ok, 'full_structure_snapshot', g.snapshot_ok, 'drift_policy', 'FAIL_CLOSED') AS checks,
  jsonb_build_object('evidence_version', '0041-preflight-v2', 'target_constraints', t.snapshot, 'non_target_structure', n.snapshot, 'data_snapshot', d.snapshot, 'fingerprints', f.snapshot) AS evidence_json
FROM guard g CROSS JOIN target t CROSS JOIN non_target n CROSS JOIN data d CROSS JOIN fingerprints f;
