-- PIPELINE PERSISTENCE CATALOG DIAGNOSTIC
-- script_version: 2026-08-11-pipeline-catalog-v1
-- READ-ONLY: somente CTEs, pg_catalog e information_schema-equivalente via pg_catalog.
-- Nao retorna payload editorial, conteudo de documentos, e-mails ou segredos.
-- As contagens por Brand ficam em pipeline-persistence-brand-counts-read-only.sql
-- porque uma consulta catalog-only nao pode referenciar condicionalmente uma
-- relacao que pode estar ausente.
-- Executar no SQL Editor como uma unica consulta.

WITH
target_tables(table_name, expected_role) AS (
  VALUES
    ('editorial_artifact_versions', 'DNA/versioned artifacts and ContentPlans'),
    ('content_document_user_states', 'per-user document state'),
    ('editorial_saved_views', 'per-user saved views'),
    ('minerador_keywords', 'Minerador / KeywordDNA source'),
    ('minerador_keyword_lists', 'Minerador list source'),
    ('editorial_workflow_items', 'pipeline workflow handoff'),
    ('editorial_serp_snapshots', 'Radar / SerpSnapshot'),
    ('editorial_serp_reviews', 'Radar review'),
    ('content_documents', 'Redator / ContentDocument'),
    ('content_document_versions', 'Redator document versions'),
    ('publication_records', 'Publicacoes / PublicationRecord')
),
target_columns(table_name, column_name) AS (
  VALUES
    ('editorial_artifact_versions','version_id'),
    ('editorial_artifact_versions','entity_id'),
    ('editorial_artifact_versions','marca_id'),
    ('editorial_artifact_versions','artifact_type'),
    ('editorial_artifact_versions','version_number'),
    ('editorial_artifact_versions','previous_version_id'),
    ('editorial_artifact_versions','content_hash'),
    ('editorial_artifact_versions','origin'),
    ('editorial_artifact_versions','change_reason'),
    ('editorial_artifact_versions','payload'),
    ('editorial_artifact_versions','created_by'),
    ('editorial_artifact_versions','created_at'),
    ('content_document_user_states','document_id'),
    ('content_document_user_states','user_key'),
    ('content_document_user_states','user_id'),
    ('content_document_user_states','cursor_position'),
    ('content_document_user_states','scroll_top'),
    ('content_document_user_states','left_panel_open'),
    ('content_document_user_states','right_panel_open'),
    ('content_document_user_states','last_opened_at'),
    ('content_document_user_states','updated_at'),
    ('editorial_saved_views','id'),
    ('editorial_saved_views','marca_id'),
    ('editorial_saved_views','user_key'),
    ('editorial_saved_views','user_id'),
    ('editorial_saved_views','module'),
    ('editorial_saved_views','name'),
    ('editorial_saved_views','settings'),
    ('editorial_saved_views','is_default'),
    ('editorial_saved_views','created_at'),
    ('editorial_saved_views','updated_at'),
    ('minerador_keywords','id'),
    ('minerador_keywords','brand_id'),
    ('minerador_keywords','keyword'),
    ('minerador_keywords','lista_id'),
    ('minerador_keywords','analise_semantica'),
    ('minerador_keywords','status'),
    ('minerador_keyword_lists','id'),
    ('minerador_keyword_lists','marca_id'),
    ('editorial_workflow_items','id'),
    ('editorial_workflow_items','marca_id'),
    ('editorial_workflow_items','article_id'),
    ('editorial_workflow_items','stage'),
    ('editorial_workflow_items','state'),
    ('editorial_workflow_items','source_entity_id'),
    ('editorial_workflow_items','source_version_id'),
    ('editorial_workflow_items','source_content_hash'),
    ('editorial_workflow_items','payload'),
    ('editorial_workflow_items','lock_version'),
    ('editorial_workflow_items','created_by'),
    ('editorial_workflow_items','updated_by'),
    ('editorial_workflow_items','created_at'),
    ('editorial_workflow_items','updated_at'),
    ('editorial_serp_snapshots','id'),
    ('editorial_serp_snapshots','marca_id'),
    ('editorial_serp_snapshots','article_id'),
    ('editorial_serp_snapshots','version_number'),
    ('editorial_serp_snapshots','previous_snapshot_id'),
    ('editorial_serp_snapshots','content_hash'),
    ('editorial_serp_snapshots','status'),
    ('editorial_serp_snapshots','payload'),
    ('editorial_serp_snapshots','created_by'),
    ('editorial_serp_snapshots','created_at'),
    ('editorial_serp_reviews','id'),
    ('editorial_serp_reviews','marca_id'),
    ('editorial_serp_reviews','article_id'),
    ('editorial_serp_reviews','snapshot_id'),
    ('editorial_serp_reviews','status'),
    ('editorial_serp_reviews','reviewed_by'),
    ('editorial_serp_reviews','reviewed_at'),
    ('editorial_serp_reviews','payload'),
    ('content_documents','id'),
    ('content_documents','marca_id'),
    ('content_documents','article_id'),
    ('content_documents','content_plan_version_id'),
    ('content_documents','article_dna_version_id'),
    ('content_documents','status'),
    ('content_documents','content_hash'),
    ('content_documents','lock_version'),
    ('content_documents','created_by'),
    ('content_documents','updated_by'),
    ('content_documents','created_at'),
    ('content_documents','updated_at'),
    ('content_document_versions','version_id'),
    ('content_document_versions','document_id'),
    ('content_document_versions','version_number'),
    ('content_document_versions','previous_version_id'),
    ('content_document_versions','content_hash'),
    ('content_document_versions','change_reason'),
    ('content_document_versions','created_by'),
    ('content_document_versions','created_at'),
    ('publication_records','id'),
    ('publication_records','marca_id'),
    ('publication_records','article_id'),
    ('publication_records','content_plan_version_id'),
    ('publication_records','document_id'),
    ('publication_records','status'),
    ('publication_records','payload'),
    ('publication_records','lock_version'),
    ('publication_records','created_by'),
    ('publication_records','updated_by'),
    ('publication_records','created_at'),
    ('publication_records','updated_at')
),
relations AS (
  SELECT c.oid,
    c.relname,
    c.relowner,
    c.relkind,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relacl
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r','p','v','m','f')
),
columns AS (
  SELECT a.attrelid AS relation_oid,
    a.attname,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull,
    a.attnum
  FROM pg_catalog.pg_attribute a
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
constraints AS (
  SELECT conrelid AS relation_oid,
    conname,
    contype,
    pg_catalog.pg_get_constraintdef(oid, true) AS definition
  FROM pg_catalog.pg_constraint
),
indexes AS (
  SELECT i.indrelid AS relation_oid,
    i.indexrelid,
    i.indisunique,
    pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
  FROM pg_catalog.pg_index i
),
policies AS (
  SELECT schemaname, tablename,
    string_agg(
      policyname || ':cmd=' || cmd || ':roles=' || array_to_string(roles, ','),
      ' | ' ORDER BY policyname
    ) AS details
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
  GROUP BY schemaname, tablename
),
triggers AS (
  SELECT t.tgrelid AS relation_oid,
    string_agg(t.tgname || ':' || pg_catalog.pg_get_triggerdef(t.oid, true), ' | ' ORDER BY t.tgname) AS details
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal
  GROUP BY t.tgrelid
),
dependent_functions AS (
  SELECT d.refobjid AS relation_oid,
    string_agg(DISTINCT p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')', ' | ' ORDER BY p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')') AS details
  FROM pg_catalog.pg_depend d
  JOIN pg_catalog.pg_proc p ON p.oid = d.objid
  JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
  WHERE d.refclassid = 'pg_catalog.pg_class'::regclass
    AND pn.nspname = 'public'
    AND d.deptype IN ('n','a')
  GROUP BY d.refobjid
),
acl_details AS (
  SELECT r.oid,
    string_agg(
      CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END
      || ':' || x.privilege_type
      || CASE WHEN x.is_grantable THEN ':grantable' ELSE '' END,
      ', ' ORDER BY x.grantee, x.privilege_type
    ) AS details
  FROM relations r
  LEFT JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(r.relacl, pg_catalog.acldefault('r', r.relowner))
  ) x ON true
  GROUP BY r.oid
),
column_requirements AS (
  SELECT tt.table_name,
    string_agg(tc.column_name, ', ' ORDER BY tc.column_name) AS expected,
    string_agg(tc.column_name, ', ' ORDER BY tc.column_name)
      FILTER (WHERE c.attname IS NULL) AS missing,
    count(*) FILTER (WHERE c.attname IS NULL)::integer AS missing_count
  FROM (SELECT DISTINCT table_name FROM target_columns) tt
  JOIN target_columns tc ON tc.table_name = tt.table_name
  LEFT JOIN relations r ON r.relname = tt.table_name
  LEFT JOIN columns c ON c.relation_oid = r.oid AND c.attname = tc.column_name
  GROUP BY tt.table_name
),
artifact_definition AS (
  SELECT r.oid,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS artifact_type_type,
    string_agg(DISTINCT e.enumlabel, ', ' ORDER BY e.enumlabel) FILTER (WHERE e.enumlabel IS NOT NULL) AS enum_values,
    string_agg(DISTINCT co.definition, ' | ' ORDER BY co.definition) FILTER (WHERE co.contype = 'c') AS check_definitions
  FROM relations r
  LEFT JOIN columns c ON c.relation_oid = r.oid AND c.attname = 'artifact_type'
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid AND a.attname = 'artifact_type' AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_enum e ON e.enumtypid = a.atttypid
  LEFT JOIN constraints co ON co.relation_oid = r.oid
  WHERE r.relname = 'editorial_artifact_versions'
  GROUP BY r.oid, a.atttypid, a.atttypmod
),
identity_shape AS (
  SELECT tt.table_name,
    bool_or(c.attname = 'user_key') AS has_user_key,
    bool_or(c.attname = 'user_id') AS has_user_id
  FROM (VALUES ('content_document_user_states'), ('editorial_saved_views')) tt(table_name)
  LEFT JOIN relations r ON r.relname = tt.table_name
  LEFT JOIN columns c ON c.relation_oid = r.oid AND c.attname IN ('user_key','user_id')
  GROUP BY tt.table_name
),
silo_page_candidates AS (
  SELECT string_agg(relname, ', ' ORDER BY relname) AS details
  FROM relations
  WHERE relname ILIKE '%silo%page%'
),
checks AS (
  SELECT 'table:' || tt.table_name AS check_name,
    'public relation must exist' AS expected,
    CASE WHEN r.oid IS NULL THEN 'MISSING' ELSE 'present' END AS observed,
    CASE WHEN r.oid IS NULL THEN 'FAIL' ELSE 'PASS' END AS verdict
  FROM target_tables tt
  LEFT JOIN relations r ON r.relname = tt.table_name

  UNION ALL

  SELECT 'columns:' || cr.table_name,
    cr.expected,
    CASE WHEN r.oid IS NULL THEN 'table missing' ELSE COALESCE(cr.missing, 'all required columns present') END,
    CASE WHEN r.oid IS NULL OR cr.missing_count > 0 THEN 'FAIL' ELSE 'PASS' END
  FROM column_requirements cr
  LEFT JOIN relations r ON r.relname = cr.table_name

  UNION ALL

  SELECT 'identity-shape:' || i.table_name,
    'catalog observation: compare legacy user_key with canonical user_id',
    'user_key=' || CASE WHEN COALESCE(i.has_user_key, false) THEN 'present' ELSE 'absent' END
      || '; user_id=' || CASE WHEN COALESCE(i.has_user_id, false) THEN 'present' ELSE 'absent' END,
    'INFO'
  FROM identity_shape i

  UNION ALL

  SELECT 'artifact-type-contract',
    'article_dna, silo_dna, silo_page, content_plan',
    CASE WHEN a.oid IS NULL THEN 'table missing'
      ELSE 'type=' || COALESCE(a.artifact_type_type, 'unknown')
        || '; enum=' || COALESCE(a.enum_values, '(none)')
        || '; checks=' || COALESCE(a.check_definitions, '(none)') END,
    CASE WHEN a.oid IS NULL THEN 'FAIL'
      WHEN lower(COALESCE(a.enum_values, '') || ' ' || COALESCE(a.check_definitions, '')) LIKE '%article_dna%'
       AND lower(COALESCE(a.enum_values, '') || ' ' || COALESCE(a.check_definitions, '')) LIKE '%silo_dna%'
       AND lower(COALESCE(a.enum_values, '') || ' ' || COALESCE(a.check_definitions, '')) LIKE '%silo_page%'
       AND lower(COALESCE(a.enum_values, '') || ' ' || COALESCE(a.check_definitions, '')) LIKE '%content_plan%'
        THEN 'PASS'
      ELSE 'FAIL' END
  FROM (SELECT * FROM artifact_definition UNION ALL SELECT NULL::oid, NULL::text, NULL::text, NULL::text WHERE NOT EXISTS (SELECT 1 FROM artifact_definition)) a

  UNION ALL

  SELECT 'silo-page-relation-candidates',
    'explicit SiloPage relation or artifact support must be confirmed',
    COALESCE(s.details, '(none observed in public catalog)'),
    'INFO'
  FROM silo_page_candidates s

  UNION ALL

  SELECT 'metadata:' || tt.table_name || ':owner-rls',
    'owner, relation kind and RLS metadata',
    CASE WHEN r.oid IS NULL THEN 'table missing'
      ELSE 'owner=' || pg_catalog.pg_get_userbyid(r.relowner)
        || '; kind=' || CASE r.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned_table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' WHEN 'f' THEN 'foreign_table' ELSE r.relkind::text END
        || '; rls=' || r.relrowsecurity::text
        || '; force_rls=' || r.relforcerowsecurity::text END,
    'INFO'
  FROM target_tables tt
  LEFT JOIN relations r ON r.relname = tt.table_name

  UNION ALL

  SELECT 'metadata:' || tt.table_name || ':constraints-fks',
    'constraints and foreign keys from pg_constraint',
    CASE WHEN r.oid IS NULL THEN 'table missing' ELSE COALESCE(string_agg(CASE co.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUDE' ELSE co.contype::text END || ':' || co.conname || ':' || co.definition, ' | ' ORDER BY co.conname), '(none observed)') END,
    'INFO'
  FROM target_tables tt
  LEFT JOIN relations r ON r.relname = tt.table_name
  LEFT JOIN constraints co ON co.relation_oid = r.oid
  GROUP BY tt.table_name, r.oid

  UNION ALL

  SELECT 'metadata:' || tt.table_name || ':indexes',
    'indexes and uniqueness from pg_index',
    CASE WHEN r.oid IS NULL THEN 'table missing' ELSE COALESCE(string_agg((CASE WHEN i.indisunique THEN 'UNIQUE:' ELSE 'INDEX:' END) || i.definition, ' | ' ORDER BY i.definition), '(none observed)') END,
    'INFO'
  FROM target_tables tt
  LEFT JOIN relations r ON r.relname = tt.table_name
  LEFT JOIN indexes i ON i.relation_oid = r.oid
  GROUP BY tt.table_name, r.oid

  UNION ALL

  SELECT 'metadata:' || tt.table_name || ':policies',
    'policies from pg_policies',
    CASE WHEN r.oid IS NULL THEN 'table missing' ELSE COALESCE(p.details, '(none observed)') END,
    'INFO'
  FROM target_tables tt
  LEFT JOIN relations r ON r.relname = tt.table_name
  LEFT JOIN policies p ON p.tablename = tt.table_name

  UNION ALL

  SELECT 'metadata:' || tt.table_name || ':acl',
    'ACL expanded from relacl/default ACL',
    CASE WHEN r.oid IS NULL THEN 'table missing' ELSE COALESCE(a.details, '(none observed)') END,
    'INFO'
  FROM target_tables tt
  LEFT JOIN relations r ON r.relname = tt.table_name
  LEFT JOIN acl_details a ON a.oid = r.oid

  UNION ALL

  SELECT 'metadata:' || tt.table_name || ':triggers-functions',
    'non-internal triggers and catalog-visible dependent public functions',
    CASE WHEN r.oid IS NULL THEN 'table missing'
      ELSE 'triggers=' || COALESCE(t.details, '(none observed)')
        || '; functions=' || COALESCE(f.details, '(none observed)') END,
    'INFO'
  FROM target_tables tt
  LEFT JOIN relations r ON r.relname = tt.table_name
  LEFT JOIN triggers t ON t.relation_oid = r.oid
  LEFT JOIN dependent_functions f ON f.relation_oid = r.oid
)
SELECT '2026-08-11-pipeline-catalog-v1' AS script_version,
  check_name,
  expected,
  observed,
  verdict
FROM checks
ORDER BY CASE WHEN check_name LIKE 'table:%' THEN 1 WHEN check_name LIKE 'columns:%' THEN 2 WHEN check_name = 'artifact-type-contract' THEN 3 ELSE 4 END, check_name;
