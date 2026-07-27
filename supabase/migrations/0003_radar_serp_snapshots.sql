-- Migration aditiva do Radar. Aplicacao manual pelo proprietario do projeto.
CREATE TABLE IF NOT EXISTS public.editorial_serp_snapshots (
  id text PRIMARY KEY,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  previous_snapshot_id text,
  content_hash text NOT NULL CHECK (length(content_hash) = 64),
  status text NOT NULL CHECK (status IN ('needs_review','approved','rejected','superseded','error')),
  payload jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, article_id, version_number)
);
CREATE INDEX IF NOT EXISTS ix_editorial_serp_snapshots_brand_article ON public.editorial_serp_snapshots(marca_id, article_id, version_number);

CREATE TABLE IF NOT EXISTS public.editorial_serp_reviews (
  id text PRIMARY KEY,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL,
  snapshot_id text NOT NULL REFERENCES public.editorial_serp_snapshots(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('approved','rejected')),
  notes text NOT NULL DEFAULT '',
  reviewed_by text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_editorial_serp_reviews_brand_article ON public.editorial_serp_reviews(marca_id, article_id, reviewed_at);

ALTER TABLE public.editorial_serp_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_serp_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS editorial_serp_snapshots_select ON public.editorial_serp_snapshots;
CREATE POLICY editorial_serp_snapshots_select ON public.editorial_serp_snapshots FOR SELECT TO authenticated USING (public.editorial_has_permission(marca_id, 'radar', 'view'));
DROP POLICY IF EXISTS editorial_serp_snapshots_insert ON public.editorial_serp_snapshots;
CREATE POLICY editorial_serp_snapshots_insert ON public.editorial_serp_snapshots FOR INSERT TO authenticated WITH CHECK (public.editorial_has_permission(marca_id, 'radar', 'edit'));
DROP POLICY IF EXISTS editorial_serp_reviews_select ON public.editorial_serp_reviews;
CREATE POLICY editorial_serp_reviews_select ON public.editorial_serp_reviews FOR SELECT TO authenticated USING (public.editorial_has_permission(marca_id, 'radar', 'view'));
DROP POLICY IF EXISTS editorial_serp_reviews_insert ON public.editorial_serp_reviews;
CREATE POLICY editorial_serp_reviews_insert ON public.editorial_serp_reviews FOR INSERT TO authenticated WITH CHECK (public.editorial_has_permission(marca_id, 'radar', 'edit') OR public.editorial_has_permission(marca_id, 'radar', 'review'));

DROP TRIGGER IF EXISTS trg_editorial_serp_snapshots_append_only ON public.editorial_serp_snapshots;
CREATE TRIGGER trg_editorial_serp_snapshots_append_only BEFORE UPDATE OR DELETE ON public.editorial_serp_snapshots FOR EACH ROW EXECUTE FUNCTION public.editorial_protect_append_only();
DROP TRIGGER IF EXISTS trg_editorial_serp_reviews_append_only ON public.editorial_serp_reviews;
CREATE TRIGGER trg_editorial_serp_reviews_append_only BEFORE UPDATE OR DELETE ON public.editorial_serp_reviews FOR EACH ROW EXECUTE FUNCTION public.editorial_protect_append_only();
