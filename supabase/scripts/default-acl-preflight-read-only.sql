-- DEFAULT ACL PREFLIGHT SNAPSHOT
-- script_version: 2026-08-11-default-acl-preflight-v2
-- BEFORE_CHANGE snapshot. READ-ONLY and one result set.
-- Nao altera defaults, roles, grants ou objetos.

WITH
target_relations(relation_name) AS (
  VALUES
    ('marcas'),
    ('minerador_keyword_lists'),
    ('minerador_keywords'),
    ('agencies'),
    ('agency_memberships'),
    ('agency_brands'),
    ('brand_memberships'),
    ('platform_communication_config'),
    ('agency_applications'),
    ('agency_invitations'),
    ('agency_onboardings'),
    ('integration_providers'),
    ('integration_capabilities'),
    ('integration_connections'),
    ('integration_grants'),
    ('integration_bindings'),
    ('integration_quota_policies'),
    ('integration_usage_events')
),
session_identity AS (
  SELECT current_user::text AS current_user_name,
    session_user::text AS session_user_name,
    current_role::text AS current_role_name
),
public_schema AS (
  SELECT n.nspowner, r.rolname AS owner_name
  FROM pg_catalog.pg_namespace n
  LEFT JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
  WHERE n.nspname = 'public'
),
relation_owners AS (
  SELECT
    t.relation_name,
    r.rolname AS owner_name,
    r.oid AS owner_oid,
    c.relrowsecurity,
    c.relforcerowsecurity
  FROM target_relations t
  LEFT JOIN pg_catalog.pg_namespace n
    ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class c
    ON c.relname = t.relation_name
   AND c.relnamespace = n.oid
  LEFT JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
),
default_acl_rows AS (
  SELECT
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
default_acl_detail AS (
  SELECT COALESCE(
    string_agg(
      'role=' || owner_name
        || ';schema=' || schema_name
        || ';type=' || object_type
        || ';grantee=' || grantee_name
        || ';privilege=' || privilege_type
        || ';grantable=' || is_grantable::text,
      ' | ' ORDER BY owner_name, schema_name, object_type, grantee_name, privilege_type
    ),
    '(none observed)'
  ) AS details
  FROM default_acl_rows
),
postgres_public_default_acl_fingerprint AS (
  SELECT md5(COALESCE(
    string_agg(
      owner_name || ';' || schema_name || ';' || object_type || ';'
        || grantee_name || ';' || privilege_type || ';' || is_grantable::text,
      '|' ORDER BY schema_name, object_type, grantee_name, privilege_type,
        is_grantable::text
    ) FILTER (WHERE owner_name = 'postgres' AND schema_name = 'public'),
    '(none observed)'
  )) AS fingerprint
  FROM default_acl_rows
),
existing_acl_fingerprint AS (
  SELECT md5(COALESCE(
    string_agg(
      n.nspname || '.' || c.relname || ';owner='
        || COALESCE(owner_role.rolname, 'UNKNOWN')
        || ';acl=' || COALESCE(c.relacl::text, '(null)'),
      '|' ORDER BY n.nspname, c.relname
    ),
    '(none observed)'
  )) AS fingerprint
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n
    ON n.oid = c.relnamespace
   AND n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = c.relowner
  WHERE c.relkind IN ('r', 'p', 'm', 'v', 'f')
),
owner_detail AS (
  SELECT COALESCE(
    string_agg(
      relation_name || ';owner=' || COALESCE(owner_name, 'MISSING')
        || ';rls=' || COALESCE(relrowsecurity::text, 'UNKNOWN')
        || ';force_rls=' || COALESCE(relforcerowsecurity::text, 'UNKNOWN'),
      ' | ' ORDER BY relation_name
    ),
    '(none observed)'
  ) AS details
  FROM relation_owners
),
checks AS (
  SELECT 'snapshot:session' AS check_name,
    'identity of the snapshot executor' AS expected,
    'current_user=' || s.current_user_name
      || ';session_user=' || s.session_user_name
      || ';current_role=' || s.current_role_name AS observed,
    'INFO' AS verdict
  FROM session_identity s
  UNION ALL
  SELECT 'preflight:current_user', 'postgres', s.current_user_name,
    CASE WHEN s.current_user_name = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  FROM session_identity s
  UNION ALL
  SELECT 'preflight:session_user', 'postgres', s.session_user_name,
    CASE WHEN s.session_user_name = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  FROM session_identity s
  UNION ALL
  SELECT 'preflight:current_role', 'postgres', s.current_role_name,
    CASE WHEN s.current_role_name = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  FROM session_identity s
  UNION ALL
  SELECT 'snapshot:public-schema-owner',
    'pg_database_owner',
    COALESCE((SELECT p.owner_name FROM public_schema p), 'UNKNOWN'),
    CASE WHEN (SELECT p.owner_name FROM public_schema p) = 'pg_database_owner'
      THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'snapshot:relation-owners',
    'owners and RLS state before change',
    d.details,
    'INFO'
  FROM owner_detail d
  UNION ALL
  SELECT 'snapshot:default-acl',
    'exact pg_default_acl state before change',
    d.details,
    'INFO'
  FROM default_acl_detail d
  UNION ALL
  SELECT 'snapshot:postgres-default-acl',
    'postgres default ACL before change',
    COALESCE(
      string_agg(
        'schema=' || schema_name
          || ';type=' || object_type
          || ';grantee=' || grantee_name
          || ';privilege=' || privilege_type
          || ';grantable=' || is_grantable::text,
        ' | ' ORDER BY schema_name, object_type, grantee_name, privilege_type
      ) FILTER (WHERE owner_name = 'postgres' AND schema_name = 'public'),
      '(none observed)'
    ),
    'INFO'
  FROM default_acl_rows
  UNION ALL
  SELECT 'snapshot:supabase-admin-default-acl',
    'supabase_admin default ACL before change',
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
  SELECT 'snapshot:postgres-public-default-acl-fingerprint',
    'fingerprint to preserve for comparison', f.fingerprint, 'INFO'
  FROM postgres_public_default_acl_fingerprint f
  UNION ALL
  SELECT 'snapshot:existing-public-object-acl-fingerprint',
    'fingerprint to preserve for comparison', f.fingerprint, 'INFO'
  FROM existing_acl_fingerprint f
)
SELECT
  '2026-08-11-default-acl-preflight-v2' AS script_version,
  check_name,
  expected,
  observed,
  verdict
FROM checks
ORDER BY check_name;
