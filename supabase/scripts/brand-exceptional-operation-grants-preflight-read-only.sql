-- Preflight read-only da migration 0030.
-- Um único result set; não lê dados de negócio e não altera schema, ACL, RLS ou dados.

WITH targets(kind, object_name) AS (
  VALUES
    ('table', 'brand_exceptional_operation_grants'),
    ('table', 'brand_exceptional_operation_execution_events'),
    ('function', 'canonical_actor_can_execute_brand_exceptional_operation')
),
relations AS (
  SELECT t.object_name, c.oid, pg_get_userbyid(c.relowner) AS owner_role, c.relrowsecurity
  FROM targets t
  LEFT JOIN pg_catalog.pg_class c ON t.kind = 'table' AND c.oid = to_regclass('public.' || t.object_name)
  WHERE t.kind = 'table'
),
functions AS (
  SELECT t.object_name, p.oid
  FROM targets t
  LEFT JOIN pg_catalog.pg_proc p
    ON t.kind = 'function'
    AND p.proname = t.object_name
    AND p.pronamespace = 'public'::regnamespace
    AND pg_get_function_identity_arguments(p.oid) = 'target_brand_id uuid, target_actor_user_id uuid, target_operation text'
  WHERE t.kind = 'function'
),
dependencies AS (
  SELECT
    to_regclass('public.marcas') IS NOT NULL AS marcas_present,
    to_regclass('auth.users') IS NOT NULL AS auth_users_present,
    to_regclass('public.editorial_workflow_items') IS NOT NULL AS workflow_present,
    to_regprocedure('public.canonical_actor_can_access_brand(uuid,uuid)') IS NOT NULL AS canonical_access_present,
    EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'public') AS public_schema_present
),
default_acl AS (
  SELECT coalesce(string_agg(
    pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ':' || coalesce(array_to_string(d.defaclacl, ', '), 'NULL'),
    ' | ' ORDER BY pg_get_userbyid(d.defaclrole), d.defaclobjtype
  ), 'none') AS observed
  FROM pg_catalog.pg_default_acl d
  JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND pg_get_userbyid(d.defaclrole) IN ('postgres', 'supabase_admin')
),
public_fingerprint AS (
  SELECT md5(coalesce(string_agg(
    c.relname || ';' || pg_get_userbyid(c.relowner) || ';' || c.relrowsecurity::text || ';' || coalesce(array_to_string(c.relacl, ','), 'NULL'),
    '|' ORDER BY c.relname
  ), '')) AS fingerprint
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
),
checks AS (
  SELECT 'script_version'::text AS check_name, '2026-08-12-exceptional-operation-grants-preflight-v1'::text AS expected, '2026-08-12-exceptional-operation-grants-preflight-v1'::text AS observed, 'INFO'::text AS verdict
  UNION ALL SELECT 'session:current_user', 'record only', current_user, 'INFO'
  UNION ALL SELECT 'session:session_user', 'record only', session_user, 'INFO'
  UNION ALL SELECT 'session:current_role', 'record only', current_role, 'INFO'
  UNION ALL SELECT 'schema:public', 'present', CASE WHEN public_schema_present THEN 'present' ELSE 'missing' END, CASE WHEN public_schema_present THEN 'PASS' ELSE 'FAIL' END FROM dependencies
  UNION ALL SELECT 'dependency:marcas', 'present', CASE WHEN marcas_present THEN 'present' ELSE 'missing' END, CASE WHEN marcas_present THEN 'PASS' ELSE 'FAIL' END FROM dependencies
  UNION ALL SELECT 'dependency:auth.users', 'present', CASE WHEN auth_users_present THEN 'present' ELSE 'missing' END, CASE WHEN auth_users_present THEN 'PASS' ELSE 'FAIL' END FROM dependencies
  UNION ALL SELECT 'dependency:editorial_workflow_items', 'present', CASE WHEN workflow_present THEN 'present' ELSE 'missing' END, CASE WHEN workflow_present THEN 'PASS' ELSE 'FAIL' END FROM dependencies
  UNION ALL SELECT 'dependency:canonical_actor_can_access_brand', 'present', CASE WHEN canonical_access_present THEN 'present' ELSE 'missing' END, CASE WHEN canonical_access_present THEN 'PASS' ELSE 'FAIL' END FROM dependencies
  UNION ALL SELECT 'precondition:table:' || object_name, 'absent before 0030', CASE WHEN oid IS NULL THEN 'absent' ELSE 'present;owner=' || owner_role || ';rls=' || relrowsecurity::text END, CASE WHEN oid IS NULL THEN 'PASS' ELSE 'FAIL' END FROM relations
  UNION ALL SELECT 'precondition:function:' || object_name, 'absent before 0030', CASE WHEN oid IS NULL THEN 'absent' ELSE 'present' END, CASE WHEN oid IS NULL THEN 'PASS' ELSE 'FAIL' END FROM functions
  UNION ALL SELECT 'default_acl:public', 'record baseline; 0030 must not alter defaults', observed, 'INFO' FROM default_acl
  UNION ALL SELECT 'fingerprint:public_relations', 'record baseline before 0030', fingerprint, 'INFO' FROM public_fingerprint
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY CASE WHEN verdict = 'FAIL' THEN 0 WHEN verdict = 'PASS' THEN 1 ELSE 2 END, check_name;
