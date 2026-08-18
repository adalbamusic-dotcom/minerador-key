-- AgencyInvitation lifecycle 0023 RPC diagnostic.
-- SOMENTE LEITURA. Execute manualmente para diagnosticar o catalogo remoto.
-- Um unico result set; nao retorna dados de usuario, e-mail, token, hash,
-- payload ou definicao completa de funcao.
-- SCRIPT_VERSION=2026-08-10-0023-rpc-diagnostic-v1
WITH
target_names AS (
  SELECT *
  FROM (VALUES
    ('approve_agency_application'::name),
    ('complete_agency_onboarding'::name),
    ('complete_agency_onboarding_with_token'::name),
    ('create_agency_invitation_token_generation'::name),
    ('renew_agency_invitation'::name)
  ) AS value(proname)
),
existing_functions AS (
  SELECT
    n.nspname::text AS schema_name,
    p.proname::text AS proname,
    p.oid::oid AS function_oid,
    pg_get_function_identity_arguments(p.oid)::text AS identity_arguments,
    pg_get_function_result(p.oid)::text AS return_type,
    pg_get_userbyid(p.proowner)::text AS owner_name,
    p.prosecdef::boolean AS security_definer,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'INVOKER' END::text AS security_mode,
    coalesce(array_to_string(p.proconfig, ', '), 'NULL (default)')::text AS proconfig_search_path,
    coalesce((
      SELECT string_agg(
        CASE
          WHEN acl.grantee = 0 THEN 'PUBLIC'
          ELSE coalesce(pg_get_userbyid(acl.grantee), acl.grantee::text)
        END || ':' || acl.privilege_type,
        ' | ' ORDER BY acl.grantee, acl.privilege_type
      )
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
      WHERE acl.privilege_type = 'EXECUTE'
    ), 'none')::text AS execute_acl_summary,
    md5(pg_get_functiondef(p.oid))::text AS function_definition_md5
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN target_names target ON target.proname = p.proname
  WHERE n.nspname = 'public'
),
renew_count AS (
  SELECT count(*)::integer AS observed_count
  FROM existing_functions
  WHERE proname = 'renew_agency_invitation'
),
function_rows AS (
  SELECT
    'function'::text AS record_kind,
    schema_name,
    proname,
    function_oid,
    identity_arguments,
    return_type,
    owner_name,
    security_definer,
    security_mode,
    proconfig_search_path,
    execute_acl_summary,
    function_definition_md5,
    NULL::integer AS observed_count
  FROM existing_functions
),
count_row AS (
  SELECT
    'renew_agency_invitation_count'::text AS record_kind,
    NULL::text AS schema_name,
    'renew_agency_invitation'::text AS proname,
    NULL::oid AS function_oid,
    NULL::text AS identity_arguments,
    NULL::text AS return_type,
    NULL::text AS owner_name,
    NULL::boolean AS security_definer,
    NULL::text AS security_mode,
    NULL::text AS proconfig_search_path,
    NULL::text AS execute_acl_summary,
    NULL::text AS function_definition_md5,
    observed_count
  FROM renew_count
)
SELECT
  record_kind,
  schema_name,
  proname,
  function_oid,
  identity_arguments,
  return_type,
  owner_name,
  security_definer,
  security_mode,
  proconfig_search_path,
  execute_acl_summary,
  function_definition_md5,
  observed_count
FROM (
  SELECT * FROM function_rows
  UNION ALL
  SELECT * FROM count_row
) diagnostic_rows
ORDER BY
  CASE WHEN record_kind = 'renew_agency_invitation_count' THEN 2 ELSE 1 END,
  proname,
  identity_arguments NULLS LAST,
  function_oid NULLS LAST;
