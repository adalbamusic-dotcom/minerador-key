-- FASE 2D. PREPARADA LOCALMENTE, NAO EXECUTADA.
-- Aplicacao manual somente depois de novo snapshot, preflight e revisao humana.
-- Esta ponte elimina o uso operacional de chaves textuais, mas NAO remove
-- colunas fisicas legadas. A remocao destrutiva e uma migration posterior.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.brand_memberships') IS NULL
     OR to_regclass('public.agency_memberships') IS NULL THEN
    RAISE EXCEPTION 'PHASE_2D_0016_PRECONDITION: tabelas canônicas de identidade ausentes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand_memberships' AND column_name = 'member_user_id' AND is_nullable = 'NO')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'role')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'canonical_role') THEN
    RAISE EXCEPTION 'PHASE_2D_0016_PRECONDITION: fundacao 0015 incompleta';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agency_memberships
    WHERE canonical_role NOT IN ('agency_admin', 'agency_member')
       OR (role = 'agency_admin' AND canonical_role <> 'agency_admin')
       OR (role IN ('operator', 'viewer', 'agency_member') AND canonical_role <> 'agency_member')
  ) THEN
    RAISE EXCEPTION 'PHASE_2D_0016_CONFLICT: papeis de agencia nao possuem mapeamento canonico';
  END IF;
END $$;

-- O fluxo editorial 0002 é opcional neste catálogo. Se todas as tabelas
-- pessoais existirem, a ponte faz o backfill; se nenhuma existir, segue sem
-- inventar estrutura editorial. Um conjunto parcial aborta para revisão.
DO $$
DECLARE states_exists boolean := to_regclass('public.content_document_user_states') IS NOT NULL;
        views_exists boolean := to_regclass('public.editorial_saved_views') IS NOT NULL;
        grants_exists boolean := to_regclass('public.delegated_access_grants') IS NOT NULL;
BEGIN
  IF states_exists <> views_exists OR states_exists <> grants_exists THEN
    RAISE EXCEPTION 'PHASE_2D_0016_PRECONDITION: grupo editorial legado parcial';
  END IF;
  IF NOT states_exists THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.content_document_user_states ADD COLUMN IF NOT EXISTS user_id uuid';
  EXECUTE 'ALTER TABLE public.editorial_saved_views ADD COLUMN IF NOT EXISTS user_id uuid';
  EXECUTE 'ALTER TABLE public.delegated_access_grants ADD COLUMN IF NOT EXISTS grantee_user_id uuid';
  EXECUTE $sql$UPDATE public.content_document_user_states state SET user_id = auth_user.id FROM auth.users auth_user WHERE state.user_id IS NULL AND (state.user_key = auth_user.id::text OR lower(state.user_key) = lower(coalesce(auth_user.email, '')))$sql$;
  EXECUTE $sql$UPDATE public.editorial_saved_views view SET user_id = auth_user.id FROM auth.users auth_user WHERE view.user_id IS NULL AND (view.user_key = auth_user.id::text OR lower(view.user_key) = lower(coalesce(auth_user.email, '')))$sql$;
  EXECUTE $sql$UPDATE public.delegated_access_grants grant_row SET grantee_user_id = auth_user.id FROM auth.users auth_user WHERE grant_row.grantee_user_id IS NULL AND (grant_row.grantee_user_key = auth_user.id::text OR lower(grant_row.grantee_user_key) = lower(coalesce(auth_user.email, '')))$sql$;
  IF EXISTS (SELECT 1 FROM public.content_document_user_states WHERE user_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.editorial_saved_views WHERE user_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.delegated_access_grants WHERE status = 'active' AND grantee_user_id IS NULL) THEN
    RAISE EXCEPTION 'PHASE_2D_0016_CONFLICT: chave textual sem UUID Auth comprovado';
  END IF;
  EXECUTE 'ALTER TABLE public.content_document_user_states ALTER COLUMN user_id SET NOT NULL';
  EXECUTE 'ALTER TABLE public.editorial_saved_views ALTER COLUMN user_id SET NOT NULL';
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_content_document_user_states_user_0016 ON public.content_document_user_states(document_id, user_id)';
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_editorial_saved_views_user_0016 ON public.editorial_saved_views(marca_id, user_id, module, name)';
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_editorial_saved_view_default_user_0016 ON public.editorial_saved_views(marca_id, user_id, module) WHERE is_default';
END $$;

CREATE OR REPLACE FUNCTION public.editorial_current_actor_id()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT coalesce(auth.uid()::text, '') $$;

CREATE OR REPLACE FUNCTION public.editorial_has_permission(target_marca uuid, requested_module text, requested_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = target_marca AND b.owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.brand_memberships m
      JOIN public.brand_member_permissions p ON p.membership_id = m.id AND p.granted
      WHERE m.marca_id = target_marca AND m.member_user_id = auth.uid() AND m.status = 'active'
        AND p.module = requested_module AND p.action = requested_action
    )
  );
$$;

-- Os aliases de policy da geracao 0006 continuam existentes, mas passam a
-- delegar somente para owner/membership UUID. Papel global nao vira acesso
-- editorial por este caminho.
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role = 'admin') $$;

CREATE OR REPLACE FUNCTION public.can_access_brand(target_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.marcas b
    WHERE b.id = target_brand_id AND b.status = 'active'
      AND (b.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.brand_memberships m
        WHERE m.marca_id = b.id AND m.member_user_id = auth.uid() AND m.status = 'active'
      ))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_brand(target_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.marcas b WHERE b.id = target_brand_id AND b.owner_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.brand_memberships m
      JOIN public.brand_member_permissions p ON p.membership_id = m.id AND p.granted
      WHERE m.marca_id = target_brand_id AND m.member_user_id = auth.uid() AND m.status = 'active'
        AND p.module = 'marca' AND p.action = 'manage'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.tenant_actor_has_permission(target_brand_id uuid, requested_module text, requested_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT public.editorial_has_permission(target_brand_id, requested_module, requested_action) $$;

CREATE OR REPLACE FUNCTION public.can_access_list(target_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.listas_kgr l WHERE l.id = target_list_id AND public.can_access_brand(l.marca_id)) $$;

CREATE OR REPLACE FUNCTION public.canonical_can_access_agency(target_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agencies a
    WHERE a.id = target_agency_id AND a.status = 'active'
      AND (a.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.agency_memberships am
        WHERE am.agency_id = a.id AND am.user_id = auth.uid() AND am.status = 'active'
      ))
  )
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_manage_agency(target_agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.agencies a
    WHERE a.id = target_agency_id AND a.status = 'active'
      AND (a.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.agency_memberships am
        WHERE am.agency_id = a.id AND am.user_id = auth.uid() AND am.status = 'active' AND am.role = 'agency_admin'
      ))
  )
$$;

DO $$
BEGIN
  IF to_regclass('public.editorial_saved_views') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS saved_views_select ON public.editorial_saved_views';
  EXECUTE 'CREATE POLICY saved_views_select ON public.editorial_saved_views FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.editorial_has_permission(marca_id, module, ''view''))';
  EXECUTE 'DROP POLICY IF EXISTS saved_views_write ON public.editorial_saved_views';
  EXECUTE 'CREATE POLICY saved_views_write ON public.editorial_saved_views FOR ALL TO authenticated USING (user_id = auth.uid() AND public.editorial_has_permission(marca_id, module, ''view'')) WITH CHECK (user_id = auth.uid() AND public.editorial_has_permission(marca_id, module, ''view''))';
  EXECUTE 'DROP POLICY IF EXISTS document_user_state_access ON public.content_document_user_states';
  EXECUTE 'CREATE POLICY document_user_state_access ON public.content_document_user_states FOR ALL TO authenticated USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.content_documents d WHERE d.id = document_id AND public.editorial_has_permission(d.marca_id, ''redator'', ''view''))) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.content_documents d WHERE d.id = document_id AND public.editorial_has_permission(d.marca_id, ''redator'', ''view'')))';
END $$;

CREATE TABLE IF NOT EXISTS public.tenant_0016_agency_role_rollback (
  membership_id uuid PRIMARY KEY REFERENCES public.agency_memberships(id) ON DELETE RESTRICT,
  legacy_role text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.tenant_0016_agency_role_rollback FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_0016_agency_role_rollback TO service_role;
INSERT INTO public.tenant_0016_agency_role_rollback (membership_id, legacy_role)
SELECT id, role FROM public.agency_memberships
ON CONFLICT (membership_id) DO NOTHING;

UPDATE public.agency_memberships
SET role = canonical_role
WHERE role IS DISTINCT FROM canonical_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agency_memberships WHERE role NOT IN ('agency_admin', 'agency_member')) THEN
    RAISE EXCEPTION 'PHASE_2D_0016_CONFLICT: papel final de agencia invalido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.agency_memberships'::regclass AND conname = 'ck_agency_memberships_role_0016') THEN
    ALTER TABLE public.agency_memberships ADD CONSTRAINT ck_agency_memberships_role_0016 CHECK (role IN ('agency_admin', 'agency_member')) NOT VALID;
    ALTER TABLE public.agency_memberships VALIDATE CONSTRAINT ck_agency_memberships_role_0016;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.editorial_current_actor_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.editorial_has_permission(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_global_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_brand(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_brand(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_can_access_agency(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_can_manage_agency(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editorial_current_actor_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.editorial_has_permission(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_global_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_list(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_access_agency(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_manage_agency(uuid) TO authenticated, service_role;

COMMIT;
