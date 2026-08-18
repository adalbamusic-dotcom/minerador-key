-- Diagnostico read-only da proveniencia dos grants extras da 0020.
-- Nao consulta linhas de negocio, segredos, tokens, hashes ou UUIDs.
-- Resultado unico: uma linha por objeto/privilégio alvo.

WITH
target_privileges(object_name, privilege_type, migration_contract) AS (
  VALUES
    ('agency_invitation_token_generations', 'INSERT', 'NOT_GRANTED_BY_0020'),
    ('agency_invitation_token_generations', 'UPDATE', 'NOT_GRANTED_BY_0020'),
    ('agency_invitation_token_generations', 'DELETE', 'NOT_GRANTED_BY_0020'),
    ('communication_delivery_events', 'UPDATE', 'NOT_GRANTED_BY_0020'),
    ('communication_delivery_events', 'DELETE', 'NOT_GRANTED_BY_0020'),
    ('communication_messages', 'DELETE', 'NOT_GRANTED_BY_0020'),
    ('communication_templates', 'DELETE', 'NOT_GRANTED_BY_0020')
),
object_catalog AS (
  SELECT
    t.object_name,
    t.privilege_type,
    t.migration_contract,
    c.oid AS relation_oid,
    c.relowner,
    owner_role.rolname AS object_owner,
    c.relacl,
    service_role.oid AS service_role_oid,
    CASE
      WHEN c.oid IS NULL OR service_role.oid IS NULL THEN NULL
      ELSE has_table_privilege('service_role', 'public.' || t.object_name, t.privilege_type)
    END AS effective_remote
  FROM target_privileges t
  LEFT JOIN pg_catalog.pg_class c
    ON c.relnamespace = 'public'::regnamespace
   AND c.relname = t.object_name
  LEFT JOIN pg_catalog.pg_roles owner_role
    ON owner_role.oid = c.relowner
  LEFT JOIN pg_catalog.pg_roles service_role
    ON service_role.rolname = 'service_role'
),
object_acl_detail AS (
  SELECT
    o.*,
    acl.grantee_name AS object_grantee,
    acl.privilege_type AS object_privilege_type,
    acl.grantor_name AS object_grantor,
    acl.is_grantable AS object_is_grantable,
    acl.explicit_remote
  FROM object_catalog o
  LEFT JOIN LATERAL (
    SELECT
      true AS explicit_remote,
      grantee_role.rolname AS grantee_name,
      a.privilege_type,
      grantor_role.rolname AS grantor_name,
      a.is_grantable
    FROM aclexplode(coalesce(o.relacl, ARRAY[]::aclitem[])) a
    LEFT JOIN pg_catalog.pg_roles grantee_role
      ON grantee_role.oid = a.grantee
    LEFT JOIN pg_catalog.pg_roles grantor_role
      ON grantor_role.oid = a.grantor
    WHERE a.grantee = o.service_role_oid
      AND a.privilege_type = o.privilege_type
    ORDER BY a.grantor, a.grantee, a.privilege_type
    LIMIT 1
  ) acl ON true
),
default_acl_detail AS (
  SELECT
    d.defaclnamespace,
    CASE WHEN d.defaclnamespace = 0::oid THEN 'GLOBAL' ELSE coalesce(namespace_role.nspname, 'UNKNOWN_SCHEMA') END AS default_acl_scope,
    default_owner.rolname AS default_acl_owner,
    grantee_role.rolname AS default_grantee,
    a.privilege_type AS default_privilege_type,
    grantor_role.rolname AS default_grantor,
    a.is_grantable AS default_is_grantable,
    d.defaclacl::text AS default_acl
  FROM pg_catalog.pg_default_acl d
  LEFT JOIN pg_catalog.pg_namespace namespace_role
    ON namespace_role.oid = d.defaclnamespace
  LEFT JOIN pg_catalog.pg_roles default_owner
    ON default_owner.oid = d.defaclrole
  CROSS JOIN LATERAL aclexplode(coalesce(d.defaclacl, ARRAY[]::aclitem[])) a
  LEFT JOIN pg_catalog.pg_roles grantee_role
    ON grantee_role.oid = a.grantee
  LEFT JOIN pg_catalog.pg_roles grantor_role
    ON grantor_role.oid = a.grantor
  WHERE d.defaclobjtype = 'r'
    AND (d.defaclnamespace = 0::oid OR namespace_role.nspname = 'public')
    AND a.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
    AND a.privilege_type IN (SELECT privilege_type FROM target_privileges)
),
default_acl_summary AS (
  SELECT
    count(*)::integer AS relevant_default_acl_count,
    string_agg(
      format(
        'scope=%s;default_owner=%s;grantee=%s;privilege=%s;grantor=%s;grantable=%s',
        default_acl_scope,
        coalesce(default_acl_owner, 'UNKNOWN'),
        coalesce(default_grantee, 'UNKNOWN'),
        default_privilege_type,
        coalesce(default_grantor, 'UNKNOWN'),
        default_is_grantable
      ),
      ' | ' ORDER BY default_acl_scope, default_acl_owner, default_privilege_type
    ) AS relevant_default_acl_detail,
    string_agg(DISTINCT default_acl, ' | ' ORDER BY default_acl) AS relevant_default_acl_raw
  FROM default_acl_detail
),
role_membership_summary AS (
  SELECT
    count(parent_role.oid)::integer AS service_role_membership_count,
    coalesce(string_agg(parent_role.rolname, ', ' ORDER BY parent_role.rolname), 'NONE') AS service_role_member_of
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles member_role
    ON member_role.oid = membership.member
  JOIN pg_catalog.pg_roles parent_role
    ON parent_role.oid = membership.roleid
  WHERE member_role.rolname = 'service_role'
)
SELECT
  '2026-08-10-acl-provenance-v1'::text AS diagnostic_version,
  a.object_name,
  a.privilege_type,
  a.migration_contract,
  (a.relation_oid IS NOT NULL) AS object_exists,
  a.object_owner,
  (a.object_owner = 'service_role') AS owner_is_service_role,
  (a.relacl IS NOT NULL) AS object_acl_present,
  coalesce(a.explicit_remote, false) AS explicit_remote,
  a.object_grantee,
  a.object_privilege_type,
  a.object_grantor,
  a.object_is_grantable,
  a.relacl::text AS object_acl,
  a.effective_remote,
  (coalesce(d.relevant_default_acl_count, 0) > 0) AS default_acl_relevant,
  coalesce(d.relevant_default_acl_count, 0) AS relevant_default_acl_count,
  d.relevant_default_acl_detail,
  d.relevant_default_acl_raw,
  r.service_role_membership_count,
  r.service_role_member_of,
  CASE
    WHEN a.relation_oid IS NULL THEN 'OBJECT_MISSING'
    WHEN coalesce(a.explicit_remote, false) THEN 'OBJECT_ACL_EXPLICIT'
    WHEN a.object_owner = 'service_role' THEN 'OWNER_PRIVILEGE_POSSIBLE'
    WHEN coalesce(d.relevant_default_acl_count, 0) > 0 THEN 'DEFAULT_ACL_POSSIBLE'
    WHEN r.service_role_membership_count > 0 THEN 'ROLE_MEMBERSHIP_POSSIBLE'
    ELSE 'NO_DIRECT_PROVENANCE_SIGNAL'
  END AS provenance_signal
FROM object_acl_detail a
CROSS JOIN default_acl_summary d
CROSS JOIN role_membership_summary r
ORDER BY a.object_name, a.privilege_type;
