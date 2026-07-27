-- SNAPSHOT MANUAL PRE-MIGRATION. SOMENTE LEITURA; NAO FOI EXECUTADO.
-- Exportar os resultados antes de aplicar 0005 e guardar com identificador,
-- data, ambiente e usuario executor.

SELECT 'marcas' AS source, to_jsonb(m) AS row_data FROM public.marcas m ORDER BY m.id;
SELECT 'perfis' AS source, to_jsonb(p) AS row_data FROM public.perfis p ORDER BY p.id;
SELECT 'listas_kgr' AS source, to_jsonb(l) AS row_data FROM public.listas_kgr l ORDER BY l.id;
SELECT 'keywords_kgr' AS source, to_jsonb(k) AS row_data FROM public.keywords_kgr k ORDER BY k.id;

SELECT 'lista_id_fingerprint' AS source,
       count(*) AS keyword_count,
       count(*) FILTER (WHERE k.lista_id IS NULL) AS keywords_without_list,
       count(*) FILTER (WHERE k.lista_id IS NOT NULL) AS keywords_with_list,
       md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), '')) AS fingerprint
FROM public.keywords_kgr k;

-- Backups manuais: somente existencia, forma e comparacao read-only.
-- Nenhum backup e restaurado, sobrescrito ou removido por este arquivo.
WITH expected_backups(backup_name, backup_kind) AS (
  VALUES
    ('migration_backup.keywords_kgr_before_0005_20260724', 'original'),
    ('migration_backup.keywords_kgr_after_failed_0005_20260724', 'danificado'),
    ('migration_backup.listas_kgr_before_0005_20260724', 'original'),
    ('migration_backup.marcas_before_0005_20260724', 'original'),
    ('migration_backup.perfis_before_0005_20260724', 'original'),
    ('migration_backup.policies_before_0005_20260724', 'original')
)
SELECT 'manual_backups' AS source,
       backup_name,
       backup_kind,
       to_regclass(backup_name) AS relation_name,
       CASE
         WHEN to_regclass(backup_name) IS NULL THEN 'MISSING_NOT_VALIDATED'
         WHEN backup_kind = 'danificado' THEN 'SNAPSHOT_DANIFICADO_PRESERVADO'
         ELSE 'SNAPSHOT_ORIGINAL_PRESERVADO'
       END AS preservation_status
FROM expected_backups
ORDER BY backup_name;

-- Quando os backups de keywords possuem id/lista_id, compara o fingerprint
-- exato com o estado atual. Se a tabela estiver ausente ou tiver outra forma,
-- o resultado permanece explicitamente nao validado.
DO $$
DECLARE
  backup_name text;
  backup_relation regclass;
  backup_schema text;
  backup_table text;
  backup_fingerprint text;
  current_fingerprint text;
  has_id boolean;
  has_lista_id boolean;
BEGIN
  SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), ''))
  INTO current_fingerprint
  FROM public.keywords_kgr k;

  FOREACH backup_name IN ARRAY ARRAY[
    'migration_backup.keywords_kgr_before_0005_20260724',
    'migration_backup.keywords_kgr_after_failed_0005_20260724'
  ] LOOP
    backup_relation := to_regclass(backup_name);
    IF backup_relation IS NULL THEN
      RAISE NOTICE 'SNAPSHOT_BACKUP %: MISSING_NOT_VALIDATED', backup_name;
      CONTINUE;
    END IF;

    SELECT n.nspname, c.relname
    INTO backup_schema, backup_table
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = backup_relation;

    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = backup_relation AND attname = 'id' AND NOT attisdropped
    ), EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid = backup_relation AND attname = 'lista_id' AND NOT attisdropped
    )
    INTO has_id, has_lista_id;

    IF NOT has_id OR NOT has_lista_id THEN
      RAISE NOTICE 'SNAPSHOT_BACKUP %: INVALID_SHAPE_NOT_VALIDATED', backup_name;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT md5(coalesce(string_agg(id::text || ''='' || coalesce(lista_id::text, ''<NULL>''), ''|'' ORDER BY id), '''')) FROM %I.%I',
      backup_schema,
      backup_table
    ) INTO backup_fingerprint;

    IF backup_fingerprint IS NOT DISTINCT FROM current_fingerprint THEN
      RAISE NOTICE 'SNAPSHOT_BACKUP %: LISTA_ID_COMPATIVEL_COM_ESTADO_ATUAL', backup_name;
    ELSE
      RAISE NOTICE 'SNAPSHOT_BACKUP %: LISTA_ID_DIVERGENTE_PRESERVADO', backup_name;
    END IF;
  END LOOP;
END $$;

SELECT 'constraints' AS source,
       n.nspname AS schema_name,
       c.conrelid::regclass::text AS table_name,
       c.conname AS constraint_name,
       c.contype,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint c
JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND c.conrelid::regclass::text IN ('public.marcas','public.perfis','public.listas_kgr','public.keywords_kgr','public.brand_memberships','public.brand_member_permissions')
ORDER BY table_name, constraint_name;

SELECT 'policies' AS source, schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('marcas','perfis','listas_kgr','keywords_kgr','brand_memberships','brand_member_permissions')
ORDER BY tablename, policyname;

SELECT 'rls' AS source, n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('marcas','perfis','listas_kgr','keywords_kgr','brand_memberships','brand_member_permissions');

SELECT 'functions' AS source, n.nspname AS schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_global_admin','can_access_brand','can_manage_brand','can_access_list','tenant_actor_has_permission','editorial_has_permission');

SELECT 'triggers' AS source,
       n.nspname AS schema_name,
       c.relname AS table_name,
       t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN ('marcas','perfis','listas_kgr','keywords_kgr','brand_memberships','brand_member_permissions')
ORDER BY table_name, trigger_name;

SELECT 'grants' AS source,
       table_schema,
       table_name,
       grantee,
       privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('marcas','perfis','listas_kgr','keywords_kgr','brand_roles','brand_memberships','brand_member_permissions')
  AND grantee IN ('PUBLIC','anon','authenticated','postgres','service_role')
ORDER BY table_name, grantee, privilege_type;

SELECT 'function_grants' AS source,
       routine_schema,
       routine_name,
       grantee,
       privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('is_global_admin','can_access_brand','can_manage_brand','can_access_list','tenant_actor_has_permission','editorial_has_permission')
ORDER BY routine_name, grantee, privilege_type;
