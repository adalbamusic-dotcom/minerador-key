-- DEFAULT ACL POST-VERIFIER
-- script_version: 2026-08-11-default-acl-post-verifier-v1
-- READ-ONLY. One result set. Run after manual review/application of 0026.
-- Historical comparisons require the saved output of the preflight script.

WITH
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
target_roles AS (
  SELECT rolname
  FROM (VALUES ('PUBLIC'::text), ('anon'), ('authenticated'), ('service_role')) v(rolname)
),
default_acl_rows AS (
  SELECT
    d.defaclrole AS owner_oid,
    owner_role.rolname AS owner_name,
    COALESCE(n.nspname, 'ALL_SCHEMAS') AS schema_name,
    d.defaclobjtype AS object_type_code,
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
expected_object_types(object_type_code, object_type_name) AS (
  VALUES ('r'::"char", 'TABLE'), ('S'::"char", 'SEQUENCE'), ('f'::"char", 'FUNCTION')
),
postgres_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'postgres'
),
public_schema_oid AS (
  SELECT oid
  FROM pg_catalog.pg_namespace
  WHERE nspname = 'public'
),
effective_postgres_public_defaults AS (
  SELECT
    e.object_type_code,
    e.object_type_name,
    COALESCE(
      (
        SELECT d.defaclacl
        FROM pg_catalog.pg_default_acl d
        WHERE d.defaclrole = pr.oid
          AND d.defaclnamespace = ps.oid
          AND d.defaclobjtype = e.object_type_code
      ),
      (
        SELECT d.defaclacl
        FROM pg_catalog.pg_default_acl d
        WHERE d.defaclrole = pr.oid
          AND d.defaclnamespace IS NULL
          AND d.defaclobjtype = e.object_type_code
      ),
      pg_catalog.acldefault(e.object_type_code, pr.oid)
    ) AS acl
  FROM expected_object_types e
  CROSS JOIN postgres_role pr
  CROSS JOIN public_schema_oid ps
),
effective_postgres_public_privileges AS (
  SELECT
    e.object_type_code,
    e.object_type_name,
    CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee_name,
    x.privilege_type,
    x.is_grantable
  FROM effective_postgres_public_defaults e
  CROSS JOIN LATERAL pg_catalog.aclexplode(e.acl) x
  LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid = x.grantee
),
postgres_public_defaults AS (
  SELECT e.object_type_code, e.object_type_name,
    count(p.object_type_code)::integer AS effective_grant_count,
    count(p.object_type_code) FILTER (
      WHERE p.grantee_name IN (SELECT rolname FROM target_roles)
    )::integer AS prohibited_grant_count,
    COALESCE(
      string_agg(
        p.grantee_name || ':' || p.privilege_type || ':grantable=' || p.is_grantable::text,
        ' | ' ORDER BY p.grantee_name, p.privilege_type
      ),
      '(none observed)'
    ) AS observed_grants
  FROM expected_object_types e
  LEFT JOIN effective_postgres_public_privileges p
    ON p.object_type_code = e.object_type_code
  GROUP BY e.object_type_code, e.object_type_name
),
default_acl_fingerprint AS (
  SELECT md5(COALESCE(
    string_agg(
      owner_name || ';' || schema_name || ';' || object_type || ';'
        || grantee_name || ';' || privilege_type || ';' || is_grantable::text,
      '|' ORDER BY owner_name, schema_name, object_type, grantee_name,
        privilege_type, is_grantable::text
    ) FILTER (WHERE owner_name = 'postgres' AND schema_name = 'public'),
    '(none observed)'
  )) AS fingerprint
  FROM default_acl_rows
),
supabase_admin_fingerprint AS (
  SELECT md5(COALESCE(
    string_agg(
      owner_name || ';' || schema_name || ';' || object_type || ';'
        || grantee_name || ';' || privilege_type || ';' || is_grantable::text,
      '|' ORDER BY schema_name, object_type, grantee_name, privilege_type,
        is_grantable::text
    ) FILTER (WHERE owner_name = 'supabase_admin'),
    '(none observed)'
  )) AS fingerprint
  FROM default_acl_rows
),
outside_public_fingerprint AS (
  SELECT md5(COALESCE(
    string_agg(
      n.nspname || ';owner=' || COALESCE(r.rolname, 'UNKNOWN') || ';acl='
        || COALESCE(n.nspacl::text, '(null)'),
      '|' ORDER BY n.nspname
    ) FILTER (WHERE n.nspname <> 'public'),
    '(none observed)'
  )) AS fingerprint
  FROM pg_catalog.pg_namespace n
  LEFT JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
),
existing_object_acl_fingerprint AS (
  SELECT md5(COALESCE(
    string_agg(
      n.nspname || '.' || c.relname || ';owner=' || COALESCE(owner_role.rolname, 'UNKNOWN')
        || ';acl=' || COALESCE(c.relacl::text, '(null)'),
      '|' ORDER BY n.nspname, c.relname
    ) FILTER (WHERE n.nspname = 'public'),
    '(none observed)'
  )) AS fingerprint
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = c.relowner
  WHERE c.relkind IN ('r', 'p', 'm', 'v', 'f')
),
checks AS (
  SELECT
    'script_version' AS check_name,
    '2026-08-11-default-acl-post-verifier-v1' AS expected,
    '2026-08-11-default-acl-post-verifier-v1' AS observed,
    'INFO' AS verdict
  UNION ALL
  SELECT 'session:current_user', 'postgres', s.current_user_name,
    CASE WHEN s.current_user_name = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  FROM session_identity s
  UNION ALL
  SELECT 'session:session_user', 'postgres', s.session_user_name,
    CASE WHEN s.session_user_name = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  FROM session_identity s
  UNION ALL
  SELECT 'session:current_role', 'postgres', s.current_role_name,
    CASE WHEN s.current_role_name = 'postgres' THEN 'PASS' ELSE 'FAIL' END
  FROM session_identity s
  UNION ALL
  SELECT 'target:default_acl_role', 'postgres',
    CASE WHEN EXISTS (SELECT 1 FROM postgres_role)
      THEN 'postgres' ELSE 'MISSING' END,
    CASE WHEN EXISTS (SELECT 1 FROM postgres_role) THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'target:schema', 'public',
    CASE WHEN EXISTS (SELECT 1 FROM public_schema) THEN 'public' ELSE 'MISSING' END,
    CASE WHEN EXISTS (SELECT 1 FROM public_schema) THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'target:schema_owner', 'pg_database_owner',
    COALESCE((SELECT p.owner_name FROM public_schema p), 'MISSING'),
    CASE WHEN (SELECT p.owner_name FROM public_schema p) = 'pg_database_owner'
      THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'future:' || object_type_name || ':prohibited_grants',
    '0 grants to PUBLIC/anon/authenticated/service_role',
    prohibited_grant_count::text || ';observed=' || observed_grants,
    CASE WHEN prohibited_grant_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM postgres_public_defaults
  UNION ALL
  SELECT 'default_acl:postgres_public:fingerprint',
    'record for comparison with preflight snapshot', f.fingerprint, 'INFO'
  FROM default_acl_fingerprint f
  UNION ALL
  SELECT 'default_acl:supabase_admin:unchanged',
    'must equal saved preflight fingerprint', f.fingerprint, 'INFO'
  FROM supabase_admin_fingerprint f
  UNION ALL
  SELECT 'schemas:outside_public:unchanged',
    'must equal saved preflight fingerprint', f.fingerprint, 'INFO'
  FROM outside_public_fingerprint f
  UNION ALL
  SELECT 'existing_objects:acl:unchanged',
    'must equal saved preflight fingerprint', f.fingerprint, 'INFO'
  FROM existing_object_acl_fingerprint f
  UNION ALL
  SELECT 'data:mutation',
    'not provable from catalog-only verification; compare saved data snapshot',
    'catalog-only; no DML executed by this script', 'INFO'
)
SELECT
  '2026-08-11-default-acl-post-verifier-v1' AS script_version,
  check_name,
  expected,
  observed,
  verdict
FROM checks
ORDER BY check_name;
