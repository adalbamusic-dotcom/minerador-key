-- READ-ONLY preflight for 0047.
-- One report contract: check_name, object_name, observed, verdict.

WITH target AS (
  SELECT 'public.minerador_keywords'::text AS object_name,
         'public.minerador_keywords'::regclass::oid AS oid
  WHERE to_regclass('public.minerador_keywords') IS NOT NULL
), lifecycle_columns AS (
  SELECT count(*)::integer AS column_count
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = to_regclass('public.minerador_keywords')
    AND a.attname IN ('deleted_at', 'purge_after', 'deleted_by')
    AND a.attnum > 0 AND NOT a.attisdropped
), lifecycle_functions AS (
  SELECT count(*)::integer AS function_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'lifecycle_keyword_is_published',
      'lifecycle_keyword_deletion_impact',
      'lifecycle_preview_minerador_keywords',
      'lifecycle_delete_minerador_keywords',
      'lifecycle_restore_minerador_keywords',
      'lifecycle_purge_minerador_keywords'
    )
), target_relations AS (
  SELECT oid FROM target
  UNION ALL SELECT c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname IN ('minerador_keyword_metric_measurements','minerador_discovery_keyword_origins','minerador_discovery_candidates','minerador_discovery_candidate_current_metrics','minerador_discovery_candidate_metric_history','editorial_artifact_versions','editorial_workflow_items','editorial_decision_events','content_documents','publication_records','marcas')
), external_catalog_entries AS (
  SELECT format('class|%s|%s|%s|%s', n.nspname, c.relname, c.relkind::text, c.relpersistence::text)::text AS entry
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.oid <> (SELECT oid FROM target)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indexrelid=c.oid AND i.indrelid=(SELECT oid FROM target))
  UNION ALL
  SELECT format('type|%s|%s|%s', n.nspname, t.typname, t.typtype::text)::text
  FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public' AND t.typrelid <> (SELECT oid FROM target)
  UNION ALL
  SELECT format('constraint|%s|%s|%s|%s|%s', ns.nspname, src.relname, c.conname, c.contype::text, pg_catalog.pg_get_constraintdef(c.oid, true))::text
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class src ON src.oid=c.conrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=src.relnamespace
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
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname='public' AND p.tablename <> 'minerador_keywords'
  UNION ALL
  SELECT format('function|%s|%s|%s|%s', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_functiondef(p.oid))::text
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname NOT IN ('protect_published_keyword','minerador_keyword_is_published','lifecycle_keyword_is_published','lifecycle_keyword_deletion_impact','lifecycle_preview_minerador_keywords','lifecycle_delete_minerador_keywords','lifecycle_restore_minerador_keywords','lifecycle_purge_minerador_keywords','delete_minerador_keywords','delete_minerador_keyword','recover_minerador_keywords','restore_minerador_keyword','purge_minerador_keywords')
  UNION ALL
  SELECT format('dependency|%s|%s|%s|%s|%s', d.classid::text, d.objid::text, d.refclassid::text, d.refobjid::text, d.deptype::text)::text
  FROM pg_catalog.pg_depend d
  WHERE d.objid <> (SELECT oid FROM target)
    AND d.refobjid <> (SELECT oid FROM target)
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc touched
      JOIN pg_catalog.pg_namespace touched_namespace ON touched_namespace.oid = touched.pronamespace
      WHERE touched_namespace.nspname = 'public'
        AND touched.proname IN ('protect_published_keyword','minerador_keyword_is_published','lifecycle_keyword_is_published','lifecycle_keyword_deletion_impact','lifecycle_preview_minerador_keywords','lifecycle_delete_minerador_keywords','lifecycle_restore_minerador_keywords','lifecycle_purge_minerador_keywords','delete_minerador_keywords','delete_minerador_keyword','recover_minerador_keywords','restore_minerador_keyword','purge_minerador_keywords')
        AND (touched.oid = d.objid OR touched.oid = d.refobjid)
    )
), external_catalog AS (
  SELECT count(*)::bigint AS row_count, md5(coalesce(string_agg(entry, E'\n' ORDER BY entry), ''))::text AS fingerprint
  FROM external_catalog_entries
), data_fingerprint AS (
  SELECT
    (SELECT count(*) FROM public.minerador_keywords)::bigint AS keyword_rows,
    (SELECT count(*) FROM public.minerador_keyword_metric_measurements)::bigint AS measurement_rows,
    (SELECT count(*) FROM public.minerador_discovery_keyword_origins)::bigint AS origin_rows,
    (SELECT count(*) FROM public.editorial_artifact_versions)::bigint AS artifact_rows,
    (SELECT count(*) FROM public.editorial_workflow_items)::bigint AS workflow_rows,
    (SELECT count(*) FROM public.publication_records)::bigint AS publication_rows,
    md5(coalesce((SELECT string_agg(format('%s|%s|%s|%s', k.id::text, k.brand_id::text, k.keyword, coalesce(k.status,'')), E'\n' ORDER BY k.id::text) FROM public.minerador_keywords k), ''))::text AS keyword_fingerprint
), rls AS (
  SELECT c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class c WHERE c.oid=(SELECT oid FROM target)
), policies AS (
  SELECT count(*)::integer AS policy_count, count(*) FILTER (WHERE cmd='DELETE')::integer AS delete_policy_count
  FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='minerador_keywords'
), acl AS (
  SELECT has_table_privilege('public', 'public.minerador_keywords', 'DELETE') AS public_delete,
         has_table_privilege('anon', 'public.minerador_keywords', 'DELETE') AS anon_delete,
         has_table_privilege('authenticated', 'public.minerador_keywords', 'DELETE') AS authenticated_delete,
         has_table_privilege('service_role', 'public.minerador_keywords', 'DELETE') AS service_delete
), checks AS (
  SELECT 'TARGET_RELATION'::text AS check_name, 'public.minerador_keywords'::text AS object_name, format('present=%s', EXISTS (SELECT 1 FROM target))::text AS observed, CASE WHEN EXISTS (SELECT 1 FROM target) THEN 'PASS' ELSE 'FAIL' END::text AS verdict
  UNION ALL SELECT 'MIGRATION_NOT_APPLIED', 'public.minerador_keywords', format('lifecycle_columns=%s; lifecycle_functions=%s', (SELECT column_count FROM lifecycle_columns), (SELECT function_count FROM lifecycle_functions)), CASE WHEN (SELECT column_count FROM lifecycle_columns)=0 AND (SELECT function_count FROM lifecycle_functions)=0 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 'RLS', 'public.minerador_keywords', format('enabled=%s; forced=%s', coalesce((SELECT relrowsecurity::text FROM rls),'absent'), coalesce((SELECT relforcerowsecurity::text FROM rls),'absent')), CASE WHEN (SELECT relrowsecurity FROM rls) IS TRUE AND (SELECT relforcerowsecurity FROM rls) IS FALSE THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 'POLICIES', 'public.minerador_keywords', format('count=%s; delete=%s', (SELECT policy_count FROM policies), (SELECT delete_policy_count FROM policies)), CASE WHEN (SELECT policy_count FROM policies)>0 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL SELECT 'DIRECT_DELETE_ACL', 'public.minerador_keywords', format('PUBLIC=%s; anon=%s; authenticated=%s; service_role=%s', (SELECT public_delete FROM acl), (SELECT anon_delete FROM acl), (SELECT authenticated_delete FROM acl), (SELECT service_delete FROM acl)), 'INFO'
  UNION ALL SELECT 'DATA_BASELINE', 'public.minerador_keywords', format('keywords=%s; measurements=%s; origins=%s; artifacts=%s; workflows=%s; publications=%s; keyword_fingerprint=%s', keyword_rows, measurement_rows, origin_rows, artifact_rows, workflow_rows, publication_rows, keyword_fingerprint), 'INFO' FROM data_fingerprint
  UNION ALL SELECT 'PRESERVED_EXTERNAL_CATALOG', 'public schema excluding lifecycle target', format('rows=%s; fingerprint=%s', row_count, fingerprint), 'INFO' FROM external_catalog
  UNION ALL SELECT 'PROJECT_DRIFT_GATE', 'canonical project supplied by CLI', 'The CLI linked project must be hjjlntdpdgvpnazdztqw; this SQL does not infer secrets.', 'MANUAL'
)
SELECT check_name, object_name, observed, verdict FROM checks ORDER BY check_name, object_name;
