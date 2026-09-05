-- READ-ONLY post-verifier for 0047.
-- Baselines are bound to the successful preflight captured on 2026-08-20:
-- data keyword rows=7, measurements=18, origins=7, artifacts=2,
-- workflows=2, publications=0, keyword fingerprint=6514d62c2a740a076c408d92e7bfa3a4;
-- preserved external catalog rows=6509, fingerprint=36b0ec7798a1b1aa9df006054b46cc63.

WITH target AS (
  SELECT 'public.minerador_keywords'::text AS object_name,
         'public.minerador_keywords'::regclass::oid AS oid
  WHERE to_regclass('public.minerador_keywords') IS NOT NULL
), target_shape AS (
  SELECT
    count(*) FILTER (WHERE a.attname IN ('deleted_at','purge_after','deleted_by'))::integer AS lifecycle_columns,
    bool_and((a.attname IN ('deleted_at','purge_after') AND a.atttypid='timestamptz'::regtype) OR (a.attname='deleted_by' AND a.atttypid='uuid'::regtype)) FILTER (WHERE a.attname IN ('deleted_at','purge_after','deleted_by')) AS lifecycle_types
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid=(SELECT oid FROM target) AND a.attnum>0 AND NOT a.attisdropped
), tombstone AS (
  SELECT count(*) FILTER (WHERE deleted_at IS NULL AND purge_after IS NULL AND deleted_by IS NULL)::integer AS active_rows,
         count(*) FILTER (WHERE deleted_at IS NOT NULL AND purge_after = deleted_at + interval '24 hours' AND deleted_by IS NOT NULL AND purge_after > current_timestamp)::integer AS recoverable_rows,
         count(*) FILTER (WHERE deleted_at IS NOT NULL AND purge_after <= current_timestamp)::integer AS expired_rows,
         count(*) FILTER (WHERE NOT ((deleted_at IS NULL AND purge_after IS NULL AND deleted_by IS NULL) OR (deleted_at IS NOT NULL AND purge_after = deleted_at + interval '24 hours' AND deleted_by IS NOT NULL)))::integer AS invalid_rows
  FROM public.minerador_keywords
), lifecycle_functions AS (
  SELECT p.oid, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, coalesce(array_to_string(p.proconfig, ','),'') AS config, pg_catalog.pg_get_functiondef(p.oid)::text AS definition
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('lifecycle_keyword_is_published','lifecycle_keyword_deletion_impact','lifecycle_preview_minerador_keywords','lifecycle_delete_minerador_keywords','lifecycle_restore_minerador_keywords','lifecycle_purge_minerador_keywords','protect_published_keyword','minerador_keyword_is_published','delete_minerador_keywords','delete_minerador_keyword','recover_minerador_keywords','restore_minerador_keyword','purge_minerador_keywords')
), external_catalog_entries AS (
  SELECT format('class|%s|%s|%s|%s', n.nspname, c.relname, c.relkind::text, c.relpersistence::text)::text AS entry
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.oid <> (SELECT oid FROM target)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indexrelid=c.oid AND i.indrelid=(SELECT oid FROM target))
  UNION ALL
  SELECT format('type|%s|%s|%s', n.nspname, t.typname, t.typtype::text)::text
  FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public' AND t.typrelid <> (SELECT oid FROM target)
  UNION ALL
  SELECT format('constraint|%s|%s|%s|%s|%s', ns.nspname, src.relname, c.conname, c.contype::text, pg_catalog.pg_get_constraintdef(c.oid, true))::text
  FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class src ON src.oid=c.conrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=src.relnamespace
  WHERE ns.nspname='public' AND c.conrelid <> (SELECT oid FROM target)
  UNION ALL
  SELECT format('index|%s|%s|%s|%s|%s|%s', ns.nspname, src.relname, idx.relname, i.indisvalid::text, i.indisready::text, pg_catalog.pg_get_indexdef(i.indexrelid))::text
  FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid JOIN pg_catalog.pg_class src ON src.oid=i.indrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=src.relnamespace
  WHERE ns.nspname='public' AND i.indrelid <> (SELECT oid FROM target)
  UNION ALL
  SELECT format('trigger|%s|%s|%s|%s', ns.nspname, rel.relname, trg.tgname, pg_catalog.pg_get_triggerdef(trg.oid, true))::text
  FROM pg_catalog.pg_trigger trg JOIN pg_catalog.pg_class rel ON rel.oid=trg.tgrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=rel.relnamespace
  WHERE ns.nspname='public' AND NOT trg.tgisinternal AND trg.tgrelid <> (SELECT oid FROM target)
  UNION ALL
  SELECT format('policy|%s|%s|%s|%s|%s', p.schemaname, p.tablename, p.policyname, p.cmd::text, coalesce(p.qual::text,''))::text
  FROM pg_catalog.pg_policies p WHERE p.schemaname='public' AND p.tablename <> 'minerador_keywords'
  UNION ALL
  SELECT format('function|%s|%s|%s|%s', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_functiondef(p.oid))::text
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname NOT IN ('protect_published_keyword','minerador_keyword_is_published','lifecycle_keyword_is_published','lifecycle_keyword_deletion_impact','lifecycle_preview_minerador_keywords','lifecycle_delete_minerador_keywords','lifecycle_restore_minerador_keywords','lifecycle_purge_minerador_keywords','delete_minerador_keywords','delete_minerador_keyword','recover_minerador_keywords','restore_minerador_keyword','purge_minerador_keywords')
  UNION ALL
  SELECT format('dependency|%s|%s|%s|%s|%s', d.classid::text, d.objid::text, d.refclassid::text, d.refobjid::text, d.deptype::text)::text
  FROM pg_catalog.pg_depend d
  WHERE d.objid <> (SELECT oid FROM target) AND d.refobjid <> (SELECT oid FROM target)
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc touched JOIN pg_catalog.pg_namespace touched_namespace ON touched_namespace.oid=touched.pronamespace
      WHERE touched_namespace.nspname='public' AND touched.proname IN ('protect_published_keyword','minerador_keyword_is_published','lifecycle_keyword_is_published','lifecycle_keyword_deletion_impact','lifecycle_preview_minerador_keywords','lifecycle_delete_minerador_keywords','lifecycle_restore_minerador_keywords','lifecycle_purge_minerador_keywords','delete_minerador_keywords','delete_minerador_keyword','recover_minerador_keywords','restore_minerador_keyword','purge_minerador_keywords')
        AND (touched.oid=d.objid OR touched.oid=d.refobjid)
    )
), external_catalog AS (
  SELECT count(*)::bigint AS row_count, md5(coalesce(string_agg(entry, E'\n' ORDER BY entry), ''))::text AS fingerprint FROM external_catalog_entries
), data_fingerprint AS (
  SELECT (SELECT count(*) FROM public.minerador_keywords)::bigint AS keyword_rows,
    (SELECT count(*) FROM public.minerador_keyword_metric_measurements)::bigint AS measurement_rows,
    (SELECT count(*) FROM public.minerador_discovery_keyword_origins)::bigint AS origin_rows,
    (SELECT count(*) FROM public.editorial_artifact_versions)::bigint AS artifact_rows,
    (SELECT count(*) FROM public.editorial_workflow_items)::bigint AS workflow_rows,
    (SELECT count(*) FROM public.publication_records)::bigint AS publication_rows,
    md5(coalesce((SELECT string_agg(format('%s|%s|%s|%s', k.id::text, k.brand_id::text, k.keyword, coalesce(k.status,'')), E'\n' ORDER BY k.id::text) FROM public.minerador_keywords k), ''))::text AS keyword_fingerprint
), acl AS (
  SELECT has_table_privilege('public', 'public.minerador_keywords', 'DELETE') AS public_delete, has_table_privilege('anon', 'public.minerador_keywords', 'DELETE') AS anon_delete, has_table_privilege('authenticated', 'public.minerador_keywords', 'DELETE') AS authenticated_delete, has_table_privilege('service_role', 'public.minerador_keywords', 'DELETE') AS service_delete
), checks AS (
  SELECT 'TARGET_CONTRACT'::text AS check_name, 'public.minerador_keywords'::text AS object_name, format('present=%s; lifecycle_columns=%s; lifecycle_types=%s; constraint=%s; index=%s', EXISTS (SELECT 1 FROM target), (SELECT lifecycle_columns FROM target_shape), coalesce((SELECT lifecycle_types::text FROM target_shape),'false'), EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=(SELECT oid FROM target) AND conname='minerador_keywords_global_lifecycle_check'), EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relname='minerador_keywords_global_recoverable_idx' AND relkind='i')) AS observed, CASE WHEN EXISTS (SELECT 1 FROM target) AND (SELECT lifecycle_columns FROM target_shape)=3 AND coalesce((SELECT lifecycle_types FROM target_shape),false) AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=(SELECT oid FROM target) AND conname='minerador_keywords_global_lifecycle_check') THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  UNION ALL SELECT 'TOMBSTONE_STATE', 'public.minerador_keywords', format('active=%s; recoverable=%s; expired=%s; invalid=%s', active_rows, recoverable_rows, expired_rows, invalid_rows), CASE WHEN invalid_rows=0 AND recoverable_rows=0 AND expired_rows=0 THEN 'PASS' ELSE 'FAIL' END FROM tombstone
  UNION ALL SELECT 'RLS', 'public.minerador_keywords', format('enabled=%s; forced=%s', c.relrowsecurity, c.relforcerowsecurity), CASE WHEN c.relrowsecurity IS TRUE AND c.relforcerowsecurity IS FALSE THEN 'PASS' ELSE 'FAIL' END FROM pg_catalog.pg_class c WHERE c.oid=(SELECT oid FROM target)
  UNION ALL SELECT 'POLICIES', 'public.minerador_keywords', format('count=%s; delete=%s', count(*), count(*) FILTER (WHERE cmd='DELETE')), CASE WHEN count(*)>0 THEN 'PASS' ELSE 'FAIL' END FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='minerador_keywords'
  UNION ALL SELECT 'DIRECT_DELETE_ACL', 'public.minerador_keywords', format('PUBLIC=%s; anon=%s; authenticated=%s; service_role=%s', public_delete, anon_delete, authenticated_delete, service_delete), CASE WHEN NOT public_delete AND NOT anon_delete AND NOT authenticated_delete AND NOT service_delete THEN 'PASS' ELSE 'FAIL' END FROM acl
  UNION ALL SELECT 'LIFECYCLE_FUNCTIONS', 'public lifecycle RPCs', format('core=%s; wrappers=%s; security_definer=%s; search_path=%s', (SELECT count(*) FROM lifecycle_functions WHERE proname LIKE 'lifecycle_%'), (SELECT count(*) FROM lifecycle_functions WHERE proname IN ('delete_minerador_keywords','delete_minerador_keyword','recover_minerador_keywords','restore_minerador_keyword','purge_minerador_keywords')), (SELECT count(*) FROM lifecycle_functions WHERE prosecdef), (SELECT count(*) FROM lifecycle_functions WHERE config LIKE '%search_path=pg_catalog, public, pg_temp%')), CASE WHEN (SELECT count(*) FROM lifecycle_functions WHERE proname LIKE 'lifecycle_%')=6 AND (SELECT count(*) FROM lifecycle_functions WHERE proname IN ('delete_minerador_keywords','delete_minerador_keyword','recover_minerador_keywords','restore_minerador_keyword','purge_minerador_keywords'))=5 AND (SELECT count(*) FROM lifecycle_functions WHERE prosecdef)=13 AND (SELECT count(*) FROM lifecycle_functions WHERE config LIKE '%search_path=pg_catalog, public, pg_temp%')=13 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 'RPC_ACL', 'service_role only', format('preview=%s; delete=%s; restore=%s; purge=%s; authenticated_preview=%s', has_function_privilege('service_role','public.lifecycle_preview_minerador_keywords(uuid,uuid[],uuid)','EXECUTE'), has_function_privilege('service_role','public.lifecycle_delete_minerador_keywords(uuid,uuid[],uuid)','EXECUTE'), has_function_privilege('service_role','public.lifecycle_restore_minerador_keywords(uuid,uuid[],uuid)','EXECUTE'), has_function_privilege('service_role','public.lifecycle_purge_minerador_keywords(uuid,uuid[],uuid)','EXECUTE'), has_function_privilege('authenticated','public.lifecycle_preview_minerador_keywords(uuid,uuid[],uuid)','EXECUTE')), CASE WHEN has_function_privilege('service_role','public.lifecycle_preview_minerador_keywords(uuid,uuid[],uuid)','EXECUTE') AND has_function_privilege('service_role','public.lifecycle_delete_minerador_keywords(uuid,uuid[],uuid)','EXECUTE') AND has_function_privilege('service_role','public.lifecycle_restore_minerador_keywords(uuid,uuid[],uuid)','EXECUTE') AND has_function_privilege('service_role','public.lifecycle_purge_minerador_keywords(uuid,uuid[],uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','public.lifecycle_preview_minerador_keywords(uuid,uuid[],uuid)','EXECUTE') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 'PUBLISHED_RESOLVER', 'public.lifecycle_keyword_is_published(uuid,uuid)', format('formal_site_helper=%s; publication_records=%s; legacy_status_ignored=%s', (SELECT definition ILIKE '%minerador_keyword_is_published%' FROM lifecycle_functions WHERE proname='lifecycle_keyword_is_published'), (SELECT definition ILIKE '%publication_records%' FROM lifecycle_functions WHERE proname='lifecycle_keyword_is_published'), NOT ((SELECT definition FROM lifecycle_functions WHERE proname='lifecycle_keyword_is_published') ILIKE '%publicado%')), CASE WHEN (SELECT definition ILIKE '%minerador_keyword_is_published%' FROM lifecycle_functions WHERE proname='lifecycle_keyword_is_published') AND (SELECT definition ILIKE '%publication_records%' FROM lifecycle_functions WHERE proname='lifecycle_keyword_is_published') AND NOT ((SELECT definition FROM lifecycle_functions WHERE proname='lifecycle_keyword_is_published') ILIKE '%publicado%') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 'TRIGGER_GUARD', 'public.protect_published_keyword()', coalesce((SELECT definition FROM lifecycle_functions WHERE proname='protect_published_keyword'),'absent'), CASE WHEN (SELECT definition ILIKE '%lifecycle_keyword_is_published%' FROM lifecycle_functions WHERE proname='protect_published_keyword') AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=(SELECT oid FROM target) AND NOT tgisinternal AND tgname='trg_protect_published_keyword') THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 'DATA_PRESERVATION', 'preflight baseline 2026-08-20', format('keywords=%s; measurements=%s; origins=%s; artifacts=%s; workflows=%s; publications=%s; keyword_fingerprint=%s', keyword_rows, measurement_rows, origin_rows, artifact_rows, workflow_rows, publication_rows, keyword_fingerprint), CASE WHEN keyword_rows=7 AND measurement_rows=18 AND origin_rows=7 AND artifact_rows=2 AND workflow_rows=2 AND publication_rows=0 AND keyword_fingerprint='6514d62c2a740a076c408d92e7bfa3a4' THEN 'PASS' ELSE 'FAIL' END FROM data_fingerprint
  UNION ALL SELECT 'PRESERVED_EXTERNAL_CATALOG', 'preflight baseline 2026-08-20', format('rows=%s; fingerprint=%s', row_count, fingerprint), CASE WHEN row_count=6509 AND fingerprint='36b0ec7798a1b1aa9df006054b46cc63' THEN 'PASS' ELSE 'FAIL' END FROM external_catalog
  UNION ALL SELECT 'NO_GENERIC_DELETE_RPC', 'public lifecycle functions', 'No table_name, column_name or dynamic EXECUTE contract is present in the typed migration.', CASE WHEN NOT EXISTS (SELECT 1 FROM lifecycle_functions WHERE proname LIKE 'lifecycle_%' AND (definition ILIKE '%table_name%' OR definition ILIKE '%EXECUTE%')) THEN 'PASS' ELSE 'FAIL' END
), gate AS (
  SELECT count(*) FILTER (WHERE verdict='FAIL')::integer AS structural_failures FROM checks
)
SELECT check_name, object_name, observed, verdict FROM checks
UNION ALL
SELECT 'POST_VERIFIER_GATE'::text, '0047 global lifecycle'::text, format('structural_failures=%s', structural_failures), CASE WHEN structural_failures=0 THEN 'PASS' ELSE 'FAIL' END::text FROM gate
ORDER BY check_name, object_name;
