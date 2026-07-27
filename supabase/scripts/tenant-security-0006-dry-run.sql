-- DRY-RUN POS-0005/0006. SOMENTE LEITURA; NAO APLICAR ALTERACOES.

SELECT 'FUNCTIONS' AS section,
       p.oid::regprocedure::text AS function_signature,
       p.prosecdef AS security_definer,
       p.provolatile AS volatility,
       coalesce(array_to_string(p.proconfig, ';'), '') AS settings,
       path.search_path_normalized,
       path.search_path_normalized = 'pg_catalog,public,pg_temp' AS search_path_expected,
       CASE
         WHEN path.search_path_normalized = 'pg_catalog,public,pg_temp' THEN 'SEARCH_PATH_OK'
         WHEN path.search_path_normalized = 'public,pg_temp' THEN 'SEARCH_PATH_RECONCILIATION_REQUIRED'
         ELSE 'SEARCH_PATH_CONFLICT'
       END AS search_path_state,
       EXISTS (
         SELECT 1
         FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
       ) AS public_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
       CASE
         WHEN EXISTS (
           SELECT 1
           FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
           WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
         ) THEN 'PUBLIC_OPEN'
         WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'ANON_OPEN'
         WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
          AND has_function_privilege('service_role', p.oid, 'EXECUTE') THEN 'SECURE'
         ELSE 'PARTIAL'
       END AS grant_state,
       pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL (
  SELECT regexp_replace(
           lower(substring(config_value from position('=' in config_value) + 1)),
           '\s+',
           '',
           'g'
         ) AS search_path_normalized
  FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
  WHERE lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
  LIMIT 1
) path ON true
WHERE n.nspname = 'public'
  AND p.oid IN (
    to_regprocedure('public.is_global_admin()'),
    to_regprocedure('public.can_access_brand(uuid)'),
    to_regprocedure('public.can_manage_brand(uuid)'),
    to_regprocedure('public.can_access_list(uuid)'),
    to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)')
  )
ORDER BY function_signature;

SELECT 'SEARCH_PATH_RECONCILIATION' AS section,
       CASE
         WHEN count(*) <> 5 THEN 'SEARCH_PATH_CONFLICT'
         WHEN bool_and(path.search_path_normalized = 'pg_catalog,public,pg_temp') THEN 'SEARCH_PATH_OK'
         WHEN bool_and(path.search_path_normalized IN ('public,pg_temp', 'pg_catalog,public,pg_temp')) THEN 'SEARCH_PATH_RECONCILIATION_REQUIRED'
         ELSE 'SEARCH_PATH_CONFLICT'
       END AS state
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL (
  SELECT regexp_replace(lower(substring(config_value from position('=' in config_value) + 1)), '\s+', '', 'g') AS search_path_normalized
  FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
  WHERE lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
  LIMIT 1
) path ON true
WHERE n.nspname = 'public'
  AND p.oid IN (
    to_regprocedure('public.is_global_admin()'),
    to_regprocedure('public.can_access_brand(uuid)'),
    to_regprocedure('public.can_manage_brand(uuid)'),
    to_regprocedure('public.can_access_list(uuid)'),
    to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)')
  );

SELECT 'CAN_ACCESS_BRAND_AUDIT' AS section,
       pg_get_functiondef(to_regprocedure('public.can_access_brand(uuid)')) AS definition,
       pg_get_functiondef(to_regprocedure('public.can_access_brand(uuid)')) ILIKE '%coalesce(m.user_key%' AS uses_empty_email_fallback,
       pg_get_functiondef(to_regprocedure('public.can_access_brand(uuid)')) ILIKE '%auth.uid() IS NOT NULL%' AS requires_authenticated_uid,
       (
         SELECT regexp_replace(lower(substring(config_value from position('=' in config_value) + 1)), '\s+', '', 'g')
         FROM pg_catalog.pg_proc p
         CROSS JOIN LATERAL unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
         WHERE p.oid = to_regprocedure('public.can_access_brand(uuid)')
           AND lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
         LIMIT 1
       ) AS search_path_normalized;

SELECT 'LIST_POLICIES' AS section,
       policyname,
       cmd,
       qual,
       with_check,
       CASE
         WHEN policyname = 'tenant_0005_listas_select' THEN 'can_access_brand'
         WHEN policyname = 'tenant_0005_listas_insert' THEN 'minerador/create'
         WHEN policyname = 'tenant_0005_listas_update' THEN 'minerador/edit'
         WHEN policyname = 'tenant_0005_listas_delete' THEN 'minerador/manage'
       END AS expected_module_action
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename = 'listas_kgr'
  AND policyname IN ('tenant_0005_listas_select','tenant_0005_listas_insert','tenant_0005_listas_update','tenant_0005_listas_delete')
ORDER BY policyname;

SELECT 'TENANT_PRECONDITIONS' AS section,
       EXISTS (SELECT 1 FROM public.marcas WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid) AS adalba_found,
       EXISTS (SELECT 1 FROM public.marcas WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND owner_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid) AS owner_found,
       EXISTS (SELECT 1 FROM public.brand_memberships WHERE marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid AND role = 'owner' AND status = 'active') AS owner_membership_found;

WITH pairs(table_name, legacy_name, canonical_name) AS (
  VALUES
    ('brand_memberships', 'brand_memberships_marca_id_fkey', 'fk_brand_memberships_marca_0005'),
    ('brand_memberships', 'brand_memberships_role_id_fkey', 'fk_brand_memberships_role_0005'),
    ('keywords_kgr', 'keywords_kgr_lista_id_fkey', 'fk_keywords_kgr_lista_0005'),
    ('listas_kgr', 'listas_kgr_marca_id_fkey', 'fk_listas_kgr_marca_0005')
)
SELECT 'CONSTRAINT_PAIRS' AS section,
       pairs.table_name,
       pairs.legacy_name,
       pairs.canonical_name,
       legacy.oid IS NOT NULL AS legacy_exists,
       canonical.oid IS NOT NULL AS canonical_exists,
       pg_get_constraintdef(legacy.oid, true) AS legacy_definition,
       pg_get_constraintdef(canonical.oid, true) AS canonical_definition,
       legacy.confdeltype AS legacy_delete_action,
       canonical.confdeltype AS canonical_delete_action,
       CASE
         WHEN pairs.table_name = 'keywords_kgr'
          AND pairs.legacy_name = 'keywords_kgr_lista_id_fkey'
          AND pairs.canonical_name = 'fk_keywords_kgr_lista_0005'
          AND legacy.oid IS NOT NULL
          AND canonical.oid IS NOT NULL
          AND legacy.contype = 'f'
          AND canonical.contype = 'f'
          AND legacy.conrelid = 'public.keywords_kgr'::regclass
          AND canonical.conrelid = 'public.keywords_kgr'::regclass
          AND legacy.confrelid = 'public.listas_kgr'::regclass
          AND canonical.confrelid = 'public.listas_kgr'::regclass
          AND legacy.confdeltype = 'c'
          AND canonical.confdeltype = 'r'
          AND legacy.confupdtype = 'a'
          AND canonical.confupdtype = 'a'
          AND legacy.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[]
          AND canonical.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[]
          AND legacy.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[]
          AND canonical.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[]
          AND NOT legacy.condeferrable
          AND NOT canonical.condeferrable
          AND NOT legacy.condeferred
          AND NOT canonical.condeferred
          AND legacy.convalidated
          AND canonical.convalidated
         THEN 'CASCADE_TO_RESTRICT_EXPECTED'
         WHEN pairs.table_name = 'keywords_kgr'
          AND pairs.legacy_name = 'keywords_kgr_lista_id_fkey'
          AND pairs.canonical_name = 'fk_keywords_kgr_lista_0005'
         THEN 'UNEXPECTED_TARGET_DEFINITION'
         ELSE 'NOT_TARGET_PAIR'
       END AS target_fk_state,
       CASE
         WHEN legacy.oid IS NULL AND canonical.oid IS NOT NULL THEN 'ALREADY_RECONCILED'
         WHEN legacy.oid IS NULL OR canonical.oid IS NULL THEN 'BLOCKED_MISSING_PAIR'
         WHEN legacy.contype IS NOT DISTINCT FROM canonical.contype
           AND legacy.conrelid IS NOT DISTINCT FROM canonical.conrelid
           AND legacy.confrelid IS NOT DISTINCT FROM canonical.confrelid
           AND legacy.conkey IS NOT DISTINCT FROM canonical.conkey
           AND legacy.confkey IS NOT DISTINCT FROM canonical.confkey
           AND legacy.confdeltype IS NOT DISTINCT FROM canonical.confdeltype
           AND legacy.confupdtype IS NOT DISTINCT FROM canonical.confupdtype
           AND legacy.condeferrable IS NOT DISTINCT FROM canonical.condeferrable
           AND legacy.condeferred IS NOT DISTINCT FROM canonical.condeferred
           AND legacy.convalidated IS NOT DISTINCT FROM canonical.convalidated
           AND pg_get_constraintdef(legacy.oid, true) IS NOT DISTINCT FROM pg_get_constraintdef(canonical.oid, true) THEN 'EQUIVALENT'
         ELSE 'DIFFERENT'
       END AS classification
FROM pairs
LEFT JOIN pg_catalog.pg_constraint legacy
  ON legacy.conrelid = ('public.' || pairs.table_name)::regclass
 AND legacy.conname = pairs.legacy_name
LEFT JOIN pg_catalog.pg_constraint canonical
  ON canonical.conrelid = ('public.' || pairs.table_name)::regclass
 AND canonical.conname = pairs.canonical_name
ORDER BY pairs.table_name, pairs.legacy_name;

SELECT 'MEMBERSHIP' AS section,
       EXISTS (
         SELECT 1 FROM public.brand_memberships
         WHERE marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
           AND member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid
           AND role = 'owner'
           AND status = 'active'
       ) AS owner_membership_present,
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_constraint
         WHERE conrelid = 'public.brand_memberships'::regclass
           AND conname = 'uq_brand_memberships_member_user_0005'
       ) AS unique_membership_present;

SELECT 'DATA_INTEGRITY' AS section,
       (SELECT count(*) FROM public.listas_kgr) AS total_lists,
       count(*) AS total_keywords,
       count(*) FILTER (WHERE lista_id IS NULL) AS keywords_without_list,
       count(*) FILTER (WHERE lista_id IS NOT NULL) AS keywords_with_list,
       count(*) FILTER (WHERE brand_id IS NULL) AS keywords_without_brand,
       count(*) FILTER (WHERE lista_id IS NOT NULL AND brand_id <> listas_kgr.marca_id) AS divergent_keyword_list,
       md5(coalesce(string_agg(keywords_kgr.id::text || '=' || coalesce(keywords_kgr.lista_id::text, '<NULL>'), '|' ORDER BY keywords_kgr.id), '')) AS lista_id_fingerprint,
       md5(coalesce(string_agg(keywords_kgr.id::text || '=' || coalesce(keywords_kgr.brand_id::text, '<NULL>'), '|' ORDER BY keywords_kgr.id), '')) AS brand_id_fingerprint
FROM public.keywords_kgr
LEFT JOIN public.listas_kgr ON listas_kgr.id = keywords_kgr.lista_id;

SELECT 'APPLICATION_CONSUMERS' AS section,
       'NO_DIRECT_LIST_DELETE_FOUND' AS listas_kgr_delete,
       'ARCHITECT_LOCAL_SILO_DETACH_ONLY' AS architect_silo_action,
       'PUBLISHED_LIST_TRIGGER_AND_FK_RESTRICT' AS database_delete_guard,
       'app/api/marcas DELETE is brand-level and does not depend on list CASCADE' AS brand_delete_note;

SELECT 'RESULTADO_FINAL' AS section,
       CASE
         WHEN (SELECT count(*) FROM public.keywords_kgr) = 147
          AND (SELECT count(*) FROM public.listas_kgr) > 0
          AND (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL) = 126
         AND (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL) = 21
          AND NOT EXISTS (SELECT 1 FROM public.keywords_kgr WHERE brand_id IS NULL)
          AND NOT EXISTS (SELECT 1 FROM public.keywords_kgr k JOIN public.listas_kgr l ON l.id = k.lista_id WHERE k.lista_id IS NOT NULL AND k.brand_id <> l.marca_id)
         AND EXISTS (SELECT 1 FROM public.marcas WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND owner_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid)
          AND EXISTS (SELECT 1 FROM public.brand_memberships WHERE marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid AND role = 'owner' AND status = 'active')
          AND (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)'))) = 5
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc p
            WHERE p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)'))
              AND coalesce((
                SELECT regexp_replace(lower(substring(config_value from position('=' in config_value) + 1)), '\s+', '', 'g')
                FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
                WHERE lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
                LIMIT 1
              ), '') NOT IN ('public,pg_temp', 'pg_catalog,public,pg_temp')
          )
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'lista_id' AND is_nullable <> 'YES')
          AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid = 'public.keywords_kgr'::regclass AND c.conname = 'keywords_kgr_lista_id_fkey' AND c.contype = 'f' AND c.confrelid = 'public.listas_kgr'::regclass AND c.confdeltype = 'c' AND c.confupdtype = 'a' AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[] AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[] AND NOT c.condeferrable AND NOT c.condeferred AND c.convalidated)
          AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid = 'public.keywords_kgr'::regclass AND c.conname = 'fk_keywords_kgr_lista_0005' AND c.contype = 'f' AND c.confrelid = 'public.listas_kgr'::regclass AND c.confdeltype = 'r' AND c.confupdtype = 'a' AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[] AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[] AND NOT c.condeferrable AND NOT c.condeferred AND c.convalidated)
          AND NOT EXISTS (
            SELECT 1
            FROM (VALUES
              ('brand_memberships', 'brand_memberships_marca_id_fkey', 'fk_brand_memberships_marca_0005'),
              ('brand_memberships', 'brand_memberships_role_id_fkey', 'fk_brand_memberships_role_0005'),
              ('keywords_kgr', 'keywords_kgr_lista_id_fkey', 'fk_keywords_kgr_lista_0005'),
              ('listas_kgr', 'listas_kgr_marca_id_fkey', 'fk_listas_kgr_marca_0005')
            ) AS required_pairs(table_name, legacy_name, canonical_name)
            WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid = ('public.' || required_pairs.table_name)::regclass AND c.conname = required_pairs.canonical_name)
          )
         THEN 'READY'
         ELSE 'BLOCKED'
       END AS state;
