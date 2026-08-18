-- Master Refresh Batch 3: align the proven editorial runtime contract.
-- Preparation only. Apply remotely only after the dedicated execution gate.

BEGIN;

DO $$
DECLARE
  artifact_check text;
BEGIN
  IF to_regclass('public.editorial_artifact_versions') IS NULL
     OR to_regclass('public.editorial_workflow_items') IS NULL THEN
    RAISE EXCEPTION 'Batch 3 refused: canonical 0027 relations are absent';
  END IF;
  IF to_regclass('public.editorial_version_status_events') IS NOT NULL
     OR to_regclass('public.editorial_decision_events') IS NOT NULL THEN
    RAISE EXCEPTION 'Batch 3 refused: target event relation already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.editorial_artifact_versions) THEN
    RAISE EXCEPTION 'Batch 3 refused: bound baseline expected zero artifact rows';
  END IF;

  SELECT pg_get_constraintdef(oid,true)
    INTO artifact_check
  FROM pg_constraint
  WHERE conrelid='public.editorial_artifact_versions'::regclass
    AND conname='editorial_artifact_versions_artifact_type_check'
    AND convalidated;

  IF artifact_check IS DISTINCT FROM
    'CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text]))' THEN
    RAISE EXCEPTION 'Batch 3 refused: artifact_type CHECK drifted: %', artifact_check;
  END IF;
END;
$$;

ALTER TABLE public.editorial_artifact_versions
  DROP CONSTRAINT editorial_artifact_versions_artifact_type_check;

ALTER TABLE public.editorial_artifact_versions
  ADD CONSTRAINT editorial_artifact_versions_artifact_type_check
  CHECK (artifact_type IN ('article_dna', 'silo_dna', 'silo_page', 'content_plan', 'brand_dna'));

CREATE TABLE public.editorial_version_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id text NOT NULL REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft', 'proposed', 'approved', 'rejected', 'superseded')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) > 0),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX editorial_version_status_events_version_idx
  ON public.editorial_version_status_events (version_id, occurred_at DESC);
CREATE INDEX editorial_version_status_events_actor_idx
  ON public.editorial_version_status_events (actor_id);

CREATE TABLE public.editorial_decision_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  workflow_item_id uuid REFERENCES public.editorial_workflow_items(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) > 0),
  event_type text NOT NULL CHECK (char_length(btrim(event_type)) BETWEEN 1 AND 120),
  from_state text CHECK (from_state IS NULL OR char_length(btrim(from_state)) BETWEEN 1 AND 80),
  to_state text CHECK (to_state IS NULL OR char_length(btrim(to_state)) BETWEEN 1 AND 80),
  source_version_id text REFERENCES public.editorial_artifact_versions(version_id) ON DELETE RESTRICT,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX editorial_decision_events_article_idx
  ON public.editorial_decision_events (marca_id, article_id, occurred_at DESC);
CREATE INDEX editorial_decision_events_workflow_idx
  ON public.editorial_decision_events (workflow_item_id, occurred_at DESC)
  WHERE workflow_item_id IS NOT NULL;
CREATE INDEX editorial_decision_events_source_version_idx
  ON public.editorial_decision_events (source_version_id)
  WHERE source_version_id IS NOT NULL;
CREATE INDEX editorial_decision_events_actor_idx
  ON public.editorial_decision_events (actor_id);

CREATE TRIGGER editorial_version_status_events_append_only_trg
  BEFORE UPDATE OR DELETE ON public.editorial_version_status_events
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();

CREATE TRIGGER editorial_decision_events_append_only_trg
  BEFORE UPDATE OR DELETE ON public.editorial_decision_events
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();

ALTER TABLE public.editorial_version_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_decision_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY editorial_version_status_events_select_policy
  ON public.editorial_version_status_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.editorial_artifact_versions artifact
    WHERE artifact.version_id = editorial_version_status_events.version_id
      AND public.canonical_actor_can_access_brand(artifact.marca_id, (SELECT auth.uid()))
  ));

CREATE POLICY editorial_decision_events_select_policy
  ON public.editorial_decision_events FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, (SELECT auth.uid())));

REVOKE ALL PRIVILEGES ON TABLE
  public.editorial_version_status_events,
  public.editorial_decision_events
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.editorial_version_status_events TO authenticated;
GRANT SELECT, INSERT ON TABLE public.editorial_version_status_events TO service_role;
GRANT SELECT ON TABLE public.editorial_decision_events TO authenticated;
GRANT SELECT, INSERT ON TABLE public.editorial_decision_events TO service_role;

COMMENT ON TABLE public.editorial_version_status_events IS
  'Append-only status history for immutable editorial and BrandDNA versions.';
COMMENT ON TABLE public.editorial_decision_events IS
  'Append-only human and workflow decision history for the editorial pipeline.';

COMMIT;
