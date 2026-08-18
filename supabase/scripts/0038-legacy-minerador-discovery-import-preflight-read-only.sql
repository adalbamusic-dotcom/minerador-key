/*
  0038 preflight: remocao da RPC legada de importacao da Descoberta.

  READ-ONLY. Executar o arquivo inteiro como uma unica consulta.
  Nao usa TEMP, DDL, DML, ACL, RLS, NOTICE ou operacao remota mutavel.

  O fingerprint e deliberadamente focado nos objetos que o DROP da funcao
  nao esta autorizado a modificar. Ele nao inclui a funcao-alvo.
  Copiar os valores PRECHECK_PRESERVED_* para o post-verifier 0038.
*/

WITH
target AS (
  SELECT
    to_regprocedure(
      'public.import_minerador_discovery_candidates(uuid,uuid,uuid,uuid[])'
    )::oid AS function_oid
),
function_state AS (
  SELECT
    t.function_oid,
    (p.oid IS NOT NULL) AS present,
    coalesce(n.nspname, '<absent>')::text AS schema_name,
    coalesce(p.proname, '<absent>')::text AS function_name,
    coalesce(pg_get_function_identity_arguments(p.oid), '<absent>')::text AS identity_arguments,
    coalesce(pg_get_userbyid(p.proowner), '<absent>')::text AS owner_name,
    CASE
      WHEN p.oid IS NULL THEN '<absent>'
      WHEN p.prosecdef THEN 'DEFINER'
      ELSE 'INVOKER'
    END::text AS security_mode,
    coalesce(array_to_string(p.proconfig, ','), '<NULL>')::text AS config,
    coalesce(md5(pg_get_functiondef(p.oid)), '<absent>')::text AS definition_md5
  FROM target AS t
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = t.function_oid
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
),
function_definition AS (
  SELECT coalesce(pg_get_functiondef(p.oid), '<absent>')::text AS definition
  FROM target AS t
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = t.function_oid
),
function_acl_entries AS (
  SELECT
    CASE
      WHEN acl.grantee = 0::oid THEN 'PUBLIC'
      ELSE coalesce(pg_get_userbyid(acl.grantee), format('OID:%s', acl.grantee))
    END::text AS grantee_name,
    acl.privilege_type::text AS privilege_type,
    acl.is_grantable::text AS is_grantable
  FROM target AS t
  JOIN pg_catalog.pg_proc AS p ON p.oid = t.function_oid
  CROSS JOIN LATERAL aclexplode(
    coalesce(p.proacl, acldefault('f', p.proowner))
  ) AS acl(grantor, grantee, privilege_type, is_grantable)
),
function_acl_summary AS (
  SELECT
    coalesce(string_agg(
      format('%s:%s:%s', grantee_name, privilege_type, is_grantable),
      ';' ORDER BY grantee_name, privilege_type
    ), '<none>')::text AS acl_summary,
    coalesce(string_agg(
      grantee_name,
      ',' ORDER BY grantee_name
    ) FILTER (
      WHERE privilege_type = 'EXECUTE'
        AND grantee_name NOT IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
    ), '<none>')::text AS unexpected_execute_roles
  FROM function_acl_entries
),
known_role_privileges AS (
  SELECT
    coalesce(string_agg(
      format(
        '%s=%s',
        expected.role_name,
        CASE
          WHEN expected.role_name = 'PUBLIC' THEN CASE
            WHEN EXISTS (
              SELECT 1
              FROM function_acl_entries AS public_acl
              WHERE public_acl.grantee_name = 'PUBLIC'
                AND public_acl.privilege_type = 'EXECUTE'
            ) THEN 'EXECUTE'
            ELSE 'NO_EXECUTE'
          END
          WHEN roles.rolname IS NULL THEN 'ROLE_ABSENT'
          WHEN has_function_privilege(roles.rolname, t.function_oid, 'EXECUTE') THEN 'EXECUTE'
          ELSE 'NO_EXECUTE'
        END
      ),
      ';' ORDER BY expected.role_name
    ), '<none>')::text AS role_summary
  FROM target AS t
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = t.function_oid
  CROSS JOIN (
    VALUES ('PUBLIC'::text), ('anon'::text), ('authenticated'::text), ('service_role'::text)
  ) AS expected(role_name)
  LEFT JOIN pg_catalog.pg_roles AS roles ON roles.rolname = expected.role_name
),
dependency_inventory AS (
  SELECT DISTINCT
    format(
      'class=%s;object=%s;dependency=%s',
      d.classid::regclass::text,
      CASE
        WHEN d.classid = 'pg_proc'::regclass THEN format(
          '%s.%s(%s)',
          coalesce(proc_ns.nspname, '<unknown>'),
          coalesce(proc.proname, '<unknown>'),
          coalesce(pg_get_function_identity_arguments(proc.oid), '')
        )
        WHEN d.classid = 'pg_rewrite'::regclass THEN format(
          '%s.%s',
          coalesce(view_ns.nspname, '<unknown>'),
          coalesce(view_rel.relname, '<unknown>')
        )
        WHEN d.classid = 'pg_trigger'::regclass THEN format(
          '%s.%s',
          coalesce(trigger_ns.nspname, '<unknown>'),
          coalesce(trigger_rel.relname, '<unknown>')
        )
        ELSE format('%s:%s', d.classid::regclass::text, d.objid::text)
      END,
      d.deptype::text
    )::text AS dependency_row
  FROM target AS t
  JOIN pg_catalog.pg_depend AS d
    ON d.refclassid = 'pg_proc'::regclass
   AND d.refobjid = t.function_oid
   AND d.deptype <> 'i'
   AND d.objid <> t.function_oid
  LEFT JOIN pg_catalog.pg_proc AS proc
    ON d.classid = 'pg_proc'::regclass
   AND proc.oid = d.objid
  LEFT JOIN pg_catalog.pg_namespace AS proc_ns ON proc_ns.oid = proc.pronamespace
  LEFT JOIN pg_catalog.pg_rewrite AS rewrite_rule
    ON d.classid = 'pg_rewrite'::regclass
   AND rewrite_rule.oid = d.objid
  LEFT JOIN pg_catalog.pg_class AS view_rel ON view_rel.oid = rewrite_rule.ev_class
  LEFT JOIN pg_catalog.pg_namespace AS view_ns ON view_ns.oid = view_rel.relnamespace
  LEFT JOIN pg_catalog.pg_trigger AS trigger_obj
    ON d.classid = 'pg_trigger'::regclass
   AND trigger_obj.oid = d.objid
  LEFT JOIN pg_catalog.pg_class AS trigger_rel ON trigger_rel.oid = trigger_obj.tgrelid
  LEFT JOIN pg_catalog.pg_namespace AS trigger_ns ON trigger_ns.oid = trigger_rel.relnamespace
),
function_source_callers AS (
  SELECT DISTINCT
    format(
      '%s.%s(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    )::text AS caller_name
  FROM target AS t
  JOIN pg_catalog.pg_proc AS p ON p.oid <> t.function_oid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND pg_get_functiondef(p.oid) ILIKE '%import_minerador_discovery_candidates%'
),
view_source_callers AS (
  SELECT DISTINCT
    format('%s.%s', n.nspname, c.relname)::text AS caller_name
  FROM target AS t
  JOIN pg_catalog.pg_class AS c ON c.relkind IN ('v', 'm')
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND pg_get_viewdef(c.oid, true) ILIKE '%import_minerador_discovery_candidates%'
),
trigger_callers AS (
  SELECT DISTINCT
    format('%s.%s:%s', n.nspname, c.relname, tg.tgname)::text AS caller_name
  FROM target AS t
  JOIN pg_catalog.pg_trigger AS tg ON tg.tgfoid = t.function_oid
  JOIN pg_catalog.pg_class AS c ON c.oid = tg.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE NOT tg.tgisinternal
),
preserved_relation_names(schema_name, relation_name) AS (
  VALUES
    ('public'::text, 'minerador_keywords'::text),
    ('public'::text, 'minerador_keyword_lists'::text),
    ('public'::text, 'minerador_discovery_runs'::text),
    ('public'::text, 'minerador_discovery_candidates'::text),
    ('public'::text, 'minerador_discovery_import_batches'::text),
    ('public'::text, 'minerador_discovery_keyword_origins'::text),
    ('public'::text, 'minerador_discovery_candidate_current_metrics'::text),
    ('public'::text, 'minerador_discovery_candidate_metric_history'::text),
    ('public'::text, 'minerador_keyword_metric_measurements'::text)
),
preserved_relations AS (
  SELECT
    n.nspname::text AS schema_name,
    c.relname::text AS relation_name,
    c.oid,
    c.relkind::text AS relkind,
    pg_get_userbyid(c.relowner)::text AS owner_name,
    c.relrowsecurity::text AS rls_enabled,
    c.relforcerowsecurity::text AS rls_forced,
    coalesce(array_to_string(c.relacl, ','), '<NULL>')::text AS acl_text
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN preserved_relation_names AS expected
    ON expected.schema_name = n.nspname::text
   AND expected.relation_name = c.relname::text
),
preserved_data_rows(relation_name, row_count) AS (
  SELECT 'public.minerador_keywords'::text, count(*)::bigint FROM public.minerador_keywords
  UNION ALL SELECT 'public.minerador_keyword_lists'::text, count(*)::bigint FROM public.minerador_keyword_lists
  UNION ALL SELECT 'public.minerador_discovery_runs'::text, count(*)::bigint FROM public.minerador_discovery_runs
  UNION ALL SELECT 'public.minerador_discovery_candidates'::text, count(*)::bigint FROM public.minerador_discovery_candidates
  UNION ALL SELECT 'public.minerador_discovery_import_batches'::text, count(*)::bigint FROM public.minerador_discovery_import_batches
  UNION ALL SELECT 'public.minerador_discovery_keyword_origins'::text, count(*)::bigint FROM public.minerador_discovery_keyword_origins
  UNION ALL SELECT 'public.minerador_discovery_candidate_current_metrics'::text, count(*)::bigint FROM public.minerador_discovery_candidate_current_metrics
  UNION ALL SELECT 'public.minerador_discovery_candidate_metric_history'::text, count(*)::bigint FROM public.minerador_discovery_candidate_metric_history
  UNION ALL SELECT 'public.minerador_keyword_metric_measurements'::text, count(*)::bigint FROM public.minerador_keyword_metric_measurements
),
preserved_data_snapshot AS (
  SELECT coalesce(string_agg(
    format('%s=%s', relation_name, row_count::text),
    ';' ORDER BY relation_name
  ), '<none>')::text AS snapshot
  FROM preserved_data_rows
),
preserved_relation_rows AS (
  SELECT format(
    'relation|%s.%s|kind=%s|owner=%s|rls=%s|forced=%s|acl=%s',
    r.schema_name,
    r.relation_name,
    r.relkind,
    r.owner_name,
    r.rls_enabled,
    r.rls_forced,
    r.acl_text
  )::text AS row_data
  FROM preserved_relations AS r
),
preserved_columns AS (
  SELECT format(
    'column|%s.%s|%s|%s|%s|%s|%s|%s',
    r.schema_name,
    r.relation_name,
    a.attnum::text,
    a.attname::text,
    format_type(a.atttypid, a.atttypmod),
    a.attnotnull::text,
    a.attidentity::text,
    a.attgenerated::text
  )::text AS row_data
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_attribute AS a ON a.attrelid = r.oid
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
preserved_constraints AS (
  SELECT format(
    'constraint|%s.%s|%s|%s|%s|%s',
    n.nspname::text,
    rel.relname::text,
    c.conname::text,
    c.contype::text,
    c.convalidated::text,
    pg_get_constraintdef(c.oid, true)
  )::text AS row_data
  FROM pg_catalog.pg_constraint AS c
  JOIN pg_catalog.pg_class AS rel ON rel.oid = c.conrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
  JOIN preserved_relations AS r ON r.oid = c.conrelid
),
preserved_indexes AS (
  SELECT format(
    'index|%s.%s|%s|%s|%s|%s',
    n.nspname::text,
    rel.relname::text,
    idx.relname::text,
    i.indisunique::text,
    i.indisvalid::text,
    pg_get_indexdef(i.indexrelid)
  )::text AS row_data
  FROM pg_catalog.pg_index AS i
  JOIN pg_catalog.pg_class AS rel ON rel.oid = i.indrelid
  JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = rel.relnamespace
  JOIN preserved_relations AS r ON r.oid = i.indrelid
),
preserved_policies AS (
  SELECT format(
    'policy|%s.%s|%s|%s|%s|%s|%s|%s',
    p.schemaname::text,
    p.tablename::text,
    p.policyname::text,
    p.cmd::text,
    p.permissive::text,
    coalesce(array_to_string(p.roles::text[], ','), '<NULL>'),
    coalesce(p.qual, '<NULL>'),
    coalesce(p.with_check, '<NULL>')
  )::text AS row_data
  FROM pg_catalog.pg_policies AS p
  JOIN preserved_relation_names AS expected
    ON expected.schema_name = p.schemaname::text
   AND expected.relation_name = p.tablename::text
),
preserved_triggers AS (
  SELECT format(
    'trigger|%s.%s|%s|enabled=%s|definition=%s',
    n.nspname::text,
    r.relation_name,
    tg.tgname::text,
    tg.tgenabled::text,
    pg_get_triggerdef(tg.oid, true)
  )::text AS row_data
  FROM preserved_relations AS r
  JOIN pg_catalog.pg_trigger AS tg ON tg.tgrelid = r.oid
  JOIN pg_catalog.pg_namespace AS n ON n.nspname = r.schema_name
  WHERE NOT tg.tgisinternal
),
preserved_function_names(function_identity) AS (
  VALUES
    ('public.minerador_discovery_normalize_keyword(text)'::text),
    ('public.minerador_discovery_import_brand_guard()'::text),
    ('public.minerador_discovery_candidate_brand_guard()'::text),
    ('public.minerador_discovery_run_immutable()'::text),
    ('public.persist_minerador_discovery_run(jsonb,jsonb)'::text),
    ('public.can_access_list(uuid)'::text)
),
preserved_functions AS (
  SELECT format(
    'routine|%s|owner=%s|security_definer=%s|config=%s|acl=%s|definition_md5=%s',
    expected.function_identity,
    coalesce(pg_get_userbyid(p.proowner), '<absent>'),
    coalesce(p.prosecdef::text, '<absent>'),
    coalesce(array_to_string(p.proconfig, ','), '<NULL>'),
    coalesce(array_to_string(p.proacl, ','), '<NULL>'),
    coalesce(md5(pg_get_functiondef(p.oid)), '<absent>')
  )::text AS row_data
  FROM preserved_function_names AS expected
  LEFT JOIN pg_catalog.pg_proc AS p
    ON p.oid = to_regprocedure(expected.function_identity)::oid
),
preserved_catalog_rows AS (
  SELECT row_data FROM preserved_relation_rows
  UNION ALL SELECT row_data FROM preserved_columns
  UNION ALL SELECT row_data FROM preserved_constraints
  UNION ALL SELECT row_data FROM preserved_indexes
  UNION ALL SELECT row_data FROM preserved_policies
  UNION ALL SELECT row_data FROM preserved_triggers
  UNION ALL SELECT row_data FROM preserved_functions
),
preserved_catalog AS (
  SELECT
    count(*)::bigint AS row_count,
    md5(coalesce(string_agg(row_data, E'\n' ORDER BY row_data), ''))::text AS fingerprint
  FROM preserved_catalog_rows
),
checks AS (
  SELECT
    'TARGET_FUNCTION_PRESENT'::text AS check_name,
    'public.import_minerador_discovery_candidates(uuid,uuid,uuid,uuid[])'::text AS object_name,
    format('present=%s;oid=%s', state.present, coalesce(state.function_oid::text, '<NULL>'))::text AS observed,
    CASE WHEN state.present THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  FROM function_state AS state

  UNION ALL

  SELECT
    'TARGET_FUNCTION_SIGNATURE'::text,
    'public.import_minerador_discovery_candidates'::text,
    format('%s.%s(%s)', state.schema_name, state.function_name, state.identity_arguments)::text,
    CASE WHEN state.present
      AND state.schema_name = 'public'
      AND state.function_name = 'import_minerador_discovery_candidates'
      THEN 'PASS' ELSE 'FAIL' END::text
  FROM function_state AS state

  UNION ALL

  SELECT
    'TARGET_FUNCTION_SECURITY'::text,
    'owner/security/search_path'::text,
    format('owner=%s;security=%s;config=%s;definition_md5=%s', state.owner_name, state.security_mode, state.config, state.definition_md5)::text,
    'INFO'::text
  FROM function_state AS state

  UNION ALL

  SELECT
    'TARGET_FUNCTION_ACL'::text,
    'PUBLIC;anon;authenticated;service_role;unexpected roles'::text,
    format('known=%s;acl=%s;unexpected_execute_roles=%s',
      coalesce(known.role_summary, '<none>'),
      coalesce(acl.acl_summary, '<none>'),
      coalesce(acl.unexpected_execute_roles, '<none>'))::text,
    'INFO'::text
  FROM known_role_privileges AS known
  FULL JOIN function_acl_summary AS acl ON true

  UNION ALL

  SELECT
    'DATABASE_DEPENDENCIES'::text,
    'pg_depend dependents of target function'::text,
    format('count=%s;details=%s', count(*), coalesce(string_agg(dependency_row, ' | ' ORDER BY dependency_row), '<none>'))::text,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM dependency_inventory

  UNION ALL

  SELECT
    'FUNCTION_SOURCE_CALLERS'::text,
    'current pg_proc definitions'::text,
    format('count=%s;callers=%s', count(*), coalesce(string_agg(caller_name, ' | ' ORDER BY caller_name), '<none>'))::text,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM function_source_callers

  UNION ALL

  SELECT
    'VIEW_SOURCE_CALLERS'::text,
    'current views/materialized views'::text,
    format('count=%s;callers=%s', count(*), coalesce(string_agg(caller_name, ' | ' ORDER BY caller_name), '<none>'))::text,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM view_source_callers

  UNION ALL

  SELECT
    'TRIGGER_CALLERS'::text,
    'current non-internal triggers'::text,
    format('count=%s;callers=%s', count(*), coalesce(string_agg(caller_name, ' | ' ORDER BY caller_name), '<none>'))::text,
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM trigger_callers

  UNION ALL

  SELECT
    'PRESERVED_RELATIONS'::text,
    'canonical Minerador and Discovery relations'::text,
    format('present=%s/9;missing=%s',
      count(*) FILTER (WHERE preserved.oid IS NOT NULL),
      coalesce(string_agg(expected.schema_name || '.' || expected.relation_name, ',' ORDER BY expected.schema_name, expected.relation_name)
        FILTER (WHERE preserved.oid IS NULL), '<none>'))::text,
    CASE WHEN count(*) FILTER (WHERE preserved.oid IS NOT NULL) = 9 THEN 'PASS' ELSE 'FAIL' END::text
  FROM preserved_relation_names AS expected
  LEFT JOIN preserved_relations AS preserved
    ON preserved.schema_name = expected.schema_name
   AND preserved.relation_name = expected.relation_name

  UNION ALL

  SELECT
    'PRESERVED_ROUTINES'::text,
    'canonical Discovery and access routines'::text,
    format('present=%s/6;missing=%s',
      count(*) FILTER (WHERE row_data NOT LIKE '%owner=<absent>%'),
      coalesce(string_agg(function_identity, ',' ORDER BY function_identity)
        FILTER (WHERE row_data LIKE '%owner=<absent>%'), '<none>'))::text,
    CASE WHEN count(*) FILTER (WHERE row_data NOT LIKE '%owner=<absent>%') = 6 THEN 'PASS' ELSE 'FAIL' END::text
  FROM preserved_function_names AS expected
  JOIN preserved_functions AS current_routine ON current_routine.row_data LIKE 'routine|' || expected.function_identity || '|%'

  UNION ALL

  SELECT
    'PRECHECK_PRESERVED_DATA_ROW_COUNTS'::text,
    'copy observed value to post-verifier'::text,
    snapshot::text,
    'INFO'::text
  FROM preserved_data_snapshot

  UNION ALL

  SELECT
    'PRECHECK_PRESERVED_CATALOG_ROWS'::text,
    'copy observed value to post-verifier'::text,
    row_count::text,
    'INFO'::text
  FROM preserved_catalog

  UNION ALL

  SELECT
    'PRECHECK_PRESERVED_CATALOG_FINGERPRINT'::text,
    'copy observed value to post-verifier'::text,
    fingerprint::text,
    'INFO'::text
  FROM preserved_catalog

  UNION ALL

  SELECT
    'PRECHECK_TARGET_FUNCTION_DEFINITION'::text,
    'local rollback source; preserve exact pg_get_functiondef output'::text,
    definition::text,
    'INFO'::text
  FROM function_definition

  UNION ALL

  SELECT
    'CANONICAL_REPLACEMENT'::text,
    'application runtime'::text,
    'route authz -> importKeywordsWithCore -> minerador_keywords + discovery origins/batches/candidate links/metrics'::text,
    'INFO'::text
),
final_result AS (
  SELECT check_name, object_name, observed, verdict FROM checks

  UNION ALL

  SELECT
    'PRECHECK_GATE'::text,
    '0038_remove_legacy_minerador_discovery_import_rpc'::text,
    CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0
      THEN 'READY_FOR_MANUAL_REVIEW_AND_REMOTE_APPLY'
      ELSE 'BLOCKED'
    END::text,
    CASE WHEN count(*) FILTER (WHERE verdict = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM checks
)
SELECT check_name, object_name, observed, verdict
FROM final_result
ORDER BY check_name, object_name;
