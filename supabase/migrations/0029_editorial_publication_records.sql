BEGIN;

-- Canonical editorial persistence, phase C.
-- PublicationRecord is independent from workflow, documents, and legacy briefs.

CREATE TABLE public.publication_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) > 0),
  content_plan_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  document_id text REFERENCES public.content_documents(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (char_length(btrim(status)) BETWEEN 1 AND 80),
  published_url text,
  slug text NOT NULL CHECK (char_length(btrim(slug)) > 0),
  canonical text,
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_records_brand_article_unique UNIQUE (marca_id, article_id)
);

CREATE INDEX publication_records_brand_status_idx
  ON public.publication_records (marca_id, status, updated_at DESC);

CREATE INDEX publication_records_document_idx
  ON public.publication_records (document_id);

CREATE TRIGGER publication_records_touch_trg
  BEFORE UPDATE ON public.publication_records
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_lock_version();

ALTER TABLE public.publication_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY publication_records_select_policy
  ON public.publication_records FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.publication_records
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.publication_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.publication_records TO service_role;

COMMIT;
