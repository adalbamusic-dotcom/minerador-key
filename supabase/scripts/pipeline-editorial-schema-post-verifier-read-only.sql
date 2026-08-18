-- PIPELINE EDITORIAL SCHEMA POST-VERIFIER
-- Version: 2026-08-11-pipeline-editorial-schema-post-verifier-v2
-- Read-only: catalog metadata and sanitized table statistics only.

WITH
target_tables(table_name) AS (
  VALUES
    ('editorial_artifact_versions'::text),
    ('editorial_workflow_items'::text),
    ('editorial_serp_snapshots'::text),
    ('editorial_serp_reviews'::text),
    ('content_documents'::text),
    ('content_document_versions'::text),
    ('content_document_user_states'::text),
    ('editorial_saved_views'::text),
    ('publication_records'::text)
),
expected_columns(table_name, column_name, expected_type) AS (
  VALUES
    ('editorial_artifact_versions', 'version_id', 'text'),
    ('editorial_artifact_versions', 'entity_id', 'text'),
    ('editorial_artifact_versions', 'marca_id', 'uuid'),
    ('editorial_artifact_versions', 'artifact_type', 'text'),
    ('editorial_artifact_versions', 'version_number', 'integer'),
    ('editorial_artifact_versions', 'previous_version_id', 'text'),
    ('editorial_artifact_versions', 'source_version_id', 'text'),
    ('editorial_artifact_versions', 'status', 'text'),
    ('editorial_artifact_versions', 'content_hash', 'text'),
    ('editorial_artifact_versions', 'payload', 'jsonb'),
    ('editorial_artifact_versions', 'origin', 'text'),
    ('editorial_artifact_versions', 'change_reason', 'text'),
    ('editorial_artifact_versions', 'created_by', 'uuid'),
    ('editorial_artifact_versions', 'created_at', 'timestamp with time zone'),

    ('editorial_workflow_items', 'id', 'uuid'),
    ('editorial_workflow_items', 'marca_id', 'uuid'),
    ('editorial_workflow_items', 'subject_type', 'text'),
    ('editorial_workflow_items', 'subject_id', 'text'),
    ('editorial_workflow_items', 'article_id', 'text'),
    ('editorial_workflow_items', 'stage', 'text'),
    ('editorial_workflow_items', 'state', 'text'),
    ('editorial_workflow_items', 'source_entity_id', 'text'),
    ('editorial_workflow_items', 'source_version_id', 'text'),
    ('editorial_workflow_items', 'source_content_hash', 'text'),
    ('editorial_workflow_items', 'payload', 'jsonb'),
    ('editorial_workflow_items', 'lock_version', 'integer'),
    ('editorial_workflow_items', 'created_by', 'uuid'),
    ('editorial_workflow_items', 'updated_by', 'uuid'),
    ('editorial_workflow_items', 'created_at', 'timestamp with time zone'),
    ('editorial_workflow_items', 'updated_at', 'timestamp with time zone'),

    ('editorial_serp_snapshots', 'id', 'uuid'),
    ('editorial_serp_snapshots', 'marca_id', 'uuid'),
    ('editorial_serp_snapshots', 'article_id', 'text'),
    ('editorial_serp_snapshots', 'source_version_id', 'text'),
    ('editorial_serp_snapshots', 'snapshot_version', 'integer'),
    ('editorial_serp_snapshots', 'previous_snapshot_id', 'uuid'),
    ('editorial_serp_snapshots', 'content_hash', 'text'),
    ('editorial_serp_snapshots', 'status', 'text'),
    ('editorial_serp_snapshots', 'payload', 'jsonb'),
    ('editorial_serp_snapshots', 'created_by', 'uuid'),
    ('editorial_serp_snapshots', 'created_at', 'timestamp with time zone'),

    ('editorial_serp_reviews', 'id', 'uuid'),
    ('editorial_serp_reviews', 'marca_id', 'uuid'),
    ('editorial_serp_reviews', 'article_id', 'text'),
    ('editorial_serp_reviews', 'snapshot_id', 'uuid'),
    ('editorial_serp_reviews', 'source_version_id', 'text'),
    ('editorial_serp_reviews', 'status', 'text'),
    ('editorial_serp_reviews', 'reviewed_by', 'uuid'),
    ('editorial_serp_reviews', 'payload', 'jsonb'),
    ('editorial_serp_reviews', 'created_at', 'timestamp with time zone'),

    ('content_documents', 'id', 'text'),
    ('content_documents', 'marca_id', 'uuid'),
    ('content_documents', 'article_id', 'text'),
    ('content_documents', 'article_dna_version_id', 'text'),
    ('content_documents', 'content_plan_version_id', 'text'),
    ('content_documents', 'current_version_id', 'text'),
    ('content_documents', 'status', 'text'),
    ('content_documents', 'title', 'text'),
    ('content_documents', 'slug', 'text'),
    ('content_documents', 'content_hash', 'text'),
    ('content_documents', 'payload', 'jsonb'),
    ('content_documents', 'lock_version', 'integer'),
    ('content_documents', 'created_by', 'uuid'),
    ('content_documents', 'updated_by', 'uuid'),
    ('content_documents', 'created_at', 'timestamp with time zone'),
    ('content_documents', 'updated_at', 'timestamp with time zone'),

    ('content_document_versions', 'version_id', 'text'),
    ('content_document_versions', 'document_id', 'text'),
    ('content_document_versions', 'version_number', 'integer'),
    ('content_document_versions', 'previous_version_id', 'text'),
    ('content_document_versions', 'content_hash', 'text'),
    ('content_document_versions', 'payload', 'jsonb'),
    ('content_document_versions', 'change_reason', 'text'),
    ('content_document_versions', 'created_by', 'uuid'),
    ('content_document_versions', 'created_at', 'timestamp with time zone'),

    ('content_document_user_states', 'document_id', 'text'),
    ('content_document_user_states', 'user_id', 'uuid'),
    ('content_document_user_states', 'cursor_position', 'integer'),
    ('content_document_user_states', 'scroll_top', 'integer'),
    ('content_document_user_states', 'left_panel_open', 'boolean'),
    ('content_document_user_states', 'right_panel_open', 'boolean'),
    ('content_document_user_states', 'last_opened_at', 'timestamp with time zone'),
    ('content_document_user_states', 'updated_at', 'timestamp with time zone'),

    ('editorial_saved_views', 'id', 'uuid'),
    ('editorial_saved_views', 'marca_id', 'uuid'),
    ('editorial_saved_views', 'user_id', 'uuid'),
    ('editorial_saved_views', 'module', 'text'),
    ('editorial_saved_views', 'name', 'text'),
    ('editorial_saved_views', 'settings', 'jsonb'),
    ('editorial_saved_views', 'is_default', 'boolean'),
    ('editorial_saved_views', 'created_at', 'timestamp with time zone'),
    ('editorial_saved_views', 'updated_at', 'timestamp with time zone'),

    ('publication_records', 'id', 'uuid'),
    ('publication_records', 'marca_id', 'uuid'),
    ('publication_records', 'article_id', 'text'),
    ('publication_records', 'content_plan_version_id', 'text'),
    ('publication_records', 'document_id', 'text'),
    ('publication_records', 'status', 'text'),
    ('publication_records', 'published_url', 'text'),
    ('publication_records', 'slug', 'text'),
    ('publication_records', 'canonical', 'text'),
    ('publication_records', 'content_hash', 'text'),
    ('publication_records', 'payload', 'jsonb'),
    ('publication_records', 'lock_version', 'integer'),
    ('publication_records', 'created_by', 'uuid'),
    ('publication_records', 'updated_by', 'uuid'),
    ('publication_records', 'created_at', 'timestamp with time zone'),
    ('publication_records', 'updated_at', 'timestamp with time zone')
),
expected_foreign_keys(table_name, constraint_name, target_relation) AS (
  VALUES
    ('editorial_artifact_versions', 'editorial_artifact_versions_marca_id_fkey', 'public.marcas'),
    ('editorial_artifact_versions', 'editorial_artifact_versions_previous_version_id_fkey', 'public.editorial_artifact_versions'),
    ('editorial_artifact_versions', 'editorial_artifact_versions_source_version_id_fkey', 'public.editorial_artifact_versions'),
    ('editorial_artifact_versions', 'editorial_artifact_versions_created_by_fkey', 'auth.users'),
    ('editorial_workflow_items', 'editorial_workflow_items_marca_id_fkey', 'public.marcas'),
    ('editorial_workflow_items', 'editorial_workflow_items_source_version_id_fkey', 'public.editorial_artifact_versions'),
    ('editorial_workflow_items', 'editorial_workflow_items_created_by_fkey', 'auth.users'),
    ('editorial_workflow_items', 'editorial_workflow_items_updated_by_fkey', 'auth.users'),
    ('editorial_serp_snapshots', 'editorial_serp_snapshots_marca_id_fkey', 'public.marcas'),
    ('editorial_serp_snapshots', 'editorial_serp_snapshots_source_version_id_fkey', 'public.editorial_artifact_versions'),
    ('editorial_serp_snapshots', 'editorial_serp_snapshots_previous_snapshot_id_fkey', 'public.editorial_serp_snapshots'),
    ('editorial_serp_snapshots', 'editorial_serp_snapshots_created_by_fkey', 'auth.users'),
    ('editorial_serp_reviews', 'editorial_serp_reviews_marca_id_fkey', 'public.marcas'),
    ('editorial_serp_reviews', 'editorial_serp_reviews_snapshot_id_fkey', 'public.editorial_serp_snapshots'),
    ('editorial_serp_reviews', 'editorial_serp_reviews_source_version_id_fkey', 'public.editorial_artifact_versions'),
    ('editorial_serp_reviews', 'editorial_serp_reviews_reviewed_by_fkey', 'auth.users'),
    ('content_documents', 'content_documents_marca_id_fkey', 'public.marcas'),
    ('content_documents', 'content_documents_article_dna_version_id_fkey', 'public.editorial_artifact_versions'),
    ('content_documents', 'content_documents_content_plan_version_id_fkey', 'public.editorial_artifact_versions'),
    ('content_documents', 'content_documents_current_version_fk', 'public.content_document_versions'),
    ('content_documents', 'content_documents_created_by_fkey', 'auth.users'),
    ('content_documents', 'content_documents_updated_by_fkey', 'auth.users'),
    ('content_document_versions', 'content_document_versions_document_id_fkey', 'public.content_documents'),
    ('content_document_versions', 'content_document_versions_previous_version_id_fkey', 'public.content_document_versions'),
    ('content_document_versions', 'content_document_versions_created_by_fkey', 'auth.users'),
    ('content_document_user_states', 'content_document_user_states_document_id_fkey', 'public.content_documents'),
    ('content_document_user_states', 'content_document_user_states_user_id_fkey', 'auth.users'),
    ('editorial_saved_views', 'editorial_saved_views_marca_id_fkey', 'public.marcas'),
    ('editorial_saved_views', 'editorial_saved_views_user_id_fkey', 'auth.users'),
    ('publication_records', 'publication_records_marca_id_fkey', 'public.marcas'),
    ('publication_records', 'publication_records_content_plan_version_id_fkey', 'public.editorial_artifact_versions'),
    ('publication_records', 'publication_records_document_id_fkey', 'public.content_documents'),
    ('publication_records', 'publication_records_created_by_fkey', 'auth.users'),
    ('publication_records', 'publication_records_updated_by_fkey', 'auth.users')
),
expected_indexes(index_name, table_name) AS (
  VALUES
    ('editorial_artifact_versions_pkey', 'editorial_artifact_versions'),
    ('editorial_artifact_versions_identity_unique', 'editorial_artifact_versions'),
    ('editorial_artifact_versions_brand_lookup_idx', 'editorial_artifact_versions'),
    ('editorial_workflow_items_pkey', 'editorial_workflow_items'),
    ('editorial_workflow_items_subject_stage_unique', 'editorial_workflow_items'),
    ('editorial_workflow_items_brand_stage_idx', 'editorial_workflow_items'),
    ('editorial_serp_snapshots_pkey', 'editorial_serp_snapshots'),
    ('editorial_serp_snapshots_identity_unique', 'editorial_serp_snapshots'),
    ('editorial_serp_snapshots_article_idx', 'editorial_serp_snapshots'),
    ('editorial_serp_reviews_pkey', 'editorial_serp_reviews'),
    ('editorial_serp_reviews_snapshot_idx', 'editorial_serp_reviews'),
    ('content_documents_pkey', 'content_documents'),
    ('content_documents_brand_article_unique', 'content_documents'),
    ('content_documents_brand_status_idx', 'content_documents'),
    ('content_document_versions_pkey', 'content_document_versions'),
    ('content_document_versions_identity_unique', 'content_document_versions'),
    ('content_document_versions_document_idx', 'content_document_versions'),
    ('content_document_user_states_pkey', 'content_document_user_states'),
    ('editorial_saved_views_pkey', 'editorial_saved_views'),
    ('editorial_saved_views_name_unique', 'editorial_saved_views'),
    ('editorial_saved_views_one_default_idx', 'editorial_saved_views'),
    ('editorial_saved_views_brand_module_idx', 'editorial_saved_views'),
    ('publication_records_pkey', 'publication_records'),
    ('publication_records_brand_article_unique', 'publication_records'),
    ('publication_records_brand_status_idx', 'publication_records'),
    ('publication_records_document_idx', 'publication_records')
),
expected_policies(policy_name, table_name) AS (
  VALUES
    ('editorial_artifact_versions_select_policy', 'editorial_artifact_versions'),
    ('editorial_workflow_items_select_policy', 'editorial_workflow_items'),
    ('editorial_serp_snapshots_select_policy', 'editorial_serp_snapshots'),
    ('editorial_serp_reviews_select_policy', 'editorial_serp_reviews'),
    ('content_documents_select_policy', 'content_documents'),
    ('content_document_versions_select_policy', 'content_document_versions'),
    ('content_document_user_states_select_policy', 'content_document_user_states'),
    ('editorial_saved_views_select_policy', 'editorial_saved_views'),
    ('publication_records_select_policy', 'publication_records')
),
expected_acl(table_name, role_name, privilege_list) AS (
  VALUES
    ('editorial_artifact_versions', 'authenticated', 'SELECT'),
    ('editorial_artifact_versions', 'service_role', 'SELECT,INSERT'),
    ('editorial_workflow_items', 'authenticated', 'SELECT'),
    ('editorial_workflow_items', 'service_role', 'SELECT,INSERT,UPDATE'),
    ('editorial_serp_snapshots', 'authenticated', 'SELECT'),
    ('editorial_serp_snapshots', 'service_role', 'SELECT,INSERT'),
    ('editorial_serp_reviews', 'authenticated', 'SELECT'),
    ('editorial_serp_reviews', 'service_role', 'SELECT,INSERT'),
    ('content_documents', 'authenticated', 'SELECT'),
    ('content_documents', 'service_role', 'SELECT,INSERT,UPDATE'),
    ('content_document_versions', 'authenticated', 'SELECT'),
    ('content_document_versions', 'service_role', 'SELECT,INSERT'),
    ('content_document_user_states', 'authenticated', 'SELECT'),
    ('content_document_user_states', 'service_role', 'SELECT,INSERT,UPDATE'),
    ('editorial_saved_views', 'authenticated', 'SELECT'),
    ('editorial_saved_views', 'service_role', 'SELECT,INSERT,UPDATE'),
    ('publication_records', 'authenticated', 'SELECT'),
    ('publication_records', 'service_role', 'SELECT,INSERT,UPDATE')
),
expected_functions(function_name) AS (
  VALUES
    ('pipeline_editorial_protect_append_only'::text),
    ('pipeline_editorial_touch_updated_at'::text),
    ('pipeline_editorial_touch_lock_version'::text),
    ('pipeline_editorial_validate_artifact_source'::text)
),
table_presence AS (
  SELECT t.table_name,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t.table_name AND c.relkind IN ('r', 'p')
    ) AS present
  FROM target_tables t
),
column_state AS (
  SELECT e.table_name,
    count(*)::integer AS expected_count,
    count(a.attname)::integer AS present_count,
    count(*) FILTER (
      WHERE a.attname IS NOT NULL AND format_type(a.atttypid, a.atttypmod) <> e.expected_type
    )::integer AS type_mismatch_count
  FROM expected_columns e
  LEFT JOIN pg_class c ON c.relname = e.table_name
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = e.column_name AND a.attnum > 0 AND NOT a.attisdropped
  GROUP BY e.table_name
),
special_columns AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'content_document_user_states' AND a.attname = 'user_id'
        AND format_type(a.atttypid, a.atttypmod) = 'uuid' AND a.attnum > 0 AND NOT a.attisdropped
    ) AS user_id_uuid_present,
    NOT EXISTS (
      SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (SELECT table_name FROM target_tables) AND a.attname = 'user_key'
        AND a.attnum > 0 AND NOT a.attisdropped
    ) AS user_key_absent,
    EXISTS (
      SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'editorial_artifact_versions' AND a.attname = 'artifact_type'
        AND a.attnum > 0 AND NOT a.attisdropped
    ) AS artifact_type_present
),
fk_state AS (
  SELECT e.table_name, e.constraint_name, e.target_relation,
    c.oid IS NOT NULL AS present,
    COALESCE(c.confdeltype, '?') = 'r' AS restrict_delete,
    COALESCE(ns.nspname || '.' || target.relname, 'missing') AS observed_target
  FROM expected_foreign_keys e
  LEFT JOIN pg_class rel ON rel.relname = e.table_name
    AND rel.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LEFT JOIN pg_constraint c ON c.conrelid = rel.oid AND c.conname = e.constraint_name AND c.contype = 'f'
  LEFT JOIN pg_class target ON target.oid = c.confrelid
  LEFT JOIN pg_namespace ns ON ns.oid = target.relnamespace
),
cascade_state AS (
  SELECT count(*)::integer AS cascade_count
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname IN (SELECT table_name FROM target_tables)
    AND c.contype = 'f'
    AND c.confdeltype <> 'r'
),
index_state AS (
  SELECT count(*)::integer AS expected_count,
    count(*) FILTER (WHERE i.indexrelid IS NOT NULL)::integer AS present_count
  FROM expected_indexes e
  LEFT JOIN pg_class c ON c.relname = e.index_name
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LEFT JOIN pg_index i ON i.indexrelid = c.oid
),
rls_state AS (
  SELECT count(*)::integer AS expected_count,
    count(*) FILTER (WHERE c.relrowsecurity)::integer AS enabled_count
  FROM target_tables t
  LEFT JOIN pg_class c ON c.relname = t.table_name
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
),
policy_state AS (
  SELECT count(*)::integer AS expected_count,
    count(p.policyname)::integer AS present_count,
    count(*) FILTER (WHERE p.policyname IS NOT NULL AND NOT ('authenticated' = ANY(p.roles)))::integer AS wrong_role_count
  FROM expected_policies e
  LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = e.table_name AND p.policyname = e.policy_name
),
anon_policy_state AS (
  SELECT count(*)::integer AS anon_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (SELECT table_name FROM target_tables)
    AND 'anon' = ANY(roles)
),
acl_state AS (
  SELECT e.table_name,
    e.role_name,
    e.privilege_list AS expected_privileges,
    COALESCE(a.actual_privileges, 'none') AS actual_privileges
  FROM expected_acl e
  LEFT JOIN (
    SELECT table_name, grantee,
      string_agg(
        privilege_type || CASE WHEN is_grantable THEN '*' ELSE '' END,
        ',' ORDER BY CASE privilege_type
          WHEN 'SELECT' THEN 1
          WHEN 'INSERT' THEN 2
          WHEN 'UPDATE' THEN 3
          WHEN 'DELETE' THEN 4
          WHEN 'TRUNCATE' THEN 5
          WHEN 'REFERENCES' THEN 6
          WHEN 'TRIGGER' THEN 7
          WHEN 'MAINTAIN' THEN 8
          ELSE 99
        END
      ) AS actual_privileges
    FROM (
      SELECT c.relname AS table_name,
        pg_get_userbyid(x.grantee) AS grantee,
        x.privilege_type,
        x.is_grantable
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, ARRAY[]::aclitem[])) x
      WHERE n.nspname = 'public'
        AND c.relname IN (SELECT table_name FROM target_tables)
    ) direct_grants
    GROUP BY table_name, grantee
  ) a ON a.table_name = e.table_name AND a.grantee = e.role_name
),
acl_grants AS (
  SELECT c.relname AS table_name,
    pg_get_userbyid(x.grantee) AS grantee,
    x.privilege_type,
    x.is_grantable
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, ARRAY[]::aclitem[])) x
  WHERE n.nspname = 'public'
    AND c.relname IN (SELECT table_name FROM target_tables)
),
prohibited_acl_state AS (
  SELECT count(*)::integer AS prohibited_count
  FROM acl_grants
  WHERE grantee IN ('public', 'anon', 'authenticated', 'service_role')
    AND privilege_type IN ('DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
),
anon_acl_state AS (
  SELECT count(*)::integer AS anon_grant_count
  FROM acl_grants
  WHERE grantee IN ('public', 'anon')
),
function_state AS (
  SELECT e.function_name,
    p.oid IS NOT NULL AS present,
    COALESCE(p.prosecdef, false) AS security_definer,
    COALESCE(array_to_string(p.proconfig, '|'), '') LIKE '%search_path=pg_catalog, public, pg_temp%' AS restricted_search_path
  FROM expected_functions e
  LEFT JOIN pg_proc p ON p.proname = e.function_name
    AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND pg_get_function_identity_arguments(p.oid) = ''
),
function_acl_state AS (
  SELECT count(*)::integer AS prohibited_function_grants
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, ARRAY[]::aclitem[])) x
  WHERE n.nspname = 'public'
    AND p.proname IN (SELECT function_name FROM expected_functions)
    AND pg_get_userbyid(x.grantee) IN ('public', 'anon', 'authenticated', 'service_role')
    AND x.privilege_type = 'EXECUTE'
),
artifact_type_state AS (
  SELECT count(*) FILTER (WHERE pg_get_constraintdef(c.oid) ILIKE '%article_dna%') > 0 AS article_dna,
    count(*) FILTER (WHERE pg_get_constraintdef(c.oid) ILIKE '%silo_dna%') > 0 AS silo_dna,
    count(*) FILTER (WHERE pg_get_constraintdef(c.oid) ILIKE '%silo_page%') > 0 AS silo_page,
    count(*) FILTER (WHERE pg_get_constraintdef(c.oid) ILIKE '%content_plan%') > 0 AS content_plan
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'editorial_artifact_versions'
    AND c.contype = 'c'
),
table_owners AS (
  SELECT count(*)::integer AS expected_count,
    count(*) FILTER (WHERE pg_get_userbyid(c.relowner) = 'postgres')::integer AS postgres_owned_count
  FROM target_tables t
  LEFT JOIN pg_class c ON c.relname = t.table_name
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
),
row_metadata AS (
  SELECT t.table_name,
    COALESCE(s.n_live_tup, CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END) AS estimated_rows
  FROM target_tables t
  LEFT JOIN pg_class c ON c.relname = t.table_name
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LEFT JOIN pg_stat_all_tables s ON s.schemaname = 'public' AND s.relname = t.table_name
),
existing_fingerprint AS (
  SELECT md5(COALESCE(string_agg(
    c.relname || '=' || md5(concat_ws('|', n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner), COALESCE(c.relacl::text, ''))),
    '|' ORDER BY c.relname
  ), '')) AS fingerprint
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('marcas', 'minerador_keyword_lists', 'minerador_keywords', 'agencies', 'brand_memberships', 'agency_brands')
),
default_acl_state AS (
  SELECT count(*)::integer AS forbidden_count
  FROM pg_default_acl d
  JOIN pg_roles owner_role ON owner_role.oid = d.defaclrole
  LEFT JOIN pg_namespace s ON s.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(d.defaclacl, ARRAY[]::aclitem[])) acl
  WHERE owner_role.rolname = 'postgres'
    AND COALESCE(s.nspname, '') = 'public'
    AND pg_get_userbyid(acl.grantee) IN ('public', 'anon', 'authenticated', 'service_role')
),
checks AS (
  SELECT 'script_version'::text AS check_name,
    '2026-08-11-pipeline-editorial-schema-post-verifier-v2'::text AS expected,
    '2026-08-11-pipeline-editorial-schema-post-verifier-v2'::text AS observed,
    'INFO'::text AS verdict
  UNION ALL
  SELECT 'tables:' || table_name, 'present in public', CASE WHEN present THEN 'present' ELSE 'missing' END,
    CASE WHEN present THEN 'PASS' ELSE 'FAIL' END
  FROM table_presence
  UNION ALL
  SELECT 'columns:' || table_name, concat(expected_count, ' expected columns with matching types'),
    concat('present=', present_count, '; type_mismatch=', type_mismatch_count),
    CASE WHEN expected_count = present_count AND type_mismatch_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM column_state
  UNION ALL
  SELECT 'columns:user_id-uuid', 'content_document_user_states.user_id uuid',
    CASE WHEN user_id_uuid_present THEN 'present' ELSE 'missing_or_wrong_type' END,
    CASE WHEN user_id_uuid_present THEN 'PASS' ELSE 'FAIL' END
  FROM special_columns
  UNION ALL
  SELECT 'columns:user_key-absent', 'no user_key in new editorial tables',
    CASE WHEN user_key_absent THEN 'absent' ELSE 'present' END,
    CASE WHEN user_key_absent THEN 'PASS' ELSE 'FAIL' END
  FROM special_columns
  UNION ALL
  SELECT 'artifact_type:silo_page', 'article_dna + silo_dna + silo_page + content_plan checks',
    concat('article_dna=', article_dna, '; silo_dna=', silo_dna, '; silo_page=', silo_page, '; content_plan=', content_plan),
    CASE WHEN article_dna AND silo_dna AND silo_page AND content_plan THEN 'PASS' ELSE 'FAIL' END
  FROM artifact_type_state
  UNION ALL
  SELECT 'fks:' || table_name || ':' || constraint_name, target_relation || ' ON DELETE RESTRICT',
    CASE WHEN present THEN observed_target || CASE WHEN restrict_delete THEN ' ON DELETE RESTRICT' ELSE ' ON DELETE OTHER' END ELSE 'missing' END,
    CASE WHEN present AND restrict_delete AND observed_target = target_relation THEN 'PASS' ELSE 'FAIL' END
  FROM fk_state
  UNION ALL
  SELECT 'fks:no-cascade-or-nonrestrict', '0 non-RESTRICT foreign keys in new tables', cascade_count::text,
    CASE WHEN cascade_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM cascade_state
  UNION ALL
  SELECT 'indexes', concat(expected_count, ' expected indexes'), concat('present=', present_count),
    CASE WHEN expected_count = present_count THEN 'PASS' ELSE 'FAIL' END
  FROM index_state
  UNION ALL
  SELECT 'rls', concat(expected_count, ' private tables with RLS enabled'), concat('enabled=', enabled_count),
    CASE WHEN expected_count = enabled_count THEN 'PASS' ELSE 'FAIL' END
  FROM rls_state
  UNION ALL
  SELECT 'policies', concat(expected_count, ' named policies for authenticated'), concat('present=', present_count, '; wrong_role=', wrong_role_count),
    CASE WHEN expected_count = present_count AND wrong_role_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM policy_state
  UNION ALL
  SELECT 'policies:anon', '0 policies addressed to anon', anon_policy_count::text,
    CASE WHEN anon_policy_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM anon_policy_state
  UNION ALL
  SELECT 'acl:' || table_name || ':' || role_name, expected_privileges, actual_privileges,
    CASE WHEN expected_privileges = actual_privileges THEN 'PASS' ELSE 'FAIL' END
  FROM acl_state
  UNION ALL
  SELECT 'acl:anon', '0 direct grants to anon or PUBLIC', anon_grant_count::text,
    CASE WHEN anon_grant_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM anon_acl_state
  UNION ALL
  SELECT 'acl:prohibited-privileges', '0 direct DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants to private roles or PUBLIC', prohibited_count::text,
    CASE WHEN prohibited_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM prohibited_acl_state
  UNION ALL
  SELECT 'functions:' || function_name, 'present, SECURITY INVOKER, restricted search_path',
    concat('present=', present, '; security_definer=', security_definer, '; restricted_search_path=', restricted_search_path),
    CASE WHEN present AND NOT security_definer AND restricted_search_path THEN 'PASS' ELSE 'FAIL' END
  FROM function_state
  UNION ALL
  SELECT 'functions:private-execute', '0 PUBLIC/anon/authenticated/service_role EXECUTE grants on trigger functions', prohibited_function_grants::text,
    CASE WHEN prohibited_function_grants = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM function_acl_state
  UNION ALL
  SELECT 'owners', concat(expected_count, ' new tables owned by postgres'), concat('postgres_owned=', postgres_owned_count),
    CASE WHEN expected_count = postgres_owned_count THEN 'PASS' ELSE 'FAIL' END
  FROM table_owners
  UNION ALL
  SELECT 'counts:' || table_name, 'catalog row estimate; expected empty immediately after apply',
    COALESCE(estimated_rows::text, 'unknown'), 'INFO'
  FROM row_metadata
  UNION ALL
  SELECT 'existing-objects:fingerprint', 'compare with preflight output; no local baseline embedded', fingerprint, 'INFO'
  FROM existing_fingerprint
  UNION ALL
  SELECT 'default-acl:postgres/public:no-private-role-grants', '0 prohibited default ACL entries after 0026', forbidden_count::text,
    CASE WHEN forbidden_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM default_acl_state
  UNION ALL
  SELECT 'cross-brand-reference-enforcement', 'single-column FKs verified; cross-entity same-brand comparison remains runtime responsibility',
    'no composite FK invented', 'INFO'
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY CASE WHEN check_name = 'script_version' THEN 0 ELSE 1 END, check_name;
