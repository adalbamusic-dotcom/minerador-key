-- Preflight read-only do hardening ACL 0022.
-- Uma unica consulta; somente catalogo e contagem sanitizada de inconsistencias.
-- Espera o estado apos 0022, sem executar GRANT, REVOKE ou SQL mutavel.

WITH
target_tables(table_name) AS (
  VALUES
    ('communication_templates'),
    ('communication_messages'),
    ('communication_delivery_events'),
    ('agency_invitation_token_generations')
),
roles(role_name) AS (
  VALUES ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
),
privileges(privilege_name) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
         ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
),
expected_acl(role_name, table_name, privilege_name, expected_grant) AS (
  SELECT r.role_name, t.table_name, p.privilege_name,
    CASE
      WHEN r.role_name <> 'service_role' THEN false
      WHEN t.table_name IN ('communication_templates', 'communication_messages')
        AND p.privilege_name IN ('SELECT', 'INSERT', 'UPDATE') THEN true
      WHEN t.table_name = 'communication_delivery_events'
        AND p.privilege_name IN ('SELECT', 'INSERT') THEN true
      WHEN t.table_name = 'agency_invitation_token_generations'
        AND p.privilege_name = 'SELECT' THEN true
      ELSE false
    END
  FROM roles r CROSS JOIN target_tables t CROSS JOIN privileges p
),
acl_observed AS (
  SELECT e.role_name, e.table_name, e.privilege_name, e.expected_grant,
    CASE WHEN c.oid IS NULL THEN false ELSE EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
      WHERE a.grantee = CASE
        WHEN e.role_name = 'PUBLIC' THEN 0::oid
        ELSE coalesce((SELECT oid FROM pg_catalog.pg_roles WHERE rolname = e.role_name), 0::oid)
      END
        AND a.privilege_type = e.privilege_name
    ) END AS observed_grant,
    c.oid IS NOT NULL AS table_present
  FROM expected_acl e
  LEFT JOIN pg_catalog.pg_class c
    ON c.relnamespace = 'public'::regnamespace
   AND c.relname = e.table_name
),
owner_rows AS (
  SELECT 10::integer AS sort_order,
    'owner:' || t.table_name AS check_name,
    'owner=postgres' AS expected,
    CASE WHEN c.oid IS NULL THEN 'MISSING_TABLE'
         ELSE 'owner=' || coalesce(r.rolname, 'UNKNOWN') END AS observed,
    CASE WHEN c.oid IS NOT NULL AND r.rolname = 'postgres' THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM target_tables t
  LEFT JOIN pg_catalog.pg_class c
    ON c.relnamespace = 'public'::regnamespace AND c.relname = t.table_name
  LEFT JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
),
acl_rows AS (
  SELECT 20::integer AS sort_order,
    'acl:' || role_name || ':' || table_name || ':' || privilege_name AS check_name,
    'explicit=' || expected_grant::text AS expected,
    CASE WHEN table_present THEN 'explicit=' || observed_grant::text ELSE 'MISSING_TABLE' END AS observed,
    CASE WHEN table_present AND observed_grant = expected_grant THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM acl_observed
),
policy_rows AS (
  SELECT 30::integer AS sort_order,
    'policies:' || t.table_name AS check_name,
    '0 policies' AS expected,
    count(p.policyname)::text AS observed,
    CASE WHEN count(p.policyname) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM target_tables t
  LEFT JOIN pg_catalog.pg_policies p
    ON p.schemaname = 'public' AND p.tablename = t.table_name
  GROUP BY t.table_name
),
rls_rows AS (
  SELECT 31::integer AS sort_order,
    'rls:' || t.table_name AS check_name,
    'enabled' AS expected,
    CASE WHEN c.relrowsecurity THEN 'enabled' ELSE 'disabled' END AS observed,
    CASE WHEN c.oid IS NOT NULL AND c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM target_tables t
  LEFT JOIN pg_catalog.pg_class c
    ON c.relnamespace = 'public'::regnamespace AND c.relname = t.table_name
),
function_expected(function_name, signature, expected_security_definer) AS (
  VALUES
    ('communication_dispatch_lease_seconds', 'public.communication_dispatch_lease_seconds()', false),
    ('create_agency_invitation_token_generation', 'public.create_agency_invitation_token_generation(uuid,text)', true),
    ('revoke_agency_invitation_token_generations', 'public.revoke_agency_invitation_token_generations(uuid)', true),
    ('enqueue_communication_message', 'public.enqueue_communication_message(text,text,integer,text,jsonb,text,uuid,uuid,uuid)', true),
    ('claim_communication_message', 'public.claim_communication_message(uuid)', true),
    ('complete_communication_message', 'public.complete_communication_message(uuid,text,text,text,text,timestamptz)', true),
    ('complete_agency_onboarding_with_token', 'public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)', true),
    ('record_communication_delivery_event', 'public.record_communication_delivery_event(uuid,text,text,text,text,jsonb)', true)
),
function_rows AS (
  SELECT 40::integer AS sort_order,
    'function:' || e.function_name AS check_name,
    'present; SECURITY DEFINER=' || e.expected_security_definer::text || '; restricted search_path' AS expected,
    CASE WHEN p.oid IS NULL THEN 'MISSING'
         ELSE 'present; security_definer=' || p.prosecdef::text ||
              '; search_path_restricted=' ||
              (coalesce(array_to_string(p.proconfig, ';'), '') LIKE '%search_path=pg_catalog, public, pg_temp%')::text END AS observed,
    CASE WHEN p.oid IS NOT NULL
       AND p.prosecdef = e.expected_security_definer
       AND coalesce(array_to_string(p.proconfig, ';'), '') LIKE '%search_path=pg_catalog, public, pg_temp%'
       THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM function_expected e
  LEFT JOIN pg_catalog.pg_proc p ON p.oid = to_regprocedure(e.signature)
),
token_rows AS (
  SELECT 50::integer AS sort_order,
    'token:hash_only_column' AS check_name,
    'token_hash present; raw token column absent' AS expected,
    'token_hash=' || (EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agency_invitation_token_generations'
        AND column_name = 'token_hash'
    ))::text || '; raw_token_columns=' || count(*)::text AS observed,
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agency_invitation_token_generations'
        AND column_name = 'token_hash'
    ) AND count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'agency_invitation_token_generations'
    AND lower(column_name) ~ '(^|_)(raw_token|token|bearer)(_|$)'
    AND lower(column_name) <> 'token_hash'
),
constraint_rows AS (
  SELECT 51::integer AS sort_order,
    'token:constraints' AS check_name,
    'invitation FK; used/revoked exclusivity check; expiration check' AS expected,
    'fk=' || count(*) FILTER (WHERE contype = 'f')::text ||
      '; checks=' || count(*) FILTER (WHERE contype = 'c')::text AS observed,
    CASE WHEN count(*) FILTER (WHERE contype = 'f') >= 1
       AND count(*) FILTER (WHERE contype = 'c') >= 2 THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM pg_catalog.pg_constraint
  WHERE conrelid = to_regclass('public.agency_invitation_token_generations')
),
token_state AS (
  SELECT 52::integer AS sort_order,
    'token:used_and_revoked_inconsistencies' AS check_name,
    '0' AS expected,
    count(*) FILTER (WHERE used_at IS NOT NULL AND revoked_at IS NOT NULL)::text AS observed,
    CASE WHEN count(*) FILTER (WHERE used_at IS NOT NULL AND revoked_at IS NOT NULL) = 0
      THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM public.agency_invitation_token_generations
),
summary_rows AS (
  SELECT 90::integer AS sort_order,
    'summary:acl_contract' AS check_name,
    'all 128 role/table/privilege checks pass' AS expected,
    count(*) FILTER (WHERE verdict = 'PASS')::text || '/128 ACL checks pass' AS observed,
    CASE WHEN count(*) = 128 AND count(*) FILTER (WHERE verdict = 'PASS') = 128
      THEN 'PASS' ELSE 'FAIL' END AS verdict
  FROM acl_rows
),
all_checks AS (
  SELECT * FROM owner_rows
  UNION ALL SELECT * FROM acl_rows
  UNION ALL SELECT * FROM policy_rows
  UNION ALL SELECT * FROM rls_rows
  UNION ALL SELECT * FROM function_rows
  UNION ALL SELECT * FROM token_rows
  UNION ALL SELECT * FROM constraint_rows
  UNION ALL SELECT * FROM token_state
  UNION ALL SELECT * FROM summary_rows
)
SELECT check_name, expected, observed, verdict
FROM all_checks
ORDER BY sort_order, check_name;
