-- Read-only baseline for the narrow brand_skill artifact-type CHECK change.
with target_constraint as (
  select pg_get_constraintdef(c.oid, true) as definition
  from pg_constraint c
  where c.conrelid = 'public.editorial_artifact_versions'::regclass
    and c.conname = 'editorial_artifact_versions_artifact_type_check'
),
column_rows as (
  select c.relname as table_name, a.attnum, a.attname::text as name, pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
    a.attnotnull as not_null, pg_get_expr(ad.adbin, ad.adrelid) as default_expression, a.attidentity::text as identity, a.attgenerated::text as generated
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where n.nspname = 'public' and c.relname in ('editorial_artifact_versions', 'editorial_version_status_events')
),
constraint_rows as (
  select cl.relname as table_name, c.conname, c.contype::text as type, pg_get_constraintdef(c.oid, true) as definition,
    c.convalidated, c.condeferrable, c.condeferred
  from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and cl.relname in ('editorial_artifact_versions', 'editorial_version_status_events')
),
index_rows as (
  select c.relname as table_name, i.relname as index_name, pg_get_indexdef(i.oid) as definition
  from pg_index x join pg_class c on c.oid = x.indrelid join pg_class i on i.oid = x.indexrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('editorial_artifact_versions', 'editorial_version_status_events')
),
trigger_rows as (
  select c.relname as table_name, t.tgname, t.tgenabled::text as enabled, pg_get_triggerdef(t.oid, true) as definition,
    p.oid::regprocedure::text as function_name, pg_get_functiondef(p.oid) as function_definition
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and n.nspname = 'public' and c.relname in ('editorial_artifact_versions', 'editorial_version_status_events')
),
rls_rows as (
  select c.relname as table_name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('editorial_artifact_versions', 'editorial_version_status_events')
),
policy_rows as (
  select p.tablename as table_name, p.policyname, p.cmd, p.roles::text[] as roles, p.permissive, p.qual as using_expression, p.with_check as with_check_expression
  from pg_policies p where p.schemaname = 'public' and p.tablename in ('editorial_artifact_versions', 'editorial_version_status_events')
),
owner_rows as (
  select c.relname as table_name, r.rolname as owner
  from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_roles r on r.oid = c.relowner
  where n.nspname = 'public' and c.relname in ('editorial_artifact_versions', 'editorial_version_status_events')
),
acl_rows as (
  select c.relname as table_name, coalesce(c.relacl::text[], array[]::text[]) as acl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('editorial_artifact_versions', 'editorial_version_status_events')
),
count_rows as (
  select artifact_type, status, count(*)::bigint as count
  from public.editorial_artifact_versions group by artifact_type, status
),
target_json as (select coalesce(jsonb_agg(to_jsonb(target_constraint) order by definition), '[]'::jsonb) as value from target_constraint),
columns_json as (select coalesce(jsonb_agg(to_jsonb(column_rows) order by table_name, attnum), '[]'::jsonb) as value from column_rows),
constraints_json as (select coalesce(jsonb_agg(to_jsonb(constraint_rows) order by table_name, conname), '[]'::jsonb) as value from constraint_rows),
indexes_json as (select coalesce(jsonb_agg(to_jsonb(index_rows) order by table_name, index_name), '[]'::jsonb) as value from index_rows),
triggers_json as (select coalesce(jsonb_agg(to_jsonb(trigger_rows) order by table_name, tgname), '[]'::jsonb) as value from trigger_rows),
rls_json as (select coalesce(jsonb_agg(to_jsonb(rls_rows) order by table_name), '[]'::jsonb) as value from rls_rows),
policies_json as (select coalesce(jsonb_agg(to_jsonb(policy_rows) order by table_name, policyname), '[]'::jsonb) as value from policy_rows),
owners_json as (select coalesce(jsonb_agg(to_jsonb(owner_rows) order by table_name), '[]'::jsonb) as value from owner_rows),
acl_json as (select coalesce(jsonb_agg(to_jsonb(acl_rows) order by table_name), '[]'::jsonb) as value from acl_rows),
counts_json as (select coalesce(jsonb_agg(to_jsonb(count_rows) order by artifact_type, status), '[]'::jsonb) as value from count_rows),
snapshot as (
  select jsonb_build_object('target_constraints', target_json.value, 'columns', columns_json.value, 'constraints', constraints_json.value,
    'indexes', indexes_json.value, 'triggers', triggers_json.value, 'rls', rls_json.value, 'policies', policies_json.value,
    'owners', owners_json.value, 'acl', acl_json.value, 'artifact_counts', counts_json.value) as value
  from target_json, columns_json, constraints_json, indexes_json, triggers_json, rls_json, policies_json, owners_json, acl_json, counts_json
),
evidence as (
  select jsonb_build_object(
    'evidence_version', '20260828090000-brand-skills-preflight-v1',
    'target_constraint_expected', 'CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text, ''brand_dna''::text]))',
    'snapshot', snapshot.value,
    'fingerprints', jsonb_build_object(
      'target_structure', md5((snapshot.value->'target_constraints')::text),
      'non_target_structure', md5((snapshot.value - 'target_constraints')::text),
      'columns', md5((snapshot.value->'columns')::text), 'constraints', md5((snapshot.value->'constraints')::text),
      'indexes', md5((snapshot.value->'indexes')::text), 'triggers', md5((snapshot.value->'triggers')::text),
      'rls', md5((snapshot.value->'rls')::text), 'policies', md5((snapshot.value->'policies')::text),
      'owners', md5((snapshot.value->'owners')::text), 'acl', md5((snapshot.value->'acl')::text),
      'artifact_counts', md5((snapshot.value->'artifact_counts')::text)
    )
  ) as value from snapshot
)
select case when (select definition from target_constraint) = 'CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text, ''brand_dna''::text]))' then 'PASS' else 'FAIL' end as preflight_status,
  case when (select definition from target_constraint) = 'CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text, ''brand_dna''::text]))' then 'NONE' else 'TARGET_CONSTRAINT_DRIFT' end as drift,
  value as evidence_json
from evidence;
