-- MASTER REFRESH / BATCH 1 — preflight remoto somente leitura.
-- Projeto esperado: hjjlntdpdgvpnazdztqw
-- Baseline real capturada em 2026-08-17 depois da aprovação dos quatro gates.
-- Não aplicar se preflight_status <> PASS ou mismatches não estiver vazio.

WITH
expected AS (
  SELECT
    'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid AS admin_id,
    'adalbapro@gmail.com'::text AS admin_email,
    'e50e9214dcdc21b6f64c95f9276a6b61'::text AS auth_subset_md5,
    'f85a3988eb1fd6b2bd86ea294275c206'::text AS perfis_data_md5,
    '81d233c0ba3b3df2ead9878895a28ea7'::text AS perfis_catalog_md5,
    'bdd5dbb83459c1ffe14d365670dfc72f'::text AS brand_roles_md5,
    '6846479dfafffa346694ff9bb9a1426b'::text AS authorization_functions_md5,
    'cba556a815d4f148aef7ff38db954140'::text AS google_resources_md5
),
approved_agencies(id, name) AS (VALUES
  ('1febb431-4e44-49e9-b8cd-12115f4ad999'::uuid, 'AdalbaFotos'::text),
  ('3cc14013-3296-4094-80de-712abc4ceae8'::uuid, 'AdalbaPro'::text),
  ('cd84f5ee-b939-4b05-afa4-52aabb8c9aa4'::uuid, 'AdaMusic'::text),
  ('ae851a64-5bff-449b-865c-ec6aa950be38'::uuid, 'AdaSEO'::text)
),
approved_brands(id, name) AS (VALUES
  ('f514a553-ce4a-472e-9aec-c3fecff375f1'::uuid, 'Adalba'::text),
  ('033b0cde-6e00-472c-b9d6-3c10ad33ae61'::uuid, 'Care Glow'::text)
),
google_provider AS (
  SELECT id FROM public.integration_providers WHERE provider_key = 'google_ads'
),
google_capabilities AS (
  SELECT id FROM public.integration_capabilities WHERE capability_key LIKE 'google_ads%'
),
perfis_catalog_parts AS (
  SELECT 'owner'::text AS key, pg_catalog.pg_get_userbyid(c.relowner) || ':' || c.relrowsecurity::text AS value
  FROM pg_catalog.pg_class c WHERE c.oid = 'public.perfis'::regclass
  UNION ALL
  SELECT 'column:' || a.attnum::text,
    a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
  FROM pg_catalog.pg_attribute a
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.perfis'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'constraint:' || c.conname,
    c.contype::text || ':' || c.convalidated::text || ':' || pg_catalog.pg_get_constraintdef(c.oid, true)
  FROM pg_catalog.pg_constraint c WHERE c.conrelid = 'public.perfis'::regclass
  UNION ALL
  SELECT 'index:' || indexname, indexdef
  FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename = 'perfis'
  UNION ALL
  SELECT 'policy:' || policyname, cmd || ':' || roles::text || ':' || COALESCE(qual, '') || ':' || COALESCE(with_check, '')
  FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'perfis'
  UNION ALL
  SELECT 'acl:' || grantee || ':' || privilege_type, '1'
  FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'perfis'
),
authorization_functions AS (
  SELECT p.oid::regprocedure::text AS signature,
    md5(pg_catalog.pg_get_functiondef(p.oid) || ':' || p.prosecdef::text || ':' || COALESCE(p.proconfig::text, '') || ':' ||
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')::text || ':' ||
      pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')::text) AS hash
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('is_global_admin', 'canonical_is_platform_admin', 'canonical_actor_is_global_admin',
      'canonical_actor_can_access_brand', 'canonical_actor_can_manage_brand')
),
google_resource_rows AS (
  SELECT 'connection'::text AS kind, c.id::text AS id, md5((to_jsonb(c) - 'secret_ref')::text) AS hash
  FROM public.integration_connections c JOIN google_provider p ON p.id = c.provider_id
  UNION ALL
  SELECT 'grant', g.id::text, md5(to_jsonb(g)::text)
  FROM public.integration_grants g JOIN google_capabilities c ON c.id = g.capability_id
  UNION ALL
  SELECT 'binding', b.id::text, md5(to_jsonb(b)::text)
  FROM public.integration_bindings b JOIN google_capabilities c ON c.id = b.capability_id
  UNION ALL
  SELECT 'quota', q.id::text, md5(to_jsonb(q)::text)
  FROM public.integration_quota_policies q JOIN google_capabilities c ON c.id = q.capability_id
),
actual AS (
  SELECT
    (SELECT count(*) FROM auth.users) AS auth_users,
    (SELECT md5(string_agg(md5(jsonb_build_object('id', id, 'email', lower(email), 'deleted_at', deleted_at, 'banned_until', banned_until, 'email_confirmed_at', email_confirmed_at)::text), '' ORDER BY id::text)) FROM auth.users) AS auth_subset_md5,
    (SELECT count(*) FROM auth.users u WHERE u.id = e.admin_id AND lower(u.email) = e.admin_email) AS approved_admin_auth,
    (SELECT count(*) FROM public.perfis p WHERE p.id = e.admin_id AND p.role = 'admin') AS approved_admin_profile,
    (SELECT count(*) FROM public.perfis) AS perfis_count,
    (SELECT md5(COALESCE(string_agg(md5(to_jsonb(p)::text), '' ORDER BY p.id::text), '')) FROM public.perfis p) AS perfis_data_md5,
    (SELECT md5(string_agg(key || '=' || value, E'\n' ORDER BY key, value)) FROM perfis_catalog_parts) AS perfis_catalog_md5,
    (SELECT count(*) FROM authorization_functions) AS authorization_function_count,
    (SELECT md5(string_agg(md5(signature || ':' || hash), '' ORDER BY signature)) FROM authorization_functions) AS authorization_functions_md5,
    (SELECT count(*) FROM public.agencies) AS agencies_total,
    (SELECT count(*) FROM public.agencies a JOIN approved_agencies x ON x.id = a.id AND x.name = a.name) AS approved_agencies_matched,
    (SELECT count(*) FROM public.marcas) AS brands_total,
    (SELECT count(*) FROM public.marcas b JOIN approved_brands x ON x.id = b.id AND x.name = b.nome) AS approved_brands_matched,
    (SELECT count(*) FROM public.brand_memberships) AS brand_memberships,
    (SELECT count(*) FROM public.brand_memberships bm JOIN public.marcas b ON b.id = bm.marca_id WHERE bm.member_user_id = b.owner_user_id OR bm.role = 'owner') AS artificial_owner_memberships,
    (SELECT count(*) FROM public.marcas b JOIN approved_brands x USING (id) CROSS JOIN expected ee WHERE b.owner_user_id <> ee.admin_id) AS approved_brand_owner_mismatches,
    (SELECT count(*) FROM public.brand_roles) AS brand_roles_count,
    (SELECT md5(COALESCE(string_agg(md5(to_jsonb(r)::text), '' ORDER BY r.id::text), '')) FROM public.brand_roles r) AS brand_roles_md5,
    (SELECT count(*) FROM google_provider) AS google_providers,
    (SELECT count(*) FROM google_capabilities) AS google_capabilities,
    (SELECT count(*) FROM public.integration_connections c JOIN google_provider p ON p.id = c.provider_id) AS google_connections,
    (SELECT count(*) FROM public.integration_connections c JOIN google_provider p ON p.id = c.provider_id WHERE c.lifecycle_status = 'ready') AS google_ready_connections,
    (SELECT count(*) FROM public.integration_grants g JOIN google_capabilities c ON c.id = g.capability_id) AS google_grants,
    (SELECT count(*) FROM public.integration_bindings b JOIN google_capabilities c ON c.id = b.capability_id) AS google_bindings,
    (SELECT count(*) FROM public.integration_quota_policies q JOIN google_capabilities c ON c.id = q.capability_id) AS google_quotas,
    (SELECT count(*) FROM public.integration_usage_events u JOIN google_provider p ON p.id = u.provider_id) AS google_usage,
    (SELECT md5(string_agg(hash, '' ORDER BY kind, id)) FROM google_resource_rows) AS google_resources_md5,
    (SELECT count(*) FROM public.integration_connections c JOIN public.integration_providers p ON p.id = c.provider_id
      WHERE (p.provider_key, c.id, c.lifecycle_status) IN (
        ('dataforseo', '14496206-f2b4-44f0-aa2e-4b412e04386d'::uuid, 'ready'),
        ('openrouter', '2f1a8f5c-8070-4c40-893f-5e17f82c8507'::uuid, 'ready')
      ) AND c.secret_ref IS NOT NULL AND btrim(c.secret_ref) <> '') AS preserved_connections_ready,
    public.canonical_actor_is_global_admin(e.admin_id) AS admin_functional,
    public.canonical_actor_can_access_brand('f514a553-ce4a-472e-9aec-c3fecff375f1'::uuid, e.admin_id) AS adalba_owner_access,
    public.canonical_actor_can_access_brand('033b0cde-6e00-472c-b9d6-3c10ad33ae61'::uuid, e.admin_id) AS care_glow_owner_access
  FROM expected e
),
verdict AS (
  SELECT a.*, array_remove(ARRAY[
    CASE WHEN a.auth_users <> 4 THEN 'auth.users count diverged' END,
    CASE WHEN a.auth_subset_md5 <> e.auth_subset_md5 THEN 'auth.users identity subset fingerprint diverged' END,
    CASE WHEN a.approved_admin_auth <> 1 OR a.approved_admin_profile <> 1 OR a.perfis_count <> 1 THEN 'approved global Admin diverged' END,
    CASE WHEN a.perfis_data_md5 <> e.perfis_data_md5 THEN 'perfis data fingerprint diverged' END,
    CASE WHEN a.perfis_catalog_md5 <> e.perfis_catalog_md5 THEN 'perfis catalog/RLS/ACL fingerprint diverged' END,
    CASE WHEN a.authorization_function_count <> 5 OR a.authorization_functions_md5 <> e.authorization_functions_md5 THEN 'authorization functions diverged' END,
    CASE WHEN a.agencies_total <> 4 OR a.approved_agencies_matched <> 4 THEN 'approved Agency allowlist diverged' END,
    CASE WHEN a.brands_total <> 2 OR a.approved_brands_matched <> 2 THEN 'approved Brand allowlist diverged' END,
    CASE WHEN a.brand_memberships <> 0 OR a.artificial_owner_memberships <> 0 OR a.approved_brand_owner_mismatches <> 0 THEN 'canonical ownership baseline diverged' END,
    CASE WHEN a.brand_roles_count <> 1 OR a.brand_roles_md5 <> e.brand_roles_md5 THEN 'brand_roles baseline diverged' END,
    CASE WHEN a.google_providers <> 1 OR a.google_capabilities <> 2 OR a.google_connections <> 1 OR a.google_ready_connections <> 1 THEN 'Google provider/capability/Connection baseline diverged' END,
    CASE WHEN a.google_grants <> 8 OR a.google_bindings <> 8 OR a.google_quotas <> 2 OR a.google_usage <> 11 THEN 'Google persisted resource counts diverged' END,
    CASE WHEN a.google_resources_md5 <> e.google_resources_md5 THEN 'Google persisted resource fingerprint diverged' END,
    CASE WHEN a.preserved_connections_ready <> 2 THEN 'DataForSEO/OpenRouter preserved Connections diverged' END,
    CASE WHEN NOT a.admin_functional OR NOT a.adalba_owner_access OR NOT a.care_glow_owner_access THEN 'canonical authorization functional checks diverged' END
  ], NULL)::text[] AS mismatches
  FROM actual a CROSS JOIN expected e
)
SELECT
  CASE WHEN cardinality(mismatches) = 0 THEN 'PASS' ELSE 'FAIL' END AS preflight_status,
  mismatches,
  to_jsonb(verdict) - 'mismatches' AS captured_baseline
FROM verdict;
