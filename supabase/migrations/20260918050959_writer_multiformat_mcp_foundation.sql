BEGIN;

-- Redator: Article ContentDocument remains canonical; these are derivative outputs.
ALTER TABLE public.content_documents
  ADD CONSTRAINT content_documents_id_brand_unique UNIQUE (id, marca_id);

CREATE TABLE public.writer_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  document_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('video_script', 'carousel')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved')),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0),
  source_document_hash text NOT NULL CHECK (char_length(btrim(source_document_hash)) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT writer_deliverables_document_brand_fk
    FOREIGN KEY (document_id, marca_id) REFERENCES public.content_documents(id, marca_id) ON DELETE RESTRICT,
  CONSTRAINT writer_deliverables_document_kind_unique UNIQUE (document_id, kind),
  CONSTRAINT writer_deliverables_id_brand_document_unique UNIQUE (id, marca_id, document_id)
);

CREATE INDEX writer_deliverables_brand_status_idx
  ON public.writer_deliverables (marca_id, status, updated_at DESC);

CREATE TABLE public.writer_deliverable_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid NOT NULL REFERENCES public.writer_deliverables(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  previous_version_id uuid REFERENCES public.writer_deliverable_versions(version_id) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  change_reason text NOT NULL CHECK (char_length(btrim(change_reason)) > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deliverable_id, version_number)
);

CREATE TABLE public.writer_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  document_id text NOT NULL,
  deliverable_id uuid,
  role text NOT NULL CHECK (role IN ('cover', 'breath', 'storyboard', 'slide')),
  status text NOT NULL DEFAULT 'prompt_ready' CHECK (status IN ('prompt_ready', 'uploaded', 'reviewed')),
  objective text NOT NULL CHECK (char_length(btrim(objective)) > 0),
  prompt text NOT NULL CHECK (char_length(btrim(prompt)) > 0),
  alt_text text NOT NULL DEFAULT '',
  aspect_ratio text NOT NULL CHECK (char_length(btrim(aspect_ratio)) > 0),
  storage_path text,
  mime_type text,
  file_hash text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT writer_media_assets_document_brand_fk
    FOREIGN KEY (document_id, marca_id) REFERENCES public.content_documents(id, marca_id) ON DELETE RESTRICT,
  CONSTRAINT writer_media_assets_deliverable_fk
    FOREIGN KEY (deliverable_id, marca_id, document_id)
      REFERENCES public.writer_deliverables(id, marca_id, document_id) ON DELETE RESTRICT,
  CONSTRAINT writer_media_assets_file_state_check CHECK (
    (status = 'prompt_ready' AND storage_path IS NULL AND file_hash IS NULL)
    OR (status IN ('uploaded', 'reviewed') AND storage_path IS NOT NULL AND file_hash IS NOT NULL AND mime_type IN ('image/png', 'image/jpeg', 'image/webp'))
  )
);

CREATE INDEX writer_media_assets_brand_document_idx
  ON public.writer_media_assets (marca_id, document_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('writer-media', 'writer-media', false, 10485760, ARRAY['image/png','image/jpeg','image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER writer_deliverables_touch_trg BEFORE UPDATE ON public.writer_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_lock_version();
CREATE TRIGGER writer_deliverable_versions_append_only_trg BEFORE UPDATE OR DELETE ON public.writer_deliverable_versions
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();
CREATE TRIGGER writer_media_assets_touch_trg BEFORE UPDATE ON public.writer_media_assets
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_updated_at();

ALTER TABLE public.writer_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writer_deliverable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writer_media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY writer_deliverables_select_policy ON public.writer_deliverables FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));
CREATE POLICY writer_deliverable_versions_select_policy ON public.writer_deliverable_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.writer_deliverables d WHERE d.id = deliverable_id
      AND public.canonical_actor_can_access_brand(d.marca_id, auth.uid())
  ));
CREATE POLICY writer_media_assets_select_policy ON public.writer_media_assets FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

REVOKE ALL ON TABLE public.writer_deliverables, public.writer_deliverable_versions, public.writer_media_assets
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.writer_deliverables, public.writer_deliverable_versions, public.writer_media_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.writer_deliverables, public.writer_media_assets TO service_role;
GRANT SELECT, INSERT ON TABLE public.writer_deliverable_versions TO service_role;

COMMIT;
