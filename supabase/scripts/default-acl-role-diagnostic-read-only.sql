-- DEFAULT ACL ROLE DIAGNOSTIC
-- script_version: 2026-08-11-default-acl-role-diagnostic-v2
-- READ-ONLY: pg_catalog/information_schema-equivalente e funcoes de observacao.
-- Um unico result set. Nao usa SET ROLE nem executa operacao mutavel.

WITH
target_relations(relation_name, structural_group) AS (
  VALUES
    ('marcas', 'identity/Brand'),
    ('minerador_keyword_lists', 'Minerador'),
    ('minerador_keywords', 'Minerador'),
    ('agencies', 'Agency'),
    ('agency_memberships', 'Agency'),
    ('agency_brands', 'Agency'),
    ('brand_memberships', 'Brand authorization'),
    ('platform_communication_config', 'Communication'),
    ('agency_applications', 'Agency onboarding'),
    ('agency_invitations', 'Agency onboarding'),
    ('agency_onboardings', 'Agency onboarding'),
    ('integration_providers', 'Integrations'),
    ('integration_capabilities', 'Integrations'),
    ('integration_connections', 'Integrations'),
    ('integration_grants', 'Integrations'),
    ('integration_bindings', 'Integrations'),
    ('integration_quota_policies', 'Integrations'),
    ('integration_usage_events', 'Integrations')
),
session_identity AS (
  SELECT
    current_user::text AS current_user_name,
    session_user::text AS session_user_name,
    current_role::text AS current_role_name
),
public_schema AS (
  SELECT n.oid, n.nspowner, r.rolname AS owner_name
  FROM pg_catalog.pg_namespace n
  LEFT JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
  WHERE n.nspname = 'public'
),
relation_catalog AS (
  SELECT
    n.nspname AS schema_name,
    c.oid AS relation_oid,
    c.relname AS relation_name,
    c.relowner AS owner_oid,
    r.rolname AS owner_name,
    c.relkind,
    c.relrowsecurity,
    c.relforcerowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'm', 'v', 'f')
),
default_acl_rows AS (
  SELECT
    d.defaclrole AS owner_oid,
    owner_role.rolname AS owner_name,
    COALESCE(n.nspname, 'ALL_SCHEMAS') AS schema_name,
    CASE d.defaclobjtype
      WHEN 'r' THEN 'TABLE'
      WHEN 'S' THEN 'SEQUENCE'
      WHEN 'f' THEN 'FUNCTION'
      WHEN 'T' THEN 'TYPE'
      WHEN 'n' THEN 'SCHEMA'
      ELSE d.defaclobjtype::text
    END AS object_type,
    CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee_name,
    x.privilege_type,
    x.is_grantable
  FROM pg_catalog.pg_default_acl d
  LEFT JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = d.defaclrole
  LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x ON true
  LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid = x.grantee
),
object_owner_roles AS (
  SELECT DISTINCT owner_oid, owner_name
  FROM relation_catalog
  WHERE owner_oid IS NOT NULL
),
relevant_roles AS (
  SELECT DISTINCT r.oid, r.rolname, r.rolsuper, r.rolcreaterole,
    r.rolcreatedb, r.rolinherit, r.rolcanlogin, r.rolbypassrls
  FROM pg_catalog.pg_roles r
  WHERE r.rolname IN ('postgres', 'supabase_admin')
     OR r.rolname = (SELECT current_user_name FROM session_identity)
     OR r.oid IN (SELECT owner_oid FROM object_owner_roles)
     OR r.oid IN (SELECT owner_oid FROM default_acl_rows)
),
membership_rows AS (
  SELECT
    granted.rolname AS granted_role,
    member.rolname AS member_role,
    m.admin_option
  FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
  JOIN pg_catalog.pg_roles member ON member.oid = m.member
  WHERE granted.oid IN (SELECT oid FROM relevant_roles)
     OR member.rolname = (SELECT current_user_name FROM session_identity)
),
object_owner_summary AS (
  SELECT
    count(DISTINCT owner_oid)::integer AS owner_count,
    string_agg(DISTINCT owner_name, ', ' ORDER BY owner_name) AS owner_names
  FROM object_owner_roles
),
default_acl_summary AS (
  SELECT
    COALESCE(
      string_agg(
        DISTINCT 'role=' || owner_name
          || ';schema=' || schema_name
          || ';type=' || object_type
          || ';grantee=' || grantee_name
          || ';privilege=' || privilege_type
          || ';grantable=' || is_grantable::text,
        ' | ' ORDER BY
          'role=' || owner_name
          || ';schema=' || schema_name
          || ';type=' || object_type
          || ';grantee=' || grantee_name
          || ';privilege=' || privilege_type
          || ';grantable=' || is_grantable::text
      ),
      '(none observed)'
    ) AS details
  FROM default_acl_rows
),
membership_summary AS (
  SELECT COALESCE(
    string_agg(
      granted_role || '<-' || member_role || ';admin_option=' || admin_option::text,
      ' | ' ORDER BY granted_role, member_role
    ),
    '(none observed)'
  ) AS details
  FROM membership_rows
),
role_attribute_summary AS (
  SELECT COALESCE(
    string_agg(
      rolname
        || ';superuser=' || rolsuper::text
        || ';createrole=' || rolcreaterole::text
        || ';createdb=' || rolcreatedb::text
        || ';inherit=' || rolinherit::text
        || ';canlogin=' || rolcanlogin::text
        || ';bypassrls=' || rolbypassrls::text,
      ' | ' ORDER BY rolname
    ),
    '(none observed)'
  ) AS details
  FROM relevant_roles
),
current_role_capability AS (
  SELECT
    s.current_user_name,
    has_schema_privilege(s.current_user_name, 'public', 'USAGE') AS public_usage,
    has_schema_privilege(s.current_user_name, 'public', 'CREATE') AS public_create,
    COALESCE(r.rolsuper, false) AS current_is_superuser,
    COALESCE(r.rolcreaterole, false) AS current_can_create_role,
    COALESCE(
      bool_or(
        s.current_user_name = rr.rolname
        OR pg_catalog.pg_has_role(s.current_user_name, rr.oid, 'member')
      ),
      false
    ) AS can_target_an_observed_owner
  FROM session_identity s
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname = s.current_user_name
  LEFT JOIN relevant_roles rr ON true
  GROUP BY s.current_user_name, r.rolsuper, r.rolcreaterole
),
checks AS (
  SELECT
    'session:current_user' AS check_name,
    'session identity' AS expected,
    s.current_user_name AS observed,
    'INFO' AS verdict
  FROM session_identity s
  UNION ALL
  SELECT 'session:session_user', 'session identity', s.session_user_name, 'INFO'
  FROM session_identity s
  UNION ALL
  SELECT 'session:current_role', 'session identity', s.current_role_name, 'INFO'
  FROM session_identity s
  UNION ALL
  SELECT
    'owner:schema:public',
    'actual public schema owner',
    COALESCE(p.owner_name, 'UNKNOWN'),
    CASE WHEN p.owner_name IS NULL THEN 'FAIL' ELSE 'INFO' END
  FROM public_schema p
  UNION ALL
  SELECT
    'owner:table:' || t.relation_name,
    'actual owner of public.' || t.relation_name,
    COALESCE(r.owner_name, 'MISSING'),
    'INFO'
  FROM target_relations t
  LEFT JOIN relation_catalog r ON r.relation_name = t.relation_name
  UNION ALL
  SELECT
    'relation:' || t.relation_name,
    'catalog presence for ' || t.structural_group,
    CASE WHEN r.relation_oid IS NULL THEN 'MISSING' ELSE 'PRESENT' END,
    'INFO'
  FROM target_relations t
  LEFT JOIN relation_catalog r ON r.relation_name = t.relation_name
  UNION ALL
  SELECT
    'default-acl:all',
    'all current pg_default_acl entries',
    d.details,
    'INFO'
  FROM default_acl_summary d
  UNION ALL
  SELECT
    'default-acl:postgres',
    'current defaults owned by postgres',
    COALESCE(
      string_agg(
        'schema=' || schema_name
          || ';type=' || object_type
          || ';grantee=' || grantee_name
          || ';privilege=' || privilege_type
          || ';grantable=' || is_grantable::text,
        ' | ' ORDER BY schema_name, object_type, grantee_name, privilege_type
      ) FILTER (WHERE owner_name = 'postgres'),
      '(none observed)'
    ),
    'INFO'
  FROM default_acl_rows
  UNION ALL
  SELECT
    'default-acl:supabase_admin',
    'current defaults owned by supabase_admin',
    COALESCE(
      string_agg(
        'schema=' || schema_name
          || ';type=' || object_type
          || ';grantee=' || grantee_name
          || ';privilege=' || privilege_type
          || ';grantable=' || is_grantable::text,
        ' | ' ORDER BY schema_name, object_type, grantee_name, privilege_type
      ) FILTER (WHERE owner_name = 'supabase_admin'),
      '(none observed)'
    ),
    'INFO'
  FROM default_acl_rows
  UNION ALL
  SELECT 'roles:attributes', 'relevant role attributes', a.details, 'INFO'
  FROM role_attribute_summary a
  UNION ALL
  SELECT 'roles:memberships', 'relevant role memberships', m.details, 'INFO'
  FROM membership_summary m
  UNION ALL
  SELECT
    'privilege:current-session',
    'catalog-only apparent ability to target an observed owner',
    'current_user=' || c.current_user_name
      || ';public_usage=' || c.public_usage::text
      || ';public_create=' || c.public_create::text
      || ';superuser=' || c.current_is_superuser::text
      || ';createrole=' || c.current_can_create_role::text
      || ';can_target_observed_owner=' || c.can_target_an_observed_owner::text,
    'INFO'
  FROM current_role_capability c
  UNION ALL
  SELECT
    'classification:MIGRATION_CREATOR_ROLE',
    'historical creator must be proven by audit/operation record',
    'UNKNOWN',
    'INFO'
  UNION ALL
  SELECT
    'classification:DEFAULT_ACL_TARGET_ROLE',
    'role that owns future application objects; schema owner is separate',
    CASE
      WHEN o.owner_count = 1 THEN 'CANDIDATE_OBSERVED_SINGLE_OBJECT_OWNER:' || o.owner_names
      WHEN o.owner_count > 1 THEN 'UNKNOWN_MULTIPLE_OWNERS:' || o.owner_names
      ELSE 'UNKNOWN'
    END,
    CASE WHEN o.owner_count = 1 THEN 'INFO' ELSE 'FAIL' END
  FROM object_owner_summary o
  UNION ALL
  SELECT
    'classification:SCHEMA_OWNER',
    'owner of public schema; not an application object owner',
    COALESCE(p.owner_name, 'UNKNOWN'),
    CASE WHEN p.owner_name IS NULL THEN 'FAIL' ELSE 'INFO' END
  FROM public_schema p
  UNION ALL
  SELECT
    'classification:OBJECT_OWNER',
    'owner of observed public application objects',
    CASE
      WHEN o.owner_count = 1 THEN o.owner_names
      WHEN o.owner_count > 1 THEN 'MULTIPLE_OBJECT_OWNERS:' || o.owner_names
      ELSE 'UNKNOWN'
    END,
    CASE WHEN o.owner_count = 1 THEN 'INFO' ELSE 'FAIL' END
  FROM object_owner_summary o
  UNION ALL
  SELECT
    'classification:EXECUTION_ROLE',
    'role executing this diagnostic session',
    s.current_user_name,
    'INFO'
  FROM session_identity s
  UNION ALL
  SELECT
    'classification:owner-conflict',
    'one coherent owner or explicit decision for multiple owners',
    CASE
      WHEN o.owner_count = 1 THEN 'NO_OWNER_CONFLICT_OBSERVED'
      WHEN o.owner_count > 1 THEN 'DEFAULT_ACL_ROLE_CONFLICT:' || o.owner_names
      ELSE 'UNKNOWN'
    END,
    CASE WHEN o.owner_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM object_owner_summary o
)
SELECT
  '2026-08-11-default-acl-role-diagnostic-v2' AS script_version,
  check_name,
  expected,
  observed,
  verdict
FROM checks
ORDER BY check_name;
