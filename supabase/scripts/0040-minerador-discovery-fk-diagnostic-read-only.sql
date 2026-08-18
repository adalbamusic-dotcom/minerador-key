-- Diagnostico read-only das FKs reais apos a migration 0040.
--
-- Produz um unico result set sanitizado. A classificacao e semantica e nao
-- depende do nome historico da constraint. Nenhuma linha de negocio e lida;
-- nenhuma operacao de escrita, teste de INSERT ou alteracao de schema ocorre.

WITH
actual_fks AS (
  SELECT
    c.oid AS constraint_oid,
    format('%I.%I', local_namespace.nspname, local_relation.relname) AS table_name,
    c.conname AS constraint_name,
    local_columns.local_names,
    format('%I.%I', referenced_namespace.nspname, referenced_relation.relname) AS referenced_table,
    referenced_columns.referenced_names,
    CASE c.confupdtype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE c.confupdtype::text
    END AS on_update,
    CASE c.confdeltype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE c.confdeltype::text
    END AS on_delete,
    c.convalidated AS validated,
    pg_catalog.pg_get_constraintdef(c.oid) AS definition
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class local_relation
    ON local_relation.oid = c.conrelid
  JOIN pg_catalog.pg_namespace local_namespace
    ON local_namespace.oid = local_relation.relnamespace
  JOIN pg_catalog.pg_class referenced_relation
    ON referenced_relation.oid = c.confrelid
  JOIN pg_catalog.pg_namespace referenced_namespace
    ON referenced_namespace.oid = referenced_relation.relnamespace
  LEFT JOIN LATERAL (
    SELECT string_agg(a.attname, ', ' ORDER BY key_columns.ordinality) AS local_names
    FROM unnest(c.conkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = key_columns.attnum
     AND NOT a.attisdropped
  ) AS local_columns ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(a.attname, ', ' ORDER BY key_columns.ordinality) AS referenced_names
    FROM unnest(c.confkey) WITH ORDINALITY AS key_columns(attnum, ordinality)
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.confrelid
     AND a.attnum = key_columns.attnum
     AND NOT a.attisdropped
  ) AS referenced_columns ON true
  WHERE c.contype = 'f'
    AND local_namespace.nspname = 'public'
    AND local_relation.relname IN ('minerador_discovery_runs', 'minerador_discovery_candidates')
),
semantic_fks AS (
  SELECT
    a.*,
    CASE
      WHEN a.table_name = 'public.minerador_discovery_runs'
       AND a.local_names = 'brand_id'
       AND a.referenced_table = 'public.marcas'
       AND a.referenced_names = 'id'
        THEN 'discovery_run_brand'
      WHEN a.table_name = 'public.minerador_discovery_runs'
       AND a.local_names = 'actor_user_id'
       AND a.referenced_table = 'auth.users'
       AND a.referenced_names = 'id'
        THEN 'discovery_run_actor'
      WHEN a.table_name = 'public.minerador_discovery_candidates'
       AND a.local_names = 'discovery_run_id'
       AND a.referenced_table = 'public.minerador_discovery_runs'
       AND a.referenced_names = 'id'
        THEN 'discovery_candidate_run'
      WHEN a.table_name = 'public.minerador_discovery_candidates'
       AND a.local_names = 'brand_id'
       AND a.referenced_table = 'public.marcas'
       AND a.referenced_names = 'id'
        THEN 'discovery_candidate_brand'
      WHEN a.table_name = 'public.minerador_discovery_candidates'
       AND a.local_names = 'existing_keyword_id'
       AND a.referenced_names = 'id'
       AND a.referenced_table IN ('public.minerador_keywords', 'public.keywords_kgr')
        THEN 'discovery_candidate_existing_keyword'
      WHEN a.table_name = 'public.minerador_discovery_candidates'
       AND a.local_names = 'imported_keyword_id'
       AND a.referenced_names = 'id'
       AND a.referenced_table IN ('public.minerador_keywords', 'public.keywords_kgr')
        THEN 'discovery_candidate_imported_keyword'
      ELSE 'extra_fk'
    END AS semantic_key
  FROM actual_fks a
),
expected_contracts(contract_key, expected_label, table_name, local_names, referenced_label, is_required) AS (
  VALUES
    ('discovery_run_brand', 'DiscoveryRun -> Brand', 'public.minerador_discovery_runs', 'brand_id', 'public.marcas(id)', true),
    ('discovery_run_actor', 'DiscoveryRun -> actor Auth', 'public.minerador_discovery_runs', 'actor_user_id', 'auth.users(id)', true),
    ('discovery_candidate_run', 'DiscoveryCandidate -> DiscoveryRun', 'public.minerador_discovery_candidates', 'discovery_run_id', 'public.minerador_discovery_runs(id)', true),
    ('discovery_candidate_brand', 'DiscoveryCandidate -> Brand', 'public.minerador_discovery_candidates', 'brand_id', 'public.marcas(id)', true),
    ('discovery_candidate_existing_keyword', 'Candidate.existing_keyword_id -> keyword oficial', 'public.minerador_discovery_candidates', 'existing_keyword_id', 'minerador_keywords(id) ou keywords_kgr(id)', true),
    ('discovery_candidate_imported_keyword', 'Candidate.imported_keyword_id -> keyword oficial', 'public.minerador_discovery_candidates', 'imported_keyword_id', 'minerador_keywords(id) ou keywords_kgr(id)', true)
),
candidate_contract_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'minerador_discovery_candidates'
    AND column_name IN ('existing_keyword_id', 'imported_keyword_id')
),
effective_contracts AS (
  SELECT
    e.*,
    CASE
      WHEN e.local_names IN ('existing_keyword_id', 'imported_keyword_id')
        THEN EXISTS (SELECT 1 FROM candidate_contract_columns c WHERE c.column_name = e.local_names)
      ELSE e.is_required
    END AS required_by_current_schema
  FROM expected_contracts e
),
expected_evidence AS (
  SELECT
    e.*,
    EXISTS (
      SELECT 1
      FROM semantic_fks a
      WHERE a.semantic_key = e.contract_key
        AND a.validated
    ) AS present,
    COALESCE((
      SELECT string_agg(a.constraint_name, ', ' ORDER BY a.constraint_name)
      FROM semantic_fks a
      WHERE a.semantic_key = e.contract_key
    ), 'NONE') AS matched_constraints
  FROM effective_contracts e
),
legacy_verifier_expectations(contract_key, table_name, local_names, referenced_table) AS (
  VALUES
    ('discovery_run_brand', 'public.minerador_discovery_runs', 'brand_id', 'public.marcas'),
    ('discovery_run_actor', 'public.minerador_discovery_runs', 'actor_user_id', 'auth.users'),
    ('discovery_candidate_run', 'public.minerador_discovery_candidates', 'discovery_run_id', 'public.minerador_discovery_runs'),
    ('discovery_candidate_brand', 'public.minerador_discovery_candidates', 'brand_id', 'public.marcas'),
    ('discovery_candidate_existing_keyword', 'public.minerador_discovery_candidates', 'existing_keyword_id', 'public.minerador_keywords'),
    ('discovery_candidate_imported_keyword', 'public.minerador_discovery_candidates', 'imported_keyword_id', 'public.minerador_keywords')
),
legacy_verifier_evidence AS (
  SELECT
    e.contract_key,
    EXISTS (
      SELECT 1
      FROM actual_fks a
      WHERE a.table_name = e.table_name
        AND a.local_names = e.local_names
        AND a.referenced_table = e.referenced_table
        AND a.referenced_names = 'id'
    ) AS matched
  FROM legacy_verifier_expectations e
),
summary AS (
  SELECT
    count(*) FILTER (WHERE e.required_by_current_schema) AS expected_count,
    count(*) FILTER (WHERE e.required_by_current_schema AND e.present) AS matched_count,
    count(*) FILTER (WHERE NOT e.required_by_current_schema) AS not_applicable_count,
    (SELECT count(*) FROM semantic_fks) AS actual_count,
    (SELECT count(*) FROM semantic_fks WHERE semantic_key = 'extra_fk') AS extra_count,
    (SELECT count(*) FROM legacy_verifier_evidence WHERE matched) AS legacy_match_count,
    (SELECT count(*) FROM legacy_verifier_evidence) AS legacy_expected_count,
    COALESCE((
      SELECT string_agg(e.expected_label, '; ' ORDER BY e.contract_key)
      FROM expected_evidence e
      WHERE e.required_by_current_schema AND NOT e.present
    ), 'NONE') AS missing_fks,
    COALESCE((
      SELECT string_agg(format('%s [%s] -> %s', a.constraint_name, a.local_names, a.referenced_table), '; ' ORDER BY a.constraint_name)
      FROM semantic_fks a
      WHERE a.semantic_key = 'extra_fk'
    ), 'NONE') AS extra_fks,
    COALESCE((SELECT relation_name FROM (VALUES
      ('public.minerador_keywords'::text, to_regclass('public.minerador_keywords') IS NOT NULL),
      ('public.keywords_kgr'::text, to_regclass('public.keywords_kgr') IS NOT NULL)
    ) AS keyword_relations(relation_name, present) WHERE present ORDER BY relation_name LIMIT 1), 'NONE') AS keyword_relation
  FROM expected_evidence e
),
-- All UNION ALL branches below must keep this exact 14-column shape.
result_rows(sort_order, row_type, contract_key, table_name, constraint_name, local_columns, referenced_table, referenced_columns, on_update, on_delete, validated, definition, status, notes) AS (
  SELECT
    0::integer,
    'SUMMARY'::text,
    'classification'::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::boolean,
    NULL::text,
    (CASE WHEN s.expected_count = s.matched_count THEN 'PASS' ELSE 'MISSING_REQUIRED_RELATIONS' END)::text,
    format(
      'FK_SCHEMA_STATE=%s; EXPECTED_FKS_BY_CURRENT_CONTRACT=%s; SEMANTIC_MATCHES=%s; ACTUAL_FKS=%s; MISSING_FKS=%s; EXTRA_FKS=%s; VERIFIER_BUG=%s; SCHEMA_FIX_REQUIRED=%s; legacy_verifier_matches=%s/%s; optional_contract_columns_not_present=%s; official_keyword_relation=%s; lista_origem_fk=none_expected_on_discovery_tables',
      CASE WHEN s.expected_count = s.matched_count THEN 'PASS' ELSE 'MISSING_REQUIRED_RELATIONS' END,
      s.expected_count,
      s.matched_count,
      s.actual_count,
      s.missing_fks,
      s.extra_fks,
      CASE WHEN s.expected_count = s.matched_count AND s.legacy_match_count < s.legacy_expected_count THEN 'YES' ELSE 'NO' END,
      CASE WHEN s.expected_count = s.matched_count THEN 'NO' ELSE 'YES' END,
      s.legacy_match_count,
      s.legacy_expected_count,
      s.not_applicable_count,
      s.keyword_relation
    )::text
  FROM summary s

  UNION ALL
  SELECT
    1::integer,
    'EXPECTED_FK'::text,
    e.contract_key::text,
    e.table_name::text,
    e.matched_constraints::text,
    e.local_names::text,
    e.referenced_label::text,
    'id'::text,
    NULL::text,
    NULL::text,
    NULL::boolean,
    NULL::text,
    (CASE WHEN NOT e.required_by_current_schema THEN 'NOT_APPLICABLE' WHEN e.present THEN 'PASS' ELSE 'MISSING' END)::text,
    format('expected=%s; required_by_current_schema=%s; matched_constraints=%s', e.expected_label, e.required_by_current_schema, e.matched_constraints)::text
  FROM expected_evidence e

  UNION ALL
  SELECT
    2::integer,
    'ACTUAL_FK'::text,
    a.semantic_key::text,
    a.table_name::text,
    a.constraint_name::text,
    a.local_names::text,
    a.referenced_table::text,
    a.referenced_names::text,
    a.on_update::text,
    a.on_delete::text,
    a.validated::boolean,
    a.definition::text,
    'OBSERVED'::text,
    (CASE WHEN a.semantic_key = 'extra_fk' THEN 'Nao associado a uma relacao esperada; revisar somente se o contrato atual o considerar indevido.' ELSE 'Relacao reconhecida semanticamente.' END)::text
  FROM semantic_fks a
)
SELECT
  row_type,
  contract_key,
  table_name,
  constraint_name,
  local_columns,
  referenced_table,
  referenced_columns,
  on_update,
  on_delete,
  validated,
  definition,
  status,
  notes
FROM result_rows
ORDER BY sort_order, contract_key, constraint_name;
