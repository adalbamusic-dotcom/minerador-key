-- LEITURA SOMENTE. Executar manualmente antes da migration 0005.
-- Este arquivo nao altera tabelas, dados, politicas, grants ou funcoes.
-- Consultas opcionais usam catalogo e SQL dinamico somente para evitar
-- referencia direta a tabelas/colunas ainda ausentes.

SELECT 'CONCURRENCY' AS section,
       'NOT_APPLICABLE_READ_ONLY' AS lock_status,
       'A migration 0005 executa SET LOCAL lock_timeout e SHARE ROW EXCLUSIVE; o dry-run nao bloqueia nem cria snapshot transacional.' AS detail;

-- 1. SCHEMA
WITH expected(table_name) AS (
  VALUES ('marcas'), ('perfis'), ('listas_kgr'), ('keywords_kgr'), ('brand_memberships'), ('brand_member_permissions')
)
SELECT 'SCHEMA' AS section,
       e.table_name,
       to_regclass('public.' || e.table_name) IS NOT NULL AS exists_in_public
FROM expected e
ORDER BY e.table_name;

SELECT 'SCHEMA_COLUMNS' AS section, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('marcas','perfis','listas_kgr','keywords_kgr','brand_memberships','brand_member_permissions')
  AND column_name IN ('id','marca_id','brand_id','owner_user_id','member_user_id','user_key','role','role_id','permissions','status','invited_by','lista_id','updated_at')
ORDER BY table_name, ordinal_position;

-- 2. MARCAS E USUARIOS
SELECT 'BRANDS' AS section, count(*) AS brand_count,
       array_agg(jsonb_build_object('id', id, 'nome', nome, 'owner_user_id', to_jsonb(marcas) -> 'owner_user_id')) AS brands
FROM public.marcas;

SELECT 'ADALBA' AS section, count(*) AS found,
       (array_agg(id ORDER BY id))[1] AS brand_id,
       (array_agg(nome ORDER BY nome))[1] AS nome
FROM public.marcas
WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid;

SELECT 'AUTHORIZED_OWNER' AS section, count(*) AS found,
       (array_agg(id ORDER BY id))[1] AS user_id,
       (array_agg(email ORDER BY email))[1] AS email
FROM auth.users
WHERE id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid;

SELECT 'GLOBAL_PROFILES' AS section, p.id, p.role, p.marca_id
FROM public.perfis p
WHERE p.role = 'admin'
ORDER BY p.id;

SELECT 'OWNER_CURRENT' AS section,
       count(*) AS found,
       (array_agg(nullif(to_jsonb(m) ->> 'owner_user_id', '') ORDER BY nullif(to_jsonb(m) ->> 'owner_user_id', '')))[1] AS owner_user_id,
       CASE
         WHEN count(*) = 0 THEN 'BRAND_NOT_FOUND'
         WHEN count(*) FILTER (WHERE nullif(to_jsonb(m) ->> 'owner_user_id', '') IS NULL) > 0 THEN 'MISSING_NOT_MIGRATED'
         WHEN count(*) FILTER (WHERE nullif(to_jsonb(m) ->> 'owner_user_id', '') = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b') > 0 THEN 'AUTHORIZED'
         ELSE 'CONFLICT'
       END AS owner_status
FROM public.marcas m
WHERE m.id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid;

-- 3. LISTAS
SELECT 'LISTS' AS section, count(*) AS total,
       count(*) FILTER (WHERE marca_id IS NULL) AS without_brand,
       count(*) FILTER (WHERE marca_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = listas_kgr.marca_id)) AS invalid_brand
FROM public.listas_kgr;

SELECT 'LISTS_BY_BRAND' AS section, marca_id, count(*) AS total
FROM public.listas_kgr
GROUP BY marca_id
ORDER BY marca_id;

-- 4. KEYWORDS
SELECT 'KEYWORDS' AS section, count(*) AS total,
       count(*) FILTER (WHERE lista_id IS NULL) AS without_list,
       count(*) FILTER (WHERE lista_id IS NOT NULL) AS with_list
FROM public.keywords_kgr;

SELECT 'LISTA_ID_FINGERPRINT' AS section,
       count(*) AS total,
       count(*) FILTER (WHERE k.lista_id IS NULL) AS without_list,
       count(*) FILTER (WHERE k.lista_id IS NOT NULL) AS with_list,
       md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), '')) AS fingerprint
FROM public.keywords_kgr k;

SELECT 'KEYWORDS_STATUS' AS section, coalesce(status, 'NULL') AS status, count(*) AS total
FROM public.keywords_kgr
GROUP BY status
ORDER BY status;

SELECT 'KEYWORDS_WITH_INVALID_LIST' AS section, k.id, k.lista_id
FROM public.keywords_kgr k
LEFT JOIN public.listas_kgr l ON l.id = k.lista_id
WHERE k.lista_id IS NOT NULL AND l.id IS NULL;

SELECT 'KEYWORDS_BRAND' AS section,
       count(*) FILTER (WHERE nullif(to_jsonb(k) ->> 'brand_id', '') IS NULL) AS without_brand,
       count(*) FILTER (WHERE nullif(to_jsonb(k) ->> 'brand_id', '') IS NOT NULL) AS with_brand,
       count(*) FILTER (
         WHERE k.lista_id IS NOT NULL
           AND nullif(to_jsonb(k) ->> 'brand_id', '') IS NOT NULL
           AND nullif(to_jsonb(k) ->> 'brand_id', '')::uuid <> l.marca_id
       ) AS divergent_from_list,
       count(*) FILTER (
         WHERE k.lista_id IS NULL
           AND nullif(to_jsonb(k) ->> 'brand_id', '') IS NOT NULL
           AND nullif(to_jsonb(k) ->> 'brand_id', '')::uuid <> '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
       ) AS unlisted_not_adalba,
       (SELECT jsonb_agg(x)
        FROM (
          SELECT nullif(to_jsonb(k2) ->> 'brand_id', '') AS brand_id, count(*) AS total
          FROM public.keywords_kgr k2
          GROUP BY nullif(to_jsonb(k2) ->> 'brand_id', '')
          ORDER BY brand_id
        ) x) AS brand_distribution,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'brand_id'
       ) THEN 'PRESENT' ELSE 'MISSING_NOT_MIGRATED' END AS brand_id_status
FROM public.keywords_kgr k
LEFT JOIN public.listas_kgr l ON l.id = k.lista_id;

-- 5. MEMBERSHIPS
DO $$
DECLARE membership_exists boolean;
DECLARE member_column text;
DECLARE brand_column text;
DECLARE role_column text;
DECLARE role_expr text;
DECLARE role_join text;
DECLARE invalid_user_expr text;
DECLARE report jsonb;
BEGIN
  SELECT to_regclass('public.brand_memberships') IS NOT NULL INTO membership_exists;
  IF NOT membership_exists THEN
    RAISE NOTICE 'MEMBERSHIPS MISSING_NOT_MIGRATED';
    RETURN;
  END IF;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand_memberships' AND column_name = 'member_user_id') THEN 'member_user_id' ELSE 'user_key' END INTO member_column;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand_memberships' AND column_name = 'brand_id') THEN 'brand_id' ELSE 'marca_id' END INTO brand_column;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand_memberships' AND column_name = 'role') THEN 'role' ELSE 'role_id' END INTO role_column;
  IF role_column = 'role' THEN
    role_expr := 'bm.role';
    role_join := '';
  ELSE
    role_expr := 'coalesce(br.slug, bm.role_id::text)';
    role_join := 'LEFT JOIN public.brand_roles br ON br.id = bm.role_id';
  END IF;
  IF member_column = 'member_user_id' THEN
    invalid_user_expr := 'NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bm.member_user_id)';
  ELSE
    invalid_user_expr := 'NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(coalesce(u.email, '''')) = lower(coalesce(bm.user_key, '''')) OR u.id::text = bm.user_key)';
  END IF;
  EXECUTE format('SELECT jsonb_build_object(''total'', count(*), ''active'', count(*) FILTER (WHERE bm.status = ''active''), ''invalid_status'', count(*) FILTER (WHERE bm.status NOT IN (''active'',''suspended'',''removed'')), ''duplicate_brand_member'', (SELECT count(*) FROM (SELECT bm2.%1$I, bm2.%2$I, count(*) FROM public.brand_memberships bm2 GROUP BY bm2.%1$I, bm2.%2$I HAVING count(*) > 1) d), ''invalid_brand'', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = bm.%2$I)), ''invalid_user'', count(*) FILTER (WHERE %4$s), ''owner_rows'', count(*) FILTER (WHERE %3$s IN (''owner'',''platform_admin'')), ''invalid_role'', count(*) FILTER (WHERE %3$s IS NULL OR %3$s NOT IN (''owner'',''brand_admin'',''editor'',''reviewer'',''specialist'',''reader'',''platform_admin''))) FROM public.brand_memberships bm %5$s', member_column, brand_column, role_expr, invalid_user_expr, role_join) INTO report;
  RAISE NOTICE 'MEMBERSHIPS %', report;
END $$;

DO $$
DECLARE permission_exists boolean;
DECLARE report jsonb;
BEGIN
  SELECT to_regclass('public.brand_member_permissions') IS NOT NULL INTO permission_exists;
  IF permission_exists THEN
    EXECUTE 'SELECT jsonb_build_object(''total'', count(*), ''granted'', count(*) FILTER (WHERE granted), ''invalid_membership'', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.brand_memberships m WHERE m.id = brand_member_permissions.membership_id))) FROM public.brand_member_permissions' INTO report;
    RAISE NOTICE 'MEMBERSHIP_PERMISSIONS %', report;
  ELSE
    RAISE NOTICE 'MEMBERSHIP_PERMISSIONS MISSING_NOT_MIGRATED';
  END IF;
END $$;

-- 6. RLS, POLICIES, FUNCTIONS E GRANTS
SELECT 'RLS' AS section, c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('marcas','listas_kgr','keywords_kgr','brand_roles','brand_memberships','brand_member_permissions','keywords_kgr')
ORDER BY c.relname;

SELECT 'POLICIES' AS section, schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('marcas','listas_kgr','keywords_kgr','brand_roles','brand_memberships','brand_member_permissions')
ORDER BY tablename, policyname;

SELECT 'PERMISSIVE_LEGACY_POLICY' AS section, schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('marcas','listas_kgr','keywords_kgr','brand_memberships','brand_member_permissions')
  AND cmd = 'ALL'
  AND array_to_string(roles, ',') ILIKE '%authenticated%'
  AND (coalesce(qual, '') ILIKE '%auth.role()%authenticated%' OR coalesce(with_check, '') ILIKE '%auth.role()%authenticated%');

SELECT 'AUTH_FUNCTIONS' AS section, n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_global_admin','can_access_brand','can_manage_brand','can_access_list','tenant_actor_has_permission');

SELECT 'TABLE_GRANTS' AS section,
       table_name,
       grantee,
       privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('marcas','perfis','listas_kgr','keywords_kgr','brand_roles','brand_memberships','brand_member_permissions')
  AND grantee IN ('PUBLIC','anon','authenticated','postgres','service_role')
ORDER BY table_name, grantee, privilege_type;

-- 7. RESULTADO FINAL
DO $$
DECLARE state text := 'READY';
DECLARE migration_state text := 'PRE_MIGRATION';
DECLARE brand_column boolean;
DECLARE owner_column boolean;
DECLARE membership_exists boolean;
DECLARE member_column boolean;
DECLARE null_brands bigint := 0;
DECLARE divergent bigint := 0;
DECLARE invalid_lists bigint := 0;
DECLARE invalid_keywords bigint := 0;
DECLARE owner_matches bigint := 0;
DECLARE owner_ok boolean := false;
DECLARE membership_ok boolean := false;
DECLARE policies_ok boolean := false;
DECLARE rls_ok boolean := false;
DECLARE post_migration_shape boolean := false;
BEGIN
  SELECT count(*) INTO invalid_lists FROM public.listas_kgr WHERE marca_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = listas_kgr.marca_id);
  SELECT count(*) INTO invalid_keywords FROM public.keywords_kgr k LEFT JOIN public.listas_kgr l ON l.id = k.lista_id WHERE k.lista_id IS NOT NULL AND l.id IS NULL;
  IF invalid_lists > 0 OR invalid_keywords > 0 THEN state := 'BLOCKED'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'brand_id') INTO brand_column;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marcas' AND column_name = 'owner_user_id') INTO owner_column;
  SELECT to_regclass('public.brand_memberships') IS NOT NULL INTO membership_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand_memberships' AND column_name = 'member_user_id') INTO member_column;
  post_migration_shape := brand_column AND owner_column AND membership_exists AND member_column;

  IF owner_column THEN
    SELECT count(*) INTO owner_matches
    FROM public.marcas m
    WHERE m.id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
      AND nullif(to_jsonb(m) ->> 'owner_user_id', '') = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b';
    owner_ok := owner_matches = 1;
  END IF;

  IF brand_column THEN
    SELECT count(*) FILTER (WHERE nullif(to_jsonb(k) ->> 'brand_id', '') IS NULL),
           count(*) FILTER (
             WHERE k.lista_id IS NOT NULL
               AND nullif(to_jsonb(k) ->> 'brand_id', '') IS NOT NULL
               AND nullif(to_jsonb(k) ->> 'brand_id', '')::uuid <> l.marca_id
           )
    INTO null_brands, divergent
    FROM public.keywords_kgr k
    LEFT JOIN public.listas_kgr l ON l.id = k.lista_id;
  END IF;

  IF membership_exists AND member_column THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.brand_memberships WHERE marca_id = $1 AND member_user_id = $2 AND role = ''owner'' AND status = ''active'')' INTO membership_ok USING '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid, 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid;
  END IF;

  SELECT (EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = 'public.listas_kgr'::regclass AND relrowsecurity)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = 'public.keywords_kgr'::regclass AND relrowsecurity)
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_0005_listas_select')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_0005_keywords_select')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_0005_memberships_select')) INTO rls_ok;
  policies_ok := rls_ok AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename IN ('listas_kgr','keywords_kgr') AND cmd = 'ALL' AND array_to_string(roles, ',') ILIKE '%authenticated%' AND (coalesce(qual, '') ILIKE '%auth.role()%authenticated%' OR coalesce(with_check, '') ILIKE '%auth.role()%authenticated%'));

  IF post_migration_shape AND state <> 'BLOCKED' THEN
    IF null_brands > 0 OR divergent > 0 OR NOT owner_ok OR NOT membership_ok OR NOT policies_ok THEN
      state := 'BLOCKED';
    ELSE
      migration_state := 'POST_MIGRATION_READY';
    END IF;
  ELSIF state <> 'BLOCKED' THEN
    migration_state := 'PRE_MIGRATION';
  END IF;
  RAISE NOTICE 'COLUMN_STATUS keywords_kgr.brand_id=% marcas.owner_user_id=% brand_memberships=%',
    CASE WHEN brand_column THEN 'PRESENT' ELSE 'MISSING_NOT_MIGRATED' END,
    CASE WHEN owner_column THEN 'PRESENT' ELSE 'MISSING_NOT_MIGRATED' END,
    CASE WHEN membership_exists THEN 'PRESENT' ELSE 'MISSING_NOT_MIGRATED' END;
  RAISE NOTICE 'RLS_STATUS tenantized=% policies_ok=%', rls_ok, policies_ok;
  RAISE NOTICE 'OWNER_STATUS authorized=%', owner_ok;
  RAISE NOTICE 'MEMBERSHIP_STATUS authorized_owner=%', membership_ok;
  RAISE NOTICE 'MIGRATION_STATE=%', migration_state;
  RAISE NOTICE 'RESULTADO_FINAL=%', state;
END $$;
