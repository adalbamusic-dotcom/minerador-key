-- 0036 touched-scope audit: somente leitura, depois da aplicacao manual.
--
-- Objetivo: verificar apenas os objetos externos que a 0036 pode ter
-- reescrito, alem dos triggers, policies e FKs diretamente relacionados.
-- Este diagnostico nao recalcula nem substitui o fingerprint global pre-0036.

WITH
touched_functions AS (
  SELECT *
  FROM (VALUES
    ('public.protect_published_keyword()'::text, 'INVOKER'::text, NULL::text, false, false, false, false, false, false, true),
    ('public.can_access_list(uuid)'::text, 'DEFINER'::text, 'search_path=pg_catalog,public,pg_temp'::text, true, true, false, true, true, true, false),
    ('public.import_minerador_discovery_candidates(uuid,uuid,uuid,uuid[])'::text, 'DEFINER'::text, 'search_path=pg_catalog,public,pg_temp'::text, true, false, true, true, true, true, false),
    ('public.minerador_discovery_import_brand_guard()'::text, 'DEFINER'::text, 'search_path=pg_catalog,public,pg_temp'::text, true, false, true, false, false, false, true),
    ('public.protect_marca_with_published()'::text, 'INVOKER'::text, NULL::text, false, true, true, false, false, false, true),
    ('public.protect_published_lista()'::text, 'INVOKER'::text, NULL::text, false, false, true, false, false, false, true),
    ('public.tenant_0005_validate_keyword_brand()'::text, 'INVOKER'::text, 'search_path=public,pg_temp'::text, true, true, true, false, false, false, true)
  ) AS v(
    signature,
    expected_security,
    expected_search_path,
    search_path_required,
    expected_list_reference,
    expected_keyword_reference,
    expected_authenticated_execute,
    expected_service_role_execute,
    forbid_anon_execute,
    trigger_only
  )
),
function_inventory AS (
  SELECT
    tf.signature,
    tf.expected_security,
    tf.expected_search_path,
    tf.search_path_required,
    tf.expected_list_reference,
    tf.expected_keyword_reference,
    tf.expected_authenticated_execute,
    tf.expected_service_role_execute,
    tf.forbid_anon_execute,
    tf.trigger_only,
    p.oid,
    n.nspname AS schema_name,
    p.proname,
    pg_get_function_identity_arguments(p.oid)::text AS identity_arguments,
    pg_get_userbyid(p.proowner)::text AS owner_name,
    p.prosecdef AS security_definer,
    p.prokind::text AS prokind,
    coalesce((
      SELECT regexp_replace(lower(config_value), '\s+', '', 'g')
      FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
      WHERE lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
      ORDER BY config_value
      LIMIT 1
    ), '<none>')::text AS configured_search_path,
    pg_get_functiondef(p.oid)::text AS definition,
    p.proacl::text AS function_acl,
    CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN has_function_privilege('service_role', p.oid, 'EXECUTE') END AS service_role_execute
  FROM touched_functions tf
  LEFT JOIN pg_catalog.pg_proc p
    ON p.oid = to_regprocedure(tf.signature)
  LEFT JOIN pg_catalog.pg_namespace n
    ON n.oid = p.pronamespace
),
function_dependents AS (
  SELECT
    fi.signature,
    coalesce(string_agg(
      d.classid::regclass::text || ':' || d.objid::text || ':' || d.deptype::text,
      '|' ORDER BY d.classid::text, d.objid, d.deptype::text
    ), '<none>')::text AS dependency_summary
  FROM function_inventory fi
  LEFT JOIN pg_catalog.pg_depend d
    ON d.refclassid = 'pg_proc'::regclass
   AND d.refobjid = fi.oid
   AND d.deptype = 'n'
  GROUP BY fi.signature
),
function_checks AS (
  SELECT
    'TOUCHED_FUNCTION'::text AS check_name,
    fi.signature AS object_name,
    ('exists=' || (fi.oid IS NOT NULL)::text
      || ';owner=' || coalesce(fi.owner_name, '<absent>')
      || ';security=' || CASE WHEN fi.security_definer THEN 'DEFINER' ELSE 'INVOKER' END
      || ';prokind=' || coalesce(fi.prokind, '<absent>')
      || ';search_path=' || fi.configured_search_path
      || ';legacy_keywords=' || (coalesce(fi.definition, '') ILIKE '%keywords_kgr%')::text
      || ';legacy_lists=' || (coalesce(fi.definition, '') ILIKE '%listas_kgr%')::text
      || ';new_keywords=' || (coalesce(fi.definition, '') ILIKE '%minerador_keywords%')::text
      || ';new_lists=' || (coalesce(fi.definition, '') ILIKE '%minerador_keyword_lists%')::text
      || ';dependencies=' || coalesce(fd.dependency_summary, '<none>')
      || ';definition=' || coalesce(fi.definition, '<absent>')
      || ';acl=' || coalesce(fi.function_acl, '<default>')
      || ';anon_execute=' || coalesce(fi.anon_execute::text, 'ABSENT')
      || ';authenticated_execute=' || coalesce(fi.authenticated_execute::text, 'ABSENT')
      || ';service_role_execute=' || coalesce(fi.service_role_execute::text, 'ABSENT'))::text AS observed,
    CASE
      WHEN fi.oid IS NULL THEN 'FAIL'
      WHEN fi.owner_name IS NOT NULL
       AND btrim(fi.owner_name) <> ''
       AND CASE
         WHEN fi.expected_security = 'DEFINER' THEN fi.security_definer
         ELSE NOT fi.security_definer
       END
       AND (NOT fi.search_path_required OR fi.configured_search_path = fi.expected_search_path)
       AND coalesce(fi.definition, '') NOT ILIKE '%keywords_kgr%'
       AND coalesce(fi.definition, '') NOT ILIKE '%listas_kgr%'
       AND (NOT fi.expected_keyword_reference OR coalesce(fi.definition, '') ILIKE '%minerador_keywords%')
       AND (NOT fi.expected_list_reference OR coalesce(fi.definition, '') ILIKE '%minerador_keyword_lists%')
       AND (NOT fi.expected_authenticated_execute OR coalesce(fi.authenticated_execute, false))
       AND (NOT fi.expected_service_role_execute OR coalesce(fi.service_role_execute, false))
       AND (NOT fi.forbid_anon_execute OR NOT coalesce(fi.anon_execute, false))
       AND fd.signature = fi.signature THEN 'PASS'
      ELSE 'FAIL'
    END::text AS verdict
  FROM function_inventory fi
  LEFT JOIN function_dependents fd ON fd.signature = fi.signature
),
function_scope_checks AS (
  SELECT
    'TOUCHED_EXTERNAL_OBJECTS'::text AS check_name,
    '0036 function rewrite scope'::text AS object_name,
    coalesce(string_agg(fi.signature, '|' ORDER BY fi.signature), '<none>')::text AS observed,
    CASE WHEN count(fi.oid) = 7 THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  FROM function_inventory fi
  UNION ALL
  SELECT
    'TOUCHED_EXTERNAL_OBJECTS_PRESENT'::text,
    '0036 function rewrite scope'::text,
    ('expected=7;present=' || count(fi.oid)::text)::text,
    CASE WHEN count(fi.oid) = 7 THEN 'PASS' ELSE 'FAIL' END::text
  FROM function_inventory fi
  UNION ALL
  SELECT
    'LEGACY_REFERENCES_IN_TOUCHED_OBJECTS'::text,
    '0036 function rewrite scope'::text,
    ('legacy_functions=' || count(*) FILTER (
      WHERE coalesce(fi.definition, '') ILIKE '%keywords_kgr%'
         OR coalesce(fi.definition, '') ILIKE '%listas_kgr%'
    )::text)::text,
    CASE WHEN count(*) FILTER (
      WHERE coalesce(fi.definition, '') ILIKE '%keywords_kgr%'
         OR coalesce(fi.definition, '') ILIKE '%listas_kgr%'
    ) = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM function_inventory fi
),
target_relations AS (
  SELECT *
  FROM (VALUES
    ('public.marcas'::text),
    ('public.minerador_keywords'::text),
    ('public.minerador_keyword_lists'::text),
    ('public.minerador_discovery_keyword_origins'::text),
    ('public.minerador_discovery_candidates'::text),
    ('public.minerador_discovery_runs'::text),
    ('public.briefings_artigos'::text)
  ) AS v(relation_name)
),
target_triggers AS (
  SELECT
    r.relation_name,
    coalesce(string_agg(
      tg.tgname || '->' || pn.nspname || '.' || pp.proname || '(' || pg_get_function_identity_arguments(pp.oid) || ')',
      '|' ORDER BY tg.tgname
    ), '<none>')::text AS trigger_summary,
    count(tg.oid)::bigint AS trigger_count,
    count(tg.oid) FILTER (WHERE pp.oid IS NOT NULL)::bigint AS valid_function_count,
    count(tg.oid) FILTER (WHERE pp.oid IS NULL)::bigint AS missing_function_count
  FROM target_relations r
  LEFT JOIN pg_catalog.pg_trigger tg
    ON tg.tgrelid = to_regclass(r.relation_name)::oid
   AND NOT tg.tgisinternal
  LEFT JOIN pg_catalog.pg_proc pp ON pp.oid = tg.tgfoid
  LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid = pp.pronamespace
  GROUP BY r.relation_name
),
related_fks AS (
  SELECT
    c.oid,
    c.conname::text AS constraint_name,
    source_namespace.nspname::text AS source_schema,
    source_relation.relname::text AS source_table,
    target_namespace.nspname::text AS target_schema,
    target_relation.relname::text AS target_table,
    c.confdeltype::text AS delete_action,
    pg_get_constraintdef(c.oid, true)::text AS definition
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class source_relation ON source_relation.oid = c.conrelid
  JOIN pg_catalog.pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
  JOIN pg_catalog.pg_class target_relation ON target_relation.oid = c.confrelid
  JOIN pg_catalog.pg_namespace target_namespace ON target_namespace.oid = target_relation.relnamespace
  WHERE c.contype = 'f'
    AND (
      c.conrelid IN (
        to_regclass('public.minerador_keywords')::oid,
        to_regclass('public.minerador_keyword_lists')::oid,
        to_regclass('public.minerador_discovery_keyword_origins')::oid,
        to_regclass('public.minerador_discovery_candidates')::oid,
        to_regclass('public.minerador_discovery_candidate_current_metrics')::oid,
        to_regclass('public.minerador_discovery_candidate_metric_history')::oid,
        to_regclass('public.minerador_keyword_metric_measurements')::oid,
        to_regclass('public.briefings_artigos')::oid
      )
      OR c.confrelid IN (
        to_regclass('public.minerador_keywords')::oid,
        to_regclass('public.minerador_keyword_lists')::oid
      )
    )
),
canonical_fk_expectations AS (
  -- A FK de brand_site_import_batches.target_list_id nao entra neste gate:
  -- a migration 0004 permanece preparada, nao aplicada, e a persistencia
  -- remota dedicada do Site/Sitemap nao faz parte do contrato atual.
  SELECT *
  FROM (VALUES
    ('briefings_artigos_silo_id_fkey'::text, 'public'::text, 'briefings_artigos'::text, 'public'::text, 'minerador_keyword_lists'::text, 'a'::text),
    ('minerador_keyword_metric_measurements_keyword_id_fkey'::text, 'public'::text, 'minerador_keyword_metric_measurements'::text, 'public'::text, 'minerador_keywords'::text, 'c'::text),
    ('minerador_discovery_keyword_origins_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_keyword_origins'::text, 'public'::text, 'minerador_keywords'::text, 'r'::text),
    ('minerador_discovery_candidates_existing_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidates'::text, 'public'::text, 'minerador_keywords'::text, 'r'::text),
    ('minerador_discovery_candidates_imported_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidates'::text, 'public'::text, 'minerador_keywords'::text, 'r'::text),
    ('minerador_discovery_candidate_current_metrics_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidate_current_metrics'::text, 'public'::text, 'minerador_keywords'::text, 'r'::text),
    ('minerador_discovery_candidate_metric_history_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidate_metric_history'::text, 'public'::text, 'minerador_keywords'::text, 'r'::text),
    ('fk_minerador_keywords_brand_0005'::text, 'public'::text, 'minerador_keywords'::text, 'public'::text, 'marcas'::text, 'r'::text),
    ('fk_minerador_keywords_lista_0005'::text, 'public'::text, 'minerador_keywords'::text, 'public'::text, 'minerador_keyword_lists'::text, 'r'::text),
    ('fk_minerador_keywords_lista_brand_0005'::text, 'public'::text, 'minerador_keywords'::text, 'public'::text, 'minerador_keyword_lists'::text, 'r'::text),
    ('fk_minerador_keyword_lists_marca_0005'::text, 'public'::text, 'minerador_keyword_lists'::text, 'public'::text, 'marcas'::text, 'r'::text)
  ) AS v(constraint_name, source_schema, source_table, target_schema, target_table, delete_action)
),
 fk_expectation_audit AS (
  SELECT
    e.constraint_name,
    e.source_schema,
    e.source_table,
    e.target_schema,
    e.target_table,
    e.delete_action,
    f.oid AS observed_oid,
    f.source_schema AS observed_source_schema,
    f.source_table AS observed_source_table,
    f.target_schema AS observed_target_schema,
    f.target_table AS observed_target_table,
    f.delete_action AS observed_delete_action,
    f.definition AS observed_definition,
    (
      f.oid IS NOT NULL
      AND f.constraint_name = e.constraint_name
      AND f.source_schema = e.source_schema
      AND f.source_table = e.source_table
      AND f.target_schema = e.target_schema
      AND f.target_table = e.target_table
      AND f.delete_action = e.delete_action
    ) AS exact_match
  FROM canonical_fk_expectations e
  LEFT JOIN related_fks f
    ON f.constraint_name = e.constraint_name
   AND f.source_schema = e.source_schema
   AND f.source_table = e.source_table
),
fk_contract_audit AS (
  SELECT
    constraint_name,
    source_schema,
    source_table,
    target_schema,
    target_table,
    delete_action,
    observed_oid AS oid,
    observed_source_schema,
    observed_source_table,
    observed_target_schema,
    observed_target_table,
    observed_delete_action,
    observed_definition AS definition,
    exact_match
  FROM fk_expectation_audit
),
fk_expectation_checks AS (
  SELECT
    'FK_EXPECTATION_DETAIL'::text AS check_name,
    e.constraint_name::text AS object_name,
    ('expected_source=' || e.source_schema || '.' || e.source_table
      || ';expected_target=' || e.target_schema || '.' || e.target_table
      || ';expected_delete_action=' || e.delete_action
      || ';found=' || CASE WHEN e.exact_match THEN 'YES' ELSE 'NO' END
      || ';observed_source=' || coalesce(e.observed_source_schema || '.' || e.observed_source_table, '<absent>')
      || ';observed_target=' || coalesce(e.observed_target_schema || '.' || e.observed_target_table, '<absent>')
      || ';observed_delete_action=' || coalesce(e.observed_delete_action, '<absent>'))::text AS observed,
    'INFO'::text AS verdict
  FROM fk_expectation_audit e
),
fk_edge_audit AS (
  SELECT
    count(*) FILTER (
      WHERE f.source_schema = 'public'
        AND f.source_table = 'minerador_keyword_lists'
        AND f.target_schema = 'public'
        AND f.target_table = 'marcas'
    )::bigint AS list_brand_total,
    count(*) FILTER (
      WHERE f.source_schema = 'public'
        AND f.source_table = 'minerador_keyword_lists'
        AND f.target_schema = 'public'
        AND f.target_table = 'marcas'
        AND f.delete_action = 'r'
    )::bigint AS list_brand_restrict,
    count(*) FILTER (
      WHERE f.source_schema = 'public'
        AND f.source_table = 'minerador_keyword_lists'
        AND f.target_schema = 'public'
        AND f.target_table = 'marcas'
        AND f.delete_action = 'c'
    )::bigint AS list_brand_cascade,
    count(*) FILTER (
      WHERE f.source_schema = 'public'
        AND f.source_table = 'minerador_keywords'
        AND f.target_schema = 'public'
        AND f.target_table = 'minerador_keyword_lists'
    )::bigint AS keyword_list_total,
    count(*) FILTER (
      WHERE f.source_schema = 'public'
        AND f.source_table = 'minerador_discovery_candidates'
        AND f.target_schema = 'public'
        AND f.target_table = 'minerador_keywords'
    )::bigint AS candidate_keyword_total,
    count(*) FILTER (
      WHERE f.source_schema = 'public'
        AND f.source_table = 'minerador_discovery_candidate_current_metrics'
        AND f.target_schema = 'public'
        AND f.target_table = 'minerador_keywords'
    )::bigint AS current_metrics_keyword_total,
    count(*) FILTER (
      WHERE f.source_schema = 'public'
        AND f.source_table = 'minerador_discovery_candidate_metric_history'
        AND f.target_schema = 'public'
        AND f.target_table = 'minerador_keywords'
    )::bigint AS history_keyword_total
  FROM related_fks f
),
target_contract_checks AS (
  SELECT
    'TARGET_CONTRACT'::text AS check_name,
    '0036'::text AS object_name,
    ('old_keywords_absent=' || (to_regclass('public.keywords_kgr') IS NULL)::text
      || ';old_lists_absent=' || (to_regclass('public.listas_kgr') IS NULL)::text
      || ';new_keywords_present=' || (to_regclass('public.minerador_keywords') IS NOT NULL)::text
      || ';new_lists_present=' || (to_regclass('public.minerador_keyword_lists') IS NOT NULL)::text
      || ';keyword_rows=' || (SELECT count(*)::text FROM public.minerador_keywords)
      || ';list_rows=' || (SELECT count(*)::text FROM public.minerador_keyword_lists)
      || ';keyword_rls=' || coalesce((SELECT c.relrowsecurity::text FROM pg_catalog.pg_class c WHERE c.oid = to_regclass('public.minerador_keywords')::oid), 'ABSENT')
      || ';list_rls=' || coalesce((SELECT c.relrowsecurity::text FROM pg_catalog.pg_class c WHERE c.oid = to_regclass('public.minerador_keyword_lists')::oid), 'ABSENT')
      || ';keyword_force_rls=' || coalesce((SELECT c.relforcerowsecurity::text FROM pg_catalog.pg_class c WHERE c.oid = to_regclass('public.minerador_keywords')::oid), 'ABSENT')
      || ';list_force_rls=' || coalesce((SELECT c.relforcerowsecurity::text FROM pg_catalog.pg_class c WHERE c.oid = to_regclass('public.minerador_keyword_lists')::oid), 'ABSENT')
      || ';list_id_nullable=' || coalesce((SELECT c.is_nullable FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'minerador_keywords' AND c.column_name = 'lista_id'), 'ABSENT'))::text AS observed,
    CASE
      WHEN to_regclass('public.keywords_kgr') IS NULL
       AND to_regclass('public.listas_kgr') IS NULL
       AND to_regclass('public.minerador_keywords') IS NOT NULL
       AND to_regclass('public.minerador_keyword_lists') IS NOT NULL
       AND (SELECT count(*) FROM public.minerador_keywords) = 0
       AND (SELECT count(*) FROM public.minerador_keyword_lists) = 0
       AND (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = to_regclass('public.minerador_keywords')::oid)
       AND (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = to_regclass('public.minerador_keyword_lists')::oid)
       AND NOT (SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c WHERE c.oid = to_regclass('public.minerador_keywords')::oid)
       AND NOT (SELECT c.relforcerowsecurity FROM pg_catalog.pg_class c WHERE c.oid = to_regclass('public.minerador_keyword_lists')::oid)
       AND (SELECT c.is_nullable FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'minerador_keywords' AND c.column_name = 'lista_id') = 'YES'
       AND (
         SELECT count(*) FROM fk_contract_audit f
         WHERE f.constraint_name = 'fk_minerador_keyword_lists_marca_0005'
           AND f.exact_match
       ) = 1
      THEN 'PASS' ELSE 'FAIL'
    END::text AS verdict
),
fk_checks AS (
  SELECT
    'FK_INTEGRITY'::text AS check_name,
    'related_external_foreign_keys'::text AS object_name,
    ('expected_constraints=' || (SELECT count(*)::text FROM canonical_fk_expectations)
      || ';missing_expected=' || (SELECT count(*) FILTER (WHERE NOT a.exact_match)::text FROM fk_contract_audit a)
      || ';list_brand_total=' || e.list_brand_total::text
      || ';list_brand_restrict=' || e.list_brand_restrict::text
      || ';list_brand_cascade=' || e.list_brand_cascade::text
      || ';keyword_list_total=' || e.keyword_list_total::text
      || ';candidate_keyword_total=' || e.candidate_keyword_total::text
      || ';current_metrics_keyword_total=' || e.current_metrics_keyword_total::text
      || ';history_keyword_total=' || e.history_keyword_total::text
      || ';expected_audit=' || coalesce((SELECT string_agg(
        a.constraint_name || ':found=' || CASE WHEN a.exact_match THEN 'YES' ELSE 'NO' END
          || ':observed_delete_action=' || coalesce(a.observed_delete_action, '<absent>'),
        '|' ORDER BY a.constraint_name
      ) FROM fk_contract_audit a), '<none>')
      || ';constraints=' || coalesce((SELECT string_agg(
        f.constraint_name || ':' || f.source_schema || '.' || f.source_table || '->' || f.target_schema || '.' || f.target_table || ':' || f.delete_action,
        '|' ORDER BY f.constraint_name
      ) FROM related_fks f), '<none>'))::text AS observed,
    CASE
      WHEN (SELECT count(*) FILTER (WHERE NOT a.exact_match) FROM fk_contract_audit a) = 0
       AND e.list_brand_total = 1
       AND e.list_brand_restrict = 1
       AND e.list_brand_cascade = 0
       AND e.keyword_list_total = 2
       AND e.candidate_keyword_total = 2
       AND e.current_metrics_keyword_total = 1
       AND e.history_keyword_total = 1
      THEN 'PASS' ELSE 'FAIL'
    END::text AS verdict
  FROM fk_edge_audit e
),
policy_inventory AS (
  SELECT
    count(DISTINCT p.tablename)::bigint AS target_table_count,
    count(*)::bigint AS policy_count,
    count(*) FILTER (
      WHERE coalesce(p.policyname, '') ILIKE '%keywords_kgr%'
         OR coalesce(p.policyname, '') ILIKE '%listas_kgr%'
         OR coalesce(p.qual, '') ILIKE '%keywords_kgr%'
         OR coalesce(p.qual, '') ILIKE '%listas_kgr%'
         OR coalesce(p.with_check, '') ILIKE '%keywords_kgr%'
         OR coalesce(p.with_check, '') ILIKE '%listas_kgr%'
    )::bigint AS legacy_reference_count,
    coalesce(string_agg(
      p.schemaname || '.' || p.tablename || ':' || p.policyname || ':' || p.cmd,
      '|' ORDER BY p.tablename, p.policyname
    ), '<none>')::text AS policy_summary
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN ('minerador_keywords', 'minerador_keyword_lists')
),
policy_checks AS (
  SELECT
    'POLICY_INTEGRITY'::text AS check_name,
    'minerador entities'::text AS object_name,
    ('target_tables=' || i.target_table_count::text
      || ';policies=' || i.policy_count::text
      || ';legacy_references=' || i.legacy_reference_count::text
      || ';summary=' || i.policy_summary)::text AS observed,
    CASE
      WHEN i.target_table_count = 2
       AND i.policy_count > 0
       AND i.legacy_reference_count = 0
      THEN 'PASS' ELSE 'FAIL'
    END::text AS verdict
  FROM policy_inventory i
),
view_inventory AS (
  SELECT
    count(*)::bigint AS view_count,
    count(*) FILTER (
      WHERE pg_get_viewdef(c.oid, true) ILIKE '%keywords_kgr%'
         OR pg_get_viewdef(c.oid, true) ILIKE '%listas_kgr%'
    )::bigint AS legacy_reference_count,
    coalesce(string_agg(n.nspname || '.' || c.relname, '|' ORDER BY n.nspname, c.relname), '<none>')::text AS view_summary
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v', 'm')
    AND n.nspname = 'public'
    AND (
      pg_get_viewdef(c.oid, true) ILIKE '%minerador_keywords%'
      OR pg_get_viewdef(c.oid, true) ILIKE '%minerador_keyword_lists%'
      OR pg_get_viewdef(c.oid, true) ILIKE '%keywords_kgr%'
      OR pg_get_viewdef(c.oid, true) ILIKE '%listas_kgr%'
    )
),
view_checks AS (
  SELECT
    'VIEW_INTEGRITY'::text AS check_name,
    'related_views'::text AS object_name,
    ('view_count=' || i.view_count::text
      || ';legacy_references=' || i.legacy_reference_count::text
      || ';summary=' || i.view_summary)::text AS observed,
    CASE WHEN i.legacy_reference_count = 0 THEN 'INFO' ELSE 'FAIL' END::text AS verdict
  FROM view_inventory i
),
base_checks AS (
  SELECT check_name, object_name, observed, verdict FROM function_checks
  UNION ALL
  SELECT check_name, object_name, observed, verdict FROM function_scope_checks
  UNION ALL
  SELECT check_name, object_name, observed, verdict FROM target_contract_checks
  UNION ALL
  SELECT check_name, object_name, observed, verdict FROM fk_expectation_checks
  UNION ALL
  SELECT 'TRIGGER_FUNCTION_INTEGRITY', relation_name, ('trigger_count=' || trigger_count::text || ';valid=' || valid_function_count::text || ';missing=' || missing_function_count::text || ';triggers=' || trigger_summary)::text, CASE WHEN missing_function_count = 0 THEN 'PASS' ELSE 'FAIL' END::text FROM target_triggers
  UNION ALL
  SELECT check_name, object_name, observed, verdict FROM fk_checks
  UNION ALL
  SELECT check_name, object_name, observed, verdict FROM policy_checks
  UNION ALL
  SELECT check_name, object_name, observed, verdict FROM view_checks
),
scope_summary AS (
  SELECT count(*) FILTER (WHERE verdict = 'FAIL')::bigint AS failure_count
  FROM base_checks
),
checks AS (
  SELECT check_name, object_name, observed, verdict FROM base_checks
  UNION ALL
  SELECT
    '0036_EXTERNAL_DROP_STATEMENTS'::text,
    'migration static contract'::text,
    'external_drops=NONE;target_constraint_drop=listas_kgr_marca_id_fkey'::text,
    'PASS'::text
  UNION ALL
  SELECT
    'EXTERNAL_CATALOG_DELTA'::text,
    'external_catalog'::text,
    'pre_rows=7075;post_rows=7073;delta=-2;pre_hash=b0e37afd4f93e0727bda633a834f3ea2;post_hash=d3f66bfe68d4fb3a686fb126df57d90c;identities=not_captured'::text,
    'EVIDENCE_GAP'::text
  UNION ALL
  SELECT
    'EXTERNAL_CATALOG_DELTA_EXPLAINED'::text,
    'external_catalog'::text,
    'retroactive_row_identity_explanation_unavailable'::text,
    'NO'::text
  UNION ALL
  SELECT
    'EXTERNAL_TOUCHED_SCOPE_VERIFIED'::text,
    '0036 touched external scope'::text,
    ('scope_failures=' || s.failure_count::text)::text,
    CASE WHEN s.failure_count = 0 THEN 'YES' ELSE 'NO' END::text
  FROM scope_summary s
  UNION ALL
  SELECT
    'UNEXPECTED_DAMAGE_EVIDENCE'::text,
    '0036 touched external scope'::text,
    'no_damage_signal_within_audited_scope'::text,
    CASE WHEN s.failure_count = 0 THEN 'NONE' ELSE 'INVESTIGATE' END::text
  FROM scope_summary s
  UNION ALL
  SELECT
    'FINAL_CLASSIFICATION'::text,
    '0036 remote verification'::text,
    ('external_catalog_delta=-2;delta_explained=NO;scope_failures=' || s.failure_count::text || ';unexpected_damage_evidence=' || CASE WHEN s.failure_count = 0 THEN 'NONE' ELSE 'PRESENT_OR_UNVERIFIED' END)::text,
    CASE
      WHEN s.failure_count = 0 THEN 'PASS_WITH_DOCUMENTED_EXTERNAL_CATALOG_EVIDENCE_GAP'
      ELSE 'INVESTIGATE'
    END::text
  FROM scope_summary s
)
SELECT check_name, object_name, observed, verdict
FROM checks
ORDER BY check_name, object_name;
