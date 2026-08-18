/*
  0037 preflight: execute the complete file as one read-only statement.
  The preserved-catalog fingerprint is captured here and must be copied to
  the post-verifier without changing its algorithm or scope.
*/
WITH
required_relations(relation_name) AS (
  VALUES
    ('public.agencies'),
    ('public.agency_applications'),
    ('public.agency_invitations'),
    ('public.agency_onboardings'),
    ('public.agency_memberships'),
    ('auth.users')
),
required_relation_state AS (
  SELECT relation_name, to_regclass(relation_name) IS NOT NULL AS present
  FROM required_relations
),
preserved_relation_names(schema_name, relation_name) AS (
  VALUES
    ('public', 'agencies'),
    ('public', 'agency_applications'),
    ('public', 'agency_invitations'),
    ('public', 'agency_onboardings'),
    ('public', 'agency_memberships')
),
preserved_relations AS (
  SELECT
    n.nspname::text AS schema_name,
    c.relname::text AS relation_name,
    c.oid,
    c.relkind::text AS relkind,
    pg_get_userbyid(c.relowner)::text AS owner_name,
    c.relrowsecurity::text AS rls_enabled,
    coalesce(array_to_string(c.relacl, ','), 'NULL')::text AS acl_text
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN preserved_relation_names AS pr
    ON pr.schema_name = n.nspname::text
   AND pr.relation_name = c.relname::text
),
preserved_columns AS (
  SELECT
    format(
      'column|%s.%s|%s|%s|%s|%s|%s',
      r.schema_name,
      r.relation_name,
      a.attnum::text,
      a.attname::text,
      format_type(a.atttypid, a.atttypmod),
      a.attnotnull::text,
      a.attidentity::text
    ) AS row_data
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = r.oid
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND NOT (
      r.schema_name = 'public'
      AND r.relation_name = 'agency_invitations'
      AND a.attname = 'access_expires_at'
    )
),
preserved_relation_rows AS (
  SELECT
    format(
      'relation|%s.%s|%s|%s|%s|%s|%s',
      r.schema_name,
      r.relation_name,
      r.relkind,
      r.owner_name,
      r.rls_enabled,
      r.acl_text,
      (
        SELECT count(*)::text
        FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = r.oid
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND NOT (
            r.schema_name = 'public'
            AND r.relation_name = 'agency_invitations'
            AND a.attname = 'access_expires_at'
          )
      )
    ) AS row_data
  FROM preserved_relations AS r
),
preserved_constraints AS (
  SELECT
    format(
      'constraint|%s.%s|%s|%s|%s|%s',
      n.nspname::text,
      rel.relname::text,
      c.conname::text,
      c.contype::text,
      c.convalidated::text,
      pg_catalog.pg_get_constraintdef(c.oid, true)
    ) AS row_data
  FROM pg_catalog.pg_constraint AS c
  JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
  JOIN preserved_relations AS r ON r.oid = c.conrelid
  WHERE NOT (
    r.schema_name = 'public'
    AND r.relation_name = 'agency_invitations'
    AND c.conname = 'ck_agency_invitations_trusted_access_expiry_0037'
  )
),
preserved_indexes AS (
  SELECT
    format(
      'index|%s.%s|%s|%s|%s',
      n.nspname::text,
      rel.relname::text,
      idx.relname::text,
      i.indisunique::text,
      pg_catalog.pg_get_indexdef(i.indexrelid)
    ) AS row_data
  FROM pg_catalog.pg_index AS i
  JOIN pg_catalog.pg_class AS rel ON rel.oid = i.indrelid
  JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
  JOIN preserved_relations AS r ON r.oid = i.indrelid
),
preserved_policies AS (
  SELECT
    format(
      'policy|%s.%s|%s|%s|%s|%s|%s|%s',
      p.schemaname::text,
      p.tablename::text,
      p.policyname::text,
      p.cmd::text,
      p.permissive::text,
      coalesce(array_to_string(p.roles::text[], ','), 'NULL'),
      coalesce(p.qual, 'NULL'),
      coalesce(p.with_check, 'NULL')
    ) AS row_data
  FROM pg_catalog.pg_policies AS p
  JOIN preserved_relation_names AS pr
    ON pr.schema_name = p.schemaname::text
   AND pr.relation_name = p.tablename::text
),
preserved_function_names(function_identity) AS (
  VALUES
    ('public.approve_agency_application(uuid,uuid,text,timestamptz)'),
    ('public.create_agency_invitation_token_generation(uuid,text)'),
    ('public.renew_agency_invitation(uuid,uuid,timestamptz,timestamptz,text,text)'),
    ('public.complete_agency_onboarding(uuid,uuid,uuid,text)'),
    ('public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)'),
    ('public.canonical_assert_rpc_actor(uuid)')
),
preserved_functions AS (
  SELECT
    format(
      'function|%s|%s|%s|%s|%s|%s',
      f.function_identity,
      coalesce(pg_get_userbyid(p.proowner)::text, 'MISSING'),
      coalesce(p.prosecdef::text, 'MISSING'),
      coalesce(array_to_string(p.proconfig, ','), 'NULL'),
      coalesce(array_to_string(p.proacl, ','), 'NULL'),
      coalesce(md5(pg_get_functiondef(p.oid)), 'MISSING')
    ) AS row_data
  FROM preserved_function_names AS f
  LEFT JOIN pg_catalog.pg_proc AS p
    ON p.oid = to_regprocedure(f.function_identity)::oid
),
preserved_catalog_rows AS (
  SELECT row_data FROM preserved_relation_rows
  UNION ALL SELECT row_data FROM preserved_columns
  UNION ALL SELECT row_data FROM preserved_constraints
  UNION ALL SELECT row_data FROM preserved_indexes
  UNION ALL SELECT row_data FROM preserved_policies
  UNION ALL SELECT row_data FROM preserved_functions
),
preserved_catalog AS (
  SELECT
    md5(coalesce(string_agg(row_data, '|' ORDER BY row_data), '')) AS fingerprint,
    count(*)::text AS row_count
  FROM preserved_catalog_rows
),
default_acl_rows AS (
  SELECT format(
    'default_acl|%s|%s|%s|%s',
    coalesce(pg_get_userbyid(d.defaclrole)::text, 'NULL'),
    coalesce(n.nspname::text, '*'),
    d.defaclobjtype::text,
    coalesce(array_to_string(d.defaclacl, ','), 'NULL')
  ) AS row_data
  FROM pg_catalog.pg_default_acl AS d
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
  WHERE d.defaclnamespace = 0 OR n.nspname::text = 'public'
),
default_acl_fingerprint AS (
  SELECT
    md5(coalesce(string_agg(row_data, '|' ORDER BY row_data), '')) AS fingerprint,
    count(*)::text AS row_count
  FROM default_acl_rows
),
column_checks AS (
  SELECT count(*)::integer AS access_expiry_columns
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = 'public.agency_invitations'::regclass
    AND a.attname = 'access_expires_at'
    AND NOT a.attisdropped
),
onboarding_constraints AS (
  SELECT
    count(*) FILTER (WHERE pg_catalog.pg_get_constraintdef(c.oid, true) ILIKE '%idempotency_key%')::integer AS idempotency_unique,
    count(*) FILTER (WHERE pg_catalog.pg_get_constraintdef(c.oid, true) ILIKE '%invitation_id%')::integer AS invitation_unique,
    count(*) FILTER (WHERE pg_catalog.pg_get_constraintdef(c.oid, true) ILIKE '%agency_id%')::integer AS agency_unique
  FROM pg_catalog.pg_constraint AS c
  WHERE c.conrelid = 'public.agency_onboardings'::regclass
    AND c.contype = 'u'
),
private_rls AS (
  SELECT count(*) FILTER (WHERE c.relrowsecurity)::integer AS enabled_count
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('agency_applications', 'agency_invitations', 'agency_onboardings')
),
checks(check_order, check_name, expected, observed, verdict) AS (
  SELECT 10, 'script_version', '2026-08-13-v2', '2026-08-13-v2', 'INFO'
  UNION ALL SELECT 20, 'session:current_user', 'catalog role captured', current_user::text, 'INFO'
  UNION ALL SELECT 21, 'session:session_user', 'catalog role captured', session_user::text, 'INFO'
  UNION ALL SELECT 22, 'session:current_role', 'catalog role captured', current_role::text, 'INFO'
  UNION ALL
  SELECT 30, 'required_relations', '6', count(*) FILTER (WHERE present)::text,
    CASE WHEN count(*) FILTER (WHERE present) = 6 THEN 'PASS' ELSE 'FAIL' END
  FROM required_relation_state
  UNION ALL
  SELECT 40, 'new_table_absent', 'agency_access_periods absent',
    CASE WHEN to_regclass('public.agency_access_periods') IS NULL THEN 'ABSENT' ELSE 'PRESENT' END,
    CASE WHEN to_regclass('public.agency_access_periods') IS NULL THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 41, 'new_rpc_absent', 'both successor RPCs absent',
    (CASE WHEN to_regprocedure('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)') IS NULL THEN 1 ELSE 0 END
      + CASE WHEN to_regprocedure('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)') IS NULL THEN 1 ELSE 0 END)::text || '/2',
    CASE WHEN to_regprocedure('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)') IS NULL
       AND to_regprocedure('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)') IS NULL THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 42, 'new_invitation_column_absent', 'access_expires_at absent before apply', access_expiry_columns::text,
    CASE WHEN access_expiry_columns = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM column_checks
  UNION ALL
  SELECT 50, 'onboarding_constraints', 'idempotency + invitation + agency uniqueness',
    format('%s/%s/%s', idempotency_unique, invitation_unique, agency_unique),
    CASE WHEN idempotency_unique >= 1 AND invitation_unique >= 1 AND agency_unique >= 1 THEN 'PASS' ELSE 'FAIL' END
  FROM onboarding_constraints
  UNION ALL
  SELECT 51, 'private_onboarding_rls', '3/3 enabled', enabled_count::text || '/3',
    CASE WHEN enabled_count = 3 THEN 'PASS' ELSE 'FAIL' END
  FROM private_rls
  UNION ALL
  SELECT 60, 'private_onboarding_anon_access', 'anon has no SELECT',
    CASE WHEN has_table_privilege('anon', 'public.agency_invitations', 'SELECT') THEN 'SELECT' ELSE 'NONE' END,
    CASE WHEN NOT has_table_privilege('anon', 'public.agency_invitations', 'SELECT') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 61, 'private_onboarding_authenticated_access', 'authenticated has no direct SELECT',
    CASE WHEN has_table_privilege('authenticated', 'public.agency_invitations', 'SELECT') THEN 'SELECT' ELSE 'NONE' END,
    CASE WHEN NOT has_table_privilege('authenticated', 'public.agency_invitations', 'SELECT') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 70, 'pre:preserved_catalog_fingerprint', 'capture this value for post-verifier', fingerprint, 'PASS'
  FROM preserved_catalog
  UNION ALL
  SELECT 71, 'pre:preserved_catalog_row_count', 'non-zero catalog snapshot', row_count, CASE WHEN row_count::integer > 0 THEN 'PASS' ELSE 'FAIL' END
  FROM preserved_catalog
  UNION ALL
  SELECT 72, 'pre:default_acl_fingerprint', 'capture this value for post-verifier', fingerprint, 'PASS'
  FROM default_acl_fingerprint
  UNION ALL
  SELECT 73, 'pre:default_acl_row_count', 'catalog snapshot captured', row_count, 'INFO'
  FROM default_acl_fingerprint
),
final_result AS (
  SELECT check_order, check_name, expected, observed, verdict FROM checks
  UNION ALL
  SELECT 1000, 'final_classification', 'READY_FOR_AGENCY_ACCESS_PERIOD_REMOTE_PREFLIGHT',
    CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'READY_FOR_AGENCY_ACCESS_PERIOD_REMOTE_PREFLIGHT' ELSE 'BLOCKED' END,
    CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM checks
)
SELECT check_name, expected, observed, verdict
FROM final_result
ORDER BY check_order, check_name;
