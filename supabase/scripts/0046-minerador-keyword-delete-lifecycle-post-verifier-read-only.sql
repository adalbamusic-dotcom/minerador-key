-- 0046 post-verifier — somente leitura.
-- Não executa purge, delete, update, DDL, migration ou chamada de provider.

WITH target AS (
  SELECT c.oid, c.relrowsecurity, c.relforcerowsecurity,
         n.nspname::text AS schema_name, c.relname::text AS relation_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'minerador_keywords'
    AND c.relkind IN ('r', 'p')
),
target_acl AS (
  SELECT coalesce(tclass.relacl, pg_catalog.acldefault('r', tclass.relowner)) AS acl
  FROM target t
  JOIN pg_catalog.pg_class tclass ON tclass.oid = t.oid
),
tombstone AS (
  SELECT
    count(*)::bigint AS total_rows,
    count(*) FILTER (WHERE deleted_at IS NULL AND purge_after IS NULL)::bigint AS active_rows,
    count(*) FILTER (WHERE deleted_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after > current_timestamp)::bigint AS recoverable_rows,
    count(*) FILTER (WHERE deleted_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= current_timestamp)::bigint AS expired_rows,
    count(*) FILTER (WHERE (deleted_at IS NULL AND purge_after IS NOT NULL)
      OR (deleted_at IS NOT NULL AND purge_after IS NULL)
      OR (deleted_at IS NOT NULL AND purge_after IS DISTINCT FROM deleted_at + interval '24 hours'))::bigint AS invalid_rows
  FROM public.minerador_keywords
),
expected_fk(conname, source_schema, source_table, target_schema, target_table, delete_action) AS (
  VALUES
    ('minerador_keyword_metric_measurements_keyword_id_fkey'::text, 'public'::text, 'minerador_keyword_metric_measurements'::text, 'public'::text, 'minerador_keywords'::text, 'CASCADE'::text),
    ('minerador_discovery_keyword_origins_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_keyword_origins'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text),
    ('minerador_discovery_candidates_existing_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidates'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text),
    ('minerador_discovery_candidates_imported_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidates'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text),
    ('minerador_discovery_candidate_current_metrics_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidate_current_metrics'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text),
    ('minerador_discovery_candidate_metric_history_keyword_id_fkey'::text, 'public'::text, 'minerador_discovery_candidate_metric_history'::text, 'public'::text, 'minerador_keywords'::text, 'RESTRICT'::text)
),
actual_fk AS (
  SELECT
    c.conname::text AS conname,
    sn.nspname::text AS source_schema,
    src.relname::text AS source_table,
    tn.nspname::text AS target_schema,
    target.relname::text AS target_table,
    CASE c.confdeltype
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE 'UNKNOWN'
    END::text AS delete_action
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class src ON src.oid = c.conrelid
  JOIN pg_catalog.pg_namespace sn ON sn.oid = src.relnamespace
  JOIN pg_catalog.pg_class target ON target.oid = c.confrelid
  JOIN pg_catalog.pg_namespace tn ON tn.oid = target.relnamespace
  WHERE c.contype = 'f'
    AND tn.nspname = 'public'
    AND target.relname = 'minerador_keywords'
),
fk_summary AS (
  SELECT
    (SELECT count(*) FROM expected_fk)::integer AS expected_count,
    (SELECT count(*) FROM expected_fk e JOIN actual_fk a USING (conname, source_schema, source_table, target_schema, target_table, delete_action))::integer AS matched_count,
    (SELECT count(*) FROM actual_fk a LEFT JOIN expected_fk e USING (conname, source_schema, source_table, target_schema, target_table, delete_action) WHERE e.conname IS NULL)::integer AS unexpected_count
),
function_state AS (
  SELECT
    p.oid,
    p.prosecdef,
    coalesce(array_to_string(p.proconfig, ','), '') AS config,
    pg_get_functiondef(p.oid)::text AS definition
  FROM pg_catalog.pg_proc p
  WHERE p.oid IN (
    to_regprocedure('public.minerador_keyword_is_published(text,jsonb)'),
    to_regprocedure('public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)'),
    to_regprocedure('public.recover_minerador_keywords(uuid,uuid[],uuid)'),
    to_regprocedure('public.purge_minerador_keywords(uuid,uuid[],uuid)')
  )
),
checks AS (
  SELECT
    'TARGET_CONTRACT'::text AS check_name,
    'public.minerador_keywords'::text AS object_name,
    format('present=%s; schema=%s; relation=%s', EXISTS (SELECT 1 FROM target), coalesce((SELECT schema_name FROM target), '<absent>'), coalesce((SELECT relation_name FROM target), '<absent>'))::text AS observed,
    CASE WHEN EXISTS (SELECT 1 FROM target) THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  UNION ALL
  SELECT
    'TOMBSTONE_STATE'::text,
    'public.minerador_keywords'::text,
    format('total=%s; active=%s; recoverable=%s; expired=%s; invalid=%s', total_rows, active_rows, recoverable_rows, expired_rows, invalid_rows)::text,
    CASE WHEN invalid_rows = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM tombstone
  UNION ALL
  SELECT
    'RLS'::text,
    'public.minerador_keywords'::text,
    format('enabled=%s; forced=%s', coalesce(relrowsecurity::text, '<absent>'), coalesce(relforcerowsecurity::text, '<absent>'))::text,
    CASE WHEN relrowsecurity IS TRUE AND relforcerowsecurity IS FALSE THEN 'PASS' ELSE 'FAIL' END::text
  FROM target
  UNION ALL
  SELECT
    'POLICIES'::text,
    'public.minerador_keywords'::text,
    format('policy_count=%s; delete_policies=%s',
      (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'minerador_keywords'),
      (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'minerador_keywords' AND cmd = 'DELETE'))::text,
    CASE WHEN (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'minerador_keywords') > 0 THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'FOREIGN_KEYS'::text,
    'public.minerador_keywords'::text,
    format('expected=%s; matched=%s; unexpected=%s', expected_count, matched_count, unexpected_count)::text,
    CASE WHEN expected_count = matched_count AND unexpected_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM fk_summary
  UNION ALL
  SELECT
    'DIRECT_DELETE_GRANT'::text,
    'public.minerador_keywords'::text,
    format('PUBLIC=%s; anon=%s; authenticated=%s; service_role=%s',
      coalesce((SELECT bool_or(grantee = 0 AND privilege_type = 'DELETE') FROM target_acl, pg_catalog.aclexplode(target_acl.acl)), false),
      has_table_privilege('anon', 'public.minerador_keywords', 'DELETE'),
      has_table_privilege('authenticated', 'public.minerador_keywords', 'DELETE'),
      has_table_privilege('service_role', 'public.minerador_keywords', 'DELETE'))::text,
    CASE WHEN coalesce((SELECT bool_or(grantee = 0 AND privilege_type = 'DELETE') FROM target_acl, pg_catalog.aclexplode(target_acl.acl)), false) = false
      AND has_table_privilege('anon', 'public.minerador_keywords', 'DELETE') = false
      AND has_table_privilege('authenticated', 'public.minerador_keywords', 'DELETE') = false
      AND has_table_privilege('service_role', 'public.minerador_keywords', 'DELETE') = false
      THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'FUNCTIONS'::text,
    'public.minerador_keyword_is_published / delete / recover / purge'::text,
    format('resolver=%s; delete=%s; recover=%s; purge=%s; security_definer=%s',
      to_regprocedure('public.minerador_keyword_is_published(text,jsonb)') IS NOT NULL,
      to_regprocedure('public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)') IS NOT NULL,
      to_regprocedure('public.recover_minerador_keywords(uuid,uuid[],uuid)') IS NOT NULL,
      to_regprocedure('public.purge_minerador_keywords(uuid,uuid[],uuid)') IS NOT NULL,
      (SELECT count(*) FROM function_state WHERE prosecdef IS TRUE))::text,
    CASE WHEN (SELECT count(*) FROM function_state) = 4
      AND (SELECT count(*) FROM function_state WHERE prosecdef IS TRUE) = 4
      AND (SELECT count(*) FROM function_state WHERE config LIKE '%search_path=pg_catalog, public, pg_temp%') = 4
      THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'RPC_EXECUTE_ACL'::text,
    'service_role only'::text,
    format('delete_service=%s; recover_service=%s; purge_service=%s; delete_auth=%s; recover_auth=%s; purge_auth=%s',
      has_function_privilege('service_role', 'public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.recover_minerador_keywords(uuid,uuid[],uuid)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.purge_minerador_keywords(uuid,uuid[],uuid)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.recover_minerador_keywords(uuid,uuid[],uuid)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.purge_minerador_keywords(uuid,uuid[],uuid)', 'EXECUTE'))::text,
    CASE WHEN has_function_privilege('service_role', 'public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.recover_minerador_keywords(uuid,uuid[],uuid)', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.purge_minerador_keywords(uuid,uuid[],uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.recover_minerador_keywords(uuid,uuid[],uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.purge_minerador_keywords(uuid,uuid[],uuid)', 'EXECUTE')
      THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'PUBLISHED_RESOLVER'::text,
    'public.minerador_keyword_is_published(text,jsonb)'::text,
    coalesce((SELECT definition FROM function_state WHERE oid = to_regprocedure('public.minerador_keyword_is_published(text,jsonb)')), '<absent>')::text,
    CASE WHEN (SELECT definition FROM function_state WHERE oid = to_regprocedure('public.minerador_keyword_is_published(text,jsonb)')) ILIKE '%site_origin%'
      AND (SELECT definition FROM function_state WHERE oid = to_regprocedure('public.minerador_keyword_is_published(text,jsonb)')) ILIKE '%publicationConfirmed%'
      AND (SELECT definition FROM function_state WHERE oid = to_regprocedure('public.minerador_keyword_is_published(text,jsonb)')) NOT ILIKE '%keyword_dna%'
      THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'TRIGGER_GUARD'::text,
    'public.protect_published_keyword()'::text,
    coalesce(pg_get_functiondef(to_regprocedure('public.protect_published_keyword()')), '<absent>')::text,
    CASE WHEN to_regprocedure('public.protect_published_keyword()') IS NOT NULL
      AND pg_get_functiondef(to_regprocedure('public.protect_published_keyword()')) ILIKE '%KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW%'
      AND pg_get_functiondef(to_regprocedure('public.protect_published_keyword()')) ILIKE '%KEYWORD_RECOVERABLE_DELETE_FAILED%'
      THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'ATOMICITY_CONTRACT'::text,
    'delete_minerador_keywords / recover_minerador_keywords / purge_minerador_keywords'::text,
    format('delete_partial_false=%s; recover_partial_false=%s; purge_partial_false=%s',
      (SELECT definition ILIKE '%partialDelete%false%' FROM function_state WHERE oid = to_regprocedure('public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)')),
      (SELECT definition ILIKE '%partialDelete%false%' FROM function_state WHERE oid = to_regprocedure('public.recover_minerador_keywords(uuid,uuid[],uuid)')),
      (SELECT definition ILIKE '%partialDelete%false%' FROM function_state WHERE oid = to_regprocedure('public.purge_minerador_keywords(uuid,uuid[],uuid)')) )::text,
    CASE WHEN (SELECT definition ILIKE '%partialDelete%false%' FROM function_state WHERE oid = to_regprocedure('public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)'))
      AND (SELECT definition ILIKE '%partialDelete%false%' FROM function_state WHERE oid = to_regprocedure('public.recover_minerador_keywords(uuid,uuid[],uuid)'))
      AND (SELECT definition ILIKE '%partialDelete%false%' FROM function_state WHERE oid = to_regprocedure('public.purge_minerador_keywords(uuid,uuid[],uuid)'))
      THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT
    'PUBLISHED_DOWNSTREAM_PRESERVATION'::text,
    'lifecycle RPC definitions'::text,
    format('publication_records_reference=%s; editorial_artifact_delete=%s; status_event_delete=%s; decision_event_delete=%s',
      (SELECT bool_or(definition ILIKE '%publication_records%') FROM function_state),
      (SELECT bool_or(definition ILIKE '%DELETE FROM public.editorial_artifact_versions%') FROM function_state),
      (SELECT bool_or(definition ILIKE '%DELETE FROM public.editorial_version_status_events%') FROM function_state),
      (SELECT bool_or(definition ILIKE '%DELETE FROM public.editorial_decision_events%') FROM function_state))::text,
    CASE WHEN NOT coalesce((SELECT bool_or(definition ILIKE '%publication_records%') FROM function_state), false)
      AND NOT coalesce((SELECT bool_or(definition ILIKE '%DELETE FROM public.editorial_artifact_versions%') FROM function_state), false)
      AND NOT coalesce((SELECT bool_or(definition ILIKE '%DELETE FROM public.editorial_version_status_events%') FROM function_state), false)
      AND NOT coalesce((SELECT bool_or(definition ILIKE '%DELETE FROM public.editorial_decision_events%') FROM function_state), false)
      THEN 'PASS' ELSE 'FAIL' END::text
)
SELECT check_name, object_name, observed, verdict
FROM checks
ORDER BY check_name, object_name;
