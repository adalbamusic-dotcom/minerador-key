-- Master Refresh Batch 6 - bound read-only preflight.
BEGIN TRANSACTION READ ONLY;
WITH expected(table_name,expected_count,expected_fp) AS (VALUES
 ('keywords_kgr_after_failed_0005_20260724',147::bigint,'4ee7ae2d493302b1c931d61ce507cf84'),
 ('keywords_kgr_before_0005_20260724',147::bigint,'f40807bb165f26961ecd43766d1b4d01'),
 ('listas_kgr_before_0005_20260724',5::bigint,'528c7c497898a3356b054728ffbf857d'),
 ('marcas_before_0005_20260724',1::bigint,'2581e097fc9433204dfe990032518ce6'),
 ('perfis_before_0005_20260724',1::bigint,'adad261679f64bd820ba9dfab3fdeae2'),
 ('policies_before_0005_20260724',2::bigint,'f95208610ded30018af00f5db9340eac')
), backup_tables AS (
 SELECT c.oid,c.relname,pg_get_userbyid(c.relowner) owner,coalesce(c.relacl::text,'') acl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='migration_backup' AND c.relkind IN ('r','p')
), observed AS (
 SELECT b.relname table_name,b.owner,b.acl,
  (xpath('/row/c/text()',query_to_xml(format('select count(*) c from migration_backup.%I',b.relname),false,true,'')))[1]::text::bigint row_count,
  (xpath('/row/f/text()',query_to_xml(format($q$select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) f from migration_backup.%I t$q$,b.relname),false,true,'')))[1]::text fingerprint,
  (SELECT count(*) FROM pg_constraint x WHERE x.contype='f' AND (x.conrelid=b.oid OR x.confrelid=b.oid)) fk_count,
  (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=b.oid AND NOT t.tgisinternal) trigger_count,
  (SELECT count(*) FROM pg_depend d JOIN pg_proc p ON d.classid='pg_proc'::regclass AND d.objid=p.oid WHERE d.refclassid='pg_class'::regclass AND d.refobjid=b.oid) function_deps,
  (SELECT count(*) FROM pg_rewrite r JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid WHERE d.refclassid='pg_class'::regclass AND d.refobjid=b.oid AND r.ev_class<>b.oid) view_deps
 FROM backup_tables b
), checks AS (
 SELECT 'backup:'||e.table_name check_name,
   o.table_name IS NOT NULL AND o.row_count=e.expected_count AND o.fingerprint=e.expected_fp
   AND o.owner='postgres' AND o.acl='' AND o.fk_count=0 AND o.trigger_count=0 AND o.function_deps=0 AND o.view_deps=0 pass,
   format('count=%s fp=%s owner=%s acl=%s fk=%s trigger=%s function=%s view=%s',o.row_count,o.fingerprint,o.owner,o.acl,o.fk_count,o.trigger_count,o.function_deps,o.view_deps) observed
 FROM expected e LEFT JOIN observed o USING(table_name)
 UNION ALL SELECT 'backup_table_set_exact',count(*)=6,string_agg(relname,',' ORDER BY relname) FROM backup_tables
 UNION ALL SELECT 'backup_total_rows',sum(row_count)=303,sum(row_count)::text FROM observed
 UNION ALL SELECT 'google_ads_legacy_absent',
   to_regclass('public.minerador_google_ads_connections') IS NULL AND to_regclass('public.google_ads_binding_targeting') IS NULL
   AND to_regclass('public.google_ads_binding_account_state') IS NULL AND to_regprocedure('public.google_ads_binding_configuration_validate()') IS NULL,'four legacy objects absent'
)
SELECT check_name,CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END verdict,observed FROM checks
UNION ALL SELECT 'BATCH_6_PREFLIGHT',CASE WHEN bool_and(pass) THEN 'PASS' ELSE 'FAIL' END,count(*) FILTER(WHERE NOT pass)::text FROM checks
ORDER BY check_name;
ROLLBACK;
