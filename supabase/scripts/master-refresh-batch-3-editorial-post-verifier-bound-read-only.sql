-- Bound post-verifier for Master Refresh Batch 3 (read-only).
-- Excludes only the two new event tables and the intentional artifact_type CHECK delta.

BEGIN TRANSACTION READ ONLY;

WITH checks AS (
  SELECT 'BRAND_DNA_CHECK' check_name, EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.editorial_artifact_versions'::regclass
      AND conname='editorial_artifact_versions_artifact_type_check' AND convalidated
      AND pg_get_constraintdef(oid,true)='CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text, ''brand_dna''::text]))'
  ) passed, 'exactly five types including brand_dna' expected
  UNION ALL SELECT 'TARGET_TABLES', to_regclass('public.editorial_version_status_events') IS NOT NULL AND to_regclass('public.editorial_decision_events') IS NOT NULL, 'both present'
  UNION ALL SELECT 'STATUS_EVENT_COLUMNS', (
    SELECT count(*)=6 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='editorial_version_status_events'
      AND (column_name,data_type,is_nullable) IN (
        ('id','uuid','NO'),('version_id','text','NO'),('status','text','NO'),
        ('reason','text','NO'),('actor_id','uuid','NO'),('occurred_at','timestamp with time zone','NO')
      )
  ), '6 exact columns'
  UNION ALL SELECT 'DECISION_EVENT_COLUMNS', (
    SELECT count(*)=11 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='editorial_decision_events'
      AND (column_name,data_type,is_nullable) IN (
        ('id','uuid','NO'),('marca_id','uuid','NO'),('workflow_item_id','uuid','YES'),
        ('article_id','text','NO'),('event_type','text','NO'),('from_state','text','YES'),
        ('to_state','text','YES'),('source_version_id','text','YES'),('payload','jsonb','NO'),
        ('actor_id','uuid','NO'),('occurred_at','timestamp with time zone','NO')
      )
  ), '11 exact columns'
  UNION ALL SELECT 'TARGET_FKS', (
    SELECT count(*)=6 FROM pg_constraint
    WHERE conrelid IN ('public.editorial_version_status_events'::regclass,'public.editorial_decision_events'::regclass)
      AND contype='f' AND convalidated AND pg_get_constraintdef(oid,true) LIKE '%ON DELETE RESTRICT'
  ), '6 validated RESTRICT FKs'
  UNION ALL SELECT 'TARGET_INDEXES', (
    SELECT count(*)=8 FROM pg_index
    WHERE indrelid IN ('public.editorial_version_status_events'::regclass,'public.editorial_decision_events'::regclass)
  ), '8 indexes including two primary keys'
  UNION ALL SELECT 'TARGET_DATA_EMPTY', (SELECT count(*)=0 FROM public.editorial_version_status_events) AND (SELECT count(*)=0 FROM public.editorial_decision_events) AND (SELECT count(*)=0 FROM public.editorial_artifact_versions), '0:0:0'
  UNION ALL SELECT 'TARGET_RLS_OWNER', (
    SELECT count(*)=2 FROM pg_class WHERE oid IN ('public.editorial_version_status_events'::regclass,'public.editorial_decision_events'::regclass)
      AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres'
  ), '2'
  UNION ALL SELECT 'TARGET_POLICIES', (
    SELECT count(*)=2 FROM pg_policies WHERE schemaname='public' AND (tablename,policyname) IN (
      ('editorial_version_status_events','editorial_version_status_events_select_policy'),
      ('editorial_decision_events','editorial_decision_events_select_policy')
    ) AND cmd='SELECT' AND roles='{authenticated}'
  ), '2 SELECT authenticated policies'
  UNION ALL SELECT 'TARGET_APPEND_ONLY', (
    SELECT count(*)=2 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('editorial_version_status_events_append_only_trg','editorial_decision_events_append_only_trg')
      AND pg_get_triggerdef(oid,true) LIKE '%pipeline_editorial_protect_append_only%'
  ), '2'
  UNION ALL SELECT 'TARGET_ACL', NOT EXISTS (
    SELECT 1 FROM (VALUES ('editorial_version_status_events'),('editorial_decision_events')) v(relname)
    CROSS JOIN LATERAL aclexplode((SELECT relacl FROM pg_class WHERE oid=format('public.%I',v.relname)::regclass)) a
    WHERE a.grantee IN (0,'anon'::regrole) OR (a.grantee='authenticated'::regrole AND a.privilege_type<>'SELECT')
      OR (a.grantee='service_role'::regrole AND a.privilege_type NOT IN ('SELECT','INSERT'))
  ), 'no PUBLIC/anon; authenticated SELECT; service_role SELECT/INSERT only'
  UNION ALL SELECT 'INVITATIONS_STILL_DEFERRED', to_regclass('public.brand_invitations') IS NULL AND to_regclass('public.brand_invitation_permissions') IS NULL, 'absent'
  UNION ALL SELECT 'BRIEFINGS_UNCHANGED', (SELECT count(*)=0 FROM public.briefings_artigos), '0 rows; Batch 2 security retained'
)
SELECT check_name,CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END verdict,expected FROM checks ORDER BY check_name;

-- The following preservation proof intentionally excludes only the two new
-- event tables and the intended artifact_type CHECK replacement.
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
