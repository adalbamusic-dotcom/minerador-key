-- Auditoria de catálogo — geração canônica.
-- SOMENTE LEITURA. Contém exclusivamente SELECT e WITH.
-- Não expõe definições de funções, valores de dados, e-mails, tokens ou secrets.

-- 1. Identificação técnica e presença do ledger. Este arquivo não lê o ledger.
SELECT current_database() AS database_name,
       current_user AS database_role,
       current_setting('server_version') AS postgres_version,
       now() AT TIME ZONE 'UTC' AS audited_at_utc;

SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       c.relkind AS relation_kind
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'supabase_migrations'
  AND c.relname = 'schema_migrations';

-- 2. Todas as relations públicas, com RLS e tamanho estimado.
SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       CASE c.relkind
         WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned_table'
         WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view'
         WHEN 'S' THEN 'sequence' WHEN 'f' THEN 'foreign_table'
         ELSE c.relkind::text
       END AS relation_kind,
       pg_get_userbyid(c.relowner) AS owner_role,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls,
       c.reloptions AS relation_options,
       CASE WHEN c.relkind IN ('r', 'p') AND NOT c.relrowsecurity THEN 'UNRESTRICTED'
            WHEN c.relkind IN ('r', 'p') THEN 'RLS_ENABLED'
            ELSE 'NOT_APPLICABLE' END AS rls_state,
       c.reltuples::bigint AS estimated_rows
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
ORDER BY relation_kind, relation_name;

-- 3. Colunas, constraints e índices, sem valores das tabelas.
SELECT table_name, ordinal_position, column_name, data_type, udt_schema, udt_name,
       is_nullable, column_default, is_identity, identity_generation,
       is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

SELECT con.conrelid::regclass::text AS table_name,
       con.conname AS constraint_name,
       CASE con.contype WHEN 'p' THEN 'PRIMARY_KEY' WHEN 'u' THEN 'UNIQUE'
                         WHEN 'f' THEN 'FOREIGN_KEY' WHEN 'c' THEN 'CHECK'
                         WHEN 'x' THEN 'EXCLUSION' ELSE con.contype::text END AS constraint_type,
       CASE con.confdeltype WHEN 'a' THEN 'NO_ACTION' WHEN 'r' THEN 'RESTRICT'
                            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET_NULL'
                            WHEN 'd' THEN 'SET_DEFAULT' END AS on_delete,
       CASE con.confupdtype WHEN 'a' THEN 'NO_ACTION' WHEN 'r' THEN 'RESTRICT'
                            WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET_NULL'
                            WHEN 'd' THEN 'SET_DEFAULT' END AS on_update,
       con.condeferrable AS deferrable, con.condeferred AS initially_deferred,
       con.convalidated AS validated, pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
JOIN pg_catalog.pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public'
ORDER BY table_name, constraint_type, constraint_name;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

WITH expected_indexes(index_name, purpose) AS (
  VALUES ('uq_brand_memberships_member_user_0005', 'unicidade marca + ator UUID'),
         ('uq_brand_memberships_legacy_key_0005', 'compatibilidade marca + user_key'),
         ('uq_agency_brands_active_brand_0014', 'uma agência ativa por marca')
)
SELECT e.index_name, e.purpose, i.indexname IS NOT NULL AS exists_in_catalog, i.indexdef
FROM expected_indexes e
LEFT JOIN pg_catalog.pg_indexes i ON i.schemaname = 'public' AND i.indexname = e.index_name
ORDER BY e.index_name;

-- 4. Views e security_invoker, sem definição de view.
SELECT c.relname AS view_name,
       CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END AS view_kind,
       c.reloptions AS relation_options,
       EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions, ARRAY[]::text[])) option_value
               WHERE option_value = 'security_invoker=true') AS security_invoker,
       pg_get_userbyid(c.relowner) AS owner_role
FROM pg_catalog.pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind IN ('v', 'm')
ORDER BY c.relname;

-- 5. RLS, policies, grants de tabela/coluna/sequência e default privileges.
-- qual e with_check são expressões brutas para inspeção local. Podem conter literais
-- sensíveis; não compartilhe esta saída sem sanitização humana prévia.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

WITH sensitive_relations(table_name) AS (
  VALUES ('tenant_0005_migration_guard'), ('marcas'), ('perfis'), ('minerador_keyword_lists'), ('minerador_keywords'),
         ('brand_roles'), ('brand_memberships'), ('brand_member_permissions'),
         ('agencies'), ('agency_memberships'), ('agency_brands'),
         ('minerador_google_ads_connections'), ('minerador_keyword_metric_measurements')
)
SELECT s.table_name, c.relkind IS NOT NULL AS relation_exists,
       COALESCE(c.relrowsecurity, false) AS rls_enabled,
       COALESCE(c.relforcerowsecurity, false) AS force_rls,
       COUNT(p.policyname) AS policy_count,
       CASE WHEN c.relkind IS NULL THEN 'MISSING'
            WHEN NOT c.relrowsecurity THEN 'UNRESTRICTED'
            WHEN COUNT(p.policyname) = 0 THEN 'RLS_WITHOUT_POLICY'
            ELSE 'POLICIES_PRESENT' END AS audit_state
FROM sensitive_relations s
LEFT JOIN pg_catalog.pg_class c ON c.relname = s.table_name AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_catalog.pg_policies p ON p.schemaname = 'public' AND p.tablename = s.table_name
GROUP BY s.table_name, c.relkind, c.relrowsecurity, c.relforcerowsecurity
ORDER BY s.table_name;

SELECT table_schema, table_name, grantee, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
ORDER BY table_name, grantee, privilege_type;

SELECT table_schema, table_name, column_name, grantee, privilege_type, is_grantable
FROM information_schema.column_privileges
WHERE table_schema = 'public'
ORDER BY table_name, column_name, grantee, privilege_type;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name ~* '(secret|token|password|credential|api[_]?key|refresh)'
ORDER BY table_name, column_name;

SELECT object_schema, object_name, grantee, privilege_type, is_grantable
FROM information_schema.usage_privileges
WHERE object_schema = 'public'
  AND object_type = 'SEQUENCE'
  AND object_name IN (SELECT relname FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S')
ORDER BY object_name, grantee, privilege_type;

SELECT defaclnamespace::regnamespace::text AS schema_name,
       pg_get_userbyid(defaclrole) AS owner_role,
       defaclobjtype AS object_type,
       defaclacl AS default_acl
FROM pg_catalog.pg_default_acl
WHERE defaclnamespace = 'public'::regnamespace
ORDER BY owner_role, object_type;

-- 6. Funções, search_path SECURITY DEFINER, triggers e dependências.
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_userbyid(p.proowner) AS owner_role,
       p.prosecdef AS security_definer,
       EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting_value
               WHERE setting_value LIKE 'search_path=%') AS has_explicit_search_path,
       (SELECT setting_value FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting_value
        WHERE setting_value LIKE 'search_path=%' LIMIT 1) AS explicit_search_path,
       CASE WHEN p.prosecdef AND NOT EXISTS (
              SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting_value
              WHERE setting_value LIKE 'search_path=%') THEN 'SECURITY_DEFINER_WITHOUT_EXPLICIT_SEARCH_PATH'
            WHEN p.prosecdef THEN 'SECURITY_DEFINER_WITH_SEARCH_PATH'
            ELSE 'NOT_SECURITY_DEFINER' END AS search_path_state,
       has_function_privilege((SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'), p.oid, 'EXECUTE') AS anon_can_execute_when_role_exists,
       has_function_privilege((SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated'), p.oid, 'EXECUTE') AS authenticated_can_execute_when_role_exists,
       EXISTS (
         SELECT 1
         FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl_grant
         WHERE acl_grant.grantee = 0 AND acl_grant.privilege_type = 'EXECUTE'
       ) AS public_execute_in_function_acl
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY function_name, arguments;

SELECT event_object_table AS table_name, trigger_name, event_manipulation,
       action_timing, action_orientation, action_condition, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY table_name, trigger_name, event_manipulation;

SELECT objid::regclass::text AS dependent_object,
       refobjid::regclass::text AS referenced_object,
       deptype
FROM pg_catalog.pg_depend d
JOIN pg_catalog.pg_class obj ON obj.oid = d.objid
JOIN pg_catalog.pg_namespace ns ON ns.oid = obj.relnamespace
WHERE ns.nspname = 'public'
  AND d.classid = 'pg_class'::regclass
  AND d.refclassid = 'pg_class'::regclass
ORDER BY dependent_object, referenced_object;
