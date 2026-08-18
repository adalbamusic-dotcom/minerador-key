BEGIN;

-- Canonical editorial persistence, phase A.
-- This migration creates no rows and does not alter historical migrations.

CREATE TABLE public.editorial_artifact_versions (
  version_id text PRIMARY KEY,
  entity_id text NOT NULL,
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  artifact_type text NOT NULL CHECK (
    artifact_type IN ('article_dna', 'silo_dna', 'silo_page', 'content_plan')
  ),
  version_number integer NOT NULL CHECK (version_number > 0),
  previous_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  source_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (char_length(btrim(status)) BETWEEN 1 AND 80),
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  origin text NOT NULL CHECK (char_length(btrim(origin)) > 0),
  change_reason text NOT NULL CHECK (char_length(btrim(change_reason)) > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_artifact_versions_identity_unique
    UNIQUE (marca_id, artifact_type, entity_id, version_number)
);

CREATE INDEX editorial_artifact_versions_brand_lookup_idx
  ON public.editorial_artifact_versions (marca_id, artifact_type, entity_id, version_number DESC);

CREATE TABLE public.editorial_workflow_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  subject_type text NOT NULL CHECK (char_length(btrim(subject_type)) BETWEEN 1 AND 80),
  subject_id text NOT NULL CHECK (char_length(btrim(subject_id)) > 0),
  article_id text,
  stage text NOT NULL CHECK (
    stage IN ('minerador', 'architect', 'radar', 'planner', 'writer', 'publications')
  ),
  state text NOT NULL CHECK (char_length(btrim(state)) BETWEEN 1 AND 80),
  source_entity_id text NOT NULL CHECK (char_length(btrim(source_entity_id)) > 0),
  source_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  source_content_hash text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_workflow_items_subject_stage_unique
    UNIQUE (marca_id, subject_type, subject_id, stage)
);

CREATE INDEX editorial_workflow_items_brand_stage_idx
  ON public.editorial_workflow_items (marca_id, stage, state, updated_at DESC);

CREATE TABLE public.editorial_serp_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) > 0),
  source_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  snapshot_version integer NOT NULL CHECK (snapshot_version > 0),
  previous_snapshot_id uuid REFERENCES public.editorial_serp_snapshots(id) ON DELETE RESTRICT,
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) > 0),
  status text NOT NULL CHECK (char_length(btrim(status)) BETWEEN 1 AND 80),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT editorial_serp_snapshots_identity_unique
    UNIQUE (marca_id, article_id, snapshot_version)
);

CREATE INDEX editorial_serp_snapshots_article_idx
  ON public.editorial_serp_snapshots (marca_id, article_id, snapshot_version DESC);

CREATE TABLE public.editorial_serp_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) > 0),
  snapshot_id uuid NOT NULL REFERENCES public.editorial_serp_snapshots(id) ON DELETE RESTRICT,
  source_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (char_length(btrim(status)) BETWEEN 1 AND 80),
  reviewed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX editorial_serp_reviews_snapshot_idx
  ON public.editorial_serp_reviews (snapshot_id, created_at DESC);

CREATE FUNCTION public.pipeline_editorial_protect_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'append-only editorial record cannot be changed';
END;
$$;

CREATE FUNCTION public.pipeline_editorial_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.pipeline_editorial_touch_lock_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.lock_version := OLD.lock_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.pipeline_editorial_validate_artifact_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  source_type text;
  source_brand uuid;
BEGIN
  IF NEW.artifact_type = 'silo_page' THEN
    IF NEW.source_version_id IS NULL THEN
      RAISE EXCEPTION 'silo_page requires a source SiloDNA version';
    END IF;

    SELECT artifact_type, marca_id
      INTO source_type, source_brand
    FROM public.editorial_artifact_versions
    WHERE version_id = NEW.source_version_id;

    IF source_type IS DISTINCT FROM 'silo_dna' OR source_brand IS DISTINCT FROM NEW.marca_id THEN
      RAISE EXCEPTION 'silo_page source must be a SiloDNA version from the same Brand';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER editorial_artifact_versions_append_only_trg
  BEFORE UPDATE OR DELETE ON public.editorial_artifact_versions
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();

CREATE TRIGGER editorial_artifact_versions_source_trg
  BEFORE INSERT OR UPDATE OF artifact_type, source_version_id, marca_id
  ON public.editorial_artifact_versions
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_validate_artifact_source();

CREATE TRIGGER editorial_serp_snapshots_append_only_trg
  BEFORE UPDATE OR DELETE ON public.editorial_serp_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();

CREATE TRIGGER editorial_serp_reviews_append_only_trg
  BEFORE UPDATE OR DELETE ON public.editorial_serp_reviews
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();

CREATE TRIGGER editorial_workflow_items_touch_trg
  BEFORE UPDATE ON public.editorial_workflow_items
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_lock_version();

ALTER TABLE public.editorial_artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_workflow_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_serp_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_serp_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY editorial_artifact_versions_select_policy
  ON public.editorial_artifact_versions FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY editorial_workflow_items_select_policy
  ON public.editorial_workflow_items FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY editorial_serp_snapshots_select_policy
  ON public.editorial_serp_snapshots FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY editorial_serp_reviews_select_policy
  ON public.editorial_serp_reviews FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE
  public.editorial_artifact_versions,
  public.editorial_workflow_items,
  public.editorial_serp_snapshots,
  public.editorial_serp_reviews
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.editorial_artifact_versions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.editorial_artifact_versions TO service_role;
GRANT SELECT ON TABLE public.editorial_workflow_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.editorial_workflow_items TO service_role;
GRANT SELECT ON TABLE public.editorial_serp_snapshots TO authenticated;
GRANT SELECT, INSERT ON TABLE public.editorial_serp_snapshots TO service_role;
GRANT SELECT ON TABLE public.editorial_serp_reviews TO authenticated;
GRANT SELECT, INSERT ON TABLE public.editorial_serp_reviews TO service_role;

REVOKE ALL ON FUNCTION public.pipeline_editorial_protect_append_only() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pipeline_editorial_touch_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pipeline_editorial_touch_lock_version() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pipeline_editorial_validate_artifact_source() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
