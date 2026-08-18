-- CANONICAL BRAND AUTHORIZATION DIAGNOSTIC
-- Version: 2026-08-11-canonical-brand-authorization-diagnostic-v2
-- Catalog-only. No data rows, DML, DDL, role changes, grants or RPC calls.

WITH
relevant_relations(relation_name) AS (
  VALUES
    ('marcas'::text),
    ('brand_memberships'::text),
    ('agencies'::text),
    ('agency_memberships'::text),
    ('agency_brands'::text),
    ('minerador_keywords'::text),
    ('minerador_keyword_lists'::text),
    ('brand_roles'::text),
    ('brand_member_permissions'::text),
    ('agency_membership_capabilities'::text),
    ('brand_agency_capability_restrictions'::text),
    ('canonical_capabilities'::text)
),
concept_pattern AS (
  SELECT '(brand|marca|agency|agencia|membership|access|authorization|permission|canonical|actor)'::text AS value
),
relevant_functions AS (
  SELECT
    p.oid,
    n.nspname AS schema_name,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    p.proargtypes::oid[] AS argument_type_oids,
    pg_get_function_result(p.oid) AS return_type,
    pg_get_userbyid(p.proowner) AS owner_role,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_mode,
    CASE p.provolatile
      WHEN 'i' THEN 'IMMUTABLE'
      WHEN 's' THEN 'STABLE'
      ELSE 'VOLATILE'
    END AS volatility,
    COALESCE((
      SELECT split_part(value, '=', 2)
      FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting(value)
      WHERE value LIKE 'search_path=%'
      LIMIT 1
    ), '[not configured]') AS search_path,
    COALESCE((
      SELECT string_agg(
        (CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END)
        || ':' || x.privilege_type || CASE WHEN x.is_grantable THEN '*' ELSE '' END,
        ', ' ORDER BY
          (CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END),
          x.privilege_type
      )
      FROM aclexplode(COALESCE(p.proacl, ARRAY[]::aclitem[])) x
    ), 'none') AS execute_acl,
    concat(
      'anon=', has_function_privilege('anon', p.oid, 'EXECUTE'),
      '; authenticated=', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      '; service_role=', has_function_privilege('service_role', p.oid, 'EXECUTE')
    ) AS effective_execute,
    md5(pg_get_functiondef(p.oid)) AS definition_fingerprint,
    regexp_replace(
      regexp_replace(
        left(pg_get_functiondef(p.oid), 4000),
        '(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}',
        '[REDACTED_EMAIL]',
        'g'
      ),
      '(?i)(bearer[[:space:]]+[A-Za-z0-9._~-]+|(?:api[_-]?key|secret|token|password)[[:space:]]*=[[:space:]]*[^;[:space:]]+)',
      '[REDACTED_SECRET]',
      'g'
    ) AS definition_preview,
    CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_kind
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN concept_pattern c
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')
    AND (
      lower(p.proname) ~ c.value
      OR lower(pg_get_functiondef(p.oid)) ~ c.value
    )
),
policy_rows AS (
  SELECT
    p.schemaname AS schema_name,
    p.tablename AS relation_name,
    p.policyname AS policy_name,
    p.cmd AS command,
    array_to_string(p.roles, ',') AS roles,
    p.qual AS using_expression,
    p.with_check AS with_check_expression
  FROM pg_policies p
  CROSS JOIN concept_pattern c
  WHERE p.schemaname = 'public'
    AND (
      p.tablename IN (SELECT relation_name FROM relevant_relations)
      OR (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~* c.value
    )
),
policy_summary AS (
  SELECT
    r.relation_name,
    count(p.policy_name)::integer AS policy_count
  FROM relevant_relations r
  LEFT JOIN policy_rows p ON p.relation_name = r.relation_name
  GROUP BY r.relation_name
),
summary_rows AS (
  SELECT
    'SUMMARY'::text AS section,
    'public'::text AS schema_name,
    NULL::text AS relation_name,
    'script_version'::text AS object_name,
    NULL::text AS identity_arguments,
    NULL::text AS return_type,
    NULL::text AS owner_role,
    NULL::text AS security_mode,
    NULL::text AS volatility,
    NULL::text AS search_path,
    NULL::text AS execute_acl,
    NULL::text AS effective_execute,
    NULL::text AS command,
    NULL::text AS roles,
    NULL::text AS using_expression,
    NULL::text AS with_check_expression,
    NULL::text AS definition_fingerprint,
    NULL::text AS definition_preview,
    '2026-08-11-canonical-brand-authorization-diagnostic-v2'::text AS observed,
    'INFO'::text AS verdict
  UNION ALL
  SELECT
    'SUMMARY', 'public', NULL,
    'functions:exact-signatures', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    concat(
      'canonical_actor_can_access_brand(uuid,uuid)=',
      count(*) FILTER (WHERE proname = 'canonical_actor_can_access_brand' AND argument_type_oids = ARRAY['uuid'::regtype::oid, 'uuid'::regtype::oid]::oid[]),
      '; canonical_actor_can_use_brand_action(uuid,uuid,text,text)=',
      count(*) FILTER (WHERE proname = 'canonical_actor_can_use_brand_action' AND argument_type_oids = ARRAY['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid]::oid[]),
      '; relevant_public_routines=', count(*)
    ),
    'INFO'
  FROM relevant_functions
  UNION ALL
  SELECT
    'SUMMARY', 'public', relation_name,
    'policies:count', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    policy_count::text,
    'INFO'
  FROM policy_summary
),
function_output AS (
  SELECT
    'FUNCTION'::text AS section,
    schema_name,
    NULL::text AS relation_name,
    proname AS object_name,
    identity_arguments,
    return_type,
    owner_role,
    security_mode,
    volatility,
    search_path,
    execute_acl,
    effective_execute,
    NULL::text AS command,
    NULL::text AS roles,
    NULL::text AS using_expression,
    NULL::text AS with_check_expression,
    definition_fingerprint,
    definition_preview,
    routine_kind || '; present=true' AS observed,
    'INFO'::text AS verdict
  FROM relevant_functions
),
policy_output AS (
  SELECT
    'POLICY'::text AS section,
    schema_name,
    relation_name,
    policy_name AS object_name,
    NULL::text AS identity_arguments,
    NULL::text AS return_type,
    NULL::text AS owner_role,
    NULL::text AS security_mode,
    NULL::text AS volatility,
    NULL::text AS search_path,
    NULL::text AS execute_acl,
    NULL::text AS effective_execute,
    command,
    roles,
    using_expression,
    with_check_expression,
    NULL::text AS definition_fingerprint,
    NULL::text AS definition_preview,
    'present=true'::text AS observed,
    'INFO'::text AS verdict
  FROM policy_rows
)
SELECT
  section,
  schema_name,
  relation_name,
  object_name,
  identity_arguments,
  return_type,
  owner_role,
  security_mode,
  volatility,
  search_path,
  execute_acl,
  effective_execute,
  command,
  roles,
  using_expression,
  with_check_expression,
  definition_fingerprint,
  definition_preview,
  observed,
  verdict
FROM (
  SELECT * FROM summary_rows
  UNION ALL
  SELECT * FROM function_output
  UNION ALL
  SELECT * FROM policy_output
) diagnostic
ORDER BY
  CASE section WHEN 'SUMMARY' THEN 0 WHEN 'FUNCTION' THEN 1 ELSE 2 END,
  schema_name,
  relation_name NULLS FIRST,
  object_name,
  identity_arguments NULLS FIRST;
