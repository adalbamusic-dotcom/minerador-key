-- Post-verifier read-only da migration 0040.
--
-- Produz um unico result set sanitizado. Nao le dados de keywords, nao testa
-- insercao invalida e nao altera schema, dados, RLS, policies ou grants.
-- Executar manualmente somente depois de aplicar 0040 no banco alvo.

WITH
expected_relations(table_name) AS (
  VALUES
    ('minerador_discovery_runs'::text),
    ('minerador_discovery_candidates'::text)
),
expected_columns(check_group, table_name, column_name, expected_nullable) AS (
  VALUES
    ('source', 'minerador_discovery_runs', 'source', 'NO'),
    ('source', 'minerador_discovery_candidates', 'source', 'NO'),
    ('provider', 'minerador_discovery_runs', 'provider', 'YES'),
    ('provider', 'minerador_discovery_candidates', 'provider', 'YES'),
    ('provider_version', 'minerador_discovery_runs', 'provider_version', 'YES'),
    ('provider_version', 'minerador_discovery_candidates', 'provider_version', 'YES'),
    ('targeting', 'minerador_discovery_candidates', 'targeting', 'YES'),
    ('currency', 'minerador_discovery_runs', 'currency_code', 'YES'),
    ('currency', 'minerador_discovery_candidates', 'currency_code', 'YES'),
    ('timezone', 'minerador_discovery_runs', 'time_zone', 'YES'),
    ('timezone', 'minerador_discovery_candidates', 'time_zone', 'YES'),
    ('measured_at', 'minerador_discovery_candidates', 'measured_at', 'YES'),
    ('source_data', 'minerador_discovery_runs', 'source_data', 'YES'),
    ('source_data', 'minerador_discovery_candidates', 'source_data', 'YES')
),
column_evidence AS (
  SELECT
    e.check_group,
    e.table_name,
    e.column_name,
    e.expected_nullable,
    c.column_name AS found_column,
    c.is_nullable,
    c.data_type,
    (c.column_name IS NOT NULL AND c.is_nullable = e.expected_nullable) AS ok
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.table_name
   AND c.column_name = e.column_name
),
expected_source_constraints(table_name, constraint_name) AS (
  VALUES
    ('minerador_discovery_runs', 'minerador_discovery_runs_source_check'),
    ('minerador_discovery_candidates', 'minerador_discovery_candidates_source_check')
),
source_constraint_evidence AS (
  SELECT
    e.table_name,
    e.constraint_name,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = to_regclass(format('public.%I', e.table_name))
        AND c.conname = e.constraint_name
        AND c.contype = 'c'
        AND c.convalidated
    ) AS validated,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = to_regclass(format('public.%I', e.table_name))
        AND c.conname = e.constraint_name
        AND c.contype = 'c'
        AND lower(pg_catalog.pg_get_constraintdef(c.oid)) LIKE '%source%'
        AND lower(pg_catalog.pg_get_constraintdef(c.oid)) LIKE '%google_ads%'
        AND lower(pg_catalog.pg_get_constraintdef(c.oid)) LIKE '%manual%'
        AND lower(pg_catalog.pg_get_constraintdef(c.oid)) LIKE '%csv%'
    ) AS allowed_values_contract
  FROM expected_source_constraints e
),
expected_google_contracts(table_name, constraint_name, required_tokens) AS (
  VALUES
    (
      'minerador_discovery_runs',
      'minerador_discovery_runs_source_contract_check',
      ARRAY[
        'source = ''google_ads''',
        'provider = ''google_ads''',
        'provider_version = ''v25''',
        'seed_original IS NOT NULL',
        'seed_canonical IS NOT NULL',
        'relationship_mode IS NOT NULL',
        'language IS NOT NULL',
        'country_code IS NOT NULL',
        'country_label IS NOT NULL',
        'language_constant IS NOT NULL',
        'selected_states IS NOT NULL',
        'state_labels IS NOT NULL',
        'geo_target_constants IS NOT NULL',
        'keyword_plan_network IS NOT NULL',
        'include_adult_keywords IS NOT NULL',
        'currency_code IS NOT NULL',
        'time_zone IS NOT NULL'
      ]::text[]
    ),
    (
      'minerador_discovery_candidates',
      'minerador_discovery_candidates_source_contract_check',
      ARRAY[
        'source = ''google_ads''',
        'provider = ''google_ads''',
        'provider_version = ''v25''',
        'currency_code IS NOT NULL',
        'time_zone IS NOT NULL',
        'targeting IS NOT NULL',
        'measured_at IS NOT NULL'
      ]::text[]
    )
),
google_contract_evidence AS (
  SELECT
    e.table_name,
    e.constraint_name,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = to_regclass(format('public.%I', e.table_name))
        AND c.conname = e.constraint_name
        AND c.contype = 'c'
        AND c.convalidated
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(e.required_tokens) AS required(token)
          WHERE lower(pg_catalog.pg_get_constraintdef(c.oid)) NOT LIKE '%' || lower(required.token) || '%'
        )
    ) AS ok
  FROM expected_google_contracts e
),
expected_policies(table_name, policy_name) AS (
  VALUES
    ('minerador_discovery_runs', 'minerador_discovery_runs_select'),
    ('minerador_discovery_runs', 'minerador_discovery_runs_insert'),
    ('minerador_discovery_candidates', 'minerador_discovery_candidates_select'),
    ('minerador_discovery_candidates', 'minerador_discovery_candidates_insert'),
    ('minerador_discovery_candidates', 'minerador_discovery_candidates_update')
),
policy_evidence AS (
  SELECT
    e.table_name,
    e.policy_name,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = e.table_name
        AND p.policyname = e.policy_name
        AND 'authenticated' = ANY (p.roles)
    ) AS ok
  FROM expected_policies e
),
rls_evidence AS (
  SELECT
    e.table_name,
    COALESCE(c.relrowsecurity, false) AS rls_enabled,
    COALESCE(c.relforcerowsecurity, false) AS force_rls
  FROM expected_relations e
  LEFT JOIN pg_catalog.pg_class c
    ON c.oid = to_regclass(format('public.%I', e.table_name))
),
anon_evidence AS (
  SELECT
    e.table_name,
    NOT has_table_privilege('anon', format('public.%I', e.table_name), 'SELECT')
      AND NOT has_table_privilege('anon', format('public.%I', e.table_name), 'INSERT')
      AND NOT has_table_privilege('anon', format('public.%I', e.table_name), 'UPDATE')
      AND NOT has_table_privilege('anon', format('public.%I', e.table_name), 'DELETE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = e.table_name
          AND 'anon' = ANY (p.roles)
      ) AS ok
  FROM expected_relations e
),
expected_foreign_keys(table_name, key_label, definition_fragment) AS (
  VALUES
    ('minerador_discovery_runs', 'brand_id -> marcas', 'foreign key (brand_id) references public.marcas(id)'),
    ('minerador_discovery_runs', 'actor_user_id -> auth.users', 'foreign key (actor_user_id) references auth.users(id)'),
    ('minerador_discovery_candidates', 'discovery_run_id -> discovery_runs', 'foreign key (discovery_run_id) references public.minerador_discovery_runs(id)'),
    ('minerador_discovery_candidates', 'brand_id -> marcas', 'foreign key (brand_id) references public.marcas(id)'),
    ('minerador_discovery_candidates', 'existing_keyword_id -> minerador_keywords', 'foreign key (existing_keyword_id) references public.minerador_keywords(id)'),
    ('minerador_discovery_candidates', 'imported_keyword_id -> minerador_keywords', 'foreign key (imported_keyword_id) references public.minerador_keywords(id)')
),
foreign_key_evidence AS (
  SELECT
    e.table_name,
    e.key_label,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = to_regclass(format('public.%I', e.table_name))
        AND c.contype = 'f'
        AND lower(pg_catalog.pg_get_constraintdef(c.oid)) LIKE '%' || lower(e.definition_fragment) || '%'
    ) AS ok
  FROM expected_foreign_keys e
),
expected_indexes(table_name, index_name) AS (
  VALUES
    ('minerador_discovery_runs', 'idx_minerador_discovery_runs_brand_executed'),
    ('minerador_discovery_runs', 'idx_minerador_discovery_runs_brand_source_executed'),
    ('minerador_discovery_candidates', 'idx_minerador_discovery_candidates_brand_run'),
    ('minerador_discovery_candidates', 'idx_minerador_discovery_candidates_brand_source')
),
index_evidence AS (
  SELECT
    e.table_name,
    e.index_name,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.table_name
        AND i.indexname = e.index_name
    ) AS ok
  FROM expected_indexes e
),
unique_key_evidence AS (
  SELECT
    expected_label,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = to_regclass(format('public.%I', table_name))
        AND c.contype = 'u'
        AND lower(pg_catalog.pg_get_constraintdef(c.oid)) LIKE '%' || lower(definition_fragment) || '%'
    ) AS ok
  FROM (
    VALUES
      ('run idempotency: brand_id + operation_request_id', 'minerador_discovery_runs', 'unique (brand_id, operation_request_id)'),
      ('candidate snapshot: discovery_run_id + canonical_keyword', 'minerador_discovery_candidates', 'unique (discovery_run_id, canonical_keyword)')
  ) AS expected(expected_label, table_name, definition_fragment)
)
SELECT
  check_id,
  check_name,
  status,
  observed,
  expected
FROM (
  SELECT
    '01'::text AS check_id,
    'Coluna source presente nas duas tabelas'::text AS check_name,
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 THEN 'PASS' ELSE 'FAIL' END AS status,
    format('validas=%s/2; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, column_name, CASE WHEN found_column IS NULL THEN 'MISSING' ELSE is_nullable END), '; ' ORDER BY table_name)) AS observed,
    'source presente e NOT NULL em DiscoveryRun e DiscoveryCandidate'::text AS expected
  FROM column_evidence
  WHERE check_group = 'source'

  UNION ALL
  SELECT
    '02',
    'Valores permitidos para source',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE allowed_values_contract AND validated) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('constraints_validas=%s/2; valores=google_ads, manual, csv', count(*) FILTER (WHERE allowed_values_contract AND validated)),
    'google_ads, manual e csv aceitos; demais valores bloqueados por CHECK'
  FROM source_constraint_evidence

  UNION ALL
  SELECT
    '03',
    'Source invalido bloqueado por constraint validada',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE validated) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('source_checks_validados=%s/2', count(*) FILTER (WHERE validated)),
    'CHECK de source validado nas duas tabelas'
  FROM source_constraint_evidence

  UNION ALL
  SELECT
    '04',
    'provider nullable conforme contrato multi-source',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('validas=%s/2; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, column_name, COALESCE(is_nullable, 'MISSING')), '; ' ORDER BY table_name)),
    'provider nullable em DiscoveryRun e DiscoveryCandidate'
  FROM column_evidence
  WHERE check_group = 'provider'

  UNION ALL
  SELECT
    '05',
    'provider_version nullable conforme contrato multi-source',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('validas=%s/2; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, column_name, COALESCE(is_nullable, 'MISSING')), '; ' ORDER BY table_name)),
    'provider_version nullable em DiscoveryRun e DiscoveryCandidate'
  FROM column_evidence
  WHERE check_group = 'provider_version'

  UNION ALL
  SELECT
    '06',
    'targeting nullable conforme contrato multi-source',
    CASE WHEN count(*) = 1 AND count(*) FILTER (WHERE ok) = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('validas=%s/1; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, column_name, COALESCE(is_nullable, 'MISSING')), '; ' ORDER BY table_name)),
    'targeting nullable em DiscoveryCandidate'
  FROM column_evidence
  WHERE check_group = 'targeting'

  UNION ALL
  SELECT
    '07',
    'currency nullable conforme contrato multi-source',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('validas=%s/2; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, column_name, COALESCE(is_nullable, 'MISSING')), '; ' ORDER BY table_name)),
    'currency_code nullable em DiscoveryRun e DiscoveryCandidate'
  FROM column_evidence
  WHERE check_group = 'currency'

  UNION ALL
  SELECT
    '08',
    'timezone nullable conforme contrato multi-source',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('validas=%s/2; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, column_name, COALESCE(is_nullable, 'MISSING')), '; ' ORDER BY table_name)),
    'time_zone nullable em DiscoveryRun e DiscoveryCandidate'
  FROM column_evidence
  WHERE check_group = 'timezone'

  UNION ALL
  SELECT
    '09',
    'measured_at nullable conforme contrato multi-source',
    CASE WHEN count(*) = 1 AND count(*) FILTER (WHERE ok) = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('validas=%s/1; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, column_name, COALESCE(is_nullable, 'MISSING')), '; ' ORDER BY table_name)),
    'measured_at nullable em DiscoveryCandidate'
  FROM column_evidence
  WHERE check_group = 'measured_at'

  UNION ALL
  SELECT
    '10',
    'source_data presente e nullable',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE ok AND data_type = 'jsonb') = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('validas=%s/2; %s', count(*) FILTER (WHERE ok AND data_type = 'jsonb'), string_agg(format('%s.%s=%s/%s', table_name, column_name, COALESCE(is_nullable, 'MISSING'), COALESCE(data_type, 'MISSING')), '; ' ORDER BY table_name)),
    'source_data jsonb nullable em DiscoveryRun e DiscoveryCandidate'
  FROM column_evidence
  WHERE check_group = 'source_data'

  UNION ALL
  SELECT
    '11',
    'Constraints condicionais preservam requisitos de source=google_ads',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('contracts_validos=%s/2; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, constraint_name, CASE WHEN ok THEN 'OK' ELSE 'MISSING_OR_INCOMPLETE' END), '; ' ORDER BY table_name)),
    'Google Ads exige provider google_ads, v25 e seus campos obrigatorios; candidato exige targeting, moeda, timezone e measured_at'
  FROM google_contract_evidence

  UNION ALL
  SELECT
    '12',
    'RLS ativa nas duas tabelas',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE rls_enabled) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('rls_ativa=%s/2; %s', count(*) FILTER (WHERE rls_enabled), string_agg(format('%s=%s', table_name, CASE WHEN rls_enabled THEN 'true' ELSE 'false' END), '; ' ORDER BY table_name)),
    'relrowsecurity=true em DiscoveryRun e DiscoveryCandidate'
  FROM rls_evidence

  UNION ALL
  SELECT
    '13',
    'Policies authenticated esperadas presentes',
    CASE WHEN count(*) = 5 AND count(*) FILTER (WHERE ok) = 5 THEN 'PASS' ELSE 'FAIL' END,
    format('policies_authenticated=%s/5; %s', count(*) FILTER (WHERE ok), string_agg(format('%s.%s=%s', table_name, policy_name, CASE WHEN ok THEN 'OK' ELSE 'MISSING' END), '; ' ORDER BY table_name, policy_name)),
    'runs: select/insert; candidates: select/insert/update, todas para authenticated'
  FROM policy_evidence

  UNION ALL
  SELECT
    '14',
    'Anon sem acesso indevido',
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE ok) = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('tabelas_sem_acesso_anon=%s/2; %s', count(*) FILTER (WHERE ok), string_agg(format('%s=%s', table_name, CASE WHEN ok THEN 'OK' ELSE 'ACCESS_PRESENT' END), '; ' ORDER BY table_name)),
    'anon sem SELECT/INSERT/UPDATE/DELETE e sem policy anon nas duas tabelas'
  FROM anon_evidence

  UNION ALL
  SELECT
    '15',
    'FKs e indices relevantes preservados',
    CASE WHEN (SELECT count(*) FILTER (WHERE ok) FROM foreign_key_evidence) = (SELECT count(*) FROM foreign_key_evidence)
              AND (SELECT count(*) FILTER (WHERE ok) FROM index_evidence) = (SELECT count(*) FROM index_evidence)
              AND (SELECT count(*) FILTER (WHERE ok) FROM unique_key_evidence) = (SELECT count(*) FROM unique_key_evidence)
         THEN 'PASS' ELSE 'FAIL' END,
    format('fks=%s/%s; indices=%s/%s; chaves_unicas=%s/%s',
      (SELECT count(*) FILTER (WHERE ok) FROM foreign_key_evidence), (SELECT count(*) FROM foreign_key_evidence),
      (SELECT count(*) FILTER (WHERE ok) FROM index_evidence), (SELECT count(*) FROM index_evidence),
      (SELECT count(*) FILTER (WHERE ok) FROM unique_key_evidence), (SELECT count(*) FROM unique_key_evidence)),
    'FKs de tenant/run/keyword, indices 0009/0040 e unicidade de idempotencia/snapshot presentes'
  FROM (VALUES (1)) AS one(dummy)
) AS checks
ORDER BY check_id;
