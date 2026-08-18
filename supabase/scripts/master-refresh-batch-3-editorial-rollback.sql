-- Contingency only. Do not execute during preparation or normal closure.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.editorial_version_status_events') IS NULL
     OR to_regclass('public.editorial_decision_events') IS NULL THEN
    RAISE EXCEPTION 'Batch 3 rollback refused: expected event tables are absent';
  END IF;
  IF EXISTS (SELECT 1 FROM public.editorial_version_status_events)
     OR EXISTS (SELECT 1 FROM public.editorial_decision_events)
     OR EXISTS (SELECT 1 FROM public.editorial_artifact_versions WHERE artifact_type='brand_dna') THEN
    RAISE EXCEPTION 'Batch 3 rollback refused: Batch 3 contracts already contain data';
  END IF;
END;
$$;

DROP TABLE public.editorial_decision_events;
DROP TABLE public.editorial_version_status_events;

ALTER TABLE public.editorial_artifact_versions
  DROP CONSTRAINT editorial_artifact_versions_artifact_type_check;
ALTER TABLE public.editorial_artifact_versions
  ADD CONSTRAINT editorial_artifact_versions_artifact_type_check
  CHECK (artifact_type IN ('article_dna', 'silo_dna', 'silo_page', 'content_plan'));

COMMIT;
