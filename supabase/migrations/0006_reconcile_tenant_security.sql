-- RECONCILIACAO LOCAL POS-0005. NAO APLICAR SEM REVISAR O DRY-RUN.
-- Esta migration nao altera dados operacionais, keywords, listas, owner ou memberships.

BEGIN;

SET LOCAL lock_timeout = '10s';
LOCK TABLE
  public.marcas,
  public.listas_kgr,
  public.keywords_kgr,
  public.brand_roles,
  public.brand_memberships,
  public.brand_member_permissions
IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('public.marcas') IS NULL
    OR to_regclass('public.listas_kgr') IS NULL
    OR to_regclass('public.keywords_kgr') IS NULL
    OR to_regclass('public.brand_memberships') IS NULL
    OR to_regclass('public.brand_member_permissions') IS NULL THEN
    RAISE EXCEPTION 'TENANT_0006_PRECONDITION: estrutura da 0005 ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'brand_id')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marcas' AND column_name = 'owner_user_id') THEN
    RAISE EXCEPTION 'TENANT_0006_PRECONDITION: colunas tenantizadas ausentes';
  END IF;
  IF (SELECT count(*) FROM public.keywords_kgr) <> 147
    OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL) <> 126
    OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL) <> 21 THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: contagem de keywords divergente';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.keywords_kgr k
    JOIN public.listas_kgr l ON l.id = k.lista_id
    WHERE k.lista_id IS NOT NULL AND k.brand_id <> l.marca_id
  ) THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: divergencia keyword/lista';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.marcas
    WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
      AND owner_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid
  ) THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: owner da Adalba ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.brand_memberships
    WHERE marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
      AND member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid
      AND role = 'owner'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: membership owner ausente';
  END IF;
END $$;

CREATE TEMP TABLE pg_temp.tenant_0006_snapshot (
  snapshot_key text PRIMARY KEY,
  snapshot_value bigint,
  snapshot_text text
) ON COMMIT DROP;

INSERT INTO pg_temp.tenant_0006_snapshot (snapshot_key, snapshot_value, snapshot_text)
VALUES
  ('keyword_count', (SELECT count(*) FROM public.keywords_kgr), NULL),
  ('list_count', (SELECT count(*) FROM public.listas_kgr), NULL),
  ('keywords_without_list', (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL), NULL),
  ('keywords_with_list', (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL), NULL),
  ('lista_id_fingerprint', NULL, (SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), '')) FROM public.keywords_kgr k)),
  ('brand_id_fingerprint', NULL, (SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.brand_id::text, '<NULL>'), '|' ORDER BY k.id), '')) FROM public.keywords_kgr k));

CREATE TEMP TABLE pg_temp.tenant_0006_function_snapshot (
  function_signature text PRIMARY KEY,
  function_definition text NOT NULL,
  search_path_normalized text NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  function_signature text;
  function_name name;
  function_oid oid;
  function_count integer;
  function_schema name;
  function_return oid;
  function_language name;
  function_definition text;
  search_path_normalized text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.is_global_admin()',
    'public.can_access_brand(uuid)',
    'public.can_manage_brand(uuid)',
    'public.can_access_list(uuid)',
    'public.tenant_actor_has_permission(uuid,text,text)'
  ] LOOP
    function_name := split_part(split_part(function_signature, '.', 2), '(', 1);
    SELECT count(*)
    INTO function_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = function_name;
    IF function_count <> 1 THEN
      RAISE EXCEPTION 'TENANT_0006_PRECONDITION: assinatura inesperada ou sobrecarga em %', function_signature;
    END IF;

    SELECT p.oid,
           n.nspname,
           p.prorettype,
           l.lanname,
           pg_get_functiondef(p.oid),
           (
             SELECT regexp_replace(
               lower(substring(config_value from position('=' in config_value) + 1)),
               '\s+',
               '',
               'g'
             )
             FROM unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
             WHERE lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
             LIMIT 1
           )
    INTO function_oid,
         function_schema,
         function_return,
         function_language,
         function_definition,
         search_path_normalized
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE p.oid = to_regprocedure(function_signature);

    IF function_oid IS NULL THEN
      RAISE EXCEPTION 'TENANT_0006_PRECONDITION: funcao ausente %', function_signature;
    END IF;
    IF function_schema <> 'public' OR function_return <> 'boolean'::regtype OR function_language <> 'sql' THEN
      RAISE EXCEPTION 'TENANT_0006_PRECONDITION: assinatura, schema, retorno ou linguagem inesperados em %', function_signature;
    END IF;
    IF function_definition IS NULL OR search_path_normalized IS NULL THEN
      RAISE EXCEPTION 'TENANT_0006_PRECONDITION: definicao catalogada ausente em %', function_signature;
    END IF;
    IF search_path_normalized NOT IN ('public,pg_temp', 'pg_catalog,public,pg_temp') THEN
      RAISE EXCEPTION 'TENANT_0006_PRECONDITION: search_path nao catalogado em %: %', function_signature, search_path_normalized;
    END IF;

    INSERT INTO pg_temp.tenant_0006_function_snapshot (function_signature, function_definition, search_path_normalized)
    VALUES (function_signature, function_definition, search_path_normalized);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.perfis p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_brand(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.marcas b
      WHERE b.id = target_brand_id
        AND (
          public.is_global_admin()
          OR (
            b.status = 'active'
            AND (
              b.owner_user_id = auth.uid()
              OR EXISTS (
                SELECT 1
                FROM public.brand_memberships m
                WHERE m.marca_id = b.id
                  AND m.member_user_id = auth.uid()
                  AND m.status = 'active'
              )
              OR EXISTS (
                SELECT 1
                FROM public.brand_memberships m
                WHERE m.marca_id = b.id
                  AND m.status = 'active'
                  AND nullif(btrim(m.user_key), '') IS NOT NULL
                  AND nullif(btrim(auth.jwt() ->> 'email'), '') IS NOT NULL
                  AND lower(btrim(m.user_key)) = lower(btrim(auth.jwt() ->> 'email'))
              )
            )
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_brand(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.is_global_admin()
      OR EXISTS (
        SELECT 1 FROM public.marcas b
        WHERE b.id = target_brand_id
          AND b.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.brand_memberships m
        WHERE m.marca_id = target_brand_id
          AND m.member_user_id = auth.uid()
          AND m.status = 'active'
          AND m.role IN ('owner', 'brand_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.brand_memberships m
        JOIN public.brand_member_permissions p ON p.membership_id = m.id AND p.granted
        WHERE m.marca_id = target_brand_id
          AND m.member_user_id = auth.uid()
          AND m.status = 'active'
          AND p.module = 'marca'
          AND p.action = 'manage'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.tenant_actor_has_permission(target_brand_id uuid, requested_module text, requested_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.can_access_brand(target_brand_id)
    AND (
      public.is_global_admin()
      OR EXISTS (
        SELECT 1 FROM public.marcas b
        WHERE b.id = target_brand_id
          AND b.owner_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.brand_memberships m
        WHERE m.marca_id = target_brand_id
          AND m.member_user_id = auth.uid()
          AND m.status = 'active'
          AND m.role IN ('owner', 'brand_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.brand_memberships m
        JOIN public.brand_member_permissions p ON p.membership_id = m.id AND p.granted
        WHERE m.marca_id = target_brand_id
          AND m.member_user_id = auth.uid()
          AND m.status = 'active'
          AND p.module = requested_module
          AND p.action = requested_action
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_list(target_list_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.listas_kgr l
      WHERE l.id = target_list_id
        AND public.can_access_brand(l.marca_id)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_global_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_global_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_brand(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_brand(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_brand(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_brand(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_list(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_list(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_global_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_brand(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_brand(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_list(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) TO service_role;

DROP POLICY IF EXISTS tenant_0005_listas_insert ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_insert
  ON public.listas_kgr FOR INSERT TO authenticated
  WITH CHECK (public.tenant_actor_has_permission(marca_id, 'minerador', 'create'));
DROP POLICY IF EXISTS tenant_0005_listas_update ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_update
  ON public.listas_kgr FOR UPDATE TO authenticated
  USING (public.tenant_actor_has_permission(marca_id, 'minerador', 'edit'))
  WITH CHECK (public.tenant_actor_has_permission(marca_id, 'minerador', 'edit'));
DROP POLICY IF EXISTS tenant_0005_listas_delete ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_delete
  ON public.listas_kgr FOR DELETE TO authenticated
  USING (public.tenant_actor_has_permission(marca_id, 'minerador', 'manage'));

DO $$
DECLARE
  pair record;
  legacy_oid oid;
  canonical_oid oid;
  equivalent boolean;
  target_pair_exact boolean;
  legacy_definition text;
  canonical_definition text;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('brand_memberships', 'brand_memberships_marca_id_fkey', 'fk_brand_memberships_marca_0005'),
      ('brand_memberships', 'brand_memberships_role_id_fkey', 'fk_brand_memberships_role_0005'),
      ('keywords_kgr', 'keywords_kgr_lista_id_fkey', 'fk_keywords_kgr_lista_0005'),
      ('listas_kgr', 'listas_kgr_marca_id_fkey', 'fk_listas_kgr_marca_0005')
    ) AS pairs(table_name, legacy_name, canonical_name)
  LOOP
    SELECT c.oid INTO legacy_oid
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = ('public.' || pair.table_name)::regclass
      AND c.conname = pair.legacy_name;
    SELECT c.oid INTO canonical_oid
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = ('public.' || pair.table_name)::regclass
      AND c.conname = pair.canonical_name;

    IF legacy_oid IS NULL THEN
      CONTINUE;
    END IF;
    IF canonical_oid IS NULL THEN
      RAISE EXCEPTION 'TENANT_0006_CONFLICT: constraint canonica ausente para %', pair.legacy_name;
    END IF;

    IF pair.table_name = 'keywords_kgr'
      AND pair.legacy_name = 'keywords_kgr_lista_id_fkey'
      AND pair.canonical_name = 'fk_keywords_kgr_lista_0005' THEN
      SELECT COALESCE(bool_and(
        legacy.contype = 'f'
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
      ), false)
      INTO target_pair_exact
      FROM pg_catalog.pg_constraint legacy
      JOIN pg_catalog.pg_constraint canonical ON canonical.oid = canonical_oid
      WHERE legacy.oid = legacy_oid;

      IF NOT target_pair_exact THEN
        SELECT pg_get_constraintdef(legacy_oid, true), pg_get_constraintdef(canonical_oid, true)
        INTO legacy_definition, canonical_definition;
        RAISE NOTICE 'TENANT_0006_DIAGNOSTIC: legacy=% canonical=%', legacy_definition, canonical_definition;
        RAISE EXCEPTION 'TENANT_0006_CONFLICT: FK lista_id nao corresponde ao catalogo CASCADE/RESTRICT esperado';
      END IF;

      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', pair.table_name, pair.legacy_name);
      CONTINUE;
    END IF;

    SELECT
      legacy.contype IS NOT DISTINCT FROM canonical.contype
      AND legacy.conrelid IS NOT DISTINCT FROM canonical.conrelid
      AND legacy.confrelid IS NOT DISTINCT FROM canonical.confrelid
      AND legacy.conkey IS NOT DISTINCT FROM canonical.conkey
      AND legacy.confkey IS NOT DISTINCT FROM canonical.confkey
      AND legacy.confdeltype IS NOT DISTINCT FROM canonical.confdeltype
      AND legacy.confupdtype IS NOT DISTINCT FROM canonical.confupdtype
      AND legacy.condeferrable IS NOT DISTINCT FROM canonical.condeferrable
      AND legacy.condeferred IS NOT DISTINCT FROM canonical.condeferred
      AND legacy.convalidated IS NOT DISTINCT FROM canonical.convalidated
      AND pg_get_constraintdef(legacy.oid, true) IS NOT DISTINCT FROM pg_get_constraintdef(canonical.oid, true)
    INTO equivalent
    FROM pg_catalog.pg_constraint legacy
    JOIN pg_catalog.pg_constraint canonical ON canonical.oid = canonical_oid
    WHERE legacy.oid = legacy_oid;

    IF NOT equivalent THEN
      RAISE NOTICE 'TENANT_0006_NOTICE: constraints % e % possuem definicoes diferentes e foram preservadas', pair.legacy_name, pair.canonical_name;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', pair.table_name, pair.legacy_name);
  END LOOP;
END $$;

DO $$
DECLARE
  function_def text;
  function_name text;
  function_signature text;
  search_path_normalized text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY['is_global_admin', 'can_access_brand', 'can_manage_brand', 'can_access_list', 'tenant_actor_has_permission'] LOOP
    function_signature := CASE function_name
      WHEN 'is_global_admin' THEN 'public.is_global_admin()'
      WHEN 'can_access_brand' THEN 'public.can_access_brand(uuid)'
      WHEN 'can_manage_brand' THEN 'public.can_manage_brand(uuid)'
      WHEN 'can_access_list' THEN 'public.can_access_list(uuid)'
      ELSE 'public.tenant_actor_has_permission(uuid,text,text)'
    END;
    IF to_regprocedure(function_signature) IS NULL THEN
      RAISE EXCEPTION 'TENANT_0006_CONFLICT: funcao ausente %', function_signature;
    END IF;
    SELECT pg_get_functiondef(to_regprocedure(function_signature)) INTO function_def;
    SELECT regexp_replace(
             lower(substring(config_value from position('=' in config_value) + 1)),
             '\s+',
             '',
             'g'
           )
    INTO search_path_normalized
    FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL unnest(coalesce(p.proconfig, '{}'::text[])) AS config_value
    WHERE p.oid = to_regprocedure(function_signature)
      AND lower(regexp_replace(config_value, '\s+', '', 'g')) LIKE 'search_path=%'
    LIMIT 1;
    IF search_path_normalized IS DISTINCT FROM 'pg_catalog,public,pg_temp' THEN
      RAISE EXCEPTION 'TENANT_0006_CONFLICT: search_path inseguro em %', function_signature;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(to_regprocedure('public.can_access_brand(uuid)')) INTO function_def;
  IF function_def ILIKE '%coalesce(m.user_key%' OR function_def ILIKE '%coalesce(auth.jwt%' OR function_def NOT ILIKE '%auth.uid() IS NOT NULL%' THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: fallback legado inseguro permanece em can_access_brand';
  END IF;

  IF has_function_privilege('anon', 'public.is_global_admin()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.can_access_brand(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.can_manage_brand(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.can_access_list(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.tenant_actor_has_permission(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: anon ainda executa funcao tenantizada';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.is_global_admin()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.can_access_brand(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.can_manage_brand(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.can_access_list(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.tenant_actor_has_permission(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: authenticated sem execute em funcao tenantizada';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.is_global_admin()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.can_access_brand(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.can_manage_brand(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.can_access_list(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.tenant_actor_has_permission(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: service_role sem execute preservado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_insert' AND with_check ILIKE '%minerador%' AND with_check ILIKE '%create%')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_update' AND coalesce(qual, '') ILIKE '%minerador%' AND coalesce(with_check, '') ILIKE '%minerador%' AND coalesce(with_check, '') ILIKE '%edit%')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'listas_kgr' AND policyname = 'tenant_0005_listas_delete' AND qual ILIKE '%minerador%' AND qual ILIKE '%manage%') THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: policies de listas nao usam minerador';
  END IF;

  IF EXISTS (SELECT 1 FROM public.keywords_kgr k JOIN public.listas_kgr l ON l.id = k.lista_id WHERE k.lista_id IS NOT NULL AND k.brand_id <> l.marca_id)
    OR (SELECT count(*) FROM public.keywords_kgr) <> (SELECT snapshot_value FROM pg_temp.tenant_0006_snapshot WHERE snapshot_key = 'keyword_count')
    OR (SELECT count(*) FROM public.listas_kgr) <> (SELECT snapshot_value FROM pg_temp.tenant_0006_snapshot WHERE snapshot_key = 'list_count')
    OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL) <> (SELECT snapshot_value FROM pg_temp.tenant_0006_snapshot WHERE snapshot_key = 'keywords_without_list')
    OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL) <> (SELECT snapshot_value FROM pg_temp.tenant_0006_snapshot WHERE snapshot_key = 'keywords_with_list')
    OR (SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), '')) FROM public.keywords_kgr k) IS DISTINCT FROM (SELECT snapshot_text FROM pg_temp.tenant_0006_snapshot WHERE snapshot_key = 'lista_id_fingerprint')
    OR (SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.brand_id::text, '<NULL>'), '|' ORDER BY k.id), '')) FROM public.keywords_kgr k) IS DISTINCT FROM (SELECT snapshot_text FROM pg_temp.tenant_0006_snapshot WHERE snapshot_key = 'brand_id_fingerprint')
    OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'lista_id' AND is_nullable <> 'YES')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.keywords_kgr'::regclass AND conname = 'keywords_kgr_lista_id_fkey')
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'public.keywords_kgr'::regclass
        AND c.conname = 'fk_keywords_kgr_lista_0005'
        AND c.contype = 'f'
        AND c.confrelid = 'public.listas_kgr'::regclass
        AND c.confdeltype = 'r'
        AND c.confupdtype = 'a'
        AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[]
        AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[]
        AND NOT c.condeferrable
        AND NOT c.condeferred
        AND c.convalidated
    ) THEN
    RAISE EXCEPTION 'TENANT_0006_CONFLICT: dados tenantizados divergentes';
  END IF;
  RAISE NOTICE 'TENANT_0006_READY: funcoes, grants, policies e constraints reconciliados sem alterar dados';
END $$;

-- Todas as validacoes criticas terminam antes do COMMIT; nao existe epilogo executavel.
COMMIT;
