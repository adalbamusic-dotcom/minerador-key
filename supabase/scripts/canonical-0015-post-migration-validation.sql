-- Fase 1 / 0015: validação pós-migration.
-- SOMENTE LEITURA. Execute apenas depois da aplicação manual bem-sucedida.
-- Não retorna e-mails, tokens, segredos ou dados editoriais.

-- This diagnostic is safe before 0015 too: absent optional columns are
-- reported as MISSING_NOT_MIGRATED rather than referenced directly.
SELECT CASE
         WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'owner_user_id'
         )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'canonical_role'
          )
         THEN 'POST_MIGRATION_SCHEMA_PRESENT'
         ELSE 'MISSING_NOT_MIGRATED'
       END AS validation_phase;

SELECT column_name,
       is_nullable,
       data_type,
       CASE
         WHEN table_name = 'brand_memberships' AND column_name = 'member_user_id' AND is_nullable = 'NO' THEN 'CANONICAL_COLLABORATOR_UUID'
         WHEN table_name = 'brand_memberships' AND column_name = 'user_id' THEN 'UNEXPECTED_COMPETING_UUID_COLUMN'
         WHEN table_name = 'agencies' AND column_name = 'owner_user_id' AND is_nullable = 'NO' THEN 'CANONICAL_AGENCY_OWNER'
         WHEN table_name = 'agency_memberships' AND column_name = 'canonical_role' AND is_nullable = 'NO' THEN 'TRANSITION_ROLE_READY'
         ELSE 'OBSERVED'
       END AS validation_state
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'brand_memberships' AND column_name IN ('member_user_id', 'user_id', 'user_key'))
    OR (table_name = 'agencies' AND column_name = 'owner_user_id')
    OR (table_name = 'agency_memberships' AND column_name IN ('role', 'canonical_role'))
  )
ORDER BY table_name, column_name;

SELECT count(*) FILTER (WHERE member_user_id IS NULL) AS memberships_without_canonical_uuid,
       count(*) FILTER (WHERE nullif(btrim(user_key), '') IS NOT NULL) AS memberships_with_legacy_user_key
FROM public.brand_memberships;

SELECT count(*) FILTER (
         WHERE nullif(to_jsonb(a) ->> 'owner_user_id', '') IS NULL
       ) AS agencies_without_owner,
       count(*) FILTER (
         WHERE nullif(to_jsonb(a) ->> 'owner_user_id', '') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM auth.users u
             WHERE u.id = nullif(to_jsonb(a) ->> 'owner_user_id', '')::uuid
           )
       ) AS agencies_with_owner_missing_in_auth
FROM public.agencies a;

SELECT CASE
         WHEN to_jsonb(am) ? 'canonical_role'
           THEN coalesce(nullif(to_jsonb(am) ->> 'canonical_role', ''), 'INVALID_EMPTY_CANONICAL_ROLE')
         ELSE 'MISSING_NOT_MIGRATED'
       END AS canonical_role,
       count(*) AS memberships_count,
       CASE
         WHEN NOT (to_jsonb(am) ? 'canonical_role') THEN 'MISSING_NOT_MIGRATED'
         WHEN to_jsonb(am) ->> 'canonical_role' IN ('agency_admin', 'agency_member') THEN 'ALLOWED'
         ELSE 'INVALID'
       END AS validation_state
FROM public.agency_memberships am
GROUP BY
  CASE
    WHEN to_jsonb(am) ? 'canonical_role'
      THEN coalesce(nullif(to_jsonb(am) ->> 'canonical_role', ''), 'INVALID_EMPTY_CANONICAL_ROLE')
    ELSE 'MISSING_NOT_MIGRATED'
  END,
  CASE
    WHEN NOT (to_jsonb(am) ? 'canonical_role') THEN 'MISSING_NOT_MIGRATED'
    WHEN to_jsonb(am) ->> 'canonical_role' IN ('agency_admin', 'agency_member') THEN 'ALLOWED'
    ELSE 'INVALID'
  END
ORDER BY canonical_role;

SELECT indexname,
       indexdef,
       CASE
         WHEN indexname = 'uq_agency_brands_active_brand_0014'
          AND indexdef ILIKE '%UNIQUE INDEX%'
          AND indexdef ILIKE '%ON public.agency_brands%'
          AND indexdef ILIKE '%(brand_id)%'
          AND indexdef ILIKE '%WHERE (status = ''active''%' THEN 'EXPECTED_0014_INDEX'
         ELSE 'REVIEW' END AS validation_state
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'agency_brands'
  AND indexname = 'uq_agency_brands_active_brand_0014';

SELECT brand_id, count(*) AS active_agency_links
FROM public.agency_brands
WHERE status = 'active'
GROUP BY brand_id
HAVING count(*) > 1
ORDER BY active_agency_links DESC, brand_id;

SELECT p.proname AS function_name,
       p.prosecdef AS security_definer,
       EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) setting_value
         WHERE setting_value = 'search_path=pg_catalog, public, pg_temp'
       ) AS has_expected_search_path,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
       CASE
         WHEN pg_get_functiondef(p.oid) ILIKE '%user_key%'
           OR pg_get_functiondef(p.oid) ILIKE '%auth.jwt()%'
           OR pg_get_functiondef(p.oid) ILIKE '%is_global_admin()%'
           OR (p.proname IN ('canonical_can_access_brand', 'canonical_can_manage_brand') AND pg_get_functiondef(p.oid) NOT ILIKE '%member_user_id = auth.uid()%')
         THEN 'INVALID_CANONICAL_FUNCTION'
         ELSE 'FUNCTION_CONTRACT_OK' END AS validation_state
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'canonical_is_platform_admin',
    'canonical_can_access_brand',
    'canonical_can_manage_brand',
    'canonical_can_access_agency',
    'canonical_can_manage_agency'
  )
ORDER BY p.proname;
