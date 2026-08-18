/*
  0037 post-verifier: execute the complete file as one read-only statement.
  The two evidence values below were captured by the matching 0037 preflight.
  This verifier accepts only the post-apply state and never executes the
  migration precondition.

  Historical evidence retained for the design audit:
  original pre-0037 preserved-catalog fingerprint =
  93e7e0f556ed1ae7a37fd11f4ae84db2
  original unnormalized post-0037 fingerprint =
  264f4672ef5d32b9d39de2e6e75ac174

  The v4 fingerprint excludes only the authorized 0037 invitation column,
  its derived column count, and its authorized constraint.
*/
WITH
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
  evidence(expected_preserved_catalog, expected_default_acl, original_post_preserved_catalog) AS (
    VALUES (
      '93e7e0f556ed1ae7a37fd11f4ae84db2',
      '5ca6a32605ce5bf4f37486496edef3de',
      '264f4672ef5d32b9d39de2e6e75ac174'
    )
  ),
  post_apply_state AS (
    SELECT
      (to_regclass('public.agency_access_periods') IS NOT NULL) AS table_present,
      (
        SELECT count(*)::integer = 1
        FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = to_regclass('public.agency_invitations')
          AND a.attname = 'access_expires_at'
          AND NOT a.attisdropped
      ) AS access_column_present,
      (to_regprocedure('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)') IS NOT NULL) AS core_rpc_present,
      (to_regprocedure('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)') IS NOT NULL) AS authenticated_rpc_present
  ),
  post_apply_classification AS (
    SELECT
      CASE
        WHEN table_present AND access_column_present AND core_rpc_present AND authenticated_rpc_present THEN 'FULLY_EXPECTED_POST_APPLY'
        WHEN table_present OR access_column_present OR core_rpc_present OR authenticated_rpc_present THEN 'PARTIAL_APPLY'
        ELSE 'NOT_APPLIED'
      END AS migration_state
    FROM post_apply_state
  ),
  new_relation AS (
  SELECT c.oid, c.relrowsecurity, pg_get_userbyid(c.relowner)::text AS owner_name,
      coalesce(array_to_string(c.relacl, ','), 'NULL')::text AS acl_text
  FROM pg_catalog.pg_class AS c
      WHERE c.oid = to_regclass('public.agency_access_periods')::oid
  ),
  new_relation_state AS (
    SELECT
      relation.oid,
      relation.relrowsecurity,
      relation.owner_name,
      relation.acl_text
    FROM (SELECT 1 AS singleton) AS singleton
    LEFT JOIN new_relation AS relation ON true
  ),
new_columns AS (
  SELECT count(*)::integer AS total_columns,
    count(*) FILTER (WHERE a.attname = 'id' AND format_type(a.atttypid, a.atttypmod) = 'uuid' AND a.attnotnull)::integer AS id_ok,
    count(*) FILTER (WHERE a.attname = 'agency_id' AND format_type(a.atttypid, a.atttypmod) = 'uuid' AND a.attnotnull)::integer AS agency_ok,
    count(*) FILTER (WHERE a.attname = 'plan_code' AND format_type(a.atttypid, a.atttypmod) = 'text' AND a.attnotnull)::integer AS plan_ok,
    count(*) FILTER (WHERE a.attname = 'origin' AND format_type(a.atttypid, a.atttypmod) = 'text' AND a.attnotnull)::integer AS origin_ok,
    count(*) FILTER (WHERE a.attname = 'starts_at' AND format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone' AND a.attnotnull)::integer AS starts_ok,
    count(*) FILTER (WHERE a.attname = 'ends_at' AND format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone')::integer AS ends_ok,
    count(*) FILTER (WHERE a.attname = 'status' AND format_type(a.atttypid, a.atttypmod) = 'text' AND a.attnotnull)::integer AS status_ok,
    count(*) FILTER (WHERE a.attname = 'source_application_id' AND format_type(a.atttypid, a.atttypmod) = 'uuid')::integer AS application_ok,
    count(*) FILTER (WHERE a.attname = 'source_invitation_id' AND format_type(a.atttypid, a.atttypmod) = 'uuid')::integer AS invitation_ok,
    count(*) FILTER (WHERE a.attname = 'activated_by_actor_user_id' AND format_type(a.atttypid, a.atttypmod) = 'uuid')::integer AS activated_ok,
    count(*) FILTER (WHERE a.attname = 'created_at' AND format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone' AND a.attnotnull)::integer AS created_ok,
    count(*) FILTER (WHERE a.attname = 'revoked_at' AND format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone')::integer AS revoked_ok,
    count(*) FILTER (WHERE a.attname = 'revoked_by_actor_user_id' AND format_type(a.atttypid, a.atttypmod) = 'uuid')::integer AS revoked_by_ok,
    count(*) FILTER (WHERE a.attname = 'revocation_reason' AND format_type(a.atttypid, a.atttypmod) = 'text')::integer AS reason_ok
  FROM pg_catalog.pg_attribute AS a
  WHERE a.attrelid = to_regclass('public.agency_access_periods')::oid
    AND a.attnum > 0
    AND NOT a.attisdropped
),
new_constraint_state AS (
  SELECT
    count(*) FILTER (WHERE c.conname = 'agency_access_periods_pkey' AND c.contype = 'p')::integer AS primary_key_count,
    count(*) FILTER (WHERE c.conname IN (
      'fk_agency_access_periods_agency_0037',
      'fk_agency_access_periods_application_0037',
      'fk_agency_access_periods_invitation_0037',
      'fk_agency_access_periods_activated_by_0037',
      'fk_agency_access_periods_revoked_by_0037'
    ) AND c.contype = 'f' AND c.confdeltype = 'r')::integer AS restricted_fk_count,
    count(*) FILTER (WHERE c.conname IN (
      'ck_agency_access_periods_plan_0037',
      'ck_agency_access_periods_origin_0037',
      'ck_agency_access_periods_status_0037',
      'ck_agency_access_periods_dates_0037',
      'ck_agency_access_periods_revocation_0037',
      'ck_agency_access_periods_provenance_0037',
      'ck_agency_access_periods_reason_0037'
    ) AND c.contype = 'c')::integer AS check_count,
    count(*) FILTER (WHERE c.conname = 'ck_agency_invitations_trusted_access_expiry_0037' AND c.conrelid = 'public.agency_invitations'::regclass AND c.contype = 'c')::integer AS invitation_check_count,
    count(*) FILTER (WHERE c.conname = 'ck_agency_invitations_trusted_access_expiry_0037' AND NOT c.convalidated)::integer AS invitation_check_not_valid
  FROM pg_catalog.pg_constraint AS c
    WHERE c.conrelid IN (to_regclass('public.agency_access_periods'), to_regclass('public.agency_invitations'))
),
new_index_state AS (
  SELECT
    count(*) FILTER (WHERE idx.relname = 'ix_agency_access_periods_agency_effective_0037')::integer AS effective_index_count,
    count(*) FILTER (WHERE idx.relname = 'uq_agency_access_periods_invitation_0037' AND i.indisunique)::integer AS invitation_index_count
  FROM pg_catalog.pg_index AS i
  JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
    WHERE i.indrelid = to_regclass('public.agency_access_periods')
),
new_function_names(function_identity) AS (
  VALUES
    ('public.complete_agency_onboarding_with_access(uuid,uuid,uuid,text,text)'),
    ('public.complete_agency_onboarding_authenticated_with_access(uuid,uuid,uuid,text)')
),
  new_functions AS (
  SELECT f.function_identity, p.oid, p.prosecdef, pg_get_userbyid(p.proowner)::text AS owner_name,
    coalesce(array_to_string(p.proconfig, ','), 'NULL')::text AS config_text,
    coalesce(array_to_string(p.proacl, ','), 'NULL')::text AS acl_text
  FROM new_function_names AS f
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = to_regprocedure(f.function_identity)::oid
  ),
  new_acl_state AS (
    SELECT
      relation.oid,
      relation.relrowsecurity,
      CASE WHEN relation.oid IS NULL THEN false ELSE has_table_privilege('service_role', relation.oid, 'SELECT') END AS service_select,
      CASE WHEN relation.oid IS NULL THEN false ELSE has_table_privilege('service_role', relation.oid, 'INSERT') END AS service_insert,
      CASE WHEN relation.oid IS NULL THEN false ELSE has_table_privilege('service_role', relation.oid, 'UPDATE') END AS service_update,
      CASE WHEN relation.oid IS NULL THEN false ELSE has_table_privilege('service_role', relation.oid, 'DELETE') END AS service_delete,
      CASE WHEN relation.oid IS NULL THEN false ELSE has_table_privilege('anon', relation.oid, 'SELECT') END AS anon_select,
      CASE WHEN relation.oid IS NULL THEN false ELSE has_table_privilege('authenticated', relation.oid, 'SELECT') END AS authenticated_select
    FROM new_relation_state AS relation
  ),
  new_data AS (
    SELECT
      CASE
        WHEN relation.oid IS NULL THEN 'NOT_EVALUATED'
        ELSE pg_catalog.pg_stat_get_live_tuples(relation.oid)::text
      END AS row_count
    FROM new_relation_state AS relation
  ),
  checks(check_order, check_name, expected, observed, verdict) AS (
    SELECT 10, 'script_version', '2026-08-13-v4', '2026-08-13-v4', 'INFO'
    UNION ALL
    SELECT 11, 'migration_state', 'FULLY_EXPECTED_POST_APPLY',
      CASE
        WHEN table_present::integer + access_column_present::integer + core_rpc_present::integer + authenticated_rpc_present::integer = 4 THEN 'FULLY_EXPECTED_POST_APPLY'
        WHEN table_present::integer + access_column_present::integer + core_rpc_present::integer + authenticated_rpc_present::integer = 0 THEN 'NOT_APPLIED'
        ELSE 'PARTIAL_APPLY'
      END,
      CASE WHEN table_present::integer + access_column_present::integer + core_rpc_present::integer + authenticated_rpc_present::integer = 4 THEN 'PASS' ELSE 'FAIL' END
    FROM post_apply_state
    UNION ALL
    SELECT 20, 'agency_access_periods:present', 'present', CASE WHEN table_present THEN 'PRESENT' ELSE 'ABSENT' END,
      CASE WHEN table_present THEN 'PASS' ELSE 'FAIL' END
    FROM post_apply_state
    UNION ALL
    SELECT 19, 'agency_invitations:access_expires_at', 'present', CASE WHEN access_column_present THEN 'PRESENT' ELSE 'ABSENT' END,
      CASE WHEN access_column_present THEN 'PASS' ELSE 'FAIL' END
    FROM post_apply_state
    UNION ALL
    SELECT 21, 'agency_access_periods:owner_rls', 'owner=postgres;rls=true',
      coalesce('owner=' || owner_name || ';rls=' || relrowsecurity::text, 'MISSING'),
      CASE WHEN owner_name = 'postgres' AND relrowsecurity THEN 'PASS' ELSE 'FAIL' END
    FROM new_relation_state
  UNION ALL
  SELECT 22, 'agency_access_periods:columns', '14 approved columns',
    format('%s/14; id=%s; agency=%s; plan=%s; origin=%s; starts=%s; ends=%s; status=%s; app=%s; invite=%s; actor=%s; created=%s; revoked=%s; revoked_by=%s; reason=%s', total_columns, id_ok, agency_ok, plan_ok, origin_ok, starts_ok, ends_ok, status_ok, application_ok, invitation_ok, activated_ok, created_ok, revoked_ok, revoked_by_ok, reason_ok),
    CASE WHEN total_columns = 14 AND id_ok = 1 AND agency_ok = 1 AND plan_ok = 1 AND origin_ok = 1 AND starts_ok = 1 AND ends_ok = 1 AND status_ok = 1 AND application_ok = 1 AND invitation_ok = 1 AND activated_ok = 1 AND created_ok = 1 AND revoked_ok = 1 AND revoked_by_ok = 1 AND reason_ok = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM new_columns
  UNION ALL
  SELECT 23, 'agency_access_periods:constraints', 'PK=1;FK_RESTRICT=5;CHECK=7',
    format('PK=%s;FK_RESTRICT=%s;CHECK=%s', primary_key_count, restricted_fk_count, check_count),
    CASE WHEN primary_key_count = 1 AND restricted_fk_count = 5 AND check_count = 7 THEN 'PASS' ELSE 'FAIL' END
  FROM new_constraint_state
  UNION ALL
  SELECT 24, 'agency_invitations:access_expiry_constraint', 'present and NOT VALID',
    format('present=%s;not_valid=%s', invitation_check_count, invitation_check_not_valid),
    CASE WHEN invitation_check_count = 1 AND invitation_check_not_valid = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM new_constraint_state
  UNION ALL
  SELECT 25, 'agency_access_periods:indexes', 'effective index + unique invitation index', format('%s/%s', effective_index_count, invitation_index_count),
    CASE WHEN effective_index_count = 1 AND invitation_index_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM new_index_state
  UNION ALL
    SELECT 30, 'agency_access_periods:rls_acl', 'RLS=true;service_role SELECT INSERT UPDATE;no DELETE;anon/authenticated none',
      coalesce('rls=' || relrowsecurity::text || ';service_select=' || service_select::text || ';service_insert=' || service_insert::text || ';service_update=' || service_update::text || ';delete=' || service_delete::text || ';anon_select=' || anon_select::text || ';authenticated_select=' || authenticated_select::text, 'MISSING'),
      CASE WHEN relrowsecurity
        AND service_select
        AND service_insert
        AND service_update
        AND NOT service_delete
        AND NOT anon_select
        AND NOT authenticated_select THEN 'PASS' ELSE 'FAIL' END
    FROM new_acl_state
  UNION ALL
  SELECT 31, 'agency_access_periods:policies', 'no direct policies', count(*)::text, CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END
  FROM pg_catalog.pg_policies AS p
  WHERE p.schemaname = 'public' AND p.tablename = 'agency_access_periods'
  UNION ALL
  SELECT 40, 'successor_rpc:presence', '2/2 present', count(*) FILTER (WHERE oid IS NOT NULL)::text || '/2', CASE WHEN count(*) FILTER (WHERE oid IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END
  FROM new_functions
  UNION ALL
  SELECT 41, 'successor_rpc:security', 'SECURITY DEFINER;owner=postgres;restricted search_path',
    coalesce(string_agg(function_identity || ';definer=' || prosecdef::text || ';owner=' || owner_name || ';search_path=' || config_text, ' | ' ORDER BY function_identity), 'MISSING'),
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE prosecdef AND owner_name = 'postgres' AND config_text = 'search_path=pg_catalog, public, pg_temp') = 2 THEN 'PASS' ELSE 'FAIL' END
  FROM new_functions
  UNION ALL
  SELECT 42, 'successor_rpc:execute_acl', 'service_role EXECUTE;anon/authenticated no EXECUTE',
    coalesce(string_agg(function_identity || ';service_role=' || has_function_privilege('service_role', oid, 'EXECUTE')::text || ';anon=' || has_function_privilege('anon', oid, 'EXECUTE')::text || ';authenticated=' || has_function_privilege('authenticated', oid, 'EXECUTE')::text, ' | ' ORDER BY function_identity), 'MISSING'),
    CASE WHEN count(*) = 2 AND count(*) FILTER (WHERE has_function_privilege('service_role', oid, 'EXECUTE') AND NOT has_function_privilege('anon', oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', oid, 'EXECUTE')) = 2 THEN 'PASS' ELSE 'FAIL' END
  FROM new_functions
  UNION ALL
    SELECT 50, 'new_data:agency_access_periods', '0 live-tuple estimate; unknown is INFO', row_count,
      CASE
        WHEN row_count = '0' THEN 'PASS'
        WHEN row_count IN ('NOT_EVALUATED', '-1') THEN 'INFO'
        ELSE 'FAIL'
      END
  FROM new_data
  UNION ALL
  SELECT 60, 'preserved_catalog_fingerprint', e.expected_preserved_catalog, p.fingerprint,
    CASE WHEN p.fingerprint = e.expected_preserved_catalog THEN 'PASS' ELSE 'FAIL' END
  FROM preserved_catalog AS p CROSS JOIN evidence AS e
  UNION ALL
  SELECT 61, 'default_acl_fingerprint', e.expected_default_acl, d.fingerprint,
    CASE WHEN d.fingerprint = e.expected_default_acl THEN 'PASS' ELSE 'FAIL' END
  FROM default_acl_fingerprint AS d CROSS JOIN evidence AS e
  UNION ALL
  SELECT 62, 'preserved_catalog:original_post_evidence', 'historical unnormalized hash', e.original_post_preserved_catalog, 'INFO'
  FROM evidence AS e
),
final_result AS (
  SELECT check_order, check_name, expected, observed, verdict FROM checks
  UNION ALL
    SELECT 1000, 'final_classification', 'FULLY_EXPECTED_POST_APPLY',
      CASE
        WHEN state.migration_state = 'FULLY_EXPECTED_POST_APPLY' AND summary.fail_count = 0 THEN 'FULLY_EXPECTED_POST_APPLY'
        ELSE state.migration_state
      END,
      CASE WHEN state.migration_state = 'FULLY_EXPECTED_POST_APPLY' AND summary.fail_count = 0 THEN 'PASS' ELSE 'FAIL' END
    FROM post_apply_classification AS state
    CROSS JOIN (
      SELECT count(*) FILTER (WHERE verdict = 'FAIL')::integer AS fail_count
      FROM checks
    ) AS summary
  )
SELECT check_name, expected, observed, verdict
FROM final_result
ORDER BY check_order, check_name;
