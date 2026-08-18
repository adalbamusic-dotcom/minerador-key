-- Master Refresh Batch 4: remove the obsolete dynamic Google Ads model.
-- Google Ads remains a PLATFORM_ENV technical provider and Usage history is preserved.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  target_count integer;
BEGIN
  IF to_regclass('public.minerador_google_ads_connections') IS NULL
    OR to_regclass('public.google_ads_binding_targeting') IS NULL
    OR to_regclass('public.google_ads_binding_account_state') IS NULL
    OR to_regprocedure('public.google_ads_binding_configuration_validate()') IS NULL THEN
    RAISE EXCEPTION 'BATCH_4_TARGET_OBJECT_DRIFT';
  END IF;

  SELECT (SELECT count(*) FROM public.minerador_google_ads_connections)
       + (SELECT count(*) FROM public.google_ads_binding_targeting)
       + (SELECT count(*) FROM public.google_ads_binding_account_state)
  INTO target_count;
  IF target_count <> 0 THEN
    RAISE EXCEPTION 'BATCH_4_TARGET_TABLES_NOT_EMPTY: %', target_count;
  END IF;

  IF (SELECT count(*) FROM public.integration_grants g JOIN public.integration_capabilities c ON c.id = g.capability_id WHERE c.capability_key LIKE 'google_ads_%') <> 8
    OR (SELECT count(*) FROM public.integration_bindings b JOIN public.integration_capabilities c ON c.id = b.capability_id WHERE c.capability_key LIKE 'google_ads_%') <> 8
    OR (SELECT count(*) FROM public.integration_quota_policies q JOIN public.integration_capabilities c ON c.id = q.capability_id WHERE c.capability_key LIKE 'google_ads_%') <> 2 THEN
    RAISE EXCEPTION 'BATCH_4_SHARED_LEGACY_COUNT_DRIFT';
  END IF;

  IF (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT g.* FROM public.integration_grants g JOIN public.integration_capabilities c ON c.id=g.capability_id WHERE c.capability_key LIKE 'google_ads_%') x) <> 'fed3019c82fbb354ad83b3fd36d7b1b8'
    OR (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT b.* FROM public.integration_bindings b JOIN public.integration_capabilities c ON c.id=b.capability_id WHERE c.capability_key LIKE 'google_ads_%') x) <> 'b7a20ec1d753459674abf8195391fdb6'
    OR (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT q.* FROM public.integration_quota_policies q JOIN public.integration_capabilities c ON c.id=q.capability_id WHERE c.capability_key LIKE 'google_ads_%') x) <> '145e6b9bead2f43561b4f1df5ed9cfc3' THEN
    RAISE EXCEPTION 'BATCH_4_SHARED_LEGACY_FINGERPRINT_DRIFT';
  END IF;

  IF (SELECT count(*) FROM public.integration_usage_events u JOIN public.integration_capabilities c ON c.id = u.capability_id WHERE c.capability_key LIKE 'google_ads_%') <> 11
    OR (SELECT count(*) FROM public.integration_usage_events u JOIN public.integration_capabilities c ON c.id = u.capability_id WHERE c.capability_key LIKE 'google_ads_%' AND u.connection_id IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'BATCH_4_GOOGLE_USAGE_BASELINE_DRIFT';
  END IF;
  IF (SELECT md5(coalesce(string_agg(row_to_json(x)::text,'' ORDER BY x.id::text),'')) FROM (SELECT u.* FROM public.integration_usage_events u JOIN public.integration_capabilities c ON c.id=u.capability_id WHERE c.capability_key LIKE 'google_ads_%') x) <> 'b5a6391e881c7e3f8e4cd645112b3707' THEN
    RAISE EXCEPTION 'BATCH_4_GOOGLE_USAGE_FINGERPRINT_DRIFT';
  END IF;
END;
$$;

DO $$
DECLARE affected integer;
BEGIN
  DELETE FROM public.integration_bindings b
  USING public.integration_capabilities c
  WHERE c.id = b.capability_id AND c.capability_key LIKE 'google_ads_%';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 8 THEN RAISE EXCEPTION 'BATCH_4_BINDING_DELETE_MISMATCH: %', affected; END IF;

  DELETE FROM public.integration_grants g
  USING public.integration_capabilities c
  WHERE c.id = g.capability_id AND c.capability_key LIKE 'google_ads_%';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 8 THEN RAISE EXCEPTION 'BATCH_4_GRANT_DELETE_MISMATCH: %', affected; END IF;

  DELETE FROM public.integration_quota_policies q
  USING public.integration_capabilities c
  WHERE c.id = q.capability_id AND c.capability_key LIKE 'google_ads_%';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'BATCH_4_QUOTA_DELETE_MISMATCH: %', affected; END IF;

  UPDATE public.integration_connections
  SET lifecycle_status = 'revoked', updated_at = now()
  WHERE id = '9360a075-cb90-4771-8dfd-56729263fe3a'::uuid
    AND provider_id = '37908eb9-b6ec-4ba5-9cab-fd39491d19d2'::uuid
    AND lifecycle_status = 'ready';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'BATCH_4_CONNECTION_REVOKE_MISMATCH: %', affected; END IF;
END;
$$;

DROP TABLE public.google_ads_binding_targeting;
DROP TABLE public.google_ads_binding_account_state;
DROP TABLE public.minerador_google_ads_connections;
DROP FUNCTION public.google_ads_binding_configuration_validate();

COMMIT;
