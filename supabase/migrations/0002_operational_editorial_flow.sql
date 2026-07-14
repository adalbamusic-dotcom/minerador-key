-- PROPOSTA PARA REVISAO MANUAL. NAO APLICADA PELO CODEX.
-- Pre-requisitos: dump schema-only, validacao da 0001 instalada, migration
-- repair manual da 0001, teste local isolado e revisao das policies.

CREATE TABLE IF NOT EXISTS public.brand_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid REFERENCES public.marcas(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_roles_scope_slug
  ON public.brand_roles (COALESCE(marca_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

CREATE TABLE IF NOT EXISTS public.brand_role_permissions (
  role_id uuid NOT NULL REFERENCES public.brand_roles(id) ON DELETE RESTRICT,
  module text NOT NULL CHECK (module IN ('marca','minerador','arquiteto','radar','planejador','redator','publicacoes','administracao')),
  action text NOT NULL CHECK (action IN ('view','comment','create','edit','review','approve','export','publish','manage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, module, action)
);

CREATE TABLE IF NOT EXISTS public.brand_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  email text NOT NULL,
  role_id uuid REFERENCES public.brand_roles(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','accepted','expired','cancelled')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_invitation_pending ON public.brand_invitations(marca_id,lower(email)) WHERE status='pending';

CREATE TABLE IF NOT EXISTS public.brand_invitation_permissions (
  invitation_id uuid NOT NULL REFERENCES public.brand_invitations(id) ON DELETE RESTRICT,
  module text NOT NULL CHECK (module IN ('marca','minerador','arquiteto','radar','planejador','redator','publicacoes','administracao')),
  action text NOT NULL CHECK (action IN ('view','comment','create','edit','review','approve','export','publish','manage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invitation_id,module,action)
);

CREATE TABLE IF NOT EXISTS public.brand_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  user_key text NOT NULL,
  role_id uuid REFERENCES public.brand_roles(id) ON DELETE RESTRICT,
  invitation_id uuid REFERENCES public.brand_invitations(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active','suspended','removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, user_key)
);

CREATE TABLE IF NOT EXISTS public.brand_member_permissions (
  membership_id uuid NOT NULL REFERENCES public.brand_memberships(id) ON DELETE RESTRICT,
  module text NOT NULL CHECK (module IN ('marca','minerador','arquiteto','radar','planejador','redator','publicacoes','administracao')),
  action text NOT NULL CHECK (action IN ('view','comment','create','edit','review','approve','export','publish','manage')),
  granted boolean NOT NULL DEFAULT true,
  granted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, module, action)
);

CREATE TABLE IF NOT EXISTS public.delegated_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  grantee_user_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','expired','revoked')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delegated_access_active ON public.delegated_access_grants(marca_id,grantee_user_key) WHERE status='active';

CREATE TABLE IF NOT EXISTS public.delegated_access_permissions (
  grant_id uuid NOT NULL REFERENCES public.delegated_access_grants(id) ON DELETE RESTRICT,
  module text NOT NULL CHECK (module IN ('marca','minerador','arquiteto','radar','planejador','redator','publicacoes','administracao')),
  action text NOT NULL CHECK (action IN ('view','comment','create','edit','review','approve','export','publish','manage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grant_id, module, action)
);

CREATE TABLE IF NOT EXISTS public.editorial_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  user_key text NOT NULL,
  module text NOT NULL,
  name text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, user_key, module, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_editorial_saved_view_default
  ON public.editorial_saved_views (marca_id, user_key, module) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.editorial_artifact_versions (
  version_id text PRIMARY KEY,
  entity_id text NOT NULL,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  artifact_type text NOT NULL CHECK (artifact_type IN ('brand_dna','keyword_dna','article_dna','silo_dna','content_plan')),
  version_number integer NOT NULL CHECK (version_number > 0),
  previous_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  content_hash text NOT NULL,
  origin text NOT NULL,
  change_reason text NOT NULL,
  payload jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, artifact_type, entity_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.editorial_version_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id text NOT NULL REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft','proposed','approved','rejected','superseded')),
  reason text NOT NULL,
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_version_status_events_version_time ON public.editorial_version_status_events(version_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.editorial_workflow_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('architect','radar','planner','writer','publications')),
  state text NOT NULL,
  source_entity_id text NOT NULL,
  source_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  source_content_hash text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  lock_version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, article_id, stage)
);
CREATE INDEX IF NOT EXISTS ix_workflow_brand_stage_state ON public.editorial_workflow_items(marca_id, stage, state);

CREATE TABLE IF NOT EXISTS public.editorial_decision_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  workflow_item_id uuid REFERENCES public.editorial_workflow_items(id) ON DELETE RESTRICT,
  article_id text NOT NULL,
  event_type text NOT NULL,
  from_state text,
  to_state text,
  source_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_decision_events_article_time ON public.editorial_decision_events(marca_id, article_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.content_documents (
  id text PRIMARY KEY,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL,
  content_plan_version_id text NOT NULL REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  article_dna_version_id text NOT NULL REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('planned','writing','awaiting_review','in_review','approved','blocked')),
  title text NOT NULL,
  slug text NOT NULL,
  payload jsonb NOT NULL,
  content_hash text NOT NULL,
  lock_version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, article_id)
);

CREATE TABLE IF NOT EXISTS public.content_document_versions (
  version_id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES public.content_documents(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  previous_version_id text REFERENCES public.content_document_versions(version_id) ON DELETE RESTRICT,
  content_hash text NOT NULL,
  change_reason text NOT NULL,
  payload jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.content_document_user_states (
  document_id text NOT NULL REFERENCES public.content_documents(id) ON DELETE RESTRICT,
  user_key text NOT NULL,
  cursor_position integer,
  scroll_top integer NOT NULL DEFAULT 0,
  left_panel_open boolean NOT NULL DEFAULT true,
  right_panel_open boolean NOT NULL DEFAULT true,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_key)
);

CREATE TABLE IF NOT EXISTS public.content_document_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id text NOT NULL REFERENCES public.content_documents(id) ON DELETE RESTRICT,
  block_id text,
  from_position integer,
  to_position integer,
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('open','resolved')),
  created_by text NOT NULL,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.publication_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL,
  content_plan_version_id text NOT NULL REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  document_id text NOT NULL REFERENCES public.content_documents(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft','writing','awaiting_review','in_review','approved','ready_to_export','queued','exported','published','update_due','blocked','archived')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  lock_version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, article_id)
);

CREATE OR REPLACE FUNCTION public.editorial_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.editorial_touch_lock_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); NEW.lock_version := OLD.lock_version + 1; RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.editorial_protect_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY: registros historicos nao podem ser alterados ou removidos'; END; $$;

CREATE OR REPLACE FUNCTION public.editorial_current_user_key()
RETURNS text LANGUAGE sql STABLE AS $$ SELECT lower(COALESCE(auth.jwt()->>'email',auth.uid()::text,'')) $$;

CREATE OR REPLACE FUNCTION public.editorial_has_permission(target_marca uuid, requested_module text, requested_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.brand_memberships m
    JOIN public.brand_member_permissions p ON p.membership_id = m.id AND p.granted
    WHERE m.marca_id = target_marca AND m.user_key = public.editorial_current_user_key() AND m.status = 'active'
      AND p.module = requested_module AND p.action = requested_action
  ) OR EXISTS (
    SELECT 1 FROM public.delegated_access_grants g
    JOIN public.delegated_access_permissions p ON p.grant_id = g.id
    WHERE g.marca_id = target_marca AND g.grantee_user_key = public.editorial_current_user_key() AND g.status = 'active'
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND p.module = requested_module AND p.action = requested_action
  );
$$;

CREATE OR REPLACE FUNCTION public.editorial_artifact_module(kind text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE kind WHEN 'brand_dna' THEN 'marca' WHEN 'keyword_dna' THEN 'minerador' WHEN 'article_dna' THEN 'arquiteto' WHEN 'silo_dna' THEN 'arquiteto' WHEN 'content_plan' THEN 'planejador' END $$;
CREATE OR REPLACE FUNCTION public.editorial_stage_module(stage_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE stage_name WHEN 'architect' THEN 'arquiteto' WHEN 'radar' THEN 'radar' WHEN 'planner' THEN 'planejador' WHEN 'writer' THEN 'redator' WHEN 'publications' THEN 'publicacoes' END $$;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['brand_roles','brand_role_permissions','brand_invitations','brand_invitation_permissions','brand_memberships','brand_member_permissions','delegated_access_grants','delegated_access_permissions','editorial_saved_views','editorial_artifact_versions','editorial_version_status_events','editorial_workflow_items','editorial_decision_events','content_documents','content_document_versions','content_document_user_states','content_document_comments','publication_records']
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name); END LOOP;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.brand_roles WHERE marca_id IS NULL AND slug='owner') THEN
    INSERT INTO public.brand_roles(marca_id,slug,name,description,is_system) VALUES (NULL,'owner','Proprietario','Preset inicial; permissoes efetivas ficam no membro.',true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brand_roles WHERE marca_id IS NULL AND slug='platform_admin') THEN
    INSERT INTO public.brand_roles(marca_id,slug,name,description,is_system) VALUES (NULL,'platform_admin','Administrador da plataforma','Preset de compatibilidade para marcas existentes.',true);
  END IF;
END $$;

INSERT INTO public.brand_memberships(marca_id,user_key,role_id,status)
SELECT p.marca_id,lower(COALESCE(u.email,p.id::text)),r.id,'active' FROM public.perfis p LEFT JOIN auth.users u ON u.id=p.id CROSS JOIN LATERAL (SELECT id FROM public.brand_roles WHERE marca_id IS NULL AND slug='owner' LIMIT 1) r
WHERE p.marca_id IS NOT NULL AND COALESCE(p.role,'cliente') <> 'admin'
ON CONFLICT (marca_id,user_key) DO NOTHING;
INSERT INTO public.brand_memberships(marca_id,user_key,role_id,status)
SELECT m.id,lower(COALESCE(u.email,p.id::text)),r.id,'active' FROM public.marcas m CROSS JOIN public.perfis p LEFT JOIN auth.users u ON u.id=p.id CROSS JOIN LATERAL (SELECT id FROM public.brand_roles WHERE marca_id IS NULL AND slug='platform_admin' LIMIT 1) r
WHERE p.role='admin' ON CONFLICT (marca_id,user_key) DO NOTHING;
INSERT INTO public.brand_member_permissions(membership_id,module,action,granted)
SELECT m.id,modules.module,actions.action,true FROM public.brand_memberships m
CROSS JOIN (VALUES ('marca'),('minerador'),('arquiteto'),('radar'),('planejador'),('redator'),('publicacoes'),('administracao')) modules(module)
CROSS JOIN (VALUES ('view'),('comment'),('create'),('edit'),('review'),('approve'),('export'),('publish'),('manage')) actions(action)
ON CONFLICT (membership_id,module,action) DO NOTHING;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['brand_roles','brand_invitations','brand_memberships','brand_member_permissions','delegated_access_grants','editorial_saved_views','content_document_user_states'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_touch ON public.%I',t,t);
    EXECUTE format('CREATE TRIGGER trg_%I_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.editorial_touch_updated_at()',t,t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['editorial_workflow_items','content_documents','publication_records'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_lock ON public.%I',t,t);
    EXECUTE format('CREATE TRIGGER trg_%I_lock BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.editorial_touch_lock_version()',t,t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['editorial_artifact_versions','editorial_version_status_events','editorial_decision_events','content_document_versions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_append_only ON public.%I',t,t);
    EXECUTE format('CREATE TRIGGER trg_%I_append_only BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.editorial_protect_append_only()',t,t);
  END LOOP;
END $$;

-- Policies: views pessoais.
DROP POLICY IF EXISTS saved_views_select ON public.editorial_saved_views;
CREATE POLICY saved_views_select ON public.editorial_saved_views FOR SELECT TO authenticated USING (user_key=public.editorial_current_user_key() AND public.editorial_has_permission(marca_id,module,'view'));
DROP POLICY IF EXISTS saved_views_write ON public.editorial_saved_views;
CREATE POLICY saved_views_write ON public.editorial_saved_views FOR ALL TO authenticated USING (user_key=public.editorial_current_user_key() AND public.editorial_has_permission(marca_id,module,'view')) WITH CHECK (user_key=public.editorial_current_user_key() AND public.editorial_has_permission(marca_id,module,'view'));

-- Policies: gestao de acesso.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['brand_invitations','brand_memberships','delegated_access_grants'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_access ON public.%I',t,t);
    EXECUTE format('CREATE POLICY %I_access ON public.%I FOR ALL TO authenticated USING (public.editorial_has_permission(marca_id,''marca'',''manage'')) WITH CHECK (public.editorial_has_permission(marca_id,''marca'',''manage''))',t,t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS brand_roles_select ON public.brand_roles;
CREATE POLICY brand_roles_select ON public.brand_roles FOR SELECT TO authenticated USING (marca_id IS NULL OR public.editorial_has_permission(marca_id,'marca','manage'));
DROP POLICY IF EXISTS brand_roles_write ON public.brand_roles;
CREATE POLICY brand_roles_write ON public.brand_roles FOR ALL TO authenticated USING (marca_id IS NOT NULL AND public.editorial_has_permission(marca_id,'marca','manage')) WITH CHECK (marca_id IS NOT NULL AND public.editorial_has_permission(marca_id,'marca','manage'));
DROP POLICY IF EXISTS role_permissions_access ON public.brand_role_permissions;
CREATE POLICY role_permissions_access ON public.brand_role_permissions FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.brand_roles r WHERE r.id=role_id AND (r.marca_id IS NULL OR public.editorial_has_permission(r.marca_id,'marca','manage')))) WITH CHECK (EXISTS(SELECT 1 FROM public.brand_roles r WHERE r.id=role_id AND r.marca_id IS NOT NULL AND public.editorial_has_permission(r.marca_id,'marca','manage')));
DROP POLICY IF EXISTS invitation_permissions_access ON public.brand_invitation_permissions;
CREATE POLICY invitation_permissions_access ON public.brand_invitation_permissions FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.brand_invitations i WHERE i.id=invitation_id AND public.editorial_has_permission(i.marca_id,'marca','manage'))) WITH CHECK (EXISTS(SELECT 1 FROM public.brand_invitations i WHERE i.id=invitation_id AND public.editorial_has_permission(i.marca_id,'marca','manage')));
DROP POLICY IF EXISTS member_permissions_access ON public.brand_member_permissions;
CREATE POLICY member_permissions_access ON public.brand_member_permissions FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.brand_memberships m WHERE m.id=membership_id AND public.editorial_has_permission(m.marca_id,'marca','manage'))) WITH CHECK (EXISTS(SELECT 1 FROM public.brand_memberships m WHERE m.id=membership_id AND public.editorial_has_permission(m.marca_id,'marca','manage')));
DROP POLICY IF EXISTS delegated_permissions_access ON public.delegated_access_permissions;
CREATE POLICY delegated_permissions_access ON public.delegated_access_permissions FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.delegated_access_grants g WHERE g.id=grant_id AND public.editorial_has_permission(g.marca_id,'marca','manage'))) WITH CHECK (EXISTS(SELECT 1 FROM public.delegated_access_grants g WHERE g.id=grant_id AND public.editorial_has_permission(g.marca_id,'marca','manage')));

DROP POLICY IF EXISTS artifact_select ON public.editorial_artifact_versions;
CREATE POLICY artifact_select ON public.editorial_artifact_versions FOR SELECT TO authenticated USING (public.editorial_has_permission(marca_id,public.editorial_artifact_module(artifact_type),'view'));
DROP POLICY IF EXISTS artifact_insert ON public.editorial_artifact_versions;
CREATE POLICY artifact_insert ON public.editorial_artifact_versions FOR INSERT TO authenticated WITH CHECK (public.editorial_has_permission(marca_id,public.editorial_artifact_module(artifact_type),'edit'));
DROP POLICY IF EXISTS artifact_status_access ON public.editorial_version_status_events;
CREATE POLICY artifact_status_access ON public.editorial_version_status_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.editorial_artifact_versions v WHERE v.version_id=editorial_version_status_events.version_id AND public.editorial_has_permission(v.marca_id,public.editorial_artifact_module(v.artifact_type),'view')));
DROP POLICY IF EXISTS artifact_status_insert ON public.editorial_version_status_events;
CREATE POLICY artifact_status_insert ON public.editorial_version_status_events FOR INSERT TO authenticated WITH CHECK (actor_id=public.editorial_current_user_key() AND EXISTS(SELECT 1 FROM public.editorial_artifact_versions v WHERE v.version_id=editorial_version_status_events.version_id AND public.editorial_has_permission(v.marca_id,public.editorial_artifact_module(v.artifact_type),'approve')));

DROP POLICY IF EXISTS workflow_select ON public.editorial_workflow_items;
CREATE POLICY workflow_select ON public.editorial_workflow_items FOR SELECT TO authenticated USING (public.editorial_has_permission(marca_id,public.editorial_stage_module(stage),'view'));
DROP POLICY IF EXISTS workflow_write ON public.editorial_workflow_items;
CREATE POLICY workflow_write ON public.editorial_workflow_items FOR ALL TO authenticated USING (public.editorial_has_permission(marca_id,public.editorial_stage_module(stage),'edit')) WITH CHECK (public.editorial_has_permission(marca_id,public.editorial_stage_module(stage),'edit'));
DROP POLICY IF EXISTS decision_events_select ON public.editorial_decision_events;
CREATE POLICY decision_events_select ON public.editorial_decision_events FOR SELECT TO authenticated USING (public.editorial_has_permission(marca_id,'arquiteto','view') OR public.editorial_has_permission(marca_id,'radar','view') OR public.editorial_has_permission(marca_id,'planejador','view'));
DROP POLICY IF EXISTS decision_events_insert ON public.editorial_decision_events;
CREATE POLICY decision_events_insert ON public.editorial_decision_events FOR INSERT TO authenticated WITH CHECK (actor_id=public.editorial_current_user_key() AND (public.editorial_has_permission(marca_id,'arquiteto','approve') OR public.editorial_has_permission(marca_id,'radar','approve') OR public.editorial_has_permission(marca_id,'planejador','approve')));

DROP POLICY IF EXISTS content_documents_select ON public.content_documents;
CREATE POLICY content_documents_select ON public.content_documents FOR SELECT TO authenticated USING (public.editorial_has_permission(marca_id,'redator','view'));
DROP POLICY IF EXISTS content_documents_write ON public.content_documents;
CREATE POLICY content_documents_write ON public.content_documents FOR ALL TO authenticated USING (public.editorial_has_permission(marca_id,'redator','edit')) WITH CHECK (public.editorial_has_permission(marca_id,'redator','edit'));
DROP POLICY IF EXISTS document_versions_access ON public.content_document_versions;
CREATE POLICY document_versions_access ON public.content_document_versions FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.content_documents d WHERE d.id=document_id AND public.editorial_has_permission(d.marca_id,'redator','view')));
DROP POLICY IF EXISTS document_versions_insert ON public.content_document_versions;
CREATE POLICY document_versions_insert ON public.content_document_versions FOR INSERT TO authenticated WITH CHECK (created_by=public.editorial_current_user_key() AND EXISTS(SELECT 1 FROM public.content_documents d WHERE d.id=document_id AND public.editorial_has_permission(d.marca_id,'redator','edit')));
DROP POLICY IF EXISTS document_user_state_access ON public.content_document_user_states;
CREATE POLICY document_user_state_access ON public.content_document_user_states FOR ALL TO authenticated USING (user_key=public.editorial_current_user_key() AND EXISTS(SELECT 1 FROM public.content_documents d WHERE d.id=document_id AND public.editorial_has_permission(d.marca_id,'redator','view'))) WITH CHECK (user_key=public.editorial_current_user_key() AND EXISTS(SELECT 1 FROM public.content_documents d WHERE d.id=document_id AND public.editorial_has_permission(d.marca_id,'redator','view')));
DROP POLICY IF EXISTS document_comments_access ON public.content_document_comments;
CREATE POLICY document_comments_access ON public.content_document_comments FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.content_documents d WHERE d.id=document_id AND public.editorial_has_permission(d.marca_id,'redator','view')));
DROP POLICY IF EXISTS document_comments_write ON public.content_document_comments;
CREATE POLICY document_comments_write ON public.content_document_comments FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.content_documents d WHERE d.id=document_id AND public.editorial_has_permission(d.marca_id,'redator','comment'))) WITH CHECK (created_by=public.editorial_current_user_key() AND EXISTS(SELECT 1 FROM public.content_documents d WHERE d.id=document_id AND public.editorial_has_permission(d.marca_id,'redator','comment')));

DROP POLICY IF EXISTS publications_select ON public.publication_records;
CREATE POLICY publications_select ON public.publication_records FOR SELECT TO authenticated USING (public.editorial_has_permission(marca_id,'publicacoes','view'));
DROP POLICY IF EXISTS publications_write ON public.publication_records;
CREATE POLICY publications_write ON public.publication_records FOR ALL TO authenticated USING (public.editorial_has_permission(marca_id,'publicacoes','edit')) WITH CHECK (public.editorial_has_permission(marca_id,'publicacoes','edit'));

-- Limita a revogacao somente às tabelas criadas por esta migration. Não altera
-- privilégios das tabelas legadas do Minerador.
REVOKE ALL ON public.brand_roles,public.brand_role_permissions,public.brand_invitations,public.brand_invitation_permissions,public.brand_memberships,public.brand_member_permissions,public.delegated_access_grants,public.delegated_access_permissions,public.editorial_saved_views,public.editorial_artifact_versions,public.editorial_version_status_events,public.editorial_workflow_items,public.editorial_decision_events,public.content_documents,public.content_document_versions,public.content_document_user_states,public.content_document_comments,public.publication_records FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.brand_roles,public.brand_role_permissions,public.brand_invitations,public.brand_invitation_permissions,public.brand_memberships,public.brand_member_permissions,public.delegated_access_grants,public.delegated_access_permissions,public.editorial_saved_views,public.editorial_workflow_items,public.content_documents,public.content_document_user_states,public.content_document_comments,public.publication_records TO authenticated;
GRANT SELECT,INSERT ON public.editorial_artifact_versions,public.editorial_version_status_events,public.editorial_decision_events,public.content_document_versions TO authenticated;
REVOKE ALL ON FUNCTION public.editorial_current_user_key(),public.editorial_has_permission(uuid,text,text),public.editorial_artifact_module(text),public.editorial_stage_module(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editorial_current_user_key(),public.editorial_has_permission(uuid,text,text),public.editorial_artifact_module(text),public.editorial_stage_module(text) TO authenticated;

COMMENT ON TABLE public.editorial_artifact_versions IS 'Versoes imutaveis dos DNAs e ContentPlans.';
COMMENT ON TABLE public.editorial_decision_events IS 'Historico append-only de imports, aprovacoes, rejeicoes e transicoes.';
COMMENT ON TABLE public.content_documents IS 'Documento atual com concorrencia otimista; snapshots ficam em content_document_versions.';
