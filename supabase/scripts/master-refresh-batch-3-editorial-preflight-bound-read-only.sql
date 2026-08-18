-- Bound preflight for Master Refresh Batch 3 (read-only).
-- Project: hjjlntdpdgvpnazdztqw
-- Baseline captured: 2026-08-17 America/Sao_Paulo, after Batch 2 closed.

BEGIN TRANSACTION READ ONLY;

WITH checks AS (
  SELECT 'ARTIFACT_TYPE_CHECK' check_name,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid='public.editorial_artifact_versions'::regclass
        AND conname='editorial_artifact_versions_artifact_type_check'
        AND convalidated
        AND pg_get_constraintdef(oid,true) = 'CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text]))'
    ) passed, 'four canonical types without brand_dna' expected
  UNION ALL SELECT 'ARTIFACT_ROWS', (SELECT count(*)=0 FROM public.editorial_artifact_versions), '0'
  UNION ALL SELECT 'BRIEFINGS_ROWS', (SELECT count(*)=0 FROM public.briefings_artigos), '0'
  UNION ALL SELECT 'STATUS_EVENTS_ABSENT', to_regclass('public.editorial_version_status_events') IS NULL, 'absent'
  UNION ALL SELECT 'DECISION_EVENTS_ABSENT', to_regclass('public.editorial_decision_events') IS NULL, 'absent'
  UNION ALL SELECT 'BRAND_INVITATIONS_DEFERRED', to_regclass('public.brand_invitations') IS NULL AND to_regclass('public.brand_invitation_permissions') IS NULL, 'both absent and outside Batch 3'
  UNION ALL SELECT 'APPEND_ONLY_FUNCTION', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='pipeline_editorial_protect_append_only'
      AND pg_get_function_identity_arguments(p.oid)='' AND NOT p.prosecdef
      AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
      AND pg_get_userbyid(p.proowner)='postgres'
  ), 'SECURITY INVOKER, restricted search_path, owner postgres'
), verdict AS (
  SELECT check_name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END verdict, expected FROM checks
)
SELECT * FROM verdict ORDER BY check_name;

WITH rels AS (
  SELECT c.oid,c.relname,pg_get_userbyid(c.relowner) owner_name,c.relrowsecurity,c.relforcerowsecurity,coalesce(array_to_string(c.relacl,','),'') acl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND c.relname NOT IN ('editorial_version_status_events','editorial_decision_events')
), coldefs AS (
  SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) typ,a.attnotnull,a.attidentity,a.attgenerated,coalesce(pg_get_expr(d.adbin,d.adrelid),'') def
  FROM rels c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
), cons AS (
  SELECT conrelid::regclass::text rel,conname,contype,convalidated,pg_get_constraintdef(oid,true) def
  FROM pg_constraint WHERE connamespace='public'::regnamespace
    AND conrelid::regclass::text NOT IN ('editorial_version_status_events','editorial_decision_events')
    AND NOT (conrelid='public.editorial_artifact_versions'::regclass AND conname='editorial_artifact_versions_artifact_type_check')
), idx AS (
  SELECT indrelid::regclass::text rel,indexrelid::regclass::text name,pg_get_indexdef(indexrelid) def FROM pg_index WHERE indrelid IN (SELECT oid FROM rels)
), trg AS (
  SELECT tgrelid::regclass::text rel,tgname,tgenabled,pg_get_triggerdef(oid,true) def FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM rels) AND NOT tgisinternal
), pol AS (
  SELECT tablename,policyname,permissive,roles,cmd,coalesce(qual,'') qual,coalesce(with_check,'') with_check FROM pg_policies
  WHERE schemaname='public' AND tablename NOT IN ('editorial_version_status_events','editorial_decision_events')
), funcs AS (
  SELECT format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) signature,pg_get_userbyid(p.proowner) owner_name,p.prosecdef,p.provolatile,p.proconfig,coalesce(array_to_string(p.proacl,','),'') acl,p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
), observed AS (
  SELECT 'RELATIONS' component,md5(string_agg(concat_ws(':',relname,owner_name,relrowsecurity::text,relforcerowsecurity::text,acl),E'\n' ORDER BY relname)) fingerprint,count(*) lines FROM rels
  UNION ALL SELECT 'COLUMNS',md5(string_agg(concat_ws(':',relname,attnum::text,attname,typ,attnotnull::text,attidentity::text,attgenerated::text,def),E'\n' ORDER BY relname,attnum)),count(*) FROM coldefs
  UNION ALL SELECT 'NON_TARGET_CONSTRAINTS',md5(string_agg(concat_ws(':',rel,conname,contype::text,convalidated::text,def),E'\n' ORDER BY rel,conname)),count(*) FROM cons
  UNION ALL SELECT 'INDEXES',md5(string_agg(concat_ws(':',rel,name,def),E'\n' ORDER BY rel,name)),count(*) FROM idx
  UNION ALL SELECT 'TRIGGERS',md5(string_agg(concat_ws(':',rel,tgname,tgenabled::text,def),E'\n' ORDER BY rel,tgname)),count(*) FROM trg
  UNION ALL SELECT 'NON_TARGET_POLICIES',md5(string_agg(concat_ws(':',tablename,policyname,permissive,roles::text,cmd,qual,with_check),E'\n' ORDER BY tablename,policyname)),count(*) FROM pol
  UNION ALL SELECT 'FUNCTIONS',md5(string_agg(concat_ws(':',signature,owner_name,prosecdef::text,provolatile::text,coalesce(array_to_string(proconfig,','),''),acl,prosrc),E'\n' ORDER BY signature)),count(*) FROM funcs
), expected(component,fingerprint,lines) AS (VALUES
  ('COLUMNS','693ddcde71879427efcbe27a6835c341',616::bigint),
  ('FUNCTIONS','8c3d3e6a3b54eb3587936588df181605',71),
  ('INDEXES','8d5d0d60ec7c67fce70fb1e8b214c76c',140),
  ('NON_TARGET_CONSTRAINTS','79b8d0d0c40e2272ec0ad7855ee4a978',423),
  ('NON_TARGET_POLICIES','89cf5d2b305bcd3147f5f7b105153754',60),
  ('RELATIONS','d291487e2299696100e37e418f57b59f',49),
  ('TRIGGERS','67954a22dc98d7221365bc0158b54965',27)
)
SELECT o.component,CASE WHEN o.fingerprint=e.fingerprint AND o.lines=e.lines THEN 'PASS' ELSE 'FAIL' END verdict,o.fingerprint observed,e.fingerprint expected
FROM observed o JOIN expected e USING(component) ORDER BY o.component;

WITH names AS (
  SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND c.relname NOT IN ('editorial_version_status_events','editorial_decision_events') ORDER BY c.relname
), dyn AS (
  SELECT count(*) table_count,string_agg(format('SELECT %L AS n,count(*)::text AS c,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),'''')) AS h FROM public.%I t',relname,relname),' UNION ALL ' ORDER BY relname) sql FROM names
)
SELECT 'PUBLIC_DATA_BASELINE' check_name,CASE WHEN table_count=49 AND md5(query_to_xml(sql,false,true,'')::text)='10aa43cdf86b0b5c7068b5af912a0210' THEN 'PASS' ELSE 'FAIL' END verdict,
  concat_ws(':',table_count,md5(query_to_xml(sql,false,true,'')::text)) observed,'49:10aa43cdf86b0b5c7068b5af912a0210' expected FROM dyn;

ROLLBACK;
