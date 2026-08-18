-- Post-verifier read-only da migration 0030.
-- Um único result set; não altera schema, ACL, RLS ou dados.

WITH expected_tables(table_name, table_kind) AS (
  VALUES
    ('brand_exceptional_operation_grants', 'grant'),
    ('brand_exceptional_operation_execution_events', 'event')
),
relations AS (
  SELECT e.table_name, e.table_kind, c.oid, pg_get_userbyid(c.relowner) AS owner_role, c.relrowsecurity
  FROM expected_tables e
  LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || e.table_name)
),
columns AS (
  SELECT table_name, string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, 'NULL'), ' | ' ORDER BY ordinal_position) AS observed
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN (SELECT table_name FROM expected_tables)
  GROUP BY table_name
),
privileges AS (
  SELECT r.*,
    has_table_privilege('service_role', r.oid, 'SELECT') AS service_select,
    has_table_privilege('service_role', r.oid, 'INSERT') AS service_insert,
    has_table_privilege('service_role', r.oid, 'UPDATE') AS service_update,
    has_table_privilege('service_role', r.oid, 'DELETE') AS service_delete,
    has_table_privilege('service_role', r.oid, 'TRUNCATE') AS service_truncate,
    has_table_privilege('service_role', r.oid, 'REFERENCES') AS service_references,
    has_table_privilege('service_role', r.oid, 'TRIGGER') AS service_trigger,
    CASE WHEN current_setting('server_version_num')::integer >= 150000 THEN has_table_privilege('service_role', r.oid, 'MAINTAIN') ELSE false END AS service_maintain,
    has_table_privilege('authenticated', r.oid, 'SELECT') OR has_table_privilege('authenticated', r.oid, 'INSERT') OR has_table_privilege('authenticated', r.oid, 'UPDATE') OR has_table_privilege('authenticated', r.oid, 'DELETE') AS authenticated_any,
    has_table_privilege('anon', r.oid, 'SELECT') OR has_table_privilege('anon', r.oid, 'INSERT') OR has_table_privilege('anon', r.oid, 'UPDATE') OR has_table_privilege('anon', r.oid, 'DELETE') AS anon_any
  FROM relations r
),
constraints AS (
  SELECT conname, contype, pg_get_constraintdef(oid) AS definition
  FROM pg_catalog.pg_constraint
  WHERE connamespace = 'public'::regnamespace
    AND conrelid IN (SELECT oid FROM relations WHERE oid IS NOT NULL)
),
indexes AS (
  SELECT indexname, indexdef
  FROM pg_catalog.pg_indexes
  WHERE schemaname = 'public' AND tablename IN (SELECT table_name FROM expected_tables)
),
policies AS (
  SELECT tablename, count(*)::integer AS count FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename IN (SELECT table_name FROM expected_tables)
  GROUP BY tablename
),
helper AS (
  SELECT p.oid, pg_get_userbyid(p.proowner) AS owner_role, p.prosecdef, p.provolatile, coalesce(array_to_string(p.proconfig, ', '), '') AS proconfig,
    coalesce(string_agg((CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) || ':' || a.privilege_type, ' | ' ORDER BY a.grantee, a.privilege_type), 'none') AS execute_acl,
    coalesce(bool_or(a.grantee = 'service_role'::regrole AND a.privilege_type = 'EXECUTE'), false) AS service_role_execute,
    coalesce(bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE'), false) AS public_execute,
    coalesce(bool_or(a.grantee = 'anon'::regrole AND a.privilege_type = 'EXECUTE'), false) AS anon_execute,
    coalesce(bool_or(a.grantee = 'authenticated'::regrole AND a.privilege_type = 'EXECUTE'), false) AS authenticated_execute,
    coalesce(bool_or(a.privilege_type = 'EXECUTE' AND a.grantee NOT IN (p.proowner, 'service_role'::regrole)), false) AS unapproved_execute
  FROM pg_catalog.pg_proc p
  LEFT JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a ON true
  WHERE p.oid = to_regprocedure('public.canonical_actor_can_execute_brand_exceptional_operation(uuid,uuid,text)')
  GROUP BY p.oid, p.proowner, p.prosecdef, p.provolatile, p.proconfig
),
counts AS (
  SELECT 'brand_exceptional_operation_grants'::text AS table_name, count(*)::bigint AS row_count FROM public.brand_exceptional_operation_grants
  UNION ALL SELECT 'brand_exceptional_operation_execution_events', count(*) FROM public.brand_exceptional_operation_execution_events
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
    AND c.relname NOT IN ('brand_exceptional_operation_grants', 'brand_exceptional_operation_execution_events')
),
checks AS (
  SELECT 'script_version'::text AS check_name, '2026-08-12-exceptional-operation-grants-post-v1'::text AS expected, '2026-08-12-exceptional-operation-grants-post-v1'::text AS observed, 'INFO'::text AS verdict
  UNION ALL
  SELECT 'table:' || table_name, 'present; owner=postgres; RLS enabled; no direct policies required', CASE WHEN oid IS NULL THEN 'missing' ELSE 'owner=' || owner_role || ';rls=' || relrowsecurity::text || ';policies=' || coalesce(p.count, 0)::text END, CASE WHEN oid IS NOT NULL AND owner_role = 'postgres' AND relrowsecurity THEN 'PASS' ELSE 'FAIL' END FROM relations r LEFT JOIN policies p ON p.tablename = r.table_name
  UNION ALL
  SELECT 'columns:' || r.table_name, 'required columns/types present', coalesce(c.observed, 'missing'), CASE WHEN r.table_kind = 'grant' AND c.observed LIKE '%marca_id:uuid:NO%' AND c.observed LIKE '%actor_user_id:uuid:NO%' AND c.observed LIKE '%expires_at:timestamp with time zone:NO%' AND c.observed LIKE '%reason:text:NO%' THEN 'PASS' WHEN r.table_kind = 'event' AND c.observed LIKE '%execution_request_id:uuid:NO%' AND c.observed LIKE '%workflow_item_id:uuid:NO%' AND c.observed LIKE '%result:text:NO%' THEN 'PASS' ELSE 'FAIL' END FROM relations r LEFT JOIN columns c ON c.table_name = r.table_name
  UNION ALL
  SELECT 'acl:' || table_name, CASE WHEN table_kind = 'grant' THEN 'service_role SELECT/INSERT/UPDATE only; anon/authenticated none' ELSE 'service_role SELECT/INSERT only; anon/authenticated none' END, 'service(select=' || service_select::text || ',insert=' || service_insert::text || ',update=' || service_update::text || ',delete=' || service_delete::text || ',truncate=' || service_truncate::text || ',references=' || service_references::text || ',trigger=' || service_trigger::text || ',maintain=' || service_maintain::text || '); authenticated_any=' || authenticated_any::text || ';anon_any=' || anon_any::text, CASE WHEN oid IS NOT NULL AND NOT authenticated_any AND NOT anon_any AND NOT service_delete AND NOT service_truncate AND NOT service_references AND NOT service_trigger AND NOT service_maintain AND ((table_kind = 'grant' AND service_select AND service_insert AND service_update) OR (table_kind = 'event' AND service_select AND service_insert AND NOT service_update)) THEN 'PASS' ELSE 'FAIL' END FROM privileges
  UNION ALL
  SELECT 'constraints:lifecycle_reason', 'operation/status/expiry/revocation/reason checks present', count(*)::text, CASE WHEN count(*) = 5 THEN 'PASS' ELSE 'FAIL' END FROM constraints WHERE conname IN ('ck_brand_exceptional_operation_grants_operation_0030', 'ck_brand_exceptional_operation_grants_status_0030', 'ck_brand_exceptional_operation_grants_expiry_0030', 'ck_brand_exceptional_operation_grants_revocation_0030', 'ck_brand_exceptional_operation_grants_reason_0030')
  UNION ALL
  SELECT 'constraints:event_idempotency', 'grant-context FK and request/workflow unique present', count(*)::text, CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END FROM constraints WHERE conname IN ('fk_brand_exceptional_operation_execution_events_grant_context_0030', 'uq_brand_exceptional_operation_execution_events_request_workflow_0030')
  UNION ALL
  SELECT 'fk:on_delete_restrict', 'all 0030 FKs use RESTRICT', count(*) FILTER (WHERE confdeltype = 'r')::text || '/' || count(*)::text, CASE WHEN count(*) = 6 AND count(*) = count(*) FILTER (WHERE confdeltype = 'r') THEN 'PASS' ELSE 'FAIL' END FROM pg_catalog.pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f' AND conrelid IN (SELECT oid FROM relations WHERE oid IS NOT NULL)
  UNION ALL
  SELECT 'indexes:active_lookup_event', 'active unique, lookup and event indexes present', count(*)::text, CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END FROM indexes WHERE indexname IN ('uq_brand_exceptional_operation_grants_active_0030', 'ix_brand_exceptional_operation_grants_lookup_0030', 'ix_brand_exceptional_operation_execution_events_grant_0030')
  UNION ALL
  SELECT 'append_only:execution_events', 'trigger and shared append-only function present', CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'brand_exceptional_operation_execution_events_append_only_trg_0030') AND to_regprocedure('public.pipeline_editorial_protect_append_only()') IS NOT NULL THEN 'present' ELSE 'missing' END, CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgname = 'brand_exceptional_operation_execution_events_append_only_trg_0030') AND to_regprocedure('public.pipeline_editorial_protect_append_only()') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'helper:authorization', 'owner=postgres; SECURITY DEFINER; STABLE; restricted search_path; postgres/service_role EXECUTE only', CASE WHEN h.oid IS NULL THEN 'missing' ELSE 'owner=' || h.owner_role || ';security_definer=' || h.prosecdef::text || ';volatility=' || h.provolatile::text || ';config=' || h.proconfig || ';acl=' || h.execute_acl || ';public_execute=' || h.public_execute::text || ';anon_execute=' || h.anon_execute::text || ';authenticated_execute=' || h.authenticated_execute::text || ';service_role_execute=' || h.service_role_execute::text || ';unapproved_execute=' || h.unapproved_execute::text END, CASE WHEN h.oid IS NOT NULL AND h.owner_role = 'postgres' AND h.prosecdef AND h.provolatile = 's' AND h.proconfig LIKE '%search_path=pg_catalog, public, pg_temp%' AND h.service_role_execute AND NOT h.public_execute AND NOT h.anon_execute AND NOT h.authenticated_execute AND NOT h.unapproved_execute THEN 'PASS' ELSE 'FAIL' END FROM helper h
  UNION ALL
  SELECT 'data:0030_initially_empty', '0 rows in both new tables immediately after apply', sum(row_count)::text, CASE WHEN sum(row_count) = 0 THEN 'PASS' ELSE 'FAIL' END FROM counts
  UNION ALL
  SELECT 'default_acl:public', 'compare with saved preflight baseline; 0030 must not alter defaults', observed, 'INFO' FROM default_acl
  UNION ALL
  SELECT 'fingerprint:preexisting_public_relations', 'compare with saved preflight fingerprint; excludes 0030 tables', fingerprint, 'INFO' FROM public_fingerprint
)
SELECT check_name, expected, observed, verdict
FROM checks
ORDER BY CASE WHEN verdict = 'FAIL' THEN 0 WHEN verdict = 'PASS' THEN 1 ELSE 2 END, check_name;
