-- ROLLBACK ASSISTIDO DA 0005. Nao executar sem revisar o guard e o snapshot.
-- O rollback nunca apaga keywords, listas, marcas ou usuarios e nunca altera lista_id.
-- Policies permissivas antigas nao sao restauradas automaticamente.
-- Grants anteriores de PUBLIC/anon/authenticated sao restaurados somente a
-- partir do catalogo capturado no guard; postgres e service_role nao sao tocados.

BEGIN;

DO $$
DECLARE g record;
DECLARE current_brand_ids uuid[];
DECLARE current_list_ids uuid[];
DECLARE current_keyword_ids uuid[];
DECLARE current_membership_ids uuid[];
DECLARE expected_membership_ids uuid[];
DECLARE current_permission_keys text[];
DECLARE expected_permission_keys text[];
DECLARE owner_permission_keys text[];
DECLARE current_lista_id_fingerprint text;
BEGIN
  IF to_regclass('public.tenant_0005_migration_guard') IS NULL THEN
    RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: guard da migration ausente; use rollback manual com snapshot';
  END IF;
  SELECT * INTO g FROM public.tenant_0005_migration_guard WHERE migration_key = '0005_tenant_ownership_and_rls' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: guard da migration nao encontrado';
  END IF;

  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) INTO current_brand_ids FROM public.marcas;
  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) INTO current_list_ids FROM public.listas_kgr;
  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) INTO current_keyword_ids FROM public.keywords_kgr;
  IF current_brand_ids <> g.brand_ids OR current_list_ids <> g.list_ids OR current_keyword_ids <> g.keyword_ids THEN
    RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: existem marcas, listas ou keywords novas/ausentes desde a migration';
  END IF;
  IF (SELECT count(*) FROM public.keywords_kgr) <> g.keywords_count OR (SELECT count(*) FROM public.listas_kgr) <> g.lists_count THEN
    RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: contagens de dados nao correspondem ao guard';
  END IF;
  IF (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL) <> g.keywords_without_list OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL) <> g.keywords_with_list THEN
    RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: lista_id foi alterado depois da migration';
  END IF;
  SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), '')) INTO current_lista_id_fingerprint
  FROM public.keywords_kgr k;
  IF g.lista_id_fingerprint IS NULL OR g.lista_id_fingerprint = '' OR current_lista_id_fingerprint IS DISTINCT FROM g.lista_id_fingerprint THEN
    RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: fingerprint de lista_id nao corresponde ao guard';
  END IF;
  IF EXISTS (SELECT 1 FROM public.keywords_kgr k JOIN public.listas_kgr l ON l.id = k.lista_id WHERE k.brand_id <> l.marca_id) OR EXISTS (SELECT 1 FROM public.keywords_kgr WHERE lista_id IS NULL AND brand_id <> '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid) THEN
    RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: brand_id foi alterado ou esta inconsistente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.marcas WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND owner_user_id IS DISTINCT FROM 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid) THEN
    RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: owner da Adalba foi alterado';
  END IF;

  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) INTO current_membership_ids FROM public.brand_memberships;
  IF g.membership_table_existed THEN
    IF g.membership_columns_preexisting THEN
      RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: membership ja possuia colunas canonicas; rollback assistido necessario';
    END IF;
    IF g.owner_membership_existed THEN
      RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: membership owner ja existia antes; valores anteriores exigem restauracao assistida';
    END IF;
    expected_membership_ids := array_append(g.membership_ids, g.owner_membership_id);
    SELECT coalesce(array_agg(v.value ORDER BY v.value), '{}'::uuid[]) INTO expected_membership_ids FROM unnest(expected_membership_ids) AS v(value);
    IF current_membership_ids <> expected_membership_ids THEN
      RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: memberships novas ou ausentes desde a migration';
    END IF;
  ELSE
    IF current_membership_ids <> ARRAY[g.owner_membership_id]::uuid[] THEN
      RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: membership criada pela 0005 foi alterada ou recebeu novos registros';
    END IF;
  END IF;

  IF g.permissions_table_existed THEN
    SELECT coalesce(array_agg(membership_id::text || ':' || module || ':' || action ORDER BY membership_id, module, action), '{}'::text[]) INTO current_permission_keys FROM public.brand_member_permissions;
    SELECT coalesce(array_agg(v.value ORDER BY v.value), '{}'::text[]) INTO expected_permission_keys FROM unnest(g.permission_keys) AS v(value);
    SELECT coalesce(array_agg(membership_id::text || ':' || module || ':' || action ORDER BY membership_id, module, action), '{}'::text[]) INTO owner_permission_keys
    FROM public.brand_member_permissions
    WHERE membership_id = g.owner_membership_id;
    IF current_permission_keys <> (SELECT coalesce(array_agg(merged.value ORDER BY merged.value), '{}'::text[]) FROM (SELECT v.value FROM unnest(g.permission_keys) AS v(value) UNION SELECT v.value FROM unnest(owner_permission_keys) AS v(value)) merged) THEN
      RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: permissoes novas ou ausentes desde a migration';
    END IF;
  ELSE
    IF (SELECT count(*) FROM public.brand_member_permissions) <> 63 THEN
      RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: tabela de permissoes criada pela 0005 recebeu dados adicionais';
    END IF;
  END IF;
END $$;

DO $$
DECLARE g record;
DECLARE grant_key text;
DECLARE parts text[];
DECLARE table_name text;
DECLARE grantee text;
DECLARE privilege text;
BEGIN
  SELECT * INTO g FROM public.tenant_0005_migration_guard WHERE migration_key = '0005_tenant_ownership_and_rls';
  REVOKE ALL PRIVILEGES ON TABLE public.marcas, public.perfis, public.listas_kgr, public.keywords_kgr, public.brand_roles, public.brand_memberships, public.brand_member_permissions FROM PUBLIC, anon, authenticated;
  FOREACH grant_key IN ARRAY coalesce(g.table_grant_keys, '{}'::text[]) LOOP
    parts := string_to_array(grant_key, ':');
    IF coalesce(array_length(parts, 1), 0) <> 3 THEN
      RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: grant capturado invalido';
    END IF;
    table_name := parts[1];
    grantee := parts[2];
    privilege := parts[3];
    IF table_name NOT IN ('marcas','perfis','listas_kgr','keywords_kgr','brand_roles','brand_memberships','brand_member_permissions')
      OR grantee NOT IN ('PUBLIC','anon','authenticated')
      OR privilege NOT IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER') THEN
      RAISE EXCEPTION 'TENANT_0005_ROLLBACK_BLOCKED: grant capturado fora da allowlist';
    END IF;
    IF grantee = 'PUBLIC' THEN
      EXECUTE format('GRANT %s ON TABLE public.%I TO PUBLIC', privilege, table_name);
    ELSE
      EXECUTE format('GRANT %s ON TABLE public.%I TO %I', privilege, table_name, grantee);
    END IF;
  END LOOP;
END $$;

-- Remove somente policies criadas pela 0005. A policy permissiva antiga nao e
-- recriada automaticamente, para nao reabrir acesso cruzado entre marcas.
DROP POLICY IF EXISTS tenant_0005_marcas_select ON public.marcas;
DROP POLICY IF EXISTS tenant_0005_marcas_insert ON public.marcas;
DROP POLICY IF EXISTS tenant_0005_marcas_update ON public.marcas;
DROP POLICY IF EXISTS tenant_0005_marcas_delete ON public.marcas;
DROP POLICY IF EXISTS tenant_0005_listas_select ON public.listas_kgr;
DROP POLICY IF EXISTS tenant_0005_listas_insert ON public.listas_kgr;
DROP POLICY IF EXISTS tenant_0005_listas_update ON public.listas_kgr;
DROP POLICY IF EXISTS tenant_0005_listas_delete ON public.listas_kgr;
DROP POLICY IF EXISTS tenant_0005_keywords_select ON public.keywords_kgr;
DROP POLICY IF EXISTS tenant_0005_keywords_insert ON public.keywords_kgr;
DROP POLICY IF EXISTS tenant_0005_keywords_update ON public.keywords_kgr;
DROP POLICY IF EXISTS tenant_0005_keywords_delete ON public.keywords_kgr;
DROP POLICY IF EXISTS tenant_0005_roles_select ON public.brand_roles;
DROP POLICY IF EXISTS tenant_0005_roles_write ON public.brand_roles;
DROP POLICY IF EXISTS tenant_0005_memberships_select ON public.brand_memberships;
DROP POLICY IF EXISTS tenant_0005_memberships_insert ON public.brand_memberships;
DROP POLICY IF EXISTS tenant_0005_memberships_update ON public.brand_memberships;
DROP POLICY IF EXISTS tenant_0005_memberships_delete ON public.brand_memberships;
DROP POLICY IF EXISTS tenant_0005_permissions_select ON public.brand_member_permissions;
DROP POLICY IF EXISTS tenant_0005_permissions_write ON public.brand_member_permissions;

DROP TRIGGER IF EXISTS trg_tenant_0005_validate_keyword_brand ON public.keywords_kgr;
DROP TRIGGER IF EXISTS trg_tenant_0005_protect_owner_change ON public.marcas;
DROP TRIGGER IF EXISTS trg_tenant_0005_protect_last_owner ON public.brand_memberships;
DROP FUNCTION IF EXISTS public.tenant_0005_validate_keyword_brand();
DROP FUNCTION IF EXISTS public.tenant_0005_protect_owner_change();
DROP FUNCTION IF EXISTS public.tenant_0005_protect_last_owner();
DROP FUNCTION IF EXISTS public.tenant_actor_has_permission(uuid,text,text);
DROP FUNCTION IF EXISTS public.can_access_list(uuid);
DROP FUNCTION IF EXISTS public.can_manage_brand(uuid);
DROP FUNCTION IF EXISTS public.can_access_brand(uuid);
DROP FUNCTION IF EXISTS public.is_global_admin();

ALTER TABLE public.keywords_kgr DROP CONSTRAINT IF EXISTS fk_keywords_kgr_lista_brand_0005;
ALTER TABLE public.keywords_kgr DROP CONSTRAINT IF EXISTS fk_keywords_kgr_lista_0005;
ALTER TABLE public.keywords_kgr DROP CONSTRAINT IF EXISTS fk_keywords_kgr_brand_0005;
ALTER TABLE public.listas_kgr DROP CONSTRAINT IF EXISTS uq_listas_kgr_id_marca_0005;
ALTER TABLE public.listas_kgr DROP CONSTRAINT IF EXISTS fk_listas_kgr_marca_0005;
ALTER TABLE public.marcas DROP CONSTRAINT IF EXISTS fk_marcas_owner_user_0005;
ALTER TABLE public.marcas DROP CONSTRAINT IF EXISTS ck_marcas_status_0005;
ALTER TABLE public.brand_memberships DROP CONSTRAINT IF EXISTS fk_brand_memberships_member_user_0005;
ALTER TABLE public.brand_memberships DROP CONSTRAINT IF EXISTS fk_brand_memberships_invited_by_0005;
ALTER TABLE public.brand_memberships DROP CONSTRAINT IF EXISTS fk_brand_memberships_role_0005;
ALTER TABLE public.brand_memberships DROP CONSTRAINT IF EXISTS fk_brand_memberships_marca_0005;
ALTER TABLE public.brand_memberships DROP CONSTRAINT IF EXISTS ck_brand_memberships_status_0005;
ALTER TABLE public.brand_memberships DROP CONSTRAINT IF EXISTS ck_brand_memberships_role_0005;
ALTER TABLE public.brand_member_permissions DROP CONSTRAINT IF EXISTS ck_brand_member_permissions_module_0005;
ALTER TABLE public.brand_member_permissions DROP CONSTRAINT IF EXISTS ck_brand_member_permissions_action_0005;

DROP INDEX IF EXISTS public.ix_keywords_kgr_brand_0005;
DROP INDEX IF EXISTS public.ix_listas_kgr_marca_0005;
DROP INDEX IF EXISTS public.ix_marcas_owner_user_id_0005;
DROP INDEX IF EXISTS public.ix_brand_memberships_user_status_0005;
DROP INDEX IF EXISTS public.uq_brand_memberships_member_user_0005;
DROP INDEX IF EXISTS public.uq_brand_memberships_legacy_key_0005;
DROP INDEX IF EXISTS public.uq_brand_roles_scope_slug_0005;

DO $$
DECLARE g record;
BEGIN
  SELECT * INTO g FROM public.tenant_0005_migration_guard WHERE migration_key = '0005_tenant_ownership_and_rls';
  IF NOT g.membership_table_existed THEN
    DROP TABLE public.brand_member_permissions;
    DROP TABLE public.brand_memberships;
  ELSE
    IF NOT g.permissions_table_existed THEN
      DROP TABLE public.brand_member_permissions;
    ELSE
      DELETE FROM public.brand_member_permissions WHERE membership_id = g.owner_membership_id AND NOT (membership_id::text || ':' || module || ':' || action = ANY(g.permission_keys));
    END IF;
    DELETE FROM public.brand_memberships WHERE id = g.owner_membership_id;
    ALTER TABLE public.brand_memberships DROP COLUMN IF EXISTS invited_by;
    ALTER TABLE public.brand_memberships DROP COLUMN IF EXISTS permissions;
    ALTER TABLE public.brand_memberships DROP COLUMN IF EXISTS role;
    ALTER TABLE public.brand_memberships DROP COLUMN IF EXISTS member_user_id;
  END IF;
  IF NOT g.roles_table_existed THEN
    DROP TABLE public.brand_roles;
  ELSIF NOT g.owner_role_existed THEN
    IF g.membership_table_existed THEN
      DELETE FROM public.brand_roles WHERE marca_id IS NULL AND slug = 'owner' AND NOT EXISTS (SELECT 1 FROM public.brand_memberships WHERE role_id = brand_roles.id);
    ELSE
      DELETE FROM public.brand_roles WHERE marca_id IS NULL AND slug = 'owner';
    END IF;
  END IF;
END $$;

DO $$
DECLARE g record;
BEGIN
  SELECT * INTO g FROM public.tenant_0005_migration_guard WHERE migration_key = '0005_tenant_ownership_and_rls';
  IF NOT g.owner_column_existed THEN ALTER TABLE public.marcas DROP COLUMN IF EXISTS owner_user_id; END IF;
  IF NOT g.status_column_existed THEN ALTER TABLE public.marcas DROP COLUMN IF EXISTS status; END IF;
  IF NOT g.updated_at_column_existed THEN ALTER TABLE public.marcas DROP COLUMN IF EXISTS updated_at; END IF;
  IF NOT g.keyword_brand_column_existed THEN ALTER TABLE public.keywords_kgr DROP COLUMN IF EXISTS brand_id; END IF;
  IF NOT g.lists_marca_was_not_null THEN ALTER TABLE public.listas_kgr ALTER COLUMN marca_id DROP NOT NULL; END IF;
  DROP TABLE public.tenant_0005_migration_guard;
END $$;

COMMIT;
