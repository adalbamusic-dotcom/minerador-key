-- PROPOSTA LOCAL. NAO APLICAR SEM REVISAR O DRY-RUN E O SNAPSHOT MANUAL.
-- Tenant canonico: marcas.id. Nenhuma operacao deste arquivo foi executada remotamente.
-- Compatibilidade: memberships legadas usam marca_id/user_key/role_id;
-- member_user_id e role sao os campos canonicos adicionados nesta migration.

BEGIN;

-- Janela de manutencao: bloquear mutacoes concorrentes antes de qualquer
-- leitura, fingerprint, tabela temporaria, alteracao ou backfill.
SET LOCAL lock_timeout = '10s';
LOCK TABLE
  public.marcas,
  public.perfis,
  public.listas_kgr,
  public.keywords_kgr
IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('public.marcas') IS NULL
    OR to_regclass('public.perfis') IS NULL
    OR to_regclass('public.listas_kgr') IS NULL
    OR to_regclass('public.keywords_kgr') IS NULL
    OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'TENANT_0005_PRECONDITION: tabelas base ausentes';
  END IF;
END $$;

-- Guard exato e transacional: a migration pode preencher somente brand_id.
-- O par id/lista_id deve permanecer byte-a-byte equivalente ao inicio.
CREATE TEMP TABLE tenant_0005_keyword_list_guard (
  id uuid PRIMARY KEY,
  lista_id uuid
) ON COMMIT DROP;

INSERT INTO pg_temp.tenant_0005_keyword_list_guard(id, lista_id)
SELECT k.id, k.lista_id
FROM public.keywords_kgr k;

CREATE TEMP TABLE tenant_0005_snapshot (
  snapshot_key text PRIMARY KEY,
  snapshot_value bigint NOT NULL,
  snapshot_text text
) ON COMMIT DROP;

INSERT INTO pg_temp.tenant_0005_snapshot(snapshot_key, snapshot_value)
SELECT 'brands', count(*) FROM public.marcas
UNION ALL SELECT 'lists', count(*) FROM public.listas_kgr
UNION ALL SELECT 'keywords', count(*) FROM public.keywords_kgr
UNION ALL SELECT 'keywords_without_list', count(*) FROM public.keywords_kgr WHERE lista_id IS NULL
UNION ALL SELECT 'keywords_with_list', count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL;

INSERT INTO pg_temp.tenant_0005_snapshot(snapshot_key, snapshot_value, snapshot_text)
SELECT 'lista_id_fingerprint', 0,
       md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), ''))
FROM public.keywords_kgr k;

-- Guard persistente para que o rollback seja assistido e reconheca novos
-- registros criados depois desta migration. Nao guarda conteudo de keywords.
CREATE TABLE IF NOT EXISTS public.tenant_0005_migration_guard (
  migration_key text PRIMARY KEY CHECK (migration_key = '0005_tenant_ownership_and_rls'),
  applied_at timestamptz NOT NULL DEFAULT now(),
  brands_count bigint NOT NULL,
  lists_count bigint NOT NULL,
  keywords_count bigint NOT NULL,
  keywords_without_list bigint NOT NULL,
  keywords_with_list bigint NOT NULL,
  brand_ids uuid[] NOT NULL,
  list_ids uuid[] NOT NULL,
  keyword_ids uuid[] NOT NULL,
  membership_table_existed boolean NOT NULL,
  membership_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  membership_columns_preexisting boolean NOT NULL DEFAULT false,
  roles_table_existed boolean NOT NULL,
  permissions_table_existed boolean NOT NULL,
  permission_keys text[] NOT NULL DEFAULT '{}'::text[],
  owner_column_existed boolean NOT NULL DEFAULT false,
  status_column_existed boolean NOT NULL DEFAULT false,
  updated_at_column_existed boolean NOT NULL DEFAULT false,
  keyword_brand_column_existed boolean NOT NULL DEFAULT false,
  lists_marca_was_not_null boolean NOT NULL DEFAULT false,
  owner_role_existed boolean NOT NULL DEFAULT false,
  owner_membership_id uuid,
  owner_membership_existed boolean NOT NULL DEFAULT false,
  lista_id_fingerprint text NOT NULL DEFAULT '',
  table_grant_keys text[] NOT NULL DEFAULT '{}'::text[]
);

ALTER TABLE public.tenant_0005_migration_guard
  ADD COLUMN IF NOT EXISTS lista_id_fingerprint text NOT NULL DEFAULT '';
ALTER TABLE public.tenant_0005_migration_guard
  ADD COLUMN IF NOT EXISTS table_grant_keys text[] NOT NULL DEFAULT '{}'::text[];

DO $$
DECLARE membership_before boolean;
DECLARE roles_before boolean;
DECLARE permissions_before boolean;
DECLARE membership_ids_before uuid[] := '{}'::uuid[];
DECLARE permission_keys_before text[] := '{}'::text[];
DECLARE membership_columns_before boolean;
DECLARE owner_column_before boolean;
DECLARE status_column_before boolean;
DECLARE updated_at_column_before boolean;
DECLARE keyword_brand_column_before boolean;
DECLARE lists_marca_not_null_before boolean;
DECLARE lista_id_fingerprint_before text;
DECLARE table_grant_keys_before text[] := '{}'::text[];
DECLARE brand_ids_before uuid[];
DECLARE list_ids_before uuid[];
DECLARE keyword_ids_before uuid[];
BEGIN
  membership_before := to_regclass('public.brand_memberships') IS NOT NULL;
  roles_before := to_regclass('public.brand_roles') IS NOT NULL;
  permissions_before := to_regclass('public.brand_member_permissions') IS NOT NULL;
  membership_columns_before := membership_before AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand_memberships' AND column_name IN ('member_user_id','role','permissions','invited_by'));
  owner_column_before := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marcas' AND column_name = 'owner_user_id');
  status_column_before := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marcas' AND column_name = 'status');
  updated_at_column_before := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marcas' AND column_name = 'updated_at');
  keyword_brand_column_before := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'brand_id');
  SELECT is_nullable = 'NO' INTO lists_marca_not_null_before FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'listas_kgr' AND column_name = 'marca_id';
  SELECT snapshot_text INTO lista_id_fingerprint_before FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'lista_id_fingerprint';
  SELECT coalesce(array_agg(table_name || ':' || grantee || ':' || privilege_type ORDER BY table_name, grantee, privilege_type), '{}'::text[])
  INTO table_grant_keys_before
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name IN ('marcas','perfis','listas_kgr','keywords_kgr','brand_roles','brand_memberships','brand_member_permissions')
    AND grantee IN ('PUBLIC','anon','authenticated');
  IF membership_before THEN
    EXECUTE 'SELECT coalesce(array_agg(id ORDER BY id), ''{}''::uuid[]) FROM public.brand_memberships' INTO membership_ids_before;
  END IF;
  IF permissions_before THEN
    EXECUTE 'SELECT coalesce(array_agg(membership_id::text || '':'' || module || '':'' || action ORDER BY membership_id, module, action), ''{}''::text[]) FROM public.brand_member_permissions' INTO permission_keys_before;
  END IF;
  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) INTO brand_ids_before FROM public.marcas;
  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) INTO list_ids_before FROM public.listas_kgr;
  SELECT coalesce(array_agg(id ORDER BY id), '{}'::uuid[]) INTO keyword_ids_before FROM public.keywords_kgr;
  INSERT INTO public.tenant_0005_migration_guard(migration_key, brands_count, lists_count, keywords_count, keywords_without_list, keywords_with_list, brand_ids, list_ids, keyword_ids, membership_table_existed, membership_ids, membership_columns_preexisting, roles_table_existed, permissions_table_existed, permission_keys, owner_column_existed, status_column_existed, updated_at_column_existed, keyword_brand_column_existed, lists_marca_was_not_null, lista_id_fingerprint, table_grant_keys)
  SELECT '0005_tenant_ownership_and_rls', snapshot_value, 0, 0, 0, 0, brand_ids_before, list_ids_before, keyword_ids_before, membership_before, membership_ids_before, membership_columns_before, roles_before, permissions_before, permission_keys_before, owner_column_before, status_column_before, updated_at_column_before, keyword_brand_column_before, coalesce(lists_marca_not_null_before, false), lista_id_fingerprint_before, table_grant_keys_before
  FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'brands'
  ON CONFLICT (migration_key) DO NOTHING;
  UPDATE public.tenant_0005_migration_guard g
  SET lists_count = (SELECT snapshot_value FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'lists'),
      keywords_count = (SELECT snapshot_value FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords'),
      keywords_without_list = (SELECT snapshot_value FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords_without_list'),
      keywords_with_list = (SELECT snapshot_value FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords_with_list');
  IF EXISTS (SELECT 1 FROM public.tenant_0005_migration_guard WHERE migration_key = '0005_tenant_ownership_and_rls' AND (brand_ids <> brand_ids_before OR list_ids <> list_ids_before OR keyword_ids <> keyword_ids_before OR permission_keys <> permission_keys_before OR lista_id_fingerprint IS NULL OR lista_id_fingerprint = '' OR lista_id_fingerprint <> lista_id_fingerprint_before)) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: guard existente nao corresponde ao snapshot atual';
  END IF;
END $$;

DO $$
DECLARE
  brand_count bigint;
  keyword_count bigint;
  no_list_count bigint;
  with_list_count bigint;
BEGIN
  SELECT snapshot_value INTO brand_count FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'brands';
  SELECT snapshot_value INTO keyword_count FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords';
  SELECT snapshot_value INTO no_list_count FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords_without_list';
  SELECT snapshot_value INTO with_list_count FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords_with_list';
  IF brand_count <> 1 THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: snapshot esperado possui uma unica marca; encontrado %', brand_count;
  END IF;
  IF keyword_count <> 147 OR no_list_count <> 126 OR with_list_count <> 21 THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: snapshot de keywords divergente; total %, sem lista %, com lista %', keyword_count, no_list_count, with_list_count;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.marcas WHERE id <> '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: existe outra marca; reconciliacao humana necessaria';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marcas WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: marca Adalba nao encontrada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: usuario owner autorizado nao encontrado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.listas_kgr WHERE marca_id IS NULL) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: lista sem marca_id';
  END IF;
  IF EXISTS (SELECT 1 FROM public.listas_kgr l LEFT JOIN public.marcas b ON b.id = l.marca_id WHERE b.id IS NULL) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: lista aponta para marca inexistente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.keywords_kgr k LEFT JOIN public.listas_kgr l ON l.id = k.lista_id WHERE k.lista_id IS NOT NULL AND l.id IS NULL) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: keyword aponta para lista inexistente';
  END IF;
END $$;

ALTER TABLE public.marcas ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.marcas ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.marcas ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE public.marcas SET status = 'active' WHERE status IS NULL;
UPDATE public.marcas SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.marcas ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.marcas ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.marcas ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.marcas ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.marcas WHERE status NOT IN ('active','suspended','inactive')) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: status de marca invalido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.marcas'::regclass AND conname = 'ck_marcas_status_0005') THEN
    ALTER TABLE public.marcas ADD CONSTRAINT ck_marcas_status_0005 CHECK (status IN ('active','suspended','inactive'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.marcas'::regclass AND conname = 'fk_marcas_owner_user_0005') THEN
    ALTER TABLE public.marcas ADD CONSTRAINT fk_marcas_owner_user_0005 FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
DECLARE current_owner uuid;
BEGIN
  SELECT owner_user_id INTO current_owner FROM public.marcas WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid FOR UPDATE;
  IF current_owner IS NOT NULL AND current_owner <> 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: owner da Adalba ja esta definido para outro usuario';
  END IF;
  UPDATE public.marcas
  SET owner_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid,
      updated_at = now()
  WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid;
END $$;

CREATE INDEX IF NOT EXISTS ix_marcas_owner_user_id_0005 ON public.marcas(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Mantem o contrato legado de roles quando a 0002 ja existe e permite um
-- bootstrap seguro se a tabela ainda nao foi criada no ambiente alvo.
CREATE TABLE IF NOT EXISTS public.brand_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid REFERENCES public.marcas(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_roles_scope_slug_0005
  ON public.brand_roles (COALESCE(marca_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

DO $$
BEGIN
  UPDATE public.tenant_0005_migration_guard
  SET owner_role_existed = EXISTS (SELECT 1 FROM public.brand_roles WHERE marca_id IS NULL AND slug = 'owner')
  WHERE migration_key = '0005_tenant_ownership_and_rls';
END $$;

CREATE TABLE IF NOT EXISTS public.brand_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  user_key text,
  role_id uuid REFERENCES public.brand_roles(id) ON DELETE RESTRICT,
  invitation_id uuid,
  member_user_id uuid,
  role text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  invited_by uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_memberships ADD COLUMN IF NOT EXISTS member_user_id uuid;
ALTER TABLE public.brand_memberships ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.brand_memberships ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.brand_memberships ADD COLUMN IF NOT EXISTS invited_by uuid;
ALTER TABLE public.brand_memberships ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.brand_memberships ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.brand_memberships ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.brand_member_permissions (
  membership_id uuid NOT NULL REFERENCES public.brand_memberships(id) ON DELETE RESTRICT,
  module text NOT NULL,
  action text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  granted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, module, action)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brand_memberships'::regclass AND conname = 'fk_brand_memberships_marca_0005') THEN
    ALTER TABLE public.brand_memberships ADD CONSTRAINT fk_brand_memberships_marca_0005 FOREIGN KEY (marca_id) REFERENCES public.marcas(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brand_memberships'::regclass AND conname = 'fk_brand_memberships_member_user_0005') THEN
    ALTER TABLE public.brand_memberships ADD CONSTRAINT fk_brand_memberships_member_user_0005 FOREIGN KEY (member_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brand_memberships'::regclass AND conname = 'fk_brand_memberships_invited_by_0005') THEN
    ALTER TABLE public.brand_memberships ADD CONSTRAINT fk_brand_memberships_invited_by_0005 FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brand_memberships'::regclass AND conname = 'fk_brand_memberships_role_0005') THEN
    ALTER TABLE public.brand_memberships ADD CONSTRAINT fk_brand_memberships_role_0005 FOREIGN KEY (role_id) REFERENCES public.brand_roles(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brand_memberships'::regclass AND conname = 'ck_brand_memberships_status_0005') THEN
    ALTER TABLE public.brand_memberships ADD CONSTRAINT ck_brand_memberships_status_0005 CHECK (status IN ('active','suspended','removed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brand_memberships'::regclass AND conname = 'ck_brand_memberships_role_0005') THEN
    ALTER TABLE public.brand_memberships ADD CONSTRAINT ck_brand_memberships_role_0005 CHECK (role IN ('owner','brand_admin','editor','reviewer','specialist','reader'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brand_member_permissions'::regclass AND conname = 'ck_brand_member_permissions_module_0005') THEN
    ALTER TABLE public.brand_member_permissions ADD CONSTRAINT ck_brand_member_permissions_module_0005 CHECK (module IN ('marca','minerador','arquiteto','radar','planejador','redator','publicacoes','administracao'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.brand_member_permissions'::regclass AND conname = 'ck_brand_member_permissions_action_0005') THEN
    ALTER TABLE public.brand_member_permissions ADD CONSTRAINT ck_brand_member_permissions_action_0005 CHECK (action IN ('view','comment','create','edit','review','approve','export','publish','manage'));
  END IF;
END $$;

UPDATE public.brand_memberships bm
SET member_user_id = u.id
FROM auth.users u
WHERE bm.member_user_id IS NULL
  AND (lower(coalesce(bm.user_key, '')) = lower(coalesce(u.email, '')) OR bm.user_key = u.id::text);

UPDATE public.brand_memberships bm
SET role = CASE WHEN br.slug = 'platform_admin' THEN 'brand_admin' ELSE br.slug END
FROM public.brand_roles br
WHERE bm.role IS NULL AND bm.role_id = br.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.brand_memberships WHERE member_user_id IS NULL) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: membership sem usuario canonico resolvido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.brand_memberships WHERE role IS NULL OR role NOT IN ('owner','brand_admin','editor','reviewer','specialist','reader')) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: role de membership ausente ou invalido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.brand_memberships WHERE status NOT IN ('active','suspended','removed')) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: status de membership invalido';
  END IF;
  IF EXISTS (SELECT marca_id, member_user_id FROM public.brand_memberships GROUP BY marca_id, member_user_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: membership duplicado por marca e usuario';
  END IF;
END $$;

ALTER TABLE public.brand_memberships ALTER COLUMN member_user_id SET NOT NULL;
ALTER TABLE public.brand_memberships ALTER COLUMN role SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_memberships_member_user_0005 ON public.brand_memberships(marca_id, member_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_memberships_legacy_key_0005 ON public.brand_memberships(marca_id, user_key) WHERE user_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_brand_memberships_user_status_0005 ON public.brand_memberships(member_user_id, status);

DO $$
DECLARE owner_role uuid;
DECLARE existing_id uuid;
DECLARE existing_role text;
DECLARE existing_role_slug text;
DECLARE existing_member uuid;
DECLARE existing_status text;
DECLARE owner_count integer;
BEGIN
  SELECT id INTO owner_role FROM public.brand_roles WHERE marca_id IS NULL AND slug = 'owner' LIMIT 1;
  IF owner_role IS NULL THEN
    INSERT INTO public.brand_roles(marca_id, slug, name, description, is_system)
    VALUES (NULL, 'owner', 'Proprietario', 'Owner canonico da marca.', true)
    RETURNING id INTO owner_role;
  END IF;

  SELECT count(*) INTO owner_count FROM public.brand_memberships
  WHERE marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
    AND (member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid OR lower(user_key) = 'adalbapro@gmail.com');
  IF owner_count > 1 THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: mais de um membership candidato ao owner da Adalba';
  END IF;

  SELECT bm.id, bm.role, br.slug, bm.member_user_id, bm.status
  INTO existing_id, existing_role, existing_role_slug, existing_member, existing_status
  FROM public.brand_memberships bm
  LEFT JOIN public.brand_roles br ON br.id = bm.role_id
  WHERE bm.marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
    AND (bm.member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid OR lower(bm.user_key) = 'adalbapro@gmail.com')
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    IF existing_member IS NOT NULL AND existing_member <> 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid THEN
      RAISE EXCEPTION 'TENANT_0005_CONFLICT: membership candidato aponta para usuario diferente';
    END IF;
    IF existing_status NOT IN ('active') THEN
      RAISE EXCEPTION 'TENANT_0005_CONFLICT: membership owner existente nao esta ativo';
    END IF;
    IF existing_role NOT IN ('owner','brand_admin') AND existing_role_slug IS DISTINCT FROM 'platform_admin' THEN
      RAISE EXCEPTION 'TENANT_0005_CONFLICT: membership existente tem role incompativel';
    END IF;
    UPDATE public.brand_memberships
    SET member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid,
        user_key = 'adalbapro@gmail.com',
        role = 'owner',
        role_id = owner_role,
        status = 'active',
        joined_at = coalesce(joined_at, now()),
        updated_at = now()
    WHERE id = existing_id;
  ELSE
    INSERT INTO public.brand_memberships(marca_id, user_key, member_user_id, role_id, role, permissions, status)
    VALUES ('95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid, 'adalbapro@gmail.com', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid, owner_role, 'owner', '{}'::jsonb, 'active');
  END IF;
END $$;

DO $$
DECLARE owner_membership uuid;
DECLARE existed_before boolean;
DECLARE prior_memberships uuid[];
BEGIN
  SELECT id INTO owner_membership
  FROM public.brand_memberships
  WHERE marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
    AND member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid;
  SELECT membership_ids INTO prior_memberships
  FROM public.tenant_0005_migration_guard
  WHERE migration_key = '0005_tenant_ownership_and_rls';
  existed_before := coalesce(owner_membership = ANY(prior_memberships), false);
  UPDATE public.tenant_0005_migration_guard
  SET owner_membership_id = owner_membership,
      owner_membership_existed = coalesce(existed_before, false)
  WHERE migration_key = '0005_tenant_ownership_and_rls';
END $$;

INSERT INTO public.brand_member_permissions(membership_id, module, action, granted, granted_by)
SELECT m.id, modules.module, actions.action, true, 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'
FROM public.brand_memberships m
CROSS JOIN (VALUES ('marca'),('minerador'),('arquiteto'),('radar'),('planejador'),('redator'),('publicacoes')) modules(module)
CROSS JOIN (VALUES ('view'),('comment'),('create'),('edit'),('review'),('approve'),('export'),('publish'),('manage')) actions(action)
WHERE m.marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
  AND m.member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid
ON CONFLICT (membership_id, module, action) DO NOTHING;

ALTER TABLE public.listas_kgr ALTER COLUMN marca_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listas_kgr'::regclass AND conname = 'fk_listas_kgr_marca_0005') THEN
    ALTER TABLE public.listas_kgr ADD CONSTRAINT fk_listas_kgr_marca_0005 FOREIGN KEY (marca_id) REFERENCES public.marcas(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_listas_kgr_marca_0005 ON public.listas_kgr(marca_id);

ALTER TABLE public.keywords_kgr ADD COLUMN IF NOT EXISTS brand_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.keywords_kgr k
    JOIN public.listas_kgr l ON l.id = k.lista_id
    WHERE k.lista_id IS NOT NULL AND k.brand_id IS NOT NULL AND k.brand_id <> l.marca_id
  ) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: brand_id da keyword diverge da marca da lista';
  END IF;
END $$;

UPDATE public.keywords_kgr k
SET brand_id = l.marca_id
FROM public.listas_kgr l
WHERE k.lista_id = l.id AND k.brand_id IS NULL;

-- Reconciliacao humana autorizada para o snapshot atual: keywords sem lista
-- pertencem a Adalba e continuam sem agrupamento.
UPDATE public.keywords_kgr
SET brand_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid
WHERE lista_id IS NULL AND brand_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.keywords_kgr WHERE brand_id IS NULL) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: keyword sem brand_id apos backfill';
  END IF;
  IF EXISTS (SELECT 1 FROM public.keywords_kgr k JOIN public.listas_kgr l ON l.id = k.lista_id WHERE k.lista_id IS NOT NULL AND k.brand_id <> l.marca_id) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: divergencia keyword/lista apos backfill';
  END IF;
END $$;

ALTER TABLE public.keywords_kgr ALTER COLUMN brand_id SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.keywords_kgr'::regclass AND conname = 'fk_keywords_kgr_brand_0005') THEN
    ALTER TABLE public.keywords_kgr ADD CONSTRAINT fk_keywords_kgr_brand_0005 FOREIGN KEY (brand_id) REFERENCES public.marcas(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.keywords_kgr'::regclass AND conname = 'fk_keywords_kgr_lista_0005') THEN
    ALTER TABLE public.keywords_kgr ADD CONSTRAINT fk_keywords_kgr_lista_0005 FOREIGN KEY (lista_id) REFERENCES public.listas_kgr(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_keywords_kgr_brand_0005 ON public.keywords_kgr(brand_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.listas_kgr'::regclass AND conname = 'uq_listas_kgr_id_marca_0005') THEN
    ALTER TABLE public.listas_kgr ADD CONSTRAINT uq_listas_kgr_id_marca_0005 UNIQUE (id, marca_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.keywords_kgr'::regclass AND conname = 'fk_keywords_kgr_lista_brand_0005') THEN
    ALTER TABLE public.keywords_kgr ADD CONSTRAINT fk_keywords_kgr_lista_brand_0005 FOREIGN KEY (lista_id, brand_id) REFERENCES public.listas_kgr(id, marca_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tenant_0005_validate_keyword_brand()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.brand_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_BRAND_REQUIRED: keywords_kgr.brand_id e obrigatorio';
  END IF;
  IF NEW.lista_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.listas_kgr l WHERE l.id = NEW.lista_id AND l.marca_id = NEW.brand_id) THEN
    RAISE EXCEPTION 'TENANT_BRAND_LIST_MISMATCH: keyword e lista pertencem a marcas diferentes';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tenant_0005_validate_keyword_brand ON public.keywords_kgr;
CREATE TRIGGER trg_tenant_0005_validate_keyword_brand
  BEFORE INSERT OR UPDATE OF brand_id, lista_id ON public.keywords_kgr
  FOR EACH ROW EXECUTE FUNCTION public.tenant_0005_validate_keyword_brand();

CREATE OR REPLACE FUNCTION public.tenant_0005_protect_owner_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'TENANT_OWNER_PROTECTED: somente Admin global pode alterar owner_user_id';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_0005_protect_last_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner') OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.status <> 'active')) THEN
    IF (SELECT count(*) FROM public.brand_memberships WHERE marca_id = OLD.marca_id AND role = 'owner' AND status = 'active' AND id <> OLD.id) = 0 THEN
      RAISE EXCEPTION 'TENANT_LAST_OWNER: nao e permitido remover ou desativar o ultimo owner';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tenant_0005_protect_owner_change ON public.marcas;
CREATE TRIGGER trg_tenant_0005_protect_owner_change BEFORE UPDATE OF owner_user_id ON public.marcas FOR EACH ROW EXECUTE FUNCTION public.tenant_0005_protect_owner_change();
DROP TRIGGER IF EXISTS trg_tenant_0005_protect_last_owner ON public.brand_memberships;
CREATE TRIGGER trg_tenant_0005_protect_last_owner BEFORE UPDATE OR DELETE ON public.brand_memberships FOR EACH ROW EXECUTE FUNCTION public.tenant_0005_protect_last_owner();

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

REVOKE ALL ON FUNCTION public.is_global_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_brand(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_brand(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_actor_has_permission(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_list(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_0005_validate_keyword_brand() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_0005_protect_owner_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_0005_protect_last_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_global_admin(), public.can_access_brand(uuid), public.can_manage_brand(uuid), public.tenant_actor_has_permission(uuid,text,text), public.can_access_list(uuid) TO authenticated;

ALTER TABLE public.marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_kgr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords_kgr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_member_permissions ENABLE ROW LEVEL SECURITY;

-- Cria as policies substitutas primeiro. A remocao das policies permissivas
-- antigas ocorre no mesmo bloco transacional logo abaixo.
DROP POLICY IF EXISTS tenant_0005_marcas_select ON public.marcas;
CREATE POLICY tenant_0005_marcas_select ON public.marcas FOR SELECT TO authenticated USING (public.can_access_brand(id));
DROP POLICY IF EXISTS tenant_0005_marcas_insert ON public.marcas;
CREATE POLICY tenant_0005_marcas_insert ON public.marcas FOR INSERT TO authenticated WITH CHECK (public.is_global_admin() OR owner_user_id = auth.uid());
DROP POLICY IF EXISTS tenant_0005_marcas_update ON public.marcas;
CREATE POLICY tenant_0005_marcas_update ON public.marcas FOR UPDATE TO authenticated USING (public.can_manage_brand(id)) WITH CHECK (public.can_manage_brand(id));
DROP POLICY IF EXISTS tenant_0005_marcas_delete ON public.marcas;
CREATE POLICY tenant_0005_marcas_delete ON public.marcas FOR DELETE TO authenticated USING (public.is_global_admin());

DROP POLICY IF EXISTS tenant_0005_listas_select ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_select ON public.listas_kgr FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));
DROP POLICY IF EXISTS tenant_0005_listas_insert ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_insert ON public.listas_kgr FOR INSERT TO authenticated WITH CHECK (public.tenant_actor_has_permission(marca_id, 'marca', 'edit'));
DROP POLICY IF EXISTS tenant_0005_listas_update ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_update ON public.listas_kgr FOR UPDATE TO authenticated USING (public.tenant_actor_has_permission(marca_id, 'marca', 'edit')) WITH CHECK (public.tenant_actor_has_permission(marca_id, 'marca', 'edit'));
DROP POLICY IF EXISTS tenant_0005_listas_delete ON public.listas_kgr;
CREATE POLICY tenant_0005_listas_delete ON public.listas_kgr FOR DELETE TO authenticated USING (public.tenant_actor_has_permission(marca_id, 'marca', 'manage'));

DROP POLICY IF EXISTS tenant_0005_keywords_select ON public.keywords_kgr;
CREATE POLICY tenant_0005_keywords_select ON public.keywords_kgr FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS tenant_0005_keywords_insert ON public.keywords_kgr;
CREATE POLICY tenant_0005_keywords_insert ON public.keywords_kgr FOR INSERT TO authenticated WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'create'));
DROP POLICY IF EXISTS tenant_0005_keywords_update ON public.keywords_kgr;
CREATE POLICY tenant_0005_keywords_update ON public.keywords_kgr FOR UPDATE TO authenticated USING (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit')) WITH CHECK (public.tenant_actor_has_permission(brand_id, 'minerador', 'edit'));
DROP POLICY IF EXISTS tenant_0005_keywords_delete ON public.keywords_kgr;
CREATE POLICY tenant_0005_keywords_delete ON public.keywords_kgr FOR DELETE TO authenticated USING (public.tenant_actor_has_permission(brand_id, 'minerador', 'manage'));

DROP POLICY IF EXISTS tenant_0005_roles_select ON public.brand_roles;
CREATE POLICY tenant_0005_roles_select ON public.brand_roles FOR SELECT TO authenticated USING (marca_id IS NULL OR public.can_access_brand(marca_id));
DROP POLICY IF EXISTS tenant_0005_roles_write ON public.brand_roles;
CREATE POLICY tenant_0005_roles_write ON public.brand_roles FOR ALL TO authenticated USING (marca_id IS NOT NULL AND public.can_manage_brand(marca_id)) WITH CHECK (marca_id IS NOT NULL AND public.can_manage_brand(marca_id));

DROP POLICY IF EXISTS brand_memberships_access ON public.brand_memberships;
DROP POLICY IF EXISTS tenant_0005_memberships_select ON public.brand_memberships;
CREATE POLICY tenant_0005_memberships_select ON public.brand_memberships FOR SELECT TO authenticated USING (public.is_global_admin() OR member_user_id = auth.uid() OR public.can_access_brand(marca_id));
DROP POLICY IF EXISTS tenant_0005_memberships_insert ON public.brand_memberships;
CREATE POLICY tenant_0005_memberships_insert ON public.brand_memberships FOR INSERT TO authenticated WITH CHECK (public.can_manage_brand(marca_id));
DROP POLICY IF EXISTS tenant_0005_memberships_update ON public.brand_memberships;
CREATE POLICY tenant_0005_memberships_update ON public.brand_memberships FOR UPDATE TO authenticated USING (public.can_manage_brand(marca_id)) WITH CHECK (public.can_manage_brand(marca_id));
DROP POLICY IF EXISTS tenant_0005_memberships_delete ON public.brand_memberships;
CREATE POLICY tenant_0005_memberships_delete ON public.brand_memberships FOR DELETE TO authenticated USING (public.can_manage_brand(marca_id));

DROP POLICY IF EXISTS brand_member_permissions_access ON public.brand_member_permissions;
DROP POLICY IF EXISTS tenant_0005_permissions_select ON public.brand_member_permissions;
CREATE POLICY tenant_0005_permissions_select ON public.brand_member_permissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.brand_memberships m WHERE m.id = membership_id AND (public.is_global_admin() OR public.can_access_brand(m.marca_id))));
DROP POLICY IF EXISTS tenant_0005_permissions_write ON public.brand_member_permissions;
CREATE POLICY tenant_0005_permissions_write ON public.brand_member_permissions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.brand_memberships m WHERE m.id = membership_id AND public.can_manage_brand(m.marca_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.brand_memberships m WHERE m.id = membership_id AND public.can_manage_brand(m.marca_id)));

DO $$
DECLARE old_policy record;
BEGIN
  FOR old_policy IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('marcas','listas_kgr','keywords_kgr','brand_memberships','brand_member_permissions')
      AND cmd = 'ALL'
      AND array_to_string(roles, ',') ILIKE '%authenticated%'
      AND (coalesce(qual, '') ILIKE '%auth.role()%authenticated%' OR coalesce(with_check, '') ILIKE '%auth.role()%authenticated%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_policy.policyname, old_policy.tablename);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Permitir acesso total para autenticados" ON public.listas_kgr;
DROP POLICY IF EXISTS "Permitir acesso total para autenticados" ON public.keywords_kgr;

REVOKE ALL PRIVILEGES ON TABLE public.marcas, public.perfis, public.listas_kgr, public.keywords_kgr, public.brand_roles, public.brand_memberships, public.brand_member_permissions FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.marcas, public.listas_kgr, public.keywords_kgr, public.brand_roles, public.brand_memberships, public.brand_member_permissions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marcas, public.listas_kgr, public.keywords_kgr, public.brand_roles, public.brand_memberships, public.brand_member_permissions TO authenticated;

DO $$
DECLARE
  before_keywords bigint;
  before_lists bigint;
  before_no_list bigint;
  before_with_list bigint;
  guard_keywords bigint;
  guard_no_list bigint;
  guard_with_list bigint;
  exact_mismatch_count bigint;
  before_lista_id_fingerprint text;
  current_lista_id_fingerprint text;
BEGIN
  SELECT snapshot_value INTO before_keywords FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords';
  SELECT snapshot_value INTO before_lists FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'lists';
  SELECT snapshot_value INTO before_no_list FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords_without_list';
  SELECT snapshot_value INTO before_with_list FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'keywords_with_list';
  SELECT snapshot_text INTO before_lista_id_fingerprint FROM pg_temp.tenant_0005_snapshot WHERE snapshot_key = 'lista_id_fingerprint';

  SELECT count(*),
         count(*) FILTER (WHERE lista_id IS NULL),
         count(*) FILTER (WHERE lista_id IS NOT NULL)
  INTO guard_keywords, guard_no_list, guard_with_list
  FROM pg_temp.tenant_0005_keyword_list_guard;

  SELECT count(*)
  INTO exact_mismatch_count
  FROM public.keywords_kgr atual
  FULL JOIN pg_temp.tenant_0005_keyword_list_guard inicial
    ON inicial.id = atual.id
  WHERE atual.id IS NULL
     OR inicial.id IS NULL
     OR atual.lista_id IS DISTINCT FROM inicial.lista_id;

  IF exact_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: comparacao exata de id/lista_id encontrou % divergencias', exact_mismatch_count;
  END IF;
  IF (SELECT count(*) FROM public.keywords_kgr) <> guard_keywords
     OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL) <> guard_no_list
     OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL) <> guard_with_list THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: contagem exata de keywords/lista_id divergiu do guard';
  END IF;

  SELECT md5(coalesce(string_agg(k.id::text || '=' || coalesce(k.lista_id::text, '<NULL>'), '|' ORDER BY k.id), '')) INTO current_lista_id_fingerprint
  FROM public.keywords_kgr k;
  IF (SELECT count(*) FROM public.keywords_kgr) <> before_keywords OR (SELECT count(*) FROM public.listas_kgr) <> before_lists THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: total de keywords ou listas mudou';
  END IF;
  IF (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NULL) <> before_no_list OR (SELECT count(*) FROM public.keywords_kgr WHERE lista_id IS NOT NULL) <> before_with_list THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: lista_id foi alterado';
  END IF;
  IF current_lista_id_fingerprint IS DISTINCT FROM before_lista_id_fingerprint THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: fingerprint de lista_id foi alterado; nenhuma troca de lista e aceita';
  END IF;
  IF EXISTS (SELECT 1 FROM public.keywords_kgr WHERE brand_id IS NULL) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: brand_id nulo na validacao final';
  END IF;
  IF EXISTS (SELECT 1 FROM public.keywords_kgr k JOIN public.listas_kgr l ON l.id = k.lista_id WHERE k.brand_id <> l.marca_id) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: divergencia keyword/lista na validacao final';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marcas WHERE id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND owner_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: owner final da Adalba ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brand_memberships WHERE marca_id = '95bef1bb-0a3d-4218-a01f-ac7281c55e45'::uuid AND member_user_id = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid AND role = 'owner' AND status = 'active') THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: membership owner final ausente';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('listas_kgr','keywords_kgr') AND cmd = 'ALL' AND array_to_string(roles, ',') ILIKE '%authenticated%' AND (coalesce(qual, '') ILIKE '%auth.role()%authenticated%' OR coalesce(with_check, '') ILIKE '%auth.role()%authenticated%') ) THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: policy permissiva antiga permanece ativa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_0005_keywords_select') OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_0005_listas_select') THEN
    RAISE EXCEPTION 'TENANT_0005_CONFLICT: policies tenantizadas ausentes';
  END IF;
  RAISE NOTICE 'TENANT_0005_READY: estrutura e backfill validados; keywords %, sem lista %, com lista %', before_keywords, before_no_list, before_with_list;
END $$;

COMMIT;
