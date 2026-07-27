-- VALIDACAO POS-0006. SOMENTE LEITURA; nao altera dados ou estrutura.

SELECT 'FUNCTION_SECURITY' AS section,
       count(*) AS functions_found,
       bool_and(p.prosecdef) AS all_security_definer,
       bool_and(p.provolatile = 's') AS all_stable,
       bool_and(path.search_path_normalized = 'pg_catalog,public,pg_temp') AS required_search_path,
       bool_and(path.search_path_normalized = 'pg_catalog,public,pg_temp') AS search_path_ok,
       bool_and(NOT EXISTS (
         SELECT 1
         FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
       )) AS public_blocked,
       bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_blocked,
       bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authenticated_allowed,
       bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')) AS service_role_allowed
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL (
  SELECT regexp_replace(lower(substring(config_value from position('=' in config_value) + 1)), '\s+', '', 'g') AS search_path_normalized
  FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
  WHERE lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
  LIMIT 1
) path ON true
WHERE n.nspname = 'public'
  AND p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)'));

SELECT 'SEARCH_PATH_RECONCILIATION' AS section,
       CASE
         WHEN count(*) <> 5 THEN 'BLOCKED_FUNCTION_SET'
         WHEN bool_and(path.search_path_normalized = 'pg_catalog,public,pg_temp') THEN 'SEARCH_PATH_OK'
         ELSE 'SEARCH_PATH_RECONCILIATION_REQUIRED'
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
  AND p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)'));

SELECT 'FUNCTION_FALLBACK_AUDIT' AS section,
       pg_get_functiondef(to_regprocedure('public.can_access_brand(uuid)')) ILIKE '%coalesce(m.user_key%' AS uses_empty_email_fallback,
       pg_get_functiondef(to_regprocedure('public.can_access_brand(uuid)')) ILIKE '%coalesce(auth.jwt%' AS uses_empty_jwt_fallback,
       (
         SELECT regexp_replace(lower(substring(config_value from position('=' in config_value) + 1)), '\s+', '', 'g')
         FROM pg_catalog.pg_proc p
         CROSS JOIN LATERAL unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
         WHERE p.oid = to_regprocedure('public.can_access_brand(uuid)')
           AND lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
         LIMIT 1
       ) AS search_path_normalized;

SELECT 'LIST_POLICY_MODULES' AS section,
       EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_select' AND qual ILIKE '%can_access_brand%') AS select_ok,
       EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_insert' AND with_check ILIKE '%minerador%' AND with_check ILIKE '%create%') AS insert_ok,
       EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_update' AND coalesce(qual, '') ILIKE '%minerador%' AND coalesce(with_check, '') ILIKE '%minerador%' AND coalesce(with_check, '') ILIKE '%edit%') AS update_ok,
       EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_delete' AND qual ILIKE '%minerador%' AND qual ILIKE '%manage%') AS delete_ok;

WITH pairs(table_name, legacy_name, canonical_name) AS (
  VALUES
    ('brand_memberships', 'brand_memberships_marca_id_fkey', 'fk_brand_memberships_marca_0005'),
    ('brand_memberships', 'brand_memberships_role_id_fkey', 'fk_brand_memberships_role_0005'),
    ('keywords_kgr', 'keywords_kgr_lista_id_fkey', 'fk_keywords_kgr_lista_0005'),
    ('listas_kgr', 'listas_kgr_marca_id_fkey', 'fk_listas_kgr_marca_0005')
)
SELECT 'CONSTRAINT_RECONCILIATION' AS section,
       pairs.table_name,
       pairs.legacy_name,
       pairs.canonical_name,
       legacy.oid IS NOT NULL AS legacy_exists,
       canonical.oid IS NOT NULL AS canonical_exists,
       legacy.confdeltype AS legacy_delete_action,
       canonical.confdeltype AS canonical_delete_action,
       pg_get_constraintdef(legacy.oid, true) AS legacy_definition,
       pg_get_constraintdef(canonical.oid, true) AS canonical_definition,
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
       END AS classification,
       CASE
         WHEN pairs.table_name = 'keywords_kgr'
          AND pairs.legacy_name = 'keywords_kgr_lista_id_fkey'
          AND pairs.canonical_name = 'fk_keywords_kgr_lista_0005'
          AND legacy.oid IS NULL
          AND canonical.oid IS NOT NULL
          AND canonical.contype = 'f'
          AND canonical.conrelid = 'public.keywords_kgr'::regclass
          AND canonical.confrelid = 'public.listas_kgr'::regclass
          AND canonical.confdeltype = 'r'
          AND canonical.confupdtype = 'a'
          AND canonical.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[]
          AND canonical.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[]
          AND NOT canonical.condeferrable
          AND NOT canonical.condeferred
          AND canonical.convalidated
         THEN 'RESTRICT_PRESERVED_CASCADE_REMOVED'
         WHEN pairs.table_name = 'keywords_kgr'
          AND pairs.legacy_name = 'keywords_kgr_lista_id_fkey'
         THEN 'UNEXPECTED_TARGET_STATE'
         ELSE 'NOT_TARGET_PAIR'
       END AS target_fk_state
FROM pairs
LEFT JOIN pg_catalog.pg_constraint legacy ON legacy.conrelid = ('public.' || pairs.table_name)::regclass AND legacy.conname = pairs.legacy_name
LEFT JOIN pg_catalog.pg_constraint canonical ON canonical.conrelid = ('public.' || pairs.table_name)::regclass AND canonical.conname = pairs.canonical_name
ORDER BY pairs.table_name, pairs.legacy_name;

SELECT 'DATA_PRESERVED' AS section,
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

SELECT 'RESULTADO_FINAL' AS section,
       CASE WHEN
         (SELECT count(*) FROM public.keywords_kgr) = 147
         AND (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL) = 126
         AND (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL) = 21
         AND NOT EXISTS (SELECT 1 FROM public.keywords_kgr WHERE brand_id IS NULL)
         AND NOT EXISTS (SELECT 1 FROM public.keywords_kgr k JOIN public.listas_kgr l ON l.id = k.lista_id WHERE k.lista_id IS NOT NULL AND k.brand_id <> l.marca_id)
         AND EXISTS (SELECT 1 FROM public.marcas WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND owner_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid)
         AND EXISTS (SELECT 1 FROM public.brand_memberships WHERE marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid AND role = 'owner' AND status = 'active')
         AND (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)'))) = 5
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)')) AND (NOT p.prosecdef OR p.provolatile <> 's'))
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)')) AND (coalesce((SELECT regexp_replace(lower(substring(config_value from position('=' in config_value) + 1)), '\s+', '', 'g') FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value WHERE lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%' LIMIT 1), '') IS DISTINCT FROM 'pg_catalog,public,pg_temp'))
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)')) AND (EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE')))
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid IN (to_regprocedure('public.is_global_admin()'), to_regprocedure('public.can_access_brand(uuid)'), to_regprocedure('public.can_manage_brand(uuid)'), to_regprocedure('public.can_access_list(uuid)'), to_regprocedure('public.tenant_actor_has_permission(uuid,text,text)')) AND (NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')))
         AND NOT (pg_get_functiondef(to_regprocedure('public.can_access_brand(uuid)')) ILIKE '%coalesce(m.user_key%' OR pg_get_functiondef(to_regprocedure('public.can_access_brand(uuid)')) ILIKE '%coalesce(auth.jwt%')
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_select' AND qual ILIKE '%can_access_brand%')
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_insert' AND with_check ILIKE '%minerador%' AND with_check ILIKE '%create%')
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_update' AND coalesce(qual, '') ILIKE '%minerador%' AND coalesce(with_check, '') ILIKE '%minerador%' AND coalesce(with_check, '') ILIKE '%edit%')
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_delete' AND qual ILIKE '%minerador%' AND qual ILIKE '%manage%')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'lista_id' AND is_nullable <> 'YES')
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.keywords_kgr'::regclass AND conname = 'keywords_kgr_lista_id_fkey')
         AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid = 'public.keywords_kgr'::regclass AND c.conname = 'fk_keywords_kgr_lista_0005' AND c.contype = 'f' AND c.confrelid = 'public.listas_kgr'::regclass AND c.confdeltype = 'r' AND c.confupdtype = 'a' AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[] AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[] AND NOT c.condeferrable AND NOT c.condeferred AND c.convalidated)
         AND (SELECT count(*) FROM public.listas_kgr) > 0
         AND NOT EXISTS (
           SELECT 1
           FROM (VALUES
             ('brand_memberships', 'brand_memberships_marca_id_fkey', 'fk_brand_memberships_marca_0005'),
             ('brand_memberships', 'brand_memberships_role_id_fkey', 'fk_brand_memberships_role_0005'),
             ('keywords_kgr', 'keywords_kgr_lista_id_fkey', 'fk_keywords_kgr_lista_0005'),
             ('listas_kgr', 'listas_kgr_marca_id_fkey', 'fk_listas_kgr_marca_0005')
           ) AS required_pairs(table_name, legacy_name, canonical_name)
           LEFT JOIN pg_catalog.pg_constraint legacy ON legacy.conrelid = ('public.' || required_pairs.table_name)::regclass AND legacy.conname = required_pairs.legacy_name
           LEFT JOIN pg_catalog.pg_constraint canonical ON canonical.conrelid = ('public.' || required_pairs.table_name)::regclass AND canonical.conname = required_pairs.canonical_name
           WHERE canonical.oid IS NULL OR (legacy.oid IS NULL AND canonical.oid IS NULL)
         )
       THEN 'READY' ELSE 'BLOCKED' END AS state;
