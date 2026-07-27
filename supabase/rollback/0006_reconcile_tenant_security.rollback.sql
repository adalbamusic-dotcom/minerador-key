-- ROLLBACK ASSISTIDO DA 0006. NAO EXECUTAR SEM REVISAR O CATALOGO.
-- Nao altera dados, keywords, lista_id, brand_id, owner ou memberships.

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

CREATE TEMP TABLE pg_temp.tenant_0006_rollback_snapshot (
  snapshot_key text PRIMARY KEY,
  snapshot_value bigint,
  snapshot_text text
) ON COMMIT DROP;

INSERT INTO pg_temp.tenant_0006_rollback_snapshot (snapshot_key, snapshot_value, snapshot_text)
VALUES
  ('keyword_count', (SELECT count(*) FROM public.keywords_kgr), NULL),
  ('list_count', (SELECT count(*) FROM public.listas_kgr), NULL),
  ('keywords_without_list', (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL), NULL),
  ('keywords_with_list', (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL), NULL),
  ('lista_id_fingerprint', NULL, (SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), '')) FROM public.keywords_kgr k)),
  ('brand_id_fingerprint', NULL, (SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.brand_id::text, '<NULL>'), '|' ORDER BY k.id), '')) FROM public.keywords_kgr k));

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.can_access_brand(target_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.marcas b
    WHERE b.id = target_brand_id
      AND (public.is_global_admin() OR (
        b.status = 'active' AND (
          b.owner_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.brand_memberships m WHERE m.marca_id = b.id AND m.member_user_id = auth.uid() AND m.status = 'active')
          OR EXISTS (SELECT 1 FROM public.brand_memberships m WHERE m.marca_id = b.id AND lower(coalesce(m.user_key, '')) = lower(coalesce(auth.jwt()->>'email', '')) AND m.status = 'active')
        )
      ))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_brand(target_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_global_admin() OR EXISTS (
    SELECT 1 FROM public.marcas b WHERE b.id = target_brand_id AND b.owner_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.brand_memberships m
    WHERE m.marca_id = target_brand_id AND m.member_user_id = auth.uid() AND m.status = 'active' AND m.role IN ('owner','brand_admin')
  ) OR EXISTS (
    SELECT 1 FROM public.brand_memberships m
    JOIN public.brand_member_permissions p ON p.membership_id = m.id AND p.granted
    WHERE m.marca_id = target_brand_id AND m.member_user_id = auth.uid() AND m.status = 'active' AND p.module = 'marca' AND p.action = 'manage'
  );
$$;

CREATE OR REPLACE FUNCTION public.tenant_actor_has_permission(target_brand_id uuid, requested_module text, requested_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.can_access_brand(target_brand_id) AND (
    public.is_global_admin()
    OR EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = target_brand_id AND b.owner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.brand_memberships m WHERE m.marca_id = target_brand_id AND m.member_user_id = auth.uid() AND m.status = 'active' AND m.role IN ('owner','brand_admin'))
    OR EXISTS (
      SELECT 1 FROM public.brand_memberships m
      JOIN public.brand_member_permissions p ON p.membership_id = m.id AND p.granted
      WHERE m.marca_id = target_brand_id AND m.member_user_id = auth.uid() AND m.status = 'active' AND p.module = requested_module AND p.action = requested_action
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_list(target_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.listas_kgr l WHERE l.id = target_list_id AND public.can_access_brand(l.marca_id));
$$;

REVOKE EXECUTE ON FUNCTION public.is_global_admin() FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.can_access_brand(uuid) FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.can_manage_brand(uuid) FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.can_access_list(uuid) FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_brand(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS tenant_0005_listas_insert ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_insert ON public.listas_kgr FOR INSERT TO authenticated
  WITH CHECK (public.tenant_actor_has_permission(marca_id, 'marca', 'edit'));
DROP POLICY IF EXISTS tenant_0005_listas_update ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_update ON public.listas_kgr FOR UPDATE TO authenticated
  USING (public.tenant_actor_has_permission(marca_id, 'marca', 'edit'))
  WITH CHECK (public.tenant_actor_has_permission(marca_id, 'marca', 'edit'));
DROP POLICY IF EXISTS tenant_0005_listas_delete ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_delete ON public.listas_kgr FOR DELETE TO authenticated
  USING (public.tenant_actor_has_permission(marca_id, 'marca', 'manage'));

DO $$
DECLARE
  function_signature text;
  search_path_normalized text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.is_global_admin()',
    'public.can_access_brand(uuid)',
    'public.can_manage_brand(uuid)',
    'public.can_access_list(uuid)',
    'public.tenant_actor_has_permission(uuid,text,text)'
  ] LOOP
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
    IF search_path_normalized IS DISTINCT FROM 'public,pg_temp' THEN
      RAISE EXCEPTION 'TENANT_0006_ROLLBACK_BLOCKED: search_path legado nao restaurado em %', function_signature;
    END IF;
  END LOOP;
  RAISE NOTICE 'TENANT_0006_ROLLBACK_FUNCTION_SECURITY: search_path legado public,pg_temp restaurado; validacao final da 0006 nao foi aplicada';
END $$;

DO $$
DECLARE
  canonical_oid oid;
  legacy_oid oid;
  canonical_exact boolean;
  legacy_exact boolean;
BEGIN
  SELECT oid INTO canonical_oid
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.keywords_kgr'::regclass
    AND conname = 'fk_keywords_kgr_lista_0005';
  SELECT oid INTO legacy_oid
  FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.keywords_kgr'::regclass
    AND conname = 'keywords_kgr_lista_id_fkey';

  IF canonical_oid IS NULL THEN
    RAISE EXCEPTION 'TENANT_0006_ROLLBACK_BLOCKED: FK canonica RESTRICT ausente';
  END IF;

  SELECT c.contype = 'f'
    AND c.conrelid = 'public.keywords_kgr'::regclass
    AND c.confrelid = 'public.listas_kgr'::regclass
    AND c.confdeltype = 'r'
    AND c.confupdtype = 'a'
    AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[]
    AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[]
    AND NOT c.condeferrable
    AND NOT c.condeferred
    AND c.convalidated
  INTO canonical_exact
  FROM pg_catalog.pg_constraint c
  WHERE c.oid = canonical_oid;
  IF NOT canonical_exact THEN
    RAISE EXCEPTION 'TENANT_0006_ROLLBACK_BLOCKED: FK canonica nao corresponde ao catalogo RESTRICT';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'lista_id' AND is_nullable <> 'YES') THEN
    RAISE EXCEPTION 'TENANT_0006_ROLLBACK_BLOCKED: lista_id deixou de ser nullable';
  END IF;

  IF legacy_oid IS NULL THEN
    ALTER TABLE public.keywords_kgr
      ADD CONSTRAINT keywords_kgr_lista_id_fkey
      FOREIGN KEY (lista_id) REFERENCES public.listas_kgr(id) ON DELETE CASCADE;
  ELSE
    SELECT c.contype = 'f'
      AND c.conrelid = 'public.keywords_kgr'::regclass
      AND c.confrelid = 'public.listas_kgr'::regclass
      AND c.confdeltype = 'c'
      AND c.confupdtype = 'a'
      AND c.conkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.keywords_kgr'::regclass AND a.attname = 'lista_id' AND NOT a.attisdropped)]::smallint[]
      AND c.confkey = ARRAY[(SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.listas_kgr'::regclass AND a.attname = 'id' AND NOT a.attisdropped)]::smallint[]
      AND NOT c.condeferrable
      AND NOT c.condeferred
      AND c.convalidated
    INTO legacy_exact
    FROM pg_catalog.pg_constraint c
    WHERE c.oid = legacy_oid;
    IF NOT legacy_exact THEN
      RAISE EXCEPTION 'TENANT_0006_ROLLBACK_BLOCKED: FK legada existente nao corresponde ao catalogo CASCADE';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.keywords_kgr) IS DISTINCT FROM (SELECT snapshot_value FROM pg_temp.tenant_0006_rollback_snapshot WHERE snapshot_key = 'keyword_count')
    OR (SELECT count(*) FROM public.listas_kgr) IS DISTINCT FROM (SELECT snapshot_value FROM pg_temp.tenant_0006_rollback_snapshot WHERE snapshot_key = 'list_count')
    OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL) IS DISTINCT FROM (SELECT snapshot_value FROM pg_temp.tenant_0006_rollback_snapshot WHERE snapshot_key = 'keywords_without_list')
    OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL) IS DISTINCT FROM (SELECT snapshot_value FROM pg_temp.tenant_0006_rollback_snapshot WHERE snapshot_key = 'keywords_with_list')
    OR (SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), '')) FROM public.keywords_kgr k) IS DISTINCT FROM (SELECT snapshot_text FROM pg_temp.tenant_0006_rollback_snapshot WHERE snapshot_key = 'lista_id_fingerprint')
    OR (SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.brand_id::text, '<NULL>'), '|' ORDER BY k.id), '')) FROM public.keywords_kgr k) IS DISTINCT FROM (SELECT snapshot_text FROM pg_temp.tenant_0006_rollback_snapshot WHERE snapshot_key = 'brand_id_fingerprint') THEN
    RAISE EXCEPTION 'TENANT_0006_ROLLBACK_BLOCKED: dados divergiram durante o rollback';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'TENANT_0006_ROLLBACK_READY: somente funcoes, grants, policies e a FK legada CASCADE foram restaurados';
END $$;
COMMIT;
