BEGIN;

-- Canonical editorial persistence, phase B.
-- Documents are current state; versions and user state are separate records.

CREATE TABLE public.content_documents (
  id text PRIMARY KEY,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) > 0),
  article_dna_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  content_plan_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  current_version_id text,
  status text NOT NULL CHECK (char_length(btrim(status)) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0),
  slug text NOT NULL CHECK (char_length(btrim(slug)) > 0),
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_documents_brand_article_unique UNIQUE (marca_id, article_id)
);

CREATE INDEX content_documents_brand_status_idx
  ON public.content_documents (marca_id, status, updated_at DESC);

CREATE TABLE public.content_document_versions (
  version_id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES public.content_documents(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  previous_version_id text REFERENCES public.content_document_versions(version_id) ON DELETE RESTRICT,
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  change_reason text NOT NULL CHECK (char_length(btrim(change_reason)) > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_document_versions_identity_unique
    UNIQUE (document_id, version_number)
);

ALTER TABLE public.content_documents
  ADD CONSTRAINT content_documents_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.content_document_versions(version_id)
  ON DELETE RESTRICT;

CREATE INDEX content_document_versions_document_idx
  ON public.content_document_versions (document_id, version_number DESC);

CREATE TABLE public.content_document_user_states (
  document_id text NOT NULL REFERENCES public.content_documents(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  cursor_position integer CHECK (cursor_position IS NULL OR cursor_position >= 0),
  scroll_top integer NOT NULL DEFAULT 0 CHECK (scroll_top >= 0),
  left_panel_open boolean NOT NULL DEFAULT true,
  right_panel_open boolean NOT NULL DEFAULT true,
  last_opened_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);

CREATE TABLE public.editorial_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  module text NOT NULL CHECK (
    module IN ('marca', 'minerador', 'arquiteto', 'radar', 'planejador', 'redator', 'publicacoes')
  ),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_saved_views_name_unique UNIQUE (marca_id, user_id, module, name)
);

CREATE UNIQUE INDEX editorial_saved_views_one_default_idx
  ON public.editorial_saved_views (marca_id, user_id, module)
  WHERE is_default;

CREATE INDEX editorial_saved_views_brand_module_idx
  ON public.editorial_saved_views (marca_id, module, updated_at DESC);

CREATE TRIGGER content_documents_touch_trg
  BEFORE UPDATE ON public.content_documents
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_lock_version();

CREATE TRIGGER content_document_versions_append_only_trg
  BEFORE UPDATE OR DELETE ON public.content_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();

CREATE TRIGGER content_document_user_states_touch_trg
  BEFORE UPDATE ON public.content_document_user_states
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_updated_at();

CREATE TRIGGER editorial_saved_views_touch_trg
  BEFORE UPDATE ON public.editorial_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_updated_at();

ALTER TABLE public.content_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_document_user_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_documents_select_policy
  ON public.content_documents FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY content_document_versions_select_policy
  ON public.content_document_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.content_documents d
      WHERE d.id = document_id
        AND public.canonical_actor_can_access_brand(d.marca_id, auth.uid())
    )
  );

CREATE POLICY content_document_user_states_select_policy
  ON public.content_document_user_states FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.content_documents d
      WHERE d.id = document_id
        AND public.canonical_actor_can_access_brand(d.marca_id, auth.uid())
    )
  );

CREATE POLICY editorial_saved_views_select_policy
  ON public.editorial_saved_views FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.canonical_actor_can_access_brand(marca_id, auth.uid())
  );

REVOKE ALL PRIVILEGES ON TABLE
  public.content_documents,
  public.content_document_versions,
  public.content_document_user_states,
  public.editorial_saved_views
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.content_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.content_documents TO service_role;
GRANT SELECT ON TABLE public.content_document_versions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.content_document_versions TO service_role;
GRANT SELECT ON TABLE public.content_document_user_states TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.content_document_user_states TO service_role;
GRANT SELECT ON TABLE public.editorial_saved_views TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.editorial_saved_views TO service_role;

COMMIT;
