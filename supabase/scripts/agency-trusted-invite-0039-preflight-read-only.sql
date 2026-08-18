-- 0039 preflight — read-only, one result set
-- Execute before applying 0039. Copy the three INFO baselines into the
-- matching post-verifier placeholders only after this query has completed.

WITH
script_meta AS (
  SELECT '2026-08-13-v1'::text AS script_version
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
required_functions(function_identity) AS (
  VALUES
    ('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)'::text),
    ('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)'::text),
    ('public.canonical_assert_rpc_actor(uuid)'::text)
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
function_presence AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (
      WHERE pg_catalog.to_regprocedure(rf.function_identity) IS NOT NULL
    )::integer AS present_count
  FROM required_functions AS rf
),
successor_absence AS (
  SELECT pg_catalog.to_regprocedure(
    'public.complete_agency_onboarding_with_confirmed_agency_name(uuid,uuid,uuid,text,text,text)'
  ) IS NULL AS absent
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
rls_snapshot AS (
  SELECT
    count(*)::integer AS expected_count,
    count(*) FILTER (WHERE c.relrowsecurity)::integer AS rls_enabled_count,
    string_agg(
      pg_catalog.format(
        '%s.%s:owner=%s;rls=%s;force=%s;acl=%s',
        n.nspname::text,
        c.relname::text,
        pg_catalog.pg_get_userbyid(c.relowner)::text,
        c.relrowsecurity::text,
        c.relforcerowsecurity::text,
        coalesce(pg_catalog.array_to_string(c.relacl, ','), 'NULL')
      ),
      ' | ' ORDER BY n.nspname::text, c.relname::text
    ) AS snapshot_text
  FROM preserved_relations AS pr
  LEFT JOIN pg_catalog.pg_namespace AS n
    ON n.nspname = pr.schema_name
  LEFT JOIN pg_catalog.pg_class AS c
    ON c.relnamespace = n.oid
   AND c.relname = pr.relation_name
),
policy_snapshot AS (
  SELECT
    count(*)::integer AS policy_count,
    coalesce(
      string_agg(
        pg_catalog.format(
          '%s.%s:%s;permissive=%s;roles=%s;cmd=%s;using=%s;check=%s',
          p.schemaname::text,
          p.tablename::text,
          p.policyname::text,
          p.permissive::text,
          p.roles::text,
          p.cmd::text,
          coalesce(p.qual::text, 'NULL'),
          coalesce(p.with_check::text, 'NULL')
        ),
        ' | ' ORDER BY p.schemaname::text, p.tablename::text, p.policyname::text
      ),
      'NONE'
    ) AS snapshot_text
  FROM pg_catalog.pg_policies AS p
  WHERE (p.schemaname, p.tablename) IN (
    SELECT pr.schema_name, pr.relation_name
    FROM preserved_relations AS pr
  )
),
acl_snapshot AS (
  SELECT
    coalesce(
      pg_catalog.string_agg(
        pg_catalog.format(
          '%s.%s|anon_select=%s|authenticated_select=%s|service_select=%s|service_insert=%s|service_update=%s|service_delete=%s',
          pr.schema_name,
          pr.relation_name,
          has_table_privilege('anon', pg_catalog.format('%I.%I', pr.schema_name, pr.relation_name), 'SELECT')::text,
          has_table_privilege('authenticated', pg_catalog.format('%I.%I', pr.schema_name, pr.relation_name), 'SELECT')::text,
          has_table_privilege('service_role', pg_catalog.format('%I.%I', pr.schema_name, pr.relation_name), 'SELECT')::text,
          has_table_privilege('service_role', pg_catalog.format('%I.%I', pr.schema_name, pr.relation_name), 'INSERT')::text,
          has_table_privilege('service_role', pg_catalog.format('%I.%I', pr.schema_name, pr.relation_name), 'UPDATE')::text,
          has_table_privilege('service_role', pg_catalog.format('%I.%I', pr.schema_name, pr.relation_name), 'DELETE')::text
        ),
        ' | ' ORDER BY pr.schema_name, pr.relation_name
      ),
      'NONE'
    ) AS snapshot_text
  FROM preserved_relations AS pr
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
checks(check_order, check_name, expected, observed, verdict) AS (
  SELECT 10, 'script_version', '2026-08-13-v1', sm.script_version, 'INFO' FROM script_meta AS sm
  UNION ALL
  SELECT 20, '0037:required_relations', '6/6 present', format('%s/%s present', rp.present_count, rp.expected_count),
    CASE WHEN rp.present_count = rp.expected_count THEN 'PASS' ELSE 'FAIL' END
  FROM relation_presence AS rp
  UNION ALL
  SELECT 21, '0037:auth_users', 'present', CASE WHEN aup.present THEN 'present' ELSE 'missing' END,
    CASE WHEN aup.present THEN 'PASS' ELSE 'FAIL' END
  FROM auth_users_presence AS aup
  UNION ALL
  SELECT 22, '0037:rpc_contracts', '3/3 present', format('%s/%s present', fp.present_count, fp.expected_count),
    CASE WHEN fp.present_count = fp.expected_count THEN 'PASS' ELSE 'FAIL' END
  FROM function_presence AS fp
  UNION ALL
  SELECT 23, '0039:successor_absent_before_apply', 'absent',
    CASE WHEN sa.absent THEN 'absent' ELSE 'already present' END,
    CASE WHEN sa.absent THEN 'PASS' ELSE 'FAIL' END
  FROM successor_absence AS sa
  UNION ALL
  SELECT 24, 'agency_invitations:0037_columns', 'proposed text NOT NULL; access_expires_at timestamptz',
    format('proposed=%s;access_expires_at=%s', ic.proposed_name_ok, ic.access_expiry_ok),
    CASE WHEN ic.proposed_name_ok = 1 AND ic.access_expiry_ok = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM invitation_columns AS ic
  UNION ALL
  SELECT 25, '0037:constraints', 'invitation check=1; access PK=1; restricted FKs=5; checks=7',
    format('invitation=%s;pk=%s;restricted_fks=%s;checks=%s', rc.invitation_access_check, rc.access_primary_key, rc.access_restricted_fks, rc.access_checks),
    CASE WHEN rc.invitation_access_check = 1 AND rc.access_primary_key = 1 AND rc.access_restricted_fks = 5 AND rc.access_checks = 7 THEN 'PASS' ELSE 'FAIL' END
  FROM required_constraints AS rc
  UNION ALL
  SELECT 30, 'preserved:owner_rls_acl_snapshot', 'captured; no mutation',
    format('relations=%s;rls=%s;details=%s', rs.expected_count, rs.rls_enabled_count, rs.snapshot_text), 'INFO'
  FROM rls_snapshot AS rs
  UNION ALL
  SELECT 31, 'preserved:policies_snapshot', 'captured; no mutation',
    format('count=%s;details=%s', ps.policy_count, ps.snapshot_text), 'INFO'
  FROM policy_snapshot AS ps
  UNION ALL
  SELECT 32, 'preserved:acl_snapshot', 'captured; no mutation', asn.snapshot_text, 'INFO'
  FROM acl_snapshot AS asn
  UNION ALL
  SELECT 40, 'PRE_0039_PRESERVED_CATALOG_FINGERPRINT', 'copy this observed value to post-verifier', pcf.fingerprint, 'INFO'
  FROM preserved_catalog_fingerprint AS pcf
  UNION ALL
  SELECT 41, 'PRE_0039_DEFAULT_ACL_FINGERPRINT', 'copy this observed value to post-verifier', daf.fingerprint, 'INFO'
  FROM default_acl_fingerprint AS daf
  UNION ALL
  SELECT 42, 'PRE_0039_BUSINESS_ROW_COUNTS', 'copy this observed value to post-verifier', brc.counts_text, 'INFO'
  FROM business_row_counts AS brc
),
result AS (
  SELECT check_order, check_name, expected, observed, verdict
  FROM checks
  UNION ALL
  SELECT 90, 'preflight:ready', 'all required preconditions pass',
    format('structural_failures=%s', count(*) FILTER (WHERE c.verdict = 'FAIL')),
    CASE WHEN count(*) FILTER (WHERE c.verdict = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM checks AS c
)
SELECT check_name, expected, observed, verdict
FROM result
ORDER BY check_order, check_name;
