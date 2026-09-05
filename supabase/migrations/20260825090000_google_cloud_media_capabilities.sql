BEGIN;

DO $$
DECLARE
  existing_check_name text;
BEGIN
  IF to_regclass('public.integration_capabilities') IS NULL THEN
    RAISE EXCEPTION 'INTEGRATIONS_CAPABILITIES_TABLE_MISSING';
  END IF;

  SELECT conname
    INTO existing_check_name
    FROM pg_constraint
   WHERE conrelid = 'public.integration_capabilities'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%operation_kind%'
   ORDER BY CASE
     WHEN conname = 'ck_integration_capabilities_operation_kind_google_cloud_media' THEN 0
     WHEN conname = 'ck_integration_capabilities_operation_kind_serp_compatibility' THEN 1
     ELSE 2
   END
   LIMIT 1;

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.integration_capabilities DROP CONSTRAINT %I',
      existing_check_name
    );
  END IF;

  ALTER TABLE public.integration_capabilities
    ADD CONSTRAINT ck_integration_capabilities_operation_kind_google_cloud_media
    CHECK (operation_kind IN (
      'ai_generation',
      'keyword_discovery',
      'keyword_metrics',
      'allintitle',
      'transactional_email',
      'serp_compatibility',
      'speech_transcription',
      'storage_media',
      'youtube_video_metadata'
    ));
END
$$;

COMMIT;
