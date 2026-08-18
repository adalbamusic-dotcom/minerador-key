-- READ ONLY. Run manually in the linked project's SQL editor when a catalog-level
-- audit is required. This file contains SELECT statements only and never mutates
-- schema, Auth, data, policies, grants, or migration history.

-- 1. Discover the remote migration ledger without assuming its relation exists.
SELECT
  'MIGRATION_LEDGER' AS section,
  to_regclass('supabase_migrations.schema_migrations')::text AS relation_name,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
      AND column_name = 'version'
  ) AS has_version_column;

-- 2. Columns, nullability and server defaults for all structural tables.
SELECT
  'COLUMNS' AS section,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'agencies', 'agency_memberships', 'agency_brands', 'perfis',
    'brand_memberships', 'brand_roles', 'brand_member_permissions', 'marcas'
  )
ORDER BY c.table_name, c.ordinal_position;

-- 3. Primary keys, unique constraints, checks and foreign keys.
SELECT
  'CONSTRAINTS' AS section,
  rel.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname IN (
    'agencies', 'agency_memberships', 'agency_brands', 'perfis',
    'brand_memberships', 'brand_roles', 'brand_member_permissions', 'marcas'
  )
ORDER BY rel.relname, con.contype, con.conname;

-- 4. All structural indexes, including partial indexes.
SELECT
  'INDEXES' AS section,
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'agencies', 'agency_memberships', 'agency_brands', 'perfis',
    'brand_memberships', 'brand_roles', 'brand_member_permissions', 'marcas'
  )
ORDER BY tablename, indexname;

-- 5. RLS state and every effective public policy.
SELECT
  'RLS' AS section,
  rel.relname AS table_name,
  rel.relrowsecurity AS enabled,
  rel.relforcerowsecurity AS forced
FROM pg_catalog.pg_class rel
JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname IN (
    'agencies', 'agency_memberships', 'agency_brands', 'perfis',
    'brand_memberships', 'brand_roles', 'brand_member_permissions', 'marcas'
  )
ORDER BY rel.relname;

SELECT
  'POLICIES' AS section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'agencies', 'agency_memberships', 'agency_brands', 'perfis',
    'brand_memberships', 'brand_roles', 'brand_member_permissions', 'marcas'
  )
ORDER BY tablename, policyname;

-- 6. Authorization functions and their effective definitions.
SELECT
  'AUTHORIZATION_FUNCTIONS' AS section,
  nsp.nspname AS schema_name,
  proc.proname AS function_name,
  pg_get_function_identity_arguments(proc.oid) AS arguments,
  proc.prosecdef AS security_definer,
  array_to_string(proc.proconfig, ', ') AS configuration,
  pg_get_functiondef(proc.oid) AS definition
FROM pg_catalog.pg_proc proc
JOIN pg_catalog.pg_namespace nsp ON nsp.oid = proc.pronamespace
WHERE nsp.nspname = 'public'
  AND proc.proname IN ('is_global_admin', 'can_access_brand', 'can_manage_brand', 'can_access_agency', 'can_manage_agency')
ORDER BY proc.proname, arguments;

-- 7. Explicit grants. PUBLIC and authenticated grants must be reviewed together
-- with RLS; a grant alone is not authorization.
SELECT
  'TABLE_GRANTS' AS section,
  table_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('agencies', 'agency_memberships', 'agency_brands')
ORDER BY table_name, grantee, privilege_type;

SELECT
  'FUNCTION_GRANTS' AS section,
  routine_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('is_global_admin', 'can_access_brand', 'can_manage_brand', 'can_access_agency', 'can_manage_agency')
ORDER BY routine_name, grantee, privilege_type;

-- 8. Minimal structural data: no editorial data is selected.
SELECT 'COUNTS' AS section, 'agencies' AS relation_name, count(*) AS total FROM public.agencies
UNION ALL SELECT 'COUNTS', 'agency_memberships', count(*) FROM public.agency_memberships
UNION ALL SELECT 'COUNTS', 'agency_brands', count(*) FROM public.agency_brands
UNION ALL SELECT 'COUNTS', 'brand_memberships', count(*) FROM public.brand_memberships
UNION ALL SELECT 'COUNTS', 'brand_roles', count(*) FROM public.brand_roles
UNION ALL SELECT 'COUNTS', 'brand_member_permissions', count(*) FROM public.brand_member_permissions
UNION ALL SELECT 'COUNTS', 'marcas', count(*) FROM public.marcas;

SELECT
  'GLOBAL_PROFILES' AS section,
  p.id AS user_id,
  p.role,
  p.marca_id
FROM public.perfis p
WHERE p.role = 'admin'
ORDER BY p.id;

SELECT
  'AUTH_IDENTITIES' AS section,
  u.id AS user_id,
  lower(u.email) AS email,
  u.email_confirmed_at,
  u.banned_until,
  u.created_at
FROM auth.users u
WHERE lower(u.email) IN ('scalbeto@gmail.com', 'adalbapro@gmail.com')
ORDER BY lower(u.email);

SELECT
  'BRAND_OWNERS_AND_MEMBERSHIPS' AS section,
  m.id AS brand_id,
  m.nome AS brand_name,
  m.owner_user_id,
  membership.id AS membership_id,
  membership.member_user_id,
  lower(membership.user_key) AS membership_email,
  membership.role AS membership_role,
  membership.status AS membership_status,
  role.slug AS role_slug
FROM public.marcas m
LEFT JOIN public.brand_memberships membership ON membership.marca_id = m.id
LEFT JOIN public.brand_roles role ON role.id = membership.role_id
WHERE m.nome IN ('Adalba', 'Lindisse')
ORDER BY m.nome, membership.created_at, membership.id;

SELECT
  'AGENCY_DATA' AS section,
  agency.id AS agency_id,
  agency.name AS agency_name,
  agency.slug AS agency_slug,
  agency.status AS agency_status,
  membership.user_id AS agency_member_user_id,
  membership.role AS agency_role,
  membership.status AS agency_member_status,
  link.brand_id,
  link.status AS brand_link_status
FROM public.agencies agency
LEFT JOIN public.agency_memberships membership ON membership.agency_id = agency.id
LEFT JOIN public.agency_brands link ON link.agency_id = agency.id
ORDER BY agency.slug, membership.user_id, link.brand_id;
