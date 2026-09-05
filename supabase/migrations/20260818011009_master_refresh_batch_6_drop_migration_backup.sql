-- Master Refresh Batch 6: remove only the verified historical recovery schema.
-- No public object or canonical data is changed. Never add CASCADE here.
DO $preflight$
DECLARE
  target record;
  observed_count bigint;
  observed_fp text;
BEGIN
  -- Fail closed against the corrected canonical aggregate. The previous 443
  -- value was a documentary arithmetic error; all six bound table baselines
  -- and fingerprints remain unchanged.
  IF (147 + 147 + 5 + 1 + 1 + 2) <> 303 THEN
    RAISE EXCEPTION 'BATCH_6_CANONICAL_TOTAL_DRIFT: expected=303';
  END IF;

  FOR target IN SELECT * FROM (VALUES
    ('keywords_kgr_after_failed_0005_20260724',147::bigint,'4ee7ae2d493302b1c931d61ce507cf84'),
    ('keywords_kgr_before_0005_20260724',147::bigint,'f40807bb165f26961ecd43766d1b4d01'),
    ('listas_kgr_before_0005_20260724',5::bigint,'528c7c497898a3356b054728ffbf857d'),
    ('marcas_before_0005_20260724',1::bigint,'2581e097fc9433204dfe990032518ce6'),
    ('perfis_before_0005_20260724',1::bigint,'adad261679f64bd820ba9dfab3fdeae2'),
    ('policies_before_0005_20260724',2::bigint,'f95208610ded30018af00f5db9340eac')
  ) AS expected(table_name,row_count,fingerprint)
  LOOP
    IF to_regclass(format('migration_backup.%I',target.table_name)) IS NULL THEN
      RAISE EXCEPTION 'BATCH_6_BACKUP_TABLE_MISSING: %',target.table_name;
    END IF;
    EXECUTE format('select count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from migration_backup.%I t',target.table_name)
      INTO observed_count,observed_fp;
    IF observed_count<>target.row_count OR observed_fp<>target.fingerprint THEN
      RAISE EXCEPTION 'BATCH_6_BACKUP_BASELINE_DRIFT: % count=% fp=%',target.table_name,observed_count,observed_fp;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='migration_backup' AND c.relkind IN ('r','p'))<>6 THEN
    RAISE EXCEPTION 'BATCH_6_BACKUP_TABLE_SET_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='migration_backup' AND c.relkind IN ('r','p') AND
      (EXISTS (SELECT 1 FROM pg_constraint x WHERE x.contype='f' AND (x.conrelid=c.oid OR x.confrelid=c.oid))
       OR EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
       OR EXISTS (SELECT 1 FROM pg_depend d JOIN pg_proc p ON d.classid='pg_proc'::regclass AND d.objid=p.oid WHERE d.refclassid='pg_class'::regclass AND d.refobjid=c.oid)
       OR EXISTS (SELECT 1 FROM pg_rewrite r JOIN pg_depend d ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid WHERE d.refclassid='pg_class'::regclass AND d.refobjid=c.oid AND r.ev_class<>c.oid))
  ) THEN RAISE EXCEPTION 'BATCH_6_BACKUP_DEPENDENCY_DRIFT'; END IF;
END
$preflight$;

DROP TABLE migration_backup.keywords_kgr_after_failed_0005_20260724;
DROP TABLE migration_backup.keywords_kgr_before_0005_20260724;
DROP TABLE migration_backup.listas_kgr_before_0005_20260724;
DROP TABLE migration_backup.marcas_before_0005_20260724;
DROP TABLE migration_backup.perfis_before_0005_20260724;
DROP TABLE migration_backup.policies_before_0005_20260724;
DROP SCHEMA migration_backup;
