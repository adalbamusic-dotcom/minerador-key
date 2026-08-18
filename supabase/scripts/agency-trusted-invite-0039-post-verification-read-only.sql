-- 0039 post-verifier — read-only, one result set
-- Baselines below were captured by the 0039 preflight before its apply.

WITH
script_meta AS (
  SELECT '2026-08-13-v2'::text AS script_version
),
expected_baselines AS (
  SELECT
    '914c51d5f93f843a06e7f99ad765e681'::text AS catalog_fingerprint,
    '6514acb46db2e6ac8001c8cbd56ebfc1'::text AS default_acl_fingerprint,
    'agencies=3|agency_access_periods=2|agency_applications=1|agency_invitations=3|agency_memberships=3|agency_onboardings=2'::text AS business_row_counts
),
required_relations(relation_name) AS (
  VALUES
    ('public.agencies'::text),
    ('public.agency_applications'::text),
    ('public.agency_invitations'::text),
    ('public.agency_onboardings'::text),
    ('public.agency_memberships'::text),
    ('public.agency_access_periods'::text)
),
preserved_relations(schema_name, relation_name) AS (
  VALUES
    ('public'::text, 'agencies'::text),
    ('public'::text, 'agency_applications'::text),
    ('public'::text, 'agency_invitations'::text),
    ('public'::text, 'agency_onboardings'::text),
    ('public'::text, 'agency_memberships'::text),
    ('public'::text, 'agency_access_periods'::text)
),
preserved_functions(schema_name, function_name, identity_arguments) AS (
  VALUES
    ('public'::text, 'complete_agency_onboarding_with_access'::text, 'uuid,uuid,uuid,text,text'::text),
    ('public'::text, 'complete_agency_onboarding_authenticated_with_access'::text, 'uuid,uuid,uuid,text'::text),
    ('public'::text, 'canonical_assert_rpc_actor'::text, 'uuid'::text)
),
relation_presence AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (
      WHERE pg_catalog.to_regclass(rr.relation_name) IS NOT NULL
    )::integer AS present_count
  FROM required_relations AS rr
),
auth_users_presence AS (
  SELECT (pg_catalog.to_regclass('auth.users') IS NOT NULL) AS present
),
preserved_function_presence AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (
      WHERE pg_catalog.to_regprocedure(
        pg_catalog.format('%s.%s(%s)', pf.schema_name, pf.function_name, pf.identity_arguments)
      ) IS NOT NULL
    )::integer AS present_count
  FROM preserved_functions AS pf
),
successor_state AS (
  SELECT
    p.oid,
    p.proowner,
    pg_catalog.pg_get_userbyid(p.proowner)::text AS owner_name,
    p.prosecdef,
    p.provolatile::text AS volatility,
    coalesce(pg_catalog.array_to_string(p.proconfig, ','), 'NULL') AS config_text,
    pg_catalog.pg_get_function_result(p.oid)::text AS result_text,
    p.proacl
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.complete_agency_onboarding_with_confirmed_agency_name(uuid,uuid,uuid,text,text,text)'
  )::oid
),
successor_contract AS (
  SELECT
    count(*)::integer AS function_count,
    coalesce(bool_and(owner_name = 'postgres'), false) AS owner_ok,
    coalesce(bool_and(prosecdef), false) AS security_definer_ok,
    coalesce(bool_and(volatility = 'v'), false) AS volatile_ok,
    coalesce(bool_and(config_text = 'search_path=pg_catalog, public, pg_temp'), false) AS search_path_ok,
    coalesce(bool_and(
      replace(result_text, ' ', '') =
      'TABLE(agency_iduuid,agency_nametext,agency_slugtext,membership_iduuid,access_period_iduuid,access_origintext,access_starts_attimestampwithtimezone,access_ends_attimestampwithtimezone)'
    ), false) AS result_shape_ok
  FROM successor_state
),
successor_acl_entries AS (
  SELECT
    CASE
      WHEN expanded.grantee = 0 THEN 'PUBLIC'::text
      ELSE pg_catalog.pg_get_userbyid(expanded.grantee)::text
    END AS grantee_name,
    expanded.privilege_type::text AS privilege_type,
    expanded.is_grantable::text AS is_grantable
  FROM successor_state AS ss
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(ss.proacl, pg_catalog.acldefault('f', ss.proowner))
  ) AS expanded
),
successor_acl_state AS (
  SELECT
    count(*) FILTER (WHERE sae.grantee_name = 'service_role' AND sae.privilege_type = 'EXECUTE')::integer AS service_execute_count,
    count(*) FILTER (WHERE sae.grantee_name IN ('PUBLIC', 'anon', 'authenticated'))::integer AS forbidden_consumer_count,
    count(*) FILTER (WHERE sae.grantee_name NOT IN ('PUBLIC', 'anon', 'authenticated', 'postgres', 'service_role'))::integer AS unexpected_grantee_count,
    count(*) FILTER (WHERE sae.privilege_type <> 'EXECUTE')::integer AS unexpected_privilege_count,
    coalesce(pg_catalog.string_agg(
      pg_catalog.format('%s:%s:grantable=%s', sae.grantee_name, sae.privilege_type, sae.is_grantable),
      ' | ' ORDER BY sae.grantee_name, sae.privilege_type, sae.is_grantable
    ), 'NONE') AS acl_text
  FROM successor_acl_entries AS sae
),
invitation_columns AS (
  SELECT
    count(*) FILTER (
      WHERE a.attname = 'proposed_agency_name'
        AND a.atttypid = 'text'::regtype
        AND a.attnotnull
    )::integer AS proposed_name_ok,
    count(*) FILTER (
      WHERE a.attname = 'access_expires_at'
        AND a.atttypid = 'timestamptz'::regtype
    )::integer AS access_expiry_ok
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = 'public.agency_invitations'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
),
required_constraints AS (
  SELECT
    count(*) FILTER (
      WHERE c.conname = 'ck_agency_invitations_trusted_access_expiry_0037'
        AND c.conrelid = 'public.agency_invitations'::regclass
        AND c.contype = 'c'
    )::integer AS invitation_access_check,
    count(*) FILTER (
      WHERE c.conrelid = 'public.agency_access_periods'::regclass
        AND c.contype = 'p'
    )::integer AS access_primary_key,
    count(*) FILTER (
      WHERE c.conrelid = 'public.agency_access_periods'::regclass
        AND c.contype = 'f'
        AND c.confdeltype = 'r'
    )::integer AS access_restricted_fks,
    count(*) FILTER (
      WHERE c.conrelid = 'public.agency_access_periods'::regclass
        AND c.contype = 'c'
    )::integer AS access_checks
  FROM pg_catalog.pg_constraint AS c
  WHERE c.conrelid IN (
    'public.agency_invitations'::regclass,
    'public.agency_access_periods'::regclass
  )
),
catalog_relation_rows AS (
  SELECT pg_catalog.format(
    'relation|%s.%s|kind=%s|owner=%s|rls=%s|force=%s|acl=%s',
    n.nspname::text,
    c.relname::text,
    c.relkind::text,
    pg_catalog.pg_get_userbyid(c.relowner)::text,
    c.relrowsecurity::text,
    c.relforcerowsecurity::text,
    coalesce(pg_catalog.array_to_string(c.relacl, ','), 'NULL')
  ) AS row_data
  FROM preserved_relations AS pr
  JOIN pg_catalog.pg_namespace AS n
    ON n.nspname = pr.schema_name
  JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = pr.relation_name
),
catalog_column_rows AS (
  SELECT pg_catalog.format(
    'column|%s.%s|attnum=%s|name=%s|type=%s|notnull=%s|identity=%s|generated=%s',
    n.nspname::text,
    c.relname::text,
    a.attnum::text,
    a.attname::text,
    pg_catalog.format_type(a.atttypid, a.atttypmod)::text,
    a.attnotnull::text,
    a.attidentity::text,
    a.attgenerated::text
  ) AS row_data
  FROM preserved_relations AS pr
  JOIN pg_catalog.pg_namespace AS n
    ON n.nspname = pr.schema_name
  JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = pr.relation_name
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = c.oid
   AND a.attnum > 0
   AND NOT a.attisdropped
),
catalog_constraint_rows AS (
  SELECT pg_catalog.format(
    'constraint|%s.%s|name=%s|type=%s|validated=%s|definition=%s',
    n.nspname::text,
    c.relname::text,
    con.conname::text,
    con.contype::text,
    con.convalidated::text,
    pg_catalog.pg_get_constraintdef(con.oid, true)::text
  ) AS row_data
  FROM preserved_relations AS pr
  JOIN pg_catalog.pg_namespace AS n
    ON n.nspname = pr.schema_name
  JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = pr.relation_name
  JOIN pg_catalog.pg_constraint AS con
    ON con.conrelid = c.oid
),
catalog_index_rows AS (
  SELECT pg_catalog.format(
    'index|%s.%s|name=%s|unique=%s|valid=%s|definition=%s',
    n.nspname::text,
    c.relname::text,
    idx.relname::text,
    i.indisunique::text,
    i.indisvalid::text,
    pg_catalog.pg_get_indexdef(i.indexrelid)::text
  ) AS row_data
  FROM preserved_relations AS pr
  JOIN pg_catalog.pg_namespace AS n
    ON n.nspname = pr.schema_name
  JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = pr.relation_name
  JOIN pg_catalog.pg_index AS i
    ON i.indrelid = c.oid
  JOIN pg_catalog.pg_class AS idx
    ON idx.oid = i.indexrelid
),
catalog_policy_rows AS (
  SELECT pg_catalog.format(
    'policy|%s.%s|name=%s|permissive=%s|roles=%s|cmd=%s|using=%s|check=%s',
    p.schemaname::text,
    p.tablename::text,
    p.policyname::text,
    p.permissive::text,
    p.roles::text,
    p.cmd::text,
    coalesce(p.qual::text, 'NULL'),
    coalesce(p.with_check::text, 'NULL')
  ) AS row_data
  FROM pg_catalog.pg_policies AS p
  WHERE (p.schemaname, p.tablename) IN (
    SELECT pr.schema_name, pr.relation_name
    FROM preserved_relations AS pr
  )
),
catalog_trigger_rows AS (
  SELECT pg_catalog.format(
    'trigger|%s.%s|name=%s|enabled=%s|type=%s|function=%s',
    n.nspname::text,
    c.relname::text,
    t.tgname::text,
    t.tgenabled::text,
    t.tgtype::text,
    (t.tgfoid::regprocedure)::text
  ) AS row_data
  FROM preserved_relations AS pr
  JOIN pg_catalog.pg_namespace AS n
    ON n.nspname = pr.schema_name
  JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = pr.relation_name
  JOIN pg_catalog.pg_trigger AS t
    ON t.tgrelid = c.oid
   AND NOT t.tgisinternal
),
catalog_function_rows AS (
  SELECT pg_catalog.format(
    'function|%s.%s(%s)|owner=%s|result=%s|kind=%s|security_definer=%s|volatility=%s|config=%s|acl=%s|definition=%s',
    n.nspname::text,
    p.proname::text,
    pg_catalog.pg_get_function_identity_arguments(p.oid)::text,
    pg_catalog.pg_get_userbyid(p.proowner)::text,
    pg_catalog.pg_get_function_result(p.oid)::text,
    p.prokind::text,
    p.prosecdef::text,
    p.provolatile::text,
    coalesce(pg_catalog.array_to_string(p.proconfig, ','), 'NULL'),
    coalesce(pg_catalog.array_to_string(p.proacl, ','), 'NULL'),
    md5(pg_catalog.pg_get_functiondef(p.oid))
  ) AS row_data
  FROM preserved_functions AS pf
  JOIN pg_catalog.pg_namespace AS n
    ON n.nspname = pf.schema_name
  JOIN pg_catalog.pg_proc AS p
    ON p.pronamespace = n.oid
   AND p.proname = pf.function_name
   AND replace(pg_catalog.pg_get_function_identity_arguments(p.oid), ' ', '') = replace(pf.identity_arguments, ' ', '')
),
catalog_rows AS (
  SELECT row_data FROM catalog_relation_rows
  UNION ALL SELECT row_data FROM catalog_column_rows
  UNION ALL SELECT row_data FROM catalog_constraint_rows
  UNION ALL SELECT row_data FROM catalog_index_rows
  UNION ALL SELECT row_data FROM catalog_policy_rows
  UNION ALL SELECT row_data FROM catalog_trigger_rows
  UNION ALL SELECT row_data FROM catalog_function_rows
),
preserved_catalog_fingerprint AS (
  SELECT md5(coalesce(pg_catalog.string_agg(row_data, '|' ORDER BY row_data), '')) AS fingerprint
  FROM catalog_rows
),
default_acl_rows AS (
  SELECT pg_catalog.format(
    'default_acl|owner=%s|schema=%s|type=%s|acl=%s',
    pg_catalog.pg_get_userbyid(d.defaclrole)::text,
    coalesce(ns.nspname::text, '<global>'),
    d.defaclobjtype::text,
    coalesce(pg_catalog.array_to_string(d.defaclacl, ','), 'NULL')
  ) AS row_data
  FROM pg_catalog.pg_default_acl AS d
  LEFT JOIN pg_catalog.pg_namespace AS ns
    ON ns.oid = d.defaclnamespace
),
default_acl_fingerprint AS (
  SELECT md5(coalesce(pg_catalog.string_agg(row_data, '|' ORDER BY row_data), '')) AS fingerprint
  FROM default_acl_rows
),
business_row_counts AS (
  SELECT pg_catalog.string_agg(table_name || '=' || row_count::text, '|' ORDER BY table_name) AS counts_text
  FROM (
    SELECT 'agency_access_periods'::text AS table_name, count(*)::bigint AS row_count FROM public.agency_access_periods
    UNION ALL SELECT 'agency_applications'::text, count(*)::bigint FROM public.agency_applications
    UNION ALL SELECT 'agency_invitations'::text, count(*)::bigint FROM public.agency_invitations
    UNION ALL SELECT 'agency_memberships'::text, count(*)::bigint FROM public.agency_memberships
    UNION ALL SELECT 'agency_onboardings'::text, count(*)::bigint FROM public.agency_onboardings
    UNION ALL SELECT 'agencies'::text, count(*)::bigint FROM public.agencies
  ) AS counts
),
structural_state AS (
  SELECT
    CASE
      WHEN sc.function_count = 1
       AND sc.owner_ok
       AND sc.security_definer_ok
       AND sc.volatile_ok
       AND sc.search_path_ok
       AND sc.result_shape_ok
       AND sa.service_execute_count = 1
       AND sa.forbidden_consumer_count = 0
       AND sa.unexpected_grantee_count = 0
       AND sa.unexpected_privilege_count = 0
        THEN 'FULLY_EXPECTED_POST_APPLY'::text
      WHEN sc.function_count > 0
        THEN 'PARTIAL_APPLY'::text
      ELSE 'NOT_APPLIED'::text
    END AS migration_state
  FROM successor_contract AS sc
  CROSS JOIN successor_acl_state AS sa
),
checks(check_order, check_name, expected, observed, verdict) AS (
  SELECT 10, 'script_version', '2026-08-13-v2', sm.script_version, 'INFO' FROM script_meta AS sm
  UNION ALL
  SELECT 11, 'migration_state', 'FULLY_EXPECTED_POST_APPLY', ss.migration_state,
    CASE WHEN ss.migration_state = 'FULLY_EXPECTED_POST_APPLY' THEN 'PASS' ELSE 'FAIL' END
  FROM structural_state AS ss
  UNION ALL
  SELECT 20, '0037:required_relations_preserved', '6/6 present', format('%s/%s present', rp.present_count, rp.expected_count),
    CASE WHEN rp.present_count = rp.expected_count THEN 'PASS' ELSE 'FAIL' END
  FROM relation_presence AS rp
  UNION ALL
  SELECT 21, '0037:auth_users_preserved', 'present', CASE WHEN aup.present THEN 'present' ELSE 'missing' END,
    CASE WHEN aup.present THEN 'PASS' ELSE 'FAIL' END
  FROM auth_users_presence AS aup
  UNION ALL
  SELECT 22, '0037:rpc_contracts_preserved', '3/3 present', format('%s/%s present', pfp.present_count, pfp.expected_count),
    CASE WHEN pfp.present_count = pfp.expected_count THEN 'PASS' ELSE 'FAIL' END
  FROM preserved_function_presence AS pfp
  UNION ALL
  SELECT 30, '0039:successor_presence', 'present', format('%s/1', sc.function_count),
    CASE WHEN sc.function_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM successor_contract AS sc
  UNION ALL
  SELECT 31, '0039:successor_security_contract', 'owner=postgres;SECURITY DEFINER;VOLATILE;restricted search_path;canonical result',
    format('owner=%s;security_definer=%s;volatility=%s;search_path=%s;result_shape=%s', sc.owner_ok, sc.security_definer_ok, sc.volatile_ok, sc.search_path_ok, sc.result_shape_ok),
    CASE WHEN sc.function_count = 1 AND sc.owner_ok AND sc.security_definer_ok AND sc.volatile_ok AND sc.search_path_ok AND sc.result_shape_ok THEN 'PASS' ELSE 'FAIL' END
  FROM successor_contract AS sc
  UNION ALL
  SELECT 32, '0039:successor_acl', 'service_role EXECUTE; owner postgres allowed; no PUBLIC/anon/authenticated/other roles',
    format('service_execute=%s;forbidden=%s;unexpected_roles=%s;unexpected_privileges=%s;acl=%s', sa.service_execute_count, sa.forbidden_consumer_count, sa.unexpected_grantee_count, sa.unexpected_privilege_count, sa.acl_text),
    CASE WHEN sa.service_execute_count = 1 AND sa.forbidden_consumer_count = 0 AND sa.unexpected_grantee_count = 0 AND sa.unexpected_privilege_count = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM successor_acl_state AS sa
  UNION ALL
  SELECT 40, 'agency_invitations:0037_columns_preserved', 'proposed text NOT NULL; access_expires_at timestamptz',
    format('proposed=%s;access_expires_at=%s', ic.proposed_name_ok, ic.access_expiry_ok),
    CASE WHEN ic.proposed_name_ok = 1 AND ic.access_expiry_ok = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM invitation_columns AS ic
  UNION ALL
  SELECT 41, '0037:constraints_preserved', 'invitation check=1; access PK=1; restricted FKs=5; checks=7',
    format('invitation=%s;pk=%s;restricted_fks=%s;checks=%s', rc.invitation_access_check, rc.access_primary_key, rc.access_restricted_fks, rc.access_checks),
    CASE WHEN rc.invitation_access_check = 1 AND rc.access_primary_key = 1 AND rc.access_restricted_fks = 5 AND rc.access_checks = 7 THEN 'PASS' ELSE 'FAIL' END
  FROM required_constraints AS rc
  UNION ALL
  SELECT 50, 'PRE_0039_PRESERVED_CATALOG_FINGERPRINT', eb.catalog_fingerprint, pcf.fingerprint || ';expected=' || eb.catalog_fingerprint,
    CASE WHEN eb.catalog_fingerprint LIKE 'PASTE_%' THEN 'INFO' WHEN pcf.fingerprint = eb.catalog_fingerprint THEN 'PASS' ELSE 'FAIL' END
  FROM expected_baselines AS eb CROSS JOIN preserved_catalog_fingerprint AS pcf
  UNION ALL
  SELECT 51, 'PRE_0039_DEFAULT_ACL_FINGERPRINT', eb.default_acl_fingerprint, daf.fingerprint || ';expected=' || eb.default_acl_fingerprint,
    CASE WHEN eb.default_acl_fingerprint LIKE 'PASTE_%' THEN 'INFO' WHEN daf.fingerprint = eb.default_acl_fingerprint THEN 'PASS' ELSE 'FAIL' END
  FROM expected_baselines AS eb CROSS JOIN default_acl_fingerprint AS daf
  UNION ALL
  SELECT 52, 'PRE_0039_BUSINESS_ROW_COUNTS', eb.business_row_counts, brc.counts_text || ';expected=' || eb.business_row_counts,
    CASE WHEN eb.business_row_counts LIKE 'PASTE_%' THEN 'INFO' WHEN brc.counts_text = eb.business_row_counts THEN 'PASS' ELSE 'FAIL' END
  FROM expected_baselines AS eb CROSS JOIN business_row_counts AS brc
  UNION ALL
  SELECT 60, '0039:zero_business_data_created_by_migration', 'business row counts unchanged from preflight',
    brc.counts_text,
    CASE WHEN eb.business_row_counts LIKE 'PASTE_%' THEN 'INFO' WHEN brc.counts_text = eb.business_row_counts THEN 'PASS' ELSE 'FAIL' END
  FROM expected_baselines AS eb CROSS JOIN business_row_counts AS brc
),
result AS (
  SELECT check_order, check_name, expected, observed, verdict
  FROM checks
  UNION ALL
  SELECT 90, 'post-verifier:final', '0 structural FAIL; baselines evaluated',
    format('state=%s;failures=%s;evidence_gaps=%s',
      (SELECT migration_state FROM structural_state),
      count(*) FILTER (WHERE c.verdict = 'FAIL'),
      count(*) FILTER (WHERE c.verdict = 'INFO' AND c.check_name LIKE 'PRE_0039_%')
    ),
    CASE
      WHEN count(*) FILTER (WHERE c.verdict = 'FAIL') > 0 THEN 'FAIL'
      WHEN count(*) FILTER (WHERE c.verdict = 'INFO' AND c.check_name LIKE 'PRE_0039_%') > 0 THEN 'INFO'
      ELSE 'PASS'
    END
  FROM checks AS c
)
SELECT check_name, expected, observed, verdict
FROM result
ORDER BY check_order, check_name;
